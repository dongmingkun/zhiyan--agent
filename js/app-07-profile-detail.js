/* app-07-profile-detail.js —— 原 js/app.v3.19.js 第 3004–4409 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._stuGoDetail = function _stuGoDetail(section) {
    const d = this._stuData;
    if (!d) { this.renderStudent(); return; }
    this._stuDetail = section;
    const titles = {
      profile: '🧬 学习画像详情', mastery: '📈 知识点掌握度',
      path: '🗺️ 自适应学习路径', weak: '🧪 薄弱点诊断练习'
    };
    const subs = {
      profile: '学习风格 · 认知水平 · 兴趣方向 · 学习节奏 逐维解读',
      mastery: '按章节展开，查看每个知识点的掌握详情',
      path: '按前置依赖排序的个性化学习顺序',
      weak: '针对薄弱知识点的诊断练习，答错自动回写画像'
    };
    const el = document.getElementById('student-content');
    el.innerHTML = `
      <div class="stu-detail-top">
        <button class="stu-back-btn" onclick="App._stuBackOverview()">‹ 返回画像总览</button>
        <div class="stu-detail-title">
          <h2>${titles[section] || ''}</h2>
          <p>${subs[section] || ''}</p>
        </div>
        <span class="stu-detail-crumb">学习画像 / ${(titles[section] || '').replace(/^[^\s]+\s*/, '')}</span>
      </div>
      <div class="stu-detail-body" id="stu-detail-body"></div>`;
    document.getElementById('view-student')?.scrollTo(0, 0);
    if (section === 'profile') this._stuRenderDetailProfile();
    else if (section === 'mastery') this._stuRenderDetailMastery();
    else if (section === 'path') this._stuRenderDetailPath();
    else if (section === 'weak') this._stuRenderDetailWeak();
  };

  /** 返回一级总览 */
App._stuBackOverview = function _stuBackOverview() {
    this._stuDetail = null;
    this._stuRenderOverview();
    document.getElementById('view-student')?.scrollTo(0, 0);
  };

  /* ── 详情页 1：学习画像详情 ── */
App._stuRenderDetailProfile = function _stuRenderDetailProfile() {
    const body = document.getElementById('stu-detail-body');
    const d = this._stuData; if (!body || !d) return;
    const { p, dims, rhy, mastered, totalKp, _esc } = d;

    const styleMeta = [
      { key: 'visual', icon: '🎨', name: '可视化', desc: '图形 / 动画 / 3D 演示' },
      { key: 'reading', icon: '📖', name: '阅读', desc: '教材 / 推导 / 笔记' },
      { key: 'practice', icon: '✍️', name: '实践', desc: '做题 / 刷题 / 练习' },
      { key: 'theory', icon: '🧠', name: '理论', desc: '公理 / 定理 / 证明' }
    ].map(s => ({ ...s, val: p.learning_style?.[s.key] || 0 }));
    const topStyle = styleMeta.slice().sort((a, b) => b.val - a.val)[0];

    const interests = Object.entries(p.interest_vector || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const emotion = p.emotion_trend || {};

    body.innerHTML = `
    <div class="stu-detail-grid">
      <div class="stu-card stu-dp-radar">
        <div class="stu-card-title">八维能力雷达</div>
        <canvas id="stu-radar-detail" width="400" height="400"></canvas>
        <div class="stu-radar-hint">💡 点击数据点，查看该维度解读与提升建议</div>
        <div class="stu-dp-quick">
          <div class="stu-dp-quick-item"><b>${p.overall_mastery ?? 50}%</b><span>综合掌握度</span></div>
          <div class="stu-dp-quick-item"><b>${p.confidence_score ?? 50}</b><span>信心指数</span></div>
          <div class="stu-dp-quick-item"><b>${mastered}/${totalKp}</b><span>已掌握知识点</span></div>
        </div>
      </div>
      <div class="stu-dp-dims">
        <div class="stu-card-title">维度明细（点击查看建议）</div>
        <div class="stu-dim-grid">
          ${dims.map((dim, i) => `
          <div class="stu-dim-card stu-dim-${dim.group === '学习风格' ? 'style' : dim.group === '认知水平' ? 'cog' : 'know'}" onclick='App._stuShowRadarDetail(App._stuData.dims[${i}])'>
            <div class="stu-dim-head"><span class="stu-dim-icon">${dim.icon}</span><b>${_esc(dim.label)}</b><span class="stu-dim-val">${Math.round(dim.val * 100)}%</span></div>
            <div class="stu-dim-bar"><span style="width:${Math.max(3, Math.round(dim.val * 100))}%"></span></div>
            <div class="stu-dim-group">${_esc(dim.group)}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="stu-detail-grid stu-detail-grid-2">
      <div class="stu-card">
        <div class="stu-card-title">🎨 学习风格解析（VARK 简化模型）</div>
        <div class="stu-style-tip">你的主导风格是 <b>${topStyle.icon} ${topStyle.name}</b>（${Math.round(topStyle.val * 100)}%）——${topStyle.key === 'visual' ? '偏好通过图形动画理解概念' : topStyle.key === 'reading' ? '偏好从教材定义出发严谨推理' : topStyle.key === 'practice' ? '偏好通过做题试错建立熟练度' : '偏好公理定理构建知识体系'}</div>
        ${styleMeta.map(s => `
        <div class="stu-style-row">
          <span class="stu-style-name">${s.icon} ${s.name}</span>
          <div class="stu-style-bar"><span style="width:${Math.round(s.val * 100)}%"></span></div>
          <b class="stu-style-val">${Math.round(s.val * 100)}%</b>
          <small class="stu-style-desc">${s.desc}</small>
        </div>`).join('')}
      </div>

      <div class="stu-card">
        <div class="stu-card-title">⚡ 认知水平与学习状态</div>
        <div class="stu-cog-row">
          <div class="stu-cog-item"><div class="stu-cog-ring" style="--p:${Math.round((p.cognitive_level?.speed || 0.5) * 100)}"><b>${Math.round((p.cognitive_level?.speed || 0.5) * 100)}</b></div><span>反应速度</span></div>
          <div class="stu-cog-item"><div class="stu-cog-ring" style="--p:${Math.round((p.cognitive_level?.accuracy || 0.5) * 100)}"><b>${Math.round((p.cognitive_level?.accuracy || 0.5) * 100)}</b></div><span>答题精度</span></div>
          <div class="stu-cog-item"><div class="stu-cog-ring" style="--p:${p.confidence_score ?? 50}"><b>${p.confidence_score ?? 50}</b></div><span>信心指数</span></div>
        </div>
        <div class="stu-stat-row"><span>⏰ 偏爱时段</span><b>${rhy.preferred_hour || 10}:00 左右</b></div>
        <div class="stu-stat-row"><span>⏱️ 平均时长</span><b>${rhy.avg_session_min || 30} 分钟/次</b></div>
        <div class="stu-stat-row"><span>🔥 连续学习</span><b>${rhy.streak_days || 0} 天</b></div>
        ${Object.keys(emotion).length ? `<div class="stu-stat-row"><span>😐 情绪状态</span><b>${_esc(emotion.current || emotion.trend || '平稳')}</b></div>` : ''}
      </div>
    </div>

    ${interests.length ? `
    <div class="stu-card" style="margin-top:16px;">
      <div class="stu-card-title">❤️ 兴趣方向</div>
      <div class="stu-int-grid">
        ${interests.map(([k, v]) => `
        <div class="stu-int-item">
          <span class="stu-int-name">${_esc(k)}</span>
          <div class="stu-int-bar"><span style="width:${Math.round(v * 100)}%"></span></div>
          <b>${Math.round(v * 100)}%</b>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- v=20260910 学习里程碑时间线(基于已解锁成就 + 未来目标) -->
    <div class="stu-card stu-milestone-card" style="margin-top:16px;">
      <div class="stu-card-title">🏆 学习里程碑 <small style="color:var(--text-tertiary);font-weight:400;margin-left:6px;">已解锁成就 + 下一目标</small></div>
      <ul class="stu-milestone-list">
        ${(d.badges || []).map(b => `
          <li class="stu-milestone-item">
            <b>${_esc(b.name || b.id)}</b>
            <small>${_esc(b.desc || '')} · 解锁于 ${b.ts ? new Date(b.ts).toLocaleDateString('zh-CN') : '近期'}</small>
          </li>`).join('')}
        ${(d.nextBadges || []).map(n => `
          <li class="stu-milestone-item future">
            <b>${_esc(n.name)}</b>
            <small>${_esc(n.desc)} · <span style="color:var(--primary);">还差 ${n.delta} 积分</span></small>
          </li>`).join('') || ''}
        ${!(d.badges || []).length && !(d.nextBadges || []).length ? `
          <li class="stu-milestone-item future"><small>暂无里程碑 — 前往 <b>智能问答</b> 或 <b>测试中心</b> 完成首次任务解锁 🎯</small></li>
        ` : ''}
      </ul>
    </div>`;

    setTimeout(() => {
      const c = document.getElementById('stu-radar-detail');
      if (!c) return;
      c.width = 400; c.height = 400;
      this._stuDrawRadar(c, dims, { big: true, onPick: (dim) => this._stuShowRadarDetail(dim) });
    }, 120);
  };

  /* ── 详情页 2：知识点掌握度 ── */
App._stuRenderDetailMastery = function _stuRenderDetailMastery() {
    const body = document.getElementById('stu-detail-body');
    const d = this._stuData; if (!body || !d) return;
    const { m, chapterStats, _esc } = d;

    const kps = m.mastery || [];
    const green = kps.filter(x => x.mastery >= 70).length;
    const yellow = kps.filter(x => x.mastery >= 50 && x.mastery < 70).length;
    const red = kps.filter(x => x.mastery < 50).length;
    const avg = kps.length ? Math.round(kps.reduce((s, x) => s + (x.mastery || 0), 0) / kps.length) : 0;
    const practiced = kps.filter(x => x.attempts > 0).length;

    body.innerHTML = `
    <div class="stu-ms-stats">
      <div class="stu-ms-stat"><b>${kps.length}</b><span>知识点总数</span></div>
      <div class="stu-ms-stat"><b>${avg}%</b><span>平均掌握度</span></div>
      <div class="stu-ms-stat"><b>${practiced}</b><span>已练习</span></div>
      <div class="stu-ms-stat green"><b>${green}</b><span>稳固（≥70）</span></div>
      <div class="stu-ms-stat yellow"><b>${yellow}</b><span>发展中（50-69）</span></div>
      <div class="stu-ms-stat red"><b>${red}</b><span>薄弱（&lt;50）</span></div>
    </div>

    <div class="stu-ms-legend">
      <span class="stu-legend-item"><i class="stu-lg-green"></i>稳固 ≥70%</span>
      <span class="stu-legend-item"><i class="stu-lg-yellow"></i>发展中 50%~69%</span>
      <span class="stu-legend-item"><i class="stu-lg-red"></i>薄弱 &lt;50%</span>
      <span class="stu-legend-hint">💡 点击章节卡片展开知识点，点击单条 KP 查看错题关联与推荐练习</span>
    </div>

    <div class="stu-ch-list">
      ${chapterStats.map((c, ci) => `
      <div class="stu-ch-card" id="stu-ch-${ci}">
        <div class="stu-ch-head" onclick="App._stuToggleChapter(${ci})">
          <span class="stu-ch-arrow" id="stu-ch-arrow-${ci}">▸</span>
          <div class="stu-ch-info">
            <b>${_esc(c.chapter)}</b>
            <small>${c.total} 个知识点 · 已练习 ${c.practiced} · 平均掌握度 ${c.avg}%</small>
          </div>
          <span class="stu-ch-badges">
            ${c.green ? `<span class="stu-bdg green">稳固 ${c.green}</span>` : ''}
            ${c.yellow ? `<span class="stu-bdg yellow">发展 ${c.yellow}</span>` : ''}
            ${c.red ? `<span class="stu-bdg red">薄弱 ${c.red}</span>` : ''}
          </span>
          <div class="stu-ch-bar"><span style="width:${c.avg}%"></span></div>
          <b class="stu-ch-avg">${c.avg}%</b>
        </div>
        <div class="stu-ch-kps" id="stu-ch-kps-${ci}" style="display:none;">
          ${c.list.map((k, ki) => this._stuKpRow(k, c.chapter, ci, ki, _esc)).join('')}
        </div>
      </div>`).join('')}
    </div>`;

    // 默认展开平均掌握度最低的章节
    if (chapterStats.length) {
      let wi = 0;
      chapterStats.forEach((c, i) => { if (c.avg < chapterStats[wi].avg) wi = i; });
      this._stuToggleChapter(wi);
    }
  };

  /** v=20260910 知识点明细行(可点击展开详情:折线 + 错题 + 推荐练习) */
App._stuKpRow = function _stuKpRow(k, chapter, ci, ki, _esc) {
    const attempted = (k.attempts || 0) > 0; // v=20260904i 是否产生真实答题
    const pct = attempted ? (k.mastery || 50) : 0;
    const hue = attempted ? (pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red') : 'gray';
    const acc = attempted ? Math.round((k.correct || 0) / k.attempts * 100) : null;
    const keep = typeof k.forgetting === 'number' ? Math.round(k.forgetting * 100) : null;
    const lastTxt = k.last ? new Date(k.last).toLocaleDateString('zh-CN') : '未练习';
    const uid = `kp-${ci}-${ki}`;
    // 查询错题关联(全表过滤,因为 mastery 不含 question 列表)
    const mistakes = (this._stuData?.mistakes || []).filter(x => (x.kp || x.knowledge_point) === k.kp);
    const pctTxt = attempted ? pct + '%' : '—';
    return `
    <div class="stu-kp-row stu-ms-row" id="${uid}" onclick="App._stuToggleKpDetail('${uid}')" title="${_esc(k.kp)}">
      <span class="stu-kp-name">${_esc(k.kp)}</span>
      <span class="stu-kp-mastery stu-hm-${hue}">${attempted ? pctTxt : '<i class="stu-kp-pending-badge">待测评</i>'}</span>
      <div class="stu-kp-bar"><span class="fill-${hue}" style="width:${attempted ? pct : 0}%"></span></div>
      <span class="stu-kp-meta">${attempted ? '练习 ' + k.attempts + ' 次' : '尚未练习'}</span>
      <span class="stu-kp-meta">${acc !== null ? '正确率 ' + acc + '%' : '—'}</span>
      <span class="stu-kp-meta">${attempted && keep !== null ? '记忆保持 ' + keep + '%' + (keep < 50 ? ' ⚠️' : '') : '—'}</span>
      <span class="stu-kp-meta">${lastTxt}</span>
      <span class="stu-ms-row-toggle">▸</span>
    </div>
    <div class="stu-ms-row-detail" id="${uid}-detail">
      <div style="font-weight:700;color:var(--text);margin-bottom:6px;">📊 近 7 天掌握度变化趋势</div>
      <canvas id="${uid}-canvas" width="540" height="120" style="width:100%;height:auto;"></canvas>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--text-tertiary);margin-top:-4px;">
        <span>当前 ${pctTxt}</span>
        ${acc !== null ? `<span>正确率 ${acc}%</span>` : ''}
        ${keep !== null ? `<span>遗忘度 ${100 - keep}%${keep < 50 ? ' ⚠️建议复习' : ''}</span>` : ''}
        <span>最近练习 ${lastTxt}</span>
      </div>
      ${mistakes.length > 0 ? `
        <div style="margin-top:12px;font-weight:700;color:var(--text);">🔴 关联错题 (${mistakes.length})</div>
        <div style="margin-top:6px;">
          ${mistakes.map(m => `<span class="stu-ms-mistake-link" title="${_esc(m.question)}" onclick="App._stuGoMistake('${_esc(m.id || '')}')">📝 ${_esc((m.question || '').slice(0, 26))}${m.question?.length > 26 ? '…' : ''}</span>`).join('')}
        </div>
      ` : ''}
      <button class="stu-ms-recommend-btn" onclick="App._stuRecommendPractice('${_esc(k.kp)}')">🎯 推荐针对性练习</button>
    </div>`;
  };

  /** v=20260910 KP 行展开/收起 */
App._stuToggleKpDetail = function _stuToggleKpDetail(uid) {
    const row = document.getElementById(uid);
    const detail = document.getElementById(uid + '-detail');
    if (!row || !detail) return;
    const open = row.classList.toggle('open');
    detail.style.display = open ? 'block' : 'none';
    if (open) {
      // 首次展开时绘制 mini 折线
      setTimeout(() => {
        const kpName = row.querySelector('.stu-kp-name')?.textContent?.trim();
        const kp = (this._stuData?.m?.mastery || []).find(x => x.kp === kpName);
        if (kp) this._stuDrawKpSparkline(uid + '-canvas', kp);
      }, 50);
    }
  };

  /** v=20260910 KP mini 折线:基于 last_practiced + forgetting_score 模拟近 7 天 mastery 衰减曲线 */
App._stuDrawKpSparkline = function _stuDrawKpSparkline(canvasId, kp) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width = c.parentElement.clientWidth || 540;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    // 模拟 7 天 mastery:每天 ≈ current / exp(λ × (今天距 last_practiced))
    const now = Date.now();
    const days = [0, 1, 2, 3, 4, 5, 6];
    const current = kp.mastery || 50;
    const lastMs = kp.last ? new Date(kp.last).getTime() : now - 7 * 86400000;
    const lambda = 0.05;   // 与后端一致
    const series = days.map(d => {
      const dayMs = now - d * 86400000;
      const daysSincePractice = Math.max(0, (dayMs - lastMs) / 86400000);
      // 反推:过去某天的 mastery ≈ current × exp(λ × distance)
      return Math.min(100, current * Math.exp(lambda * daysSincePractice));
    }).reverse();
    // 绘制
    const padL = 28, padR = 8, padT = 6, padB = 18;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxV = 100, minV = 0;
    const xAt = (i) => padL + (i / (series.length - 1)) * plotW;
    const yAt = (v) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;
    // 网格
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.font = '9.5px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 50, 100]) {
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(v, padL - 3, y);
    }
    // 区域填充
    ctx.fillStyle = 'rgba(99,102,241,.12)';
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(0));
    series.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
    ctx.lineTo(xAt(series.length - 1), yAt(0));
    ctx.closePath();
    ctx.fill();
    // 折线
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((v, i) => i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v)));
    ctx.stroke();
    // 点
    series.forEach((v, i) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(v), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    // X 日期
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    days.slice().reverse().forEach((d, i) => {
      const day = new Date(now - d * 86400000);
      const label = `${day.getMonth() + 1}/${day.getDate()}`;
      ctx.fillText(label, xAt(series.length - 1 - i), H - padB + 4);
    });
    // 当前点标注
    const last = series[series.length - 1];
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(last)}%`, xAt(series.length - 1) + 6, yAt(last) - 4);
  };

  /** v=20260910 错题跳转(进入错题本视图并预选) */
App._stuGoMistake = function _stuGoMistake(id) {
    if (!id) return;
    if (typeof this.switchView === 'function') this.switchView('mistakes');
    setTimeout(() => {
      const evt = new CustomEvent('open-mistake', { detail: { id } });
      window.dispatchEvent(evt);
    }, 300);
  };

  /** v=20260910 推荐针对性练习(切到智能练习视图) */
App._stuRecommendPractice = function _stuRecommendPractice(kpName) {
    if (typeof this.switchView === 'function') {
      this.switchView('engine');
      // 让练习页接收 KP
      setTimeout(() => {
        const evt = new CustomEvent('open-practice', { detail: { kp: kpName } });
        window.dispatchEvent(evt);
      }, 300);
    } else {
      this._adminToast && this._adminToast('请前往「🎯 测试中心」练习: ' + kpName, 'info');
    }
  };

  /** 展开 / 收起章节 */
App._stuToggleChapter = function _stuToggleChapter(ci) {
    const kpsEl = document.getElementById('stu-ch-kps-' + ci);
    const arrow = document.getElementById('stu-ch-arrow-' + ci);
    if (!kpsEl) return;
    const open = kpsEl.style.display !== 'none';
    kpsEl.style.display = open ? 'none' : 'block';
    if (arrow) arrow.textContent = open ? '▸' : '▾';
  };

  /* ── 详情页 3：自适应学习路径 ── */
App._stuRenderDetailPath = function _stuRenderDetailPath() {
    const body = document.getElementById('stu-detail-body');
    const d = this._stuData; if (!body || !d) return;
    const { pt, _esc } = d;
    const items = pt.path || [];
    const weakN = items.filter(x => x.status === 'weak').length;
    const preN = items.length - weakN;
    const styleNames = { visual: '可视化', reading: '阅读', practice: '实践', theory: '理论' };

    body.innerHTML = `
    <div class="stu-ms-stats">
      <div class="stu-ms-stat"><b>${items.length}</b><span>推荐学习项</span></div>
      <div class="stu-ms-stat red"><b>${weakN}</b><span>待强化知识点</span></div>
      <div class="stu-ms-stat yellow"><b>${preN}</b><span>前置依赖</span></div>
      <div class="stu-ms-stat"><b>${styleNames[pt.style] || pt.style || '—'}</b><span>建议学习方式</span></div>
    </div>
    <div class="stu-path-tip">🎯 ${_esc(pt.suggestion || '')} · 路径按「前置依赖拓扑 + 掌握度优先级」排序，建议自上而下依次攻克</div>

    <!-- v=20260910 进度地图可视化 -->
    ${items.length === 0
      ? '<div class="stu-path-empty">🎉 没有薄弱知识点！所有内容均已掌握。</div>'
      : `<div class="stu-card stu-path-map-card">
          <div class="stu-card-title">🗺️ 进度地图（节点 + 状态）</div>
          <div class="stu-path-map-row">
            ${items.map((it, i) => `
              <div class="stu-path-map-node ${it.status === 'weak' ? 'weak' : 'pre'}">
                <span class="stu-path-map-node-idx">#${i + 1} · 优先级 ${it.priority}</span>
                <span class="stu-path-map-node-name">${_esc(it.kp)}</span>
                <span class="stu-path-map-node-meta">${it.status === 'weak' ? '⚠️ 需强化' : '📖 前置依赖'} · 掌握度 ${it.mastery}%</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="stu-card-title" style="margin-top:16px;">📋 详细学习顺序</div>
        <div class="stu-path-list stu-path-full">
          ${items.map((it, i) => `
          <div class="stu-path-item ${it.status === 'weak' ? 'is-weak' : 'is-pre'}">
            <span class="stu-path-idx ${it.status === 'weak' ? 'weak' : ''}">${i + 1}</span>
            <span class="stu-path-info"><b>${_esc(it.kp)}</b><small>${_esc(it.chapter)} · ${it.status === 'weak' ? '⚠️ 需强化' : '📖 前置依赖'} · 优先级 ${it.priority}</small></span>
            <span class="stu-path-pct">${it.mastery}%</span>
          </div>`).join('')}
        </div>`}`;
  };

  /* ── 详情页 4：薄弱点诊断练习 ── */
