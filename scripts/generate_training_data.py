"""
线性代数 AI 助手训练数据生成器 v1.0
=====================================
从知识库自动抽取 QA 对，用于评估和优化 System Prompt。
生成的数据集可人工审核后用于 Few-shot 示例或模型微调。

用法：python scripts/generate_training_data.py
输出：training/generated_training_data.json（初始QA示例集；不覆盖当前训练库）
"""

from pathlib import Path

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)

import argparse
import json
import os

# 手动构建的高质量 Few-shot 训练集（覆盖 6 大章节核心题型）
TRAINING_DATA = [
    # ===== 第一章 行列式 =====
    {
        "chapter": "第一章 行列式",
        "section": "行列式的定义",
        "difficulty": "基础",
        "question": "计算二阶行列式 |3 1; 2 4|",
        "answer": "对于二阶矩阵 A = [[3,1],[2,4]]，行列式 det(A) = 3×4 - 1×2 = 12 - 2 = 10。",
        "key_points": ["二阶行列式公式", "主对角线减副对角线"],
        "common_mistakes": ["忘记是减号", "混淆行列式和矩阵"]
    },
    {
        "chapter": "第一章 行列式",
        "section": "行列式的性质",
        "difficulty": "中等",
        "question": "已知 |A|=5，将 A 的第一行乘以 3 加到第二行，新行列式的值是多少？",
        "answer": "根据行列式性质（倍加不变性），将某行的 k 倍加到另一行，行列式值不变。因此新行列式仍为 5。",
        "key_points": ["倍加不变性", "行变换对行列式的影响"],
        "common_mistakes": ["误以为值会变化", "混淆行列式与矩阵的初等变换"]
    },
    {
        "chapter": "第一章 行列式",
        "section": "克莱姆法则",
        "difficulty": "中等",
        "question": "用克莱姆法则解方程组：x+y=3, 2x-y=0",
        "answer": "系数行列式 D = |1 1; 2 -1| = -1-2 = -3。D₁ = |3 1; 0 -1| = -3。D₂ = |1 3; 2 0| = -6。x = D₁/D = 1, y = D₂/D = 2。验证：1+2=3, 2-2=0 ✓。",
        "key_points": ["克莱姆法则适用条件", "D≠0 时有唯一解"],
        "common_mistakes": ["忘记 D≠0 的前提", "Dⱼ 的构造方式"]
    },

    # ===== 第二章 矩阵 =====
    {
        "chapter": "第二章 矩阵",
        "section": "矩阵的运算",
        "difficulty": "基础",
        "question": "计算矩阵乘法：[[1,2],[3,4]] × [[1,0],[0,1]]",
        "answer": "A 是 2×2，B 是 2×2（单位矩阵），乘积 C = AB。c₁₁ = 1×1+2×0 = 1, c₁₂ = 1×0+2×1 = 2, c₂₁ = 3×1+4×0 = 3, c₂₂ = 3×0+4×1 = 4。结果仍是 [[1,2],[3,4]]，因为乘以单位矩阵不变。",
        "key_points": ["矩阵乘法定义", "单位矩阵的性质"],
        "common_mistakes": ["行×列的顺序", "A的列数必须等于B的行数"]
    },
    {
        "chapter": "第二章 矩阵",
        "section": "逆矩阵",
        "difficulty": "中等",
        "question": "判断矩阵 [[1,2],[3,4]] 是否可逆，若可逆求其逆矩阵。",
        "answer": "先求行列式：det = 1×4-2×3 = -2 ≠ 0，所以可逆。伴随矩阵法：A* = [[4,-2],[-3,1]]。A⁻¹ = A*/det = [[-2,1],[1.5,-0.5]]。验证：AA⁻¹ = [[1,2],[3,4]]×[[-2,1],[1.5,-0.5]] = [[1,0],[0,1]] ✓。",
        "key_points": ["可逆的充要条件 det≠0", "伴随矩阵法求逆"],
        "common_mistakes": ["忘记除以行列式", "伴随矩阵元素符号错误"]
    },
    {
        "chapter": "第二章 矩阵",
        "section": "矩阵的秩",
        "difficulty": "中等",
        "question": "求矩阵 [[1,2,3],[2,4,6],[3,6,9]] 的秩。",
        "answer": "观察：第二行 = 第一行×2，第三行 = 第一行×3，所有行成比例。化为阶梯形：r2-2r1→(0,0,0), r3-3r1→(0,0,0)。非零行只有1行，故 r(A) = 1。几何意义：该矩阵将3维空间压缩到1维直线。",
        "key_points": ["秩的定义", "初等行变换求秩", "行成比例→秩为1"],
        "common_mistakes": ["误以为秩等于行数", "行列式为零不代表秩为零"]
    },

    # ===== 第三章 向量与线性方程组 =====
    {
        "chapter": "第三章 向量与线性方程组",
        "section": "向量的线性相关性",
        "difficulty": "中等",
        "question": "判断向量组 (1,2,3), (4,5,6), (7,8,9) 是否线性相关。",
        "answer": "构造矩阵并求行列式：|1 4 7; 2 5 8; 3 6 9| = 1(45-48) - 4(18-24) + 7(12-15) = -3 + 24 - 21 = 0。行列式为0，所以这三个向量线性相关。实际上 (7,8,9) = 2×(4,5,6) - (1,2,3)。",
        "key_points": ["线性相关的行列式判定法", "n个n维向量线性相关 ⇔ 行列式为0"],
        "common_mistakes": ["混淆线性相关和线性无关", "n+1个n维向量必然线性相关"]
    },
    {
        "chapter": "第三章 向量与线性方程组",
        "section": "线性方程组",
        "difficulty": "中等",
        "question": "解方程组：x+2y+z=4, 2x+y-z=1, 3x+3y=5。判断解的情况。",
        "answer": "增广矩阵：[1 2 1 | 4; 2 1 -1 | 1; 3 3 0 | 5]。r2-2r1: [1 2 1 | 4; 0 -3 -3 | -7; 3 3 0 | 5]。r3-3r1: [1 2 1 | 4; 0 -3 -3 | -7; 0 -3 -3 | -7]。r3=r2，r(A)=r([A|b])=2<3，有无穷多解。令 z=t，得 y=(7-3t)/3，x=4-2y-z=4-2(7-3t)/3-t=(3t-2)/3。即通解 (x,y,z)=(-2/3,7/3,0)+t(1,-1,1)。验算：代入第一式 (3t-2)/3+2(7-3t)/3+t=(3t-2+14-6t+3t)/3=12/3=4 ✓，第二式 2(3t-2)/3+(7-3t)/3-t=(6t-4+7-3t-3t)/3=3/3=1 ✓。t 为任意常数，t=0 时得特解 (-2/3,7/3,0)。",
        "key_points": ["增广矩阵", "秩判定解的情况", "自由变量"],
        "common_mistakes": ["不检查 r(A) 与 r([A|b]) 的关系", "遗漏自由变量"]
    },

    # ===== 第四章 特征值与特征向量 =====
    {
        "chapter": "第四章 特征值与特征向量",
        "section": "特征值与特征向量",
        "difficulty": "基础",
        "question": "求矩阵 [[2,1],[1,2]] 的特征值和特征向量。",
        "answer": "特征方程：det(A-λI) = |2-λ 1; 1 2-λ| = (2-λ)²-1 = λ²-4λ+3 = (λ-1)(λ-3) = 0。特征值：λ₁=1, λ₂=3。对 λ₁=1：解 (A-I)x=0，即 x₁+x₂=0，取 x=(1,-1)^T。对 λ₂=3：解 (A-3I)x=0，即 -x₁+x₂=0，取 x=(1,1)^T。注意两个特征向量正交（对称矩阵的性质）。",
        "key_points": ["特征方程 det(A-λI)=0", "对称矩阵特征向量正交"],
        "common_mistakes": ["忘记特征向量需要非零", "对称矩阵的特征值一定是实数"]
    },
    {
        "chapter": "第四章 特征值与特征向量",
        "section": "矩阵的相似对角化",
        "difficulty": "中等",
        "question": "矩阵 [[2,1],[1,2]] 是否可以对角化？若可以，写出对角化形式。",
        "answer": "上一题已求得特征值 λ₁=1, λ₂=3（互异），所以一定可以对角化。特征向量 p₁=(1,-1)^T, p₂=(1,1)^T。构造 P = [p₁ p₂] = [[1,1],[-1,1]]。则 P⁻¹AP = diag(1,3)。验证：det(P) = 2 ≠ 0。",
        "key_points": ["可对角化的充分条件", "特征值互异 → 可对角化", "P 由特征向量组成"],
        "common_mistakes": ["特征值有重根时不一定可对角化", "P 需要可逆"]
    },

    # ===== 第五章 二次型 =====
    {
        "chapter": "第五章 二次型",
        "section": "二次型及其标准形",
        "difficulty": "中等",
        "question": "将二次型 f(x₁,x₂) = 2x₁² + 4x₁x₂ + 2x₂² 化为标准形。",
        "answer": "写出矩阵形式：f = x^T A x，其中 A = [[2,2],[2,2]]。求 A 的特征值：det(A-λI) = (2-λ)²-4 = λ²-4λ = λ(λ-4) = 0。λ₁=0, λ₂=4。标准形：f = 0·y₁² + 4y₂² = 4y₂²。注：λ₁=0 说明该二次型是半正定的（非正定）。",
        "key_points": ["二次型的矩阵表示（对称矩阵）", "正交变换法化标准形", "特征值就是标准形的系数"],
        "common_mistakes": ["二次型矩阵必须是对称的", "混淆合同变换和相似变换"]
    },
    {
        "chapter": "第五章 二次型",
        "section": "正定二次型与正定矩阵",
        "difficulty": "基础",
        "question": "判断二次型 f(x₁,x₂) = x₁² + 3x₂² 是否正定。",
        "answer": "矩阵 A = [[1,0],[0,3]]。判定方法：1) 顺序主子式：Δ₁=1>0, Δ₂=3>0 → 正定。2) 特征值：λ₁=1>0, λ₂=3>0 → 正定。3) 对于任意非零 x，f(x) = x₁² + 3x₂² > 0 → 正定。几何意义：该二次型对应的椭圆的轴长均为正。",
        "key_points": ["正定的三种判定方法", "顺序主子式法", "特征值法"],
        "common_mistakes": ["忘记检查所有顺序主子式", "混淆正定和半正定"]
    },

    # ===== 第六章 向量空间 =====
    {
        "chapter": "第六章 向量空间",
        "section": "向量空间与线性变换",
        "difficulty": "中等",
        "question": "验证集合 V = {(x₁,x₂,x₃) | x₁+x₂+x₃=0} 是否为 R³ 的子空间。",
        "answer": "需验证：1) 零向量 (0,0,0) 满足 0+0+0=0 ✓。2) 加法封闭：设 u=(a₁,a₂,a₃), v=(b₁,b₂,b₃)∈V，则 a₁+a₂+a₃=0, b₁+b₂+b₃=0。u+v 的分量和 = (a₁+b₁)+(a₂+b₂)+(a₃+b₃)=0 ✓。3) 数乘封闭：ku 的分量和 = k(a₁+a₂+a₃)=0 ✓。所以 V 是子空间。实际上 V 是 R³ 中过原点且法向量为 (1,1,1) 的平面，dim(V)=2。",
        "key_points": ["子空间的三个条件", "加法封闭和数乘封闭"],
        "common_mistakes": ["忘记验证零向量", "混淆子空间和子集"]
    },

    # 更多题目...
    {
        "chapter": "综合",
        "section": "概念辨析",
        "difficulty": "进阶",
        "question": "矩阵的秩、行列式、特征值之间有什么关系？请系统阐述。",
        "answer": "三者都是方阵的核心数值特征：1) 行列式 det(A) ≠ 0 ⇔ 矩阵满秩 ⇔ 矩阵可逆 ⇔ 0 不是特征值。2) det(A) = 所有特征值的乘积（含代数重数）。3) 秩 = 非零特征值的个数（对可对角化矩阵成立）。4) tr(A) = 所有特征值之和。5) 若 det(A)=0，则 r(A) < n，且 0 至少是一个特征值。这些关系构成了线性代数核心理论的骨架。",
        "key_points": ["行列式 = 特征值之积", "迹 = 特征值之和", "满秩 ⇔ 可逆 ⇔ det≠0 ⇔ 0不是特征值"],
        "common_mistakes": ["这些等价关系只对方阵成立", "秩不一定等于非零特征值个数（若不可对角化）"]
    },
]

