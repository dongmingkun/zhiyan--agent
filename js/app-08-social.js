/* app-08-social.js —— 原 js/app.v3.19.js 第 4409–4803 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._renderVisionPanelHTML = function _renderVisionPanelHTML(d, mode) {
    const esc = (s) => this._esc(s || '');
    const visionTag = d.vision_configured
      ? `<span style="color:#10b981;">✅ 已启用</span>`
      : `<span style="color:#f59e0b;">⚠️ 未配置</span>`;
    const ocrTag = d.ocr_available
      ? `<span style="color:#10b981;">✅ 就绪</span>`
      : `<span style="color:#f59e0b;">⏳ 首次识别时加载</span>`;
    return `
      <h4>🖼️ 图像识别能力</h4>
      <div class="cvb-row"><span>当前模式</span><b style="color:${mode === 'vision' ? '#10b981' : '#f59e0b'};">${mode === 'vision' ? '云端视觉模型' : '本地 OCR 兜底'}</b></div>
      <div class="cvb-row"><span>视觉模型</span>${visionTag}</div>
      <div class="cvb-row"><span>本地 OCR (RapidOCR)</span>${ocrTag}</div>
      <div class="cvb-hint">
        <b>${mode === 'vision' ? '当前发图将用视觉模型直接看图回答' : '当前发图将用 OCR 提取文字 + 主 LLM 回答（公式/手写体识别有偏差）'}</b><br>
        ${esc(d.config_hint || '')}<br>
        ${mode === 'vision' ? '' : '如需更强的视觉理解，请在服务器 .env 配置 <code>LLM_VISION_API_KEY</code> / <code>LLM_VISION_BASE_URL</code> / <code>LLM_VISION_MODEL</code>（OpenAI 兼容协议）。'}
      </div>`;
  };

  /**
   * v=20260824d 渲染"图像识别设置"卡片(管理后台 + 个人中心复用)。
   * 显示当前 vision/OCR 状态 + 配置指引。
   */
App._renderVisionStatusCard = function _renderVisionStatusCard() {
    const d = (this._visionModeCache && this._visionModeCache.full) || null;
    if (!d) return '';
    const mode = d.mode === 'vision';
    const ocrTag = d.ocr_available
      ? `<span style="color:#10b981;">✅ RapidOCR 已就绪</span>`
      : `<span style="color:#ef4444;">❌ 未安装</span>`;
    const visionTag = d.vision_configured
      ? `<span style="color:#10b981;">✅ 已启用</span> · 模型 <code>${this._esc(d.vision_model || '?')}</code>`
      : `<span style="color:#f59e0b;">⚠️ 未配置</span>`;
    return `
      <div class="profile-card" style="border-left:4px solid ${mode ? '#10b981' : '#f59e0b'};">
        <h3>🖼️ 图像识别能力</h3>
        <div style="font-size:13px;line-height:1.7;color:var(--text-secondary);">
          <div>当前模式: ${mode ? '<b style="color:#10b981;">云端视觉模型</b>' : '<b style="color:#f59e0b;">本地 OCR 兜底</b>'}</div>
          <div>视觉模型: ${visionTag}</div>
          <div>本地 OCR: ${ocrTag}</div>
          <div style="margin-top:6px;padding:8px 10px;background:var(--surface-elevated);border-radius:8px;font-size:12px;">
            💡 <b>${mode ? '当前发图将用视觉模型直接看图回答' : '当前发图将用 OCR 提取文字 + 主 LLM 回答(公式/手写体识别有偏差)'}</b><br>
            ${d.config_hint}
          </div>
        </div>
      </div>`;
  };