App._stuRenderDetailWeak = function _stuRenderDetailWeak() {
    const body = document.getElementById('stu-detail-body');
    const d = this._stuData; if (!body || !d) return;
    const { m, _esc, mistakes } = d;
    const weakKps = (m.mastery || []).filter(x => (x.mastery || 50) < 60).sort((a, b) => (a.mastery || 0) - (b.mastery || 0));

    body.innerHTML = `
    <div class="stu-ms-stats">
      <div class="stu-ms-stat red"><b>${weakKps.length}</b><span>薄弱知识点</span></div>
      <div class="stu-ms-stat"><b>${weakKps.filter(x => x.attempts > 0).length}</b><span>已练习过</span></div>
      <div class="stu-ms-stat"><b>${weakKps.filter(x => x.attempts === 0).length}</b><span>尚未练习</span></div>
      <div class="stu-ms-stat"><b>${weakKps.length ? Math.round(weakKps.reduce((s, x) => s + (x.mastery || 0), 0) / weakKps.length) : 0}%</b><span>平均掌握度</span></div>
    </div>

    <div class="stu-weak-tip">⚠️ 薄弱点判定标准：掌握度 &lt; 60%。系统从题库匹配针对性练习，答错自动回写画像掌握度，形成「诊断 → 练习 → 回写」闭环。</div>

    <!-- v=20260910 薄弱点 × 错题矩阵:一目了然"哪个薄弱点出过哪些错题" -->
    ${weakKps.length > 0 ? `
    <div class="stu-card" style="margin-top:14px;">
      <div class="stu-card-title">🔗 薄弱点 × 错题 关联矩阵 <small style="color:var(--text-tertiary);font-weight:400;margin-left:6px;">点击错题可进入错题本</small></div>
      <div class="stu-weak-matrix">
        ${weakKps.map(w => {
          const related = (mistakes || []).filter(x => (x.knowledge_point || x.kp) === w.kp);
          return `
          <div class="stu-weak-matrix-row ${w.mastery < 40 ? 'weak' : 'med'}">
            <div style="flex:1;">
              <div style="font-weight:700;color:var(--text);font-size:13.5px;">${_esc(w.kp)}</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px;">
                掌握度 <b style="color:${w.mastery < 40 ? '#dc2626' : '#d97706'};">${w.mastery}%</b> · 练习 ${w.attempts} 次
              </div>
              ${related.length > 0 ? `<div class="stu-weak-matrix-row-mistakes">
                ${related.map(m => `<span class="stu-weak-matrix-mistake" title="${_esc(m.question)}">${_esc((m.question || '').slice(0, 22))}${m.question?.length > 22 ? '…' : ''}</span>`).join('')}
              </div>` : `<div class="stu-weak-matrix-empty">暂无关联错题</div>`}
            </div>
            <button class="stu-weak-btn" onclick="App._stuOpenPractice('${_esc(w.kp).replace(/'/g, "\\'")}')">🧪 练习</button>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="stu-section">
      <h3>🧪 薄弱点诊断练习 <button class="stu-expand-btn" onclick="App._stuLoadWeak()" title="刷新薄弱点">🔄</button><span class="stu-weak-sub">根据掌握度&lt;60 的知识点，从题库匹配针对性练习，答错自动进入诊断</span></h3>
      <div class="stu-weak-panel" id="stu-weak-panel"><div class="stu-loading">⏳ 分析薄弱点中…</div></div>
    </div>`;

    // 加载薄弱点诊断练习
    this._stuLoadWeak();
  };


  // ── 薄弱点诊断练习（提问→掌握度→薄弱点→针对性练习→诊断回写） ──

  /** 加载薄弱知识点列表并渲染练习入口 */
App._stuLoadWeak = async function _stuLoadWeak() {
    const panel = document.getElementById('stu-weak-panel');
    if (!panel) return;
    panel.innerHTML = '<div class="stu-loading">⏳ 分析薄弱点中…</div>';
    try {
      const resp = await Auth.fetchWithAuth('/api/student/weak_exercises?limit=5');
      if (!resp.ok) throw new Error('加载失败');
      const d = await resp.json();
      const weak = d.weak_points || [];
      if (weak.length === 0) {
        panel.innerHTML = `<div class="stu-path-empty" style="padding:18px 14px;text-align:center;color:var(--text-tertiary);font-size:13px;">
          🎉 暂无薄弱知识点（掌握度均 ≥ 60）！继续保持，或先去 <b>💬 智能问答</b> 提问学习新知识。</div>`;
        return;
      }
      // 统计每题匹配情况
      let matched = 0;
      const rows = weak.map(w => {
        const qs = this._stuFindQuestions(w.kp_normalized);
        if (qs.length > 0) matched++;
        return { w, qs };
      }).filter(x => x.qs.length > 0);
      const unmatched = weak.filter(w => this._stuFindQuestions(w.kp_normalized).length === 0);

      let html = '';
      // 有题可练的薄弱点 → 练习卡
      if (rows.length > 0) {
        html += `<div class="stu-weak-list">`;
        for (const { w, qs } of rows) {
          const hue = w.mastery < 40 ? 'red' : w.mastery < 50 ? 'orange' : 'yellow';
          html += `<div class="stu-weak-item stu-weak-${hue}">
            <div class="stu-weak-info">
              <div class="stu-weak-name" title="${this.escapeHtml(w.kp)}">${this.escapeHtml(w.kp_normalized)}</div>
              <div class="stu-weak-meta">掌握度 <b>${w.mastery}%</b> · 练习 ${w.attempts} 次 · ${qs.length} 道匹配题</div>
              <div class="stu-weak-bar"><span style="width:${w.mastery}%"></span></div>
            </div>
            <button class="stu-weak-btn" onclick="App._stuOpenPractice('${this.escapeHtml(w.kp_normalized).replace(/'/g, "\\'")}')">🧪 练习</button>
          </div>`;
        }
        html += `</div>`;
      }
      // 无题可练的知识点 → 提示去提问
      if (unmatched.length > 0) {
        html += `<div class="stu-weak-hint">💡 以下薄弱点题库暂无匹配题，可通过 <b>💬 智能问答</b> 提问针对性巩固：${unmatched.map(u => this.escapeHtml(u.kp_normalized)).join('、')}</div>`;
      }
      panel.innerHTML = html;
      // 记住供练习使用
      this._weakPool = weak;
    } catch (e) {
      panel.innerHTML = `<div style="padding:14px;color:var(--error);font-size:13px;">⚠️ 薄弱点加载失败：${this.escapeHtml(e.message || e)}</div>`;
    }
  };

  /** 在题库 QuizBank 中按知识点名匹配练习题（优先 单选/判断/填空） */
App._stuFindQuestions = function _stuFindQuestions(kp) {
    if (typeof QuizBank === 'undefined' || !QuizBank.questions) return [];
    const k = String(kp || '').trim();
    if (!k) return [];
    const preferred = ['choice', 'judge', 'fill'];
    // 精确匹配 → 包含匹配 → 反向包含匹配
    const exact = QuizBank.questions.filter(q => (q.knowledgePoint || '') === k);
    const incl = QuizBank.questions.filter(q =>
      (q.knowledgePoint || '').includes(k) || k.includes(q.knowledgePoint || ''));
    const byTag = QuizBank.questions.filter(q =>
      (q.tags || []).some(t => k.includes(t) || t.includes(k)));
    let pool = exact.length ? exact : (incl.length ? incl : byTag);
    // 过滤出适合客观判分的题型
    const scored = pool.filter(q => preferred.includes(q.type));
    pool = scored.length ? scored : pool;
    return pool.slice(0, 3);
  };

  /** 打开薄弱点练习面板（内嵌） */
App._stuOpenPractice = function _stuOpenPractice(kp) {
    const panel = document.getElementById('stu-weak-panel');
    if (!panel) return;
    const qs = this._stuFindQuestions(kp);
    if (qs.length === 0) {
      this._shotToast('该知识点暂无匹配练习题', 'warn');
      return;
    }
    this._practiceKp = kp;
    this._practiceIdx = 0;
    this._practiceQs = qs;
    this._practiceCorrect = 0;
    this._renderPracticeQuestion();
  };

App._renderPracticeQuestion = function _renderPracticeQuestion() {
    const panel = document.getElementById('stu-weak-panel');
    if (!panel) return;
    const qs = this._practiceQs || [];
    const idx = this._practiceIdx || 0;
    if (idx >= qs.length) {
      // 练习结束 → 总结
      const total = qs.length, corr = this._practiceCorrect || 0;
      panel.innerHTML = `
        <div class="stu-practice-done">
          <div style="font-size:34px;">${corr === total ? '🎉' : corr >= total / 2 ? '👍' : '📚'}</div>
          <h4 style="margin:8px 0 4px;">本轮练习完成</h4>
          <p style="color:var(--text-secondary);font-size:13px;">${this.escapeHtml(this._practiceKp)} · 答对 <b>${corr}/${total}</b></p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
            <button class="stu-weak-btn" onclick="App._stuLoadWeak()">◀ 返回薄弱点列表</button>
            <button class="stu-weak-btn primary" onclick="App._stuOpenPractice('${this.escapeHtml(this._practiceKp).replace(/'/g, "\\'")}')">🔁 再练一遍</button>
          </div>
        </div>`;
      return;
    }
    const q = qs[idx];
    const no = idx + 1;
    let body = '';
    if (q.type === 'choice') {
      body = `<div class="stu-pq-options">` + (q.options || []).map((opt, i) =>
        `<label class="stu-pq-opt"><input type="radio" name="pq-ans" value="${String.fromCharCode(65 + i)}"><span><b>${String.fromCharCode(65 + i)}.</b> ${this.escapeHtml(opt)}</span></label>`
      ).join('') + `</div>`;
    } else if (q.type === 'judge') {
      body = `<div class="stu-pq-options">
        <label class="stu-pq-opt"><input type="radio" name="pq-ans" value="对"><span><b>✓</b> 正确（对）</span></label>
        <label class="stu-pq-opt"><input type="radio" name="pq-ans" value="错"><span><b>✗</b> 错误（错）</span></label>
      </div>`;
    } else if (q.type === 'fill') {
      body = `<input class="stu-pq-input" id="stu-pq-fill" placeholder="请输入答案" autocomplete="off">`;
    } else {
      // 计算/证明/多选 → 简答输入
      body = `<textarea class="stu-pq-input" id="stu-pq-fill" rows="2" placeholder="请输入你的解答（简要步骤）"></textarea>`;
    }
    panel.innerHTML = `
      <div class="stu-practice-card">
        <div class="stu-pq-head">
          <span class="stu-pq-progress">第 ${no}/${qs.length} 题</span>
          <span class="stu-pq-kp">${this.escapeHtml(this._practiceKp)}</span>
          <span class="stu-pq-type">${this.escapeHtml(q.type === 'choice' ? '单选题' : q.type === 'judge' ? '判断题' : q.type === 'fill' ? '填空题' : '简答题')}</span>
        </div>
        <div class="stu-pq-question">${this.markdownToHtml(q.question)}</div>
        ${body}
        <div id="stu-pq-feedback"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button class="stu-weak-btn" onclick="App._stuCancelPractice()">退出</button>
          <button class="stu-weak-btn primary" onclick="App._stuSubmitPractice()">提交答案</button>
        </div>
      </div>`;
    this.renderLatexInElement(panel);
  };

App._stuCancelPractice = function _stuCancelPractice() {
    this._practiceQs = [];
    this._stuLoadWeak();
  };

  /** 提交当前练习：判分 → 回写掌握度 → 显示诊断 */
App._stuSubmitPractice = async function _stuSubmitPractice() {
    const panel = document.getElementById('stu-weak-panel');
    if (!panel) return;
    const qs = this._practiceQs || [];
    const idx = this._practiceIdx || 0;
    const q = qs[idx];
    if (!q) return;
    // 取用户答案
    let userAns = '';
    const radio = panel.querySelector('input[name="pq-ans"]:checked');
    if (radio) userAns = radio.value;
    const fillEl = document.getElementById('stu-pq-fill');
    if (fillEl) userAns = fillEl.value.trim();
    if (!userAns) { this._shotToast('请先作答再提交', 'warn'); return; }
    // 判分
    let correct = false;
    if (q.type === 'choice') {
      correct = String(userAns).toUpperCase() === String(q.answer || '').toUpperCase();
    } else if (q.type === 'judge') {
      const a = String(q.answer || '').trim();
      correct = (a === '对' || a === '正确' || a === 'true' || a === 'T') ? userAns === '对' : userAns === '错';
    } else if (q.type === 'fill') {
      const accepts = [q.answer, ...(q.acceptValues || [])].map(String).filter(Boolean);
      correct = accepts.some(a => String(a).trim() === userAns || userAns.includes(String(a).trim()) || String(a).trim().includes(userAns));
    } else {
      // 主观题：自动判分保守（有内容即视为待诊断，交后端）
      correct = false;
    }
    if (correct) this._practiceCorrect = (this._practiceCorrect || 0) + 1;
    // 回写后端
    let apiResult = null;
    try {
      const resp = await Auth.fetchWithAuth('/api/student/complete_exercise', {
        method: 'POST',
        body: JSON.stringify({
          knowledge_points: [this._practiceKp],
          correct,
          question: q.question,
          user_answer: userAns,
          correct_answer: (q.answer != null ? String(q.answer) : '') + ((q.explanation || '').length ? ' | ' + q.explanation : ''),
          response_time_seconds: 0
        })
      });
      if (resp.ok) apiResult = await resp.json();
    } catch (e) { /* 静默 */ }
    const delta = apiResult && apiResult.mastery && apiResult.mastery[0] ? apiResult.mastery[0].delta : 0;
    const newM = apiResult && apiResult.mastery && apiResult.mastery[0] ? apiResult.mastery[0].mastery : null;
    // 诊断反馈
    const fb = document.getElementById('stu-pq-feedback');
    if (fb) {
      fb.innerHTML = `
        <div class="stu-pq-fb stu-pq-${correct ? 'ok' : 'no'}">
          <div class="stu-pq-fb-head">${correct ? '✅ 回答正确' : '❌ 回答错误'} · 掌握度 ${newM != null ? newM + '%' : '—'} <span class="stu-pq-delta ${delta < 0 ? 'down' : 'up'}">${delta > 0 ? '+' : ''}${delta}%</span></div>
          ${correct ? '' : `<div class="stu-pq-fb-explain"><b>📖 诊断解析：</b>${this.markdownToHtml(q.explanation || '请查阅教材对应章节巩固该知识点。')}</div>`}
          <div class="stu-pq-fb-actions">
            <button class="stu-weak-btn" onclick="App._stuNextPractice()">${idx + 1 >= qs.length ? '完成练习' : '下一题 →'}</button>
          </div>
        </div>`;
      this.renderLatexInElement(fb);
      // 禁用提交按钮防重复
      const btn = panel.querySelector('.stu-weak-btn.primary');
      if (btn) btn.disabled = true;
    }
  };

App._stuNextPractice = function _stuNextPractice() {
    this._practiceIdx = (this._practiceIdx || 0) + 1;
    this._renderPracticeQuestion();
  };

  // ── 学生画像全屏放大 ──

  /**
   * 高精度雷达图绘制器(Canvas 2D)
   * 支持:8 维 / 5 层百分比网格 / 径向渐变填充 / 数值标注 / hover 高亮 / 点击详情
   * opts: { showValues:bool, big:bool(大图版,标签更大) }
   */
/**
   * v=20260922q 美化版八维能力雷达图(Canvas 自绘)
   * 设计要点:
   *   - 中心装饰 + 多层柔光环
   *   - 数据点白心紫边 + 光晕 + 数值气泡
   *   - 维度标签按 group 分色(学习风格=蓝/认知水平=紫/知识覆盖=青)
   *   - 多边形: 双层径向渐变,叠加柔和
   */
App._stuDrawRadar = function _stuDrawRadar(canvas, dims, opts = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // v=20260922u HiDPI / Retina 处理:物理像素 = CSS × dpr,后续 ctx.setTransform 自动缩放
    // 否则 canvas 在 Retina 屏会被浏览器拉伸显示 → 文字模糊
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const cssW = canvas.clientWidth || canvas.width || 400;
    const cssH = canvas.clientHeight || canvas.height || 400;
    if (canvas._stuCssW !== cssW || canvas._stuCssH !== cssH || canvas._stuDpr !== dpr) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas._stuCssW = cssW; canvas._stuCssH = cssH; canvas._stuDpr = dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW, H = cssH;
    const isBig = !!opts.big;
    const n = dims.length;
    const levels = 5;
    // 主题色 + 维度分组色(学习风格=蓝/认知水平=紫/知识覆盖=青)
    const css = getComputedStyle(document.documentElement);
    const primary = css.getPropertyValue('--primary') || '#6366f1';
    const textColor = css.getPropertyValue('--text') || '#1e293b';
    const textSec = css.getPropertyValue('--text-secondary') || '#64748b';
    const GROUP_COLORS = {
      '学习风格': { fill: 'rgba(99,102,241,0.30)', stroke: '#6366f1', label: '#4f46e5', soft: 'rgba(99,102,241,0.10)' },
      '认知水平': { fill: 'rgba(139,92,246,0.30)', stroke: '#8b5cf6', label: '#7c3aed', soft: 'rgba(139,92,246,0.10)' },
      '知识掌握': { fill: 'rgba(16,185,129,0.30)', stroke: '#10b981', label: '#059669', soft: 'rgba(16,185,129,0.10)' },
      '知识覆盖': { fill: 'rgba(20,184,166,0.30)', stroke: '#14b8a6', label: '#0d9488', soft: 'rgba(20,184,166,0.10)' }
    };
    const colorOf = (dim) => {
      const g = dim.group || '学习风格';
      return GROUP_COLORS[g] || GROUP_COLORS['学习风格'];
    };

    ctx.clearRect(0, 0, W, H);

    // v=20260904i 空状态:所有维度为初始默认值时,图形淡化 40%
    if (opts.dim) ctx.globalAlpha = 0.6;

    // v=20260904h 自适应:标签胶囊放顶点外侧,需预留外圈空间。
    // 半径 r 缩小,把外圈留给"标签+百分比"胶囊,确保图形自适应容器不溢出。
    const labelFontSize = isBig ? 12 : 11;
    const pctFontSize = isBig ? 11 : 10;
    // 外侧胶囊高度
    const capH = labelFontSize + 8;
    // 测量最宽胶囊宽度,用于预留外圈(左右顶点胶囊最宽,决定水平预留量)
    ctx.font = 'bold ' + labelFontSize + 'px sans-serif';
    let maxCapW = 0;
    for (let i = 0; i < n; i++) {
      const dim = dims[i];
      const labelText = (dim.icon ? dim.icon + ' ' : '') + dim.label;
      const labelW = ctx.measureText(labelText).width;
      ctx.font = pctFontSize + 'px sans-serif';
      const pctW = ctx.measureText('100%').width;
      ctx.font = 'bold ' + labelFontSize + 'px sans-serif';
      const w = labelW + 5 + pctW + 8 * 2;
      if (w > maxCapW) maxCapW = w;
    }
    // 预留 = 胶囊高度(垂直方向) + 胶囊半宽(水平方向),取两者较大保证左右上下都不裁
    const capReserve = Math.max(capH + 6, maxCapW / 2 + 4);
    const r = Math.min(W, H) / 2 - capReserve;
    if (r < 20) return; // 容器过小,放弃绘制

    const ang = (i) => (i / n) * 2 * Math.PI - Math.PI / 2;
    const pt = (i, scale) => ({
      x: W / 2 + Math.cos(ang(i)) * r * scale,
      y: H / 2 + Math.sin(ang(i)) * r * scale
    });
    const cx = W / 2, cy = H / 2;

    // 0) 装饰背景: 中心柔光
    const bgGrad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * 1.15);
    bgGrad.addColorStop(0, 'rgba(99,102,241,0.06)');
    bgGrad.addColorStop(1, 'rgba(99,102,241,0.0)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 2 * Math.PI); ctx.fill();

    // 1) 五层网格 + 径向刻度(浅灰减淡)
    for (let lv = 1; lv <= levels; lv++) {
      const scale = lv / levels;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pt(i, scale);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(148,163,184,0.28)'; // v=20260904h 浅灰网格
      ctx.lineWidth = lv === levels ? 1.2 : 0.8;
      ctx.stroke();
      // v=20260904h 径向刻度 100/75/50/25:浅灰小字,放顶部轴线外侧
      const p = pt(0, scale);
      const pct = lv * 25;
      const txt = pct + '';
      ctx.font = '10px sans-serif';
      ctx.fillStyle = 'rgba(148,163,184,0.65)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, p.x, p.y - 9);
    }

    // 2) 轴线(浅灰)
    for (let i = 0; i < n; i++) {
      const p = pt(i, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // 3) 数据多边形: 多层渐变填充 + 渐变描边
    const grad1 = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * 1.0);
    grad1.addColorStop(0, 'rgba(99,102,241,0.45)');
    grad1.addColorStop(0.6, 'rgba(139,92,246,0.24)');
    grad1.addColorStop(1, 'rgba(139,92,246,0.06)');
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = Math.max(0.04, dims[i].val);
      const p = pt(i, v);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = grad1; ctx.fill();
    const grad2 = ctx.createLinearGradient(0, 0, r * 2, r * 2);
    grad2.addColorStop(0, primary);
    grad2.addColorStop(1, '#8b5cf6');
    ctx.strokeStyle = grad2;
    ctx.lineWidth = isBig ? 2.6 : 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 4) 数据点 + 光晕 + 外侧标签胶囊(标签 + 百分比)
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = Math.max(0.04, dims[i].val);
      const dim = dims[i];
      const gc = colorOf(dim);
      const p = pt(i, v);
      pts.push(p);

      // 外圈光晕(柔光圆)
      ctx.beginPath();
      ctx.arc(p.x, p.y, isBig ? 10 : 8, 0, 2 * Math.PI);
      const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, isBig ? 10 : 8);
      glow.addColorStop(0, gc.fill.replace(/0\.30/, '0.50'));
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fill();

      // 数据点: 白心 + 彩色边
      ctx.beginPath();
      ctx.arc(p.x, p.y, isBig ? 5 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = gc.stroke; ctx.lineWidth = 2.2; ctx.stroke();
    }

    // 5) v=20260904h 外侧标签胶囊:顶点外 label + pct,与图形留间距,互不遮挡
    for (let i = 0; i < n; i++) {
      const dim = dims[i];
      const gc = colorOf(dim);
      const a = ang(i);
      const vp = pt(i, 1); // 顶点(图形边缘)
      // 胶囊中心放在顶点外扩方向
      const gap = capReserve * 0.5; // 图形与胶囊之间留间距
      const ccx = cx + Math.cos(a) * (r + gap);
      const ccy = cy + Math.sin(a) * (r + gap);

      const labelText = (dim.icon ? dim.icon + ' ' : '') + dim.label;
      const pctText = Math.round(Math.max(0.04, dim.val) * 100) + '%';
      ctx.font = 'bold ' + labelFontSize + 'px sans-serif';
      const labelW = ctx.measureText(labelText).width;
      ctx.font = pctFontSize + 'px sans-serif';
      const pctW = ctx.measureText(pctText).width;
      // 胶囊宽 = label + 间距 + pct + 内边距
      const innerGap = 5;
      const capPad = 8;
      const capW = labelW + innerGap + pctW + capPad * 2;
      const capH2 = capH;

      // 白底细描边胶囊
      const bx = ccx - capW / 2;
      const by = ccy - capH2 / 2;
      // 边界保护:胶囊不越出 canvas
      const clampX = Math.max(2, Math.min(W - capW - 2, bx));
      const clampY = Math.max(2, Math.min(H - capH2 - 2, by));
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = gc.stroke + '45';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(clampX, clampY, capW, capH2, capH2 / 2);
      else ctx.rect(clampX, clampY, capW, capH2);
      ctx.fill(); ctx.stroke();

      // label(左) + pct(右,加粗上色)
      const textBaseY = clampY + capH2 / 2;
      const labelX = clampX + capPad;
      ctx.font = 'bold ' + labelFontSize + 'px sans-serif';
      ctx.fillStyle = gc.label;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(labelText, labelX, textBaseY + 0.5);

      const pctX = clampX + capW - capPad;
      ctx.font = 'bold ' + pctFontSize + 'px sans-serif';
      ctx.fillStyle = gc.stroke;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(pctText, pctX, textBaseY + 0.5);
    }

    // 6) 交互: 点击维度 → 弹详情
    if (opts.onPick) {
      canvas.style.cursor = 'pointer';
      const hit = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const sx = W / rect.width, sy = H / rect.height;
        const x = mx * sx, y = my * sy;
        let best = -1, bestD = 1e9;
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(x - pts[i].x, y - pts[i].y);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best >= 0 && bestD <= 22) {
          opts.onPick(dims[best]);
        }
      };
      canvas.onclick = hit;
    }

    // v=20260904i 恢复透明度,避免影响后续绘制
    if (opts.dim) ctx.globalAlpha = 1;
  };
  /** 雷达维度详情弹窗(点开信息更多) */
