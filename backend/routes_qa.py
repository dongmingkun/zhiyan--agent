"""routes_qa.py —— 智能问答（ask/stream）、RAG 检索、工作流、计算引擎、笔记、错题 CRUD、收藏、反馈（原 backend/main.py 第 4868–6186 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

import threading


# ── 访客每日 LLM 配额（进程内）──────────────────────────────────────────────
# 无有效 token（未登录）时按客户端 IP 计数，每日上限 GUEST_DAILY_LLM_LIMIT；
# ⚠️ 这是【进程内】内存限流：重启清零、多 worker/多副本不共享（单进程部署足够，
#    若要严格跨进程请改为落库统计）。已登录用户不受此限制（其余额/计费由 core 处理）。
GUEST_DAILY_LLM_LIMIT = int(os.environ.get('GUEST_DAILY_LLM_LIMIT', '20'))
_GUEST_LLM_USAGE = {"day": "", "ips": {}}   # {"day": "YYYY-MM-DD", "ips": {client_ip: 已用次数}}
_GUEST_LLM_LOCK = threading.Lock()


def _client_ip(request) -> str:
    """取客户端 IP：优先反向代理头 X-Forwarded-For 的第一段，其次 socket 对端地址。"""
    if request is None:
        return "unknown"
    try:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip() or "unknown"
        if request.client and request.client.host:
            return request.client.host
    except Exception:
        pass
    return "unknown"


def _ask_identity(request, authorization):
    """解析问答请求的身份 → (uid, client_ip)。uid=0 表示访客（无有效 token）。

    与 require_user 用同一套解析（优先 X-Auth-Token，其次 Authorization Bearer）：
    这里不抛 401（问答允许访客试用），只回答"是否已登录"。
    """
    uid = 0
    tok = _resolve_token(authorization, request)
    if tok:
        u = get_user_by_token(tok)
        if u:
            uid = u.get("id", 0) or 0
    return uid, _client_ip(request)


def _guest_quota_hit(uid: int, client_ip: str):
    """访客每日配额计数：已登录直接放行；访客超限抛 429。

    调用点：各 LLM 接口在【真正要调用模型之前】调用一次（缓存命中/超纲引导不消耗额度）。
    """
    if uid:
        return
    import datetime as _dt
    day = _dt.date.today().isoformat()
    with _GUEST_LLM_LOCK:
        if _GUEST_LLM_USAGE["day"] != day:
            # 按日期清空 = 每日重置，同时避免字典随日期无界增长
            _GUEST_LLM_USAGE["day"] = day
            _GUEST_LLM_USAGE["ips"] = {}
        counts = _GUEST_LLM_USAGE["ips"]
        used = counts.get(client_ip, 0)
        if used >= GUEST_DAILY_LLM_LIMIT:
            raise HTTPException(status_code=429, detail="今日访客额度已用完，请登录")
        counts[client_ip] = used + 1


@app.post("/api/ask")
def ask(req: AskRequest, request: Request, authorization: Optional[str] = Header(None)):
    uid, client_ip = _ask_identity(request, authorization)
    _guest_quota_hit(uid, client_ip)   # 访客每日额度（进程内）
    client = get_client()
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    TEMPERATURE_MAP = {"direct": 0.3, "detailed": 0.5, "guided": 0.7}
    temperature = TEMPERATURE_MAP.get(req.mode, 0.3)
    system, convo, query, hits, engine_result = _ask_build_context(req)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, *convo],
            temperature=temperature,
        )
    except Exception as e:
        # ── v=20260870 P2 离线降级:LLM 失败时回退到本地模板+知识库检索,不返回 502,确保 demo/断网场景可输出 ──
        fallback_answer = _local_fallback_answer(req.question)
        return {
            "answer": fallback_answer,
            "citations": [],
            "rag_used": bool(hits),
            "engine_verified": bool(engine_result),
            "engine_task": engine_result["task"] if engine_result else None,
            "followups": [],
            "sources": [
                {"source": h["source"], "chapter": h["chapter"], "section": h["section"], "snippet": h["snippet"]}
                for h in hits
            ],
            "fallback": True,
            "fallback_reason": str(e)[:120],
        }

    # Token 消耗追踪
    usage = getattr(resp, "usage", None)
    if usage and uid:
        try:
            _consume_credits(uid, usage.prompt_tokens, usage.completion_tokens, model)
        except Exception:
            pass  # 积分扣减失败不阻断正常流程

    raw = resp.choices[0].message.content or ""
    citations = extract_citations(raw)
    body = strip_citations(raw) if citations else raw
    body = strip_ref_section(body)
    body = normalize_latex(body)
    # v=20260904 非流式也解析【快捷追问】:与流式 done 事件一致;模型没生成则空数组,前端走启发式兜底
    body, followups = _extract_followups(body)
    answer = body.strip()

    return {
        "answer": answer,
        "citations": citations,
        "rag_used": bool(hits),
        "engine_verified": bool(engine_result),
        "engine_task": engine_result["task"] if engine_result else None,
        "followups": followups,
        "sources": [
            {"source": h["source"], "chapter": h["chapter"], "section": h["section"], "snippet": h["snippet"]}
            for h in hits
        ],
    }


@app.post("/api/ask/stream")
def ask_stream(req: AskRequest, request: Request, authorization: Optional[str] = Header(None)):
    """流式回答（SSE）：逐步推送 token,显著降低"看到首字"的感知延迟。
    同时缩减 RAG/few-shot 条数并限制最大生成长度,从输入与输出两端压低真实延迟。
    v=20260922o 当 req.images 非空时,走多模态视觉模型分支(/_ask_stream_with_images)。
    v=20260824 加领域守门:非线性代数问题(广联达/股票/旅游等)直接返回友好引导答复,不消耗 LLM token。
    """
    # 身份解析（与 require_user 同一套 token 解析）：供访客配额与缓存键的用户维度使用
    uid, client_ip = _ask_identity(request, authorization)
    # v=20260922o 图片问答:走多模态视觉模型(/_ask_stream_with_images)
    if req.images:
        _guest_quota_hit(uid, client_ip)   # 视觉模型同样消耗额度
        return StreamingResponse(_ask_stream_with_images(req), media_type="text/event-stream", headers=_SSE_HEADERS)
    # v=20260824l 领域守门修复:既要查 req.question 也要从 messages 提取最后一条用户提问
    # (之前只查 req.question,前端只用 messages 传时会被静默跳过)
    _guard_q = (req.question or "").strip()
    if not _guard_q and req.messages:
        for m in reversed(req.messages):
            if m.get("role") == "user" and m.get("content"):
                _guard_q = m["content"].strip()
                break
    # v=20260904 多轮上下文门控:仅当"无历史且明显超纲"才走超纲分支。
    # 引导学习模式下,学生在回答引导问题(如"不是0""伴随矩阵是主对角线互换")属于解题过程,
    # 即便短回答无线代关键词,也绝不能进拒答分支——必须结合历史上下文放行给模型。
    _has_history = bool(req.messages and len([m for m in req.messages if m.get("role") == "user"]) >= 2)
    _multi_turn = _has_history or (req.mode == "guided")
    if _guard_q and not _multi_turn:
        related, why = _is_linalg_question(_guard_q)
        if not related:
            # v=20260908d 按 reason 分流:能力自介绍 / 友好问候 / 超纲引导,三者互不混淆
            if why == "capability":
                msg = _CAPABILITY_REPLY
            elif why == "greeting":
                msg = _pick_greeting_reply(_guard_q)
            else:
                # v=20260904 超纲只回一句自然的话,禁止能力清单与 emoji 堆砌
                msg = "这超出了线性代数的范围。不过如果你的问题里涉及矩阵、方程组之类的数学对象，可以发给我一起看看。"
            def _offtopic():
                yield "data: " + _json.dumps({"type": "started"}, ensure_ascii=False) + "\n\n"
                yield "data: " + _json.dumps({"type": "delta", "content": msg}, ensure_ascii=False) + "\n\n"
                yield "data: " + _json.dumps({
                    "type": "done", "answer": msg, "citations": [], "sources": [],
                    "rag_used": False, "engine_verified": False,
                    "offtopic": True, "offtopic_reason": why
                }, ensure_ascii=False) + "\n\n"
            return StreamingResponse(_offtopic(), media_type="text/event-stream", headers=_SSE_HEADERS)

    client = get_client()
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    TEMPERATURE_MAP = {"direct": 0.3, "detailed": 0.5, "guided": 0.7}
    temperature = TEMPERATURE_MAP.get(req.mode, 0.3)
    MAX_TOKENS = 8192  # v=20260903l 放宽上限:deepseek-v4-flash 等推理模型思考阶段消耗大量 token,过小会导致答案 token 从未产出(空回答 + 0 delta)
    # 流式场景：精简系统提示 + RAG 取 2 条 + few-shot 取 1 条，足够保真又显著缩短 prefill
    system, convo, query, hits, engine_result = _ask_build_context(req, rag_k=2, fs_k=1, lite=True)

    # v=20260911 缓存键加入用户维度：原键只有 query|mode，任何用户都能命中别人的回答
    # （串答/越权）。登录用户用 uid，访客用 client_ip（口径与访客配额一致）。
    cache_key = f"u{uid}|{query}|{req.mode}" if uid else f"g{client_ip}|{query}|{req.mode}"
    cached = _ask_cache_get(cache_key)
    if cached:
        answer, citations, sources, rag_used = cached
        answer = _flatten_matrix_to_latex(answer)  # v=20260902j 缓存也走压扁兜底
        def _cached():
            yield f"data: {_json.dumps({'type': 'started'}, ensure_ascii=False)}\n\n"
            yield f"data: {_json.dumps({'type': 'delta', 'content': answer}, ensure_ascii=False)}\n\n"
            _body, _followups = _followups_with_fallback(query, answer, req.mode, convo)  # v=20260903p 追问去重
            _done_payload = {'type': 'done', 'answer': _body, 'citations': citations, 'sources': sources, 'rag_used': rag_used, 'engine_verified': False}
            if _followups:
                _done_payload['followups'] = _followups  # v=20260903h
            yield f"data: {_json.dumps(_done_payload, ensure_ascii=False)}\n\n"
        return StreamingResponse(_cached(), media_type="text/event-stream", headers=_SSE_HEADERS)

    # 访客每日额度：缓存未命中、真正要调用模型时才计数（缓存命中不消耗额度）；
    # uid 已在函数开头统一解析，积分扣减沿用同一个身份，避免两处 token 解析口径不一致。
    _guest_quota_hit(uid, client_ip)

    def event_generator():
        acc = []
        prompt_tokens = 0
        completion_tokens = 0
        try:
            # v=20260920 心跳包:响应头立即下发,告知前端"已连接,模型思考中"
            # (LLM prefill 期间前端显示"思考中",避免用户以为卡死)
            yield f"data: {_json.dumps({'type': 'started'}, ensure_ascii=False)}\n\n"
            stream = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}, *convo],
                temperature=temperature,
                max_tokens=MAX_TOKENS,
                stream=True,
                stream_options={"include_usage": True},
            )
            for chunk in stream:
                if not chunk.choices:
                    # usage chunk (stream_options)
                    if hasattr(chunk, "usage") and chunk.usage:
                        prompt_tokens = chunk.usage.prompt_tokens or 0
                        completion_tokens = chunk.usage.completion_tokens or 0
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    acc.append(delta)
                    yield f"data: {_json.dumps({'type': 'delta', 'content': delta}, ensure_ascii=False)}\n\n"
        except Exception as e:
            # v=20260870 P2 流式也降级:失败时推送本地 fallback 内容
            fallback = _local_fallback_answer(req.question)
            for chunk_start, chunk_end in [(0, len(fallback))]:
                yield f"data: {_json.dumps({'type': 'delta', 'content': fallback}, ensure_ascii=False)}\n\n"
            _body, _followups = _followups_with_fallback(req.question, fallback, req.mode, convo)  # v=20260903p 追问去重
            _done_payload = {'type': 'done', 'answer': _body, 'citations': [], 'sources': [], 'rag_used': bool(hits), 'engine_verified': bool(engine_result), 'fallback': True, 'fallback_reason': str(e)[:120]}
            if _followups:
                _done_payload['followups'] = _followups  # v=20260903h
            yield f"data: {_json.dumps(_done_payload, ensure_ascii=False)}\n\n"
            return
        # 积分扣减
        if uid and (prompt_tokens or completion_tokens):
            try:
                _consume_credits(uid, prompt_tokens, completion_tokens, model)
            except Exception:
                pass
        raw = "".join(acc)
        citations = extract_citations(raw)
        body = strip_citations(raw) if citations else raw
        body = strip_ref_section(body)
        body = normalize_latex(body)
        # v=20260902j 纯文本路径也跑压扁 → LaTeX 兜底(n 阶含省略号场景,模型偶尔会输出 |a1 a2 ... a_n| 这种扁平写法)
        body = _flatten_matrix_to_latex(body)
        answer = body.strip()
        sources = [{"source": h["source"], "chapter": h["chapter"], "section": h["section"], "snippet": h["snippet"]} for h in hits]
        if answer:  # v=20260903l 禁止缓存空回答,否则空回答会污染同 query+mode 的后续所有请求
            _ask_cache_set(cache_key, (answer, citations, sources, bool(hits)))
        _body, _followups = _followups_with_fallback(query, answer, req.mode, convo)  # v=20260904 追问 + 启发式兜底
        _done_payload = {'type': 'done', 'answer': _body, 'citations': citations, 'sources': sources, 'rag_used': bool(hits), 'engine_verified': bool(engine_result), 'engine_task': engine_result['task'] if engine_result else None}
        if _followups:
            _done_payload['followups'] = _followups  # v=20260903h
        yield f"data: {_json.dumps(_done_payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=_SSE_HEADERS)


# ==================== 智能工作流编排 ====================
# 三个“助教场景”工作流，体现多步 + 条件分支的编排能力：
#   1) /api/workflow/quiz     —— 自动出题（RAG 检索 + LLM 生成结构化小测验）
#   2) /api/workflow/solve    —— 分步解题（先分类选分支 → 检索 → 求解 → 验证）
#   3) /api/workflow/diagnose —— 错题诊断（定位错误 → 解释 → 给出纠正路径）
# 工作流的核心思想：把“解题/出题/诊断”拆成确定性的编排步骤，在关键节点调用
# LLM 与 RAG，而非一次性把问题丢给模型，从而可控、可追溯、可解释。

def _parse_json(text: str):
    """从模型输出中稳健地解析 JSON（兼容 ```json 代码块与多余文本）。"""
    if text is None:
        return None
    t = text.strip()
    # 去掉 markdown 代码围栏
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.lower().startswith("json"):
            t = t[4:]
    # 截取第一个 { 到最后一个 }
    s, e = t.find("{"), t.rfind("}")
    if s != -1 and e != -1 and e > s:
        t = t[s:e + 1]
    try:
        return json.loads(t)
    except Exception:
        return None


def _call_llm_json(system: str, user: str, temperature: float = 0.4, max_tokens: int = 1536):
    """调用大模型并要求返回 JSON；失败抛出 HTTPException(502) 以便上游接口返回明确错误。"""
    client = get_client()
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except openai.APIError as e:
        # 上游模型服务错误（鉴权/限流/服务器错误等）
        raise HTTPException(status_code=502, detail=f"模型服务暂不可用：{e.__class__.__name__} - {str(e)[:200]}")
    except Exception as e:
        # 其他网络/解析异常
        raise HTTPException(status_code=502, detail=f"调用模型失败：{str(e)[:200]}")
    return _parse_json(resp.choices[0].message.content or "")


# ---------------------------------------------------------------------------
# 离线出题兜底：大模型不可用（鉴权/限流/服务错误）时，基于内置精选题库生成
# 结构化小测验。题库全部为可验证的客观题，覆盖 6 大章节。
# ---------------------------------------------------------------------------


def quiz_fallback(topic: str, count: int, difficulty: str) -> list:
    """大模型不可用时的离线出题：基于内置精选题库，按主题/难度筛选并返回结构化题目。"""
    import random
    topic_l = (topic or "").lower()
    # 综合/全部/空主题 -> 全题库
    is_general = (not topic_l) or ("综合" in topic_l) or ("全部" in topic_l) or ("all" in topic_l)

    if is_general:
        matched = list(_QUIZ_BANK)
    else:
        # 相关性打分：章节名命中权重最高，关键词命中累加；保证章节内题目优先
        scored = []
        for item in _QUIZ_BANK:
            score = 0
            if item["chapter"].lower() in topic_l:
                score += 10
            score += sum(1 for k in item["kw"] if k.lower() in topic_l)
            if score > 0:
                scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)
        matched = [it for _, it in scored]

    if not matched:
        matched = list(_QUIZ_BANK)  # 无匹配主题时回退全库，保证总有题

    # 难度优先：同难度排前，不足再补足
    by_diff = [m for m in matched if m["difficulty"] == (difficulty or "")]
    others = [m for m in matched if m["difficulty"] != (difficulty or "")]
    pool = by_diff + others
    # 按主题稳定洗牌，保证同一主题每次题目一致但不同主题有区分
    random.seed(abs(hash(topic_l)) % (10 ** 9))
    random.shuffle(pool)
    picked = pool[: max(1, min(count, len(pool)))]
    return [
        {
            "type": m["type"],
            "question": m["question"],
            "options": m["options"],
            "answer": m["answer"],
            "explanation": m["explanation"],
            "knowledge_point": m["knowledge_point"],
        }
        for m in picked
    ]


# 问题分类 -> 解题分支（确定性规则，用于条件分支选择）
_BRANCHES = {
    "determinant": {
        "label": "行列式计算分支",
        "skeleton": [
            "确定行列式阶数与结构（是否三角 / 范德蒙德 / 分块 / 箭形等特殊形式）",
            "选择方法：化三角形法 / 按行(列)展开降阶 / 析因子法",
            "执行计算，逐步写出初等变换与展开过程",
            "验算：用 |AB|=|A||B| 或数值交叉检验",
        ],
    },
    "matrix": {
        "label": "矩阵运算分支",
        "skeleton": [
            "识别任务类型（求逆 / 求秩 / 乘法 / 对角化 / 矩阵方程）",
            "选用公式或算法（伴随求逆、初等变换、特征分解等）",
            "逐步计算并标注每一步依据",
            "验算：逆用 A·A⁻¹=I；秩用行阶梯形核对",
        ],
    },
    "linear_system": {
        "label": "线性方程组分支",
        "skeleton": [
            "写出增广矩阵 (A|b)",
            "化为行阶梯形 / 最简形，判定解的情况 r(A) 与 r(A,b)",
            "回代求解；自由变量参数化得到通解（特解+齐次通解）",
            "验算：将解代回原方程组",
        ],
    },
    "eigenvalue": {
        "label": "特征值与对角化分支",
        "skeleton": [
            "写出特征方程 det(A−λI)=0",
            "展开特征多项式并求特征值（含重数）",
            "对每个特征值解 (A−λI)x=0 得特征向量基础解系",
            "判断是否可对角化；若可，写出 P 与 Λ 并验算 AP=PΛ",
        ],
    },
    "quadratic": {
        "label": "二次型分支",
        "skeleton": [
            "写出二次型矩阵 A（对称）",
            "选方法：配方法 / 正交变换法",
            "化为标准形（或规范形），给出所用变换",
            "判断正定性（顺序主子式 / 特征值法）",
        ],
    },
    "vector": {
        "label": "向量与空间分支",
        "skeleton": [
            "判断问题类型（线性相关性 / 秩 / 基与坐标 / 内积 / 子空间）",
            "构造矩阵，求秩或解齐次方程",
            "得出相关性 / 极大无关组 / 坐标等结论",
            "验算：秩与向量个数、零空间维度核对",
        ],
    },
    "general": {
        "label": "综合分支",
        "skeleton": [
            "定位问题所属线性代数板块",
            "检索相关知识与核心公式",
            "给出核心思路与关键步骤",
            "给出验算与易错提示",
        ],
    },
}

# 分支关键词（带权重）：越具体的概念权重越高，避免“矩阵”等泛词抢占分支。
# 顺序即优先级：具体分支在前，泛化分支（matrix）在后，平局时取靠前者。
_BRANCH_SPEC = [
    ("eigenvalue", ["特征值", "特征向量", "对角化", "eigenvalue", "eigen", "谱", "相似矩阵", "迹"], 2),
    ("quadratic", ["二次型", "标准形", "规范形", "正定", "配方法", "合同", "惯性"], 2),
    ("vector", ["线性相关", "线性无关", "极大无关组", "基", "坐标", "内积", "子空间", "向量空间", "张成", "生成空间"], 2),
    ("linear_system", ["方程组", "增广", "高斯", "消元", "齐次", "非齐次", "通解", "克拉默", "cramer"], 2),
    ("determinant", ["行列式", "det", "determinant", "余子式", "逆序数", "范德蒙德"], 2),
    ("matrix", ["逆矩阵", "求逆", "矩阵乘法", "伴随", "分块", "转置", "秩", "矩阵"], 1),
]


def classify_problem(problem: str) -> str:
    """确定性分类（带权 + 具体优先）：选最高分分支，平局取更具体的，未命中回退 general。"""
    text = (problem or "").lower()
    best_branch, best_score = "general", 0
    for branch, kws, weight in _BRANCH_SPEC:
        score = 0
        for kw in kws:
            if kw.lower() in text:
                score += weight
        # 仅当严格更高才覆盖（保留前面更具体分支的平局优势）
        if score > best_score:
            best_branch, best_score = branch, score
    return best_branch


class WorkflowQuizRequest(BaseModel):
    topic: str = "行列式"
    count: int = 3
    difficulty: str = "基础"   # 基础 / 中等 / 进阶


class WorkflowSolveRequest(BaseModel):
    problem: str = ""
    mode: str = "detailed"


class WorkflowDiagnoseRequest(BaseModel):
    problem: str = ""
    attempt: str = ""         # 学生的（可能有误的）解答


@app.post("/api/workflow/quiz")
def workflow_quiz(req: WorkflowQuizRequest, request: Request, authorization: Optional[str] = Header(None)):
    """自动生成结构化小测验（RAG 检索 + LLM 生成）。"""
    _uid, _ip = _ask_identity(request, authorization)
    _guest_quota_hit(_uid, _ip)   # 访客每日额度（进程内）
    topic = (req.topic or "行列式").strip()
    count = max(1, min(10, int(req.count)))
    hits = retrieve(topic, top_k=RAG_TOP_K)
    rag_context = build_rag_context(hits) if hits else "（知识库未检索到相关内容，请基于通用线性代数知识出题）"

    system = (
        "你是一位线性代数出题专家。请基于下方【知识库内容】围绕指定主题出一套小测验。"
        "严格要求：只输出一个 JSON 对象，不要任何额外文字。JSON 结构：\n"
        '{"quiz":[{"type":"选择题|填空题|计算题|证明题|概念题",'
        '"question":"题目内容（含必要 LaTeX，用 $ 包裹）",'
        '"options":["A...","B..."]（仅选择题需要）,'
        '"answer":"参考答案",'
        '"explanation":"解析（含关键步骤与易错点）",'
        '"knowledge_point":"对应知识点（章节·小节）"}]}\n'
        "题目需覆盖不同角度，难度符合指定等级，计算题必须可验证。"
    )
    user = (
        f"主题：{topic}\n难度等级：{req.difficulty}\n题目数量：{count}\n\n"
        f"【知识库内容】\n{rag_context}\n\n请生成 {count} 道 {req.difficulty} 难度的题目。"
    )
    try:
        data = _call_llm_json(system, user, temperature=0.6, max_tokens=2048)
    except HTTPException as e:
        # 大模型不可用（AppIdNoAuthError 鉴权失败 / 限流 / 服务错误等）→ 离线题库兜底
        fb = quiz_fallback(topic, count, req.difficulty)
        return {
            "topic": topic,
            "difficulty": req.difficulty,
            "count": len(fb),
            "quiz": fb,
            "rag_used": False,
            "fallback": True,
            "fallback_note": f"大模型暂不可用（{e.detail}），已切换为题库离线生成，答案均可验证。",
            "sources": [{"source": m["knowledge_point"], "chapter": m["knowledge_point"], "section": ""} for m in fb],
        }
    if not data or "quiz" not in data:
        # 模型返回了但 JSON 无效：同样走离线兜底，保证功能可用
        fb = quiz_fallback(topic, count, req.difficulty)
        return {
            "topic": topic,
            "difficulty": req.difficulty,
            "count": len(fb),
            "quiz": fb,
            "rag_used": False,
            "fallback": True,
            "fallback_note": "模型未返回有效 JSON，已切换为题库离线生成，答案均可验证。",
            "sources": [{"source": m["knowledge_point"], "chapter": m["knowledge_point"], "section": ""} for m in fb],
        }
    return {
        "topic": topic,
        "difficulty": req.difficulty,
        "count": len(data["quiz"]),
        "quiz": data["quiz"],
        "rag_used": bool(hits),
        "sources": [{"source": h["source"], "chapter": h["chapter"], "section": h["section"]} for h in hits],
    }


@app.post("/api/workflow/solve")
def workflow_solve(req: WorkflowSolveRequest, request: Request, authorization: Optional[str] = Header(None)):
    """分步解题工作流：分类选分支 → RAG 检索 → LLM 求解 → 验证。"""
    _uid, _ip = _ask_identity(request, authorization)
    _guest_quota_hit(_uid, _ip)   # 访客每日额度（进程内）
    problem = (req.problem or "").strip()
    if not problem:
        raise HTTPException(status_code=400, detail="请提供题目 problem")

    branch = classify_problem(problem)
    branch_info = _BRANCHES[branch]
    hits = retrieve(problem, top_k=RAG_TOP_K)
    rag_context = build_rag_context(hits) if hits else "（知识库未检索到相关内容，请基于通用知识求解）"

    system = (
        "你是一位线性代数解题专家。请严格按下方【解题流程骨架】给出的步骤顺序求解，"
        "每一步都要写明依据与中间结果。只输出 JSON，不要额外文字。结构：\n"
        '{"steps":[{"title":"步骤标题","detail":"该步的具体推导/计算（含 LaTeX）"}],'
        '"answer":"最终答案","summary":"一句话核心结论"}\n'
        f"【解题流程骨架（{branch_info['label']}）】\n"
        + "\n".join(f"{i+1}. {s}" for i, s in enumerate(branch_info["skeleton"]))
    )
    user = f"【知识库内容】\n{rag_context}\n\n【题目】\n{problem}\n\n请按骨架步骤求解。"
    solve_data = _call_llm_json(system, user, temperature=0.3, max_tokens=2048)

    # 验证步骤（条件分支：仅当求解成功才验证）
    verification = ""
    if solve_data and solve_data.get("answer"):
        v_system = (
            "你是严谨的验算员。请检查下方题目的解答是否正确、步骤是否完整、结果是否合理。"
            "只输出 JSON：{\"verdict\":\"正确|基本正确|有误\",\"checks\":[\"检查点1\",\"检查点2\"],"
            "\"suggestion\":\"若有误，给出修正建议\"}"
        )
        v_user = f"【题目】{problem}\n【解答】\n答案：{solve_data.get('answer')}\n步骤：{solve_data.get('steps')}"
        v_data = _call_llm_json(v_system, v_user, temperature=0.2, max_tokens=1024)
        if v_data:
            verification = v_data

    if not solve_data:
        raise HTTPException(status_code=502, detail="解题失败（模型未返回有效 JSON）")

    return {
        "problem": problem,
        "problem_type": branch,
        "branch": branch_info["label"],
        "plan": [{"step": i + 1, "action": s} for i, s in enumerate(branch_info["skeleton"])],
        "steps": solve_data.get("steps", []),
        "answer": solve_data.get("answer", ""),
        "summary": solve_data.get("summary", ""),
        "verification": verification,
        "rag_used": bool(hits),
        "sources": [{"source": h["source"], "chapter": h["chapter"], "section": h["section"]} for h in hits],
    }


@app.post("/api/workflow/diagnose")
def workflow_diagnose(req: WorkflowDiagnoseRequest, request: Request, authorization: Optional[str] = Header(None)):
    """错题诊断工作流：定位错误 → 解释误区 → 给出纠正路径。"""
    _uid, _ip = _ask_identity(request, authorization)
    _guest_quota_hit(_uid, _ip)   # 访客每日额度（进程内）
    problem = (req.problem or "").strip()
    attempt = (req.attempt or "").strip()
    if not problem or not attempt:
        raise HTTPException(status_code=400, detail="请提供 problem 与 attempt")

    hits = retrieve(problem, top_k=RAG_TOP_K)
    rag_context = build_rag_context(hits) if hits else "（知识库未检索到相关内容，请基于通用知识诊断）"

    system = (
        "你是耐心的线性代数纠错老师。请诊断学生解答中的错误。只输出 JSON，不要额外文字。结构：\n"
        '{"error_location":"出错的具体步骤/式子",'
        '"error_reason":"为什么错（给出正确规则）",'
        '"misconception":"学生可能的概念误区",'
        '"corrected_steps":["纠正后的步骤1","纠正后的步骤2"],'
        '"correct_answer":"正确的最终答案"}\n'
        "语气要鼓励，先肯定做对的部分。"
    )
    user = (
        f"【知识库内容】\n{rag_context}\n\n"
        f"【题目】{problem}\n\n【学生的解答】\n{attempt}\n\n请诊断其中的错误并给出纠正路径。"
    )
    data = _call_llm_json(system, user, temperature=0.4, max_tokens=1536)
    if not data:
        raise HTTPException(status_code=502, detail="诊断失败（模型未返回有效 JSON）")
    data["rag_used"] = bool(hits)
    data["sources"] = [{"source": h["source"], "chapter": h["chapter"], "section": h["section"]} for h in hits]
    return data


# ---------- 可执行可验证求解引擎（不依赖大模型） ----------
class EngineSolveRequest(BaseModel):
    task: str
    matrix: Optional[list] = None
    b: Optional[list] = None
    vector: Optional[list] = None
    subspace: Optional[dict] = None
    params: Optional[dict] = None


class EngineRunRequest(BaseModel):
    """复现验证:把引擎生成的可运行 Python 代码在后端真实执行,返回输出。"""
    code: str
    timeout: Optional[int] = 15


# v=20260824 代码执行频率限制(内存级):同一用户 10 秒内最多 3 次
_ENGINE_RUN_BUCKET = {}
_ENGINE_RUN_LOCK = None
try:
    import threading
    _ENGINE_RUN_LOCK = threading.Lock()
except Exception:
    pass

def _engine_rate_limit(uid: int):
    """简单的内存滑动窗口限流:10 秒窗口内最多 3 次。"""
    import time
    now = time.time()
    key = f"u{uid}"
    if _ENGINE_RUN_LOCK:
        with _ENGINE_RUN_LOCK:
            wins = _ENGINE_RUN_BUCKET.get(key, [])
            wins = [t for t in wins if now - t < 10]
            if len(wins) >= 3:
                raise HTTPException(status_code=429, detail="操作过于频繁,请 10 秒后再试")
            wins.append(now)
            _ENGINE_RUN_BUCKET[key] = wins
    else:
        wins = _ENGINE_RUN_BUCKET.get(key, [])
        wins = [t for t in wins if now - t < 10]
        if len(wins) >= 3:
            raise HTTPException(status_code=429, detail="操作过于频繁,请 10 秒后再试")
        wins.append(now)
        _ENGINE_RUN_BUCKET[key] = wins


@app.post("/api/engine/run")
def engine_run(req: EngineRunRequest,
               user: dict = Depends(require_user),
               authorization: Optional[str] = Header(None)):
    """v=20260866 复现验证一键运行;v=20260824 安全加固;v=20260911 根因加固:
    1) 强制登录(匿名 401) — 堵死匿名任意代码执行漏洞
    2) 频率限制 10s/3 次
    3) exec 沙箱:不注入 __builtins__,仅放行极少量安全内建,禁危险属性链
    4) AST 白名单:含 __ 的标识符/属性/字符串一律拒绝;禁危险属性与内建名;import 仅计算库
    5) 子进程在独立临时目录中执行(用完即删),只传最小环境变量白名单
    """
    import subprocess
    import tempfile
    import shutil
    import textwrap

    # ── 强制登录(评审安全项:代码执行接口必须鉴权) ──
    if not user or user.get("id", 0) == 0:
        raise HTTPException(status_code=401, detail="请先登录后再执行复现验证")

    # ── 频率限制 ──
    _engine_rate_limit(user.get("id", 0))

    code = (req.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="代码为空")
    # 安全护栏:禁止系统调用/文件删除等危险操作(演示环境防护)
    # v=20260824 补充危险属性链:__class__/__subclasses__/__bases__/__globals__ 是
    # 经典沙箱逃逸路径(如 ().__class__.__bases__[0].__subclasses__() 拿 os)。
    _BANNED = ["__import__", "os.system", "subprocess", "shutil", "eval(", "exec(",
               "open(", "write(", "remove(", "rmtree", "socket", "requests",
               "import sys", "sys.exit", "__class__", "__subclasses__",
               "__bases__", "__globals__", "getattr(", "delattr(", "vars(",
               "compile(", "input(", "breakpoint", "memoryview", "help("]
    for b in _BANNED:
        if b in code:
            raise HTTPException(status_code=400, detail=f"出于安全考虑,代码包含被禁用的调用: {b}")

    # 允许的依赖库白名单校验 + 危险属性/内建/模块名单（AST 级校验：字符串级 _BANNED 可被拼接绕过）
    _ALLOWED_MODS = {"numpy", "sympy", "math", "itertools", "fractions", "decimal", "json"}
    _BANNED_ATTRS = {"fromfile", "frombuffer", "tofile", "save", "load", "memmap",
                     "savetxt", "loadtxt", "genfromtxt", "recfromcsv"}
    _BANNED_NAMES = {"open", "exec", "eval", "compile", "globals", "locals", "vars",
                     "getattr", "setattr", "__import__", "input", "breakpoint"}
    _BANNED_MODULES = {"os", "sys", "subprocess", "shutil", "pathlib", "io", "pickle", "socket"}
    try:
        import ast
        tree = ast.parse(code)   # 语法错误在这里显式报 400（原实现被 except Exception 静默吞掉）
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root in _BANNED_MODULES:
                        raise HTTPException(status_code=400, detail=f"禁止导入模块: {alias.name}")
                    if root not in _ALLOWED_MODS:
                        raise HTTPException(status_code=400, detail=f"仅允许 numpy/sympy/math 等计算库,发现: {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                root = (node.module or "").split(".")[0]
                if root in _BANNED_MODULES:
                    raise HTTPException(status_code=400, detail=f"禁止导入模块: {node.module}")
                if root and root not in _ALLOWED_MODS:
                    raise HTTPException(status_code=400, detail=f"仅允许 numpy/sympy/math 等计算库,发现: {node.module}")
            elif isinstance(node, ast.Attribute):
                # 危险文件/序列化属性（numpy 读写任意路径、pickle 反序列化等）
                if node.attr in _BANNED_ATTRS:
                    raise HTTPException(status_code=400, detail=f"出于安全考虑,禁止调用属性: .{node.attr}")
                # __class__ / __globals__ / __subclasses__ 等属性链是沙箱逃逸的通用入口
                if "__" in node.attr:
                    raise HTTPException(status_code=400, detail=f"出于安全考虑,禁止访问双下划线属性: .{node.attr}")
            elif isinstance(node, ast.Name):
                if node.id in _BANNED_NAMES:
                    raise HTTPException(status_code=400, detail=f"出于安全考虑,禁止使用: {node.id}")
                if "__" in node.id:
                    raise HTTPException(status_code=400, detail=f"出于安全考虑,禁止使用双下划线名字: {node.id}")
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                # 字符串常量里的 __ 常用于 getattr(obj, "__cl""ass__") 之类的拼接绕过
                if "__" in node.value:
                    raise HTTPException(status_code=400, detail="出于安全考虑,禁止在字符串中使用双下划线")
    except HTTPException:
        raise
    except SyntaxError as e:
        raise HTTPException(status_code=400, detail=f"代码语法错误：{e.msg}（第 {e.lineno} 行）")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"代码无法解析：{str(e)[:120]}")

    # v=20260824 沙箱加固:exec 命名空间不注入 __builtins__(默认会注入完整内建,
    # 可用 __builtins__['__import__']('os') 等链式逃逸)。
    # 只放行极少量安全内建,危险属性链(.__class__/.__bases__/__subclasses__/globals)一并禁用。
    _SAFE_BUILTINS = {
        "print": print, "abs": abs, "len": len, "range": range,
        "min": min, "max": max, "round": round, "sum": sum, "int": int,
        "float": float, "complex": complex, "bool": bool, "list": list,
        "tuple": tuple, "dict": dict, "set": set, "str": str, "zip": zip,
        "enumerate": enumerate, "sorted": sorted, "reversed": reversed,
        "isinstance": isinstance, "type": type, "repr": repr, "True": True,
        "False": False, "None": None,
    }
    # 注入安全的环境:打印结果到 stdout
    # 注意:wrapper 用普通字符串(非 f-string)+ 占位符替换,避免 {name}/{root} 等被父作用域插值
    wrapper = textwrap.dedent('''
import io, contextlib
_ALLOWED_IMPORTS = ("numpy", "sympy", "math", "itertools", "fractions", "decimal", "json")
def _safe_import(name, *args, **kwargs):
    root = (name or "").split(".")[0]
    if root not in _ALLOWED_IMPORTS:
        raise ImportError("模块 " + str(name) + " 不在允许列表(仅 numpy/sympy/math 等)")
    return __import__(name, *args, **kwargs)
_SAFE = dict(print=print, abs=abs, len=len, range=range, min=min, max=max,
             round=round, sum=sum, int=int, float=float, complex=complex,
             bool=bool, list=list, tuple=tuple, dict=dict, set=set, str=str,
             zip=zip, enumerate=enumerate, sorted=sorted, reversed=reversed,
             isinstance=isinstance, repr=repr, __import__=_safe_import)
_buf = io.StringIO()
try:
    with contextlib.redirect_stdout(_buf):
        exec(CODE_PLACEHOLDER, {"__name__": "__main__", "__builtins__": _SAFE},
             {"__builtins__": _SAFE})
except Exception as _e:
    print("⚠️ 运行异常:", type(_e).__name__, str(_e))
finally:
    _out = _buf.getvalue()
    if not _out.strip():
        print("(无输出 — 代码执行成功,未打印结果)")
    else:
        print(_out.rstrip())
'''
    ).replace("CODE_PLACEHOLDER", repr(code))
    timeout = min(max(req.timeout or 15, 3), 30)
    # v=20260911 根因加固:
    # ① 子进程在独立临时目录中运行(原 cwd=PROJECT_ROOT,被执行的代码可读写项目文件/数据库);
    # ② 只传最小环境变量白名单(原样继承 os.environ 会把 LLM_API_KEY、DB 路径等一并交给被执行的代码)。
    _ENV_WHITELIST = ("PATH", "PYTHONPATH", "PYTHONIOENCODING", "SYSTEMROOT", "SYSTEMDRIVE",
                      "WINDIR", "TEMP", "TMP", "PATHEXT", "LANG", "LC_ALL")
    child_env = {k: os.environ[k] for k in _ENV_WHITELIST if k in os.environ}
    workdir = tempfile.mkdtemp(prefix="enginerun_")
    try:
        proc = subprocess.run(
            [sys.executable, "-c", wrapper],
            capture_output=True, text=True, timeout=timeout,
            cwd=workdir, env=child_env,
        )
        return {
            "ok": True,
            "returncode": proc.returncode,
            "stdout": (proc.stdout or "").strip()[:4000],
            "stderr": (proc.stderr or "").strip()[:1000],
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"运行超时(>{timeout}s),已终止")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"执行失败: {str(e)[:200]}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)   # 用完即删,不留中间产物


@app.get("/api/engine/tasks")
def engine_tasks():
    """返回引擎支持的任务清单（供前端构建下拉与说明）。"""
    return {"tasks": compute_engine.task_list()}


@app.post("/api/engine/solve")
def engine_solve(req: EngineSolveRequest):
    """可执行可验证求解引擎：符号解(SymPy)+数值解(NumPy)交叉验证，附可运行代码与可视化。"""
    try:
        result = compute_engine.solve(
            req.task, matrix=req.matrix, b=req.b,
            vector=req.vector, subspace=req.subspace, params=req.params,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"输入或任务错误：{e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"引擎计算失败：{str(e)[:200]}")
    result["task"] = req.task
    result["task_label"] = compute_engine.TASK_META.get(req.task, {}).get("label", req.task)
    return result


# ---------- 错题本 ----------
@app.post("/api/notes")
def add_note(req: NoteRequest, user: dict = __import__('fastapi').Depends(require_user)):
    # v=20260824 强制登录:匿名(visitor id=0)禁止写入,避免污染共享数据池
    if user.get("id", 0) == 0:
        raise HTTPException(status_code=401, detail="请先登录后再保存笔记")
    db = get_db()
    cur = db.execute(
        "INSERT INTO notes(user_id, question, answer, note, created) VALUES(?,?,?,?,?)",
        (user["id"], req.question, req.answer, req.note, datetime.now().isoformat()),
    )
    db.commit()
    return {"ok": True, "id": cur.lastrowid}


@app.get("/api/notes")
def list_notes(user: dict = __import__('fastapi').Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT id, question, answer, note, created FROM notes WHERE user_id = ? ORDER BY id DESC LIMIT 200",
        (user["id"],)
    ).fetchall()
    return {
        "notes": [
            {"id": r[0], "question": r[1], "answer": r[2], "note": r[3], "created": r[4]}
            for r in rows
        ]
    }


# ---------- 错题归因与知识漏洞雷达 ----------
@app.post("/api/mistakes")
def add_mistake(req: MistakeRequest, user: dict = __import__('fastapi').Depends(require_user)):
    # v=20260824 强制登录:匿名禁止写入错题本
    if user.get("id", 0) == 0:
        raise HTTPException(status_code=401, detail="请先登录后再收录错题")
    db = get_db()
    kps = req.knowledge_point.split(",") if req.knowledge_point else kg.infer_knowledge_points(req.question)
    kp = kps[0] if kps else "线性代数综合"
    chapter = req.chapter or kg.get_chapter_of(kp)
    now = datetime.now().isoformat()
    cur = db.execute(
        "INSERT INTO mistakes(user_id, question, user_answer, correct_answer, knowledge_point, chapter, created, status) VALUES(?,?,?,?,?,?,?, 'active')",
        (user["id"], req.question, req.user_answer, req.correct_answer, kp, chapter, now),
    )
    db.commit()
    return {"ok": True, "id": cur.lastrowid, "knowledge_point": kp, "chapter": chapter}


@app.get("/api/mistakes")
def list_mistakes(
    user: dict = __import__('fastapi').Depends(get_current_user),
    limit: int = 200,
    status: str = "",
    chapter: str = "",
    favorite: str = "",
    q: str = "",
    order: str = "last_time",
):
    """v=20260907d 错题列表：支持状态筛选/章节/只看收藏/关键字搜索/按最近错误时间排序。
    status: ''(全部)/active/consolidating/eliminated/archived；
    order: last_time(最近错误时间，默认)/created(收录时间)。"""
    db = get_db()
    limit = max(1, min(500, int(limit)))
    where = ["user_id = ?", "deleted = 0"]
    params = [user["id"]]
    if status in ("active", "consolidating", "eliminated", "archived"):
        where.append("status = ?")
        params.append(status)
    if chapter:
        where.append("chapter = ?")
        params.append(chapter)
    if q:
        where.append("(question LIKE ? OR knowledge_point LIKE ?)")
        kw = f"%{q}%"
        params.extend([kw, kw])
    sql = (
        "SELECT id, question, user_answer, correct_answer, knowledge_point, chapter, created, "
        "status, times, last_time, qid, payload FROM mistakes WHERE " + " AND ".join(where)
    )
    order_col = "last_time" if order == "last_time" else "created"
    sql += f" ORDER BY {order_col} DESC, id DESC LIMIT ?"
    params.append(limit)
    rows = db.execute(sql, params).fetchall()

    # 只看收藏：favorites 表按题面匹配过滤
    if favorite == "1":
        fav_qs = set()
        for fr in db.execute("SELECT question FROM favorites WHERE user_id = ?", (user["id"],)).fetchall():
            if fr[0]:
                fav_qs.add(fr[0].strip())
        rows = [r for r in rows if (r[1] or "").strip() in fav_qs]

    return {
        "mistakes": [
            {"id": r[0], "question": r[1], "user_answer": r[2], "correct_answer": r[3],
             "knowledge_point": r[4], "chapter": r[5], "created": r[6], "status": r[7] or "active",
             "times": r[8] or 0, "last_time": r[9] or "", "qid": r[10] or "", "payload": r[11] or ""}
            for r in rows
        ]
    }


@app.get("/api/mistakes/stats")
def mistakes_stats(user: dict = __import__('fastapi').Depends(get_current_user)):
    """v=20260907d 错题统计卡：消灭率、待消灭、已消灭、最近7天新增。"""
    db = get_db()
    rows = db.execute(
        "SELECT status, created FROM mistakes WHERE user_id = ? AND deleted = 0",
        (user["id"],),
    ).fetchall()
    total = 0
    pending = 0  # active + consolidating（未彻底消灭）
    eliminated = 0
    archived = 0
    week_new = 0
    week_ago = (datetime.now() - timedelta(days=7)).isoformat()
    for status, created in rows:
        total += 1
        if status == "eliminated":
            eliminated += 1
        elif status == "archived":
            archived += 1
        else:
            pending += 1
        if created and created >= week_ago:
            week_new += 1
    # 消灭率 = 已消灭 / (未消灭 + 巩固中 + 已消灭)，不含手动归档
    base = pending + eliminated
    rate = round(eliminated / base * 100, 1) if base > 0 else 0.0
    return {
        "ok": True,
        "total": total,
        "pending": pending,
        "eliminated": eliminated,
        "archived": archived,
        "elimination_rate": rate,
        "week_new": week_new,
    }


@app.delete("/api/mistakes/{mistake_id}")
def delete_mistake(mistake_id: int, user: dict = __import__('fastapi').Depends(get_current_user)):
    db = get_db()
    cur = db.execute("DELETE FROM mistakes WHERE id=? AND user_id=?", (mistake_id, user["id"]))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在或无权限")
    return {"ok": True}


# v=20260907d 消灭式闭环：连续答对阈值（写常量，默认 2）
_MISTAKE_ELIMINATE_THRESHOLD = 2




@app.post("/api/mistakes/{mistake_id}/archive")
def archive_mistake(mistake_id: int, user: dict = __import__('fastapi').Depends(get_current_user)):
    """v=20260907d 手动归档错题（状态 → archived）。"""
    db = get_db()
    cur = db.execute(
        "UPDATE mistakes SET status = 'archived' WHERE id = ? AND user_id = ? AND deleted = 0",
        (mistake_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在或无权限")
    return {"ok": True, "status": "archived"}


@app.post("/api/mistakes/{mistake_id}/restore")
def restore_mistake(mistake_id: int, user: dict = __import__('fastapi').Depends(get_current_user)):
    """v=20260907d 取消归档/重置错题状态为未消灭。"""
    db = get_db()
    cur = db.execute(
        "UPDATE mistakes SET status = 'active' WHERE id = ? AND user_id = ? AND deleted = 0",
        (mistake_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在或无权限")
    return {"ok": True, "status": "active"}


# ---------- v=20260902m 收藏题目(action bar 「更多 → 收藏题目」) ----------
@app.post("/api/favorites")
def add_favorite(req: FavoriteRequest, user: dict = __import__('fastapi').Depends(require_user)):
    # v=20260902m 强制登录:匿名禁止收藏
    if user.get("id", 0) == 0:
        raise HTTPException(status_code=401, detail="请先登录后再收藏题目")
    db = get_db()
    cur = db.execute(
        "INSERT INTO favorites(user_id, question, answer, note, created) VALUES(?,?,?,?,?)",
        (user["id"], req.question, req.answer, req.note, datetime.now().isoformat()),
    )
    db.commit()
    return {"ok": True, "id": cur.lastrowid}


@app.get("/api/favorites")
def list_favorites(user: dict = __import__('fastapi').Depends(get_current_user), limit: int = 200):
    db = get_db()
    rows = db.execute(
        "SELECT id, question, answer, note, created FROM favorites WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user["id"], limit),
    ).fetchall()
    return {
        "favorites": [
            {"id": r[0], "question": r[1], "answer": r[2], "note": r[3], "created": r[4]}
            for r in rows
        ]
    }


@app.delete("/api/favorites/{favorite_id}")
def delete_favorite(favorite_id: int, user: dict = __import__('fastapi').Depends(get_current_user)):
    db = get_db()
    cur = db.execute("DELETE FROM favorites WHERE id = ? AND user_id = ?", (favorite_id, user["id"]))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="收藏不存在或已删除")
    return {"ok": True}


# ---------- v=20260902m AI 回答反馈(点赞/点踩) ----------
@app.post("/api/feedback")
def add_feedback(req: FeedbackRequest, user: dict = __import__('fastapi').Depends(require_user)):
    # v=20260902m 强制登录:匿名禁止写反馈
    if user.get("id", 0) == 0:
        raise HTTPException(status_code=401, detail="请先登录后再反馈")
    if req.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="rating 必须为 up 或 down")
    db = get_db()
    # 同 msg_id 同 user 同 rating 视为重复,先删旧再加新(toggle 语义)
    db.execute(
        "DELETE FROM feedback WHERE user_id = ? AND msg_id = ? AND rating = ?",
        (user["id"], req.msg_id, req.rating),
    )
    # 反向 toggle:如果之前是相反 rating,直接 delete
    opposite = "down" if req.rating == "up" else "up"
    db.execute(
        "DELETE FROM feedback WHERE user_id = ? AND msg_id = ? AND rating = ?",
        (user["id"], req.msg_id, opposite),
    )
    cur = db.execute(
        "INSERT INTO feedback(user_id, msg_id, rating, comment, created) VALUES(?,?,?,?,?)",
        (user["id"], req.msg_id, req.rating, req.comment, datetime.now().isoformat()),
    )
    db.commit()
    return {"ok": True, "id": cur.lastrowid, "rating": req.rating}


@app.get("/api/feedback")
def list_feedback(msg_id: str = "", user: dict = __import__('fastapi').Depends(get_current_user)):
    """查询某条消息的当前用户反馈状态(返回 up/down/空)"""
    db = get_db()
    if msg_id:
        row = db.execute(
            "SELECT rating FROM feedback WHERE user_id = ? AND msg_id = ? ORDER BY id DESC LIMIT 1",
            (user["id"], msg_id),
        ).fetchone()
        return {"rating": row[0] if row else ""}
    return {"rating": ""}


@app.get("/api/mistakes/analyze")
def analyze_mistakes(user: dict = __import__('fastapi').Depends(require_user)):
    """错题分析:除基础统计外,自动回溯每个错题 kp 的【强必学前置】,提示用户是否基础薄弱导致错题。"""
    db = get_db()
    # v=20260907d 修复:只统计未删除错题,并过滤论文标题/文献类脏知识点,避免下游 kg.analyze/_kp_meta_summary 抛异常导致 500
    try:
        rows = db.execute(
            "SELECT knowledge_point FROM mistakes WHERE user_id = ? AND deleted = 0",
            (user["id"],),
        ).fetchall()
    except Exception:
        rows = []
    raw = defaultdict(int)
    for r in rows:
        if r[0] and not _is_dirty_kp(r[0]):
            raw[r[0]] += 1
    # 无错题时给出演示数据,避免页面空白
    demo_mode = len(raw) == 0
    if demo_mode:
        raw = {"特征值": 2, "特征向量": 1, "行列式": 1}
    # kg.analyze 可能对异常知识点抛错,兜底为空结构避免 500
    try:
        result = kg.analyze(dict(raw))
    except Exception:
        result = {"summary": {"total_mistakes": sum(raw.values()), "weak_kps": len(raw)},
                  "radar": [], "recommendations": []}
    result["demo_mode"] = demo_mode
    # 新增:错题回溯——对每个错题 kp,查强必学前置,辅助定位"是不是前置基础薄弱导致"
    kp_traces = []
    for kp_name, cnt in raw.items():
        try:
            # 用 _KP_NAME_INDEX 把中文名"特征值" → "tp-eig-1",再查 metadata
            kp_id = _kp_id_from_name(kp_name)
            if not kp_id:
                continue
            meta = _kp_meta_summary(kp_id)
            if not meta:
                continue
            kp_traces.append({
                "knowledgePoint": kp_name,
                "knowledgeId": kp_id,
                "mistakeCount": cnt,
                "difficulty": meta["difficultyScore"],
                "errorProne": meta["errorProneScore"],
                "isHighErrorProne": meta["isHighErrorProne"],
                "strongPrerequisites": meta["strongPrerequisites"],
                "tracebackHint": "是高频易错" if meta["isHighErrorProne"] else "一般难度",
                "predecessorHint": (
                    "该知识点存在强必学前置,做错可能因前置基础薄弱,建议先复习: " +
                    ", ".join(p["id"] for p in meta["strongPrerequisites"][:3])
                ) if meta["strongPrerequisites"] else "该知识点无强必学前置,可重点强化练习"
            })
        except Exception:
            continue
    result["knowledgeTraces"] = kp_traces
    return result


@app.get("/api/kp/meta/{kp_id}")
def kp_meta(kp_id: str, user: dict = __import__('fastapi').Depends(require_user)):
    """根据知识点 ID(如 tp-eq-3)查询完整元数据(供智能体/前端使用)。"""
    s = _kp_meta_summary(kp_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"未找到知识点 {kp_id} 的元数据")
    return {"ok": True, "data": s}


