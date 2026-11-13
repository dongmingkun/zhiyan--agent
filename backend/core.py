"""core.py —— 共享服务层（原 backend/main.py 第 133–2281 行，2026-09-11 模块化拆分）。

包含：知识元数据缓存、数据库访问与备份、鉴权（HMAC token / 频率限制）、
RAG 检索与 Few-shot、意图识别与领域守门、系统提示词、计算引擎预校验、
流式生成、响应缓存等被各路由模块共享的服务。

设计说明：main.py 完成启动引导（应用创建 / 静态挂载 / PWA 资源）后导入
本模块；本模块 `from .main import *` 共享引导命名空间，并在文件末尾把
全部命名（含下划线私有名）导出给各 routes_* 模块，保证拆分前后语义一致。
"""
from .main import *  # noqa: F401,F403

# ═══════ 知识元数据缓存(metadata.json:网状关系 + 三项动态系数) ═══════
_META_CACHE = {"mtime": 0, "data": None}
def _load_kp_meta():
    """按文件 mtime 懒加载 metadata.json,确保不阻塞启动。"""
    path = os.path.join(DATA_DIR, "metadata.json")
    if not os.path.isfile(path):
        return {}
    try:
        mtime = os.path.getmtime(path)
        if _META_CACHE["mtime"] != mtime:
            with open(path, "r", encoding="utf-8") as f:
                _META_CACHE["data"] = json.load(f)
                _META_CACHE["mtime"] = mtime
    except Exception as e:
        return _META_CACHE.get("data") or {}
    return _META_CACHE.get("data") or {}

_KP_NAME_INDEX = None
def _load_kp_name_index():
    """从 knowledge.js level2 节点抽取 {中文标题: kp_id} 映射,供错题 kp 名 → metadata kp_id 反查。
    由于 knowledge.js 是 const 声明的全局对象,我们直接 ast/regex 提取 title→id 配对。"""
    global _KP_NAME_INDEX
    if _KP_NAME_INDEX is not None:
        return _KP_NAME_INDEX
    _KP_NAME_INDEX = {}
    path = os.path.join(FRONTEND_DIR, "js", "knowledge.js")
    if not os.path.isfile(path):
        return _KP_NAME_INDEX
    try:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
        # 找每个节点 {id: 'tp-xx-y', ... title: '中文名', ...}
        import re as _re
        for m in _re.finditer(r"id:\s*'(tp-[a-z]+-\d+)'\s*,\s*parent:[^,]+,\s*title:\s*'([^']+)'", src):
            kp_id, title = m.group(1), m.group(2)
            # 取核心短词(去"定义与"、"应用"、"求解"等后缀,做模糊匹配)
            core = _re.sub(r'(与|和|或)[^,，]*$', '', title)
            _KP_NAME_INDEX[title] = kp_id
            _KP_NAME_INDEX[core] = kp_id
            # 也存前 4 字,容错
            for w in [title[:4], title[:3]]:
                if len(w) >= 3 and w not in _KP_NAME_INDEX:
                    _KP_NAME_INDEX[w] = kp_id
    except Exception as e:
        pass
    return _KP_NAME_INDEX

def _kp_id_from_name(name: str) -> str:
    """中文 kp 名 → metadata kp_id(线性代数 48 节点)。"""
    if not name:
        return None
    idx = _load_kp_name_index()
    # 直接查
    if name in idx:
        return idx[name]
    # 包含关系查找
    for k, v in idx.items():
        if k in name or name in k:
            return v
    return None

def _kp_meta_summary(kp_id):
    """返回知识点元数据中文摘要,供 RAG 上下文 / 错题回溯 / 路径推荐使用。
    返回 None 表示该知识点无 metadata(对线性代数 48 节点外的内容可降级)。"""
    data = _load_kp_meta()
    meta = data.get(kp_id)
    if not meta:
        return None
    # 找节点的标题(从 kp_id 推断)
    title = kp_id
    # 翻译难度(1-5)
    ds = meta.get("difficultyScore", 3)
    es = meta.get("errorProneScore", 0.5)
    fs = meta.get("examFreqScore", 0.5)
    preDeps = meta.get("preDependencies", []) or []
    postRels = meta.get("postRelations", []) or []
    strong_pre = [p for p in preDeps if (p.get("preWeight") or 0) >= 0.8]
    out = {
        "knowledgeId": kp_id,
        "title": title,
        "difficultyScore": ds,
        "errorProneScore": es,
        "examFreqScore": fs,
        "isHighErrorProne": es >= 0.7,
        "isHighExamFreq": fs >= 0.7,
        "strongPrerequisites": [{"id": p["targetId"], "weight": p.get("preWeight"), "reason": p.get("desc", "")} for p in strong_pre],
        "postRelations": [{"id": p["targetId"], "weight": p.get("postWeight"), "reason": p.get("desc", "")} for p in postRels],
    }
    return out

def _kp_meta_text_block(kp_id):
    """把一个知识点的元数据格式化为可读的中文文本,供注入 LLM prompt / 错题诊断。"""
    s = _kp_meta_summary(kp_id)
    if not s:
        return ""
    lines = [f"【{kp_id} 元数据】",
             f"- 难度 {s['difficultyScore']}/5",
             f"- 易错 {int(s['errorProneScore']*100)}%  ({'⚠ 极易错' if s['isHighErrorProne'] else '一般'})",
             f"- 考频 {int(s['examFreqScore']*100)}%  ({'🔥 高频考点' if s['isHighExamFreq'] else '常考'})"]
    if s["strongPrerequisites"]:
        lines.append("- 强必学前置(preWeight>=0.8):")
        for p in s["strongPrerequisites"]:
            lines.append(f"   · {p['id']} (weight={p['weight']})  {p['reason'][:80]}")
    if s["postRelations"]:
        lines.append("- 后置关联(联动学习):")
        for p in s["postRelations"][:3]:
            lines.append(f"   · {p['id']} (weight={p['weight']})  {p['reason'][:60]}")
    return "\n".join(lines)


# ───────── v=20260869 薄弱路径:BFS 上游链(到根) ─────────
def _kp_weakness_path(kp_id: str, max_depth: int = 6):
    """从错题知识点出发,BFS 上游到根,返回完整薄弱路径(按 depth 排序)。
    用于薄弱路径可视化(P1):错题 → 完整前置依赖链 → 标出最弱环节 → 给出补救顺序。
    返回 {chain: [{id, name, depth, errorProne, isWeakest}], weakestId, totalDepth, hint }。
    """
    data = _load_kp_meta()
    visited = set()
    chain = []

    def _name_for(nid):
        m = data.get(nid) or {}
        for k in ("title", "name", "chapter"):
            v = m.get(k)
            if v: return v
        return nid

    def _walk(node_id, depth):
        if depth > max_depth or node_id in visited:
            return
        visited.add(node_id)
        meta = data.get(node_id) or {}
        es = meta.get("errorProneScore", 0.5)
        chain.append({
            "id": node_id,
            "name": _name_for(node_id),
            "depth": depth,
            "errorProne": round(es, 3),
            "isHighErrorProne": es >= 0.7,
        })
        # 找上游(谁是我节点的前置?即其他节点的 postRelations.targetId == node_id)
        for other_id, other_meta in data.items():
            if not other_id.startswith("tp-") or other_id == node_id:
                continue
            post_rels = other_meta.get("postRelations", []) or []
            if any(pr.get("targetId") == node_id for pr in post_rels):
                _walk(other_id, depth + 1)

    _walk(kp_id, 0)
    # 找最弱环节(errorProne 最高)
    weakest = max(chain, key=lambda x: x["errorProne"]) if chain else None
    # 补救顺序:从根(最深)到错题(深度 0)——按 depth 倒序
    remediation = sorted(chain, key=lambda x: -x["depth"])
    # 提示
    if not chain or len(chain) == 1:
        hint = "该节点无上游依赖,直接强化练习即可"
    elif weakest and weakest["id"] != kp_id:
        hint = f"薄弱路径上的最易错环节是「{weakest['name']}」(易错率 {int(weakest['errorProne']*100)}%)，建议优先补强"
    else:
        # 多节点链,但最弱=自身(即错题节点是最弱环节)
        upstream = [c for c in chain if c["depth"] > 0]
        if upstream:
            names = " → ".join(c["name"] for c in sorted(upstream, key=lambda x: x["depth"], reverse=True))
            hint = f"该错题节点本身易错率最高,需重点突破;同时补强上游: {names}"
        else:
            hint = "该节点无上游依赖,直接强化练习即可"
    return {
        "chain": chain,
        "weakestId": weakest["id"] if weakest else None,
        "weakestName": weakest["name"] if weakest else None,
        "totalDepth": max((c["depth"] for c in chain), default=0),
        "remediationOrder": [{"id": c["id"], "name": c["name"], "depth": c["depth"]} for c in remediation],
        "hint": hint,
    }


# ---------- CORS ----------
# CORS 规范：携带凭证（Cookie/Authorization）时不允许 `*` 通配来源（浏览器会直接拒绝）。
# 根因修复：通配来源时关闭 credentials；显式列举来源时才开启。
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()] or ["*"]
_CORS_ALLOW_CREDENTIALS = "*" not in ALLOWED_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=_CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- 数据库 ----------
DB_PATH = database_path()
if DB_PATH != ":memory:":
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
_db = sqlite3.connect(DB_PATH, check_same_thread=False)

# 用户表
_db.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        nickname TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        token TEXT DEFAULT '',
        created TEXT
    )
""")# 问答历史表
_db.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question TEXT,
        answer TEXT,
        mode TEXT DEFAULT 'direct',
        citations TEXT DEFAULT '',
        rag_used INTEGER DEFAULT 0,
        created TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")

# 会话式问答历史（2026-08-15 重构）
_db.execute("""
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        relate_knowledge TEXT DEFAULT '',
        created TEXT,
        updated TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
_db.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        mode TEXT DEFAULT 'direct',
        citations TEXT DEFAULT '',
        rag_used INTEGER DEFAULT 0,
        ocr_used INTEGER DEFAULT 0,
        image_url TEXT DEFAULT '',
        created TEXT,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id)
    )
""")
_db.execute("CREATE INDEX IF NOT EXISTS idx_msg_session ON chat_messages(session_id)")
_db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id)")

# 兼容迁移：旧 chat_history 单轮问答 → 1 session + 2 messages（user/ai）；旧表保留只读
def _migrate_old_chat_history():
    """将旧 chat_history 的每条记录迁移为 chat_sessions + chat_messages。
    避免重复迁移：仅迁移不在 chat_sessions 关联范围内的旧记录。"""
    import secrets as _s
    rows = _db.execute(
        "SELECT id, user_id, question, answer, mode, citations, rag_used, created FROM chat_history"
    ).fetchall()
    migrated = 0
    for r in rows:
        old_id = r[0]
        # 检查是否已迁移：以 old_id 作来源标记
        if _db.execute(
            "SELECT 1 FROM chat_messages WHERE created = ? AND role = 'user' AND content = ? LIMIT 1",
            (r[7] or '', r[2] or '')
        ).fetchone():
            continue
        uid = r[1]
        sid = 'mig_' + _s.token_hex(8) + str(old_id)
        title, ocr_flag = _derive_session_title(r[2], r[3], r[7] or '')
        _db.execute(
            "INSERT INTO chat_sessions(id, user_id, title, relate_knowledge, created, updated) VALUES(?,?,?,?,?,?)",
            (sid, uid, title, '', r[7] or '', r[7] or '')
        )
        _db.execute(
            "INSERT INTO chat_messages(session_id, user_id, role, content, mode, citations, rag_used, ocr_used, created) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (sid, uid, 'user', r[2] or '', r[4] or 'direct', '', 0, 1 if ocr_flag else 0, r[7] or '')
        )
        _db.execute(
            "INSERT INTO chat_messages(session_id, user_id, role, content, mode, citations, rag_used, ocr_used, created) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (sid, uid, 'ai', r[3] or '', r[4] or 'direct', r[5] or '', r[6] or 0, 1 if ocr_flag else 0, r[7] or '')
        )
        migrated += 1
    if migrated:
        _db.commit()
        print("[历史迁移] chat_history → chat_sessions：迁移 %d 条" % migrated)


def _derive_session_title(question, answer, created):
    """根据旧记录的 question/answer 推导会话标题与 OCR 标记"""
    q = (question or '').strip()
    a = (answer or '').strip()
    # OCR 失败 / 图片题兜底标题
    is_ocr = ('用户发送了一张图片' in q) or ('【图片 OCR' in q) or ('请尽力回答' in q and 'OCR' in a) or ('无法识别' in a and '图片' in a)
    if is_ocr or len(q) < 2:
        date_part = (created or '')[:10] or '未知日期'
        return '【图片题目对话 - %s】' % date_part, True
    # 取首行/前 22 字作为标题（去除换行/空白），并清洗尾部多余的中英文标点
    # 避免 "什么是施密特正交化》"、"求特征值!!!" 这类脏标题
    first_line = q.split('\n', 1)[0].strip()
    _trailing_punct = re.compile(r'[\s\u3000。，；：、？！?!\.,;:…\'""`~～\-—_+=|\\\/]{1,12}$')
    truncated = first_line[:22]
    title = _trailing_punct.sub('', truncated).rstrip()
    if len(first_line) > 22:
        title += '…'
    return title or '（无标题）', False


_migrate_old_chat_history()
# 错题本（兼容旧表，加 user_id）
_db.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 0,
        question TEXT,
        answer TEXT,
        note TEXT DEFAULT '',
        created TEXT
    )
""")
# 兼容性：旧 notes 表可能没有 user_id 列
try:
    _db.execute("ALTER TABLE notes ADD COLUMN user_id INTEGER DEFAULT 0")
except sqlite3.OperationalError:
    pass

# 错题归因表（用于知识漏洞雷达）
_db.execute("""
    CREATE TABLE IF NOT EXISTS mistakes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question TEXT,
        user_answer TEXT DEFAULT '',
        correct_answer TEXT DEFAULT '',
        knowledge_point TEXT DEFAULT '',
        chapter TEXT DEFAULT '',
        created TEXT
    )
""")

# 兼容旧表结构：mistakes 错题云同步列
for col, col_def in [
    ("qid", "TEXT DEFAULT ''"),        # 题目 ID（去重键）
    ("payload", "TEXT DEFAULT ''"),    # 完整错题对象 JSON
    ("times", "INTEGER DEFAULT 1"),    # 错误次数
    ("last_time", "TEXT DEFAULT ''"),  # 最近错误时间
    ("deleted", "INTEGER DEFAULT 0"),  # 软删除标记（跨设备删除同步）
]:
    try:
        _db.execute(f"ALTER TABLE mistakes ADD COLUMN {col} {col_def}")
    except sqlite3.OperationalError:
        pass

# v=20260907d 错题消灭式闭环：四状态流 active(未消灭)/consolidating(巩固中)/eliminated(已消灭)/archived(手动归档)
try:
    _db.execute("ALTER TABLE mistakes ADD COLUMN status TEXT DEFAULT 'active'")
except sqlite3.OperationalError:
    pass

# v=20260907d 间隔复习计划表：由答题事件自动登记更新（不手动整理）
_db.execute("""
    CREATE TABLE IF NOT EXISTS review_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kp TEXT DEFAULT '',
        next_due TEXT DEFAULT '',
        interval_idx INTEGER DEFAULT 0,
        last_result TEXT DEFAULT '',
        updated TEXT
    )
""")
try:
    _db.execute("CREATE INDEX IF NOT EXISTS idx_review_schedule_user ON review_schedule(user_id, next_due)")
    _db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_review_schedule_user_kp ON review_schedule(user_id, kp)")
except sqlite3.OperationalError:
    pass

# v=20260902m 收藏题目表（action bar 「更多 → 收藏题目」）
_db.execute("""
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question TEXT,
        answer TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created TEXT
    )
""")

# v=20260902m AI 回答反馈表（点赞/点踩）
_db.execute("""
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        msg_id TEXT DEFAULT '',
        rating TEXT DEFAULT 'up',
        comment TEXT DEFAULT '',
        created TEXT
    )
""")

# v=20260902m favorites/feedback 索引（提升按 user 查询效率）
try:
    _db.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, id DESC)")
    _db.execute("CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, id DESC)")
    _db.execute("CREATE INDEX IF NOT EXISTS idx_feedback_msg ON feedback(msg_id)")
except sqlite3.OperationalError:
    pass

_db.commit()

# 好友关系表（status: pending/accepted/rejected）
_db.execute("""
    CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER NOT NULL,
        to_user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created TEXT,
        updated TEXT,
        FOREIGN KEY(from_user_id) REFERENCES users(id),
        FOREIGN KEY(to_user_id) REFERENCES users(id),
        UNIQUE(from_user_id, to_user_id)
    )
""")
# 私信消息表（扩展：支持群聊、回复、图片、删除/撤回）
_db.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER NOT NULL,
        to_user_id INTEGER DEFAULT NULL,
        group_id INTEGER DEFAULT NULL,
        reply_to INTEGER DEFAULT NULL,
        content TEXT DEFAULT '',
        type TEXT DEFAULT 'text',
        image_url TEXT DEFAULT '',
        is_read INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        recalled INTEGER DEFAULT 0,
        created TEXT,
        FOREIGN KEY(from_user_id) REFERENCES users(id),
        FOREIGN KEY(to_user_id) REFERENCES users(id),
        FOREIGN KEY(group_id) REFERENCES groups(id)
    )
""")

# 群组表
_db.execute("""
    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        avatar TEXT DEFAULT '',
        created TEXT,
        FOREIGN KEY(owner_id) REFERENCES users(id)
    )
""")
# 群成员表
_db.execute("""
    CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        joined TEXT,
        last_read_msg_id INTEGER DEFAULT 0,
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(group_id, user_id)
    )
""")
# 兼容旧表结构：group_members 新增 last_read_msg_id
try:
    _db.execute("ALTER TABLE group_members ADD COLUMN last_read_msg_id INTEGER DEFAULT 0")
except sqlite3.OperationalError:
    pass
# 动态表（朋友圈）
_db.execute("""
    CREATE TABLE IF NOT EXISTS moments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        created TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
# --- 学生画像系统 v3.0 ---
_db.execute("""
    CREATE TABLE IF NOT EXISTS student_profiles (
        user_id INTEGER PRIMARY KEY,
        learning_style TEXT DEFAULT '{}',
        cognitive_level TEXT DEFAULT '{}',
        interest_vector TEXT DEFAULT '{}',
        study_rhythm TEXT DEFAULT '{}',
        confidence_score REAL DEFAULT 50.0,
        overall_mastery REAL DEFAULT 50.0,
        emotion_trend TEXT DEFAULT '[]',
        updated TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
_db.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_mastery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        knowledge_point TEXT NOT NULL,
        mastery_score REAL DEFAULT 50.0,
        attempts INTEGER DEFAULT 0,
        correct_attempts INTEGER DEFAULT 0,
        avg_response_time REAL DEFAULT 0.0,
        last_practiced TEXT,
        forgetting_score REAL DEFAULT 1.0,
        updated TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(user_id, knowledge_point)
    )
""")
_db.execute("""
    CREATE TABLE IF NOT EXISTS learning_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_type TEXT DEFAULT 'chat',
        knowledge_points TEXT DEFAULT '[]',
        duration_seconds INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        timestamp TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
# v=20260894 学习小精灵 + 游戏化(积分/等级/连续打卡/任务完成历史)
_db.execute("""
    CREATE TABLE IF NOT EXISTS student_gamification (
        user_id INTEGER PRIMARY KEY,
        points INTEGER DEFAULT 0,                -- 累计积分
        level INTEGER DEFAULT 1,                 -- 当前等级 1~5
        streak_days INTEGER DEFAULT 0,           -- 连续打卡天数
        last_active_date TEXT DEFAULT '',        -- 上次活跃日期(YYYY-MM-DD),用于判定连续打卡
        completed_tasks_json TEXT DEFAULT '[]',  -- 任务完成历史 [{date, kp, points, ts}]
        badges_json TEXT DEFAULT '[]',           -- 已获徽章 [{id, name, ts}]
        updated TEXT
    )
""")
# 第三方扫码绑定待办（扫码后用户需填写昵称密码绑定账号）
_db.execute("""
    CREATE TABLE IF NOT EXISTS oauth_pending (
        scene TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        openid TEXT NOT NULL,
        created TEXT
    )
""")
# Token 消费追踪 + 积分系统
_db.execute("""
    CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        api_type TEXT DEFAULT 'chat',       -- chat / vision / embedding
        model TEXT DEFAULT 'deepseek-chat',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        cost_tokens INTEGER DEFAULT 0,       -- 消费的平台积分
        created TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
_db.execute("""
    CREATE TABLE IF NOT EXISTS user_credits (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 100,         -- 新用户赠送 100 积分
        total_purchased INTEGER DEFAULT 0,   -- 累计购买积分
        total_consumed INTEGER DEFAULT 0,    -- 累计消费积分
        updated TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
# 设备类型会话表：一个账号最多并存 电脑1 + 手机1 + 平板1 三个会话（同类型互踢）
_db.execute("""
    CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        device TEXT DEFAULT 'computer',   -- computer | mobile | tablet
        created TEXT,
        updated TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")
_db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)")
# 迁移旧单会话表 → 新多会话表（旧 token 归为 computer 会话；__logout__ 登出标记丢弃）
try:
    _db.execute("ALTER TABLE user_sessions RENAME TO user_sessions_old")
    _db.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            device TEXT DEFAULT 'computer',
            created TEXT,
            updated TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    _db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)")
    _db.execute(
        "INSERT INTO user_sessions(user_id, token, device, created, updated) "
        "SELECT user_id, token, 'computer', updated, updated FROM user_sessions_old "
        "WHERE token != '__logout__' AND token != ''"
    )
    _db.execute("DROP TABLE IF EXISTS user_sessions_old")
    _db.commit()
except sqlite3.OperationalError:
    pass  # 已是新结构则跳过
