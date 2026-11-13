/* app-01-core.js —— 原 js/app.v3.19.js 第 1–586 行拆分（2026-09-11 模块化）。
 * 保留顶层常量，App 对象字面量转换为 App.xxx 赋值形式，语义不变。*/
/**
 * 主应用控制器
 * 管理界面导航、矩阵编辑器、计算工具、可视化模块
 */

// 后端 API 地址：从 js/config.js 读取（单一配置入口，便于部署切换）
// 同源部署时 config.js 中保持 ''；分域部署时改成后端公网地址
const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '';

const App = window.App || {};
App.currentView = 'chat';
App.currentChapter = null;
App.currentSection = null;
App.animationFrame = null;
App.transformProgress = 0;
App.isMobile = false;
App.transformDirection = 1;
App.currentTheme = 'indigo';

  // 主题列表
App.themes = {
    indigo: { name: '学术靛蓝', color: '#4f46e5' },
    emerald: { name: '学院绿', color: '#059669' },
    ocean: { name: '海洋蓝', color: '#0284c7' },
    sunset: { name: '暖阳橙', color: '#ea580c' },
    rose: { name: '玫瑰红', color: '#e11d48' },
    violet: { name: '典雅紫', color: '#7c3aed' },
    dark: { name: '深色模式', color: '#1e293b' }
  };

  // 矩阵编辑器状态
App.matrixA = { rows: 3, cols: 3, data: [[1,2,0],[0,1,0],[0,0,1]] };
App.matrixB = { rows: 2, cols: 2, data: [[1,0],[0,1]] };

  /** v=20260922x 返回上一级视图(供 Android 返回键/手势/返回按钮调用) */
App.goBack = function goBack() {
    // 若栈顶即当前视图,先弹出(当前视图已在页面上,避免返回后仍在原地)
    if (this._viewStack && this._viewStack.length &&
        this._viewStack[this._viewStack.length - 1] === this.currentView) {
      this._viewStack.pop();
    }
    if (this._viewStack && this._viewStack.length) {
      const prev = this._viewStack.pop();
      this.switchView(prev, { back: true });
      return true;
    }
    // 栈空:回首页(若已在首页则返回 false,由调用方决定退出)
    if (this.currentView !== 'home') {
      this.switchView('home');
      return true;
    }
    return false;
  };

App.init = function init() {
    // v=20260922x 视图栈初始化 + 浏览器返回键(popstate)支持
    if (!this._viewStack) this._viewStack = [];
    window.addEventListener('popstate', () => {
      if (!this.goBack()) {
        // 栈空:不做额外处理(浏览器默认行为)
      }
    });
    Auth.init();
    this.loadTheme();
    this.renderKnowledgeNav();
    this.renderMatrixEditor('a');
    this.renderMatrixEditor('b');
    this.refineSidebar();
    this.bindEvents();
    this.initMobileDetection();
    this.initMobileNav();
    this.initSidebarCoach();  // v=20260908g 左上角入口一次性引导气泡
    this._bindSidebarCloseDelegate();  // v=20260903q 事件委托兜底，防重渲染后监听丢失
    this.initThemeSwitcher();
    this.initBackToTop();
    this.initImageUpload();
    this.initPersonalization();
    // v=20260910a 移动端顶部导航:sync body.home-view 类与初始视图一致
    if (document.querySelector('.view-panel.active')?.id === 'view-home') {
      document.body.classList.add('home-view');
    } else {
      document.body.classList.remove('home-view');
    }
    // 拓扑图谱 Tab 切换
    document.querySelectorAll('.topo-tab').forEach(t => {
      t.addEventListener('click', () => {
        if (t.dataset.view) this._switchTopoTab(t.dataset.view);
      });
    });
    // 聊天消息图片点击放大查看
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('chat-msg-image')) {
        const lb = document.createElement('div');
        lb.className = 'chat-img-lightbox';
        lb.innerHTML = `<img src="${t.src}" alt="图片" />`;
        lb.addEventListener('click', () => lb.remove());
        document.body.appendChild(lb);
      }
    });
    QuizSystem.init();
    // 恢复上次关闭时所在视图（刷新或重开保留位置）
    const savedView = localStorage.getItem('la_lastView');
    if (savedView && document.getElementById(`view-${savedView}`)) {
      this.switchView(savedView);
    } else {
      this.switchView('home');
    }
    setTimeout(() => {
      this.addBotMessage(ChatEngine.handleGreeting());
    }, 300);
    // 首次访问：显示欢迎页
    if (!Auth.isLoggedIn && Auth.guestCount === 0) {
      const overlay = document.getElementById('welcome-overlay');
      overlay.style.display = 'flex';
      setTimeout(() => Auth._renderLoginQR('wechat'), 60);
    }
  };

  // ============ v=20260825 侧边栏重构：分组 + 统一线描图标 ============