App._stuShowRadarDetail = function _stuShowRadarDetail(dim) {
    if (!dim) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.42);z-index:100001;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;max-width:420px;width:88%;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.28);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="width:42px;height:42px;border-radius:12px;background:var(--primary-gradient);display:flex;align-items:center;justify-content:center;font-size:20px;">${dim.icon || '📊'}</div>
          <div>
            <div style="font-size:17px;font-weight:800;color:var(--text);">${this.escapeHtml(dim.label)}</div>
            <div style="font-size:12px;color:var(--text-tertiary);">${this.escapeHtml(dim.group || '')}</div>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <div style="font-size:26px;font-weight:800;color:var(--primary);">${Math.round((dim.val || 0) * 100)}%</div>
            <div style="font-size:11px;color:var(--text-tertiary);">当前水平</div>
          </div>
        </div>
        <div style="background:var(--primary-light);border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px;">${this.escapeHtml(dim.desc || '')}</div>
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;">💡 提升建议</div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.8;padding:0 2px;">${this.escapeHtml(dim.tip || '')}</div>
        <div style="margin-top:8px;background:var(--surface-elevated);border:1px solid var(--border-light);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text-tertiary);">
          📌 数值含义: 雷达数值是归一化得分, <b style="color:var(--primary);">${Math.round((dim.val||0)*100)}%</b> 表示 ${this.escapeHtml(dim.benchText || '相对最优水平的完成度')}
        </div>
        <div style="display:flex;gap:8px;margin-top:18px;">
          <button onclick="this.closest('div').remove()" style="flex:1;padding:10px;border:none;border-radius:10px;background:var(--primary);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">知道了</button>
        </div>
      </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  };

  /**
   * v=20260910 学习里程碑下一目标(纯本地计算,基于积分/连击)
   * 返回最接近解锁的 2-3 个成就
   */
