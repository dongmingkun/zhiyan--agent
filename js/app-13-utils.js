/* app-13-utils.js —— 原 js/app.v3.19.js 第 8974–11024 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
/* v=20260926 奇异阈值统一常量:|A| < SINGULAR_EPS 即视为行列式为 0(矩阵奇异/不可逆)。
 * 统一依据:数值线性代数中"是否可逆"是同一个判定,原来 determinant 分支用 1e-10、
 * inverse/伴随矩阵/属性面板用 1e-12,会出现"属性面板显示可逆、点求逆却报错"或
 * 反之的自相矛盾。这里统一为 1e-10(取更保守者,与小矩阵元素的浮点误差同量级),
 * 四处判定共用,后续调整只需改这一处。*/
const SINGULAR_EPS = 1e-10;
App._tpRenderCollapsed = function _tpRenderCollapsed() {
    // 收起态：渲染提示文字 + 大圆形触发图标
    const box = document.getElementById('topology-detail');
    if (!box) return;
    const cnt = this._tpGraphData ? this._tpGraphData.nodes.length : 6;
    box.innerHTML = `
      <div class="tp-collapsed-hint">点击节点查看详情</div>
      <div class="tp-collapsed-icon" data-count="${cnt}">i</div>
    `;
  };

App._tpSelectNode = function _tpSelectNode(nodeId) {
    const data = this._tpGraphData;
    if (!data) return;
    const n = data.nodes.find(x => x.id === nodeId);
    if (!n) return;
    this._tpSelectedNode = n;
    const box = document.getElementById('topology-detail');
    const guide = document.getElementById('topo-guide');
    if (!box || !guide) return;
    // 抽屉滑入(悬浮 fixed,不挤压画布)
    box.style.display = '';
    box.classList.remove('tp-drawer-collapsed');
    box.classList.add('tp-drawer-expanded');
    guide.style.display = 'none';
    // 收起时抽屉只显示触发图标
    this._tpUpdateCollapsedHint();
    // 核心优化:点击节点 → 自动进入【聚焦关联模式】,只展示前后置网络
    this._tpEnterFocus(nodeId);

    const pct = Math.round(n.mastery * 100);
    const level = n.mastery > 0.85 ? 'high' : n.mastery >= 0.6 ? 'mid' : 'low';
    const mc = this._tpMasteryColor(n.mastery);
    // 元数据驱动的列表(更精确,带权重+描述)
    const meta = window.__META__ && window.__META__[n.id] || {};
    const preDeps = (n.preDependencies && n.preDependencies.length) ? n.preDependencies : meta.preDependencies || [];
    const postRels = (n.postRelations && n.postRelations.length) ? n.postRelations : meta.postRelations || [];
    // 兼容(取并集)——确保即使用户看的是老缓存的 nodes 仍有数据
    const prereqs = preDeps.map(p => ({ ...p, target: data.nodes.find(x => x.id === p.targetId) })).filter(x => x.target);
    const succs = postRels.map(p => ({ ...p, target: data.nodes.find(x => x.id === p.targetId) })).filter(x => x.target);
    // 三项分数 + 难度
    const ds = n.difficultyScore || 3;
    const es = n.errorProneScore || 0;
    const fs = n.examFreqScore || 0;
    const stars = this._tpStars(ds);

    box.innerHTML = `
      <div class="tp-drawer-header">
        <div class="tp-drawer-module" style="background:${mc}22; color:${mc}">${n.module}</div>
        <div class="tp-drawer-title">${n.id} · ${n.name}</div>
        <div class="tp-drawer-metrics" style="margin-left:auto;">
          <span class="tp-metric tp-metric-mast mastery-${level}">
            <span class="m-label">掌握度</span><span class="m-num">${pct}%</span>
            <span style="font-size:10px;color:#94a3b8">· ${this._tpMasteryText(n.mastery)}</span>
          </span>
          <span class="tp-metric"><span class="m-label">考频权重</span>${Math.round(n.freq * 100)}%</span>
        </div>
        <button class="tp-drawer-close" onclick="App.topologyClosePanel()" title="关闭">×</button>
      </div>
      <div class="tp-drawer-body">
        <div class="tp-section-title">📊 难度 / 易错 / 考频</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
          <div class="tp-meta-card">
            <div style="font-size:11px;color:var(--text-secondary);">难度</div>
            <div style="font-size:18px;color:#f59e0b;letter-spacing:2px;line-height:1.4;">${stars}</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${ds} / 5</div>
          </div>
          <div class="tp-meta-card">
            <div style="font-size:11px;color:var(--text-secondary);">易错</div>
            <div style="font-size:18px;color:${this._tpErrScoreColor(es)};font-weight:700;">${Math.round(es * 100)}%</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${es >= 0.75 ? '极易错' : es >= 0.55 ? '较易错' : es >= 0.35 ? '一般' : '不易错'}</div>
          </div>
          <div class="tp-meta-card">
            <div style="font-size:11px;color:var(--text-secondary);">考频</div>
            <div style="font-size:18px;color:#38bdf8;font-weight:700;">${Math.round(fs * 100)}%</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${fs >= 0.7 ? '高频考点' : fs >= 0.45 ? '常考' : '偶尔考'}</div>
          </div>
        </div>

        ${prereqs.length ? `
        <div class="tp-section-title">📥 前置依赖（${prereqs.length}）</div>
        <div class="tp-meta-list">
          ${prereqs.map(p => {
            const w = Math.round((p.preWeight || 0) * 100);
            const strong = w >= 80;
            return `<div class="tp-meta-row${strong ? ' strong' : ''}">
              <span style="color:${strong ? '#ef4444' : '#a5b4fc'};font-weight:700;">${w}%</span>
              <span style="flex:1;">${p.target.name}</span>
              ${strong ? '<span style="font-size:10px;color:#ef4444;font-weight:700;">必学</span>' : ''}
              <span class="tp-meta-tip">${this.escapeHtml(p.desc || '')}</span>
            </div>`;
          }).join('')}
        </div>
        <div style="font-size:11px;color:#a5b4fc;margin-top:4px;line-height:1.6;background:rgba(99,102,241,0.06);padding:8px;border-radius:6px;">
          💡 ${prereqs.filter(p => (p.preWeight || 0) >= 0.8).length > 0 ? '存在强必学前置;若尚未掌握,建议先复习以避免理解障碍。' : '暂无强必学前置,可直接学习。'}
        </div>
        ` : '<div class="tp-section-title">📥 前置依赖（0）</div><div style="color:var(--text-tertiary);font-size:12px;">入门级,无需前置</div>'}

        ${succs.length ? `
        <div class="tp-section-title">📤 后置关联（${succs.length}）</div>
        <div class="tp-meta-list">
          ${succs.map(p => {
            const w = Math.round((p.postWeight || 0) * 100);
            const strong = w >= 80;
            return `<div class="tp-meta-row${strong ? ' strong' : ''}">
              <span style="color:${strong ? '#22c55e' : '#86efac'};font-weight:700;">${w}%</span>
              <span style="flex:1;">${p.target.name}</span>
              ${strong ? '<span style="font-size:10px;color:#22c55e;font-weight:700;">强相关</span>' : ''}
              <span class="tp-meta-tip">${this.escapeHtml(p.desc || '')}</span>
            </div>`;
          }).join('')}
        </div>
        ` : ''}

        <div class="tp-section-title">⚠ 三级易错点（${(n.errors || []).length}）</div>
        <div class="tp-errors-list">
          ${(n.errors && n.errors.length)
            ? n.errors.map((e, i) => `
              <div class="tp-error-item">
                <span class="tp-error-num">${i + 1}</span>
                <span class="tp-error-text">${e}</span>
              </div>`).join('')
            : (es >= 0.55 ? '<div class="tp-error-empty">⚠ 易错系数 ' + Math.round(es*100) + '%,建议结合其他资料主动排查</div>' : '<div class="tp-error-empty">暂无易错点</div>')}
        </div>

        <div class="tp-actions">
          <button class="tp-action-btn" onclick="App.topoPractice('${n.id}')">📝 练习</button>
          <button class="tp-action-btn primary" onclick="App.topoStudy('${n.id}')">📖 开始学习</button>
        </div>
      </div>`;
    // 面板滚到可视区
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

App.topologyClosePanel = function topologyClosePanel() {
    const box = document.getElementById('topology-detail');
    if (box) {
      box.classList.remove('tp-drawer-expanded');
      box.classList.add('tp-drawer-collapsed');
    }
    this._tpSelectedNode = null;
    const guide = document.getElementById('topo-guide');
    if (guide) guide.style.display = '';
    // 关闭抽屉 → 若处于聚焦关联模式,自动切回完整总览,恢复全部节点展示
    this._tpExitFocus();
  };

  /**
   * 完整销毁拓扑图谱组件：释放 ECharts 实例 + 清空画布 DOM + 重置初始化标记
   * 离开视图或跳转前必须调用，避免 SPA 路由残留
   */
App.topologyDestroy = function topologyDestroy() {
    // 1. 销毁 ECharts 实例（释放内存 + 解绑事件 + 释放 canvas/svg 底层资源）
    if (this._tpChart) {
      try { this._tpChart.dispose(); } catch (e) {}
      this._tpChart = null;
    }
    // 2. 【彻底卸载】清空整个 view-topology 内部的 DOM（toolbar / canvas / drawer / guide / main-row 全部清空）
    //    下次进入时由 _tpRebuildDom() 完整重建，确保不留任何残留
    const view = document.getElementById('view-topology');
    if (view) {
      try { view.innerHTML = ''; } catch (e) {}
    }
    // 3. 重置所有状态标记
    this._tpInited = false;
    this._tpGraphData = null;
    this._tpSelectedNode = null;
    this._tpFocusedCluster = null;
  };

  /**
   * 重建拓扑图谱的所有 DOM（toolbar + main-row + canvas + drawer + guide）
   * 用于：①首次进入 ②离开后再进入
   */
App._tpRebuildDom = function _tpRebuildDom() {
    const view = document.getElementById('view-topology');
    if (!view) return null;
    view.innerHTML = `
      <div class="topo-toolbar">
        <button class="topo-hamburger" onclick="App.openKnowledgeSidebar()" aria-label="打开章节目录" title="打开章节目录">☰</button>
        <button class="topo-back-btn" onclick="App.switchView('home')" title="返回首页">🏠 <span class="topo-back-text">返回首页</span></button>
        <div class="topo-search">
          <span class="topo-search-icon">⌕</span>
          <input id="topology-search-input" type="text" placeholder="搜索知识点，回车聚焦定位" onkeydown="if(event.key==='Enter')App.topologySearch(this.value, true)" />
          <button class="topo-search-clear" onclick="App.topologySearch('', true)" title="清空">×</button>
        </div>
        <div class="topo-toolbar-spacer"></div>
        <div class="topo-mode-switch" id="topo-mode-switch" title="切换图谱浏览模式">
          <button class="topo-mode-btn active" data-mode="overview" onclick="App.topoSwithMode('overview')"><span class="topo-mode-icon"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-globe"/></svg></span><span class="topo-mode-text">总览</span></button>
          <button class="topo-mode-btn" data-mode="focus" onclick="App.topoSwithMode('focus')"><span class="topo-mode-icon"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-search"/></svg></span><span class="topo-mode-text">聚焦</span></button>
        </div>
        <button class="topo-icon-btn" onclick="App.topologyRefresh()" title="刷新">↻</button>
      </div>
      <div class="topo-main-row">
        <div class="topo-canvas-col">
          <div class="topo-stage">
            <div id="topo-network-view" class="topo-view active">
              <div id="topology-canvas" class="topology-canvas"></div>
            </div>
            <div id="topo-path-view" class="topo-view" style="display:none;">
              <div class="topo-path-content" id="topo-path-content"></div>
            </div>
          </div>
          <div id="topo-guide" class="topo-guide">
            <span class="topo-guide-icon">⌖</span>
            <div class="topo-guide-text">
              <strong>提示：</strong>点击节点查看详情并聚焦其前后置关联 · 拖拽平移 · 滚轮缩放 · 右上角可切换 <b>完整总览 / 聚焦关联</b> 模式
            </div>
          </div>
        </div>
        <div class="topo-drawer-col">
          <div id="topology-detail" class="topo-detail-panel tp-drawer-collapsed"></div>
        </div>
      </div>
    `;
    return view;
  };

App._tpUpdateCollapsedHint = function _tpUpdateCollapsedHint() {
    // 收起态时把节点数注入 collapsed 图标 data-count（用于徽标）
    const box = document.getElementById('topology-detail');
    if (!box) return;
    if (this._tpGraphData) {
      const cnt = this._tpGraphData.nodes.length;
      const icon = box.querySelector('.tp-collapsed-icon');
      if (icon) icon.setAttribute('data-count', String(cnt));
    }
  };

App.topoStudy = function topoStudy(nodeId) {
    // 【开始学习】跳转知识体系并定位该知识点
    // 1) 先读取该节点绑定的知识体系目录位置（chapterId / sectionId）——必须在销毁前读取
    let chapterId = '', sectionId = '';
    if (this._tpGraphData) {
      const node = this._tpGraphData.nodes.find(n => n.id === nodeId);
      if (node) { chapterId = node.chapterId || ''; sectionId = node.sectionId || ''; }
    }
    // 2) 关闭右侧抽屉 + 完整卸载拓扑图谱（卸载会清空 _tpGraphData）
    this.topologyClosePanel();
    this.topologyDestroy();
    // 3) 页面内路由跳转（方案A：不新开标签页），携带定位参数
    if (chapterId && sectionId) {
      const params = new URLSearchParams({ chapterId, sectionId, knowledgeId: nodeId || '' });
      try { history.pushState({}, '', '?' + params.toString()); } catch (e) {}
    }
    // 4) 切到知识体系页；切页后统一由 _applyKnowledgeLocate 执行展开/定位/高亮
    if (typeof this.switchView === 'function') this.switchView('knowledge');
  };
App.topoPractice = function topoPractice(nodeId) {
    // 跳转前完整卸载拓扑图谱
    this.topologyClosePanel();
    this.topologyDestroy();
    if (typeof this.switchView === 'function') this.switchView('quiz');
  };

App.topologyRefresh = function topologyRefresh() {
    // 刷新：重新构建图表（重置布局）
    if (!this._tpInited) { this.renderTopology(); return; }
    this._tpGraphData = this._tpFullData();
    this._tpRenderNetwork();
  };

App.topologyReset = function topologyReset() {
    // 重置视图位置：缩放回 1.0 并居中
    if (this._tpChart) {
      this._tpChart.dispatchAction({ type: 'graphRoam', zoom: 1.0 });
    }
    this._tpFocusedCluster = null;
    this.topologyClosePanel();
  };

App.topologySearch = function topologySearch(kw, confirm = false) {
    kw = (kw || '').trim();
    const chart = this._tpChart;
    const data = this._tpGraphData;
    if (!chart || !data) return;
    if (!kw) {
      // 清空搜索：恢复所有节点
      chart.setOption({ series: [{ data: data.nodes.map(n => ({
        ...n,
        itemStyle: { ...n.itemStyle, opacity: 1 },
        label: { ...n.label, show: true }
      }))}]});
      return;
    }
    // 过滤：匹配名称或 id(先精确,再尝试去掉"的/了/与/和/或"等虚词做宽松匹配)
    const norm = (s) => String(s || '').replace(/[的了与和或及、，,。]/g, '');
    let matched = data.nodes.filter(n => n.name.includes(kw) || (n.id || '').includes(kw));
    if (matched.length === 0) {
      matched = data.nodes.filter(n => norm(n.name).includes(norm(kw)));
    }
    if (confirm && matched.length === 0) {
      if (this._adminToast) this._adminToast('🔍 未找到匹配的知识点："' + kw + '"', 'warn');
      return;
    }
    if (confirm && matched.length === 1) {
      // ── 回车确认且唯一命中:自动聚焦定位(居中 + 点击节点逻辑) ──
      this._tpSelectNode(matched[0].id);
      // 画布平移缩放把目标节点居中(force 布局需等待渲染后)
      setTimeout(() => {
        if (this._tpChart) {
          try {
            const series = this._tpChart.getOption().series[0];
            const idx = series.data.findIndex(d => d.id === matched[0].id);
            if (idx >= 0) this._tpChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
          } catch (e) {}
        }
      }, 400);
      return;
    }
    if (confirm && matched.length > 1) {
      // 多命中:定位第一个 + 提示
      if (this._adminToast) this._adminToast('🔍 匹配到 ' + matched.length + ' 个知识点，已定位第一个，输入更精确名称可精确聚焦', 'info');
      this._tpSelectNode(matched[0].id);
      setTimeout(() => {
        if (this._tpChart) {
          try {
            const series = this._tpChart.getOption().series[0];
            const idx = series.data.findIndex(d => d.id === matched[0].id);
            if (idx >= 0) this._tpChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
          } catch (e) {}
        }
      }, 400);
      return;
    }
    // 输入过程:模糊高亮
    chart.setOption({
      series: [{ data: data.nodes.map(n => {
        const hit = matched.some(m => m.id === n.id);
        return {
          ...n,
          itemStyle: { ...n.itemStyle, opacity: hit ? 1 : 0.12 },
          label: { ...n.label, show: hit }
        };
      })}]
    });
    if (matched.length > 0) {
      const idx = data.nodes.findIndex(n => n.id === matched[0].id);
      if (idx >= 0) chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
    }
  };

App._switchTopoTab = function _switchTopoTab(tab) {
    this._tpCurrentTab = tab;
    document.querySelectorAll('.topo-tab').forEach(t => t.classList.toggle('active', t.dataset.view === tab));
    const nv = document.getElementById('topo-network-view');
    const pv = document.getElementById('topo-path-view');
    if (nv) nv.style.display = tab === 'network' ? 'flex' : 'none';
    if (pv) pv.style.display = tab === 'path' ? 'flex' : 'none';
    if (tab === 'network') this._tpResizeChart();
    if (tab === 'path') {
      // 渲染学习路径（若尚未）
      const box = document.getElementById('topo-path-content');
      if (box && !box.innerHTML) this._tpRenderPathView();
    }
  };

App._tpRenderPathView = function _tpRenderPathView() {
    const box = document.getElementById('topo-path-content');
    if (!box || !this._tpGraphData) return;
    const data = this._tpGraphData;
    // 按学习顺序分组（模块顺序：矩阵 → 向量空间 → 线性方程组）
    const order = ['矩阵', '向量空间', '线性方程组'];
    const groups = order.map(m => ({
      module: m,
      nodes: data.nodes.filter(n => n.module === m)
    })).filter(g => g.nodes.length > 0);

    box.innerHTML = `
      <div class="topo-path-head">
        <div class="topo-path-head-title">🛤️ 智能学习路径</div>
        <div class="topo-path-head-sub">基于掌握度与前置关系生成的学习顺序 · ${data.nodes.length} 个知识点</div>
      </div>
      <div class="topo-path-list">
        ${groups.map((g, gi) => `
          <div class="topo-path-module">
            <div class="topo-path-module-title">STEP ${gi + 1} · ${g.module}</div>
            ${g.nodes.map((n, ni) => {
              const pct = Math.round(n.mastery * 100);
              return `
              <div class="topo-path-kp" onclick="App._tpPathNodeClick('${n.id}')">
                <div class="topo-path-kp-step">${gi + 1}.${ni + 1}</div>
                <div class="topo-path-kp-main">
                  <div class="topo-path-kp-name">${n.name}</div>
                  <div class="topo-path-kp-meta">考频 ${Math.round(n.freq * 100)}%</div>
                </div>
                <div class="topo-path-kp-mastery">
                  <div class="topo-path-kp-bar"><i style="width:${pct}%;background:${this._tpMasteryColor(n.mastery)}"></i></div>
                  <span class="topo-path-kp-pct" style="color:${this._tpMasteryColor(n.mastery)}">${pct}%</span>
                </div>
              </div>`;
            }).join('')}
          </div>`).join('')}
      </div>`;
  };

App._tpPathNodeClick = function _tpPathNodeClick(nodeId) {
    // 切回网络视图并选中该节点
    this._switchTopoTab('network');
    setTimeout(() => this._tpSelectNode(nodeId), 200);
  };

  // ============ 兼容旧 API ============
App._drawTopologyLinks = function _drawTopologyLinks() {};
App.topologySelect = function topologySelect() { this.renderTopology(); };


App.toggleChapter = function toggleChapter(chId) {
    const el = document.getElementById(`sections-${chId}`);
    const arrow = document.querySelector(`[data-chapter="${chId}"] .chapter-arrow`);
    if (!el || !arrow) return;
    if (this.isMobile) {
      // 移动端:切换章节 open class,箭头方向由 CSS ::after 绘制控制
      const item = document.querySelector(`[data-chapter="${chId}"]`);
      const open = el.style.display !== 'none';
      el.style.display = open ? 'none' : 'block';
      if (item) item.classList.toggle('open', !open);
      return;
    }
    // PC 端:原逻辑完全不变(文本箭头 ▼/▶ 切换)
    if (el.style.display === 'none' || !el.style.display) {
      el.style.display = 'block';
      arrow.textContent = '▼';
    } else {
      el.style.display = 'none';
      arrow.textContent = '▶';
    }
  };

  /**
   * 知识体系定位：读取 URL 参数（?chapterId&sectionId&knowledgeId），
   * 自动展开一级章节 → 展开二级大节 → 平滑滚动居中 → 高亮选中（与手动点击完全一致）。
   * 无参数/参数无效 → 静默走默认页；ID 不存在 → 友好提示并回知识体系首页。
   */
App._applyKnowledgeLocate = function _applyKnowledgeLocate() {
    const params = new URLSearchParams(location.search);
    const chapterId = params.get('chapterId');
    const sectionId = params.get('sectionId');
    const knowledgeId = params.get('knowledgeId');
    if (!chapterId || !sectionId) return;  // 无参数：默认页面

    // ① 校验一级章节是否存在
    const chapterEl = document.querySelector(`[data-chapter="${chapterId}"]`);
    if (!chapterEl) { this._locateFail(knowledgeId); return; }
    // ② 校验二级大节是否存在
    const secEl = document.querySelector(`[onclick="App.showSection('${sectionId}')"]`);
    if (!secEl) { this._locateFail(knowledgeId); return; }

    // ③ 展开一级章节折叠面板（收起状态必须展开，保证用户能看到目标）
    const sectionsEl = document.getElementById(`sections-${chapterId}`);
    if (sectionsEl && (sectionsEl.style.display === 'none' || !sectionsEl.style.display)) {
      sectionsEl.style.display = 'block';
      const arrow = chapterEl.querySelector('.chapter-arrow');
      if (arrow) arrow.textContent = '▼';
    }
    // ④ 清除其它高亮，展示目标二级大节详情（showSection 内部会自动给目标加 active，与手动点击一致）
    document.querySelectorAll('.section-item').forEach(el => el.classList.remove('active'));
    if (typeof this.showSection === 'function') this.showSection(sectionId);
    // ⑤ 平滑滚动把目标知识点定位到可视区居中
    setTimeout(() => {
      try { secEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { secEl.scrollIntoView(); }
    }, 160);
    // 定位完成 → 清理 URL 参数，避免刷新/分享时重复触发
    setTimeout(() => {
      try { history.replaceState({}, '', location.pathname); } catch (e) {}
    }, 900);
  };

  /** 定位失败：友好提示 + 清除高亮 + 回到知识体系默认页 */
App._locateFail = function _locateFail(knowledgeId) {
    try { history.replaceState({}, '', location.pathname); } catch (e) {}
    document.querySelectorAll('.section-item').forEach(el => el.classList.remove('active'));
    if (this._adminToast) {
      this._adminToast('📚 未找到该知识点，已回到知识体系首页', 'warn');
    }
  };

App.closeSection = function closeSection() {
    // 返回章节目录：清空详情 + 重置侧栏激活态
    const content = document.getElementById('knowledge-content');
    if (content) {
      content.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-tertiary);">
          <div style="font-size: 48px; margin-bottom: 16px;">📖</div>
          <h2 style="font-size: 18px; margin-bottom: 8px;">线性代数知识体系</h2>
          <p>从左侧选择章节和知识点开始学习</p>
          <p style="margin-top: 20px; font-size: 13px;">
            涵盖行列式、矩阵、向量与线性方程组、特征值与特征向量、二次型、向量空间等全部核心内容
          </p>
        </div>`;
    }
    document.querySelectorAll('.section-item').forEach(el => el.classList.remove('active'));
    // 展开所有章节
    document.querySelectorAll('[id^="sections-"]').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.chapter-arrow').forEach(el => el.textContent = '▼');
  };

  /** 移动端:打开知识库/拓扑图谱的左侧抽屉(章节导航) */
App.openKnowledgeSidebar = function openKnowledgeSidebar() {
    document.body.classList.add('kb-drawer-open');
    this._lockBodyScroll(true);
    // 自动聚焦第一个章节以便键盘可达
    setTimeout(() => {
      const first = document.querySelector('#knowledge-nav .chapter-header');
      if (first && first.getAttribute('tabindex') !== '-1') {
        first.setAttribute('tabindex', '0');
      }
    }, 80);
  };
App.closeKnowledgeSidebar = function closeKnowledgeSidebar() {
    document.body.classList.remove('kb-drawer-open');
    this._lockBodyScroll(false);
  };
  /** 移动端:知识库/拓扑图谱抽屉开关(供节点详情 sheet 关闭按钮复用) */
App.toggleKnowledgeSidebar = function toggleKnowledgeSidebar() {
    if (document.body.classList.contains('kb-drawer-open')) this.closeKnowledgeSidebar();
    else this.openKnowledgeSidebar();
  };
  /** 底层:禁止/恢复 body 滚动(抽屉打开时锁底) */
App._lockBodyScroll = function _lockBodyScroll(lock) {
    if (lock) {
      // 保存当前滚动位置,避免恢复时跳到顶部
      if (!document.body.dataset.scrollLock) {
        document.body.dataset.scrollLock = String(window.scrollY || document.documentElement.scrollTop || 0);
        document.body.dataset.lockOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '-' + document.body.dataset.scrollLock + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
      }
    } else {
      if (document.body.dataset.scrollLock !== undefined) {
        const y = parseInt(document.body.dataset.scrollLock || '0', 10);
        document.body.style.overflow = document.body.dataset.lockOverflow || '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        delete document.body.dataset.scrollLock;
        delete document.body.dataset.lockOverflow;
        window.scrollTo(0, y);
      }
    }
  };

App.showSection = function showSection(sectionId) {
    const section = KnowledgeBase.getSection(sectionId);
    if (!section) return;

    document.querySelectorAll('.section-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[onclick="App.showSection('${sectionId}')"]`)?.classList.add('active');

    // 移动端:点击章节后自动关闭抽屉(让主内容直接可见)
    if (this.isMobile && document.body.classList.contains('kb-drawer-open')) {
      this.closeKnowledgeSidebar();
    }

    const content = document.getElementById('knowledge-content');
    // v=20260908f 移动端阅读体验:板块分卡 + 步骤横滑 + 关键定理高亮
    // PC 端走原 markdownToHtml,移动端用专门的_enrichKnowledgeForMobile 重渲染
    const _isMobile = document.body.classList.contains('mobile-mode');
    const _enrichedContentHtml = _isMobile
      ? this._renderKnowledgeForMobile(section)
      : this.markdownToHtml(section.content);
    let html = `
      <div class="knowledge-detail">
        <button class="knowledge-detail-close" onclick="App.closeSection()" title="返回章节目录">×</button>
        <div class="knowledge-breadcrumb">${section.chapter} › ${section.title}</div>
        <h2 class="knowledge-title">${section.title}</h2>
        <p class="knowledge-summary">${section.summary}</p>
        <div class="knowledge-content-body">${_enrichedContentHtml}</div>
    `;

    // v=20260909p 公式/例题/误区 LaTeX 自动包裹定界符(避免源码泄漏),同时 XSS 转义
    if (section.formulas && section.formulas.length > 0) {
      html += `<div class="ks-block ks-block-formula">
        <div class="ks-block-head"><span class="ks-block-icon">📐</span><span class="ks-block-title">关键公式</span><span class="ks-block-count">${section.formulas.length} 条</span></div>
        <ul class="ks-formula-list">`;
      section.formulas.forEach((f, i) => {
        html += `<li class="ks-formula-item"><span class="ks-formula-idx">${i + 1}</span><span class="ks-formula-text">${this._wrapLatexDelimiters(this.escapeHtml(f))}</span></li>`;
      });
      html += `</ul></div>`;
    }

    if (section.examples && section.examples.length > 0) {
      html += `<div class="ks-block ks-block-example">
        <div class="ks-block-head"><span class="ks-block-icon">💡</span><span class="ks-block-title">典型例题</span><span class="ks-block-count">${section.examples.length} 题</span></div>`;
      section.examples.forEach((ex, i) => {
        html += `<div class="ks-example">
          <div class="ks-example-q"><strong>例 ${i + 1}：</strong>${this._wrapLatexDelimiters(this.escapeHtml(ex.q))}</div>
          <div class="ks-example-a"><strong>解：</strong>${this._wrapLatexDelimiters(this.escapeHtml(ex.a))}</div>
        </div>`;
      });
      html += `</div>`;
    }

    if (section.pitfalls && section.pitfalls.length > 0) {
      html += `<div class="ks-block ks-block-pitfall">
        <div class="ks-block-head"><span class="ks-block-icon">⚠️</span><span class="ks-block-title">常见误区</span><span class="ks-block-count">${section.pitfalls.length} 项</span></div>
        <ul class="ks-pitfall-list">`;
      section.pitfalls.forEach(p => {
        html += `<li>${this._wrapLatexDelimiters(this.escapeHtml(p))}</li>`;
      });
      html += `</ul></div>`;
    }

    html += `<div class="knowledge-actions">
      <button class="action-btn" onclick="App.askInChat('${section.title}')">💬 在对话中讨论</button>
      <button class="action-btn textbook-btn" onclick="App.openTextbookForSection('${section.id}')">📖 在教材中查看</button>
    </div>`;

    html += `</div>`;
    content.innerHTML = html;
    // v=20260909k 修复:showSection 未调用 renderLatexInElement,导致详情页所有 .latex-formula 占位
    // 不被 KaTeX 渲染,移动端/PC 端都只显示原始源码(如 \begin{pmatrix} 行列式)。
    // renderLatexInElement 同时处理 .latex-formula 占位 + 扫剩余 $...$ 裸公式,幂等可重复调用。
    try { this.renderLatexInElement(content); } catch (e) { console.warn('knowledge LaTeX render fail:', e); }
  };

  /**
   * v=20260908f 移动端知识详情阅读体验增强
   * 直接按 ### 子标题切分源 markdown 文本,逐段渲染为独立 .kb-section-card,
   * 把每段中的 1. 2. 3. 编号列表转换为横向滚动 .kb-step-card 容器
   * 避免依赖 markdownToHtml 内部的 _splitStepBlocks 流程(它有 h3 内嵌 step-block 的 pre-existing bug)
   */
App._renderKnowledgeForMobile = function _renderKnowledgeForMobile(section) {
    if (!section || !section.content) return '';
    const md = String(section.content || '').trim();
    // 按 ### 子标题分组; ## 顶级标题跳过(已在 knowledge-title 显示)
    // 如果整段没有 ### 板块,把整段放入一个匿名板块(title 为空)
    const lines = md.split('\n');
    const sections = [];   // [{title, body}]
    let current = null;
    for (const line of lines) {
      if (/^###\s+/.test(line)) {
        if (current) sections.push(current);
        current = { title: line.replace(/^###\s+/, '').trim(), body: '' };
      } else if (/^##\s+/.test(line)) {
        // 顶级 ## 标题:跳过(由 knowledge-title 渲染)
      } else if (current) {
        current.body += (current.body ? '\n' : '') + line;
      } else if (line.trim() !== '') {
        // 没有 ### 板块前,先遇到普通内容:建一个匿名板块承载(避免和顶部 H2 重复)
        current = { title: '', body: line };
      }
    }
    if (current) sections.push(current);

    // 兜底防御
    if (sections.length === 0) {
      sections.push({ title: '', body: md });
    }

    // 关键定理文字高亮
    const HIGHLIGHT = ['有非零解','只有零解','无解','有唯一解','有无穷多解','解空间','基础解系','通解','特解','r(A)','r(A|b)'];
    const highlight = (txt) => {
      let out = String(txt || '');
      HIGHLIGHT.forEach(kw => {
        const re = new RegExp(`(?<![>"\\w])${kw.replace(/[()|]/g, '\\$&')}(?![^<]*>)`, 'g');
        out = out.replace(re, `<span class="kb-keyword">${kw}</span>`);
      });
      return out;
    };

    // 渲染单个板块(把 body 中的 1.2.3.4 编号列表转换为 .kb-step-scroll)
    const renderBody = (body) => {
      // 保护 LaTeX 公式:行内 $...$ 与块级 $$...$$
      const latexBlocks = [];
      let s = body;
      s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, f) => {
        const i = latexBlocks.length;
        latexBlocks.push({ display: true, formula: f.replace(/\$/g, '').trim() });
        return `@@LATEX${i}@@`;
      });
      s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, f) => {
        const i = latexBlocks.length;
        latexBlocks.push({ display: true, formula: f.replace(/\$/g, '').trim() });
        return `@@LATEX${i}@@`;
      });
      s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, f) => {
        const i = latexBlocks.length;
        latexBlocks.push({ display: false, formula: f.replace(/\$/g, '').trim() });
        return `@@LATEX${i}@@`;
      });
      s = s.replace(/\$([^$\n]+?)\$/g, (m, f) => {
        const i = latexBlocks.length;
        latexBlocks.push({ display: false, formula: f.replace(/\$/g, '').trim() });
        return `@@LATEX${i}@@`;
      });

      // 用 escapeHtml 保护 HTML 注入
      s = this.escapeHtml(s);

      // 还原 LaTeX 占位 → <span class="latex-formula">
      s = s.replace(/@@LATEX(\d+)@@/g, (m, idx) => {
        const it = latexBlocks[parseInt(idx)];
        if (!it) return m;
        return `<span class="latex-formula" data-display="${it.display}" data-formula="${this.escapeHtml(it.formula)}">${this.escapeHtml(it.formula)}</span>`;
      });

      // 粗体 / 行内代码
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

      // 行级处理:把连续 1./2./3. 编号行聚合为 step-scroll
      const lines = s.split('\n');
      const out = [];
      let i = 0;
      while (i < lines.length) {
        const ln = lines[i];
        // 检测编号行
        if (/^\d+\.\s+/.test(ln)) {
          // 收集连续编号行
          const items = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
            const m = lines[i].match(/^(\d+)\.\s+(.*)/);
            items.push({ num: m[1], text: m[2] });
            i++;
          }
          if (items.length >= 2) {
            const cards = items.map(it => `<div class="kb-step-card"><span class="kb-step-num">${it.num}</span><div class="kb-step-text">${highlight(it.text)}</div></div>`).join('');
            const dots = items.map((_, j) => `<span class="kb-step-dot${j === 0 ? ' active' : ''}"></span>`).join('');
            out.push(`<div class="kb-step-scroll">${cards}</div><div class="kb-step-dots">${dots}</div>`);
          } else {
            // 单个编号行也转卡片(用占位 1)
            const cards = `<div class="kb-step-card"><span class="kb-step-num">${items[0].num}</span><div class="kb-step-text">${highlight(items[0].text)}</div></div>`;
            out.push(`<div class="kb-step-scroll">${cards}</div><div class="kb-step-dots"><span class="kb-step-dot active"></span></div>`);
          }
          continue;
        }
        // 检测 - 列表
        if (/^\-\s+/.test(ln)) {
          const items = [];
          while (i < lines.length && /^\-\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\-\s+/, ''));
            i++;
          }
          out.push(`<ul>${items.map(t => `<li>${highlight(t)}</li>`).join('')}</ul>`);
          continue;
        }
        // 空行作为段分隔
        if (ln.trim() === '') {
          i++;
          continue;
        }
        // 普通行,收集直到空行/列表起始
        const buf = [];
        while (i < lines.length && lines[i].trim() !== '' && !/^\d+\.\s+/.test(lines[i]) && !/^\-\s+/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        const block = buf.join(' ').trim();
        if (block) {
          // 包含 LaTeX 的不强加 <p>
          if (block.startsWith('<span class="latex-formula"') || block.startsWith('@@LATEX')) {
            out.push(block);
          } else {
            out.push(`<p>${highlight(block)}</p>`);
          }
        }
      }
      return out.join('\n');
    };

    // 组装所有板块(title 为空时省略 H3,避免和顶部 H2 重复)
    const sectionCards = sections.map(sec => {
      const bodyHtml = renderBody(sec.body);
      const titleHtml = sec.title ? `<h3>${this.escapeHtml(sec.title)}</h3><div class="kb-section-divider"></div>` : '';
      return `<div class="kb-section-card">${titleHtml}<div class="kb-section-body">${bodyHtml}</div></div>`;
    }).join('');

    // 绑定横滑指示点
    requestAnimationFrame(() => {
      document.querySelectorAll('.kb-step-scroll').forEach((scroller) => {
        if (scroller._kbDotsBound) return;
        scroller._kbDotsBound = true;
        const dots = scroller.parentElement?.querySelectorAll?.('.kb-step-dot') || [];
        if (!dots.length) return;
        const cardWidth = () => scroller.clientWidth * 0.75 + 10;
        const updateDots = () => {
          const i = Math.max(0, Math.min(dots.length - 1, Math.round(scroller.scrollLeft / cardWidth())));
          dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        };
        scroller.addEventListener('scroll', updateDots, { passive: true });
        updateDots();
      });
    });

    return sectionCards;
  };

