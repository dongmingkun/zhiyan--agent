/* app-06-profile.js —— 原 js/app.v3.19.js 第 2394–3004 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._stuRenderOverview = function _stuRenderOverview() {
    const el = document.getElementById('student-content');
    const d = this._stuData; if (!el || !d) return;
    const { p, m, pt, dims, mastered, totalKp, rhy, chapterOrder, _esc, chapterStats } = d;

    const overall = p.overall_mastery ?? 50;
    const confidence = p.confidence_score ?? 50;
    const masteryPct = totalKp > 0 ? Math.round((mastered / totalKp) * 100) : 0;

    // v=20260904i 是否产生真实答题数据(未答题 = 空状态)
    const totalAttempts = (m.mastery || []).reduce((s, x) => s + (x.attempts || 0), 0);
    const hasRealData = totalAttempts > 0;

    // 薄弱点 / 路径摘要
    const weakCount = (m.mastery || []).filter(x => (x.mastery || 50) < 60).length;
    const pathItems = pt.path || [];
    const pathWeak = pathItems.filter(x => x.status === 'weak').length;
    const pathPre = pathItems.length - pathWeak;

    // 风格摘要
    const styleNames = { visual: '可视化', reading: '阅读型', practice: '实践型', theory: '理论型' };
    const topStyle = pt.style || 'practice';
    const chInt = p.interest_vector || {};
    const topInterests = Object.entries(chInt).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // 章节最强 / 最弱
    let bestCh = null, worstCh = null;
    for (const c of chapterStats) {
      if (!bestCh || c.avg > bestCh.avg) bestCh = c;
      if (!worstCh || c.avg < worstCh.avg) worstCh = c;
    }

    el.innerHTML = `
    <!-- KPI 核心指标 -->
    <div class="stu-kpi-row">
      <div class="stu-kpi-card">
        <div class="stu-kpi-label"><i class="stu-kpi-ic" style="color:#4f46e5">📊</i>综合掌握度</div>
        <div class="stu-kpi-num" style="color:#4f46e5">${hasRealData ? overall : '—'}<small>${hasRealData ? '%' : ''}</small></div>
        <div class="stu-kpi-bar"><span style="width:${hasRealData ? overall : 0}%"></span></div>
        ${!hasRealData ? '<div class="stu-kpi-foot">待测评 · 完成答题后生成</div>' : ''}
      </div>
      <div class="stu-kpi-card">
        <div class="stu-kpi-label"><i class="stu-kpi-ic" style="color:#10b981">✅</i>已掌握知识点</div>
        <div class="stu-kpi-num" style="color:#10b981">${hasRealData ? mastered : '—'}<small>${hasRealData ? '/' + totalKp : ''}</small></div>
        <div class="stu-kpi-bar"><span class="stu-kpi-bar-green" style="width:${hasRealData ? masteryPct : 0}%"></span></div>
        <div class="stu-kpi-foot">${hasRealData ? '覆盖率 ' + masteryPct + '%' : '待测评 · 完成答题后统计'}</div>
      </div>
      <div class="stu-kpi-card">
        <div class="stu-kpi-label"><i class="stu-kpi-ic" style="color:#f59e0b">🔥</i>连续学习</div>
        <div class="stu-kpi-num" style="color:#f59e0b">${rhy.streak_days || 0}<small>天</small></div>
        <div class="stu-kpi-foot">⏰ 常用 ${rhy.preferred_hour || 10}:00 · 均 ${rhy.avg_session_min || 30} 分钟</div>
      </div>
      <div class="stu-kpi-card">
        <div class="stu-kpi-label"><i class="stu-kpi-ic" style="color:#db2777">💪</i>信心指数</div>
        <div class="stu-kpi-num" style="color:#db2777">${confidence}<small>/100</small></div>
        <div class="stu-kpi-bar"><span class="stu-kpi-bar-warm" style="width:${confidence}%"></span></div>
        <div class="stu-kpi-foot">${confidence >= 70 ? '状态很好，保持节奏' : confidence >= 45 ? '稳中有进，逐步突破' : '从基础题开始，一步步建立信心'}</div>
      </div>
    </div>

    <!-- v=20260910 学习趋势曲线 + 知识点掌握分布 -->
    <div class="stu-trend-row">
      <div class="stu-trend-card">
        <h4>📈 近 7 天情绪曲线 <small style="color:var(--text-tertiary);font-weight:400;margin-left:auto;font-size:11.5px;">基于近 7 天学习记录</small></h4>
        <div class="stu-trend-empty" id="stu-trend-empty" style="display:none;">
          <div class="stu-trend-empty-ico">📈</div>
          <div class="stu-trend-empty-txt">从第一道题开始，这里会长出你的学习曲线</div>
          <button class="stu-trend-empty-btn" onclick="App._stuGoPractice()">去做题</button>
        </div>
        <canvas id="stu-trend-emotion" width="640" height="200"></canvas>
        <div class="stu-trend-legend">
          <span><i style="background:#6366f1"></i>情绪分(0-100)</span>
          <span><i style="background:#10b981;opacity:.4"></i>情绪健康区(≥60)</span>
        </div>
      </div>
      <div class="stu-trend-card">
        <h4>📊 知识点掌握分布</h4>
        <div class="stu-mastery-dist" title="红<50 / 黄50-69 / 绿≥70">
          ${(m.mastery || []).length > 0
            ? (() => {
                const tot = (m.mastery || []).length || 1;
                const g = (m.mastery || []).filter(x => x.mastery >= 70).length;
                const y = (m.mastery || []).filter(x => x.mastery >= 50 && x.mastery < 70).length;
                const r = (m.mastery || []).filter(x => x.mastery < 50).length;
                return `<span class="seg-green" style="width:${g/tot*100}%"></span>
                        <span class="seg-yellow" style="width:${y/tot*100}%"></span>
                        <span class="seg-red" style="width:${r/tot*100}%"></span>`;
              })()
            : '<span class="seg-green" style="width:0"></span><span class="seg-yellow" style="width:0"></span><span class="seg-red" style="width:100%"></span>'}
        </div>
        <div class="stu-mastery-dist-meta">
          ${(() => {
            const kps = m.mastery || [];
            const g = kps.filter(x => x.mastery >= 70).length;
            const y = kps.filter(x => x.mastery >= 50 && x.mastery < 70).length;
            const r = kps.filter(x => x.mastery < 50).length;
            return `<span style="color:#059669">🟢 稳固 ${g}</span>
                    <span style="color:#ca8a04">🟡 发展 ${y}</span>
                    <span style="color:#dc2626">🔴 薄弱 ${r}</span>`;
          })()}
        </div>
        <div class="stu-mastery-summary">
          ${(() => {
            const kps = m.mastery || [];
            const g = kps.filter(x => x.mastery >= 70);
            const y = kps.filter(x => x.mastery >= 50 && x.mastery < 70);
            const r = kps.filter(x => x.mastery < 50);
            const names = (arr) => arr.slice(0,2).map(x => _esc(x.kp)).join('、') || '暂无';
            return `<div class="stu-ms-line"><span class="stu-ms-dot" style="background:#059669"></span>稳固 ${g.length} 个：${names(g)}</div>
                    <div class="stu-ms-line"><span class="stu-ms-dot" style="background:#eab308"></span>发展 ${y.length} 个：${names(y)}</div>
                    <div class="stu-ms-line"><span class="stu-ms-dot" style="background:#ef4444"></span>薄弱 ${r.length} 个：${names(r)}</div>`;
          })()}
        </div>
        ${!hasRealData ? '<div class="stu-mastery-empty-tip">完成练习后，知识点将分化为稳固/发展/薄弱三档</div>' : ''}
        <div style="margin-top:14px;font-size:12.5px;color:var(--text-secondary);line-height:1.7;">
          <b>🧠 学习状态：</b>${_esc(p.emotion_trend?.current || '平稳')}
          ${p.emotion_trend?.trend ? `<br><small style="color:var(--text-tertiary);">趋势:${_esc(p.emotion_trend.trend)}</small>` : ''}
        </div>
      </div>
    </div>

    <!-- 概览行：雷达图 + 学习摘要 -->
    <div class="stu-ov-row">
      <div class="stu-card stu-ov-radar">
        <div class="stu-ov-radar-title">八维能力雷达</div>
        <div class="stu-radar-wrap">
          <canvas id="stu-radar" class="stu-radar" width="300" height="300"></canvas>
          ${!hasRealData ? '<div class="stu-radar-empty-overlay">完成首次答题后<br>生成真实能力画像</div>' : ''}
          <div class="stu-radar-hint">💡 点击数据点查看维度详情</div>
        </div>
      </div>
      <div class="stu-card stu-ov-summary">
        <h3>📌 学习概要</h3>
        <div class="stu-sum-row"><span>🎯 推荐焦点</span><b>${_esc(pt.suggestion || '—')}</b></div>
        <div class="stu-sum-row"><span>🎨 主导风格</span><b>${styleNames[topStyle] || topStyle}</b></div>
        <div class="stu-sum-row"><span>⚠️ 薄弱知识点</span><b>${weakCount} 个${weakCount > 0 ? '，建议优先攻克' : '，暂时没有'}</b></div>
        <div class="stu-sum-row"><span>🏆 掌握最好</span><b>${bestCh ? _esc(bestCh.chapter) + '（' + bestCh.avg + '%）' : '—'}</b></div>
        <div class="stu-sum-row"><span>🔧 待加强章节</span><b>${worstCh ? _esc(worstCh.chapter) + '（' + worstCh.avg + '%）' : '—'}</b></div>
        ${topInterests.length ? `<div class="stu-sum-row"><span>❤️ 兴趣方向</span><b>${topInterests.map(([k, v]) => _esc(k) + ' ' + Math.round(v * 100) + '%').join(' · ')}</b></div>` : ''}
      </div>
    </div>

    <!-- 二级模块入口 -->
    <div class="stu-entry-list">
      <div class="stu-entry-card" onclick="App._stuGoDetail('profile')">
        <div class="stu-entry-icon" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-dna"/></svg></div>
        <div class="stu-entry-body">
          <div class="stu-entry-title">学习画像详情<span class="stu-entry-chip">8 维度</span></div>
          <div class="stu-entry-desc">学习风格 · 认知水平 · 兴趣方向 · 学习节奏，逐维解读与提升建议</div>
          <div class="stu-entry-meta">主导风格：${styleNames[topStyle] || topStyle} · 速度 ${(p.cognitive_level?.speed || 0.5).toFixed(2)} · 精度 ${(p.cognitive_level?.accuracy || 0.5).toFixed(2)}</div>
        </div>
        <div class="stu-entry-arrow">查看详情 ›</div>
      </div>
      <div class="stu-entry-card" onclick="App._stuGoDetail('mastery')">
        <div class="stu-entry-icon" style="background:linear-gradient(135deg,#10b981,#059669);"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-trend"/></svg></div>
        <div class="stu-entry-body">
          <div class="stu-entry-title">知识点掌握度<span class="stu-entry-chip">${chapterStats.length} 章节</span></div>
          <div class="stu-entry-desc">按章节查看每个知识点的掌握度、练习次数、正确率与记忆保持度</div>
          <div class="stu-entry-meta">
            ${chapterStats.map(c => `<span class="stu-hm-dot stu-hm-${c.avg >= 70 ? 'green' : c.avg >= 50 ? 'yellow' : 'red'}" title="${_esc(c.chapter)}：${c.avg}%">${_esc(c.chapter.length > 8 ? c.chapter.slice(0, 8) + '…' : c.chapter)} ${c.avg}%</span>`).join('')}
          </div>
        </div>
        <div class="stu-entry-arrow">查看详情 ›</div>
      </div>
      <div class="stu-entry-card" onclick="App._stuGoDetail('path')">
        <div class="stu-entry-icon" style="background:linear-gradient(135deg,#f59e0b,#f97316);"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-map"/></svg></div>
        <div class="stu-entry-body">
          <div class="stu-entry-title">自适应学习路径<span class="stu-entry-chip">${pathItems.length} 项推荐</span><small class="stu-entry-chip-note">（随练习自动更新）</small></div>
          <div class="stu-entry-desc">基于前置依赖拓扑排序的个性化学习顺序，先补前置再攻薄弱</div>
          <div class="stu-entry-meta">${pathItems.length ? `⚠️ 待强化 ${pathWeak} 个 · 📖 前置依赖 ${pathPre} 个 · 建议：${_esc(pt.suggestion || '')}` : '🎉 所有知识点均已掌握'}</div>
        </div>
        <div class="stu-entry-arrow">查看详情 ›</div>
      </div>
      <div class="stu-entry-card" onclick="App._stuGoDetail('weak')">
        <div class="stu-entry-icon" style="background:linear-gradient(135deg,#ef4444,#ec4899);"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-flask"/></svg></div>
        <div class="stu-entry-body">
          <div class="stu-entry-title">薄弱点诊断练习<span class="stu-entry-chip ${weakCount > 0 ? 'danger' : ''}">${weakCount} 个薄弱点</span><small class="stu-entry-chip-note">（随练习自动更新）</small></div>
          <div class="stu-entry-desc">针对掌握度 &lt; 60 的知识点匹配题库练习，答错自动进入诊断回写</div>
          <div class="stu-entry-meta">${weakCount > 0 ? '从题库匹配针对性练习，逐个击破' : '🎉 暂无薄弱知识点'}</div>
        </div>
        <div class="stu-entry-arrow">查看详情 ›</div>
      </div>
    </div>`;

    // 雷达图(8 维高精度:5 层百分比网格 + 径向渐变 + 数值标注 + 点击详情)
    setTimeout(() => {
      const c = document.getElementById('stu-radar');
      if (!c) return;
      c.width = 340; c.height = 340;
      const hasData = this._stuData?.hasRealData !== false;
      this._stuDrawRadar(c, dims, {
        big: false,
        dim: !hasData,
        onPick: (dim) => this._stuShowRadarDetail(dim)
      });
      // v=20260910 雷达维度 hover tooltip
      this._stuBindRadarTooltip(c, dims, document.querySelector('.stu-radar-wrap'));
      // v=20260910 情绪曲线 canvas 绘制（无数据时显示空状态引导卡）
      const trendData = p.emotion_trend?.history || [];
      this._stuDrawEmotionTrend(trendData);
      const emptyEl = document.getElementById('stu-trend-empty');
      if (emptyEl) emptyEl.style.display = trendData.length ? 'none' : 'flex';
      const trendCanvas = document.getElementById('stu-trend-emotion');
      if (trendCanvas) trendCanvas.style.display = trendData.length ? 'block' : 'none';

      // v=20260903a 窗口 resize（横竖屏切换/折叠）时按容器宽度重绘雷达图，避免 canvas 拉伸变形
      if (!this._stuRadarResizeBound) {
        this._stuRadarResizeBound = true;
        let t = null;
        window.addEventListener('resize', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            // 仅当学习画像视图可见且有数据时才重绘，向后兼容
            const panel = document.getElementById('view-student');
            if (!panel || !panel.classList.contains('active')) return;
            const rc = document.getElementById('stu-radar');
            const dd = (this._stuData && this._stuData.dims) || dims;
            if (rc && dd) {
              this._stuDrawRadar(rc, dd, { big: false, dim: this._stuData?.hasRealData === false, onPick: (dim) => this._stuShowRadarDetail(dim) });
            }
          }, 180);
        });
      }
    }, 100);
    // v=20260894 学习小精灵 + 任务清单 + 积分/等级/闯关激励
    this._stuRenderGamification();
  };

  /** v=20260894 学习小精灵:基于画像/路径给今日建议 + 任务清单 + 积分/等级/闯关 */