_db.execute("""
    CREATE TABLE IF NOT EXISTS credit_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        order_no TEXT UNIQUE NOT NULL,
        plan_id TEXT NOT NULL,               -- monthly_100 / yearly_1200 / once_500
        amount INTEGER NOT NULL,             -- 人民币，单位：分
        credits INTEGER NOT NULL,            -- 购买的平台积分
        status TEXT DEFAULT 'pending',       -- pending / paid / cancelled
        pay_method TEXT DEFAULT 'wechat',
        created TEXT,
        paid_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
""")

_db.commit()

# 兼容旧表结构：users 头像/昵称
for col, col_def in [("nickname", "TEXT DEFAULT ''"), ("avatar", "TEXT DEFAULT ''")]:
    try:
        _db.execute(f"ALTER TABLE users ADD COLUMN {col} {col_def}")
    except sqlite3.OperationalError:
        pass

# 兼容旧表结构：users 角色 / 状态（管理员功能）
for col, col_def in [
    ("role", "TEXT DEFAULT 'user'"),
    ("status", "TEXT DEFAULT 'active'"),   # active | banned
    ("guest_quota", "INTEGER DEFAULT 5"),
    ("last_login", "TEXT DEFAULT ''"),     # 最后登录时间（管理后台活跃度判断）
]:
    try:
        _db.execute(f"ALTER TABLE users ADD COLUMN {col} {col_def}")
    except sqlite3.OperationalError:
        pass
# v=20260904b P0 安全：清空并废弃明文密码副本列 pwd_plain（历史遗留可逆加密，改为仅单向 sha256 哈希）
try:
    _db.execute("UPDATE users SET pwd_plain = ''")
except sqlite3.OperationalError:
    pass
# 确保存量用户 role/status 有默认值
_db.execute("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''")
_db.execute("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''")
_db.commit()

# 兼容旧表结构：messages 扩展字段（升级已存在的库）
for col, col_def in [
    ("to_user_id", "INTEGER DEFAULT NULL"),
    ("group_id", "INTEGER DEFAULT NULL"),
    ("reply_to", "INTEGER DEFAULT NULL"),
    ("content", "TEXT DEFAULT ''"),
    ("type", "TEXT DEFAULT 'text'"),
    ("image_url", "TEXT DEFAULT ''"),
    ("deleted", "INTEGER DEFAULT 0"),
    ("recalled", "INTEGER DEFAULT 0"),
]:
    try:
        _db.execute(f"ALTER TABLE messages ADD COLUMN {col} {col_def}")
    except sqlite3.OperationalError:
        pass

# 兼容：给已有用户自动创建积分账户（新用户 100 积分）
for row in _db.execute("SELECT id FROM users").fetchall():
    uid = row[0]
    if not _db.execute("SELECT 1 FROM user_credits WHERE user_id = ?", (uid,)).fetchone():
        _db.execute(
            "INSERT OR IGNORE INTO user_credits (user_id, balance, updated) VALUES (?, 100, ?)",
            (uid, datetime.utcnow().isoformat()))
_db.commit()


# 可选演示数据初始化：仅 ENABLE_DEMO_SEED=true 且 users 为空时导入。
# seed_data.json 属于历史种子资料；现有数据库永远不被种子覆盖。
_SEED_FILE = os.path.join(DATA_DIR, "seed_data.json")
_seed_cache = None
_seed_done = False


def _load_seed() -> Optional[dict]:
    global _seed_cache
    if _seed_cache is not None:
        return _seed_cache
    try:
        if os.path.exists(_SEED_FILE):
            with open(_SEED_FILE, "r", encoding="utf-8") as f:
                _seed_cache = json.load(f)
        else:
            _seed_cache = {}
    except Exception:
        _seed_cache = {}
    return _seed_cache


def ensure_seed_data(db) -> None:
    """Optional demo bootstrap for a fresh database; never overwrite existing users."""
    global _seed_done
    if _seed_done:
        return
    if os.environ.get("ENABLE_DEMO_SEED", "false").lower() not in ("1", "true", "yes", "on"):
        _seed_done = True
        return
    if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
        _seed_done = True
        return
    seed = _load_seed()
    if not seed or not seed.get("users"):
        _seed_done = True
        return
    # Only columns and tables present in this application's schema are accepted.
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    try:
        with db:
            for table, rows in seed.items():
                if table not in tables or not isinstance(rows, list):
                    continue
                allowed = {r[1] for r in db.execute(f'PRAGMA table_info("{table}")')}
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    values = {key: value for key, value in row.items() if key in allowed}
                    if not values:
                        continue
                    columns = ",".join('"' + key + '"' for key in values)
                    placeholders = ",".join("?" for _ in values)
                    db.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({placeholders})', list(values.values()))
        _seed_done = True
        print(f"[seed] Initialized isolated demo database ({len(seed['users'])} users)")
    except Exception as exc:
        print(f"[seed] Initialization failed: {exc}")


def get_db():
    ensure_seed_data(_db)
    return _db


# ---------- SSE 实时推送（超低延迟）----------
import asyncio
import json as _json
import threading
from collections import defaultdict


class SSEHub:
    """基于 asyncio.Queue 的内存发布订阅中心（单进程部署，按 user_id 分发）。

    publish 常被同步路由在线程池线程调用，而 asyncio.Queue 只允许事件循环线程访问——
    故订阅时记录所属事件循环，发布统一经 loop.call_soon_threadsafe 投递（线程安全，根因修复）。"""
    def __init__(self):
        self._queues = defaultdict(list)  # user_id -> [(loop, asyncio.Queue)]

    def subscribe(self, user_id: int) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=200)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None  # 非事件循环上下文兜底
        self._queues[user_id].append((loop, q))
        return q

    def unsubscribe(self, user_id: int, q: asyncio.Queue):
        if user_id in self._queues:
            self._queues[user_id] = [x for x in self._queues[user_id] if x[1] is not q]
            if not self._queues[user_id]:
                self._queues.pop(user_id, None)

    @staticmethod
    def _put(q: asyncio.Queue, event: dict):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

    def publish(self, user_id: int, event: dict):
        """向指定用户推送事件（进程内广播给该用户的所有连接）。线程安全。"""
        for loop, q in list(self._queues.get(user_id, [])):
            if loop is not None and loop.is_running():
                loop.call_soon_threadsafe(self._put, q, event)
            else:
                self._put(q, event)

    def publish_many(self, user_ids: list, event: dict):
        for uid in set(user_ids):
            if uid:
                self.publish(uid, event)


SSE_HUB = SSEHub()


def get_user_by_token_or_query(authorization: Optional[str] = None, token: Optional[str] = None) -> Optional[dict]:
    """v=20260904b 仅从 Authorization header 取用户（token 不再走 query）"""
    t = authorization[7:] if (authorization and authorization.startswith("Bearer ")) else ""
    if t:
        return get_user_by_token(t)
    return None


# ---------- 认证工具 ----------
def hash_password(password: str, salt: str = "") -> tuple:
    """返回 (hash, salt)"""
    if not salt:
        salt = secrets.token_hex(16)
    h = hashlib.sha256((password + salt).encode()).hexdigest()
    return h, salt


# ---- 无状态签名 Token（兼容多实例/无状态部署，不依赖 sqlite 跨请求持久）----
_AUTH_SECRET_CACHE = None


def _auth_secret() -> str:
    """HMAC 签名密钥。P0 安全：绝不硬编码。

    优先级：
    1) 环境变量 AUTH_SECRET（部署平台注入，多实例一致）；
    2) 本地文件 auth_secret.key（首次启动用 secrets.token_hex(32) 生成并持久化，
       重启复用，保证已登录用户不掉线）。

    密钥只落在环境变量或本地 auth_secret.key（两者均不随代码打包/公开）。
    """
    global _AUTH_SECRET_CACHE
    if _AUTH_SECRET_CACHE is not None:
        return _AUTH_SECRET_CACHE

    # 1) 环境变量优先
    env_secret = os.environ.get("AUTH_SECRET", "").strip()
    if env_secret:
        _AUTH_SECRET_CACHE = env_secret
        return _AUTH_SECRET_CACHE

    # 2) 本地文件持久化（首次生成，之后复用）
    key_file = os.path.join(PROJECT_ROOT, "auth_secret.key")
    try:
        if os.path.exists(key_file):
            with open(key_file, "r", encoding="utf-8") as f:
                cached = f.read().strip()
            if cached:
                _AUTH_SECRET_CACHE = cached
                return _AUTH_SECRET_CACHE
        # 生成并持久化新密钥
        _AUTH_SECRET_CACHE = secrets.token_hex(32)
        with open(key_file, "w", encoding="utf-8") as f:
            f.write(_AUTH_SECRET_CACHE)
        # 收紧权限，避免其他进程读取
        try:
            os.chmod(key_file, 0o600)
        except Exception:
            pass
        return _AUTH_SECRET_CACHE
    except Exception:
        # 兜底：文件读写失败时，本次进程内仍可用内存随机密钥（重启后失效，属可接受降级）
        if _AUTH_SECRET_CACHE is None:
            _AUTH_SECRET_CACHE = secrets.token_hex(32)
        return _AUTH_SECRET_CACHE


def make_auth_token(uid: int, role: str = "user", username: str = "", nickname: str = "", avatar: str = "") -> str:
    """生成无状态 token：base64(uid|role|exp|nonce|username|nickname|avatar) . hmac
    nonce 使同一账号每次登录的 token 唯一 → 支持多设备同时在线（不互踢）。
    v=20260922k 载荷携带 username/nickname/avatar → 平台无持久 DB 时仍可无状态降级识别身份。"""
    import base64
    exp = int(datetime.utcnow().timestamp()) + 60 * 60 * 24 * 30  # 30 天
    nonce = secrets.token_hex(6)  # 设备/会话唯一标识
    payload = "|".join([str(uid), role, str(exp), nonce, str(username), str(nickname), str(avatar)])
    p64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hashlib.sha256((_auth_secret() + "::" + payload).encode()).hexdigest()[:32]
    return f"la1.{p64}.{sig}"


def verify_auth_token(token: str) -> Optional[dict]:
    """验签 token，返回 {id, role, exp, username, nickname, avatar}；非法返回 None。不依赖数据库。
    支持多密钥（固定密钥 + 历史密钥），保证部署滚动期新旧 token 均有效。
    兼容旧 3/4 段 payload（uid.role.exp[.nonce]）与新 7 段（uid|role|exp|nonce|username|nickname|avatar）。"""
    if not token or not token.startswith("la1."):
        return None
    import base64
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        p64, sig = parts[1], parts[2]
        payload = base64.urlsafe_b64decode(p64 + "=" * (-len(p64) % 4)).decode()
        if "|" in payload:
            segs = payload.split("|")
            if len(segs) != 7:
                return None
            uid_s, role, exp_s, _nonce, username, nickname, avatar = segs
        else:
            segs = payload.split(".")
            if len(segs) == 3:
                uid_s, role, exp_s = segs
                username = nickname = avatar = ""
            elif len(segs) == 4:
                uid_s, role, exp_s, _nonce = segs
                username = nickname = avatar = ""
            else:
                return None
        exp = int(exp_s)
        if exp < int(datetime.utcnow().timestamp()):
            return None
        # P0 安全：仅用当前 _auth_secret() 验签，不再回退到历史/LLM_API_KEY 派生密钥。
        # 历史硬编码密钥与 LLM_API_KEY 派生密钥均已随 .env/源码泄露，必须彻底废弃。
        expect = hashlib.sha256((_auth_secret() + "::" + payload).encode()).hexdigest()[:32]
        if sig == expect:
            return {"id": int(uid_s), "role": role, "exp": exp,
                    "username": username, "nickname": nickname, "avatar": avatar}
        return None
    except Exception:
        return None


# 种子管理员账号（竞赛演示用：admin / admin123）
def ensure_admin():
    """Create an administrator only when an initial password is explicitly configured."""
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = 'admin'").fetchone():
        return
    initial_password = os.environ.get("ADMIN_PASSWORD", "")
    if not initial_password:
        return
    pwd_hash, salt = hash_password(initial_password)
    db.execute(
        "INSERT INTO users(username, nickname, avatar, password_hash, salt, token, created, role, status) "
        "VALUES ('admin', '系统管理员', 'A', ?, ?, '', ?, 'admin', 'active')",
        (pwd_hash, salt, datetime.utcnow().isoformat()))
    db.commit()
    print("[管理员] 已创建管理员 admin（密码来自环境变量）")


def authenticate(identifier: str, password: str, device: str = "computer") -> Optional[dict]:
    """identifier 可以是用户名或昵称；device: computer | mobile | tablet"""
    # 设备类型白名单（非法值回退 computer）
    if device not in ("computer", "mobile", "tablet"):
        device = "computer"
    db = get_db()
    # 首次启用独立演示库时，按显式开关导入种子。
    ensure_seed_data(db)
    # v=20260901 登录匹配修复:用户名(唯一)精确优先;昵称存在多个时明确报错,避免误匹配最早账号
    row = db.execute(
        "SELECT id, username, nickname, avatar, password_hash, salt, role, status FROM users WHERE username = ?",
        (identifier,)
    ).fetchone()
    if not row:
        nick_rows = db.execute(
            "SELECT id, username, nickname, avatar, password_hash, salt, role, status FROM users WHERE nickname = ?",
            (identifier,)
        ).fetchall()
        if len(nick_rows) == 1:
            row = nick_rows[0]
        elif len(nick_rows) > 1:
            # 同名账号存在:给出可操作的错误提示,而不是静默匹配第一个
            raise HTTPException(status_code=401, detail="该昵称对应多个账号，请使用用户名（登录框下方小写字母名，如 la_xxxx）登录")
        # 0 行 → row 保持 None
    if not row:
        return None
    # v=20260904h 注册登录闭环修复：密码校验兼容两种哈希拼接顺序。
    # 主格式：sha256(password + salt)（register 当前写入格式）。
    # 兼容格式：sha256(salt + password)（历史/边缘路径可能存在的拼接顺序）。
    # 校验成功后若命中兼容格式，则静默升级该用户哈希为主格式，保证"注册→退出→再登录"闭环。
    stored_hash, stored_salt = row[4], row[5]
    h, _ = hash_password(password, stored_salt)          # 主格式：password + salt
    matched_legacy = False
    if h != stored_hash:
        h_legacy = hashlib.sha256((stored_salt + password).encode()).hexdigest()  # 兼容格式：salt + password
        if h_legacy == stored_hash:
            matched_legacy = True
        else:
            return None
    # 封禁用户禁止登录
    if row[7] == 'banned':
        raise HTTPException(status_code=403, detail="该账号已被封禁，请联系管理员")
    # 命中兼容格式 → 静默升级为新格式（防止下次登录仍走兼容分支，也统一全库哈希口径）
    if matched_legacy:
        try:
            new_hash, _ = hash_password(password, stored_salt)
            db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, row[0]))
            db.commit()
        except Exception:
            pass
    # 生成无状态 token（带 nonce，每会话唯一；载荷含用户信息供无持久 DB 场景降级）
    token = make_auth_token(row[0], row[6] or 'user', row[1], row[2] or row[1], row[3] or '')
    try:
        now = datetime.utcnow().isoformat()
        db.execute("UPDATE users SET token = ?, last_login = ? WHERE id = ?",
                   (token, now, row[0]))
        # 多会话控制：销毁同设备类型的旧会话（不同类型会话保留），再插入本次新会话
        db.execute("DELETE FROM user_sessions WHERE user_id = ? AND device = ?", (row[0], device))
        db.execute(
            "INSERT INTO user_sessions(user_id, token, device, created, updated) VALUES(?,?,?,?,?)",
            (row[0], token, device, now, now)
        )
        db.commit()
        _cleanup_expired_sessions()
    except Exception:
        pass
    return {"id": row[0], "username": row[1], "nickname": row[2] or row[1], "avatar": row[3] or row[1][0].upper(),
            "token": token, "role": row[6] or 'user', "status": row[7] or 'active', "device": device}


def get_user_by_token(token: str) -> Optional[dict]:
    if not token:
        return None
    # 1) 无状态签名 token：验签即得身份（不依赖数据库状态）
    info = verify_auth_token(token)
    if info:
        uid, role = info["id"], info["role"]
        # v=20260922k 无状态身份兜底（token 载荷携带用户信息，平台无持久 DB 时降级放行）
        _stateless = {
            "id": uid, "role": role, "status": "active",
            "username": info.get("username") or ("u" + str(uid)),
            "nickname": info.get("nickname") or ("用户" + str(uid)),
            "avatar": info.get("avatar") or (info.get("username") or "?")[0].upper(),
        }
        # 多会话控制：请求 token 必须在该用户有效会话集合内，否则判定被同类型设备挤下线
        try:
            db = get_db()
            row = db.execute("SELECT username, nickname, avatar, status, role FROM users WHERE id = ?", (uid,)).fetchone()
            if not row:
                # DB 无此用户（平台重置/种子库缺失）→ 降级为无状态身份，保证登录可用
                return _stateless
            if row[3] == 'banned':
                # 封禁用户：会话全部失效，拒绝访问
                return None
            sess = db.execute("SELECT token, device FROM user_sessions WHERE user_id = ?", (uid,)).fetchall()
            if token not in {s[0] for s in sess}:
                # 不在有效会话集合 → 判为被撤销/踢下线。仅当该用户会话表整体为空
                # （DB 无持久化、表被重置）时才降级放行——否则改密/登出/踢人无法真正吊销旧 token。
                if sess:
                    return None
                return {"id": uid, "username": row[0], "nickname": row[1] or row[0],
                        "avatar": row[2] or (row[0][0].upper() if row[0] else "?"),
                        "role": role, "status": row[3] or 'active'}
            # 刷新会话活跃时间（配合懒清理超时会话）
            try:
                db.execute("UPDATE user_sessions SET updated = ? WHERE user_id = ? AND token = ?",
                           (datetime.utcnow().isoformat(), uid, token))
                db.commit()
            except Exception:
                pass
            # 角色以数据库最新值为准（管理员升级/降级即时生效，无需重新登录）
            role = row[4] or role
            return {"id": uid, "username": row[0], "nickname": row[1] or row[0],
                    "avatar": row[2] or (row[0][0].upper() if row[0] else "?"),
                    "role": role, "status": row[3] or 'active'}
        except HTTPException:
            raise
        except Exception:
            pass
        return _stateless
    # 2) 兼容旧 hex token：查库
    try:
        db = get_db()
        row = db.execute("SELECT id, username, nickname, avatar, role, status FROM users WHERE token = ?", (token,)).fetchone()
        if not row:
            return None
        return {"id": row[0], "username": row[1], "nickname": row[2] or row[1], "avatar": row[3] or row[1][0].upper(),
                "role": row[4] or 'user', "status": row[5] or 'active'}
    except Exception:
        return None


def _resolve_token(authorization: Optional[str], request) -> str:
    """v=20260904g 身份映射修复：从请求里解析出真实后端 token。
    部署环境网关会把 Authorization 头替换成平台 JWT（eyJ 开头，token 字段为空），
    但自定义头 X-Auth-Token 原样透传。因此：
    1) 优先取 X-Auth-Token（前端携带的真实 la1 token）；
    2) 其次取 Authorization Bearer（本地调试直连场景）。
    绝不把网关 JWT 当作用户 token。"""
    from fastapi import Request as _R
    tok = ""
    if request is not None:
        try:
            xa = request.headers.get("x-auth-token", "")
            if xa:
                tok = xa.strip()
        except Exception:
            pass
    if not tok and authorization and authorization.startswith("Bearer "):
        cand = authorization[7:].strip()
        # 网关注入的平台 JWT 一律不作为用户 token（防止回退到 demo/first user）
        if not cand.startswith("eyJ"):
            tok = cand
    return tok


def require_user(authorization: Optional[str] = Header(None), request: Request = None) -> dict:
    """v=20260904g P0 身份映射修复：统一鉴权入口。
    - 从 X-Auth-Token（优先）或 Authorization Bearer（本地）解析真实 la1 token。
    - 带了 token 但验签失败/过期/被封禁 → 直接抛 401（不再静默降级），
      保证「同一个 token 在所有接口行为一致」。
    - 完全未携带 token → 返回 visitor 身份（id=0），供访客试用场景。
    - 严禁任何「回退到第一个用户/demo」逻辑。
    """
    tok = _resolve_token(authorization, request)
    if tok:
        user = get_user_by_token(tok)
        if user:
            return user
        # 携带了无效/过期/被封禁的 token：统一 401，触发前端全局 401 拦截器 → 登录失效提示
        raise HTTPException(status_code=401, detail="登录已过期或无效，请重新登录")
    return {"id": 0, "username": "visitor"}


def get_current_user(authorization: Optional[str] = Header(None), request: Request = None) -> dict:
    """v=20260904g P0 身份映射修复：强制登录依赖，token 缺失或无效均返回 401。
    从 X-Auth-Token（优先）或 Authorization Bearer（本地）解析真实 la1 token，
    验签 → 按 payload 里的 user id 查库。任何校验失败一律 401，禁止回退到 demo/first user。
    所有「必须登录」的接口统一复用此依赖，禁止各接口自行解析 token。"""
    tok = _resolve_token(authorization, request)
    if not tok:
        raise HTTPException(status_code=401, detail="请先登录")
    user = get_user_by_token(tok)
    if not user:
        raise HTTPException(status_code=401, detail="登录已过期或无效，请重新登录")
    return user


def _get_user_id_from_auth(authorization: Optional[str]) -> Optional[int]:
    """从 Authorization header 提取用户 ID（用于 token 消耗追踪等场景）。"""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        user = get_user_by_token(token)
        if user:
            return user["id"]
    return None


# ---------- RAG 知识库检索器 ----------
RAG_ENABLED = os.environ.get("RAG_ENABLED", "true").lower() in ("1", "true", "yes", "on")
RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "4"))

_retriever = None
try:
    from .retrieval import Retriever
    _retriever = Retriever()
