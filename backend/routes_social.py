"""routes_social.py —— 用户搜索、好友、私信、群组、动态（原 backend/main.py 第 7540–8621 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）


class FriendRequest(BaseModel):
    """好友请求模型（随本模块迁移，原位于学习小精灵分节末尾）。"""
    to_username: str


class FriendRequestAction(BaseModel):
    action: str  # "accept" or "reject"


@app.get("/api/users/search")
def search_users(q: str = "", user: dict = __import__('fastapi').Depends(require_user)):
    """搜索用户（按用户名或昵称）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    if not q or len(q.strip()) < 1:
        return {"users": []}
    db = get_db()
    rows = db.execute(
        "SELECT id, username, nickname, avatar FROM users WHERE (username LIKE ? OR nickname LIKE ?) AND id != ? LIMIT 20",
        (f"%{q.strip()}%", f"%{q.strip()}%", user["id"])
    ).fetchall()
    return {
        "users": [
            {"id": r[0], "username": r[1], "nickname": r[2] or r[1], "avatar": r[3] or r[1][0].upper()}
            for r in rows
        ]
    }


@app.post("/api/friends/request")
def send_friend_request(req: FriendRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """发送好友申请"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    to_user = db.execute(
        "SELECT id, username, nickname FROM users WHERE username = ? OR nickname = ?",
        (req.to_username, req.to_username)
    ).fetchone()
    if not to_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if to_user[0] == user["id"]:
        raise HTTPException(status_code=400, detail="不能添加自己为好友")
    # 检查是否已是好友或已有待处理申请
    existing = db.execute(
        "SELECT id, status FROM friends WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)",
        (user["id"], to_user[0], to_user[0], user["id"])
    ).fetchone()
    if existing:
        if existing[1] == "accepted":
            raise HTTPException(status_code=409, detail="已经是好友")
        elif existing[1] == "pending":
            if existing[0]:  # 检查是谁发起的
                raise HTTPException(status_code=409, detail="已有待处理的好友申请")
    now = datetime.now().isoformat()
    db.execute(
        "INSERT INTO friends(from_user_id, to_user_id, status, created, updated) VALUES(?,?,?,?,?)",
        (user["id"], to_user[0], "pending", now, now)
    )
    db.commit()
    # 实时通知接收方有新的好友申请
    SSE_HUB.publish(to_user[0], {"type": "friend_request", "from_user_id": user["id"],
                                 "from_username": user.get("username", "")})
    return {"ok": True, "message": f"已向 {to_user[2] or to_user[1]} 发送好友申请"}


@app.get("/api/friends/requests")
def get_friend_requests(user: dict = __import__('fastapi').Depends(require_user)):
    """获取收到的好友申请"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    rows = db.execute(
        """SELECT f.id, f.from_user_id, u.username, u.nickname, u.avatar, f.status, f.created
           FROM friends f JOIN users u ON f.from_user_id = u.id
           WHERE f.to_user_id = ? AND f.status = 'pending'
           ORDER BY f.id DESC""",
        (user["id"],)
    ).fetchall()
    return {
        "requests": [
            {"id": r[0], "from_user_id": r[1], "username": r[2],
             "nickname": r[3] or r[2], "avatar": r[4] or r[2][0].upper(), "created": r[6]}
            for r in rows
        ]
    }