App.askInChat = function askInChat(topic) {
    this.switchView('chat');
    document.getElementById('chat-input').value = `请详细讲解${topic}`;
    this.sendMessage();
  };

  // ============ 矩阵编辑器模块 ============

App.renderMatrixEditor = function renderMatrixEditor(which) {
    const state = which === 'a' ? this.matrixA : this.matrixB;
    const grid = document.getElementById(`matrix-${which}-grid`);
    if (!grid) return;

    grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    grid.innerHTML = '';

    for (let i = 0; i < state.rows; i++) {
      for (let j = 0; j < state.cols; j++) {
        const cell = document.createElement('input');
        // v=20260905 type=number 在中间态(如"1.3-")会清空 value 导致输入丢失,改用 text+inputmode=decimal,
        // 配合 keydown 拦截 + input 清洗实现严格数字输入(移动端仍弹数字键盘)
        cell.type = 'text';
        cell.inputMode = 'decimal';
        cell.className = 'matrix-cell';
        cell.step = 'any';
        cell.value = state.data[i] && state.data[i][j] !== undefined ? state.data[i][j] : 0;
        cell.dataset.row = i;
        cell.dataset.col = j;
        cell.dataset.matrix = which;

        // v=20260905 矩阵输入键盘导航 + 字符过滤(数字/正负号/小数)
        cell.addEventListener('keydown', (e) => this.handleCellKeydown(e, which));
        cell.addEventListener('input', (e) => this._filterCellInput(e, which));
        // 清除空值高亮:用户开始编辑时去掉警示边框(初始 focus 不擦除,以保留 toast 指引)
        cell.addEventListener('input', () => cell.classList.remove('cell-empty-highlight'));

        grid.appendChild(cell);
      }
    }

    // 更新维度显示
    document.getElementById(`matrix-${which}-rows`).textContent = state.rows;
    document.getElementById(`matrix-${which}-cols`).textContent = state.cols;

    // 更新维度按钮状态
    this.updateDimButtons(which);
  };

