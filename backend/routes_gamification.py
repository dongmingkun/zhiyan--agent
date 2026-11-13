"""routes_gamification.py —— 学习小精灵与游戏化激励（原 backend/main.py 第 7219–7538 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ─── v=20260894 学习小精灵 + 游戏化激励系统 ───
# 等级体系: 1 新手 0-100 / 2 入门 100-300 / 3 学徒 300-700 / 4 学者 700-1500 / 5 大师 1500+
_LEVEL_TABLE = [
    (1, "🌱 线性代数新手", 0, 100),
    (2, "📐 入门学者",     100, 300),
    (3, "✏️ 进阶学徒",     300, 700),
    (4, "🎓 资深学者",     700, 1500),
    (5, "👑 线性代数大师", 1500, 99999),
]
_BADGE_RULES = [
    ("first_task",  "🎯 首次任务",     "完成 1 个学习任务"),
    ("streak_3",    "🔥 三日连击",     "连续 3 天打卡"),
    ("streak_7",    "💎 周挑战者",     "连续 7 天打卡"),
    ("points_100",  "💯 百分入门",     "累计获得 100 积分"),
    ("points_500",  "⭐ 五百壮士",     "累计获得 500 积分"),
    ("level_3",     "🚀 进阶学徒",     "晋升到等级 3"),
    ("level_5",     "👑 大师",         "晋升到等级 5(线性代数大师)"),
]


def _gamification_level(points: int):
    for lv, name, lo, hi in _LEVEL_TABLE:
        if lo <= points < hi:
            return lv, name, lo, hi
    return _LEVEL_TABLE[-1]


def _gamification_ensure(db, uid: int):
    row = db.execute("SELECT * FROM student_gamification WHERE user_id=?", (uid,)).fetchone()
    if not row:
        from datetime import datetime
        now = datetime.now().isoformat()
        db.execute("INSERT INTO student_gamification(user_id, points, level, streak_days, last_active_date, completed_tasks_json, badges_json, updated) VALUES(?,?,?,?,?,?,?,?)",
                   (uid, 0, 1, 0, '', '[]', '[]', now))
        db.commit()
        row = db.execute("SELECT * FROM student_gamification WHERE user_id=?", (uid,)).fetchone()
    return row


def _gamification_check_badges(points: int, level: int, streak: int, owned: list):
    """根据积分/等级/连续打卡返回新获徽章(尚未拥有的)"""
    owned_ids = {b.get("id") for b in owned}
    new_badges = []
    for bid, bname, bdesc in _BADGE_RULES:
        if bid in owned_ids:
            continue
        ok = False
        if bid == "first_task": ok = points >= 10
        elif bid == "streak_3": ok = streak >= 3
        elif bid == "streak_7": ok = streak >= 7
        elif bid == "points_100": ok = points >= 100
        elif bid == "points_500": ok = points >= 500
        elif bid == "level_3": ok = level >= 3
        elif bid == "level_5": ok = level >= 5
        if ok:
            new_badges.append({"id": bid, "name": bname, "desc": bdesc, "ts": __import__('datetime').datetime.now().isoformat()})
    return new_badges


def _gamification_daily_streak(last_active: str, today: str) -> int:
    """根据上次活跃日期计算今天应得的连续打卡天数(0/1/2/...)"""
    if not last_active:
        return 1
    if last_active == today:
        # 同一天不增加,但前端已记录的 streak_days 不动
        return -1  # 标记同一天
    try:
        from datetime import datetime, timedelta
        d1 = datetime.strptime(last_active, "%Y-%m-%d")
        d2 = datetime.strptime(today, "%Y-%m-%d")
        if d2 - d1 == timedelta(days=1):
            return 1   # 连续打卡 +1
        else:
            return 0   # 中断,重置为 1
    except Exception:
        return 1


@app.get("/api/student/gamification")
def student_gamification(user: dict = __import__('fastapi').Depends(require_user)):
    """返回积分/等级/连续打卡/已完成任务历史/徽章"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    import json as _json
    from datetime import datetime, date, timedelta
    db = get_db()
    row = _gamification_ensure(db, user["id"])
    cols = [d[1] for d in db.execute("PRAGMA table_info(student_gamification)").fetchall()]
    d = dict(zip(cols, row))
    points = d.get("points") or 0
    level, level_name, lo, hi = _gamification_level(points)
    progress_pct = 0 if hi == 99999 else min(100, round((points - lo) / max(1, (hi - lo)) * 100))
    completed = _json.loads(d.get("completed_tasks_json") or "[]")
    today = date.today().isoformat()
    # ── v=20260895 每日目标(多邻国 Daily Goal 式) ──
    daily_goal = 30
    today_points = sum(int(t.get("points") or 0) for t in completed if t.get("date") == today)
    daily_done = today_points >= daily_goal
    # ── v=20260895 最近 7 天打卡点阵(多邻国 Streak 式) ──
    active_dates = {t.get("date") for t in completed if t.get("date")}
    if d.get("last_active_date"):
        active_dates.add(d["last_active_date"])
    week_streak = []
    for i in range(6, -1, -1):
        day = (date.today() - timedelta(days=i)).isoformat()
        week_streak.append({"date": day, "active": day in active_dates, "today": day == today})
    return {
        "ok": True,
        "points": points,
        "level": level,
        "level_name": level_name,
        "next_level_points": hi,
        "level_progress_pct": progress_pct,
        "streak_days": d.get("streak_days") or 0,
        "last_active_date": d.get("last_active_date") or "",
        "completed_tasks": completed,
        "badges": _json.loads(d.get("badges_json") or "[]"),
        "badge_rules": [{"id": b[0], "name": b[1], "desc": b[2]} for b in _BADGE_RULES],
        # v=20260895 每日目标 + 今日积分 + 周打卡点阵
        "daily_goal": daily_goal,
        "today_points": today_points,
        "daily_done": daily_done,
        "week_streak": week_streak,
    }