@app.put("/api/friends/requests/{request_id}")
def handle_friend_request(request_id: int, req: FriendRequestAction,
                          user: dict = __import__('fastapi').Depends(require_user)):
    """接受或拒绝好友申请"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    if req.action not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="action 必须是 accept 或 reject")
    db = get_db()
    row = db.execute(
        "SELECT id, from_user_id, to_user_id FROM friends WHERE id = ? AND to_user_id = ? AND status = 'pending'",
        (request_id, user["id"])
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="申请不存在或已处理")
    now = datetime.now().isoformat()
    if req.action == "accept":
        db.execute("UPDATE friends SET status = 'accepted', updated = ? WHERE id = ?", (now, request_id))
    else:
        db.execute("UPDATE friends SET status = 'rejected', updated = ? WHERE id = ?", (now, request_id))
    db.commit()
    # 实时通知申请发起方结果
    SSE_HUB.publish(row[1], {"type": "friend_request_result", "action": req.action,
                             "to_user_id": user["id"], "request_id": request_id})
    return {"ok": True, "action": req.action}


@app.get("/api/friends")
def list_friends(user: dict = __import__('fastapi').Depends(require_user)):
    """获取好友列表"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    rows = db.execute(
        """SELECT u.id, u.username, u.nickname, u.avatar, f.created
           FROM friends f JOIN users u
           ON (f.from_user_id = u.id OR f.to_user_id = u.id) AND u.id != ?
           WHERE (f.from_user_id = ? OR f.to_user_id = ?) AND f.status = 'accepted'
           ORDER BY f.updated DESC""",
        (user["id"], user["id"], user["id"])
    ).fetchall()
    friends = []
    for r in rows:
        # 获取未读消息数
        unread = db.execute(
            "SELECT COUNT(*) FROM messages WHERE from_user_id = ? AND to_user_id = ? AND is_read = 0",
            (r[0], user["id"])
        ).fetchone()[0]
        friends.append({
            "id": r[0], "username": r[1], "nickname": r[2] or r[1],
            "avatar": r[3] or r[1][0].upper(), "since": r[4], "unread": unread
        })
    return {"friends": friends}