App._navRefined = false;

App._navGroups = [
    { id: 'learn', label: '学习', views: ['chat', 'knowledge', 'topology', 'resources'] },
    { id: 'explore', label: '计算与探索', views: ['tools', 'visualizer', 'engine', 'workflow'] },
    { id: 'practice', label: '测试与巩固', views: ['quiz', 'practice', 'student'] },
    { id: 'review', label: '巩固提升', views: ['review', 'mistakes'] },
    { id: 'mine', label: '我的', views: ['friends', 'profile', 'history', 'admin'] }
  ];

App._navIcons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.2 10.3v8.2h11.6v-8.2"/><path d="M10.2 18.5v-4.8h3.6v4.8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5.5h14v10.2h-8.2L7 19v-3.3H5z"/><path d="M8.5 10.6h7M8.5 13h4.6"/></svg>',
    knowledge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5c-1.6-1-4-1.4-6.5-1v13c2.5-.4 4.9 0 6.5 1 1.6-1 4-1.4 6.5-1v-13c-2.5-.4-4.9 0-6.5 1z"/><path d="M12 6.5v13"/><path d="M8 9h2M8 12h2M14 9h2M14 12h2"/></svg>',
    topology: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.2" cy="12" r="2.1"/><circle cx="17.8" cy="6.4" r="2.1"/><circle cx="17.8" cy="17.6" r="2.1"/><path d="M8.3 11.2l7.3-3.9M8.3 12.8l7.3 3.9"/></svg>',
    resources: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h6.4l1.5 2h8.1v9H4z"/><path d="M4 7V5.8h6.4l1.5 1.2"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="4" width="13" height="17" rx="1.6"/><path d="M8.5 8.3h7M8.5 12h2.1M13.4 12h2.1M8.5 15.2h2.1M13.4 15.2h2.1"/></svg>',
    visualizer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 19.5h15"/><path d="M6.5 19.5V12M11.2 19.5V7.5M16 19.5v-8"/><circle cx="16" cy="7.5" r="1.6"/></svg>',
    engine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4.5" width="14" height="15" rx="1.8"/><path d="M9 12.2l2.1 2.1 4.1-4.6"/></svg>',
    workflow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="4.5" width="6.2" height="6.2" rx="1.3"/><rect x="13.3" y="13.3" width="6.2" height="6.2" rx="1.3"/><path d="M10.7 7.6h4.2v5.7M13.3 17.6H10.7"/></svg>',
    quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4.5" width="12" height="16" rx="1.8"/><path d="M9 4.2V3.2h6v1M9 9.5h6M9 13h6M9 16.5h3.5"/></svg>',
    practice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 18.6l4.8-1.2 9.2-9.2-3.6-3.6-9.2 9.2z"/><path d="M12.8 7.1l3.6 3.6M7.5 18.4v2.2h9"/></svg>',
    mistakes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z"/><path d="M12 7.5V12l3 1.8"/><path d="M5 5l1.8 1.8M19 5l-1.8 1.8"/></svg>',
    student: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="10" r="3.2"/><path d="M5.5 19.4c1.3-2.8 3.5-4.2 6.5-4.2s5.2 1.4 6.5 4.2"/><path d="M4 6.4l8-2.4 8 2.4-8 2.5z"/><path d="M7 8.3v3.4"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9.2" r="3.1"/><path d="M5.8 19c1.2-2.5 3.3-3.8 6.2-3.8s5 1.3 6.2 3.8"/><path d="M4.4 6h3.2M16.4 6h3.2"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.1 2.1"/></svg>',
    friends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9.2" r="2.6"/><circle cx="16.3" cy="10.4" r="2"/><path d="M4.4 18.2c1-2.1 2.6-3.2 4.6-3.2s3.6 1.1 4.6 3.2M14.6 15.8c1.8.4 3.1 1.4 3.9 3"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 4.2v2M12 17.8v2M4.2 12h2M17.8 12h2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M17.5 6.5l-1.4 1.4M7.9 16.1l-1.4 1.4"/></svg>'
  };