except Exception as e:
    print(f"[RAG] 检索器加载失败，已禁用 RAG：{e}")
    _retriever = None

RAG_AVAILABLE = bool(_retriever and _retriever.available)


def retrieve(query: str, top_k: int = RAG_TOP_K):
    if not (RAG_ENABLED and RAG_AVAILABLE):
        return []
    return _retriever.search(query, top_k=top_k)


def build_rag_context(hits: list) -> str:
    if not hits:
        return ""
    lines = ["以下是权威知识库检索到的相关内容，请仅作参考：", ""]
    for i, h in enumerate(hits, 1):
        lines.append(f"[{i}] {_clean_source_title(h)}")
        lines.append(h.get("content", "") or h.get("snippet", ""))
        lines.append("")
    return "\n".join(lines)


# v=20260904 来源标题治理:内部代号(自进化生成 v28 等)不可读,改用 section/知识点/摘要首句;
# 无法得到可读标题的条目直接丢弃。
_INTERNAL_SRC_RE = re.compile(r'(自进化生成|自进化|生成)\s*v?\d+', re.I)
_RAG_SCORE_MIN = float(os.environ.get("RAG_SCORE_MIN", "0.35"))  # top1 归一化分数阈值,低于则不注入


def _clean_source_title(h: dict) -> str:
    """返回该条目的可读标题:优先 section,其次 source(若非内部代号),否则摘要首句;
    都无法得到可读标题时返回空串(调用方据此丢弃该条目)。"""
    section = (h.get("section") or "").strip()
    if section:
        return section
    src = (h.get("source") or "").strip()
    if src and not _INTERNAL_SRC_RE.search(src):
        return src
    snippet = (h.get("snippet") or h.get("content") or "").strip()
    if snippet:
        first = re.split(r'[\n。；;]', snippet)[0].strip()
        if first:
            return first[:40]
    return ""


def _filter_rag_hits(hits: list) -> list:
    """v=20260904 RAG 门控:① top1 归一化分数低于阈值 → 全部丢弃(宁缺毋滥);
    ② 标题治理:无读标题的条目丢弃,并把 source 字段统一改为可读标题。"""
    if not hits:
        return []
    if hits[0].get("score", 0.0) < _RAG_SCORE_MIN:
        return []
    out = []
    for h in hits:
        title = _clean_source_title(h)
        if not title:
            continue  # 无读标题的条目直接丢弃
        h2 = dict(h)
        h2["source"] = title  # 来源卡片标题统一用可读标题
        out.append(h2)
    return out


def _is_linalg_or_allow_rag(query: str) -> bool:
    """v=20260904 RAG 检索前置门控:复用领域守门,非线代问题(闲聊/天气/电影/编程等)不检索。"""
    related, _why = _is_linalg_question(query or "")
    return related


def _is_calculation_intent(query: str) -> bool:
    """v=20260904 意图分流:计算/求解类问题(求逆、解方程组、算行列式/特征值等,
    走可验证引擎的)默认不检索、不挂教材引用。命中 _MATH_TASK_KEYWORDS 且含矩阵/数值/变量
    信号即为计算类。概念/原理/解释类(什么是特征值、几何意义、为什么可逆)返回 False 才检索。"""
    q = (query or "").strip()
    if not q:
        return False
    ql = q.lower()
    # 1) 命中计算任务关键词
    task_hit = None
    for t, kws in _MATH_TASK_KEYWORDS.items():
        if any(kw in ql for kw in kws):
            task_hit = t
            break
    if not task_hit:
        return False
    # 2) 需有具体计算对象信号:含矩阵字面量 [[..]]、[..;..]、或数字/变量、或"求/计算/等于"等动词
    has_matrix = bool(re.search(r'\[\[[\s\S]*?\]\]|\[[\d\s.,;+\-\[\]]+\]', q))
    has_numbers = bool(re.search(r'\d', q))
    has_action = any(w in q for w in ('求', '计算', '算', '解', '等于', '=?', '=?', '等于多少', '是多少'))
    # 概念解释类(什么是/为什么/几何意义)不算计算,即便含任务词
    if re.search(r'什么是|什么是|为什么|几何意义|含义|概念|定义|区别|是不是|可不可以', q):
        return False
    return has_matrix or (has_numbers and has_action)


# ---------- 动态 Few-shot（类微调的 in-context 效果）----------
# 启动时加载训练集（training_data.json，专家标注的 QA），构建一个轻量 BM25
# 索引；每次提问时按语义相似度检索 top-k 个最相似的例题，作为 few-shot 示例
# 拼入 system prompt。这相当于把“微调数据集”在推理时动态注入，使模型在不重
# 新训练权重的前提下，模仿专家标注的作答风格与步骤，提升领域贴合度。
_FEWSHOT_AVAILABLE = False
_FEWSHOT_EXAMPLES = []
_FEWSHOT_TOK = []
_FEWSHOT_IDF = {}
_FEWSHOT_AVGDL = 0.0
_FEWSHOT_N = 0

try:
    from .retrieval import tokenize as _tok
    _td_path = os.path.join(DATA_DIR, "training_data.json")
    if os.path.exists(_td_path):
        with open(_td_path, "r", encoding="utf-8") as _f:
            _td = json.load(_f)
        for _e in _td:
            _q = (_e.get("question") or "").strip()
            _a = (_e.get("answer") or "").strip()
            if _q and _a:
                _FEWSHOT_EXAMPLES.append({
                    "question": _q, "answer": _a,
                    "chapter": _e.get("chapter", ""), "section": _e.get("section", ""),
                    "difficulty": _e.get("difficulty", ""),
                    "common_mistakes": _e.get("common_mistakes", []),
                })
                _FEWSHOT_TOK.append(_tok(_q))
        _FEWSHOT_N = len(_FEWSHOT_TOK)
        if _FEWSHOT_N:
            _FEWSHOT_AVGDL = sum(len(t) for t in _FEWSHOT_TOK) / _FEWSHOT_N
            _df = {}
            for tks in _FEWSHOT_TOK:
                for w in set(tks):
                    _df[w] = _df.get(w, 0) + 1
            _FEWSHOT_IDF = {w: math.log((_FEWSHOT_N - c + 0.5) / (c + 0.5) + 1) for w, c in _df.items()}
            _FEWSHOT_AVAILABLE = True
except Exception as _e:
    print(f"[FewShot] 动态示例索引加载失败，已跳过：{_e}")


