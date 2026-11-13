/**
 * 智能问答引擎
 * 基于知识库检索 + 意图识别 + 分步引导解题
 *
 * v2 升级：
 * - 引入置信度评分，避免无依据回答
 * - 概念辨析库：覆盖最常见易混淆概念
 * - 公式速查表：独立于知识库
 * - FAQ库：覆盖元问题
 * - 结构化知识卡片输出
 */

const ChatEngine = {
  history: [],

  intents: {
    CONCEPT: 'concept',
    CALCULATE: 'calculate',
    SOLVE: 'solve',
    EXAMPLE: 'example',
    FORMULA: 'formula',
    PITFALL: 'pitfall',
    COMPARISON: 'comparison',
    GREETING: 'greeting',
    HELP: 'help',
    UNKNOWN: 'unknown'
  },

  intentKeywords: {
    calculate: ['计算', '求', '算', '算出', '算一下', '帮我算', '计算一下'],
    solve: ['解方程', '求解', '解线性方程组', '方程组的解', '求通解', '求基础解系'],
    example: ['例子', '例题', '举例', '举个例子', '示例', '示范'],
    formula: ['公式', '公式是什么', '怎么表示', '表达式'],
    pitfall: ['易错', '误区', '注意', '陷阱', '常见错误', '容易错'],
    comparison: ['区别', '不同', '比较', '辨析', '对比', '有什么不同', '区分'],
    greeting: ['你好', 'hello', 'hi', '嗨', '在吗', '你是谁', '介绍'],
    help: ['帮助', 'help', '能做什么', '功能', '怎么用', '使用']
  },

  /**
   * 概念辨析库：覆盖最常见易混淆概念
   */
  comparisons: {
    '相似': {
      title: '矩阵的相似 vs 等价 vs 合同',
      icon: '🔄',
      confidence: 'high',
      source: '第二章·矩阵关系',
      content: {
        definition: '三种矩阵关系描述的是矩阵在**不同变换**下的等价性。',
        items: [
          { name: '等价（≅）', desc: 'A经有限次初等变换变为B', condition: '同型且 r(A)=r(B)', meaning: '本质是秩相同' },
          { name: '相似（~）', desc: '存在可逆P，使 P⁻¹AP = B', condition: 'A和B同阶方阵，且存在可逆P', meaning: '同一线性变换在不同基下的表示' },
          { name: '合同', desc: '存在可逆P，使 PᵀAP = B', condition: 'A和B同阶方阵（常讨论对称阵）', meaning: '同一二次型在不同变量替换下的矩阵' }
        ],
        relationships: [
          '**相似** ⟹ **等价**（反之不成立）',
          '**合同** ⟹ **等价**（反之不成立）',
          '**相似** 与 **合同** 之间无推出关系',
          '**正交相似 = 正交合同**（因为正交阵Q满足 Q⁻¹ = Qᵀ）'
        ],
        typical: '对角阵是最简形式：每个矩阵相似于Jordan阵，每个实对称阵合同于对角阵。'
      }
    },
    '相关': {
      title: '线性相关 vs 线性无关',
      icon: '🔗',
      confidence: 'high',
      source: '第四章·向量组',
      content: {
        definition: '描述向量组内部线性表示关系的两个对立概念。',
        items: [
          { name: '线性相关', desc: '∃ 不全为0的 k₁,...,kₛ 使 k₁α₁+...+kₛαₛ=0', condition: '存在非零组合=0', meaning: '至少一向量可由其余向量线性表示' },
          { name: '线性无关', desc: '仅当k₁=...=kₛ=0时 k₁α₁+...+kₛαₛ=0', condition: '只有平凡组合=0', meaning: '任一向量不可由其余向量表示' }
        ],
        relationships: [
          '**判定1（定义法）**：设等式=0，看是否存在非零解',
          '**判定2（行列式）**：向量个数=维数时，|A|=0 相关，|A|≠0 无关',
          '**判定3（秩）**：r(A) < 向量个数 ⟹ 相关；r(A) = 向量个数 ⟹ 无关',
          '**包含关系**：含零向量的向量组必相关；单个非零向量必无关'
        ],
        typical: '极大线性无关组是包含最多无关向量的子集，其余向量都可用其线性表示。'
      }
    },
    '正定': {
      title: '正定 vs 负定 vs 半正定 vs 不定',
      icon: '⚖️',
      confidence: 'high',
      source: '第六章·二次型',
      content: {
        definition: '二次型 xᵀAx 在所有非零向量上的符号特征。',
        items: [
          { name: '正定', desc: '∀x≠0, xᵀAx > 0', condition: '特征值全>0；顺序主子式全>0；正惯性指数=n', meaning: '椭圆面，恒正' },
          { name: '半正定', desc: '∀x, xᵀAx ≥ 0', condition: '特征值全≥0（可含0）', meaning: '可退化椭圆' },
          { name: '负定', desc: '∀x≠0, xᵀAx < 0', condition: '特征值全<0；-A正定', meaning: '椭球面，恒负' },
          { name: '不定', desc: '∃x,y 使 xᵀAx>0 且 yᵀAy<0', condition: '特征值有正有负', meaning: '鞍形' }
        ],
        relationships: [
          '**判定1（特征值）**：A的特征值符号决定定性',
          '**判定2（顺序主子式）**：A正定 ⟺ 所有顺序主子式 > 0（赫尔维茨定理）',
          '**判定3（惯性指数）**：A正定 ⟺ 正惯性指数 p = n',
          '**判定4（合同对角）**：A正定 ⟺ 合同于单位阵 I'
        ],
        typical: '对称矩阵 A 对应二次型 xᵀAx；正定 ⟺ 对称阵所有特征值 > 0。'
      }
    },
    '特征值': {
      title: '特征值 vs 奇异值',
      icon: '✨',
      confidence: 'high',
      source: '第五章·特征值分解 vs SVD',
      content: {
        definition: '两个不同的"分解视角"，描述矩阵在不同变换下的不变量。',
        items: [
          { name: '特征值 λ', desc: 'Ax = λx 的解', condition: 'A 必须是方阵', meaning: 'A 在特征方向上的伸缩倍数' },
          { name: '奇异值 σ', desc: 'AᵀA 的特征值的平方根', condition: '任意 m×n 矩阵都有', meaning: '线性映射的"半轴长度"' }
        ],
        relationships: [
          '**存在性**：特征值要求方阵；奇异值任意矩阵都有',
          '**数量**：方阵有 n 个特征值（计重数），min(m,n) 个奇异值',
          '**正负**：特征值可正可负可复；奇异值恒 ≥ 0',
          '**几何**：|λ| 表示特征方向伸缩倍数；σ 表示将单位球映射为椭球的半轴长',
          '**关系**：σᵢ = √(特征值(AᵀA))；|λᵢ(A对称)| = σᵢ'
        ],
        typical: 'SVD分解 A = UΣVᵀ 在任何矩阵上都能进行，比特征分解更通用。'
      }
    },
    '秩': {
      title: '矩阵的秩 vs 向量组的秩',
      icon: '📐',
      confidence: 'high',
      source: '第四章·秩理论',
      content: {
        definition: '两者本质相同，都是描述线性无关子集的最大规模。',
        items: [
          { name: '矩阵的秩 r(A)', desc: 'A 的行向量组的秩 = 列向量组的秩', condition: 'r(A) = 行秩 = 列秩', meaning: '行阶梯形中非零行数' },
          { name: '向量组的秩', desc: '向量组的极大线性无关组所含向量个数', condition: '由向量组中具体决定', meaning: '能线性表示所有其他向量的最少向量数' }
        ],
        relationships: [
          '**等价定理**：矩阵的行秩 = 列秩（这是线性代数的核心定理之一）',
          '**初等变换不改变秩**',
          '**满秩方阵**：r(A) = n ⟺ A 可逆 ⟺ |A| ≠ 0',
          '**秩不等式**：r(AB) ≤ min(r(A), r(B))；r(A+B) ≤ r(A)+r(B)'
        ],
        typical: '求秩用初等行变换化为行阶梯形最便捷。'
      }
    },
    '初等变换': {
      title: '初等行变换 vs 初等列变换',
      icon: '🔁',
      confidence: 'high',
      source: '第二章·矩阵初等变换',
      content: {
        definition: '矩阵的三类初等变换是矩阵理论的基石。',
        items: [
          { name: '对换变换', desc: '交换两行（或两列）', condition: '↔ᵢⱼ', meaning: '用于调换顺序' },
          { name: '倍乘变换', desc: '某行（或列）乘非零常数 k', condition: 'k×Rᵢ (k≠0)', meaning: '缩放某行' },
          { name: '倍加变换', desc: '某行（列）的k倍加到另一行（列）', condition: 'Rᵢ + kRⱼ', meaning: '消元的核心操作' }
        ],
        relationships: [
          '**初等变换可逆**：每种初等变换都有逆变换',
          '**行变换**保持行向量组的线性关系',
          '**列变换**保持列向量组的线性关系',
          '**混用行列变换**会破坏原矩阵的结构（除非明确说明）',
          '**应用**：求逆矩阵、求秩、化行阶梯形、解方程组'
        ],
        typical: '化行阶梯形用行变换；求转置伴随用列变换；初等矩阵左乘实施行变换，右乘实施列变换。'
      }
    }
  },

  /**
   * 公式速查库
   */
  formulaCheatsheet: {
    '行列式': [
      { name: '二阶行列式', latex: '|A| = a_{11}a_{22} - a_{12}a_{21}' },
      { name: '三阶对角线法则', latex: '|A| = a_{11}a_{22}a_{33} + a_{12}a_{23}a_{31} + a_{13}a_{21}a_{32} - a_{13}a_{22}a_{31} - a_{12}a_{21}a_{33} - a_{11}a_{23}a_{32}' },
      { name: 'n阶展开', latex: 'D = \\sum_{j=1}^{n} a_{ij}A_{ij}' },
      { name: '拉普拉斯展开', latex: 'D = \\sum_{|S|=k} (-1)^{\\sum S + \\sum T} D_S \\cdot D_T' },
      { name: '范德蒙德行列式', latex: 'V(x_1,...,x_n) = \\prod_{1 \\le i < j \\le n} (x_j - x_i)' }
    ],
    '矩阵': [
      { name: '矩阵乘法', latex: 'C = AB, \\ c_{ij} = \\sum_{k=1}^{p} a_{ik}b_{kj}' },
      { name: '转置性质', latex: '(AB)^T = B^T A^T' },
      { name: '逆矩阵', latex: 'AA^{-1} = A^{-1}A = E' },
      { name: '逆矩阵与伴随', latex: 'A^{-1} = \\frac{1}{|A|} A^*' },
      { name: '矩阵的迹', latex: 'tr(A) = \\sum_{i=1}^{n} a_{ii}' },
      { name: '迹与特征值', latex: 'tr(A) = \\sum \\lambda_i' }
    ],
    '向量': [
      { name: '向量内积', latex: '\\langle u, v \\rangle = \\sum_{i=1}^{n} u_i v_i' },
      { name: '向量范数', latex: '\\|u\\| = \\sqrt{\\langle u, u \\rangle}' },
      { name: '柯西-施瓦茨', latex: '|\\langle u, v \\rangle| \\le \\|u\\| \\cdot \\|v\\|' },
      { name: '施密特正交化', latex: '\\beta_i = \\alpha_i - \\sum_{j=1}^{i-1} \\frac{\\langle \\alpha_i, \\beta_j \\rangle}{\\langle \\beta_j, \\beta_j \\rangle} \\beta_j' }
    ],
    '特征值': [
      { name: '特征方程', latex: 'A\\xi = \\lambda\\xi, \\ (\\lambda E - A)\\xi = 0' },
      { name: '特征多项式', latex: 'f(\\lambda) = |\\lambda E - A| = 0' },
      { name: '对角化条件', latex: 'A = P\\Lambda P^{-1} \\Leftrightarrow n \\text{个线性无关特征向量}' },
      { name: '谱分解（对称阵）', latex: 'A = Q\\Lambda Q^T \\text{ (Q为正交阵)}' },
      { name: 'Cayley-Hamilton定理', latex: 'f(A) = 0' }
    ],
    '方程组': [
      { name: '克莱姆法则', latex: 'x_j = \\frac{D_j}{D}, \\ D \\neq 0' },
      { name: '解的结构', latex: 'x = \\eta^* + c_1\\xi_1 + ... + c_k\\xi_k' },
      { name: '有解判定', latex: 'r(A) = r(A|b) \\Leftrightarrow \\text{有解}' },
      { name: '解的个数', latex: 'r(A) = r(A|b) = n \\Leftrightarrow \\text{唯一解}; \\ < n \\Leftrightarrow \\text{无穷多解}' }
    ],
    '二次型': [
      { name: '二次型矩阵表示', latex: 'f(x_1,...,x_n) = x^T A x' },
      { name: '配方法', latex: 'f = a_{11}(x_1 + \\frac{a_{12}}{a_{11}}x_2 + ...)^2 + ...' },
      { name: '正交变换法', latex: 'f = \\lambda_1 y_1^2 + ... + \\lambda_n y_n^2' },
      { name: '正定判定', latex: 'A \\text{正定} \\Leftrightarrow \\text{所有顺序主子式} > 0' }
    ]
  },

  /**
   * 常见问题快捷库
   */
  faqDatabase: [
    {
      keywords: ['什么是线性代数', '线性代数是什么', '学什么', '有什么用'],
      answer: `## 🎓 线性代数是什么\n\n线性代数是研究**向量空间、线性映射和矩阵理论**的数学分支。\n\n### 📚 核心研究对象\n- **向量空间**：满足加法和数乘封闭的集合（如 R², R³, Rⁿ）\n- **线性映射**：保持线性结构的函数 T(u+v)=T(u)+T(v)\n- **矩阵**：线性映射的代数表示\n\n### 🎯 主要应用\n- 机器学习（PCA、神经网络）\n- 计算机图形学（变换、投影）\n- 量子力学（态向量、算子）\n- 工程优化（最小二乘法）\n- 数据分析（降维、特征提取）\n\n### 📖 本课程涵盖\n- 行列式、矩阵、向量、线性方程组\n- 特征值与特征向量\n- 二次型、向量空间、线性变换\n\n你可以直接提问："什么是特征值" 或 "行列式怎么求" 这样的具体问题。`
    },
    {
      keywords: ['学不会', '听不懂', '太难了', '怎么学', '学习方法', '入门'],
      answer: `## 📚 线性代数学习路径建议\n\n### 🎯 四步学习法\n1. **直观理解** — 先看几何动画（切换到"几何可视化"）\n2. **公式掌握** — 记住关键公式和性质\n3. **计算练习** — 用"计算工具"做大量练习\n4. **测试巩固** — 在"测试中心"做章节测试\n\n### 💡 学习误区\n- ❌ 一开始就死记硬背计算步骤\n- ❌ 只记公式不理解几何意义\n- ❌ 不做总结归纳\n\n### ✅ 推荐顺序\n行列式 → 矩阵 → 向量组 → 方程组 → 特征值 → 二次型\n\n### 🛠️ 学习工具\n- 看到新概念用"知识体系"查定义\n- 公式不会用"公式速查"\n- 例题不会用"智能问答"提问\n- 计算不确定用"计算工具"验证\n\n输入"什么是特征值"试试看！`
    },
    {
      keywords: ['考研', '考试', '重点', '考点'],
      answer: `## 🎯 线性代数考研核心考点\n\n### ⭐ 必考重点（出现频率 > 80%）\n1. **行列式计算**（含抽象行列式）\n2. **矩阵的逆、秩、初等变换**\n3. **向量组的线性相关性、极大无关组**\n4. **线性方程组求解**（含参数讨论）\n5. **特征值与特征向量**\n6. **相似对角化**\n7. **二次型化标准形**\n8. **正定矩阵判定**\n\n### 📊 题型分布\n- 选择题（约 30 分）：概念辨析\n- 填空题（约 15 分）：计算\n- 解答题（约 55 分）：综合证明与计算\n\n### 🔥 高频考点\n- 抽象矩阵的可逆性证明\n- 方程组解的结构与参数讨论\n- 实对称阵的正交对角化\n- 二次型的正定性判定\n\n### 💪 备考建议\n- 反复做真题，建立题型-方法映射\n- 重视证明题（向量、矩阵部分）\n- 参数讨论题要细心\n\n切换到"练习题库"可按章节和难度专项练习！`
    }
  ],

  analyzeIntent(message) {
    const msg = message.toLowerCase().trim();

    // 方法类问题优先识别为 CONCEPT（"怎么求""如何求""什么方法"）
    if (/怎么求|如何求|怎么算|如何算|什么方法|怎么解|如何解/.test(msg) && !/[\d\-\.]+[\s,]+[\d\-\.]+[\s,]*[;；\n]/.test(message)) {
      return this.intents.CONCEPT;
    }

    for (const kw of this.intentKeywords.greeting) {
      if (msg.includes(kw)) return this.intents.GREETING;
    }
    for (const kw of this.intentKeywords.help) {
      if (msg.includes(kw)) return this.intents.HELP;
    }
    for (const kw of this.intentKeywords.solve) {
      if (msg.includes(kw)) return this.intents.SOLVE;
    }

    const hasMatrix = /[\d\-\.]+\s*[,，\s]*[\d\-\.]+.*[;；]/.test(msg) ||
                      /\[\s*\[/.test(msg) ||
                      /矩阵/.test(msg) && /计算|求|算/.test(msg);
    if (hasMatrix) {
      for (const kw of this.intentKeywords.calculate) {
        if (msg.includes(kw)) return this.intents.CALCULATE;
      }
    }
    if (/[\d\-\.]+[\s,]+[\d\-\.]+[\s,]*[;；\n]/.test(message)) {
      return this.intents.CALCULATE;
    }

    for (const kw of this.intentKeywords.example) {
      if (msg.includes(kw)) return this.intents.EXAMPLE;
    }
    for (const kw of this.intentKeywords.formula) {
      if (msg.includes(kw)) return this.intents.FORMULA;
    }
    for (const kw of this.intentKeywords.pitfall) {
      if (msg.includes(kw)) return this.intents.PITFALL;
    }
    for (const kw of this.intentKeywords.comparison) {
      if (msg.includes(kw)) return this.intents.COMPARISON;
    }

    return this.intents.CONCEPT;
  },

  // 教学模式状态
  currentMode: 'direct',
  // 引导学习上下文
  guidedContext: null,

  process(message, mode) {
    this.currentMode = mode || 'direct';

    // 引导学习模式：处理用户的选择回复
    if (this.currentMode === 'guided' && this.guidedContext) {
      const guidedResponse = this.handleGuidedReply(message);
      if (guidedResponse) {
        this.history.push({ role: 'user', content: message });
        this.history.push({ role: 'assistant', content: guidedResponse });
        return { intent: 'guided', response: guidedResponse };
      }
    }

    // 先尝试 FAQ 匹配
    const faq = this.handleFAQ(message);
    if (faq) {
      this.history.push({ role: 'user', content: message });
      this.history.push({ role: 'assistant', content: faq });
      return { intent: 'faq', response: faq };
    }

    const intent = this.analyzeIntent(message);
    let response = '';

    // 引导学习模式：概念类和求解类问题走引导流程
    if (this.currentMode === 'guided' && (intent === this.intents.CONCEPT || intent === this.intents.SOLVE)) {
      response = this.handleGuidedConcept(message, intent);
      this.history.push({ role: 'user', content: message });
      this.history.push({ role: 'assistant', content: response });
      return { intent: 'guided', response };
    }

    switch (intent) {
      case this.intents.GREETING: response = this.handleGreeting(); break;
      case this.intents.HELP:     response = this.handleHelp();     break;
      case this.intents.CALCULATE: response = this.handleCalculate(message); break;
      case this.intents.SOLVE:    response = this.handleSolve(message);    break;
      case this.intents.EXAMPLE:  response = this.handleExample(message);  break;
      case this.intents.FORMULA:  response = this.handleFormula(message);  break;
      case this.intents.PITFALL:  response = this.handlePitfall(message);  break;
      case this.intents.COMPARISON: response = this.handleComparison(message); break;
      default: response = this.handleConcept(message);
    }

    // 分步讲解模式：概念类回答补充更详细的推导说明
    if (this.currentMode === 'detailed' && intent === this.intents.CONCEPT) {
      // detailed 模式下 handleConcept 已通过 formatSourceBadge 标注
    }

    this.history.push({ role: 'user', content: message });
    this.history.push({ role: 'assistant', content: response });
    return { intent, response };
  },

  /**
   * 引导学习模式：不直接给答案，先问用户想用哪种方法
   */
  handleGuidedConcept(message, intent) {
    const search = KnowledgeBase.searchWithScore(message);
    const { bestMatch, results } = search;

    if (!bestMatch || search.confidence < 0.1) {
      return this.handleUnknownQuery(message, results);
    }

    const section = bestMatch.section;
    const chapter = bestMatch.chapter;

    // 根据知识点生成方法选择
    const methodMap = {
      'matrix-rank': ['初等行变换法（最常用）', '子式判定法（定义法）', '从线性相关性理解'],
      'matrix-inverse': ['伴随矩阵法 A⁻¹ = A*/|A|', '初等行变换法 [A|E]→[E|A⁻¹]', '分块矩阵法'],
      'det-definition': ['二阶：主副对角线法', '三阶：沙路法/对角线法则', 'n阶：展开定理降阶'],
      'det-expansion': ['按含0最多的行展开', '按含0最多的列展开', '先化简再展开'],
      'eigenvalue': ['特征方程法 |λE-A|=0', '定义法 Ax=λx', '利用迹与行列式性质'],
      'vector-linear': ['定义法（解方程组）', '行列式法（向量个数=维数时）', '秩判定法'],
      'linear-systems': ['高斯消元法', '克莱姆法则', '矩阵求逆法'],
      'quadratic-standard': ['配方法', '正交变换法', '初等变换法'],
    };

    const methods = methodMap[section.id];

    if (methods) {
      // 存储上下文
      this.guidedContext = { section, chapter, methods, originalQuery: message };

      let response = `## 🎓 引导学习：${section.title}\n\n`;
      response += `> ${section.summary || ''}\n\n`;
      response += `我检测到你想了解 **${section.title}**。在直接给出答案之前，我想先了解你的偏好：\n\n`;
      response += `**你想用哪种方法来理解？**\n\n`;
      methods.forEach((m, i) => {
        response += `**${String.fromCharCode(65 + i)}.** ${m}\n`;
      });
      response += `\n请回复 **A**、**B** 或 **C** 选择方法，或直接描述你的思路。\n`;
      response += `\n> 💡 引导学习模式：我会在你选择后给出针对性的讲解，而不是一次性灌输所有内容。`;
      return response;
    }

    // 没有预设方法的知识点，走普通概念回答
    return this.handleConcept(message);
  },

  /**
   * 处理引导学习模式中用户的选择回复
   */
  handleGuidedReply(message) {
    if (!this.guidedContext) return null;

    const ctx = this.guidedContext;
    const msg = message.trim().toUpperCase();

    // 匹配 A/B/C 选择
    let choiceIdx = -1;
    if (/^[ABC]$/.test(msg)) {
      choiceIdx = msg.charCodeAt(0) - 65;
    } else if (/^[123]$/.test(msg)) {
      choiceIdx = parseInt(msg) - 1;
    } else {
      // 尝试模糊匹配方法名
      for (let i = 0; i < ctx.methods.length; i++) {
        const methodKey = ctx.methods[i].replace(/[（）()].*$/, '').trim();
        if (message.includes(methodKey) || methodKey.includes(message.trim())) {
          choiceIdx = i;
          break;
        }
      }
    }

    if (choiceIdx < 0 || choiceIdx >= ctx.methods.length) return null;

    const chosenMethod = ctx.methods[choiceIdx];
    const section = ctx.section;
    const chapter = ctx.chapter;

    // 清除上下文
    this.guidedContext = null;

    let response = `## 🎓 ${section.title} — ${chosenMethod}\n\n`;

    if (section.content) {
      response += section.content.trim() + '\n\n';
    }

    // 针对选择的方法给出重点提示
    response += `### 📌 你选择的「${chosenMethod}」要点\n\n`;

    // 根据选择的方法给出针对性提示
    if (section.formulas && section.formulas.length > 0) {
      response += `**关键公式：**\n`;
      section.formulas.forEach(f => response += `- ${f}\n`);
      response += '\n';
    }

    if (section.examples && section.examples.length > 0) {
      response += `**典型例题：**\n\n`;
      const ex = section.examples[0];
      response += `**例题** ${ex.q}\n\n> ${ex.a}\n\n`;
    }

    if (section.pitfalls && section.pitfalls.length > 0) {
      response += `**⚠️ 注意事项：**\n`;
      section.pitfalls.slice(0, 3).forEach(p => response += `- ${p}\n`);
      response += '\n';
    }

    response += this.formatSourceBadge('知识库检索 + 引导式讲解', chapter, section.id, 'guided');

    return response;
  },

  /**
   * 格式化知识来源标签（可追溯性）
   */
  formatSourceBadge(answerType, chapterOrQuery, sectionId, mode) {
    const sourceText = (chapterOrQuery && sectionId) ? `教材${chapterOrQuery} · ${sectionId}` : '知识库检索';
    const modeText = mode === 'guided' ? '引导学习' : (mode === 'detailed' ? '分步讲解' : '直接解答');
    return `\n---\n*依据：${sourceText} · ${modeText}*\n*本回答由知识库检索与本地可验证计算构成，计算步骤可复核。*`;
  },

  handleGreeting() {
    return `你好，我是线性代数助教。你可以直接提问，我会先给结论，再说明依据和关键步骤。

比如可以问：
- 什么是特征值？它的几何意义是什么？
- 求 [[1,2],[3,4]] 的逆矩阵
- 解方程组 x+y=3；2x-y=0

题目图片也可以直接粘贴或拖进来。`;
  },

  handleHelp() {
    return `## 📖 使用指南

### 💬 直接提问
用自然语言描述你的问题，我会基于知识库给出有依据的回答：
- "什么是逆矩阵？"
- "矩阵的秩怎么求？"
- "克莱姆法则是什么？"
- "特征值和特征向量怎么求？"
- "相似矩阵的判定条件"

### 🔢 矩阵计算
输入矩阵用分号分隔行，空格或逗号分隔元素：
- "计算 [[1,2],[3,4]] 的行列式"
- "求 [[1,2,3],[4,5,6],[7,8,9]] 的秩"
- "求 [[2,1],[1,2]] 的特征值"
- "[[1,2],[3,4]] + [[5,6],[7,8]]"
- "求 [[1,2],[3,4]] 的逆矩阵"

### 📐 方程组求解
- "解方程组 2x+y=5; x-y=1"
- "求解 x₁+2x₂-x₃=1; 2x₁+x₂+3x₃=0; x₁+x₂+x₃=2"

### 🖼️ 图片识别
点击输入框左侧的 📎 按钮，上传题目图片，我会自动识别并处理。

### 💡 学习建议
- 看到新概念用"知识体系"查定义
- 公式不会用"公式速查"
- 不会做题用"练习题库"
- 计算不确定用"计算工具"`;
  },

  handleCalculate(message) {
    // 预处理：统一矩阵输入格式
    const normalized = message
      .replace(/，/g, ',').replace(/；/g, ';')
      .replace(/\]\s*,\s*\[/g, ';');  // [[1,2],[3,4]] → [[1,2;3,4]]

    const matrixPattern = /(?:\[+|\|)?\s*((?:[\-]?[\d\.]+[\s,]*)+(?:[;\n]\s*(?:[\-]?[\d\.]+[\s,]*)+)*)\s*(?:\]+|\|)?/g;
    const matches = [...normalized.matchAll(matrixPattern)];

    const matrices = [];
    for (const m of matches) {
      try {
        const cleaned = m[1].trim();
        const matrix = LinAlg.parseMatrix(cleaned);
        if (matrix.length > 0 && matrix[0].length > 0) {
          matrices.push(matrix);
        }
      } catch (e) { /* skip */ }
    }

    if (matrices.length === 0) {
      try {
        const cleaned = normalized.replace(/[^0-9\-\.;\s,\[\]]/g, ' ').trim();
        const parts = cleaned.match(/[\d\-\.][\d\s,;\-\.]*[\d\]]/g);
        if (parts) {
          for (const p of parts) {
            try { matrices.push(LinAlg.parseMatrix(p)); } catch(e) {}
          }
        }
      } catch(e) {}
    }

    if (matrices.length === 0) {
      return '我没有检测到矩阵输入。请用以下格式输入矩阵：\n\n`1 2; 3 4` 或 `[[1,2],[3,4]]`\n\n例如：计算 1 2; 3 4 的行列式';
    }

    const msg = message.toLowerCase();
    // 关键词判定用的文本：先剔除矩阵内容，否则矩阵里的负号/星号会被误当成减/乘关键词
    const msgNoMat = msg.replace(/\[\[[\s\S]*?\]\]/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    let result = '';
    const m = matrices[0];

    if (/行列式|determinant|det\b/.test(msg)) {
      if (m.length !== m[0].length) return '⚠️ 行列式只能计算方阵（行数=列数）。';
      const det = LinAlg.determinant(m);
      result = `**计算行列式**\n\n输入矩阵：\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\n**行列式 = ${det}**\n\n${this.explainDeterminant(m, det)}`;
    }
    else if (/逆|inverse|求逆/.test(msg)) {
      if (m.length !== m[0].length) return '⚠️ 只有方阵才可能可逆。';
      try {
        const inv = LinAlg.inverse(m);
        const det = LinAlg.determinant(m);
        result = `**求逆矩阵**\n\n输入矩阵 A：\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n|A| = ${det}\n\n**A⁻¹ =**\n\`\`\`\n${LinAlg.matrixToString(inv)}\n\`\`\`\n\n**验证** A × A⁻¹ = E ✓`;
      } catch(e) {
        result = `输入矩阵：\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\n⚠️ **该矩阵不可逆**（行列式 = ${LinAlg.determinant(m)} = 0）\n\n可逆的充要条件是 |A| ≠ 0。`;
      }
    }
    else if (/秩|rank/.test(msg)) {
      const { matrix: echelon, rank } = LinAlg.rref(m, false);
      result = `**求矩阵的秩**\n\n输入矩阵：\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\n行阶梯形：\n\`\`\`\n${LinAlg.matrixToString(echelon)}\n\`\`\`\n\n**秩 r(A) = ${rank}**\n\n秩 = 行阶梯形中非零行的个数。`;
    }
    else if (/特征值|特征向量|eigen/.test(msg)) {
      if (m.length !== m[0].length) return '⚠️ 特征值只对方阵定义。';
      if (m.length > 6) return '⚠️ 矩阵维度过大，建议使用4×4以下的矩阵进行教学演示。';
      const eigs = LinAlg.eigenvalues(m);
      result = `**特征值与特征向量**\n\n输入矩阵：\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\n`;
      eigs.forEach((eig, i) => {
        result += `**特征值 λ${i+1} = ${typeof eig.value === 'number' ? eig.value.toFixed(6) : eig.value}**`;
        if (eig.multiplicity > 1) result += ` （代数重数 = ${eig.multiplicity}）`;
        result += '\n';
        if (eig.vectors && eig.vectors.length > 0) {
          result += `特征向量：\n`;
          eig.vectors.forEach((v, j) => {
            result += `  ξ${i+1}${j+1} = [${v.map(x => LinAlg.fmt(x)).join(', ')}]\n`;
          });
          if (eig.multiplicity > 1) {
            result += `几何重数 = ${eig.vectors.length}（${eig.vectors.length < eig.multiplicity ? '⚠️ 几何重数 < 代数重数，不可对角化' : '可对角化'}）\n`;
          }
        } else if (eig.isComplex) {
          result += `（复数特征值，特征向量也为复数）\n`;
        }
        result += '\n';
      });
      result += `**验证**：Σλᵢ = ${eigs.reduce((s, e) => s + (typeof e.value === 'number' ? e.value : 0), 0).toFixed(6)} = tr(A) = ${m.reduce((s, r, i) => s + r[i], 0).toFixed(6)} ✓`;
    }
    else if (/转置|transpose/.test(msg)) {
      const t = LinAlg.transpose(m);
      result = `**矩阵转置**\n\nA =\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\nAᵀ =\n\`\`\`\n${LinAlg.matrixToString(t)}\n\`\`\``;
    }
    else if (/伴随|adjugate|adjoint/.test(msg)) {
      if (m.length !== m[0].length) return '⚠️ 伴随矩阵只对方阵定义。';
      const adj = LinAlg.adjugate(m);
      result = `**伴随矩阵**\n\nA =\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\nA* =\n\`\`\`\n${LinAlg.matrixToString(adj)}\n\`\`\`\n\n|A| = ${LinAlg.determinant(m)}\nA⁻¹ = (1/|A|) · A*`;
    }
    else if (/加|减|\+|plus|minus/.test(msgNoMat)) {
      if (matrices.length < 2) return '矩阵加减法需要两个矩阵。请输入两个矩阵，用分号或换行分隔。';
      const subtract = /减|minus|-/.test(msgNoMat) && !/加|plus|\+/.test(msgNoMat);
      try {
        const result_m = LinAlg.add(matrices[0], matrices[1], subtract);
        result = `**矩阵${subtract ? '减' : '加'}法**\n\nA =\n\`\`\`\n${LinAlg.matrixToString(matrices[0])}\n\`\`\`\n\nB =\n\`\`\`\n${LinAlg.matrixToString(matrices[1])}\n\`\`\`\n\nA ${subtract ? '-' : '+'} B =\n\`\`\`\n${LinAlg.matrixToString(result_m)}\n\`\`\``;
      } catch(e) {
        result = `⚠️ ${e.message}`;
      }
    }
    else if (/乘|multiply|times|×|\*/.test(msgNoMat)) {
      if (matrices.length < 2) {
        const numMatch = msg.match(/(\d+\.?\d*)\s*[×*]\s*/);
        if (numMatch) {
          const k = parseFloat(numMatch[1]);
          const scaled = LinAlg.scale(m, k);
          result = `**数乘矩阵**\n\n${k} × A =\n\`\`\`\n${LinAlg.matrixToString(scaled)}\n\`\`\``;
        } else {
          return '矩阵乘法需要两个矩阵。请输入两个矩阵。';
        }
      } else {
        try {
          const product = LinAlg.multiply(matrices[0], matrices[1]);
          result = `**矩阵乘法**\n\nA =\n\`\`\`\n${LinAlg.matrixToString(matrices[0])}\n\`\`\`\n\nB =\n\`\`\`\n${LinAlg.matrixToString(matrices[1])}\n\`\`\`\n\nA × B =\n\`\`\`\n${LinAlg.matrixToString(product)}\n\`\`\`\n\n💡 注意：矩阵乘法不满足交换律，AB ≠ BA（一般情况）`;
        } catch(e) {
          result = `⚠️ ${e.message}`;
        }
      }
    }
    else {
      const isSquare = m.length === m[0].length;
      result = `**矩阵分析**\n\n输入矩阵 (${m.length}×${m[0].length})：\n\`\`\`\n${LinAlg.matrixToString(m)}\n\`\`\`\n\n`;
      const rank = LinAlg.rank(m);
      result += `- **秩** r(A) = ${rank}\n`;
      if (isSquare) {
        result += `- **行列式** |A| = ${LinAlg.determinant(m)}\n`;
        result += `- **迹** tr(A) = ${m.reduce((s, r, i) => s + r[i], 0)}\n`;
        result += `- **可逆性**：${Math.abs(LinAlg.determinant(m)) < 1e-10 ? '不可逆（|A|=0）' : '可逆（|A|≠0）'}\n`;
        if (m.length <= 4) {
          result += `- **转置**：\n\`\`\`\n${LinAlg.matrixToString(LinAlg.transpose(m))}\n\`\`\`\n`;
        }
      }
      result += `\n你可以指定操作：行列式、逆矩阵、秩、特征值、转置、伴随矩阵等。`;
    }

    // 添加知识来源标签
    result += this.formatSourceBadge('确定性计算引擎', null, null, this.currentMode);

    return result;
  },

  explainDeterminant(m, det) {
    let explanation = '';
    if (m.length === 2) {
      explanation = `对于二阶矩阵，|A| = a₁₁×a₂₂ - a₁₂×a₂₁ = ${m[0][0]}×${m[1][1]} - ${m[0][1]}×${m[1][0]} = ${det}`;
    } else if (m.length === 3) {
      explanation = `对于三阶矩阵，使用沙路法（对角线法则）计算。`;
    }
    if (Math.abs(det) < 1e-10) {
      explanation += '\n\n⚠️ **行列式为0**，意味着矩阵不可逆，行/列向量线性相关。';
    } else {
      explanation += `\n\n行列式的绝对值 |det| = ${Math.abs(det)} 表示线性变换后面积的缩放倍数（2D）或体积的缩放倍数（3D）。`;
    }
    return explanation;
  },

  handleSolve(message) {
    // 白名单需保留 y/z，否则多元方程组在解析前就丢掉了未知数
    const equationStr = message.replace(/[^0-9xXyYzZ₁₂₃₄₅₆₇₈₉+\-=;,.*\s]/g, '');
    const equations = equationStr.split(/[;；\n]/).map(e => e.trim()).filter(e => e);

    if (equations.length === 0) {
      return '请输入方程组，例如：\n\n`解方程组 x+y=3; 2x-y=0`';
    }

    // 第一遍：解析所有方程的所有项，收集变量下标（未知数个数 = 最大下标 + 1，而不是方程个数）
    const parsedRaw = [];
    let maxIdx = -1;
    for (const eq of equations) {
      const parts = eq.split('=');
      if (parts.length !== 2) continue;
      const lhs = parts[0].trim();
      const rhs = parseFloat(parts[1].trim()) || 0;

      const items = [];
      const terms = lhs.match(/[+-]?\s*\d*\.?\d*\s*\*?\s*[a-z]_?[₁₂₃₄₅₆₇₈₉\d]?/gi) || [];
      for (let i = 0; i < terms.length; i++) {
        let term = terms[i].replace(/\s/g, '');
        if (!term) continue;

        let sign = 1;
        if (term[0] === '+') { term = term.slice(1); }
        else if (term[0] === '-') { sign = -1; term = term.slice(1); }

        const match = term.match(/^(\d*\.?\d*)\*?(.*)$/);
        if (!match) continue;

        const coeffStr = match[1];
        const varName = match[2].toLowerCase().replace('_', '');

        let coeff = coeffStr === '' ? 1 : parseFloat(coeffStr);
        coeff *= sign;

        let idx = -1;
        if (varName.match(/x[₁₂₃₄₅₆₇₈₉\d]?/)) {
          const sub = varName.match(/[₁₂₃₄₅₆₇₈₉\d]/);
          if (sub) {
            const subMap = {'₁':0,'₂':1,'₃':2,'₄':3,'₅':4,'₆':5,'₇':6,'₈':7,'₉':8};
            idx = subMap[sub[0]] !== undefined ? subMap[sub[0]] : parseInt(sub[0]) - 1;
          } else {
            idx = 0;
          }
        } else if (varName === 'x') idx = 0;
        else if (varName === 'y') idx = 1;
        else if (varName === 'z') idx = 2;

        if (idx >= 0) {
          items.push({ idx, coeff });
          if (idx > maxIdx) maxIdx = idx;
        }
      }
      parsedRaw.push({ items, rhs });
    }

    if (parsedRaw.length === 0) {
      return '无法解析方程组。请使用格式：`x+y=3; 2x-y=0`';
    }

    // 第二遍：每行系数数组统一长度为 n（未知数个数），缺项补 0
    const n = maxIdx + 1;
    const parsed = parsedRaw.map(p => {
      const coeffs = new Array(n).fill(0);
      p.items.forEach(it => { coeffs[it.idx] += it.coeff; });
      return { coeffs, rhs: p.rhs };
    });

    const A = parsed.map(p => p.coeffs);
    const b = parsed.map(p => p.rhs);

    const result = LinAlg.solveLinearSystem(A, b);

    let output = `**求解线性方程组**\n\n方程组：\n`;
    equations.forEach((eq, i) => {
      output += `  ${eq}\n`;
    });
    output += `\n系数矩阵 A：\n\`\`\`\n${LinAlg.matrixToString(A)}\n\`\`\`\n\n常数向量 b = [${b.join(', ')}]\n\n`;

    output += `**高斯消元过程：**\n\n`;
    result.steps.forEach((step, i) => {
      output += `步骤${i + 1}：${step.desc}\n`;
      output += `\`\`\`\n${LinAlg.matrixToString(step.matrix)}\n\`\`\`\n\n`;
    });

    output += `**解的情况：**\n${result.message}\n\n`;

    if (result.type === 'unique') {
      output += `**唯一解：**\n`;
      result.solution.forEach((v, i) => {
        output += `  x${i + 1} = ${LinAlg.fmt(v)}\n`;
      });
      output += `\n解向量 x = [${result.solution.map(v => LinAlg.fmt(v)).join(', ')}]`;
    } else if (result.type === 'infinite') {
      output += `**通解：**\n\n`;
      output += `特解：η = [${result.particular.map(v => LinAlg.fmt(v)).join(', ')}]\n\n`;
      output += `基础解系：\n`;
      result.basis.forEach((v, i) => {
        output += `  ξ${i + 1} = [${v.map(x => LinAlg.fmt(x)).join(', ')}]\n`;
      });
      output += `\n通解：x = η + ${result.basis.map((_, i) => `c${i + 1}ξ${i + 1}`).join(' + ')}`;
      output += `\n（其中 ${result.basis.map((_, i) => `c${i + 1}`).join(', ')} 为任意常数）`;
    } else {
      output += `⚠️ 方程组无解。增广矩阵的秩 (${result.rankAb}) 大于系数矩阵的秩 (${result.rankA})。`;
    }

    return output;
  },

  /**
   * 基于知识库的结构化概念回答
   */
  handleConcept(message) {
    // 优先匹配概念辨析库（即使意图被识别为 concept）
    const cmp = this.matchComparison(message);
    if (cmp) {
      return this.formatComparison(cmp);
    }

    const search = KnowledgeBase.searchWithScore(message);
    const { results, bestMatch, confidence } = search;

    if (!bestMatch || confidence < 0.1) {
      return this.handleUnknownQuery(message, results);
    }

    const section = bestMatch.section;
    const chapter = bestMatch.chapter;
    const isMultiple = results.length > 1 && results[0].score - results[1].score < 5;

    let response = `## 📘 ${section.title}\n\n`;
    if (section.summary) {
      response += `> ${section.summary}\n\n`;
    }

    if (section.content) {
      response += section.content.trim() + '\n\n';
    }

    if (section.formulas && section.formulas.length > 0) {
      response += `### 📐 关键公式\n`;
      section.formulas.forEach(f => response += `- ${f}\n`);
      response += '\n';
    }

    if (section.examples && section.examples.length > 0) {
      response += `### 💡 典型例题\n`;
      section.examples.slice(0, 3).forEach((ex, i) => {
        response += `**例${i+1}** ${ex.q}\n\n> ${ex.a}\n\n`;
      });
    }

    if (section.pitfalls && section.pitfalls.length > 0) {
      response += `### ⚠️ 常见误区\n`;
      section.pitfalls.slice(0, 4).forEach(p => response += `- ${p}\n`);
      response += '\n';
    }

    if (results.length > 1 && isMultiple) {
      response += `### 🔗 相关知识点\n`;
      results.slice(1, 4).forEach(r => {
        response += `- **${r.section.title}** （${r.chapter}）\n`;
      });
      response += '\n';
    }

    response += this.formatSourceBadge('知识库检索 + AI 讲解', chapter, section.id, this.currentMode);
    response += `\n*匹配度: ${(confidence*100).toFixed(0)}%*`;

    return response;
  },

  /**
   * 未匹配到的提问
   */
  handleUnknownQuery(message, nearbyResults = []) {
    const related = (nearbyResults || []).slice(0, 3)
      .map(r => `${r.section.title}（${r.chapter}）`)
      .join('、');
    let response = `这个问题我暂时没有找到可以直接引用的知识库内容，不想凭空猜测。`;
    if (related) response += `\n\n目前和它最接近的是：${related}。`;
    response += `\n\n你可以把问题说得更具体一些，例如「特征值的定义」或「矩阵的秩怎么求」；也可以到知识体系里浏览完整章节，或上传题目图片，我来尝试识别。`;
    return response;
  },

  handleExample(message) {
    const cmp = this.matchComparison(message);
    if (cmp && cmp.content.typical) {
      return this.formatComparison(cmp, '典型例题');
    }

    const search = KnowledgeBase.searchWithScore(message);
    const { bestMatch, results } = search;
    if (!bestMatch) {
      return `## 💡 我没有找到相关例题\n\n请指定一个具体知识点，比如：\n- "行列式" + 例题\n- "特征值" + 例题\n- "矩阵的秩" + 例题\n\n或切换到"练习题库"查看 142 道分类例题。`;
    }

    const candidates = results.filter(r => r.section.examples && r.section.examples.length > 0);
    if (candidates.length === 0) {
      return `**${bestMatch.section.title}** 暂无配套例题。可查看知识体系页的"${bestMatch.section.title}"获取理论讲解。`;
    }

    let response = `## 💡 ${bestMatch.section.title} - 典型例题\n\n`;
    candidates.slice(0, 3).forEach((c, idx) => {
      response += `### 📖 ${c.section.title}\n`;
      c.section.examples.slice(0, 2).forEach((ex, i) => {
        response += `**例${idx*2+i+1}** ${ex.q}\n\n`;
        response += `> ${ex.a}\n\n`;
      });
    });

    if (candidates.length > 1) {
      response += `### 🔗 还可参考\n`;
      candidates.slice(1, 3).forEach(c => response += `- ${c.section.title}（${c.chapter}）\n`);
    }
    return response;
  },

  handleFormula(message) {
    for (const topic in this.formulaCheatsheet) {
      if (message.includes(topic)) {
        const formulas = this.formulaCheatsheet[topic];
        let response = `## 📐 ${topic} - 核心公式速查\n\n`;
        formulas.forEach((f, i) => {
          response += `**${i+1}. ${f.name}**\n\n`;
          response += `> $${f.latex}$\n\n`;
        });
        response += `---\n*📍 来源：公式速查表*\n\n`;
        response += `💡 在侧栏切换"知识体系"可看到每个公式的详细推导。`;
        return response;
      }
    }

    const search = KnowledgeBase.searchWithScore(message);
    const { bestMatch } = search;
    if (!bestMatch || !bestMatch.section.formulas || bestMatch.section.formulas.length === 0) {
      return `## 📐 我没有找到相关公式\n\n请指定一个具体知识点，比如"特征值"、"行列式"、"向量内积"等。`;
    }

    let response = `## 📐 ${bestMatch.section.title} - 关键公式\n\n`;
    bestMatch.section.formulas.forEach((f, i) => response += `${i+1}. ${f}\n`);
    response += `\n*📍 来源：${bestMatch.chapter}*`;
    return response;
  },

  handlePitfall(message) {
    const search = KnowledgeBase.searchWithScore(message);
    const { bestMatch, results } = search;
    if (!bestMatch) {
      return `## ⚠️ 我没有找到相关易错点\n\n请指定一个具体知识点，比如"行列式易错点"、"矩阵乘法的陷阱"等。`;
    }

    const withPitfalls = results.filter(r => r.section.pitfalls && r.section.pitfalls.length > 0);

    let response = `## ⚠️ ${bestMatch.section.title} - 易错点\n\n`;
    withPitfalls.slice(0, 3).forEach((c, idx) => {
      response += `### ${idx === 0 ? '⭐ ' : ''}${c.section.title}\n`;
      c.section.pitfalls.forEach(p => response += `- ${p}\n`);
      response += '\n';
    });
    response += `---\n*📍 来源：${bestMatch.chapter}*\n\n`;
    response += `💡 切换到"测试中心"可针对易错点专项练习。`;
    return response;
  },

  /**
   * 概念辨析：精确匹配概念辨析库
   */
  handleComparison(message) {
    const cmp = this.matchComparison(message);
    if (cmp) {
      return this.formatComparison(cmp);
    }
    return this.handleConcept(message);
  },

  /**
   * 匹配概念辨析关键词
   */
  matchComparison(message) {
    for (const key in this.comparisons) {
      if (message.includes(key)) {
        return this.comparisons[key];
      }
    }
    return null;
  },

  /**
   * 格式化概念辨析输出
   */
  formatComparison(cmp, focus = null) {
    let response = `## ${cmp.icon} ${cmp.title}\n\n`;
    if (cmp.content.definition) {
      response += `> ${cmp.content.definition}\n\n`;
    }

    response += `### 📋 详细对比\n\n`;
    response += `| 概念 | 描述 | 条件 | 含义 |\n`;
    response += `|------|------|------|------|\n`;
    cmp.content.items.forEach(item => {
      response += `| **${item.name}** | ${item.desc} | ${item.condition} | ${item.meaning} |\n`;
    });
    response += '\n';

    if (cmp.content.relationships && cmp.content.relationships.length > 0) {
      response += `### 🔗 关系与判定\n`;
      cmp.content.relationships.forEach(r => response += `- ${r}\n`);
      response += '\n';
    }

    if (focus !== '典型例题' && cmp.content.typical) {
      response += `### 💡 典型应用\n`;
      response += `${cmp.content.typical}\n\n`;
    }

    response += `---\n*📍 来源：${cmp.source} · 置信度: ${cmp.confidence}*`;
    return response;
  },

  /**
   * 处理常见问题快捷查询
   */
  handleFAQ(message) {
    for (const faq of this.faqDatabase) {
      for (const kw of faq.keywords) {
        if (message.includes(kw)) {
          return faq.answer;
        }
      }
    }
    return null;
  },

  clearHistory() {
    this.history = [];
  }
};
