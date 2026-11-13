"""routes_student.py —— 学生画像、掌握度热力图、学习行为、诊断闭环、间隔复习计划（原 backend/main.py 第 6616–7064 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ─── API: 学生完整画像 ───

@app.get("/api/student/profile")
def student_profile(user: dict = __import__('fastapi').Depends(require_user)):
    """返回多维度学生画像（知识掌握度、学习风格、认知能力、兴趣方向、情绪状态、时间规律）。"""
    import json as _json
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    row = db.execute("SELECT * FROM student_profiles WHERE user_id = ?", (user["id"],)).fetchone()
    if not row:
        _profile_update(user["id"])
        row = db.execute("SELECT * FROM student_profiles WHERE user_id = ?", (user["id"],)).fetchone()
    # 按列名取出
    cols = [d[1] for d in db.execute("PRAGMA table_info(student_profiles)").fetchall()]
    d = dict(zip(cols, row))
    return {
        "user_id": d["user_id"],
        "learning_style": _json.loads(d["learning_style"]),
        "cognitive_level": _json.loads(d["cognitive_level"]),
        "interest_vector": _json.loads(d["interest_vector"]),
        "study_rhythm": _json.loads(d["study_rhythm"]),
        "confidence_score": d["confidence_score"],
        "overall_mastery": d["overall_mastery"],
        "emotion_trend": _json.loads(d["emotion_trend"]),
        "updated": d["updated"],
    }


# ─── API: 知识点掌握度热力图 ───

@app.get("/api/student/mastery")
def student_mastery(user: dict = __import__('fastapi').Depends(require_user)):
    """返回每个知识点的掌握度评分、答题次数、正确率、遗忘分。"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    rows = db.execute("SELECT knowledge_point, mastery_score, attempts, correct_attempts, forgetting_score, last_practiced FROM knowledge_mastery WHERE user_id = ?", (user["id"],)).fetchall()
    kps = []
    for r in rows:
        kps.append({
            "kp": r[0], "mastery": round(r[1], 1), "attempts": r[2],
            "correct": r[3], "forgetting": round(r[4], 4), "last": r[5]
        })
    # 补充未练习的知识点（默认 50）
    existing = {x["kp"] for x in kps}
    for kp, ch in kg.KP_TO_CHAPTER.items():
        if kp not in existing:
            kps.append({"kp": kp, "mastery": 50.0, "attempts": 0, "correct": 0, "forgetting": 1.0, "last": None})
    return {"mastery": kps, "chapters": list(kg.CHAPTER_KPS.keys()), "kp_to_chapter": kg.KP_TO_CHAPTER}


# ─── API: 记录学习行为 ───

class TrackSessionRequest(BaseModel):
    session_type: str = "quiz"
    knowledge_points: list = []
    duration_seconds: int = 0
    correct_count: int = 0
    total_count: int = 0


@app.post("/api/student/track")
def student_track(req: TrackSessionRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """记录一次学习行为，异步触发画像更新。"""
    import json as _json
    from datetime import datetime as _dt
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    db.execute(
        "INSERT INTO learning_sessions (user_id, session_type, knowledge_points, duration_seconds, correct_count, total_count, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], req.session_type, _json.dumps(req.knowledge_points, ensure_ascii=False),
         req.duration_seconds, req.correct_count, req.total_count, _dt.utcnow().isoformat())
    )
    db.commit()
    # 增量更新画像（非阻塞，快速返回）
    _profile_update(user["id"])
    return {"status": "tracked", "user_id": user["id"]}


# ─── API: 诊断学习闭环（提问→掌握度→薄弱练习→诊断回写） ───

