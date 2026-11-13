/**
 * 线性代数公式背景装饰 — 防裁切 / 防前景遮挡 版 v=20260906
 * ─────────────────────────────────────────────────────
 * 设计要点:
 *  1) 5 个公式分散槽位,水平 cx 限定在 6-94% 安全区(远离左右边界)
 *  2) 公式按中心点定位 (left:x% + translate(-50%,-50%)) 而非左上角
 *  3) 公式渲染后实测宽高,若超出当前槽位安全区则 clamp 位置到容器内
 *  4) 去掉强制 max-width,允许公式自然宽度,但用边界检测保证不裁切
 *  5) 字号降低:普通 14-18px,复杂 11-14px
 *  6) 微浮动幅度降低:dx/dy ±1.5-3px,确保不推元素出边界
 *  7) 7s 整批轮换,KaTeX 渲染失败直接丢弃
 *  8) resize 重建时,按新容器尺寸重新选槽位和字号
 *  9) z-index -1 保持背景层
 * 10) [NEW] 避开前景白色板块 (chip/badge/button/title/sub/tagline 等)
 *     通过检测 layer 同辈 content 内的元素 bounding rect,公式中心点必须落在所有障碍矩形之外
 * 11) [NEW] 槽位 bl 从 80% → 68% 避开底部 .hf-formula 公式条
 */
