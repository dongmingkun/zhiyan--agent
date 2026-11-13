/* app-03-auth.js —— 原 js/app.v3.19.js 第 1678–1959 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._startFormulaCarousel = function _startFormulaCarousel() {
    const strip = document.getElementById('home-formula-strip');
    if (!strip) return;
    const items = strip.querySelectorAll('.hf-formula');
    if (items.length < 2) return;
    if (this._formulaTimer) { clearInterval(this._formulaTimer); this._formulaTimer = null; }
    let i = 0;
    items.forEach(it => it.classList.remove('hl'));
    items[0].classList.add('hl');
    this._formulaTimer = setInterval(() => {
      items[i].classList.remove('hl');
      i = (i + 1) % items.length;
      items[i].classList.add('hl');
    }, 2200);
  };

  // 首页：学习概览数据 (P1:无数据态显示"开始第一次练习"CTA)

  /** 消费首页 data-preset 暂存的文本,注入到对应视图的输入框 */
App._consumePreset = function _consumePreset(view) {
    try {
      const pending = sessionStorage.getItem('la_pending_preset');
      const target = sessionStorage.getItem('la_pending_preset_target');
      if (!pending || target !== view) return;
      sessionStorage.removeItem('la_pending_preset');
      sessionStorage.removeItem('la_pending_preset_target');

      if (view === 'chat') {
        const input = document.getElementById('chat-input');
        if (input) {
          input.value = pending;
          input.focus();
          if (this.autoResize) this.autoResize(input);
        }
      } else if (view === 'practice' || view === 'quiz') {
        const search = document.querySelector('#view-' + view + ' input[type="text"], #view-' + view + ' textarea');
        if (search) {
          search.value = pending;
          search.dispatchEvent(new Event('input', { bubbles: true }));
          search.focus();
        }
      }
    } catch (e) { /* sessionStorage 不可用时静默 */ }
  };

App._renderHomeStats = async function _renderHomeStats() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const ctaEl = document.getElementById('home-cta-empty');
    const gridEl = document.getElementById('home-stats-grid');
    const tagEl = document.getElementById('home-stats-tag');
    const diagEl = document.getElementById('home-diag-guide');
    const reviewCard = document.getElementById('hs-review');
    const reviewNumEl = document.getElementById('hs-review-num');
    if (!Auth.isLoggedIn) {
      // 未登录:显示 CTA(里面有"登录"按钮跳 welcome-overlay)
      if (ctaEl) ctaEl.style.display = '';
      if (gridEl) gridEl.style.display = 'none';
      if (tagEl) tagEl.textContent = '登录后开始记录';
      if (diagEl) diagEl.style.display = 'none';
      return;
    }
    try {
      const [ma, profile, review] = await Promise.all([
        Auth._fetch('/api/mistakes/analyze').then(r => r.ok ? r.json() : {}),
        Auth._fetch('/api/auth/profile').then(r => r.ok ? r.json() : {}),
        Auth._fetch('/api/review/summary').then(r => r.ok ? r.json() : {due_today: 0, streak_days: 0}),
      ]);
      const summary = ma.summary || {};
      const mistakes = summary.total_mistakes || 0;
      const weak = summary.weak_kps || 0;
      // v=20260904b 数据一致性:「已练习」统一取题库实际做题记录(total_practiced = knowledge_mastery.attempts 总和),
      // 不再用 total_questions(提问数) 或 total_quizzes(不存在字段)。
      const quizzes = profile.total_practiced ?? profile.total_questions ?? 0;
      const days = profile.created_at ? Math.max(1, Math.ceil((Date.now() - new Date(profile.created_at).getTime()) / 86400000)) : 1;

      // v=20260907d 今日复习卡
      if (reviewCard) reviewCard.style.display = '';
      if (reviewNumEl) {
        if ((review.due_today || 0) > 0) {
          reviewNumEl.textContent = review.due_today;
        } else {
          reviewNumEl.textContent = '已完成 ✓';
        }
      }

      // v=20260907d 新人诊断引导：累计作答 < 5 次时，学习概览顶部显示引导卡
      if (diagEl) {
        if (quizzes < 5) {
          diagEl.style.display = '';
        } else {
          diagEl.style.display = 'none';
        }
      }

      // 判定是否"有数据":只要任一指标 > 0 即视为有数据
      const hasData = (mistakes + weak + quizzes) > 0;
      if (hasData) {
        set('hs-mistakes', mistakes);
        set('hs-weak', weak);
        set('hs-quiz', quizzes);
        set('hs-days', days);
        if (ctaEl) ctaEl.style.display = 'none';
        if (gridEl) gridEl.style.display = '';
        if (tagEl) tagEl.textContent = '登录后自动同步';
      } else {
        // 有账号但 0 数据 — CTA + 鼓励开始练习
        if (ctaEl) ctaEl.style.display = '';
        if (gridEl) gridEl.style.display = 'none';
        if (tagEl) tagEl.textContent = '刚开始,先做一道吧';
        // 替换 CTA 文案,提示有账号
        const ctaTitle = ctaEl && ctaEl.querySelector('.home-cta-title');
        const ctaDesc = ctaEl && ctaEl.querySelector('.home-cta-desc');
        if (ctaTitle) ctaTitle.textContent = '准备就绪,先做第一道?';
        if (ctaDesc) ctaDesc.textContent = '建议从「矩阵求逆」「特征值分解」「向量正交化」这些最常考题型开始,每题 30 秒即可完成';
      }
    } catch {
      if (ctaEl) ctaEl.style.display = '';
      if (gridEl) gridEl.style.display = 'none';
      if (diagEl) diagEl.style.display = 'none';
    }
  };

  // ============ 用户认证 ============