App._stuNextBadges = function _stuNextBadges(gamif) {
    if (!gamif) return [];
    const pts = gamif.points || 0;
    const streak = gamif.streak_days || 0;
    const done = (gamif.completed_tasks || []).length;
    const candidates = [
      { id: 'points_500', name: '🏆 积分新贵',  desc: '累计获得 500 积分', delta: Math.max(0, 500 - pts) },
      { id: 'points_1000', name: '💎 千分达成',  desc: '累计获得 1000 积分', delta: Math.max(0, 1000 - pts) },
      { id: 'streak_7',   name: '🔥 一周连击',  desc: '连续 7 天打卡', delta: Math.max(0, 7 - streak) + ' 天' },
      { id: 'streak_30',  name: '🌟 三十日铁人', desc: '连续 30 天打卡', delta: Math.max(0, 30 - streak) + ' 天' },
      { id: 'tasks_50',   name: '🎯 任务达人',  desc: '累计完成 50 个学习任务', delta: Math.max(0, 50 - done) + ' 个' },
    ];
    return candidates
      .filter(c => {
        if (typeof c.delta === 'number' && c.delta === 0) return false;   // 已达成
        return true;
      })
      .slice(0, 2);
  };

  /** 组装 8 维雷达数据(学习风格 4 + 认知 2 + 掌握 2),并缓存 */
