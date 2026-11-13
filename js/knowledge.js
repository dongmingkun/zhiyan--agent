/**
 * 线性代数知识库
 * 涵盖本科线性代数核心知识体系，结构化组织
 * 每个知识点包含：标题、摘要、详细讲解、关键公式、典型例题、常见误区
 */

const KnowledgeBase = {
  chapters: [
    {
      id: "ch1",
      title: "第一章 行列式",
      icon: "📊",
      sections: [
        {
          id: "det-definition",
          title: "行列式的定义",
          keywords: ["行列式", "定义", "逆序数", "n阶行列式", "二阶", "三阶"],
          summary: "行列式是一个由n²个数排列成n行n列的方阵所确定的数，记作det(A)或|A|。",
          content: `
## 行列式的定义

### 二阶行列式
对于2×2矩阵 A = [[a₁₁, a₁₂], [a₂₁, a₂₂]]，其行列式为：
**|A| = a₁₁·a₂₂ - a₁₂·a₂₁**

这是主对角线元素乘积减去副对角线元素乘积。

### 三阶行列式（沙路法/对角线法则）
对于3×3矩阵，行列式为：
**|A| = a₁₁a₂₂a₃₃ + a₁₂a₂₃a₃₁ + a₁₃a₂₁a₃₂ - a₁₃a₂₂a₃₁ - a₁₂a₂₁a₃₃ - a₁₁a₂₃a₃₂**

### n阶行列式
n阶行列式 D = Σ (-1)^t · a₁ₚ₁ · a₂ₚ₂ · ... · aₙₚₙ
其中 p₁p₂...pₙ 是1,2,...,n 的一个排列，t 是该排列的逆序数，求和遍历所有排列（共n!项）。

### 逆序数
在一个排列中，如果前面的数大于后面的数，就称为一个逆序。排列中逆序的总数称为逆序数，记作 τ(p₁p₂...pₙ)。

**示例**：排列 3142 中，3>1, 3>2, 4>2 共3个逆序，τ(3142)=3。
          `,
          formulas: [
            "二阶：|A| = a₁₁a₂₂ - a₁₂a₂₁",
            "三阶（沙路法）：主对角线方向乘积之和 - 副对角线方向乘积之和",
            "n阶：D = Σ(-1)^τ · a₁ₚ₁a₂ₚ₂···aₙₚₙ"
          ],
          examples: [
            {
              q: "计算 |3 1; 2 4| 的行列式",
              a: "|A| = 3×4 - 1×2 = 12 - 2 = 10"
            },
            {
              q: "计算三阶行列式 |1 2 3; 4 5 6; 7 8 0|",
              a: "= 1×5×0 + 2×6×7 + 3×4×8 - 3×5×7 - 2×4×0 - 1×6×8 = 0 + 84 + 96 - 105 - 0 - 48 = 27"
            }
          ],
          pitfalls: [
            "行列式只对方阵定义，非方阵没有行列式",
            "三阶对角线法则不适用于四阶及以上的行列式",
            "注意逆序数的奇偶性决定各项的符号"
          ]
        },
        {
          id: "det-properties",
          title: "行列式的性质",
          keywords: ["行列式", "性质", "转置", "行变换", "列变换", "提取公因子"],
          summary: "行列式的7条基本性质，是化简和计算行列式的重要工具。",
          content: `
## 行列式的性质

1. **转置不变性**：D^T = D（行列式与其转置行列式相等）

2. **行（列）交换变号**：互换行列式的两行（或两列），行列式变号

3. **相同行（列）为零**：如果行列式有两行（列）完全相同，则行列式等于0

4. **提取公因子**：行列式某行（列）所有元素乘以k，等于行列式乘以k
   - 即 |ka₁; a₂; ...; aₙ| = k|A|

5. **比例行（列）为零**：如果行列式某两行（列）对应元素成比例，则行列式等于0

6. **行（列）可加性**：如果某行（列）元素都是两数之和，可以拆成两个行列式之和

7. **行（列）倍加不变**：将某行（列）的k倍加到另一行（列）上，行列式值不变
   - 这是高斯消元法的理论基础
          `,
          formulas: [
            "D^T = D",
            "交换两行 → D 变号",
            "k×某行 → k×D",
            "两行成比例 → D = 0",
            "某行k倍加到另一行 → D 不变"
          ],
          examples: [
            {
              q: "已知 |A| = 5，将A的第一行乘3加到第二行，新行列式的值？",
              a: "根据性质7（倍加不变），行列式值不变，仍为5。"
            }
          ],
          pitfalls: [
            "性质4是提取某一行（列）的公因子，不是整个行列式的公因子",
            "交换两行变号，但交换奇数次变号、偶数次不变",
            "k×矩阵 与 k×行列式 的区别：kA是每个元素都乘k，|kA| = kⁿ|A|"
          ]
        },
        {
          id: "det-expansion",
          title: "行列式按行（列）展开",
          keywords: ["展开", "余子式", "代数余子式", "拉普拉斯"],
          summary: "利用代数余子式将高阶行列式降阶计算的方法。",
          content: `
## 行列式按行（列）展开

### 代数余子式
在n阶行列式D中，划去元素aᵢⱼ所在的第i行和第j列，剩下的(n-1)阶行列式称为aᵢⱼ的**余子式**，记作Mᵢⱼ。

**代数余子式**：Aᵢⱼ = (-1)^(i+j) · Mᵢⱼ

### 展开定理
行列式等于它的任一行（列）各元素与其对应代数余子式的乘积之和：
**D = aᵢ₁Aᵢ₁ + aᵢ₂Aᵢ₂ + ... + aᵢₙAᵢₙ**（按第i行展开）
**D = a₁ⱼA₁ⱼ + a₂ⱼA₂ⱼ + ... + aₙⱼAₙⱼ**（按第j列展开）

### 重要推论
行列式某行（列）元素与另一行（列）对应元素的代数余子式乘积之和为0：
aᵢ₁Aⱼ₁ + aᵢ₂Aⱼ₂ + ... + aᵢₙAⱼₙ = 0 （i ≠ j）

### 计算策略
1. 利用性质7（倍加不变）将某行（列）化出尽可能多的0
2. 选择0最多的行（列）展开
3. 递归降阶直到化为二阶或三阶
          `,
          formulas: [
            "代数余子式：Aᵢⱼ = (-1)^(i+j) · Mᵢⱼ",
            "按第i行展开：D = Σⱼ aᵢⱼAᵢⱼ",
            "按第j列展开：D = Σᵢ aᵢⱼAᵢⱼ",
            "异行余子式：Σⱼ aᵢⱼAₖⱼ = 0 (i≠k)"
          ],
          examples: [
            {
              q: "按第一行展开 |1 0 3; 2 1 0; 0 2 1|",
              a: "D = 1×A₁₁ + 0×A₁₂ + 3×A₁₃ = 1×(1-0) + 0 + 3×(4-0) = 1 + 12 = 13"
            }
          ],
          pitfalls: [
            "代数余子式的符号 (-1)^(i+j) 容易遗漏",
            "展开时应选择含0最多的行或列以简化计算",
            "展开定理的推论（异行余子式为0）在求逆矩阵时会用到"
          ]
        },
        {
          id: "det- cramers",
          title: "克莱姆法则",
          keywords: ["克莱姆", "cramer", "线性方程组", "行列式求解"],
          summary: "利用行列式求解n元线性方程组的方法。",
          content: `
## 克莱姆法则

对于n元线性方程组：
a₁₁x₁ + a₁₂x₂ + ... + a₁ₙxₙ = b₁
a₂₁x₁ + a₂₂x₂ + ... + a₂ₙxₙ = b₂
...
aₙ₁x₁ + aₙ₂x₂ + ... + aₙₙxₙ = bₙ

如果系数行列式 D ≠ 0，则方程组有唯一解：
**xⱼ = Dⱼ / D** (j = 1, 2, ..., n)

其中 Dⱼ 是将D的第j列替换为常数列 b₁, b₂, ..., bₙ 后得到的行列式。

### 适用条件
- 方程个数 = 未知数个数（n个方程n个未知数）
- 系数行列式 D ≠ 0

### 局限性
- 计算量大（需要计算n+1个n阶行列式）
- 当D = 0时无法判断是无解还是有无穷多解
- 实际计算中不如高斯消元法高效
          `,
          formulas: [
            "xⱼ = Dⱼ / D",
            "D = 系数矩阵的行列式",
            "Dⱼ = 将系数矩阵第j列替换为常数列后的行列式"
          ],
          examples: [
            {
              q: "用克莱姆法则求解：x + y = 3, 2x - y = 0",
              a: "D = |1 1; 2 -1| = -1-2 = -3; D₁ = |3 1; 0 -1| = -3; D₂ = |1 3; 2 0| = -6; x = D₁/D = 1, y = D₂/D = 2"
            }
          ],
          pitfalls: [
            "克莱姆法则只适用于D≠0的情况",
            "计算Dⱼ时只能替换第j列，其余列不变",
            "实际工程中不推荐使用，计算复杂度为O(n·n!)"
          ]
        }
      ]
    },
    {
      id: "ch2",
      title: "第二章 矩阵",
      icon: "🔢",
      sections: [
        {
          id: "matrix-definition",
          title: "矩阵的定义",
          keywords: ["矩阵", "定义", "是什么", "m×n", "元素", "方阵", "行", "列", "单位矩阵", "对角矩阵", "零矩阵"],
          summary: "矩阵是由m×n个数排列成的m行n列的数表，是线性代数的核心研究对象。",
          content: `
## 矩阵的定义

### 什么是矩阵
由 $m \\times n$ 个数 $a_{ij}$（$i=1,2,...,m$；$j=1,2,...,n$）排成的 $m$ 行 $n$ 列的数表，称为 **$m \\times n$ 矩阵**，记作：

$$A = \\begin{pmatrix} a_{11} & a_{12} & \\cdots & a_{1n} \\ a_{21} & a_{22} & \\cdots & a_{2n} \\ \\vdots & \\vdots & \\ddots & \\vdots \\ a_{m1} & a_{m2} & \\cdots & a_{mn} \\end{pmatrix}$$

简记为 $A = (a_{ij})_{m \\times n}$ 或 $A_{m \\times n}$。

### 矩阵的表示
- **元素**：$a_{ij}$ 表示位于第 $i$ 行第 $j$ 列的元素
- **行向量**：矩阵的每一行可看作一个 $n$ 维行向量
- **列向量**：矩阵的每一列可看作一个 $m$ 维列向量

### 特殊矩阵

| 名称 | 定义 | 记号 |
|------|------|------|
| **方阵** | 行数=列数的矩阵（$n \\times n$） | $A_n$ |
| **零矩阵** | 所有元素都为0的矩阵 | $O$ |
| **单位矩阵** | 主对角线元素为1，其余为0的方阵 | $E$ 或 $I$ |
| **对角矩阵** | 非主对角线元素全为0的方阵 | $\\text{diag}(\\lambda_1, ..., \\lambda_n)$ |
| **数量矩阵** | 主对角线元素全相等的对角矩阵 | $kE$ |
| **上三角矩阵** | 主对角线下方元素全为0 | — |
| **下三角矩阵** | 主对角线上方元素全为0 | — |
| **对称矩阵** | $A^T = A$ | — |
| **反对称矩阵** | $A^T = -A$ | — |

### 矩阵与行列式的区别
- **矩阵**是一个数表，行数和列数可以不相等
- **行列式**是一个数，只能由方阵计算得到
          `,
          formulas: [
            "矩阵记法：A = (a_{ij})_{m\\times n}",
            "单位矩阵 E：对角线为1，其余为0",
            "对角矩阵 diag(\\lambda_1,...,\\lambda_n)"
          ],
          examples: [
            {
              q: "写出 2\\times3 矩阵的例子",
              a: "A = [[1,2,3],[4,5,6]] 是一个2行3列的矩阵"
            },
            {
              q: "判断下列矩阵的类型：[[1,0],[0,1]]",
              a: "这是2阶单位矩阵 E_2，同时也是对角矩阵和对称矩阵"
            }
          ],
          pitfalls: [
            "矩阵和行列式不同：矩阵是数表，行列式是数值",
            "只有方阵才有行列式",
            "零矩阵 O 与数字 0 不同，零矩阵有维度"
          ]
        },
        {
          id: "matrix-operations",
          title: "矩阵的运算",
          keywords: ["矩阵", "加法", "乘法", "转置", "数乘", "运算"],
          summary: "矩阵的加法、数乘、乘法、转置等基本运算及其性质。",
          content: `
## 矩阵的运算

### 矩阵加法
两个同型矩阵（行数和列数分别相同）对应元素相加。
(A + B)ᵢⱼ = aᵢⱼ + bᵢⱼ

### 数乘矩阵
数k乘矩阵A，等于k乘以A的每个元素。
(kA)ᵢⱼ = k · aᵢⱼ

**注意**：kA ≠ kaᵢⱼ（前者是整个矩阵乘k，后者是单个元素乘k）

### 矩阵乘法
A是m×n矩阵，B是n×p矩阵，则C = AB是m×p矩阵：
cᵢⱼ = Σₖ aᵢₖ · bₖⱼ （A的第i行与B的第j列的点积）

**关键条件**：A的列数 = B的行数

### 矩阵乘法的性质
1. 结合律：(AB)C = A(BC)
2. 左分配律：A(B+C) = AB + AC
3. 右分配律：(A+B)C = AC + BC
4. k(AB) = (kA)B = A(kB)
5. **不满足交换律**：AB ≠ BA（一般情况下）
6. **AB = 0 不推导 A = 0 或 B = 0**（零因子问题）

### 矩阵的转置
将矩阵的行和列互换。
(A^T)ᵢⱼ = aⱼᵢ

性质：
1. (A^T)^T = A
2. (A+B)^T = A^T + B^T
3. (kA)^T = kA^T
4. **(AB)^T = B^T A^T**（顺序反转）
          `,
          formulas: [
            "加法：(A+B)ᵢⱼ = aᵢⱼ + bᵢⱼ（需同型）",
            "乘法：cᵢⱼ = Σₖ aᵢₖbₖⱼ（A列数=B行数）",
            "转置：(AB)^T = B^T A^T",
            "数乘：(kA)ᵢⱼ = k·aᵢⱼ"
          ],
          examples: [
            {
              q: "计算 A×B，其中 A=[[1,2],[3,4]], B=[[5,6],[7,8]]",
              a: "AB = [[1×5+2×7, 1×6+2×8],[3×5+4×7, 3×6+4×8]] = [[19,22],[43,50]]"
            },
            {
              q: "验证 AB ≠ BA，A=[[1,0],[0,0]], B=[[0,1],[0,0]]",
              a: "AB = [[0,1],[0,0]], BA = [[0,0],[0,0]]，显然AB ≠ BA"
            }
          ],
          pitfalls: [
            "矩阵乘法不满足交换律：AB ≠ BA",
            "矩阵乘法不满足消去律：AB = AC 且 A≠0 不推导 B = C",
            "AB = 0 不推导 A = 0 或 B = 0",
            "矩阵乘法要求前一个的列数等于后一个的行数"
          ]
        },
        {
          id: "matrix-inverse",
          title: "逆矩阵",
          keywords: ["逆矩阵", "可逆", "伴随矩阵", "求逆", "初等变换"],
          summary: "逆矩阵的定义、判定条件及求逆方法。",
          content: `
## 逆矩阵

### 定义
对于n阶方阵A，如果存在n阶方阵B，使得 AB = BA = E（单位矩阵），则称A可逆，B称为A的逆矩阵，记作A⁻¹。

逆矩阵是唯一的。

### 可逆的充要条件
**A可逆 ⟺ |A| ≠ 0**

### 求逆方法一：伴随矩阵法
A⁻¹ = (1/|A|) · A*

其中 A* 是A的伴随矩阵，A* = (Aᵢⱼ)^T（代数余子式矩阵的转置）。

### 求逆方法二：初等行变换法
[A | E] → 初等行变换 → [E | A⁻¹]

将增广矩阵 [A|E] 通过初等行变换化为 [E|A⁻¹]。

### 逆矩阵的性质
1. (A⁻¹)⁻¹ = A
2. (AB)⁻¹ = B⁻¹A⁻¹（顺序反转）
3. (A^T)⁻¹ = (A⁻¹)^T
4. (kA)⁻¹ = (1/k)A⁻¹
5. |A⁻¹| = 1/|A|
6. A可逆 ⟺ A的行列式不为0 ⟺ A的行向量（列向量）线性无关
          `,
          formulas: [
            "A⁻¹ = (1/|A|) · A*",
            "A*ᵢⱼ = Aⱼᵢ（代数余子式的转置）",
            "(AB)⁻¹ = B⁻¹A⁻¹",
            "|A⁻¹| = 1/|A|"
          ],
          examples: [
            {
              q: "求 A = [[1,2],[3,4]] 的逆矩阵",
              a: "|A| = 4-6 = -2; A* = [[4,-2],[-3,1]]; A⁻¹ = (1/-2)×[[4,-2],[-3,1]] = [[-2,1],[1.5,-0.5]]"
            }
          ],
          pitfalls: [
            "只有方阵才可能可逆",
            "逆矩阵的唯一性：如果可逆，逆矩阵唯一",
            "(AB)⁻¹ = B⁻¹A⁻¹ 不是 A⁻¹B⁻¹（顺序要反）",
            "伴随矩阵是代数余子式的转置，容易搞错行列"
          ]
        },
        {
          id: "matrix-rank",
          title: "矩阵的秩",
          keywords: ["秩", "rank", "行秩", "列秩", "初等变换", "阶梯形"],
          summary: "矩阵的秩的定义、性质及求法。",
          content: `
## 矩阵的秩

### 定义
矩阵A的秩 r(A) 是A中非零子式的最高阶数。
等价地，r(A) = A的行向量组的秩 = A的列向量组的秩（行秩=列秩）。

### 求秩方法
通过初等行变换将矩阵化为**行阶梯形**，非零行的行数就是矩阵的秩。

### 秩的性质
1. 0 ≤ r(A) ≤ min(m, n)
2. r(A^T) = r(A)
3. r(A) = r(A^T A) = r(AA^T)
4. r(AB) ≤ min(r(A), r(B))
5. 若A可逆，则 r(AB) = r(B) = r(BA)
6. r(A+B) ≤ r(A) + r(B)
7. **Sylvester不等式**：r(AB) ≥ r(A) + r(B) - n（A为m×n，B为n×p）
8. r(A) = n ⟺ |A| ≠ 0 ⟺ A可逆（对方阵而言）

### 行阶梯形矩阵特征
1. 每个非零行的首个非零元素（主元）下方全为0
2. 全零行在非零行下方
3. 主元逐行右移
          `,
          formulas: [
            "r(A) = 行秩 = 列秩",
            "r(AB) ≤ min(r(A), r(B))",
            "r(A+B) ≤ r(A) + r(B)",
            "方阵可逆 ⟺ r(A) = n"
          ],
          examples: [
            {
              q: "求 A = [[1,2,3],[4,5,6],[7,8,9]] 的秩",
              a: "行变换：R2-4R1, R3-7R1 → [[1,2,3],[0,-3,-6],[0,-6,-12]] → R3-2R2 → [[1,2,3],[0,-3,-6],[0,0,0]]。非零行2行，r(A)=2。"
            }
          ],
          pitfalls: [
            "初等变换不改变矩阵的秩",
            "秩是矩阵的固有属性，与用什么方法求无关",
            "注意区分矩阵的秩和行列式的值"
          ]
        },
        {
          id: "elementary-matrix",
          title: "初等变换与初等矩阵",
          keywords: ["初等变换", "初等矩阵", "行变换", "列变换", "等价"],
          summary: "初等变换的三种类型及对应的初等矩阵。",
          content: `
## 初等变换与初等矩阵

### 初等变换（行/列）
1. **交换变换**：交换第i行（列）与第j行（列）
2. **倍乘变换**：用非零数k乘第i行（列）
3. **倍加变换**：将第i行（列）的k倍加到第j行（列）上

### 初等矩阵
对单位矩阵E进行一次初等变换得到的矩阵称为初等矩阵。

1. E(i,j)：交换E的第i行和第j行
2. E(i(k))：E的第i行乘k
3. E(i,j(k))：E的第j行加上第i行的k倍

### 重要定理
**对A进行一次初等行变换 = 左乘一个初等矩阵**
**对A进行一次初等列变换 = 右乘一个初等矩阵**

### 矩阵等价
如果A经过有限次初等变换变为B，则称A与B等价，记作 A ≅ B。
等价的充要条件：A与B同型且 r(A) = r(B)。

### 初等矩阵的性质
- 初等矩阵都是可逆的
- 初等矩阵的逆仍是同类型的初等矩阵
  - E(i,j)⁻¹ = E(i,j)
  - E(i(k))⁻¹ = E(i(1/k))
  - E(i,j(k))⁻¹ = E(i,j(-k))
          `,
          formulas: [
            "初等行变换 ⟺ 左乘初等矩阵",
            "初等列变换 ⟺ 右乘初等矩阵",
            "A ≅ B ⟺ 同型且 r(A) = r(B)",
            "初等矩阵可逆，其逆仍为初等矩阵"
          ],
          examples: [],
          pitfalls: [
            "左乘对应行变换，右乘对应列变换",
            "初等矩阵的逆仍然是初等矩阵",
            "矩阵等价 ≠ 矩阵相似 ≠ 矩阵合同"
          ]
        }
      ]
    },
    {
      id: "ch3",
      title: "第三章 向量与线性方程组",
      icon: "📐",
      sections: [
        {
          id: "vector-linear",
          title: "向量的线性相关性",
          keywords: ["线性相关", "线性无关", "线性组合", "向量组", "极大无关组"],
          summary: "向量组的线性组合、线性相关与线性无关的概念及判定方法。",
          content: `
## 向量的线性相关性

### 线性组合
向量 α₁, α₂, ..., αₛ 的线性组合：k₁α₁ + k₂α₂ + ... + kₛαₛ

### 线性相关与线性无关
- **线性相关**：存在不全为0的 k₁, k₂, ..., kₛ 使得 k₁α₁ + k₂α₂ + ... + kₛαₛ = 0
- **线性无关**：仅当 k₁ = k₂ = ... = kₛ = 0 时，k₁α₁ + k₂α₂ + ... + kₛαₛ = 0

### 判定方法
1. **定义法**：设k₁α₁ + ... + kₛαₛ = 0，解齐次方程组，若有非零解则线性相关
2. **行列式法**：s个n维向量构成方阵，行列式为0则相关，不为0则无关
3. **秩判定法**：向量组的秩 < 向量个数 → 线性相关；秩 = 向量个数 → 线性无关
4. **直观判定**：
   - 含零向量的向量组必线性相关
   - 一个非零向量线性无关
   - 两个向量线性相关 ⟺ 成比例
   - n+1个n维向量必线性相关

### 极大线性无关组
向量组T的一个子集，满足：
1. 该子集线性无关
2. T中任一向量都可由该子集线性表示
极大线性无关组中向量的个数 = 向量组的秩

### 等价向量组
两个向量组可以互相线性表示，则称它们等价。等价的向量组秩相同。
          `,
          formulas: [
            "线性相关 ⟺ r(α₁,...,αₛ) < s",
            "线性无关 ⟺ r(α₁,...,αₛ) = s",
            "极大无关组的向量个数 = 向量组的秩"
          ],
          examples: [
            {
              q: "判断 α₁=(1,1,1), α₂=(1,2,3), α₃=(1,3,6) 是否线性相关",
              a: "组成矩阵 [[1,1,1],[1,2,3],[1,3,6]]，行列式 = 1(12-9)-1(6-3)+1(3-2) = 3-3+1 = 1 ≠ 0，故线性无关。"
            }
          ],
          pitfalls: [
            "线性相关定义中是'存在不全为0'，不是'全不为0'",
            "n+1个n维向量必线性相关，但n个n维向量不一定",
            "部分相关则整体相关；整体无关则部分无关"
          ]
        },
        {
          id: "linear-systems",
          title: "线性方程组",
          keywords: ["线性方程组", "齐次", "非齐次", "高斯消元", "解的结构", "基础解系"],
          summary: "齐次与非齐次线性方程组的求解方法及解的结构理论。",
          content: `
## 线性方程组

### 解的判定定理

**齐次方程组 Ax = 0（m×n矩阵）**：
- 有非零解 ⟺ r(A) < n
- 只有零解 ⟺ r(A) = n
- 解空间的维数 = n - r(A)

**非齐次方程组 Ax = b（m×n矩阵）**：
- 无解 ⟺ r(A) < r(A|b)
- 有唯一解 ⟺ r(A) = r(A|b) = n
- 有无穷多解 ⟺ r(A) = r(A|b) < n

### 高斯消元法
1. 写出增广矩阵 [A|b]
2. 通过初等行变换化为行阶梯形
3. 判断解的情况（无解/唯一解/无穷多解）
4. 回代求解（唯一解）或写出通解（无穷多解）

### 齐次方程组的解结构
若 r(A) = r < n，则基础解系含 n - r 个向量 ξ₁, ξ₂, ..., ξₙ₋ᵣ
通解：x = c₁ξ₁ + c₂ξ₂ + ... + cₙ₋ᵣξₙ₋ᵣ

### 非齐次方程组的解结构
若 η* 是一个特解，ξ₁,...,ξₙ₋ᵣ 是对应齐次方程组的基础解系：
通解：x = η* + c₁ξ₁ + c₂ξ₂ + ... + cₙ₋ᵣξₙ₋ᵣ

### 解的性质
1. 若 ξ₁, ξ₂ 是 Ax=0 的解，则 k₁ξ₁ + k₂ξ₂ 也是解
2. 若 η₁, η₂ 是 Ax=b 的解，则 η₁ - η₂ 是 Ax=0 的解
3. 若 η 是 Ax=b 的解，ξ 是 Ax=0 的解，则 η + ξ 是 Ax=b 的解
          `,
          formulas: [
            "Ax=0 有非零解 ⟺ r(A) < n",
            "Ax=b 有解 ⟺ r(A) = r(A|b)",
            "解空间维数 = n - r(A)",
            "非齐次通解 = 特解 + 齐次通解"
          ],
          examples: [
            {
              q: "求解 x₁ + 2x₂ - x₃ = 0, 2x₁ + 4x₂ - 2x₃ = 0",
              a: "系数矩阵秩为1，n=3，基础解系含2个向量。令x₂=1,x₃=0得ξ₁=(-2,1,0)；令x₂=0,x₃=1得ξ₂=(1,0,1)。通解：x = c₁(-2,1,0) + c₂(1,0,1)"
            }
          ],
          pitfalls: [
            "非齐次方程组的解不是线性空间（不封闭于加法）",
            "基础解系不唯一，但所含向量个数唯一",
            "增广矩阵化简时只能用行变换，不能用列变换"
          ]
        }
      ]
    },
    {
      id: "ch4",
      title: "第四章 特征值与特征向量",
      icon: "⚡",
      sections: [
        {
          id: "eigenvalue",
          title: "特征值与特征向量",
          keywords: ["特征值", "特征向量", "特征方程", "特征多项式"],
          summary: "特征值与特征向量的定义、求法及性质。",
          content: `
## 特征值与特征向量

### 定义
对于n阶方阵A，如果存在数λ和非零向量x，使得 **Ax = λx**，则称λ为A的特征值，x为A的属于λ的特征向量。

### 求法
1. 写出特征方程：**|λE - A| = 0**
2. 解特征方程，求出所有特征值 λ₁, λ₂, ..., λₙ
3. 对每个特征值λᵢ，解齐次方程组 **(λᵢE - A)x = 0**，基础解系就是属于λᵢ的特征向量

### 特征多项式
f(λ) = |λE - A| = λⁿ - (trA)λⁿ⁻¹ + ... + (-1)ⁿ|A|

其中 trA = a₁₁ + a₂₂ + ... + aₙₙ（矩阵的迹）

### 重要性质
1. **特征值之和 = 迹**：λ₁ + λ₂ + ... + λₙ = trA = a₁₁ + a₂₂ + ... + aₙₙ
2. **特征值之积 = 行列式**：λ₁ · λ₂ · ... · λₙ = |A|
3. A可逆 ⟺ 所有特征值都不为0
4. 若λ是A的特征值，则：
   - λᵏ 是 Aᵏ 的特征值
   - 1/λ 是 A⁻¹ 的特征值（λ≠0时）
   - k+λ 是 kE+A 的特征值
   - λ 是 A^T 的特征值
5. 不同特征值对应的特征向量线性无关
6. 特征向量不唯一（可乘非零常数），但一个特征向量只属于一个特征值
          `,
          formulas: [
            "Ax = λx",
            "特征方程：|λE - A| = 0",
            "Σλᵢ = trA = Σaᵢᵢ",
            "Πλᵢ = |A|",
            "A可逆 ⟺ 所有λᵢ ≠ 0"
          ],
          examples: [
            {
              q: "求 A = [[2,1],[1,2]] 的特征值和特征向量",
              a: "|λE-A| = (λ-2)²-1 = λ²-4λ+3 = (λ-1)(λ-3)=0。λ₁=1: (E-A)x=0 → x₁+x₂=0 → ξ₁=(1,-1)。λ₂=3: (3E-A)x=0 → -x₁+x₂=0 → ξ₂=(1,1)。"
            }
          ],
          pitfalls: [
            "特征向量必须是非零向量",
            "同一个特征值可以有多个线性无关的特征向量",
            "特征值的重数（代数重数）≥ 对应线性无关特征向量的个数（几何重数）",
            "特征多项式 |λE-A| 和 |A-λE| 只差一个符号 (-1)ⁿ"
          ]
        },
        {
          id: "diagonalization",
          title: "矩阵的相似对角化",
          keywords: ["相似", "对角化", "可对角化", "特征向量矩阵", "相似矩阵"],
          summary: "矩阵相似的概念及对角化的条件和方法。",
          content: `
## 矩阵的相似对角化

### 相似矩阵
若存在可逆矩阵P，使得 P⁻¹AP = B，则称A与B相似，记作A ~ B。

相似矩阵的性质：
- 相似矩阵有相同的特征值、行列式、迹、秩
- 相似矩阵的特征多项式相同
- 相似关系是等价关系（自反、对称、传递）

### 对角化
A可对角化 ⟺ 存在可逆矩阵P和对角矩阵Λ，使得 **P⁻¹AP = Λ**

其中 Λ = diag(λ₁, λ₂, ..., λₙ)，P的列向量是对应的特征向量。

### 可对角化的充要条件
**A可对角化 ⟺ A有n个线性无关的特征向量**

等价条件：
1. 每个特征值的代数重数 = 几何重数
2. （对实对称矩阵）实对称矩阵一定可对角化

### 对角化步骤
1. 求A的所有特征值 λ₁, ..., λₙ（含重根）
2. 对每个特征值，求对应的线性无关特征向量
3. 若线性无关特征向量总数 = n，则可对角化
4. P = [特征向量列拼成], Λ = diag(对应特征值)
5. 验证 P⁻¹AP = Λ

### 对角化的应用
1. **求矩阵的幂**：Aᵏ = PΛᵏP⁻¹（Λᵏ只需对角元素求幂）
2. **简化计算**：将复杂运算转化为对角矩阵的运算
          `,
          formulas: [
            "P⁻¹AP = Λ = diag(λ₁,...,λₙ)",
            "A可对角化 ⟺ A有n个线性无关特征向量",
            "Aᵏ = PΛᵏP⁻¹",
            "实对称矩阵必可正交对角化"
          ],
          examples: [
            {
              q: "判断 A = [[2,1],[1,2]] 是否可对角化",
              a: "特征值λ₁=1,ξ₁=(1,-1); λ₂=3,ξ₂=(1,1)。两个特征向量线性无关，可对角化。P=[[1,1],[-1,1]], Λ=[[1,0],[0,3]], P⁻¹AP=Λ。"
            }
          ],
          pitfalls: [
            "不是所有方阵都能对角化",
            "P的列向量顺序要与Λ中对角元素顺序对应",
            "代数重数 ≥ 几何重数，等号成立才可对角化",
            "相似 ≠ 等价 ≠ 合同，三个概念要区分"
          ]
        },
        {
          id: "real-symmetric",
          title: "实对称矩阵的正交对角化",
          keywords: ["实对称矩阵", "正交对角化", "正交矩阵", "施密特正交化"],
          summary: "实对称矩阵的性质及正交对角化方法。",
          content: `
## 实对称矩阵的正交对角化

### 实对称矩阵的性质
1. **特征值都是实数**
2. **不同特征值对应的特征向量正交**
3. **一定可对角化**（代数重数 = 几何重数）
4. **存在正交矩阵Q**，使得 Q^T A Q = Λ（Q⁻¹ = Q^T）

### 正交对角化步骤
1. 求A的所有特征值
2. 对每个特征值，求对应的基础解系（特征向量）
3. 对同一特征值的多个特征向量进行**施密特正交化**和**单位化**
4. 不同特征值对应的特征向量已经正交，只需单位化
5. 将所有正交单位特征向量作为列组成正交矩阵Q
6. Q^T A Q = Λ = diag(λ₁, ..., λₙ)

### 施密特正交化
给定线性无关向量组 α₁, α₂, ..., αₛ：
- β₁ = α₁
- β₂ = α₂ - [(α₂,β₁)/(β₁,β₁)] β₁
- β₃ = α₃ - [(α₃,β₁)/(β₁,β₁)] β₁ - [(α₃,β₂)/(β₂,β₂)] β₂
- ...

然后单位化：γᵢ = βᵢ / |βᵢ|

### 正交矩阵的性质
- Q^T Q = E（列向量两两正交且单位化）
- Q⁻¹ = Q^T
- |Q| = ±1
- 正交变换保持长度和角度不变
          `,
          formulas: [
            "Q^T A Q = Λ (Q为正交矩阵)",
            "Q⁻¹ = Q^T",
            "实对称矩阵：不同特征值的特征向量正交",
            "施密特正交化：βₖ = αₖ - Σ[(αₖ,βᵢ)/(βᵢ,βᵢ)]βᵢ"
          ],
          examples: [
            {
              q: "正交对角化 A = [[2,-1,-1],[-1,2,-1],[-1,-1,2]]",
              a: "特征值：λ₁=0(二重), λ₂=3。λ=0: ξ₁=(1,-1,0), ξ₂=(1,0,-1)→正交化得(1,-1,0),(1,1,-2)→单位化。λ=3: ξ₃=(1,1,1)→单位化。Q由这三个正交单位向量构成。"
            }
          ],
          pitfalls: [
            "同一特征值对应多个特征向量时需要施密特正交化",
            "不同特征值对应的特征向量天然正交，不需正交化只需单位化",
            "正交矩阵要求列向量既正交又单位化"
          ]
        }
      ]
    },
    {
      id: "ch5",
      title: "第五章 二次型",
      icon: "🔄",
      sections: [
        {
          id: "quadratic-form",
          title: "二次型及其标准形",
          keywords: ["二次型", "标准形", "规范形", "配方法", "正交变换"],
          summary: "二次型的概念、化为标准形的方法及惯性定理。",
          content: `
## 二次型及其标准形

### 二次型的定义
n元二次齐次多项式：
f(x₁,...,xₙ) = Σᵢ Σⱼ aᵢⱼxᵢxⱼ

矩阵表示：f = x^T A x，其中A为对称矩阵（aᵢⱼ = aⱼᵢ）

### 标准形
只含平方项的二次型：f = d₁y₁² + d₂y₂² + ... + dₙyₙ²

### 化二次型为标准形的方法

#### 方法一：正交变换法
1. 写出二次型的矩阵A
2. 求A的特征值和正交单位特征向量
3. 构成正交变换 x = Qy
4. f = λ₁y₁² + λ₂y₂² + ... + λₙyₙ²（λᵢ为特征值）

#### 方法二：配方法
1. 逐个配方消去交叉项
2. 记录变量替换关系
3. 得到标准形

### 惯性定理
无论用什么可逆线性变换化二次型为标准形：
- 正平方项的个数 p（正惯性指数）不变
- 负平方项的个数 q（负惯性指数）不变
- p + q = r(A)（秩）
- p - q 称为符号差

### 规范形
f = z₁² + ... + zₚ² - zₚ₊₁² - ... - zₚ₊q²

规范形是唯一的（由惯性指数决定）。
          `,
          formulas: [
            "f = x^T A x (A为对称矩阵)",
            "正交变换：x = Qy → f = Σλᵢyᵢ²",
            "正惯性指数p + 负惯性指数q = r(A)",
            "惯性定理：p和q在可逆变换下不变"
          ],
          examples: [
            {
              q: "用配方法化 f = x₁² + 2x₂² + 3x₃² + 2x₁x₂ + 2x₂x₃",
              a: "f = (x₁+x₂)² + x₂² + 3x₃² + 2x₂x₃ = (x₁+x₂)² + (x₂+x₃)² + 2x₃²。令y₁=x₁+x₂, y₂=x₂+x₃, y₃=x₃，标准形：f = y₁² + y₂² + 2y₃²。"
            }
          ],
          pitfalls: [
            "二次型的矩阵必须是对称矩阵",
            "正交变换法和配方法得到的标准形可能不同，但惯性指数相同",
            "配方法中的变量替换必须是可逆的"
          ]
        },
        {
          id: "positive-definite",
          title: "正定二次型与正定矩阵",
          keywords: ["正定", "负定", "半正定", "顺序主子式", "正定判定"],
          summary: "正定二次型的定义、判定条件及性质。",
          content: `
## 正定二次型与正定矩阵

### 定义
- **正定**：f = x^T A x > 0 (∀x ≠ 0)
- **半正定**：f = x^T A x ≥ 0 (∀x)
- **负定**：f = x^T A x < 0 (∀x ≠ 0)
- **不定**：f既不正定也不负定

### 正定的充要条件（A为n阶实对称矩阵）
1. **定义法**：∀x ≠ 0, x^T A x > 0
2. **特征值法**：A的所有特征值都 > 0
3. **顺序主子式法**：A的所有顺序主子式都 > 0
   - Δ₁ = a₁₁ > 0
   - Δ₂ = |a₁₁ a₁₂; a₂₁ a₂₂| > 0
   - ...
   - Δₙ = |A| > 0
4. **标准形法**：正惯性指数 p = n（标准形所有系数为正）
5. **合同法**：A合同于单位矩阵E

### 正定的必要条件
- aᵢᵢ > 0（对角元素为正）
- |A| > 0
- A可逆

### 负定的判定
A负定 ⟺ -A正定
⟺ 所有奇数阶顺序主子式 < 0，偶数阶顺序主子式 > 0
⟺ 所有特征值 < 0

### 重要性质
- 正定矩阵的对角元素全为正
- 正定矩阵的行列式为正
- 正定矩阵一定可逆
- 正定矩阵的主对角线上的子矩阵也正定
          `,
          formulas: [
            "正定 ⟺ 所有特征值 > 0",
            "正定 ⟺ 所有顺序主子式 > 0",
            "正定 ⟺ 正惯性指数 p = n",
            "正定 ⟺ A合同于E"
          ],
          examples: [
            {
              q: "判断 A = [[2,1],[1,2]] 是否正定",
              a: "顺序主子式：Δ₁=2>0, Δ₂=|A|=4-1=3>0，故A正定。也可验证特征值λ₁=1>0, λ₂=3>0。"
            }
          ],
          pitfalls: [
            "顺序主子式不是所有主子式，是左上角的各阶子式",
            "正定要求所有顺序主子式为正，不是行列式为正就够",
            "只有对称矩阵才能谈正定性",
            "负定的顺序主子式条件是奇负偶正，不是全负"
          ]
        }
      ]
    },
    {
      id: "ch6",
      title: "第六章 向量空间",
      icon: "🌐",
      sections: [
        {
          id: "vector-space",
          title: "向量空间与线性变换",
          keywords: ["向量空间", "线性空间", "基", "维数", "坐标", "线性变换"],
          summary: "向量空间的公理化定义、基与维数、线性变换的矩阵表示。",
          content: `
## 向量空间

### 定义
设V是一个非空集合，F是一个数域。在V上定义加法和数乘两种运算，满足8条公理（封闭性、结合律、交换律、零元、负元、数乘分配律等），则称V为F上的向量空间（线性空间）。

### 基与维数
- **基**：V中一组线性无关的向量，且V中任一向量可由它们线性表示
- **维数**：基中向量的个数，记作 dim(V)
- **坐标**：若 e₁,...,eₙ 是一组基，α = x₁e₁+...+xₙeₙ，则 (x₁,...,xₙ) 称为α在这组基下的坐标

### 过渡矩阵
若 e₁,...,eₙ 和 f₁,...,fₙ 是两组基，且：
(f₁,...,fₙ) = (e₁,...,eₙ) · C
则C称为从旧基到新基的**过渡矩阵**。

坐标变换：若 α 在旧基下坐标为 x，在新基下坐标为 y，则 **x = Cy**（或 y = C⁻¹x）

### 线性变换
若映射 T: V → V 满足：
1. T(α + β) = T(α) + T(β)
2. T(kα) = kT(α)
则称T为线性变换。

### 线性变换的矩阵
在一组基下，线性变换T对应一个矩阵A：
T(e₁,...,eₙ) = (e₁,...,eₙ) · A

不同基下的矩阵关系：B = C⁻¹AC（相似关系）

### 核与像
- 核 ker(T) = {α ∈ V | T(α) = 0}（是V的子空间）
- 像 Im(T) = T(V) = {T(α) | α ∈ V}（是V的子空间）
- 维数公式：dim(ker(T)) + dim(Im(T)) = dim(V)
          `,
          formulas: [
            "坐标变换：x = Cy（C为过渡矩阵）",
            "线性变换的矩阵：T(e) = e·A",
            "不同基下矩阵关系：B = C⁻¹AC",
            "维数公式：dim(ker T) + dim(Im T) = dim V"
          ],
          examples: [
            {
              q: "在R²中，旋转θ角的线性变换在标准基下的矩阵",
              a: "T(e₁) = (cosθ, sinθ), T(e₂) = (-sinθ, cosθ)。矩阵A = [[cosθ, -sinθ],[sinθ, cosθ]]。"
            }
          ],
          pitfalls: [
            "过渡矩阵是旧基表示新基的系数矩阵",
            "坐标变换公式是x=Cy，不是y=Cx",
            "线性变换在不同基下的矩阵是相似的",
            "维数公式是核与像的维数之和等于空间维数"
          ]
        }
      ]
    }
  ],

  // 快速检索函数（基础版，向后兼容）
  search(query) {
    return this.searchWithScore(query).results;
  },

  /**
   * 增强版检索：返回带置信度的多匹配结果
   * 置信度 = 关键词命中率 + 标题命中率 + 内容命中率 + 标签加权
   */
  searchWithScore(query) {
    const results = [];
    const q = query.toLowerCase().trim();
    if (!q) return { results: [], bestMatch: null, confidence: 0 };

    // 意图感知：先判断用户提问类型
    const isDefinition = /什么是|定义|概念|指什么|是什么|含义|意思/.test(q);
    const isFormula = /公式|表达式|怎么写|怎么表示/.test(q);
    const isExample = /例题|例子|举例|示例|示范/.test(q);
    const isPitfall = /易错|误区|注意|陷阱|错误|坑/.test(q);
    const isCompute = /怎么算|怎么求|如何求|如何算|怎么解|如何解|计算/.test(q);
    const isCompare = /区别|比较|对比|不同|异同|关系/.test(q);

    let intentWeight = 0;
    if (isDefinition) intentWeight += 2;
    if (isFormula) intentWeight += 1.5;
    if (isExample) intentWeight += 1.2;
    if (isPitfall) intentWeight += 1.5;
    if (isCompare) intentWeight += 1;

    for (const chapter of this.chapters) {
      for (const section of chapter.sections) {
        let score = 0;
        const matchDetails = [];

        // 1. 关键词精确匹配（高权重）
        for (const kw of (section.keywords || [])) {
          const kwl = kw.toLowerCase();
          // 单个中文字符也允许匹配（如"秩"、"逆"等信息密度高）
          const minLen = /[\u4e00-\u9fa5]/.test(kwl) ? 1 : 2;
          if (q === kwl) {
            score += 30;
            matchDetails.push(`exact:${kw}`);
          } else if (q.includes(kwl) && kwl.length >= minLen) {
            score += 15;
            matchDetails.push(`kw-in:${kw}`);
          } else if (kwl.includes(q) && q.length >= 2) {
            score += 8;
            matchDetails.push(`in-kw:${kw}`);
          }
        }

        // 2. 标题匹配
        const titleL = section.title.toLowerCase();
        if (q === titleL) {
          score += 25;
        } else if (titleL.includes(q) && q.length >= 2) {
          score += 12;
        } else if (q.includes(titleL) && titleL.length >= 2) {
          score += 6;
        }

        // 3. 摘要匹配
        if (section.summary) {
          const sumL = section.summary.toLowerCase();
          if (sumL.includes(q)) score += 5;
        }

        // 4. 内容匹配（最低权重，避免噪音）
        if (section.content) {
          const conL = section.content.toLowerCase();
          const occurrences = (conL.match(new RegExp(this.escapeRegExp(q), 'g')) || []).length;
          if (occurrences > 0) {
            score += Math.min(occurrences, 5);
          }
        }

        // 5. 意图加权：按提问类型精准匹配对应section
        if (isDefinition) {
          // 定义类：标题含"定义"大幅优先，例题多的反而降权
          if (titleL.includes('定义')) score += 12;
          else if (section.keywords && section.keywords.some(k => k.toLowerCase().includes('定义'))) score += 6;
          if (section.examples && section.examples.length > 3) score -= 2;
        }
        if (isFormula && section.formulas && section.formulas.length > 0) score += 3;
        if (isExample && section.examples && section.examples.length > 0) score += 4;
        if (isPitfall && section.pitfalls && section.pitfalls.length > 0) score += 4;

        if (score > 0) {
          results.push({
            section,
            score,
            chapter: chapter.title,
            chapterId: chapter.id,
            matchDetails
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    const bestMatch = results[0] || null;
    // 置信度归一化：最高分映射到 0~1 之间
    const maxScore = bestMatch ? bestMatch.score : 0;
    const confidence = bestMatch ? Math.min(maxScore / 30, 1) : 0;

    return {
      results: results.slice(0, 5),
      bestMatch,
      confidence,
      queryType: {
        isDefinition, isFormula, isExample, isPitfall, isCompare, isCompute
      }
    };
  },

  escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // 《线性代数》第六版教材章节与知识体系对照表
  // page 为 PDF 0-based 页码（与 PDF.js 一致）
  textbookMap: {
    ch1: {
      title: '第1章 行列式',
      page: 12,
      sections: {
        'det-definition': { title: '§1-3 行列式的定义', page: 12 },
        'det-properties': { title: '§4 行列式的性质', page: 18 },
        'det-expansion': { title: '§5 行列式按行（列）展开', page: 26 }
      }
    },
    ch2: {
      title: '第2章 矩阵及其运算',
      page: 35,
      sections: {
        'matrix-definition': { title: '§1 线性方程组和矩阵', page: 35 },
        'matrix-operations': { title: '§2 矩阵的运算', page: 40 },
        'matrix-inverse': { title: '§3 逆矩阵', page: 50 }
      }
    },
    ch3: {
      title: '第3章 矩阵的初等变换与线性方程组',
      page: 67,
      sections: {
        'elementary-matrix': { title: '§1 矩阵的初等变换', page: 67 },
        'matrix-rank': { title: '§2 矩阵的秩', page: 77 },
        'linear-systems': { title: '§3 线性方程组的解', page: 82 }
      }
    },
    ch4: {
      title: '第4章 向量组的线性相关性',
      page: 92,
      sections: {
        'vector-linear': { title: '§1-2 向量组及其线性相关性', page: 92 },
        'linear-systems': { title: '§4 线性方程组的解的结构', page: 107 }
      }
    },
    ch5: {
      title: '第5章 相似矩阵及二次型',
      page: 125,
      sections: {
        'eigenvalue': { title: '§2 方阵的特征值与特征向量', page: 131 },
        'diagonalization': { title: '§3 相似矩阵', page: 135 },
        'real-symmetric': { title: '§4 对称矩阵的对角化', page: 138 },
        'quadratic-form': { title: '§5 二次型及其标准形', page: 141 },
        'positive-definite': { title: '§7 正定二次型', page: 147 }
      }
    },
    ch6: {
      title: '第6章 线性空间与线性变换',
      page: 153,
      sections: {
        'vector-space': { title: '§1 线性空间的定义与性质', page: 153 }
      }
    }
  },

  // 根据知识体系章节 ID 获取教材对应信息
  getTextbookChapter(chapterId) {
    return this.textbookMap[chapterId] || null;
  },

  // 根据知识体系知识点 ID 获取教材对应页码（优先精确匹配，否则返回章首页）
  getTextbookPageBySection(sectionId) {
    for (const chId in this.textbookMap) {
      const ch = this.textbookMap[chId];
      if (ch.sections && ch.sections[sectionId]) {
        return { chapter: ch.title, page: ch.sections[sectionId].page, section: ch.sections[sectionId].title };
      }
    }
    // 回退到章首页
    for (const ch of this.chapters) {
      for (const s of ch.sections) {
        if (s.id === sectionId) {
          const tm = this.textbookMap[ch.id];
          return tm ? { chapter: tm.title, page: tm.page, section: '章首页' } : null;
        }
      }
    }
    return null;
  },

  // 获取所有章节的导航信息
  getNavigation() {
    return this.chapters.map(ch => ({
      id: ch.id,
      title: ch.title,
      icon: ch.icon,
      sections: ch.sections.map(s => ({ id: s.id, title: s.title }))
    }));
  },

  // 根据ID获取知识点
  getSection(id) {
    for (const chapter of this.chapters) {
      for (const section of chapter.sections) {
        if (section.id === id) return { ...section, chapter: chapter.title };
      }
    }
    return null;
  },
// ============ 知识点分层拆解（3 级颗粒度） ============
  // 用途：漏洞精准定位（原章节导航之外的新视角）
  //  - 一级 6 大核心模块
  //  - 二级 48 个关联知识点（每章 8 个）
  //  - 三级 120+ 细分支考点 & 易错点（每章约 20 个）
  layered: {
    level1: [
      { id: 'L1-det', icon: '📊', title: '行列式', subtitle: '方阵的数值特征，最基础的判定工具', kps: 8, traps: 20 },
      { id: 'L1-mat', icon: '🔢', title: '矩阵及其运算', subtitle: '线性变换的代数表达，最核心的计算载体', kps: 8, traps: 20 },
      { id: 'L1-vec', icon: '🧭', title: '向量与线性方程组', subtitle: '线性相关性的判定与方程组求解', kps: 8, traps: 20 },
      { id: 'L1-eig', icon: '🌟', title: '特征值与特征向量', subtitle: '矩阵的本质谱，对角化的核心概念', kps: 8, traps: 20 },
      { id: 'L1-qf',  icon: '🎯', title: '二次型', subtitle: '二次齐次多项式，几何与代数桥梁', kps: 8, traps: 20 },
      { id: 'L1-sp',  icon: '🌌', title: '线性空间与线性变换', subtitle: '公理化抽象，推广与应用基础', kps: 8, traps: 20 }
    ],

    level2: [
      { id: 'L2-det-1', parent: 'L1-det', title: '二阶行列式', formula: 'det = ad - bc', desc: '最基础的对角线展开' },
      { id: 'L2-det-2', parent: 'L1-det', title: '三阶行列式', formula: '沙路法（Sarrus）', desc: '仅 3×3 适用，易误用于高阶' },
      { id: 'L2-det-3', parent: 'L1-det', title: 'n 阶行列式定义', formula: 'Σ(-1)^τ a₁ⱼ₁…aₙⱼₙ', desc: '逆序数定义，理解符号来源' },
      { id: 'L2-det-4', parent: 'L1-det', title: '行列式性质', desc: '行/列互换变号、相加不变、|kA|=kⁿ|A|' },
      { id: 'L2-det-5', parent: 'L1-det', title: '展开定理（按行/列）', desc: 'Laplace 展开，余子式×代数余子式' },
      { id: 'L2-det-6', parent: 'L1-det', title: '克拉默法则', desc: '方阵+det≠0，xᵢ=detAᵢ/detA' },
      { id: 'L2-det-7', parent: 'L1-det', title: '范德蒙德行列式', desc: '∏ᵢ<ⱼ(xⱼ-xᵢ)，判定列向量线性相关性' },
      { id: 'L2-det-8', parent: 'L1-det', title: '化为上三角', desc: '最常用的计算策略，行变换不改变行列式值' },
      { id: 'L2-mat-1', parent: 'L1-mat', title: '矩阵加减与数乘', desc: '逐元素运算，维度必须一致' },
      { id: 'L2-mat-2', parent: 'L1-mat', title: '矩阵乘法', desc: '第 i 行 × 第 j 列 → cᵢⱼ；AB≠BA' },
      { id: 'L2-mat-3', parent: 'L1-mat', title: '矩阵转置', desc: '(AB)ᵀ = BᵀAᵀ；对称/反对称矩阵' },
      { id: 'L2-mat-4', parent: 'L1-mat', title: '伴随矩阵 A*', formula: 'A⁻¹ = A*/|A|', desc: '代数余子式矩阵的转置' },
      { id: 'L2-mat-5', parent: 'L1-mat', title: '逆矩阵', desc: '方阵 + det≠0；性质：(AB)⁻¹ = B⁻¹A⁻¹' },
      { id: 'L2-mat-6', parent: 'L1-mat', title: '分块矩阵', desc: '按块运算，块大小要匹配' },
      { id: 'L2-mat-7', parent: 'L1-mat', title: '初等变换与初等矩阵', desc: '左行变换 ↔ 左乘初等矩阵；右列变换 ↔ 右乘' },
      { id: 'L2-mat-8', parent: 'L1-mat', title: '矩阵的秩', desc: 'r(A) = 非零子式最高阶；r(Aᵀ)=r(A)' },
      { id: 'L2-vec-1', parent: 'L1-vec', title: '向量与线性组合', desc: '理解向量空间、子空间' },
      { id: 'L2-vec-2', parent: 'L1-vec', title: '向量内积', desc: '(u,v) = uᵀv；正定性、对称性' },
      { id: 'L2-vec-3', parent: 'L1-vec', title: '线性相关与线性无关', desc: '存在非零系数使线性组合=0' },
      { id: 'L2-vec-4', parent: 'L1-vec', title: '向量组的秩', desc: '极大线性无关组的向量个数' },
      { id: 'L2-vec-5', parent: 'L1-vec', title: '齐次线性方程组', desc: 'AX=0；解空间维数 = n-r(A)' },
      { id: 'L2-vec-6', parent: 'L1-vec', title: '非齐次线性方程组', desc: 'AX=b 有解 ⇔ r(A)=r(A|b)' },
      { id: 'L2-vec-7', parent: 'L1-vec', title: '通解结构', desc: '非齐次通解 = 特解 + 齐次通解' },
      { id: 'L2-vec-8', parent: 'L1-vec', title: '基础解系', desc: '齐次方程组的极大无关解向量组' },
      { id: 'L2-eig-1', parent: 'L1-eig', title: '特征值与特征向量', desc: 'Av=λv，v≠0' },
      { id: 'L2-eig-2', parent: 'L1-eig', title: '特征多项式', desc: 'det(λE-A)；n 次多项式' },
      { id: 'L2-eig-3', parent: 'L1-eig', title: '特征值的性质', desc: 'Σλᵢ=tr(A)、∏λᵢ=det(A)' },
      { id: 'L2-eig-4', parent: 'L1-eig', title: '相似对角化', desc: 'A=P⁻¹ΛP；n 个线性无关特征向量' },
      { id: 'L2-eig-5', parent: 'L1-eig', title: '实对称矩阵对角化', desc: '可正交相似对角化，特征值全实' },
      { id: 'L2-eig-6', parent: 'L1-eig', title: '矩阵的幂', desc: 'Aⁿ = PΛⁿP⁻¹' },
      { id: 'L2-eig-7', parent: 'L1-eig', title: 'Cayley-Hamilton 定理', desc: 'f(A)=0（f 是特征多项式）' },
      { id: 'L2-eig-8', parent: 'L1-eig', title: '特征值应用', desc: '动态系统、矩阵指数、二次型' },
      { id: 'L2-qf-1', parent: 'L1-qf',  title: '二次型与对称矩阵', desc: 'xᵀAx，一一对应（对称部分）' },
      { id: 'L2-qf-2', parent: 'L1-qf',  title: '标准形与规范形', desc: '只有正负 1 与 0 的形式唯一' },
      { id: 'L2-qf-3', parent: 'L1-qf',  title: '正交变换法', desc: 'A=Qᵀdiag(λ₁,…,λₙ)Q' },
      { id: 'L2-qf-4', parent: 'L1-qf',  title: '配方法', desc: '依次化为平方项，再凑标准形' },
      { id: 'L2-qf-5', parent: 'L1-qf',  title: '正定/半正定判定', desc: '特征值全正 / 顺序主子式全正' },
      { id: 'L2-qf-6', parent: 'L1-qf',  title: '惯性定理', desc: '正惯性指数 p 与坐标变换无关' },
      { id: 'L2-qf-7', parent: 'L1-qf',  title: '合同 vs 相似', desc: '合同 CᵀAC；相似 P⁻¹AP' },
      { id: 'L2-qf-8', parent: 'L1-qf',  title: '正定矩阵性质', desc: '可逆、A⁻¹ 正定、xᵀAx>0 ∀x≠0' },
      { id: 'L2-sp-1', parent: 'L1-sp', title: '线性空间定义', desc: '8 条公理：加法封闭、数乘封闭' },
      { id: 'L2-sp-2', parent: 'L1-sp', title: '基与维数', desc: '极大无关组 = 基；向量个数 = 维数' },
      { id: 'L2-sp-3', parent: 'L1-sp', title: '子空间', desc: '加法子空间、子空间判定' },
      { id: 'L2-sp-4', parent: 'L1-sp', title: '坐标与基变换', desc: 'P⁻¹AP 的几何意义' },
      { id: 'L2-sp-5', parent: 'L1-sp', title: '过渡矩阵', desc: '新旧基之间的坐标换算' },
      { id: 'L2-sp-6', parent: 'L1-sp', title: '线性变换', desc: '保持加法与数乘的映射' },
      { id: 'L2-sp-7', parent: 'L1-sp', title: '线性变换的矩阵表示', desc: 'T(x)=Ax 在基下的矩阵' },
      { id: 'L2-sp-8', parent: 'L1-sp', title: '内积空间与正交基', desc: 'Schmidt 正交化' }
    ],

    level3: [
      // 行列式 20
      { id:'L3-det-1', parent:'L2-det-1', tag:'易错', title:'二阶对角线法则被误用于高阶' },
      { id:'L3-det-2', parent:'L2-det-2', tag:'易错', title:'三阶沙路法被误用于四阶及以上' },
      { id:'L3-det-3', parent:'L2-det-3', tag:'概念', title:'逆序数与符号的正确定义' },
      { id:'L3-det-4', parent:'L2-det-3', tag:'考点', title:'奇偶排列与行列式符号的关系' },
      { id:'L3-det-5', parent:'L2-det-4', tag:'易错', title:'行列互换与符号变化混淆' },
      { id:'L3-det-6', parent:'L2-det-4', tag:'易错', title:'|kA|=k|A| 误写为 kⁿ|A|' },
      { id:'L3-det-7', parent:'L2-det-4', tag:'考点', title:'两行成比例则行列式为 0' },
      { id:'L3-det-8', parent:'L2-det-4', tag:'考点', title:'det(AB)=det(A)det(B) 性质' },
      { id:'L3-det-9', parent:'L2-det-5', tag:'易错', title:'余子式 vs 代数余子式的符号 (-1)^(i+j)' },
      { id:'L3-det-10', parent:'L2-det-5', tag:'考点', title:'按行展开选错行/列导致遗漏' },
      { id:'L3-det-11', parent:'L2-det-5', tag:'考点', title:'Laplace 展开的使用条件' },
      { id:'L3-det-12', parent:'L2-det-6', tag:'易错', title:'克拉默法则对方阵非奇异的忽略' },
      { id:'L3-det-13', parent:'L2-det-6', tag:'易错', title:'系数矩阵奇异时仍强行套用' },
      { id:'L3-det-14', parent:'L2-det-6', tag:'考点', title:'Cramer vs 求逆矩阵的适用场景' },
      { id:'L3-det-15', parent:'L2-det-7', tag:'考点', title:'范德蒙德判定列向量线性无关' },
      { id:'L3-det-16', parent:'L2-det-7', tag:'易错', title:'列互换后 Vandermonde 的取值' },
      { id:'L3-det-17', parent:'L2-det-8', tag:'考点', title:'化为上三角后乘积即结果' },
      { id:'L3-det-18', parent:'L2-det-8', tag:'易错', title:'数乘某行时行列式的倍数' },
      { id:'L3-det-19', parent:'L2-det-4', tag:'考点', title:'反对称矩阵行列式奇数阶为 0' },
      { id:'L3-det-20', parent:'L2-det-4', tag:'考点', title:'分块矩阵的 Schur 补公式' },
      // 矩阵 20
      { id:'L3-mat-1', parent:'L2-mat-1', tag:'易错', title:'矩阵乘法维度不匹配仍强行相乘' },
      { id:'L3-mat-2', parent:'L2-mat-2', tag:'易错', title:'AB≠BA，强行当作普通数乘' },
      { id:'L3-mat-3', parent:'L2-mat-2', tag:'易错', title:'AB=AC 推出 B=C 缺少 A 可逆条件' },
      { id:'L3-mat-4', parent:'L2-mat-2', tag:'易错', title:'AB=0 推出 A=0 或 B=0（错误）' },
      { id:'L3-mat-5', parent:'L2-mat-3', tag:'易错', title:'(AB)ᵀ = BᵀAᵀ 误写为 (AB)ᵀ = AᵀBᵀ' },
      { id:'L3-mat-6', parent:'L2-mat-3', tag:'考点', title:'(Aᵀ)ᵀ=A；(A+B)ᵀ=Aᵀ+Bᵀ' },
      { id:'L3-mat-7', parent:'L2-mat-4', tag:'易错', title:'伴随矩阵 A* vs 转置 Aᵀ 混淆' },
      { id:'L3-mat-8', parent:'L2-mat-4', tag:'易错', title:'A⁻¹ = A*/|A| 忘记 |A|≠0 的条件' },
      { id:'L3-mat-9', parent:'L2-mat-4', tag:'考点', title:'AA* = A*A = |A|E' },
      { id:'L3-mat-10', parent:'L2-mat-5', tag:'易错', title:'(AB)⁻¹ = B⁻¹A⁻¹ 顺序颠倒' },
      { id:'L3-mat-11', parent:'L2-mat-5', tag:'考点', title:'矩阵方程 AX=B 左乘右乘的差异' },
      { id:'L3-mat-12', parent:'L2-mat-6', tag:'易错', title:'分块后直接按块相乘忘记维度匹配' },
      { id:'L3-mat-13', parent:'L2-mat-7', tag:'考点', title:'左行变换 = 左乘初等矩阵；右列变换 = 右乘' },
      { id:'L3-mat-14', parent:'L2-mat-7', tag:'考点', title:'初等矩阵的逆仍是初等矩阵' },
      { id:'L3-mat-15', parent:'L2-mat-8', tag:'易错', title:'r(AB) 与 r(A)、r(B) 的不等式混淆' },
      { id:'L3-mat-16', parent:'L2-mat-8', tag:'考点', title:'r(A+B) ≤ r(A)+r(B)' },
      { id:'L3-mat-17', parent:'L2-mat-8', tag:'考点', title:'r(A)=r(Aᵀ)' },
      { id:'L3-mat-18', parent:'L2-mat-5', tag:'考点', title:'用初等变换法求逆矩阵的完整步骤' },
      { id:'L3-mat-19', parent:'L2-mat-5', tag:'易错', title:'正交矩阵 AᵀA=E 与 Aᵀ=A⁻¹ 的关系' },
      { id:'L3-mat-20', parent:'L2-mat-2', tag:'考点', title:'Aⁿ 计算（先相似对角化再用 PΛⁿP⁻¹）' },
      // 向量与方程组 20
      { id:'L3-vec-1', parent:'L2-vec-1', tag:'概念', title:'列向量 vs 行向量的写法差异' },
      { id:'L3-vec-2', parent:'L2-vec-3', tag:'易错', title:'线性相关与线性表示的区分' },
      { id:'L3-vec-3', parent:'L2-vec-3', tag:'考点', title:'部分组线性相关 → 整体组线性相关（反之不成立）' },
      { id:'L3-vec-4', parent:'L2-vec-3', tag:'考点', title:'n+1 个 n 维向量必线性相关' },
      { id:'L3-vec-5', parent:'L2-vec-4', tag:'考点', title:'向量组等价 vs 矩阵等价' },
      { id:'L3-vec-6', parent:'L2-vec-2', tag:'易错', title:'内积对称性 (u,v)=(v,u)' },
      { id:'L3-vec-7', parent:'L2-vec-2', tag:'考点', title:'内积正定性 (u,u)>0' },
      { id:'L3-vec-8', parent:'L2-vec-5', tag:'考点', title:'齐次方程组只有零解的判定（r(A)=n）' },
      { id:'L3-vec-9', parent:'L2-vec-6', tag:'考点', title:'非齐次有解的判定 r(A)=r(A|b)' },
      { id:'L3-vec-10', parent:'L2-vec-6', tag:'易错', title:'含参方程组的分情况讨论（a 值分类）' },
      { id:'L3-vec-11', parent:'L2-vec-8', tag:'易错', title:'自由未知量选取与基础解系对应' },
      { id:'L3-vec-12', parent:'L2-vec-8', tag:'考点', title:'基础解系线性无关' },
      { id:'L3-vec-13', parent:'L2-vec-8', tag:'考点', title:'基础解系个数 = n-r(A)' },
      { id:'L3-vec-14', parent:'L2-vec-7', tag:'易错', title:'通解 = 特解 + 齐次通解（漏写）' },
      { id:'L3-vec-15', parent:'L2-vec-4', tag:'考点', title:'极大线性无关组与向量组的秩' },
      { id:'L3-vec-16', parent:'L2-vec-1', tag:'考点', title:'向量空间的判定（8 条公理）' },
      { id:'L3-vec-17', parent:'L2-vec-1', tag:'考点', title:'子空间的判定（封闭性）' },
      { id:'L3-vec-18', parent:'L2-vec-2', tag:'考点', title:'Schmidt 正交化方法' },
      { id:'L3-vec-19', parent:'L2-vec-4', tag:'考点', title:'过渡矩阵与坐标变换公式' },
      { id:'L3-vec-20', parent:'L2-vec-6', tag:'易错', title:'AX=b 解的唯一性判定（r(A)=n）' },
      // 特征值 20
      { id:'L3-eig-1', parent:'L2-eig-1', tag:'易错', title:'Av=λv 中向量 v=0 被遗漏' },
      { id:'L3-eig-2', parent:'L2-eig-1', tag:'考点', title:'特征值是标量，特征向量非零' },
      { id:'L3-eig-3', parent:'L2-eig-3', tag:'易错', title:'特征值之和 = 矩阵的迹（不记得）' },
      { id:'L3-eig-4', parent:'L2-eig-3', tag:'易错', title:'特征值之积 = 矩阵的行列式（不记得）' },
      { id:'L3-eig-5', parent:'L2-eig-2', tag:'考点', title:'特征多项式 det(λE-A) 的写法' },
      { id:'L3-eig-6', parent:'L2-eig-2', tag:'考点', title:'代数重数与几何重数的关系' },
      { id:'L3-eig-7', parent:'L2-eig-4', tag:'考点', title:'可对角化的充要条件（n 个线性无关特征向量）' },
      { id:'L3-eig-8', parent:'L2-eig-4', tag:'易错', title:'重特征值只找一个特征向量导致不可对角化' },
      { id:'L3-eig-9', parent:'L2-eig-4', tag:'易错', title:'对角化矩阵 P 列的顺序与 Λ 顺序对应' },
      { id:'L3-eig-10', parent:'L2-eig-5', tag:'考点', title:'实对称矩阵可正交对角化（特征值全实）' },
      { id:'L3-eig-11', parent:'L2-eig-5', tag:'易错', title:'正交矩阵 Q 满足 QᵀQ=E（不只是转置对称）' },
      { id:'L3-eig-12', parent:'L2-eig-6', tag:'考点', title:'Aⁿ = PΛⁿP⁻¹ 计算思路' },
      { id:'L3-eig-13', parent:'L2-eig-6', tag:'易错', title:'矩阵可逆 ⇔ 0 不是特征值（混淆）' },
      { id:'L3-eig-14', parent:'L2-eig-5', tag:'考点', title:'实对称矩阵特征向量可正交化' },
      { id:'L3-eig-15', parent:'L2-eig-5', tag:'易错', title:'正交矩阵的特征值模长为 1' },
      { id:'L3-eig-16', parent:'L2-eig-7', tag:'考点', title:'Cayley-Hamilton 定理应用' },
      { id:'L3-eig-17', parent:'L2-eig-8', tag:'易错', title:'e^A 计算需先相似对角化' },
      { id:'L3-eig-18', parent:'L2-eig-8', tag:'考点', title:'矩阵的谱半径 ρ(A)=max|λ|' },
      { id:'L3-eig-19', parent:'L2-eig-2', tag:'易错', title:'AᵀA 的特征值非负' },
      { id:'L3-eig-20', parent:'L2-eig-4', tag:'考点', title:'矩阵相似的充要条件（特征值+重数一致）' },
      // 二次型 20
      { id:'L3-qf-1', parent:'L2-qf-1', tag:'概念', title:'二次型与对称矩阵一一对应' },
      { id:'L3-qf-2', parent:'L2-qf-1', tag:'易错', title:'非对称部分不影响二次型（取 A=(A+Aᵀ)/2）' },
      { id:'L3-qf-3', parent:'L2-qf-2', tag:'考点', title:'标准形不唯一，规范形唯一' },
      { id:'L3-qf-4', parent:'L2-qf-3', tag:'易错', title:'正交变换保持对称矩阵对称性' },
      { id:'L3-qf-5', parent:'L2-qf-3', tag:'考点', title:'Q 为正交矩阵：QᵀAQ = diag(λ₁,…,λₙ)' },
      { id:'L3-qf-6', parent:'L2-qf-4', tag:'考点', title:'配方法化标准形的步骤' },
      { id:'L3-qf-7', parent:'L2-qf-4', tag:'易错', title:'配方顺序与初等变换对应' },
      { id:'L3-qf-8', parent:'L2-qf-5', tag:'考点', title:'正定矩阵的特征值全正' },
      { id:'L3-qf-9', parent:'L2-qf-5', tag:'考点', title:'顺序主子式全部 > 0 ⇔ 正定' },
      { id:'L3-qf-10', parent:'L2-qf-5', tag:'易错', title:'半正定 vs 正定（含 0 特征值）' },
      { id:'L3-qf-11', parent:'L2-qf-6', tag:'考点', title:'惯性定理：正负惯性指数与坐标变换无关' },
      { id:'L3-qf-12', parent:'L2-qf-6', tag:'易错', title:'规范形中 +1/-1/0 的个数计算' },
      { id:'L3-qf-13', parent:'L2-qf-7', tag:'易错', title:'合同变换 CᵀAC 与相似变换 P⁻¹AP 混淆' },
      { id:'L3-qf-14', parent:'L2-qf-7', tag:'考点', title:'正定矩阵合同于单位阵' },
      { id:'L3-qf-15', parent:'L2-qf-8', tag:'考点', title:'正定矩阵必可逆，且 A⁻¹ 也正定' },
      { id:'L3-qf-16', parent:'L2-qf-8', tag:'易错', title:'-A 正定 ⇔ A 负定（符号对应）' },
      { id:'L3-qf-17', parent:'L2-qf-6', tag:'考点', title:'Sylvester 准则（顺序主子式）' },
      { id:'L3-qf-18', parent:'L2-qf-5', tag:'考点', title:'半正定矩阵行列式 ≥ 0（不一定正）' },
      { id:'L3-qf-19', parent:'L2-qf-2', tag:'考点', title:'二次型的秩等于矩阵的秩' },
      { id:'L3-qf-20', parent:'L2-qf-3', tag:'易错', title:'正交矩阵判定：AᵀA=E（不仅转置对称）' },
      // 线性空间 20
      { id:'L3-sp-1', parent:'L2-sp-1', tag:'概念', title:'8 条公理验证线性空间' },
      { id:'L3-sp-2', parent:'L2-sp-2', tag:'考点', title:'基与维数的关系（极大无关组=基）' },
      { id:'L3-sp-3', parent:'L2-sp-3', tag:'易错', title:'子空间判定（加法+数乘封闭）' },
      { id:'L3-sp-4', parent:'L2-sp-4', tag:'考点', title:'坐标变换公式 x=Px₂（P 为过渡矩阵）' },
      { id:'L3-sp-5', parent:'L2-sp-5', tag:'考点', title:'过渡矩阵的构造' },
      { id:'L3-sp-6', parent:'L2-sp-6', tag:'概念', title:'线性变换保持加法与数乘' },
      { id:'L3-sp-7', parent:'L2-sp-7', tag:'考点', title:'T(x)=Ax 的矩阵表示' },
      { id:'L3-sp-8', parent:'L2-sp-7', tag:'易错', title:'不同基下同一线性变换的表示不同' },
      { id:'L3-sp-9', parent:'L2-sp-8', tag:'考点', title:'Schmidt 正交化构造标准正交基' },
      { id:'L3-sp-10', parent:'L2-sp-8', tag:'考点', title:'Gram-Schmidt 过程的步骤' },
      { id:'L3-sp-11', parent:'L2-sp-2', tag:'考点', title:'向量组的秩等于子空间维数' },
      { id:'L3-sp-12', parent:'L2-sp-2', tag:'易错', title:'维数公式 dim(U+V)=dim(U)+dim(V)-dim(U∩V)' },
      { id:'L3-sp-13', parent:'L2-sp-6', tag:'考点', title:'线性变换的核 ker(T) 与像 Im(T)' },
      { id:'L3-sp-14', parent:'L2-sp-7', tag:'考点', title:'线性变换与矩阵的同构关系' },
      { id:'L3-sp-15', parent:'L2-sp-4', tag:'易错', title:'相似矩阵表示同一线性变换' },
      { id:'L3-sp-16', parent:'L2-sp-2', tag:'考点', title:'Rⁿ 中线性无关向量组最多 n 个' },
      { id:'L3-sp-17', parent:'L2-sp-8', tag:'考点', title:'正交补 U⊥ 与维数公式' },
      { id:'L3-sp-18', parent:'L2-sp-3', tag:'易错', title:'零空间必是子空间' },
      { id:'L3-sp-19', parent:'L2-sp-7', tag:'考点', title:'可逆线性变换与基的关系' },
      { id:'L3-sp-20', parent:'L2-sp-6', tag:'易错', title:'非线性变换的例子（容易混入）' }
    ],

    getLevel2ByL1(l1id) { return this.level2.filter(k => k.parent === l1id); },
    getLevel3ByL2(l2id) { return this.level3.filter(k => k.parent === l2id); },
    stats() {
      return { l1: this.level1.length, l2: this.level2.length, l3: this.level3.length };
    }
  },

  // ============ 知识点拓扑图谱（一级 6 模块 + 二级 48 知识点） ============
  topology: {
    level1: [
      { id: 'tp-det', color: '#fda4af', order: 1, svg: '<svg class="tp-svg-ic" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="#ec4899" stroke-width="3"/><path d="M8 8l32 32M40 8L8 40" stroke="#ec4899" stroke-width="2" stroke-linecap="round"/></svg>', title: '行列式', subtitle: '方阵的数值特征，最基础的判定工具' },
      { id: 'tp-mat', color: '#93c5fd', order: 2, svg: '<svg class="tp-svg-ic" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#3b82f6" stroke-width="3"><rect x="8" y="8" width="14" height="14" rx="2"/><rect x="26" y="8" width="14" height="14" rx="2"/><rect x="8" y="26" width="14" height="14" rx="2"/><rect x="26" y="26" width="14" height="14" rx="2"/></g></svg>', title: '矩阵', subtitle: '线性变换的代数表达，最核心的计算载体' },
      { id: 'tp-vec', color: '#c4b5fd', order: 3, svg: '<svg class="tp-svg-ic" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g stroke="#8b5cf6" stroke-width="3" stroke-linecap="round" fill="none"><line x1="10" y1="10" x2="38" y2="38"/><line x1="10" y1="25" x2="38" y2="25"/><line x1="10" y1="40" x2="38" y2="10"/></g><circle cx="38" cy="10" r="3" fill="#8b5cf6"/><circle cx="38" cy="38" r="3" fill="#8b5cf6"/></svg>', title: '向量空间', subtitle: '公理化抽象，推广与同构的基础' },
      { id: 'tp-eq', color: '#86efac', order: 4,  svg: '<svg class="tp-svg-ic" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g stroke="#10b981" stroke-width="3" stroke-linecap="round" fill="none"><line x1="6" y1="16" x2="42" y2="16"/><line x1="6" y1="32" x2="42" y2="32"/><circle cx="14" cy="16" r="3" fill="#10b981"/><circle cx="22" cy="32" r="3" fill="#10b981"/><circle cx="34" cy="32" r="3" fill="#10b981"/></g></svg>', title: '线性方程组', subtitle: '线性代数的应用核心，解的结构与判定' },
      { id: 'tp-eig', color: '#fcd34d', order: 5, svg: '<svg class="tp-svg-ic" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><text x="24" y="34" font-family="Georgia,serif" font-style="italic" font-weight="700" font-size="32" text-anchor="middle" fill="#f59e0b">λ</text><g stroke="#f59e0b" stroke-width="2.5" fill="none" stroke-linecap="round"><line x1="34" y1="14" x2="42" y2="6"/><line x1="34" y1="6" x2="42" y2="14"/></g></svg>', title: '特征值与特征向量', subtitle: '矩阵的本质谱，对角化的核心' },
      { id: 'tp-qf', color: '#67e8f9', order: 6,  svg: '<svg class="tp-svg-ic" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="24" r="14"/><ellipse cx="24" cy="24" rx="14" ry="6"/><ellipse cx="24" cy="24" rx="6" ry="14"/></g></svg>', title: '二次型', subtitle: '二次齐次多项式，几何与代数桥梁' }
    ],
    level2: [
      { id: 'tp-det-1', parent: 'tp-det', title: '行列式定义与逆序数', desc: 'n 阶行列式由逆序数展开定义，符号由排列奇偶性决定', mastery: 0.64, freq: 0.73, difficulty: '基础', errors: ['将二阶对角线法则误用于三阶以上', '逆序数奇偶与符号搞反'] },
      { id: 'tp-det-2', parent: 'tp-det', title: '余子式与代数余子式', desc: '余子式 Mᵢⱼ 去掉第 i 行第 j 列；代数余子式 Aᵢⱼ=(-1)^(i+j)·Mᵢⱼ', mastery: 0.95, freq: 0.54, difficulty: '基础', errors: ['混淆余子式与代数余子式的符号 (-1)^(i+j)', '展开时漏掉某一项导致结果错误'] },
      { id: 'tp-det-3', parent: 'tp-det', title: '行列式核心性质', desc: '行列互换变号、提取公因子、两行成比例则为 0、|kA|=kⁿ|A|', mastery: 0.61, freq: 0.73, difficulty: '基础', errors: ['|kA| 错写为 k|A|（应为 kⁿ|A|）', '忘记两行成比例则行列式为 0'] },
      { id: 'tp-det-4', parent: 'tp-det', title: '行列式行列展开定理', desc: '按任一行(列)展开：det = Σ aᵢⱼ·Aᵢⱼ；Laplace 定理推广', mastery: 0.78, freq: 0.6, difficulty: '中等', errors: ['展开定理按行/列展开时选错行', 'Laplace 展开符号混乱'] },
      { id: 'tp-det-5', parent: 'tp-det', title: '常规行列式计算方法', desc: '化上三角法、加边法、递推法、范德蒙德行列式公式', mastery: 0.63, freq: 0.84, difficulty: '中等', errors: ['化上三角时漏乘初等变换倍数', '范德蒙德行列式公式记错'] },
      { id: 'tp-det-6', parent: 'tp-det', title: '克拉默法则应用', desc: '方阵且 det≠0 时，xᵢ = Dᵢ/D，用于方程组求解与可逆性判定', mastery: 0.82, freq: 0.49, difficulty: '中等', errors: ['系数矩阵奇异时强行套用克莱姆法则', '方阵但 |A|=0 时仍套公式'] },
      { id: 'tp-mat-1', parent: 'tp-mat', title: '矩阵概念与线性运算', desc: '矩阵的加法、数乘为逐元素运算；矩阵本身是数表而非数值', mastery: 0.74, freq: 0.95, difficulty: '基础', errors: ['矩阵加法未对齐维度仍相加', '把矩阵当作普通数理解'] },
      { id: 'tp-mat-2', parent: 'tp-mat', title: '矩阵乘法运算与运算律', desc: '第 i 行 × 第 j 列 → cᵢⱼ；满足结合律不满足交换律，AB≠BA', mastery: 0.81, freq: 0.79, difficulty: '基础', errors: ['AB≠BA 时强行交换顺序', 'AB=AC 推出 B=C 缺少 A 可逆条件'] },
      { id: 'tp-mat-3', parent: 'tp-mat', title: '方阵幂运算', desc: 'Aᵏ 的递推定义；结合相似对角化可高效计算 Aⁿ', mastery: 0.38, freq: 0.77, difficulty: '基础', errors: ['Aⁿ 计算时忘记先相似对角化', '矩阵乘法结合律漏用导致错误'] },
      { id: 'tp-mat-4', parent: 'tp-mat', title: '转置矩阵性质与运算', desc: '(Aᵀ)ᵀ=A、(A+B)ᵀ=Aᵀ+Bᵀ、(AB)ᵀ=BᵀAᵀ、对称/反对称判定', mastery: 0.66, freq: 0.7, difficulty: '基础', errors: ['(AB)ᵀ = BᵀAᵀ 误写为 AᵀBᵀ', '对称/反对称矩阵判定时忽略符号'] },
      { id: 'tp-mat-5', parent: 'tp-mat', title: '伴随矩阵定义与核心性质', desc: 'A* 为代数余子式矩阵的转置；AA* = A*A = |A|E', mastery: 0.89, freq: 0.95, difficulty: '中等', errors: ['A⁻¹ = A*/|A| 忽略 |A|≠0 条件', '伴随矩阵定义与转置混淆'] },
      { id: 'tp-mat-6', parent: 'tp-mat', title: '逆矩阵求解与运算律', desc: 'A⁻¹ = A*/|A|；(AB)⁻¹ = B⁻¹A⁻¹；(A⁻¹)⁻¹ = A', mastery: 0.48, freq: 0.95, difficulty: '中等', errors: ['(AB)⁻¹ 顺序颠倒', '忘记求逆的转置关系'] },
      { id: 'tp-mat-7', parent: 'tp-mat', title: '矩阵可逆性判定', desc: '方阵 + det≠0 ⇔ 满秩 ⇔ 可逆；可逆矩阵的初等行变换法求逆', mastery: 0.59, freq: 0.95, difficulty: '中等', errors: ['用秩判定可逆时忘记满秩条件', '忽略 det=0 与不可逆的等价'] },
      { id: 'tp-mat-8', parent: 'tp-mat', title: '矩阵方程求解', desc: 'AX=B 左乘 A⁻¹；XA=B 右乘 A⁻¹，注意左乘右乘区别', mastery: 0.38, freq: 0.95, difficulty: '中等', errors: ['矩阵方程左乘右乘不分', 'AX=B 与 XA=B 解法混乱'] },
      { id: 'tp-mat-9', parent: 'tp-mat', title: '矩阵初等变换与应用', desc: '行变换/列变换；用于求秩、求逆、化行最简形', mastery: 0.49, freq: 0.66, difficulty: '中等', errors: ['初等变换与初等矩阵对应关系搞混', '左行变换≠右乘初等矩阵'] },
      { id: 'tp-mat-10', parent: 'tp-mat', title: '初等方阵与矩阵等价', desc: '左行变换↔左乘初等矩阵；等价矩阵具有相同秩', mastery: 0.61, freq: 0.75, difficulty: '进阶', errors: ['等价矩阵与相似矩阵混淆', '忘记初等矩阵的逆仍是初等矩阵'] },
      { id: 'tp-mat-11', parent: 'tp-mat', title: '矩阵秩的求解与判定', desc: '非零子式最高阶数；r(A)=r(Aᵀ)、r(A+B)≤r(A)+r(B)', mastery: 0.53, freq: 0.79, difficulty: '进阶', errors: ['r(AB) 与 r(A)、r(B) 不等式用错', '混淆 r(A+B) ≤ r(A)+r(B)'] },
      { id: 'tp-mat-12', parent: 'tp-mat', title: '分块矩阵运算与技巧', desc: '按块运算需块大小匹配；分块对角/上三角矩阵的特殊性质', mastery: 0.81, freq: 0.95, difficulty: '进阶', errors: ['分块后直接按块相乘忘记块大小匹配', '分块对角矩阵求逆时子块求逆遗漏'] },
      { id: 'tp-vec-1', parent: 'tp-vec', title: '向量概念与基础运算', desc: '列向量/行向量、加法、数乘、零向量与负向量', mastery: 0.59, freq: 0.51, difficulty: '基础', errors: ['列向量与行向量在方程组中混用', '矩阵与向量维度不一致仍运算'] },
      { id: 'tp-vec-2', parent: 'tp-vec', title: '向量线性组合与线性表示', desc: 'α 可由 β₁…βₛ 线性表示 ⇔ 存在系数使 α=Σkᵢβᵢ', mastery: 0.51, freq: 0.76, difficulty: '基础', errors: ['线性表示与线性组合判定混淆', '系数为零的线性组合也判为表示'] },
      { id: 'tp-vec-3', parent: 'tp-vec', title: '向量组等价判定', desc: '两个向量组可互相线性表示 ⇔ 等价；等价向量组同秩', mastery: 0.63, freq: 0.74, difficulty: '基础', errors: ['向量组等价条件漏掉双向', '混淆向量组等价与矩阵等价'] },
      { id: 'tp-vec-4', parent: 'tp-vec', title: '向量组线性相关/无关定义', desc: '存在不全为零系数使线性组合=0 则相关，否则无关', mastery: 0.66, freq: 0.81, difficulty: '基础', errors: ['线性相关定义漏掉"不全为零"条件', '仅含零向量的向量组误判为相关'] },
      { id: 'tp-vec-5', parent: 'tp-vec', title: '向量组线性相关性判别方法', desc: '行列式法、秩判定法（r(α₁…αₛ)<s 相关）、部分整体关系', mastery: 0.71, freq: 0.41, difficulty: '中等', errors: ['用行列式判相关性忘记向量必须是方阵', '秩判相关性公式 r<s 记错'] },
      { id: 'tp-vec-6', parent: 'tp-vec', title: '极大线性无关组求解', desc: '通过初等行变换求极大无关组，其余向量线性表示', mastery: 0.63, freq: 0.72, difficulty: '中等', errors: ['初等行变换找极大无关组后忘记补齐', '极大无关组不是唯一的陷阱'] },
      { id: 'tp-vec-7', parent: 'tp-vec', title: '向量组秩与矩阵秩关联', desc: '向量组秩 = 矩阵秩；行秩 = 列秩', mastery: 0.46, freq: 0.41, difficulty: '中等', errors: ['行秩与列秩混淆', '矩阵秩与向量组秩对应搞错'] },
      { id: 'tp-vec-8', parent: 'tp-vec', title: '向量内积与正交定义', desc: '(α,β)=αᵀβ；内积为 0 ⇔ 正交；范数 ||α||=√(α,α)', mastery: 0.88, freq: 0.39, difficulty: '中等', errors: ['内积正交条件与内积为 0 混淆', '范数公式错记'] },
      { id: 'tp-vec-9', parent: 'tp-vec', title: '施密特正交化方法', desc: '从线性无关组构造标准正交基的 Gram-Schmidt 过程', mastery: 0.44, freq: 0.47, difficulty: '进阶', errors: ['Gram-Schmidt 顺序搞反', '正交化时漏除以范数未归一化'] },
      { id: 'tp-vec-10', parent: 'tp-vec', title: '正交矩阵性质与判定', desc: 'AᵀA=E ⇔ A 是正交矩阵；列向量组为标准正交向量组', mastery: 0.42, freq: 0.81, difficulty: '进阶', errors: ['正交矩阵判定忘记 AᵀA=E', '正交矩阵的特征值模长未记住为 1'] },
      { id: 'tp-eq-1', parent: 'tp-eq', title: '齐次线性方程组解的性质与结构', desc: 'AX=0 的解构成向量空间，维数 = n-r(A)；基础解系张成解空间', mastery: 0.42, freq: 0.91, difficulty: '基础', errors: ['解空间维数公式记错', '基础解系个数搞错'] },
      { id: 'tp-eq-2', parent: 'tp-eq', title: '非齐次线性方程组解的性质与结构', desc: '通解 = 特解 + 齐次通解；解集是仿射子空间', mastery: 0.65, freq: 0.81, difficulty: '基础', errors: ['通解 = 特解 + 齐次通解漏写', '非齐次特解构造遗漏'] },
      { id: 'tp-eq-3', parent: 'tp-eq', title: '线性方程组解的存在性判定', desc: 'r(A)=r(A|b) 有解；r(A)=r(A|b)=n 唯一解；<n 无穷多解', mastery: 0.54, freq: 0.77, difficulty: '基础', errors: ['含参方程组分类讨论遗漏 a 值', 'r(A)=r(A|b) 判定方向记反'] },
      { id: 'tp-eq-4', parent: 'tp-eq', title: '初等行变换解方程组', desc: '增广矩阵行变换化行最简形，直接读出解或通解', mastery: 0.58, freq: 0.63, difficulty: '中等', errors: ['行变换化简时漏乘公因子', '增广矩阵与系数矩阵混淆'] },
      { id: 'tp-eq-5', parent: 'tp-eq', title: '方程组公共解与同解问题', desc: '两个方程组的公共解、同解性判断，利用解空间包含关系', mastery: 0.61, freq: 0.94, difficulty: '中等', errors: ['公共解判定时方程组叠加错误', '同解问题忘记利用解空间包含关系'] },
      { id: 'tp-eq-6', parent: 'tp-eq', title: '矩阵与方程组的关联应用', desc: 'AX=b 与秩/逆/特征值结合，矩阵方程的综合问题', mastery: 0.45, freq: 0.79, difficulty: '进阶', errors: ['综合题中矩阵方程与方程组混为一谈', 'AX=b 解的唯一性条件搞错'] },
      { id: 'tp-eig-1', parent: 'tp-eig', title: '特征值与特征向量定义及性质', desc: 'Av=λv（v≠0）；特征值之和=迹、之积=行列式', mastery: 0.32, freq: 0.77, difficulty: '基础', errors: ['Av=λv 中漏掉 v≠0 条件', '特征值是标量而非向量搞混'] },
      { id: 'tp-eig-2', parent: 'tp-eig', title: '特征值与特征向量求解方法', desc: '解特征方程 det(λE-A)=0 得 λ，再解 (λE-A)x=0 得特征向量', mastery: 0.65, freq: 0.86, difficulty: '中等', errors: ['特征方程 det(λE-A) 写成 det(A-λE)', '特征向量只找一个导致丢失'] },
      { id: 'tp-eig-3', parent: 'tp-eig', title: '相似矩阵概念与核心性质', desc: 'A~B ⇔ P⁻¹AP=B；相似矩阵特征值相同、秩相同、迹相同', mastery: 0.51, freq: 0.94, difficulty: '中等', errors: ['相似矩阵 P⁻¹AP 写成 PᵀAP', '忘记相似矩阵特征值相同性质'] },
      { id: 'tp-eig-4', parent: 'tp-eig', title: '方阵可对角化判定条件', desc: '存在 n 个线性无关特征向量 ⇔ 可对角化；重特征值注意几何重数', mastery: 0.34, freq: 0.93, difficulty: '进阶', errors: ['重特征值只找一个特征向量致不可对角化', '几何重数与代数重数关系搞混'] },
      { id: 'tp-eig-5', parent: 'tp-eig', title: '矩阵相似对角化运算', desc: 'A=PΛP⁻¹，P 由特征向量构成，Λ 由特征值构成', mastery: 0.21, freq: 0.77, difficulty: '进阶', errors: ['对角化矩阵 P 列的顺序与 Λ 顺序未对应', 'P⁻¹ 求解错误'] },
      { id: 'tp-eig-6', parent: 'tp-eig', title: '实对称矩阵专属性质', desc: '特征值全实、可正交对角化、不同特征值对应特征向量正交', mastery: 0.61, freq: 0.81, difficulty: '中等', errors: ['实对称矩阵忘记可正交对角化', '不同特征值对应特征向量正交性漏用'] },
      { id: 'tp-eig-7', parent: 'tp-eig', title: '对角化求矩阵幂与矩阵', desc: 'Aⁿ=PΛⁿP⁻¹ 高效计算；逆矩阵、多项式也可用特征分解', mastery: 0.27, freq: 0.81, difficulty: '进阶', errors: ['Aⁿ=PΛⁿP⁻¹ 公式 P 和 P⁻¹ 写反', '矩阵多项式计算时相似变换遗漏'] },
      { id: 'tp-qf-1', parent: 'tp-qf', title: '二次型定义与矩阵表示', desc: 'f(x)=xᵀAx，A 是对称矩阵，与二次型一一对应', mastery: 0.77, freq: 0.77, difficulty: '基础', errors: ['二次型对应矩阵取非对称部分导致错误', 'f(x)=xᵀAx 中 A 不是对称矩阵'] },
      { id: 'tp-qf-2', parent: 'tp-qf', title: '矩阵合同概念与判定', desc: 'A~c B ⇔ 存在可逆 C 使 CᵀAC=B；合同矩阵有相同的秩与惯性指数', mastery: 0.41, freq: 0.85, difficulty: '中等', errors: ['合同矩阵 CᵀAC 写成 P⁻¹AP', '合同变换与相似变换搞混'] },
      { id: 'tp-qf-3', parent: 'tp-qf', title: '等价/相似/合同矩阵三者区分', desc: '等价 PAQ=B；相似 P⁻¹AP=B；合同 CᵀAC=B，三者条件递进', mastery: 0.78, freq: 0.58, difficulty: '中等', errors: ['等价/相似/合同三者条件搞混', '三者包含关系搞错'] },
      { id: 'tp-qf-4', parent: 'tp-qf', title: '二次型标准形求解', desc: '用正交变换或配方法化为 d₁y₁²+…+dₙyₙ² 的标准形', mastery: 0.38, freq: 0.81, difficulty: '中等', errors: ['正交变换化标准形时忘记 Q 是正交矩阵', '特征向量未正交化直接代入'] },
      { id: 'tp-qf-5', parent: 'tp-qf', title: '正交变换化二次型标准形', desc: '正交矩阵 Q 使 QᵀAQ=diag(λ₁,…,λₙ)，系数即特征值', mastery: 0.5, freq: 0.8, difficulty: '进阶', errors: ['正交变换化标准形时 QᵀQ≠E 错误', '配方顺序与初等变换对应错位'] },
      { id: 'tp-qf-6', parent: 'tp-qf', title: '配方法化简二次型', desc: '逐变量配方化为平方和；可读正负惯性指数与规范形', mastery: 0.35, freq: 0.8, difficulty: '中等', errors: ['配方时漏配平方项', '规范形中 +1/-1/0 个数计算错'] },
      { id: 'tp-qf-7', parent: 'tp-qf', title: '正定二次型与正定矩阵判定', desc: '特征值全正 ⇔ 顺序主子式全正 ⇔ xᵀAx>0 (x≠0)', mastery: 0.69, freq: 0.83, difficulty: '进阶', errors: ['正定判定只看特征值全正漏顺序主子式判据', '半正定 vs 正定（含 0 特征值）混淆'] }
    ],
    edges: [
      { source: 'tp-det-1', target: 'tp-mat-7', type: 'solid', label: '强前置' },
      { source: 'tp-det-4', target: 'tp-mat-11', type: 'solid', label: '强前置' },
      { source: 'tp-mat-6', target: 'tp-eq-3', type: 'solid', label: '强前置' },
      { source: 'tp-mat-11', target: 'tp-eq-3', type: 'solid', label: '强前置' },
      { source: 'tp-mat-9', target: 'tp-eq-4', type: 'solid', label: '强前置' },
      { source: 'tp-mat-3', target: 'tp-eig-5', type: 'solid', label: '强前置' },
      { source: 'tp-mat-8', target: 'tp-eig-2', type: 'solid', label: '强前置' },
      { source: 'tp-eig-2', target: 'tp-qf-5', type: 'solid', label: '强前置' },
      { source: 'tp-eig-4', target: 'tp-qf-7', type: 'solid', label: '强前置' },
      { source: 'tp-eig-5', target: 'tp-qf-5', type: 'solid', label: '强前置' },
      { source: 'tp-vec-4', target: 'tp-eq-1', type: 'solid', label: '强前置' },
      { source: 'tp-vec-6', target: 'tp-eq-1', type: 'solid', label: '强前置' },
      { source: 'tp-mat-2', target: 'tp-vec-2', type: 'solid', label: '强前置' },
      { source: 'tp-det-2', target: 'tp-det-4', type: 'dashed', label: '关联' },
      { source: 'tp-det-3', target: 'tp-det-5', type: 'dashed', label: '关联' },
      { source: 'tp-mat-1', target: 'tp-mat-2', type: 'dashed', label: '关联' },
      { source: 'tp-mat-4', target: 'tp-mat-7', type: 'dashed', label: '关联' },
      { source: 'tp-mat-5', target: 'tp-mat-6', type: 'dashed', label: '关联' },
      { source: 'tp-mat-2', target: 'tp-mat-3', type: 'dashed', label: '关联' },
      { source: 'tp-mat-9', target: 'tp-mat-10', type: 'dashed', label: '关联' },
      { source: 'tp-vec-2', target: 'tp-vec-4', type: 'dashed', label: '关联' },
      { source: 'tp-vec-7', target: 'tp-vec-6', type: 'dashed', label: '关联' },
      { source: 'tp-vec-8', target: 'tp-vec-9', type: 'dashed', label: '关联' },
      { source: 'tp-eq-1', target: 'tp-eq-2', type: 'dashed', label: '关联' },
      { source: 'tp-eig-1', target: 'tp-eig-2', type: 'dashed', label: '关联' },
      { source: 'tp-eig-3', target: 'tp-eig-4', type: 'dashed', label: '关联' },
      { source: 'tp-qf-1', target: 'tp-qf-4', type: 'dashed', label: '关联' },
      { source: 'tp-qf-2', target: 'tp-qf-3', type: 'dashed', label: '关联' },
    ],
    getLevel2ByL1(l1id) { return this.level2.filter(k => k.parent === l1id); },

    /**
     * 三级易错点完整映射表（key = 二级知识点 ID，value = 该知识点下的全部易错点）
     * 共 112 条：行列式 12 / 矩阵 28 / 向量空间 22 / 线性方程组 18 / 特征值 18 / 二次型 14
     */
    mistakes: {
      // ═══ 行列式（12 条）═══
      'tp-det-1': ['逆序数奇偶判断错误', 'n阶行列式定义展开项数混淆'],
      'tp-det-2': ['余子式与代数余子式符号遗忘', '代数余子式行列下标对应错误'],
      'tp-det-3': ['行列式数乘与矩阵数乘混淆（行列式仅单行乘系数）', '行列式行互换变号遗忘', '倍加变换行列式值变化误区', '对称/反对称行列式性质误用', '零行列式判定条件混淆'],
      'tp-det-4': ['分块行列式展开公式乱用'],
      'tp-det-5': ['爪型、范德蒙德行列式公式记错'],
      'tp-det-6': ['克拉默法则适用条件遗忘（系数行列式非零、仅适用于n阶方阵方程组）'],

      // ═══ 矩阵（28 条）═══
      'tp-mat-1': ['数量矩阵、单位矩阵、零矩阵性质混淆'],
      'tp-mat-2': ['矩阵乘法交换律乱用（AB≠BA默认成立）', '矩阵乘法行列对应位置计算错误', '零矩阵相乘非零误区'],
      'tp-mat-3': ['方阵幂运算指数规则混淆', '幂零矩阵、幂等矩阵性质混淆'],
      'tp-mat-4': ['转置矩阵与原矩阵维度混淆', '(AB)ᵀ=AᵀBᵀ公式记错', '对称矩阵、反对称矩阵判定失误'],
      'tp-mat-5': ['伴随矩阵公式A*=|A|A⁻¹适用条件遗忘', '二阶伴随矩阵主对调副变号规则滥用（高阶不适用）', '伴随矩阵秩的三种情况判定失误'],
      'tp-mat-6': ['逆矩阵运算律(AB)⁻¹=B⁻¹A⁻¹记错'],
      'tp-mat-7': ['逆矩阵存在条件混淆（非零行列式≠可逆）', '可逆矩阵判定等价条件遗漏', '满秩、降秩、行满秩、列满秩概念混淆'],
      'tp-mat-8': ['矩阵方程AX=B与XA=B求解顺序混淆'],
      'tp-mat-9': ['初等行变换与列变换混用导致等价性错误', '初等变换求逆矩阵步骤出错'],
      'tp-mat-10': ['初等方阵左行右列规则遗忘', '矩阵等价、相似、合同概念混淆'],
      'tp-mat-11': ['秩的定义理解偏差（非零行/列向量极大无关数）', '秩的基本不等式r(AB)≤min(r(A),r(B))误用', 'r(A+B)≤r(A)+r(B)不等式乱用', '矩阵秩与行列式是否为零的对应关系混淆', '矩阵迹的运算规则遗忘'],
      'tp-mat-12': ['分块矩阵乘法维度不匹配计算错误', '分块对角矩阵幂运算规则记错'],

      // ═══ 向量空间（22 条）═══
      'tp-vec-1': ['向量空间维度、基向量个数混淆', '子空间判定条件遗漏'],
      'tp-vec-2': ['向量线性表示存在条件判定错误', '单向量与向量组等价概念混淆', '向量坐标计算对应基向量错位'],
      'tp-vec-3': ['向量组等价与矩阵等价混用', '过渡矩阵求解方向错误', '基变换与坐标变换公式记错'],
      'tp-vec-4': ['含零向量的向量组相关性判断失误'],
      'tp-vec-5': ['向量个数＞向量维度必相关结论误用', '部分组相关则整体相关、整体无关则部分无关逆命题乱用'],
      'tp-vec-6': ['极大线性无关组选取不唯一误区、漏选向量'],
      'tp-vec-7': ['极大无关组向量个数即为秩的概念混淆', '向量组秩与对应矩阵秩不对应计算错误', '两向量组秩相等不等价误区'],
      'tp-vec-8': ['向量内积运算顺序错误', '零向量内积判定失误', '向量正交与线性无关关系混淆（正交必无关、无关不一定正交）'],
      'tp-vec-9': ['施密特正交化步骤顺序颠倒', '正交化后未单位化导致出错'],
      'tp-vec-10': ['正交矩阵行列向量单位正交性验证遗漏', '正交矩阵行列式只能为±1结论遗忘'],

      // ═══ 线性方程组（18 条）═══
      'tp-eq-1': ['齐次方程组必有零解、非齐次未必有解概念混淆', '自由未知量个数计算错误（未知量数-秩）', '自由未知量选取随意导致基础解系出错', '齐次方程组解空间与矩阵零空间概念脱节', '方程组解空间维度计算错误'],
      'tp-eq-2': ['非齐次方程组有解充要条件r(A)=r(Ā)遗忘', '非齐次特解+齐次通解结构缺失', '非齐次解的差为齐次解、两齐次解和仍为齐次解性质误用', '齐次通解结构书写不规范'],
      'tp-eq-3': ['秩相等但无解的特殊情况误判', '无穷多解、唯一解、无解判定条件混淆', '含参方程组参数讨论遗漏临界值'],
      'tp-eq-4': ['初等行变换化简阶梯形出错（首元列不规整）', '行最简形与阶梯形混淆导致求解错误'],
      'tp-eq-5': ['两个方程组同解的充要条件判定失误', '公共解求解方法混淆（联立求解/基础解系交集）'],
      'tp-eq-6': ['基础解系向量个数公式记错', '基础解系向量线性无关性验证遗漏'],

      // ═══ 特征值与特征向量（18 条）═══
      'tp-eig-1': ['特征向量非零条件忽略（零向量不是特征向量）', '特征值与特征向量对应关系匹配错位'],
      'tp-eig-2': ['特征方程|λE-A|=0写错符号', '特征值求解展开计算失误'],
      'tp-eig-3': ['相似矩阵定义与判定条件混淆', '相似矩阵行列式、秩、迹相等逆命题乱用'],
      'tp-eig-4': ['不同特征值对应特征向量线性无关性质遗忘', '重特征值对应线性无关特征向量个数误判', 'n阶矩阵可对角化充要条件遗忘（n个线性无关特征向量）', '重根几何重数=代数重数条件遗漏'],
      'tp-eig-5': ['对角化矩阵P、Λ对应顺序错位', 'P矩阵由特征向量拼接但未单位化误区（普通对角化无需单位化）'],
      'tp-eig-6': ['实对称矩阵必可对角化性质遗忘', '实对称矩阵不同特征值向量正交性质误用', '正交对角化与普通对角化混淆'],
      'tp-eig-7': ['利用对角化求矩阵高次幂计算步骤出错', '零特征值、重特征值性质遗漏', '矩阵迹=特征值和、行列式=特征值积公式记错'],

      // ═══ 二次型（14 条）═══
      'tp-qf-1': ['二次型矩阵写错（二次项系数对半分）', '二次型矩阵非对称导致错误'],
      'tp-qf-2': ['合同矩阵秩必相等逆命题乱用'],
      'tp-qf-3': ['矩阵相似、合同、等价三者判定标准混淆'],
      'tp-qf-4': ['二次型标准形不唯一、规范形唯一概念混淆'],
      'tp-qf-5': ['正交变换化标准形步骤出错', '正交变换保持向量长度、内积性质遗忘'],
      'tp-qf-6': ['配方法配方不彻底、漏项', '正负惯性指数计算错误', '惯性定理内容遗忘'],
      'tp-qf-7': ['正定二次型五个等价条件混用', '顺序主子式判定正定遗忘（全部大于0）', '负定、半正定、半负定判定条件混淆', '二次型最值求解条件遗漏']
    },

    /**
     * 拓扑三级知识点 → 知识体系目录 关联映射（与侧边「知识体系」目录数据 ID 完全一致）
     * - chapterId：所属一级章节 ID（ch1~ch6，对应 KnowledgeBase.chapters[].id）
     * - sectionId ：所属二级大节 ID（如 det-definition，对应 chapters[].sections[].id）
     * - knowledgeId：三级知识点唯一 ID（即 level2 节点自身 id，如 tp-det-1）
     * 用途：拓扑图谱【开始学习】按钮 → 知识体系页面自动展开/定位/高亮
     */
    binding: {
      // ═══ 第一章 行列式 ═══
      'tp-det-1': { chapterId: 'ch1', sectionId: 'det-definition' },   // 行列式定义与逆序数
      'tp-det-2': { chapterId: 'ch1', sectionId: 'det-expansion' },   // 余子式与代数余子式
      'tp-det-3': { chapterId: 'ch1', sectionId: 'det-properties' },  // 行列式核心性质
      'tp-det-4': { chapterId: 'ch1', sectionId: 'det-expansion' },   // 展开定理
      'tp-det-5': { chapterId: 'ch1', sectionId: 'det-properties' },  // 计算方法
      'tp-det-6': { chapterId: 'ch1', sectionId: 'det- cramers' },     // 克拉默法则（注意：原数据 section id 含空格，保持一致）
      // ═══ 第二章 矩阵 ═══
      'tp-mat-1':  { chapterId: 'ch2', sectionId: 'matrix-definition' },  // 概念与线性运算
      'tp-mat-2':  { chapterId: 'ch2', sectionId: 'matrix-operations' },  // 乘法
      'tp-mat-3':  { chapterId: 'ch2', sectionId: 'matrix-operations' },  // 方阵幂
      'tp-mat-4':  { chapterId: 'ch2', sectionId: 'matrix-operations' },  // 转置
      'tp-mat-5':  { chapterId: 'ch2', sectionId: 'matrix-inverse' },     // 伴随矩阵
      'tp-mat-6':  { chapterId: 'ch2', sectionId: 'matrix-inverse' },     // 逆矩阵
      'tp-mat-7':  { chapterId: 'ch2', sectionId: 'matrix-inverse' },     // 可逆性判定
      'tp-mat-8':  { chapterId: 'ch2', sectionId: 'matrix-inverse' },     // 矩阵方程
      'tp-mat-9':  { chapterId: 'ch2', sectionId: 'elementary-matrix' },  // 初等变换
      'tp-mat-10': { chapterId: 'ch2', sectionId: 'elementary-matrix' },  // 初等方阵与等价
      'tp-mat-11': { chapterId: 'ch2', sectionId: 'matrix-rank' },        // 秩
      'tp-mat-12': { chapterId: 'ch2', sectionId: 'matrix-operations' },  // 分块矩阵
      // ═══ 第三章 向量与线性方程组 ═══
      'tp-vec-2':  { chapterId: 'ch3', sectionId: 'vector-linear' },  // 线性组合与表示
      'tp-vec-4':  { chapterId: 'ch3', sectionId: 'vector-linear' },  // 线性相关/无关
      'tp-vec-5':  { chapterId: 'ch3', sectionId: 'vector-linear' },  // 相关性判别
      'tp-vec-6':  { chapterId: 'ch3', sectionId: 'vector-linear' },  // 极大无关组
      'tp-vec-7':  { chapterId: 'ch3', sectionId: 'vector-linear' },  // 向量组秩
      'tp-eq-1':   { chapterId: 'ch3', sectionId: 'linear-systems' }, // 齐次方程组
      'tp-eq-2':   { chapterId: 'ch3', sectionId: 'linear-systems' }, // 非齐次方程组
      'tp-eq-3':   { chapterId: 'ch3', sectionId: 'linear-systems' }, // 解的存在性判定
      'tp-eq-4':   { chapterId: 'ch3', sectionId: 'linear-systems' }, // 行变换解方程组
      'tp-eq-5':   { chapterId: 'ch3', sectionId: 'linear-systems' }, // 公共解与同解
      'tp-eq-6':   { chapterId: 'ch3', sectionId: 'linear-systems' }, // 关联应用
      // ═══ 第四章 特征值与特征向量 ═══
      'tp-eig-1': { chapterId: 'ch4', sectionId: 'eigenvalue' },        // 定义及性质
      'tp-eig-2': { chapterId: 'ch4', sectionId: 'eigenvalue' },        // 求解方法
      'tp-eig-3': { chapterId: 'ch4', sectionId: 'diagonalization' },   // 相似矩阵
      'tp-eig-4': { chapterId: 'ch4', sectionId: 'diagonalization' },   // 可对角化判定
      'tp-eig-5': { chapterId: 'ch4', sectionId: 'diagonalization' },   // 相似对角化运算
      'tp-eig-6': { chapterId: 'ch4', sectionId: 'real-symmetric' },    // 实对称矩阵
      'tp-eig-7': { chapterId: 'ch4', sectionId: 'diagonalization' },   // 对角化求幂
      // ═══ 第五章 二次型 ═══
      'tp-qf-1': { chapterId: 'ch5', sectionId: 'quadratic-form' },   // 定义与矩阵表示
      'tp-qf-2': { chapterId: 'ch5', sectionId: 'quadratic-form' },   // 合同
      'tp-qf-3': { chapterId: 'ch5', sectionId: 'quadratic-form' },   // 等价/相似/合同
      'tp-qf-4': { chapterId: 'ch5', sectionId: 'quadratic-form' },   // 标准形求解
      'tp-qf-5': { chapterId: 'ch5', sectionId: 'quadratic-form' },   // 正交变换
      'tp-qf-6': { chapterId: 'ch5', sectionId: 'quadratic-form' },   // 配方法
      'tp-qf-7': { chapterId: 'ch5', sectionId: 'positive-definite' },// 正定判定
      // ═══ 第六章 向量空间 ═══
      'tp-vec-1':  { chapterId: 'ch6', sectionId: 'vector-space' }, // 向量概念与基础
      'tp-vec-3':  { chapterId: 'ch6', sectionId: 'vector-space' }, // 向量组等价
      'tp-vec-8':  { chapterId: 'ch6', sectionId: 'vector-space' }, // 内积与正交
      'tp-vec-9':  { chapterId: 'ch6', sectionId: 'vector-space' }, // 施密特正交化
      'tp-vec-10': { chapterId: 'ch6', sectionId: 'vector-space' }  // 正交矩阵
    }
  },
};
