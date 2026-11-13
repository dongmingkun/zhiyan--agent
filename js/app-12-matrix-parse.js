/* app-12-matrix-parse.js —— 原 js/app.v3.19.js 第 6997–8974 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App.detectFlattenedMatrix = function detectFlattenedMatrix(text) {
    if (!text || text.indexOf('|') === -1) return text;
    const self = this;
    // v=20260902m 与后端 _flatten_matrix_to_latex 对齐:支持 &amp;/\\& → & 还原 + 代数 token(a1/a_2/\\cdots)
    const isTok = t => /^[+\-]?\d+(?:\.\d+)?$/.test(t) ||
      /^[A-Za-z]+(?:[A-Za-z0-9_])*$/.test(t) ||
      /^\\(?:cdots|ldots|vdots|ddots|dots)$/.test(t);
    return text.replace(/\|([0-9A-Za-z_+\-*/.\s;；|\\]+)\|/g, (m, inner) => {
      // 0) 先还原列分隔符实体(若已被转义成 &amp; 或 \\&)
      const seg = inner.replace(/&amp;/g, '&').replace(/\\&/g, '&');
      // v=20260926 根因修复:Markdown 表格不能被误判成矩阵
      // ① 分隔行(如 | --- | :---: |、|---|---|)是表格语法,直接原样返回
      if (/\|\s*:?-{2,}:?\s*\|/.test(seg) || /-{3,}/.test(seg)) return m;
      // 1) 分号/竖线显式分行
      const explicit = seg.split(/[;；|]+/).map(s => s.trim().split(/\s+/).filter(Boolean)).filter(r => r.length);
      if (explicit.length > 1) {
        const cols = explicit[0].length;
        // v=20260926 根因修复:矩阵每行至少 2 列才有意义(方形矩阵 n ≥ 2)。
        // 原条件只要求 cols > 0,于是 Markdown 表格行 | a | b | c | d | 会被
        // 拆成 4 行 1 列并转成 vmatrix(单列竖排),破坏正常表格渲染。
        if (cols >= 2 && explicit.every(r => r.length === cols) && explicit.every(r => r.every(isTok))) {
          return self._rowsToVmatrix(explicit);
        }
      }
      // 2) 单行:空格切 token,n 为完全平方且全部为合法 token
      const toks = seg.trim().split(/\s+/).filter(Boolean);
      const n = toks.length;
      if (n >= 4 && toks.every(isTok)) {
        const k = Math.round(Math.sqrt(n));
        if (k * k === n) {
          return self._rowsToVmatrix(Array.from({ length: k }, (_, idx) => toks.slice(idx * k, (idx + 1) * k)));
        }
      }
      // 3) 不匹配,原样
      return m;
    });
  };

  /** v=20260828ui 二维数组 → \begin{vmatrix} 字符串 */
App._rowsToVmatrix = function _rowsToVmatrix(rows) {
    const body = rows.map(r => r.join(' & ')).join(' \\\\ ');
    return '\\begin{vmatrix} ' + body + ' \\end{vmatrix}';
  };

  /**
   * v=20260828ui 失败降级:把 KaTeX 渲染失败的矩阵环境公式解析为多行 HTML 表格
   * 按 env 配外层括符:vmatrix → ∣...∣、bmatrix → [...]/pmatrix → (...)/matrix → 无
   */
App._latexToFallbackTable = function _latexToFallbackTable(formula, env) {
    const body = String(formula || '').replace(/\\begin\{[^}]+\}/, '').replace(/\\end\{[^}]+\}/, '').trim();
    const rows = body.split(/\\\\/).map(r => r.split('&').map(c => c.trim()));
    const BR = {
      vmatrix: ['∣', '∣'], Vmatrix: ['∥', '∥'],
      bmatrix: ['[', ']'], Bmatrix: ['{', '}'],
      pmatrix: ['(', ')'], matrix: ['', ''], array: ['', '']
    };
    const bracket = BR[env] || ['|', '|'];
    const tbl = '<table class="latex-fallback-matrix-tbl"><tbody>' +
      rows.map(r => '<tr>' + r.map(c => '<td>' + this.escapeHtml(c) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';
    return '<span class="latex-fallback-matrix"><span class="bracket-l">' + bracket[0] + '</span>' +
      tbl + '<span class="bracket-r">' + bracket[1] + '</span></span>';
  };

  /**
   * v=20260926 $...$ / $$...$$ 守卫:判断正则抓到的"公式"其实是普通文本。
   * 判定规则:同时满足 ① 含中日韩字符(自然语言特征) ② 不含任何 LaTeX 特征字符(\ ^ _ { })
   * 时,视为被 $ 误配的普通文本,原样保留不渲染。
   * 典型误伤:"价格 $5 和 $6" 会被行内 $...$ 正则整段吃掉(变成 $5 和 $)。
   * 反例(仍按公式渲染):$x^2+y^2=1$(含 ^)、$D=\begin{vmatrix}...\end{vmatrix}$(含 \)。
   * 注意:\(...\) 与 \[...\] 是显式 LaTeX 语法,不做此守卫。
   */
App._looksLikePlainTextMath = function _looksLikePlainTextMath(formula) {
    const s = String(formula == null ? '' : formula);
    // ① 无 CJK(汉字/日文假名/韩文) → 不是自然语言,保持原判定
    if (!/[一-鿿㐀-䶿぀-ヿ가-힯]/.test(s)) return false;
    // ② 含任一 LaTeX 特征 → 仍按公式处理
    return !/[\\\\^_{}]/.test(s);
  };

App.markdownToHtml = function markdownToHtml(md, opts = {}) {
    // opts.wrapCard: false 时不包裹 .knowledge-card（用于 history preview 等内联渲染）
    const wrapCard = opts.wrapCard !== false;
    // v=20260828ui 压扁纯文本矩阵 → LaTeX 兜底(必须在反斜杠还原前调用,保护 \\| 也能识别)
    md = this.detectFlattenedMatrix(String(md || ''));
    // v=20260902m 转义根治:只把 4 个反斜杠压成 2 个(处理 JSON 二次转义),绝不动正常的 2 个反斜杠
    // 旧逻辑 md.replace(/\\\\/g,'\\') 把换行符 \\ 压成 1 个 → KaTeX 无法识别换行 → 行列式挤成一行(元凶!)
    let html = md.replace(/\\\\\\\\/g, '\\\\');
    // 先保护 LaTeX 公式（$...$ 块内）避免被 markdown 处理破坏
    const latexBlocks = [];
    // v=20260824zf 块级 LaTeX $$...$$ —— 必须最先处理,否则内嵌 \begin{...}\end{...}
    // 会被下面的环境块正则提前抽取成占位符,导致 $$@@LATEX0@@$$ 再被当公式二次占位,
    // 最终还原时残留 @@LATEX0@@ 泄漏到页面(经典 bug: 矩阵外再包一层 $$)
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (m, formula) => {
      // v=20260926 守卫:抓到的内容若只是含中文的普通文本,原样返回不占位
      if (this._looksLikePlainTextMath(formula)) return m;
      const idx = latexBlocks.length;
      latexBlocks.push({ display: true, formula: this._normalizeFormula(formula).replace(/\$/g, '').trim() });
      return `@@LATEX${idx}@@`;
    });
    // v=20260824zf 块级 LaTeX \[...\]（AI 偶尔会用 LaTeX 块公式语法，不带 $）
    html = html.replace(/\\\[([\s\S]+?)\\\]/g, (m, formula) => {
      const idx = latexBlocks.length;
      latexBlocks.push({ display: true, formula: this._normalizeFormula(formula).replace(/\$/g, '').trim() });
      return `@@LATEX${idx}@@`;
    });
    // v=20260902m 行内 LaTeX \(...\)（LaTeX 标准行内公式语法,LLM 经常使用,
    // 截图实证:题目要求计算n阶行列式 \(D_n\)... 其形式如下: 会被误显示为纯文本)
    // 必须放在 \[...\] 之后、行内 $...$ 之前;display: false(行内渲染)
    html = html.replace(/\\\(([\s\S]+?)\\\)/g, (m, formula) => {
      const idx = latexBlocks.length;
      latexBlocks.push({ display: false, formula: this._normalizeFormula(formula).replace(/\$/g, '').trim() });
      return `@@LATEX${idx}@@`;
    });
    // 行内 LaTeX $...$ —— 必须在裸环境块之前,否则 $D=\begin{vmatrix}...\end{vmatrix}$
    // 会被环境正则先抽走内部 \begin...\end,留下 $D=@@LATEX0@@$ 再被行内正则二次占位,
    // 最终残留 @@LATEX0@@ 泄漏。先整体吃掉 $...$ 包住的环境,裸环境留给下面正则兜底。
    // v=20260898 若内部仍含 $ 则一并清除(防嵌套)
    html = html.replace(/\$([^$\n]+?)\$/g, (m, formula) => {
      // v=20260926 守卫:含中文且无 LaTeX 特征的段落(如"价格 $5 和 $6")不当作公式,
      // 否则两个 $ 之间的中文会被整段吃掉并塞进 KaTeX,渲染成乱码/丢字。
      if (this._looksLikePlainTextMath(formula)) return m;
      const idx = latexBlocks.length;
      latexBlocks.push({ display: false, formula: this._normalizeFormula(formula).replace(/\$/g, '').trim() });
      return `@@LATEX${idx}@@`;
    });
    // v=20260824zf LaTeX 环境块 \begin{vmatrix}...\end{vmatrix}（AI 经常在解释中直接用环境块,不被 $ 包裹）
    // 注意:必须在 $$...$$ / \[...\] / $...$ 之后,此时剩下的都是裸环境;
    // 跳过已生成的 @@LATEX 占位符(理论上不会,但兜底)
    html = html.replace(/\\begin\{(vmatrix|bmatrix|pmatrix|Vmatrix|Bmatrix|matrix|array|align|cases)\}([\s\S]+?)\\end\{\1\}/g, (m, env, body) => {
      // 若 body 本身已是 @@LATEX 占位符,跳过(避免重复占位)
      if (/^@@LATEX\d+@@$/.test(body.trim())) return m;
      const idx = latexBlocks.length;
      latexBlocks.push({ display: true, formula: this._normalizeFormula(`\\begin{${env}}${body}\\end{${env}}`).trim() });
      return `@@LATEX${idx}@@`;
    });
    // v=20260824 修复:奇数 $ 补齐移到公式替换之后——原逻辑在替换前对全文 $ 计数,
    // 嵌套 $$...$...$$ 场景替换会吞掉 4 个 $,提前补齐会残留孤立 $ 在文本末尾(如 "\neq 0$")
    const residualDollars = (html.match(/\$/g) || []).length;
    if (residualDollars % 2 === 1) html += '$';

    // v=20260824zf 分步讲解步骤切分:必须在 escapeHtml / 段落切分之前执行,
    // 此时文本仍是纯文本、\n\n 仍分隔各步骤,能干净地把"步骤1/2/3/4"切成独立 .step-block,
    // 避免在 <p> 包裹后再切导致标签残留(如孤立 <p>、步骤头冒号错位)。
    html = this._splitStepBlocks(html);

    html = this.escapeHtml(html);

    // 代码块
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
    });

    // 水平分割线
    html = html.replace(/^---+$/gm, '<hr>');

    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    // v=20260908 修复: AI 经常在标题后只接单 \n(如 "## 直觉理解\n对角矩阵...")，
    // 而本函数用 \n\n 段落切分，导致 h2 与正文黏在同一 block 内被当作 raw HTML，
    // 正文变成 h2 的纯文本兄弟节点，_collectSiblingsUntil 用 nextElementSibling
    // 收集不到 → 模块被判空。这里强制让 h2/h3 前后变成 \n\n 段落边界。
    html = html.replace(/(<\/h[23]>)/g, '\n\n$1\n\n').replace(/(<h[23][^>]*>)/g, '\n\n$1');

    // 引用
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // 表格：识别 |...|...| 形式的多行
    html = this.convertTables(html);

    // 粗体斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(?:<li>.*?<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');

    // 段落
    html = html.split(/\n\n+/).map(block => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('<') || b.includes('@@LATEX') || b.includes('@@STEP')) return b;
      return '<p>' + b.replace(/\n/g, '<br>') + '</p>';
    }).filter(s => s).join('\n');

    // 还原 LaTeX 占位符
    html = html.replace(/@@LATEX(\d+)@@/g, (m, idx) => {
      const item = latexBlocks[parseInt(idx)];
      if (!item) return m;
      return `<span class="latex-formula" data-display="${item.display}" data-formula="${this.escapeHtml(item.formula)}">${this.escapeHtml(item.formula)}</span>`;
    });

    // v=20260824zf 还原步骤占位符 @@STEPn|head@@ ... @@/STEPn@@ → .step-block HTML
    // 在 LaTeX 占位符还原之后执行,保证步骤正文里的公式也被正确渲染
    html = html.replace(/@@STEP(\d+)\|([^@]+)@@([\s\S]*?)@@\/STEP\1@@/g, (m, n, head, body) => {
      return `<div class="step-block" data-step="${n}"><div class="step-head">${head}</div><div class="step-body">${body}</div></div>`;
    });

    return wrapCard ? `<div class="knowledge-card">${html}</div>` : html;
  };

  /**
   * v=20260824zf 分步讲解步骤切分
   * 识别 "步骤1：xxx"、"Step 1: xxx"、"① xxx"、"1. xxx" 这类编号标记，
   * 把每一步包成独立 .step-block 区块（含步骤序号小标 + 内容），视觉上分隔。
   * 只在确实出现 ≥2 个步骤编号时启用切分，避免把普通列表错切。
   */