App._stuBuildDims = function _stuBuildDims(p, m, pt, totalKp) {
    const mastered = pt.total_mastered || 0;
    const overall = p.overall_mastery ?? 50;
    const coverage = totalKp > 0 ? Math.min(100, (mastered / totalKp) * 100) : 50;
    const acc = p.cognitive_level?.accuracy || 0.5;
    const spd = p.cognitive_level?.speed || 0.5;
    return [
      { key: 'visual', label: '可视化', group: '学习风格', icon: '🎨', val: p.learning_style?.visual || 0,
        desc: '通过图形、动画、3D 演示来理解概念的偏好强度。可视化学习依赖直觉与空间想象，适合向量运算、线性变换等几何化内容。',
        tip: '使用「📊 几何可视化」模块观察向量运算与线性变换动画；在拓扑图谱中拖动节点观察关系。',
        benchText: '偏好自适应评分(0-100%)' },
      { key: 'reading', label: '阅读', group: '学习风格', icon: '📖', val: p.learning_style?.reading || 0,
        desc: '通过文字教材、公式推导、笔记来学习概念的偏好强度。阅读型学习者擅长从定义出发做严谨推理。',
        tip: '在「📚 知识体系」阅读章节原文与定义；在智能问答中要求"给出定义与推导"。',
        benchText: '偏好自适应评分(0-100%)' },
      { key: 'practice', label: '实践', group: '学习风格', icon: '✍️', val: p.learning_style?.practice || 0,
        desc: '通过做题、刷题、反复练习来巩固知识的偏好强度。实践型学习者通过试错建立熟练度。',
        tip: '使用「🎯 测试中心」组卷与「📖 练习题库」刷题；对薄弱点使用「🧪 薄弱点诊断练习」。',
        benchText: '偏好自适应评分(0-100%)' },
      { key: 'theory', label: '理论', group: '学习风格', icon: '🧠', val: p.learning_style?.theory || 0,
        desc: '通过公理、定理、证明来构建知识体系的偏好强度。理论型学习者追求逻辑自洽与体系完整。',
        tip: '在「🗺️ 拓扑图谱」查看知识点网状关系(前置依赖/后置关联)；让智能体讲证明思路。',
        benchText: '偏好自适应评分(0-100%)' },
      { key: 'speed', label: '反应速度', group: '认知水平', icon: '⚡', val: spd,
        desc: '作答反应速度归一化得分。基于平均作答时长估算：速度越快、用时越接近最优，得分越高。',
        tip: '对熟悉题型做限时训练；用「计算工具」减少手算耗时；多练典型题建立条件反射。',
        benchText: '0-100%,基于作答时间分布' },
      { key: 'accuracy', label: '答题精度', group: '认知水平', icon: '🎯', val: acc,
        desc: '答题正确率归一化得分。由练习与测试的正确率、错题率加权估算，反映知识掌握的确信度。',
        tip: '精做错题本中的高频错点；答题时先判断考点(前置依赖是否成立)再下笔；减少粗心失分。',
        benchText: '0-100%,基于正确率与错题率' },
      { key: 'mastery', label: '综合掌握', group: '知识掌握', icon: '📊', val: Math.max(0.04, overall / 100),
        desc: '全知识点综合掌握度。由各知识点 mastery 加权平均得出，反映整体知识体系的熟练程度。',
        tip: '低于 60% 时优先攻克薄弱点(掌握度<60)并补强 27 条核心必学前置(preWeight=1.0)。',
        benchText: '0-100%,全部知识点加权' },
      { key: 'coverage', label: '知识覆盖', group: '知识掌握', icon: '🗺️', val: Math.max(0.04, coverage / 100),
        desc: `已掌握知识点占比(${mastered}/${totalKp})。衡量知识体系覆盖面,覆盖越高越不容易有"知识盲区"。`,
        tip: '对照「📈 知识点掌握度」热力图,把红色/黄色(未学或薄弱)区块逐个点亮;结合拓扑图谱扫清未学节点。',
        benchText: '0-100%,掌握/总知识点' }
    ];
  };

  /**
   * v=20260910 情绪曲线绘制(Canvas):最近 N 天的情绪分折线
   * data: [{date:'2026-08-13', score:78}, ...]
   */
