"""routes_auth_external.py —— 短信验证码、二维码、微信/QQ OAuth、手机号登录与绑定（原 backend/main.py 第 3338–3854 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）


class PhoneLoginRequest(BaseModel):
    """手机号验证码登录请求（随本模块迁移，原位于管理后台分节末尾）。"""
    phone: str
    code: str = ""


# ── 短信验证码服务（阿里云短信真实发送 + 内存存储 + 5 分钟过期）──
import threading, time as _time

_sms_store: dict = {}  # {phone: (code, expires_at, send_count)}
_sms_lock = threading.Lock()

# 阿里云短信配置（从环境变量读取）
SMS_ACCESS_KEY_ID = os.environ.get("ALIYUN_SMS_ACCESS_KEY_ID", "")
SMS_ACCESS_KEY_SECRET = os.environ.get("ALIYUN_SMS_ACCESS_KEY_SECRET", "")
SMS_SIGN_NAME = os.environ.get("ALIYUN_SMS_SIGN_NAME", "秩研Agent")
SMS_TEMPLATE_CODE = os.environ.get("ALIYUN_SMS_TEMPLATE_CODE", "")

# 单手机号频率限制：60s 内最多 1 条，每天最多 5 条
SMS_RATE_INTERVAL = 60
SMS_DAILY_LIMIT = 5

# v=20260911 每日发送次数计数：{(phone, 'YYYY-MM-DD'): 次数}
# ⚠️ 与 _sms_store 一样是【进程内】限流（重启清零、多进程不共享）；本项目无短信流水表，
#    单进程部署下足够，若要严格跨进程应改为落库统计。
_sms_daily_count: dict = {}
_sms_daily_lock = threading.Lock()


def _sms_daily_check_and_inc(phone: str):
    """发送前统计该手机号当日发送次数：超限抛 429，未超限则占用一次额度。"""
    import datetime as _dt
    day = _dt.date.today().isoformat()
    key = (phone, day)
    with _sms_daily_lock:
        # 清理非当日的历史键，避免字典随日期无界增长
        for k in [k for k in _sms_daily_count if k[1] != day]:
            del _sms_daily_count[k]
        used = _sms_daily_count.get(key, 0)
        if used >= SMS_DAILY_LIMIT:
            raise HTTPException(status_code=429,
                                detail=f"今日验证码发送次数已达上限（{SMS_DAILY_LIMIT} 次），请明天再试")
        _sms_daily_count[key] = used + 1


def _ensure_column(db, table: str, column: str, coltype: str):
    """幂等加列：表里没有该列才 ALTER TABLE（SQLite 没有 ADD COLUMN IF NOT EXISTS）。"""
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', table or "") or \
            not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', column or ""):
        raise ValueError("非法的表名/列名")
    cols = [r[1] for r in db.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")
        db.commit()


def _sms_gc():
    """清理过期验证码。"""
    with _sms_lock:
        now = _time.time()
        expired = [ph for ph, (_, exp, _) in _sms_store.items() if now > exp]
        for ph in expired:
            del _sms_store[ph]


def _send_sms_via_aliyun(phone: str, code: str) -> bool:
    """通过阿里云短信服务（Dysmsapi）发送验证码短信。返回 True/False。

    需要环境变量：
      ALIYUN_SMS_ACCESS_KEY_ID      阿里云 AccessKey ID
      ALIYUN_SMS_ACCESS_KEY_SECRET  阿里云 AccessKey Secret
      ALIYUN_SMS_SIGN_NAME          已审核通过的短信签名（如"秩研Agent"）
      ALIYUN_SMS_TEMPLATE_CODE      已审核通过的验证码模板 CODE（如 SMS_123456789）
    """
    if not all([SMS_ACCESS_KEY_ID, SMS_ACCESS_KEY_SECRET, SMS_TEMPLATE_CODE]):
        print("[SMS] 未配置 ALIYUN_SMS_* 环境变量，无法通过阿里云发送短信")
        return False
    try:
        from alibabacloud_dysmsapi20170525.client import Client as DysmsapiClient
        from alibabacloud_dysmsapi20170525 import models as dysmsapi_models
        from alibabacloud_tea_openapi import models as open_api_models

        config = open_api_models.Config(
            access_key_id=SMS_ACCESS_KEY_ID,
            access_key_secret=SMS_ACCESS_KEY_SECRET,
        )
        config.endpoint = "dysmsapi.aliyuncs.com"
        client = DysmsapiClient(config)

        send_req = dysmsapi_models.SendSmsRequest(
            phone_numbers=phone,
            sign_name=SMS_SIGN_NAME,
            template_code=SMS_TEMPLATE_CODE,
            template_param=f'{{"code":"{code}"}}',
        )
        resp = client.send_sms(send_req)
        body = resp.body
        if body.code == "OK":
            print(f"[SMS✓] 阿里云短信已发送至 {phone}，验证码：{code}")
            return True
        else:
            print(f"[SMS✗] 阿里云发送失败：code={body.code} msg={body.message}")
            return False
    except Exception as e:
        print(f"[SMS✗] 阿里云短信异常：{e}")
        return False


@app.post("/api/auth/send-sms")
def send_sms(phone: str = __import__('fastapi').Query(...)):
    """发送短信验证码。

    生产模式：通过阿里云短信服务（Dysmsapi）真实发送到用户手机。
    开发模式：未配置阿里云密钥时自动降级为控制台打印，前端显示验证码（仅限开发调试）。

    配置方式：在 .env 中设置：
      ALIYUN_SMS_ACCESS_KEY_ID=你的AccessKey ID
      ALIYUN_SMS_ACCESS_KEY_SECRET=你的AccessKey Secret
      ALIYUN_SMS_SIGN_NAME=签名名称（需已审核通过）
      ALIYUN_SMS_TEMPLATE_CODE=模板CODE（需已审核通过，模板内容需包含 ${code} 变量）
    """
    phone = phone.strip()
    if not phone or len(phone) < 5:
        raise HTTPException(status_code=400, detail="手机号格式不正确")

    import secrets
    _sms_gc()

    # 频率限制检查
    with _sms_lock:
        now = _time.time()
        stored = _sms_store.get(phone)
        if stored:
            _, _, last_send = stored
            if now - last_send < SMS_RATE_INTERVAL:
                remaining = int(SMS_RATE_INTERVAL - (now - last_send))
                raise HTTPException(status_code=429, detail=f"发送太频繁，请 {remaining} 秒后再试")

    # 每日限额（SMS_DAILY_LIMIT=5/手机号/天）：发送前统计，超限 429
    _sms_daily_check_and_inc(phone)

    code = str(secrets.randbelow(900000) + 100000)  # 6 位数字

    # 尝试真实发送
    sent_real = _send_sms_via_aliyun(phone, code)

    with _sms_lock:
        _sms_store[phone] = (code, _time.time() + 300, _time.time())  # 5 min TTL + 发送时间

    if sent_real:
        return {"ok": True, "msg": f"验证码已发送至 {phone}", "mode": "live"}
    else:
        # 降级模式：控制台输出（开发调试）
        print(f"[SMS-dev] 向 {phone} 发送验证码: {code}（未配置阿里云SMS，降级为控制台输出）")
        resp = {"ok": True, "msg": f"验证码已发送至 {phone}（开发模式）", "mode": "dev"}
        # v=20260911 P0 根因修复：原实现无条件回显 debug_code，线上（未配置阿里云密钥时）
        # 等于把验证码交给任何调用者 = 任意手机号登录。仅 APP_ENV=dev 才回显。
        if os.environ.get("APP_ENV", "").strip().lower() == "dev":
            resp["debug_code"] = code
        return resp


class MockSendRequest(BaseModel):
    phone: str = ""


@app.post("/api/auth/send-sms2")
def send_sms_post(req: MockSendRequest):
    """POST 形式发送验证码。"""
    return send_sms(phone=req.phone)


# ── 真实二维码生成（微信 / QQ 扫码登录）──

@app.get("/api/auth/qrcode")
def get_qrcode(provider: str = "wechat"):
    """返回可扫描的登录二维码 PNG 图片。
    实际部署：配置 WECHAT_APP_ID / QQ_APP_ID 与回调域名，替换 URL 模板。
    """
    import qrcode as _qr
    import io as _io
    from fastapi.responses import StreamingResponse as _StreamingResponse

    if provider not in ("wechat", "qq"):
        raise HTTPException(status_code=400, detail="不支持的登录方式")

    # 实际 OAuth URL 模板（需替换 APPID 和 redirect_uri）
    if provider == "wechat":
        app_id = os.environ.get("WECHAT_APP_ID", "YOUR_WECHAT_APPID")
        redirect = os.environ.get("WECHAT_REDIRECT_URI", "https://YOUR_DOMAIN/api/auth/wechat-callback")
        url = f"https://open.weixin.qq.com/connect/oauth2/authorize?appid={app_id}&redirect_uri={redirect}&response_type=code&scope=snsapi_userinfo&state=wxlogin#wechat_redirect"
    else:
        app_id = os.environ.get("QQ_APP_ID", "YOUR_QQ_APPID")
        redirect = os.environ.get("QQ_REDIRECT_URI", "https://YOUR_DOMAIN/api/auth/qq-callback")
        url = f"https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id={app_id}&redirect_uri={redirect}&state=qqlogin"

    img = _qr.make(url, box_size=8, border=2)
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return _StreamingResponse(buf, media_type="image/png",
                               headers={"Cache-Control": "no-cache, max-age=0"})


# ── 微信/QQ OAuth 回调端点（真实 code→access_token→用户信息 完整链路）──
import urllib.parse as _urlparse
import urllib.request as _urlreq

WECHAT_APP_ID = os.environ.get("WECHAT_APP_ID", "")
WECHAT_APP_SECRET = os.environ.get("WECHAT_APP_SECRET", "")
QQ_APP_ID = os.environ.get("QQ_APP_ID", "")
QQ_APP_SECRET = os.environ.get("QQ_APP_SECRET", "")


def _resolve_wechat_user(code: str) -> Optional[dict]:
    """通过微信 OAuth code 获取用户信息。返回 {openid, nickname, avatar} 或 None。"""
    if not WECHAT_APP_ID or not WECHAT_APP_SECRET:
        print("[OAuth] 未配置 WECHAT_APP_ID/WECHAT_APP_SECRET，无法获取微信用户信息")
        return None
    try:
        # Step 1: code → access_token + openid
        token_url = (
            f"https://api.weixin.qq.com/sns/oauth2/access_token?"
            f"appid={WECHAT_APP_ID}&secret={WECHAT_APP_SECRET}&"
            f"code={code}&grant_type=authorization_code"
        )
        with _urlreq.urlopen(token_url, timeout=10) as resp:
            token_data = json.loads(resp.read().decode())
        if "errcode" in token_data:
            print(f"[OAuth✗] 微信获取access_token失败：{token_data}")
            return None
        access_token = token_data.get("access_token", "")
        openid = token_data.get("openid", "")
        if not openid:
            return None

        # Step 2: access_token + openid → 用户信息
        info_url = (
            f"https://api.weixin.qq.com/sns/userinfo?"
            f"access_token={access_token}&openid={openid}&lang=zh_CN"
        )
        with _urlreq.urlopen(info_url, timeout=10) as resp:
            user_data = json.loads(resp.read().decode())
        if "errcode" in user_data:
            print(f"[OAuth✗] 微信获取用户信息失败：{user_data}")
            return None
        nickname = user_data.get("nickname", f"微信用户{openid[-6:]}")
        avatar = user_data.get("headimgurl", "")
        print(f"[OAuth✓] 微信用户：{nickname} openid={openid[:12]}...")
        return {"openid": openid, "nickname": nickname, "avatar": avatar}
    except Exception as e:
        print(f"[OAuth✗] 微信 OAuth 异常：{e}")
        return None


def _resolve_qq_user(code: str) -> Optional[dict]:
    """通过 QQ OAuth code 获取用户信息。返回 {openid, nickname, avatar} 或 None。"""
    if not QQ_APP_ID or not QQ_APP_SECRET:
        print("[OAuth] 未配置 QQ_APP_ID/QQ_APP_SECRET，无法获取 QQ 用户信息")
        return None
    try:
        # Step 1: code → access_token
        token_url = (
            f"https://graph.qq.com/oauth2.0/token?"
            f"grant_type=authorization_code&client_id={QQ_APP_ID}&"
            f"client_secret={QQ_APP_SECRET}&code={code}&"
            f"redirect_uri={os.environ.get('QQ_REDIRECT_URI', '')}&fmt=json"
        )
        with _urlreq.urlopen(token_url, timeout=10) as resp:
            token_data = json.loads(resp.read().decode())
        if "error" in token_data:
            print(f"[OAuth✗] QQ获取access_token失败：{token_data}")
            return None
        access_token = token_data.get("access_token", "")

        # Step 2: access_token → openid
        openid_url = f"https://graph.qq.com/oauth2.0/me?access_token={access_token}&fmt=json"
        with _urlreq.urlopen(openid_url, timeout=10) as resp:
            openid_data = json.loads(resp.read().decode())
        openid = openid_data.get("openid", "")
        if not openid:
            return None

        # Step 3: access_token + openid → 用户信息
        info_url = (
            f"https://graph.qq.com/user/get_user_info?"
            f"access_token={access_token}&oauth_consumer_key={QQ_APP_ID}&openid={openid}"
        )
        with _urlreq.urlopen(info_url, timeout=10) as resp:
            user_data = json.loads(resp.read().decode())
        if user_data.get("ret", -1) != 0:
            print(f"[OAuth✗] QQ获取用户信息失败：{user_data}")
            return None
        nickname = user_data.get("nickname", f"QQ用户{openid[-6:]}")
        avatar = user_data.get("figureurl_qq_2", user_data.get("figureurl_qq_1", ""))
        print(f"[OAuth✓] QQ用户：{nickname} openid={openid[:12]}...")
        return {"openid": openid, "nickname": nickname, "avatar": avatar}
    except Exception as e:
        print(f"[OAuth✗] QQ OAuth 异常：{e}")
        return None


def _login_or_create_oauth_user(provider: str, openid: str, nickname: str, avatar: str) -> dict:
    """根据 openid 查找已有用户或创建新用户，返回 token 等信息。"""
    db = get_db()
    # 查找已绑定账户
    row = db.execute(
        "SELECT u.id, u.username, u.nickname, u.avatar FROM users u "
        "WHERE u.username LIKE ? LIMIT 1",
        (f"{provider}_%:{openid[:16]}%",)
    ).fetchone()
    if row:
        # 已绑定：更新 token 返回
        token = secrets.token_hex(16)
        db.execute("UPDATE users SET token = ?, nickname = COALESCE(NULLIF(?, ''), nickname), avatar = COALESCE(NULLIF(?, ''), avatar) WHERE id = ?",
                   (token, nickname, avatar, row[0]))
        db.commit()
        return {"ok": True, "id": row[0], "username": row[1], "nickname": nickname or row[2], "avatar": avatar or row[3], "token": token}

    # 新用户：自动创建并绑定
    username = f"{provider}_{secrets.token_hex(3)}:{openid[:16]}"
    while db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        username = f"{provider}_{secrets.token_hex(3)}:{openid[:16]}"
    salt = secrets.token_hex(8)
    phash = hashlib.sha256((secrets.token_hex(16) + salt).encode()).hexdigest()
    token = secrets.token_hex(16)
    db.execute(
        "INSERT INTO users (username, nickname, avatar, password_hash, salt, token, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (username, nickname or f"{provider}用户{openid[-6:]}", avatar or "", phash, salt, token, datetime.utcnow().isoformat()))
    db.commit()
    new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    print(f"[OAuth✓] 新用户创建：{nickname} (id={new_id}, provider={provider})")
    return {"ok": True, "id": new_id, "username": username, "nickname": nickname or f"{provider}用户{openid[-6:]}", "avatar": avatar or "", "token": token}


@app.get("/api/auth/wechat-callback")
def wechat_callback(code: str = "", state: str = ""):
    """微信 OAuth 回调端点。

    微信开放平台扫码后浏览器跳转到此 URL。
    流程：code → access_token → openid → 用户信息 → 自动登录/注册。

    部署条件：
    1. 在 https://open.weixin.qq.com 注册网站应用，获取 WECHAT_APP_ID + WECHAT_APP_SECRET
    2. 在 .env 中配置以上两项 + WECHAT_REDIRECT_URI（指向本端点）
    3. 域名必须已备案并通过微信开放平台审核

    未配置时返回错误提示，不影响开发环境其他功能。
    """
    if not code:
        # 用户拒绝授权或其他错误
        return _oauth_error_html("授权已取消或参数错误")

    user_info = _resolve_wechat_user(code)
    if not user_info:
        return _oauth_error_html(
            "微信授权失败",
            "可能原因：<br>1. WECHAT_APP_ID/WECHAT_APP_SECRET 未配置或错误<br>"
            "2. 回调域名与微信开放平台配置不一致<br>"
            "3. 网络请求超时"
        )

    result = _login_or_create_oauth_user("wechat", user_info["openid"], user_info["nickname"], user_info["avatar"])
    return _oauth_success_html(result)


@app.get("/api/auth/qq-callback")
def qq_callback(code: str = "", state: str = ""):
    """QQ OAuth 回调端点。

    QQ互联平台扫码后浏览器跳转到此 URL。
    流程：code → access_token → openid → 用户信息 → 自动登录/注册。

    部署条件：
    1. 在 https://connect.qq.com 注册网站应用，获取 QQ_APP_ID + QQ_APP_SECRET
    2. 在 .env 中配置以上两项 + QQ_REDIRECT_URI（指向本端点）
    3. 域名必须已备案并通过 QQ 互联审核
    """
    if not code:
        return _oauth_error_html("QQ 授权已取消或参数错误")

    user_info = _resolve_qq_user(code)
    if not user_info:
        return _oauth_error_html(
            "QQ 授权失败",
            "可能原因：<br>1. QQ_APP_ID/QQ_APP_SECRET 未配置或错误<br>"
            "2. 回调域名与QQ互联配置不一致<br>"
            "3. 网络请求超时"
        )

    result = _login_or_create_oauth_user("qq", user_info["openid"], user_info["nickname"], user_info["avatar"])
    return _oauth_success_html(result)


def _oauth_success_html(result: dict) -> str:
    """OAuth 登录成功后返回的 HTML 页面，通过 postMessage 通知前端。"""
    from fastapi.responses import HTMLResponse
    # v=20260911 P0 安全修复：
    # ① result 含微信/QQ 昵称等不可信内容，直接拼进 <script> 时 "</script>" 会提前闭合脚本
    #    造成 XSS（token 可被窃取）→ json.dumps 后再把 "</" 转义为 "<\\/"。
    # ② postMessage 的 targetOrigin 不再用 '*'，改为同源 window.location.origin，
    #    否则任意第三方页面打开本回调都能收到含 token 的消息。
    payload_json = json.dumps(result, ensure_ascii=False).replace("</", "<\\/")
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>登录成功</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f7fa; }}
  .card {{ text-align: center; padding: 48px 32px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }}
  .icon {{ font-size: 56px; margin-bottom: 16px; }}
  .title {{ font-size: 20px; font-weight: 600; color: #1a1a2e; margin-bottom: 8px; }}
  .sub {{ font-size: 14px; color: #666; }}
</style></head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <div class="title">登录成功</div>
  <div class="sub">正在返回应用...</div>
</div>
<script>
  const data = {payload_json};
  const TARGET_ORIGIN = window.location.origin;
  function relayViaStorage(msg) {{
    // 同一窗口 / 无法安全回传时的兜底：仅同源 localStorage 中转，不外发给陌生页面
    localStorage.setItem('oauth_result', JSON.stringify(data));
    if (msg) {{
      const sub = document.querySelector('.sub');
      if (sub) sub.textContent = msg;
    }}
    setTimeout(() => {{ window.location.href = '/'; }}, msg ? 900 : 0);
  }}
  if (window.opener) {{
    // 仅当 opener 同源才投递（跨源读取 location 会抛 SecurityError → 视为不同源）
    let sameOrigin = false;
    try {{ sameOrigin = window.opener.location.origin === TARGET_ORIGIN; }} catch (e) {{ sameOrigin = false; }}
    if (sameOrigin) {{
      window.opener.postMessage({{type: 'oauth-login', ...data}}, TARGET_ORIGIN);
      setTimeout(() => window.close(), 800);
    }} else {{
      relayViaStorage('已登录，正在返回应用（当前页面非同源，未向来源页面发送凭据）...');
    }}
  }} else {{
    relayViaStorage('');
  }}
</script>
</body></html>""")