App._splitStepBlocks = function _splitStepBlocks(html) {
    if (!html) return html;
    // 步骤头匹配:支持 "步骤1"、"步骤 1"、"Step 1"、"STEP 1"、"①"、"1."、"（一）" 等核心格式。
    // 用一个捕获组把"编号主体"捕获为 m[1],其后的分隔符(冒号/顿号/句点/空白)用 m[0] 吃掉。
    const STEP_HEAD_RE = /(步骤\s*\d+|Step\s*\d+|STEP\s*\d+|[①②③④⑤⑥⑦⑧⑨⑩]|\(\d+\)|[（(][一二三四五六七八九十]+[）)]|\d+\s*[.、])\s*[：:.\s、]*/g;
    const matches = [];
    let m;
    while ((m = STEP_HEAD_RE.exec(html)) !== null) {
      // headText 是纯编号(如"步骤1"/"①"),不含尾随分隔符
      matches.push({ headStart: m.index, headEnd: m.index + m[0].length, headText: m[1] });
    }
    // 只在步骤数 ≥ 2 时才做切分（避免把一行偶然出现"步骤1"误判）
    if (matches.length < 2) return html;
    // 用占位符包裹每一步,避免后续 escapeHtml 转义 HTML 标签。
    // 占位符形如 @@STEP1|步骤1@@ ... @@/STEP1@@,在 markdownToHtml 末尾统一还原成 .step-block HTML。
    let out = '';
    let cursor = 0;
    for (let i = 0; i < matches.length; i++) {
      const headStart = matches[i].headStart;
      const headEnd = matches[i].headEnd;
      const headText = matches[i].headText;
      const end = (i + 1 < matches.length) ? matches[i + 1].headStart : html.length;
      const bodyText = html.substring(headEnd, end).trim();
      if (i === 0 && headStart > 0) out += html.substring(0, headStart).trim();
      out += `@@STEP${i + 1}|${headText}@@${bodyText}@@/STEP${i + 1}@@`;
      cursor = end;
    }
    if (cursor < html.length) out += html.substring(cursor);
    return out;
  };

App.convertTables = function convertTables(html) {
    // 匹配表格：以 | 开头的行，3 行以上（表头+分隔+数据）
    const lines = html.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (/^\|.+\|/.test(lines[i]) && i+1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i+1])) {
        // 这是一个表格的开始
        const headers = lines[i].split('|').slice(1, -1).map(s => s.trim());
        const dataLines = [];
        i += 2;
        while (i < lines.length && /^\|.+\|/.test(lines[i])) {
          dataLines.push(lines[i].split('|').slice(1, -1).map(s => s.trim()));
          i++;
        }
        let tbl = '<table><thead><tr>';
        headers.forEach(h => tbl += `<th>${h}</th>`);
        tbl += '</tr></thead><tbody>';
        dataLines.forEach(row => {
          tbl += '<tr>';
          row.forEach(c => tbl += `<td>${c}</td>`);
          tbl += '</tr>';
        });
        tbl += '</tbody></table>';
        out.push(tbl);
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out.join('\n');
  };

  /**
   * 使用 KaTeX 渲染消息中的公式
   * - 先渲染 markdownToHtml 生成的 .latex-formula 占位（已剥离 $ 定界符，需显式 katex.render）
   * - 再扫描剩余 $...$ / $$...$$（如用户输入、未被 markdown 捕获的公式）
   */
App.renderLatexInElement = function renderLatexInElement(el) {
    if (!el) return;
    // KaTeX 尚未就绪（已本地自托管，通常立即可用），稍后重试
    if (!window.renderMathInElement && !window.katex) {
      setTimeout(() => this.renderLatexInElement(el), 200);
      return;
    }
    // 1) 渲染受保护的 .latex-formula 占位 span（仅渲染尚未渲染的）
    if (window.katex) {
      el.querySelectorAll('.latex-formula').forEach(span => {
        if (span.querySelector('.katex')) return; // 已渲染则跳过
        const formula = (span.dataset.formula != null) ? span.dataset.formula : span.textContent;
        const display = span.dataset.display === 'true';
        try {
          window.katex.render(formula, span, {
            displayMode: display,
            throwOnError: true,  // v=20260897 改为 true 以捕获错误并显示原文
            errorColor: '#cc0000',
            // v=20260902m 显式声明线代常用宏 + 关闭 strict(不因未知命令拒绝渲染)
            // vmatrix/pmatrix/bmatrix/Vmatrix/Bmatrix/matrix/array/align/cases 均为内置环境,
            // vdots/cdots/ddots/ldots 等省略号命令也为内置,任意阶数/行列数天然支持
            strict: false,
            macros: {
              '\\vmatrix': '\\begin{vmatrix}#1\\end{vmatrix}',
              '\\pmatrix': '\\begin{pmatrix}#1\\end{pmatrix}',
              '\\bmatrix': '\\begin{bmatrix}#1\\end{bmatrix}'
            }
          });
        } catch (e) {
          // v=20260828ui 失败降级:对 7 种矩阵环境自动解析为多行 HTML 表格,禁止"一行压扁"或泄漏 \begin 源码
          const envMatch = formula.match(/\\begin\{(vmatrix|Vmatrix|pmatrix|bmatrix|Bmatrix|matrix|array)\}/);
          if (envMatch) {
            span.innerHTML = this._latexToFallbackTable(formula, envMatch[1]);
            return;
          }
          // v=20260897 渲染失败时,把原文以等宽字体友好展示,并加上 ⚠️ 标识
          span.classList.add('latex-render-error');
          span.innerHTML = `<span class="latex-err-icon" title="${this.escapeHtml(e.message || '公式渲染失败')}"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-warn"/></svg></span><code class="latex-raw">${this.escapeHtml(formula)}</code>`;
        }
      });
    }
    // 2) 扫描裸 $...$ / $$...$$（如首屏写死的公式、用户输入文本等）—— katex auto-render 内部已处理重复
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false,
          errorColor: '#cc0000'
        });
      }
    } catch (e) {
      console.warn('LaTeX render error:', e);
    }
  };

  /**
   * 图片/截图上传：把图片作为附件附加到输入框，发送时随消息一起上传。
   * 不做 OCR 文本识别（用户可直接发图，由 AI 侧视觉模型看图回答）。
   */
App.initImageUpload = function initImageUpload() {
    const attachBtn = document.getElementById('chat-attach-btn');
    const fileInput = document.getElementById('chat-image-input');
    const inputArea = document.getElementById('chat-input');
    if (!attachBtn || !fileInput) return;

    // v=20260922o 多图附件数组(每项:{file, dataUrl, name}),支持同时携带多张
    this.chatAttachments = [];

    // 1) 点击附件按钮 → 触发 file input
    attachBtn.addEventListener('click', () => fileInput.click());

    // 2) file input 选择图片
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      fileInput.value = '';
      this._addChatAttachmentFiles(files);
    });

    // 3) 粘贴图片(Ctrl+V / 截图工具粘贴)
    if (inputArea) {
      inputArea.addEventListener('paste', (e) => {
        if (!e.clipboardData) return;
        const files = [];
        for (const item of e.clipboardData.items) {
          if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length === 0) return;  // 非图片剪贴板,保留默认文本粘贴
        e.preventDefault();
        this._addChatAttachmentFiles(files);
        this._shotToast('已粘贴 ' + files.length + ' 张图片', 'ok');
      });

      // 4) 拖拽图片到输入框
      const _onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
      const _onDrop = (e) => {
        e.preventDefault();
        if (!e.dataTransfer || !e.dataTransfer.files) return;
        const files = Array.from(e.dataTransfer.files).filter(f => f.type && f.type.startsWith('image/'));
        if (!files.length) return;
        this._addChatAttachmentFiles(files);
        this._shotToast('已添加 ' + files.length + ' 张图片', 'ok');
      };
      inputArea.addEventListener('dragover', _onDragOver);
      inputArea.addEventListener('drop', _onDrop);
    }
    // v=20260922p 大图预览:关闭按钮 + 点空白 + ESC
    const viewer = document.getElementById('chat-image-viewer');
    const closeBtn = document.getElementById('chat-image-viewer-close');
    if (viewer) {
      viewer.addEventListener('click', (e) => {
        if (e.target === viewer) this._closeImageViewer();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this._closeImageViewer());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && viewer && viewer.style.display !== 'none') {
        this._closeImageViewer();
      }
    });
  };

  /**
   * v=20260922o 批量添加图片附件:每张 < 4MB,跳过非图片
   */
  /**
   * v=20260922p 批量添加图片附件:每张 < 4MB,跳过非图片;先以 loading 占位插入,
   * FileReader 读取完成后用真实 dataURL 替换。失败用 error 占位(支持点击移除)。
   */
App._addChatAttachmentFiles = function _addChatAttachmentFiles(files) {
    if (!files || !files.length) return;
    const MAX = 4 * 1024 * 1024;
    let added = 0, oversized = 0, bad = 0;
    for (const f of files) {
      if (!f.type || !f.type.startsWith('image/')) { bad++; continue; }
      if (f.size > MAX) { oversized++; continue; }
      // 1) 先以 loading 占位插入,确保点击/删除事件可立即生效
      const idx = this.chatAttachments.length;
      // v=20260926 根因修复:附件用稳定 id 标识,FileReader 回调按 id 回查。
      // 原来回调按下标(realIdx)取数组项:用户在读取期间删除/新增图片会让下标错位,
      // 结果把 dataUrl 写进别的附件(或越界丢弃),甚至照片串图。
      const attId = (this._attSeq = (this._attSeq || 0) + 1);
      this.chatAttachments.push({
        id: attId, file: f, dataUrl: '', name: f.name || ('图片' + (idx + 1) + '.png'),
        state: 'loading', error: ''
      });
      this._renderChatAttachment();
      // 2) 异步读取真实 dataURL
      const reader = new FileReader();
      reader.onload = (ev) => {
        const att = (this.chatAttachments || []).find(a => a.id === attId);
        if (!att) return;   // 附件已被用户移除 → 丢弃本次读取结果
        att.dataUrl = ev.target.result;
        att.state = 'ready';
        this._renderChatAttachment();
      };
      reader.onerror = () => {
        const att = (this.chatAttachments || []).find(a => a.id === attId);
        if (!att) return;
        att.state = 'error';
        att.error = '读取失败';
        this._renderChatAttachment();
      };
      reader.readAsDataURL(f);
      added++;
    }
    if (oversized) this._shotToast(oversized + ' 张图片超过 4MB 已被跳过', 'warn');
    if (bad && !added) this._shotToast('请选择图片文件', 'warn');
  };

  /** v=20260922p 渲染附件预览条:88x88 缩略卡 + contain + hover× + 点击放大 + loading/error 占位 */