App.updateDimButtons = function updateDimButtons(which) {
    const state = which === 'a' ? this.matrixA : this.matrixB;
    document.querySelectorAll(`.dim-btn`).forEach(btn => {
      // 通过onclick判断属于哪个矩阵
    });
  };

  /** v=20260905 矩阵输入字符过滤:只允许数字/小数点/正负号;非法字符拦截(PC 启用) */
App._filterCellInput = function _filterCellInput(e, which) {
    const cell = e.target;
    let v = cell.value;
    // 去掉非数字/小数点/负号字符(防御性清洗 + 校正负号位置)
    let cleaned = v.replace(/[^0-9.\-]/g, '');
    // 保留首个负号在最前,其他负号删除
    cleaned = cleaned.replace(/-(?!^)/g, '');
    // 保留首个小数点,其他删除
    const dotIdx = cleaned.indexOf('.');
    if (dotIdx >= 0) {
      cleaned = cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, '');
    }
    // type=number 浏览器对非法值会清空 cell.value;v 已失真,直接用 cleaned 写回
    if (cleaned !== cell.value) cell.value = cleaned;
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    const state = which === 'a' ? this.matrixA : this.matrixB;
    const val = cleaned === '' || cleaned === '-' || cleaned === '.' ? '' : parseFloat(cleaned);
    if (!state.data[r]) state.data[r] = [];
    state.data[r][c] = isNaN(val) ? 0 : val;
  };

  /** v=20260905 矩阵输入键盘导航:Enter/Home/End/PageUp/PageDown/方向键;PC 启用,移动端不启用 */