App.saveProfile = async function saveProfile() {
    const nickname = document.getElementById('edit-nickname').value.trim();
    const avatar = document.getElementById('edit-avatar').value.trim();
    const msg = document.getElementById('profile-saved-msg');
    try {
      const resp = await Auth.fetchWithAuth('/api/auth/profile', {
        method: 'PUT', body: JSON.stringify({ nickname, avatar })
      });
      if (!resp.ok) throw new Error('保存失败');
      // 更新本地缓存
      const u = Auth.user;
      u.nickname = nickname || u.username;
      u.avatar = avatar || (u.username || '?').charAt(0).toUpperCase();
      Auth._saveUser(u);
      Auth.renderUserBadge();
      Auth.renderSidebarUser();
      document.getElementById('profile-avatar-preview').textContent = u.avatar;
      msg.textContent = '✅ 保存成功';
      setTimeout(() => msg.textContent = '', 2000);
    } catch (e) {
      msg.textContent = '❌ ' + e.message;
    }
  };

App.saveUsername = async function saveUsername() {
    const newUsername = document.getElementById('edit-username').value.trim();
    const msg = document.getElementById('username-saved-msg');
    if (!newUsername || newUsername.length < 2) {
      msg.textContent = '❌ 用户名至少 2 个字符';
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      msg.textContent = '❌ 用户名只能包含字母、数字和下划线';
      return;
    }
    try {
      const resp = await Auth.fetchWithAuth('/api/auth/username', {
        method: 'PUT', body: JSON.stringify({ new_username: newUsername })
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.detail || '修改失败');
      }
      const data = await resp.json();
      const u = Auth.user;
      u.username = data.username;
      Auth._saveUser(u);
      Auth.renderUserBadge();
      Auth.renderSidebarUser();
      msg.textContent = '✅ 用户名修改成功：' + data.username;
      setTimeout(() => msg.textContent = '', 3000);
    } catch (e) {
      msg.textContent = '❌ ' + e.message;
    }
  };

App._esc = function _esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };

  // ============ 好友与私信系统 ============

App._friendsPollTimer = null;
App._chatPollTimer = null;
App._currentChatFriend = null;
App._currentChatGroup = null;
App._chatMode = 'private';
App._currentChatPeerName = '?';