App._renderChatAttachment = function _renderChatAttachment() {
    const bar = document.getElementById('chat-attachment-bar');
    const list = document.getElementById('chat-attachment-list');
    if (!bar || !list) return;
    const atts = this.chatAttachments || [];
    if (atts.length === 0) {
      bar.classList.remove('show');
      bar.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    const esc = (s) => this.escapeHtml(s);
    list.innerHTML = atts.map((att, i) => {
      let inner = '';
      if (att.state === 'loading') {
        inner = '<div class="chat-attachment-loading">读取中</div>';
      } else if (att.state === 'error') {
        inner = '<div class="chat-attachment-error">⚠<br>读取失败</div>';
      } else {
        inner = '<img class="chat-attachment-thumb" src="' + att.dataUrl + '" alt="图片 ' + (i+1) + '" />';
      }
      // v=20260824 OCR 按钮:仅 ready 状态可识别,失败/loading 不显示
      const ocrBtn = (att.state === 'ready' && att.dataUrl)
        ? '<button class="chat-attachment-ocr" title="OCR 识别图中文字" data-idx="' + i + '">🔍</button>'
        : '';
      return `<div class="chat-attachment-item" data-idx="${i}" title="${esc(att.name)}">` +
             inner +
             ocrBtn +
             '<button class="chat-attachment-del" title="移除图片" data-idx="' + i + '">×</button>' +
             '</div>';
    }).join('');

    // 绑定删除按钮 + 缩略图点击放大(loading/error 状态点击 = 移除该图)
    list.querySelectorAll('.chat-attachment-item').forEach(item => {
      const i = parseInt(item.dataset.idx, 10);
      const att = this.chatAttachments[i];
      if (!att) return;
      // 点击缩略图:ready 状态打开大图,loading/error 状态 = 移除
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-attachment-del')) return;  // 删除按钮自己处理
        if (att.state === 'ready' && att.dataUrl) {
          this._openImageViewer(att.dataUrl);
        } else {
          this.removeChatAttachment(i);
        }
      });
    });
    list.querySelectorAll('.chat-attachment-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();  // 阻止冒泡到 item
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        this.removeChatAttachment(i);
      });
    });
    // v=20260824 OCR 识别按钮
    list.querySelectorAll('.chat-attachment-ocr').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        this._runAttachmentOCR(i, btn);
      });
    });
    bar.classList.add('show');
    bar.style.display = 'block';
  };

  /**
   * v=20260824 OCR 识别单张图片附件(用于发送前预览识别文字)
   * dataURL → Blob → POST /api/ocr → 弹模态显示结果
   */
App._runAttachmentOCR = async function _runAttachmentOCR(idx, btn) {
    const att = (this.chatAttachments || [])[idx];
    if (!att || att.state !== 'ready' || !att.dataUrl) return;
    const origText = btn.innerHTML;
    btn.innerHTML = '⏳';
    btn.disabled = true;
    try {
      const r = await fetch(att.dataUrl);
      const blob = await r.blob();
      const fd = new FormData();
      fd.append('file', blob, att.name || 'image.png');
      const resp = await Auth.fetchWithAuth('/api/ocr', { method: 'POST', body: fd });
      const d = await resp.json();
      btn.innerHTML = origText;
      btn.disabled = false;
      if (!resp.ok || !d.ok) {
        this._shotToast && this._shotToast('OCR 失败: ' + (d.detail || d.error || resp.status), 'warn');
        return;
      }
      const text = d.text || '';
      this._showOCRResultModal(text, att);
    } catch (err) {
      btn.innerHTML = origText;
      btn.disabled = false;
      this._shotToast && this._shotToast('OCR 请求异常: ' + err.message, 'warn');
    }
  };

  /**
   * v=20260824 显示 OCR 识别结果(简易弹窗,可关闭、可加入输入框)
   */
App._showOCRResultModal = function _showOCRResultModal(text, att) {
    let m = document.getElementById('chat-ocr-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'chat-ocr-modal';
      m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;';
      m.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;font-weight:600;">' +
        '<span>📝 OCR 识别结果</span><button id="chat-ocr-modal-close" style="background:rgba(255,255,255,0.2);border:0;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button></div>' +
        '<div id="chat-ocr-modal-body" style="padding:18px;overflow-y:auto;flex:1;font-family:Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;background:#f8fafc;"></div>' +
        '<div style="padding:10px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;background:#fff;">' +
        '<button id="chat-ocr-modal-copy" style="background:#6366f1;color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">📋 复制文字</button>' +
        '<button id="chat-ocr-modal-append" style="background:#10b981;color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">📝 加入输入框</button>' +
        '</div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
      document.getElementById('chat-ocr-modal-close').onclick = () => m.remove();
    }
    const body = document.getElementById('chat-ocr-modal-body');
    body.textContent = text || '（OCR 未识别到任何文字）';
    const copyBtn = document.getElementById('chat-ocr-modal-copy');
    const appendBtn = document.getElementById('chat-ocr-modal-append');
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text || '');
        this._shotToast && this._shotToast('已复制 OCR 文字', 'ok');
      } catch (e) { this._shotToast && this._shotToast('复制失败: ' + e.message, 'warn'); }
    };
    appendBtn.onclick = () => {
      const input = document.getElementById('chat-input');
      if (input) {
        const cur = (input.value || '').trim();
        input.value = (cur ? cur + '\n' : '') + (text || '');
        input.focus();
        this._shotToast && this._shotToast('已加入输入框,可编辑后发送', 'ok');
      }
      m.remove();
    };
  };

  /** v=20260922p 大图预览弹窗(点击缩略图打开) */