def retrieve_fewshot(query: str, top_k: int = 2):
    """按 BM25 检索与 query 最相似的训练例题。"""
    if not _FEWSHOT_AVAILABLE:
        return []
    q_tokens = _tok(query)
    if not q_tokens:
        return []
    scored = []
    for i, tks in enumerate(_FEWSHOT_TOK):
        dl = len(tks)
        if dl == 0:
            continue
        freq = {}
        for w in tks:
            freq[w] = freq.get(w, 0) + 1
        score = 0.0
        for term in set(q_tokens):
            f = freq.get(term, 0)
            if f == 0:
                continue
            idf = _FEWSHOT_IDF.get(term, math.log(_FEWSHOT_N + 1))
            score += idf * (f * 1.2 / (f + 1.2 * (1 - 0.3 + 0.3 * dl / _FEWSHOT_AVGDL)))
        if score > 0:
            scored.append((i, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [_FEWSHOT_EXAMPLES[i] for i, _ in scored[:top_k]]


def build_fewshot_context(hits: list) -> str:
    """把检索到的相似例题格式化为 system 提示中的 few-shot 区块。"""
    if not hits:
        return ""
    lines = ["【相似例题参考（来自专家微调数据集，请模仿其作答结构与风格）】", ""]
    for i, h in enumerate(hits, 1):
        lines.append(f"例题{i}（{h['difficulty']}·{h['chapter']}·{h['section']}）")
        lines.append(f"问：{h['question']}")
        lines.append(f"答：{h['answer']}")
        if h.get("common_mistakes"):
            lines.append(f"易错点：{'；'.join(h['common_mistakes'])}")
        lines.append("")
    return "\n".join(lines)


# ---------- 大模型客户端 ----------
# v=20260824l 守门友好回复:按问题类别给不同的"灵活"回应(不要千篇一律的机械拒绝)
_OFFTOPIC_REPLIES = {
    'game': "🎮 游戏我玩得不多哦~ 不过我有个小发现:**线性代数在游戏里用处可大了** —— 3D 角色骨骼动画、相机矩阵变换、光照计算都离不开它。\n\n想不想从线代角度了解一下游戏里的数学?或者直接来道矩阵/特征值题练练手?",
    'sport': "🏀 体育赛事我不是专家,但**体育数据科学**可是线性代数的大舞台 —— 球员追踪、战术分析、伤病预测都用到矩阵分解和 PCA。\n\n要不要从线代视角聊聊体育,或者我们直接做道矩阵题?",
    'finance': "📈 股票基金这些我不太懂~ 不过**金融工程里线性代数是核心工具**:投资组合优化(特征值/特征向量)、风险模型(协方差矩阵分解)、量化因子(PCA 降维)都用得着。\n\n要不要从线代角度聊聊这些应用,或者做道题?",
    'travel': "✈️ 旅行攻略我帮不上忙哈~ 不过**路径规划、地图导航、最优调度**这些都是线性代数的应用场景(图论+矩阵)。\n\n想了解这些背后的数学原理,或者直接来道矩阵题?",
    'food': "🍜 美食推荐我不行,不过**推荐系统**的核心算法(矩阵分解/奇异值分解 SVD)和你的口味偏好很相关哦~ 想知道数学怎么「算」出你爱吃的菜吗?",
    'study': "📚 考试/学习方法我可能比不上市面上的课程老师~ 但**线性代数学科本身**(同济版教材)的考点、学习路径、解题套路,我可以给你专业讲解。\n\n要不要直接来道题,或者听我讲讲考试重点?",
    'life': "😊 日常生活问题我不太擅长~ 不过**线代在生活中也很有趣**:拍照构图(仿射变换)、调色(向量空间)、音频编辑(傅里叶+矩阵)……\n\n要不要从这些角度切入线代,或者直接做道题?",
    'health': "🏥 健康医疗问题请咨询专业医生哦,AI 助教不能替代医疗建议。\n\n不过**线性代数在医学影像(CT/MRI 重建)、基因数据(PCA/聚类)、药物分子建模**里都是核心工具,感兴趣可以聊聊这些应用~",
    'general': "这超出了线性代数的范围。不过如果你的问题里涉及矩阵、方程组之类的数学对象，可以发给我一起看看。",
}

# v=20260824l 关键词到回复类别的映射(按问题领域给出不同回应)
_OFFTOPIC_CATEGORIES = {
    'game': ('王者','原神','英雄联盟','LOL','吃鸡','CS','游戏','电竞','Dota','Steam','Switch','PS5','Xbox'),
    'sport': ('NBA','足球','篮球','世界杯','奥运','欧冠','C罗','梅西','詹姆斯','CBA','中超','体育'),
    'finance': ('股票','基金','比特币','区块链','理财','投资','外汇','期货','A股','港股','美股'),
    'travel': ('旅游','酒店','机票','攻略','景点','度假','签证','护照'),
    'food': ('外卖','美食','菜谱','餐厅','饭店','小吃','奶茶'),
    'study': ('考公','公务员','考研','高考','雅思','托福','GRE','留学','移民'),
    'life': ('相亲','恋爱','工资','房价','购物','淘宝','京东','拼多多','化妆','减肥','健身','宠物'),
    'health': ('新冠','疫情','健康','医院','医生','药品','症状'),
}


def _pick_offtopic_reply(q: str, hint_keyword: str) -> str:
    """v=20260904 超纲统一一句自然回复:不做自我介绍、不列能力清单、不堆 emoji。"""
    return _OFFTOPIC_REPLIES['general']


# v=20260908d 能力自介绍(结构化、克制):询问"你会什么/你是谁"时返回
_CAPABILITY_REPLY = (
    "我是**线性代数 AI 助教**,专注帮你把线性代数学懂、学透。我能做这些:\n\n"
    "① **知识点讲解** —— 覆盖同济版《线性代数》6 章 48 个知识点,讲解可溯源教材;\n"
    "② **分步解题** —— SymPy + NumPy 双引擎自动验算,关键步骤展示依据;\n"
    "③ **拍照识题** —— 手写/印刷题拍照即可直接求解;\n"
    "④ **出题练习** —— 142 题题库,答错自动进错题本;\n"
    "⑤ **学习管理** —— 错题消灭、间隔复习、掌握度画像。\n\n"
    "你可以通过上方「教学模式」切换讲解风格(直接解答 / 分步讲解 / 引导学习)。\n"
    "试试问我:**「求矩阵 A=[[2,1],[1,3]] 的特征值和特征向量」**?"
)


# v=20260908d 友好问候:一句欢迎 + 提示可直接发题/概念
def _pick_greeting_reply(q: str) -> str:
    return "你好!我是线性代数 AI 助教 👋\n\n直接发一道线性代数题目(矩阵/行列式/特征值/方程组等),或问一个概念(比如「什么是特征值」),我这就帮你解答。"



# v=20260824 领域守门:判断问题是否属于线性代数(防止"问广联达/美食/股票"等无关问题消耗 LLM token)
_LINALG_KEYWORDS = (
    # 核心术语
    '线性代数','矩阵','行列式','特征值','特征向量','向量','线性方程组','线性变换','线性空间','子空间',
    '矩阵乘法','逆矩阵','转置','伴随','秩','初等变换','高斯消元','约旦','方阵','对称矩阵',
    '正交','正交化','施密特','QR','LU','SVD','特征分解','对角化','相似','合同','二次型',
    '标准形','正定','负定','半正定','维数','基底','坐标','线性组合','线性表示','线性相关','线性无关',
    '过渡矩阵','基变换','零空间','核空间','值域','行空间','列空间','最小二乘',
    'Gram','矩阵','A+','广义逆','投影','投影矩阵','几何','空间','向量积','内积','外积','叉积','点积',
    '范数','模','长度','夹角','距离','单位向量','正交矩阵','酉矩阵','对称','反对称','正交补','核定理',
    # 常见题目关键词
    'A=','det','A^-1','A^T','rank','eigen','matrix','linear','solve','inverse','transpose',
    'trace','tr','linear algebra','eigenvalue','eigenvector',
    # 英文/字符变体
    'AX=','Ax=b','Ax=λx','Ax=λ','AX=0','AB=BA','|A|','A^T','a_ij','a_{ij}','x_1','λ','μ','α','β',
    '解方程组','求逆','求行列式','求特征值','求特征向量','证明','化简','等价','满秩','奇异',
    '矩阵的','向量的','方程','非齐次','齐次','通解','基础解系','实对称','A^T A','AA^T','A^{-1}',
)
# 闲聊/无关关键词(出现这些且无 linalg 关键词 → 判定为不相关)
_OFFTOPIC_HINTS = (
    '广联达','计价','造价','造价员','股票','基金','比特币','区块链','NBA','足球','篮球','游戏','恋爱',
    '外卖','美食','旅游','酒店','机票','天气','新闻','八卦','娱乐','明星','电影','电视剧','购物','淘宝',
    '京东','拼多多','房价','工资','相亲','考公','公务员','考研','高考','雅思','托福','GRE','留学',
    '移民','签证','新冠','疫情','健康','减肥','健身','化妆','宠物','猫','狗','微博','小红书','抖音','快手',
    '音乐','歌曲','周杰伦','Taylor','抖音','吃鸡','王者','原神','王者荣耀','英雄联盟','CS',
    # v=20260904 编程/代码/工具类(非线代),避免"Python/爬虫"等硬凑 RAG
    'python','java','javascript','typescript','c++','c语言','go语言','rust','php','爬虫','写代码','写程序',
    '编程','程序员','代码','脚本','算法题','leetcode','前端','后端','数据库','sql','接口','api',
    'excel','word','ppt','office','软件','安装','配置','bug','报错','调试','部署','服务器','linux','windows',
)

# v=20260908d 能力/元问题模式:询问助手能做什么、怎么用、自我介绍等,合理问题不再被误拒
_CAPABILITY_PATTERNS = (
    '你会什么','你会啥','你能做什么','你能干什么','你会哪些','你能帮什么','你能帮我做什么',
    '你都会什么','有什么功能','你能教什么','怎么用你','如何使用你','介绍你自己','自我介绍',
    '你是谁','功能介绍','你能干嘛','你能帮我干嘛','你会什么技能','你的功能','你能做啥',
    '你会啥子','你能帮我','你都会啥','你会点儿什么','你会点什么','能做什么','能干什么',
)
# v=20260908d 显式问候白名单(≤10 字,匹配则返回友好问候,不再一刀切拒短输入)
_GREETING_PATTERNS = (
    '你好','您好','在吗','hi','hello','嗨','哈喽','早上好','下午好','晚上好',
    '你好呀','你好啊','您好呀','在不在','你好吗',
)


def _is_linalg_question(q: str) -> tuple:
    """v=20260824 智能问答领域守门。返回 (is_related: bool, reason: str)。
    规则(顺序敏感,v=20260904/v=20260908d 调整):
    ① 含线性代数关键词 → 相关(优先判断,避免"用 Python 求特征值"这类混合问题被误杀)
    ② 含明显无关关键词(聊天/天气/电影/编程等) → 不相关
    ②.5 能力/元问题(你会什么/你是谁/怎么用你等) → capability(合理,须自介绍)
    ③ 显式问候白名单 → greeting(友好问候) ④ 含数学符号 → 相关 ⑤ 其余放行让 LLM 判断"""
    if not q or not q.strip():
        return False, "empty"
    txt = q.strip().lower()
    # 1) 强线性代数信号 → 相关(放在最前,线代+其它词的混合问题仍应判相关)
    for k in _LINALG_KEYWORDS:
        if k in txt or k.lower() in txt:
            return True, f"hit:{k}"
    # 2) 闲聊/无关关键词 → 不相关(仅在无线代关键词时才判)
    for k in _OFFTOPIC_HINTS:
        if k in txt:
            return False, f"offtopic:{k}"
    # 2.5) _OFFTOPIC_CATEGORIES 的类别关键词也作为守门依据
    for cat_kws in _OFFTOPIC_CATEGORIES.values():
        for k in cat_kws:
            if k in txt or k.lower() in txt:
                return False, f"offtopic:{k}"
    # 2.6) v=20260908d 能力/元问题(询问助手能做什么)——在③短输入规则之前判断,避免"你会什么"被误拒
    for k in _CAPABILITY_PATTERNS:
        if k in txt:
            return False, "capability"
    # 3) v=20260908d 显式问候白名单(≤10 字)→ greeting;其余短输入不再一刀切拒绝
    if len(txt) <= 10:
        for g in _GREETING_PATTERNS:
            if txt == g or txt.startswith(g) or txt.endswith(g):
                return False, "greeting"
    # 4) 包含数字/变量符号(如 [1,2;3,4]、A^T、x1 等) → 疑似数学题
    if any(s in q for s in ('[',';','$','=','∑','∫','λ','μ','A^T','x_','a_','det','tr')):
        return True, "math_symbols"
    return True, "fallthrough"  # 放行,由 LLM system prompt 兜底


def get_client():
    api_key = os.environ.get("LLM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="未配置 LLM_API_KEY")
    from openai import OpenAI
    base_url = os.environ.get("LLM_BASE_URL") or None
    return OpenAI(api_key=api_key, base_url=base_url)


# ---------- System Prompt（优化版 v3 — 强化教学效果）----------
# 注意：必须用 raw string（r"""），否则 \begin 的 \b 会被解释为退格符破坏提示词
SYSTEM_PROMPT = r"""你是一名擅长线性代数教学的智能助教。

【基本行为】
1. 优先解决问题：用户问什么就答什么，直接进入解题或讲解；不自我介绍、不复述题目、不堆砌"作为AI"之类的套话。
2. 计算必须认真检查并展示关键步骤：每一步写明依据，给出结果后做快速验算（例如特征值之和等于迹、之积等于行列式；求逆后可验证 A·A⁻¹=I）。
3. LaTeX 排版清晰：行内公式用 $...$，独立公式用 $$...$$ 居中；矩阵用 \begin{pmatrix}...\end{pmatrix} 或 \begin{bmatrix}...\end{bmatrix}，行列式用 \begin{vmatrix}...\end{vmatrix}；列用 & 分隔、行用 \\ 换行，长推导用 align 等号对齐；绝对禁止裸 LaTeX 命令（如 \lambda 不包在 $ 内）。
4. 不无意义重复题目；不写"好的""当然可以""希望对你有帮助"这类口头禅；不每次都用同一套固定模板。按题目难度自动决定长度——简单题三五句收尾，复杂题再分点结构化展开。
5. 线性代数相关问题一律正常回答，不得出现"这个问题不在我的专长范围"式拒答。覆盖范围包括：矩阵、行列式、逆矩阵、特征值、特征向量、线性方程组、向量、线性相关、线性无关、秩、线性空间、基与维数、线性变换、二次型。
6. 只有确实明显超出线性代数范围的问题，才用一句话简短说明，不要展开大段能力介绍。

【快捷追问 · 末尾必须输出】
给完所有解答后另起一行输出：
【快捷追问】
1. 第一条延伸问题
2. 第二条延伸问题
（3 条时再加第 3 条）
要求：基于本次回答内容生成 2~3 条针对性追问，与本题主旨自然衔接（例如讲完逆矩阵→追问"如果 |A|=0 会怎样""逆矩阵什么时候不存在"；讲完特征值→追问"如何判定可对角化"）；凑不满 3 条就 2 条，不要硬凑；严禁重复原题或插入解题正文；纯闲聊可省略。
⚠️ 每条追问必须独立可读、自包含：只以"本次问题和本次回答"为依据，不得出现"刚才/上一题/刚才算出的/上面那个"等指代上文的说法（每条追问是独立的一条消息，用户看不到上下文，指代会让人看不懂）。
"""

# 流式/低延迟路径使用的精简版系统提示：保留人设、格式与引用规则，砍掉冗长例题与清单，
# 显著降低 prefill 长度，从而把"首字延迟"从 ~13s 压到 ~6s（模型 prefill 与提示长度近似线性）。
SYSTEM_PROMPT_LITE = r"""你是一名擅长线性代数教学的智能助教。

规则：
1. 用户问什么答什么，直接进入解题；不自我介绍、不复述题目、不写"好的/当然可以/希望对你有帮助"等口头禅、不用同一套固定模板。
2. 计算必须展示关键步骤并检查；按题目难度自动决定长度（简单题简洁，复杂题结构化展开）。
3. LaTeX 清晰：行内 $...$，独立 $$...$$；矩阵用 \begin{pmatrix}...\end{pmatrix} 或 \begin{bmatrix}...\end{bmatrix}，行列式用 \begin{vmatrix}...\end{vmatrix}；列用 & 分隔、行用 \\ 换行；禁止裸 LaTeX 命令。
4. 线性代数问题（矩阵/行列式/逆矩阵/特征值/特征向量/线性方程组/向量/线性相关/线性无关/秩/线性空间/基与维数/线性变换/二次型）一律正常回答，不得拒答；明显超纲才一句话说明。
5. 答完后另起一行输出【快捷追问】+ 2~3 条基于本次回答内容、与本题主旨衔接的追问（凑不满就 2 条，不硬凑；纯闲聊可省略）。每条追问必须独立可读、自包含，只以本次问题和回答为依据，不得出现"刚才/上一题/刚才算出的"等指代上文的说法。
"""


def _extract_followups(answer: str) -> tuple:
    """v=20260903h 快捷追问:在最终回答文本末尾剥离【快捷追问】标记块,提取出 0-3 条追问。
    返回 (剥离了【快捷追问】块的正文体, 追问列表[str,str,str])。
    - 没找到标记 → 返回 (原文本, [])
    - 找到标记但解析不出 3 条 → 返回 (剥离后正文本, 解析出的所有追问),前端会忽略不完整的。
    - 兼容多种编号:1./①/-/*/•/▪ ,以及纯文本行。
    """
    if not answer:
        return answer, []
    # v=20260903h 标记使用全角方括号(中文),避免误伤 Markdown 链接
    marker = "【快捷追问】"
    idx = answer.find(marker)
    if idx < 0:
        return answer, []
    body = answer[:idx].rstrip()
    block = answer[idx + len(marker):].strip()
    if not block:
        return body, []
    import re as _re
    questions = []
    for line in block.splitlines():
        s = line.strip()
        if not s:
            continue
        # 去掉常见编号/列表符(支持 1./ ①/ - / * / • / ▪)
        s2 = _re.sub(r"^(?:\d{1,2}[\.\)、]|[①②③④⑤]|[-*•▪])\s*", "", s)
        s2 = s2.strip()
        if s2 and len(s2) >= 3:
            questions.append(s2)
        if len(questions) >= 3:
            break
    return body, questions[:3]


def _heuristic_followups(question: str, answer: str) -> list:
    """v=20260903k 启发式追问兜底:模型若漏输出【快捷追问】标记,根据用户问题+回答的关键词
    给出固定模板追问,保证前端一定能渲染出快捷追问按钮。
    返回 0-3 条字符串列表(可能为空 → 前端不渲染)。"""
    if not question and not answer:
        return []
    text = f"{question or ''}\n{answer or ''}"
    text_l = text

    # 主题词 → 3 条追问模板(中文)
    catalog = [
        # 顺序敏感:更具体的关键词放前面,匹配优先
        (["三对角", "tridiagonal"], [
            "这道题能不能推广到 n 阶,写出递推通项?",
            "如果把对角线或斜线的元素换成参数,怎么讨论?",
            "三对角行列式和线性方程组三对角求解有什么关系?"
        ]),
        (["特征值", "特征向量", "eigenvalue"], [
            "特征值在几何上对应什么含义(伸缩/旋转/投影)?",
            "怎么快速判定一个矩阵是否可对角化?",
            "实对称矩阵的特征向量为什么一定正交?"
        ]),
        (["对角化", "对角矩阵", "P^{-1}AP"], [
            "如果矩阵不能对角化(比如 Jordan 块),该怎么处理?",
            "对角化后 A^k 怎么利用对角矩阵快速计算?",
            "可对角化和 n 个线性无关的特征向量之间有什么关系?"
        ]),
        (["行列式", "determinant", "|A|", "\\\\det"], [
            "行列式的几何意义是什么(平行多面体体积)?",
            "如果 |A|=0,Ax=0 有非零解,它和矩阵的列向量有什么关系?",
            "|kA| 与 |A| 之间是什么关系(n 阶矩阵)?"
        ]),
        (["伴随矩阵", "A\\\\*", "A^{*}", "adj"], [
            "伴随矩阵和逆矩阵 A^{-1} 之间有什么关系?",
            "为什么 R(A)=n 时 R(A^*)=n,而 R(A)=n-1 时反而是 1?",
            "求伴随矩阵的常用方法有哪几种,各适用于什么情形?"
        ]),
        (["逆矩阵", "求逆", "A^{-1}", "可逆"], [
            "一个矩阵满足什么条件才可逆?",
            "求逆矩阵的常用方法有哪些(伴随/初等行变换/分块)?",
            "如果 A 不可逆,Ax=b 还能解吗?"
        ]),
        (["矩阵", "matrix"], [
            "矩阵乘法为什么不满足交换律,但为什么有结合律?",
            "矩阵的秩在几何上代表什么(列空间的维数)?",
            "常用的特殊矩阵(对称/反对称/正交/正定)各有什么性质?"
        ]),
        (["向量组", "线性相关", "线性无关", "极大线性无关"], [
            "线性相关/无关的几何意义是什么?",
            "怎么快速求一个向量组的极大线性无关组?",
            "向量组的秩和它生成的子空间维数有什么关系?"
        ]),
        (["线性方程组", "Ax=b", "增广矩阵"], [
            "怎么判断 Ax=b 是否有解、有唯一解、有无穷多解?",
            "齐次方程组和非齐次方程组的解结构有什么不同?",
            "自由未知量怎么选,通解怎么写?"
        ]),
        (["齐次", "Ax=0", "基础解系"], [
            "基础解系和通解之间有什么关系?",
            "怎么求 Ax=0 的基础解系?",
            "如果两个齐次方程组的基础解系能互相线性表示,这两个方程组等价吗?"
        ]),
        (["非齐次", "Ax=b"], [
            "Ax=b 的通解 = 特解 + 齐次通解 这条结构定理怎么用?",
            "如何快速求 Ax=b 的一个特解?",
            "Ax=b 无解的几何意义是什么?"
        ]),
        (["二次型", "标准形", "规范形"], [
            "正交变换化标准形和配方法化标准形各有什么优劣?",
            "怎么快速判定二次型是否正定?",
            "正定矩阵的常用判定方法(Hessian/顺序主子式/特征值)各有什么适用场景?"
        ]),
        (["正定", "正交矩阵", "合同", "相似"], [
            "矩阵相似和矩阵合同有什么区别?",
            "正交矩阵的列向量为什么必须两两正交且单位长度?",
            "实对称矩阵为什么一定能正交相似对角化?"
        ]),
        (["初等变换", "行变换", "初等行"], [
            "初等行变换为什么不改变 Ax=b 的解集?",
            "化行最简形后怎么读出极大无关组和表示系数?",
            "初等矩阵和初等变换之间有什么关系?"
        ]),
        (["向量空间", "基", "维数"], [
            "基和极大线性无关组之间有什么关系?",
            "维数和坐标之间是怎么对应的?",
            "如果两个向量空间同构,它们的基的元素个数一定相等吗?"
        ]),
        (["秩", "rank", "R(A)"], [
            "怎么快速求矩阵的秩(行阶梯化)?",
            "矩阵的秩、列向量组的秩、方程组未知量个数三者有什么关系?",
            "如果把矩阵转置,秩会变吗?"
        ]),
    ]

    import re as _re
    import random as _random

    # v=20260904 优先用"用户问题"命中主题,而不是 answer——answer 里常含 det/|A|/逆 等派生词,
    # 会把不同题都导向同一组(如逆矩阵、行列式都命中"行列式"组),造成千篇一律。
    q_text = question or ""
    a_text = answer or ""

    # 第一优先:问题文本命中的主题(按 catalog 顺序,更具体在前)
    q_matches = []
    for kws, qs in catalog:
        for kw in kws:
            if kw in q_text:
                q_matches.append(qs)
                break
    # 第二优先:回答文本命中的主题(问题没命中时才看回答)
    a_matches = []
    if not q_matches:
        for kws, qs in catalog:
            for kw in kws:
                if kw in a_text:
                    a_matches.append(qs)
                    break

    matches = q_matches or a_matches
    if not matches:
        # 完全没匹配任何主题:给通用追问,随机取 2 条(不硬凑满 3)
        _generic = [
            "能举一个具体的例题再演练一下吗?",
            "有没有什么易错点要提醒我注意?",
            "这个结论能不能推广或变形?"
        ]
        _random.shuffle(_generic)
        return _generic[:2]

    # v=20260904 分主题池随机化:命中主题后从该主题池随机抽 2 条,避免每次固定同组;
    # 命中多个主题时优先主主题(第一组),不足再从后续主题池补,且去重。
    primary = matches[0]
    pool = [q.strip() for q in primary]
    _random.shuffle(pool)
    n = min(2, len(pool))  # 固定 2 条
    out, seen = [], set()
    for q in pool:
        if q not in seen:
            seen.add(q)
            out.append(q)
        if len(out) >= n:
            break
    # 不足再从未命中的其它主题池补(最多到 2)
    if len(out) < 2:
        for qs in matches[1:]:
            for q in qs:
                q2 = q.strip()
                if q2 not in seen:
                    seen.add(q2)
                    out.append(q2)
                if len(out) >= 2:
                    break
            if len(out) >= 2:
                break
    return out[:2]



def _followups_with_fallback(question: str, answer: str, mode: str = "direct", conversation: list = None) -> tuple:
    """v=20260904 统一追问解析:优先用模型输出的【快捷追问】块,缺失则用启发式兜底。
    - mode 用于区分引导学习模式:引导中间轮(AI 刚抛引导问题、以问句结尾)不生成追问,
      避免和 AI 自己的引导提问打架;
    - conversation 为多轮历史,启发式兜底时结合历史判断对话进展,生成贴合本轮的追问。
    v=20260903p 追问去重:无论模型生成还是启发式兜底,都过滤掉与"用户已问过的问题(含当前问题)"
    相同或近似重复的追问,宁缺毋滥。
    返回 (剥离了【快捷追问】块的正文体, 追问列表)。"""
    body, qs = _extract_followups(answer)
    # v=20260904 guided 模式:若 AI 本轮以问句结尾(正在抛引导问题),不展示追问按钮
    if mode == "guided" and _answer_asks_question(body):
        return body, []
    if not qs:
        qs = _heuristic_followups(question, answer)
    # v=20260904 追问须自包含且贴合本轮:过滤掉含指代上文的追问
    qs = [q for q in qs if not _has_anaphora(q)]
    # v=20260903p 追问去重:剔除与已问问题(含当前问题)相同/近似的追问
    asked = _collect_asked_questions(conversation)
    if question and str(question).strip():
        asked.append(str(question).strip())
    qs = _dedup_followups(qs, asked)
    return body, qs


def _answer_asks_question(answer: str) -> bool:
    """判断 AI 本轮回答是否仍在引导中(用于 guided 中间轮判定:中间态不生成追问按钮)。
    - 以问句结尾;
    - 或含明显引导句式(让学生继续动手/给下一步提示),即便不是问号结尾也算引导中间态。"""
    a = (answer or "").strip()
    if not a:
        return False
    # 以问号结尾
    if a.endswith(("？", "?", "吗", "呢")):
        return True
    # v=20260904 陈述式引导:含"先/接下来/下一步/再/试试/你来/想一想/你知道/得知道/你能/写出/代入/算一下"等
    tail = a[-60:]
    if re.search(r'你先|你先来|试试看|想一想|你知道|记得.*吗|你能|你来|接下来|下一步|先别|先算|再算|再代入|写出|算一下|得知道|需要知道', tail):
        return True
    return False


def _has_anaphora(q: str) -> bool:
    """判断追问是否含指代上文的说法(刚才/上一题/上面/此前的那个等)。"""
    for w in ("刚才", "上一题", "上面那个", "上面", "此前", "前面的", "那个", "这道题里算出的", "之前算的"):
        if w in (q or ""):
            return True
    return False


def _normalize_q(text: str) -> str:
    """v=20260903p 追问去重：去掉空白与常见中英文标点，统一大小写，得到用于比对的规范串。
    （仅保留字母/数字/中文，去掉空格、?？!！.。，,、()（）[]【】:：;；"'“”等）"""
    if not text:
        return ""
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "", str(text), flags=re.UNICODE)
    return s.lower()


def _q_similar(a: str, b: str) -> bool:
    """v=20260903p 判定两条问题是否"相同或仅换措辞的近似重复"：
    1) 规范化后完全相等 → 重复；
    2) 较短一方整体是较长一方的前缀（且公共前缀 ≥4 字）→ 重复（覆盖"|kA| 与 |A|"这类短主体在多轮里被反复追问）；
    3) 规范化后公共前缀 ≥12 字 → 近似重复（覆盖"行列式的几何意义是什么(平行多面体体积)"的改写）。"""
    na, nb = _normalize_q(a), _normalize_q(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # 公共前缀长度
    i = 0
    while i < len(na) and i < len(nb) and na[i] == nb[i]:
        i += 1
    # 短串整体是长串前缀(≥4字)
    if i >= 4 and i == min(len(na), len(nb)):
        return True
    # 前 12 字相同
    if i >= 12:
        return True
    return False


def _dedup_followups(followups: list, asked_questions: list) -> list:
    """v=20260903p 追问去重：剔除与"会话里用户已问过的问题（含当前问题）"相同或近似重复的追问。
    宁缺毋滥——过滤后不足就不补，绝不拿重复问题凑数。"""
    asked = [q for q in (asked_questions or []) if q and str(q).strip()]
    if not asked:
        return followups
    out = []
    for fq in followups:
        if not fq or not str(fq).strip():
            continue
        dup = any(_q_similar(fq, q) for q in asked)
        if not dup:
            out.append(fq)
    return out


def _collect_asked_questions(conversation: list) -> list:
    """v=20260903p 从会话历史里抽出所有用户已问过的问题（按时间顺序），供追问去重使用。"""
    if not conversation:
        return []
    return [m.get("content", "") for m in conversation if m.get("role") == "user" and m.get("content")]


MODE_HINTS = {
    "direct": (
        "【教学模式：直接解答】\n"
        "直接进入解题，给出核心结论、关键步骤与最终答案。简单题三五句内收尾，复杂题才结构化展开。\n"
        "结构按题目自然变化，不要每次都用同一套固定栏目；不要固定追加\"易错提醒\"这类结尾栏目（确有典型易错点才顺带一句）。不自我介绍、不重复题目。"
    ),
    "detailed": (
        "【教学模式：分步讲解】\n"
        "把解题过程按\"判断类型 → 选方法(说明为什么) → 代入计算 → 结果\"的顺序讲清楚，每步说明为什么这样做、不堆废话。\n"
        "但结构要随题目自然变化，不要生硬套固定小标题；仅在确有典型易错点时才提醒一句，没有就不硬加。"
    ),
    "guided": (
        "【教学模式：引导学习 / 苏格拉底启发式 · 强制规则】\n"
        "⚠️ 本轮是引导学习的第一轮，你必须先提出一个引导问题，绝对不能直接给出完整解题过程。\n"
        "第一轮硬性要求（违反任一条都视为错误回答）：\n"
        "  1) 必须先抛一个引导/检查性问题引导学生自己动手（例如“二阶矩阵可逆的条件是什么？你先判断一下这个矩阵可不可逆”“这个矩阵行列式是多少？不为 0 才可逆，你先算算看？”），\n"
        "  2) 只给思路方向、提示和“下一步该做什么”，不展示任何代入计算、不写推导步骤；\n"
        "  3) 禁止给出最终逆矩阵、禁止出现 \\boxed{…} 或“最终答案是…/所以 A⁻¹=…”这类完整结论；\n"
        "  4) 以提问收尾，等待学生回复，不要替学生把题做完。\n"
        "后续轮次：根据学生回答给反馈（先肯定正确部分，再指出不足），学生答错累计≥2 次只给一个提示关键词，仍不直接给最终答案；直到学生已接近答案或主动请求解析时，最后一轮才给完整解析并输出 [COMPLETE]。\n"
        "沿用以下约定标记（混入正文末尾，前端自动识别并隐藏，不要伪装成多轮对话状态）：\n"
        "  - 学生答错≥2 次时输出：[NEED_HINT]  → 前端显示“查看完整解析”按钮\n"
        "  - 学生接近答案时输出：[CHECK_ANSWER]  → 前端进入下一题\n"
        "  - 引导完成/需总结时输出：[COMPLETE]  → 前端切换为总结卡\n"
        "  - 识别到薄弱知识点时输出：[WEAK_KP:知识点名1;知识点名2]  → 前端渲染可点击跳转标签"
    ),
}


# v=20260828ui 视觉模型（spark-imagev3 / OpenAI vision）专用 LaTeX 硬性 prompt。
# 视觉模型对尾部指令更敏感,放在 system 末尾 + "★★★ 验收红线"措辞 + 正反例对照。
# 即使模型 base 弱服从,后端 _flatten_matrix_to_latex 也会对压扁纯文本做兜底。
IMAGE_LATEX_HARD = """

【图片公式输出硬性规范 ★★★ 验收红线】
图中行列式/矩阵必须用标准 LaTeX 环境,元素按行列排布,行用 \\\\ 分隔、列用 & 分隔:
  行列式: \\begin{vmatrix} 1 & 2 & 3 \\\\ 0 & 1 & 4 \\\\ 0 & 0 & 2 \\end{vmatrix}
  矩阵:   \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}
【绝对禁止】|1 2 3 0 1 4 0 0 2| 或 (1 2; 3 4) 这类纯文本压扁写法。
规则:① 行列式/矩阵符号必须配 \\begin{...}\\end{...};② 数字之间用空格/分号拼接即违规;
③ 计算结果若含行列式(如余子式展开),同样必须写成 vmatrix 环境。违反上述任一即视为错误回答。"""


def _is_num(token: str) -> bool:
    """是否纯数字 token（支持负数/小数/正负号）—— 用于压扁矩阵识别。"""
    if not token:
        return False
    return bool(__import__('re').match(r'^[+\-]?\d+(?:\.\d+)?$', token.strip()))


def _is_matrix_token(token: str) -> bool:
    r"""v=20260902j 是否可作为矩阵元素的 token。
    兼容:① 纯数字(1, -2, 3.14);② 简单代数符号(a, a1, x_2, A_11, alpha);③ LaTeX 省略号命令(\cdots, \ldots, \vdots, \ddots);
    拒绝:含 `+`/`-`/`*`/`/` 的表达式(那不是单个 token,应被更高优先级切分行处理);单字变量(|x|, |A|) 由总长度/n 守卫过滤。"""
    if not token:
        return False
    t = token.strip()
    if not t:
        return False
    # 1) 纯数字
    if _is_num(t):
        return True
    # 2) LaTeX 省略号命令
    if t in ('\\cdots', '\\ldots', '\\vdots', '\\ddots', '\\dots'):
        return True
    # 3) 简单代数符号:a, a1, a_2, A_11, alpha, beta(字母开头 + 字母/数字/下划线组合)
    return bool(__import__('re').match(r'^[A-Za-z]+(?:[A-Za-z0-9_])*$', t))


def _flatten_matrix_to_latex(text: str) -> str:
    """v=20260828ui 把"一行压扁"的纯文本矩阵（如 |1 2 3 0 1 4 0 0 2|）转换为标准 \\begin{vmatrix}...\\end{vmatrix}。
    v=20260902j 扩展:支持含 a1/a_2/\\cdots 等代数符号的 n 阶压扁形式(如 |1+a1 1 ... 1+a2 1 ... 1+a_n|)。
    试切策略:
      1) |...| 内部分号/竖线显式分行 → 按行重组为 vmatrix;
      2) 否则按空格切 token,n>=4 且 n 为完全平方 → 按 k=int(sqrt(n)) 正方形切 (9→3×3, 4→2×2, 16→4×4);
         兼容 _is_matrix_token(允许 a1/\\cdots 等),并由 n 守卫避免误判 |x|、|A|;
      3) 不匹配(单字符 |x|、|A| 等绝对值/代数记号) → 原样保留,不做转换。
    """
    import re
    if not text or '|' not in text:
        return text

    def _rows_to_vmatrix(rows):
        body = ' \\\\ '.join(' & '.join(r) for r in rows)
        return f'\\begin{{vmatrix}} {body} \\end{{vmatrix}}'

    def _try_replace(m):
        inner = m.group(1)
        # 1) 分号/竖线显式分行
        explicit = [seg.strip().split() for seg in re.split(r'[;；|]+', inner) if seg.strip()]
        explicit = [r for r in explicit if r]
        if len(explicit) > 1:
            cols = len(explicit[0])
            if cols > 0 and all(len(r) == cols for r in explicit) and all(_is_matrix_token(t) for r in explicit for t in r):
                return _rows_to_vmatrix(explicit)
        # 2) 单行:空格切 token,n 为完全平方且全部为合法矩阵 token
        toks = inner.split()
        n = len(toks)
        if n >= 4 and all(_is_matrix_token(t) for t in toks):
            k = int(round(n ** 0.5))
            if k * k == n:
                return _rows_to_vmatrix([toks[i * k:(i + 1) * k] for i in range(k)])
        # 3) 不匹配,原样
        return m.group(0)

    # v=20260902j 扩展字符类:在原来数字/运算/分号基础上加上字母、下划线、LaTeX 省略号命令
    return re.sub(r'\|([0-9A-Za-z_+\-*/.\s;；|\\]+)\|', _try_replace, text)


RAG_INSTRUCTION = """【知识库参考（非逐字复述）】
- 上方检索结果来自同济《线性代数》权威知识库，仅作参考和事实校验，不要复述检索片段原文。
- 用自己的话、自然口吻讲解；需要引用结论时才标注【出处：章节·小节】。
- 若知识库覆盖不足，可补充你的知识，但标注【出处：通用知识】，且不得与知识库冲突。
- 严禁编造知识库中不存在的定理、公式或数据。
"""


def render_profile_hint(profile: Optional[dict]) -> str:
    """把学习者画像压缩成一小段个性化上下文，供模型自然调优讲解节奏。"""
    if not profile or not isinstance(profile, dict):
        return ""
    goal = str(profile.get("goal") or "课堂同步").strip()
    pace = str(profile.get("pace") or "适中").strip()
    weak = profile.get("weak") or []
    if isinstance(weak, str):
        weak = [x.strip() for x in weak.replace("，", ",").split(",") if x.strip()]
    if isinstance(weak, list):
        weak = [str(x).strip() for x in weak if str(x).strip()][:6]
    weak_text = "、".join(weak) if weak else "暂无明确薄弱点"
    return (
        "【学习者画像】\n"
        f"当前目标：{goal}；期望节奏：{pace}；优先补强：{weak_text}。\n"
        "请在回答中自然地照顾该画像：先讲清结论，再说明依据；"
        "涉及优先补强知识点时适当放慢、多给一步判断依据；"
        "结束时可给一句不超过 20 字的下一步建议。"
        "不要机械复述本画像，不要为了个性化而堆砌模板套话。"
    )

# ---------- LaTeX 和引用处理 ----------
_CITE_PATTERNS = [
    r'【出处[：:]\s*(.*?)】', r'【参考[：:]\s*(.*?)】', r'【来源[：:]\s*(.*?)】',
    r'\[出处[：:]\s*(.*?)\]', r'\[参考[：:]\s*(.*?)\]', r'\[来源[：:]\s*(.*?)\]',
]


def extract_citations(text: str) -> list:
    cites = []
    for p in _CITE_PATTERNS:
        for m in re.findall(p, text, flags=re.S):
            c = m.strip()
            if c and c not in cites:
                cites.append(c)
    return cites


def strip_citations(text: str) -> str:
    cleaned = text
    for p in _CITE_PATTERNS:
        cleaned = re.sub(p, '', cleaned, flags=re.S)
    return re.sub(r'\n{3,}', '\n\n', cleaned).strip()


_LATEX_CMDS = (
    'lambda|mu|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|'
    'nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|'
    'Lambda|Mu|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|'
    'Nu|Xi|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega|'
    'cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|cong|'
    'rightarrow|leftarrow|Rightarrow|Leftarrow|mapsto|'
    'infty|partial|nabla|forall|exists|in|notin|subset|supset|cup|cap|'
    'sum|prod|int|oint|sqrt|frac|binom|'
    'hat|bar|tilde|vec|dot|ddot|widehat|widetilde|'
    'boldsymbol|mathrm|mathcal|mathbb|mathit|mathsf|'
    'text|quad|qquad|dots'
)
# v=20260903l LaTeX 后处理重写:
# ① 优先识别 $$...$$ 显示公式,并【把其内容包括在内】标记为数学区(旧实现只标记 $ 定界符,
#    导致 $$...$$ 内部公式被误当裸命令二次包 $ 而损坏,如 $$A^{-1}=$\frac$...)。
# ② 参数型命令(\frac/\tfrac/\binom/\sqrt 等)后接参数({ / 数字 / 字母)时【不再】包 $...$,
#    杜绝 $\frac$1 、 $\tfrac$3 这类损坏。
_ARGTAKING_CMDS = r'frac|tfrac|dfrac|cfrac|binom|sqrt'
_ARGLESS_CMDS = (
    'lambda|mu|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|'
    'nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|'
    'Lambda|Mu|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|'
    'Nu|Xi|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega|'
    'cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|cong|'
    'rightarrow|leftarrow|Rightarrow|Leftarrow|mapsto|'
    'infty|partial|nabla|forall|exists|in|notin|subset|supset|cup|cap|'
    'sum|prod|int|oint|'
    'hat|bar|tilde|vec|dot|ddot|widehat|widetilde|'
    'boldsymbol|mathrm|mathcal|mathbb|mathit|mathsf|'
    'text|quad|qquad|dots'
)
_BARE_ARGLESS_RE = re.compile(r'\\(?:' + _ARGLESS_CMDS + r')')
# 参数型命令:仅当其后不是参数({ / 数字 / 字母)时才视为"裸命令"并包 $...$
_BARE_ARG_RE = re.compile(r'\\(?:' + _ARGTAKING_CMDS + r')(?![{0-9a-zA-Z])')


def _mark_math(text: str) -> list:
    """返回与 text 等长布尔数组,in_math[k]=True 表示 k 位于 $...$ 或 $$...$$ 数学区内。
    v=20260903l 修复:优先匹配 $$ 显示公式,把其【内容】也标记为数学区。"""
    n = len(text)
    in_math = [False] * n
    i = 0
    while i < n:
        if text[i:i + 2] == '$$':
            j = text.find('$$', i + 2)
            if j == -1:
                break  # 未闭合的 $$ 不再处理,避免误吞正文
            for k in range(i, min(j + 2, n)):
                in_math[k] = True
            i = j + 2
        elif text[i] == '$':
            j = text.find('$', i + 1)
            if j == -1:
                break
            for k in range(i, min(j + 1, n)):
                in_math[k] = True
            i = j + 1
        else:
            i += 1
    return in_math


def normalize_latex(text: str) -> str:
    """v=20260903l 重写:① 正确标记 $$...$$ 内容,避免显示公式内命令被二次包 $;
    ② 参数型命令(\frac 等)后接参数时不包 $,杜绝 $\frac$1 损坏;③ 其余裸命令(希腊字母/算子)照旧包 $...$。"""
    if not text:
        return text
    in_math = _mark_math(text)
    matches = []
    matches.extend(_BARE_ARGLESS_RE.finditer(text))
    matches.extend(_BARE_ARG_RE.finditer(text))
    matches.sort(key=lambda m: m.start())
    out, last = [], 0
    for m in matches:
        s, e = m.span()
        if s < last:
            continue  # 与上一次包 $ 区间重叠,跳过
        if any(in_math[k] for k in range(s, e)):
            continue
        out.append(text[last:s])
        out.append('$')
        out.append(m.group(0))
        out.append('$')
        last = e
    out.append(text[last:])
    return ''.join(out)


_REF_HEADER_RE = re.compile(r'\n\s*(?:参考出处|参考资料|参考知识点|RAG\s*检索)\s*[:：][\s\S]*$', re.M)


def strip_ref_section(text: str) -> str:
    return _REF_HEADER_RE.sub('', text).rstrip() + '\n'


# ---------- 请求/响应模型 ----------
class RegisterRequest(BaseModel):
    nickname: str
    password: str
    avatar: str = ""
    device: str = "computer"   # computer | mobile | tablet


class LoginRequest(BaseModel):
    identifier: str = ""  # 支持用户名或昵称登录
    password: str
    device: str = "computer"   # computer | mobile | tablet（前端识别设备类型传入）


class UsernameUpdateRequest(BaseModel):
    new_username: str


class AskRequest(BaseModel):
    question: str = ""
    messages: Optional[List[dict]] = None
    mode: str = "direct"
    images: List[str] = []   # v=20260922o 图片 dataURL 数组(可选);非空时走多模态视觉模型路径"
    profile: Optional[dict] = None  # v=20260825 学习者画像(目标/节奏/薄弱点),用于个性化讲解
    system: Optional[str] = None  # v=20260903l 前端注入的系统提示词;非空则覆盖内置身份/教学规范,mode 分支行为保留


class RagSearchRequest(BaseModel):
    query: str
    top_k: int = RAG_TOP_K


class NoteRequest(BaseModel):
    question: str
    answer: str
    note: str = ""


class MistakeRequest(BaseModel):
    question: str
    user_answer: str = ""
    correct_answer: str = ""
    knowledge_point: str = ""
    chapter: str = ""


# v=20260902m 收藏题目请求模型(action bar 「更多 → 收藏题目」)
class FavoriteRequest(BaseModel):
    question: str
    answer: str = ""
    note: str = ""


# v=20260902m 反馈请求模型(action bar 点赞/点踩)
class FeedbackRequest(BaseModel):
    msg_id: str = ""
    rating: str = "up"  # "up" | "down"
    comment: str = ""  # 点踩时可选：答案错误/排版混乱/讲解不清/其他


class HistorySaveRequest(BaseModel):
    question: str
    answer: str
    mode: str = "direct"
    citations: str = ""
    rag_used: bool = False


class ChatSessionNewRequest(BaseModel):
    title: str = ""                # 可选前端标题；后端会用 question 截取
    first_question: str = ""       # 第一条用户提问（用于生成标题）


class ChatMessageAppend(BaseModel):
    role: str = "user"            # user | ai
    content: str = ""
    mode: str = "direct"
    citations: str = ""
    rag_used: bool = False
    ocr_used: bool = False
    image_url: str = ""


class ChatSessionAppendRequest(BaseModel):
    messages: list = []           # 本轮新追加的 [user, ai] 消息数组
    relate_knowledge: str = ""    # 关联知识点（逗号/分号分隔）


class MistakesSyncRequest(BaseModel):
    mistakes: list = []       # 完整错题对象数组（payload 原样存储）
    removed_ids: list = []    # 本地删除的题目 ID，服务端同步删除


class ChangePasswordRequest(BaseModel):
    old_password: str = ""
    new_password: str = ""



# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
_MATH_TASK_KEYWORDS = {
    "inverse": ["逆矩阵", "求逆", "可逆", "逆矩阵为"],
    "det": ["行列式", "determinant"],
    "rank": ["矩阵的秩", "秩为", "求秩", "的秩", "秩是多少", "rank"],
    "eigen": ["特征值", "特征向量", "特征多项式", "对角化"],
    "solve_linear": ["线性方程组", "方程组", "解的情况", "齐次", "非齐次", "通解", "唯一解", "无解", "无穷多解", "含参数"],
    "nullspace": ["零空间", "基础解系"],
    "diagonalize": ["对角化", "相似对角化"],
}


# ── 以下定义自 routes_base.py 迁移（跨模块共享，2026-09-11）──
def _cleanup_expired_sessions():
    try:
        db = get_db()
        cutoff = datetime.utcnow().timestamp() - 60 * 60 * 24 * 30
        rows = db.execute("SELECT id, token FROM user_sessions").fetchall()
        for r in rows:
            info = verify_auth_token(r[1])
            if not info or info["exp"] < cutoff:
                db.execute("DELETE FROM user_sessions WHERE id = ?", (r[0],))
        db.commit()
    except Exception:
        pass


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
}


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _ask_build_context(req: AskRequest, rag_k: int = None, fs_k: int = 2, lite: bool = False):
    """构建 system 提示与对话上下文；rag_k/fs_k 用于按需缩减输入长度以降低延迟。
    lite=True 时使用精简版系统提示（流式/低延迟路径），进一步压缩 prefill。"""
    rag_k = rag_k or RAG_TOP_K
    base_prompt = SYSTEM_PROMPT_LITE if lite else SYSTEM_PROMPT
    # v=20260903l 前端注入 system:非空时以之为基础(覆盖内置身份/教学规范),mode 分支行为保留
    override = bool(getattr(req, "system", None))
    if override:
        base_prompt = req.system
    mode_hint = MODE_HINTS.get(req.mode, MODE_HINTS["direct"])
    if req.messages:
        convo = [m for m in req.messages if m.get("role") in ("user", "assistant")]
        query = next((m.get("content") or "" for m in reversed(convo) if m.get("role") == "user"), "")
    else:
        convo = [{"role": "user", "content": req.question}]
        query = req.question
    # 引擎前置校验：数学计算类问题先用本地引擎算出确定性结论
    engine_result = None
    if not lite and not override:
        engine_result = _engine_precheck(query)
        if engine_result:
            base_prompt = base_prompt + ENGINE_INSTRUCTION.format(engine_summary=engine_result["summary"])
    # v=20260904 RAG 门控 + 意图分流:
    # ① 非线代问题(闲聊/天气/电影/编程等)完全跳过检索;
    # ② 计算/求解类问题(求逆/解方程组/算行列式/特征值)默认不检索、不挂教材引用;
    # ③ guided 多轮中间态(学生在回答引导问题)不检索,不打断对话节奏;
    # ④ 仅概念/原理/解释类才检索,并按 top1 分数阈值 + 可读标题过滤(宁缺毋滥)。
    _is_calc = _is_calculation_intent(query)
    _is_guided_mid = (req.mode == "guided") and bool(req.messages and len([m for m in req.messages if m.get("role") == "user"]) >= 2)
    _should_rag = (_is_linalg_or_allow_rag(query) and not _is_calc and not _is_guided_mid)
    hits = retrieve(query, top_k=rag_k) if _should_rag else []
    hits = _filter_rag_hits(hits)
    rag_context = build_rag_context(hits)
    # 动态 few-shot：检索与当前问题最相似的专家标注例题，作为上下文示例
    fewshot_hits = retrieve_fewshot(query, top_k=fs_k)
    fewshot_context = build_fewshot_context(fewshot_hits)
    system = base_prompt + "\n" + mode_hint
    personal_hint = render_profile_hint(getattr(req, "profile", None))
    if personal_hint and not override:
        system = personal_hint + "\n" + system
    # v=20260903p 追问去重：把会话里用户已问过的问题列表注入提示词，明确要求生成的追问
    # 必须是"还没问过的新问题"，禁止与已问问题相同或仅换措辞的近似重复。
    asked_qs = _collect_asked_questions(convo)
    if asked_qs:
        asked_block = "\n".join(f"{i}. {q}" for i, q in enumerate(asked_qs, 1))
        system = (
            system
            + "\n\n【追问去重 · 强制】以下是本次会话里用户已经问过的问题，请逐条核对：\n"
            + asked_block
            + "\n⚠️ 你生成的每一条【快捷追问】都必须是上述清单里\"还没问过的新问题\"；"
              "禁止与清单中任意一条相同，也禁止仅换措辞的近似重复（例如把\"行列式的几何意义是什么\"改成\"行列式的几何意义是啥\"）。"
              "如果实在没有新的可问，就只输出 1~2 条甚至省略【快捷追问】，绝不重复旧问题凑数。"
        )
    # v=20260903l 用户注入 system 时,它应具权威性:不把 RAG/few-shot 解题示例前置到其之前,
    # 否则推理模型会被示例带偏而忽略覆盖指令(实测 guided/detailed 下曾漏触发)
    if rag_context and not override:
        system = rag_context + "\n" + RAG_INSTRUCTION + "\n" + system
    # v=20260904 guided 模式不前置 few-shot 解题示例:那些完整解法示例会带偏模型,
    # 使其在第一轮就直接给答案,违背"先问后答"设计;引导所需的知识点由 RAG 提供即可
    if fewshot_context and not override and req.mode != "guided":
        system = fewshot_context + "\n" + system
    return system, convo, query, hits, engine_result


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
# 注意：_ASK_CACHE 必须与 _ask_cache_get/_set 同在本模块命名空间（拆分回归修复）
_ASK_CACHE = {}


def _ask_cache_get(key: str):
    item = _ASK_CACHE.get(key)
    if item and (time.time() - item[1]) < _ASK_CACHE_TTL:
        return item[0]
    return None


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _ask_cache_set(key: str, val):
    if len(_ASK_CACHE) > 300:
        _ASK_CACHE.clear()
    _ASK_CACHE[key] = (val, time.time())


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
def _ask_stream_with_images(req: AskRequest):
    """v=20260866/v=20260922o 多模态图片问答 + v=20260824 OCR 降级 + v=20260824f 星火 Spark 优先。
    流程:① 优先 Spark Image WebSocket(若 SPARK_IMAGE_* 配置) ② 失败/未配 → OpenAI 兼容 vision client
         ③ 失败/未配 → RapidOCR 提取文字 → 主 LLM 解答。
    """
    import base64 as _b64
    import io as _io

    images = [u for u in (req.images or []) if isinstance(u, str) and u.startswith("data:image/")]
    if not images:
        yield f"data: {_json.dumps({'type': 'started'}, ensure_ascii=False)}\n\n"
        msg = "⚠️ 未收到有效图片,请重新上传后重试。"
        yield f"data: {_json.dumps({'type': 'delta', 'content': msg}, ensure_ascii=False)}\n\n"
        yield f"data: {_json.dumps({'type': 'done', 'answer': msg, 'citations': [], 'sources': [], 'rag_used': False, 'engine_verified': False, 'fallback': True, 'fallback_reason': 'no_images'}, ensure_ascii=False)}\n\n"
        return

    # v=20260824f 优先路径:科大讯飞星火 Spark Image(WebSocket 原生视觉模型)
    if spark_image is not None and spark_image._is_configured():
        try:
            yield from _spark_image_stream(req)
            return
        except Exception as e:
            # Spark 失败 → 继续降级到 OpenAI 兼容
            _spark_warn = "\n\n⚠️ 星火视觉模型异常,降级到备用视觉模型...\n"
            yield f"data: {_json.dumps({'type': 'delta', 'content': _spark_warn}, ensure_ascii=False)}\n\n"

    # 1. 取当前教学模式提示
    mode_hint = MODE_HINTS.get(req.mode, MODE_HINTS["direct"])
    TEMPERATURE_MAP = {"direct": 0.3, "detailed": 0.5, "guided": 0.7}
    temperature = TEMPERATURE_MAP.get(req.mode, 0.3)
    MAX_TOKENS = 2048

    base = SYSTEM_PROMPT_LITE
    multi = (
        f"【当前为图片问答】用户上传了 {len(images)} 张图片。"
        + ("(多张图片请先简述你看到的内容,礼貌询问用户希望求解哪一题,再针对性回答。)" if len(images) > 1 else "(请先识别图片中的数学题目(印刷/手写/截图均可),再按下方模式输出完整解答。)")
    )
    system_vision = base + "\n" + mode_hint + "\n" + multi + "\n如果图片模糊/无法识别出数学题目,请友好提示:『图片不够清晰,能否重新拍一张更清楚的题目照片?』" + IMAGE_LATEX_HARD

    user_text = (req.question or "").strip() or "请看图解答。"
    user_content = [{"type": "text", "text": user_text}]
    for url in images:
        user_content.append({"type": "image_url", "image_url": {"url": url}})

    # 2. 优先尝试视觉模型(配了 LLM_VISION_* 时)
    yield f"data: {_json.dumps({'type': 'started'}, ensure_ascii=False)}\n\n"
    answer = ""
    vision_error = None
    vision_used = False
    vision_model_name = os.environ.get("LLM_VISION_MODEL") or os.environ.get("LLM_MODEL", "deepseek-chat")

    try:
        client = _get_vision_client()
        resp = client.chat.completions.create(
            model=vision_model_name,
            messages=[
                {"role": "system", "content": system_vision},
                {"role": "user", "content": user_content},
            ],
            temperature=temperature,
            max_tokens=MAX_TOKENS,
            stream=False,
        )
        answer = (resp.choices[0].message.content or "").strip()
        vision_used = True
    except HTTPException as e:
        vision_error = e.detail
    except Exception as e:
        vision_error = str(e)[:200]

    # 3. v=20260824 OCR 降级:视觉失败 → 走 RapidOCR 提取文字 + 主 LLM 解答
    if not vision_used or not answer or "does not support image" in (answer + (vision_error or "")):
        if ocr_engine is not None:
            # v=20260824g 主动初始化 OCR(防止新进程首次发图时还没 init,导致 is_available() 误判 False)
            try:
                if not ocr_engine.is_available():
                    ocr_engine.init_ocr()
            except Exception:
                pass
            try:
                # 把所有 dataURL 转 PIL/bytes,逐张 OCR
                ocr_texts = []
                total_cost = 0
                for i, url in enumerate(images):
                    try:
                        b64_data = url.split(",", 1)[1]
                        img_bytes = _b64.b64decode(b64_data)
                        r = ocr_engine.ocr_image(img_bytes)
                        if r.get("ok"):
                            txt = (r.get("text") or "").strip()
                            total_cost += r.get("cost_ms", 0)
                            if txt:
                                ocr_texts.append(f"[图片{i+1} OCR 提取的文字]\n{txt}")
                    except Exception as ex:
                        ocr_texts.append(f"[图片{i+1} OCR 失败: {ex}]")
                merged_ocr = "\n\n".join(ocr_texts).strip()
                if merged_ocr:
                    # v=20260824g 图片内容守门:OCR 文字 + 用户文本综合判断是否与线性代数相关;
                    # 无关图片(如游戏截图/旅游/股票等)直接返回友好拒绝,节省 LLM token + 给出合理答复
                    combined_check = (merged_ocr + " " + (user_text or "")).strip()
                    related, why = _is_linalg_question(combined_check)
                    if not related:
                        # 把 OCR 识别到的部分内容也告诉用户,方便他们知道 AI 看到了什么
                        ocr_preview = merged_ocr.strip().replace("\n", " ")[:80]
                        msg = (
                            "🙏 抱歉,这**张图片内容不在我的专长范围内**。\n\n"
                            f"我从图片里识别到的内容预览:**\"{ocr_preview}{'...' if len(merged_ocr) > 80 else ''}\"**\n\n"
                            "💡 我是**线性代数 AI 助教**,专注于帮你解答线性代数相关的问题。\n\n"
                            "你可以试试:\n"
                            "• 拍一张**线性代数题目**(矩阵/行列式/特征值/方程组等)\n"
                            "• 或直接用文字提问,如「什么是特征值?」\n"
                            "• 也可拖入课本/练习册/手写题图片\n\n"
                            "现在就来一道线性代数题吧?📚"
                        )
                        yield "data: " + _json.dumps({"type": "started"}, ensure_ascii=False) + "\n\n"
                        yield "data: " + _json.dumps({"type": "delta", "content": msg}, ensure_ascii=False) + "\n\n"
                        yield "data: " + _json.dumps({
                            "type": "done", "answer": msg, "citations": [], "sources": [],
                            "rag_used": False, "engine_verified": False,
                            "offtopic": True, "offtopic_reason": f"image_ocr:{why}",
                            "vision_used": False, "image_count": len(images),
                            "ocr_preview": ocr_preview,
                        }, ensure_ascii=False) + "\n\n"
                        return
                    # v=20260824k 答非所问修复:用户问题含动作词/过短时,在 OCR 路径 system prompt
                    # 中追加硬指令,强制模型直接解答图中题目(图片可能OCR残缺,需明确引导)
                    _user_text_eff = user_text
                    _action_kw2 = ("怎么", "如何", "求", "解", "证", "算", "写", "答", "分析", "证明", "为什么")
                    _short_or_action = len(_user_text_eff) <= 6 or any(k in _user_text_eff for k in _action_kw2)
                    _extra_directive = ""
                    if _short_or_action:
                        _extra_directive = (
                            "\n【硬性指令】用户已通过图片+简短问题明确请求解题/讲解,"
                            "请**直接基于以上 OCR 文本给出完整解答**(核心结论 → 关键步骤 → 结果),"
                            "严禁用「矩阵的基本概念」/「什么是X」等通用介绍来答非所问。"
                            "若 OCR 残缺无法识别题目,礼貌提示用户重拍或补充题目文本。"
                        )
                    # 构造 OCR 路径 system prompt
                    system_ocr = base + "\n" + mode_hint + "\n" + (
                        f"【当前为图片问答(OCR 路径)】用户上传了 {len(images)} 张图片,视觉模型暂不可用,"
                        f"已通过 OCR 提取以下文字内容:\n\n{merged_ocr}\n\n"
                        "请基于以上 OCR 文本按模式输出完整解答。若 OCR 文本不清晰或无数学题目,请友好提示用户重拍。"
                    ) + _extra_directive + IMAGE_LATEX_HARD
                    user_text_ocr = _user_text_eff
                    try:
                        main_client = get_client()
                        main_model = os.environ.get("LLM_MODEL", "deepseek-chat")
                        resp2 = main_client.chat.completions.create(
                            model=main_model,
                            messages=[
                                {"role": "system", "content": system_ocr},
                                {"role": "user", "content": user_text_ocr},
                            ],
                            temperature=temperature,
                            max_tokens=MAX_TOKENS,
                            stream=False,
                        )
                        answer = (resp2.choices[0].message.content or "").strip()
                        # 告知前端走了 OCR 降级
                        answer = f"📝 _注:图片已通过 OCR 提取文字(耗时 {total_cost}ms),基于文字内容作答。若识别有偏差,可补充更清晰的图片或文字描述。_\n\n" + answer
                    except Exception as e2:
                        answer = f"⚠️ 视觉模型与 OCR 降级均失败:\n- 视觉: {vision_error or '未配'}\n- OCR+LLM: {str(e2)[:200]}\n\n请检查视觉模型配置或上传更清晰的图片。"
                else:
                    answer = f"⚠️ OCR 未提取出任何文字,请上传更清晰的图片,或直接用文字描述题目。"
            except Exception as e3:
                answer = f"⚠️ 图片处理失败(OCR 降级路径异常): {str(e3)[:160]}"
        else:
            # OCR 也不可用
            answer = (
                f"⚠️ 图片识别暂不可用:\n\n"
                f"- 视觉模型失败: {vision_error or '未配置 LLM_VISION_* 环境变量'}\n"
                f"- OCR 引擎不可用: pip install rapidocr-onnxruntime 后重启服务\n\n"
                f"请检查配置,或直接用文字描述题目。"
            )

    if not answer:
        answer = "⚠️ 未能从图片中识别出有效的线性代数题目,请重新上传更清晰的图片。"

    # v=20260828ui 压扁纯文本矩阵 → LaTeX 兜底(visual/OCR 路径都覆盖;"|1 2 3 0 1 4 0 0 2|" 转为 \begin{vmatrix})
    answer = _flatten_matrix_to_latex(answer)

    # 4. SSE 流式推送(切 24 字符/块)
    chunk_size = 24
    for i in range(0, len(answer), chunk_size):
        yield f"data: {_json.dumps({'type': 'delta', 'content': answer[i:i+chunk_size]}, ensure_ascii=False)}\n\n"
    # 5. done 事件(图片问答总出口,v=20260903h 注入快捷追问)
    _body, _followups = _followups_with_fallback(req.question or '', answer, req.mode)  # v=20260904 追问 + 启发式兜底
    _done_payload = {'type': 'done', 'answer': _body, 'citations': [], 'sources': [], 'rag_used': False, 'engine_verified': False, 'vision_used': vision_used, 'image_count': len(images), 'fallback': not vision_used, 'fallback_reason': ('vision_error' if not vision_used else None)}
    if _followups:
        _done_payload['followups'] = _followups
    yield f"data: {_json.dumps(_done_payload, ensure_ascii=False)}\n\n"


# ── 以下定义自 routes_credits.py 迁移（跨模块共享，2026-09-11）──
_CREDITS_LOCK = threading.Lock()  # 共享 sqlite 单连接下的积分写互斥（配合原子 UPDATE 根因修复竞态）


def _consume_credits(user_id: int, prompt_tokens: int, completion_tokens: int,
                     model: str = "deepseek-chat", kind: str = "", note: str = "") -> bool:
    """消费积分（按 token 消耗换算）。返回 True 表示扣费成功。

    原子扣费：单条 UPDATE 带余额守卫（rowcount 判定），并发请求不会重复扣/漏扣。
    kind 用于区分消费类型（如 "ocr"），写入 token_usage.api_type。"""
    total_tokens = prompt_tokens + completion_tokens
    credits_needed = max(1, math.ceil(total_tokens / TOKEN_PER_CREDIT))
    api_type = kind or "chat"
    db = get_db()
    with _CREDITS_LOCK:
        _ensure_credits(user_id)
        cur = db.execute(
            "UPDATE user_credits SET balance = balance - ?, total_consumed = total_consumed + ?, updated = ? "
            "WHERE user_id = ? AND balance >= ?",
            (credits_needed, credits_needed, datetime.utcnow().isoformat(), user_id, credits_needed))
        charged = cur.rowcount == 1
        db.execute(
            "INSERT INTO token_usage (user_id, api_type, model, prompt_tokens, completion_tokens, cost_tokens, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, api_type, model, prompt_tokens, completion_tokens, credits_needed if charged else 0,
             datetime.utcnow().isoformat()))
        db.commit()
        if not charged:
            # 积分不足，记录但不阻止（首次体验不中断）
            print(f"[credits] 余额不足未扣费 user={user_id} kind={api_type} note={(note or '')[:80]}")
        return charged


# ── 以下定义自 routes_self_path.py 迁移（跨模块共享，2026-09-11）──
def _is_dirty_kp(name: str) -> bool:
    """判断知识点名是否为论文标题/文献类脏数据(书名号、超长、论文特征词)。"""
    if not name:
        return True
    name = str(name).strip()
    if not name:
        return True
    if "《" in name or "》" in name:
        return True
    if len(name) > 25:
        return True
    for kw in _PAPER_FILTER_PATTERNS:
        if kw in name:
            return True
    return False


# ── 以下定义自 routes_knowledge.py 迁移（跨模块共享，2026-09-11）──
def _local_fallback_answer(question: str, kp_id: str = None):
    """LLM 失败时降级到本地模板:基于知识库检索 + 公式模板生成结构化回答。
    不依赖任何外部服务,确保 demo/断网场景也能输出有意义的回复。"""
    # 复用模块级单例检索器(每次重建会反复读取并索引整个语料,开销大且无必要)
    r = _retriever
    hits = r.search(question, top_k=3) if (r and r.available) else []
    # 拼接结构化回答
    parts = ["⚠️ 当前 LLM 服务暂时不可用,以下为本地引擎兜底回答(基于知识库检索):\n"]
    if kp_id:
        parts.append(f"📍 关联知识点:`{kp_id}`\n")
    if hits:
        parts.append("📚 知识库参考片段:\n")
        for i, h in enumerate(hits, 1):
            parts.append(f"  [{i}] {h.get('chapter','')} - {h.get('section','')}  (相关度 {h['score']})\n")
            parts.append(f"      {h['snippet'][:140]}…\n")
    # 公式骨架提示
    if any(k in question for k in ("特征值", "eigenvalue")):
        parts.append("\n📐 提示:可使用「可验证求解引擎」→ 选「特征值/特征向量」任务,\n"
                     "   输入矩阵自动求特征值并用 NumPy 回代验证 Av=λv。\n")
    elif any(k in question for k in ("逆", "inverse", "求逆")):
        parts.append("\n📐 提示:可使用「可验证求解引擎」→ 选「逆矩阵」任务,\n"
                     "   自动求逆并验证 A·A⁻¹=E(可一键运行 SymPy)。\n")
    elif any(k in question for k in ("行列式", "det", "determinant")):
        parts.append("\n📐 提示:可使用「可验证求解引擎」→ 选「行列式」任务,\n"
                     "   自动求 det 并用 NumPy 交叉验证。\n")
    elif any(k in question for k in ("秩", "rank")):
        parts.append("\n📐 提示:可使用「可验证求解引擎」→ 选「矩阵的秩」任务。\n")
    else:
        parts.append("\n💡 建议:可前往「知识体系」浏览相关章节,或用「可验证求解引擎」\n"
                     "   直接数值计算。LLM 恢复后可获得更自然的讲解。\n")
    return "".join(parts)


# ── 以下定义自 routes_qa.py 迁移（跨模块共享，2026-09-11）──
_QUIZ_BANK = [
    # —— 第一章 行列式 ——
    {"chapter": "第一章 行列式", "difficulty": "基础",
     "type": "选择题", "question": "二阶行列式 $\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}$ 的计算结果是？",
     "options": ["A. $ad+bc$", "B. $ad-bc$", "C. $ac-bd$", "D. $ab-cd$"],
     "answer": "B. $ad-bc$（主对角线乘积减去副对角线乘积）",
     "explanation": "二阶行列式按对角线法则：$|A|=ad-bc$。易错点是把副对角线写成加号。",
     "knowledge_point": "第一章 行列式·二阶行列式定义",
     "kw": ["行列式", "det", "克莱姆", "克拉默", "范德蒙德", "cramer", "对角"]},
    {"chapter": "第一章 行列式", "difficulty": "基础",
     "type": "选择题", "question": "已知 $|A|=5$，将 $A$ 的第一行的 3 倍加到第二行，所得新行列式的值为？",
     "options": ["A. $15$", "B. $5$", "C. $8$", "D. $0$"],
     "answer": "B. $5$",
     "explanation": "行列式的倍加不变性：把某行的 $k$ 倍加到另一行，行列式值不变。",
     "knowledge_point": "第一章 行列式·行列式性质（倍加不变）",
     "kw": ["行列式", "det", "性质", "克莱姆", "克拉默", "倍加"]},
    {"chapter": "第一章 行列式", "difficulty": "中等",
     "type": "选择题", "question": "用克莱姆法则求解 $n$ 元线性方程组的前提条件是？",
     "options": ["A. 系数矩阵可逆", "B. 系数行列式 $D\\neq 0$", "C. 方程组为齐次", "D. 未知数个数大于方程数"],
     "answer": "B. 系数行列式 $D\\neq 0$",
     "explanation": "克莱姆法则要求系数行列式 $D\\neq 0$，此时方程组有唯一解 $x_j=D_j/D$。",
     "knowledge_point": "第一章 行列式·克莱姆法则",
     "kw": ["行列式", "克莱姆", "克拉默", "cramer", "方程组"]},
    {"chapter": "第一章 行列式", "difficulty": "中等",
     "type": "选择题", "question": "交换 $n$ 阶行列式的两行，行列式的值如何变化？",
     "options": ["A. 不变", "B. 变号", "C. 乘以 2", "D. 变为 0"],
     "answer": "B. 变号",
     "explanation": "行列式是反对称多重线性函数，交换任意两行（列）行列式变号。",
     "knowledge_point": "第一章 行列式·换行变号性质",
     "kw": ["行列式", "det", "性质", "换行", "变号"]},
    {"chapter": "第一章 行列式", "difficulty": "进阶",
     "type": "选择题", "question": "范德蒙德行列式 $V(x_1,\\dots,x_n)$ 的值与下列哪项有关？",
     "options": ["A. 所有元素之和", "B. 两两之差的乘积 $\\prod_{1\\le i<j\\le n}(x_j-x_i)$", "C. 各行元素之和", "D. 主对角线元素之和"],
     "answer": "B. 两两之差的乘积",
     "explanation": "范德蒙德行列式等于所有 $x_j-x_i\\ (j>i)$ 的乘积，任一两数相等时行列式为 0。",
     "knowledge_point": "第一章 行列式·范德蒙德行列式",
     "kw": ["行列式", "范德蒙德", "vandermonde", "特殊"]},

    # —— 第二章 矩阵 ——
    {"chapter": "第二章 矩阵", "difficulty": "基础",
     "type": "选择题", "question": "矩阵 $A_{m\\times n}$ 与 $B_{p\\times q}$ 可乘（即 $AB$ 有意义）的条件是？",
     "options": ["A. $m=q$", "B. $n=p$", "C. $m=p$", "D. $n=q$"],
     "answer": "B. $n=p$（左矩阵的列数等于右矩阵的行数）",
     "explanation": "矩阵乘法要求左矩阵列数 = 右矩阵行数，结果矩阵为 $m\\times q$。",
     "knowledge_point": "第二章 矩阵·矩阵乘法条件",
     "kw": ["矩阵", "乘法", "可乘", "乘积", "matrix"]},
    {"chapter": "第二章 矩阵", "difficulty": "基础",
     "type": "选择题", "question": "关于单位矩阵 $I$，下列正确的是？",
     "options": ["A. $I+A=A$", "B. $AI=IA=A$", "C. $I=0$", "D. $AI=0$"],
     "answer": "B. $AI=IA=A$",
     "explanation": "单位矩阵是乘法单位元，任意矩阵乘单位矩阵保持不变。",
     "knowledge_point": "第二章 矩阵·单位矩阵",
     "kw": ["矩阵", "单位", "逆", "乘法", "identity"]},
    {"chapter": "第二章 矩阵", "difficulty": "基础",
     "type": "选择题", "question": "方阵 $A$ 可逆的充要条件是？",
     "options": ["A. $|A|>0$", "B. $|A|\\neq 0$", "C. $A$ 为对称矩阵", "D. $A$ 为对角矩阵"],
     "answer": "B. $|A|\\neq 0$",
     "explanation": "方阵可逆 $\\iff$ 行列式非零 $\\iff$ 满秩 $\\iff$ 特征值全非零。",
     "knowledge_point": "第二章 矩阵·逆矩阵充要条件",
     "kw": ["矩阵", "逆", "可逆", "行列式", "秩", "伴随", "inv"]},
    {"chapter": "第二章 矩阵", "difficulty": "中等",
     "type": "选择题", "question": "若方阵 $A$ 可逆，则 $(A^{-1})^T$ 等于？",
     "options": ["A. $(A^T)^{-1}$", "B. $A$", "C. $A^T$", "D. $-A$"],
     "answer": "A. $(A^T)^{-1}$",
     "explanation": "由 $(A^T)(A^{-1})^T=(AA^{-1})^T=I^T=I$ 可知 $(A^{-1})^T=(A^T)^{-1}$。",
     "knowledge_point": "第二章 矩阵·逆与转置的关系",
     "kw": ["矩阵", "逆", "转置", "transpose", "伴随"]},
    {"chapter": "第二章 矩阵", "difficulty": "中等",
     "type": "选择题", "question": "设 $A$ 为 $m\\times n$ 矩阵，其秩 $r(A)$ 满足？",
     "options": ["A. $0\\le r(A)\\le \\min(m,n)$", "B. $r(A)=m$", "C. $r(A)=n$", "D. $r(A)\\ge \\max(m,n)$"],
     "answer": "A. $0\\le r(A)\\le \\min(m,n)$",
     "explanation": "秩不超过行数与列数，故 $r(A)\\le\\min(m,n)$。",
     "knowledge_point": "第二章 矩阵·矩阵的秩",
     "kw": ["矩阵", "秩", "rank"]},

    # —— 第三章 向量与线性方程组 ——
    {"chapter": "第三章 向量与线性方程组", "difficulty": "基础",
     "type": "选择题", "question": "向量组 $\\alpha_1,\\dots,\\alpha_s$ 线性相关的充要条件是？",
     "options": ["A. 含零向量", "B. 存在不全为零的数使线性组合为零", "C. 向量个数大于维数", "D. 向量两两正交"],
     "answer": "B. 存在不全为零的数 $k_i$ 使 $\\sum k_i\\alpha_i=0$",
     "explanation": "线性相关即存在非平凡线性组合为零；含零向量只是充分非必要条件。",
     "knowledge_point": "第三章 向量·线性相关定义",
     "kw": ["向量", "线性", "相关", "无关", "方程组", "解系", "基础解", "linear"]},
    {"chapter": "第三章 向量与线性方程组", "difficulty": "基础",
     "type": "选择题", "question": "$n$ 元齐次线性方程组 $Ax=0$ 有非零解的充要条件是？",
     "options": ["A. $r(A)=n$", "B. $r(A)<n$", "C. $r(A)>n$", "D. $A$ 可逆"],
     "answer": "B. $r(A)<n$",
     "explanation": "齐次方程组有非零解 $\\iff$ 系数矩阵列秩小于未知数个数 $n$。",
     "knowledge_point": "第三章 线性方程组·齐次方程组解判定",
     "kw": ["向量", "线性", "方程组", "解系", "相关", "无关", "齐次", "基础解"]},
    {"chapter": "第三章 向量与线性方程组", "difficulty": "中等",
     "type": "选择题", "question": "非齐次线性方程组 $Ax=b$ 有解的充要条件是？",
     "options": ["A. $r(A)=r(A|b)$", "B. $|A|\\neq 0$", "C. $b=0$", "D. $r(A)<n$"],
     "answer": "A. $r(A)=r(A|b)$（系数矩阵与增广矩阵同秩）",
     "explanation": "有解判定定理：$Ax=b$ 有解 $\\iff r(A)=r(A|b)$，且唯一解要求 $r(A)=n$。",
     "knowledge_point": "第三章 线性方程组·有解判定",
     "kw": ["向量", "线性", "方程组", "解系", "相关", "无关", "非齐次", "基础解"]},
    {"chapter": "第三章 向量与线性方程组", "difficulty": "中等",
     "type": "选择题", "question": "齐次方程组 $Ax=0$ 的基础解系所含向量个数为？",
     "options": ["A. $n-r(A)$", "B. $r(A)$", "C. $n$", "D. $r(A)-n$"],
     "answer": "A. $n-r(A)$",
     "explanation": "基础解系是解空间的一组基，其维数 = 未知数个数 − 秩 = $n-r(A)$。",
     "knowledge_point": "第三章 线性方程组·基础解系",
     "kw": ["向量", "线性", "方程组", "解系", "基础解", "相关", "无关"]},
    {"chapter": "第三章 向量与线性方程组", "difficulty": "基础",
     "type": "选择题", "question": "若向量组 $\\alpha_1,\\dots,\\alpha_s$ 线性无关，则其任意部分组？",
     "options": ["A. 必线性相关", "B. 必线性无关", "C. 可能相关", "D. 必含零向量"],
     "answer": "B. 必线性无关",
     "explanation": "整体无关则部分无关；反之部分相关则整体相关。",
     "knowledge_point": "第三章 向量·线性无关性质",
     "kw": ["向量", "线性", "相关", "无关", "linear"]},

    # —— 第四章 特征值与特征向量 ——
    {"chapter": "第四章 特征值与特征向量", "difficulty": "基础",
     "type": "选择题", "question": "若 $\\lambda$ 是方阵 $A$ 的特征值，则特征方程满足？",
     "options": ["A. $|A-\\lambda I|=0$", "B. $|A-\\lambda I|=1$", "C. $|A|=\\lambda$", "D. $\\lambda=0$"],
     "answer": "A. $|A-\\lambda I|=0$",
     "explanation": "特征值即特征方程 $|A-\\lambda I|=0$ 的根，对应非零特征向量 $x$ 满足 $Ax=\\lambda x$。",
     "knowledge_point": "第四章 特征值·特征方程",
     "kw": ["特征值", "特征向量", "对角化", "相似", "迹", "eigen", "eigenvalue"]},
    {"chapter": "第四章 特征值与特征向量", "difficulty": "基础",
     "type": "选择题", "question": "$n$ 阶矩阵 $A$ 的全部特征值之和等于？",
     "options": ["A. $|A|$", "B. $\\operatorname{tr}(A)$（迹）", "C. $r(A)$", "D. $n$"],
     "answer": "B. $\\operatorname{tr}(A)$",
     "explanation": "特征值之和 = 主对角线元素之和 = 迹；特征值之积 = 行列式。",
     "knowledge_point": "第四章 特征值·特征值与迹",
     "kw": ["特征值", "特征向量", "迹", "对角化", "相似", "eigen", "trace"]},
    {"chapter": "第四章 特征值与特征向量", "difficulty": "中等",
     "type": "选择题", "question": "属于不同特征值的特征向量之间？",
     "options": ["A. 必线性相关", "B. 线性无关", "C. 必正交", "D. 必平行"],
     "answer": "B. 线性无关",
     "explanation": "属于互异特征值的特征向量必线性无关；属于同一特征值的未必。",
     "knowledge_point": "第四章 特征向量·不同特征值的独立性",
     "kw": ["特征值", "特征向量", "对角化", "相似", "eigen"]},
    {"chapter": "第四章 特征值与特征向量", "difficulty": "中等",
     "type": "选择题", "question": "方阵 $A$ 可相似对角化的充要条件是？",
     "options": ["A. 有 $n$ 个线性无关的特征向量", "B. $A$ 为对称矩阵", "C. $|A|\\neq 0$", "D. $A$ 可逆"],
     "answer": "A. 有 $n$ 个线性无关的特征向量",
     "explanation": "可对角化 $\\iff$ 有 $n$ 个线性无关特征向量 $\\iff$ 各特征值几何重数 = 代数重数。",
     "knowledge_point": "第四章 矩阵对角化·充要条件",
     "kw": ["特征值", "特征向量", "对角化", "相似", "eigen", "diagonal"]},
    {"chapter": "第四章 特征值与特征向量", "difficulty": "进阶",
     "type": "选择题", "question": "若 $A$ 可逆且 $\\lambda$ 是 $A$ 的特征值，则 $A^{-1}$ 的特征值是？",
     "options": ["A. $\\lambda$", "B. $1/\\lambda$", "C. $-\\lambda$", "D. $|A|/\\lambda$"],
     "answer": "B. $1/\\lambda$",
     "explanation": "由 $Ax=\\lambda x$ 得 $A^{-1}x=\\lambda^{-1}x$，故逆矩阵特征值为原特征值的倒数。",
     "knowledge_point": "第四章 特征值·逆矩阵的特征值",
     "kw": ["特征值", "特征向量", "逆", "对角化", "相似", "eigen"]},

    # —— 第五章 二次型 ——
    {"chapter": "第五章 二次型", "difficulty": "基础",
     "type": "选择题", "question": "实二次型 $f=x^TAx$（$A$ 对称）可通过正交变换化为？",
     "options": ["A. 标准形（平方和）", "B. 任意形式", "C. 零", "D. 非平方和对角形"],
     "answer": "A. 标准形（平方和）",
     "explanation": "实对称矩阵可正交对角化，正交变换下二次型化为特征值构成的标准形。",
     "knowledge_point": "第五章 二次型·标准形",
     "kw": ["二次型", "正定", "合同", "标准形", "配方法", "quadratic"]},
    {"chapter": "第五章 二次型", "difficulty": "中等",
     "type": "选择题", "question": "实对称矩阵 $A$ 正定的充要条件是？",
     "options": ["A. 各顺序主子式全大于 0", "B. $|A|>0$", "C. 特征值有正有负", "D. $\\operatorname{tr}(A)>0$"],
     "answer": "A. 各顺序主子式全大于 0",
     "explanation": "正定判定（Sylvester 准则）：所有顺序主子式 > 0；仅 $|A|>0$ 不充分。",
     "knowledge_point": "第五章 二次型·正定判定",
     "kw": ["二次型", "正定", "合同", "标准形", "配方法", "positive"]},
    {"chapter": "第五章 二次型", "difficulty": "基础",
     "type": "选择题", "question": "二次型 $f=x_1^2+x_2^2$ 对应的对称矩阵 $A$ 是？",
     "options": ["A. $\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}$", "B. $\\begin{bmatrix}1&1\\\\1&1\\end{bmatrix}$", "C. $\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}$", "D. $\\begin{bmatrix}1&0\\\\0&-1\\end{bmatrix}$"],
     "answer": "A. 单位矩阵",
     "explanation": "二次型矩阵取对称部分 $a_{ii}$ 为平方项系数、交叉项系数平分到 $a_{ij},a_{ji}$。",
     "knowledge_point": "第五章 二次型·矩阵表示",
     "kw": ["二次型", "正定", "合同", "标准形", "配方法", "矩阵"]},
    {"chapter": "第五章 二次型", "difficulty": "中等",
     "type": "选择题", "question": "两个二次型（矩阵 $A,B$）合同是指存在可逆矩阵 $C$ 使？",
     "options": ["A. $B=C^TAC$", "B. $B=CAC^T$", "C. $B=C^{-1}AC$", "D. $B=CA$"],
     "answer": "A. $B=C^TAC$",
     "explanation": "合同是经可逆线性变换的矩阵关系 $B=C^TAC$；相似才是 $C^{-1}AC$。",
     "knowledge_point": "第五章 二次型·合同变换",
     "kw": ["二次型", "正定", "合同", "标准形", "配方法", "congruent"]},

    # —— 第六章 向量空间 ——
    {"chapter": "第六章 向量空间", "difficulty": "基础",
     "type": "选择题", "question": "向量组成为向量空间一组基的充要条件是？",
     "options": ["A. 线性无关且能生成整个空间", "B. 向量个数等于维数", "C. 含零向量", "D. 两两正交"],
     "answer": "A. 线性无关且能生成整个空间",
     "explanation": "基是极大线性无关组且张成全空间；个数 = 维数只是其推论。",
     "knowledge_point": "第六章 向量空间·基的定义",
     "kw": ["向量空间", "基", "维数", "子空间", "过渡", "坐标", "空间", "basis"]},
    {"chapter": "第六章 向量空间", "difficulty": "基础",
     "type": "选择题", "question": "$n$ 维向量空间 $\\mathbb{R}^n$ 的维数是？",
     "options": ["A. $n$", "B. $n-1$", "C. $n+1$", "D. 任意"],
     "answer": "A. $n$",
     "explanation": "标准基有 $n$ 个向量，故 $\\dim\\mathbb{R}^n=n$。",
     "knowledge_point": "第六章 向量空间·维数",
     "kw": ["向量空间", "基", "维数", "子空间", "过渡", "坐标", "空间", "dimension"]},
    {"chapter": "第六章 向量空间", "difficulty": "中等",
     "type": "选择题", "question": "向量在给定一组基下的坐标是？",
     "options": ["A. 唯一的", "B. 不唯一", "C. 有无穷多个", "D. 不存在"],
     "answer": "A. 唯一的",
     "explanation": "基是线性无关生成集，任一向量表示为基的线性组合时系数唯一，即坐标唯一。",
     "knowledge_point": "第六章 向量空间·坐标唯一性",
     "kw": ["向量空间", "基", "维数", "子空间", "过渡", "坐标", "空间", "coordinate"]},
    {"chapter": "第六章 向量空间", "difficulty": "中等",
     "type": "选择题", "question": "过渡矩阵的作用是？",
     "options": ["A. 实现同一向量在不同基下的坐标变换", "B. 求特征值", "C. 求矩阵逆", "D. 求秩"],
     "answer": "A. 实现同一向量在不同基下的坐标变换",
     "explanation": "若 $(\\beta_1,\\dots,\\beta_n)=(\\alpha_1,\\dots,\\alpha_n)C$，则 $C$ 为从 $\\alpha$ 到 $\\beta$ 的过渡矩阵，坐标满足 $x_\\alpha=Cx_\\beta$。",
     "knowledge_point": "第六章 向量空间·过渡矩阵",
     "kw": ["向量空间", "基", "维数", "子空间", "过渡", "坐标", "空间", "transition"]},
]


# ── 以下定义自 routes_qa.py 迁移（跨模块共享，2026-09-11）──
def _mistake_redo_status_change(db, user_id: int, kp: str, correct: bool):
    """错题重做回写：答对推进状态流(active→consolidating→eliminated)，答错回退。
    返回 (状态变化说明, 是否发生变化)。只处理该用户该知识点下未消灭/巩固中的错题。"""
    now = datetime.now().isoformat()
    # 命中该知识点下未彻底消灭的错题（按最近错误时间取最新一条）
    rows = db.execute(
        "SELECT id, status, times FROM mistakes WHERE user_id = ? AND deleted = 0 "
        "AND status IN ('active', 'consolidating') AND knowledge_point = ? "
        "ORDER BY COALESCE(last_time, created) DESC, id DESC LIMIT 1",
        (user_id, kp),
    ).fetchall()
    if not rows:
        return None, False
    mid, cur_status, times = rows[0]
    if not correct:
        # 答错：回退到未消灭，错误次数 +1，时间更新
        db.execute(
            "UPDATE mistakes SET status = 'active', times = times + 1, last_time = ? WHERE id = ?",
            (now, mid),
        )
        return "再次做错，状态回到「未消灭」", True
    # 答对推进状态流
    if cur_status == "active":
        db.execute(
            "UPDATE mistakes SET status = 'consolidating', last_time = ? WHERE id = ?",
            (now, mid),
        )
        return "重做答对 1 次，进入「巩固中」", True
    # cur_status == 'consolidating' → 连续第 2 次答对 → 已消灭
    db.execute(
        "UPDATE mistakes SET status = 'eliminated', last_time = ? WHERE id = ?",
        (now, mid),
    )
    return "连续 2 次答对，已消灭", True


# ── 以下定义自 routes_knowledge.py 迁移（跨模块共享，2026-09-11）──
def _profile_update(user_id: int):
    """全量重算学生画像并写入 student_profiles + knowledge_mastery。"""
    import math, json as _json
    from datetime import datetime as _dt, timedelta as _td
    db = get_db()
    now = _dt.utcnow().isoformat()

    # ── 1. 知识掌握度 (per KP，含 Ebbinghaus遗忘) ──
    kp_data = {}  # {kp: {attempts, correct, avg_rt, last}}
    rows = db.execute("SELECT knowledge_point, user_answer, correct_answer, created FROM mistakes WHERE user_id = ?", (user_id,)).fetchall()
    for kp, ua, ca, ts in rows:
        if not kp: continue
        if kp not in kp_data:
            kp_data[kp] = {"att": 0, "corr": 0, "rts": [], "last": ts}
        kp_data[kp]["att"] += 1
        if ua and ca and ua.strip() == ca.strip():
            kp_data[kp]["corr"] += 1
        if ts and (kp_data[kp]["last"] is None or ts > kp_data[kp]["last"]):
            kp_data[kp]["last"] = ts

    rows2 = db.execute("SELECT knowledge_points, correct_count, total_count, timestamp FROM learning_sessions WHERE user_id = ?", (user_id,)).fetchall()
    for kps_json, corr, total, ts in rows2:
        try:
            kps = _json.loads(kps_json) if isinstance(kps_json, str) else (kps_json or [])
        except Exception:
            continue
        for kp_item in kps:
            if isinstance(kp_item, dict): kp = kp_item.get("kp", "")
            else: kp = str(kp_item)
            if not kp: continue
            if kp not in kp_data:
                kp_data[kp] = {"att": 0, "corr": 0, "rts": [], "last": ts}
            kp_data[kp]["att"] += 1
            if corr and total: kp_data[kp]["corr"] += corr

    λ = 0.05  # 遗忘衰减系数（半衰期≈14天）
    for kp, d in kp_data.items():
        base = d["corr"] / max(d["att"], 1)
        # 贝叶斯平滑：往 0.5 先验方向拉
        smoothed = (base * d["att"] + 0.5 * 3) / (d["att"] + 3)
        # Ebbinghaus 遗忘
        days = 0
        if d["last"]:
            try:
                t = _dt.fromisoformat(d["last"])
                days = max(0, (_dt.utcnow() - t).total_seconds() / 86400)
            except Exception:
                pass
        forget = math.exp(-λ * days)
        mastery = max(0, min(100, smoothed * forget * 100))
        db.execute("""
            INSERT INTO knowledge_mastery (user_id, knowledge_point, mastery_score, attempts, correct_attempts, last_practiced, forgetting_score, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, knowledge_point) DO UPDATE SET
                mastery_score = excluded.mastery_score, attempts = excluded.attempts,
                correct_attempts = excluded.correct_attempts, last_practiced = excluded.last_practiced,
                forgetting_score = excluded.forgetting_score, updated = excluded.updated
        """, (user_id, kp, round(mastery, 1), d["att"], d["corr"], d["last"], round(forget, 4), now))

    # ── 2. 学习风格 (VARK 简化) ──
    total_sess = db.execute("SELECT COUNT(*) FROM learning_sessions WHERE user_id = ?", (user_id,)).fetchone()[0]
    v = db.execute("SELECT COUNT(*) FROM learning_sessions WHERE user_id = ? AND session_type IN ('visualizer','textbook')", (user_id,)).fetchone()[0]
    r = db.execute("SELECT COUNT(*) FROM learning_sessions WHERE user_id = ? AND session_type IN ('knowledge','textbook')", (user_id,)).fetchone()[0]
    p = db.execute("SELECT COUNT(*) FROM learning_sessions WHERE user_id = ? AND session_type IN ('quiz','practice')", (user_id,)).fetchone()[0]
    t_th = db.execute("SELECT COUNT(*) FROM chat_history WHERE user_id = ? AND mode = 'detailed'", (user_id,)).fetchone()[0]
    t_full = max(db.execute("SELECT COUNT(*) FROM chat_history WHERE user_id = ?", (user_id,)).fetchone()[0], 1)
    norm = max(total_sess + t_th, 1)
    style = {
        "visual": round(v / max(total_sess, 1), 3),
        "reading": round(r / max(total_sess, 1), 3),
        "practice": round(p / max(total_sess, 1), 3),
        "theory": round(t_th / t_full, 3),
    }

    # ── 3. 认知能力 ──
    all_kps = db.execute("SELECT mastery_score, attempts, correct_attempts FROM knowledge_mastery WHERE user_id = ?", (user_id,)).fetchall()
    acc_total = sum(r[2] for r in all_kps) if all_kps else 0
    att_total = sum(r[1] for r in all_kps) if all_kps else 0
    accuracy = round(acc_total / max(att_total, 1), 3)
    speed = 0.5  # 默认中等
    complexity = 0.5
    rows_rt = db.execute("SELECT avg_response_time FROM knowledge_mastery WHERE user_id = ? AND avg_response_time > 0", (user_id,)).fetchall()
    if rows_rt:
        avg_rt = sum(r[0] for r in rows_rt) / len(rows_rt)
        # 归一化：60s → 0.1，10s → 0.9
        speed = round(max(0.1, min(1.0, 1.0 - (avg_rt - 10) / 50)), 3)
    cognitive = {"speed": speed, "accuracy": accuracy, "complexity": complexity}

    # ── 4. 兴趣方向 ──
    import collections as _col
    ch_counter = _col.Counter()
    chat_rows = db.execute("SELECT question FROM chat_history WHERE user_id = ?", (user_id,)).fetchall()
    for row in chat_rows:
        q = (row[0] or "").lower()
        for kp, ch in kg.KP_TO_CHAPTER.items():
            if kp.lower()[:3] in q or kp.lower() in q:
                ch_counter[ch] += 1
    # quiz sessions
    sess_rows = db.execute("SELECT knowledge_points FROM learning_sessions WHERE user_id = ?", (user_id,)).fetchall()
    for row in sess_rows:
        try:
            kps = _json.loads(row[0]) if isinstance(row[0], str) else (row[0] or [])
        except Exception:
            continue
        for item in kps:
            kp = item if isinstance(item, str) else item.get("kp", "")
            ch = kg.KP_TO_CHAPTER.get(kp)
            if ch: ch_counter[ch] += 1
    total_ch = sum(ch_counter.values())
    interest = {}
    for ch in kg.CHAPTER_KPS:
        interest[ch] = round(ch_counter.get(ch, 0) / max(total_ch, 1), 3)

    # ── 5. 情绪状态 (信心指数) ──
    emotion_trend = []
    base_conf = 50.0
    for days_ago in range(7, -1, -1):
        day = (_dt.utcnow() - _td(days=days_ago)).strftime("%Y-%m-%d")
        day_sess = db.execute("SELECT correct_count, total_count FROM learning_sessions WHERE user_id = ? AND timestamp LIKE ?", (user_id, f"{day}%")).fetchall()
        if day_sess:
            d_corr = sum(r[0] or 0 for r in day_sess)
            d_tot = sum(r[1] or 0 for r in day_sess)
            d_acc = d_corr / max(d_tot, 1)
            # 连续趋势：今天比昨天好→上升
            day_score = round(base_conf + (d_acc - 0.5) * 30)
            base_conf = base_conf * 0.7 + day_score * 0.3  # EMA
            emotion_trend.append({"date": day, "score": min(100, max(0, round(base_conf)))})
        else:
            base_conf = base_conf * 0.95  # 无活动自然衰减
            emotion_trend.append({"date": day, "score": round(base_conf)})
    confidence = round(base_conf)
    if confidence < 20: confidence = 20  # 保底

    # ── 6. 时间规律 ──
    all_ts = []
    for row in db.execute("SELECT created FROM chat_history WHERE user_id = ?", (user_id,)).fetchall():
        if row[0]: all_ts.append(row[0])
    for row in db.execute("SELECT timestamp FROM learning_sessions WHERE user_id = ?", (user_id,)).fetchall():
        if row[0]: all_ts.append(row[0])
    pref_hour = 10  # 默认上午
    avg_mins = 30
    streak = 0
    if all_ts:
        hours = []
        for ts in all_ts:
            try:
                h = _dt.fromisoformat(ts).hour
            except Exception:
                continue
            hours.append(h)
        if hours:
            pref_hour = max(set(hours), key=hours.count)  # 众数
        # 连续天数
        dates = set()
        for ts in all_ts:
            try:
                dates.add(_dt.fromisoformat(ts).strftime("%Y-%m-%d"))
            except Exception:
                pass
        dates_sorted = sorted(dates, reverse=True)
        streak = 1
        for i in range(1, len(dates_sorted)):
            prev = _dt.strptime(dates_sorted[i-1], "%Y-%m-%d")
            cur = _dt.strptime(dates_sorted[i], "%Y-%m-%d")
            if (prev - cur).days <= 1:
                streak += 1
            else:
                break
        # 平均 session 时长
        durations = [r[0] for r in db.execute("SELECT duration_seconds FROM learning_sessions WHERE user_id = ? AND duration_seconds > 0", (user_id,)).fetchall()]
        avg_mins = int(sum(durations) / max(len(durations), 1) / 60) if durations else 30
    rhythm = {"preferred_hour": pref_hour, "avg_session_min": avg_mins, "streak_days": streak}

    # ── 综合掌握度 ──
    all_m = db.execute("SELECT mastery_score FROM knowledge_mastery WHERE user_id = ?", (user_id,)).fetchall()
    overall = round(sum(r[0] for r in all_m) / max(len(all_m), 1), 1) if all_m else 50.0

    # 持久化画像
    db.execute("""
        INSERT INTO student_profiles (user_id, learning_style, cognitive_level, interest_vector, study_rhythm, confidence_score, overall_mastery, emotion_trend, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            learning_style = excluded.learning_style, cognitive_level = excluded.cognitive_level,
            interest_vector = excluded.interest_vector, study_rhythm = excluded.study_rhythm,
            confidence_score = excluded.confidence_score, overall_mastery = excluded.overall_mastery,
            emotion_trend = excluded.emotion_trend, updated = excluded.updated
    """, (user_id, _json.dumps(style), _json.dumps(cognitive), _json.dumps(interest),
          _json.dumps(rhythm), confidence, overall, _json.dumps(emotion_trend, ensure_ascii=False), now))
    db.commit()


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
def _call_vision_model(base64_url: str, prompt: str, task: str = "latex") -> str:
    """调用视觉模型识别图片中的数学内容。"""
    client = _get_vision_client()
    model = os.environ.get("LLM_VISION_MODEL", os.environ.get("LLM_MODEL", "deepseek-chat"))
    system = (
        "你是一位数学公式识别专家。用户会上传一张包含数学内容的图片（手写或印刷）。\n"
        "请严格按任务要求输出，不要多余解释。\n"
        "- 若任务为 latex：只输出图片中公式的 LaTeX 代码（用 $ 包裹行内公式，$$ 包裹独立公式）。\n"
        "- 若任务为 matrix：先输出矩阵的标准 Python 列表（如 [[1,2],[3,4]]），再可选给出矩阵阶数。\n"
        "如果图片模糊无法识别，请直接回复「识别失败：图片不清晰」。"
    )
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"任务：{task}\n{prompt}"},
                    {"type": "image_url", "image_url": {"url": base64_url}},
                ],
            },
        ],
        temperature=0.2,
        max_tokens=1024,
    )
    return (resp.choices[0].message.content or "").strip()


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
def _encode_image_to_base64(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode('utf-8')}"


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
# 只接受"纯数值"字面量：数字或 a/b 分数字符串，其余一律拒绝（安全白名单，杜绝 eval）
_NUM_CELL_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
_FRAC_CELL_RE = re.compile(r"^[+-]?\d+\s*/\s*\d+$")


