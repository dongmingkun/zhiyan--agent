/**
 * 教学资源 — 学术文献清单 v=20260904c
 * ─────────────────────────────────────────
 * 版权收敛：6 篇学术文献不提供 PDF 公开直链，仅保留规范参考文献条目
 * （作者 / 题名 / 来源期刊 / 年份），页面注明"仅列引用，全文可向作者或出版方获取"。
 * 每篇文献已提炼为 RAG 知识库语料（id 前缀 lit-），可在智能问答中检索引用。
 */
window.TeachingResources = {
  version: '20260904c',
  type: 'papers',
  title: '教学资源 · 学术文献',
  subtitle: '线性代数垂直深度文献库 — 仅列规范引用，全文可向作者或出版方获取',
  groups: [
    {
      id: 'paper',
      name: '参考文献（6 篇）',
      icon: 'book',
      desc: '从教学法、数值算法、谱图论到智慧教育，拓展本科线性代数知识的垂直深度',
      files: [
        {
          id: 'lit-axj-large-linear-system',
          name: '大型线性代数方程组解法的探讨',
          author: '徐小明',
          journal: '河海大学学报（自然科学版）',
          year: '2001',
          chapter: '线性方程组',
          tags: ['数值算法', 'Gauss消去', '压缩存储'],
          abstract: '探讨大型稀疏线性方程组的有效解法：Gauss 列主元消去、LU 分解与压缩存储技术，说明如何利用矩阵结构降低计算与存储开销。',
          corpusId: 'lit-axj-large-linear-system'
        },
        {
          id: 'lit-zw-dimension-analysis',
          name: '基于线性代数的大规模快速量纲分析算法',
          author: '钟巍',
          journal: '爆炸与冲击工程研究',
          year: '2020',
          chapter: '向量组与矩阵的秩',
          tags: ['量纲分析', 'π定理', '零空间'],
          abstract: '将量纲分析建模为线性代数问题：量纲矩阵的零空间基对应无量纲积（π 定理），以秩与零空间刻画物理问题的核心不变量。',
          corpusId: 'lit-zw-dimension-analysis'
        },
        {
          id: 'lit-tyj-pipa',
          name: '数学专业线性代数教学中的 PIPA 过程',
          author: '谭友军',
          journal: '中国大学教学',
          year: '2018',
          chapter: '教学法',
          tags: ['PIPA', 'Problem', 'Intuition', 'Proof', 'Applications'],
          abstract: '提出 Problem（问题）-Intuition（直觉）-Proof（证明）-Applications（应用）四阶段教学过程，降低线性代数的抽象门槛。',
          corpusId: 'lit-tyj-pipa'
        },
        {
          id: 'lit-rh-graph-space-1',
          name: '图的空间理论 —— 与图有关的线性代数理论（上）',
          author: '任韩',
          journal: '华东师范大学学报（自然科学版）',
          year: '2012',
          chapter: '线性空间',
          tags: ['图论', '关联矩阵', '基本空间'],
          abstract: '把图论问题转化为线性代数问题：图的关联矩阵与邻接矩阵定义图的基本空间（割空间、圈空间），用线性空间理论研究图的结构。',
          corpusId: 'lit-rh-graph-space-1'
        },
        {
          id: 'lit-rh-graph-space-2',
          name: '图的空间理论 —— 与图有关的线性代数理论（下）',
          author: '任韩',
          journal: '华东师范大学学报（自然科学版）',
          year: '2012',
          chapter: '特征值与特征向量',
          tags: ['谱图论', '拉普拉斯矩阵', 'Fiedler值'],
          abstract: '聚焦谱图论：邻接矩阵与拉普拉斯矩阵的特征值、特征向量刻画图的结构性质（连通性、分割、谱半径），Fiedler 值用于图的二分。',
          corpusId: 'lit-rh-graph-space-2'
        },
        {
          id: 'lit-ywx-knowledge-graph',
          name: '知识图谱赋能智慧教育的研究与实践 —— 以武汉理工大学“线性代数”课程为例',
          author: '杨文霞',
          journal: '智慧教育研究与实践',
          year: '2022',
          chapter: '课程知识体系',
          tags: ['知识图谱', '智慧教育', '个性化学习'],
          abstract: '以武汉理工大学“线性代数”课程为例，构建课程知识图谱，实现知识点关联导航、个性化学习路径推荐与精准教学。',
          corpusId: 'lit-ywx-knowledge-graph'
        }
      ]
    }
  ]
};