App.renderFriends = async function renderFriends() {
    if (!Auth.isLoggedIn) {
      document.getElementById('friends-content').innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">
          <div style="font-size:48px;margin-bottom:16px;">🔑</div>
          <h2>请先登录</h2>
          <p>登录后可使用好友和私信功能</p>
          <button class="welcome-btn primary" style="width:200px;margin-top:16px;" onclick="window.WelcomeLogin ? WelcomeLogin.open('login') : App.showAuthModal({mode:'login'})">🔑 登录</button>
        </div>`;
      return;
    }
    // Start polling for new messages
    this._startFriendsPolling();
    // Load data
    await Promise.all([this._loadFriendRequests(), this._loadFriendsList()]);
    // Also check unread count
    this._updateUnreadBadge();
    // 实时推送（超低延迟）：建立 SSE 长连接
    if (Auth.isLoggedIn) App.Social.connectSSE();
    // 默认进入私信标签
    App.Social.switchTab(localStorage.getItem('la_socialTab') || 'private');
  };

App._startFriendsPolling = function _startFriendsPolling() {
    if (this._friendsPollTimer) clearInterval(this._friendsPollTimer);
    // 好友列表 / 申请 / 未读：低频轮询（8秒）
    this._friendsPollTimer = setInterval(() => {
      if (this.currentView === 'friends') {
        this._loadFriendRequests();
        this._loadFriendsList();
        this._updateUnreadBadge();
      }
    }, 8000);
  };

App._startChatPolling = function _startChatPolling() {
    if (this._chatPollTimer) clearInterval(this._chatPollTimer);
    // 打开聊天窗口时：高频轮询消息（1.5秒），作为 SSE 的兜底，避免延迟
    this._chatPollTimer = setInterval(() => {
      if (this._chatMode === 'group' && this._currentChatGroup) App.Social.pollGroupMessages();
      else if (this._currentChatFriend) this._pollMessages();
    }, 1500);
  };

App._stopChatPolling = function _stopChatPolling() {
    if (this._chatPollTimer) {
      clearInterval(this._chatPollTimer);
      this._chatPollTimer = null;
    }
  };

App._stopFriendsPolling = function _stopFriendsPolling() {
    if (this._friendsPollTimer) {
      clearInterval(this._friendsPollTimer);
      this._friendsPollTimer = null;
    }
  };

App._updateUnreadBadge = async function _updateUnreadBadge() {
    try {
      const resp = await Auth.fetchWithAuth('/api/messages/unread');
      if (resp.ok) {
        const data = await resp.json();
        const badge = document.getElementById('nav-unread-badge');
        if (badge) {
          if (data.count > 0) {
            badge.style.display = '';
            badge.textContent = data.count > 99 ? '99+' : data.count;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch { /* ignore */ }
  };

  // ============ 搜索用户 ============

App.searchUsers = async function searchUsers() {
    if (!Auth.isLoggedIn) return;
    const q = document.getElementById('friends-search-input').value.trim();
    if (!q) return;
    const resultsEl = document.getElementById('friends-search-results');
    try {
      const resp = await Auth.fetchWithAuth('/api/users/search?q=' + encodeURIComponent(q));
      if (!resp.ok) throw new Error('搜索失败');
      const data = await resp.json();
      if (data.users.length === 0) {
        resultsEl.style.display = '';
        resultsEl.innerHTML = '<div class="friends-empty">未找到匹配用户</div>';
        return;
      }
      resultsEl.style.display = '';
      resultsEl.innerHTML = data.users.map(u => `
        <div class="friends-search-item" data-username="${this._esc(u.username)}">
          <div class="friends-search-avatar">${this._esc(u.avatar)}</div>
          <div class="friends-search-info">
            <div class="friends-search-nickname">${this._esc(u.nickname)}</div>
            <div class="friends-search-username">@${this._esc(u.username)}</div>
          </div>
          <button class="friends-search-add-btn" data-action="add-friend" title="添加好友">＋ 添加</button>
        </div>
      `).join('');
    } catch (e) {
      resultsEl.style.display = '';
      resultsEl.innerHTML = `<div class="friends-empty">搜索失败: ${e.message}</div>`;
    }
  };

App.sendFriendRequest = async function sendFriendRequest(username, btn) {
    if (!Auth.isLoggedIn) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ to_username: username })
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.detail || '发送失败');
      }
      if (btn) {
        btn.textContent = '✓ 已发送';
        btn.disabled = true;
        btn.classList.add('sent');
      }
    } catch (e) {
      alert('发送好友申请失败: ' + e.message);
    }
  };

App._onSearchResultsClick = function _onSearchResultsClick(e) {
    const btn = e.target.closest('[data-action="add-friend"]');
    if (!btn) return;
    const item = btn.closest('.friends-search-item');
    if (!item) return;
    const username = item.dataset.username;
    this.sendFriendRequest(username, btn);
  };

  // ============ 好友申请 ============

App._loadFriendRequests = async function _loadFriendRequests() {
    if (!Auth.isLoggedIn) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/friends/requests');
      if (!resp.ok) {
        if (resp.status === 401) {
          // Token 过期，提示重新登录
          document.getElementById('friend-requests-list').innerHTML = '<div class="friends-empty">登录已过期，请重新登录</div>';
          document.getElementById('friend-requests-badge').style.display = 'none';
        }
        return;
      }
      const data = await resp.json();
      const listEl = document.getElementById('friend-requests-list');
      const badge = document.getElementById('friend-requests-badge');
      if (data.requests.length === 0) {
        listEl.innerHTML = '<div class="friends-empty">暂无好友申请</div>';
        badge.style.display = 'none';
      } else {
        badge.style.display = '';
        badge.textContent = data.requests.length;
        listEl.innerHTML = data.requests.map(r => `
          <div class="friend-request-item" data-request-id="${r.id}">
            <div class="friend-request-avatar">${this._esc(r.avatar)}</div>
            <div class="friend-request-info">
              <div class="friend-request-nickname">${this._esc(r.nickname)}</div>
              <div class="friend-request-username">@${this._esc(r.username)}</div>
            </div>
            <div class="friend-request-actions">
              <button class="friend-request-accept" data-action="accept">✓ 接受</button>
              <button class="friend-request-reject" data-action="reject">✕ 拒绝</button>
            </div>
          </div>
        `).join('');
      }
    } catch { /* ignore */ }
  };

App._onFriendRequestsClick = function _onFriendRequestsClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const item = btn.closest('.friend-request-item');
    if (!item) return;
    const requestId = parseInt(item.dataset.requestId, 10);
    const action = btn.dataset.action;
    this.acceptRejectRequest(requestId, action);
  };

App.acceptRejectRequest = async function acceptRejectRequest(requestId, action) {
    if (!Auth.isLoggedIn) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/friends/requests/${requestId}`, {
        method: 'PUT',
        body: JSON.stringify({ action })
      });
      if (!resp.ok) {
        let errMsg = '操作失败';
        try {
          const errData = await resp.json();
          errMsg = errData.detail || errData.message || `HTTP ${resp.status}`;
        } catch {
          errMsg = `HTTP ${resp.status}`;
        }
        throw new Error(errMsg);
      }
      // Reload
      await Promise.all([this._loadFriendRequests(), this._loadFriendsList()]);
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
  };

  // ============ 好友列表 ============