def _cell_to_float(x):
    """把矩阵单元安全转为 float：int/float 直转；字符串仅接受数字/分数字面量；其余抛 ValueError。"""
    if isinstance(x, bool):
        raise ValueError("布尔值不是合法矩阵元素")
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        s = x.strip()
        if _NUM_CELL_RE.match(s):
            return float(s)
        if _FRAC_CELL_RE.match(s):
            num, den = s.split("/")
            return float(num) / float(den)
    raise ValueError(f"非法矩阵元素: {x!r}")


def _extract_matrix_list(text: str):
    """从模型输出中提取 Python 列表形式的矩阵，失败返回 None。"""
    # 优先匹配 [[...]] 或 ((...)) 格式
    m = re.search(r"\[\s*\[.*?\]\s*\]", text, re.DOTALL)
    if not m:
        return None
    try:
        arr = ast.literal_eval(m.group(0))
        if not isinstance(arr, list) or not all(isinstance(r, list) for r in arr):
            return None
        # 转为数值（支持整数/浮点/分数字符串；白名单校验，杜绝任意表达式求值）
        import numpy as np
        numeric = []
        for row in arr:
            numeric.append([_cell_to_float(x) for x in row])
        return np.array(numeric)
    except Exception:
        return None


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
def _matrix_compute(A):
    """用 NumPy 计算矩阵常用量。"""
    import numpy as np
    det = float(np.linalg.det(A))
    rank = int(np.linalg.matrix_rank(A))
    inv = None
    try:
        inv = np.linalg.inv(A).tolist()
    except Exception:
        inv = None
    eigvals = None
    try:
        eigvals = [complex(x).__repr__() for x in np.linalg.eigvals(A)]
    except Exception:
        pass
    return {"det": round(det, 4), "rank": rank, "invertible": abs(det) > 1e-10, "inverse": inv, "eigenvalues": eigvals}