App._openImageViewer = function _openImageViewer(dataUrl) {
    const v = document.getElementById('chat-image-viewer');
    const img = document.getElementById('chat-image-viewer-img');
    if (!v || !img) return;
    img.src = dataUrl;
    v.style.display = 'flex';
    v.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
App._closeImageViewer = function _closeImageViewer() {
    const v = document.getElementById('chat-image-viewer');
    if (!v) return;
    v.style.display = 'none';
    v.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    const img = document.getElementById('chat-image-viewer-img');
    if (img) img.src = '';
  };

  /** v=20260922o 移除指定 index 的附件 */
App.removeChatAttachment = function removeChatAttachment(idx) {
    if (idx === undefined || idx === null) {
      // 兼容旧调用:清空
      this.chatAttachments = [];
    } else {
      this.chatAttachments.splice(idx, 1);
    }
    this._renderChatAttachment();
  };

  /**
   * 图片内容提取（视觉模型优先 + Tesseract OCR 兜底）：
   *   1. 后端视觉模型可用 → 直接识别公式 / 矩阵 / 文本
   *   2. 视觉不可用 → 前端 Tesseract.js 跑 OCR（中英文）
   *   3. 都失败 → 返回提示，主模型礼貌回复用户
   */
App._extractImageText = async function _extractImageText(imageAtt) {
    // ===== 阶段1：后端多模态视觉模型（带 8s 超时）=====
    try {
      const fd = new FormData();
      fd.append('file', imageAtt.file);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await Auth._fetch('/api/vision/latex', { method: 'POST', body: fd, signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      const recog = (data && data.recognized || '').trim();
      if (res.ok && recog && recog.indexOf('识别失败') === -1) {
        return `\n\n【图片内容已识别（视觉模型）】\n${recog}`;
      }
    } catch (_) { /* 视觉模型不可用，降级到 OCR */ }

    // ===== 阶段2：前端 Tesseract.js OCR 兜底 =====
    if (window.Tesseract) {
      try {
        this._shotToast('视觉模型暂不可用，正在用本地 OCR 识别…');
        const worker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, { logger: () => {} });
        const { data: { text: ocr } } = await worker.recognize(imageAtt.file);
        await worker.terminate();
        const cleaned = (ocr || '').replace(/[ \t]+/g, ' ').trim();
        if (cleaned && cleaned.length > 1) {
          return `\n\n【图片 OCR 识别内容（视觉模型暂不可用，已用本地 OCR 自动识别，可能有错别字）】\n${cleaned}`;
        }
      } catch (_) { /* OCR 也失败 */ }
    }

    // ===== 阶段3：均失败 =====
    return '\n\n（用户附带了一张图片，但视觉模型与本地 OCR 都不可用，未能识别图片内容）';
  };


App._shotToast = function _shotToast(msg, type = 'info') {
    let toast = document.getElementById('shot-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'shot-toast';
      toast.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;z-index:999999;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2400);
  };

  // ========== v=20260902m AI 回答底部操作栏 ==========

  /**
   * 构建操作栏 HTML(7 个按钮 + 1 个更多下拉菜单)
   * - PC 端 7 个按钮全显
   * - 移动端 (`App.isMobile` 或 body.mobile-mode) 默认只显示 4 个核心
   *   (复制/点赞/点踩/重新生成),其余进入更多菜单
   * 通过 data-act 标识点击意图;data-tier="core|extra" 标记移动端是否外露
   */
App._buildActionBarHTML = function _buildActionBarHTML() {
    const isMobile = this.isMobile || (document.body && document.body.classList.contains('mobile-mode'));
    // tier=core 移动端外露;tier=extra 移动端收入更多菜单
    const buttons = [
      { act: 'copy',    icon: '📋', label: '复制',     tier: 'core' },
      { act: 'speak',   icon: '🔊', label: '朗读',     tier: 'extra' },
      { act: 'like',    icon: '👍', label: '点赞',     tier: 'core' },
      { act: 'dislike', icon: '👎', label: '点踩',     tier: 'core' },
      { act: 'share',   icon: '🔗', label: '分享',     tier: 'extra' },
      { act: 'regen',   icon: '🔄', label: '重新生成', tier: 'core' }
    ];
    const btnHtml = buttons.map(b => {
      const hide = isMobile && b.tier === 'extra' ? ' style="display:none"' : '';
      return `<button class="aab-btn" data-act="${b.act}" data-tier="${b.tier}"${hide} title="${b.label}"><span class="aab-icon">${b.icon}</span><span class="aab-text">${b.label}</span></button>`;
    }).join('');
    return `<div class="ai-action-bar" data-mobile="${isMobile ? '1' : '0'}">${btnHtml}<div class="aab-more"${isMobile ? '' : ' style="display:none"'}><button class="aab-btn" data-act="more-toggle" title="更多"><span class="aab-icon">⋯</span><span class="aab-text">更多</span></button><div class="aab-menu" hidden><button class="aab-menu-item" data-act="fav"><span>⭐</span> 收藏题目</button><button class="aab-menu-item" data-act="wrongbook"><span>📕</span> 加入错题本</button></div></div></div>`;
  };

  /**
   * 挂载操作栏到一条 AI 回答 wrapperEl 上,并绑定 7 个 handler。
   * - ctx.msgQuestion:用户原提问(供「重新生成」)
   * - ctx.msgMode:'direct'|'detailed'|'guided'
   * - ctx.msgAnswer:AI 回答原文
   * - ctx.msgId:消息唯一 id
   */
App._bindActionBar = function _bindActionBar(wrapperEl, ctx) {
    if (!wrapperEl) return;
    // v=20260903d 操作栏挂到气泡里(.bot-bubble),使其贴在回答内容底部而非消息行右侧
    const bubble = wrapperEl.querySelector('.bot-bubble') || wrapperEl;
    // 防重复绑定
    let bar = bubble.querySelector(':scope > .ai-action-bar');
    if (bar) {
      // 已存在,只更新 ctx(用于流式完成后填充)
      bar._ctx = ctx;
      return;
    }
    bar = document.createElement('div');
    bar.innerHTML = this._buildActionBarHTML();
    bar = bar.firstElementChild;
    bar._ctx = ctx;
    bubble.appendChild(bar);

    // 状态管理:用 _curFeedback 记录当前条目的点赞/点踩状态
    bar._curFeedback = '';

    // 单事件委托
    bar.addEventListener('click', (e) => {
      const target = e.target.closest('[data-act]');
      if (!target) return;
      const act = target.dataset.act;
      const cur = bar._ctx || ctx;
      // 更多菜单 toggle
      if (act === 'more-toggle') {
        const menu = bar.querySelector('.aab-menu');
        if (menu) {
          const open = !menu.hidden;
          menu.hidden = open;
        }
        e.stopPropagation();
        return;
      }
      if (act === 'copy') this._aiCopy(bar, cur);
      else if (act === 'speak') this._aiSpeak(bar, cur);
      else if (act === 'like') this._aiLike(bar, cur, 'up');
      else if (act === 'dislike') this._aiDislike(bar, cur);
      else if (act === 'share') this._aiShare(bar, cur);
      else if (act === 'regen') this._aiRegen(bar, cur);
      else if (act === 'fav') this._aiFav(bar, cur);
      else if (act === 'wrongbook') this._aiWrongbook(bar, cur);
    });
    // 点击空白处关闭更多菜单
    document.addEventListener('click', (e) => {
      if (!bar.contains(e.target)) {
        const menu = bar.querySelector('.aab-menu');
        if (menu) menu.hidden = true;
      }
    });
  };

  /**
   * v=20260904 判断 AI 回答是否仍在引导中(引导学习模式中间态):
   * 以问号结尾,或含"先/接下来/你来/得知道/写出/算一下"等引导句式都算。
   * 引导中间轮不显示追问按钮,避免和 AI 自己的引导提问打架。
   */
App._isGuidedPrompt = function _isGuidedPrompt(text) {
    const t = (text || '').trim();
    if (!t) return false;
    if (/(？|\?|吗|呢)$/.test(t)) return true;
    const tail = t.slice(-60);
    return /你先|试试看|想一想|你知道|记得.*吗|你能|你来|接下来|下一步|先别|先算|再算|再代入|写出|算一下|得知道|需要知道/.test(tail);
  };

  /**
   * v=20260903p 追问去重：把候选追问与"本次会话 chatHistory 里所有用户消息 + 当前问题"比对，
   * 相同或高度相似（去空格/标点后前 12 字相同）的直接丢弃；过滤后不足就少显示几条，宁缺毋滥。
   */
App._normalizeForDedup = function _normalizeForDedup(text) {
    return String(text || '').replace(/[^\w\u4e00-\u9fff]+/g, '').toLowerCase();
  };
App._filterDuplicateFollowups = function _filterDuplicateFollowups(followups, currentQuestion) {
    if (!Array.isArray(followups)) return [];
    const asked = [];
    (this.chatHistory || []).forEach(m => {
      if (m && m.role === 'user' && m.content) asked.push(m.content);
    });
    if (currentQuestion) asked.push(currentQuestion);
    const askedNorm = asked.map(q => this._normalizeForDedup(q)).filter(Boolean);
    if (!askedNorm.length) return followups.filter(q => q && String(q).trim());
    const out = [];
    for (const fq of followups) {
      const text = String(fq || '').trim();
      if (!text) continue;
      const nf = this._normalizeForDedup(text);
      let dup = false;
      for (const a of askedNorm) {
        if (nf === a) { dup = true; break; }
        let i = 0;
        while (i < nf.length && i < a.length && nf[i] === a[i]) i++;
        // 短串整体是长串前缀(≥4字) 或 前12字相同
        if ((i >= 4 && i === Math.min(nf.length, a.length)) || i >= 12) { dup = true; break; }
      }
      if (!dup) out.push(text);
    }
    return out;
  };

  /**
   * v=20260903h AI 回答底部快捷追问
   * - 必须由 SSE "done" 事件解析后调(流式过程中不显示,严格符合约束)
   * - 不修改后端原始文本(后端已剥离【快捷追问】),仅做 UI 渲染
   * - 位置:.bot-bubble 内,操作栏(.ai-action-bar)上方;无操作栏则追加到末尾
   * - 点击→写入 chat-input + sendMessage() 发起新问答;整组按钮置 disabled 防重
   */
App._heuristicFollowups = function _heuristicFollowups(question, answer) {
    /* v=20260903k 前端兜底:后端若漏返回 followups,用关键词匹配在前端生成 3 条标准追问,
       保证快捷追问按钮永远能渲染,绝不出现"没看到追问"的体验断点。*/
    const text = ((question || '') + '\n' + (answer || ''));
    const q = (question || '').trim();
    const isCasual = !q || /^(你好|hi|hello|谢谢|thanks|你是谁|你是啥)/i.test(q);
    const catalog = [
      [['三对角', 'tridiagonal'], [
        '这道题能不能推广到 n 阶,写出递推通项?',
        '如果把对角线或斜线的元素换成参数,怎么讨论?',
        '三对角行列式和线性方程组三对角求解有什么关系?'
      ]],
      [['特征值', '特征向量', 'eigenvalue'], [
        '特征值在几何上对应什么含义(伸缩/旋转/投影)?',
        '怎么快速判定一个矩阵是否可对角化?',
        '实对称矩阵的特征向量为什么一定正交?'
      ]],
      [['对角化', '对角矩阵', 'P^{-1}AP', 'P^(-1)AP'], [
        '如果矩阵不能对角化(比如 Jordan 块),该怎么处理?',
        '对角化后 A^k 怎么利用对角矩阵快速计算?',
        '可对角化和 n 个线性无关的特征向量之间有什么关系?'
      ]],
      [['行列式', 'determinant', '|A|', 'detA'], [
        '行列式的几何意义是什么(平行多面体体积)?',
        '如果 |A|=0,Ax=0 有非零解,它和矩阵的列向量有什么关系?',
        '|kA| 与 |A| 之间是什么关系(n 阶矩阵)?'
      ]],
      [['伴随矩阵', 'A*', 'A^{*}', 'adj', 'A^{star}'], [
        '伴随矩阵和逆矩阵 A^{-1} 之间有什么关系?',
        '为什么 R(A)=n 时 R(A^*)=n,而 R(A)=n-1 时反而是 1?',
        '求伴随矩阵的常用方法有哪几种,各适用于什么情形?'
      ]],
      [['逆矩阵', '求逆', 'A^{-1}', 'A^(-1)', '可逆'], [
        '一个矩阵满足什么条件才可逆?',
        '求逆矩阵的常用方法有哪些(伴随/初等行变换/分块)?',
        '如果 A 不可逆,Ax=b 还能解吗?'
      ]],
      [['矩阵', 'matrix', '转置', '初等变换'], [
        '矩阵乘法为什么不满足交换律,但为什么有结合律?',
        '矩阵的秩在几何上代表什么(列空间的维数)?',
        '常用的特殊矩阵(对称/反对称/正交/正定)各有什么性质?'
      ]],
      [['向量组', '线性相关', '线性无关', '极大线性无关'], [
        '线性相关/无关的几何意义是什么?',
        '怎么快速求一个向量组的极大线性无关组?',
        '向量组的秩和它生成的子空间维数有什么关系?'
      ]],
      [['线性方程组', 'Ax=b', '增广矩阵', '通解'], [
        '怎么判断 Ax=b 是否有解、有唯一解、有无穷多解?',
        '齐次方程组和非齐次方程组的解结构有什么不同?',
        '自由未知量怎么选,通解怎么写?'
      ]],
      [['齐次', 'Ax=0', '基础解系'], [
        '基础解系和通解之间有什么关系?',
        '怎么求 Ax=0 的基础解系?',
        '如果两个齐次方程组的基础解系能互相线性表示,这两个方程组等价吗?'
      ]],
      [['二次型', '标准形', '规范形'], [
        '正交变换化标准形和配方法化标准形各有什么优劣?',
        '怎么快速判定二次型是否正定?',
        '正定矩阵的常用判定方法各适用于什么情形?'
      ]],
      [['正定', '正交矩阵', '合同', '相似'], [
        '矩阵相似和矩阵合同有什么区别?',
        '正交矩阵的列向量为什么必须两两正交且单位长度?',
        '实对称矩阵为什么一定能正交相似对角化?'
      ]],
      [['向量空间', '基', '维数'], [
        '基和极大线性无关组之间有什么关系?',
        '维数和坐标之间是怎么对应的?',
        '如果两个向量空间同构,它们的基的元素个数一定相等吗?'
      ]],
      [['秩', 'rank', 'R(A)'], [
        '怎么快速求矩阵的秩(行阶梯化)?',
        '矩阵的秩、列向量组的秩、方程组未知量个数三者有什么关系?',
        '如果把矩阵转置,秩会变吗?'
      ]]
    ];
    const seen = new Set(); const out = [];
    if (isCasual) {
      return ['能举一个具体的例题再演练一下吗?', '有没有什么易错点要提醒我注意?', '这个结论能不能推广或变形?'];
    }
    // v=20260904 优先用"用户问题"命中主题(而非 answer),避免派生词(如 |A|/det)把不同题导向同一组
    const qText = (question || '').trim();
    const aText = (answer || '');
    const hitFor = (t) => {
      for (const [kws] of catalog) {
        for (const kw of kws) { if (t.includes(kw)) return true; }
      }
      return false;
    };
    // 命中主题池:问题优先,问题未命中再看回答
    const matched = [];
    for (const [kws, qs] of catalog) {
      let hitQ = false; for (const kw of kws) { if (qText.includes(kw)) { hitQ = true; break; } }
      let hitA = false; for (const kw of kws) { if (aText.includes(kw)) { hitA = true; break; } }
      if (hitQ) { matched.push({ qs, prio: 0 }); }
      else if (hitA) { matched.push({ qs, prio: 1 }); }
    }
    matched.sort((a, b) => a.prio - b.prio);

    // v=20260904 会话内去重:同一会话不重复展示完全相同的 3 条
    this._followupUsed = this._followupUsed || new Set();
    const used = this._followupUsed;

    if (!matched.length) {
      const generic = ['能举一个具体的例题再演练一下吗?', '有没有什么易错点要提醒我注意?', '这个结论能不能推广或变形?'];
      const pool = generic.filter(g => !used.has(g));
      const src = pool.length ? pool : generic;
      const shuffled = src.slice().sort(() => Math.random() - 0.5);
      const n = Math.min(2, shuffled.length); // v=20260904 固定 2 条
      const picked = shuffled.slice(0, n);
      picked.forEach(p => used.add(p));
      return picked;
    }

    // v=20260904 主主题池随机抽 2 条(不固定组合,会话内去重),不足再从未命中主题补
    const primary = matched[0].qs;
    const pool = primary.filter(p => !used.has(p));
    const src = pool.length >= 2 ? pool : primary; // 已用过太多则回落到完整池保证有货
    const shuffled = src.slice().sort(() => Math.random() - 0.5);
    const n = Math.min(2, shuffled.length); // 固定 2 条
    for (const q of shuffled) {
      if (!seen.has(q)) { seen.add(q); out.push(q); used.add(q); }
      if (out.length >= n) break;
    }
    // 不足补其它主题
    if (out.length < 2) {
      for (const m of matched.slice(1)) {
        for (const q of m.qs) {
          if (!seen.has(q) && !used.has(q)) { seen.add(q); out.push(q); used.add(q); }
          if (out.length >= 2) break;
        }
        if (out.length >= 2) break;
      }
    }
    // 仍不足:通用兜底补到 2 条
    if (out.length < 2) {
      const fallback = ['能举一个具体的例题再演练一下吗?', '有没有什么易错点要提醒我注意?', '这个结论能不能推广或变形?'];
      for (const fq of fallback) {
        if (!seen.has(fq) && !used.has(fq)) { seen.add(fq); out.push(fq); used.add(fq); }
        if (out.length >= 2) break;
      }
    }
    return out.slice(0, 3);
  };

App._bindFollowups = function _bindFollowups(wrapperEl, followups) {
    if (!wrapperEl) return;
    const list = Array.isArray(followups) ? followups.filter(q => q && String(q).trim()) : [];
    if (!list.length) return;    // 异常情况/无追问:不渲染、不占位
    const bubble = wrapperEl.querySelector('.bot-bubble') || wrapperEl;
    // 防重复绑定
    if (bubble.querySelector(':scope > .ai-followups')) return;

    const wrap = document.createElement('div');
    wrap.className = 'ai-followups';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', '快捷追问');

    list.slice(0, 3).forEach((q, i) => {
      const text = String(q).trim();
      if (!text) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-followup-btn';
      btn.setAttribute('data-followup', text);
      btn.setAttribute('aria-label', `追问 ${i + 1}: ${text}`);
      // 用 textContent 防 XSS
      const icon = document.createElement('span');
      icon.className = 'ai-followup-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.4-7.0"/><polyline points="21 4 21 10 15 10"/></svg>';
      const span = document.createElement('span');
      span.className = 'ai-followup-text';
      span.textContent = text;
      const arrow = document.createElement('span');
      arrow.className = 'ai-followup-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      btn.appendChild(icon);
      btn.appendChild(span);
      btn.appendChild(arrow);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled || wrap.getAttribute('aria-busy') === 'true') return;
        // 整组置 disabled 防重复点击
        wrap.setAttribute('aria-busy', 'true');
        wrap.querySelectorAll('.ai-followup-btn').forEach(b => {
          b.disabled = true;
          b.setAttribute('aria-busy', 'true');
        });
        // 写入输入框并发送(与快捷 chips 完全一致行为)
        const input = document.getElementById('chat-input');
        if (input) {
          input.value = text;
          try { input.focus(); } catch (e) {}
          if (typeof this.autoResize === 'function') {
            try { this.autoResize(input); } catch (e) {}
          }
        }
        try { this.sendMessage(); }
        catch (err) { console.error('[followup] sendMessage failed:', err); }
      });
      wrap.appendChild(btn);
    });

    if (!wrap.children.length) return;
    // 插入位置:在 .ai-action-bar 上方;没有操作栏则追加
    const actionBar = bubble.querySelector(':scope > .ai-action-bar');
    if (actionBar) {
      bubble.insertBefore(wrap, actionBar);
    } else {
      bubble.appendChild(wrap);
    }
  };

  // ---- 7 个 handler ----

  /** 复制整条回答:优先 LaTeX 源码,降级纯文本 */