@app.delete("/api/friends/{friend_id}")
def remove_friend(friend_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    """删除好友"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    db.execute(
        "DELETE FROM friends WHERE ((from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)) AND status='accepted'",
        (user["id"], friend_id, friend_id, user["id"])
    )
    db.commit()
    return {"ok": True, "message": "已删除好友"}


# ---------- 私信系统 ----------

class MessageRequest(BaseModel):
    to_user_id: Optional[int] = None
    group_id: Optional[int] = None
    content: str = ""
    type: str = "text"          # text | image
    image_url: str = ""
    reply_to: Optional[int] = None


def _serialize_message(r) -> dict:
    """将消息行序列化为字典（兼容新旧字段）。列顺序：
    id, from_user_id, to_user_id, group_id, reply_to, content, type, image_url, is_read, deleted, recalled, created"""
    return {
        "id": r[0], "from_user_id": r[1], "to_user_id": r[2],
        "group_id": r[3], "reply_to": r[4], "content": r[5],
        "type": r[6] or "text", "image_url": r[7] or "",
        "is_read": bool(r[8]), "deleted": bool(r[9]), "recalled": bool(r[10]),
        "created": r[11],
    }


def _msg_recipients(db, msg_id: int, sender_id: int, group_id=None, to_user_id=None):
    """计算应收到该消息实时推送的用户 id 列表"""
    targets = []
    if group_id:
        rows = db.execute("SELECT user_id FROM group_members WHERE group_id = ?", (group_id,)).fetchall()
        targets = [row[0] for row in rows]
    elif to_user_id:
        targets = [to_user_id, sender_id]
    return targets


@app.get("/api/messages/unread")
def get_unread_count(user: dict = __import__('fastapi').Depends(require_user)):
    """获取未读消息总数（必须在 /{friend_id} 之前定义以避免路径冲突）"""
    if user["id"] == 0:
        return {"count": 0}
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) FROM messages WHERE to_user_id = ? AND is_read = 0 AND recalled = 0 AND deleted = 0",
        (user["id"],)
    ).fetchone()
    return {"count": row[0] if row else 0}


@app.post("/api/messages")
def send_message(req: MessageRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """发送私信或群消息（支持文本/图片/回复）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")

    is_group = req.group_id is not None
    is_image = req.type == "image"
    content = (req.content or "").strip()
    image_url = (req.image_url or "").strip()

    if is_image:
        if not image_url:
            raise HTTPException(status_code=400, detail="图片消息缺少 image_url")
        # 兼容旧库 content NOT NULL：图片消息给个占位内容
        if not content:
            content = "[图片]"
    else:
        if not content:
            raise HTTPException(status_code=400, detail="消息不能为空")

    db = get_db()
    if is_group:
        member = db.execute(
            "SELECT id FROM group_members WHERE group_id=? AND user_id=?",
            (req.group_id, user["id"])
        ).fetchone()
        if not member:
            raise HTTPException(status_code=403, detail="你不在该群组中")
    else:
        if not req.to_user_id:
            raise HTTPException(status_code=400, detail="缺少接收人")
        friend = db.execute(
            "SELECT id FROM friends WHERE ((from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)) AND status='accepted'",
            (user["id"], req.to_user_id, req.to_user_id, user["id"])
        ).fetchone()
        if not friend:
            raise HTTPException(status_code=403, detail="只能给好友发送消息")

    now = datetime.now().isoformat()
    # 群消息无直接接收人：用 0 作为哨兵，兼容旧库中 to_user_id NOT NULL 约束
    to_user_id_val = req.to_user_id if req.to_user_id is not None else (0 if is_group else None)
    cur = db.execute(
        """INSERT INTO messages(from_user_id, to_user_id, group_id, reply_to, content, type, image_url, created)
           VALUES(?,?,?,?,?,?,?,?)""",
        (user["id"], to_user_id_val, req.group_id, req.reply_to, content, req.type, image_url, now)
    )
    db.commit()
    msg_id = cur.lastrowid
    row = db.execute(
        """SELECT id, from_user_id, to_user_id, group_id, reply_to, content, type, image_url, is_read, deleted, recalled, created
           FROM messages WHERE id = ?""",
        (msg_id,)
    ).fetchone()
    msg = _serialize_message(row)

    # 实时推送
    targets = _msg_recipients(db, msg_id, user["id"], group_id=req.group_id, to_user_id=req.to_user_id)
    evt_type = "new_group_message" if is_group else "new_private_message"
    SSE_HUB.publish_many(targets, {"type": evt_type, "message": msg, "from_user_id": user["id"]})

    return {"ok": True, "message": "发送成功", "data": msg}


@app.get("/api/messages/{friend_id}")
def get_messages(friend_id: int, user: dict = __import__('fastapi').Depends(require_user),
                 limit: int = 100, before_id: int = 0):
    """获取与好友的聊天记录"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    # 标记对方发来的消息为已读
    db.execute(
        "UPDATE messages SET is_read = 1 WHERE from_user_id = ? AND to_user_id = ? AND is_read = 0",
        (friend_id, user["id"])
    )
    db.commit()
    if before_id > 0:
        rows = db.execute(
            """SELECT id, from_user_id, to_user_id, group_id, reply_to, content, type, image_url, is_read, deleted, recalled, created
               FROM messages
               WHERE ((from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?))
               AND id < ?
               ORDER BY id DESC LIMIT ?""",
            (user["id"], friend_id, friend_id, user["id"], before_id, limit)
        ).fetchall()
    else:
        rows = db.execute(
            """SELECT id, from_user_id, to_user_id, group_id, reply_to, content, type, image_url, is_read, deleted, recalled, created
               FROM messages
               WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)
               ORDER BY id DESC LIMIT ?""",
            (user["id"], friend_id, friend_id, user["id"], limit)
        ).fetchall()
    return {"messages": [_serialize_message(r) for r in reversed(rows)]}


@app.delete("/api/messages/{message_id}")
def delete_message(message_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    """删除消息（仅发送者可删；群消息需是群成员）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    row = db.execute(
        "SELECT id, from_user_id, group_id, to_user_id FROM messages WHERE id = ?",
        (message_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="消息不存在")
    if row[1] != user["id"]:
        raise HTTPException(status_code=403, detail="只能删除自己发送的消息")
    db.execute("UPDATE messages SET deleted = 1 WHERE id = ?", (message_id,))
    db.commit()
    # 推送删除事件
    targets = _msg_recipients(db, message_id, user["id"], group_id=row[2], to_user_id=row[3])
    SSE_HUB.publish_many(targets, {"type": "message_deleted", "message_id": message_id})
    return {"ok": True}


@app.post("/api/messages/{message_id}/recall")
def recall_message(message_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    """撤回消息（仅发送者，2 分钟内）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    row = db.execute(
        "SELECT id, from_user_id, group_id, to_user_id, created FROM messages WHERE id = ?",
        (message_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="消息不存在")
    if row[1] != user["id"]:
        raise HTTPException(status_code=403, detail="只能撤回自己发送的消息")
    # 2 分钟窗口
    # v=20260911 根因修复：原 `except Exception: pass` 会把下面的 HTTPException 一并吞掉，
    # 导致 2 分钟撤回窗口形同虚设。这里只兜住时间戳解析失败（脏数据），业务异常正常抛出。
    try:
        created_dt = datetime.fromisoformat(row[4])
    except (ValueError, TypeError):
        created_dt = None
    if created_dt is not None and (datetime.now() - created_dt).total_seconds() > 120:
        raise HTTPException(status_code=400, detail="消息已超过 2 分钟，无法撤回")
    db.execute("UPDATE messages SET recalled = 1 WHERE id = ?", (message_id,))
    db.commit()
    targets = _msg_recipients(db, message_id, user["id"], group_id=row[2], to_user_id=row[3])
    SSE_HUB.publish_many(targets, {"type": "message_recalled", "message_id": message_id, "from_user_id": user["id"]})
    return {"ok": True}


# ---------- 群聊系统 ----------

class GroupCreateRequest(BaseModel):
    name: str
    member_usernames: List[str] = []   # 邀请的用户名/昵称列表


class GroupMemberRequest(BaseModel):
    username: str = ""                  # 用户名或昵称


def _resolve_user(db, identifier: str):
    return db.execute(
        "SELECT id, username, nickname, avatar FROM users WHERE username = ? OR nickname = ?",
        (identifier, identifier)
    ).fetchone()


@app.post("/api/groups")
def create_group(req: GroupCreateRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """创建群组（创建者自动成为 owner 并加入）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="群名称不能为空")
    if len(name) > 30:
        raise HTTPException(status_code=400, detail="群名称过长")
    db = get_db()
    now = datetime.now().isoformat()
    avatar = name[0].upper()
    cur = db.execute(
        "INSERT INTO groups(name, owner_id, avatar, created) VALUES(?,?,?,?)",
        (name, user["id"], avatar, now)
    )
    group_id = cur.lastrowid
    # 加入创建者
    db.execute(
        "INSERT OR IGNORE INTO group_members(group_id, user_id, role, joined) VALUES(?,?,?,?)",
        (group_id, user["id"], "owner", now)
    )
    # 邀请成员（按用户名/昵称解析，自动加入；若已是好友更合理，这里不强制）
    added = []
    for uname in req.member_usernames:
        u = _resolve_user(db, uname.strip())
        if u and u[0] != user["id"]:
            db.execute(
                "INSERT OR IGNORE INTO group_members(group_id, user_id, role, joined) VALUES(?,?,?,?)",
                (group_id, u[0], "member", now)
            )
            added.append(u[1])
    db.commit()
    return {"ok": True, "id": group_id, "name": name, "owner_id": user["id"], "members_added": added}


@app.get("/api/groups")
def list_groups(user: dict = __import__('fastapi').Depends(require_user)):
    """获取我加入的群列表"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    rows = db.execute(
        """SELECT g.id, g.name, g.owner_id, g.avatar, g.created,
                  (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as mc
           FROM groups g JOIN group_members m ON g.id = m.group_id
           WHERE m.user_id = ? ORDER BY g.created DESC""",
        (user["id"],)
    ).fetchall()
    groups = []
    for r in rows:
        members = db.execute(
            """SELECT u.id, u.username, u.nickname, u.avatar, m.role
               FROM group_members m JOIN users u ON m.user_id = u.id
               WHERE m.group_id = ? ORDER BY m.role = 'owner' DESC, m.joined ASC""",
            (r[0],)
        ).fetchall()
        # 计算未读消息数（基于 last_read_msg_id）
        last_read = db.execute(
            "SELECT last_read_msg_id FROM group_members WHERE group_id=? AND user_id=?",
            (r[0], user["id"])
        ).fetchone()
        last_id = last_read[0] if last_read else 0
        unread = db.execute(
            "SELECT COUNT(*) FROM messages WHERE group_id=? AND id > ? AND deleted=0 AND recalled=0",
            (r[0], last_id)
        ).fetchone()[0]
        groups.append({
            "id": r[0], "name": r[1], "owner_id": r[2],
            "avatar": r[3] or r[1][0].upper(), "created": r[4], "member_count": r[5],
            "unread": unread,
            "members": [
                {"id": mm[0], "username": mm[1], "nickname": mm[2] or mm[1],
                 "avatar": mm[3] or mm[1][0].upper(), "role": mm[4]}
                for mm in members
            ],
        })
    return {"groups": groups}


@app.get("/api/groups/{group_id}/members")
def list_group_members(group_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    member = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                        (group_id, user["id"])).fetchone()
    if not member:
        raise HTTPException(status_code=403, detail="你不在该群组中")
    rows = db.execute(
        """SELECT u.id, u.username, u.nickname, u.avatar, m.role, m.joined
           FROM group_members m JOIN users u ON m.user_id = u.id
           WHERE m.group_id = ? ORDER BY m.role = 'owner' DESC, m.joined ASC""",
        (group_id,)
    ).fetchall()
    return {"members": [
        {"id": r[0], "username": r[1], "nickname": r[2] or r[1],
         "avatar": r[3] or r[1][0].upper(), "role": r[4], "joined": r[5]}
        for r in rows
    ]}


@app.post("/api/groups/{group_id}/members")
def add_group_member(group_id: int, req: GroupMemberRequest,
                     user: dict = __import__('fastapi').Depends(require_user)):
    """邀请成员入群（仅群主可操作）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    g = db.execute("SELECT owner_id FROM groups WHERE id = ?", (group_id,)).fetchone()
    if not g:
        raise HTTPException(status_code=404, detail="群组不存在")
    if g[0] != user["id"]:
        raise HTTPException(status_code=403, detail="仅群主可邀请成员")
    u = _resolve_user(db, req.username.strip())
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if u[0] == user["id"]:
        raise HTTPException(status_code=400, detail="不能邀请自己")
    now = datetime.now().isoformat()
    db.execute("INSERT OR IGNORE INTO group_members(group_id, user_id, role, joined) VALUES(?,?,?,?)",
               (group_id, u[0], "member", now))
    db.commit()
    # 通知被邀请者
    SSE_HUB.publish(u[0], {"type": "added_to_group", "group_id": group_id, "by": user["id"]})
    return {"ok": True, "added": u[1]}


@app.delete("/api/groups/{group_id}/members/{target_user_id}")
def remove_group_member(group_id: int, target_user_id: int,
                        user: dict = __import__('fastapi').Depends(require_user)):
    """移出成员（群主）或退出群（自己）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    g = db.execute("SELECT owner_id FROM groups WHERE id = ?", (group_id,)).fetchone()
    if not g:
        raise HTTPException(status_code=404, detail="群组不存在")
    is_owner = g[0] == user["id"]
    is_self = target_user_id == user["id"]
    if not (is_owner or is_self):
        raise HTTPException(status_code=403, detail="无权操作")
    # 群主不能把自己移除（需解散群）
    if is_self and is_owner and target_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="群主请先转让或解散群组")
    db.execute("DELETE FROM group_members WHERE group_id=? AND user_id=?",
               (group_id, target_user_id))
    db.commit()
    return {"ok": True, "removed": target_user_id}


@app.delete("/api/groups/{group_id}")
def delete_group(group_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    """解散群聊（仅群主可操作）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    g = db.execute("SELECT owner_id FROM groups WHERE id = ?", (group_id,)).fetchone()
    if not g:
        raise HTTPException(status_code=404, detail="群组不存在")
    if g[0] != user["id"]:
        raise HTTPException(status_code=403, detail="仅群主可解散群组")
    # 获取所有成员用于通知
    members = db.execute("SELECT user_id FROM group_members WHERE group_id = ?", (group_id,)).fetchall()
    # 删除关联数据
    db.execute("DELETE FROM group_members WHERE group_id = ?", (group_id,))
    db.execute("DELETE FROM messages WHERE group_id = ?", (group_id,))
    db.execute("DELETE FROM groups WHERE id = ?", (group_id,))
    db.commit()
    # 通知所有成员群已解散
    for m in members:
        if m[0] != user["id"]:
            SSE_HUB.publish(m[0], {"type": "group_deleted", "group_id": group_id})
    return {"ok": True, "message": "群组已解散"}


@app.post("/api/groups/{group_id}/messages")
def send_group_message(group_id: int, req: MessageRequest,
                       user: dict = __import__('fastapi').Depends(require_user)):
    """发送群消息（复用 /api/messages 逻辑）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    req.group_id = group_id
    # 校验群成员
    db = get_db()
    member = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                        (group_id, user["id"])).fetchone()
    if not member:
        raise HTTPException(status_code=403, detail="你不在该群组中")
    # 复用发送逻辑：直接构造调用
    return send_message(req, user)


@app.get("/api/groups/{group_id}/messages")
def get_group_messages(group_id: int, user: dict = __import__('fastapi').Depends(require_user),
                       limit: int = 100, before_id: int = 0):
    """获取群消息记录（群成员可见）；同时自动标记为已读"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    member = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                        (group_id, user["id"])).fetchone()
    if not member:
        raise HTTPException(status_code=403, detail="你不在该群组中")
    if before_id > 0:
        rows = db.execute(
            """SELECT id, from_user_id, to_user_id, group_id, reply_to, content, type, image_url, is_read, deleted, recalled, created
               FROM messages WHERE group_id = ? AND id < ? ORDER BY id DESC LIMIT ?""",
            (group_id, before_id, limit)
        ).fetchall()
    else:
        rows = db.execute(
            """SELECT id, from_user_id, to_user_id, group_id, reply_to, content, type, image_url, is_read, deleted, recalled, created
               FROM messages WHERE group_id = ? ORDER BY id DESC LIMIT ?""",
            (group_id, limit)
        ).fetchall()
    # 自动标记已读
    max_id = rows[0][0] if rows else 0
    if max_id > 0:
        db.execute(
            "UPDATE group_members SET last_read_msg_id = MAX(last_read_msg_id, ?) WHERE group_id=? AND user_id=?",
            (max_id, group_id, user["id"])
        )
        db.commit()
    return {"messages": [_serialize_message(r) for r in reversed(rows)]}


@app.post("/api/groups/{group_id}/read")
def mark_group_read(group_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    """标记群消息已读：记录当前用户在该群最后读到的消息 ID"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    member = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                        (group_id, user["id"])).fetchone()
    if not member:
        raise HTTPException(status_code=403, detail="你不在该群组中")
    max_id = db.execute(
        "SELECT COALESCE(MAX(id), 0) FROM messages WHERE group_id=? AND deleted=0 AND recalled=0",
        (group_id,)
    ).fetchone()[0]
    db.execute(
        "UPDATE group_members SET last_read_msg_id = MAX(last_read_msg_id, ?) WHERE group_id=? AND user_id=?",
        (max_id, group_id, user["id"])
    )
    db.commit()
    return {"ok": True, "last_read_msg_id": max_id}


# ---------- 动态（朋友圈）----------

class MomentRequest(BaseModel):
    content: str = ""
    image_url: str = ""


@app.post("/api/moments")
def publish_moment(req: MomentRequest, user: dict = __import__('fastapi').Depends(require_user)):
    """发布动态（文字 + 可选图片）"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    content = (req.content or "").strip()
    image_url = (req.image_url or "").strip()
    if not content and not image_url:
        raise HTTPException(status_code=400, detail="动态内容不能为空")
    db = get_db()
    now = datetime.now().isoformat()
    cur = db.execute(
        "INSERT INTO moments(user_id, content, image_url, created) VALUES(?,?,?,?)",
        (user["id"], content, image_url, now)
    )
    db.commit()
    moment_id = cur.lastrowid
    row = db.execute(
        "SELECT id, user_id, content, image_url, created FROM moments WHERE id = ?",
        (moment_id,)
    ).fetchone()
    moment = {"id": row[0], "user_id": row[1], "content": row[2], "image_url": row[3] or "", "created": row[4]}
    # 推送给所有好友
    friends = db.execute(
        "SELECT from_user_id, to_user_id FROM friends WHERE (from_user_id=? OR to_user_id=?) AND status='accepted'",
        (user["id"], user["id"])
    ).fetchall()
    friend_ids = set()
    for f in friends:
        friend_ids.add(f[0] if f[1] == user["id"] else f[1])
    SSE_HUB.publish_many(list(friend_ids), {"type": "new_moment", "moment": moment, "from_user_id": user["id"]})
    return {"ok": True, "moment": moment}


@app.get("/api/moments")
def list_moments(user: dict = __import__('fastapi').Depends(require_user), limit: int = 50):
    """动态流：自己 + 好友的动态，按时间倒序"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    # 自己 + 好友的 id 集合
    friend_rows = db.execute(
        "SELECT from_user_id, to_user_id FROM friends WHERE (from_user_id=? OR to_user_id=?) AND status='accepted'",
        (user["id"], user["id"])
    ).fetchall()
    ids = {user["id"]}
    for f in friend_rows:
        ids.add(f[0] if f[1] == user["id"] else f[1])
    placeholders = ",".join("?" * len(ids))
    rows = db.execute(
        f"""SELECT m.id, m.user_id, m.content, m.image_url, m.created,
                   u.username, u.nickname, u.avatar
            FROM moments m JOIN users u ON m.user_id = u.id
            WHERE m.user_id IN ({placeholders})
            ORDER BY m.id DESC LIMIT ?""",
        (*ids, limit)
    ).fetchall()
    return {"moments": [
        {"id": r[0], "user_id": r[1], "content": r[2], "image_url": r[3] or "",
         "created": r[4], "username": r[5], "nickname": r[6] or r[5],
         "avatar": r[7] or r[5][0].upper(), "is_self": r[1] == user["id"]}
        for r in rows
    ]}


@app.delete("/api/moments/{moment_id}")
def delete_moment(moment_id: int, user: dict = __import__('fastapi').Depends(require_user)):
    """删除自己的动态"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    db = get_db()
    row = db.execute("SELECT user_id FROM moments WHERE id = ?", (moment_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="动态不存在")
    if row[0] != user["id"]:
        raise HTTPException(status_code=403, detail="只能删除自己的动态")
    db.execute("DELETE FROM moments WHERE id = ?", (moment_id,))
    db.commit()
    return {"ok": True}


# ==================== 多模态公式识别（图片 → LaTeX / 矩阵计算） ====================
# 技术先进性补强：手写公式拍照识别、图片转 LaTeX、手写矩阵拍照自动计算。
# 使用 OpenAI 兼容的多模态接口，base64 传图；模型/地址可通过环境变量配置。





# v=20260824f 科大讯飞星火图片理解流式(优先路径 — 配置了 SPARK_IMAGE_* 时使用)




# v=20260922o 图片问答流式分支:多模态视觉模型一次性生成,模拟 SSE 推送