App.refineSidebar = function refineSidebar() {
    if (this._navRefined) return;
    const nav = document.querySelector('.sidebar .nav-list');
    if (!nav) return;

    nav.querySelectorAll('.nav-section-label').forEach(el => el.remove());
    const frag = document.createDocumentFragment();
    const home = nav.querySelector('.nav-item[data-view="home"]');
    if (home) {
      home.classList.add('nav-home');
      this._setNavIcon(home, 'home');
      frag.appendChild(home);
    }

    this._navGroups.forEach(group => {
      const wrap = document.createElement('div');
      wrap.className = 'nav-group';
      wrap.dataset.group = group.id;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-group-toggle';
      toggle.dataset.group = group.id;
      toggle.setAttribute('aria-expanded', 'true');
      // v=20260906b 运行时分组标题去彩色：label 用内联灰字，chevron/组图标 stroke=currentColor（跟随文字色）
      toggle.innerHTML = `<span class="nav-group-label" style="font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--text-muted,#94a3b8);background:transparent;">${group.label}</span><svg class="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 10l3.5 3.5L15.5 10"/></svg>`;

      const sub = document.createElement('div');
      sub.className = 'nav-sub';
      group.views.forEach(view => {
        const item = nav.querySelector(`.nav-item[data-view="${view}"]`);
        if (!item) return;
        this._setNavIcon(item, view);
        sub.appendChild(item);
      });
      wrap.appendChild(toggle);
      wrap.appendChild(sub);
      frag.appendChild(wrap);
    });

    nav.appendChild(frag);

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('la_nav_groups') || '{}'); } catch (e) { saved = {}; }
    nav.querySelectorAll('.nav-group').forEach(group => {
      // v=20260903b 首次进入(无本地记录)默认全部展开，形成完整索引；用户手动收起后仍记住选择
      const open = Object.prototype.hasOwnProperty.call(saved, group.dataset.group)
        ? saved[group.dataset.group]
        : true;
      group.classList.toggle('open', open);
      const groupToggle = group.querySelector('.nav-group-toggle');
      if (groupToggle) groupToggle.setAttribute('aria-expanded', String(open));
    });

    nav.querySelectorAll('.nav-group-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const group = toggle.closest('.nav-group');
        const open = !group.classList.contains('open');
        group.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        try {
          const next = JSON.parse(localStorage.getItem('la_nav_groups') || '{}');
          next[group.dataset.group] = open;
          localStorage.setItem('la_nav_groups', JSON.stringify(next));
        } catch (e) {}
      });
    });

    this._navRefined = true;
  };

App._setNavIcon = function _setNavIcon(item, view) {
    const iconEl = item && item.querySelector('.nav-icon');
    const svg = this._navIcons[view];
    if (iconEl && svg) iconEl.innerHTML = svg;
  };

  // ============ v=20260825 个性化学习画像 ============
App.personalProfile = function personalProfile() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('la_learner_profile') || '{}'); } catch (e) { p = {}; }
    return {
      goal: p.goal || '课堂同步',
      pace: p.pace || '适中',
      weak: Array.isArray(p.weak) ? p.weak.filter(Boolean).slice(0, 6) : []
    };
  };

App.openPersonalSetup = function openPersonalSetup() {
    const p = this.personalProfile();
    const goal = document.getElementById('personal-goal');
    const pace = document.getElementById('personal-pace');
    if (goal) goal.value = p.goal;
    if (pace) pace.value = p.pace;
    document.querySelectorAll('.personal-weak-item input').forEach(input => {
      input.checked = p.weak.includes(input.value);
    });
    const overlay = document.getElementById('personal-overlay');
    if (overlay) overlay.style.display = 'flex';
  };

App.closePersonalSetup = function closePersonalSetup() {
    const overlay = document.getElementById('personal-overlay');
    if (overlay) overlay.style.display = 'none';
  };

App.savePersonalSetup = function savePersonalSetup() {
    const profile = {
      goal: document.getElementById('personal-goal')?.value || '课堂同步',
      pace: document.getElementById('personal-pace')?.value || '适中',
      weak: Array.from(document.querySelectorAll('.personal-weak-item input:checked'))
        .map(input => input.value)
        .filter(Boolean)
    };
    try { localStorage.setItem('la_learner_profile', JSON.stringify(profile)); } catch (e) {}
    this.closePersonalSetup();
    this.renderPersonalPanel();
    this._renderChatPersonalStrip();
    if (this._adminToast) this._adminToast('学习设置已保存，回答会更有针对性', 'ok');
  };

