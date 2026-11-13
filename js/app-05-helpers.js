/* app-05-helpers.js —— 原 js/app.v3.19.js 第 2172–2394 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._truncate = function _truncate(text, max) {
    if (!text) return '';
    return text.length > max ? text.slice(0, max) + '...' : text;
  };

App._stripTags = function _stripTags(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent || '';
  };

  // ============ 个人空间 ============

App.renderProfile = async function renderProfile() {
    const el = document.getElementById('profile-content');
    if (!Auth.isLoggedIn) {
      el.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">
          <div style="font-size:48px;margin-bottom:16px;">🔑</div>
          <h2>请先登录</h2>
          <p>登录后查看个人空间和学习数据</p>
          <button class="welcome-btn primary" style="width:200px;margin-top:16px;" onclick="window.WelcomeLogin ? WelcomeLogin.open('login') : App.showAuthModal({mode:'login'})">🔑 登录</button>
        </div>`;
      return;
    }
    // 刷新一下用户信息
    await Auth.fetchProfile();
    // v=20260824d 异步拉取图像识别状态,用于渲染个人中心卡片
    this._detectVisionMode();
    const u = Auth.user;
    el.innerHTML = `
      <div class="profile-card">
        <h3>👤 个人资料</h3>
        <div class="profile-avatar-preview" id="profile-avatar-preview">${u.avatar || (u.username || '?').charAt(0).toUpperCase()}</div>
        <div class="profile-edit-row">
          <label>用户名 <span style="color:var(--text-tertiary);font-size:11px;">（类似微信号，支持修改）</span></label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="edit-username" value="${this._esc(u.username)}" maxlength="20" placeholder="自定义用户名" style="flex:1;">
            <button class="profile-save-btn" onclick="App.saveUsername()" style="width:auto;padding:8px 14px;font-size:12px;">修改</button>
          </div>
          <div class="profile-saved" id="username-saved-msg"></div>
        </div>
        <div class="profile-edit-row">
          <label>昵称</label>
          <input type="text" id="edit-nickname" value="${this._esc(u.nickname || u.username)}" maxlength="20" placeholder="你的昵称">
        </div>
        <div class="profile-edit-row">
          <label>头像标识</label>
          <input type="text" id="edit-avatar" value="${this._esc(u.avatar || (u.username || '?').charAt(0).toUpperCase())}" maxlength="2" placeholder="😊/A" style="font-size:20px;text-align:center;">
        </div>
        <button class="profile-save-btn" onclick="App.saveProfile()">💾 保存昵称和头像</button>
        <div class="profile-saved" id="profile-saved-msg"></div>
      </div>

      <div class="profile-card">
        <h3>📊 学习统计</h3>
        <div class="profile-stats">
          <div class="profile-stat">
            <div class="profile-stat-num">${u.total_questions || 0}</div>
            <div class="profile-stat-label">累计提问</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${u.total_notes || 0}</div>
            <div class="profile-stat-label">错题收集</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${u.created ? new Date(u.created).toLocaleDateString('zh-CN') : '-'}</div>
            <div class="profile-stat-label">注册日期</div>
          </div>
        </div>
      </div>

      <!-- v=20260824d 图像识别能力卡片:展示当前视觉/OCR 模式 + 配置指引 -->
      <div id="profile-vision-card-mount"></div>

      <div class="profile-card">
        <h3>💳 VIP 会员（微信支付）</h3>
        <p class="profile-pay-hint">解锁全部题库、智能出题、AI 助教高阶功能。月度 99 元 / 年度 999 元。</p>
        <div class="profile-pay-row">
          <button class="profile-pay-btn monthly" onclick="Auth.buyPlan('monthly', 9900)">
            月度 VIP · ¥99
          </button>
          <button class="profile-pay-btn yearly" onclick="Auth.buyPlan('yearly', 99900)">
            年度 VIP · ¥999（省 ¥189）
          </button>
        </div>
        <div class="profile-pay-result" id="profile-pay-result"></div>
      </div>

      <div class="profile-card">
        <h3>🔐 账户安全</h3>
        <div class="profile-edit-row">
          <label>修改密码</label>
          <input type="password" id="cp-old" placeholder="原密码">
          <input type="password" id="cp-new" placeholder="新密码（至少 6 位）" style="margin-top:6px;">
          <button class="profile-save-btn" onclick="App.changeMyPassword()" style="margin-top:8px;">🔑 确认修改</button>
          <div class="profile-saved" id="cp-msg"></div>
        </div>
      </div>

      <div class="profile-danger">
        <h3>⚠️ 危险操作</h3>
        <p>注销后将永久删除您的账号、问答历史和错题本数据，不可恢复。</p>
        <button class="btn-danger" onclick="App.showDeleteAccount()">注销账号</button>
      </div>`;
    // v=20260824d 挂载图像识别能力卡片(异步渲染,不阻塞个人中心)
    setTimeout(() => {
      const mount = document.getElementById('profile-vision-card-mount');
      if (mount) {
        // 若缓存里还没有 status 数据,先探测一次
        if (!this._visionModeCache) this._detectVisionMode();
        setTimeout(() => {
          const card = this._renderVisionStatusCard();
          if (mount && card) mount.innerHTML = card;
        }, 300);
      }
    }, 200);
  };

App.renderStudent = async function renderStudent() {
    const el = document.getElementById('student-content');
    if (!Auth.isLoggedIn) {
      el.innerHTML = `<div class="stu-empty">
        <div class="stu-empty-icon"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-key"/></svg></div>
        <div class="stu-empty-title">请先登录</div>
        <div class="stu-empty-desc">登录后查看专属学习画像和自适应路径</div>
        <button class="stu-empty-cta" onclick="window.WelcomeLogin ? WelcomeLogin.open('login') : App.showAuthModal({mode:'login'})">🔑 登录 / 注册</button>
      </div>`;
      return;
    }
    // v=20260910 刷新按钮 spinner 态 + 骨架屏
    const refreshBtn = document.getElementById('stu-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('loading');
    if (!this._stuData) {
      // 首次加载用骨架屏
      el.innerHTML = `
        <div class="stu-kpi-row">
          <div class="stu-skel-kpi stu-skeleton"></div>
          <div class="stu-skel-kpi stu-skeleton"></div>
          <div class="stu-skel-kpi stu-skeleton"></div>
          <div class="stu-skel-kpi stu-skeleton"></div>
        </div>
        <div class="stu-ov-row">
          <div class="stu-skel-radar stu-skeleton"></div>
          <div class="stu-skel-summary stu-skeleton"></div>
        </div>`;
    } else {
      el.insertAdjacentHTML('afterbegin', '<div class="stu-loading" style="margin-bottom:14px;">⏳ 刷新画像中…</div>');
    }
    try {
      // v=20260910 错题关联:并行拉 mistakes 用于 KP 行展开错题标签
      const [prof, mast, path, mistakes, gamif] = await Promise.all([
        Auth._fetch('/api/student/profile').then(r => r.json()),
        Auth._fetch('/api/student/mastery').then(r => r.json()),
        Auth._fetch('/api/student/path').then(r => r.json()),
        Auth._fetch('/api/mistakes').then(r => r.ok ? r.json() : {mistakes:[]}).then(d => d.mistakes || []).catch(() => []),
        Auth._fetch('/api/student/gamification').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const p = prof; const m = mast; const pt = path;
      const totalKp = (m.mastery || []).length || 28;
      const mastered = pt.total_mastered || 0;

      // ── 8 维雷达图 (Canvas):学习风格4 + 认知2 + 知识掌握2
      const dims = this._stuBuildDims(p, m, pt, totalKp);
      const rhy = p.study_rhythm || {};
      const chapterOrder = m.chapters || [];

      const _esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // 章节统计(平均掌握度 / 红黄绿分布 / 已练习数)
      const chapterStats = this._stuChapterStats(m, chapterOrder);

      // v=20260910 学习里程碑:已解锁成就 + 下一目标(本地计算,避免再调 LLM)
      const badges = gamif?.badges || [];
      const nextBadges = this._stuNextBadges(gamif);

      // 存储数据供二级详情页使用
      this._stuData = { p, m, pt, dims, mastered, totalKp, rhy, chapterOrder, _esc, chapterStats, mistakes: mistakes || [], badges, nextBadges, hasRealData: (m.mastery || []).some(x => (x.attempts || 0) > 0) };

      // 渲染一级概览页
      this._stuRenderOverview();

      // 更新时间
      const tsEl = document.getElementById('stu-updated-ts');
      if (tsEl && p.updated) tsEl.textContent = '更新于 ' + new Date(p.updated).toLocaleString('zh-CN');

      // v=20260910 刷新成功 toast
      if (refreshBtn && refreshBtn.classList.contains('loading')) {
        this._adminToast && this._adminToast('✅ 画像已刷新', 'ok');
      }

    } catch (e) {
      el.innerHTML = `<div class="stu-error">
        ⚠️ 画像加载失败：${this.escapeHtml(e.message || '网络异常')}<br>
        <small style="opacity:.7;">请检查网络或稍后重试</small>
        <br><button onclick="App.renderStudent()">🔄 重试</button>
      </div>`;
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('loading');
    }
  };

  /** 章节统计：平均掌握度、红/黄/绿知识点数、已练习数 */
App._stuChapterStats = function _stuChapterStats(m, chapterOrder) {
    const kps = m.mastery || [];
    const kp2ch = m.kp_to_chapter || {};
    const stats = [];
    for (const ch of chapterOrder) {
      const list = kps.filter(x => kp2ch[x.kp] === ch);
      if (!list.length) continue;
      const avg = list.reduce((s, x) => s + (x.mastery || 0), 0) / list.length;
      const green = list.filter(x => x.mastery >= 70).length;
      const yellow = list.filter(x => x.mastery >= 50 && x.mastery < 70).length;
      const red = list.filter(x => x.mastery < 50).length;
      const practiced = list.filter(x => x.attempts > 0).length;
      stats.push({ chapter: ch, list, avg: Math.round(avg), green, yellow, red, total: list.length, practiced });
    }
    return stats;
  };

  /* ════════ 一级页面：画像总览(清晰概览 + 模块入口) ════════ */

