"""routes_knowledge.py —— 薄弱路径 P1、一变十题 P3、离线降级 P2、错题推荐、知识图谱（原 backend/main.py 第 6187–6615 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ───────── v=20260869 薄弱路径 P1 ─────────
@app.get("/api/mistakes/weakness_path")
def mistakes_weakness_path(user: dict = __import__('fastapi').Depends(require_user)):
    """薄弱路径:对每条错题,返回 BFS 上游链(到根)+ 最弱环节 + 补救顺序。
    供前端错题本"薄弱路径"按钮使用,可联动跳转到 topology 视图高亮整条链。"""
    db = get_db()
    rows = db.execute(
        "SELECT knowledge_point, COUNT(*) FROM mistakes WHERE user_id = ? GROUP BY knowledge_point",
        (user["id"],),
    ).fetchall()
    raw = {r[0]: r[1] for r in rows if r[0]}
    demo_mode = len(raw) == 0
    if demo_mode:
        raw = {"特征值": 2, "特征向量": 1, "行列式": 1}
    paths = []
    for kp_name, cnt in raw.items():
        kp_id = _kp_id_from_name(kp_name)
        if not kp_id:
            continue
        path = _kp_weakness_path(kp_id)
        for c in path["chain"]:
            c["name"] = c.get("name") or c["id"]
        paths.append({
            "knowledgePoint": kp_name,
            "knowledgeId": kp_id,
            "mistakeCount": cnt,
            "totalDepth": path["totalDepth"],
            "chain": path["chain"],
            "remediationOrder": path["remediationOrder"],
            "weakestId": path["weakestId"],
            "weakestName": path["weakestName"],
            "hint": path["hint"],
        })
    return {"ok": True, "demo_mode": demo_mode, "paths": paths}


# ───────── v=20260871 一变十题生成器 P3 ─────────
import random as _vrandom
_VGEN_TASKS = {"inverse", "det", "eigenvalues", "rank", "diagonalize", "qr", "svd", "nullspace", "solve_linear"}

def _vgen_random_int_matrix(n, lo=-5, hi=5, ensure_invertible=True):
    """生成 n×n 随机整数矩阵。ensure_invertible=True 时保证 det≠0(用于 inverse/eigenvalues)。"""
    import numpy as _vnp
    for _ in range(50):
        m = _vnp.array([[_vrandom.randint(lo, hi) for _ in range(n)] for _ in range(n)])
        if not ensure_invertible or abs(_vnp.linalg.det(m)) > 0.5:
            return m.tolist()
    return [[(_vrandom.randint(lo, hi)) for _ in range(n)] for _ in range(n)]


def _vgen_to_text_matrix(mat, decimals=2):
    """v=20260877 把矩阵格式化成 LaTeX bmatrix 格式,前端 KaTeX 自动渲染为专业数学矩阵"""
    def fmt(x):
        s = f"{x:.{decimals}f}".rstrip("0").rstrip(".")
        return s if s else "0"
    rows = " \\\\ ".join(" & ".join(fmt(x) for x in row) for row in mat)
    return r"\begin{bmatrix} " + rows + r" \end{bmatrix}"


def _vgen_simplify_answer(ans):
    """从 engine solve 结果抽取适合展示的答案字段(主公式 + 验证状态)。"""
    if isinstance(ans, dict):
        out = {}
        if ans.get("symbolic"):
            out["symbolic"] = ans["symbolic"]
        if ans.get("numeric"):
            out["verified"] = ans["numeric"]  # 验证消息如"数值逆最大偏差 0.00e+00"
        if ans.get("verified") is not None:
            out["verified_ok"] = bool(ans["verified"])
        if ans.get("verification_notes"):
            out["notes"] = ans["verification_notes"]
        if not out.get("symbolic") and ans.get("error"):
            out["error"] = ans["error"]
        return out
    return ans


@app.post("/api/practice/generate_variants")
def practice_generate_variants(req: dict):
    """一变十题:基于指定任务类型批量生成 N 道变式题(随机矩阵 + 引擎实时求解)。
    请求:{task: inverse/det/eigenvalues/..., count: 1-20, kp_id?: 可选知识点标签}
    返回:{variants: [{problem, answer, hint, code, kp_id, task}], count}"""
    if not isinstance(req, dict):
        try:
            req = req.dict() if hasattr(req, "dict") else dict(req)
        except Exception:
            req = {}
    task = (req.get("task") or "").strip()
    if task not in _VGEN_TASKS:
        raise HTTPException(status_code=400, detail=f"task 必须是 {_VGEN_TASKS} 之一")
    count = max(1, min(20, int(req.get("count") or 5)))
    kp_id = (req.get("kp_id") or "").strip() or None
    # 任务难度:2x2 偏简单、3x3 偏中等
    variants = []
    for i in range(count):
        size = 2 if i < count // 2 else 3  # 前半 2x2,后半 3x3
        ensure_inv = task in ("inverse", "eigenvalues", "diagonalize", "solve_linear")
        mat = _vgen_random_int_matrix(size, lo=-4, hi=4, ensure_invertible=ensure_inv)
        try:
            kwargs = {}
            if task == "solve_linear":
                b = [_vrandom.randint(-3, 3) for _ in range(size)]
                kwargs["b"] = b
            res = compute_engine.solve(task, matrix=mat, **kwargs)
        except Exception as e:
            res = {"error": str(e)}
        # 题目
        if task == "solve_linear":
            b_txt = ",".join(str(x) for x in kwargs.get("b", []))
            problem = f"求方程组 $A x = b$ 的解,其中 $A = {_vgen_to_text_matrix(mat)}$, $b = ({b_txt})^T$"
        else:
            problem = f"已知矩阵 $A = {_vgen_to_text_matrix(mat)}$,求其{_GEN_TASK_LABEL.get(task, task)}"
        # 答案
        ans = _vgen_simplify_answer(res)
        variants.append({
            "index": i + 1,
            "task": task,
            "kp_id": kp_id,
            "problem": problem,
            "answer": ans,
            "code": res.get("code", "") if isinstance(res, dict) else "",
            "hint": "可使用「可验证求解引擎」选对应任务,输入矩阵获得标准答案"
        })
    return {"ok": True, "count": len(variants), "task": task, "kp_id": kp_id, "variants": variants}


# 任务名 → 中文描述(用于变式题展示)
_GEN_TASK_LABEL = {
    "inverse": "逆矩阵 $A^{-1}$",
    "det": "行列式 $\\det A$",
    "eigenvalues": "特征值 $\\lambda$",
    "rank": "秩 $\\mathrm{rank}(A)$",
    "diagonalize": "相似对角化 $P^{-1}AP$",
    "qr": "QR 分解 $A = QR$",
    "svd": "SVD 分解 $A = USV^{\\top}$",
    "nullspace": "零空间 $\\mathcal{N}(A)$",
    "solve_linear": "$Ax = b$ 的解",
}


# ───────── v=20260870 离线降级 P2(LLM 失败时本地模板) ─────────


@app.get("/api/mistakes/recommend")
def recommend_mistakes(user: dict = __import__('fastapi').Depends(require_user), limit: int = 5):
    db = get_db()
    rows = db.execute(
        "SELECT knowledge_point FROM mistakes WHERE user_id = ?",
        (user["id"],),
    ).fetchall()
    raw = defaultdict(int)
    for r in rows:
        if r[0]:
            raw[r[0]] += 1
    if not raw:
        # 演示推荐
        weak = ["特征值", "行列式", "逆矩阵"]
    else:
        combined = kg.propagate_weakness(dict(raw))
        weak = sorted(combined, key=combined.get, reverse=True)[:5]
    # 用题库离线兜底数据找匹配题
    recs = []
    seen = set()
    for q in _QUIZ_BANK:
        kp = q.get("knowledge_point", "")
        if any(w in kp for w in weak) and kp not in seen:
            seen.add(kp)
            recs.append({
                "knowledge_point": kp,
                "question": q["question"],
                "options": q.get("options", []),
                "answer": q.get("answer", ""),
                "explanation": q.get("explanation", ""),
            })
        if len(recs) >= limit:
            break
    return {"recommendations": recs, "weak_points": weak}


@app.get("/api/knowledge/graph")
def knowledge_graph(user: dict = __import__('fastapi').Depends(require_user)):
    """返回知识点图谱：节点（含当前用户薄弱分）+ 前置依赖边。"""
    db = get_db()
    rows = db.execute("SELECT knowledge_point FROM mistakes WHERE user_id = ?", (user["id"],)).fetchall()
    raw = defaultdict(int)
    for r in rows:
        if r[0]:
            raw[r[0]] += 1
    combined = kg.propagate_weakness(dict(raw)) if raw else {}

    nodes = []
    for kp, ch in kg.KP_TO_CHAPTER.items():
        nodes.append({
            "id": kp,
            "chapter": ch,
            "weak": round(combined.get(kp, 0.0), 2),
        })
    edges = []
    for child, parents in kg.PREREQS.items():
        for p in parents:
            edges.append({"from": p, "to": child})
    chapters = list(kg.CHAPTER_KPS.keys())
    return {"nodes": nodes, "edges": edges, "chapters": chapters}


# ==================== 学生多维画像 & 自适应学习路径 ====================