App._stuRenderGamification = async function _stuRenderGamification() {
    if (!Auth.isLoggedIn) return;
    // 积分/等级卡(顶部)+ 任务清单 + 闯关可视化,统一插在 stu-entry-list 之后
    const host = document.getElementById('student-content');
    if (!host) return;
    // 避免重复插入
    if (document.getElementById('stu-gamification-root')) return;
    const root = document.createElement('div');
    root.id = 'stu-gamification-root';
    root.innerHTML = `<div class="stu-loading">🎓 学习小精灵正在准备今日任务…</div>`;
    host.appendChild(root);
    // 并行拉数据 —— v=20260900 带 8s 超时,小精灵建议服务不可用时用本地兜底,不阻塞积分/任务/闯关渲染
    const fetchT = (url, ms) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), ms);
      return Auth.fetchWithAuth(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
    };
    let gamif = null, tip = null;
    try {
      // v=20260900 allSettled:任一接口超时/失败不影响另一个(学习画像永不空白)
      const results = await Promise.allSettled([
        fetchT('/api/student/gamification', 8000),
        fetchT('/api/student/mentor_tip', 8000),
      ]);
      const r1 = results[0].status === 'fulfilled' ? results[0].value : null;
      const r2 = results[1].status === 'fulfilled' ? results[1].value : null;
      if (r1 && r1.ok) gamif = await r1.json();
      if (r2 && r2.ok) tip = await r2.json();
    } catch (e) { /* 静默 */ }
    if (!gamif) {
      root.innerHTML = '';
      return;
    }
    if (!tip) {
      // 小精灵 LLM 服务不可用 → 本地规则模板兜底(学习画像其余区块照常渲染)
      tip = {
        style_name: '综合', overall: gamif.overall || '-', confidence: gamif.confidence || '-',
        tip: '🎯 今天先攻克闯关地图中「今日主攻」的知识点,完成今日任务清单即可获得积分奖励!',
        reason: '系统已根据你的学习画像与薄弱点自动规划路径(小精灵在线建议服务暂不可用,已用本地规则兜底)。',
        encouragement: '💪 每天进步一点点,坚持就是胜利!',
        daily_tasks: []
      };
    }
    // v=20260904i 前端兜底过滤:防止历史脏数据(论文标题/文献名)再出现在今日任务
    if (tip && Array.isArray(tip.daily_tasks)) {
      tip.daily_tasks = tip.daily_tasks.filter(t => {
        const kp = (t && t.kp) || '';
        if (!kp) return false;
        if (/《|》/.test(kp)) return false;
        if (kp.length > 25) return false;
        if (/(研究与实践|知识图谱赋能|大学学报|Journal|学报|课程为例|——以|——基于|基于)/.test(kp)) return false;
        return true;
      });
    }
    // 渲染
    const today = new Date().toISOString().slice(0, 10);
    const completedToday = (gamif.completed_tasks || []).filter(t => t.date === today);
    const doneKps = new Set(completedToday.map(t => t.kp));
    const lvl = gamif.level, lvlName = gamif.level_name;
    const points = gamif.points, nextPts = gamif.next_level_points, progPct = gamif.level_progress_pct;
    const streak = gamif.streak_days || 0;
    // v=20260926 每日目标分母兜底:daily_goal 缺失/为 0 时 today_points / daily_goal
    // 会得到 Infinity(0 目标) 或 NaN(undefined),dashoffset / 百分比全部变成
    // "NaN"/"-Infinity" 字符串,进度环直接画不出来。统一用 goal 做分母。
    const goal = (gamif && gamif.daily_goal > 0) ? gamif.daily_goal : 100;
    // 闯关进度:总积分 → 5 个等级里程碑
    const _esc = s => String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    root.innerHTML = `
    <!-- 🎓 学习小精灵卡 -->
    <div class="stu-mentor-card">
      <div class="stu-mentor-head">
        <div class="stu-mentor-avatar">🎓</div>
        <div>
          <div class="stu-mentor-title">学习小精灵</div>
          <div class="stu-mentor-sub">${_esc(tip.style_name)}学习风格 · 综合 ${tip.overall}% · 信心 ${tip.confidence}/100</div>
        </div>
        <span class="stu-mentor-badge">Lv.${lvl} ${_esc(lvlName)}</span>
      </div>
      <div class="stu-mentor-tip"><b>📌 今日建议</b>${_esc(tip.tip)}</div>
      <div class="stu-mentor-reason"><b>🤔 为什么这样规划</b>${_esc(tip.reason)}</div>
      <div class="stu-mentor-enc">${_esc(tip.encouragement)}</div>
    </div>

    <!-- ⭐ 积分/等级/连续打卡 -->
    <div class="stu-gamif-card">
      <div class="stu-gamif-stat">
        <div class="stu-gamif-num" style="color:#f59e0b;">⭐ ${points}</div>
        <div class="stu-gamif-label">累计积分</div>
      </div>
      <div class="stu-gamif-stat">
        <div class="stu-gamif-num" style="color:#8b5cf6;">Lv.${lvl}</div>
        <div class="stu-gamif-label">${_esc(lvlName)}</div>
      </div>
      <div class="stu-gamif-stat">
        <div class="stu-gamif-num" style="color:#ef4444;">🔥 ${streak}</div>
        <div class="stu-gamif-label">连续打卡(天)</div>
      </div>
      <div class="stu-gamif-stat">
        <div class="stu-gamif-num" style="color:#10b981;">✓ ${completedToday.length}</div>
        <div class="stu-gamif-label">今日完成</div>
      </div>
    </div>

    <!-- 🏆 闯关进度条(5 个等级里程碑) -->
    <div class="stu-quest-card">
      <div class="stu-quest-head">
        <b>🏆 闯关之路</b>
        <span style="font-size:11px;color:var(--text-tertiary);">下一关: ${lvl >= 5 ? '已登顶 👑' : nextPts + ' 分'}</span>
      </div>
      <div class="stu-quest-track">
        <div class="stu-quest-fill" style="width:${lvl >= 5 ? 100 : Math.max(4, progPct)}%"></div>
        <div class="stu-quest-current" style="left:${lvl >= 5 ? 100 : Math.max(2, progPct)}%"></div>
      </div>
      <div class="stu-quest-milestones">
        ${[1,2,3,4,5].map(n => {
          const lv = n, name = ['', '🌱 新手', '📐 入门', '✏️ 学徒', '🎓 学者', '👑 大师'][n];
          const reached = points >= [0, 100, 300, 700, 1500, 99999][n];
          return `<div class="stu-milestone ${reached ? 'reached' : ''} ${n === lvl ? 'current' : ''}"><div class="stu-milestone-dot">${reached ? '✓' : n}</div><div class="stu-milestone-name">Lv.${n}</div></div>`;
        }).join('')}
      </div>
    </div>

    <!-- 🎯 每日目标进度环 + 🔥 本周打卡(多邻国 Daily Goal / Streak 式) -->
    <div class="stu-daily-card">
      <div class="stu-goal-wrap">
        <div class="stu-goal-ring-wrap">
          <svg class="stu-goal-ring" viewBox="0 0 64 64" width="64" height="64">
            <circle class="stu-goal-bg" cx="32" cy="32" r="26" fill="none" stroke-width="7"/>
            <circle class="stu-goal-fg ${gamif.daily_done ? 'done' : ''}" cx="32" cy="32" r="26" fill="none" stroke-width="7"
              stroke-dasharray="163.4" stroke-dashoffset="${Math.max(0, 163.4 * (1 - Math.min(100, gamif.today_points / goal * 100) / 100))}"
              stroke-linecap="round" transform="rotate(-90 32 32)"/>
          </svg>
          <div class="stu-goal-center">${gamif.daily_done ? '✓' : Math.min(100, Math.round(gamif.today_points / goal * 100)) + '%'}</div>
        </div>
        <div class="stu-goal-info">
          <div class="stu-goal-title">🎯 今日目标 ${gamif.daily_done ? '已达成!' : ''}</div>
          <div class="stu-goal-num">${gamif.today_points} / ${goal} 分</div>
          <div class="stu-goal-sub">${gamif.daily_done ? '🎉 完成今日全部任务,保持连胜!' : '再完成 ' + Math.max(0, goal - gamif.today_points) + ' 分即可达成'}</div>
        </div>
      </div>
      <div class="stu-week-wrap">
        <div class="stu-week-title">🔥 本周打卡 · 连续 ${streak} 天</div>
        <div class="stu-week-dots">
          ${(gamif.week_streak || []).map(w => {
            const dt = new Date(w.date + 'T00:00:00');
            const wd = ['日','一','二','三','四','五','六'][dt.getDay()];
            return `<div class="stu-week-dot ${w.active ? 'active' : ''} ${w.today ? 'today' : ''}" title="${w.date}">${w.active ? '🔥' : wd}</div>`;
          }).join('')}
        </div>
        <div class="stu-week-sub">今天学习打卡,连胜火焰不灭</div>
      </div>
    </div>

    <!-- 🎮 知识闯关地图(多邻国 Path 式:按前置依赖排好的冒险之路) -->
    <div class="stu-quest-map-card">
      <div class="stu-quest-map-head">
        <b>🎮 知识闯关地图</b>
        <span>按前置依赖排好序 · 点击节点立即开始挑战</span>
      </div>
      <div class="stu-quest-map" id="stu-quest-map"><div class="stu-loading">⏳ 绘制闯关地图…</div></div>
    </div>

    <!-- 📋 今日学习任务清单 -->
    <div class="stu-tasks-card">
      <div class="stu-tasks-head">
        <b>📋 今日学习任务</b>
        <span style="font-size:11px;color:var(--text-tertiary);">完成得 +10 分 · 每日刷新</span>
      </div>
      ${tip.daily_tasks.length === 0
        ? '<div class="stu-task-empty">🎉 今天没有待办任务,继续保持!</div>'
        : tip.daily_tasks.map((t, i) => {
            const done = doneKps.has(t.kp);
            return `<div class="stu-task ${done ? 'done' : ''}" data-kp="${_esc(t.kp)}" data-idx="${i}">
              <button class="stu-task-check ${done ? 'checked' : ''}" onclick="App._stuTaskDone('${_esc(t.kp).replace(/'/g, "\\'")}', ${t.points || 10}, this)" ${done ? 'disabled' : ''} title="完成得 ${t.points || 10} 分">
                ${done ? '✓' : ''}
              </button>
              <div class="stu-task-body">
                <div class="stu-task-kp">${_esc(t.kp)}</div>
                <div class="stu-task-tip">${_esc(t.suggestion || '')}</div>
              </div>
              <span class="stu-task-reward">+${t.points || 10}分</span>
            </div>`;
          }).join('')}
    </div>

    <!-- 🏅 已获徽章 -->
    ${(gamif.badges && gamif.badges.length) ? `
    <div class="stu-badges-card">
      <div class="stu-badges-head"><b>🏅 已获徽章 (${gamif.badges.length})</b></div>
      <div class="stu-badges-list">
        ${gamif.badges.slice(-8).reverse().map(b => `<span class="stu-badge" title="${_esc(b.desc || b.id)}">${_esc(b.name)}</span>`).join('')}
      </div>
    </div>` : ''}`;

    // 绘制闯关地图(独立拉取自适应路径)
    this._stuRenderQuestMap(document.getElementById('stu-quest-map'));
  };

  /** v=20260895 绘制知识闯关地图(按章节分组手风琴):节点 → 已掌握/今日主攻/待强化 */