App.showAuthModal = function showAuthModal(opts) {
    // 兼容旧版：现在只用一个 welcome-overlay，所以这里改为打开它并切换 tab
    const { mode = 'login' } = opts || {};
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.style.display = 'flex';
    if (window.Auth && Auth.switchAuthTab) Auth.switchAuthTab(mode);
  };

App.hideAuthModal = function hideAuthModal() {
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.style.display = 'none';
  };

App.skipWelcome = function skipWelcome() {
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.style.display = 'none';
  };

App.switchAuthTab = function switchAuthTab(tab) {
    if (window.Auth && Auth.switchAuthTab) {
      Auth.switchAuthTab(tab);
      return;
    }
    // 兜底：兼容旧版
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    const tabEl = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
    if (tabEl) tabEl.classList.add('active');
  };

App.showForgotPassword = function showForgotPassword() {
    this.switchAuthTab('forgot');
    document.getElementById('forgot-error').textContent = '';
    document.getElementById('forgot-info').style.display = 'none';
    document.getElementById('forgot-reset-step').style.display = 'none';
    document.getElementById('forgot-lookup-btn').style.display = '';
  };

App.doForgotPassword = async function doForgotPassword() {
    const username = document.getElementById('forgot-username').value.trim();
    const errEl = document.getElementById('forgot-error');
    if (!username) { errEl.textContent = '请输入用户名'; return; }
    errEl.textContent = '';
    try {
      const resp = await Auth._fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ username })
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.detail || '查找失败');
      }
      const data = await resp.json();
      document.getElementById('forgot-info').style.display = '';
      document.getElementById('forgot-info').textContent = data.hint;
      document.getElementById('forgot-reset-step').style.display = '';
      document.getElementById('forgot-lookup-btn').style.display = 'none';
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

App.doResetPassword = async function doResetPassword() {
    const username = document.getElementById('forgot-username').value.trim();
    const newPassword = document.getElementById('forgot-new-password').value.trim();
    const errEl = document.getElementById('forgot-error');
    if (!username) { errEl.textContent = '请输入用户名'; return; }
    if (!newPassword || newPassword.length < 4) { errEl.textContent = '密码至少 4 个字符'; return; }
    errEl.textContent = '';
    try {
      const resp = await Auth._fetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username, new_password: newPassword })
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.detail || '重置失败');
      }
      const data = await resp.json();
      // v=20260926 成功提示改为绿色后不再立刻重置颜色(原来紧接着的 style.color=''
      // 把 message 的绿色提示当场抹掉,用户看到的仍是错误态的默认色);
      // 颜色重置放到 2 秒后跳转登录的回调里,与 textContent 清空同步。
      errEl.style.color = '#10b981';
      errEl.textContent = data.message + '，即将跳转登录...';
      setTimeout(() => {
        document.getElementById('forgot-username').value = '';
        document.getElementById('forgot-new-password').value = '';
        document.getElementById('forgot-info').style.display = 'none';
        document.getElementById('forgot-reset-step').style.display = 'none';
        document.getElementById('forgot-lookup-btn').style.display = '';
        document.getElementById('forgot-error').textContent = '';
        errEl.style.color = '';   // 跳转前恢复默认颜色,避免下次错误提示仍是绿色
        this.switchAuthTab('login');
      }, 2000);
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

App.showDeleteAccount = function showDeleteAccount() {
    document.getElementById('delete-error').textContent = '';
    document.getElementById('delete-password').value = '';
    document.getElementById('delete-account-overlay').style.display = 'flex';
  };

App.doDeleteAccount = async function doDeleteAccount() {
    const password = document.getElementById('delete-password').value.trim();
    const errEl = document.getElementById('delete-error');
    if (!password) { errEl.textContent = '请输入密码以确认注销'; return; }
    errEl.textContent = '';
    try {
      const resp = await Auth.fetchWithAuth('/api/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password })
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.detail || '注销失败');
      }
      document.getElementById('delete-account-overlay').style.display = 'none';
      Auth.logout();
      this.addBotMessage('您的账号已成功注销。感谢使用线性代数助学智能体。');
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

App.doLogin = async function doLogin() {
    const identifier = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errEl = document.getElementById('login-error');
    if (!identifier || !password) { errEl.textContent = '请填写用户名/昵称和密码'; return; }
    errEl.textContent = '';
    try {
      await Auth.login(identifier, password);
      this.hideAuthModal();
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

App.doRegister = async function doRegister() {
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const avatar = document.getElementById('reg-avatar').value.trim();
    const errEl = document.getElementById('reg-error');
    if (!nickname) { errEl.textContent = '请填写昵称'; return; }
    if (nickname.length < 1 || nickname.length > 20) { errEl.textContent = '昵称需 1-20 个字符'; return; }
    if (!password || password.length < 4) { errEl.textContent = '密码至少 4 个字符'; return; }
    errEl.textContent = '';
    try {
      await Auth.register(nickname, password, avatar);
      this.hideAuthModal();
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

  // ============ 教学资源（v=20260824 学术文献 + SVG 图标） ============

  /** v=20260824 通用 SVG 图标工具：把语义名映射到 lucide 风格线性图标 */