def _normalize_kp(kp) -> str:
    """归一化知识点名：去掉"第X章·/第X章 章节名·"前缀、空白与多余符号，便于与题库 knowledgePoint 匹配。
    v=20260824 修复脏数据:若传入 dict/类 dict 字符串(如 {'chapter':..,'section':..}),提取 section 字段;
    无法提取则丢弃,避免 "{'chapter':...}" 字典字符串入库污染掌握度数据。"""
    if kp is None:
        return ""
    # dict 对象:直接取 section
    if isinstance(kp, dict):
        s = str(kp.get("section") or kp.get("name") or kp.get("title") or "").strip()
        if not s:
            return ""
    else:
        s = str(kp).strip()
        # 类 dict 字符串(Python repr):尝试解析提取 section
        if s.startswith("{") and ("'section'" in s or '"section"' in s):
            try:
                import ast as _ast
                obj = _ast.literal_eval(s)
                if isinstance(obj, dict):
                    s = str(obj.get("section") or obj.get("name") or "").strip()
                    if not s:
                        return ""
            except Exception:
                return ""
        elif s.startswith("{") or s.startswith("'") or s.startswith('"'):
            # 其他不可解析的脏值(如 [object Object])直接丢弃
            if s in ("[object Object]", "None", "null", "undefined"):
                return ""
    # 去掉 "第三章·施密特正交化方法" 或 "第一章 行列式·特殊行列式的计算" 的章节前缀
    s = re.sub(r'^第[一二三四五六七八九十]+章\s*[·•.-]\s*', '', s)          # 第三章·X
    s = re.sub(r'^第[一二三四五六七八九十]+章\s*[\u4e00-\u9fff（）()]+\s*[·•.-]\s*', '', s)  # 第一章 行列式·X
    s = re.sub(r'^[一二三四五六七八九十]+\s*[·•.-]\s*', '', s)               # 三·X
    return s.strip()


# v=20260907d 间隔复习计划：间隔档位（索引对应天数）
_REVIEW_INTERVALS = [1, 2, 4, 7, 15]


def _record_review_event(db, user_id: int, kp: str, correct: bool):
    """答题事件自动登记/更新间隔复习计划（不手动整理）。
    答错 → 间隔回退 1 天并提前到期；答对 → 进一档（间隔按档位递增）。"""
    from datetime import datetime as _dt, timedelta as _td
    now = _dt.utcnow()
    row = db.execute(
        "SELECT interval_idx, last_result FROM review_schedule WHERE user_id = ? AND kp = ?",
        (user_id, kp),
    ).fetchone()
    if not row:
        # 首次登记：答对档位 0（1 天后复习），答错档位 0 但立即到期（当天）
        idx = 0
        if correct:
            next_due = now + _td(days=_REVIEW_INTERVALS[idx])
        else:
            next_due = now  # 答错当天即需复习
        db.execute(
            "INSERT INTO review_schedule (user_id, kp, next_due, interval_idx, last_result, updated) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, kp, next_due.isoformat(), idx, 'correct' if correct else 'wrong', now.isoformat()),
        )
        return
    cur_idx = row[0] or 0
    if correct:
        # 答对 → 进一档（封顶最后档位）
        new_idx = min(cur_idx + 1, len(_REVIEW_INTERVALS) - 1)
        next_due = now + _td(days=_REVIEW_INTERVALS[new_idx])
    else:
        # 答错 → 回退 1 天并提前到期
        new_idx = max(0, cur_idx - 1)
        next_due = now + _td(days=1)
    db.execute(
        "UPDATE review_schedule SET next_due = ?, interval_idx = ?, last_result = ?, updated = ? WHERE user_id = ? AND kp = ?",
        (next_due.isoformat(), new_idx, 'correct' if correct else 'wrong', now.isoformat(), user_id, kp),
    )


class RecordQuestionRequest(BaseModel):
    knowledge_points: list = []
    question: str = ""