# 生成更多变体题目（自动化扩展）
def generate_variants():
    """基于模板生成计算题变体"""
    variants = []
    # 二阶行列式变体
    matrices_2x2 = [
        ([[5,2],[3,1]], -1), ([[2,3],[1,4]], 5), ([[0,1],[1,0]], -1),
        ([[3,0],[0,3]], 9), ([[1,1],[1,1]], 0), ([[2,5],[4,10]], 0),
    ]
    for mat, det_val in matrices_2x2:
        variants.append({
            "chapter": "第一章 行列式",
            "section": "行列式的定义",
            "difficulty": "基础",
            "question": f"计算行列式 |{mat[0][0]} {mat[0][1]}; {mat[1][0]} {mat[1][1]}|",
            "answer": f"det = {mat[0][0]}×{mat[1][1]} - {mat[0][1]}×{mat[1][0]} = {det_val}。",
            "key_points": ["二阶行列式计算"],
            "common_mistakes": ["符号错误"]
        })

    return variants

def main():
    data = TRAINING_DATA + generate_variants()
    parser = argparse.ArgumentParser(description="Generate the original small starter QA set without replacing the current corpus.")
    parser.add_argument("--output", default=os.path.join(PROJECT_ROOT, "training", "generated_training_data.json"))
    parser.add_argument("--force", action="store_true", help="Explicitly permit replacing an existing output")
    args = parser.parse_args()
    output_path = args.output
    if os.path.exists(output_path) and not args.force:
        parser.error("output already exists; choose a new --output or explicitly pass --force")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 训练数据集已生成：{output_path}")
    print(f"   共 {len(data)} 个 QA 对")
    print(f"   覆盖章节：", sorted(set(d["chapter"] for d in data)))

if __name__ == "__main__":
    main()