# v=20260911 P0 根因修复：分值由服务端按任务类型决定，客户端传来的 points 一律忽略
# （原来 points 直接取自请求体 → 改成 99999 即可自封"线性代数大师"并刷满徽章）。
# 任务类型 = 平台各学习闭环入口 / 学习小精灵每日任务清单下发的任务种类。
TASK_POINTS = {
    "daily_task": 10,   # 小精灵「今日学习任务」清单（薄弱点巩固 / 新知识点探索）
    "practice":   10,   # 题库专项练习
    "review":     15,   # 错题本复习（消灭错题）
    "visualize":  5,    # 几何可视化观察
    "read":       5,    # 知识体系阅读
    "ask":        3,    # 向智能问答提问
}
_DEFAULT_TASK = "daily_task"


class TaskDoneRequest(BaseModel):
    kp: str = ""
    task: str = _DEFAULT_TASK   # 任务类型（服务端定分依据；不传按每日任务计）
    points: int = 10            # 已废弃：仅作兼容保留，服务端不再采信
    note: str = ""


@app.post("/api/student/task_done")
def student_task_done(req: TaskDoneRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """任务完成:加分,刷新连续打卡,解锁新徽章（分值由服务端任务类型表决定）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    import json as _json
    from datetime import datetime, date
    # 服务端定分：未知任务类型直接 400，绝不采用客户端分值
    task = (req.task or "").strip() or _DEFAULT_TASK
    if task not in TASK_POINTS:
        raise HTTPException(status_code=400, detail=f"未知任务类型：{task}")
    add_points = TASK_POINTS[task]
    db = get_db()
    row = _gamification_ensure(db, user["id"])
    cols = [d[1] for d in db.execute("PRAGMA table_info(student_gamification)").fetchall()]
    d = dict(zip(cols, row))
    today = date.today().isoformat()
    last_active = d.get("last_active_date") or ""
    completed = _json.loads(d.get("completed_tasks_json") or "[]")
    badges = _json.loads(d.get("badges_json") or "[]")

    # 同一天重复完成同一任务:不算新连续 + 不计分(温和防刷)
    is_dup = any(t.get("kp") == req.kp and t.get("date") == today for t in completed)
    if is_dup:
        return {"ok": True, "duplicate": True, "message": "今天已完成过此任务,不计分", "gamification": student_gamification(user=user)}

    # 累分（分值来自上面的 TASK_POINTS）
    new_points = (d.get("points") or 0) + add_points
    # 连续打卡
    streak = d.get("streak_days") or 0
    if last_active == today:
        cur_streak = streak
    else:
        cur_streak = _gamification_daily_streak(last_active, today)
        if cur_streak < 0:
            cur_streak = streak
        else:
            cur_streak = streak + cur_streak
    new_level, new_level_name, lo, hi = _gamification_level(new_points)
    # 任务历史
    completed.append({
        "kp": req.kp, "points": add_points, "date": today,
        "ts": datetime.now().isoformat(), "note": req.note or ""
    })
    # 徽章解锁
    new_badges = _gamification_check_badges(new_points, new_level, cur_streak, badges)
    badges.extend(new_badges)
    # 写回
    db.execute(
        "UPDATE student_gamification SET points=?, level=?, streak_days=?, last_active_date=?, completed_tasks_json=?, badges_json=?, updated=? WHERE user_id=?",
        (new_points, new_level, cur_streak, today, _json.dumps(completed, ensure_ascii=False), _json.dumps(badges, ensure_ascii=False), datetime.now().isoformat(), user["id"])
    )
    db.commit()
    return {
        "ok": True,
        "duplicate": False,
        "added_points": add_points,
        "new_total_points": new_points,
        "new_level": new_level,
        "new_level_name": new_level_name,
        "streak_days": cur_streak,
        "new_badges": new_badges,
    }


@app.get("/api/student/mentor_tip")
def student_mentor_tip(user: dict = __import__('fastapi').Depends(require_user)):
    """学习小精灵:基于画像/路径给出今日学习建议(LLM 生成,失败回退模板)
    返回:tip(主建议)+reason(为什么这样规划)+plan(可执行步骤)+encouragement(激励语)+daily_tasks(3-5 个今日任务)"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    import json as _json
    db = get_db()
    # 1) 收集画像 + 路径关键数据
    row = db.execute("SELECT * FROM student_profiles WHERE user_id=?", (user["id"],)).fetchone()
    if not row:
        _profile_update(user["id"])
        row = db.execute("SELECT * FROM student_profiles WHERE user_id=?", (user["id"],)).fetchone()
    cols = [d[1] for d in db.execute("PRAGMA table_info(student_profiles)").fetchall()]
    p = dict(zip(cols, row))
    overall = p.get("overall_mastery") or 50
    style = _json.loads(p.get("learning_style") or "{}")
    cog = _json.loads(p.get("cognitive_level") or "{}")
    confidence = p.get("confidence_score") or 50
    # 薄弱点(掌握度 < 60)
    weak_rows = db.execute(
        "SELECT knowledge_point, mastery_score FROM knowledge_mastery WHERE user_id=? AND mastery_score < 60 ORDER BY mastery_score ASC LIMIT 5",
        (user["id"],)
    ).fetchall()
    # v=20260904i 过滤论文标题/文献类脏知识点
    weak_rows = [w for w in weak_rows if not _is_dirty_kp(w[0])]
    weak_kps = [{"kp": w[0], "mastery": round(w[1], 1)} for w in weak_rows]
    # 学习风格 top
    top_style = max(style, key=style.get) if style else "practice"
    style_names = {"visual":"可视化", "reading":"阅读", "practice":"实践", "theory":"理论"}

    # 2) 选前 3 个薄弱点作为今日任务
    daily_tasks = []
    for w in weak_kps[:3]:
        daily_tasks.append({
            "kp": w["kp"],
            "mastery": w["mastery"],
            "suggestion": f"通过题目巩固「{w['kp']}」(当前掌握 {w['mastery']}%)",
            "points": 10,
        })
    if not daily_tasks:
        # 没有薄弱点 → 推荐新知识点
        for kp in ["矩阵乘法", "特征值计算", "行列式展开", "向量组相关性", "矩阵的秩"]:
            daily_tasks.append({"kp": kp, "mastery": 50, "suggestion": f"探索新知识点「{kp}」", "points": 10})
            if len(daily_tasks) >= 3:
                break

    # 3) 调用 LLM 生成个性化 tip(失败回退到模板)
    user_text = (
        f"学生画像:综合掌握度 {overall}%, 信心指数 {confidence}/100, "
        f"主导学习风格 {style_names.get(top_style, top_style)}, "
        f"反应速度 {cog.get('speed', 0.5):.2f}, 精度 {cog.get('accuracy', 0.5):.2f}. "
        f"薄弱知识点 TOP3: " + "; ".join([f"{w['kp']}({w['mastery']}%)" for w in weak_kps[:3]]) + ". "
        "请用 60-100 字给出今日学习建议(激励性,具体可执行),并用 40-60 字说明为什么这样规划路径."
    )
    sys_prompt = (
        "你是一位耐心且专业的线代学习小精灵,角色亲切,像教练一样鼓励学生。"
        "基于给定的学生画像(综合掌握度/信心指数/学习风格/反应速度和精度/薄弱知识点),"
        "生成个性化今日学习建议。要求:1)语气活泼(可用 emoji);2)具体可执行(建议做什么任务);"
        "3)简短精炼(50-100 字);4)结尾给一句鼓励。"
        "严格按 JSON 格式返回:{\"tip\": \"...\", \"reason\": \"...\", \"encouragement\": \"...\"}"
    )
    tip, reason, encouragement = _local_mentor_template(overall, confidence, top_style, weak_kps)
    try:
        from openai import OpenAI
        api_key = os.environ.get("LLM_API_KEY", "")
        base_url = os.environ.get("LLM_BASE_URL")
        if api_key:
            kw = {"api_key": api_key}
            if base_url: kw["base_url"] = base_url
            cli = OpenAI(**kw)
            resp = cli.chat.completions.create(
                model=os.environ.get("LLM_MODEL", "deepseek-chat"),
                messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_text}],
                temperature=0.6, max_tokens=600, timeout=(5, 8),  # v=20260900 连接5s+读取8s,避免挂起
                response_format={"type": "json_object"},
            )
            data = _json.loads(resp.choices[0].message.content)
            tip = (data.get("tip") or "").strip() or tip
            reason = (data.get("reason") or "").strip() or reason
            encouragement = (data.get("encouragement") or "").strip() or encouragement
    except Exception:
        pass  # 失败用模板 tip(已默认赋值)

    return {
        "ok": True,
        "tip": tip,
        "reason": reason,
        "encouragement": encouragement,
        "daily_tasks": daily_tasks,
        "style_name": style_names.get(top_style, top_style),
        "overall": overall,
        "confidence": confidence,
    }


