"""routes_credits.py —— 积分系统与微信支付（原 backend/main.py 第 3855–4203 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）

# ── 积分系统 + 微信支付 ──

# 积分套餐
# v=20260911 单位统一为「分」（与 credit_orders.amount 注释、前端 (total_fee/100).toFixed(2)
# 的口径一致）：原 once_* 用「元」，导致下单金额被当成分处理（100 元被记成 1 元）。
CREDIT_PLANS = {
    "once_100":  {"name": "100积分",   "amount": 100,   "credits": 100,  "desc": "一次性购买"},
    "once_500":  {"name": "500积分",   "amount": 500,   "credits": 550,  "desc": "赠送50积分"},
    "once_2000": {"name": "2000积分",  "amount": 2000,  "credits": 2400, "desc": "赠送400积分"},
    "monthly_500":  {"name": "月卡·500积分",  "amount": 2990,  "credits": 500,  "desc": "每月自动续费"},
    "yearly_6000":  {"name": "年卡·6000积分", "amount": 29900, "credits": 7200, "desc": "年度最划算"},
}

# Token → 积分 换算：1积分 = 1000 token






class CreditOrderRequest(BaseModel):
    plan_id: str
    pay_method: str = "wechat"


@app.post("/api/credits/order")
def create_credit_order(req: CreditOrderRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """创建积分购买订单（对接微信支付后自动充值）。"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    plan = CREDIT_PLANS.get(req.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="无效的套餐")
    db = get_db()
    import secrets as _sec
    order_no = "CR" + datetime.utcnow().strftime("%Y%m%d%H%M%S") + _sec.token_hex(4)
    db.execute(
        "INSERT INTO credit_orders (user_id, order_no, plan_id, amount, credits, status, pay_method, created) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        (user["id"], order_no, req.plan_id, plan["amount"], plan["credits"], req.pay_method, datetime.utcnow().isoformat()))
    db.commit()

    # 尝试微信支付下单
    mchid = os.environ.get("WECHAT_PAY_MCHID", "")
    if mchid:
        # 生产：调用 WeChat Pay V3 JSAPI 下单
        # 此处为骨架，实际需用 wechatpay-apiv3 SDK
        pay_params = _create_wechat_jsapi_order(order_no, plan["amount"], plan["name"], user)
    else:
        pay_params = None

    return {
        "ok": True,
        "order_no": order_no,
        "plan": plan,
        "pay_params": pay_params,
        "msg": "订单已创建" + ("，请完成微信支付" if pay_params else "（开发模式：支付接口未配置，请在生产环境配置微信支付）")
    }


@app.post("/api/credits/order/confirm")
def confirm_credit_order(order_no: str = __import__('fastapi').Query(...), user: dict = __import__('fastapi').Depends(require_user)):
    """确认支付完成（开发模式：直接确认；生产模式：由微信支付回调触发）。"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    # v=20260911 P0 根因修复：原实现"先 SELECT 查状态、再 UPDATE 置为已支付"存在竞态，
    # 并发请求/重复回调可让同一笔订单被多次加积分（前端重试即可刷额度）。
    # 改为单条条件 UPDATE 抢占 + 事务：只有 pending → paid 的那一次 rowcount == 1，
    # 由抢占成功者独占加积分；抢不到（已处理/不存在/非本人）直接 400。
    _ensure_credits(user["id"])
    now = datetime.utcnow().isoformat()
    cur = db.execute(
        "UPDATE credit_orders SET status = 'paid', paid_at = ? "
        "WHERE order_no = ? AND user_id = ? AND status = 'pending'",
        (now, order_no, user["id"]))
    if cur.rowcount != 1:
        db.rollback()   # 放弃这次隐式事务，避免持有写锁
        raise HTTPException(status_code=400, detail="订单已处理或不存在")
    row = db.execute(
        "SELECT credits FROM credit_orders WHERE order_no = ? AND user_id = ?",
        (order_no, user["id"])).fetchone()
    credits = row[0] if row else 0
    db.execute(
        "UPDATE user_credits SET balance = balance + ?, total_purchased = total_purchased + ?, updated = ? WHERE user_id = ?",
        (credits, credits, now, user["id"]))
    db.commit()
    new_balance = db.execute("SELECT balance FROM user_credits WHERE user_id = ?", (user["id"],)).fetchone()[0]
    return {"ok": True, "msg": "支付成功", "credits_added": credits, "balance": new_balance}


@app.get("/api/credits/balance")
def get_credits_balance(user: dict = __import__('fastapi').Depends(require_user)):
    """查询用户积分余额和消费统计。"""
    if user["id"] == 0:
        return {"balance": 0, "total_purchased": 0, "total_consumed": 0}
    db = get_db()
    _ensure_credits(user["id"])
    row = db.execute(
        "SELECT balance, total_purchased, total_consumed FROM user_credits WHERE user_id = ?",
        (user["id"],)).fetchone()
    # 今日消费
    today = datetime.utcnow().strftime("%Y-%m-%d")
    today_cost = db.execute(
        "SELECT COALESCE(SUM(cost_tokens), 0) FROM token_usage WHERE user_id = ? AND date(created) = ?",
        (user["id"], today)).fetchone()[0]
    return {
        "balance": row[0], "total_purchased": row[1], "total_consumed": row[2],
        "today_cost": today_cost, "token_per_credit": TOKEN_PER_CREDIT
    }


@app.get("/api/credits/history")
def get_credits_history(user: dict = __import__('fastapi').Depends(require_user)):
    """积分消费历史。"""
    if user["id"] == 0:
        return {"history": []}
    db = get_db()
    rows = db.execute(
        "SELECT api_type, model, prompt_tokens, completion_tokens, cost_tokens, created FROM token_usage WHERE user_id = ? ORDER BY id DESC LIMIT 50",
        (user["id"],)).fetchall()
    return {"history": [dict(zip(["type", "model", "prompt", "completion", "cost", "time"], r)) for r in rows]}


@app.get("/api/credits/plans")
def get_credit_plans():
    """获取所有积分套餐。"""
    return {"plans": [{"id": k, **v} for k, v in CREDIT_PLANS.items()]}


def _create_wechat_jsapi_order(order_no: str, amount: int, desc: str, user: dict) -> Optional[dict]:
    """微信支付 JSAPI 下单。

    v=20260911 根因修复：本项目并未接入真实支付网关（无 wechatpay-apiv3 SDK/商户证书/验签）。
    配置了 WECHAT_PAY_MCHID 说明是生产意图 → 必须显式 501 失败，绝不再返回 mock 签名
    （mock paySign 会让前端以为可以支付，而回调端点根本不验签，等于白送额度）。
    未配置 MCHID 的开发演示路径返回 None，由调用方标注"开发模式"。
    """
    mchid = os.environ.get("WECHAT_PAY_MCHID", "")
    if not mchid:
        return None
    raise HTTPException(status_code=501, detail="微信支付未接入，请使用管理员开通的额度")


# 保留旧版兼容端点
class WxPayOrderRequest(BaseModel):
    out_trade_no: str
    total_fee: int
    body: str
    openid: str = ""


@app.post("/api/payment/wechat/create")
def wechat_pay_create(req: WxPayOrderRequest):
    """旧版微信支付端点（兼容）。请使用 /api/credits/order 替代。

    v=20260911 与 _create_wechat_jsapi_order 同口径：配置了 WECHAT_PAY_MCHID（生产意图）
    就不再返回 mock 预支付参数，明确 501；未配置时保留 dev 演示用的 mock 返回。
    """
    if req.total_fee < 1:
        raise HTTPException(status_code=400, detail="金额必须大于 0")
    if os.environ.get("WECHAT_PAY_MCHID", ""):
        raise HTTPException(status_code=501, detail="微信支付未接入，请使用管理员开通的额度")
    import secrets as _sec
    prepay_id = f"wx_mock_prepay_{_sec.token_hex(8)}"
    return {
        "ok": True,
        "appId": os.environ.get("WECHAT_APP_ID", ""),
        "timeStamp": str(int(time.time())),
        "nonceStr": _sec.token_hex(16),
        "package": f"prepay_id={prepay_id}",
        "signType": "RSA",
        "paySign": f"mock_sign_{_sec.token_hex(8)}",
        "out_trade_no": req.out_trade_no,
        "total_fee": req.total_fee,
        "body": req.body,
    }


@app.post("/api/payment/wechat/notify")
async def wechat_pay_notify(request: __import__('fastapi').Request):
    """微信支付回调（生产环境用 WeChat Pay V3 验签解密处理）。

    v=20260911 根因修复：原实现不读回调内容、不验签，直接回 SUCCESS —— 相当于对外宣称
    "支付回调已处理"，既误导支付方重试语义，也让人以为存在已接入的支付链路。
    未接入真实验签前一律 400 明确失败。
    """
    raise HTTPException(status_code=400, detail="支付网关未接入")


@app.get("/api/auth/profile")
def profile(user: dict = __import__('fastapi').Depends(get_current_user)):
    # v=20260904e P0 登录闭环修复：改用 get_current_user（强制登录），
    # 无效/缺失 token 统一 401，不再返回 200 + logged_in:false（否则前端 401 拦截器不触发）。
    db = get_db()
    row = db.execute("SELECT nickname, avatar, created, role, status FROM users WHERE id = ?", (user["id"],)).fetchone()
    # v=20260824 修复计数不同步:提问数来自 chat_messages(新会话体系,role=user),
    # 旧表 chat_history 已停用(演示账号历史在 chat_messages 里,旧表为 0 导致计数显示 0)
    # v=20260904b 语义澄清:total_questions 是「提问数」,非「做题数」;
    #   做题数统一用 total_practiced(=knowledge_mastery.attempts 总和),与题库实际练习记录对齐。
    try:
        q_count = db.execute(
            "SELECT COUNT(*) FROM chat_messages WHERE user_id = ? AND role = 'user'",
            (user["id"],)).fetchone()[0]
    except Exception:
        q_count = 0
    # 做题次数：knowledge_mastery 表 attempts 总和（提问/练习/薄弱点诊断均会回写）
    try:
        p_count = db.execute(
            "SELECT COALESCE(SUM(attempts), 0) FROM knowledge_mastery WHERE user_id = ?",
            (user["id"],)).fetchone()[0]
    except Exception:
        p_count = 0
    # v=20260824 修复:"错题收集"标签对应的数据源应为 mistakes 表(原来误查 notes 笔记表)
    n_count = db.execute("SELECT COUNT(*) FROM mistakes WHERE user_id = ?", (user["id"],)).fetchone()[0]
    # 积分信息
    _ensure_credits(user["id"])
    cr = db.execute("SELECT balance, total_purchased, total_consumed FROM user_credits WHERE user_id = ?", (user["id"],)).fetchone()
    return {
        "logged_in": True,
        "id": user["id"],
        "username": user["username"],
        "nickname": row[0] if row and row[0] else user["username"],
        "avatar": row[1] if row and row[1] else user.get("avatar", ""),
        "created": row[2] if row else "",
        "role": row[3] if row and row[3] else "user",
        "status": row[4] if row and row[4] else "active",
        "total_questions": q_count,
        "total_practiced": p_count,
        "total_notes": n_count,
        "credits": cr[0] if cr else 100,
        "credits_purchased": cr[1] if cr else 0,
        "credits_consumed": cr[2] if cr else 0,
    }


class ProfileUpdateRequest(BaseModel):
    nickname: str = ""
    avatar: str = ""


@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdateRequest, user: dict = __import__('fastapi').Depends(require_user)):
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    db.execute("UPDATE users SET nickname = ?, avatar = ? WHERE id = ?",
               (req.nickname or user.get("nickname", ""), req.avatar or user.get("avatar", ""), user["id"]))
    db.commit()
    return {"ok": True, "nickname": req.nickname, "avatar": req.avatar}


# ---------- 修改用户名（类似微信号）----------
@app.put("/api/auth/username")
def update_username(req: UsernameUpdateRequest, user: dict = __import__('fastapi').Depends(require_user)):
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    new_username = req.new_username.strip()
    if len(new_username) < 2 or len(new_username) > 20:
        raise HTTPException(status_code=400, detail="用户名 2-20 个字符")
    if not re.match(r'^[a-zA-Z0-9_]+$', new_username):
        raise HTTPException(status_code=400, detail="用户名只能包含字母、数字和下划线")
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ? AND id != ?", (new_username, user["id"])).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="该用户名已被使用")
    db.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user["id"]))
    db.commit()
    return {"ok": True, "username": new_username}


# ---------- 账号注销 ----------
class DeleteAccountRequest(BaseModel):
    password: str

@app.delete("/api/auth/account")
def delete_account(req: DeleteAccountRequest, user: dict = __import__('fastapi').Depends(require_user)):
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    # 验证密码
    authed = authenticate(user["username"], req.password)
    if not authed:
        raise HTTPException(status_code=403, detail="密码错误，无法注销")
    db = get_db()
    db.execute("DELETE FROM notes WHERE user_id = ?", (user["id"],))
    db.execute("DELETE FROM chat_history WHERE user_id = ?", (user["id"],))
    db.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    db.commit()
    return {"ok": True, "message": "账号已注销，感谢您的使用"}


# ---------- 找回密码 ----------
class ForgotPasswordRequest(BaseModel):
    username: str

@app.post("/api/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    """v=20260904b P0 安全：演示版关闭自助密码重置（无邮箱/验证码校验，存在账号接管风险）"""
    raise HTTPException(status_code=403, detail="演示版已关闭自助密码重置，请联系管理员")


class ResetPasswordRequest(BaseModel):
    username: str
    new_password: str

@app.post("/api/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    """v=20260904b P0 安全：演示版关闭自助密码重置（原无邮箱/验证码，可被任意接管账号）"""
    raise HTTPException(status_code=403, detail="演示版已关闭自助密码重置，请联系管理员")


# ---------- 问答历史 ----------
@app.post("/api/history/save")
def save_history(req: HistorySaveRequest, user: dict = __import__('fastapi').Depends(get_current_user)):
    db = get_db()
    db.execute(
        "INSERT INTO chat_history(user_id, question, answer, mode, citations, rag_used, created) "
        "VALUES(?,?,?,?,?,?,?)",
        (user["id"], req.question, req.answer, req.mode, req.citations,
         1 if req.rag_used else 0, datetime.now().isoformat())
    )
    db.commit()
    return {"ok": True}