App._stuDrawEmotionTrend = function _stuDrawEmotionTrend(data) {
    const c = document.getElementById('stu-trend-emotion');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width = c.parentElement.clientWidth || 640;
    const H = c.height = 200;
    ctx.clearRect(0, 0, W, H);

    if (!data || !data.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无情绪历史数据', W / 2, H / 2);
      return;
    }

    const padL = 36, padR = 12, padT = 14, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = data.length;
    const maxV = 100, minV = 0;
    const xAt = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;

    // 健康区背景(60-100 浅绿)
    ctx.fillStyle = 'rgba(16,185,129,.06)';
    ctx.fillRect(padL, yAt(100), plotW, yAt(60) - yAt(100));

    // 网格线 + Y 刻度
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 25, 50, 75, 100]) {
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(v, padL - 4, y);
    }

    // 数据线(主色)
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = xAt(i), y = yAt(d.score);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();

    // 数据点 + 数值
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    data.forEach((d, i) => {
      const x = xAt(i), y = yAt(d.score);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 数值标注(隔一个标避免重叠)
      if (i % 2 === 0 || i === n - 1) {
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(d.score, x, y - 7);
      }
    });

    // X 轴日期标签
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    data.forEach((d, i) => {
      const x = xAt(i);
      const day = d.date.slice(5);  // 'MM-DD'
      ctx.fillText(day, x, H - padB + 6);
    });
  };

  /**
   * v=20260910 雷达 hover tooltip
   * 鼠标在 canvas 上移动时显示当前维度含义,无需点击
   */