App.renderPersonalPanel = async function renderPersonalPanel() {
    const card = document.getElementById('personal-card');
    if (!card) return;
    const p = this.personalProfile();
    let mentor = null;
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn) {
      try {
        const r = await Auth.fetchWithAuth('/api/student/mentor_tip');
        if (r.ok) mentor = await r.json();
      } catch (e) {}
    }

    const weakText = p.weak && p.weak.length
      ? p.weak.slice(0, 3).join('、')
      : '暂无明确薄弱点';
    const goalText = p.goal || '课堂同步';
    const paceText = p.pace || '适中';
    const advice = mentor && mentor.tip
      ? mentor.tip
      : `先围绕「${weakText}」做一次 15 分钟的小练习，再用一句话向智能问答复述你理解的定义。`;
    const task = mentor && mentor.daily_tasks && mentor.daily_tasks.length
      ? mentor.daily_tasks[0]
      : null;

    const taskHtml = task
      ? `<div class="personal-task"><span class="personal-task-mark">下一步</span><span>${this.escapeHtml(task.kp || task.suggestion || '完成一次专项练习')}</span></div>`
      : `<div class="personal-task"><span class="personal-task-mark">下一步</span><span>去「练习题库」完成一组薄弱点题目</span></div>`;

    card.innerHTML = `
      <div class="personal-card-top">
        <div class="personal-meta"><span>目标</span><b>${this.escapeHtml(goalText)}</b></div>
        <div class="personal-meta"><span>节奏</span><b>${this.escapeHtml(paceText)}</b></div>
        <div class="personal-meta"><span>优先</span><b>${this.escapeHtml(weakText)}</b></div>
      </div>
      <div class="personal-advice">${this.escapeHtml(advice)}</div>
      ${taskHtml}
      <div class="personal-actions">
        <button class="personal-btn primary" onclick="App.switchView('practice')">去练习</button>
        <button class="personal-btn" onclick="App.switchView('chat')">带着问题提问</button>
        <button class="personal-btn ghost" onclick="App.openPersonalSetup()">调整设置</button>
      </div>
    `;
  };

App.initPersonalization = function initPersonalization() {
    this.renderPersonalPanel();
    this._renderChatPersonalStrip();
  };

App._renderChatPersonalStrip = function _renderChatPersonalStrip() {
    const strip = document.getElementById('chat-personal-strip');
    if (!strip) return;
    const p = this.personalProfile();
    const weak = p.weak && p.weak.length ? p.weak.slice(0, 3).join('、') : '还没有设置薄弱点';
    strip.innerHTML = `
      <span class="cps-dot" aria-hidden="true"></span>
      <span>目标：${this.escapeHtml(p.goal)} · 节奏：${this.escapeHtml(p.pace)} · 优先：${this.escapeHtml(weak)}</span>
      <button class="cps-edit" onclick="App.openPersonalSetup()">调整</button>
      <span class="cps-tip">回答会参考你的画像</span>
    `;
    strip.style.display = 'flex';
  };

App.buildPersonalAskProfile = function buildPersonalAskProfile() {
    const p = this.personalProfile();
    return {
      goal: p.goal,
      pace: p.pace,
      weak: p.weak
    };
  };

  // ============ 导航切换 ============

  // v=20260922x 移动端视图栈:返回按钮/系统返回手势回到上一级(而非退出/直接回首页)
