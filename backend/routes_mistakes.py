"""routes_mistakes.py —— 错题本云同步、问答历史、聊天会话（原 backend/main.py 第 4204–4867 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ── 错题本云同步（跨设备：电脑/手机同时登录，错题实时互通）──

def _txt(v, limit=None):
    """字段容错：任意类型先转字符串再截断。

    v=20260911 根因修复：原实现直接对字段做切片 `(m.get(...) or "")[:500]`，
    客户端把 question/times 传成数字（前端 localStorage 里存的是数字时间戳/计数）
    时会抛 TypeError → 整批同步 500，所有错题一起丢。
    """
    s = "" if v is None else str(v)
    return s[:limit] if limit else s


def _coerce_times(v):
    """错题次数容错解析：返回 int；非数字返回 None（调用方跳过该条并计入 skipped）。"""
    if v is None or v == "":
        return 1
    try:
        n = int(float(v))
    except (TypeError, ValueError, OverflowError):
        return None   # 非数字（如 "3次"、NaN、Inf）→ 非法条目
    return n if n > 0 else 1


def _mistakes_sync_result(db, uid, skipped=0):
    """组装同步结果：有效错题 + 软删除标记列表 + 被跳过的非法条目数"""
    rows = db.execute(
        "SELECT payload FROM mistakes WHERE user_id = ? AND deleted = 0 ORDER BY id DESC",
        (uid,)
    ).fetchall()
    out = []
    for r in rows:
        try:
            obj = json.loads(r[0])
            if obj:
                out.append(obj)
        except Exception:
            continue
    del_rows = db.execute(
        "SELECT qid FROM mistakes WHERE user_id = ? AND deleted = 1 AND qid != ''", (uid,)
    ).fetchall()
    deleted = [r[0] for r in del_rows]
    return {"ok": True, "mistakes": out, "deleted": deleted, "skipped": skipped}


@app.get("/api/mistakes/sync")
def mistakes_sync_get(user: dict = __import__('fastapi').Depends(require_user)):
    """拉取当前用户的全部错题（游客返回空）；deleted 数组 = 其他设备已删除的题目 ID"""
    if user["id"] == 0:
        return {"ok": True, "mistakes": [], "deleted": [], "skipped": 0}
    db = get_db()
    return _mistakes_sync_result(db, user["id"])


@app.post("/api/mistakes/sync")
def mistakes_sync_post(req: MistakesSyncRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """全量合并上传 + 软删除同步，返回合并后的完整错题列表与删除标记"""
    if user["id"] == 0:
        return {"ok": True, "mistakes": [], "deleted": [], "skipped": 0}
    db = get_db()
    now = datetime.now().isoformat()
    skipped = 0
    # 1) 软删除：removed_ids → deleted=1（跨设备删除同步）
    for qid in req.removed_ids or []:
        if qid is None:
            continue
        qid = str(qid)
        db.execute("UPDATE mistakes SET deleted = 1 WHERE user_id = ? AND qid = ?", (user["id"], qid))
    # 2) 合并上传（按 qid 去重；已软删除的题目再次出现 = 用户重新添加 → 恢复）
    #    v=20260911 健壮性：单条非法（时间戳是数字、times 非数字）只跳过该条并计数，
    #    绝不因一条脏数据让整批同步 500（客户端数据自此一条也存不进来）。
    for m in req.mistakes or []:
        if not isinstance(m, dict) or not m.get("id"):
            skipped += 1
            continue
        n_times = _coerce_times(m.get("times"))
        if n_times is None:
            skipped += 1
            continue
        qid = str(m["id"])
        payload = json.dumps(m, ensure_ascii=False)
        # 先转字符串再切片：数字时间戳（int/float）不再抛 TypeError
        first_time = _txt(m.get("firstTime") or now, 19) or now[:19]
        last_time = _txt(m.get("lastTime") or first_time, 19) or first_time
        row = db.execute(
            "SELECT id, times, deleted FROM mistakes WHERE user_id = ? AND qid = ?", (user["id"], qid)
        ).fetchone()
        if row:
            times = max(row[1] or 0, n_times)
            db.execute(
                "UPDATE mistakes SET payload = ?, times = ?, last_time = ?, deleted = 0, "
                "question = ?, user_answer = ?, correct_answer = ?, knowledge_point = ?, chapter = ? "
                "WHERE id = ?",
                (payload, times, last_time,
                 _txt(m.get("question"), 500), _txt(m.get("userAnswer")),
                 _txt(m.get("correctAnswer")), _txt(m.get("knowledgePoint")),
                 _txt(m.get("chapter")), row[0])
            )
        else:
            db.execute(
                "INSERT INTO mistakes(user_id, qid, payload, question, user_answer, correct_answer, "
                "knowledge_point, chapter, times, last_time, created, deleted) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)",
                (user["id"], qid, payload, _txt(m.get("question"), 500),
                 _txt(m.get("userAnswer")), _txt(m.get("correctAnswer")),
                 _txt(m.get("knowledgePoint")), _txt(m.get("chapter")),
                 n_times, last_time, first_time)
            )
    db.commit()
    return _mistakes_sync_result(db, user["id"], skipped=skipped)


@app.get("/api/history")
def get_history(user: dict = __import__('fastapi').Depends(get_current_user), page: int = 1, page_size: int = 10, q: str = ""):
    """会话列表：按会话分组展示问答历史（每条会话代表一段完整对话）"""
    db = get_db()
    page = max(1, int(page))
    page_size = max(1, min(50, int(page_size)))
    # 基础会话字段
    base_sql = (
        "SELECT s.id, s.title, s.relate_knowledge, s.created, s.updated, "
        "(SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS msg_count, "
        "(SELECT content FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'ai' "
        " ORDER BY m.id DESC LIMIT 1) AS last_ai "
        "FROM chat_sessions s "
    )
    if q and q.strip():
        qq = "%" + q.strip() + "%"
        sql = base_sql + "WHERE s.user_id = ? AND (s.title LIKE ? OR s.relate_knowledge LIKE ?) ORDER BY s.updated DESC LIMIT ? OFFSET ?"
        params = (user["id"], qq, qq, page_size, (page - 1) * page_size)
        count_sql = "SELECT COUNT(*) FROM chat_sessions s WHERE s.user_id = ? AND (s.title LIKE ? OR s.relate_knowledge LIKE ?)"
        count_params = (user["id"], qq, qq)
    else:
        sql = base_sql + "WHERE s.user_id = ? ORDER BY s.updated DESC LIMIT ? OFFSET ?"
        params = (user["id"], page_size, (page - 1) * page_size)
        count_sql = "SELECT COUNT(*) FROM chat_sessions WHERE user_id = ?"
        count_params = (user["id"],)
    total = db.execute(count_sql, count_params).fetchone()[0]
    pages = (total + page_size - 1) // page_size
    rows = db.execute(sql, params).fetchall()
    out = []
    for r in rows:
        last_ai = r[6] or ""
        # 智能截断：避免把 "$...$" 公式拆成不闭合的两个 $，否则列表页 KaTeX 会跳过整段公式
        # 规则：在 [60, 140] 区间内找最安全的截断点：
        #   1) 优先选 "$" 闭合（前面有奇数个未闭合的 $ 时，找到的下一个 $ 是闭合点）
        #   2) 句末标点
        #   3) 空格
        #   4) 实在找不到则硬截 100（让前端 markdownToHtml 容错补 $ 兜底）
        flat = last_ai.replace('\n', ' ').strip()
        if len(flat) <= 100:
            preview = flat
        else:
            target = 100
            safe_end = -1
            # 1) "$" 闭合点：算出 target 之前的 $ 奇偶性,向后找最近的"$",若前面是奇数则它是闭合
            prefix_dollar = flat[:target].count('$')
            parity = prefix_dollar % 2
            for i in range(target, min(target + 40, len(flat))):
                if flat[i] == '$':
                    if parity == 1:
                        safe_end = i + 1
                        break
                    parity = 1
            # 2) 句末标点
            if safe_end < 0:
                for i in range(target, min(target + 40, len(flat))):
                    if flat[i] in '。？！?!.,;':
                        safe_end = i + 1
                        break
            # 3) 空格
            if safe_end < 0:
                for i in range(target, min(target + 40, len(flat))):
                    if flat[i] == ' ':
                        safe_end = i
                        break
            # 4) 向前回退找空格/句末标点
            if safe_end < 0:
                for i in range(target, 59, -1):
                    if flat[i] == ' ' or flat[i] in '。？！?!.,;':
                        safe_end = i + (0 if flat[i] == ' ' else 1)
                        break
            preview = (flat[:safe_end] if safe_end > 0 else flat[:100]).rstrip()
        out.append({
            "id": r[0], "title": r[1], "relate_knowledge": r[2] or "",
            "created": r[3], "updated": r[4], "msg_count": r[5], "preview": preview
        })
    return {"ok": True, "sessions": out, "total": total, "page": page, "page_size": page_size, "pages": pages}


@app.get("/api/history/session/{sid}")
def get_session_detail(sid: str, user: dict = __import__('fastapi').Depends(get_current_user)):
    """会话详情：返回指定 session 的完整 messageList"""
    db = get_db()
    sess = db.execute(
        "SELECT id, title, relate_knowledge, created, updated FROM chat_sessions "
        "WHERE id = ? AND user_id = ?", (sid, user["id"])
    ).fetchone()
    if not sess:
        raise HTTPException(status_code=404, detail="会话不存在")
    msgs = db.execute(
        "SELECT id, role, content, mode, citations, rag_used, ocr_used, image_url, created "
        "FROM chat_messages WHERE session_id = ? ORDER BY id ASC", (sid,)
    ).fetchall()
    return {
        "ok": True,
        "session": {
            "id": sess[0], "title": sess[1], "relate_knowledge": sess[2] or "",
            "created": sess[3], "updated": sess[4]
        },
        "messages": [
            {
                "id": r[0], "role": r[1], "content": r[2], "mode": r[3] or 'direct',
                "citations": r[4] or '', "rag_used": bool(r[5]), "ocr_used": bool(r[6]),
                "image_url": r[7] or '', "created": r[8]
            }
            for r in msgs
        ]
    }


@app.delete("/api/history/session/{sid}")
def delete_session(sid: str, user: dict = __import__('fastapi').Depends(get_current_user)):
    """删除会话：级联清除该会话全部消息"""
    db = get_db()
    sess = db.execute(
        "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?", (sid, user["id"])
    ).fetchone()
    if not sess:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.execute("DELETE FROM chat_messages WHERE session_id = ?", (sid,))
    db.execute("DELETE FROM chat_sessions WHERE id = ?", (sid,))
    db.commit()
    return {"ok": True}


@app.post("/api/chat/session/new")
def chat_session_new(req: ChatSessionNewRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """新开对话：创建会话并写入第一条用户消息，生成会话标题"""
    import secrets as _s
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    q = (req.first_question or '').strip()
    if not q:
        raise HTTPException(status_code=400, detail="首条消息不能为空")
    sid = _s.token_hex(12)
    now = datetime.utcnow().isoformat()
    # 标题规则：图片/OCR 失败 → 兜底标题；否则取首条提问前 22 字
    title, _ = _derive_session_title(q, '', now)
    db = get_db()
    db.execute(
        "INSERT INTO chat_sessions(id, user_id, title, relate_knowledge, created, updated) VALUES(?,?,?,?,?,?)",
        (sid, user["id"], title, '', now, now)
    )
    db.execute(
        "INSERT INTO chat_messages(session_id, user_id, role, content, mode, citations, rag_used, ocr_used, created) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (sid, user["id"], 'user', q, 'direct', '', 0, 0, now)
    )
    db.commit()
    return {"ok": True, "sessionId": sid, "title": title, "created": now}


@app.post("/api/chat/session/{sid}/append")
def chat_session_append(sid: str, req: ChatSessionAppendRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """向现有会话追加消息数组（通常一对 user+ai），更新标题与关联知识点"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    sess = db.execute(
        "SELECT id, user_id, relate_knowledge FROM chat_sessions WHERE id = ?", (sid,)
    ).fetchone()
    if not sess:
        raise HTTPException(status_code=404, detail="会话不存在")
    if sess[1] != user["id"]:
        raise HTTPException(status_code=403, detail="无权操作此会话")
    if not req.messages:
        raise HTTPException(status_code=400, detail="消息数组不能为空")
    now = datetime.utcnow().isoformat()
    for m in req.messages:
        if not isinstance(m, dict) or not m.get("content"):
            continue
        role = m.get("role", "user") if m.get("role") in ("user", "ai") else "user"
        db.execute(
            "INSERT INTO chat_messages(session_id, user_id, role, content, mode, citations, rag_used, ocr_used, image_url, created) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (sid, user["id"], role, m.get("content", ""), m.get("mode") or 'direct',
             m.get("citations") or '', 1 if m.get("rag_used") else 0,
             1 if m.get("ocr_used") else 0, m.get("image_url") or '', now)
        )
    # 更新会话 updated
    db.execute("UPDATE chat_sessions SET updated = ? WHERE id = ?", (now, sid))
    # 关联知识点：合并（去重，sess[2] 已是 relate_knowledge 字段）
    # v=20260824 兜底:过滤非字符串(如对象序列化的 "[object Object]")与脏值,防止污染历史展示
    if req.relate_knowledge and req.relate_knowledge.strip():
        cur = sess[2] or ''
        merged = cur
        _raw = req.relate_knowledge if isinstance(req.relate_knowledge, str) else str(req.relate_knowledge)
        for kp in [k.strip() for k in _raw.replace(';', ',').split(',') if k.strip()]:
            if kp in ("[object Object]", "None", "null", "undefined"):
                continue
            if kp not in merged:
                merged = (merged + ('，' if merged else '') + kp)
        db.execute("UPDATE chat_sessions SET relate_knowledge = ? WHERE id = ?", (merged, sid))
    db.commit()
    return {"ok": True, "sessionId": sid, "updated": now}


# ---------- 智能问答 ----------
@app.post("/api/rag/search")
def rag_search(req: RagSearchRequest):
    hits = retrieve(req.query, top_k=req.top_k)
    return {"query": req.query, "count": len(hits), "hits": hits}


# ---------- 引擎前置校验（大模型 + 可验证求解引擎 双引擎架构）----------
# 核心思路：对于数学计算类问题，先用本地 sympy/NumPy 引擎做确定性计算，
# 再把引擎结果注入 prompt，让大模型基于验证过的结论组织讲解，根治数学幻觉。

















# 说明：问答响应缓存（_ASK_CACHE / _ask_cache_get / _ask_cache_set）由 core.py 统一持有，
# 本模块不再重复定义（避免同名对象分叉：core 的缓存与这里的副本互不可见）。








