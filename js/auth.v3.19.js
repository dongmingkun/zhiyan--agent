/**
 * 用户认证模块 v2
 * - 游客模式：试用 5 条后强制注册
 * - 注册支持昵称 + 头像
 * - Token 持久化
 * - 统一提示弹窗(替代原生 alert)v=20260855
 */
const Auth = {
  _token: null,
  _user: null,
  GUEST_LIMIT: 5,

  /**
   * 统一提示弹窗(替代原生 alert)
   *   options: { type, title, message, hint, primaryText, onPrimary, secondaryText, onSecondary }
   *   type: info | warning | banned | success
   *   自动检测 "封禁" 字样 → banned 类型 + 申诉说明
   */
  showAlert(opts = {}) {
    const {
      type = 'info',
      title = '提示',
      message = '',
      hint = '',
      primaryText = '我知道了',
      onPrimary = null,
      secondaryText = '',
      onSecondary = null
    } = opts;
    // 智能识别"封禁"消息 → 走专用样式
    let actualType = type;
    let actualTitle = title;
    let actualHint = hint;
    const text = (message || '') + ' ' + title;
    if (text.includes('封禁') || text.includes('禁用') || text.includes('banned')) {
      actualType = 'banned';
      if (title === '提示' || !title) actualTitle = '账号已被封禁';
      if (!hint) {
        actualHint = '<strong>可能原因</strong> · 违反社区规范 · 异常登录行为 · 管理员手动处置<br><strong>如何申诉</strong> · 联系管理员 <code>落风之叶 / admin</code> 或邮件至管理员后台';
      }
    }
    const icons = {
      info: 'i',
      warning: '!',
      banned: '✕',
      success: '✓'
    };

    // 移除已有弹窗
    document.querySelectorAll('.auth-alert-overlay').forEach(n => n.remove());

    const overlay = document.createElement('div');
    overlay.className = 'auth-alert-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.innerHTML = `
      <div class="auth-alert-card">
        <div class="auth-alert-icon type-${actualType}">${icons[actualType] || 'i'}</div>
        <div class="auth-alert-title">${actualTitle}</div>
        <div class="auth-alert-message">${(message || '').replace(/</g, '&lt;')}</div>
        ${actualHint ? `<div class="auth-alert-hint">${actualHint}</div>` : ''}
        <div class="auth-alert-actions">
          ${secondaryText ? `<button type="button" class="auth-alert-btn ghost" data-act="secondary">${secondaryText}</button>` : ''}
          <button type="button" class="auth-alert-btn primary" data-act="primary">${primaryText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 关闭函数
    const close = () => {
      overlay.style.animation = 'authAlertFadeIn 0.14s ease reverse';
      setTimeout(() => overlay.remove(), 140);
    };
    overlay.querySelector('[data-act="primary"]').addEventListener('click', () => {
      close();
      if (typeof onPrimary === 'function') setTimeout(onPrimary, 50);
    });
    const secondaryBtn = overlay.querySelector('[data-act="secondary"]');
    if (secondaryBtn && typeof onSecondary === 'function') {
      secondaryBtn.addEventListener('click', () => {
        close();
        setTimeout(onSecondary, 50);
      });
    }
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    // ESC 关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  },

  init() {
    this._token = localStorage.getItem('la_tutor_token');
    this._user = this._loadUser();
    this._syncAuthUI();
    if (this._token) {
      this.fetchProfile();
    }
    this.renderUserBadge();
    this.renderSidebarUser();
    this.renderAdminNav();
    this._bindWelcomeEvents();
  },

  /** 绑定欢迎页事件（兼容 inline onclick 在某些环境下失效的情况） */
  _bindWelcomeEvents() {
    const w = document.getElementById('welcome-overlay');
    if (!w) return;
    // 用事件委托，确保即便初始 DOM 不可见也能响应
    w.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'switch-login') this.switchAuthTab('login');
      else if (act === 'switch-register') this.switchAuthTab('register');
      else if (act === 'password-login') this.passwordLogin();
      else if (act === 'password-register') this.passwordRegister();
      // v=20260905 demo 一键登录委托:即使 inline onclick 被环境禁用,事件委托也能触发
      else if (act === 'demo-login') {
        if (window.WelcomeLogin && typeof WelcomeLogin.demoLogin === 'function') {
          WelcomeLogin.demoLogin();
        } else {
          this._demoLoginFallback();
        }
      }
    });
    // 支持回车键直接登录/注册
    const loginIdent = document.getElementById('login-identifier');
    const loginPwd = document.getElementById('login-password');
    [loginIdent, loginPwd].forEach(el => {
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.passwordLogin(); });
    });
    [document.getElementById('reg-nickname'), document.getElementById('reg-password'), document.getElementById('reg-password2')].forEach(el => {
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.passwordRegister(); });
    });
  },

  /** v=20260905 demo 登录兜底:WelcomeLogin 不可用时,直接调后端 */
  async _demoLoginFallback() {
    try {
      const data = await this.login('demo', 'demo123');
      document.getElementById('welcome-overlay').style.display = 'none';
      if (window.App) App.switchView('home');
    } catch (e) {
      this.showAlert({ type: 'warning', message: '一键演示登录失败: ' + (e.message || '网络错误') });
    }
  },

  _syncAuthUI() {
    document.body.classList.toggle('logged-in', this.isLoggedIn);
  },

  _loadUser() {
    try {
      const u = localStorage.getItem('la_tutor_user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  },

  _saveUser(user) {
    this._user = user;
    localStorage.setItem('la_tutor_user', JSON.stringify(user));
  },

  get isLoggedIn() { return !!this._token && !!this._user; },
  get token() { return this._token; },
  get user() { return this._user; },
  get nickname() { return this._user?.nickname || '游客'; },
  get avatar() { return this._user?.avatar || '?'; },
  get guestCount() { return parseInt(localStorage.getItem('la_guest_msgs') || '0'); },

  // 游客试用计数
  guestTick() {
    if (this.isLoggedIn) return true;
    const c = this.guestCount + 1;
    localStorage.setItem('la_guest_msgs', String(c));
    return c <= this.GUEST_LIMIT;
  },

  canContinue() {
    return this.isLoggedIn || this.guestCount < this.GUEST_LIMIT;
  },

  // 游客剩余次数
  guestRemaining() {
    return Math.max(0, this.GUEST_LIMIT - this.guestCount);
  },

  // ========== API 调用 ==========

  /** 识别当前设备类型：computer 电脑 / mobile 手机 / tablet 平板 */
  getDeviceType() {
    try {
      const ua = navigator.userAgent || '';
      const hasTouch = navigator.maxTouchPoints > 0;
      const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
        (hasTouch && /Android/i.test(ua) && !/Mobile/i.test(ua));
      const isMobile = /Mobile|iPhone|Android|Windows Phone/i.test(ua);
      if (isTablet) return 'tablet';
      if (isMobile) return 'mobile';
      return 'computer';
    } catch (e) { return 'computer'; }
  },

  async register(nickname, password, avatar) {
    const resp = await this._fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nickname, password, avatar, device: this.getDeviceType() })
    });
    if (!resp.ok) {
      const e = await resp.json();
      throw new Error(e.detail || '注册失败');
    }
    const data = await resp.json();
    this._onAuthSuccess(data);
    return data;
  },

  async login(identifier, password) {
    const resp = await this._fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, device: this.getDeviceType() })
    });
    if (!resp.ok) {
      const e = await resp.json();
      throw new Error(e.detail || '登录失败');
    }
    const data = await resp.json();
    this._onAuthSuccess(data);
    return data;
  },

  _onAuthSuccess(data) {
    this._token = data.token;
    // v=20260905 登录成功重置被踢/过期标记:之前因 token 失效被锁的状态不应影响新会话
    this._kickedHandled = false;
    localStorage.setItem('la_tutor_token', data.token);
    const user = {
      id: data.id,
      username: data.username,
      nickname: data.nickname || data.username,
      avatar: data.avatar || data.username[0].toUpperCase(),
      role: data.role || 'user'
    };
    this._saveUser(user);
    localStorage.removeItem('la_guest_msgs'); // 清空试用计数
    this._syncAuthUI();
    this.renderUserBadge();
    this.renderSidebarUser();
    this.renderAdminNav();
    // 登录成功后同步云端错题（跨设备数据互通）
    if (typeof QuizSystem !== 'undefined' && typeof QuizSystem.syncMistakesFromCloud === 'function') {
      QuizSystem.syncMistakesFromCloud();
    }
  },

  /** 是否管理员 */
  get isAdmin() { return !!(this._user && this._user.role === 'admin'); },

  /** 渲染侧边栏管理后台入口（仅管理员可见） */
  renderAdminNav() {
    const el = document.getElementById('nav-admin');
    if (el) el.style.display = this.isAdmin ? '' : 'none';
    // v=20260903a 移动端"更多"面板的管理后台入口同步显隐（向后兼容，无该元素时静默跳过）
    const moreEl = document.getElementById('more-item-admin');
    if (moreEl) moreEl.style.display = this.isAdmin ? '' : 'none';
  },

  logout() {
    // 通知后端删除会话映射（旧会话彻底失效，需重新登录）
    const tk = this._token;
    if (tk) {
      try {
        fetch((window.APP_CONFIG?.API_BASE || '') + '/api/auth/logout',
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk } }).catch(() => {});
      } catch (e) {}
    }
    this._token = null;
    this._user = null;
    localStorage.removeItem('la_tutor_token');
    localStorage.removeItem('la_tutor_user');
    this._syncAuthUI();
    this.renderUserBadge();
    this.renderSidebarUser();
    this.renderAdminNav();
    // 退出登录：清空待同步删除记录，避免污染下一账号
    if (typeof QuizSystem !== 'undefined') {
      QuizSystem._removedIds = [];
      QuizSystem._mistakesDirty = false;
      clearTimeout(QuizSystem._syncTimer);
    }
  },

  async oauthLogin(provider) {
    /** 兼容保留：调 OAuth API 用临时 openid 测试连接。
     * 生产流程请走 _onQrFrameClick → 真正扫码 → 后端回调获取 openid。*/
    return this._onQrFrameClick();
  },

  // ── 手机号验证码登录 ──

  /** 生成仿真实二维码（25x25 黑色模块 + 三组 finder + 时序图） */
  _renderQRCode(canvas, provider) {
    const ctx = canvas.getContext('2d');
    const size = 25;
    const cellSize = canvas.width / (size + 1.5);
    const offset = cellSize * 0.75;
    const grid = Array(size).fill().map(() => Array(size).fill(0));

    // Finder 7x7
    const drawFinder = (fx, fy) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const onEdge = i === 0 || i === 6 || j === 0 || j === 6;
          const inCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          grid[fy + i][fx + j] = (onEdge || inCenter) ? 1 : 0;
        }
      }
      // 白色分隔
      for (let i = -1; i <= 7; i++) {
        if (fy + i < 0 || fy + i >= size) continue;
        if (fx - 1 >= 0) grid[fy + i][fx - 1] = 0;
        if (fx + 7 < size) grid[fy + i][fx + 7] = 0;
      }
      for (let j = -1; j <= 7; j++) {
        if (fx + j < 0 || fx + j >= size) continue;
        if (fy - 1 >= 0) grid[fy - 1][fx + j] = 0;
        if (fy + 7 < size) grid[fy + 7][fx + j] = 0;
      }
    };
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);

    // 时序图
    for (let i = 8; i < size - 8; i++) {
      grid[6][i] = (i % 2 === 0) ? 1 : 0;
      grid[i][6] = (i % 2 === 0) ? 1 : 0;
    }

    // 数据区
    const seed = (provider || 'wx') + Date.now();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    let rngState = Math.abs(hash) || 1;
    const next = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState; };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // 跳过 finder + 时序
        if ((x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8)) continue;
        if (x === 6 || y === 6) continue;
        if (x >= size - 9 && y >= size - 9) continue;
        grid[y][x] = (next() % 100) > 50 ? 1 : 0;
      }
    }

    // 渲染
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x]) {
          ctx.fillRect(offset + x * cellSize, offset + y * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }
    }
  },

  /** 渲染右侧 QR（真实可扫 PNG） */
  _renderLoginQR(provider = 'wechat') {
    const frame = document.getElementById('ds-qr-frame');
    if (!frame) return;
    // 用真实二维码 <img> 替换 canvas
    let img = frame.querySelector('img.qr-real');
    if (!img) {
      const oldCanvas = frame.querySelector('canvas');
      if (oldCanvas) oldCanvas.remove();
      img = document.createElement('img');
      img.className = 'qr-real';
      img.style.cssText = 'width:180px;height:180px;display:block;border-radius:4px';
      frame.insertBefore(img, frame.firstChild);
    }
    img.src = '/api/auth/qrcode?provider=' + provider + '&t=' + Date.now();
    const logo = document.getElementById('ds-qr-logo');
    if (logo) {
      logo.textContent = provider === 'qq' ? '🐧' : '💬';
      logo.style.background = provider === 'qq' ? '#12b7f5' : '#07c160';
    }
    const tip = document.querySelector('.ds-qr-tip');
    if (tip) tip.textContent = provider === 'qq' ? '🐧 QQ扫码登录' : '💬 微信扫码登录';
    frame.dataset.provider = provider;
  },

  /** QQ 扫码切换 */
  switchToQQ() {
    this._renderLoginQR('qq');
  },

  /** 二维码点击：模拟"已扫码"状态，等待绑定/登录 */
  _onQrFrameClick() {
    const frame = document.getElementById('ds-qr-frame');
    const tip = document.querySelector('.ds-qr-tip');
    const provider = frame?.dataset.provider === 'qq' ? 'qq' : 'wechat';
    const openid = 'mock_' + Math.random().toString(36).slice(2, 10);
    if (frame) frame.classList.add('scanning');
    if (tip) tip.innerHTML = '📱 扫描中...<br><small>请在' + (provider === 'qq' ? 'QQ' : '微信') + '中确认</small>';
    // 调 OAuth API，若已绑定则直接登录，否则返回绑定表单
    this._fetch('/api/auth/oauth', {
      method: 'POST',
      body: JSON.stringify({ provider, nickname: openid })
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        this._onAuthSuccess(d);
        document.getElementById('welcome-overlay').style.display = 'none';
        if (window.App) App.switchView('home');
      } else if (d.need_bind) {
        this._showBindForm(d);
      } else {
        if (tip) tip.innerHTML = (provider === 'qq' ? '🐧 QQ扫码登录' : '💬 微信扫码登录') + '<br><small>扫码错误，请重试</small>';
        if (frame) frame.classList.remove('scanning');
      }
    }).catch(() => {
      if (tip) tip.innerHTML = (provider === 'qq' ? '🐧 QQ扫码登录' : '💬 微信扫码登录') + '<br><small>扫码失败，请重试</small>';
      if (frame) frame.classList.remove('scanning');
    });
  },

  /** 显示绑定账号表单（未注册时强制要求用户填写昵称+密码） */
  _showBindForm(data) {
    const tip = document.querySelector('.ds-qr-tip');
    if (tip) tip.innerHTML = '✅ 扫码成功<br><small>请完成账号绑定</small>';
    const form = document.createElement('div');
    form.className = 'bind-form';
    form.innerHTML = `
      <input type="text" placeholder="请输入昵称（必填）" id="bind-nickname" maxlength="20">
      <input type="password" placeholder="请设置登录密码（必填，至少 4 位）" id="bind-password" maxlength="32">
      <button type="button" class="login-submit ds-submit" id="bind-submit">完成绑定并登录</button>
    `;
    const frame = document.getElementById('ds-qr-frame');
    const side = frame ? frame.parentElement : null;
    if (side) {
      const existing = side.querySelector('.bind-form');
      if (existing) existing.remove();
      side.appendChild(form);
    }
    document.getElementById('bind-submit').onclick = () => this._doBind(data.scene);
  },

  /** 提交绑定 */
  async _doBind(scene) {
    const nickname = document.getElementById('bind-nickname').value.trim();
    const password = document.getElementById('bind-password').value;
    if (!nickname) { this.showAlert({ type: 'warning', message: '请输入昵称' }); return; }
    if (!password || password.length < 4) { this.showAlert({ type: 'warning', message: '密码至少 4 位' }); return; }
    try {
      const resp = await this._fetch('/api/auth/bind', {
        method: 'POST',
        body: JSON.stringify({ scene, nickname, password, avatar: '' })
      });
      const data = await resp.json();
      if (!resp.ok) { this.showAlert({ type: 'warning', message: data.detail || '绑定失败' }); return; }
      this._onAuthSuccess(data);
      document.getElementById('welcome-overlay').style.display = 'none';
      if (window.App) App.switchView('home');
    } catch (e) { this.showAlert({ type: 'warning', message: '绑定失败: ' + e.message }); }
  },

  /** 刷新 QR */
  refreshLoginQR() {
    const frame = document.getElementById('ds-qr-frame');
    this._renderLoginQR(frame?.dataset.provider || 'wechat');
  },

  switchLoginTab(name) {
    // 兼容旧调用：单 tab 模式忽略
  },

  sendSmsCode() {
    const el = document.getElementById('login-phone');
    if (!el) return this.showAlert({ type: 'warning', message: '当前不支持验证码登录' });
    const phone = el.value.trim();
    if (!phone || phone.length < 5) { this.showAlert({ type: 'warning', message: '请先输入有效的手机号' }); return; }
    const btn = document.getElementById('login-send-code');
    if (btn.disabled) return;
    // 调用后端发送验证码
    this._fetch('/api/auth/send-sms2', { method: 'POST', body: JSON.stringify({ phone }) })
      .then(r => r.json())
      .then(d => { if (!d.ok) this.showAlert({ type: 'warning', message: d.msg || '发送失败' }); })
      .catch(() => { /* mock 降级：不阻断 UI */ });
    let s = 60;
    btn.disabled = true;
    btn.textContent = `${s}s 后重发`;
    const tick = setInterval(() => {
      s--;
      if (s <= 0) {
        clearInterval(tick);
        btn.disabled = false;
        btn.textContent = '发送验证码';
      } else {
        btn.textContent = `${s}s 后重发`;
      }
    }, 1000);
    document.getElementById('login-code').focus();
  },

  showPasswordLogin(e) {
    if (e) e.preventDefault();
    if (window.App) App.showAuthModal({ mode: 'login' });
  },

  switchAuthTab(tab) {
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const panelLogin = document.getElementById('panel-login');
    const panelRegister = document.getElementById('panel-register');
    if (panelLogin) panelLogin.style.display = tab === 'login' ? '' : 'none';
    if (panelRegister) panelRegister.style.display = tab === 'register' ? '' : 'none';
  },

  async passwordLogin() {
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    if (!identifier) { this.showAlert({ type: 'warning', message: '请输入昵称或用户名' }); return; }
    if (!password) { this.showAlert({ type: 'warning', message: '请输入密码' }); return; }
    try {
      const data = await this.login(identifier, password);
      document.getElementById('welcome-overlay').style.display = 'none';
      if (window.App) App.switchView('home');
    } catch (e) {
      // 自动识别"封禁"消息,走专用 banned 样式(含申诉说明)
      const isBanned = /封禁|禁用|banned/i.test(e.message || '');
      if (isBanned) {
        this.showAlert({
          type: 'banned',
          title: '账号已被封禁',
          message: e.message || '该账号已被封禁,请联系管理员',
          primaryText: '我知道了',
          secondaryText: '换个账号登录',
          onSecondary: () => {
            const idEl = document.getElementById('login-identifier');
            const pwEl = document.getElementById('login-password');
            if (idEl) idEl.value = '';
            if (pwEl) pwEl.value = '';
            if (idEl) idEl.focus();
          }
        });
      } else {
        this.showAlert({ type: 'warning', message: '登录失败: ' + e.message });
      }
    }
  },

  async passwordRegister() {
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    if (!nickname) { this.showAlert({ type: 'warning', message: '请输入昵称' }); return; }
    if (password.length < 4) { this.showAlert({ type: 'warning', message: '密码至少 4 位' }); return; }
    if (password !== password2) { this.showAlert({ type: 'warning', message: '两次输入的密码不一致' }); return; }
    try {
      await this.register(nickname, password, '');
      document.getElementById('welcome-overlay').style.display = 'none';
      if (window.App) App.switchView('home');
    } catch (e) {
      this.showAlert({ type: 'warning', message: '注册失败: ' + e.message });
    }
  },

  showWechatQREvent(e) {
    if (e) e.preventDefault();
    this.switchLoginTab('qrcode');
  },

  /** 拉起微信支付（mock：直接展示返回参数；生产 wx.chooseWXPay 调起） */
  async buyPlan(plan, amount) {
    if (!this.isLoggedIn) { this.showAlert({ type: 'info', title: '需要登录', message: '请先登录后再使用此功能' }); return; }
    const out_trade_no = 'PLAN_' + plan + '_' + Date.now();
    try {
      const resp = await this._fetch('/api/payment/wechat/create', {
        method: 'POST',
        body: JSON.stringify({
          out_trade_no,
          total_fee: amount,
          body: '秩研 Agent VIP - ' + plan,
          openid: 'mock_' + (this._user?.id || 'guest')
        })
      });
      const data = await resp.json();
      const el = document.getElementById('profile-pay-result');
      if (el) {
        el.innerHTML = `✅ 已生成预支付订单<br>
          <small>订单号：${data.out_trade_no}</small><br>
          <small>金额：¥${(data.total_fee/100).toFixed(2)}</small><br>
          <small style="color:#999">生产环境：将调用 wx.chooseWXPay 拉起支付；当前为 mock 状态。</small>`;
      }
    } catch (e) {
      this.showAlert({ type: 'warning', message: '支付下单失败: ' + e.message });
    }
  },

  wechatPay() {
    if (window.App) App.switchView('profile');
    setTimeout(() => this.buyPlan('monthly', 9900), 500);
  },

  async fetchProfile() {
    try {
      // v=20260905 探测性调用:避免 _fetch 拦截器对 401 触发"登录过期"弹窗(首次访问无 token 是预期)
      // v=20260904g 同时带 X-Auth-Token(网关透传),确保部署环境 token 不被网关 JWT 覆盖
      const resp = await fetch((window.APP_CONFIG?.API_BASE || '') + '/api/auth/profile', {
        headers: this._token ? { 'Authorization': `Bearer ${this._token}`, 'X-Auth-Token': this._token } : {},
        cache: 'no-store'
      });
      if (resp.status === 401) {
        // v=20260905 区分无 token(首次访问/已登出)与有 token 但失效:
        //  - 无 token:静默(用户未登录,profile 401 是预期)
        //  - 有 token:服务端判定 token 失效 → 登录失效提示
        if (this._token && !this._kickedHandled) {
          this._onSessionExpired();
        }
        return;
      }
      if (resp.ok) {
        const data = await resp.json();
        if (data.logged_in) {
          this._saveUser({
            id: data.id,
            username: data.username,
            nickname: data.nickname || data.username,
            avatar: data.avatar || (data.username ? data.username[0].toUpperCase() : '?'),
            role: data.role || 'user',
            // v=20260904b 缓存计数字段:供首页/测试中心统一取数(做题数 = total_practiced)
            total_questions: data.total_questions,
            total_practiced: data.total_practiced,
            total_notes: data.total_notes
          });
          this.renderUserBadge();
          this.renderSidebarUser();
          this.renderAdminNav();
        } else if (this._token && !this._kickedHandled) {
          // 兼容老版响应格式(200 + logged_in:false)
          this._onSessionExpired();
        }
      } else if (resp.status === 409 && this._token && !this._kickedHandled) {
        this._onKicked();
      }
    } catch { /* 静默 */ }
  },

  // ========== UI 渲染 ==========

  /** 内容区右上角用户头像 */
  renderUserBadge() {
    const el = document.getElementById('user-badge');
    if (!el) return;
    if (this.isLoggedIn) {
      el.innerHTML = `
        <div class="user-badge-avatar" title="${this._escapeHtml(this.nickname)}">${this.avatar}</div>
        <span class="user-badge-name">${this._escapeHtml(this.nickname)}</span>
        <button class="user-badge-logout" onclick="Auth.logout()" title="退出登录">退出</button>
      `;
      el.style.display = 'flex';
    } else {
      el.innerHTML = `
        <button class="user-badge-login" onclick="window.WelcomeLogin ? WelcomeLogin.open('login') : App.showAuthModal({mode:'login'})">🔑 登录</button>
        <button class="user-badge-register" onclick="window.WelcomeLogin ? WelcomeLogin.open('register') : App.showAuthModal({mode:'register'})">注册</button>
      `;
      el.style.display = 'flex';
    }
  },

  /** 侧栏底部用户区 */
  renderSidebarUser() {
    const el = document.getElementById('sidebar-user');
    if (!el) return;
    if (this.isLoggedIn) {
      el.innerHTML = `
        <div class="user-info-box">
          <div class="user-avatar">${this.avatar}</div>
          <div class="user-detail">
            <div class="user-name">${this._escapeHtml(this.nickname)}</div>
            <div class="user-stats">
              ${this.user.total_questions != null ? `提问 ${this.user.total_questions} 次` : ''}
              ${this.user.total_notes != null ? ` · 错题 ${this.user.total_notes}` : ''}
            </div>
          </div>
        </div>
        <button class="user-logout-btn" onclick="Auth.logout()">退出登录</button>
      `;
    } else {
      el.innerHTML = `<button class="user-login-btn" onclick="window.WelcomeLogin ? WelcomeLogin.open('login') : App.showAuthModal({mode:'login'})">🔑 登录 / 注册</button>`;
    }
  },

  // ========== 工具方法 ==========

  async _fetch(url, opts = {}) {
    // v=20260824 FormData(multipart 上传)不设 Content-Type,由浏览器自动带 boundary;其余默认 JSON
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const headers = { ...opts.headers };
    if (!isForm && !(headers['Content-Type'] || headers['content-type'])) {
      headers['Content-Type'] = 'application/json';
    }
    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
      // v=20260904g 身份映射修复：部署环境网关会替换 Authorization 头为平台 JWT，
      // 但自定义头 X-Auth-Token 原样透传 → 后端优先从 X-Auth-Token 解析真实 token，
      // 确保 token↔用户一一对应（禁止回退 demo/第一个用户）。
      headers['X-Auth-Token'] = this._token;
    }
    const resp = await fetch((window.APP_CONFIG?.API_BASE || '') + url, { ...opts, headers });
    // 全局拦截器 ①：409 = 同设备类型被其他设备抢占 → 强制下线弹窗
    if (resp.status === 409 && this._token && !this._kickedHandled) {
      this._onKicked();
    }
    // 全局拦截器 ②：401（认证/探测性接口除外）= token 过期/会话超时 → 登录失效提示（非"被踢"文案）
    // v=20260905 排除 /api/auth/profile(profile 是探测登录态的接口,401 时由 fetchProfile 自身按"有无 token"决定是否弹窗)
    if (resp.status === 401 && this._token &&
        !url.includes('/api/auth/login') && !url.includes('/api/auth/register') &&
        !url.includes('/api/auth/profile') && !this._kickedHandled) {
      this._onSessionExpired();
    }
    return resp;
  },

  fetchWithAuth(url, opts = {}) {
    return this._fetch(url, opts);
  },

  /** 被同类型设备抢占踢下线：弹窗 + 清凭证 + 引导重新登录 */
  _onKicked() {
    this._kickedHandled = true;   // 防抖：并发多个 409 只弹一次
    // 清空本地凭证（后端已权威判定会话失效）
    this._token = null;
    this._user = null;
    try {
      localStorage.removeItem('la_tutor_token');
      localStorage.removeItem('la_tutor_user');
    } catch (e) {}
    this._syncAuthUI();
    this.renderUserBadge();
    this.renderSidebarUser();
    this.renderAdminNav();
    if (typeof QuizSystem !== 'undefined') {
      QuizSystem._removedIds = [];
      QuizSystem._mistakesDirty = false;
      clearTimeout(QuizSystem._syncTimer);
    }
    // 强制下线弹窗（同设备类型抢占文案）
    let mask = document.getElementById('kicked-modal-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'kicked-modal-mask';
      mask.className = 'kicked-modal-mask';
      mask.innerHTML = `
        <div class="kicked-modal">
          <div class="kicked-icon">🔒</div>
          <div class="kicked-title">账号已在另一台同类型设备登录</div>
          <div class="kicked-msg">该账号已在另一台同类型设备登录，当前设备已被强制下线。请重新登录。</div>
          <button class="kicked-btn" id="kicked-confirm-btn">重新登录</button>
        </div>`;
      document.body.appendChild(mask);
    }
    mask.style.display = 'flex';
    const btn = document.getElementById('kicked-confirm-btn');
    btn.onclick = () => {
      mask.style.display = 'none';
      this._kickedHandled = false;
      // 回首页并打开登录弹窗
      if (window.App && typeof App.switchView === 'function') App.switchView('home');
      setTimeout(() => {
        if (window.WelcomeLogin && typeof WelcomeLogin.open === 'function') WelcomeLogin.open('login');
        else if (window.App && typeof App.showAuthModal === 'function') App.showAuthModal({ mode: 'login' });
      }, 300);
    };
  },

  /** 登录已过期/会话超时：清凭证 + 提示重新登录（非"被踢"文案） */
  _onSessionExpired() {
    this._kickedHandled = true;
    this._token = null;
    this._user = null;
    try {
      localStorage.removeItem('la_tutor_token');
      localStorage.removeItem('la_tutor_user');
    } catch (e) {}
    this._syncAuthUI();
    this.renderUserBadge();
    this.renderSidebarUser();
    this.renderAdminNav();
    // 轻提示
    let t = document.getElementById('kicked-modal-mask');
    if (!t) {
      t = document.createElement('div');
      t.id = 'kicked-modal-mask';
      t.className = 'kicked-modal-mask';
      t.innerHTML = `
        <div class="kicked-modal">
          <div class="kicked-icon">⏳</div>
          <div class="kicked-title">登录已过期</div>
          <div class="kicked-msg">您的登录会话已过期，请重新登录后继续使用。</div>
          <button class="kicked-btn" id="kicked-confirm-btn">重新登录</button>
        </div>`;
      document.body.appendChild(t);
    } else {
      t.querySelector('.kicked-icon').textContent = '⏳';
      t.querySelector('.kicked-title').textContent = '登录已过期';
      t.querySelector('.kicked-msg').textContent = '您的登录会话已过期，请重新登录后继续使用。';
    }
    t.style.display = 'flex';
    const btn = document.getElementById('kicked-confirm-btn');
    btn.onclick = () => {
      t.style.display = 'none';
      this._kickedHandled = false;
      if (window.App && typeof App.switchView === 'function') App.switchView('home');
      setTimeout(() => {
        if (window.WelcomeLogin && typeof WelcomeLogin.open === 'function') WelcomeLogin.open('login');
        else if (window.App && typeof App.showAuthModal === 'function') App.showAuthModal({ mode: 'login' });
      }, 300);
    };
  },

  _escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};

// 导出到全局（便于外部/调试访问）
window.Auth = Auth;