App._loadFriendsList = async function _loadFriendsList() {
    if (!Auth.isLoggedIn) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/friends');
      if (!resp.ok) return;
      const data = await resp.json();
      const listEl = document.getElementById('friends-list');
      const emptyEl = document.getElementById('friends-empty');
      const countEl = document.getElementById('friends-count');
      countEl.textContent = data.friends.length;
      if (data.friends.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = '';
      } else {
        emptyEl.style.display = 'none';
        listEl.innerHTML = data.friends.map(f => `
          <div class="friend-list-item${this._currentChatFriend === f.id ? ' active' : ''}" data-friend-id="${f.id}" data-nickname="${this._esc(f.nickname)}" data-username="${this._esc(f.username)}" data-avatar="${this._esc(f.avatar)}">
            <div class="friend-list-avatar">
              ${this._esc(f.avatar)}
              ${f.unread > 0 ? '<span class="unread-dot"></span>' : ''}
            </div>
            <div class="friend-list-info">
              <div class="friend-list-nickname">${this._esc(f.nickname)}</div>
              <div class="friend-list-username">@${this._esc(f.username)}</div>
            </div>
            ${f.unread > 0 ? `<span class="friend-list-unread">${f.unread}</span>` : ''}
            <button class="friend-list-delete" data-action="delete-friend" title="删除好友">🗑</button>
          </div>
        `).join('');
      }
    } catch { /* ignore */ }
  };

App._onFriendsListClick = function _onFriendsListClick(e) {
    const item = e.target.closest('.friend-list-item');
    if (!item) return;
    const friendId = parseInt(item.dataset.friendId, 10);
    const nickname = item.dataset.nickname;
    const username = item.dataset.username;
    const avatar = item.dataset.avatar;

    if (e.target.closest('.friend-list-delete')) {
      e.stopPropagation();
      this.removeFriend(friendId, nickname);
      return;
    }
    this.openChat(friendId, nickname, username, avatar);
  };

App.removeFriend = async function removeFriend(friendId, nickname) {
    if (!confirm(`确定要删除好友「${nickname}」吗？`)) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/friends/${friendId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('删除失败');
      if (this._currentChatFriend === friendId) this.closeChat();
      await this._loadFriendsList();
    } catch (e) {
      alert('删除好友失败: ' + e.message);
    }
  };

  // ============ 聊天 ============