# ── 以下定义自 routes_admin.py 迁移（跨模块共享，2026-09-11）──
def _display_model(model: str) -> str:
    """模型显示名映射：DeepSeek 官方把 deepseek-chat 作为 V4-Flash 的别名，
    后台展示时统一还原成真实模型名，避免用户误以为接的是旧模型。"""
    if not model:
        return model or ""
    return {"deepseek-chat": "deepseek-v4-flash"}.get(model.strip(), model)


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
ENGINE_INSTRUCTION = (
    "\n\n【重要】以下内容是本地可验证求解引擎（sympy 符号计算 + NumPy 数值回代）得到的确定性结论，"
    "已通过数学验证，你必须以此为准，不得更改其中的计算结论：\n{engine_summary}\n"
    "请围绕该结论组织讲解：先给结论，再解释推导；结构自然变化，不要固定追加\"易错提醒\"栏目。"
)


# ── 以下定义自 routes_credits.py 迁移（跨模块共享，2026-09-11）──
TOKEN_PER_CREDIT = 1000


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
_ASK_CACHE_TTL = 300  # 秒


# ── 以下定义自 routes_self_path.py 迁移（跨模块共享，2026-09-11）──
_PAPER_FILTER_PATTERNS = ["研究与实践", "知识图谱赋能", "大学学报", "Journal", "学报", "课程为例", "——以", "——基于", "基于"]


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _engine_precheck(question: str) -> Optional[dict]:
    """引擎前置校验主入口。对数学计算类问题调用本地引擎，返回校验结果。

    返回: {task, summary, engine_raw} 或 None（无需校验）。
    """
    if not question:
        return None
    q = question.lower()
    # ---- 任务类型检测 ----
    task = None
    for t, kws in _MATH_TASK_KEYWORDS.items():
        if any(kw in q for kw in kws):
            task = t
            break
    if not task:
        return None

    try:
        # ---- 情况 1：线性方程组（含参）----
        if task == "solve_linear":
            sys_info = _parse_linear_system(question)
            if sys_info:
                summary = _analyze_parametric_system(
                    sys_info["A"], sys_info["b"], sys_info["vars"], sys_info["params"], sys_info["sym_params"])
                return {"task": "solve_linear", "summary": summary,
                        "engine_raw": f"A={sys_info['A'].tolist()}, b={sys_info['b'].tolist()}, vars={sys_info['vars']}, params={sys_info['params']}"}
            # 尝试矩阵格式的方程组（A x = b）
            mat_s = _extract_matrix_str(question)
            if mat_s:
                mat = _matrix_str_to_python(mat_s)
                if mat:
                    try:
                        import sympy as sp
                        As = sp.Matrix(mat)
                        # 尝试从问题提取 b 向量
                        bm = re.search(r"(?:b|B)\s*=\s*(\[[\d\s.,+\-\[\]]*\])", question)
                        if bm:
                            b_list = [_safe_sympify(x.strip()) for x in bm.group(1).strip("[]").split(",") if x.strip()]
                            result = compute_engine.solve("solve_linear", matrix=mat, b=b_list)
                            return {"task": "solve_linear", "summary": result.get("symbolic", ""),
                                    "engine_raw": result.get("numeric", "")}
                    except Exception:
                        pass

        # ---- 情况 2：矩阵计算类（det/rank/inverse/eigen/diagonalize/nullspace）----
        mat_s = _extract_matrix_str(question)
        if mat_s:
            mat = _matrix_str_to_python(mat_s)
            if mat:
                eng_task = task if task in ("inverse", "det", "rank", "eigen", "diagonalize", "nullspace") else None
                if eng_task:
                    result = compute_engine.solve(eng_task, matrix=mat)
                    summary = result.get("symbolic", "")
                    notes = "；".join(result.get("verification_notes", []))
                    if notes:
                        summary += f"；验证：{notes}"
                    return {"task": eng_task, "summary": summary, "engine_raw": result.get("numeric", "")}
    except Exception as e:
        print(f"[引擎校验] 执行异常（跳过，不影响回答）：{e}")
        return None
    return None