@app.post("/api/student/record_question")
def student_record_question(req: RecordQuestionRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """提问驱动掌握度：学生提问后调用，把涉及的知识点记为一次主动学习，
    轻微提升掌握度（提问=学习信号），供画像/图谱/薄弱点推荐联动。"""
    import json as _json
    from datetime import datetime as _dt
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    # 归一化 + 去重
    kps = []
    seen = set()
    for kp in (req.knowledge_points or []):
        n = _normalize_kp(kp if isinstance(kp, str) else str(kp))
        if n and n not in seen:
            seen.add(n)
            kps.append(n)
    if not kps:
        return {"ok": True, "recorded": 0, "updated": []}
    db = get_db()
    now = _dt.utcnow().isoformat()
    # 1) 写入学习会话（chat 类型）
    db.execute(
        "INSERT INTO learning_sessions (user_id, session_type, knowledge_points, duration_seconds, correct_count, total_count, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], 'chat', _json.dumps(kps, ensure_ascii=False), 0, 1, 1, now)
    )
    # 2) 局部更新掌握度：提问=一次正确尝试，向 50→60 区间抬升（受遗忘平滑影响）
    updated = []
    for kp in kps:
        row = db.execute(
            "SELECT mastery_score, attempts, correct_attempts FROM knowledge_mastery WHERE user_id = ? AND knowledge_point = ?",
            (user["id"], kp)
        ).fetchone()
        if row:
            old = row[0] or 50.0
            att = (row[1] or 0) + 1
            corr = (row[2] or 0) + 1
            # 平滑提升：向 62 分靠近（提问学习信号弱于做题）
            new = old + (62 - old) * 0.08
            db.execute(
                "UPDATE knowledge_mastery SET mastery_score = ?, attempts = ?, correct_attempts = ?, last_practiced = ?, updated = ? WHERE user_id = ? AND knowledge_point = ?",
                (round(max(0, min(100, new)), 1), att, corr, now, now, user["id"], kp)
            )
        else:
            db.execute(
                "INSERT INTO knowledge_mastery (user_id, knowledge_point, mastery_score, attempts, correct_attempts, last_practiced, forgetting_score, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user["id"], kp, 52.0, 1, 1, now, 1.0, now)
            )
            new = 52.0
        updated.append({"kp": kp, "mastery": round(new, 1)})
    db.commit()
    return {"ok": True, "recorded": len(kps), "updated": updated}


@app.get("/api/student/weak_exercises")
def student_weak_exercises(user: dict = __import__('fastapi').Depends(require_user), limit: int = 5, threshold: float = 60.0):
    """返回薄弱知识点列表（掌握度 < threshold，升序），前端据此从题库匹配针对性练习题。"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    limit = max(1, min(20, int(limit)))
    rows = db.execute(
        "SELECT knowledge_point, mastery_score, attempts FROM knowledge_mastery WHERE user_id = ? AND mastery_score < ? ORDER BY mastery_score ASC LIMIT ?",
        (user["id"], threshold, limit)
    ).fetchall()
    out = []
    for kp, score, att in rows:
        if _is_dirty_kp(kp):  # v=20260904i 过滤论文标题/文献类脏知识点
            continue
        n = _normalize_kp(kp)
        out.append({"kp": kp, "kp_normalized": n, "mastery": round(score, 1), "attempts": att or 0})
    return {"ok": True, "weak_points": out}


class CompleteExerciseRequest(BaseModel):
    knowledge_points: list = []
    correct: bool = False
    question: str = ""
    user_answer: str = ""
    correct_answer: str = ""
    response_time_seconds: int = 0


@app.post("/api/student/complete_exercise")
def student_complete_exercise(req: CompleteExerciseRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """练习结果回写：答对提升掌握度，答错进错题本并显著降分；返回掌握度变化 + 诊断反馈。"""
    import json as _json
    from datetime import datetime as _dt
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    kps = []
    seen = set()
    for kp in (req.knowledge_points or []):
        n = _normalize_kp(kp if isinstance(kp, str) else str(kp))
        if n and n not in seen:
            seen.add(n)
            kps.append(n)
    db = get_db()
    now = _dt.utcnow().isoformat()
    # 1) 写入学习会话（practice 类型）
    db.execute(
        "INSERT INTO learning_sessions (user_id, session_type, knowledge_points, duration_seconds, correct_count, total_count, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], 'practice', _json.dumps(kps, ensure_ascii=False),
         req.response_time_seconds, 1 if req.correct else 0, 1, now)
    )
    # 2) 答错 → 进错题本（供全量重算与错题雷达联动）
    mistake_recorded = False
    if not req.correct and kps and req.question:
        try:
            db.execute(
                "INSERT INTO mistakes(user_id, qid, payload, question, user_answer, correct_answer, knowledge_point, chapter, times, last_time, created, deleted, status) "
                "VALUES(?,?,?,?,?,?,?,?,1,?,?,0,'active')",
                (user["id"], 'diag_' + str(_dt.utcnow().timestamp()).replace('.', ''),
                 _json.dumps({"qid": "diag", "knowledgePoint": kps[0]}, ensure_ascii=False),
                 (req.question or "")[:500], req.user_answer or "", req.correct_answer or "",
                 kps[0], '', now, now)
            )
            mistake_recorded = True
        except Exception:
            pass  # 错题本写入失败不影响掌握度回写

    # 2.5) v=20260907d 错题状态流自动回写：重做答对推进 active→consolidating→eliminated
    redo_reason = ""
    if kps:
        # 首次答错（刚插入新错题）不算"重做"，跳过状态回写；
        # 仅当"重做答对"或"重做答错（已存在错题，非首次）"时触发。
        if not (not req.correct and mistake_recorded):
            reason, changed = _mistake_redo_status_change(db, user["id"], kps[0], req.correct)
            if changed:
                redo_reason = reason

    # 2.6) v=20260907d 间隔复习计划自动登记
    for kp in kps:
        try:
            _record_review_event(db, user["id"], kp, req.correct)
        except Exception:
            pass

    # 3) 局部掌握度更新：答对 +5（封顶100），答错 -8（下限0）
    updated = []
    for kp in kps:
        row = db.execute(
            "SELECT mastery_score, attempts, correct_attempts FROM knowledge_mastery WHERE user_id = ? AND knowledge_point = ?",
            (user["id"], kp)
        ).fetchone()
        if row:
            old = row[0] or 50.0
            att = (row[1] or 0) + 1
            corr = (row[2] or 0) + (1 if req.correct else 0)
            new = old + (5 if req.correct else -8)
            new = max(0, min(100, new))
            db.execute(
                "UPDATE knowledge_mastery SET mastery_score = ?, attempts = ?, correct_attempts = ?, last_practiced = ?, updated = ? WHERE user_id = ? AND knowledge_point = ?",
                (round(new, 1), att, corr, now, now, user["id"], kp)
            )
        else:
            new = 55.0 if req.correct else 42.0
            db.execute(
                "INSERT INTO knowledge_mastery (user_id, knowledge_point, mastery_score, attempts, correct_attempts, last_practiced, forgetting_score, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user["id"], kp, new, 1, 1 if req.correct else 0, now, 1.0, now)
            )
        updated.append({"kp": kp, "mastery": round(new, 1),
                        "delta": round((new - (row[0] if row else 50.0)), 1)})
    db.commit()
    return {
        "ok": True,
        "correct": req.correct,
        "mastery": updated,
        "diagnosed": (not req.correct),
        "mistake_recorded": mistake_recorded,
        "redo_reason": redo_reason,
        "review_registered": bool(kps),
    }


# ─── v=20260907d 间隔复习计划 API ───

def _review_streak(db, user_id: int) -> int:
    """连续复习天数：从最近一次有答题活动（learning_sessions）的日子往前连续计数。"""
    rows = db.execute(
        "SELECT DISTINCT substr(timestamp, 1, 10) AS d FROM learning_sessions "
        "WHERE user_id = ? ORDER BY d DESC",
        (user_id,),
    ).fetchall()
    if not rows:
        return 0
    dates = {r[0] for r in rows if r[0]}
    today = datetime.utcnow().date()
    streak = 0
    cursor = today
    # 若今天还没记录,则从昨天开始算(允许当天尚未学习)
    if today.isoformat() not in dates:
        cursor = today - timedelta(days=1)
    while cursor.isoformat() in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _review_avg_accuracy(db, user_id: int) -> float:
    """近 7 天平均正确率（记忆保持率口径）：学习会话 correct_count/total_count。"""
    since = (datetime.utcnow() - timedelta(days=7)).isoformat()
    rows = db.execute(
        "SELECT correct_count, total_count FROM learning_sessions WHERE user_id = ? AND timestamp >= ?",
        (user_id, since),
    ).fetchall()
    tot = sum(r[1] or 0 for r in rows)
    corr = sum(r[0] or 0 for r in rows)
    if tot == 0:
        return 0.0
    return round(corr / tot * 100, 1)


@app.get("/api/review/today")
def review_today(user: dict = __import__('fastapi').Depends(get_current_user)):
    """今日待复习队列 + 进度 + 连续天数 + 近7天正确率。"""
    db = get_db()
    now = datetime.utcnow()
    today_end = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.execute(
        "SELECT kp, next_due, interval_idx, last_result FROM review_schedule "
        "WHERE user_id = ? AND next_due <= ? ORDER BY next_due ASC",
        (user["id"], today_end.isoformat()),
    ).fetchall()
    queue = [
        {"kp": r[0], "next_due": r[1], "interval_idx": r[2] or 0,
         "interval_days": _REVIEW_INTERVALS[r[2] or 0], "last_result": r[3] or ""}
        for r in rows
    ]
    return {
        "ok": True,
        "today_queue": queue,
        "today_total": len(queue),
        "today_done": 0,  # 复习完成数由前端按本次作答进度展示；后端记录下次到期
        "streak_days": _review_streak(db, user["id"]),
        "avg_accuracy_7d": _review_avg_accuracy(db, user["id"]),
    }


@app.get("/api/review/schedule")
def review_schedule(user: dict = __import__('fastapi').Depends(get_current_user)):
    """未来复习安排列表（按 next_due 升序）。"""
    db = get_db()
    rows = db.execute(
        "SELECT kp, next_due, interval_idx, last_result, updated FROM review_schedule "
        "WHERE user_id = ? ORDER BY next_due ASC",
        (user["id"],),
    ).fetchall()
    out = []
    for r in rows:
        kp = r[0]
        mastery = None
        mrow = db.execute(
            "SELECT mastery_score FROM knowledge_mastery WHERE user_id = ? AND knowledge_point = ?",
            (user["id"], kp),
        ).fetchone()
        if mrow:
            mastery = round(mrow[0], 1)
        out.append({
            "kp": kp,
            "next_due": r[1],
            "interval_idx": r[2] or 0,
            "interval_days": _REVIEW_INTERVALS[r[2] or 0],
            "last_result": r[3] or "",
            "updated": r[4] or "",
            "mastery": mastery,
        })
    return {"ok": True, "schedule": out, "count": len(out)}


@app.get("/api/review/summary")
def review_summary(user: dict = __import__('fastapi').Depends(get_current_user)):
    """首页「今日复习 N 项」卡 + 复习计划入口用的轻量汇总。"""
    db = get_db()
    now = datetime.utcnow()
    today_end = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    due = db.execute(
        "SELECT COUNT(*) FROM review_schedule WHERE user_id = ? AND next_due <= ?",
        (user["id"], today_end.isoformat()),
    ).fetchone()[0]
    return {
        "ok": True,
        "due_today": due or 0,
        "streak_days": _review_streak(db, user["id"]),
    }