App.switchView = function switchView(view, opts = {}) {
    // v=20260922x 视图栈维护:非"返回"路径且非首页且与栈顶不同 → 入栈
    if (!opts.back && view !== 'home') {
      if (this._viewStack && this._viewStack[this._viewStack.length - 1] !== view) {
        this._viewStack.push(view);
      }
    } else if (view === 'home') {
      this._viewStack = [];   // 回首页清空栈
    }
    if (!this._viewStack) this._viewStack = [];
    // 记录旧视图（用于离开时销毁拓扑图谱）
    const prevView = this.currentView;
    this.currentView = view;
    if (this._formulaTimer && view !== 'home') { clearInterval(this._formulaTimer); this._formulaTimer = null; }
    localStorage.setItem('la_lastView', view);
    // v=20260824d 智能问答:进入 chat 视图时刷新图像识别状态条
    if (view === 'chat') {
      setTimeout(() => this._renderChatVisionBar(), 120);
    }
    // v=20260903e 标记 chat 视图(仅移动端用于隐藏全局抽屉按钮/挂专属顶栏)
    document.body.classList.toggle('chat-view-active', view === 'chat');
    // v=20260824q 智能工作流:进入时触发"题目"输入框自动撑高
    if (view === 'workflow') {
      setTimeout(() => {
        try {
          // 题干：solve 视图 - 既绑表单拖拽，又绑 textarea 粘贴
          this.Workflow._autoGrowTextarea();
          // 错题诊断：原题区 + 解答区共用一个 form，只需绑一次表单级 drag/drop
          const dForm = document.getElementById('wf-form-diagnose');
          const dProbTa = document.getElementById('wf-diagnose-problem');
          const dAttaTa = document.getElementById('wf-diagnose-attempt');
          if (dForm && dProbTa) this.Workflow._bindImageDnD('diagnose', dProbTa);
          // 解答 textarea 粘贴：落到该 textarea 的 suffix（诊断 - 解答）
          if (dAttaTa) {
            const handler = (e) => {
              const items = e.clipboardData && e.clipboardData.items;
              if (!items) return;
              for (const it of items) {
                if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
                  const f = it.getAsFile();
                  if (f) {
                    if (f.size > 4 * 1024 * 1024) {
                      this.Workflow._error(this.Workflow._resultEl('diagnose'), '图片过大（上限 4MB）');
                      return;
                    }
                    const input = this.Workflow._imageFile('diagnose-attempt');
                    if (!input) return;
                    const dt = new DataTransfer();
                    dt.items.add(f);
                    input.files = dt.files;
                    this.Workflow.previewImage(input, 'diagnose-attempt');
                    e.preventDefault();
                    return;
                  }
                }
              }
            };
            // 防止重复绑定
            if (!dAttaTa.dataset.pasteBound) {
              dAttaTa.dataset.pasteBound = '1';
              dAttaTa.addEventListener('paste', handler);
            }
          }
          // 同时给原题 textarea 绑粘贴（落入 'diagnose' suffix）
          if (dProbTa && !dProbTa.dataset.pasteBound) {
            dProbTa.dataset.pasteBound = '1';
            dProbTa.addEventListener('paste', (e) => {
              const items = e.clipboardData && e.clipboardData.items;
              if (!items) return;
              for (const it of items) {
                if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
                  const f = it.getAsFile();
                  if (f) {
                    if (f.size > 4 * 1024 * 1024) {
                      this.Workflow._error(this.Workflow._resultEl('diagnose'), '图片过大（上限 4MB）');
                      return;
                    }
                    const input = this.Workflow._imageFile('diagnose');
                    if (!input) return;
                    const dt = new DataTransfer();
                    dt.items.add(f);
                    input.files = dt.files;
                    this.Workflow.previewImage(input, 'diagnose');
                    e.preventDefault();
                    return;
                  }
                }
              }
            });
          }
        } catch (e) {}
      }, 60);
    }

    // ── 全屏模式切换：首页显示侧边栏，其他页全屏 + 返回按钮 ──
    const container = document.getElementById('app-container');
    const backBar = document.getElementById('back-home-bar');
    const backTitle = document.getElementById('back-home-title');
    const titles = {
      chat: '智能问答', knowledge: '知识体系', tools: '计算工具',
      visualizer: '几何可视化', engine: '可验证求解', workflow: '智能工作流',
      quiz: '测试中心', practice: '练习题库', mistakes: '错题本', review: '复习计划',
      student: '学习画像', friends: '好友与私信', profile: '个人空间', history: '问答历史',
      admin: '管理后台', resources: '教学资源', topology: '知识拓扑图谱'
    };
    // v=20260909k 移动端知识/拓扑视图:自带头部按钮(.kb-hamburger / .topo-hamburger)与返回条重叠 → 隐藏返回条,
    // 避免顶部"返回"被汉堡按钮遮挡。用户通过 hamburger 抽屉 + sidebar "首页" 导航即可。
    const isMobileNow = document.body.classList.contains('mobile-mode');
    const hideBackBarViews = (view === 'knowledge' || view === 'topology') && isMobileNow;
    if (view === 'home' || hideBackBarViews) {
      container?.classList.remove('fullscreen');
      if (backBar) backBar.style.display = 'none';
      document.body.classList.add('home-view');
    } else {
      container?.classList.add('fullscreen');
      if (backBar) backBar.style.display = 'flex';
      if (backTitle) backTitle.textContent = titles[view] || view;
      document.body.classList.remove('home-view');
    }

    // 移动端：切换视图时收起抽屉
    document.getElementById('app-container')?.classList.remove('sidebar-open');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    const activeNav = document.querySelector(`.nav-item[data-view="${view}"]`);
    const activeGroup = activeNav && activeNav.closest('.nav-group');
    if (activeGroup) {
      activeGroup.classList.add('open');
      const groupToggle = activeGroup.querySelector('.nav-group-toggle');
      if (groupToggle) groupToggle.setAttribute('aria-expanded', 'true');
    }
    // v=20260907d 侧边栏自动滚动：让当前激活导航项可见（避免长侧边栏切换后被遮挡）
    if (activeNav && typeof activeNav.scrollIntoView === 'function') {
      setTimeout(() => {
        try { activeNav.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
      }, 80);
    }
    document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${view}`)?.classList.add('active');

    // 隐藏回到顶部按钮
    document.getElementById('back-to-top')?.classList.remove('visible');

    // 关闭主题面板
    document.getElementById('theme-panel')?.classList.remove('show');

    // ── P0/P1 配套:从首页带入 preset 文本(自动注入到对应输入框) ──
    setTimeout(() => this._consumePreset(view), 60);

    // 离开好友视图时停止所有轮询
    if (view !== 'friends') {
      this._stopFriendsPolling();
      this._stopChatPolling();
    }

    // 离开拓扑图谱 → 完整销毁（echarts.dispose + 清空容器DOM + 关闭抽屉）
    if (prevView === 'topology' && view !== 'topology') {
      this.topologyDestroy();
    }
    if (view === 'visualizer') {
      setTimeout(() => this.initVisualizer(), 100);
    }
    if (view === 'topology') {
      // 懒加载：进入视图后容器可见，此时才初始化 ECharts（修复空白 bug）
      setTimeout(() => this.renderTopology(), 120);
    }
    if (view === 'tools') {
      // 确保矩阵编辑器渲染
      setTimeout(() => this.renderMatrixEditor('a'), 50);
    }
    if (view === 'quiz') {
      setTimeout(() => QuizUI.renderQuizHome(), 50);
    }
    if (view === 'practice') {
      setTimeout(() => QuizUI.renderPracticeHome(), 50);
    }
    if (view === 'mistakes') {
      setTimeout(() => QuizUI.renderMistakesHome(), 50);
    }
    if (view === 'review') {
      setTimeout(() => QuizUI.renderReviewHome(), 50);
    }
    if (view === 'history') {
      setTimeout(() => this.renderHistory(), 50);
    }
    if (view === 'knowledge') {
      // 支持从拓扑【开始学习】跳转定位：读 URL 参数自动展开/定位/高亮
      setTimeout(() => this._applyKnowledgeLocate(), 60);
    }
    if (view === 'resources') {
      setTimeout(() => this.renderResources(), 50);
    }
    if (view === 'profile') {
      setTimeout(() => this.renderProfile(), 50);
    }
    if (view === 'friends') {
      setTimeout(() => this.renderFriends(), 50);
    }
    if (view === 'admin') {
      // 管理后台：非管理员拒绝进入
      setTimeout(() => {
        if (!Auth.isAdmin) {
          this._adminToast('🔒 需要管理员权限才能访问管理后台', 'warn');
          this.switchView('home');
          return;
        }
        this.adminLoadStats();
        this.adminLoadUsers(1);
      }, 50);
    }
    if (view === 'student') {
      setTimeout(() => this.renderStudent(), 50);
    }
    if (view === 'engine') {
      setTimeout(() => this.initEngine(), 60);
    }
    if (view === 'effects') {
      setTimeout(() => {
        const el = document.getElementById('view-effects');
        if (el) { this.renderLatexInElement(el); }
      }, 100);
    }
    if (view === 'home') {
      setTimeout(() => {
        const home = document.getElementById('view-home');
        if (home) this.renderLatexInElement(home);
        this._startFormulaCarousel();
        this._renderHomeStats();
      }, 60);
    }
    // 移动端：同步底部 tab 激活状态 & 自动关闭 side 面板
    if (this.isMobile) {
      this._updateBottomTabActive(view);
      this._closeSidebar();
      this._closeMorePanel();
    }
  };