# ── 以下定义自 routes_credits.py 迁移（跨模块共享，2026-09-11）──
def _ensure_credits(user_id: int):
    """确保用户有积分账户。"""
    db = get_db()
    if not db.execute("SELECT 1 FROM user_credits WHERE user_id = ?", (user_id,)).fetchone():
        db.execute(
            "INSERT INTO user_credits (user_id, balance, updated) VALUES (?, 100, ?)",
            (user_id, datetime.utcnow().isoformat()))
        db.commit()


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
def _get_vision_client():
    """获取多模态视觉模型客户端（优先使用 LLM_VISION_* 环境变量，否则回退主模型）。"""
    api_key = os.environ.get("LLM_VISION_API_KEY") or os.environ.get("LLM_API_KEY")
    base_url = os.environ.get("LLM_VISION_BASE_URL") or os.environ.get("LLM_BASE_URL")
    if not api_key:
        raise HTTPException(status_code=500, detail="未配置多模态 API Key")
    from openai import OpenAI
    return OpenAI(api_key=api_key, base_url=base_url or None)


# ── 以下定义自 routes_social.py 迁移（跨模块共享，2026-09-11）──
def _spark_image_stream(req: AskRequest):
    """通过 spark_image.py 调星火 WebSocket,流式输出 delta,包装为 SSE。
    失败时降级到 OpenAI 兼容 vision client;再失败降级到 OCR(在 _ask_stream_with_images 内统一处理)。"""
    yield f"data: {_json.dumps({'type': 'started'}, ensure_ascii=False)}\n\n"
    images = [u for u in (req.images or []) if isinstance(u, str) and u.startswith("data:image/")]
    if not images:
        return
    user_text = (req.question or "").strip() or "请看图解答。"
    mode_hint = MODE_HINTS.get(req.mode, MODE_HINTS["direct"])
    TEMPERATURE_MAP = {"direct": 0.3, "detailed": 0.5, "guided": 0.7}
    temperature = TEMPERATURE_MAP.get(req.mode, 0.3)
    # v=20260824k 答非所问修复:用户问题含「怎么/如何/求/解/证」等动作词,或问题过短(≤6字)时,
    # 强制补充「必须直接解答图中题目」的硬指令,避免模型按教学规范泛泛介绍概念
    _action_kw = ("怎么", "如何", "求", "解", "证", "算", "写", "答", "分析", "证明", "为什么")
    _short_q = len(user_text) <= 6
    _action_q = any(k in user_text for k in _action_kw)
    _hard_directive = ""
    if _short_q or _action_q:
        _hard_directive = (
            "\n【硬性指令】用户已通过图片+简短问题明确请求解题/讲解,"
            "请**直接给出图中题目的完整解答**(核心结论 → 关键步骤 → 结果),"
            "严禁用「矩阵的基本概念」/「什么是X」等通用介绍来答非所问。"
            "若图模糊,礼貌提示重拍,不要泛泛作答。"
        )
    system = SYSTEM_PROMPT_LITE + "\n" + mode_hint + (
        f"\n【当前为图片问答(星火视觉模型)】用户上传了 {len(images)} 张图片。"
        "请基于图片内容按模式输出完整解答。"
    ) + _hard_directive + IMAGE_LATEX_HARD

    # v=20260824k 用户问题过短时,把它补充为更明确的指令(星火看图时)
    effective_user_text = user_text
    if _short_q or _action_q:
        effective_user_text = (
            f"题目见图片,用户问:「{user_text}」。"
            "请先识别图中数学题,再按模式直接给出完整解题过程和答案,不要泛泛介绍概念。"
        )

    # v=20260824l 星火调用优化:combined 不再塞图片 base64(图片由 images 参数单独传,避免请求体巨大
    # 触发 code=10012 kernel error);max_tokens 由 2048 降到 1024(数学题足够了,降低服务端压力);
    # text 也只传 effective_user_text(原 user_text)与 system 中的关键指令,不重复图片内容
    combined = effective_user_text

    async def _run():
        full = []
        last_err = None
        # v=20260824l 重试机制:code=10012/EngineInternalError 是星火服务端临时故障,重试 1 次可显著提高成功率
        for attempt in range(2):
            try:
                full.clear()
                async for delta in spark_image.stream_chat(
                    combined, images,
                    temperature=temperature, max_tokens=1024, timeout=60
                ):
                    if delta:
                        full.append(delta)
                        yield ("delta", delta)
                if full:
                    yield ("done", "".join(full))
                    return
                # 流式返回为空(图片理解被星火 kernel error 中断),重试
                last_err = RuntimeError("星火返回为空(可能 kernel error)")
            except Exception as e:
                last_err = e
                if attempt == 0:
                    yield ("delta", "⚠️ 星火视觉模型暂时繁忙,正在重试...\n\n")
        yield ("error", f"星火视觉模型调用失败: {str(last_err)[:200]}; 降级到备用视觉模型")

    # 同步跑 async(在 SSE 同步生成器里)
    import asyncio as _aio
    try:
        loop = _aio.get_event_loop()
    except RuntimeError:
        loop = _aio.new_event_loop()
        _aio.set_event_loop(loop)

    iter_done = False
    while not iter_done:
        agen = _run()
        try:
            while True:
                kind, payload = loop.run_until_complete(agen.__anext__())
                if kind == "delta":
                    yield f"data: {_json.dumps({'type': 'delta', 'content': payload}, ensure_ascii=False)}\n\n"
                elif kind == "done":
                    # v=20260828ui 压扁纯文本矩阵 → LaTeX 兜底(visual 模型常输出 "|1 2 3 0 1 4|")
                    payload = _flatten_matrix_to_latex(payload)
                    _body, _followups = _followups_with_fallback(req.question or '', payload, req.mode)  # v=20260904 追问 + 启发式兜底
                    _done_payload = {'type': 'done', 'answer': _body, 'citations': [], 'sources': [], 'rag_used': False, 'engine_verified': False, 'vision_used': True, 'image_count': len(images), 'vision_engine': 'spark-image'}
                    if _followups:
                        _done_payload['followups'] = _followups  # v=20260903h
                    yield f"data: {_json.dumps(_done_payload, ensure_ascii=False)}\n\n"
                    iter_done = True
                    break
                elif kind == "error":
                    # 不 done,降级到原 OpenAI 路径(由外层 catch 触发 OCR)
                    raise RuntimeError(payload)
        except StopAsyncIteration:
            iter_done = True
            break
        except Exception as e:
            # v=20260824g 关键:raise 让外层 _ask_stream_with_images 接住异常,
            # 继续走 OpenAI → OCR 完整降级链路(而不是直接吞掉异常返回 spark-failed 死信)
            raise RuntimeError(f"spark_error: {str(e)[:160]}")


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _analyze_parametric_system(A, b, vars_list, params, sym_params) -> str:
    """分析含参线性方程组的解的情况，返回可直接注入 prompt 的结论文本。"""
    import sympy as sp
    n = A.rows
    lines = []
    if params:
        p_sym = sym_params[params[0]] if len(params) == 1 else list(sym_params.values())
        det = sp.factor(A.det())
        lines.append(f"系数行列式 det(A) = {sp.latex(det)}")
        # 求 det=0 的临界点
        critical = []
        try:
            crit = sp.solve(sp.Eq(det, 0), [p_sym] if len(params) == 1 else list(sym_params.values()))
            if isinstance(crit, dict):
                critical = list(crit.values())
            elif isinstance(crit, list):
                critical = crit
            critical = [c for c in critical if getattr(c, "is_real", True)]
        except Exception as e:
            print(f"[引擎校验] 求临界值异常：{e}")
            critical = []
        critical_strs = [f"{sp.latex(c)}" for c in critical]
        lines.append(f"令 det(A)=0，临界值：{', '.join(critical_strs) if critical_strs else '无'}")
        # 一般情况（det≠0）：唯一解
        try:
            sol, _ = A.gauss_jordan_solve(b)
            sol_str = ", ".join(f"{v}={sp.latex(sp.simplify(sol[i,0]))}" for i, v in enumerate(vars_list))
            lines.append(f"当参数不等于临界值时：方程组有唯一解，{sol_str}")
        except Exception:
            pass
        # 逐个临界点分析
        for c in critical:
            A_c = A.subs(p_sym, c) if len(params) == 1 else A.subs({k: c for k in p_sym})
            b_c = b.subs(p_sym, c) if len(params) == 1 else b.subs({k: c for k in p_sym})
            try:
                rA = A_c.rank()
            except Exception:
                rA = A_c.nullspace().rank() if False else None
            try:
                aug = A_c.row_join(b_c)
                rAb = aug.rank()
            except Exception:
                rAb = None
            c_latex = sp.latex(c)
            if rA is not None and rAb is not None:
                if rA == rAb == n:
                    lines.append(f"当参数 = {c_latex}：唯一解（r(A)=r(A|b)={rA}）")
                elif rA == rAb:
                    lines.append(f"当参数 = {c_latex}：无穷多解（r(A)=r(A|b)={rA} < n={n}）")
                else:
                    lines.append(f"当参数 = {c_latex}：无解（r(A)={rA} < r(A|b)={rAb}）")
    else:
        # 无参数
        try:
            sol, _ = A.gauss_jordan_solve(b)
            sol_str = ", ".join(f"{v}={sp.latex(sp.simplify(sol[i,0]))}" for i, v in enumerate(vars_list))
            lines.append(f"方程组有唯一解：{sol_str}")
        except ValueError:
            lines.append("方程组无解（不相容）")
        except Exception:
            ns = A.nullspace()
            if ns:
                lines.append("方程组有无穷多解（系数矩阵不满秩）")
            else:
                lines.append("方程组有唯一解")
    return "\n".join(lines)


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _extract_matrix_str(question: str) -> Optional[str]:
    """从问题中提取矩阵的字符串表示（支持 [[..],[..]]、[..; ..]、LaTeX pmatrix）。"""
    q = question
    # 1) 形式 A=[[1,2],[3,4]] 或 A = [[1,2],[3,4]]
    m = re.search(r"(?:A|矩阵)\s*=\s*(\[\[[\s\S]*?\]\])", q)
    if m:
        return m.group(1)
    # 1.5) 形式 矩阵 [[1,2],[3,4]]（无等号）
    m = re.search(r"(?:A|矩阵)\s*(\[\[[\s\S]*?\]\])", q)
    if m:
        return m.group(1)
    # 2) 形式 [1 2; 3 4] 或 A=[1 2; 3 4]
    m = re.search(r"(?:A|矩阵)\s*=\s*(\[[\d\s.,+\-;\[\]]*\])", q)
    if m and (";" in m.group(1) or " " in m.group(1)):
        return m.group(1)
    # 3) LaTeX pmatrix
    m = re.search(r"\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}", q)
    if m:
        return m.group(1)
    # 4) 裸 [[..],[..]] 形式
    m = re.search(r"(\[\[[\s\S]*?\]\])", q)
    if m:
        return m.group(1)
    return None


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
_SYMPY_ALLOWED_RE = re.compile(r"^[0-9A-Za-z_+\-*/^().,\s]*$")
_SYMPY_FUNC_CALL_RE = re.compile(r"[A-Za-z0-9_]+\s*\(")
_SYMPY_MAX_LEN = 200