App.handleCellKeydown = function handleCellKeydown(e, which) {
    // v=20260905 移动端不启用键盘快捷键逻辑(无物理键盘)
    if (this.isMobile) return;
    const cell = e.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const state = which === 'a' ? this.matrixA : this.matrixB;
    const grid = document.getElementById(`matrix-${which}-grid`);

    // v=20260905 keydown 拦截非法字符:只允许数字/小数点/负号/退格/导航键等,其余 preventDefault
    if (e.key.length === 1) {  // 单字符键(非导航/控制键)
      if (!/[0-9.\-]/.test(e.key)) {
        e.preventDefault();
        return;
      }
      // 负号限制:只能在第一位
      if (e.key === '-' && (cell.selectionStart || 0) > 0) {
        e.preventDefault();
        return;
      }
      // 小数点限制:只能有一个
      if (e.key === '.' && cell.value.includes('.')) {
        e.preventDefault();
        return;
      }
    }

    // 工具函数:跳到指定行/列(若越界则保持当前焦点不动)
    const gotoCell = (r, c) => {
      if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
      const next = grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
      if (next) { e.preventDefault(); next.focus(); }
    };

    switch (e.key) {
      case 'Enter': {
        e.preventDefault();
        // 行末尾 → 下一行第一个;中间 → 同行下一格;最后一格不动
        const isRowEnd = col === state.cols - 1;
        if (!isRowEnd) gotoCell(row, col + 1);
        else if (row < state.rows - 1) gotoCell(row + 1, 0);
        // 最后一格:什么都不做(保持当前焦点)
        break;
      }
      case 'Home': e.preventDefault(); gotoCell(row, 0); break;
      case 'End':  e.preventDefault(); gotoCell(row, state.cols - 1); break;
      case 'PageUp':   e.preventDefault(); gotoCell(row - 1, col); break;
      case 'PageDown': e.preventDefault(); gotoCell(row + 1, col); break;
      case 'ArrowLeft':  e.preventDefault(); gotoCell(row, col - 1); break;
      case 'ArrowRight': e.preventDefault(); gotoCell(row, col + 1); break;
      case 'ArrowUp':    e.preventDefault(); gotoCell(row - 1, col); break;
      case 'ArrowDown':  e.preventDefault(); gotoCell(row + 1, col); break;
      default:
        // Ctrl + → 加列 / Ctrl + ↓ 加行(原逻辑保留)
        if (e.ctrlKey && e.key === 'ArrowRight' && col === state.cols - 1) {
          e.preventDefault(); this.changeDim(which, 'cols', 1);
        } else if (e.ctrlKey && e.key === 'ArrowDown' && row === state.rows - 1) {
          e.preventDefault(); this.changeDim(which, 'rows', 1);
        }
        break;
    }
  };

