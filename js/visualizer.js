/**
 * 线性代数可视化引擎
 * 提供向量运算、线性变换、矩阵几何意义等交互式可视化
 */

const Visualizer = {

  // 获取当前主题的画布颜色
  getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      bg: isDark ? '#1e293b' : '#fafbfc',
      grid: isDark ? '#334155' : '#e8eaed',
      axis: isDark ? '#94a3b8' : '#5f6368',
      text: isDark ? '#f1f5f9' : '#202124',
      textSecondary: isDark ? '#94a3b8' : '#5f6368',
      gridTransform: isDark ? 'rgba(129, 140, 248, 0.3)' : 'rgba(66, 133, 244, 0.3)',
      heatBorder: isDark ? '#1e293b' : '#fff',
      faint: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(95, 99, 104, 0.2)'
    };
  },

  // ============ 2D向量运算可视化 ============

  vector2D(canvasId, vectors, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const scale = options.scale || 40;
    const tc = this.getThemeColors();

    ctx.clearRect(0, 0, W, H);

    // 绘制背景
    ctx.fillStyle = options.bgColor || tc.bg;
    ctx.fillRect(0, 0, W, H);

    // 绘制网格
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    for (let x = cx % scale; x < W; x += scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = cy % scale; y < H; y += scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 绘制坐标轴
    ctx.strokeStyle = tc.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    // 箭头
    this.drawArrow(ctx, W - 10, cy, W, cy, tc.axis);
    this.drawArrow(ctx, cx, 10, cx, 0, tc.axis);
    ctx.fillStyle = tc.axis;
    ctx.font = '12px sans-serif';
    ctx.fillText('x', W - 15, cy - 8);
    ctx.fillText('y', cx + 8, 15);

    // 绘制向量
    const colors = ['#ea4335', '#4285f4', '#34a853', '#fbbc04', '#9334e6'];
    vectors.forEach((vec, i) => {
      const color = vec.color || colors[i % colors.length];
      const x = cx + vec.x * scale;
      const y = cy - vec.y * scale;

      // 向量线
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      // 箭头
      this.drawArrow(ctx, cx, cy, x, y, color);

      // 标签
      ctx.fillStyle = color;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(vec.label || `v${i + 1}`, x + 5, y - 5);
    });

    // 绘制原点
    ctx.fillStyle = tc.axis;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '11px sans-serif';
    ctx.fillText('O', cx - 12, cy + 15);
  },

  drawArrow(ctx, x1, y1, x2, y2, color) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  },

  // ============ 线性变换可视化 ============

  linearTransform(canvasId, matrix, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const scale = options.scale || 40;
    const progress = options.progress !== undefined ? options.progress : 1; // 0~1 动画进度
    const tc = this.getThemeColors();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = tc.bg;
    ctx.fillRect(0, 0, W, H);

    // 插值矩阵（从单位矩阵到目标矩阵）
    const [[a, b], [c, d]] = matrix;
    const ia = 1 + (a - 1) * progress;
    const ib = 0 + b * progress;
    const ic = 0 + c * progress;
    const id = 1 + (d - 1) * progress;

    const toScreen = (x, y) => ({
      x: cx + (ia * x + ib * y) * scale,
      y: cy - (ic * x + id * y) * scale
    });
    const toScreenOrig = (x, y) => ({
      x: cx + x * scale,
      y: cy - y * scale
    });

    // 绘制原始网格（淡色）
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      const p1 = toScreenOrig(i, -10), p2 = toScreenOrig(i, 10);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      const p3 = toScreenOrig(-10, i), p4 = toScreenOrig(10, i);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }

    // 绘制变换后的网格
    ctx.strokeStyle = progress > 0.05 ? tc.gridTransform : 'transparent';
    ctx.lineWidth = 1;
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      const p1 = toScreen(i, -10), p2 = toScreen(i, 10);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      const p3 = toScreen(-10, i), p4 = toScreen(10, i);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }

    // 坐标轴
    ctx.strokeStyle = tc.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    // 绘制基向量 î, ĵ
    const iHat = toScreen(1, 0);
    const jHat = toScreen(0, 1);
    const iHatOrig = toScreenOrig(1, 0);
    const jHatOrig = toScreenOrig(0, 1);

    // 原始基向量（虚线）
    if (progress < 1) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(234, 67, 53, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(iHatOrig.x, iHatOrig.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(52, 168, 83, 0.4)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(jHatOrig.x, jHatOrig.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 变换后的基向量
    ctx.strokeStyle = '#ea4335'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(iHat.x, iHat.y); ctx.stroke();
    this.drawArrow(ctx, cx, cy, iHat.x, iHat.y, '#ea4335');
    ctx.fillStyle = '#ea4335'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('î', iHat.x + 5, iHat.y - 5);

    ctx.strokeStyle = '#34a853'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(jHat.x, jHat.y); ctx.stroke();
    this.drawArrow(ctx, cx, cy, jHat.x, jHat.y, '#34a853');
    ctx.fillStyle = '#34a853';
    ctx.fillText('ĵ', jHat.x + 5, jHat.y - 5);

    // 绘制变换后的单位正方形
    if (progress > 0.1) {
      const origin = { x: cx, y: cy };
      ctx.fillStyle = 'rgba(251, 188, 4, 0.15)';
      ctx.strokeStyle = 'rgba(251, 188, 4, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(iHat.x, iHat.y);
      const corner = toScreen(1, 1);
      ctx.lineTo(corner.x, corner.y);
      ctx.lineTo(jHat.x, jHat.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 显示行列式（面积变化）
    const det = ia * id - ib * ic;
    ctx.fillStyle = tc.text;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`det(A) = ${det.toFixed(3)}`, 15, 25);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = tc.textSecondary;
    ctx.fillText(`矩阵: [[${ia.toFixed(2)}, ${ib.toFixed(2)}], [${ic.toFixed(2)}, ${id.toFixed(2)}]]`, 15, 45);
  },

  // ============ 矩阵热力图可视化 ============

  matrixHeatmap(canvasId, matrix) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const rows = matrix.length, cols = matrix[0].length;
    const cellW = W / cols, cellH = H / rows;
    const tc = this.getThemeColors();

    ctx.clearRect(0, 0, W, H);

    // 找最大绝对值
    let maxVal = 0;
    matrix.forEach(row => row.forEach(v => maxVal = Math.max(maxVal, Math.abs(v))));
    if (maxVal === 0) maxVal = 1;

    matrix.forEach((row, i) => {
      row.forEach((val, j) => {
        const intensity = Math.abs(val) / maxVal;
        const r = val > 0 ? 234 : 66;
        const g = val > 0 ? 67 : 133;
        const b = val > 0 ? 53 : 244;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity * 0.8 + 0.05})`;
        ctx.fillRect(j * cellW, i * cellH, cellW, cellH);

        // 边框
        ctx.strokeStyle = tc.heatBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(j * cellW, i * cellH, cellW, cellH);

        // 数值
        ctx.fillStyle = intensity > 0.5 ? '#fff' : tc.text;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const displayVal = Math.abs(val) < 1e-10 ? '0' :
                           Number.isInteger(val) ? String(val) :
                           val.toFixed(2);
        ctx.fillText(displayVal, j * cellW + cellW / 2, i * cellH + cellH / 2);
      });
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  },

  // ============ 行列式几何意义可视化 ============

  determinantViz(canvasId, matrix, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const scale = options.scale || 40;
    const tc = this.getThemeColors();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = tc.bg;
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    for (let x = cx % scale; x < W; x += scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = cy % scale; y < H; y += scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 坐标轴
    ctx.strokeStyle = tc.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    const [[a, b], [c, d]] = matrix;
    const det = a * d - b * c;

    // 原始单位正方形
    ctx.fillStyle = 'rgba(251, 188, 4, 0.15)';
    ctx.strokeStyle = 'rgba(251, 188, 4, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + scale, cy);
    ctx.lineTo(cx + scale, cy - scale);
    ctx.lineTo(cx, cy - scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // 变换后的平行四边形
    const p1 = { x: cx, y: cy };
    const p2 = { x: cx + a * scale, y: cy - c * scale };
    const p3 = { x: cx + (a + b) * scale, y: cy - (c + d) * scale };
    const p4 = { x: cx + b * scale, y: cy - d * scale };

    const color = det >= 0 ? 'rgba(66, 133, 244, 0.2)' : 'rgba(234, 67, 53, 0.2)';
    const strokeColor = det >= 0 ? 'rgba(66, 133, 244, 0.8)' : 'rgba(234, 67, 53, 0.8)';

    ctx.fillStyle = color;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 向量
    ctx.strokeStyle = '#ea4335'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    this.drawArrow(ctx, cx, cy, p2.x, p2.y, '#ea4335');
    ctx.fillStyle = '#ea4335'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('î', p2.x + 5, p2.y - 5);

    ctx.strokeStyle = '#34a853';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    this.drawArrow(ctx, cx, cy, p4.x, p4.y, '#34a853');
    ctx.fillStyle = '#34a853';
    ctx.fillText('ĵ', p4.x + 5, p4.y - 5);

    // 显示行列式值
    ctx.fillStyle = tc.text;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`det = ${det.toFixed(4)}`, 15, 25);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = tc.textSecondary;
    ctx.fillText(`平行四边形面积 = |det| = ${Math.abs(det).toFixed(4)}`, 15, 45);
    if (det < 0) {
      ctx.fillStyle = '#ea4335';
      ctx.fillText('⚠️ det < 0：变换包含翻转（朝向改变）', 15, 65);
    } else if (Math.abs(det) < 1e-10) {
      ctx.fillStyle = '#fbbc04';
      ctx.fillText('⚠️ det = 0：变换降维（面积压缩为0）', 15, 65);
    }
  },

  // ============ 特征向量可视化 ============

  eigenvectorViz(canvasId, matrix, eigvals, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const scale = options.scale || 40;
    const progress = options.progress || 0; // 0: 原始, 1: 变换后
    const tc = this.getThemeColors();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = tc.bg;
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    for (let x = cx % scale; x < W; x += scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = cy % scale; y < H; y += scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 坐标轴
    ctx.strokeStyle = tc.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    const [[a, b], [c, d]] = matrix;

    // 绘制多个方向的向量，变换前后
    const angles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
    angles.forEach(deg => {
      const rad = deg * Math.PI / 180;
      const vx = Math.cos(rad) * 3;
      const vy = Math.sin(rad) * 3;
      const ox = cx + vx * scale;
      const oy = cy - vy * scale;
      const tx = cx + (a * vx + b * vy) * scale;
      const ty = cy - (c * vx + d * vy) * scale;

      const ix = ox + (tx - ox) * progress;
      const iy = oy + (ty - oy) * progress;

      ctx.strokeStyle = tc.faint;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ix, iy); ctx.stroke();
    });

    // 绘制特征向量（特殊方向）
    const colors = ['#ea4335', '#4285f4'];
    eigvals.forEach((eig, i) => {
      if (eig.isComplex || !eig.vectors || eig.vectors.length === 0) return;
      const vec = eig.vectors[0];
      if (vec.length > 2) return; // 只处理2D
      const norm = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]);
      if (norm < 1e-10) return;
      const ux = vec[0] / norm * 3;
      const uy = vec[1] / norm * 3;

      // 变换前
      const ox1 = cx + ux * scale;
      const oy1 = cy - uy * scale;
      // 变换后（特征向量方向不变，只缩放）
      const lambda = typeof eig.value === 'number' ? eig.value : 0;
      const tx1 = cx + (a * ux + b * uy) * scale;
      const ty1 = cy - (c * ux + d * uy) * scale;

      // 插值
      const ix1 = ox1 + (tx1 - ox1) * progress;
      const iy1 = oy1 + (ty1 - oy1) * progress;

      const color = colors[i % colors.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ix1, iy1); ctx.stroke();
      this.drawArrow(ctx, cx, cy, ix1, iy1, color);

      ctx.fillStyle = color;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`λ=${typeof eig.value === 'number' ? eig.value.toFixed(3) : eig.value}`, ix1 + 8, iy1 - 5);
    });

    ctx.fillStyle = tc.text;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('特征向量方向在变换中保持不变', 15, 25);
  },

  // ============ 3D向量可视化（简易） ============

  vector3D(canvasId, vectors, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const scale = options.scale || 40;
    const angleX = options.angleX || -0.5;
    const angleY = options.angleY || 0.4;
    const tc = this.getThemeColors();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = tc.bg;
    ctx.fillRect(0, 0, W, H);

    // 3D到2D投影
    const project = (x, y, z) => {
      // 绕Y轴旋转
      const x1 = x * Math.cos(angleY) - z * Math.sin(angleY);
      const z1 = x * Math.sin(angleY) + z * Math.cos(angleY);
      // 绕X轴旋转
      const y1 = y * Math.cos(angleX) - z1 * Math.sin(angleX);
      const z2 = y * Math.sin(angleX) + z1 * Math.cos(angleX);
      return { x: cx + x1 * scale, y: cy - y1 * scale, z: z2 };
    };

    // 绘制坐标轴
    const axes = [
      { from: [0, 0, 0], to: [4, 0, 0], color: '#ea4335', label: 'x' },
      { from: [0, 0, 0], to: [0, 4, 0], color: '#34a853', label: 'y' },
      { from: [0, 0, 0], to: [0, 0, 4], color: '#4285f4', label: 'z' }
    ];

    axes.forEach(axis => {
      const p1 = project(...axis.from);
      const p2 = project(...axis.to);
      ctx.strokeStyle = axis.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.fillStyle = axis.color;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(axis.label, p2.x + 5, p2.y - 5);
    });

    // 绘制向量
    const colors = ['#fbbc04', '#9334e6', '#00897b', '#d81b60'];
    vectors.forEach((vec, i) => {
      const color = vec.color || colors[i % colors.length];
      const p = project(vec.x, vec.y, vec.z);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
      this.drawArrow(ctx, cx, cy, p.x, p.y, color);
      ctx.fillStyle = color;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(vec.label || `v${i + 1}`, p.x + 5, p.y - 5);
    });
  }
};
