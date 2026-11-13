"""routes_admin.py —— 管理后台（admin）与开发者控制台（dev，含训练控制）（原 backend/main.py 第 2462–3337 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）


def _get_env(key: str, default: str = "") -> str:
    """读取 .env 文件中的配置（原代码引用了该函数但未定义，2026-09-11 补全）。"""
    try:
        if os.path.exists(_ENV_FILE):
            with open(_ENV_FILE, "r", encoding="utf-8") as f:
                for ln in f.read().splitlines():
                    if ln.strip().startswith(key + "="):
                        return ln.strip().split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get(key, default)


# ═══════════════ 管理后台（仅 admin 角色） ═══════════════
def require_admin(user: dict = Depends(require_user)) -> dict:
    """要求管理员角色，否则 403。
    v=20260904b P0 安全：演示账号(demo)服务端强制只读，即使 role 被误改也禁止访问任何管理面。"""
    if (user.get("username") or "") == "demo":
        raise HTTPException(status_code=403, detail="演示账号为只读，无管理/开发者权限")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@app.get("/api/admin/stats")
def admin_stats(user: dict = Depends(require_admin)):
    db = get_db()
    users = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    today = datetime.utcnow().strftime("%Y-%m-%d")
    new_today = db.execute("SELECT COUNT(*) FROM users WHERE created LIKE ?", (today + "%",)).fetchone()[0]
    chats = db.execute("SELECT COUNT(*) FROM chat_history").fetchone()[0]
    chat_today = db.execute("SELECT COUNT(*) FROM chat_history WHERE created LIKE ?", (today + "%",)).fetchone()[0]
    notes = db.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    mistakes = db.execute("SELECT COUNT(*) FROM mistakes").fetchone()[0]
    tok = db.execute("SELECT COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(cost_tokens),0) FROM token_usage").fetchone()
    credits = db.execute("SELECT COALESCE(SUM(balance),0), COALESCE(SUM(total_consumed),0) FROM user_credits").fetchone()
    active = db.execute("SELECT COUNT(*) FROM users WHERE status='active'").fetchone()[0]
    banned = db.execute("SELECT COUNT(*) FROM users WHERE status='banned'").fetchone()[0]
    today_active = db.execute("SELECT COUNT(*) FROM users WHERE last_login LIKE ?", (today + "%",)).fetchone()[0]
    return {
        "ok": True,
        "total_users": users, "new_users_today": new_today,
        "total_chats": chats, "chats_today": chat_today,
        "total_notes": notes, "total_mistakes": mistakes,
        "prompt_tokens": tok[0] or 0, "completion_tokens": tok[1] or 0,
        "cost_tokens": tok[2] or 0,
        "credits_total": credits[0] or 0, "credits_consumed": credits[1] or 0,
        "active_users": active, "banned_users": banned,
        "today_active_users": today_active,
    }


@app.get("/api/admin/users")
def admin_users(user: dict = Depends(require_admin), q: str = "", page: int = 1, page_size: int = 10):
    """用户列表：支持分页 + ID/昵称/账号多条件模糊搜索"""
    db = get_db()
    page = max(1, int(page))
    page_size = max(1, min(50, int(page_size)))
    where, params = "", []
    if q and q.strip():
        qq = "%" + q.strip() + "%"
        where = "WHERE CAST(u.id AS TEXT) LIKE ? OR u.nickname LIKE ? OR u.username LIKE ?"
        params = [qq, qq, qq]
    total = db.execute(f"SELECT COUNT(*) FROM users u {where}", params).fetchone()[0]
    pages = (total + page_size - 1) // page_size
    rows = db.execute(
        f"SELECT u.id, u.username, u.nickname, u.avatar, u.role, u.status, u.created, u.last_login, "
        f"(SELECT COUNT(*) FROM chat_history c WHERE c.user_id = u.id), "
        f"(SELECT COALESCE(balance,0) FROM user_credits uc WHERE uc.user_id = u.id) "
        f"FROM users u {where} ORDER BY u.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size]
    ).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r[0], "username": r[1], "nickname": r[2] or r[1],
            "avatar": r[3] or (r[1][0].upper() if r[1] else "?"),
            "role": r[4] or "user", "status": r[5] or "active",
            "created": r[6] or "", "last_login": r[7] or "",
            "questions": r[8] or 0, "credits": r[9] or 0,
        })
    return {"ok": True, "users": out, "total": total, "page": page,
            "page_size": page_size, "pages": pages}


class AdminUserAction(BaseModel):
    action: str = "ban"          # ban | unban | reset_quota | delete | reset_password | promote | adjust_credits
    password: str = ""           # reset_password 时使用的新密码
    credits: int = 0             # adjust_credits 时设置的积分余额


def _delete_user_cascade(db, uid: int):
    """注销用户：级联删除该用户全部关联数据（不可恢复）"""
    placeholders = "?"
    db.execute("DELETE FROM chat_history WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM notes WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM mistakes WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM user_credits WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM user_sessions WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM credit_orders WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM student_profiles WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM knowledge_mastery WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM learning_sessions WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM group_members WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM moments WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM messages WHERE from_user_id = ? OR to_user_id = ?", (uid, uid))
    db.execute("DELETE FROM friends WHERE from_user_id = ? OR to_user_id = ?", (uid, uid))
    db.execute("DELETE FROM groups WHERE owner_id = ?", (uid,))
    db.execute("DELETE FROM token_usage WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM users WHERE id = ?", (uid,))


@app.post("/api/admin/users/{uid}/action")
def admin_user_action(uid: int, req: AdminUserAction, user: dict = Depends(require_admin)):
    # 危险操作禁止对自己执行；积分调整（需求：管理员可改自己积分）与任命除外
    if uid == user["id"] and req.action not in ("adjust_credits", "promote"):
        raise HTTPException(status_code=400, detail="不能对自己执行此操作")
    db = get_db()
    row = db.execute("SELECT id, role FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")
    if req.action == "ban":
        db.execute("UPDATE users SET status='banned' WHERE id = ?", (uid,))
        db.execute("UPDATE users SET token='' WHERE id = ?", (uid,))  # 立即踢下线
        db.execute("DELETE FROM user_sessions WHERE user_id = ?", (uid,))  # 清会话：所有设备全部失效
    elif req.action == "unban":
        db.execute("UPDATE users SET status='active' WHERE id = ?", (uid,))
    elif req.action == "reset_quota":
        # 重置用户数据：试用额度 + 积分归零 + 清空错题记录
        db.execute("UPDATE users SET guest_quota=5 WHERE id = ?", (uid,))
        db.execute("UPDATE user_credits SET balance=0, total_purchased=0, total_consumed=0 WHERE user_id = ?", (uid,))
        db.execute("DELETE FROM mistakes WHERE user_id = ?", (uid,))
    elif req.action == "delete":
        # 注销账号：仅限非管理员（管理员账号受保护）
        if (row[1] or "user") == "admin":
            raise HTTPException(status_code=400, detail="管理员账号不可注销")
        _delete_user_cascade(db, uid)
    elif req.action == "reset_password":
        # 重置密码：更新哈希 + 明文副本 + 强制所有会话下线
        new_pwd = (req.password or "").strip()
        if len(new_pwd) < 6:
            raise HTTPException(status_code=400, detail="新密码长度至少 6 位")
        pwd_hash, salt = hash_password(new_pwd)
        db.execute("UPDATE users SET password_hash = ?, salt = ?, token = '' WHERE id = ?",
                   (pwd_hash, salt, uid))
        db.execute("DELETE FROM user_sessions WHERE user_id = ?", (uid,))
    elif req.action == "promote":
        # 任命已有普通用户为管理员（管理员角色即时生效）
        if (row[1] or "user") == "admin":
            raise HTTPException(status_code=400, detail="该用户已是管理员")
        db.execute("UPDATE users SET role = 'admin' WHERE id = ?", (uid,))
    elif req.action == "adjust_credits":
        # 调整用户积分（余额直接设置为指定值，可为任意非负整数；管理员也可调整自己）
        new_balance = max(0, int(req.credits))
        exists = db.execute("SELECT 1 FROM user_credits WHERE user_id = ?", (uid,)).fetchone()
        if exists:
            db.execute("UPDATE user_credits SET balance = ?, updated = ? WHERE user_id = ?",
                       (new_balance, datetime.now().isoformat(), uid))
        else:
            db.execute("INSERT INTO user_credits(user_id, balance, total_purchased, total_consumed, updated) "
                       "VALUES(?,?,0,0,?)", (uid, new_balance, datetime.now().isoformat()))
    else:
        raise HTTPException(status_code=400, detail="未知操作")
    db.commit()
    return {"ok": True}


@app.get("/api/admin/users/{uid}/password")
def admin_user_password(uid: int, user: dict = Depends(require_admin)):
    """v=20260904b P0 安全：明文密码已清零，禁止查看任何用户密码（仅保留单向哈希）"""
    raise HTTPException(status_code=403, detail="系统已下线明文密码，密码仅以单向哈希存储，无法查看")


# ══════════════════════════════════════════════════════════════════
# 开发者控制台（Developer Console）· 管理员专属
#   - 模型/密钥配置查看与在线更换（写 .env + 同步 os.environ，无需重启）
#   - Token 用量统计（token_usage 表）
#   - 数据库浏览器（表清单 + 数据预览，敏感列自动脱敏）
#   - 离线挂机自训练控制（启动/停止/调速/日志）
# ══════════════════════════════════════════════════════════════════

_ENV_FILE = os.path.join(PROJECT_ROOT, ".env")

# 敏感列：数据库浏览器里默认脱敏
_SENSITIVE_COLS = {"password_hash", "salt", "token", "api_key", "secret"}


def _mask_key(key: str) -> str:
    """密钥脱敏：保留前 6 位 + 后 4 位，中间打码。"""
    if not key:
        return ""
    if len(key) <= 12:
        return key[:3] + "****"
    return key[:6] + "****" + key[-4:]



def _set_env(key: str, value: str) -> bool:
    """把 key=value 写入 .env(保留注释/顺序),并同步 os.environ。"""
    try:
        os.environ[key] = value
        lines = []
        if os.path.exists(_ENV_FILE):
            with open(_ENV_FILE, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
        found = False
        for i, ln in enumerate(lines):
            if ln.strip().startswith(key + "="):
                lines[i] = f"{key}={value}"
                found = True
                break
        if not found:
            lines.append(f"{key}={value}")
        with open(_ENV_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        return True
    except Exception as e:
        print(f"[DevConsole] 写 .env 失败 {key}: {e}")
        return False


def _read_env_file() -> dict:
    out = {}
    try:
        if os.path.exists(_ENV_FILE):
            with open(_ENV_FILE, "r", encoding="utf-8") as f:
                for ln in f.read().splitlines():
                    ln = ln.strip()
                    if not ln or ln.startswith("#") or "=" not in ln:
                        continue
                    k, v = ln.split("=", 1)
                    out[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return out


@app.get("/api/dev/dashboard")
def dev_dashboard(user: dict = Depends(require_admin)):
    """控制台概览：模型配置(脱敏) + 功能模型映射 + Token 汇总 + 数据库统计 + 训练状态。"""
    db = get_db()
    envf = _read_env_file()
    now = datetime.utcnow().isoformat()
    today = now[:10]
    # ── 模型配置(脱敏) ──
    llm_key = os.environ.get("LLM_API_KEY", "")
    vision_key = os.environ.get("LLM_VISION_API_KEY", "") or llm_key
    # v=20260824i 视觉模型综合状态(spark 优先 / openai 兼容 / OCR 兜底)
    spark_ok = spark_image is not None and spark_image._is_configured()
    spark_appid = os.environ.get("SPARK_IMAGE_APPID", "")
    spark_api_key = os.environ.get("SPARK_IMAGE_API_KEY", "")
    spark_secret = os.environ.get("SPARK_IMAGE_API_SECRET", "")
    ocr_ok = ocr_engine is not None and ocr_engine.is_available()
    if spark_ok:
        v_engine, v_status, v_desc = "spark-image", "✅ 已配置", "科大讯飞星火(WebSocket)"
    elif vision_key:
        v_engine, v_status, v_desc = "openai-compatible", "✅ 已配置", "OpenAI 兼容协议"
    else:
        v_engine, v_status, v_desc = "ocr-fallback", "⚠️ 未配置视觉模型", "当前图片问答走本地 RapidOCR 兜底"
    config = {
        "llm_model": _display_model(os.environ.get("LLM_MODEL", "deepseek-chat")),
        "llm_base_url": os.environ.get("LLM_BASE_URL", ""),
        "llm_api_key_masked": _mask_key(llm_key),
        "llm_api_key_configured": bool(llm_key),
        # v=20260824i 视觉模型完整配置(三引擎并列展示)
        "vision_engine": v_engine,
        "vision_status": v_status,
        "vision_desc": v_desc,
        "vision_model": (
            f"spark-{os.environ.get('SPARK_IMAGE_DOMAIN', 'image')}" if spark_ok
            else _display_model(os.environ.get("LLM_VISION_MODEL") or "(未配置)")
        ),
        "vision_base_url": (
            "wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image" if spark_ok
            else (os.environ.get("LLM_VISION_BASE_URL") or "(未配置)")
        ),
        "vision_api_key_masked": _mask_key(vision_key),
        "vision_api_key_configured": bool(vision_key),
        # spark 专项配置
        "spark_configured": spark_ok,
        "spark_appid_masked": _mask_key(spark_appid),
        "spark_api_key_masked": _mask_key(spark_api_key),
        "spark_secret_masked": _mask_key(spark_secret) if spark_secret else "",
        "spark_domain": os.environ.get("SPARK_IMAGE_DOMAIN", "image"),
        "ocr_available": ocr_ok,
        "ocr_engine": "rapidocr" if ocr_ok else "unavailable",
        "engine_enabled": RAG_ENABLED,
        "rag_available": RAG_AVAILABLE,
        "fewshot_count": len(_FEWSHOT_EXAMPLES),
    }
    # 各功能使用的模型映射
    features = [
        {"feature": "智能问答/流式(chat)", "model": os.environ.get("LLM_MODEL", "deepseek-chat"),
         "key": _mask_key(llm_key), "key_type": "LLM_API_KEY"},
        {"feature": "视觉/图片识别(vision)", "model": os.environ.get("LLM_VISION_MODEL", "") or os.environ.get("LLM_MODEL", "deepseek-chat"),
         "key": _mask_key(vision_key), "key_type": "LLM_VISION_API_KEY 或 LLM_API_KEY"},
        {"feature": "本地可验证求解引擎", "model": "SymPy + NumPy", "key": "本地无密钥", "key_type": "本地引擎"},
        {"feature": "RAG 知识库检索", "model": "BM25(本地)", "key": "本地无密钥", "key_type": "本地引擎"},
    ]
    # ── Token 用量统计 ──
    tok = db.execute(
        "SELECT COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(cost_tokens),0) FROM token_usage"
    ).fetchone()
    tok_today = db.execute(
        "SELECT COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(cost_tokens),0) "
        "FROM token_usage WHERE date(created) = ?", (today,)
    ).fetchone()
    tok_by_model = db.execute(
        "SELECT COALESCE(model,'-'), SUM(prompt_tokens), SUM(completion_tokens) FROM token_usage GROUP BY model ORDER BY 2 DESC"
    ).fetchall()
    # 别名折叠:历史写入的 deepseek-chat 实际是 V4-Flash,统一映射后同名行合并,
    # 避免新旧调用共存时出现两条同显示名但分开的记录
    by_model_map = {}
    for r in tok_by_model:
        key = _display_model(r[0])
        if key in by_model_map:
            by_model_map[key]["prompt"] += r[1]
            by_model_map[key]["completion"] += r[2]
        else:
            by_model_map[key] = {"model": key, "prompt": r[1], "completion": r[2]}
    # 近 7 天
    days = []
    for i in range(6, -1, -1):
        d = (datetime.utcnow() - __import__('datetime').timedelta(days=i)).strftime("%Y-%m-%d")
        r = db.execute("SELECT COALESCE(SUM(prompt_tokens),0)+COALESCE(SUM(completion_tokens),0) FROM token_usage WHERE date(created)=?", (d,)).fetchone()
        days.append({"date": d, "tokens": r[0]})
    token_usage = {
        "total_prompt": tok[0], "total_completion": tok[1], "total_cost": tok[2],
        "today_prompt": tok_today[0], "today_completion": tok_today[1], "today_cost": tok_today[2],
        "by_model": sorted(by_model_map.values(), key=lambda x: -(x["prompt"] + x["completion"])),
        "last_7_days": days,
    }
    # ── 数据库统计 ──
    tables = []
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        try:
            cnt = db.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        except Exception:
            cnt = -1
        tables.append({"table": name, "rows": cnt})
    # ── 训练状态 ──
    train_state = {}
    try:
        with open(os.path.join(PROJECT_ROOT, "self_train_state.json"), "r", encoding="utf-8") as f:
            train_state = json.load(f)
    except Exception:
        pass
    return {
        "ok": True,
        "config": config,
        "features": features,
        "token_usage": token_usage,
        "tables": tables,
        "train": train_state,
        "updated": now,
    }


class UpdateLLMRequest(BaseModel):
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    vision_model: str = ""
    vision_base_url: str = ""
    vision_api_key: str = ""


@app.post("/api/dev/update_llm")
def dev_update_llm(req: UpdateLLMRequest, user: dict = Depends(require_admin)):
    """在线更换 API 模型/地址/密钥：写 .env + 同步 os.environ，立即生效无需重启。"""
    changed = []
    # 空字符串表示不修改该字段
    if req.model:
        _set_env("LLM_MODEL", req.model.strip())
        changed.append("LLM_MODEL")
    if req.base_url:
        _set_env("LLM_BASE_URL", req.base_url.strip())
        changed.append("LLM_BASE_URL")
    if req.api_key:
        _set_env("LLM_API_KEY", req.api_key.strip())
        changed.append("LLM_API_KEY")
    # 同时测活 — 反馈给调用方,真实下载 ns
    try:
        from openai import OpenAI
        cfg = {"api_key": os.environ.get("LLM_API_KEY") or _get_env("LLM_API_KEY") or ""}
        bu = os.environ.get("LLM_BASE_URL") or _get_env("LLM_BASE_URL")
        if bu: cfg["base_url"] = bu
        c = OpenAI(**{k: v for k, v in cfg.items() if v})
        resp = c.chat.completions.create(
            model=os.environ.get("LLM_MODEL") or _get_env("LLM_MODEL"),
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=8, timeout=10,
        )
        ok = bool(resp.choices)
        msg = "✓ 已生效 + API 可访问" if ok else "⚠ 已写入 .env 但 API 无响应"
    except Exception as e:
        ok = False
        msg = f"⚠ 已写入 .env,但 ping 失败:{str(e)[:160]}"
    if req.vision_model:
        _set_env("LLM_VISION_MODEL", req.vision_model.strip())
        changed.append("LLM_VISION_MODEL")
    if req.vision_base_url:
        _set_env("LLM_VISION_BASE_URL", req.vision_base_url.strip())
        changed.append("LLM_VISION_BASE_URL")
    if req.vision_api_key:
        _set_env("LLM_VISION_API_KEY", req.vision_api_key.strip())
        changed.append("LLM_VISION_API_KEY")
    if not changed:
        return {"ok": True, "changed": [], "message": "未提交任何修改"}
    return {
        "ok": True, "changed": changed,
        "message": ("已在线更新并同步生效: " + ", ".join(changed)) + (f" | {msg}" if 'msg' in dir() and msg else ""),
        "ping_ok": ok,
        "config": {
            "llm_model": _display_model(os.environ.get("LLM_MODEL", "")),
            "llm_base_url": os.environ.get("LLM_BASE_URL", ""),
            "llm_api_key_masked": _mask_key(os.environ.get("LLM_API_KEY", "")),
            "vision_model": _display_model(os.environ.get("LLM_VISION_MODEL", "")),
            "vision_base_url": os.environ.get("LLM_VISION_BASE_URL", ""),
            "vision_api_key_masked": _mask_key(os.environ.get("LLM_VISION_API_KEY", "")),
        },
    }


@app.post("/api/dev/test_llm")
def dev_test_llm(user: dict = Depends(require_admin)):
    """独立测试当前 LLM 连通性(不修改任何配置)。"""
    import time as _t
    try:
        from openai import OpenAI
        cfg = {"api_key": os.environ.get("LLM_API_KEY") or _get_env("LLM_API_KEY") or ""}
        bu = os.environ.get("LLM_BASE_URL") or _get_env("LLM_BASE_URL")
        if bu: cfg["base_url"] = bu
        if not cfg.get("api_key"):
            return {"ok": False, "error": "未配置 LLM_API_KEY", "ms": 0}
        c = OpenAI(**cfg)
        t0 = _t.time()
        resp = c.chat.completions.create(
            model=os.environ.get("LLM_MODEL") or _get_env("LLM_MODEL") or "deepseek-chat",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=8, timeout=10,
        )
        ms = int((_t.time() - t0) * 1000)
        return {"ok": True, "ms": ms, "model": resp.model, "reply": (resp.choices[0].message.content or "")[:60]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200], "ms": 0}


# v=20260824i 视觉模型连通性测试:真实发起调用,返回识别结果
@app.post("/api/dev/test_vision")
def dev_test_vision(user: dict = Depends(require_admin)):
    """独立测试视觉模型。1x1 PNG 假图 → 走完整链路(Spark → OpenAI → OCR)
    返回每个引擎的实测结果,管理员可一键看出问题。"""
    import base64 as _b64
    import time as _t
    # v=20260824k 有效测试图:320x240 白底红圆(PNG)。
    # 旧版 1x1 透明图会触发星火 code=10041(像素需 50x50~6000x6000),导致管理后台 Spark 测试误报失败。
    tiny_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAE/0lEQVR4nO3by3LbMBBFQSrl//9lZeHYkS1RovgCLqZ7n4TBzCFYrvLler1OQKY/rR8AWE/AEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEEzAEOyj9QOw2eWy6Y9frzs9Bw0IOMrGVpf/naoOIeC+HVHsin9Xz70ScH9aRfvE7SOJuScC7kOH0c4Rc08E3FRQtw99P7+SGxFwC+nd3lNyIwI+13jp/vL5H5TxWQR8iuG7/cWFfBYBH6xaur+4kA8m4MMUT/eWjA8j4ANI9yEZH8AvM+xNvc85n125gfdjNRdyFe9HwHuQ7goy3oNP6M3Uu4XT28YNvIHl24WreAM38Frq3ZfzXEXAq9i2IzjV9/mEfpMlO5TP6Te5gd+h3nM458UEvJitOpPTXkbAy9in8znzBQS8gE1qxcm/IuBX7FBbzv8pAT9le3pgCvMEPM/e9MMsZgh4ho3pjYk8IuBH7EqfzOWOgCGYgO94zffMdH4S8E/2o39mdEPAN2xGCpP6ImAIJuAvXupZzGuaJgH/YxsSmZqAIZqAvciTlZ+dgCFY+YDLv8Lj1Z5g+YAhWe2Aa7+8x1F4jrUDhnCFAy782h5Q1WkWDhjyCRiCVQ246hfXyErOtGrAMAQBQ7CSAZf81iqh3mRLBgyjEDAEEzAEEzAEqxdwvZ9z1FJsvvUChoEIGIIJGIIJGIIJGIIJGIIJGIIJGIIJGIIJGIIJGIIJGILVC/h6bf0EHKnYfOsFDAMRMAQTMAQTMAQrGXCxn3MUUm+yJQOGUQgYglUNuN631vhKzrRqwDAEAUOwwgGX/OIaVtVpFg4Y8tUOuOprezSF51g7YAhXPuDCL+9B1J5g+YAhmYCrv8KzlZ+dgCGYgKdp8iLPZGoC/s82ZDGvaZoEDNEEfMNLPYVJfRHwTzajf2Z0Q8B37EfPTOcnAUMwAT/iNd8nc7kj4Bl2pTcm8oiA59mYfpjFDAE/ZW96YArzBPyK7WnL+T8l4AXsUCtO/hUBL2OTzufMFxDwYvbpTE57GQG/w1adwzkv9tH6AdJ87tbl0vo5BiXdN7mBV7FnR3Cq7xPwWrZtX85zFZ/QG/ic3oV0N3ADb2b/tnB627iB9+AqXkG6exDwfmS8kHT34xN6b7bzOeezKzfwAVzFD0n3AAI+jIy/SfcwAj5Y8YylezABn+J7j4uUrNuzCPhcw1/I0j2XgFsY70LWbSMCbiq9ZN22JuA+3JbQecyi7YmA+9NhzKLtlYD79quc03pWbAgBR3nY1caqtZpMwPkUWJhfZoBgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgAoZgfwG+6McbGPJjIAAAAABJRU5ErkJggg=="
    data_url = f"data:image/png;base64,{tiny_png_b64}"
    results = {}
    # 1. 试 Spark
    if spark_image is not None and spark_image._is_configured():
        try:
            t0 = _t.time()
            async def _try_spark():
                out = []
                async for d in spark_image.stream_chat("这张图里有什么?请描述。", [data_url], max_tokens=30, timeout=15):
                    out.append(d)
                return "".join(out)
            import asyncio
            loop = asyncio.new_event_loop()
            try:
                reply = loop.run_until_complete(_try_spark())
            finally:
                loop.close()
            results["spark"] = {"ok": True, "ms": int((_t.time()-t0)*1000), "reply": reply[:100], "engine": "spark-image"}
        except Exception as e:
            results["spark"] = {"ok": False, "ms": int((_t.time()-t0)*1000), "error": str(e)[:200], "engine": "spark-image"}
    else:
        results["spark"] = {"ok": False, "skipped": True, "reason": "未配置 SPARK_IMAGE_* 环境变量"}
    # 2. 试 OpenAI 兼容 vision
    v_key = os.environ.get("LLM_VISION_API_KEY")
    v_url = os.environ.get("LLM_VISION_BASE_URL")
    if v_key and v_url:
        try:
            from openai import OpenAI
            c = OpenAI(api_key=v_key, base_url=v_url)
            t0 = _t.time()
            resp = c.chat.completions.create(
                model=os.environ.get("LLM_VISION_MODEL", "image"),
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": "这张图里有什么?请描述。"},
                    {"type": "image_url", "image_url": {"url": data_url}}
                ]}],
                max_tokens=30, timeout=15,
            )
            ms = int((_t.time()-t0)*1000)
            results["openai_vision"] = {"ok": True, "ms": ms, "reply": (resp.choices[0].message.content or "")[:100], "engine": "openai-compatible"}
        except Exception as e:
            results["openai_vision"] = {"ok": False, "ms": int((_t.time()-t0)*1000), "error": str(e)[:200], "engine": "openai-compatible"}
    else:
        results["openai_vision"] = {"ok": False, "skipped": True, "reason": "未配置 LLM_VISION_* 环境变量"}
    # 3. 试 OCR
    if ocr_engine is not None:
        try:
            t0 = _t.time()
            # 解 base64 到 bytes
            img_bytes = _b64.b64decode(tiny_png_b64)
            r = ocr_engine.ocr_image(img_bytes)
            results["ocr"] = {"ok": r.get("ok", False), "ms": r.get("cost_ms", int((_t.time()-t0)*1000)),
                              "engine": r.get("engine", "rapidocr"), "text": r.get("text", "")[:50]}
        except Exception as e:
            results["ocr"] = {"ok": False, "error": str(e)[:200], "engine": "rapidocr"}
    else:
        results["ocr"] = {"ok": False, "skipped": True, "reason": "ocr_engine 未加载"}
    # 综合判断当前实际可用引擎
    if results.get("spark", {}).get("ok"):
        active = "spark"
    elif results.get("openai_vision", {}).get("ok"):
        active = "openai_vision"
    elif results.get("ocr", {}).get("ok") or results.get("ocr", {}).get("skipped") is False:
        active = "ocr"
    else:
        active = "none"
    return {"ok": active != "none", "active_engine": active, "results": results}


@app.get("/api/dev/db")
def dev_db_list(user: dict = Depends(require_admin)):
    """数据库表清单 + 行数。"""
    db = get_db()
    tables = []
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        try:
            cnt = db.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        except Exception:
            cnt = -1
        tables.append({"table": name, "rows": cnt})
    return {"ok": True, "tables": tables, "total": len(tables)}


@app.get("/api/dev/db/table")
def dev_db_table(name: str, user: dict = Depends(require_admin), limit: int = 20, offset: int = 0, q: str = ""):
    """查看表数据(敏感列自动脱敏),支持 q 模糊搜索全部列。"""
    import re as _re
    if not name or not _re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name or ""):
        raise HTTPException(status_code=400, detail="非法表名")
    db = get_db()
    # 自动剔除搜索关键字中潜在的 SQL 风险字符(单双引号、分号)
    safe_q = (q or "").replace("'", "").replace('"', "").replace(';', '').replace('\\', '').strip()
    where = ""
    params = []
    try:
        if safe_q:
            cols_info = db.execute(f"PRAGMA table_info({name})").fetchall()
            text_cols = [d[1] for d in cols_info if d[2].upper() in ('TEXT', 'VARCHAR', '') or 'TEXT' in d[2].upper()]
            if not text_cols:
                text_cols = [d[1] for d in cols_info]
            if text_cols:
                where = " WHERE " + " OR ".join([f"CAST({c} AS TEXT) LIKE ?" for c in text_cols])
                params = [f"%{safe_q}%" for _ in text_cols]
        # 计数
        total = db.execute(f"SELECT COUNT(*) FROM {name}{where}", params).fetchone()[0]
        # 分页
        page_params = params + [int(limit), int(offset)]
        rows = db.execute(f"SELECT * FROM {name}{where} LIMIT ? OFFSET ?", page_params).fetchall()
        cols = [d[1] for d in db.execute(f"PRAGMA table_info({name})").fetchall()]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取失败: {e}")
    out = []
    for r in rows:
        rec = {}
        for i, c in enumerate(cols):
            v = r[i]
            if c.lower() in _SENSITIVE_COLS and v:
                s = str(v)
                rec[c] = _mask_key(s) if len(s) > 12 else "****"
            else:
                rec[c] = v
        out.append(rec)
    return {"ok": True, "table": name, "total": total, "cols": cols, "rows": out, "limit": limit, "offset": offset, "q": safe_q}


# ── 自进化训练控制 ──

@app.get("/api/dev/train/status")
def dev_train_status(user: dict = Depends(require_admin)):
    base = PROJECT_ROOT
    state = {}
    try:
        with open(os.path.join(base, "self_train_state.json"), "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        pass
    # 进程是否存活
    running = False
    try:
        import subprocess
        out = subprocess.run(["pgrep", "-f", "self_train.py"], capture_output=True, text=True, timeout=5)
        running = bool(out.stdout.strip())
    except Exception:
        pass
    try:
        with open(os.path.join(DATA_DIR, "training_data.json"), "r", encoding="utf-8") as f:
            td = json.load(f)
        t_count = len(td)
        self_count = sum(1 for t in td if t.get("source") == "self-train")
    except Exception:
        t_count, self_count = 0, 0
    try:
        with open(os.path.join(DATA_DIR, "knowledge_corpus.json"), "r", encoding="utf-8") as f:
            cj = json.load(f)
        c_count = len(cj.get("passages", []))
        cs_count = sum(1 for p in cj.get("passages", []) if "自进化" in str(p.get("source", "")))
    except Exception:
        c_count, cs_count = 0, 0
    versions = []
    try:
        vdir = os.path.join(base, "model_versions")
        versions = sorted(os.listdir(vdir))[-10:][::-1] if os.path.isdir(vdir) else []
    except Exception:
        pass

    def _fmt_dur(seconds):
        """60 进制精确到秒: HH:MM:SS"""
        s = max(0, int(seconds))
        h, rem = divmod(s, 3600)
        m, sec = divmod(rem, 60)
        return f"{h:02d}:{m:02d}:{sec:02d}"

    now = datetime.now()  # 训练进程写的是本地时间(datetime.now().isoformat()),统一用本地时间差
    started_at = state.get("started_at", "")
    round_started_at = state.get("round_started_at", "")
    interval = int(state.get("interval") or 600)
    target_rounds = int(state.get("target_rounds") or 0)
    current_round = int(state.get("current_round") or state.get("round") or 0)
    elapsed = 0
    try:
        if started_at:
            elapsed = (now - datetime.fromisoformat(started_at)).total_seconds()
    except Exception:
        pass
    round_elapsed = 0
    try:
        if running and round_started_at:
            round_elapsed = (now - datetime.fromisoformat(round_started_at)).total_seconds()
    except Exception:
        pass
    expected_total = target_rounds * interval if target_rounds else 0
    remaining_rounds = max(0, target_rounds - current_round) if target_rounds else 0
    return {
        "ok": True, "running": running, "state_running": bool(state.get("running")),
        "round": state.get("round", 0),
        # 轮次与时长（60 进制精确到秒）
        "current_round": current_round,
        "target_rounds": target_rounds,
        "interval": interval,
        "started_at": started_at,
        "elapsed_seconds": int(elapsed),
        "elapsed": _fmt_dur(elapsed),
        "round_elapsed_seconds": int(round_elapsed),
        "round_elapsed": _fmt_dur(round_elapsed),
        "expected_total_seconds": expected_total,
        "expected_total": _fmt_dur(expected_total),
        "remaining_rounds": remaining_rounds,
        # 突发异常与轮次成果
        "last_error": state.get("last_error", ""),
        "last_round_result": state.get("last_round_result", {}),
        "updated": state.get("updated", ""),
        "last_version": state.get("last_version", ""),
        "training_count": t_count, "self_trained_count": self_count,
        "corpus_count": c_count, "self_corpus_count": cs_count,
        "recent_versions": versions,
        # v=20260866: 训练效果历史曲线(轮次 → 入库数/语料总量),前端画折线图
        "history": state.get("history", []),
        # v=20260891: 环境诊断(回答"为何无法训练") + 累计统计 + 日志尾部
        "env": {
            "llm_key_configured": bool(os.environ.get("LLM_API_KEY")),
            "llm_base_url": os.environ.get("LLM_BASE_URL", ""),
            "llm_model": _display_model(os.environ.get("LLM_MODEL", "")),
        },
        "totals": {
            "added": sum(int(h.get("added") or 0) for h in state.get("history", [])),
            "passed": sum(int(h.get("passed") or 0) for h in state.get("history", [])),
            "rejected": sum(int(h.get("rejected") or 0) for h in state.get("history", [])),
        },
        "train_log_tail": self_train_log_tail(),
    }


def self_train_log_tail(lines: int = 8):
    """读取 self_train.log 尾部(诊断训练失败原因)。"""
    try:
        logp = os.path.join(PROJECT_ROOT, "self_train.log")
        with open(logp, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.read().splitlines()
        return all_lines[-int(lines):]
    except Exception:
        return []


@app.get("/api/dev/balance")
def dev_balance(user: dict = Depends(require_admin)):
    """实时查询 API 账户余额(剩余可用额度,而非已用)。
    DeepSeek 开放平台提供 /user/balance 接口；其它 API 返回不支持提示，
    前端可用「总额度 - 已用 token_usage」估算。"""
    import urllib.request
    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        return {"ok": True, "supported": False, "message": "未配置 LLM_API_KEY", "balance_infos": []}
    base = (os.environ.get("LLM_BASE_URL") or "").strip().rstrip("/")
    # DeepSeek 官方余额接口
    if not base or "deepseek" in base:
        url = "https://api.deepseek.com/user/balance"
        try:
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            infos = data.get("balance_infos", [])
            return {
                "ok": True, "supported": True,
                "is_available": bool(data.get("is_available")),
                "balance_infos": infos,
                "message": "",
            }
        except Exception as e:
            return {"ok": True, "supported": False, "balance_infos": [],
                    "message": f"余额查询失败: {e}"}
    return {
        "ok": True, "supported": False, "balance_infos": [],
        "message": f"当前 API({base or '默认'})不支持官方余额查询，可设置「总额度」用 token_usage 估算剩余",
    }


class BalanceEstimateRequest(BaseModel):
    total_limit: float = 0  # 总额度(元),0=清除


@app.post("/api/dev/balance/estimate")
def dev_balance_estimate(req: BalanceEstimateRequest, user: dict = Depends(require_admin)):
    """保存管理员设置的总额度(元),用于估算剩余额度。"""
    base = PROJECT_ROOT
    state_path = os.path.join(base, "self_train_state.json")
    state = {}
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        pass
    state["credit_limit"] = float(req.total_limit or 0)
    state["credit_limit_updated"] = datetime.utcnow().isoformat()
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    return {"ok": True, "credit_limit": state["credit_limit"], "message": "总额度已保存，前端将按 token_usage 估算剩余"}


class TrainSpeedRequest(BaseModel):
    interval: int = 600  # 秒


@app.post("/api/dev/train/start")
def dev_train_start(req: TrainSpeedRequest = None, user: dict = Depends(require_admin)):
    """启动离线挂机自训练(若未运行)。"""
    if os.name != "posix":
        raise HTTPException(status_code=501, detail="后台训练进程管理需要 Linux；其他系统请从终端运行 training/self_train.py")
    import subprocess
    base = PROJECT_ROOT
    interval = (req.interval if req else 600) or 600
    try:
        out = subprocess.run(["pgrep", "-f", "self_train.py"], capture_output=True, text=True, timeout=5)
        if out.stdout.strip():
            return {"ok": True, "running": True, "message": "自训练已在运行中"}
    except Exception:
        pass
    env = dict(os.environ)
    logf = open(os.path.join(base, "self_train.log"), "a", encoding="utf-8")
    p = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT_ROOT, "training", "self_train.py"), "--interval", str(interval), "--max-per-round", "2"],
        cwd=base, env=env, stdout=logf, stderr=logf, start_new_session=True,
    )
    return {"ok": True, "running": True, "pid": p.pid, "interval": interval,
            "message": f"自进化训练已启动(间隔 {interval}s)"}


@app.post("/api/dev/train/stop")
def dev_train_stop(user: dict = Depends(require_admin)):
    """停止离线挂机自训练。"""
    if os.name != "posix":
        raise HTTPException(status_code=501, detail="后台训练进程管理需要 Linux；其他系统请从终端运行 training/self_train.py")
    import subprocess
    try:
        out = subprocess.run(["pgrep", "-f", "self_train.py"], capture_output=True, text=True, timeout=5)
        pids = out.stdout.strip().split()
        for pid in pids:
            subprocess.run(["kill", pid], timeout=5)
        return {"ok": True, "stopped": len(pids), "message": f"已停止 {len(pids)} 个训练进程"}
    except Exception as e:
        return {"ok": False, "message": f"停止失败: {e}"}


@app.post("/api/dev/train/speed")
def dev_train_speed(req: TrainSpeedRequest, user: dict = Depends(require_admin)):
    """调节训练速度：修改挂机间隔(秒)。运行中则重启进程使生效。"""
    if os.name != "posix":
        raise HTTPException(status_code=501, detail="后台训练进程管理需要 Linux；其他系统请从终端运行 training/self_train.py")
    import subprocess
    base = PROJECT_ROOT
    interval = max(60, min(3600, int(req.interval or 600)))
    # 停旧进程
    try:
        out = subprocess.run(["pgrep", "-f", "self_train.py"], capture_output=True, text=True, timeout=5)
        for pid in out.stdout.strip().split():
            subprocess.run(["kill", pid], timeout=5)
    except Exception:
        pass
    # 启动新进程
    env = dict(os.environ)
    logf = open(os.path.join(base, "self_train.log"), "a", encoding="utf-8")
    p = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT_ROOT, "training", "self_train.py"), "--interval", str(interval), "--max-per-round", "2"],
        cwd=base, env=env, stdout=logf, stderr=logf, start_new_session=True,
    )
    return {"ok": True, "running": True, "interval": interval, "pid": p.pid,
            "message": f"训练速度已调节：每 {interval}s 一轮"}


@app.get("/api/dev/train/log")
def dev_train_log(user: dict = Depends(require_admin), lines: int = 100):
    """查看自训练日志尾部。"""
    base = PROJECT_ROOT
    try:
        with open(os.path.join(base, "self_train.log"), "r", encoding="utf-8") as f:
            all_lines = f.read().splitlines()
        return {"ok": True, "lines": all_lines[-int(lines):]}
    except Exception as e:
        return {"ok": False, "message": str(e), "lines": []}


@app.get("/api/dev/snapshots")
def dev_snapshots(user: dict = Depends(require_admin)):
    """列出全部版本快照(只读,无副作用)。"""
    base = PROJECT_ROOT
    vdir = os.path.join(base, "model_versions")
    items = []
    if os.path.isdir(vdir):
        for name in sorted(os.listdir(vdir), reverse=True):
            meta_path = os.path.join(vdir, name, "meta.json")
            meta = {}
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                meta = {"_error": "meta.json 读取失败"}
            # 文件夹大小
            try:
                total = sum(
                    os.path.getsize(os.path.join(dp, fn))
                    for dp, _, fns in os.walk(os.path.join(vdir, name)) for fn in fns
                )
            except Exception:
                total = 0
            items.append({
                "name": name,
                "path": os.path.join(vdir, name),
                "size_kb": round(total / 1024, 1),
                "round": meta.get("round", "—"),
                "added": meta.get("added", "—"),
                "passed": meta.get("passed", "—"),
                "rejected": meta.get("rejected", "—"),
                "created_at": meta.get("created_at", "—"),
                "files": sorted(os.listdir(os.path.join(vdir, name))) if os.path.isdir(os.path.join(vdir, name)) else [],
            })
    return {"ok": True, "count": len(items), "snapshots": items}