App.changeDim = function changeDim(which, dim, delta) {
    const state = which === 'a' ? this.matrixA : this.matrixB;
    const newVal = state[dim] + delta;

    // 限制范围
    if (newVal < 1 || newVal > 8) return;

    state[dim] = newVal;

    // 调整数据数组
    if (dim === 'rows') {
      if (delta > 0) {
        // 添加行
        const newRow = new Array(state.cols).fill(0);
        state.data.push(newRow);
      } else {
        // 删除行
        state.data.pop();
      }
    } else {
      if (delta > 0) {
        // 添加列
        state.data.forEach(row => row.push(0));
      } else {
        // 删除列
        state.data.forEach(row => row.pop());
      }
    }

    this.renderMatrixEditor(which);
  };

App.getMatrix = function getMatrix(which) {
    const state = which === 'a' ? this.matrixA : this.matrixB;
    // 确保数据完整
    const data = [];
    for (let i = 0; i < state.rows; i++) {
      const row = [];
      for (let j = 0; j < state.cols; j++) {
        row.push(state.data[i] && state.data[i][j] !== undefined ? state.data[i][j] : 0);
      }
      data.push(row);
    }
    return data;
  };

App.setMatrixData = function setMatrixData(which, data) {
    const state = which === 'a' ? this.matrixA : this.matrixB;
    state.rows = data.length;
    state.cols = data[0].length;
    state.data = data.map(r => [...r]);
    this.renderMatrixEditor(which);
  };

App.clearMatrix = function clearMatrix() {
    const state = this.matrixA;
    state.data = state.data.map(row => row.map(() => 0));
    this.renderMatrixEditor('a');
    document.getElementById('result-card').style.display = 'none';
    document.getElementById('tool-placeholder-card').style.display = 'block';
  };

App.loadExample = function loadExample(type) {
    const examples = {
      identity: { data: [[1,0,0],[0,1,0],[0,0,1]], b: null },
      diag: { data: [[2,0,0],[0,3,0],[0,0,5]], b: null },
      singular: { data: [[1,2,3],[2,4,6],[1,1,1]], b: null },
      symmetric: { data: [[2,1,0],[1,2,1],[0,1,2]], b: null },
      rotation: { data: [[Math.cos(Math.PI/3).toFixed(4)*1, -Math.sin(Math.PI/3).toFixed(4)*1],[Math.sin(Math.PI/3).toFixed(4)*1, Math.cos(Math.PI/3).toFixed(4)*1]], b: null },
      eigen: { data: [[4,1,0],[1,4,1],[0,1,4]], b: null },
      system: { data: [[1,1,6],[2,-1,0]] }
    };

    // 特殊处理旋转矩阵
    if (type === 'rotation') {
      const rad = Math.PI / 3;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      this.setMatrixData('a', [[parseFloat(c.toFixed(4)), parseFloat((-s).toFixed(4))],[parseFloat(s.toFixed(4)), parseFloat(c.toFixed(4))]]);
    } else if (examples[type]) {
      this.setMatrixData('a', examples[type].data);
    }
  };

  // ============ 计算工具执行 ============