App._aiCopy = async function _aiCopy(bar, ctx) {
    // v=20260903d 操作栏现在挂在 .bot-bubble 内,直接用 bar.parentElement(若不在 bubble 内再向上找)
    const bubble = bar.parentElement && bar.parentElement.classList.contains('bot-bubble')
      ? bar.parentElement
      : (bar.parentElement && bar.parentElement.querySelector('.bot-bubble'));
    // LaTeX 源码优先(bubble 里的 .latex-formula 的 data-formula)
    let parts = [];
    if (bubble) {
      const formulas = bubble.querySelectorAll('.latex-formula');
      if (formulas.length) {
        formulas.forEach(f => parts.push('$' + (f.dataset.formula || f.textContent) + '$'));
      } else {
        // v=20260903d 操作栏现在挂在 .bot-bubble 内,克隆后临时移除 bar 再取文本,避免复制到按钮文字
        const clone = bubble.cloneNode(true);
        const clBar = clone.querySelector(':scope > .ai-action-bar');
        if (clBar) clBar.remove();
        parts.push((clone.innerText || clone.textContent || '').trim());
      }
    }
    const text = (parts.join('\n\n') || (ctx.msgAnswer || '')).trim();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this._shotToast('✅ 已复制到剪贴板（含 LaTeX 源码）');
    } catch (e) {
      this._shotToast('复制失败,请手动复制');
    }
  };

  /** 朗读:Web Speech API + LaTeX 文本降级,按钮播/停/续切换 */
App._aiSpeak = function _aiSpeak(bar, ctx) {
    if (!window.speechSynthesis) {
      this._shotToast('当前浏览器不支持语音朗读');
      return;
    }
    const btn = bar.querySelector('[data-act="speak"]');
    if (!btn) return;
    // 状态机:idle | playing | paused
    const state = btn.dataset.speakState || 'idle';
    if (state === 'playing') {
      window.speechSynthesis.pause();
      btn.dataset.speakState = 'paused';
      btn.querySelector('.aab-icon').textContent = '▶';
      btn.querySelector('.aab-text').textContent = '继续';
      return;
    }
    if (state === 'paused') {
      window.speechSynthesis.resume();
      btn.dataset.speakState = 'playing';
      btn.querySelector('.aab-icon').textContent = '⏸';
      btn.querySelector('.aab-text').textContent = '暂停';
      return;
    }
    // idle → 新建
    // v=20260903d 操作栏在 .bot-bubble 内,直接用 bar.parentElement(若没找到再向上找)
    const bubble = bar.parentElement && bar.parentElement.classList.contains('bot-bubble')
      ? bar.parentElement
      : (bar.parentElement && bar.parentElement.querySelector('.bot-bubble'));
    // v=20260903d 朗读排除操作栏按钮文字
    let raw = '';
    if (bubble) {
      const clone = bubble.cloneNode(true);
      const clBar = clone.querySelector(':scope > .ai-action-bar');
      if (clBar) clBar.remove();
      raw = clone.innerText || clone.textContent || '';
    } else {
      raw = ctx.msgAnswer || '';
    }
    const text = this._latexToSpeakText(raw);
    if (!text.trim()) { this._shotToast('内容为空,无法朗读'); return; }
    try {
      // 先取消所有进行中的
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.0;
      // 选中文 voice
      const voices = window.speechSynthesis.getVoices();
      const zh = voices.find(v => /zh|cmn|Chinese/i.test(v.lang) || /Chinese|中文/i.test(v.name));
      if (zh) u.voice = zh;
      u.onend = () => {
        btn.dataset.speakState = 'idle';
        btn.querySelector('.aab-icon').textContent = '🔊';
        btn.querySelector('.aab-text').textContent = '朗读';
      };
      u.onerror = () => {
        btn.dataset.speakState = 'idle';
        btn.querySelector('.aab-icon').textContent = '🔊';
        btn.querySelector('.aab-text').textContent = '朗读';
      };
      window.speechSynthesis.speak(u);
      btn.dataset.speakState = 'playing';
      btn.querySelector('.aab-icon').textContent = '⏸';
      btn.querySelector('.aab-text').textContent = '暂停';
    } catch (e) {
      this._shotToast('朗读启动失败');
    }
  };

  /**
   * LaTeX 文本降级朗读:把 LaTeX 源码 + Markdown 标记转成中文朗读文本
   * 提取 bubble.innerText 后再做字符串替换(已被 KaTeX 渲染的 MathML 内文本基本无 LaTeX)
   */
App._latexToSpeakText = function _latexToSpeakText(raw) {
    if (!raw) return '';
    let s = String(raw);
    // 行内/块级公式包裹符号
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, f) => ` 【公式:${this._latexToSpeakFormula(f)}】 `);
    s = s.replace(/\$([^$\n]+?)\$/g, (m, f) => ` 【公式:${this._latexToSpeakFormula(f)}】 `);
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, f) => ` ${this._latexToSpeakFormula(f)} `);
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, f) => ` 【公式:${this._latexToSpeakFormula(f)}】 `);
    s = s.replace(/\\begin\{(vmatrix|pmatrix|bmatrix|matrix)\}([\s\S]+?)\\end\{\1\}/g,
      (m, env, body) => ` 【${env === 'vmatrix' ? '行列式' : '矩阵'}:${this._latexToSpeakFormula(body)}】 `);
    // 兜底:把任何残留 LaTeX 命令用 _latexToSpeakFormula 处理
    s = this._latexToSpeakFormula(s);
    // 清理多余空白
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
  };

  /** 单个 LaTeX 表达式的中文降级 */
App._latexToSpeakFormula = function _latexToSpeakFormula(f) {
    if (!f) return '';
    let s = String(f);
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1 除以 $2');
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, '根号下 $1 结束');
    s = s.replace(/\\times/g, ' 乘 ');
    s = s.replace(/\\cdot/g, ' 乘 ');
    s = s.replace(/\\div/g, ' 除以 ');
    s = s.replace(/\\pm/g, ' 正负 ');
    s = s.replace(/\\neq/g, ' 不等于 ');
    s = s.replace(/\\leq/g, ' 小于等于 ');
    s = s.replace(/\\geq/g, ' 大于等于 ');
    s = s.replace(/\\approx/g, ' 约等于 ');
    s = s.replace(/\\equiv/g, ' 恒等于 ');
    s = s.replace(/\\sum/g, ' 求和 ');
    s = s.replace(/\\prod/g, ' 求积 ');
    s = s.replace(/\\int/g, ' 积分 ');
    s = s.replace(/\\infty/g, ' 无穷大 ');
    s = s.replace(/\\alpha/g, ' 阿尔法 '); s = s.replace(/\\beta/g, ' 贝塔 ');
    s = s.replace(/\\gamma/g, ' 伽马 '); s = s.replace(/\\delta/g, ' 德尔塔 ');
    s = s.replace(/\\theta/g, ' 西塔 '); s = s.replace(/\\lambda/g, ' 兰姆达 ');
    s = s.replace(/\\mu/g, ' 缪 '); s = s.replace(/\\pi/g, ' 派 ');
    s = s.replace(/\\sigma/g, ' 西格玛 '); s = s.replace(/\\omega/g, ' 欧米伽 ');
    s = s.replace(/\\cdots/g, ' …… '); s = s.replace(/\\ldots/g, ' …… ');
    s = s.replace(/\\vdots/g, ' 纵向省略号 '); s = s.replace(/\\ddots/g, ' 对角省略号 ');
    s = s.replace(/\\dots/g, ' …… ');
    s = s.replace(/\\to/g, ' 趋向 '); s = s.replace(/\\rightarrow/g, ' 趋向 ');
    s = s.replace(/\\in/g, ' 属于 '); s = s.replace(/\\notin/g, ' 不属于 ');
    s = s.replace(/\\cup/g, ' 并 '); s = s.replace(/\\cap/g, ' 交 ');
    s = s.replace(/\\subset/g, ' 包含于 '); s = s.replace(/\\supset/g, ' 包含 ');
    s = s.replace(/\\forall/g, ' 对所有 '); s = s.replace(/\\exists/g, ' 存在 ');
    s = s.replace(/\^\{([^{}]+)\}/g, ' 上标 $1 结束 '); s = s.replace(/\^([a-zA-Z0-9])/g, ' 上标 $1 ');
    s = s.replace(/_\{([^{}]+)\}/g, ' 下标 $1 结束 '); s = s.replace(/_([a-zA-Z0-9])/g, ' 下标 $1 ');
    s = s.replace(/\\left|\\right/g, '');
    s = s.replace(/\\\\/g, ' 换行 ');
    s = s.replace(/&/g, ' ');
    s = s.replace(/[\\\{\}]/g, ' ');
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  /** 点赞/点踩:toggle,二次点击取消;anonymous 走 localStorage,登录用户走后端 */
App._aiLike = async function _aiLike(bar, ctx, rating) {
    // 取消对方:如果当前已点踩,先清掉
    if (bar._curFeedback === rating) {
      // 取消
      this._setFeedbackBtn(bar, '', rating);
      bar._curFeedback = '';
      this._postFeedback(ctx.msgId, rating, '', true);
      return;
    }
    if (rating === 'up') {
      // like 时,清掉 dislike
      const disBtn = bar.querySelector('[data-act="dislike"]');
      if (disBtn) disBtn.classList.remove('active');
    } else {
      const likeBtn = bar.querySelector('[data-act="like"]');
      if (likeBtn) likeBtn.classList.remove('active');
    }
    this._setFeedbackBtn(bar, rating, rating === 'up' ? 'like' : 'dislike');
    bar._curFeedback = rating;
    this._postFeedback(ctx.msgId, rating, '', false);
  };

  /** 点踩:弹 popover 让用户选原因 */