def _check_sympify_input(expr) -> str:
    """sympy 输入白名单校验（防 RCE 沙箱逃逸，根因修复）：
    只允许数字/字母标识符与四则运算字符；拒绝双下划线（dunder 逃逸）、
    属性访问（点号仅限两数字之间的小数点）与函数调用（杜绝 factorial 类 DoS）。"""
    s = str(expr).strip()
    if not s or len(s) > _SYMPY_MAX_LEN or "__" in s or not _SYMPY_ALLOWED_RE.match(s):
        raise ValueError(f"非法表达式: {expr!r}")
    if _SYMPY_FUNC_CALL_RE.search(s):
        raise ValueError(f"不支持函数调用: {expr!r}")
    for m in re.finditer(r"\.", s):
        i = m.start()
        if not (i > 0 and i + 1 < len(s) and s[i - 1].isdigit() and s[i + 1].isdigit()):
            raise ValueError(f"非法表达式: {expr!r}")
    return s


def _safe_sympify(expr: str):
    """白名单校验后的 sympify：矩阵元素/系数入口统一走这里，杜绝任意表达式求值。"""
    import sympy as sp
    s = _check_sympify_input(expr)
    res = sp.sympify(s)
    if res.has(sp.nan, sp.zoo, sp.oo, -sp.oo):
        raise ValueError(f"非有限值: {expr!r}")
    return res


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _matrix_str_to_python(s: str) -> Optional[List[List]]:
    """把矩阵字符串转成 Python 二维列表（支持 [[a,b],[c,d]] / [a b; c d] / LaTeX 行）。"""
    import sympy as sp
    try:
        s = s.strip()
        if s.startswith("\\begin"):
            # LaTeX: 每行 \\ 分隔，& 分隔列
            rows = [r.strip().replace(" ", "") for r in s.split(r"\\") if r.strip()]
            mat = []
            for r in rows:
                cells = [c.strip() for c in r.split("&") if c.strip()]
                mat.append([_safe_sympify(c) for c in cells])
            return mat
        if s.startswith("[["):
            # Python 风格
            inner = s[2:-2]
            rows = [r for r in inner.split("],[") if r.strip()]
            mat = []
            for r in rows:
                cells = [c.strip() for c in r.split(",") if c.strip()]
                mat.append([_safe_sympify(c) for c in cells])
            return mat
        if ";" in s:
            # MATLAB 风格 [1 2; 3 4]
            inner = s.strip("[]")
            mat = []
            for r in inner.split(";"):
                cells = [c for c in re.split(r"[\s,]+", r.strip()) if c]
                mat.append([_safe_sympify(c) for c in cells])
            return mat
    except Exception:
        return None
    return None


# ── 以下定义自 routes_mistakes.py 迁移（跨模块共享，2026-09-11）──
def _parse_linear_system(question: str):
    """尝试从自然语言问题中解析线性方程组（支持含参）。

    返回 dict: {A, b, vars, params, sym_params}，失败返回 None。
    支持格式：
      "ax+y+z=1, x+ay+z=a, x+y+az=a^2"（含参数 a）
      "x+y=3, 2x-y=0"
      "x1+2x2=1; 3x1-x2=2"
    使用 sympy parse_expr + implicit_multiplication_application 处理隐式乘法（ax → a*x）。
    """
    import sympy as sp
    from sympy.parsing.sympy_parser import (
        parse_expr, standard_transformations,
        implicit_multiplication_application, convert_xor,
    )
    trans = standard_transformations + (implicit_multiplication_application, convert_xor)

    # 分离各等式
    eqs = re.split(r"[,，;；、\n]+|\band\b|且|与", question)
    eqs = [e for e in eqs if "=" in e]
    if len(eqs) < 2:
        return None

    parsed = []
    for eq in eqs:
        if "=" not in eq:
            return None
        # 中文替换为分隔符 |，取最后一个 | 之后作为等式主体
        # （避免"讨论含参数a的线性方程组 ax+y+z=1"中前缀混入等式）
        eq_clean = re.sub(r"[\u4e00-\u9fff]+", "|", eq)
        if "|" in eq_clean:
            parts = eq_clean.rsplit("|", 1)
            # 若最后一个 | 后为空（中文在末尾），取前一部分
            eq_clean = parts[1].strip() if parts[1].strip() else parts[0]
        # 清理残留的 | 与圆括号（防止"a^2|（唯一解"混入）
        eq_clean = eq_clean.replace("|", "").replace("（", "").replace("）", "").replace("(", "").replace(")", "").strip()
        if "=" not in eq_clean:
            return None
        lhs, rhs = eq_clean.split("=", 1)
        lhs, rhs = lhs.strip(), rhs.strip()
        if not lhs or not rhs:
            return None
        try:
            _check_sympify_input(lhs)
            _check_sympify_input(rhs)
            lhs_expr = parse_expr(lhs, transformations=trans)
            rhs_val = parse_expr(rhs, transformations=trans)
        except Exception:
            return None
        parsed.append({"lhs": lhs_expr, "rhs": rhs_val})

    # 确定变量集（优先 x,y,z 或 x1,x2,x3 模式）
    all_syms = set()
    for p in parsed:
        all_syms |= p["lhs"].free_symbols | p["rhs"].free_symbols
    sym_names = sorted([str(s) for s in all_syms])
    xyz = [s for s in sym_names if re.fullmatch(r"[xyz]", s)]
    xn = [s for s in sym_names if re.fullmatch(r"x\d+", s)]
    if len(xyz) == len(parsed):
        vars_list = sorted(xyz, key=lambda v: "xyz".index(v))
    elif len(xn) == len(parsed):
        vars_list = sorted(xn, key=lambda v: int(v[1:]))
    else:
        return None  # 无法可靠确定变量集
    params = [s for s in sym_names if s not in vars_list]

    # 构建系数矩阵与 b
    n = len(parsed)
    A = sp.zeros(n, n)
    b = sp.zeros(n, 1)
    for i, p in enumerate(parsed):
        lhs_exp = sp.expand(p["lhs"])
        for j, v in enumerate(vars_list):
            A[i, j] = lhs_exp.coeff(sp.Symbol(v))
        const = lhs_exp.subs({sp.Symbol(v): 0 for v in vars_list})
        b[i, 0] = p["rhs"] - const
    return {"A": A, "b": b, "vars": vars_list, "params": params,
            "sym_params": {v: sp.Symbol(v) for v in params}}


# 导出全部命名（含下划线私有名），保证路由模块 `from .core import *` 与单文件语义一致
__all__ = [k for k in globals() if not k.startswith("__")]
