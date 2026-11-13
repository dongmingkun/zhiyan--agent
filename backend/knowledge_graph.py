"""
线性代数知识点图谱与错题归因。
用于"错题 → 知识点图谱 → 知识漏洞雷达"方案 C。
"""

from collections import defaultdict, deque

# 知识点定义：章节 -> 知识点列表
CHAPTER_KPS = {
    "行列式": ["二阶行列式", "三阶行列式", "行列式性质", "克拉默法则"],
    "矩阵及其运算": ["矩阵乘法", "逆矩阵", "矩阵的秩", "矩阵方程", "分块矩阵"],
    "向量与线性方程组": ["向量内积", "线性相关性", "向量空间", "基础解系", "解的结构"],
    "特征值与特征向量": ["特征多项式", "特征值", "特征向量", "相似对角化"],
    "二次型": ["正交变换", "二次型标准形", "正定性判定"],
    "线性空间与线性变换": ["基与维数", "过渡矩阵", "线性变换"],
}

# 知识点所属章节快速查
KP_TO_CHAPTER = {}
for ch, kps in CHAPTER_KPS.items():
    for kp in kps:
        KP_TO_CHAPTER[kp] = ch

# 前置依赖：子知识点 -> [父知识点]
# 含义：掌握 child 需要先掌握 parent
PREREQS = {
    "克拉默法则": ["二阶行列式", "三阶行列式", "行列式性质"],
    "逆矩阵": ["行列式性质", "矩阵乘法"],
    "矩阵方程": ["逆矩阵", "矩阵乘法"],
    "矩阵的秩": ["向量内积", "线性相关性"],
    # v=20260911 修正悬空前置："线性方程组求解"不在 KP_TO_CHAPTER 中（图谱里没有该节点），
    # 前置依赖链会在这里断掉；改为真实存在的"线性相关性"（求 Ax=0 基础解系需先懂线性相关/无关）。
    "基础解系": ["矩阵的秩", "线性相关性"],
    "解的结构": ["基础解系", "矩阵的秩"],
    "特征多项式": ["三阶行列式", "行列式性质"],
    "特征值": ["特征多项式", "矩阵乘法"],
    "特征向量": ["特征值", "基础解系"],
    "相似对角化": ["特征值", "特征向量", "逆矩阵"],
    "正交变换": ["向量内积", "矩阵乘法"],
    "二次型标准形": ["正交变换", "特征值"],
    "正定性判定": ["二次型标准形", "特征值"],
    "过渡矩阵": ["基与维数", "逆矩阵"],
    "线性变换": ["矩阵乘法", "基与维数"],
}

# 反向：父 -> 子
CHILDREN = defaultdict(list)
for child, parents in PREREQS.items():
    for p in parents:
        CHILDREN[p].append(child)


def get_all_kps():
    """返回所有知识点列表。"""
    return sorted(KP_TO_CHAPTER.keys())


def get_chapter_of(kp: str) -> str:
    return KP_TO_CHAPTER.get(kp, "其他")


def propagate_weakness(raw_scores: dict, decay=0.5, max_depth=3) -> dict:
    """
    把错题次数沿前置依赖向上游传播。
    raw_scores: {知识点: 错题次数}
    返回: {知识点: 综合薄弱分}
    """
    scores = defaultdict(float)
    for kp, v in raw_scores.items():
        scores[kp] += v

    # BFS 向上游传播
    for start, start_v in list(raw_scores.items()):
        queue = deque([(start, start_v, 0)])
        visited = {start}
        while queue:
            node, val, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for parent in PREREQS.get(node, []):
                if parent in visited:
                    continue
                visited.add(parent)
                added = val * (decay ** (depth + 1))
                scores[parent] += added
                queue.append((parent, start_v, depth + 1))
    return dict(scores)