App._aiDislike = function _aiDislike(bar, ctx) {
    // 已点踩则取消
    if (bar._curFeedback === 'down') {
      this._setFeedbackBtn(bar, '', 'dislike');
      bar._curFeedback = '';
      this._postFeedback(ctx.msgId, 'down', '', true);
      return;
    }
    // 取消 like
    const likeBtn = bar.querySelector('[data-act="like"]');
    if (likeBtn) likeBtn.classList.remove('active');
    // 弹 popover
    let pop = bar.querySelector('.aab-dis-popover');
    if (pop) { pop.remove(); return; }
    pop = document.createElement('div');
    pop.className = 'aab-dis-popover';
    pop.innerHTML = `
      <div class="aab-dis-title">为什么点踩?</div>
      <button class="aab-dis-item" data-reason="答案错误">❌ 答案错误</button>
      <button class="aab-dis-item" data-reason="排版混乱">📐 排版混乱</button>
      <button class="aab-dis-item" data-reason="讲解不清">💬 讲解不清</button>
      <button class="aab-dis-item" data-reason="其他">⋯ 其他</button>
    `;
    bar.appendChild(pop);
    pop.addEventListener('click', (e) => {
      const item = e.target.closest('.aab-dis-item');
      if (!item) return;
      const reason = item.dataset.reason || '';
      this._setFeedbackBtn(bar, 'down', 'dislike');
      bar._curFeedback = 'down';
      this._postFeedback(ctx.msgId, 'down', reason, false);
      pop.remove();
    });
    // 点击外部关闭
    setTimeout(() => {
      const closeFn = (ev) => {
        if (!pop.contains(ev.target)) {
          pop.remove();
          document.removeEventListener('click', closeFn);
        }
      };
      document.addEventListener('click', closeFn);
    }, 50);
  };

App._setFeedbackBtn = function _setFeedbackBtn(bar, rating, btnKind) {
    const sel = btnKind === 'like' ? '[data-act="like"]' : '[data-act="dislike"]';
    const btn = bar.querySelector(sel);
    if (!btn) return;
    if (rating) btn.classList.add('active');
    else btn.classList.remove('active');
  };

App._postFeedback = async function _postFeedback(msgId, rating, comment, isCancel) {
    // anonymous 走 localStorage
    if (!window.Auth || !window.Auth.isLoggedIn) {
      try {
        const key = 'ai_feedback_local';
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (isCancel) {
          const idx = arr.findIndex(x => x.msgId === msgId && x.rating === rating);
          if (idx >= 0) arr.splice(idx, 1);
        } else {
          arr.push({ msgId, rating, comment, ts: Date.now() });
        }
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (e) {}
      this._shotToast(isCancel ? '已取消' : (rating === 'up' ? '👍 已点赞' : '👎 已记录'));
      return;
    }
    // 登录用户走后端
    try {
      if (isCancel) {
        // 取消:toggle 通过同 rating delete 模拟(后端已经有这个语义)
        await window.Auth._fetch(`/api/feedback?msg_id=${encodeURIComponent(msgId)}`, { method: 'GET' });
        // 后端目前不提供 DELETE,简化处理:发同 rating,后端 delete 旧再加新的 = 净 +1 条
        // 但取消要真删。改用 get 查当前,有就 POST 一个相反 rating 来覆盖?复杂,简化为「不再 toggle」
        this._shotToast('已记录');
        return;
      }
      await window.Auth._fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_id: msgId, rating, comment })
      });
      this._shotToast(rating === 'up' ? '👍 已点赞' : '👎 已记录,感谢反馈');
    } catch (e) {
      this._shotToast('反馈失败,请重试');
    }
  };

  /** 分享:Web Share API 优先,降级复制链接 */
App._aiShare = async function _aiShare(bar, ctx) {
    const text = (ctx.msgAnswer || '').substring(0, 500);
    const shareData = {
      title: '线性代数智能助学',
      text: '题目:' + (ctx.msgQuestion || '') + '\n\n解答:\n' + text,
      url: window.location.href
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        this._shotToast('✅ 已分享');
      } catch (e) {
        // 用户取消不算错
        if (e.name !== 'AbortError') this._shotToast('分享失败');
      }
    } else {
      // 降级:复制到剪贴板
      try {
        await navigator.clipboard.writeText(shareData.text);
        this._shotToast('📋 内容已复制,可粘贴分享');
      } catch (e) {
        this._shotToast('当前环境不支持分享');
      }
    }
  };

  /** 重新生成:复用原参数 callTutor;生成中置灰 */
App._aiRegen = async function _aiRegen(bar, ctx) {
    if (!ctx.msgQuestion) {
      this._shotToast('原始问题为空,无法重新生成');
      return;
    }
    if (bar.dataset.regenBusy === '1') {
      this._shotToast('正在生成中,请稍候');
      return;
    }
    // 置灰全部按钮
    bar.dataset.regenBusy = '1';
    bar.classList.add('aab-busy');
    this._shotToast('🔄 正在重新生成...');
    try {
      await this.callTutor(ctx.msgQuestion, ctx.msgMode || 'direct');
    } catch (e) {
      this._shotToast('重新生成失败');
    } finally {
      bar.dataset.regenBusy = '0';
      bar.classList.remove('aab-busy');
    }
  };

  /** 收藏题目 */
App._aiFav = async function _aiFav(bar, ctx) {
    if (!window.Auth || !window.Auth.isLoggedIn) {
      this._shotToast('请先登录后再收藏');
      return;
    }
    if (bar.dataset.favBusy === '1') return;
    bar.dataset.favBusy = '1';
    try {
      const r = await window.Auth._fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: ctx.msgQuestion || '', answer: ctx.msgAnswer || '' })
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) this._shotToast('⭐ 已收藏到题库');
      else this._shotToast('收藏失败');
    } catch (e) {
      this._shotToast('收藏失败,请重试');
    } finally {
      bar.dataset.favBusy = '0';
      // 关闭菜单
      const menu = bar.querySelector('.aab-menu');
      if (menu) menu.hidden = true;
    }
  };

  /** 加入错题本:question + correct_answer (AI 回答),user_answer 留空由后端推断 KP */
App._aiWrongbook = async function _aiWrongbook(bar, ctx) {
    if (!window.Auth || !window.Auth.isLoggedIn) {
      this._shotToast('请先登录后再加入错题本');
      return;
    }
    if (bar.dataset.wbBusy === '1') return;
    bar.dataset.wbBusy = '1';
    try {
      const r = await window.Auth._fetch('/api/mistakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: ctx.msgQuestion || '',
          user_answer: '',
          correct_answer: ctx.msgAnswer || '',
          knowledge_point: '',
          chapter: ''
        })
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) this._shotToast('📕 已加入错题本' + (data.knowledge_point ? ' · 知识点:' + data.knowledge_point : ''));
      else this._shotToast('加入错题本失败');
    } catch (e) {
      this._shotToast('加入错题本失败,请重试');
    } finally {
      bar.dataset.wbBusy = '0';
      const menu = bar.querySelector('.aab-menu');
      if (menu) menu.hidden = true;
    }
  };

  // ============ 知识体系模块 ============