def _oauth_error_html(title: str, detail: str = "") -> str:
    """OAuth 失败时的 HTML 错误页面。"""
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{title}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f7fa; }}
  .card {{ text-align: center; padding: 48px 32px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 420px; }}
  .icon {{ font-size: 56px; margin-bottom: 16px; }}
  .title {{ font-size: 18px; font-weight: 600; color: #e74c3c; margin-bottom: 12px; }}
  .detail {{ font-size: 13px; color: #888; line-height: 1.7; }}
  .btn {{ display: inline-block; margin-top: 20px; padding: 10px 24px; background: #4e6ef2; color: #fff; border-radius: 6px; text-decoration: none; font-size: 14px; }}
</style></head>
<body>
<div class="card">
  <div class="icon">⚠️</div>
  <div class="title">{title}</div>
  <div class="detail">{detail or "请返回应用使用其他方式登录"}</div>
  <a class="btn" href="/">返回首页</a>
</div>
</body></html>""")


@app.post("/api/auth/phone-login")
def phone_login(req: PhoneLoginRequest):
    """手机号验证码登录：同一手机号始终对应同一账号（首次登录才建号）。"""
    db = get_db()
    phone = (req.phone or "").strip()
    if not phone or len(phone) < 5:
        raise HTTPException(status_code=400, detail="手机号格式不正确")
    code = (req.code or "").strip()
    if not code or len(code) < 4:
        raise HTTPException(status_code=400, detail="请输入正确的验证码")

    # 校验验证码
    _sms_gc()
    with _sms_lock:
        stored = _sms_store.get(phone)
        if not stored or stored[0] != code:
            raise HTTPException(status_code=401, detail="验证码错误或已过期，请重新获取")
        # 验证码校验通过后删除（一次性使用）
        del _sms_store[phone]

    import secrets, hashlib
    # v=20260911 P0 根因修复：原实现每次登录都 INSERT 一个新用户 —— 同一手机号反复登录会
    # 无限建号，且旧账号的错题/积分/会话全部丢失。改为以 users.phone 作为手机号身份：
    # 已有该手机号 → 直接登录该用户并刷新 token；不存在 → 才创建新用户并写入 phone。
    _ensure_column(db, 'users', 'phone', 'TEXT')
    try:
        # 手机号唯一索引：在库层兜住并发建号（老库若已有重复值则跳过，不影响登录）
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)")
        db.commit()
    except sqlite3.DatabaseError as e:
        print(f"[auth] 手机号唯一索引未创建（可忽略）：{e}")

    row = db.execute(
        "SELECT id, username, nickname, avatar FROM users WHERE phone = ? ORDER BY id ASC LIMIT 1",
        (phone,)
    ).fetchone()
    if row:
        token = secrets.token_hex(16)   # 刷新 token（一次登录一枚，旧 token 自然失效）
        db.execute("UPDATE users SET token = ? WHERE id = ?", (token, row[0]))
        db.commit()
        return {"ok": True, "id": row[0], "username": row[1],
                "nickname": row[2] or f"用户{phone[-4:]}", "avatar": row[3] or "", "token": token}

    nickname = f"用户{phone[-4:]}"
    username = "ph_" + secrets.token_hex(3)
    while db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        username = "ph_" + secrets.token_hex(3)
    salt = secrets.token_hex(8)
    phash = hashlib.sha256((secrets.token_hex(16) + salt).encode()).hexdigest()
    token = secrets.token_hex(16)
    db.execute(
        "INSERT INTO users (username, nickname, avatar, password_hash, salt, token, created, phone) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (username, nickname, "", phash, salt, token,
         __import__('datetime').datetime.utcnow().isoformat(), phone))
    db.commit()
    new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"ok": True, "id": new_id, "username": username, "nickname": nickname, "avatar": "", "token": token}


class OAuthRequest(BaseModel):
    provider: str  # "wechat" or "qq"
    nickname: str = ""


@app.post("/api/auth/oauth")
def oauth_login(req: OAuthRequest):
    """第三方登录入口。生产对接：微信 openid / QQ openid 由扫码回调获取并传入。
    若该 openid 已绑定账户 → 直接登录；
    若未绑定 → 返回 409 + scene 标识，前端引导用户完成"绑定账号"（填写昵称+密码）。"""
    db = get_db()
    provider = req.provider
    if provider not in ("wechat", "qq"):
        raise HTTPException(status_code=400, detail="不支持的登录方式")
    # 真实 OAuth 下：req.nickname 替换为 openid（扫码回调获取）
    openid = (req.nickname or "").strip()
    if not openid:
        raise HTTPException(status_code=400, detail="缺少 openid")
    # v=20260911 P0 根因修复：openid 来自请求体（外部输入）。微信/QQ 的 openid 只会由
    # [A-Za-z0-9_-] 组成且长度 ≤64（微信 28 位 / QQ 32 位），这里在入口白名单校验，
    # 不合法直接 400 —— 从源头杜绝后续 LIKE 注入与拼接污染。
    if not re.fullmatch(r'[A-Za-z0-9_\-]{1,64}', openid):
        raise HTTPException(status_code=400, detail="openid 格式不合法")
    # 纵深防御：LIKE 参数里的 \ % _ 一律转义（\ 先转义），并显式声明 ESCAPE '\'，
    # 保证 openid 中的通配符只按字面量匹配；绑定语义（两条 LIKE 的匹配范围）保持不变。
    openid_like = openid.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    # 查找已绑定账户
    row = db.execute(
        "SELECT u.id, u.username, u.nickname, u.avatar, u.token FROM users u "
        "WHERE u.username LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\' LIMIT 1",
        (f"{provider}_%:{openid_like}%", f"%{openid_like}%")
    ).fetchone()
    if not row:
        # 未绑定：返回 scene token，前端进入绑定流程
        scene = __import__('secrets').token_urlsafe(16)
        db.execute(
            "INSERT INTO oauth_pending (scene, provider, openid, created) VALUES (?, ?, ?, ?)",
            (scene, provider, openid, __import__('datetime').datetime.utcnow().isoformat())
        )
        db.commit()
        return {"ok": False, "need_bind": True, "scene": scene, "provider": provider, "msg": "请完成账号绑定"}
    import secrets, hashlib
    token = secrets.token_hex(16)
    db.execute("UPDATE users SET token = ? WHERE id = ?", (token, row[0]))
    db.commit()
    return {"ok": True, "id": row[0], "username": row[1], "nickname": row[2], "avatar": row[3], "token": token}


class BindRequest(BaseModel):
    scene: str
    nickname: str
    password: str
    avatar: str = ""


@app.post("/api/auth/bind")
def bind_account(req: BindRequest):
    """绑定第三方账号：填写昵称密码完成账号创建并绑定 openid。"""
    db = get_db()
    if not req.nickname or not req.password:
        raise HTTPException(status_code=400, detail="昵称和密码不能为空")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="密码至少 4 位")
    pending = db.execute(
        "SELECT provider, openid FROM oauth_pending WHERE scene = ?", (req.scene,)
    ).fetchone()
    if not pending:
        raise HTTPException(status_code=400, detail="绑定会话已过期，请重新扫码")
    db.execute("DELETE FROM oauth_pending WHERE scene = ?", (req.scene,))
    provider, openid = pending

    import secrets, hashlib
    salt = secrets.token_hex(8)
    phash = hashlib.sha256((req.password + salt).encode()).hexdigest()
    token = secrets.token_hex(16)
    # username 编码 provider + openid，便于后续扫码识别
    username = f"{provider}_{secrets.token_hex(3)}:{openid[:16]}"
    nickname = req.nickname.strip()
    db.execute(
        "INSERT INTO users (username, nickname, avatar, password_hash, salt, token, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (username, nickname, req.avatar, phash, salt, token, __import__('datetime').datetime.utcnow().isoformat())
    )
    db.commit()
    new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"ok": True, "id": new_id, "username": username, "nickname": nickname, "avatar": req.avatar, "token": token}


