"""routes_base.py —— 首页、教材引用、事件流、注册登录基础（原 backend/main.py 第 2282–2461 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ==================== API 接口 ====================

@app.get("/")
def root():
    idx = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(idx):
        return FileResponse(
            idx,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return {"status": "ok", "service": "linear-algebra-tutor-api", "version": "2.0.0"}


@app.get("/textbook.pdf")
def textbook():
    # v=20260904c 版权收敛：教材全文 PDF 已下线，仅保留规范引用条目
    raise HTTPException(status_code=403, detail="教材仅列引用（《线性代数》第六版 · 同济大学数学系 编 · 高等教育出版社），全文请向出版社获取")


# ---------- SSE 实时事件流 ----------
@app.get("/api/events")
async def sse_stream(authorization: Optional[str] = Header(None)):
    """实时推送通道：好友申请、私信、群消息、动态等事件。
    v=20260904b 令牌从 Authorization header 读取（不再走 query）。"""
    from fastapi import Request
    user = get_user_by_token_or_query(authorization=authorization)
    if not user:
        return JSONResponse(status_code=401, content={"detail": "未授权"})

    async def event_generator():
        # 发送初始心跳，确认连接建立
        yield f"event: connected\ndata: {_json.dumps({'type': 'connected', 'user_id': user['id']}, ensure_ascii=False)}\n\n"
        q = SSE_HUB.subscribe(user["id"])
        try:
            while True:
                event = await q.get()
                payload = _json.dumps(event, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            SSE_HUB.unsubscribe(user["id"], q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            # 跨域头统一由 CORSMiddleware 按 ALLOWED_ORIGINS 配置下发，
            # 此处不再硬编码 `*`（与凭证模式自相矛盾）
        },
    )



# ---------- 认证接口 ----------
def _generate_username(db) -> str:
    """生成唯一用户名：la_ + 6位随机hex"""
    for _ in range(20):
        candidate = "la_" + secrets.token_hex(3)
        if not db.execute("SELECT id FROM users WHERE username = ?", (candidate,)).fetchone():
            return candidate
    raise HTTPException(status_code=500, detail="用户名生成失败，请重试")


@app.post("/api/auth/register")
def register(req: RegisterRequest):
    nickname = req.nickname.strip()
    if len(nickname) < 1 or len(nickname) > 20:
        raise HTTPException(status_code=400, detail="昵称 1-20 个字符")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="密码至少 4 个字符")

    db = get_db()
    # v=20260901 昵称唯一性校验:重名会导致登录时昵称歧义(永远匹配最早账号),禁止新增重名
    dup = db.execute("SELECT id FROM users WHERE nickname = ?", (nickname,)).fetchone()
    if dup:
        raise HTTPException(status_code=400, detail="昵称已被使用，请换一个昵称（若这是你的账号，请用用户名登录）")
    username = _generate_username(db)
    pwd_hash, salt = hash_password(req.password)
    avatar = (req.avatar or nickname[0].upper()).strip()[:2]
    now = datetime.now().isoformat()
    cur = db.execute(
        "INSERT INTO users(username, nickname, avatar, password_hash, salt, token, created) "
        "VALUES(?,?,?,?,?,?,?)",
        (username, nickname, avatar, pwd_hash, salt, "", now)
    )
    db.commit()
    # 无状态签名 token（跨实例有效）
    token = make_auth_token(cur.lastrowid, "user", username, nickname, avatar)
    device = req.device if req.device in ("computer", "mobile", "tablet") else "computer"
    try:
        db.execute("UPDATE users SET token = ? WHERE id = ?", (token, cur.lastrowid))
        db.execute(
            "INSERT INTO user_sessions(user_id, token, device, created, updated) VALUES(?,?,?,?,?)",
            (cur.lastrowid, token, device, now, now)
        )
        db.commit()
    except Exception:
        pass
    return {"ok": True, "id": cur.lastrowid, "username": username, "nickname": nickname, "avatar": avatar, "token": token, "role": "user", "status": "active", "device": device}


@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = authenticate(req.identifier, req.password, req.device or "computer")
    if not user:
        raise HTTPException(status_code=401, detail="用户名/昵称或密码错误")
    return {"ok": True, "id": user["id"], "username": user["username"],
            "nickname": user["nickname"], "avatar": user["avatar"], "token": user["token"],
            "role": user.get("role", "user"), "status": user.get("status", "active"),
            "device": user.get("device", "computer")}


@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None), user: dict = Depends(require_user)):
    """用户主动退出：删除当前设备对应的会话（仅本端失效，其他设备会话保留可用）"""
    if user["id"] == 0:
        return {"ok": True}
    # v=20260904b 仅从 Authorization Bearer 解析原始 token（不再走 query）
    tok = authorization[7:] if (authorization and authorization.startswith("Bearer ")) else ""
    db = get_db()
    try:
        if tok:
            db.execute("DELETE FROM user_sessions WHERE user_id = ? AND token = ?", (user["id"], tok))
        else:
            # 无法确定具体会话：清空该用户全部会话（保守处理）
            db.execute("DELETE FROM user_sessions WHERE user_id = ?", (user["id"],))
        db.commit()
    except Exception:
        pass
    return {"ok": True}


@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, user: dict = Depends(require_user)):
    """当前登录用户修改自己的密码：验证旧密码 → 更新哈希（单向，明文不落盘）→ 强制所有会话下线"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    new_pwd = (req.new_password or "").strip()
    if len(new_pwd) < 6:
        raise HTTPException(status_code=400, detail="新密码长度至少 6 位")
    db = get_db()
    row = db.execute("SELECT password_hash, salt FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")
    # 校验旧密码（管理员角色本人改密同样校验）
    h, _ = hash_password(req.old_password or "", row[1])
    if h != row[0]:
        raise HTTPException(status_code=400, detail="原密码不正确")
    pwd_hash, salt = hash_password(new_pwd)
    db.execute("UPDATE users SET password_hash = ?, salt = ?, token = '' WHERE id = ?",
               (pwd_hash, salt, user["id"]))
    # 改密后强制所有设备重新登录：清空该用户全部会话
    db.execute("DELETE FROM user_sessions WHERE user_id = ?", (user["id"],))
    db.commit()
    return {"ok": True, "message": "密码修改成功，请重新登录"}


# 懒清理超时会话（token 30 天过期，同步清理过期 session，避免无效记录堆积）