App.executeTool = function executeTool(tool) {
    const needsB = document.querySelector(`[data-tool="${tool}"]`)?.dataset.needs === 'b';
    if (needsB) {
      document.getElementById('matrix-b-section').style.display = 'block';
    }

    // v=20260905 空单元格校验:遍历矩阵 A/B 全部格子,空值时阻止计算 + toast + 高亮
    const checkEmpty = (which) => {
      const empties = document.querySelectorAll(`.matrix-cell[data-matrix="${which}"]:placeholder-shown`);
      // 上面选 placeholder-shown 不可靠(数值 input 无 placeholder),用 value==='' 兜底
      const trulyEmpty = Array.from(empties).length
        ? Array.from(empties)
        : Array.from(document.querySelectorAll(`.matrix-cell[data-matrix="${which}"]`)).filter(c => c.value === '' || c.value === null);
      if (trulyEmpty.length) {
        trulyEmpty.forEach(c => c.classList.add('cell-empty-highlight'));
        return true;
      }
      return false;
    };
    // 先清掉所有高亮(避免旧高亮残留)
    document.querySelectorAll('.cell-empty-highlight').forEach(c => c.classList.remove('cell-empty-highlight'));
    if (checkEmpty('a') || (needsB && checkEmpty('b'))) {
      this._shotToast('矩阵存在未填写的单元格,请补全所有数字后再计算', 'warn');
      // 滚动到第一个空格,聚焦(再次加高亮,防止初始 focus 误擦)+引导用户填写
      const first = document.querySelector('.cell-empty-highlight');
      first?.scrollIntoView({ block: 'nearest' });
      if (first) {
        first.classList.add('cell-empty-highlight');
        first.focus({ preventScroll: true });
      }
      return;
    }

    let resultHtml = '';
    let sourceHtml = '';

    try {
      const A = this.getMatrix('a');
      const B = needsB ? this.getMatrix('b') : null;

      switch(tool) {
        case 'determinant': {
          if (A.length !== A[0].length) throw new Error('行列式只能计算方阵');
          const det = LinAlg.determinant(A);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 行列式结果</div>
              <div class="result-value">|A| = ${LinAlg.fmt(det)}</div>
            </div>`;
          if (Math.abs(det) < SINGULAR_EPS) {
            resultHtml += `<div class="result-item error"><div class="result-label">⚠️ 分析</div>行列式为0，矩阵不可逆，行/列向量线性相关。</div>`;
          } else {
            resultHtml += `<div class="result-item"><div class="result-label">💡 几何意义</div>|det| = ${Math.abs(det).toFixed(4)} 表示线性变换后面积的缩放倍数。</div>`;
          }
          sourceHtml = '知识来源：线性代数教材 · 第一章 行列式 · 行列式的定义与性质';
          break;
        }

        case 'inverse': {
          if (A.length !== A[0].length) throw new Error('只有方阵才可能可逆');
          const det = LinAlg.determinant(A);
          if (Math.abs(det) < SINGULAR_EPS) throw new Error('矩阵不可逆（行列式为0）');
          const inv = LinAlg.inverse(A);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
              <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);">|A| = ${LinAlg.fmt(det)}</div>
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 逆矩阵 A⁻¹</div>
              ${this.renderMatrix(inv)}
            </div>
            <div class="result-item">
              <div class="result-label">💡 公式</div>
              A⁻¹ = (1/|A|) · A* （伴随矩阵法）
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第二章 矩阵 · 逆矩阵';
          break;
        }

        case 'rank': {
          const { matrix: echelon, steps, rank } = LinAlg.rref(A, true);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📋 高斯消元步骤</div>
              <div class="steps-container">
                ${steps.length > 0 ? steps.map((s, i) => `
                  <div class="step-item">
                    <div class="step-number">${i+1}</div>
                    <div class="step-content">
                      <div class="step-desc">${s.desc}</div>
                      <div class="step-matrix">${this.renderMatrix(s.matrix)}</div>
                    </div>
                  </div>
                `).join('') : '<div style="color:var(--text-tertiary);">矩阵已是阶梯形，无需消元</div>'}
              </div>
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 矩阵的秩</div>
              <div class="result-value">r(A) = ${rank}</div>
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第三章 向量与线性方程组 · 矩阵的秩';
          break;
        }

        case 'transpose': {
          const t = LinAlg.transpose(A);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A (${A.length}×${A[0].length})</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 转置矩阵 Aᵀ (${t.length}×${t[0].length})</div>
              ${this.renderMatrix(t)}
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第二章 矩阵 · 矩阵的转置';
          break;
        }

        case 'trace': {
          if (A.length !== A[0].length) throw new Error('迹只能计算方阵');
          const tr = LinAlg.trace(A);
          const diagStr = A.map((row, i) => `a${i+1}${i+1}=${LinAlg.fmt(row[i])}`).join(' + ');
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 矩阵的迹</div>
              <div class="result-value">tr(A) = ${diagStr} = ${LinAlg.fmt(tr)}</div>
              <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">迹 = 主对角线元素之和 = 所有特征值之和</div>
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第四章 特征值与特征向量 · 迹与行列式';
          break;
        }

        case 'eigenvalues': {
          if (A.length !== A[0].length) throw new Error('特征值只对方阵定义');
          if (A.length > 6) throw new Error('矩阵维度过大，建议使用4×4以下矩阵');
          const eigs = LinAlg.eigenvalues(A);
          const tr = LinAlg.trace(A);
          const det = LinAlg.determinant(A);
          const sumEig = eigs.reduce((s, e) => s + (typeof e.value === 'number' ? e.value : 0), 0);
          const prodEig = eigs.reduce((p, e) => p * (typeof e.value === 'number' ? e.value : 1), 1);

          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>`;

          eigs.forEach((eig, i) => {
            const valStr = typeof eig.value === 'number' ? eig.value.toFixed(6) : eig.value;
            resultHtml += `
              <div class="result-item highlight">
                <div class="result-label">✅ 特征值 λ${i+1}</div>
                <div class="result-value">λ${i+1} = ${valStr}</div>
                ${eig.multiplicity > 1 ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">代数重数: ${eig.multiplicity}</div>` : ''}
                ${eig.vectors && eig.vectors.length > 0 ? `
                  <div style="margin-top:10px;font-size:13px;">特征向量:</div>
                  ${eig.vectors.map((v, j) => `<div style="margin-top:4px;font-family:'JetBrains Mono',monospace;">ξ${i+1}${j+1} = [${v.map(x => LinAlg.fmt(x)).join(', ')}]</div>`).join('')}
                  ${eig.multiplicity > 1 ? `<div style="margin-top:6px;font-size:12px;color:${eig.vectors.length < eig.multiplicity ? 'var(--error)' : 'var(--success)'};">几何重数: ${eig.vectors.length} ${eig.vectors.length < eig.multiplicity ? '⚠️ < 几何重数 < 代数重数，不可对角化' : '✅ 可对角化'}</div>` : ''}
                ` : ''}
              </div>`;
          });

          resultHtml += `
            <div class="result-item">
              <div class="result-label">📊 验证</div>
              <div>Σλᵢ = ${sumEig.toFixed(6)} = tr(A) = ${LinAlg.fmt(tr)} ${Math.abs(sumEig - tr) < 1e-4 ? '✓' : '✗'}</div>
              <div>Πλᵢ = ${prodEig.toFixed(6)} = |A| = ${LinAlg.fmt(det)} ${Math.abs(prodEig - det) < 1e-4 ? '✓' : '✗'}</div>
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第四章 特征值与特征向量';
          break;
        }

        case 'adjugate': {
          if (A.length !== A[0].length) throw new Error('伴随矩阵只对方阵定义');
          const adj = LinAlg.adjugate(A);
          const det = LinAlg.determinant(A);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
              <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);">|A| = ${LinAlg.fmt(det)}</div>
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 伴随矩阵 A*</div>
              ${this.renderMatrix(adj)}
            </div>
            <div class="result-item">
              <div class="result-label">💡 关系</div>
              A⁻¹ = (1/|A|) · A* ${Math.abs(det) < SINGULAR_EPS ? '（|A|=0，不可逆）' : `= (1/${LinAlg.fmt(det)}) · A*`}
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第二章 矩阵 · 伴随矩阵与逆矩阵';
          break;
        }

        case 'rref': {
          const { matrix: rrefMat, steps, rank } = LinAlg.rref(A, true);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📋 高斯-约当消元步骤</div>
              <div class="steps-container">
                ${steps.length > 0 ? steps.map((s, i) => `
                  <div class="step-item">
                    <div class="step-number">${i+1}</div>
                    <div class="step-content">
                      <div class="step-desc">${s.desc}</div>
                      <div class="step-matrix">${this.renderMatrix(s.matrix)}</div>
                    </div>
                  </div>
                `).join('') : '<div style="color:var(--text-tertiary);">矩阵已是最简形</div>'}
              </div>
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 行最简形 RREF</div>
              ${this.renderMatrix(rrefMat)}
              <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);">秩 r(A) = ${rank}</div>
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第三章 向量与线性方程组 · 初等变换';
          break;
        }

        case 'lu': {
          if (A.length !== A[0].length) throw new Error('LU分解只能对方阵进行');
          const { L, U, P, steps } = LinAlg.luDecomposition(A);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📋 LU分解步骤</div>
              <div class="steps-container">
                ${steps.map((s, i) => `
                  <div class="step-item">
                    <div class="step-number">${i+1}</div>
                    <div class="step-content">
                      <div class="step-desc">${s.desc}</div>
                      <div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">L:</div>
                      <div class="step-matrix">${this.renderMatrix(s.L)}</div>
                      <div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">U:</div>
                      <div class="step-matrix">${this.renderMatrix(s.U)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 下三角矩阵 L</div>
              ${this.renderMatrix(L)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 上三角矩阵 U</div>
              ${this.renderMatrix(U)}
            </div>
            <div class="result-item">
              <div class="result-label">💡 验证</div>
              PA = LU，其中P为置换矩阵
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 数值线性代数 · LU分解';
          break;
        }

        case 'qr': {
          if (A.length !== A[0].length) throw new Error('QR分解建议对方阵进行');
          const { Q, R } = LinAlg.qrDecompose(A);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 正交矩阵 Q</div>
              ${this.renderMatrix(Q)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 上三角矩阵 R</div>
              ${this.renderMatrix(R)}
            </div>
            <div class="result-item">
              <div class="result-label">💡 关系</div>
              A = QR，Q的列为正交单位向量
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · Gram-Schmidt正交化 · QR分解';
          break;
        }

        case 'multiply': {
          if (!B) throw new Error('矩阵乘法需要矩阵B');
          const product = LinAlg.multiply(A, B);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 矩阵 A (${A.length}×${A[0].length})</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📐 矩阵 B (${B.length}×${B[0].length})</div>
              ${this.renderMatrix(B)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ A × B (${product.length}×${product[0].length})</div>
              ${this.renderMatrix(product)}
            </div>
            <div class="result-item">
              <div class="result-label">💡 注意</div>
              矩阵乘法不满足交换律：AB ≠ BA（一般情况）
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第二章 矩阵 · 矩阵乘法';
          break;
        }

        case 'add': {
          if (!B) throw new Error('矩阵加法需要矩阵B');
          const sum = LinAlg.add(A, B, false);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📐 矩阵 B</div>
              ${this.renderMatrix(B)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ A + B</div>
              ${this.renderMatrix(sum)}
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第二章 矩阵 · 矩阵加法';
          break;
        }

        case 'subtract': {
          if (!B) throw new Error('矩阵减法需要矩阵B');
          const diff = LinAlg.add(A, B, true);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 矩阵 A</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📐 矩阵 B</div>
              ${this.renderMatrix(B)}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ A − B</div>
              ${this.renderMatrix(diff)}
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第二章 矩阵 · 矩阵减法';
          break;
        }

        case 'gram-schmidt': {
          const cols = LinAlg.transpose(A);
          const gs = LinAlg.gramSchmidt(cols);
          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 输入向量组（矩阵A的列向量）</div>
              ${this.renderMatrix(A)}
            </div>
            <div class="result-item">
              <div class="result-label">📋 正交化步骤</div>
              <div class="steps-container">
                ${gs.steps.map((s, i) => `
                  <div class="step-item">
                    <div class="step-number">${i+1}</div>
                    <div class="step-content">
                      <div class="step-desc">${s.desc}</div>
                      <div class="step-matrix">${this.renderMatrix(LinAlg.transpose(s.vectors))}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 正交向量组</div>
              ${this.renderMatrix(LinAlg.transpose(gs.orthogonal))}
            </div>
            <div class="result-item highlight">
              <div class="result-label">✅ 正交单位化向量组</div>
              ${this.renderMatrix(LinAlg.transpose(gs.orthonormal))}
            </div>`;
          sourceHtml = '知识来源：线性代数教材 · 第六章 向量空间 · Gram-Schmidt正交化';
          break;
        }

        case 'solve': {
          // 矩阵A的最后一列作为b
          if (A[0].length < 2) throw new Error('方程组求解需要增广矩阵格式（至少2列）');
          const n = A.length;
          const sysCols = A[0].length - 1;
          const coeffA = A.map(row => row.slice(0, sysCols));
          const b = A.map(row => row[sysCols]);

          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 增广矩阵 [A|b]</div>
              ${this.renderMatrix(A, true, sysCols)}
            </div>`;

          const result = LinAlg.solveLinearSystem(coeffA, b);

          resultHtml += `
            <div class="result-item">
              <div class="result-label">📋 高斯消元步骤</div>
              <div class="steps-container">
                ${result.steps.map((s, i) => `
                  <div class="step-item">
                    <div class="step-number">${i+1}</div>
                    <div class="step-content">
                      <div class="step-desc">${s.desc}</div>
                      <div class="step-matrix">${this.renderMatrix(s.matrix, true, sysCols)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>`;

          resultHtml += `<div class="result-item highlight"><div class="result-label">✅ 解的情况</div>${result.message}</div>`;

          if (result.type === 'unique') {
            resultHtml += `<div class="result-item highlight"><div class="result-label">✅ 唯一解</div>`;
            result.solution.forEach((v, i) => {
              resultHtml += `<div style="font-family:'JetBrains Mono',monospace;margin-top:4px;">x${i+1} = ${LinAlg.fmt(v)}</div>`;
            });
            resultHtml += `</div>`;
          } else if (result.type === 'infinite') {
            resultHtml += `
              <div class="result-item highlight">
                <div class="result-label">✅ 通解</div>
                <div style="margin-top:8px;">特解 η = [${result.particular.map(v => LinAlg.fmt(v)).join(', ')}]</div>
                <div style="margin-top:8px;">基础解系:</div>
                ${result.basis.map((v, i) => `<div style="margin-top:4px;font-family:'JetBrains Mono',monospace;">ξ${i+1} = [${v.map(x => LinAlg.fmt(x)).join(', ')}]</div>`).join('')}
                <div style="margin-top:8px;">通解: x = η + ${result.basis.map((_, i) => `c${i+1}ξ${i+1}`).join(' + ')}</div>
              </div>`;
          } else {
            resultHtml += `<div class="result-item error"><div class="result-label">⚠️ 无解</div>增广矩阵的秩 (${result.rankAb}) > 系数矩阵的秩 (${result.rankA})</div>`;
          }

          sourceHtml = '知识来源：线性代数教材 · 第三章 向量与线性方程组 · 高斯消元法';
          break;
        }

        case 'cramer': {
          if (A.length !== A[0].length) throw new Error('克莱姆法则只能用于方阵');
          if (A[0].length < 2) throw new Error('需要增广矩阵格式');
          const n = A.length;
          const sysCols = A[0].length - 1;
          if (sysCols !== n) throw new Error('克莱姆法则要求方程数=未知数数');
          const coeffA = A.map(row => row.slice(0, n));
          const b = A.map(row => row[n]);

          const { solution, D, steps, message } = LinAlg.cramerSolve(coeffA, b);

          resultHtml = `
            <div class="result-item">
              <div class="result-label">📐 增广矩阵 [A|b]</div>
              ${this.renderMatrix(A, true, n)}
            </div>`;

          if (!solution) {
            resultHtml += `<div class="result-item error"><div class="result-label">⚠️</div>${message}</div>`;
          } else {
            resultHtml += `
              <div class="result-item">
                <div class="result-label">📋 克莱姆法则计算</div>
                <div class="steps-container">
                  ${steps.map((s, i) => `
                    <div class="step-item">
                      <div class="step-number">${i+1}</div>
                      <div class="step-content">
                        <div class="step-desc">${s.desc}</div>
                        ${s.matrix ? `<div class="step-matrix">${this.renderMatrix(s.matrix)}</div>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div class="result-item highlight">
                <div class="result-label">✅ 解</div>
                ${solution.map((v, i) => `<div style="font-family:'JetBrains Mono',monospace;margin-top:4px;">x${i+1} = ${LinAlg.fmt(v)}</div>`).join('')}
              </div>`;
          }

          sourceHtml = '知识来源：线性代数教材 · 第一章 行列式 · 克莱姆法则';
          break;
        }

        default:
          resultHtml = '<div class="result-item error">未知操作</div>';
      }

      // 添加属性面板
      resultHtml = this.getPropertiesPanel(A) + resultHtml;

      // 添加知识溯源
      if (sourceHtml) {
        resultHtml += `
          <div class="source-citation">
            <span class="source-icon"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-bookopen"/></svg></span>
            <div>${sourceHtml}</div>
          </div>`;
      }

    } catch(e) {
      resultHtml = `
        <div class="result-item error">
          <div class="result-label">⚠️ 计算错误</div>
          <div>${this.escapeHtml(e.message)}</div>
          <div style="margin-top:10px;font-size:12px;color:var(--text-secondary);">请检查矩阵维度和输入格式，确保运算条件满足。</div>
        </div>`;
    }

    // 显示结果
    const resultCard = document.getElementById('result-card');
    const resultDiv = document.getElementById('tool-result');
    const placeholder = document.getElementById('tool-placeholder-card');

    resultDiv.innerHTML = resultHtml;
    resultCard.style.display = 'block';
    placeholder.style.display = 'none';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

App.getPropertiesPanel = function getPropertiesPanel(A) {
    const rows = A.length;
    const cols = A[0].length;
    const isSquare = rows === cols;
    let props = `
      <div class="result-item">
        <div class="result-label">🔍 矩阵属性</div>
        <div class="properties-grid">
          <div class="property-card">
            <div class="prop-label">维度</div>
            <div class="prop-value">${rows}×${cols}</div>
          </div>
          <div class="property-card">
            <div class="prop-label">类型</div>
            <div class="prop-value" style="font-size:13px;">${isSquare ? '方阵' : '非方阵'}</div>
          </div>`;

    if (isSquare) {
      const det = LinAlg.determinant(A);
      const tr = LinAlg.trace(A);
      const rank = LinAlg.rank(A);
      props += `
          <div class="property-card">
            <div class="prop-label">行列式 |A|</div>
            <div class="prop-value">${LinAlg.fmt(det)}</div>
          </div>
          <div class="property-card">
            <div class="prop-label">迹 tr(A)</div>
            <div class="prop-value">${LinAlg.fmt(tr)}</div>
          </div>
          <div class="property-card">
            <div class="prop-label">秩 r(A)</div>
            <div class="prop-value">${rank}</div>
          </div>
          <div class="property-card">
            <div class="prop-label">可逆性</div>
            <div class="prop-value"><span class="prop-tag ${Math.abs(det) < SINGULAR_EPS ? 'no' : 'yes'}">${Math.abs(det) < SINGULAR_EPS ? '不可逆' : '可逆'}</span></div>
          </div>`;

      // 检查对称性
      let symmetric = true;
      for (let i = 0; i < rows && symmetric; i++) {
        for (let j = 0; j < cols && symmetric; j++) {
          if (Math.abs(A[i][j] - A[j][i]) > 1e-10) symmetric = false;
        }
      }
      props += `
          <div class="property-card">
            <div class="prop-label">对称性</div>
            <div class="prop-value"><span class="prop-tag ${symmetric ? 'yes' : 'no'}">${symmetric ? '对称' : '非对称'}</span></div>
          </div>`;
    }

    props += `</div></div>`;
    return props;
  };

App.renderMatrix = function renderMatrix(m, isAugmented = false, augCol = -1) {
    if (!m || m.length === 0) return '';
    const cols = m[0].length;
    let html = `<div class="rendered-matrix"><div class="rm-grid" style="grid-template-columns: repeat(${cols}, 1fr);">`;
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        let val = m[i][j];
        if (Math.abs(val) < 1e-10) val = 0;
        const display = Number.isInteger(val) ? String(val) : parseFloat(val.toFixed(6)).toString();
        // 增广矩阵分隔线：在augCol列后添加左边框
        const sepClass = (isAugmented && j === augCol) ? ' rm-cell-sep' : '';
        html += `<div class="rm-cell${sepClass}">${display}</div>`;
      }
    }
    html += `</div></div>`;
    return html;
  };

App.copyResult = function copyResult(el) {
    // ── v=20260926 根因修复:不再在 Promise 回调里用 event.target ──
    // 问题:index.html 里是 onclick="App.copyResult()",Promise .then() 执行时事件
    // 早已派发结束,window.event / event.currentTarget 已被清空(null)→
    // btn.innerHTML 抛 TypeError("已复制"反馈失效),严格模式下引用裸 event 还会 ReferenceError。
    // 修复:① 支持显式传元素 App.copyResult(this);② 兼容老调用——在函数入口
    // (同步阶段)先把当前事件的目标元素捕获到局部变量;③ 都取不到时兜底查那个按钮。
    const ev = (typeof event !== 'undefined' && event) ? event : null;
    let btn = (el && el.nodeType === 1) ? el : (ev && (ev.currentTarget || ev.target)) || null;
    if (btn && btn.closest) btn = btn.closest('button') || btn;
    if (!btn) btn = document.querySelector('button[onclick*="copyResult"]');
    const result = document.getElementById('tool-result');
    if (!result) return;
    const text = result.innerText;
    const flash = () => {
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = '✅ 已复制';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    };
    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      // v=20260926 降级分支也要给"已复制"反馈:clipboard 失败/不可用时走 execCommand,
      // 若只是在 .then(flash) 里反馈,http 环境(无 navigator.clipboard)点按钮将毫无反应。
      navigator.clipboard.writeText(text).then(flash).catch(() => { fallbackCopy(); flash(); });
    } else {
      fallbackCopy();
      flash();
    }
  };

  // ============ 可视化模块 ============

App.initVisualizer = function initVisualizer() {
    this.currentVizTab = this.currentVizTab || '2d';
    if (this.currentVizTab === '2d') {
      this.updateVectorViz();
      this.updateTransformViz();
      this.updateDetViz();
      this.updateEigenViz();
    } else {
      if (!this._3dInit) { this.init3DScenes(); this._3dInit = true; }
      this.update3DVector();
      this.update3DTransform();
    }
  };

  // ============ 2D/3D 可视化标签切换 ============
App.switchVizTab = function switchVizTab(tab) {
    this.currentVizTab = tab;
    document.querySelectorAll('.viz-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-viz="${tab}"]`)?.classList.add('active');
    document.getElementById('viz-panel-2d').style.display = tab === '2d' ? '' : 'none';
    document.getElementById('viz-panel-2d').classList.toggle('active', tab === '2d');
    document.getElementById('viz-panel-3d').style.display = tab === '3d' ? '' : 'none';
    document.getElementById('viz-panel-3d').classList.toggle('active', tab === '3d');
    if (tab === '3d') {
      if (!this._3dInit) { this.init3DScenes(); this._3dInit = true; }
      this.update3DVector();
      this.update3DTransform();
      this.updateDet3D();
      this.updateEigen3D();
      // 触发 Three.js 渲染器 resize
      setTimeout(() => {
        if (this._3dRenderer) this._3dRenderer.setSize(
          document.getElementById('threejs-container').clientWidth,
          document.getElementById('threejs-container').clientHeight
        );
        if (this._3dRendererT) this._3dRendererT.setSize(
          document.getElementById('threejs-transform-container').clientWidth,
          document.getElementById('threejs-transform-container').clientHeight
        );
      }, 50);
    } else {
      this.updateVectorViz();
      this.updateTransformViz();
      this.updateDetViz();
      this.updateEigenViz();
    }
  };

  // ============ 3D 场景初始化 ============
App.init3DScenes = function init3DScenes() {
    let webglOk = false;
    if (typeof THREE === 'undefined') {
      this._useCanvas2D = true;
    } else {
      try {
        const test = document.createElement('canvas');
        const gl = test.getContext('webgl') || test.getContext('experimental-webgl');
        if (!gl) {
          this._useCanvas2D = true;
        } else {
          this._useCanvas2D = false;
          this._init3DVectorScene();
          this._init3DTransformScene();
          webglOk = true;
        }
      } catch (e) {
        console.error('[3D] WebGL 初始化失败:', e);
        this._useCanvas2D = true;
      }
    }
    // 永远初始化 det3d/eigen3d 附加画布（无论 WebGL 还是降级模式都需要）
    this._init3DAdditionalCanvases();
    // 启动渲染循环
    this._animate3D();
  };

  /**
   * ============ Canvas 2D 投影降级渲染（WebGL 不可用时兜底） ============
   * 用 Canvas 2D API + 等距投影绘制 3D 坐标轴/网格/立方体/向量箭头，
   * 完全依赖 requestAnimationFrame，任何浏览器可用。
   */
App._init3DCanvas2DScenes = function _init3DCanvas2DScenes() {
    this._init3DPrimaryCanvases();
    this._init3DAdditionalCanvases();
  };

  /** 3D 容器（向量/变换）Canvas 2D 初始化（兼容模式） */
App._init3DPrimaryCanvases = function _init3DPrimaryCanvases() {
    ['threejs-container', 'threejs-transform-container'].forEach(id => {
      const container = document.getElementById(id);
      if (!container) return;
      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 500;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.background = '#1a1a2e';
      container.appendChild(canvas);
      // 投影基准 = canvas 实际渲染尺寸（避免 CSS 缩放后坐标越界画到画布外）
      const resize = () => {
        canvas._w = canvas.width; canvas._h = canvas.height; canvas._dpr = 1;
      };
      resize();
      canvas._resize = resize;
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => resize());
        ro.observe(container);
      }
    });
    this._3dOrbit = { isDragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI/4, radius: 10, target: null };
    this._3dOrbitT = { isDragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI/4, radius: 10, target: null };
    const c1 = document.getElementById('threejs-container');
    const c2 = document.getElementById('threejs-transform-container');
    this._setupOrbitControls(c1, 'vector');
    this._setupOrbitControls(c2, 'transform');
    this._set3DStatusBadge(c1, 'ready', '3D 渲染就绪（兼容模式）· 拖拽旋转/滚轮缩放');
    this._set3DStatusBadge(c2, 'ready', '3D 渲染就绪（兼容模式）· 拖拽旋转/滚轮缩放');
  };

  /** 3D 附加画布（行列式/特征向量）初始化（WebGL/Canvas2D 共用） */
App._init3DAdditionalCanvases = function _init3DAdditionalCanvases() {
    ['det3d-container', 'eigen3d-container'].forEach(id => {
      const container = document.getElementById(id);
      if (!container) return;
      // 保留容器上的边框样式，仅替换内部
      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 500;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.background = '#1a1a2e';
      container.appendChild(canvas);
      // 投影基准 = canvas 实际渲染尺寸（避免 CSS 缩放后坐标越界画到画布外）
      const resize = () => {
        canvas._w = canvas.width; canvas._h = canvas.height; canvas._dpr = 1;
      };
      resize();
      canvas._resize = resize;
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => resize());
        ro.observe(container);
      }
    });
    this._3dOrbitDet = { isDragging: false, lastX: 0, lastY: 0, theta: 0.6, phi: Math.PI/4, radius: 10, target: null };
    this._3dOrbitEig = { isDragging: false, lastX: 0, lastY: 0, theta: -0.6, phi: Math.PI/4, radius: 10, target: null };
    const d3 = document.getElementById('det3d-container');
    const e3 = document.getElementById('eigen3d-container');
    if (d3) this._setupOrbitControls(d3, 'det3d');
    if (e3) this._setupOrbitControls(e3, 'eigen3d');
  };

  /**
   * 3D 点 → 屏幕投影（等距透视）
   * 基准尺寸用 canvas.width/height（实际渲染缓冲区），避免 CSS 缩放后坐标越界
   */
App._3dProject = function _3dProject(px, py, pz, orbit, w, h) {
    const theta = orbit.theta, phi = orbit.phi;
    const x1 = px * Math.cos(theta) + pz * Math.sin(theta);
    const z1 = -px * Math.sin(theta) + pz * Math.cos(theta);
    const y1 = py;
    const y2 = y1 * Math.cos(phi) - z1 * Math.sin(phi);
    const z2 = y1 * Math.sin(phi) + z1 * Math.cos(phi);
    const cw = w || 500, ch = h || 500;
    const scale = Math.min(cw, ch) / (2 * (orbit.radius || 10));
    const cx = cw / 2, cy = ch / 2;
    return { x: cx + x1 * scale, y: cy - y2 * scale, z: z2 * scale };
  };

  /** 在 Canvas 上画 3D 线段（带箭头可选） */
App._3dLine2D = function _3dLine2D(ctx, a, b, color, width, arrow) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (arrow) {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const len = Math.min(14, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - len * Math.cos(angle - 0.45), b.y - len * Math.sin(angle - 0.45));
      ctx.lineTo(b.x - len * Math.cos(angle + 0.45), b.y - len * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    }
  };

  /** Canvas 2D 渲染一帧 */
App._render3DCanvasFrame = function _render3DCanvasFrame(which) {
    const id = which === 'vector' ? 'threejs-container' : 'threejs-transform-container';
    const container = document.getElementById(id);
    const canvas = container ? container.querySelector('canvas') : null;
    if (!canvas) return;
    const orbit = which === 'vector' ? this._3dOrbit : this._3dOrbitT;
    const w = canvas._w || 500, h = canvas._h || 500, dpr = canvas._dpr || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    const P = (x, y, z) => this._3dProject(x, y, z, orbit, w, h);

    // 网格（xy 平面 z=0，-5..5）
    const showGrid = document.getElementById('show3d-grid')?.checked ?? true;
    const showCube = document.getElementById('show3d-unit-cube')?.checked ?? true;
    if (showGrid) {
      ctx.strokeStyle = 'rgba(90,90,130,0.55)';
      ctx.lineWidth = 1;
      for (let g = -5; g <= 5; g++) {
        const a = P(g, 0, -5), b = P(g, 0, 5);
        const c = P(-5, 0, g), d = P(5, 0, g);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
    }

    // 坐标轴：红 X / 绿 Y / 蓝 Z
    const origin = P(0, 0, 0);
    this._3dLine2D(ctx, origin, P(5, 0, 0), '#ff5555', 2.2, true);
    this._3dLine2D(ctx, origin, P(0, 5, 0), '#55ff55', 2.2, true);
    this._3dLine2D(ctx, origin, P(0, 0, 5), '#5588ff', 2.2, true);

    // 单位立方体（0,0,0）-(1,1,1)
    if (showCube) {
      const cubeCorners = [];
      for (let i = 0; i < 8; i++) {
        cubeCorners.push(P(i & 1, (i >> 1) & 1, (i >> 2) & 1));
      }
      const cubeEdges = [
        [0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]
      ];
      ctx.strokeStyle = 'rgba(180,180,200,0.8)';
      ctx.lineWidth = 1.2;
      cubeEdges.forEach(([i, j]) => {
        ctx.beginPath();
        ctx.moveTo(cubeCorners[i].x, cubeCorners[i].y);
        ctx.lineTo(cubeCorners[j].x, cubeCorners[j].y);
        ctx.stroke();
      });
    }

    // 场景内容
    if (which === 'vector') {
      // 空间向量 v₁/v₂ 及加减（对齐 2D：v₁ 橙、v₂ 青、v₁+v₂ 紫、v₁−v₂ 粉）
      const x1 = parseFloat(document.getElementById('vec3d-x')?.value) || 0;
      const y1 = parseFloat(document.getElementById('vec3d-y')?.value) || 0;
      const z1 = parseFloat(document.getElementById('vec3d-z')?.value) || 0;
      const x2 = parseFloat(document.getElementById('vec3d2-x')?.value) || 0;
      const y2 = parseFloat(document.getElementById('vec3d2-y')?.value) || 0;
      const z2 = parseFloat(document.getElementById('vec3d2-z')?.value) || 0;
      const showAdd = document.getElementById('show3d-add')?.checked ?? true;
      const showSub = document.getElementById('show3d-sub')?.checked ?? false;
      this._3dLine2D(ctx, origin, P(x1, y1, z1), '#ff9a3d', 3, true);
      this._3dLine2D(ctx, origin, P(x2, y2, z2), '#22d3ee', 3, true);
      if (showAdd) this._3dLine2D(ctx, origin, P(x1 + x2, y1 + y2, z1 + z2), '#a78bfa', 2.6, true);
      if (showSub) this._3dLine2D(ctx, origin, P(x1 - x2, y1 - y2, z1 - z2), '#f472b6', 2.6, true);
    } else {
      // 线性变换：原始基向量（红）+ 变换后基向量（蓝）
      const M = this._get3DMatrix();
      const orig = [[1,0,0],[0,1,0],[0,0,1]];
      orig.forEach(v => {
        this._3dLine2D(ctx, origin, P(v[0], v[1], v[2]), '#ff5555', 2.4, true);
      });
      const trans = orig.map(v => [
        M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2],
        M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2],
        M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2]
      ]);
      trans.forEach(v => {
        this._3dLine2D(ctx, origin, P(v[0], v[1], v[2]), '#4488ff', 2.4, true);
      });
    }

    // 原点标签
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px sans-serif';
    ctx.fillText('O', origin.x - 14, origin.y + 4);
  };

  /** 3D 不可用提示（替换容器内容，避免静默黑屏） */

  /** 3D 不可用提示（替换容器内容，避免静默黑屏） */