def _local_mentor_template(overall, confidence, top_style, weak_kps):
    """LLM 失败时的回退模板,基于画像规则生成建议"""
    style_advice = {
        "visual": "你擅长图形化理解,建议用「几何可视化」模块观察矩阵变换动画加深印象。",
        "reading": "你适合文字推导,建议去「知识体系」读章节原文与定义证明。",
        "practice": "你最擅长从练习中学习,建议用「可验证求解引擎」和题库刷题巩固。",
        "theory": "你喜欢理论推导,建议在「智能问答」问「请证明...」做严格论证练习。"
    }
    if overall < 50:
        tip = f"🎯 今天专注攻克薄弱点:建议先刷 3 道「{weak_kps[0]['kp'] if weak_kps else '基础概念'}」相关题目,每做对 1 道 +10 分,小步快跑!"
    elif overall < 70:
        tip = f"🌟 你基础不错,今天主攻「{weak_kps[0]['kp'] if weak_kps else '下一个难点'}」,建议先看 1 个例题再独立做 2 道,提升熟练度。"
    else:
        tip = f"🚀 你已经领先,今天挑战「延伸思考」类题或跨章节综合题,如行列式+特征值的综合应用,巩固优势!"
    reason = (
        f"根据你的画像(综合 {overall}%, 信心 {confidence}/100),"
        f"你当前主要需要{'巩固基础' if overall<50 else '查漏补缺' if overall<70 else '拔高拓展'},"
        f"且「{style_advice.get(top_style, '')}」"
    )
    encouragement = "每一天都在向前,坚持就是胜利!💪"
    return tip, reason, encouragement