# 关键词 -> 知识点（用于从题目文本自动打标）
# ⚠️ 值必须 ∈ KP_TO_CHAPTER（统一命名空间）：打标结果会被写进 mistakes.knowledge_point，
#    再由 kg.analyze / 错题回溯（core._kp_id_from_name）反查图谱与 metadata；
#    一旦出现图谱外的名字，该知识点就被静默丢弃（不在雷达图/推荐里）。
#    引擎与知识库里有、但图谱无独立节点的概念（正交投影 / 线性方程组 / SVD / QR / 通用"行列式"），
#    统一映射到最接近的真实节点，并在下面逐条注明理由。
KEYWORD_MAP = [
    ("行列式性质", ["行列式", "det", "|A|"]),          # 图谱无"行列式"父节点 → 行列式性质
    ("二阶行列式", ["2 阶", "二阶", "2x2", "2×2"]),
    ("三阶行列式", ["3 阶", "三阶", "3x3", "3×3"]),
    ("克拉默法则", ["克拉默", "Cramer"]),
    ("逆矩阵", ["逆矩阵", "inverse", "A^{-1}"]),
    ("矩阵的秩", ["秩", "rank"]),
    ("特征值", ["特征值", "eigenvalue"]),
    ("特征向量", ["特征向量", "eigenvector"]),
    # 奇异值分解（SVD）：奇异值是 AᵀA 特征值的平方根，教材中也与对角化同章 → 相似对角化
    ("相似对角化", ["对角化", "diagonalize", "SVD", "奇异值分解", "奇异值"]),
    # 正交投影 / 正交矩阵 / QR 分解都以"正交"为核心，图谱中对应节点为 正交变换
    ("正交变换", ["正交变换", "正交矩阵", "投影", "proj", "QR"]),
    ("二次型标准形", ["二次型", "quadratic"]),          # 图谱无"二次型"父节点 → 二次型标准形
    ("正定性判定", ["正定", "负定", "半正定"]),
    ("解的结构", ["方程组", "线性方程"]),               # 图谱无"线性方程组"节点 → 解的结构
    ("基础解系", ["基础解系", "nullspace"]),
    ("向量内积", ["内积", "点积", "dot"]),
    ("线性相关性", ["线性相关", "线性无关"]),
]


def infer_knowledge_points(text: str) -> list:
    """根据题目文本关键词推断相关知识点，返回最相关 1-2 个。"""
    text = text.lower()
    hits = []
    for kp, kws in KEYWORD_MAP:
        if any(kw.lower() in text for kw in kws):
            hits.append(kp)
    # 如果命中了更具体的知识点，优先保留具体的
    if "特征值" in hits and "特征向量" in hits:
        return ["特征值", "特征向量"]
    # 通用行列式（现映射为"行列式性质"）被二阶/三阶命中时让位给更具体的节点
    if "行列式性质" in hits and ("二阶行列式" in hits or "三阶行列式" in hits):
        hits = [h for h in hits if h != "行列式性质"]
    if not hits:
        return ["线性代数综合"]
    return hits[:2]


# 图谱兜底桶：若 KP_TO_CHAPTER 中定义了该节点，则图谱外的知识点并入它；否则记入 summary.unmapped
_FALLBACK_KP = "线性代数综合"


def analyze(raw_scores: dict):
    """生成雷达图数据与推荐。

    v=20260911 统一 KP 命名空间：图谱集合之外的 kp 名（历史脏数据、外部传入的自由文本）
    不再被静默丢弃 —— 有兜底桶就并入，否则集中记入 summary.unmapped 供前端/诊断展示。
    """
    raw_scores = raw_scores or {}
    all_kps = get_all_kps()
    known = set(all_kps)
    effective = defaultdict(float)
    unmapped = []
    for kp, v in raw_scores.items():
        if kp in known:
            effective[kp] += v
            continue
        unmapped.append({"knowledge_point": kp, "mistakes": int(v)})
        if _FALLBACK_KP in known:
            effective[_FALLBACK_KP] += v   # 图谱内存在兜底桶 → 并入，弱项传播不丢信息
    combined = propagate_weakness(dict(effective))
    radar = []
    for kp in all_kps:
        score = combined.get(kp, 0.0)
        radar.append({
            "knowledge_point": kp,
            "chapter": get_chapter_of(kp),
            "score": round(score, 2),
            "mistakes": int(effective.get(kp, 0)),
        })
    radar.sort(key=lambda x: x["score"], reverse=True)

    # 推荐：优先补分值高、且被多人前置依赖的知识点
    weak = [r for r in radar if r["score"] > 0]
    top = weak[:5]
    recommendations = []
    for item in top:
        kp = item["knowledge_point"]
        children = CHILDREN.get(kp, [])
        why = f"该知识点错题 {item['mistakes']} 次"
        if children:
            why += f"，且是 {', '.join(children[:3])} 的前置基础"
        prereqs = PREREQS.get(kp, [])
        recommendations.append({
            "knowledge_point": kp,
            "chapter": item["chapter"],
            "score": item["score"],
            "why": why,
            "prereqs": prereqs,
            "action": f"针对「{kp}」做 3–5 道微练习，巩固后再回头看相关综合题。",
        })
    return {
        "radar": radar,
        "weak_points": weak,
        "recommendations": recommendations,
        "summary": {
            "total_mistakes": sum(raw_scores.values()),
            "weak_kps": len(weak),
            "top_weak": top[0]["knowledge_point"] if top else None,
            # 图谱外 kp 名不再静默消失：计入 unmapped 并给出次数，供前端提示/数据修复定位
            "unmapped": unmapped,
            "unmapped_mistakes": sum(u["mistakes"] for u in unmapped),
        },
    }