(function () {
  'use strict';
  if (window.__DISABLE_BG_FORMULAS__ === true) return;

  // ── 公式池(16 条常用线性代数 LaTeX) ──
  const FORMULA_POOL = [
    'A^{n} = P D^{n} P^{-1}',
    '\\det(AXB) = \\det(A)\\,\\det(X)\\,\\det(B)',
    'A^{-1} = \\dfrac{A^{*}}{|A|}',
    'A^{\\top} A = E',
    'A = PDP^{-1}',
    'A = USV^{\\top}',
    'A = QR',
    'Av = \\lambda v',
    '\\det(\\lambda E - A) = 0',
    'r(AB) \\leq \\min\\{r(A), r(B)\\}',
    '\\mathrm{proj}_{u}\\,v = \\dfrac{v \\cdot u}{u \\cdot u}\\,u',
    '\\beta_k = \\alpha_k - \\displaystyle\\sum_{i=1}^{k-1} \\dfrac{\\langle \\alpha_k, \\beta_i \\rangle}{\\langle \\beta_i, \\beta_i \\rangle}\\,\\beta_i',
    'x^{\\top} A x > 0',
    '\\mathrm{tr}(A) = \\displaystyle\\sum_{i=1}^{n} \\lambda_i',
    '\\det A = \\displaystyle\\prod_{i=1}^{n} \\lambda_i',
    '\\dim\\, N(A) + r(A) = n'
  ];

  // 复杂公式(强制小字号防溢出): 宽公式 + 分式 + 求和式
  const COMPLEX_IDX = new Set([0, 1, 2, 5, 9, 10, 11, 13, 14, 15]);

  // ── 5 个固定槽位(cx 限定 8-92% 安全区,远离左右边界) ──
  //  每个槽位定义:中心点(%) + 抖动范围(%)
  //  槽位布局原则:全部落在「左侧」或「右侧」纯背景带,
  //    完全避开中间的内容文字区。
  //  含右下角槽位 br(cy 78% 避开了底部 .hf-formula 公式条 y≈73-80%。
  //    公式条 chip 高度 44px,在 banner 高 ~560px 时,cy 必须 < 75% 才不会擦边)。
  const SLOTS = [
    { id: 'tl', cx: 14, cy: 14, rx: 4, ry: 3 },   // 左上
    { id: 'tr', cx: 86, cy: 14, rx: 4, ry: 3 },   // 右上
    { id: 'ml', cx: 10, cy: 52, rx: 4, ry: 4 },   // 左中
    { id: 'mr', cx: 90, cy: 52, rx: 4, ry: 4 },   // 右中
    { id: 'br', cx: 88, cy: 65, rx: 4, ry: 3 }    // 右下(cy 65% 避开底部公式条 73-80%)
  ];
  // 仅在容器足够宽(>=1100px)时启用左下角第 6 槽位,做更均匀分布
  const EXTRA_SLOT = { id: 'bl', cx: 12, cy: 65, rx: 4, ry: 3 };

  const TARGET_COUNT = 5;
  const SWAP_INTERVAL = 7000;
  const FADE_OUT_MS = 1500;
  const FADE_IN_MS = 1200;
  const UNIFORM_OPACITY = 0.24;          // 适度调淡,降低对前景的视觉干扰
  // 容器水平/垂直最小安全边距(%)
  const SAFE_MARGIN_X = 4;
  const SAFE_MARGIN_Y = 4;

  /**
   * 收集需要避让的前景矩形(以 banner 内 layer (`.home-hero-bg`) 为坐标系原点)
   * - 白色 chip / badge / 按钮 / 主副标题 / tagline / 底部公式条等
   */
  function collectObstacleRects(layer) {
    const root = layer.parentElement;   // .home-hero
    if (!root) return [];
    const SELECTORS = [
      '.home-hero-badge',
      '.home-hero-tagline',
      '.home-hero-title',
      '.home-hero-sub',
      '.home-cta',
      '.hf-formula'
    ];
    const lr = layer.getBoundingClientRect();
    const seen = new Set();             // 去重 (key = "x0,y0,x1,y1")
    const rects = [];
    for (const sel of SELECTORS) {
      const nodes = root.querySelectorAll(sel);
      for (const n of nodes) {
        if (!n) continue;
        const r = n.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) continue;   // 忽略极小元素
        if (r.bottom < lr.top - 2 || r.top > lr.bottom + 2) continue;
        if (r.right < lr.left - 2 || r.left > lr.right + 2) continue;
        const x0 = r.left - lr.left;
        const y0 = r.top - lr.top;
        const x1 = r.right - lr.left;
        const y1 = r.bottom - lr.top;
        const key = `${Math.round(x0)},${Math.round(y0)},${Math.round(x1)},${Math.round(y1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rects.push({ x0, y0, x1, y1 });
      }
    }
    return rects;
  }

  /**
   * 若 (cx, cy, w, h) 与任何 obstacle 重叠,返回推算后的安全中心点 (px)
   * 策略:把元素中心点推到「与该 obstacle 边距最大 + 元素半径」外的位置上
   */
  function avoidObstacles(cx, cy, halfW, halfH, cw, ch, rects) {
    let curX = cx, curY = cy;
    // 最多迭代 12 次,每次尝试推开当前重叠的 obstacle
    for (let iter = 0; iter < 12; iter++) {
      let offending = null;
      for (const r of rects) {
        if (curX + halfW > r.x0 && curX - halfW < r.x1 &&
            curY + halfH > r.y0 && curY - halfH < r.y1) {
          offending = r;
          break;
        }
      }
      if (!offending) break;
      // 4 个方向候选:顶/底/左/右;选最短逃离距离
      const candidates = [];
      // 顶部 (从 r.y0 上方出去)
      const topY = offending.y0 - halfH - 4;
      if (topY >= 4) candidates.push({ x: curX, y: topY, d: Math.abs(topY - curY) });
      // 底部 (从 r.y1 下方出去)
      const botY = offending.y1 + halfH + 4;
      if (botY <= ch - 4) candidates.push({ x: curX, y: botY, d: Math.abs(botY - curY) });
      // 左侧
      const leftX = offending.x0 - halfW - 4;
      if (leftX >= 4) candidates.push({ x: leftX, y: curY, d: Math.abs(leftX - curX) });
      // 右侧
      const rightX = offending.x1 + halfW + 4;
      if (rightX <= cw - 4) candidates.push({ x: rightX, y: curY, d: Math.abs(rightX - curX) });
      if (candidates.length === 0) {
        // 极端:推回原槽位并打破循环(后续将被 clampToSafeZone 限制)
        return { x: cx, y: cy };
      }
      // 优先距离最近的方向(让最终位置最贴近原槽位)
      candidates.sort((a, b) => a.d - b.d);
      curX = candidates[0].x;
      curY = candidates[0].y;
    }
    return { x: curX, y: curY };
  }

  function renderToHTML(latex) {
    if (!window.katex) return null;
    try {
      return window.katex.renderToString(latex, {
        throwOnError: true,
        displayMode: false,
        output: 'html'
      });
    } catch (err) {
      return null;
    }
  }

  /** 公式池游标 + 本批次去重 Set */
  const pool = {
    items: FORMULA_POOL.map((_, i) => i),
    cursor: 0,
    usedThisCycle: new Set(),

    resetCycle() {
      this.usedThisCycle = new Set();
      if (this.cursor >= this.items.length) {
        for (let i = this.items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
        }
        this.cursor = 0;
      }
    },

    pickUnique() {
      const start = this.cursor;
      for (let i = 0; i < this.items.length; i++) {
        const idx = this.items[(start + i) % this.items.length];
        if (!this.usedThisCycle.has(idx)) {
          this.usedThisCycle.add(idx);
          this.cursor = (start + i + 1) % this.items.length;
          return idx;
        }
      }
      this.usedThisCycle = new Set();
      const idx = this.items[start];
      this.usedThisCycle.add(idx);
      this.cursor = (start + 1) % this.items.length;
      return idx;
    }
  };

  /** 槽位 → 实际坐标(带轻微抖动) */
  function slotToPos(slot) {
    let x = slot.cx + (Math.random() * 2 - 1) * slot.rx;
    let y = slot.cy + (Math.random() * 2 - 1) * slot.ry;
    return { x, y };
  }

  /**
   * 关键:根据元素实际尺寸,把 (x, y) clamp 到容器安全区内
   * 使元素的中心点落在 (x%, y%) 时,元素的整体仍在 [SAFE_MARGIN, 100-SAFE_MARGIN] 范围内
   *  - w, h: 元素渲染后的实际宽高(px)
   *  - cw, ch: 容器宽高(px)
   */
  function clampToSafeZone(x, y, w, h, cw, ch) {
    const halfW = w / 2;
    const halfH = h / 2;
    // x 范围: 元素左边界 >= SAFE_MARGIN% 且 右边界 <= (100-SAFE_MARGIN)%
    // => 中心点 x% 范围: [(SAFE_MARGIN + halfW/cw*100), (100 - SAFE_MARGIN - halfW/cw*100)]
    const minX = SAFE_MARGIN_X + (halfW / cw) * 100;
    const maxX = 100 - SAFE_MARGIN_X - (halfW / cw) * 100;
    const minY = SAFE_MARGIN_Y + (halfH / ch) * 100;
    const maxY = 100 - SAFE_MARGIN_Y - (halfH / ch) * 100;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }

  /** 创建并入场一个公式(slotIdx ∈ [0..SLOTS.length]) */
  function spawnFormula(layer, slotIdx) {
    const idx = pool.pickUnique();
    const latex = FORMULA_POOL[idx];
    const html = renderToHTML(latex);
    if (!html) return null;

    const slot = slotIdx < SLOTS.length ? SLOTS[slotIdx] : EXTRA_SLOT;
    const complex = COMPLEX_IDX.has(idx);

    // 字号:复杂公式更小,且相比旧版整体下调一档
    const fontSize = complex
      ? 11 + Math.random() * 3   // 11-14px(旧 12-16)
      : 14 + Math.random() * 4;  // 14-18px(旧 16-22)

    const el = document.createElement('div');
    el.className = 'home-ff-item';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    el.style.fontSize = fontSize.toFixed(1) + 'px';
    el.style.opacity = '0';
    el.style.transition = `opacity ${FADE_IN_MS}ms ease`;
    // 关键:按中心点定位 → 配合 CSS transform: translate(-50%, -50%) 基线
    el.style.left = '50%';
    el.style.top = '50%';
    layer.appendChild(el);

    // 测量实际尺寸
    const rect = el.getBoundingClientRect();
    const cw = layer.clientWidth;
    const ch = layer.clientHeight;
    if (cw < 50 || ch < 50) {
      // 容器无效,丢弃
      el.remove();
      return null;
    }
    const w = rect.width;
    const h = rect.height;
    const halfW = w / 2;
    const halfH = h / 2;

    // 计算槽位坐标 + 边界保护
    const raw = slotToPos(slot);
    const safe = clampToSafeZone(raw.x, raw.y, w, h, cw, ch);

    // ── NEW: 避开前景白色 chip / 文字障碍 ──
    // 1) 收集障碍矩形(layer 坐标系,px)
    const obstacles = collectObstacleRects(layer);
    // 2) 把 safe (百分比) 转为 px,做避让
    let baseX = (safe.x / 100) * cw;
    let baseY = (safe.y / 100) * ch;
    if (obstacles.length > 0) {
      const avoided = avoidObstacles(baseX, baseY, halfW, halfH, cw, ch, obstacles);
      baseX = avoided.x;
      baseY = avoided.y;
      // 二次边界 clamp
      baseX = Math.max(halfW + 2, Math.min(cw - halfW - 2, baseX));
      baseY = Math.max(halfH + 2, Math.min(ch - halfH - 2, baseY));
    }

    return {
      el,
      slotIdx,
      alive: true,
      fadingOut: false,
      // 浮动参数:幅度比之前小,确保不推元素出边界
      ampX: 1.5 + Math.random() * 1.5,   // 1.5-3px
      ampY: 1.5 + Math.random() * 1.5,
      rotAmp: 0.4 + Math.random() * 0.8, // 0.4-1.2deg
      period: 4000 + Math.random() * 3000, // 4-7s
      phase: Math.random() * Math.PI * 2,
      t0: Math.random() * 2000,
      // 中心点基线(px)
      baseX, baseY
    };
  }

  // ── 全局控制器 ──
  const ctrl = {
    layer: null,
    items: [],
    rafId: null,
    active: false,
    visible: true,
    swapTimer: null,
    swapInProgress: false,

    init() {
      if (this.active) return;
      this.layer = document.querySelector('.home-hero-bg');
      if (!this.layer) return;
      this.active = true;

      this._spawnAll();

      // rAF 微浮动
      const tick = (now) => {
        if (!this.active) return;
        if (this.visible) {
          for (const it of this.items) {
            if (it.alive && !it.fadingOut) this._tickItem(it, now);
          }
        } else {
          // 失活:节流
          this._lastInactive = this._lastInactive || 0;
          if (now - this._lastInactive >= 200) {
            for (const it of this.items) {
              if (it.alive && !it.fadingOut) this._tickItem(it, now);
            }
            this._lastInactive = now;
          }
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);

      // 7s 整批同步轮换
      this.swapTimer = setInterval(() => {
        if (!this.active) return;
        this._doSwap();
      }, SWAP_INTERVAL);

      // resize + 标签页可见性（具名回调，destroy 时可解绑）
      this._bindGlobal();
    },

    /** 绑定全局监听：resize / visibilitychange。已绑定则直接返回，避免重复叠加 */
    _bindGlobal() {
      if (this._bound) return;
      this._bound = true;
      this._onWinResize = () => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._onResize(), 250);
      };
      this._onVis = () => {
        this.visible = document.visibilityState === 'visible';
      };
      window.addEventListener('resize', this._onWinResize);
      document.addEventListener('visibilitychange', this._onVis);
    },

    /** 解绑全局监听（与 _bindGlobal 成对） */
    _unbindGlobal() {
      if (!this._bound) return;
      if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
      if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
      clearTimeout(this._resizeTimer);
      this._bound = false;
    },

    /** 首批铺满 5 个公式 */
    _spawnAll() {
      pool.resetCycle();
      const cw = this.layer.clientWidth;
      const ch = this.layer.clientHeight;
      // 容器太窄时降为 4 个,极窄(<=480px)由 CSS 隐藏
      const count = cw < 700 ? 4 : TARGET_COUNT;
      const newItems = [];
      for (let slotIdx = 0; slotIdx < count; slotIdx++) {
        let tries = 0;
        let item = null;
        while (tries < 6) {
          tries++;
          item = spawnFormula(this.layer, slotIdx);
          if (item) break;
        }
        if (item) newItems.push(item);
      }
      this.items = newItems;
      // 一帧后启动淡入
      requestAnimationFrame(() => {
        for (const it of this.items) {
          if (it.alive) it.el.style.opacity = String(UNIFORM_OPACITY);
        }
      });
    },

    /**
     * 每帧微平移 + 微旋转
     * 关键:基线 baseX/baseY 是中心点位置(px)
     *      element left: 50% + top: 50% + transform: translate3d 偏移
     * 改为:left/top 设具体 px,transform 包含中心对齐 + 平移 + 旋转
     */
    _tickItem(it, now) {
      const t = ((now + it.t0) % it.period) / it.period;
      const angle = t * Math.PI * 2 + it.phase;
      const dx = Math.sin(angle) * it.ampX;
      const dy = Math.cos(angle * 0.87) * it.ampY;
      const dr = Math.sin(angle * 0.73) * it.rotAmp;
      // 把基线 px 值通过 top/left 持续设置(避免 % 抖动),transform 做居中+浮动
      it.el.style.left = it.baseX.toFixed(1) + 'px';
      it.el.style.top = it.baseY.toFixed(1) + 'px';
      it.el.style.transform =
        `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) translate(-50%, -50%) rotate(${dr.toFixed(2)}deg)`;
    },

    /** 整批同步轮换 */
    _doSwap() {
      if (this.swapInProgress) return;
      if (this.items.length === 0) { this._spawnAll(); return; }
      this.swapInProgress = true;

      const oldItems = this.items.slice();
      this.items = [];

      for (const it of oldItems) {
        it.fadingOut = true;
        it.el.style.transition = `opacity ${FADE_OUT_MS}ms ease`;
        it.el.style.opacity = '0';
      }

      setTimeout(() => {
        for (const it of oldItems) {
          it.alive = false;
          if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
        }
        this._spawnAll();
        this.swapInProgress = false;
      }, FADE_OUT_MS + 80);
    },

    /** resize: 全部销毁重建 */
    _onResize() {
      for (const it of this.items) {
        if (!it.alive) continue;
        it.fadingOut = true;
        it.el.style.transition = 'opacity 200ms ease';
        it.el.style.opacity = '0';
      }
      const oldItems = this.items;
      this.items = [];
      setTimeout(() => {
        for (const it of oldItems) {
          if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
        }
        this._spawnAll();
      }, 240);
    },

    destroy() {
      this.active = false;
      // 先解绑全局监听，再清 DOM
      this._unbindGlobal();
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (this.swapTimer) clearInterval(this.swapTimer);
      for (const it of this.items) {
        if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
      }
      this.items = [];
    }
  };

  // ── 调试 ──
  window.__floatingFormulas = {
    destroy() { if (ctrl.active) ctrl.destroy(); },
    reset() {
      if (window.__DISABLE_BG_FORMULAS__) return;
      ctrl.destroy();
      setTimeout(() => ctrl.init(), 120);
    }
  };

  // ── 启动 ──
  function bootstrap() { ctrl.init(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
