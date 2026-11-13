/**
 * 社交中心：私信 / 群聊 / 动态 + SSE 实时推送
 * 依赖：App（app.js）、Auth（auth.js）
 * 超低延迟：通过 EventSource 订阅 /api/events，服务器主动推送。
 */

App.Social = {
  tab: 'private',
  groups: [],
  moments: [],
  nameMap: {},            // group 消息：userId -> 昵称
  replyTo: null,          // {id, preview}
  momentImage: '',       // 待发布动态的图片 URL
  msgCache: {},          // 消息 id -> 消息对象（用于回复预览）
  groupUnread: {},       // groupId -> 未读数
  sse: null,
  sseConnected: false,

  apiBase() { return (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || ''; },

  fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      if (sameDay) return hm;
      return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
    } catch (e) { return ''; }
  },

  // ============ 标签切换 ============
  switchTab(tab) {
    if (!document.getElementById('private-sidebar')) return; // DOM 已被登录态切换替换时跳过
    this.tab = tab;
    localStorage.setItem('la_socialTab', tab);
    document.querySelectorAll('.social-tab').forEach(b => b.classList.toggle('active', b.dataset.socialTab === tab));
    document.getElementById('private-sidebar').style.display = (tab === 'private') ? '' : 'none';
    document.getElementById('groups-sidebar').style.display = (tab === 'groups') ? '' : 'none';
    document.getElementById('social-chat-layout').style.display = (tab === 'private' || tab === 'groups') ? '' : 'none';
    document.getElementById('social-moments').style.display = (tab === 'moments') ? '' : 'none';
    if (tab === 'groups') this.loadGroups();
    if (tab === 'moments') this.loadMoments();
  },

  // ============ 群聊 ============
  async loadGroups() {
    if (!Auth.isLoggedIn) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/groups');
      if (!resp.ok) return;
      const data = await resp.json();
      this.groups = data.groups || [];
      const countEl = document.getElementById('groups-count');
      if (countEl) countEl.textContent = this.groups.length;
      const list = document.getElementById('groups-list');
      if (!list) return;
      if (!this.groups.length) {
        list.innerHTML = '<div class="friends-empty">还没有群聊，点击上方创建</div>';
        return;
      }
      list.innerHTML = this.groups.map(g => {
        const unread = this.groupUnread[g.id] ?? g.unread ?? 0;
        const initial = (g.avatar || (g.name && g.name[0]) || '👥').toUpperCase();
        return `<div class="friend-list-item group-list-item${App._currentChatGroup === g.id ? ' active' : ''}" data-group-id="${g.id}">
          <div class="friend-list-avatar">${App._esc(initial)}${unread ? '<span class="unread-dot"></span>' : ''}</div>
          <div class="friend-list-info">
            <div class="friend-list-nickname">${App._esc(g.name)}</div>
            <div class="friend-list-username">${g.member_count} 位成员</div>
          </div>
          ${unread ? `<span class="friend-list-unread">${unread}</span>` : ''}
        </div>`;
      }).join('');
    } catch (e) { /* ignore */ }
  },

  showCreateGroup() {
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-members-input').value = '';
    document.getElementById('group-create-error').textContent = '';
    document.getElementById('group-create-overlay').style.display = 'flex';
    this._renderFriendPicker();
  },

  async _renderFriendPicker() {
    const container = document.getElementById('group-friend-picker');
    if (!container) return;
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted, #999);font-size:13px;">加载中…</div>';
    this._selectedFriends = new Set();
    this._pickerFriends = [];
    try {
      const resp = await Auth.fetchWithAuth('/api/friends');
      if (!resp.ok) throw new Error('load failed');
      const data = await resp.json();
      this._pickerFriends = data.friends || [];
    } catch (e) {
      this._pickerFriends = [];
    }
    if (!this._pickerFriends.length) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted, #999);font-size:13px;">暂无好友，可手动输入</div>';
      this._updateSelectedCount();
      return;
    }
    // 排除自己
    const selfId = Auth.user?.id || 0;
    const filtered = this._pickerFriends.filter(f => f.id !== selfId);
    container.innerHTML = filtered.map(f => `
      <label style="display:flex;align-items:center;gap:10px;padding:7px 14px;cursor:pointer;font-size:14px;user-select:none;"
             onmouseenter="this.style.background='var(--hover-bg, rgba(0,0,0,0.04))'"
             onmouseleave="this.style.background=''">
        <input type="checkbox" value="${f.username || f.id}" data-friend-id="${f.id}"
               onchange="App.Social._onFriendToggle(this)" style="accent-color:var(--accent, #4f46e5);">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--accent-light, #eef2ff);color:var(--accent, #4f46e5);font-size:12px;font-weight:600;flex-shrink:0;">${App._esc((f.nickname || f.username || '?')[0].toUpperCase())}</span>
        <span style="font-weight:500;">${App._esc(f.nickname || f.username || '')}</span>
        <span style="font-size:11px;color:var(--text-muted, #999);">@${App._esc(f.username || '')}</span>
      </label>
    `).join('');
    this._updateSelectedCount();
  },

  _onFriendToggle(cb) {
    if (cb.checked) {
      this._selectedFriends.add(cb.value);
    } else {
      this._selectedFriends.delete(cb.value);
    }
    this._updateSelectedCount();
  },

  _selectAllFriends() {
    if (!this._pickerFriends) return;
    const selfId = Auth.user?.id || 0;
    this._selectedFriends.clear();
    this._pickerFriends.filter(f => f.id !== selfId).forEach(f => this._selectedFriends.add(f.username || f.id));
    document.querySelectorAll('#group-friend-picker input[type="checkbox"]').forEach(cb => cb.checked = true);
    this._updateSelectedCount();
  },

  _clearFriendSelection() {
    this._selectedFriends.clear();
    document.querySelectorAll('#group-friend-picker input[type="checkbox"]').forEach(cb => cb.checked = false);
    this._updateSelectedCount();
  },

  _updateSelectedCount() {
    const countEl = document.getElementById('group-selected-count');
    if (countEl) countEl.textContent = `已选 ${this._selectedFriends.size} 人`;
  },

  async createGroup() {
    const name = document.getElementById('group-name-input').value.trim();
    const raw = document.getElementById('group-members-input').value.trim();
    const errEl = document.getElementById('group-create-error');
    if (!name) { errEl.textContent = '请输入群名称'; return; }
    // 合并：勾选的好友 + 手动输入
    const selected = Array.from(this._selectedFriends || []);
    const manual = raw ? raw.split(/[,，\s]+/).filter(Boolean) : [];
    const member_usernames = [...new Set([...selected, ...manual])];
    try {
      const resp = await Auth.fetchWithAuth('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name, member_usernames })
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || '创建失败');
      }
      const data = await resp.json();
      document.getElementById('group-create-overlay').style.display = 'none';
      await this.loadGroups();
      this.switchTab('groups');
      this.openGroupChat(data.id);
    } catch (e) {
      errEl.textContent = e.message;
    }
  },

  async openGroupChat(groupId) {
    App._chatMode = 'group';
    App._currentChatGroup = groupId;
    App._currentChatFriend = null;
    document.querySelectorAll('.friend-list-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.group-list-item').forEach(el =>
      el.classList.toggle('active', parseInt(el.dataset.groupId, 10) === groupId));
    // 立即清除本地未读并刷新左侧列表
    this.groupUnread[groupId] = 0;
    await this.loadGroups();
    const g = (this.groups || []).find(x => x.id === groupId);
    document.getElementById('friends-chat-empty').style.display = 'none';
    document.getElementById('friends-chat-window').style.display = '';
    document.getElementById('chat-window-avatar').textContent = g ? ((g.avatar || g.name[0]).toUpperCase()) : '👥';
    document.getElementById('chat-window-name').textContent = g ? g.name : '群聊';
    document.getElementById('chat-window-username').textContent = g ? `${g.member_count} 位成员` : '';
    // 显示/隐藏群主管理按钮
    const menuBtn = document.getElementById('chat-group-menu-btn');
    if (menuBtn) menuBtn.style.display = (g && g.owner_id === Auth.user.id) ? 'flex' : 'none';
    this.nameMap = {};
    if (g && g.members) g.members.forEach(mm => { this.nameMap[mm.id] = mm.nickname || mm.username; });
    this.cancelReply();
    await this.loadGroupMessages();
    // 加载消息后再次刷新列表，确保服务器端未读已同步清除
    await this.loadGroups();
    App._startChatPolling();
  },

  async loadGroupMessages() {
    if (!App._currentChatGroup) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/groups/${App._currentChatGroup}/messages`);
      if (!resp.ok) throw new Error('加载失败');
      const data = await resp.json();
      this.renderChat(data.messages, this._ctx());
    } catch (e) {
      document.getElementById('chat-window-messages').innerHTML = `<div class="friends-empty">加载失败: ${e.message}</div>`;
    }
  },

  async pollGroupMessages() {
    if (App._chatMode !== 'group' || !App._currentChatGroup) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/groups/${App._currentChatGroup}/messages`);
      if (!resp.ok) return;
      const data = await resp.json();
      const el = document.getElementById('chat-window-messages');
      const cur = el.querySelectorAll('.chat-msg').length;
      const lastId = el.querySelector('.chat-msg:last-child')?.dataset.msgId || '';
      const newLast = data.messages.length ? data.messages[data.messages.length - 1].id : '';
      if (data.messages.length !== cur || lastId !== newLast) {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        this.renderChat(data.messages, this._ctx());
        if (atBottom) el.scrollTop = el.scrollHeight;
      }
    } catch (e) { /* ignore */ }
  },

  // ============ 群聊管理：邀请成员 / 解散群聊 ============

  showGroupMenu() {
    const menu = document.getElementById('chat-group-menu');
    if (!menu) return;
    const visible = menu.style.display === 'block';
    menu.style.display = visible ? 'none' : 'block';
  },

  hideGroupMenu() {
    const menu = document.getElementById('chat-group-menu');
    if (menu) menu.style.display = 'none';
  },

  showInviteToGroup() {
    this.hideGroupMenu();
    if (!App._currentChatGroup) return;
    const g = (this.groups || []).find(x => x.id === App._currentChatGroup);
    if (!g || g.owner_id !== Auth.user.id) {
      alert('只有群主可以邀请成员'); return;
    }
    document.getElementById('group-invite-title').textContent = `邀请好友加入「${g.name}」`;
    document.getElementById('group-invite-error').textContent = '';
    document.getElementById('group-invite-overlay').style.display = 'flex';
    this._renderInviteFriendPicker();
  },

  async _renderInviteFriendPicker() {
    const container = document.getElementById('group-invite-picker');
    if (!container) return;
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted, #999);font-size:13px;">加载中…</div>';
    this._inviteSelected = new Set();
    this._inviteFriends = [];
    const g = (this.groups || []).find(x => x.id === App._currentChatGroup);
    const existingIds = g && g.members ? g.members.map(m => m.id) : [];
    try {
      const resp = await Auth.fetchWithAuth('/api/friends');
      if (!resp.ok) throw new Error('load failed');
      const data = await resp.json();
      this._inviteFriends = (data.friends || []).filter(f => !existingIds.includes(f.id));
    } catch (e) {
      this._inviteFriends = [];
    }
    if (!this._inviteFriends.length) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted, #999);font-size:13px;">没有可邀请的好友（都已在群中）</div>';
      return;
    }
    container.innerHTML = this._inviteFriends.map(f => `
      <label style="display:flex;align-items:center;gap:10px;padding:7px 14px;cursor:pointer;font-size:14px;user-select:none;"
             onmouseenter="this.style.background='var(--hover-bg, rgba(0,0,0,0.04))'"
             onmouseleave="this.style.background=''">
        <input type="checkbox" value="${f.username || f.id}" data-friend-id="${f.id}"
               onchange="App.Social._onInviteToggle(this)" style="accent-color:var(--accent, #4f46e5);">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--accent-light, #eef2ff);color:var(--accent, #4f46e5);font-size:12px;font-weight:600;flex-shrink:0;">${App._esc((f.nickname || f.username || '?')[0].toUpperCase())}</span>
        <span style="font-weight:500;">${App._esc(f.nickname || f.username || '')}</span>
        <span style="font-size:11px;color:var(--text-muted, #999);">@${App._esc(f.username || '')}</span>
      </label>
    `).join('');
  },

  _onInviteToggle(cb) {
    if (cb.checked) this._inviteSelected.add(cb.value);
    else this._inviteSelected.delete(cb.value);
  },

  async submitInviteToGroup() {
    if (!App._currentChatGroup) return;
    const errEl = document.getElementById('group-invite-error');
    const names = Array.from(this._inviteSelected || []);
    if (!names.length) { errEl.textContent = '请至少选择一位好友'; return; }
    try {
      let okCount = 0;
      for (const username of names) {
        const resp = await Auth.fetchWithAuth(`/api/groups/${App._currentChatGroup}/members`, {
          method: 'POST',
          body: JSON.stringify({ username })
        });
        if (resp.ok) okCount++;
      }
      document.getElementById('group-invite-overlay').style.display = 'none';
      await this.loadGroups();
      const g = (this.groups || []).find(x => x.id === App._currentChatGroup);
      if (g) {
        document.getElementById('chat-window-username').textContent = `${g.member_count} 位成员`;
      }
      alert(`成功邀请 ${okCount} 位好友入群`);
    } catch (e) {
      errEl.textContent = e.message;
    }
  },

  async deleteGroup() {
    this.hideGroupMenu();
    if (!App._currentChatGroup) return;
    const g = (this.groups || []).find(x => x.id === App._currentChatGroup);
    if (!g || g.owner_id !== Auth.user.id) {
      alert('只有群主可以解散群聊'); return;
    }
    if (!confirm(`确定要解散群聊「${g.name}」吗？所有消息将被删除，此操作不可撤销。`)) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/groups/${App._currentChatGroup}`, { method: 'DELETE' });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || '解散失败');
      }
      App.closeChat();
      await this.loadGroups();
      alert('群聊已解散');
    } catch (e) {
      alert('解散群聊失败: ' + e.message);
    }
  },

  // ============ 发送（私信 / 群聊 统一） ============
  async sendCurrentChat() {
    if (!Auth.isLoggedIn) return;
    const input = document.getElementById('chat-message-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    const reply_to = this.replyTo ? this.replyTo.id : null;
    await this._send({ content, type: 'text', image_url: '', reply_to });
  },

  async _send({ content = '', type = 'text', image_url = '', reply_to = null }) {
    let url, body;
    if (App._chatMode === 'group' && App._currentChatGroup) {
      url = `/api/groups/${App._currentChatGroup}/messages`;
      body = { content, type, image_url, reply_to };
    } else if (App._currentChatFriend) {
      url = '/api/messages';
      body = { content, type, image_url, reply_to, to_user_id: App._currentChatFriend };
    } else {
      return;
    }
    try {
      const resp = await Auth.fetchWithAuth(url, { method: 'POST', body: JSON.stringify(body) });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || '发送失败');
      }
      const data = await resp.json();
      this.cancelReply();
      // SSE 也会推送（含发送者），appendMessage 按 id 去重
      if (data.data) this.appendMessage(data.data);
    } catch (e) {
      alert('发送失败: ' + e.message);
    }
  },

  async sendImage(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!App._currentChatFriend && !(App._chatMode === 'group' && App._currentChatGroup)) {
      alert('请先选择聊天对象'); return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await Auth.fetchWithAuth('/api/upload', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error('上传失败');
      const data = await resp.json();
      await this._send({ content: '', type: 'image', image_url: data.url, reply_to: this.replyTo ? this.replyTo.id : null });
    } catch (e) {
      alert('图片发送失败: ' + e.message);
    }
  },

  // ============ 消息渲染 ============
  _ctx() {
    const base = this.apiBase();
    if (App._chatMode === 'group' && App._currentChatGroup) {
      return {
        currentUserId: Auth.user.id, apiBase: base, myAvatar: Auth.user.avatar,
        peerName: '', nameMap: this.nameMap, replyMap: this.msgCache
      };
    }
    return {
      currentUserId: Auth.user.id, apiBase: base, myAvatar: Auth.user.avatar,
      peerName: (document.getElementById('chat-window-name') || {}).textContent || '?',
      replyMap: this.msgCache
    };
  },

  buildMsgRow(m, ctx) {
    const isMine = m.from_user_id === ctx.currentUserId;
    const time = this.fmtTime(m.created);
    let body;
    if (m.recalled) {
      body = `<div class="chat-msg-bubble recalled">${isMine ? '你' : '对方'}撤回了一条消息</div>`;
    } else if (m.deleted) {
      body = `<div class="chat-msg-bubble recalled">该消息已删除</div>`;
    } else if (m.type === 'image') {
      const src = ctx.apiBase + (m.image_url || '');
      body = `<div class="chat-msg-bubble"><img class="chat-msg-img" src="${App._esc(src)}" alt="图片" onclick="App.Social.viewImage('${App._esc(src)}')"></div>`;
    } else {
      body = `<div class="chat-msg-bubble">${App._esc(m.content)}</div>`;
    }
    let replyHtml = '';
    if (m.reply_to) {
      const rm = ctx.replyMap[m.reply_to];
      const txt = rm ? (rm.type === 'image' ? '[图片]' : (rm.content || '')) : '原消息';
      replyHtml = `<div class="chat-msg-reply" data-goto="${m.reply_to}">↩ ${App._esc(txt)}</div>`;
    }
    const peerName = (ctx.nameMap && ctx.nameMap[m.from_user_id]) ? ctx.nameMap[m.from_user_id] : (ctx.peerName || '?');
    const avatar = isMine ? (ctx.myAvatar || '我') : peerName;
    const actions = `<div class="chat-msg-actions">
      <button data-action="reply" title="回复">↩</button>
      ${isMine ? `<button data-action="recall" title="撤回">⟲</button><button data-action="delete" title="删除">🗑</button>` : ''}
    </div>`;
    return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}${m.type === 'image' ? ' img' : ''}" data-msg-id="${m.id}">
      <div class="chat-msg-avatar">${App._esc(avatar)}</div>
      <div class="chat-msg-body">${replyHtml}${body}<div class="chat-msg-time">${time}</div>${actions}</div>
    </div>`;
  },

  renderChat(messages, ctx) {
    const replyMap = {};
    (messages || []).forEach(m => { replyMap[m.id] = m; this.msgCache[m.id] = m; });
    const el = document.getElementById('chat-window-messages');
    if (!el) return;
    el.innerHTML = (messages || []).map(m => this.buildMsgRow(m, ctx)).join('');
    el.scrollTop = el.scrollHeight;
  },

  appendMessage(m) {
    const el = document.getElementById('chat-window-messages');
    if (!el || !m) return;
    if (el.querySelector(`.chat-msg[data-msg-id="${m.id}"]`)) return; // 去重
    this.msgCache[m.id] = m;
    const wrap = document.createElement('div');
    wrap.innerHTML = this.buildMsgRow(m, this._ctx());
    el.appendChild(wrap.firstElementChild);
    el.scrollTop = el.scrollHeight;
  },

  _updateMsgRow(id, kind) {
    const row = document.querySelector(`.chat-msg[data-msg-id="${id}"]`);
    if (!row) return;
    const bubble = row.querySelector('.chat-msg-bubble');
    if (bubble) {
      bubble.className = 'chat-msg-bubble recalled';
      bubble.textContent = kind === 'recalled' ? '你撤回了一条消息' : '该消息已删除';
    }
    const actions = row.querySelector('.chat-msg-actions');
    if (actions) actions.remove();
  },

  // ============ 消息操作：回复 / 删除 / 撤回 ============
  onChatMsgClick(e) {
    const msg = e.target.closest('.chat-msg');
    if (!msg) return;
    const id = parseInt(msg.dataset.msgId, 10);
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      if (action === 'reply') this.setReply(id);
      else if (action === 'delete') this.deleteMessage(id);
      else if (action === 'recall') this.recallMessage(id);
      return;
    }
    const goto = e.target.closest('[data-goto]');
    if (goto) this.scrollToMsg(parseInt(goto.dataset.goto, 10));
  },

  setReply(id) {
    const m = this.msgCache[id];
    if (!m) return;
    this.replyTo = { id, preview: m.type === 'image' ? '[图片]' : (m.content || '') };
    document.getElementById('chat-reply-preview').textContent = '回复: ' + this.replyTo.preview.slice(0, 40);
    document.getElementById('chat-reply-bar').style.display = '';
    document.getElementById('chat-message-input').focus();
  },

  cancelReply() {
    this.replyTo = null;
    const bar = document.getElementById('chat-reply-bar');
    if (bar) bar.style.display = 'none';
  },

  scrollToMsg(id) {
    const row = document.querySelector(`.chat-msg[data-msg-id="${id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('chat-msg-flash');
      setTimeout(() => row.classList.remove('chat-msg-flash'), 1200);
    }
  },

  async deleteMessage(id) {
    if (!confirm('确定删除这条消息吗？（仅自己可见删除）')) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/messages/${id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('删除失败');
      this._updateMsgRow(id, 'deleted');
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  },

  async recallMessage(id) {
    try {
      const resp = await Auth.fetchWithAuth(`/api/messages/${id}/recall`, { method: 'POST' });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || '撤回失败');
      }
      this._updateMsgRow(id, 'recalled');
    } catch (e) {
      alert('撤回失败: ' + e.message);
    }
  },

  // ============ 动态 ============
  async loadMoments() {
    if (!Auth.isLoggedIn) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/moments');
      if (!resp.ok) return;
      const data = await resp.json();
      this.moments = data.moments || [];
      const feed = document.getElementById('moments-feed');
      if (!feed) return;
      if (!this.moments.length) {
        feed.innerHTML = '<div class="friends-empty">还没有动态，发布第一条吧</div>';
        return;
      }
      const base = this.apiBase();
      feed.innerHTML = this.moments.map(m => this.momentRow(m, base)).join('');
    } catch (e) { /* ignore */ }
  },

  momentRow(m, base) {
    const time = this.fmtTime(m.created);
    const img = m.image_url
      ? `<div class="moment-img-wrap"><img class="moment-img" src="${App._esc(base + m.image_url)}" onclick="App.Social.viewImage('${App._esc(base + m.image_url)}')"></div>`
      : '';
    return `<div class="moment-item" data-moment-id="${m.id}">
      <div class="moment-avatar">${App._esc(m.avatar || '?')}</div>
      <div class="moment-body">
        <div class="moment-head"><span class="moment-name">${App._esc(m.nickname || m.username)}</span><span class="moment-time">${time}</span></div>
        <div class="moment-content">${App._esc(m.content || '')}</div>
        ${img}
        <div class="moment-actions">
          ${m.is_self ? `<button class="moment-del" data-action="del-moment" data-id="${m.id}">删除</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  async publishMoment() {
    if (!Auth.isLoggedIn) return;
    const input = document.getElementById('moment-input');
    const content = input.value.trim();
    const image_url = this.momentImage || '';
    if (!content && !image_url) { alert('动态内容不能为空'); return; }
    try {
      const resp = await Auth.fetchWithAuth('/api/moments', {
        method: 'POST',
        body: JSON.stringify({ content, image_url })
      });
      if (!resp.ok) throw new Error('发布失败');
      input.value = '';
      this.momentImage = '';
      const nameEl = document.getElementById('moment-image-name');
      const fileEl = document.getElementById('moment-image-input');
      if (nameEl) nameEl.textContent = '';
      if (fileEl) fileEl.value = '';
      await this.loadMoments();
    } catch (e) {
      alert('发布失败: ' + e.message);
    }
  },

  onMomentImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    Auth.fetchWithAuth('/api/upload', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          this.momentImage = d.url;
          const nameEl = document.getElementById('moment-image-name');
          if (nameEl) nameEl.textContent = '✓ 已选图片';
        } else {
          alert('图片上传失败');
        }
      })
      .catch(() => alert('图片上传失败'));
  },

  async deleteMoment(id) {
    if (!confirm('确定删除这条动态吗？')) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/moments/${id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('删除失败');
      this.loadMoments();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  },

  onMomentsFeedClick(e) {
    const btn = e.target.closest('[data-action="del-moment"]');
    if (btn) this.deleteMoment(parseInt(btn.dataset.id, 10));
  },

  // ============ SSE 实时推送 ============
  // v=20260904b P0 安全：令牌不再进 URL，改用 fetch + ReadableStream(可带 Authorization 头) 替代 EventSource
  connectSSE() {
    if (!Auth.isLoggedIn || !Auth.token) return;
    if (this.sse) { try { this.sse.close(); } catch (e) {} this.sse = null; }
    const url = this.apiBase() + '/api/events';
    const self = this;
    let aborted = false;
    const ctrl = new AbortController();
    this.sse = { close: () => { aborted = true; try { ctrl.abort(); } catch (e) {} } };
    const run = async () => {
      while (!aborted) {
        try {
          const resp = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + Auth.token, 'X-Auth-Token': Auth.token },
            signal: ctrl.signal,
          });
          if (!resp.ok || !resp.body) {
            if (!aborted) await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          self.sseConnected = true;
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            // SSE 帧以空行分隔
            let idx;
            while ((idx = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              // 提取 data: 行
              const dataLines = frame.split('\n')
                .filter(l => l.startsWith('data:'))
                .map(l => l.slice(5).trim());
              if (dataLines.length) {
                try { self.handleEvent(JSON.parse(dataLines.join('\n'))); } catch (e) {}
              }
            }
          }
          self.sseConnected = false;
        } catch (e) {
          self.sseConnected = false;
        }
        if (!aborted) await new Promise(r => setTimeout(r, 3000));
      }
    };
    run();
  },

  disconnectSSE() {
    if (this.sse) { try { this.sse.close(); } catch (e) {} this.sse = null; }
    this.sseConnected = false;
  },

  handleEvent(evt) {
    if (!evt || !evt.type) return;
    switch (evt.type) {
      case 'new_private_message': {
        const m = evt.message;
        if (App._chatMode === 'private' && App._currentChatFriend &&
            (m.from_user_id === App._currentChatFriend || m.to_user_id === App._currentChatFriend)) {
          this.appendMessage(m);
          // 聊天已打开，立即刷新好友列表清除红点
          this._safe(() => App._loadFriendsList());
        } else {
          this._safe(() => App._loadFriendsList());
          this._safe(() => App._updateUnreadBadge());
        }
        break;
      }
      case 'new_group_message': {
        const m = evt.message;
        if (App._chatMode === 'group' && App._currentChatGroup === m.group_id) {
          this.appendMessage(m);
          // 聊天已打开，清除该群红点并刷新列表
          this.groupUnread[m.group_id] = 0;
          this._safe(() => this.loadGroups());
        } else {
          this.groupUnread[m.group_id] = (this.groupUnread[m.group_id] || 0) + 1;
          this.loadGroups();
        }
        break;
      }
      case 'message_deleted':
        this._updateMsgRow(evt.message_id, 'deleted');
        break;
      case 'message_recalled':
        this._updateMsgRow(evt.message_id, 'recalled');
        break;
      case 'friend_request':
        this._safe(() => App._loadFriendRequests());
        this._safe(() => App._updateUnreadBadge());
        break;
      case 'friend_request_result':
        if (evt.action === 'accept') this._safe(() => App._loadFriendsList());
        break;
      case 'new_moment':
        if (this.tab === 'moments') this.loadMoments();
        break;
      case 'added_to_group':
        this.loadGroups();
        break;
      case 'group_deleted':
        this.groupUnread[evt.group_id] = 0;
        if (App._currentChatGroup === evt.group_id) {
          App.closeChat();
        }
        this.loadGroups();
        break;
    }
  },

  _safe(fn) { try { fn(); } catch (e) {} },

  // ============ 图片预览 ============
  viewImage(src) {
    document.getElementById('image-preview-img').src = src;
    document.getElementById('image-preview-overlay').style.display = 'flex';
  }
};