App._stuRenderQuestMap = async function _stuRenderQuestMap(mapEl) {
    if (!mapEl) return;
    try {
      const r = await Auth.fetchWithAuth('/api/student/path');
      if (!r.ok) { mapEl.innerHTML = '<div class="stu-quest-map-empty">闯关地图加载失败,请稍后刷新</div>'; return; }
      const d = await r.json();
      const items = d.path || [];
      if (!items.length) {
        mapEl.innerHTML = '<div class="stu-quest-map-empty">🎉 所有知识点都已掌握!闯关地图全部点亮,太棒了!</div>';
        return;
      }
      // v=20260904i 按章节分组(保留 KG 中 6 章顺序,仅展示路径中出现的章节)
      const chapterOrder = ['行列式', '矩阵及其运算', '向量与线性方程组', '特征值与特征向量', '二次型', '线性空间与线性变换'];
      const groups = new Map();
      for (const it of items) {
        const ch = it.chapter || '其他';
        if (!groups.has(ch)) groups.set(ch, []);
        groups.get(ch).push(it);
      }
      // 按固定章节顺序 + 兜底未知章节排后
      const orderedGroups = [];
      for (const ch of chapterOrder) {
        if (groups.has(ch)) orderedGroups.push([ch, groups.get(ch)]);
      }
      for (const [ch, arr] of groups) {
        if (!chapterOrder.includes(ch)) orderedGroups.push([ch, arr]);
      }

      let firstWeak = true; // 全局第一个薄弱点标记为"今日主攻"
      const accHtml = orderedGroups.map(([ch, arr], gi) => {
        const avg = Math.round(arr.reduce((s, x) => s + (x.mastery || 0), 0) / arr.length);
        const nodes = arr.map((it) => {
          const attempted = (it.attempts || 0) > 0; // v=20260904i 是否有真实答题
          const mastered = attempted && it.mastery >= 60;
          let state = 'locked', icon = '🔒';
          if (!attempted) { state = 'locked'; icon = '🔒'; }
          else if (mastered) { state = 'done'; icon = '✓'; }
          else if (firstWeak) { state = 'current'; icon = '🎯'; firstWeak = false; }
          else { state = 'locked'; icon = '🔒'; }
          // 预检题库是否有该知识点题目(无题节点引导去智能问答学习)
          const hasQ = this._stuHasQuiz(it.kp);
          const safe = this.escapeHtml(it.kp).replace(/'/g, "\\'");
          const pctText = attempted ? it.mastery + '%' : '—'; // 未测评显示灰色横杠
          const sub = !attempted ? '待测评 · 完成答题后解锁' : (mastered ? '已掌握 ✓' : (state === 'current' ? '🎯 今日主攻 · 攻克即 +10 分' : '掌握度 ' + it.mastery + '%'));
          const goText = !attempted ? '去学习' : (mastered ? '复习' : (hasQ ? '挑战' : '去学习'));
          return `<div class="stu-qmap-node ${state}${!attempted ? ' pending' : ''}" onclick="App._stuPracticeKp('${safe}', ${it.mastery})" title="${!attempted ? '待测评 · 点击开始学习' : (mastered ? '已掌握 · 点击可复习' : '掌握度 ' + it.mastery + '% · 点击开始专项练习')}">
            <div class="stu-qmap-dot"><span class="stu-qmap-ico">${icon}</span><span class="stu-qmap-pct">${pctText}</span></div>
            <div class="stu-qmap-body">
              <div class="stu-qmap-kp">${this.escapeHtml(it.kp)}</div>
              <div class="stu-qmap-sub">${sub}</div>
            </div>
            <span class="stu-qmap-go">${goText} ▶</span>
          </div>`;
        }).join('');
        const expanded = gi === 0 ? ' open' : '';
        return `<div class="stu-qmap-group${expanded}">
          <button class="stu-qmap-group-head" onclick="App._stuToggleQmapGroup(this)">
            <span class="stu-qmap-group-title">${this.escapeHtml(ch)}</span>
            <span class="stu-qmap-group-meta">平均掌握度 ${avg}% · ${arr.length} 个关卡</span>
            <span class="stu-qmap-group-arrow">▾</span>
          </button>
          <div class="stu-qmap-group-body">${nodes}</div>
        </div>`;
      }).join('');

      mapEl.innerHTML = accHtml;
    } catch (e) {
      mapEl.innerHTML = '<div class="stu-quest-map-empty">闯关地图加载失败</div>';
    }
  };

  /** v=20260904i 展开/收起章节手风琴 */
App._stuToggleQmapGroup = function _stuToggleQmapGroup(headBtn) {
    if (!headBtn) return;
    const group = headBtn.closest('.stu-qmap-group');
    if (!group) return;
    group.classList.toggle('open');
  };

  /** v=20260904i 空状态"去做题"按钮:跳转练习题库 */
App._stuGoPractice = function _stuGoPractice() {
    if (this.switchView) { this.switchView('practice'); return; }
    const QUI = typeof QuizUI !== 'undefined' ? QuizUI : window.QuizUI;
    if (QUI && typeof QUI.renderPracticeHome === 'function') QUI.renderPracticeHome();
  };

  /** v=20260895 点击闯关节点 → 发起该知识点专项练习(百词斩"斩题"式即时开练) */
App._stuHasQuiz = function _stuHasQuiz(kp) {
    try {
      const Q = typeof QuizBank !== 'undefined' ? QuizBank : window.QuizBank;
      if (!Q || !Q.questions) return false;
      if (Q.questions.some(q => (q.knowledgePoint || '').indexOf(kp) >= 0 || (q.chapter || '').indexOf(kp) >= 0)) return true;
      const sub = (kp || '').slice(0, 2);
      return sub && Q.questions.some(q => q.knowledgePoint && q.knowledgePoint.indexOf(sub) >= 0);
    } catch (e) { return false; }
  };

  /** v=20260895 点击闯关节点 → 发起该知识点专项练习(百词斩"斩题"式即时开练) */
App._stuPracticeKp = function _stuPracticeKp(kp, mastery) {
    if (!kp) return;
    if (!this._stuHasQuiz(kp)) {
      this._adminToast('📖 题库暂无「' + kp + '」的专项题,先去智能问答向小精灵学习这个知识点', 'warn');
      return;
    }
    const QUI = typeof QuizUI !== 'undefined' ? QuizUI : window.QuizUI;
    if (QUI && typeof QUI.startPracticeByKP === 'function') {
      this._adminToast('🎮 开始挑战「' + kp + '」专项练习,答对自动回写掌握度', 'ok');
      QUI.startPracticeByKP(kp);
    } else {
      this._adminToast('⚠️ 练习模块暂不可用', 'warn');
    }
  };

  /** v=20260894 完成一个今日任务(加积分 + 刷新面板 + 弹徽章动画) */
App._stuTaskDone = async function _stuTaskDone(kp, points, btnEl) {
    if (!Auth.isLoggedIn) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳'; }
    try {
      const r = await Auth.fetchWithAuth('/api/student/task_done', {
        method: 'POST',
        body: JSON.stringify({ kp, points })
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        this._adminToast('⚠️ 任务完成失败:' + (d.detail || d.message || '网络错误'), 'warn');
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = ''; }
        return;
      }
      if (d.duplicate) {
        this._adminToast('ℹ️ ' + d.message, 'ok');
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '✓'; }
        return;
      }
      // 立即视觉反馈:勾选 + 积分飞入动画
      if (btnEl) { btnEl.classList.add('checked'); btnEl.textContent = '✓'; }
      const card = btnEl && btnEl.closest('.stu-task');
      if (card) card.classList.add('done');
      // 飞入 +10 提示
      this._stuShowFloatingPoint(btnEl, '+' + d.added_points);
      // 弹新徽章
      if (d.new_badges && d.new_badges.length) {
        setTimeout(() => {
          d.new_badges.forEach((b, i) => {
            setTimeout(() => this._stuShowBadgePop(b.name + (b.desc ? ' · ' + b.desc : '')), i * 900);
          });
        }, 400);
      }
      // 升级
      if (d.new_level && d.new_level > 1) {
        setTimeout(() => this._stuShowBadgePop('🎉 升级到 Lv.' + d.new_level + ' ' + d.new_level_name), 300);
      }
      this._adminToast('✅ +' + d.added_points + ' 分 · 当前累计 ' + d.new_total_points + ' 分', 'ok');
      // 3 秒后刷新整张图(让积分/等级/徽章同步)
      setTimeout(() => this._stuRenderGamification(), 3500);
    } catch (e) {
      this._adminToast('⚠️ 网络错误:' + e.message, 'warn');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = ''; }
    }
  };

  /** v=20260894 飞入积分动画(在按钮位置上方飘出 "+10" 数字) */
App._stuShowFloatingPoint = function _stuShowFloatingPoint(anchor, text) {
    if (!anchor) return;
    const fly = document.createElement('span');
    fly.className = 'stu-float-points';
    fly.textContent = text;
    const r = anchor.getBoundingClientRect();
    fly.style.left = (r.left + r.width / 2) + 'px';
    fly.style.top = (r.top + window.scrollY) + 'px';
    document.body.appendChild(fly);
    setTimeout(() => fly.remove(), 1600);
  };

  /** v=20260894 徽章/升级弹窗动画 */
App._stuShowBadgePop = function _stuShowBadgePop(text) {
    const overlay = document.createElement('div');
    overlay.className = 'stu-badge-pop';
    overlay.innerHTML = `<div class="stu-badge-pop-inner">🎉<div class="stu-badge-pop-text">${String(text || '').replace(/</g, '&lt;')}</div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    setTimeout(() => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 400); }, 2400);
  };

  /* ════════ 二级页面：详情导航 ════════ */

  /** 进入二级详情页 */