App._stuBindRadarTooltip = function _stuBindRadarTooltip(canvas, dims, wrap) {
    if (!canvas || !wrap) return;
    let tip = wrap.querySelector('.stu-radar-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'stu-radar-tip';
      wrap.appendChild(tip);
    }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = W / rect.width, sy = H / rect.height;
      const x = (e.clientX - rect.left) * sx;
      const y = (e.clientY - rect.top) * sy;
      const cx = W / 2, cy = H / 2;
      const r = Math.min(W, H) / 2 - 44;
      const n = dims.length;
      // 找最近轴线 + 计算该轴上当前值的点位置
      let bestIdx = -1, bestD = 1e9;
      const ang = (i) => (i / n) * 2 * Math.PI - Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const px = cx + Math.cos(ang(i)) * r * dims[i].val;
        const py = cy + Math.sin(ang(i)) * r * dims[i].val;
        const d = Math.hypot(x - px, y - py);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestD <= 18) {
        const dim = dims[bestIdx];
        tip.innerHTML = `<b>${dim.icon || '📊'} ${this.escapeHtml(dim.label)}</b> · ${this.escapeHtml(dim.group || '')}<br>
                         当前 <b style="color:var(--primary);">${Math.round(dim.val * 100)}%</b><br>
                         <span style="color:var(--text-tertiary);font-size:11px;">${this.escapeHtml((dim.desc || '').slice(0, 70))}${(dim.desc || '').length > 70 ? '…' : ''}</span>`;
        // 定位:跟随鼠标,但限制在容器内
        const wrapRect = wrap.getBoundingClientRect();
        const tx = Math.min(e.clientX - wrapRect.left + 12, wrapRect.width - 230);
        const ty = Math.max(e.clientY - wrapRect.top - 10, 0);
        tip.style.left = tx + 'px';
        tip.style.top = ty + 'px';
        tip.classList.add('visible');
      } else {
        tip.classList.remove('visible');
      }
    };
    canvas.onmouseleave = () => tip.classList.remove('visible');
  };

App._stuOpenFS = function _stuOpenFS(tab) {
    const overlay = document.getElementById('stu-fs-overlay');
    if (!overlay || !this._stuData) return;
    overlay.classList.remove('closing');
    overlay.style.display = 'flex';
    this._stuSwitchTab(tab);
    this._stuBuildFSPanes();
  };

App._stuCloseFS = function _stuCloseFS() {
    const overlay = document.getElementById('stu-fs-overlay');
    if (!overlay) return;
    overlay.classList.add('closing');
    setTimeout(() => { overlay.style.display = 'none'; overlay.classList.remove('closing'); }, 220);
  };

App._stuSwitchTab = function _stuSwitchTab(tab) {
    const overlay = document.getElementById('stu-fs-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.stu-fs-tab').forEach(t => t.classList.toggle('active', t.dataset.stuTab === tab));
    const body = document.getElementById('stu-fs-body');
    if (!body) return;
    const old = body.querySelector('.stu-fs-pane.active');
    const pane = document.getElementById('stu-fs-pane-' + tab);
    if (old === pane && old) return;
    // 当前面板向左退出
    if (old && pane) {
      old.classList.add('exit-left');
      setTimeout(() => { old.classList.remove('active', 'exit-left'); }, 280);
      pane.classList.add('active');
    } else if (pane) {
      pane.classList.add('active');
    }
  };