/* ═══════════ v=20260907a 文献详情补丁（lit-detail）═══════════
 * 功能：教学资源页 6 篇文献条目可点开阅读（电脑端居中弹窗 / 手机端底部抽屉）。
 * 数据：knowledge_corpus.json 的 lit- 前缀语料（本站自产提炼稿，非论文原文）。
 * 口径：维持"仅列规范引用"，不提供 PDF 直链（版权原因）。
 * 依赖：仅前端；不新增接口；不改动 renderResources。
 * ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.ResourcesUI) return;

  var LIT = {
  "lit-axj-large-linear-system": {
    "abs": "大型线性代数方程组的求解是科学与工程计算的核心问题。当方程组由偏微分方程(如 Saint-Venant 方程组、河网非恒定流方程)离散后产生时,系数矩阵往往规模大、稀疏且非对称。本文提出将 **Gauss 列主元消去法** 与 **压缩存储技术** 相结合的求解策略,在保证数值稳定性的同时显著减少存储单元。\n\n## 核心要点\n1. **Gauss 消去法原理**:对增广矩阵 [A|b] 做初等行变换化为上三角,再回代求解。第 k 步消元公式:对 i>k, 令 $m_{ik} = a_{ik}/a_{kk}$, 更新 $a_{ij} = a_{ij} - m_{ik} a_{kj}$。\n2. **列主元策略**:每一步选取当前列中绝对值最大的元素作为主元(交换行),避免除零并控制舍入误差传播。列主元是矩阵按行初等变换(相当于左乘初等置换矩阵 P)的实现,数学上等价于 PA = LU 分解。\n3. **压缩存储**:只存储非零元及其行列索引(CSR/CSC 格式),稀疏矩阵存储量由 O(n²) 降为 O(nnz)。\n4. **数值稳定性**:列主元使消元过程的主元满足 |a_{kk}| ≥ |m_{ik}|·|a_{kj}| 的增长可控,舍入误差上界更紧。\n5. **应用**:该方法使河网非恒定流数值计算更高效,计算精度有充分保证。\n\n## 与本科线性代数的联系\n- 消元过程 = 行倍加变换(行列式性质7),不改变系数矩阵行列式的值\n- 主元选取 = 初等行交换,每交换一次行列式变号\n- 回代求解 = 解上三角方程组,与克莱姆法则等价但计算量从 O(n!·n) 降到 O(n³/3)",
    "q": "大型线性方程组为什么常用 Gauss 列主元消去加压缩存储？它和本科线代的消元、主元有什么联系？",
    "chapter": "文献拓展 · 数值线性代数"
  },
  "lit-zw-dimension-analysis": {
    "abs": "量纲分析是工程研究特别是爆炸与冲击工程中极其重要的方法。其数学本质是线性代数:把物理量取对数后,量纲齐次条件变成线性方程组,量纲矩阵的**零空间**给出无量纲组合(π 组)。\n\n## 核心要点\n1. **量纲矩阵**:设有 n 个物理量 $x_1,\\dots,x_n$,每个量由基本量纲(如质量 M、长度 L、时间 T)的幂次表示,构成 m×n 量纲矩阵 D。\n2. **π 定理(Buckingham)**:量纲齐次物理关系的独立无量纲组个数 = n - rank(D)。即无量纲组的个数等于量纲矩阵的零空间维数(零度)。\n3. **算法**:对量纲矩阵做 Gauss-Jordan 消元求出秩 r,再求零空间的基向量,每个基向量对应一个 π 组;大规模问题时用压缩存储 + 整数高斯消元避免浮点误差。\n4. **爆炸与冲击工程应用**:对爆炸荷载、冲击波参数等物理量(如爆炸能量、距离、空气密度、压力)建立量纲矩阵,快速求出相似准则,指导模型试验设计。\n5. **优势**:与传统逐个试验不同,量纲分析可在试验前确定相似律,大幅减少试验次数。\n\n## 与本科线性代数的联系\n- 量纲矩阵的秩 → 矩阵秩的求解(Gauss 消元)\n- 零空间基 → 齐次线性方程组 Ax=0 的通解结构\n- π 定理是\"零空间维数 = 变量数 − 秩\"这一核心定理的物理化身",
    "q": "量纲分析 π 定理和矩阵的秩、零空间有什么关系？",
    "chapter": "文献拓展 · 线性代数应用"
  },
  "lit-tyj-pipa": {
    "abs": "PIPA 是数学专业线性代数教学中遵循的 **Problem(问题)-Intuition(直觉)-Proof(证明)-Applications(应用)** 四阶段过程,用于替代传统\"定义-引理-证明-定理-证明-推论\"(DLPTPC) 模式,提升学生学习体验。\n\n## 四个阶段\n1. **Problem(问题)**:线性代数概念大多来源于分析、几何、物理、代数及工程中的具体问题。教学前先把相关背景问题讲清楚,让学生了解抽象概念的来源与动机(例如:为什么需要行列式?→ 源于求解线性方程组的面积/体积解释)。\n2. **Intuition(直觉)**:用几何直觉(向量、变换、投影、体积)和直观例子建立概念的第一印象,降低抽象门槛。例如把特征值理解为\"变换在某个方向上的伸缩倍数\"。\n3. **Proof(证明)**:在线性代数这门\"证明课程\"(proving course)中,强调证明的必要性和证明中用到的方法(如反证、构造、等价转化),培养抽象思维与严谨性。\n4. **Applications(应用)**:通过例题、习题、定理的补充讨论巩固概念;一次 PIPA 过程常在\"应用\"阶段产生新的\"问题\",开启新一轮 PIPA。\n\n## 价值\n- 有助于学生理解抽象概念的来龙去脉,提高解决问题的能力\n- 为后继课程(数值分析、泛函分析、微分方程)打下坚实基础\n- PIPA 天然适合与启发式/苏格拉底式教学结合:先抛问题 → 引导直觉 → 再严谨化\n\n## 与本智能体设计的联系\n智能问答\"引导学习\"模式正是 PIPA 的教学化实现:先问问题(Problem)、给直觉提示(Intuition)、引导证明/推导(Proof)、最后总结应用(Applications)",
    "q": "什么是 PIPA 教学法？它如何用在线性代数概念学习中？",
    "chapter": "文献拓展 · 教学法"
  },
  "lit-rh-graph-space-1": {
    "abs": "图的空间理论将图论问题转化为线性代数问题:每个图对应若干矩阵(关联矩阵、邻接矩阵、拉普拉斯矩阵),图的结构性质(连通性、环、割集、生成树)可由这些矩阵的**秩、零空间、特征值**刻画。\n\n## 核心要点(上篇)\n1. **关联矩阵 B**:对无向图 G(V,E),令 |V|=n,|E|=m,关联矩阵 B 是 m×n 矩阵,行对应边、列对应顶点:$B_{ev}=1$ 若边 e 与顶点 v 关联。\n2. **图的基本空间**:图 G 上的实值函数构成 $\\mathbb{R}^{|V|}$ 与 $\\mathbb{R}^{|E|}$。定义**顶点空间**与**边空间**,两者通过关联矩阵建立联系。\n3. **零空间与连通性**:关联矩阵 B 的秩 = n − c(c 为连通分支数);因此 B 的零空间维数(零度)= c。即**图有多少个连通分支,由关联矩阵的零空间维数读出**。\n4. **割集空间与圈空间**:边空间可分解为圈空间(cycle space)与割集空间(cut space)的正交直和,维数分别为 m−n+c 与 n−c,对应关联矩阵的零空间与行空间。\n5. **Betti 数**:m−n+c 是图的第一 Betti 数(环的个数),是代数拓扑中同调群的维数在图上的体现。\n\n## 与本科线性代数的联系\n- 关联矩阵的秩/零空间 → 矩阵秩与齐次方程组解空间理论\n- 圈空间与割集空间正交 → 行空间与零空间的正交补关系($R(B^T) = N(B)^\\perp$)\n- 图的生成树计数(Matrix-Tree 定理) → 拉普拉斯矩阵的任一余子式等于生成树个数",
    "q": "图的关联矩阵的秩和零空间能告诉我们图的哪些性质？",
    "chapter": "文献拓展 · 图与线性代数(上)"
  },
  "lit-rh-graph-space-2": {
    "abs": "下篇聚焦**谱图论**:通过邻接矩阵与拉普拉斯矩阵的**特征值与特征向量**刻画图的结构性质。\n\n## 核心要点(下篇)\n1. **邻接矩阵 A**:$A_{uv}=1$ 若 u,v 相邻,否则为 0。对无向图,A 是对称矩阵 → 特征值全为实数,可正交对角化。\n2. **拉普拉斯矩阵 L**:$L = D − A$(D 为度对角阵),半正定,最小特征值为 0,对应的特征向量为全 1 向量(连通图)。\n3. **拉普拉斯特征值 λ₂(Fiedler 值)**:$\\lambda_2 > 0 \\iff$ 图连通;λ₂ 越小图越\"易被切割\",是谱聚类与图划分的核心量。\n4. **Matrix-Tree 定理**:图的生成树个数 = 拉普拉斯矩阵任意 n−1 阶主子式的行列式 = $\\frac{1}{n}\\lambda_1\\lambda_2\\cdots\\lambda_{n-1}$。\n5. **谱与图性质**:图的正则性、二部性(邻接矩阵特征值对称)、图同构的谱必要条件、谱半径与最大度等。\n\n## 与本科线性代数的联系\n- 对称矩阵实特征值 + 正交对角化 → 二次型 / 实对称矩阵章节的核心定理\n- L = D − A 的构造 → 矩阵加法与分块\n- 半正定判定 λ≥0 → 正定矩阵判定\n- Fiedler 值 → 特征值连续依赖矩阵元素(特征值的连续性)",
    "q": "拉普拉斯矩阵的特征值（Fiedler 值）如何刻画图的连通性？",
    "chapter": "文献拓展 · 图与线性代数(下)"
  },
  "lit-ywx-knowledge-graph": {
    "abs": "知识图谱(Knowledge Graph)以\"实体-关系-实体\"三元组描述知识之间的关联,是智慧教育的重要基础设施。武汉理工大学以线性代数课程为例构建课程知识图谱,赋能教学。\n\n## 核心要点\n1. **课程知识图谱构建**:将线性代数教材内容拆解为知识点实体(行列式、矩阵、向量组、方程组、特征值、二次型等),建立\"前置依赖/后置关联/包含/应用\"等关系,形成有向图。\n2. **知识点关系建模**:如\"逆矩阵\"依赖\"行列式(可逆判定)\"与\"伴随矩阵\";\"特征值\"依赖\"行列式(特征方程)\";\"二次型\"依赖\"特征值与正交变换\"。这种依赖关系与知识拓扑/学习路径天然一致。\n3. **智慧教育应用**:\n   - **个性化路径**:根据知识图谱中节点的前置依赖,为学生规划学习顺序\n   - **学情诊断**:将学生错题映射到知识节点,定位薄弱点并追溯前置缺失\n   - **资源推荐**:以知识点为枢纽关联课件、例题、微课视频、题库\n   - **可视化学习**:知识图谱的可视化帮助学生建立知识体系全貌\n4. **实践效果**:提高了学生知识体系的系统性与学习效率,为大规模个性化教学提供支撑。\n\n## 与本系统的联系\n本系统的\"知识点拓扑图谱\"正是该文献思想的工程实现:前置依赖拓扑排序 → 自适应学习路径 → 薄弱点诊断 → 三级知识点跳转复习。",
    "q": "课程知识图谱如何用于个性化学习路径和学情诊断？",
    "chapter": "文献拓展 · 智慧教育"
  }
};

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stripMd(s) { return String(s || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, ''); }

  function excerpt(s) {
    var t = stripMd(s).replace(/\s+/g, ' ').trim();
    return t.length > 84 ? t.slice(0, 84) + '……' : t;
  }

  /* 轻量 Markdown：## 标题 / - 列表 / **加粗** / $...$ 交给 KaTeX */
  function inline(s) { return escHtml(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); }
  function mdLite(src) {
    var lines = String(src || '').split(/\r?\n/);
    var out = [], inUl = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { if (inUl) { out.push('</ul>'); inUl = false; } continue; }
      var h = t.match(/^#{2,4}\s+(.*)$/);
      if (h) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<h4>' + inline(h[1]) + '</h4>'); continue; }
      if (/^[-*]\s+/.test(t)) {
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + inline(t.replace(/^[-*]\s+/, '')) + '</li>');
        continue;
      }
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push('<p>' + inline(t) + '</p>');
    }
    if (inUl) out.push('</ul>');
    return out.join('');
  }

  var CSS_TEXT = [
    '.exam-papers-file.lit-clickable{cursor:pointer;transition:box-shadow .15s,border-color .15s,transform .05s;}',
    '.exam-papers-file.lit-clickable:hover{border-color:#a5b4fc !important;box-shadow:0 2px 10px rgba(99,102,241,.12);}',
    '.exam-papers-file.lit-clickable:active{transform:scale(.995);}',
    '.exam-papers-file.lit-clickable .ep-file-open{opacity:1 !important;color:#4f46e5;font-weight:600;}',
    '.exam-papers-file.lit-clickable .resources-abstract{display:block;margin-top:6px;font-size:12.5px;color:#64748b;line-height:1.6;}',
    '.lit-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;animation:litFade .18s ease;}',
    '.lit-modal{background:#fff;color:#0f172a;border-radius:16px;max-width:720px;width:100%;max-height:84vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(2,6,23,.35);animation:litPop .2s ease;}',
    '.lit-modal-head{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 10px 6px 18px;border-bottom:1px solid #e2e8f0;flex:0 0 auto;}',
    '.lit-modal-title{font-size:15px;font-weight:700;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
    '.lit-close{flex:0 0 auto;width:32px;height:32px;border:none;background:transparent;border-radius:8px;font-size:16px;color:#475569;cursor:pointer;}',
    '.lit-close:hover{background:#f1f5f9;color:#0f172a;}',
    '.lit-modal-body{overflow-y:auto;padding:16px 18px;font-size:14.5px;line-height:1.8;-webkit-overflow-scrolling:touch;}',
    '.lit-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}',
    '.lit-chip{background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-size:12px;}',
    '.lit-chip-accent{background:#4f46e5;color:#fff;}',
    '.lit-abstract h4{margin:14px 0 6px;font-size:14px;color:#312e81;}',
    '.lit-abstract p{margin:6px 0;}',
    '.lit-abstract ul{margin:6px 0 10px;padding-left:20px;}',
    '.lit-abstract li{margin:3px 0;}',
    '.lit-note{margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;font-size:12.5px;color:#64748b;line-height:1.7;}',
    '.lit-actions{flex:0 0 auto;padding:10px 18px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #e2e8f0;background:#fff;}',
    '.lit-cta{width:100%;border:none;border-radius:12px;padding:11px 16px;font-size:14.5px;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(135deg,#6366f1,#8b5cf6);}',
    '.lit-cta:hover{filter:brightness(1.06);}',
    '@keyframes litFade{from{opacity:0}to{opacity:1}}',
    '@keyframes litPop{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}',
    '@media (max-width:768px){',
    '  .lit-modal-backdrop{padding:0;align-items:flex-end;}',
    '  .lit-modal{max-width:none;width:100%;max-height:88vh;border-radius:18px 18px 0 0;animation:litUp .22s ease;}',
    '  .lit-modal-head{padding:6px 8px 6px 16px;}',
    '  .lit-modal-body{padding:14px 16px;font-size:14px;}',
    '  .lit-actions{padding:10px 16px calc(10px + env(safe-area-inset-bottom));}',
    '  @keyframes litUp{from{transform:translateY(40%);opacity:.6}to{transform:none;opacity:1}}',
    '}',
    'html[data-theme="dark"] .lit-modal,html[data-theme="dark"] .lit-actions{background:#1e293b;color:#e2e8f0;}',
    'html[data-theme="dark"] .lit-modal-head{border-bottom-color:#334155;}',
    'html[data-theme="dark"] .lit-close{color:#94a3b8;}',
    'html[data-theme="dark"] .lit-close:hover{background:#334155;color:#e2e8f0;}',
    'html[data-theme="dark"] .lit-chip{background:rgba(99,102,241,.18);color:#c7d2fe;}',
    'html[data-theme="dark"] .lit-note{background:rgba(148,163,184,.08);border-color:#475569;color:#94a3b8;}',
    'html[data-theme="dark"] .lit-actions{border-top-color:#334155;}',
    'html[data-theme="dark"] .exam-papers-file.lit-clickable .resources-abstract{color:#94a3b8;}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('lit-detail-style')) return;
    var st = document.createElement('style');
    st.id = 'lit-detail-style';
    st.textContent = CSS_TEXT;
    document.head.appendChild(st);
  }

  function allFiles() {
    var d = window.TeachingResources || {}, out = [], gs = d.groups || [];
    for (var i = 0; i < gs.length; i++) { var fs = gs[i].files || []; for (var j = 0; j < fs.length; j++) out.push(fs[j]); }
    return out;
  }

  function findFile(id) {
    var fs = allFiles();
    for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i];
    return null;
  }

  /* 给列表行补一行摘要（复用 renderResources 已有的 f.abstract 渲染位） */
  (function enrichData() {
    var fs = allFiles();
    for (var i = 0; i < fs.length; i++) {
      var d = LIT[fs[i].id];
      if (d && !fs[i].abstract) fs[i].abstract = excerpt(d.abs);
    }
  })();

  function open(id) {
    var f = findFile(id), d = LIT[id];
    if (!f || !d) return;
    injectCss();
    var backdrop = document.createElement('div');
    backdrop.className = 'lit-modal-backdrop';
    backdrop.innerHTML =
      '<div class="lit-modal" role="dialog" aria-modal="true" aria-label="' + escHtml(f.name) + '">' +
        '<div class="lit-modal-head">' +
          '<div class="lit-modal-title">' + escHtml(f.name) + '</div>' +
          '<button class="lit-close" type="button" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="lit-modal-body">' +
          '<div class="lit-meta">' +
            (f.author ? '<span class="lit-chip">' + escHtml(f.author) + '</span>' : '') +
            (f.journal ? '<span class="lit-chip">' + escHtml(f.journal) + '</span>' : '') +
            (f.year ? '<span class="lit-chip">' + escHtml(f.year) + '</span>' : '') +
            '<span class="lit-chip lit-chip-accent">' + escHtml(f.chapter || (d.chapter || '')) + '</span>' +
          '</div>' +
          '<div class="lit-abstract">' + mdLite(d.abs) + '</div>' +
          '<div class="lit-note">仅列规范引用，不提供 PDF 全文公开下载，全文可向作者或出版方获取；本文献已提炼为 RAG 知识库语料（id: ' + escHtml(f.id) + '），在「智能问答」中提问相关主题会自动检索引用。</div>' +
        '</div>' +
        '<div class="lit-actions"><button class="lit-cta" type="button">在智能问答中提问该主题</button></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function close() {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
    function onKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } }

    backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) close(); });
    backdrop.querySelector('.lit-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    backdrop.querySelector('.lit-cta').addEventListener('click', function () {
      close();
      try { if (window.App && App.switchView) App.switchView('chat'); } catch (e) {}
      var inp = document.getElementById('chat-input');
      if (inp) inp.value = d.q;
      setTimeout(function () { try { if (window.App && App.sendMessage) App.sendMessage(); } catch (e) {} }, 600);
    });

    var bodyEl = backdrop.querySelector('.lit-modal-body');
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(bodyEl, {
          delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
          throwOnError: false
        });
      } catch (e) {}
    }
  }

  window.ResourcesUI = { open: open, close: null, _LIT: LIT };

  /* 把列表行接上点击： MutationObserver 兼容每次进入视图的重渲染 */
  function wire() {
    var host = document.getElementById('resources-content');
    if (!host) return;
    var rows = host.querySelectorAll('.exam-papers-file');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.dataset.litWired) continue;
      var nameEl = row.querySelector('.ep-file-name');
      if (!nameEl) continue;
      var f = null, fs = allFiles();
      for (var j = 0; j < fs.length; j++) {
        if (fs[j].name === nameEl.textContent.trim()) { f = fs[j]; break; }
      }
      if (!f || !LIT[f.id]) continue;
      row.dataset.litWired = '1';
      row.dataset.litId = f.id;
      row.classList.add('lit-clickable');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.title = '点击查看文献详情';
      var chip = row.querySelector('.ep-file-open');
      if (chip) { chip.textContent = '详情 ▸'; }
      (function (fid) {
        row.addEventListener('click', function (ev) { ev.stopPropagation(); window.ResourcesUI.open(fid); });
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); window.ResourcesUI.open(fid); }
        });
      })(f.id);
    }
  }

  var wireTries = 0;
  function startWire() {
    var host = document.getElementById('resources-content');
    if (!host) {
      if (++wireTries > 20) { console.warn('[resources] 未找到 #resources-content，停止重试'); return; }
      setTimeout(startWire, 300);
      return;
    }
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; wire(); });
    });
    mo.observe(host, { childList: true });
    wire();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWire);
  else startWire();
})();