App._show3DUnavailable = function _show3DUnavailable(msg) {
    ['threejs-container', 'threejs-transform-container'].forEach(id => {
      const c = document.getElementById(id);
      if (c) {
        c.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;text-align:center;padding:20px;">⚠️ ' + msg + '</div>';
      }
    });
  };

  /**
   * 3D 容器调试徽标（让用户看到 3D 渲染状态）
   * @param container 容器元素
   * @param status 'ready' | 'error' | 'warn'
   * @param msg 自定义消息
   */
App._set3DStatusBadge = function _set3DStatusBadge(container, status, msg) {
    if (!container) return;
    container.style.position = 'relative';
    let badge = container.querySelector(':scope > .tp-3d-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'tp-3d-badge';
      badge.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.3);';
      container.appendChild(badge);
    }
    const colors = {
      ready: { bg: 'rgba(34,197,94,.85)', text: '#fff', icon: '✅' },
      error: { bg: 'rgba(239,68,68,.9)', text: '#fff', icon: '⚠️' },
      warn:  { bg: 'rgba(234,179,8,.9)', text: '#fff', icon: '⚠️' },
    };
    const c = colors[status] || colors.warn;
    badge.style.background = c.bg;
    badge.style.color = c.text;
    badge.textContent = (c.icon || '') + ' ' + (msg || status);
  };