App._stuBuildFSPanes = function _stuBuildFSPanes() {
    const d = this._stuData; if (!d) return;
    const { p, m, pt, dims, mastered, totalKp, rhy, chapterOrder, _esc } = d;

    // Pane: profile (学习画像)
    const pp = document.getElementById('stu-fs-pane-profile');
    if (pp && !pp.querySelector('canvas')) {
      pp.innerHTML = `
        <div class="stu-fs-radar-wrap"><canvas id="stu-fs-radar" width="400" height="400"></canvas>
          <div style="font-size:11.5px;color:var(--text-tertiary);text-align:center;margin-top:6px;">💡 点击雷达上的数据点,查看该维度详情与提升建议</div>
        </div>
        <div class="stu-card" style="max-width:500px;margin:0 auto;">
          <div class="stu-stat-row"><span>📊 综合掌握度</span><b>${p.overall_mastery ?? 50}%</b></div>
          <div class="stu-stat-row"><span>✅ 已掌握</span><b>${mastered}/${totalKp} 知识点</b></div>
          <div class="stu-stat-row"><span>💪 信心指数</span><b>${p.confidence_score ?? 50}</b></div>
          <div class="stu-stat-row"><span>🔥 连续学习</span><b>${rhy.streak_days || 0} 天</b></div>
          <div class="stu-stat-row"><span>⏰ 偏爱时段</span><b>${rhy.preferred_hour || 10}:00 左右</b></div>
          <div class="stu-stat-row"><span>⏱️ 平均时长</span><b>${rhy.avg_session_min || 30} 分钟/次</b></div>
          <div class="stu-stat-row"><span>🧠 学习风格</span><b>${Object.entries(p.learning_style || {}).filter(([,v])=>v>0).map(([k])=>k).join('、') || '待积累'}</b></div>
          <div class="stu-stat-row"><span>💡 认知能力</span><b>速度${(p.cognitive_level?.speed || 0.5).toFixed(2)} · 精度${(p.cognitive_level?.accuracy || 0.5).toFixed(2)}</b></div>
          <div class="stu-stat-row"><span>❤️ 兴趣方向</span><b>${Object.entries(p.interest_vector || {}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>k+' '+(v*100).toFixed(0)+'%').join(' · ') || '待探索'}</b></div>
        </div>`;
      // 画大雷达图(8 维高精度 + 点击详情)
      setTimeout(() => {
        const c = document.getElementById('stu-fs-radar');
        if (!c) return;
        c.width = 400; c.height = 400;
        this._stuDrawRadar(c, dims, {
          big: true,
          onPick: (dim) => this._stuShowRadarDetail(dim)
        });
      }, 150);
    }

    // Pane: mastery (知识点掌握度热力图 - 全屏)
    const pm = document.getElementById('stu-fs-pane-mastery');
    if (pm && !pm.querySelector('.stu-fs-heatmap')) {
      const kps = m.mastery || [];
      let html = '<div class="stu-fs-heatmap">';
      for (const ch of chapterOrder) {
        const chKps = kps.filter(x => (m.kp_to_chapter || {})[x.kp] === ch);
        html += `<div class="stu-hm-chapter"><div class="stu-hm-chname">${_esc(ch)}</div>`;
        for (const k of chKps) {
          const attempted = (k.attempts || 0) > 0; // v=20260904i
          const pct = attempted ? (k.mastery || 50) : 0;
          const hue = attempted ? (pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red') : 'gray';
          html += `<div class="stu-hm-kp stu-hm-${hue}" title="${_esc(k.kp)}：${attempted ? pct + '%（' + k.attempts + '次练习）' : '待测评'}">
            ${_esc(k.kp)}<span class="stu-hm-score">${attempted ? pct + '%' : '—'}</span>
            <small style="margin-left:6px;font-weight:400;opacity:.7;">${attempted ? k.attempts + '次' : '待测评'}</small>
          </div>`;
        }
        html += '</div>';
      }
      html += '</div>';
      pm.innerHTML = html;
    }

    // Pane: path (自适应学习路径 - 全屏，显示全部)
    const ppath = document.getElementById('stu-fs-pane-path');
    if (ppath && !ppath.querySelector('.stu-fs-path-list')) {
      const items = pt.path || [];
      if (items.length === 0) {
        ppath.innerHTML = '<div class="stu-path-empty">🎉 没有薄弱知识点！所有内容均已掌握。</div>';
      } else {
        let phtml = '<div class="stu-fs-path-list">';
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          phtml += `<div class="stu-path-item">
            <span class="stu-path-idx">${i + 1}</span>
            <span class="stu-path-info"><b>${_esc(it.kp)}</b><small>${_esc(it.chapter)} · ${it.status === 'weak' ? '需强化' : '前置依赖'} · 优先级${it.priority}</small></span>
            <span class="stu-path-bar"><span class="stu-path-fill" style="width:${it.mastery}%"></span></span>
            <span class="stu-path-pct">${it.mastery}%</span>
          </div>`;
        }
        phtml += '</div>';
        ppath.innerHTML = phtml;
      }
    }
  };

  /** v=20260904b P0 安全：明文密码已下线，查看入口已移除 */
App.showMyPassword = async function showMyPassword() {
    this._adminToast('系统已下线明文密码，密码仅以单向哈希存储，无法查看', 'warn');
  };

  /** 修改我的密码（个人空间） */
App.changeMyPassword = async function changeMyPassword() {
    const oldPwd = document.getElementById('cp-old').value.trim();
    const newPwd = document.getElementById('cp-new').value.trim();
    const msg = document.getElementById('cp-msg');
    if (!oldPwd) { msg.textContent = '请输入原密码'; return; }
    if (newPwd.length < 6) { msg.textContent = '新密码至少 6 位'; return; }
    try {
      const resp = await Auth.fetchWithAuth('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.detail || '修改失败');
      msg.textContent = '✅ 密码修改成功，即将重新登录…';
      msg.style.color = 'var(--primary)';
      // 强制下线：清凭证 → 回首页 → 打开登录
      setTimeout(() => {
        Auth.logout();
        if (window.App && typeof App.switchView === 'function') App.switchView('home');
        setTimeout(() => {
          if (window.WelcomeLogin && typeof WelcomeLogin.open === 'function') WelcomeLogin.open('login');
          else if (window.App && typeof App.showAuthModal === 'function') App.showAuthModal({ mode: 'login' });
        }, 300);
      }, 1200);
    } catch (e) {
      msg.textContent = '⚠️ ' + (e.message || e);
      msg.style.color = 'var(--error)';
    }
  };

  /**
   * v=20260824d 探测当前后端图片问答是否走视觉模型。
   * 返回 Promise<'vision' | 'ocr'> — OCR 表示 LLM_VISION_* 未配,后端走 OCR 降级。
   * 探测方式:从 /api/vision/status 读 vision_configured(公开接口,无需 admin)。
   */
App._detectVisionMode = async function _detectVisionMode() {
    try {
      const cached = this._visionModeCache;
      if (cached && (Date.now() - cached.t) < 60000) return cached.mode;
      const resp = await fetch((window.APP_CONFIG?.API_BASE || '') + '/api/vision/status');
      if (!resp.ok) return 'ocr';
      const d = await resp.json();
      const mode = d.mode === 'vision' ? 'vision' : 'ocr';
      this._visionModeCache = { t: Date.now(), mode, full: d };
      return mode;
    } catch (e) {
      return 'ocr';
    }
  };

  /**
   * v=20260824d 智能问答 · 图像识别状态条(嵌入 chat 输入区上方)。
   * 展示当前识别模式(视觉模型 / OCR 兜底) + 详情浮层(点击"详情 ▾"展开)。
   */
App._renderChatVisionBar = async function _renderChatVisionBar() {
    const bar = document.getElementById('chat-vision-bar');
    if (!bar) return;
    const dot = document.getElementById('cvb-dot');
    const text = document.getElementById('cvb-text');
    const mode = await this._detectVisionMode();
    const d = (this._visionModeCache && this._visionModeCache.full) || {};
    bar.classList.remove('mode-vision', 'mode-ocr', 'mode-unknown');
    bar.classList.add(mode === 'vision' ? 'mode-vision' : 'mode-ocr');
    if (dot) dot.style.background = mode === 'vision' ? '#10b981' : '#f59e0b';
    if (text) {
      text.innerHTML = mode === 'vision'
        ? `🖼️ 图像识别：<b>云端视觉模型</b>（${this._esc(d.vision_model || '')}）— 发题图直接看图解答`
        : `🖼️ 图像识别：<b>本地 OCR 兜底</b> — 发题图提取文字后解答（未配置云端视觉模型）`;
    }
    // 详情浮层(点一次生成,再点切换)
    const more = document.getElementById('cvb-more');
    if (more) {
      more.onclick = (e) => {
        e.stopPropagation();
        let panel = document.getElementById('cvb-panel');
        // v=20260926 关闭分支同样要解绑 document 上的"点空白关闭"监听:
        // 原来这里直接 return,close 闭包只挂在局部作用域里,
        // 用按钮收起浮层后该监听永久残留在 document 上(每次开关泄漏一个监听器)。
        if (panel) {
          panel.remove();
          if (more._closePanel) {
            document.removeEventListener('click', more._closePanel);
            more._closePanel = null;
          }
          return;
        }
        panel = document.createElement('div');
        panel.id = 'cvb-panel';
        panel.className = 'cvb-panel';
        panel.innerHTML = this._renderVisionPanelHTML(d, mode);
        bar.appendChild(panel);
        // 点击其他区域关闭
        setTimeout(() => {
          const close = (ev) => {
            if (!panel.contains(ev.target) && ev.target !== more) {
              panel.remove();
              document.removeEventListener('click', close);
              more._closePanel = null;
            }
          };
          // 保存引用,供"再次点击详情按钮收起"分支解绑(避免重复绑定/泄漏)
          more._closePanel = close;
          document.addEventListener('click', close);
        }, 50);
      };
    }
  };

  /**
   * v=20260824d 详情浮层 HTML(状态条"详情 ▾")。
   */
