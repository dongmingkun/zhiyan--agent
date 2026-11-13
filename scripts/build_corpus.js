/**
 * build_corpus.js
 * 从前端知识库 (../js/knowledge.js) 生成 RAG 检索语料 knowledge_corpus.json
 * 用法：node scripts/build_corpus.js [--output 路径]
 * 说明：直接加载真实的 JS 知识库，避免手抄；把每个小节切成一条 passage。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname); // scripts/ 的上一级即项目根目录
const JS = path.join(ROOT, 'js', 'knowledge.js');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1 && !process.argv[outputIndex + 1]) {
  throw new Error('--output requires a file path');
}
// 前端导出只是当前知识库的一个子集，默认单独输出，避免覆盖完整语料。
const OUT = outputIndex === -1
  ? path.join(ROOT, 'work', 'knowledge-from-frontend.json')
  : path.resolve(process.argv[outputIndex + 1]);
if (fs.existsSync(OUT)) throw new Error('输出文件已存在，请选择新路径：' + OUT);

// 加载真实知识库对象
let src = fs.readFileSync(JS, 'utf-8');
src = src.replace('const KnowledgeBase =', 'var KnowledgeBase ='); // eval 后可访问
// eslint-disable-next-line no-eval
eval(src);

const kb = KnowledgeBase;

function build() {
  const passages = [];
  for (const ch of kb.chapters) {
    const chapter = ch.title;
    for (const sec of ch.sections) {
      const keywords = sec.keywords || [];
      const formulas = (sec.formulas || []).join('\n');
      const examples = (sec.examples || [])
        .filter((e) => e && e.q)
        .map((e) => `例题：${e.q}\n解答：${e.a}`)
        .join('\n');
      const pitfalls = (sec.pitfalls || []).join('\n');
      const body = [
        sec.summary || '',
        sec.content || '',
        '公式：\n' + formulas,
        '例题：\n' + examples,
        '常见误区：\n' + pitfalls,
      ].join('\n');

      // 关键词重复 3 次，提升 BM25 命中权重（领域词召回）
      const boost = keywords.concat(keywords, keywords).join(' ');
      const text = `${sec.title} ${boost} ${body}`;

      // 干净正文（不含关键词重复），直接喂给大模型作为上下文
      const content = body;

      passages.push({
        id: sec.id,
        chapter: chapter,
        section: sec.title,
        keywords: keywords,
        source: `${chapter} · ${sec.title}`,
        text: text,
        content: content,
      });
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ passages }, null, 2), 'utf-8');
  console.log(`已生成 ${passages.length} 个知识片段 -> ${OUT}`);
}

build();
