"""routes_self_path.py —— 自进化训练状态、自适应学习路径（原 backend/main.py 第 7065–7218 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ─── API: 自进化训练引擎状态（数据飞轮 · 离线挂机自训练） ───

@app.get("/api/self_train/status")
def self_train_status():
    """返回自进化训练引擎的运行状态：轮次/训练库/语料库/最近快照/是否运行中。"""
    base = PROJECT_ROOT
    state = {}
    try:
        with open(os.path.join(base, "self_train_state.json"), "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        pass
    td_path = os.path.join(DATA_DIR, "training_data.json")
    corpus_path = os.path.join(DATA_DIR, "knowledge_corpus.json")
    try:
        td = json.load(open(td_path, "r", encoding="utf-8"))
        td_count = len(td)
        self_trained = sum(1 for t in td if t.get("source") == "self-train")
    except Exception:
        td_count, self_trained = 0, 0
    try:
        corpus = json.load(open(corpus_path, "r", encoding="utf-8"))
        corpus_count = len(corpus.get("passages", []))
        self_corpus = sum(1 for p in corpus.get("passages", []) if "自进化" in str(p.get("source", "")))
    except Exception:
        corpus_count, self_corpus = 0, 0
    versions = []
    try:
        vdir = os.path.join(base, "model_versions")
        versions = sorted(os.listdir(vdir))[-10:][::-1] if os.path.isdir(vdir) else []
    except Exception:
        pass
    return {
        "ok": True,
        "running": bool(state.get("running")),
        "round": state.get("round", 0),
        "updated": state.get("updated", ""),
        "last_version": state.get("last_version", ""),
        "training_count": td_count,
        "self_trained_count": self_trained,
        "corpus_count": corpus_count,
        "self_corpus_count": self_corpus,
        "recent_versions": versions,
    }


# ─── API: 自适应学习路径 ───

# v=20260904i 知识点/任务名清洗:过滤误入的论文标题、文献条目等脏数据




def _clean_kp_list(items):
    """过滤列表/字典中的脏知识点。items 可为 [str] 或 [dict(kp=...)]。"""
    out = []
    for it in items:
        name = it.get("kp", it) if isinstance(it, dict) else it
        if _is_dirty_kp(name):
            continue
        out.append(it)
    return out


@app.get("/api/student/path")
def student_path(user: dict = __import__('fastapi').Depends(require_user), threshold: float = 60.0):
    """返回自适应学习路径：按前置依赖拓扑排序的推荐知识点列表。"""
    import json as _json
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    rows = db.execute("SELECT knowledge_point, mastery_score, attempts FROM knowledge_mastery WHERE user_id = ?", (user["id"],)).fetchall()
    # v=20260904i 过滤论文标题/文献类脏知识点
    rows = [r for r in rows if not _is_dirty_kp(r[0])]
    mastery_map = {r[0]: r[1] for r in rows}
    attempts_map = {r[0]: r[2] for r in rows}
    # 补充未练习 KP
    for kp in kg.KP_TO_CHAPTER:
        if kp not in mastery_map:
            mastery_map[kp] = 50.0
            attempts_map[kp] = 0

    # 找出薄弱点
    weak = [kp for kp, s in mastery_map.items() if s < threshold]

    # 用 BFS 按前置依赖排序
    in_degree = {kp: 0 for kp in mastery_map}
    adj = {kp: [] for kp in mastery_map}
    for child, parents in kg.PREREQS.items():
        for p in parents:
            if p in adj: adj[p].append(child)
            if child in in_degree: in_degree[child] += 1

    # 优先推荐薄弱点的前置依赖
    from collections import deque as _deque
    q = _deque()
    for kp in mastery_map:
        if in_degree.get(kp, 0) == 0:
            q.append(kp)

    visited = set()
    path = []
    while q:
        node = q.popleft()
        if node in visited: continue
        visited.add(node)
        ch = kg.KP_TO_CHAPTER.get(node, "")
        # 仅当该节点是薄弱点或薄弱点依赖时才入路径
        include = node in weak
        if not include:
            for child in adj.get(node, []):
                if child in weak:
                    include = True
                    break
        if include:
            path.append({
                "kp": node, "chapter": ch, "mastery": round(mastery_map.get(node, 50), 1),
                "attempts": attempts_map.get(node, 0),
                "status": "weak" if node in weak else "prerequisite",
                "priority": round((100 - mastery_map.get(node, 50)) / 10, 1),
            })
        for child in adj.get(node, []):
            in_degree[child] -= 1
            if in_degree[child] == 0:
                q.append(child)

    path.sort(key=lambda x: (-x["priority"], -x["mastery"]))

    # 建议练习类型（基于 learning_style）
    row = db.execute("SELECT learning_style FROM student_profiles WHERE user_id = ?", (user["id"],)).fetchone()
    style = _json.loads(row[0]) if row else {}
    top_style = max(style, key=style.get) if style else "practice"
    type_map = {"visual": "建议使用几何可视化", "reading": "建议查阅教材与知识体系", "practice": "建议刷题练习", "theory": "建议概念问答"}
    suggestion = type_map.get(top_style, "建议刷题练习")

    return {"path": path, "suggestion": suggestion, "style": top_style, "total_mastered": sum(1 for s in mastery_map.values() if s >= threshold)}