App._init3DVectorScene = function _init3DVectorScene() {
    const container = document.getElementById('threejs-container');
    if (!container) return;
    // 容器可能尚未布局（display 切换、display:none→block 间过渡），等待下一帧再读尺寸
    const W0 = container.clientWidth, H0 = container.clientHeight;
    const W = W0 > 50 ? W0 : 500, H = H0 > 50 ? H0 : 500;

    this._3dScene = new THREE.Scene();
    this._3dScene.background = new THREE.Color(0x1a1a2e);

    this._3dCamera = new THREE.PerspectiveCamera(50, W/H, 0.1, 100);
    this._3dCamera.position.set(6, 4, 8);
    this._3dCamera.lookAt(0, 0, 0);

    this._3dRenderer = new THREE.WebGLRenderer({ antialias: true });
    this._3dRenderer.setSize(W, H);
    this._3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    // 让 canvas 跟随容器自适应（避免外部 CSS 限制）
    const canvas = this._3dRenderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    // OrbitControls (simple manual implementation since CDN path may differ)
    this._3dOrbit = { isDragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI/4, radius: 10, target: new THREE.Vector3(0,0,0) };
    this._setupOrbitControls(container, 'vector');

    // Lights
    this._3dScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    this._3dScene.add(dirLight);

    // Grid helper at z=0 plane
    const grid = new THREE.GridHelper(10, 10, 0x444466, 0x222244);
    grid.name = 'grid';
    this._3dScene.add(grid);

    // Axes: Red=X, Green=Y, Blue=Z
    this._add3DAxes(this._3dScene, 5);

    // Unit cube wireframe
    this._addUnitCube(this._3dScene);

    // Arrow for vector
    this._3dArrow = new THREE.Group();
    this._3dScene.add(this._3dArrow);

    // 容器自适应：ResizeObserver 监听容器尺寸变化自动 resize 渲染器
    if (window.ResizeObserver) {
      if (this._3dRo) this._3dRo.disconnect();
      this._3dRo = new ResizeObserver(entries => {
        for (const e of entries) {
          const w = Math.max(50, Math.floor(e.contentRect.width));
          const h = Math.max(50, Math.floor(e.contentRect.height));
          this._3dRenderer.setSize(w, h, false);
        }
      });
      this._3dRo.observe(container);
    }

    // 调试徽标：让用户直观看到 3D 渲染状态
    this._set3DStatusBadge(container, 'ready', '3D 渲染就绪 · 拖拽旋转/滚轮缩放');
  };