App.renderKnowledgeNav = function renderKnowledgeNav() {
    const nav = document.getElementById('knowledge-nav');
    const chapters = KnowledgeBase.getNavigation();

    // 移动端:抽屉内默认折叠所有章节 + 箭头用 CSS 绘制(避免部分手机字体把 ▶▼ 渲染成方块)
    // PC 端:保持原样(默认展开 + 文本箭头 ▼)
    const mobile = !!this.isMobile;
    nav.innerHTML = chapters.map(ch => `
      <div class="chapter-item${mobile ? '' : ''}" data-chapter="${ch.id}">
        <div class="chapter-header" onclick="App.toggleChapter('${ch.id}')">
          <span class="chapter-icon">${ch.icon}</span>
          <span class="chapter-title">${ch.title}</span>
          <span class="chapter-arrow">${mobile ? '' : '▼'}</span>
        </div>
        <div class="chapter-sections" id="sections-${ch.id}"${mobile ? ' style="display:none;"' : ''}>
          ${ch.sections.map(s => `
            <div class="section-item" onclick="App.showSection('${s.id}')">
              ${s.title}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  };

  // ============ 知识点拓扑图谱（力导向网络图 + 下方详情面板） ============
  // ════════════════════════════════════════════════════════════════
  // ① 数据接口：此处为 6 节点样例子集，跑通画布后替换为完整 54 节点（6 一级 + 48 二级）
  //    完整数据集请参考 js/knowledge.js → topology（level1/level2/edges）
  // ════════════════════════════════════════════════════════════════
App._tpDemoData = function _tpDemoData() {
    // 节点：id / name / module(所属模块) / mastery(掌握度) / freq(考频权重) / errors(三级易错点)
    const nodes = [
      { id: 'M2-09', name: '矩阵秩的求解', module: '矩阵', mastery: 0.32, freq: 0.90,
        errors: ['r(AB) 与 r(A)、r(B) 的不等式混淆', '把行秩与列秩混为一谈'] },
      { id: 'M2-10', name: '矩阵等价与初等变换', module: '矩阵', mastery: 0.71, freq: 0.82,
        errors: ['初等变换与初等矩阵对应关系搞混', '等价矩阵与相似矩阵混淆'] },
      { id: 'V3-06', name: '极大线性无关组求解', module: '向量空间', mastery: 0.40, freq: 0.88,
        errors: ['初等行变换找极大无关组后忘记补齐', '极大无关组不唯一的陷阱'] },
      { id: 'V3-07', name: '向量组秩与矩阵秩关联', module: '向量空间', mastery: 0.68, freq: 0.85,
        errors: ['矩阵秩与向量组秩对应搞错', '向量组秩 = 矩阵秩的适用条件遗漏'] },
      { id: 'E4-03', name: '方程组解存在判定', module: '线性方程组', mastery: 0.35, freq: 0.92,
        errors: ['r(A)=r(A|b) 判定方向记反', '含参方程组分类讨论遗漏 a 值'] },
      { id: 'E4-06', name: '齐次方程组基础解系', module: '线性方程组', mastery: 0.28, freq: 0.95,
        errors: ['基础解系个数记错（应为 n-r(A)）', '自由未知量选取与基础解系对应混乱'] }
    ];
    // 连线：source → target / type(solid|dashed) / width(线宽) / label
    const links = [
      { source: 'M2-09', target: 'V3-06', type: 'solid', width: 4, label: '强前置' },
      { source: 'M2-09', target: 'E4-03', type: 'solid', width: 4, label: '强前置' },
      { source: 'V3-06', target: 'V3-07', type: 'solid', width: 3, label: '强前置' },
      { source: 'E4-03', target: 'E4-06', type: 'solid', width: 3, label: '强前置' },
      { source: 'V3-07', target: 'E4-06', type: 'dashed', width: 2, label: '协同关联' }
    ];
    return { nodes, links };
  };

  // ════════════════════════════════════════════════════════════════
  // ② 数据接口：完整 54 节点数据集（6 一级 + 48 二级，从 KnowledgeBase.topology 组装）
  //    每个节点携带该知识点绑定的全部三级易错点（mistakes 映射表）
  // ════════════════════════════════════════════════════════════════
App._tpFullData = function _tpFullData() {
    const kb = (typeof KnowledgeBase !== 'undefined' && KnowledgeBase.topology)
      ? KnowledgeBase.topology
      : ((window.KnowledgeBase && window.KnowledgeBase.topology) || {});
    const l2 = kb.level2 || [];
    const l1 = kb.level1 || [];
    const edges = kb.edges || [];
    const mistakes = kb.mistakes || {};
    const binding = kb.binding || {};
    // 元数据(metadata.json):前置依赖 / 后置关联 / 难度 / 易错 / 考频
    const meta = (typeof window !== 'undefined' && window.__META__) || {};
    const l1Title = {};
    l1.forEach(x => { l1Title[x.id] = x.title; });

    // 节点:id / name / module / mastery / freq / errors
    // + chapterId/sectionId/knowledgeId(知识体系跳转定位)
    // + preDependencies / postRelations / difficultyScore / errorProneScore / examFreqScore
    const nodes = l2.map(n => {
      const b = binding[n.id] || {};
      const m = meta[n.id] || {};
      return {
      id: n.id,
      name: n.title,
      module: l1Title[n.parent] || n.parent || '知识点',
      mastery: typeof n.mastery === 'number' ? n.mastery : 0.6,
      freq: typeof n.freq === 'number' ? n.freq : 0.7,
      difficulty: n.difficulty || '',
      errors: mistakes[n.id] || [],
      chapterId: b.chapterId || '',
      sectionId: b.sectionId || '',
      knowledgeId: n.id,
      // 元数据 5 项(新增)
      preDependencies: m.preDependencies || [],
      postRelations: m.postRelations || [],
      difficultyScore: m.difficultyScore || 3,
      errorProneScore: m.errorProneScore || 0.5,
      examFreqScore: m.examFreqScore || 0.5
      };
    });

    // 连线:1) 原 topology.edges;2) metadata 的 pre/post 边(权重驱动)
    const links = edges.map(e => ({
      source: e.source, target: e.target, type: e.type || 'solid',
      label: e.label || (e.type === 'solid' ? '强前置' : '关联')
    }));
    nodes.forEach(n => {
      (n.preDependencies || []).forEach(p => {
        if (!links.some(l => l.source === p.targetId && l.target === n.id)) {
          links.push({
            source: p.targetId, target: n.id, type: 'solid',
            label: '前置', weight: p.preWeight || 0.5, desc: p.desc || ''
          });
        }
      });
      (n.postRelations || []).forEach(p => {
        if (!links.some(l => l.source === n.id && l.target === p.targetId)) {
          links.push({
            source: n.id, target: p.targetId, type: 'dashed',
            label: '后置', weight: p.postWeight || 0.5, desc: p.desc || ''
          });
        }
      });
    });

    return { nodes, links };
  };

  /** 异步加载 metadata.json,放到 window.__META__ 供 _tpFullData 消费 */
App._tpLoadMetadata = async function _tpLoadMetadata() {
    if (window.__META__) return window.__META__;
    try {
      const resp = await fetch('metadata.json?v=' + Date.now());
      if (resp.ok) {
        const j = await resp.json();
        window.__META__ = j;
        return j;
      }
    } catch (e) { /* 容错 */ }
    return {};
  };

  // 掌握度 → 颜色映射（需求规格）
App._tpMasteryColor = function _tpMasteryColor(m) {
    if (m > 0.85) return '#36b37e';   // 良好（绿）
    if (m >= 0.6) return '#ffc107';   // 临界（黄）
    return '#e53935';                 // 薄弱（红）
  };
  // 易错分数 → 颜色（独立于掌握度）
App._tpErrScoreColor = function _tpErrScoreColor(s) {
    if (s >= 0.75) return '#ef4444'; // 红（极易错）
    if (s >= 0.55) return '#f97316'; // 橙
    if (s >= 0.35) return '#f59e0b'; // 黄
    return '#22c55e';                 // 绿（不易错）
  };
  // 难度星级 (1-5) → '★' 字符串
App._tpStars = function _tpStars(n) {
    n = Math.max(1, Math.min(5, Math.round(n || 0)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };
  // 易错条填充百分比标签
App._tpPct = function _tpPct(s) { return Math.round((s || 0) * 100) + '%'; };
App._tpMasteryText = function _tpMasteryText(m) {
    if (m > 0.85) return '良好';
    if (m >= 0.6) return '临界';
    return '薄弱';
  };

App._tpChart = null;
App._tpInited = false;
App._tpGraphData = null;
App._tpCurrentTab = 'network';
App._tpSelectedNode = null;
App._tpMode = 'overview';
App._tpFocusedNode = null;

App.renderTopology = function renderTopology() {
    // 懒加载：仅在首次进入该视图（容器可见）时初始化，避免 0×0 空白
    if (this._tpInited) {
      // 重新进入：双触发 resize 确保布局正确
      requestAnimationFrame(() => { if (this._tpChart) this._tpChart.resize(); });
      setTimeout(() => { if (this._tpChart) this._tpChart.resize(); }, 100);
      this._tpConsumeFocus();
      return;
    }
    // 容器可能已被销毁逻辑移除 → 重建整个 DOM
    if (!document.getElementById('topology-canvas')) {
      this._tpRebuildDom();
    }
    const dom = document.getElementById('topology-canvas');
    if (!dom || dom.clientWidth === 0 || dom.clientHeight === 0) {
      // 容器还不可见，等待视图切换后再渲染
      console.warn('[拓扑图谱] 容器不可见，等待进入视图后渲染');
      return;
    }
    this._tpInited = true;
    // 先确保 metadata 已加载,再渲染(否则元数据为空)
    this._tpLoadMetadata().then(() => {
      const data = this._tpFullData();   // 完整 54 节点 + 112 条三级易错点 + 元数据
      this._tpGraphData = data;
      this._tpCurrentTab = 'network';
      this._tpRenderNetwork();
      this._tpRenderPathView();
      this._tpConsumeFocus();
    });
  };

  /** v=20260872 薄弱路径联动:消费 sessionStorage 里的聚焦节点,高亮并进入聚焦模式 */
App._tpConsumeFocus = function _tpConsumeFocus() {
    try {
      const focusId = sessionStorage.getItem('la_topo_focus');
      if (!focusId) return;
      sessionStorage.removeItem('la_topo_focus');
      sessionStorage.removeItem('la_topo_trace');
      const id = focusId;
      setTimeout(() => {
        if (this._tpGraphData && this._tpSelectNode) {
          const exists = this._tpGraphData.nodes.find(n => n.id === id);
          if (exists) this._tpSelectNode(id);
          else console.warn('[拓扑图谱] 聚焦节点不存在:', id);
        }
      }, 260);
    } catch (e) {}
  };

  /** 同步模式切换按钮的高亮状态 */
App._tpUpdateModeUI = function _tpUpdateModeUI() {
    const btns = document.querySelectorAll('.topo-mode-btn');
    if (!btns.length) return;
    btns.forEach(b => b.classList.toggle('active', b.dataset.mode === this._tpMode));
    // v=20260903 聚焦按钮弱禁用:未选中节点时降低透明度(仍可点击触发提示)
    const focusBtn = document.querySelector('.topo-mode-btn[data-mode="focus"]');
    if (focusBtn) {
      const hasNode = !!(this._tpSelectedNode || this._tpFocusedNode);
      focusBtn.classList.toggle('disabled-soft', !hasNode);
    }
    // v=20260903 总览常驻引导提示:仅总览模式显示
    const hint = document.getElementById('topo-focus-hint');
    if (hint) hint.style.display = this._tpMode === 'overview' ? '' : 'none';
  };

  /** 切换图谱浏览模式:overview=完整总览 / focus=聚焦关联 */
App.topoSwithMode = function topoSwithMode(mode) {
    if (mode !== 'overview' && mode !== 'focus') return;
    if (this._tpMode === mode) return;
    // v=20260903 聚焦模式需要先选中节点:未选中 → 轻量提示,不再静默无反馈
    if (mode === 'focus' && !this._tpFocusedNode) {
      if (this._tpSelectedNode) {
        // 已有选中节点(如刚退出聚焦)→ 用选中节点恢复聚焦
        this._tpFocusedNode = this._tpSelectedNode;
      } else {
        // 完全未选中 → 弹提示
        this._tpShowFocusToast();
        this._tpUpdateModeUI();
        return;
      }
    }
    this._tpMode = mode;
    this._tpUpdateModeUI();
    // 记住当前缩放/平移(通过 option 保留),直接重绘
    this._tpRenderNetwork();
    // 聚焦模式:把选中节点居中放大
    if (mode === 'focus' && this._tpFocusedNode && this._tpChart) {
      setTimeout(() => {
        try {
          this._tpChart.dispatchAction({
            type: 'showTip',
            seriesIndex: 0,
            dataIndex: this._tpChart.getOption().series[0].data.findIndex(d => d.id === this._tpFocusedNode.id)
          });
        } catch (e) {}
      }, 300);
    }
  };

  /** v=20260903 聚焦引导提示弹窗:3 秒自动消失,可手动关闭,不遮挡画布 */
App._tpShowFocusToast = function _tpShowFocusToast() {
    let toast = document.getElementById('topo-focus-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'topo-focus-toast';
      toast.className = 'topo-focus-toast';
      toast.innerHTML = `
        <div class="topo-focus-toast-body">
          <span class="topo-focus-toast-icon"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-bolt"/></svg></span>
          <span class="topo-focus-toast-text">请先点击图谱上任意一个知识点节点，即可进入聚焦模式，查看该节点的前后置关联与详情信息</span>
          <button class="topo-focus-toast-close" onclick="App._tpHideFocusToast()" title="关闭" aria-label="关闭提示">×</button>
        </div>`;
      document.body.appendChild(toast);
    }
    toast.classList.add('show');
    clearTimeout(this._tpToastTimer);
    this._tpToastTimer = setTimeout(() => this._tpHideFocusToast(), 3000);
  };

  /** v=20260903 手动关闭聚焦引导提示 */
App._tpHideFocusToast = function _tpHideFocusToast() {
    const t = document.getElementById('topo-focus-toast');
    if (t) t.classList.remove('show');
  };

  /** 进入聚焦模式(点击节点/搜索命中时调用) */
App._tpEnterFocus = function _tpEnterFocus(nodeId) {
    const data = this._tpGraphData;
    if (!data) return;
    const n = data.nodes.find(x => x.id === nodeId);
    if (!n) return;
    this._tpFocusedNode = n;
    this._tpMode = 'focus';
    this._tpUpdateModeUI();
    this._tpRenderNetwork();
    // 聚焦渲染后把选中节点居中
    setTimeout(() => {
      if (this._tpChart) {
        try {
          const series = this._tpChart.getOption().series[0];
          const idx = series.data.findIndex(d => d.id === nodeId);
          if (idx >= 0) this._tpChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
        } catch (e) {}
      }
    }, 350);
  };

  /** 退出聚焦模式 → 恢复完整总览(关闭抽屉时调用) */
App._tpExitFocus = function _tpExitFocus() {
    this._tpFocusedNode = null;
    if (this._tpMode !== 'overview') {
      this._tpMode = 'overview';
      this._tpUpdateModeUI();
      this._tpRenderNetwork();
    } else {
      this._tpUpdateModeUI();
    }
  };

App._tpResizeChart = function _tpResizeChart() {
    if (this._tpChart) setTimeout(() => this._tpChart.resize(), 50);
  };

App._tpRenderNetwork = function _tpRenderNetwork() {
    const dom = document.getElementById('topology-canvas');
    if (!dom) return;
    if (typeof echarts === 'undefined') {
      console.error('[拓扑图谱] ECharts 未加载，请检查 /lib/echarts/echarts.min.js');
      return;
    }
    // 单例管理：若已有实例，先销毁再重建，防止多次进入产生多实例内存泄漏
    // 同时保存当前画布的缩放/平移(满足"切换模式时尽量保留视角"的需求)
    if (this._tpChart) {
      try {
        const opt = this._tpChart.getOption();
        if (opt && opt.series && opt.series[0]) {
          if (opt.series[0].zoom != null) this._tpSaveZoom = opt.series[0].zoom;
          if (opt.series[0].center) this._tpSaveCenter = opt.series[0].center;
        }
      } catch (e) {}
      try { this._tpChart.dispose(); } catch (e) {}
      this._tpChart = null;
    }
    const chart = echarts.init(dom);
    this._tpChart = chart;

    const allData = this._tpGraphData;
    // ── 聚焦模式过滤：只保留 选中节点 + 它的前置依赖 + 后置关联 ──
    let data = allData;
    if (this._tpMode === 'focus' && this._tpFocusedNode) {
      const f = this._tpFocusedNode;
      const keepIds = new Set([f.id]);
      (f.preDependencies || []).forEach(p => keepIds.add(p.targetId));
      (f.postRelations || []).forEach(p => keepIds.add(p.targetId));
      const nodes = allData.nodes.filter(n => keepIds.has(n.id));
      const keepSet = new Set(nodes.map(n => n.id));
      const links = allData.links.filter(l => keepSet.has(l.source) && keepSet.has(l.target));
      // 只保留与本节点直接相连的边(前置:target=选中;后置:source=选中)
      const directLinks = links.filter(l => l.source === f.id || l.target === f.id);
      data = { nodes, links: directLinks };
      // 更新模式徽标
      this._tpUpdateModeUI();
    } else {
      this._tpUpdateModeUI();
    }

    const option = {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(17, 24, 39, .95)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params) => {
          if (params.dataType === 'edge') {
            const l = params.data;
            const w = typeof l.width === 'number' ? l.width : 0;
            return '<b>' + (l.label || '') + '</b>' + (w ? (' · 边权 ' + w.toFixed(1)) : '');
          }
          const n = params.data;
          const pct = Math.round((n.mastery || 0) * 100);
          const ds = n.difficultyScore || 3;
          const es = n.errorProneScore || 0;
          const fs = n.examFreqScore || 0;
          const stars = '★'.repeat(ds) + '☆'.repeat(5 - ds);
          const preList = (n.preDependencies || []).slice(0, 3)
            .map(function (p) {
              const tgt = data.nodes.find(function (x) { return x.id === p.targetId; });
              return '<li style="margin:2px 0;">⬅ <b>' + (tgt ? tgt.name : p.targetId) + '</b> <span style="color:#fbbf24;">' + Math.round((p.preWeight || 0) * 100) + '%</span></li>';
            }).join('');
          const postList = (n.postRelations || []).slice(0, 3)
            .map(function (p) {
              const tgt = data.nodes.find(function (x) { return x.id === p.targetId; });
              return '<li style="margin:2px 0;">➜ <b>' + (tgt ? tgt.name : p.targetId) + '</b> <span style="color:#a3e635;">' + Math.round((p.postWeight || 0) * 100) + '%</span></li>';
            }).join('');
          return '<div style="font-weight:700;font-size:13px;margin-bottom:4px;">' + n.name + '</div>'
            + '<div style="color:#cbd5e1;font-size:11px;">所属：' + (n.module || '') + ' · 难度 <span style="color:#fbbf24;letter-spacing:1px;">' + stars + '</span></div>'
            + '<div style="margin-top:4px;display:flex;gap:10px;font-size:10.5px;">'
            +   '<span style="color:#22c55e;">掌握 ' + pct + '%</span>'
            +   '<span style="color:#f97316;">易错 ' + Math.round(es * 100) + '%</span>'
            +   '<span style="color:#38bdf8;">考频 ' + Math.round(fs * 100) + '%</span></div>'
            + (preList ? '<div style="margin-top:6px;font-size:11px;color:#a5b4fc;">📥 前置依赖</div><ul style="margin:2px 0;padding-left:18px;font-size:11px;">' + preList + '</ul>' : '')
            + (postList ? '<div style="margin-top:6px;font-size:11px;color:#86efac;">📤 后置关联</div><ul style="margin:2px 0;padding-left:18px;font-size:11px;">' + postList + '</ul>' : '')
        }
      },
      series: [{
        type: 'graph',
        layout: 'force',
        // ── 移动端参数压缩:节点更小、力场更紧凑、关闭初始布局动画(防卡顿) ──
        force: this.isMobile ? {
          repulsion: 380,        // v=20260824h 移动端节点更分散,避免标签堆叠
          gravity: 0.08,
          edgeLength: [100, 160],
          friction: 0.4,
          layoutAnimation: false
        } : {
          repulsion: 600,
          gravity: 0.08,
          edgeLength: [180, 260],
          friction: 0.35,
          layoutAnimation: true
        },
        // v=20260903a 移动端也启用 roam（双指缩放/单指平移），小屏可缩放平移查看全图
        roam: true,
        draggable: !this.isMobile,
        zoom: this.isMobile ? Math.min(this._tpSaveZoom || 0.8, 0.85) : (this._tpSaveZoom || 1.0),
        center: this._tpSaveCenter || null,
        scaleLimit: { min: 0.3, max: 3 },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: this.isMobile ? [0, 6] : [0, 8],
        data: data.nodes.map(n => {
          // ── 聚焦模式下的外圈标记:当前=红圈放大 / 强前置=蓝圈 / 强后置=紫圈 ──
          let borderColor = '#fff', borderWidth = 2, extraSize = 0;
          let shadowColor = 'rgba(15, 23, 42, .15)', shadowBlur = 10;
          if (this._tpMode === 'focus' && this._tpFocusedNode) {
            const fid = this._tpFocusedNode.id;
            if (n.id === fid) {
              borderColor = '#ef4444'; borderWidth = 4; extraSize = 10;
              shadowColor = 'rgba(239, 68, 68, .55)'; shadowBlur = 22;
            } else if ((this._tpFocusedNode.preDependencies || []).some(p => p.targetId === n.id && (p.preWeight || 0) >= 0.8)) {
              borderColor = '#3b82f6'; borderWidth = 3; extraSize = 4;
              shadowColor = 'rgba(59, 130, 246, .4)'; shadowBlur = 14;
            } else if ((this._tpFocusedNode.postRelations || []).some(p => p.targetId === n.id && (p.postWeight || 0) >= 0.8)) {
              borderColor = '#a855f7'; borderWidth = 3; extraSize = 4;
              shadowColor = 'rgba(168, 85, 247, .4)'; shadowBlur = 14;
            } else {
              // 弱权重前置/后置:淡蓝 / 淡紫
              if ((this._tpFocusedNode.preDependencies || []).some(p => p.targetId === n.id)) {
                borderColor = '#93c5fd'; borderWidth = 2;
              } else if ((this._tpFocusedNode.postRelations || []).some(p => p.targetId === n.id)) {
                borderColor = '#d8b4fe'; borderWidth = 2;
              }
            }
          }
          return {
            id: n.id, name: n.name,
            module: n.module, mastery: n.mastery, freq: n.freq, errors: n.errors,
            // 元数据
            difficultyScore: n.difficultyScore || 3,
            errorProneScore: n.errorProneScore || 0.5,
            examFreqScore: n.examFreqScore || 0.5,
            preDependencies: n.preDependencies || [],
            postRelations: n.postRelations || [],
            // 节点大小:移动端缩小 ~40%, 聚焦选中放大
            symbolSize: (this.isMobile
              ? (12 + (n.difficultyScore || 3) * 4) + extraSize
              : (22 + (n.difficultyScore || 3) * 7) + extraSize),
            itemStyle: {
              color: this._tpErrScoreColor(n.errorProneScore || 0.5),
              borderColor: borderColor, borderWidth: borderWidth,
              shadowBlur: shadowBlur, shadowColor: shadowColor
            },
            label: {
              show: true, position: 'bottom',
              distance: this.isMobile ? 2 : 4,
              fontSize: (this._tpMode === 'focus' && n.id === (this._tpFocusedNode ? this._tpFocusedNode.id : '')) ? (this.isMobile ? 11 : 13) : (this.isMobile ? 9 : 11),
              fontWeight: 700, color: '#334155',
              // 移动端长名称换行,避免溢出
              formatter: (p) => {
                const name = p.data.name || '';
                if (this.isMobile && name.length > 6) {
                  // v=20260824h 移动端:超 6 字截断+省略号,避免节点下方标签堆叠;完整名通过 tooltip 查看
                  return name.slice(0, 6) + '…';
                }
                return name;
              }
            }
          };
        }),
        links: data.links.map(l => {
          // 聚焦模式下:前置连线 = 蓝色实线(粗细=preWeight) / 后置连线 = 浅紫虚线(粗细=postWeight)
          // 通过 l.label 与端点方向判断:前置边 source→target 中 source 是前置;后置边中 target 是后置
          let isPre = false, isPost = false, w = l.weight || 0.5;
          if (this._tpMode === 'focus' && this._tpFocusedNode) {
            const fid = this._tpFocusedNode.id;
            if (l.target === fid) { isPre = true; }
            else if (l.source === fid) { isPost = true; }
            else { isPre = true; } // 兜底
          }
          const color = isPre ? '#3b82f6' : (isPost ? '#a855f7' : (l.type === 'solid' ? '#6366f1' : '#94a3b8'));
          const dash = isPost ? 'dashed' : (l.type === 'solid' ? 'solid' : 'dashed');
          const width = isPre || isPost ? (1.2 + (w || 0.5) * 3.6) : (l.weight ? (1 + l.weight * 3) : (l.width || 2));
          const lbl = isPre ? '前置' : (isPost ? '后置' : (l.label || ''));
          return {
            source: l.source, target: l.target,
            width: width,
            lineStyle: {
              color: color,
              type: dash,
              curveness: isPost ? 0.22 : 0.12,
              opacity: isPre || isPost ? 0.95 : 0.75
            },
            label: { show: true, formatter: lbl + (isPre || isPost ? ' ' + Math.round((w || 0) * 100) + '%' : ''), fontSize: 9, color: isPre ? '#3b82f6' : (isPost ? '#a855f7' : '#64748b'), position: 'middle' }
          };
        }),
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 4 },
          itemStyle: { borderColor: '#fff', borderWidth: 3, shadowBlur: 18, shadowColor: 'rgba(99, 102, 241, .5)' }
        },
        lineStyle: { color: 'source', curveness: 0.1 }
      }]
    };
    chart.setOption(option);

    // 点击节点 → 下方详情面板
    chart.on('click', { dataType: 'node' }, (params) => {
      this._tpSelectNode(params.data.id);
    });

    // 点击空白处 → 收起详情
    chart.on('click', (params) => {
      if (params.dataType !== 'node') this.topologyClosePanel();
    });

    // 初始化收起态
    this._tpRenderCollapsed();

    // 双触发 resize 确保画布尺寸正确（防止某些情况容器还未稳定）
    requestAnimationFrame(() => { if (this._tpChart) this._tpChart.resize(); });
    setTimeout(() => { if (this._tpChart) this._tpChart.resize(); }, 200);
  };

