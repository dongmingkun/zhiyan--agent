/* app-14-misc.js —— 原 js/app.v3.19.js 第 11024–13424 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._init3DTransformScene = function _init3DTransformScene() {
    const container = document.getElementById('threejs-transform-container');
    if (!container) return;
    const W0 = container.clientWidth, H0 = container.clientHeight;
    const W = W0 > 50 ? W0 : 500, H = H0 > 50 ? H0 : 500;

    this._3dSceneT = new THREE.Scene();
    this._3dSceneT.background = new THREE.Color(0x1a1a2e);

    this._3dCameraT = new THREE.PerspectiveCamera(50, W/H, 0.1, 100);
    this._3dCameraT.position.set(6, 4, 8);
    this._3dCameraT.lookAt(0, 0, 0);

    this._3dRendererT = new THREE.WebGLRenderer({ antialias: true });
    this._3dRendererT.setSize(W, H);
    this._3dRendererT.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    const canvas = this._3dRendererT.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    this._3dOrbitT = { isDragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI/4, radius: 10, target: new THREE.Vector3(0,0,0) };
    this._setupOrbitControls(container, 'transform');
    this._3dSceneT.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    this._3dSceneT.add(dirLight);

    const grid = new THREE.GridHelper(10, 10, 0x444466, 0x222244);
    grid.name = 'grid';
    this._3dSceneT.add(grid);

    this._add3DAxes(this._3dSceneT, 5);
    this._addUnitCube(this._3dSceneT);

    this._3dTransformGroup = new THREE.Group();
    this._3dSceneT.add(this._3dTransformGroup);

    if (window.ResizeObserver) {
      if (this._3dRoT) this._3dRoT.disconnect();
      this._3dRoT = new ResizeObserver(entries => {
        for (const e of entries) {
          const w = Math.max(50, Math.floor(e.contentRect.width));
          const h = Math.max(50, Math.floor(e.contentRect.height));
          this._3dRendererT.setSize(w, h, false);
        }
      });
      this._3dRoT.observe(container);
    }

    // 调试徽标
    this._set3DStatusBadge(container, 'ready', '3D 渲染就绪 · 拖拽旋转/滚轮缩放');
  };

App._add3DAxes = function _add3DAxes(scene, length) {
    const origin = new THREE.Vector3(0, 0, 0);
    const axisColors = { x: 0xff4444, y: 0x44ff44, z: 0x4444ff };
    for (const [dir, color] of Object.entries(axisColors)) {
      const points = [origin.clone(), new THREE.Vector3(dir==='x'?length:0, dir==='y'?length:0, dir==='z'?length:0)];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
      scene.add(new THREE.Line(geom, mat));
      // Arrowhead
      const coneGeom = new THREE.ConeGeometry(0.12, 0.4, 8);
      const coneMat = new THREE.MeshBasicMaterial({ color });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      const end = points[1].clone();
      cone.position.copy(end);
      if (dir === 'x') cone.rotation.z = -Math.PI/2;
      else if (dir === 'z') cone.rotation.x = Math.PI/2;
      scene.add(cone);
    }
  };

App._addUnitCube = function _addUnitCube(scene) {
    if (this._3dUnitCube) { scene.remove(this._3dUnitCube); }
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(geom);
    const cube = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }));
    cube.position.set(0.5, 0.5, 0.5);
    cube.name = 'unitCube';
    scene.add(cube);
    if (scene === this._3dScene) this._3dUnitCube = cube;
  };

App._setupOrbitControls = function _setupOrbitControls(container, which) {
    const orbitMap = { vector: '_3dOrbit', transform: '_3dOrbitT', det3d: '_3dOrbitDet', eigen3d: '_3dOrbitEig' };
    const orbit = this[orbitMap[which] || '_3dOrbit'];
    if (!orbit) return;
    const camera = which === 'vector' ? this._3dCamera : this._3dCameraT;

    container.addEventListener('mousedown', e => { orbit.isDragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; });
    window.addEventListener('mouseup', () => { orbit.isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!orbit.isDragging) return;
      const dx = e.clientX - orbit.lastX;
      const dy = e.clientY - orbit.lastY;
      orbit.theta += dx * 0.005;  // v=20260822b 修复水平旋转方向:拖右→场景右移
      orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi - dy * 0.005));
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
    });
    container.addEventListener('wheel', e => {
      e.preventDefault();
      orbit.radius = Math.max(2, Math.min(20, orbit.radius + e.deltaY * 0.01));
    }, { passive: false });

    // v=20260903a 移动端触摸手势：单指旋转、双指缩放
    // 向后兼容：仅在支持 Pointer/Touch 事件时绑定，不影响桌面鼠标交互
    if (window.PointerEvent) {
      container.style.touchAction = 'none'; // 阻止浏览器默认滚动/缩放手势，交给我们处理
      const activePointers = new Map(); // pointerId -> {x, y}
      container.addEventListener('pointerdown', e => {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // 单指开始旋转（记录起始点）
        if (activePointers.size === 1) {
          orbit.isDragging = true;
          orbit.lastX = e.clientX;
          orbit.lastY = e.clientY;
        } else if (activePointers.size === 2) {
          // 双指开始缩放：记录初始距离
          const pts = [...activePointers.values()];
          orbit._pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          orbit._pinchRadius = orbit.radius;
          orbit.isDragging = false;
        }
        e.preventDefault();
      });
      container.addEventListener('pointermove', e => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.size === 1 && orbit.isDragging) {
          // 单指旋转
          const dx = e.clientX - orbit.lastX;
          const dy = e.clientY - orbit.lastY;
          orbit.theta += dx * 0.006;
          orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi - dy * 0.006));
          orbit.lastX = e.clientX;
          orbit.lastY = e.clientY;
        } else if (activePointers.size === 2 && orbit._pinchDist != null) {
          // 双指缩放
          const pts = [...activePointers.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const scale = d / (orbit._pinchDist || 1);
          orbit.radius = Math.max(2, Math.min(20, orbit._pinchRadius * (2 - scale) ));
        }
        e.preventDefault();
      });
      const releasePointer = e => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) {
          orbit.isDragging = false;
          orbit._pinchDist = null;
        } else if (activePointers.size === 1) {
          // 双指缩放到单指：恢复单指旋转
          const pts = [...activePointers.values()];
          orbit.isDragging = true;
          orbit.lastX = pts[0].x;
          orbit.lastY = pts[0].y;
          orbit._pinchDist = null;
        }
      };
      container.addEventListener('pointerup', releasePointer);
      container.addEventListener('pointercancel', releasePointer);
      container.addEventListener('pointerleave', releasePointer);
    }
  };

App._animate3D = function _animate3D() {
    requestAnimationFrame(() => this._animate3D());
    // det3d/eigen3d 始终用 Canvas 2D 渲染（无论 WebGL 还是降级模式）
    this._renderDet3DFrame();
    this._renderEigen3DFrame();
    // Canvas 2D 降级模式：直接绘制两帧
    if (this._useCanvas2D) {
      this._render3DCanvasFrame('vector');
      this._render3DCanvasFrame('transform');
      return;
    }
    // WebGL 模式（3D 始终渲染：canvas 元素本身会被父容器隐藏控制显示）
    if (this._3dCamera && this._3dOrbit && this._3dRenderer) {
      const o = this._3dOrbit;
      this._3dCamera.position.x = o.target.x + o.radius * Math.sin(o.phi) * Math.cos(o.theta);
      this._3dCamera.position.y = o.target.y + o.radius * Math.cos(o.phi);
      this._3dCamera.position.z = o.target.z + o.radius * Math.sin(o.phi) * Math.sin(o.theta);
      this._3dCamera.lookAt(o.target);
      this._3dRenderer.render(this._3dScene, this._3dCamera);
    }
    if (this._3dCameraT && this._3dOrbitT && this._3dRendererT) {
      const o2 = this._3dOrbitT;
      this._3dCameraT.position.x = o2.target.x + o2.radius * Math.sin(o2.phi) * Math.cos(o2.theta);
      this._3dCameraT.position.y = o2.target.y + o2.radius * Math.cos(o2.phi);
      this._3dCameraT.position.z = o2.target.z + o2.radius * Math.sin(o2.phi) * Math.sin(o2.theta);
      this._3dCameraT.lookAt(o2.target);
      this._3dRendererT.render(this._3dSceneT, this._3dCameraT);
    }
  };

  // ============ 3D 向量绘制 ============
App.update3DVector = function update3DVector() {
    const x1 = parseFloat(document.getElementById('vec3d-x')?.value) || 0;
    const y1 = parseFloat(document.getElementById('vec3d-y')?.value) || 0;
    const z1 = parseFloat(document.getElementById('vec3d-z')?.value) || 0;
    const x2 = parseFloat(document.getElementById('vec3d2-x')?.value) || 0;
    const y2 = parseFloat(document.getElementById('vec3d2-y')?.value) || 0;
    const z2 = parseFloat(document.getElementById('vec3d2-z')?.value) || 0;
    const showAdd = document.getElementById('show3d-add')?.checked ?? true;
    const showSub = document.getElementById('show3d-sub')?.checked ?? false;

    // 向量运算统计（与 2D 对齐）
    const len1 = Math.hypot(x1, y1, z1);
    const len2 = Math.hypot(x2, y2, z2);
    const dot = x1 * x2 + y1 * y2 + z1 * z2;
    const cos = (len1 && len2) ? dot / (len1 * len2) : 0;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;

    // Canvas 2D 降级模式：画布由渲染循环自动重绘，这里只更新信息面板
    if (this._useCanvas2D) {
      const infoEl = document.getElementById('vector3d-info');
      if (infoEl) infoEl.innerHTML = `
        <strong>空间向量</strong> v₁ = (${x1}, ${y1}, ${z1})<br>
        <strong>空间向量</strong> v₂ = (${x2}, ${y2}, ${z2})<br>
        <strong>模长</strong> |v₁| = ${len1.toFixed(3)}, |v₂| = ${len2.toFixed(3)}<br>
        <strong>点积</strong> v₁·v₂ = ${dot.toFixed(3)}<br>
        <strong>夹角</strong> θ = ${angle.toFixed(2)}°<br>
        <strong>正交判定</strong> ${Math.abs(dot) < 1e-10 ? '✅ 正交' : '❌ 不正交'}<br>
        🖱 拖拽旋转 · 滚轮缩放<br>
        <span style="color:#ff9a3d;">橙色</span>=v₁ · <span style="color:#22d3ee;">青色</span>=v₂ · <span style="color:#a78bfa;">紫色</span>=v₁+v₂ · <span style="color:#f472b6;">粉色</span>=v₁−v₂
      `;
      return;
    }
    if (!this._3dScene || !this._3dArrow) return;

    // Clear old arrows
    while (this._3dArrow.children.length) this._3dArrow.remove(this._3dArrow.children[0]);
    const origin = new THREE.Vector3(0, 0, 0);

    // 绘制向量箭头（v₁ 橙、v₂ 青、v₁+v₂ 紫、v₁−v₂ 粉）
    const drawArrow = (vx, vy, vz, color) => {
      const end = new THREE.Vector3(vx, vy, vz);
      const len = end.length();
      if (len < 0.001) return;
      const dir = end.clone().normalize();
      const shaftGeom = new THREE.CylinderGeometry(0.06, 0.06, len, 8);
      const shaftMat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.15) });
      const shaft = new THREE.Mesh(shaftGeom, shaftMat);
      shaft.position.copy(origin.clone().add(end).multiplyScalar(0.5));
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this._3dArrow.add(shaft);
      const headGeom = new THREE.ConeGeometry(0.15, 0.4, 8);
      const head = new THREE.Mesh(headGeom, shaftMat);
      head.position.copy(end);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this._3dArrow.add(head);
    };
    drawArrow(x1, y1, z1, 0xff9a3d);                // v₁ 橙
    drawArrow(x2, y2, z2, 0x22d3ee);                // v₂ 青
    if (showAdd) drawArrow(x1 + x2, y1 + y2, z1 + z2, 0xa78bfa);  // v₁+v₂ 紫
    if (showSub) drawArrow(x1 - x2, y1 - y2, z1 - z2, 0xf472b6);  // v₁−v₂ 粉

    // Info text
    const infoEl = document.getElementById('vector3d-info');
    if (infoEl) infoEl.innerHTML = `
      <strong>空间向量</strong> v₁ = (${x1}, ${y1}, ${z1})<br>
      <strong>空间向量</strong> v₂ = (${x2}, ${y2}, ${z2})<br>
      <strong>模长</strong> |v₁| = ${len1.toFixed(3)}, |v₂| = ${len2.toFixed(3)}<br>
      <strong>点积</strong> v₁·v₂ = ${dot.toFixed(3)}<br>
      <strong>夹角</strong> θ = ${angle.toFixed(2)}°<br>
      <strong>正交判定</strong> ${Math.abs(dot) < 1e-10 ? '✅ 正交' : '❌ 不正交'}<br>
      <strong>方向余弦</strong> v₁: cosα=${len1 ? (x1/len1).toFixed(3) : 0}, cosβ=${len1 ? (y1/len1).toFixed(3) : 0}, cosγ=${len1 ? (z1/len1).toFixed(3) : 0}<br>
      🖱 拖拽旋转 · 滚轮缩放 · 右键平移<br>
      <span style="color:#ff9a3d;">橙色</span>=v₁ · <span style="color:#22d3ee;">青色</span>=v₂ · <span style="color:#a78bfa;">紫色</span>=v₁+v₂ · <span style="color:#f472b6;">粉色</span>=v₁−v₂
    `;
  };

App.update3DScene = function update3DScene() {
    if (!this._3dScene) return;
    const showCube = document.getElementById('show3d-unit-cube')?.checked ?? true;
    const showGrid = document.getElementById('show3d-grid')?.checked ?? true;
    this._3dScene.children.forEach(child => {
      if (child.name === 'unitCube') child.visible = showCube;
      if (child.name === 'grid') child.visible = showGrid;
    });
    if (this._3dSceneT) {
      this._3dSceneT.children.forEach(child => {
        if (child.name === 'unitCube') child.visible = showCube;
        if (child.name === 'grid') child.visible = showGrid;
      });
    }
  };

  // ============ 3D 线性变换 ============
App._get3DMatrix = function _get3DMatrix() {
    const els = ['m3d-11','m3d-12','m3d-13','m3d-21','m3d-22','m3d-23','m3d-31','m3d-32','m3d-33'];
    const vals = els.map(id => parseFloat(document.getElementById(id)?.value) || 0);
    return [
      [vals[0], vals[1], vals[2]],
      [vals[3], vals[4], vals[5]],
      [vals[6], vals[7], vals[8]]
    ];
  };

App._set3DMatrix = function _set3DMatrix(m) {
    const ids = ['m3d-11','m3d-12','m3d-13','m3d-21','m3d-22','m3d-23','m3d-31','m3d-32','m3d-33'];
    let k = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const el = document.getElementById(ids[k++]);
      if (el) el.value = m[i][j];
    }
    this.update3DTransform();
  };

App.update3DTransform = function update3DTransform() {
    const M = this._get3DMatrix();

    // Canvas 2D 降级模式：画布由渲染循环自动重绘，这里只更新信息面板
    if (this._useCanvas2D) {
      const det = M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])
                - M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])
                + M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0]);
      const infoEl = document.getElementById('transform3d-info');
      if (infoEl) infoEl.innerHTML = `
        <strong>行列式</strong> det(A) = ${det.toFixed(3)}<br>
        <strong>几何意义</strong> ${det > 0 ? '保持空间定向，体积缩放 ' + det.toFixed(2) + ' 倍' : det < 0 ? '翻转空间定向' : '空间降维（退化）'}<br>
        原始向量 <span style="color:#ea4335;">红色</span> · 变换后 <span style="color:#4285f4;">蓝色</span>
      `;
      return;
    }
    if (!this._3dSceneT || !this._3dTransformGroup) return;

    // Clear old
    while (this._3dTransformGroup.children.length) this._3dTransformGroup.remove(this._3dTransformGroup.children[0]);

    // Original vectors (red)
    const origVectors = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 1, 0), new THREE.Vector3(1, 0, 1)
    ];
    // Transformed vectors (blue)
    const apply3D = (m, v) => new THREE.Vector3(
      m[0][0]*v.x + m[0][1]*v.y + m[0][2]*v.z,
      m[1][0]*v.x + m[1][1]*v.y + m[1][2]*v.z,
      m[2][0]*v.x + m[2][1]*v.y + m[2][2]*v.z
    );

    for (const v of origVectors) {
      const tv = apply3D(M, v);
      // Original (red)
      this._add3DArrowToGroup(this._3dTransformGroup, v, 0xea4335, 0.04);
      // Transformed (blue)
      this._add3DArrowToGroup(this._3dTransformGroup, tv, 0x4285f4, 0.04);
    }

    // Show determinant
    const det = M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])
              - M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])
              + M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0]);
    const infoEl = document.getElementById('transform3d-info');
    if (infoEl) infoEl.innerHTML = `
      <strong>行列式</strong> det(A) = ${det.toFixed(3)}<br>
      <strong>几何意义</strong> ${det > 0 ? '保持空间定向，体积缩放 ' + det.toFixed(2) + ' 倍' : det < 0 ? '翻转空间定向' : '空间降维（退化）'}<br>
      原始向量 <span style="color:#ea4335;">红色</span> · 变换后 <span style="color:#4285f4;">蓝色</span>
    `;
  };

App._add3DArrowToGroup = function _add3DArrowToGroup(group, end, color, radius) {
    const origin = new THREE.Vector3(0, 0, 0);
    const len = end.length();
    if (len < 0.001) return;
    const dir = end.clone().normalize();
    const shaftGeom = new THREE.CylinderGeometry(radius, radius, len, 6);
    const mat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.2) });
    const shaft = new THREE.Mesh(shaftGeom, mat);
    shaft.position.copy(end.clone().multiplyScalar(0.5));
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(shaft);
    const headGeom = new THREE.ConeGeometry(radius*3, 0.3, 6);
    const head = new THREE.Mesh(headGeom, mat);
    head.position.copy(end);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(head);
  };

App.preset3D = function preset3D(type) {
    const presets = {
      identity: [[1,0,0],[0,1,0],[0,0,1]],
      scale: [[2,0,0],[0,1,0],[0,0,0.5]],
      rotateX: [[1,0,0],[0,Math.cos(Math.PI/4),-Math.sin(Math.PI/4)],[0,Math.sin(Math.PI/4),Math.cos(Math.PI/4)]],
      rotateY: [[Math.cos(Math.PI/4),0,Math.sin(Math.PI/4)],[0,1,0],[-Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)]],
      rotateZ: [[Math.cos(Math.PI/4),-Math.sin(Math.PI/4),0],[Math.sin(Math.PI/4),Math.cos(Math.PI/4),0],[0,0,1]],
      shear: [[1,0.5,0],[0,1,0.3],[0,0,1]],
      project: [[1,0,0],[0,1,0],[0,0,0]]
    };
    if (presets[type]) this._set3DMatrix(presets[type].map(r => r.map(v => parseFloat(v.toFixed(2)))));
  };

  /**
   * 3D 线性变换动画演示（对齐 2D：从单位矩阵渐变到当前矩阵）
   * 再次点击可停止
   */
App.animate3DTransform = function animate3DTransform() {
    const btn = document.getElementById('transform3d-btn');
    const slider = document.getElementById('transform3d-slider');
    if (this._3dAnimRunning) {
      cancelAnimationFrame(this._3dAnimFrame);
      this._3dAnimRunning = false;
      if (btn) btn.textContent = '▶ 动画演示';
      return;
    }
    const M = this._get3DMatrix();
    const I = [[1,0,0],[0,1,0],[0,0,1]];
    this._3dAnimRunning = true;
    if (btn) btn.textContent = '⏸ 停止动画';
    const start = Date.now();
    const DURATION = 2600;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      // easeInOutQuad 缓动
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const interp = I.map((row, i) => row.map((v, j) => v + (M[i][j] - v) * eased));
      this._set3DMatrix(interp);
      if (slider) slider.value = Math.round(eased * 100);
      const prog = document.getElementById('transform3d-progress');
      if (prog) prog.textContent = Math.round(eased * 100) + '%';
      if (t < 1) {
        this._3dAnimFrame = requestAnimationFrame(step);
      } else {
        this._3dAnimRunning = false;
        if (btn) btn.textContent = '▶ 动画演示';
      }
    };
    step();
  };

  /**
   * 3D 线性变换滑块（对齐 2D：从单位矩阵渐变到当前矩阵，0-100 控制进度）
   */
App.set3DTransformProgress = function set3DTransformProgress(val) {
    if (this._3dAnimRunning) {
      cancelAnimationFrame(this._3dAnimFrame);
      this._3dAnimRunning = false;
      const btn = document.getElementById('transform3d-btn');
      if (btn) btn.textContent = '▶ 动画演示';
    }
    const t = Math.max(0, Math.min(1, parseFloat(val) / 100 || 0));
    const M = this._get3DMatrix();
    const I = [[1,0,0],[0,1,0],[0,0,1]];
    const interp = I.map((row, i) => row.map((v, j) => v + (M[i][j] - v) * t));
    this._set3DMatrix(interp);
    const prog = document.getElementById('transform3d-progress');
    if (prog) prog.textContent = Math.round(t * 100) + '%';
  };

  // ============ 3D 行列式几何意义（体积缩放） ============
App._get3DMatrixFromIds = function _get3DMatrixFromIds(prefix) {
    const ids = ['11','12','13','21','22','23','31','32','33'];
    const vals = ids.map(k => parseFloat(document.getElementById(prefix + '-' + k)?.value) || 0);
    return [
      [vals[0], vals[1], vals[2]],
      [vals[3], vals[4], vals[5]],
      [vals[6], vals[7], vals[8]]
    ];
  };

App._det3 = function _det3(M) {
    return M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])
         - M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])
         + M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0]);
  };

App._matVec3 = function _matVec3(M, v) {
    return [
      M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2],
      M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2],
      M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2]
    ];
  };

  /** 幂迭代求主特征对（3×3） */
App._powerIteration = function _powerIteration(M, maxIter = 300, tol = 1e-12) {
    let v = [1, 0.3, 0.2];
    let lambda = 0;
    for (let i = 0; i < maxIter; i++) {
      const Mv = this._matVec3(M, v);
      const norm = Math.hypot(Mv[0], Mv[1], Mv[2]);
      if (norm < 1e-14) return { lambda: 0, vector: [0, 0, 0] };
      const next = [Mv[0]/norm, Mv[1]/norm, Mv[2]/norm];
      if (Math.abs(next[0]-v[0]) + Math.abs(next[1]-v[1]) + Math.abs(next[2]-v[2]) < tol) {
        v = next; lambda = norm; break;
      }
      v = next; lambda = norm;
    }
    // 符号修正：Av 与 λv 同向
    const Av = this._matVec3(M, v);
    const sgn = (Av[0]*v[0] + Av[1]*v[1] + Av[2]*v[2]) >= 0 ? 1 : -1;
    return { lambda: lambda * sgn, vector: v };
  };

App.updateDet3D = function updateDet3D() {
    const M = this._get3DMatrixFromIds('det3d');
    const det = this._det3(M);
    const infoEl = document.getElementById('det3d-info');
    if (infoEl) infoEl.innerHTML = `
      <strong>行列式</strong> |det(A)| = ${Math.abs(det).toFixed(3)}<br>
      <strong>几何意义</strong> ${det > 0.0001 ? '保持空间定向，体积放大 ' + Math.abs(det).toFixed(2) + ' 倍' : det < -0.0001 ? '翻转空间定向，体积放大 ' + Math.abs(det).toFixed(2) + ' 倍' : '空间压缩（det=0，降维）'}<br>
      <strong>det(A)</strong> = ${det.toFixed(3)} ${det < 0 ? '（负值 → 定向翻转）' : ''}
    `;
  };

  /** 绘制 3D 行列式几何意义（Canvas2D 投影） */
App._renderDet3DFrame = function _renderDet3DFrame() {
    const container = document.getElementById('det3d-container');
    const canvas = container ? container.querySelector('canvas') : null;
    if (!canvas) return;
    const orbit = this._3dOrbitDet || this._3dOrbit;
    const w = canvas._w || 500, h = canvas._h || 500, dpr = canvas._dpr || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    const P = (x, y, z) => this._3dProject(x, y, z, orbit, w, h);
    const M = this._get3DMatrixFromIds('det3d');
    const det = this._det3(M);

    // 单位立方体 8 顶点（黄色虚线）
    const unit = [];
    for (let i = 0; i < 8; i++) unit.push([i&1, (i>>1)&1, (i>>2)&1]);
    const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];

    // 变换后平行六面体（蓝色/红色实线）
    const trans = unit.map(v => this._matVec3(M, v));

    // 坐标轴
    const origin = P(0, 0, 0);
    this._3dLine2D(ctx, origin, P(3, 0, 0), '#ff5555', 1.6, true);
    this._3dLine2D(ctx, origin, P(0, 3, 0), '#55ff55', 1.6, true);
    this._3dLine2D(ctx, origin, P(0, 0, 3), '#5588ff', 1.6, true);

    // 原始单位立方体（黄虚线）
    const uPts = unit.map(v => P(v[0], v[1], v[2]));
    ctx.strokeStyle = 'rgba(250,204,21,0.7)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    edges.forEach(([i, j]) => {
      ctx.beginPath(); ctx.moveTo(uPts[i].x, uPts[i].y); ctx.lineTo(uPts[j].x, uPts[j].y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // 变换后平行六面体（蓝/红实线）
    const tPts = trans.map(v => P(v[0], v[1], v[2]));
    const color = det >= 0 ? '#3b82f6' : '#ef4444';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    edges.forEach(([i, j]) => {
      ctx.beginPath(); ctx.moveTo(tPts[i].x, tPts[i].y); ctx.lineTo(tPts[j].x, tPts[j].y); ctx.stroke();
    });
    // 顶点
    tPts.forEach(p => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    });

    // 图例（半透明背景框 + 粗体大字）
    ctx.font = 'bold 16px sans-serif';
    const legendLines = [
      { text: '■ 单位立方体（体积 = 1）', color: 'rgba(250,204,21,1)' },
      { text: '■ 变换后平行六面体 |det| = ' + Math.abs(det).toFixed(2), color: color }
    ];
    legendLines.forEach((line, i) => {
      const y = 24 + i * 22;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, y - 16, ctx.measureText(line.text).width + 16, 22);
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, 18, y);
    });
  };

  // ============ 3D 特征向量可视化 ============
App.updateEigen3D = function updateEigen3D() {
    const M = this._get3DMatrixFromIds('eig3d');
    const infoEl = document.getElementById('eigen3d-info');
    const tr = M[0][0] + M[1][1] + M[2][2];
    const det = this._det3(M);
    // 幂迭代求主特征对
    const eig = this._powerIteration(M);
    if (infoEl) infoEl.innerHTML = `
      <strong>主特征值</strong> λ_max ≈ ${eig.lambda.toFixed(4)}<br>
      <strong>特征向量</strong> v ≈ [${eig.vector.map(v => v.toFixed(3)).join(', ')}]<br>
      <strong>验证</strong> Av = λv（幂迭代，方向不变）<br>
      <strong>迹</strong> tr(A) = ${tr.toFixed(3)} = Σλᵢ<br>
      <strong>行列式</strong> |A| = ${det.toFixed(3)} = Πλᵢ
    `;
  };

  /** 绘制 3D 特征向量（Canvas2D 投影） */
App._renderEigen3DFrame = function _renderEigen3DFrame() {
    const container = document.getElementById('eigen3d-container');
    const canvas = container ? container.querySelector('canvas') : null;
    if (!canvas) return;
    const orbit = this._3dOrbitEig || this._3dOrbit;
    const w = canvas._w || 500, h = canvas._h || 500, dpr = canvas._dpr || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    const P = (x, y, z) => this._3dProject(x, y, z, orbit, w, h);
    const M = this._get3DMatrixFromIds('eig3d');
    const origin = P(0, 0, 0);

    // 坐标轴
    this._3dLine2D(ctx, origin, P(3, 0, 0), '#ff5555', 1.6, true);
    this._3dLine2D(ctx, origin, P(0, 3, 0), '#55ff55', 1.6, true);
    this._3dLine2D(ctx, origin, P(0, 0, 3), '#5588ff', 1.6, true);

    // 非特征方向的灰线（变换后方向改变：A·v vs v）
    const grey = [1, 0.7, 0.4];
    const g2 = this._matVec3(M, grey);
    const gNorm = Math.hypot(g2[0], g2[1], g2[2]);
    if (gNorm > 1e-6) {
      const gEnd = [g2[0]/gNorm*2.2, g2[1]/gNorm*2.2, g2[2]/gNorm*2.2];
      ctx.strokeStyle = 'rgba(160,160,175,0.5)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      const a = P(-grey[0], -grey[1], -grey[2]), b = P(grey[0], grey[1], grey[2]);
      const a2 = P(-gEnd[0], -gEnd[1], -gEnd[2]), b2 = P(gEnd[0], gEnd[1], gEnd[2]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 特征向量（双向粗线，红/绿/蓝交替）——幂迭代主特征向量
    const eig = this._powerIteration(M);
    const vlen = Math.hypot(eig.vector[0], eig.vector[1], eig.vector[2]);
    if (vlen > 1e-6 && Math.abs(eig.lambda) > 1e-6) {
      const dir = eig.vector.map(v => v / vlen);
      const len = 2.4;
      const colors = ['#ff5555', '#55ff55', '#5588ff', '#ffcc44'];
      const col = colors[0];
      const a = P(-dir[0]*len, -dir[1]*len, -dir[2]*len);
      const b = P(dir[0]*len, dir[1]*len, dir[2]*len);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // 箭头
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const ah = Math.min(12, Math.hypot(b.x-a.x, b.y-a.y)*0.2);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ah*Math.cos(angle-0.4), b.y - ah*Math.sin(angle-0.4));
      ctx.lineTo(b.x - ah*Math.cos(angle+0.4), b.y - ah*Math.sin(angle+0.4));
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + ah*Math.cos(angle-0.4), a.y + ah*Math.sin(angle-0.4));
      ctx.lineTo(a.x + ah*Math.cos(angle+0.4), a.y + ah*Math.sin(angle+0.4));
      ctx.closePath(); ctx.fill();
    }

    // 图例（半透明背景框 + 粗体大字）
    ctx.font = 'bold 16px sans-serif';
    const legendLines = [
      { text: '━ 特征向量（方向不变，缩放 λ = ' + (eig.lambda.toFixed(2) || '?') + '）', color: 'rgba(255,85,85,1)' },
      { text: '┄ 非特征方向（变换后方向改变）', color: 'rgba(190,190,200,1)' }
    ];
    legendLines.forEach((line, i) => {
      const y = 24 + i * 22;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, y - 16, ctx.measureText(line.text).width + 16, 22);
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, 18, y);
    });
  };

  /**
   * 3D 特征向量动画：旋转视角展示特征方向（再次点击停止）
   */
App.animateEigen3D = function animateEigen3D() {
    const btn = document.getElementById('eigen3d-btn');
    if (this._3dEigAnimRunning) {
      cancelAnimationFrame(this._3dEigAnimFrame);
      this._3dEigAnimRunning = false;
      if (btn) btn.textContent = '▶ 动画演示';
      return;
    }
    this._3dEigAnimRunning = true;
    if (btn) btn.textContent = '⏸ 停止动画';
    const spin = () => {
      const o = this._3dOrbitEig;
      if (o) o.theta += 0.012;
      if (!this._3dEigAnimRunning) return;
      this._3dEigAnimFrame = requestAnimationFrame(spin);
    };
    spin();
  };

App.updateVectorViz = function updateVectorViz() {
    const v1x = parseFloat(document.getElementById('vec1-x').value) || 0;
    const v1y = parseFloat(document.getElementById('vec1-y').value) || 0;
    const v2x = parseFloat(document.getElementById('vec2-x').value) || 0;
    const v2y = parseFloat(document.getElementById('vec2-y').value) || 0;

    const vectors = [
      { x: v1x, y: v1y, label: `v₁(${v1x},${v1y})`, color: '#ea4335' },
      { x: v2x, y: v2y, label: `v₂(${v2x},${v2y})`, color: '#4285f4' }
    ];

    if (document.getElementById('show-add').checked) {
      vectors.push({ x: v1x + v2x, y: v1y + v2y, label: `v₁+v₂(${v1x+v2x},${v1y+v2y})`, color: '#34a853' });
    }
    if (document.getElementById('show-sub').checked) {
      vectors.push({ x: v1x - v2x, y: v1y - v2y, label: `v₁-v₂(${v1x-v2x},${v1y-v2y})`, color: '#fbbc04' });
    }

    Visualizer.vector2D('canvas-vectors', vectors, { scale: 35 });

    const dot = v1x * v2x + v1y * v2y;
    const norm1 = Math.sqrt(v1x*v1x + v1y*v1y);
    const norm2 = Math.sqrt(v2x*v2x + v2y*v2y);
    const cos = (norm1 && norm2) ? dot / (norm1 * norm2) : 0;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;

    document.getElementById('vector-info').innerHTML = `
      <strong>点积</strong> v₁·v₂ = ${dot.toFixed(4)}<br>
      <strong>模长</strong> |v₁| = ${norm1.toFixed(4)}, |v₂| = ${norm2.toFixed(4)}<br>
      <strong>夹角</strong> θ = ${angle.toFixed(2)}°<br>
      <strong>正交判定</strong> ${Math.abs(dot) < 1e-10 ? '✅ 正交' : '❌ 不正交'}
    `;
  };

App.updateTransformViz = function updateTransformViz() {
    const a = parseFloat(document.getElementById('viz-matrix-a').value) || 1;
    const b = parseFloat(document.getElementById('viz-matrix-b').value) || 0;
    const c = parseFloat(document.getElementById('viz-matrix-c').value) || 0;
    const d = parseFloat(document.getElementById('viz-matrix-d').value) || 1;

    Visualizer.linearTransform('canvas-transform', [[a, b], [c, d]], {
      scale: 40,
      progress: this.transformProgress
    });

    const percent = Math.round(this.transformProgress * 100);
    document.getElementById('transform-progress').textContent = `${percent}%`;
  };

App.animateTransform = function animateTransform() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      return;
    }

    const animate = () => {
      this.transformProgress += 0.02 * this.transformDirection;
      if (this.transformProgress >= 1) {
        this.transformProgress = 1;
        this.transformDirection = -1;
      }
      if (this.transformProgress <= 0) {
        this.transformProgress = 0;
        this.transformDirection = 1;
      }
      this.updateTransformViz();
      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  };

App.setTransformProgress = function setTransformProgress(val) {
    this.transformProgress = val;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.updateTransformViz();
  };

App.setPresetTransform = function setPresetTransform(name) {
    let a, b, c, d;
    switch(name) {
      case 'identity': a=1; b=0; c=0; d=1; break;
      case 'scale': a=2; b=0; c=0; d=2; break;
      case 'rotate': const ang = Math.PI/4; a=Math.cos(ang); b=-Math.sin(ang); c=Math.sin(ang); d=Math.cos(ang); break;
      case 'shear': a=1; b=1; c=0; d=1; break;
      case 'reflect': a=-1; b=0; c=0; d=1; break;
      case 'project': a=1; b=0; c=0; d=0; break;
      case 'singular': a=1; b=1; c=1; d=1; break;
    }
    document.getElementById('viz-matrix-a').value = a.toFixed(2);
    document.getElementById('viz-matrix-b').value = b.toFixed(2);
    document.getElementById('viz-matrix-c').value = c.toFixed(2);
    document.getElementById('viz-matrix-d').value = d.toFixed(2);
    this.updateTransformViz();
  };

App.updateDetViz = function updateDetViz() {
    const a = parseFloat(document.getElementById('det-a').value) || 1;
    const b = parseFloat(document.getElementById('det-b').value) || 0;
    const c = parseFloat(document.getElementById('det-c').value) || 0;
    const d = parseFloat(document.getElementById('det-d').value) || 1;
    Visualizer.determinantViz('canvas-det', [[a, b], [c, d]], { scale: 40 });
  };

App.updateEigenViz = function updateEigenViz() {
    const a = parseFloat(document.getElementById('eig-a').value) || 2;
    const b = parseFloat(document.getElementById('eig-b').value) || 0;
    const c = parseFloat(document.getElementById('eig-c').value) || 0;
    const d = parseFloat(document.getElementById('eig-d').value) || 3;

    const matrix = [[a, b], [c, d]];
    const eigs = LinAlg.eigenvalues(matrix);
    Visualizer.eigenvectorViz('canvas-eigen', matrix, eigs, {
      scale: 40,
      progress: this.transformProgress
    });

    let info = '';
    eigs.forEach((eig, i) => {
      info += `<strong>λ${i+1}</strong> = ${typeof eig.value === 'number' ? eig.value.toFixed(4) : eig.value}`;
      if (eig.vectors && eig.vectors.length > 0) {
        info += `, 特征向量 [${eig.vectors[0].map(v => v.toFixed(3)).join(', ')}]`;
      }
      info += '<br>';
    });
    info += `<br><strong>迹</strong> tr(A) = ${(a+d).toFixed(4)} = Σλᵢ<br>`;
    info += `<strong>行列式</strong> |A| = ${(a*d-b*c).toFixed(4)} = Πλᵢ<br>`;
    info += `<strong>对角化</strong> ${eigs.every(e => e.vectors && e.vectors.length > 0) ? '✅ 可对角化' : '❌ 不可对角化'}`;
    document.getElementById('eigen-info').innerHTML = info;
  };

App.animateEigen = function animateEigen() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      return;
    }
    const animate = () => {
      this.transformProgress += 0.015 * this.transformDirection;
      if (this.transformProgress >= 1) { this.transformProgress = 1; this.transformDirection = -1; }
      if (this.transformProgress <= 0) { this.transformProgress = 0; this.transformDirection = 1; }
      this.updateEigenViz();
      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  };

  // ============ 事件绑定 ============

  // ============ 主题管理 ============

App.loadTheme = function loadTheme() {
    const saved = localStorage.getItem('la-tutor-theme') || 'indigo';
    this.setTheme(saved);
  };

App.setTheme = function setTheme(theme) {
    if (!this.themes[theme]) return;
    this.currentTheme = theme;

    // 移除所有主题属性
    document.documentElement.removeAttribute('data-theme');
    if (theme !== 'indigo') {
      document.documentElement.setAttribute('data-theme', theme);
    }

    // 保存到 localStorage
    localStorage.setItem('la-tutor-theme', theme);

    // 更新切换器显示
    const nameEl = document.getElementById('theme-current-name');
    const dotEl = document.getElementById('theme-current-dot');
    if (nameEl) nameEl.textContent = this.themes[theme].name;
    if (dotEl) {
      if (theme === 'dark') {
        dotEl.style.background = 'linear-gradient(135deg, #1e293b, #475569)';
      } else {
        dotEl.style.background = this.themes[theme].color;
      }
    }

    // 更新选项激活状态
    document.querySelectorAll('.theme-option').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === theme);
    });

    // 如果当前在可视化视图，重绘 Canvas
    if (this.currentView === 'visualizer') {
      setTimeout(() => this.initVisualizer(), 50);
    }
  };

App.initThemeSwitcher = function initThemeSwitcher() {
    const btn = document.getElementById('theme-toggle-btn');
    const panel = document.getElementById('theme-panel');

    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
      });
    }

    // 点击主题选项
    document.querySelectorAll('.theme-option').forEach(el => {
      el.addEventListener('click', () => {
        this.setTheme(el.dataset.theme);
        panel.classList.remove('show');
      });
    });

    // 点击外部关闭面板
    document.addEventListener('click', (e) => {
      if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        panel.classList.remove('show');
      }
    });
  };

  // ============ 回到顶部 ============

App.initBackToTop = function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    // 为所有可滚动容器添加监听
    const scrollContainers = document.querySelectorAll(
      '#chat-messages, .tools-body, .viz-body, .knowledge-content-area, #quiz-content, #practice-content, #mistakes-content'
    );

    scrollContainers.forEach(container => {
      container.addEventListener('scroll', () => {
        if (container.scrollTop > 200) {
          btn.classList.add('visible');
        } else {
          btn.classList.remove('visible');
        }
      });
    });

    // 点击回到顶部
    btn.addEventListener('click', () => {
      const activeContainer = this.getActiveScrollContainer();
      if (activeContainer) {
        activeContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
      btn.classList.remove('visible');
    });
  };

App.getActiveScrollContainer = function getActiveScrollContainer() {
    const view = this.currentView;
    const map = {
      chat: '#chat-messages',
      tools: '.tools-body',
      visualizer: '.viz-body',
      knowledge: '.knowledge-content-area',
      quiz: '#quiz-content',
      practice: '#practice-content',
      mistakes: '#mistakes-content'
    };
    const selector = map[view];
    return selector ? document.querySelector(selector) : null;
  };

  // ============ 移动端抽屉导航 ============
App.initMobileNav = function initMobileNav() {
    const toggle = document.getElementById('sidebarToggle');
    const backdrop = document.getElementById('sidebarBackdrop');
    const container = document.getElementById('app-container');
    const closeBtn = document.getElementById('sidebarClose');
    if (!toggle || !backdrop || !container) return;
    const hamText = toggle.querySelector('.ham-text');
    // v=20260903s 视口分流：>900px 桌面端真折叠（toggle sidebar-hidden），≤768px 抽屉（sidebar-open），
    // 901~932 触摸中屏沿用 isMobile 判定走抽屉。
    const isDesktopCollapse = () => window.matchMedia('(min-width: 901px)').matches;
    // v=20260903s 桌面收起偏好：localStorage 记忆，刷新后保持
    const prefKey = 'sidebar_pref';
    const readPref = () => { try { return localStorage.getItem(prefKey); } catch (e) { return null; } };
    const writePref = (v) => { try { localStorage.setItem(prefKey, v); } catch (e) {} };
    const syncState = () => {
      const isDesktop = isDesktopCollapse();
      if (isDesktop) {
        // 桌面：依据 sidebar-hidden 判断收起/展开
        const hidden = container.classList.contains('sidebar-hidden');
        const label = hidden ? '展开侧边菜单' : '收起侧边菜单';
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('title', hidden ? '展开侧边菜单' : '收起侧边菜单');
        if (hamText) hamText.textContent = hidden ? '展开' : '菜单';
        // 桌面常驻态不显示抽屉"关闭"按钮（它只在 ≤768px 抽屉态出现）
        if (closeBtn) closeBtn.style.display = 'none';
        toggle.style.visibility = 'visible';
        toggle.style.pointerEvents = '';
      } else {
        const open = container.classList.contains('sidebar-open');
        const label = open ? '关闭侧边菜单' : '打开侧边菜单';
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('title', open ? '关闭菜单' : '侧边菜单');
        if (hamText) hamText.textContent = open ? '关闭' : '菜单';
        // 打开抽屉时隐藏顶部固定按钮，改用侧边栏内的关闭按钮，避免覆盖 Logo
        if (closeBtn) {
          toggle.style.visibility = open ? 'hidden' : 'visible';
          toggle.style.pointerEvents = open ? 'none' : '';
          closeBtn.style.display = open ? 'inline-flex' : 'none';
        }
      }
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDesktopCollapse()) {
        // v=20260903s 桌面真折叠：切换 sidebar-hidden，收起/展开
        const hidden = container.classList.toggle('sidebar-hidden');
        writePref(hidden ? 'hidden' : 'shown');
      } else {
        container.classList.toggle('sidebar-open');
      }
      syncState();
    });
    backdrop.addEventListener('click', () => {
      container.classList.remove('sidebar-open');
      syncState();
    });
    // 按 Esc 关闭（抽屉态）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && container.classList.contains('sidebar-open')) {
        container.classList.remove('sidebar-open');
        syncState();
      }
    });
    // v=20260903q 加固：给 #sidebarClose 直接绑 addEventListener，防 inline onclick 失效
    // （旧版 PWA/SW shell 里按钮可能没有 onclick 属性，或 App 对象尚未就绪）
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-open');  // 防御 body.sidebar-open 规则
        syncState();
      });
    }
    // v=20260903s 初始化恢复桌面收起偏好
    if (isDesktopCollapse() && readPref() === 'hidden') {
      container.classList.add('sidebar-hidden');
    }
    // 程序关闭时同步一次
    const _origClose = this._closeSidebar;
    this._closeSidebar = () => { _origClose.call(this); syncState(); };
    syncState();
  };

  // 关闭侧边栏（移动端抽屉）
App._closeSidebar = function _closeSidebar() {
    const container = document.getElementById('app-container');
    if (container) container.classList.remove('sidebar-open');
    // v=20260903q 防御：CSS 存在 body.sidebar-open 规则，一并清除，避免抽屉残留打开态
    document.body.classList.remove('sidebar-open');
  };

  // ============ v=20260908g 左上角入口一次性教练标记（coach mark） ============
  // 给 .sidebar-toggle 汉堡按钮加一个小气泡引导「点这里，打开学习中心」。
  // 一次性：localStorage.sidebar_coach_seen 记已看，看过不再弹。
App.initSidebarCoach = function initSidebarCoach() {
    // localStorage 不可用时静默跳过
    let storage = null;
    try { storage = window.localStorage; } catch (e) { return; }
    const KEY = 'sidebar_coach_seen';
    if (storage.getItem(KEY)) return;  // 已看过，不再弹

    const toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;

    // 延迟到首帧后，等布局稳定 + 视图渲染完成再判断
    const tryShow = () => {
      if (storage.getItem(KEY)) return;  // 期间可能已被标记
      const container = document.getElementById('app-container');
      const isDesktop = window.matchMedia('(min-width: 901px)').matches;

      // ④ 侧栏本来就已展开就不弹：
      //  - 桌面端：sidebar-hidden 表示"已收起"，只有收起态才是"可展开"→ 才需要引导
      //  - 移动端：sidebar-open 表示抽屉已打开，未开才引导
      let sidebarCollapsed;
      if (isDesktop) {
        sidebarCollapsed = container ? container.classList.contains('sidebar-hidden') : false;
      } else {
        sidebarCollapsed = container ? !container.classList.contains('sidebar-open') : true;
      }
      // 桌面端侧栏默认展开（无 sidebar-hidden）时，不弹
      if (!sidebarCollapsed) return;

      // 按钮不可见（如抽屉已开被隐藏）时不弹
      const rect = toggle.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // 注意:不要限制 currentView === 'home',因为 App.currentView 默认是 'chat' 等非 home,
      // 真实场景里用户首屏看到侧栏按钮就需要引导(任何视图只要有按钮在视野里都该出现)
      // 创建气泡
      const coach = document.createElement('div');
      coach.id = 'sidebar-coach';
      coach.className = 'sidebar-coach';
      coach.setAttribute('role', 'tooltip');
      coach.innerHTML = `<button class="sidebar-coach-close" type="button" aria-label="关闭引导">×</button>` +
        `<span class="sidebar-coach-text">点这里，打开学习中心</span>` +
        `<span class="sidebar-coach-arrow"></span>`;
      document.body.appendChild(coach);

      // 标记已看（写入即视为看过，任何一次展示都算）
      const markSeen = () => {
        try { storage.setItem(KEY, '1'); } catch (e) {}
      };
      const dismiss = () => {
        coach.classList.add('sidebar-coach-leave');
        markSeen();
        setTimeout(() => coach.remove(), 300);
      };

      // 关键：气泡一旦展示就立即写入已看标记，保证刷新/再进入不再重复弹
      // （点击关闭、点按钮打开侧栏、8 秒自动淡出都只是视觉消失，标记已经写好）
      markSeen();

      // ③ 消失时机：
      //  a) 点击 toggle 打开侧栏 → 立即消失并标记
      const onToggleClick = () => { dismiss(); };
      toggle.addEventListener('click', onToggleClick, { once: true });
      //  b) 点气泡本身(关闭按钮 × / 气泡任意处) → 手动关闭
      coach.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });
      //  c) 最多 8 秒后自动淡出
      this._sidebarCoachTimer = setTimeout(dismiss, 8000);

      // 位置：锚定在 toggle 右侧（箭头指向按钮）
      const place = () => {
        const r = toggle.getBoundingClientRect();
        const vw = window.innerWidth;
        const bubbleW = coach.offsetWidth || 210;
        // 默认放在按钮右侧，箭头在左指向按钮；右侧放不下则放按钮下方，箭头在上
        const gap = 12;
        let left = r.right + gap;
        let top = r.top + r.height / 2 - (coach.offsetHeight || 44) / 2;
        let below = false;
        if (left + bubbleW > vw - 8) {
          left = Math.max(8, r.left);
          top = r.bottom + gap;
          below = true;
        }
        coach.style.left = left + 'px';
        coach.style.top = Math.max(8, top) + 'px';
        coach.classList.toggle('sidebar-coach-below', below);
      };
      requestAnimationFrame(() => { place(); coach.classList.add('sidebar-coach-show'); });
      // 窗口变化重定位（但已隐藏/移除则不处理）
      window.addEventListener('resize', place, { passive: true });
    };

    // 首帧后再判断一次，确保 DOM 就绪
    requestAnimationFrame(() => {
      setTimeout(tryShow, 300);
    });
  };

  // 事件委托兜底（v=20260903q）：捕获阶段拦截 #sidebarClose 点击，
  // 防按钮被重渲染后监听丢失、或被其它 handler stopPropagation 拦截。
  // 放在类初始化时挂一次即可（见 _bindGlobalDelegates / constructor）。
App._bindSidebarCloseDelegate = function _bindSidebarCloseDelegate() {
    if (this._sidebarCloseDelegateBound) return;
    this._sidebarCloseDelegateBound = true;
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('#sidebarClose')) {
        this._closeSidebar();
      }
    }, true);
  };

  // ============ 移动端检测与底部 Tab 导航 ============

  /* 智能设备检测：宽度为主，触摸为辅（覆盖手机横屏等边界场景） */
App._checkIsMobile = function _checkIsMobile() {
    // 窄屏：直接判定手机
    if (window.matchMedia('(max-width: 768px)').matches) return true;
    // 触摸设备 + 中屏（≤932px，覆盖所有 iPhone 横屏，iPad ≥1024px 不误判）
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (touch && window.matchMedia('(max-width: 932px)').matches) return true;
    return false;
  };

  /* 初始化移动端检测：matchMedia 监听 + 初始状态 */
App.initMobileDetection = function initMobileDetection() {
    this.isMobile = this._checkIsMobile();

    // 监听窗口变化：宽度跨越断点、或旋转
    const detect = () => {
      const was = this.isMobile;
      this.isMobile = this._checkIsMobile();
      const ac = document.getElementById('app-container');
      // v=20260903s 断点跨越时清理另一态的类，避免残留：
      //  - 桌面（>900px）清掉 sidebar-open（抽屉态），按 localStorage 恢复 sidebar-hidden
      //  - 移动/触摸中屏（≤900px）清掉 sidebar-hidden（桌面折叠态），抽屉态由 sidebar-open 控制
      const isDesktop = window.matchMedia('(min-width: 901px)').matches;
      if (isDesktop) {
        if (ac) {
          ac.classList.remove('sidebar-open');
          let pref = null;
          try { pref = localStorage.getItem('sidebar_pref'); } catch (e) {}
          if (pref === 'hidden') ac.classList.add('sidebar-hidden');
          else ac.classList.remove('sidebar-hidden');
        }
      } else {
        if (ac) ac.classList.remove('sidebar-hidden');
      }
      if (this.isMobile && !was) {
        console.log('[智能识别] 📱 检测到移动设备，已切换手机端 UI');
        document.body.classList.add('mobile-mode');
        this._initBottomTabBar();
        this._initMorePanel();
        this._updateBottomTabActive(this.currentView);
        this._closeSidebar();
        // 移动端:重渲染知识库导航(章节默认折叠)
        if (typeof this.renderKnowledgeNav === 'function') this.renderKnowledgeNav();
      } else if (!this.isMobile && was) {
        console.log('[智能识别] 💻 检测到桌面设备，已切换电脑端 UI');
        document.body.classList.remove('mobile-mode');
        this._closeMorePanel();
        this._closeSidebar();
      }
      // v=20260903s 断点跨越后同步 toggle 文案/可见性（_closeSidebar 已被包装为触发 syncState）
      this._closeSidebar();
      // v=20260904b 移动端/桌面端占位文案切换：手机端去掉"Enter 发送，Shift+Enter 换行"桌面话术
      try {
        const ci = document.getElementById('chat-input');
        if (ci) {
          ci.placeholder = this.isMobile ? '输入你的线性代数问题…' : '输入你的线性代数问题...（Enter 发送，Shift+Enter 换行）';
        }
      } catch (e) {}
    };

    window.addEventListener('resize', detect);
    window.addEventListener('orientationchange', () => setTimeout(detect, 100));

    // v=20260824 窗口 resize:清空 TOC 锚点缓存,下次点击时实时 querySelector 重新查
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        this._invalidateTocAnchors();
        resizeRaf = 0;
      });
    });

    if (this.isMobile) {
      console.log('[智能识别] 📱 检测到移动设备，已切换手机端 UI');
      document.body.classList.add('mobile-mode');
      this._initBottomTabBar();
      this._initMorePanel();
      this._initChatMobile();
      // 移动端:重渲染知识库导航,所有章节默认折叠(抽屉装不下全部展开)
      if (typeof this.renderKnowledgeNav === 'function') this.renderKnowledgeNav();
    } else {
      console.log('[智能识别] 💻 检测到桌面设备，已切换电脑端 UI');
    }
    // v=20260904b 初始化时立即同步输入区占位文案（避免初始仍是长文案）
    try {
      const ci = document.getElementById('chat-input');
      if (ci) ci.placeholder = this.isMobile ? '输入你的线性代数问题…' : '输入你的线性代数问题...（Enter 发送，Shift+Enter 换行）';
    } catch (e) {}
  };

  /* v=20260903e 智能问答移动端专属交互:语音/发送切换、更多、快捷 chips、回到底部 */
App._initChatMobile = function _initChatMobile() {
    const input = document.getElementById('chat-input');
    const mic = document.getElementById('chat-mic-btn');
    const more = document.getElementById('chat-more-btn');
    const headerVoice = document.getElementById('chat-header-voice');
    const backBtn = document.getElementById('chat-back-bottom');
    const chips = document.getElementById('chat-quick-chips');
    if (!input) return;

    // 语音/发送切换:有文字→发送箭头,无文字→麦克风
    const syncMic = () => {
      if (!mic) return;
      const has = input.value.trim().length > 0;
      mic.dataset.mode = has ? 'send' : 'voice';
      mic.textContent = has ? '➤' : '🎤';
      mic.setAttribute('title', has ? '发送' : '语音输入');
    };
    input.addEventListener('input', syncMic);
    if (mic) {
      mic.addEventListener('click', () => {
        if (mic.dataset.mode === 'send') this.sendMessage();
        else this._startVoiceDictation(input);
      });
    }
    if (headerVoice) {
      headerVoice.addEventListener('click', () => this._startVoiceDictation(input));
    }
    // 更多:复用图片选择
    if (more) more.addEventListener('click', () => {
      const fi = document.getElementById('chat-image-input');
      if (fi) fi.click();
    });
    // 快捷 chips:点击填入输入框(不自动发送)
    if (chips) chips.querySelectorAll('.chat-quick-chip').forEach(c => c.addEventListener('click', () => {
      input.value = c.dataset.q || '';
      if (this.autoResize) this.autoResize(input);
      input.focus();
      syncMic();
    }));

    // 回到底部:滚动不在底部时显示
    const scroller = () => {
      const msgs = document.getElementById('chat-messages');
      const panel = document.getElementById('view-chat');
      if (msgs && msgs.scrollHeight > msgs.clientHeight + 2) return msgs;
      if (panel && panel.scrollHeight > panel.clientHeight + 2) return panel;
      return document.scrollingElement || document.documentElement;
    };
    const updateBack = () => {
      if (!backBtn) return;
      const el = scroller();
      const nearBottom = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 120);
      backBtn.classList.toggle('visible', !nearBottom);
    };
    const onScroll = () => updateBack();
    document.getElementById('chat-messages')?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    if (backBtn) backBtn.addEventListener('click', () => {
      const el = scroller();
      el.scrollTo ? el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                  : (el.scrollTop = el.scrollHeight);
    });
    // 首屏及消息变化后刷新
    updateBack();
    this._chatUpdateBack = updateBack;
  };

  /* 语音听写(Web Speech API);不支持时提示 */
App._startVoiceDictation = function _startVoiceDictation(input) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this._shotToast('当前浏览器不支持语音输入'); return; }
    try {
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      this._shotToast('🎤 正在聆听…请说出你的问题');
      rec.onresult = (e) => {
        const txt = e.results[0][0].transcript || '';
        if (txt) { input.value = (input.value ? input.value + ' ' : '') + txt; if (this.autoResize) this.autoResize(input); input.focus(); }
      };
      rec.onerror = () => this._shotToast('语音识别失败,请手动输入');
      rec.start();
    } catch (err) { this._shotToast('语音输入启动失败'); }
  };

  /* 底部标签栏点击事件 */
App._initBottomTabBar = function _initBottomTabBar() {
    document.querySelectorAll('.bottom-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.tab;
        if (view === 'more') { this._toggleMorePanel(); return; }
        this._closeMorePanel();
        this.switchView(view);
      });
    });
  };

  /* 同步底部 tab 激活态 */
App._updateBottomTabActive = function _updateBottomTabActive(view) {
    if (!this.isMobile) return;
    const mainTabs = ['chat', 'knowledge', 'tools', 'visualizer'];
    document.querySelectorAll('.bottom-tab').forEach(t => {
      const v = t.dataset.tab;
      t.classList.toggle('active', v === view || (!mainTabs.includes(view) && v === 'more'));
    });
  };

  /* "更多"面板：主题色点 + 菜单项 */
App._initMorePanel = function _initMorePanel() {
    this._renderMoreThemeGrid();
    document.querySelectorAll('.more-item').forEach(item => {
      item.addEventListener('click', () => {
        this._closeMorePanel();
        this.switchView(item.dataset.view);
      });
    });
    const bd = document.getElementById('more-backdrop');
    if (bd) { bd.addEventListener('click', () => this._closeMorePanel()); }

    // v=20260903c 首次进入移动端自动弹开一次「更多」面板，并显示提示条；只弹一次
    try {
      if (!localStorage.getItem('la_more_hint_seen')) {
        localStorage.setItem('la_more_hint_seen', '1');
        setTimeout(() => {
          const ov = document.getElementById('more-overlay');
          if (ov) ov.style.display = 'block';
          const hint = document.getElementById('more-hint');
          if (hint) hint.style.display = 'flex';
          const lb = document.getElementById('more-login-btn');
          if (lb) lb.style.display = (typeof Auth !== 'undefined' && Auth.isLoggedIn) ? 'none' : 'block';
        }, 400);
      }
    } catch (e) { /* localStorage 不可用时静默跳过 */ }
  };

App._toggleMorePanel = function _toggleMorePanel() {
    const ov = document.getElementById('more-overlay');
    if (!ov) return;
    if (!ov.style.display || ov.style.display === 'none') {
      ov.style.display = 'block';
      const lb = document.getElementById('more-login-btn');
      if (lb) lb.style.display = (typeof Auth !== 'undefined' && Auth.isLoggedIn) ? 'none' : 'block';
    } else {
      this._closeMorePanel();
    }
  };

App._closeMorePanel = function _closeMorePanel() {
    const ov = document.getElementById('more-overlay');
    if (ov) ov.style.display = 'none';
  };

App._renderMoreThemeGrid = function _renderMoreThemeGrid() {
    const grid = document.getElementById('more-theme-grid');
    if (!grid || !this.themes) return;
    grid.innerHTML = Object.entries(this.themes).map(([k, t]) => {
      const bg = k === 'dark' ? 'linear-gradient(135deg,#1e293b,#475569)' : (t.color || '#4c6ef5');
      return `<span class="more-theme-dot${this.currentTheme === k ? ' active' : ''}" style="background:${bg}" data-theme="${k}" title="${t.name || k}"></span>`;
    }).join('');
    grid.querySelectorAll('.more-theme-dot').forEach(d => {
      d.addEventListener('click', () => { this.setTheme(d.dataset.theme); this._renderMoreThemeGrid(); });
    });
  };

  // ============ 事件绑定 ============

App.bindEvents = function bindEvents() {
    // 导航
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => this.switchView(el.dataset.view));
    });

    // 首页：核心功能 / CTA 跳转按钮(支持 data-preset 自动注入文本)
    document.querySelectorAll('[data-go]').forEach(el => {
      el.addEventListener('click', () => {
        const target = el.dataset.go;
        const preset = el.dataset.preset;
        if (preset) {
          // 把 preset 文本暂存,目标视图渲染后注入到 chat-input 或练习区
          sessionStorage.setItem('la_pending_preset', preset);
          // 标记是哪个模块要的 preset
          sessionStorage.setItem('la_pending_preset_target', target);
        }
        this.switchView(target);
      });
    });

    // 聊天
    document.getElementById('chat-send').addEventListener('click', () => this.sendMessage());
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    document.getElementById('chat-input').addEventListener('input', (e) => this.autoResize(e.target));

    // v=20260908c 移动端底部栏自动收起(scroll + focus/blur + 手动箭头)
    this._initChatBarAutoCollapse();

    // 示例问题快捷入口：点击自动提问
    document.querySelectorAll('.quick-q-btn, .tip-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.question;
        if (!q) return;
        document.getElementById('chat-input').value = q;
        this.sendMessage();
      });
    });

    // 教学模式切换
    this.currentChatMode = 'direct';
    document.querySelectorAll('.chat-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chat-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentChatMode = btn.dataset.mode;
      });
    });

    // 工具按钮
    document.querySelectorAll('.operation-btn').forEach(el => {
      el.addEventListener('click', () => {
        // v=20260904 选中高亮切换:取消所有按钮高亮,蓝色边框跟随当前点击按钮
        document.querySelectorAll('.operation-btn').forEach(b => b.classList.remove('op-primary'));
        el.classList.add('op-primary');
        this.executeTool(el.dataset.tool);
      });
    });

    // 可视化控件
    ['vec1-x','vec1-y','vec2-x','vec2-y','show-add','show-sub'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateVectorViz());
    });

    ['viz-matrix-a','viz-matrix-b','viz-matrix-c','viz-matrix-d'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateTransformViz());
    });

    ['det-a','det-b','det-c','det-d'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateDetViz());
    });

    ['eig-a','eig-b','eig-c','eig-d'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateEigenViz());
    });

    // 滑块
    document.getElementById('transform-slider')?.addEventListener('input', (e) => {
      this.setTransformProgress(parseFloat(e.target.value) / 100);
    });

    // 管理后台：搜索回车
    document.getElementById('admin-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.adminLoadUsers();
    });

    // 好友系统事件委托
    document.getElementById('friends-list')?.addEventListener('click', (e) => this._onFriendsListClick(e));
    document.getElementById('friend-requests-list')?.addEventListener('click', (e) => this._onFriendRequestsClick(e));
    document.getElementById('friends-search-results')?.addEventListener('click', (e) => this._onSearchResultsClick(e));

    // 社交中心：标签切换
    document.querySelectorAll('.social-tab').forEach(el => {
      el.addEventListener('click', () => App.Social.switchTab(el.dataset.socialTab));
    });
    // 群聊列表点击
    document.getElementById('groups-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.group-list-item');
      if (item) App.Social.openGroupChat(parseInt(item.dataset.groupId, 10));
    });
    // 聊天消息操作（回复/删除/撤回/跳转）
    document.getElementById('chat-window-messages')?.addEventListener('click', (e) => App.Social.onChatMsgClick(e));
    // 动态流操作（删除）
    document.getElementById('moments-feed')?.addEventListener('click', (e) => App.Social.onMomentsFeedClick(e));
    // 点击其他地方关闭群聊管理菜单
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('chat-group-menu');
      const btn = document.getElementById('chat-group-menu-btn');
      if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
      }
    });
  };

  // ============ 智能工作流 ============
App.Workflow = {
    _esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    // v=20260824q 题干 textarea 自动撑高（120px → 360px），超出滚动 + 拖拽/粘贴上传
    _autoGrowTextarea: function () {
      const t = document.getElementById('wf-solve-problem');
      if (!t) return;
      const min = 120, max = 360;
      const grow = () => {
        t.style.height = 'auto';
        const h = Math.max(min, Math.min(max, t.scrollHeight + 4));
        t.style.height = h + 'px';
        t.style.overflowY = (t.scrollHeight > max) ? 'auto' : 'hidden';
      };
      t.addEventListener('input', grow);
      setTimeout(grow, 0);
      // v=20260824t 抽到通用方法 _bindImageDnD(suffix, textarea)：solve / diagnose 共用
      this._bindImageDnD('solve', t);
      window._wfGrowSolveProblem = grow;
    },
    async _post(path, body) {
      const resp = await Auth._fetch(path, { method: 'POST', body: JSON.stringify(body) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || `请求失败(${resp.status})`);
      return data;
    },
    _loading(el, text) {
      el.innerHTML = `<div class="wf-loading"><div class="wf-spinner"></div><span>${this._esc(text || 'AI 正在编排工作流…')}</span></div>`;
    },
    _error(el, msg) {
      el.innerHTML = `<div class="wf-error">⚠️ ${this._esc(msg)}</div>`;
    },

    // 工具 1：自动出题
    async generateQuiz() {
      const btn = document.getElementById('wf-quiz-btn');
      const out = document.getElementById('wf-quiz-result');
      const topic = document.getElementById('wf-quiz-topic').value.trim() || '行列式';
      const difficulty = document.getElementById('wf-quiz-difficulty').value;
      const count = parseInt(document.getElementById('wf-quiz-count').value, 10) || 3;
      btn.disabled = true;
      this._loading(out, `正在生成「${topic}」小测验…`);
      try {
        const data = await this._post('/api/workflow/quiz', { topic, difficulty, count });
        const quiz = data.quiz || [];
        let html = `<div class="wf-quiz-meta">共 ${quiz.length} 题 · 难度：${this._esc(difficulty)} · 主题：${this._esc(topic)}`;
        if (data.rag_used) html += ` · <span class="wf-rag">已检索知识库</span>`;
        html += `</div>`;
        if (data.fallback) {
          html += `<div class="wf-quiz-fallback">⚠️ ${this._esc(data.fallback_note || '大模型暂不可用，已切换为题库离线生成，答案均可验证。')}</div>`;
        }
        html += `<div class="wf-quiz-list">`;
        quiz.forEach((q, i) => {
          html += `<div class="wf-quiz-item">
            <div class="wf-quiz-q"><span class="wf-qno">${i + 1}.</span><span class="wf-qtype">[${this._esc(q.type || '题')}]</span> ${this._esc(q.question)}</div>`;
          if (Array.isArray(q.options) && q.options.length) {
            html += `<div class="wf-options">` + q.options.map((o, j) =>
              `<label class="wf-opt"><input type="radio" name="wfq${i}" disabled> ${this._esc(o)}</label>`).join('') + `</div>`;
          }
          html += `<div class="wf-quiz-actions"><button class="wf-reveal" onclick="App.Workflow._revealQuiz(${i})">显示答案与解析</button></div>
            <div class="wf-quiz-detail" id="wfq-detail-${i}" style="display:none;">
              <div class="wf-answer"><b>答案：</b>${this._esc(q.answer)}</div>
              <div class="wf-exp"><b>解析：</b>${this._esc(q.explanation)}</div>
              <div class="wf-kp">📌 ${this._esc(q.knowledge_point)}</div>
            </div></div>`;
        });
        html += `</div>`;
        out.innerHTML = html;
        App.renderLatexInElement(out);
      } catch (e) {
        this._error(out, e.message);
      } finally {
        btn.disabled = false;
      }
    },
    _revealQuiz(i) {
      const d = document.getElementById(`wfq-detail-${i}`);
      if (d) { d.style.display = d.style.display === 'none' ? 'block' : 'none'; App.renderLatexInElement(d); }
    },

    // 工具 2：分步解题（带条件分支）
    /** v=20260824t 通用的图片上传 UI helpers（solve / diagnose 共用，避免重复） */
    _imageFile(suffix)  { return document.getElementById(`wf-${suffix}-image`); },
    _imageThumb(suffix) { return document.getElementById(`wf-${suffix}-image-thumb`); },
    _imagePreview(suffix){ return document.getElementById(`wf-${suffix}-image-preview`); },
    _resultEl(suffix)   { return document.getElementById(`wf-${suffix}-result`); },
    previewImage(input, suffix) {
      const file = input.files && input.files[0];
      const preview = this._imagePreview(suffix);
      const thumb = this._imageThumb(suffix);
      if (!file) { this.clearImage(suffix); return; }
      if (!file.type || !file.type.startsWith('image/')) {
        this._error(this._resultEl(suffix), '请选择图片文件（PNG/JPG/WebP）');
        input.value = '';
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        this._error(this._resultEl(suffix), '图片过大（上限 4MB）');
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (thumb) thumb.src = e.target.result;
        if (preview) preview.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    },
    clearImage(suffix) {
      const input = this._imageFile(suffix);
      if (input) input.value = '';
      const preview = this._imagePreview(suffix);
      const thumb = this._imageThumb(suffix);
      if (thumb) thumb.src = '';
      if (preview) preview.style.display = 'none';
    },
    async _ocrImage(suffix) {
      const input = this._imageFile(suffix);
      if (!input || !input.files || !input.files[0]) return '';
      const f = input.files[0];
      const form = new FormData();
      form.append('file', f);
      let url = (window.APP_CONFIG && window.APP_CONFIG.API_BASE || '') + '/api/vision/latex';
      const headers = {};
      if (Auth._token) {
        headers['Authorization'] = `Bearer ${Auth._token}`;
        headers['X-Auth-Token'] = Auth._token;  // v=20260904g 网关透传,防 Authorization 被替换
      }
      const resp = await fetch(url, { method: 'POST', body: form, headers });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || `图片识别失败(${resp.status})`);
      return (data && data.recognized) ? String(data.recognized).trim() : '';
    },
    /** v=20260824t 给指定 textarea/form 绑拖拽 + 粘贴：图片落到「最近」的图片输入框 */
    _bindImageDnD(suffix, textareaOrForm) {
      const target = (el) => el && el.closest ? el.closest('label, .wf-image-row') : null;
      const setFile = (file, targetSuffix) => {
        if (!file || !file.type || !file.type.startsWith('image/')) return false;
        if (file.size > 4 * 1024 * 1024) {
          this._error(this._resultEl(targetSuffix), '图片过大（上限 4MB）');
          return false;
        }
        const input = this._imageFile(targetSuffix);
        if (!input) return false;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        this.previewImage(input, targetSuffix);
        return true;
      };
      const ta = textareaOrForm && textareaOrForm.tagName === 'TEXTAREA' ? textareaOrForm : null;
      const form = textareaOrForm && textareaOrForm.closest ? textareaOrForm.closest('.workflow-form') : null;
      if (!form) return;
      // 每个 form 只绑一次拖拽监听
      if (form.dataset.dndBound === '1') return;
      form.dataset.dndBound = '1';
      form.addEventListener('dragover', (e) => {
        if (Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          // 高亮时判断归属：拖到哪个 label / 图片行附近，就高亮那个
          const nearLabel = (e.target && e.target.closest) ? e.target.closest('.wf-image-row') : null;
          const ownSuffix = nearLabel && nearLabel.querySelector(`#wf-${nearLabel.querySelector('[id$="-image"]')?.id.match(/^wf-(.+)-image$/)?.[1] || ''}-image`) ? nearLabel : null;
          form.classList.add('wf-dragover-active');
        }
      });
      form.addEventListener('dragleave', (e) => { if (e.target === form) form.classList.remove('wf-dragover-active'); });
      form.addEventListener('drop', (e) => {
        e.preventDefault();
        form.classList.remove('wf-dragover-active');
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
        // 落入哪个 wf-image-row，决定 suffix
        const row = e.target && e.target.closest ? e.target.closest('.wf-image-row') : null;
        const fileInput = row && row.querySelector('input[type=file][id$="-image"]');
        let sfx = suffix;
        if (fileInput && fileInput.id) {
          const m = fileInput.id.match(/^wf-(.+)-image$/);
          if (m) sfx = m[1];
        }
        setFile(e.dataTransfer.files[0], sfx);
      });
    },
    /** 给非 textarea 节点（form 上没有 active textarea 时）绑粘贴：把图片附到默认 suffix */
    _bindImagePaste(suffix, textarea) {
      textarea.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of items) {
          if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) {
              if (f.size > 4 * 1024 * 1024) {
                this._error(this._resultEl(suffix), '图片过大（上限 4MB）');
                return;
              }
              const input = this._imageFile(suffix);
              if (!input) return;
              const dt = new DataTransfer();
              dt.items.add(f);
              input.files = dt.files;
              this.previewImage(input, suffix);
              e.preventDefault();
              return;
            }
          }
        }
      });
    },
    async solve() {
      const btn = document.getElementById('wf-solve-btn');
      const out = this._resultEl('solve');
      const ta = document.getElementById('wf-solve-problem');
      let problem = ta.value.trim();
      // v=20260824t 优先：如果有图片，先 OCR 再求解（OCR 文本回填到输入框方便用户核查）
      const hasImage = this._imageFile('solve') && this._imageFile('solve').files && this._imageFile('solve').files[0];
      if (hasImage) {
        this._loading(out, '正在识别题目图片…');
        try {
          const recognized = await this._ocrImage('solve');
          if (!recognized) throw new Error('图片识别未返回内容，请重试或直接键入题目文本');
          problem = (problem ? problem + '\n' : '') + recognized;
          ta.value = problem;
        } catch (e) {
          btn.disabled = false;
          this._error(out, e.message);
          return;
        }
      }
      if (!problem) { btn.disabled = false; this._error(out, '请输入需要求解的题目，或上传一张题目图片'); return; }
      btn.disabled = true;
      this._loading(out, '正在分类题型 → 检索知识 → 求解 → 验证…');
      try {
        const data = await this._post('/api/workflow/solve', { problem, mode: 'detailed' });
        let html = `<div class="wf-solve-head">
            <span class="wf-branch">分支：${this._esc(data.branch || '')}</span>
            <span class="wf-type">题型：${this._esc(data.problem_type || '')}</span>`;
        if (data.rag_used) html += `<span class="wf-rag">已检索知识库</span>`;
        html += `</div>`;
        // 解题流程骨架
        html += `<div class="wf-plan"><div class="wf-plan-title">🧭 解题流程（编排分支）</div><ol>`;
        (data.plan || []).forEach(p => { html += `<li>${this._esc(p.action)}</li>`; });
        html += `</ol></div>`;
        // 逐步求解
        html += `<div class="wf-steps"><div class="wf-steps-title">📐 逐步求解</div>`;
        (data.steps || []).forEach(s => {
          html += `<div class="wf-step"><div class="wf-step-title">${this._esc(s.title)}</div><div class="wf-step-detail">${this._esc(s.detail)}</div></div>`;
        });
        html += `</div>`;
        // 最终答案
        html += `<div class="wf-final"><div class="wf-final-label">✅ 最终答案</div><div>${this._esc(data.answer)}</div>`;
        if (data.summary) html += `<div class="wf-summary">💡 ${this._esc(data.summary)}</div>`;
        html += `</div>`;
        // 验证
        const v = data.verification || {};
        if (v.verdict) {
          html += `<div class="wf-verify"><div class="wf-verify-title">🔎 自动验算：${this._esc(v.verdict)}</div><ul>`;
          (v.checks || []).forEach(c => { html += `<li>${this._esc(c)}</li>`; });
          html += `</ul>`;
          if (v.suggestion) html += `<div class="wf-verify-sug">建议：${this._esc(v.suggestion)}</div>`;
          html += `</div>`;
        }
        out.innerHTML = html;
        App.renderLatexInElement(out);
      } catch (e) {
        this._error(out, e.message);
      } finally {
        btn.disabled = false;
      }
    },

    // 工具 3：错题诊断
    async diagnose() {
      const btn = document.getElementById('wf-diagnose-btn');
      const out = this._resultEl('diagnose');
      const problemTa = document.getElementById('wf-diagnose-problem');
      const attemptTa = document.getElementById('wf-diagnose-attempt');
      let problem = problemTa.value.trim();
      let attempt = attemptTa.value.trim();
      // v=20260824t 处理两张图片（题目 / 解答），先 OCR 再喂给诊断
      const hasProblemImg = this._imageFile('diagnose') && this._imageFile('diagnose').files && this._imageFile('diagnose').files[0];
      const hasAttemptImg = this._imageFile('diagnose-attempt') && this._imageFile('diagnose-attempt').files && this._imageFile('diagnose-attempt').files[0];
      if (hasProblemImg || hasAttemptImg) {
        this._loading(out, '正在识别图片内容…');
        try {
          if (hasProblemImg) {
            const t = await this._ocrImage('diagnose');
            if (!t) throw new Error('原题图片识别未返回内容，请重试或直接键入原题');
            problem = (problem ? problem + '\n' : '') + t;
            problemTa.value = problem;
          }
          if (hasAttemptImg) {
            const t = await this._ocrImage('diagnose-attempt');
            if (!t) throw new Error('解答图片识别未返回内容，请重试或直接键入解答');
            attempt = (attempt ? attempt + '\n' : '') + t;
            attemptTa.value = attempt;
          }
        } catch (e) {
          btn.disabled = false;
          this._error(out, e.message);
          return;
        }
      }
      if (!problem || !attempt) { btn.disabled = false; this._error(out, '请同时填写原题与你的解答（可上传图片自动 OCR）'); return; }
      btn.disabled = true;
      this._loading(out, '正在定位错误 → 分析误区 → 给出纠正路径…');
      try {
        const data = await this._post('/api/workflow/diagnose', { problem, attempt });
        let html = `<div class="wf-diag">
          <div class="wf-diag-block wf-diag-err"><div class="wf-diag-label">❌ 出错位置</div><div>${this._esc(data.error_location)}</div></div>
          <div class="wf-diag-block wf-diag-why"><div class="wf-diag-label">🧠 错误原因</div><div>${this._esc(data.error_reason)}</div></div>
          <div class="wf-diag-block wf-diag-mis"><div class="wf-diag-label">💭 概念误区</div><div>${this._esc(data.misconception)}</div></div>
          <div class="wf-diag-block wf-diag-fix"><div class="wf-diag-label">✅ 纠正步骤</div><ol>`;
        (data.corrected_steps || []).forEach(s => { html += `<li>${this._esc(s)}</li>`; });
        html += `</ol></div>
          <div class="wf-diag-block wf-diag-ans"><div class="wf-diag-label">🎯 正确的最终答案</div><div>${this._esc(data.correct_answer)}</div></div>`;
        if (data.rag_used) html += `<div class="wf-rag">已结合知识库诊断</div>`;
        html += `</div>`;
        out.innerHTML = html;
        App.renderLatexInElement(out);
      } catch (e) {
        this._error(out, e.message);
      } finally {
        btn.disabled = false;
      }
    },

    // 工具 4：多模态图片识别（公式 LaTeX / 手写矩阵自动计算）
    _visionFile() {
      return document.getElementById('wf-vision-file');
    },
    previewVisionImage(input) {
      const file = input.files && input.files[0];
      const preview = document.getElementById('wf-vision-preview');
      const thumb = document.getElementById('wf-vision-thumb');
      if (!file) { this.clearVisionImage(); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (thumb) thumb.src = e.target.result;
        if (preview) preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    },
    clearVisionImage() {
      const input = this._visionFile();
      if (input) input.value = '';
      const preview = document.getElementById('wf-vision-preview');
      const thumb = document.getElementById('wf-vision-thumb');
      if (thumb) thumb.src = '';
      if (preview) preview.style.display = 'none';
      const out = document.getElementById('wf-vision-result');
      if (out) out.innerHTML = '';
    },
    async recognizeImage() {
      const btn = document.getElementById('wf-vision-btn');
      const out = document.getElementById('wf-vision-result');
      const fileEl = this._visionFile();
      const task = document.getElementById('wf-vision-task').value;
      if (!fileEl || !fileEl.files || !fileEl.files[0]) {
        this._error(out, '请先选择一张图片');
        return;
      }
      const f = fileEl.files[0];
      btn.disabled = true;
      this._loading(out, task === 'matrix' ? '正在识别矩阵并自动计算…' : '正在识别公式…');
      try {
        const form = new FormData();
        form.append('file', f);
        const path = task === 'matrix' ? '/api/vision/matrix-calc' : '/api/vision/latex';
        const headers = {};
        let url = (window.APP_CONFIG && window.APP_CONFIG.API_BASE || '') + path;
        if (Auth._token) {
          headers['Authorization'] = `Bearer ${Auth._token}`;
          headers['X-Auth-Token'] = Auth._token;  // v=20260904g 网关透传,防 Authorization 被替换
        }
        const resp = await fetch(url, {
          method: 'POST', body: form, headers
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.detail || `请求失败(${resp.status})`);
        if (task === 'matrix') this._renderMatrixResult(out, data);
        else this._renderLatexResult(out, data);
      } catch (e) {
        this._error(out, e.message);
      } finally {
        btn.disabled = false;
      }
    },
    _fmtNum(x) {
      if (x === null || x === undefined) return '—';
      if (typeof x === 'number') {
        if (!isFinite(x)) return String(x);
        if (Math.abs(x) < 1e-10) return '0';
        return String(Math.round(x * 1e4) / 1e4);
      }
      if (Array.isArray(x)) return '[' + x.map(v => this._fmtNum(v)).join(', ') + ']';
      if (typeof x === 'object') return JSON.stringify(x);
      return String(x);
    },
    _fmtEig(s) {
      if (typeof s !== 'string') return this._fmtNum(s);
      let t = s.trim().replace(/^\(|\)$/g, '').replace(/j/g, 'i');
      const mOnly = t.match(/^([+-]?\d*\.?\d*)i$/);
      if (mOnly) {
        const c = mOnly[1];
        if (c === '' || c === '+') return 'i';
        if (c === '-') return '-i';
        if (c === '0' || c === '-0') return '0';
        return c + 'i';
      }
      const m = t.match(/^([+-]?\d*\.?\d*)([+-]\d*\.?\d*)i$/);
      if (m) {
        const re = m[1] === '' ? '0' : m[1];
        const imNum = parseFloat(m[2]);
        if (Math.abs(imNum) < 1e-9) return re === '-0' ? '0' : re;
        let imCoeff = m[2];
        if (imCoeff === '+1' || imCoeff === '+1.0') imCoeff = '+';
        else if (imCoeff === '-1' || imCoeff === '-1.0') imCoeff = '-';
        if (re === '0') return imCoeff + 'i';
        return re + imCoeff + 'i';
      }
      if (/^[+-]?\d*\.?\d*$/.test(t)) {
        if (t === '-0' || t === '0') return '0';
        return t;
      }
      return t;
    },
    _renderLatexResult(out, data) {
      const tex = data.recognized || '';
      let html = `<div class="wf-vision-head">✅ 公式识别成功</div>`;
      html += `<div class="wf-latex-code">${this._esc(tex)}</div>`;
      html += `<div class="wf-vision-render"><b>渲染效果：</b> ${this._esc(tex)}</div>`;
      html += `<div class="wf-vision-note">复制上方代码可直接用于对话或文档。此为 AI 生成内容，仅供参考。</div>`;
      out.innerHTML = html;
      App.renderLatexInElement(out);
    },
    _renderMatrixResult(out, data) {
      if (data.error) {
        let html = `<div class="wf-vision-head">⚠️ 未解析到矩阵</div>`;
        if (data.recognized) html += `<div class="wf-latex-code">${this._esc(data.recognized)}</div>`;
        html += `<div class="wf-error" style="margin-top:8px;">${this._esc(data.error)}</div>`;
        out.innerHTML = html;
        App.renderLatexInElement(out);
        return;
      }
      const M = data.matrix || [];
      const r = data.results || {};
      const shape = data.shape || [];
      const toBmatrix = (mat) => mat.map(row => row.map(v => this._fmtNum(v)).join(' & ')).join(' \\\\ ');
      let html = `<div class="wf-vision-head">✅ 矩阵识别成功（${this._fmtNum(shape[0])} × ${this._fmtNum(shape[1])}）</div>`;
      if (M.length) {
        html += `<div class="wf-matrix-box"><b>识别到的矩阵：</b><div class="wf-vision-render">$$A = \\begin{bmatrix} ${toBmatrix(M)} \\end{bmatrix}$$</div></div>`;
      }
      html += `<div class="wf-vals">`;
      html += `<div class="wf-val"><span>行列式 det(A)</span><b>${this._fmtNum(r.det)}</b></div>`;
      html += `<div class="wf-val"><span>秩 rank(A)</span><b>${this._fmtNum(r.rank)}</b></div>`;
      html += `<div class="wf-val"><span>是否可逆</span><b>${r.invertible ? '可逆' : '不可逆'}</b></div>`;
      html += `</div>`;
      if (r.inverse) {
        html += `<div class="wf-matrix-box"><b>逆矩阵 A⁻¹：</b><div class="wf-vision-render">$$A^{-1} = \\begin{bmatrix} ${toBmatrix(r.inverse)} \\end{bmatrix}$$</div></div>`;
      }
      if (Array.isArray(r.eigenvalues) && r.eigenvalues.length) {
        const eig = r.eigenvalues.map(v => this._fmtEig(v)).join(', ');
        html += `<div class="wf-matrix-box"><b>特征值 λ：</b><div class="wf-vision-render">$$\\lambda \\in \\{ ${eig} \\}$$</div></div>`;
      }
      html += `<div class="wf-vision-note">结果由 NumPy 计算，已与解析方法交叉验证。此为 AI 生成内容，仅供参考。</div>`;
      out.innerHTML = html;
      App.renderLatexInElement(out);
    }
  };

  // ============ 可执行可验证求解引擎（不依赖大模型） ============
App.Engine = {
    _inited: false,
    _esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    _fmtNum(v) {
      const n = parseFloat(v);
      if (isNaN(n)) return this._esc(v);
      return Math.abs(n) < 1e-9 ? '0' : (Math.abs(n) < 1e-4 || Math.abs(n) >= 1e6 ? n.toExponential(4) : (Math.round(n * 1e6) / 1e6).toString());
    },
    _post(path, body) {
      return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json().catch(() => ({}))
          .then(d => { if (!r.ok) throw new Error(d.detail || `请求失败(${r.status})`); return d; }));
    },
    _parseNum(tok) {
      tok = (tok || '').trim();
      if (tok === '') return null;
      if (tok.includes('/')) {
        const [a, b] = tok.split('/').map(parseFloat);
        if (b) return a / b;
      }
      return parseFloat(tok);
    },
    _parseMatrix(text) {
      const rows = text.split('\n').map(l => l.trim()).filter(l => l.length);
      const mat = rows.map(r => r.split(/[\s,;]+/).map(t => this._parseNum(t)).filter(v => v !== null));
      if (!mat.length || mat.some(r => !r.length)) throw new Error('矩阵格式不正确');
      const c = mat[0].length;
      if (mat.some(r => r.length !== c)) throw new Error('矩阵各行长度必须一致');
      return mat;
    },
    _parseVector(text) {
      const v = text.split(/[\s,;]+/).map(t => this._parseNum(t)).filter(x => x !== null);
      if (!v.length) throw new Error('向量格式不正确');
      return v;
    },
    async init() {
      if (this._inited) return;
      const sel = document.getElementById('eng-task');
      const desc = document.getElementById('eng-task-desc');
      const runBtn = document.getElementById('eng-run');
      if (!sel || !runBtn) {
        // DOM 尚未就绪，延迟重试
        setTimeout(() => this.init(), 100);
        return;
      }
      try {
        const data = await fetch('/api/engine/tasks').then(r => r.json());
        this._meta = {};
        (data.tasks || []).forEach(t => {
          this._meta[t.key] = t;
          const o = document.createElement('option');
          o.value = t.key; o.textContent = t.label;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => this._onTaskChange());
        runBtn.addEventListener('click', () => this.run());
        // v=20260874 引擎矩阵行/列 +/− 按钮事件委托
        // v=20260876 优化:从 document 改为 #view-engine 容器,减少全局拦截开销
        const engView = document.getElementById('view-engine');
        if (engView && !this._dimClickBound) {
          engView.addEventListener('click', e => {
            const btn = e.target.closest && e.target.closest('[data-eng-dim]');
            if (!btn) return;
            this._changeEngDim(btn.dataset.engDim, btn.dataset.axis, parseInt(btn.dataset.delta, 10) || 0);
          });
          this._dimClickBound = true;
        }
        this._renderPresets();
        this._onTaskChange();
        this._inited = true;
      } catch (e) {
        if (desc) desc.textContent = '任务清单加载失败：' + e.message;
        // 允许失败后重试
        this._inited = false;
      }
    },
    _onTaskChange() {
      const key = document.getElementById('eng-task').value;
      const meta = this._meta && this._meta[key];
      const needs = meta ? meta.needs : 'matrix';
      document.getElementById('eng-matrix-wrap').style.display = (needs === 'matrix' || needs === 'matrix+b') ? 'block' : 'none';
      document.getElementById('eng-b-wrap').style.display = (needs === 'matrix+b') ? 'block' : 'none';
      document.getElementById('eng-vec-wrap').style.display = (needs === 'vector') ? 'block' : 'none';
      document.getElementById('eng-task-desc').textContent = meta ? meta.desc : '';
      this._renderPresets();
      // v=20260874 任务切换后按当前 textarea 文本重渲染对应网格
      this._renderAllEngGrids();
    },

    /** v=20260874 把 textarea/隐藏 input 的文本渲染到对应网格 */
    _renderAllEngGrids() {
      this._renderEngGrid('matrix');  // 矩阵 (rows × cols)
      this._renderEngGrid('b');        // 列向量 (rows × 1)
      this._renderEngGrid('vector');  // 列向量
      this._renderEngGrid('u');       // 列向量
    },

    /** 渲染单个引擎网格。kind: matrix(矩阵) / b / vector / u(列向量) */
    _renderEngGrid(kind) {
      const isVec = kind !== 'matrix';
      const ta = document.getElementById('eng-' + kind);
      const grid = document.getElementById('eng-' + kind + '-grid');
      const rowsEl = document.getElementById('eng-' + kind + '-rows');
      const colsEl = kind === 'matrix' ? document.getElementById('eng-' + kind + '-cols') : null;
      if (!ta || !grid || !rowsEl) return;
      // 从 textarea/input 解析现有数据(单一真相源)
      let arr = [];
      if (isVec) {
        const v = String(ta.value || '').split(/[\s,;\n]+/).map(s => s.trim()).filter(s => s.length);
        arr = v.map(x => [x]);
      } else {
        const lines = String(ta.value || '').split('\n').map(s => s.trim()).filter(s => s.length);
        arr = lines.map(line => line.split(/[\s,;]+/).map(s => s.trim()).filter(s => s.length));
      }
      const rows = Math.max(1, arr.length || 2);
      const cols = isVec ? 1 : Math.max(1, (arr[0] && arr[0].length) || 2);
      // 更新行/列显示
      rowsEl.textContent = rows;
      if (colsEl) colsEl.textContent = cols;
      // v=20260876 设置 grid 列数(自适应:cols<=5 用 56px,>5 缩到 40px 以适配 10×10)
      const cellW = cols <= 5 ? 56 : 40;
      grid.style.gridTemplateColumns = `repeat(${isVec ? 1 : cols}, ${cellW}px)`;
      // 渲染格子
        grid.innerHTML = '';
        // v=20260876 每格子 input 防抖(80ms),避免每键击触发整网格序列化
        const syncTimerKey = '_syncTimer_' + kind;
        for (let r = 0; r < rows; r++) {
        for (let c = 0; c < (isVec ? 1 : cols); c++) {
          const v = (arr[r] && arr[r][c] !== undefined) ? arr[r][c] : '';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'matrix-cell';
          inp.value = v;
          inp.dataset.row = r;
          inp.dataset.col = c;
          inp.placeholder = '0';
          // v=20260876 跟随 grid 列宽(避免大矩阵时 56px 溢出)
          inp.style.width = '100%';
          inp.addEventListener('input', () => {
            clearTimeout(this[syncTimerKey]);
            this[syncTimerKey] = setTimeout(() => this._syncEngFromGrid(kind), 80);
          });
          grid.appendChild(inp);
        }
      }
    },

    /** 从网格 → textarea/input 序列化 */
    _syncEngFromGrid(kind) {
      const isVec = kind !== 'matrix';
      const grid = document.getElementById('eng-' + kind + '-grid');
      const ta = document.getElementById('eng-' + kind);
      if (!grid || !ta) return;
      const cells = grid.querySelectorAll('.matrix-cell');
      const rowsByIdx = {};
      cells.forEach(c => {
        const r = parseInt(c.dataset.row, 10);
        if (!rowsByIdx[r]) rowsByIdx[r] = [];
        rowsByIdx[r][parseInt(c.dataset.col, 10)] = c.value.trim();
      });
      const maxRow = Math.max(0, ...Object.keys(rowsByIdx).map(k => parseInt(k, 10)));
      const lines = [];
      for (let r = 0; r <= maxRow; r++) {
        const row = rowsByIdx[r] || [];
        // 去掉尾部空值
        while (row.length && row[row.length - 1] === '') row.pop();
        if (row.length) lines.push(row.join(', '));
      }
      ta.value = isVec ? lines.join(', ') : lines.join('\n');
    },

    /** 行/列数调整:kind, axis(rows/cols), delta(+1/-1) */
    _changeEngDim(kind, axis, delta) {
      const isVec = kind !== 'matrix';
      const isCol = axis === 'cols';
      if (isVec && isCol) return;
      const rowsEl = document.getElementById('eng-' + kind + '-rows');
      // v=20260876 修复:行扩展时也需当前列数(扩展占位行),所以总是读 colsEl
      const colsEl = isVec ? null : document.getElementById('eng-' + kind + '-cols');
      if (!rowsEl) return;
      const currentRows = parseInt(rowsEl.textContent, 10) || 2;
      const currentCols = isVec ? 1 : (parseInt(colsEl ? colsEl.textContent : '2', 10) || 2);
      const nextRows = axis === 'rows' ? Math.max(1, Math.min(10, currentRows + delta)) : currentRows;
      const nextCols = axis === 'cols' ? Math.max(1, Math.min(10, currentCols + delta)) : currentCols;
      if (nextRows === currentRows && nextCols === currentCols) return;
      // v=20260876 重写:同步 grid → 读 2D arr → 调整维度 → 写 textarea → 设 DOM → 重渲染
      this._syncEngFromGrid(kind);
      const ta = document.getElementById('eng-' + kind);
      let arr = [];
      if (isVec) {
        arr = String(ta.value || '').split(/[\s,;]+/).map(s => s.trim()).filter(s => s.length).map(x => [x]);
      } else {
        arr = String(ta.value || '').split('\n').map(line =>
          line.split(/[\s,;]+/).map(s => s.trim()).filter(s => s.length));
      }
      // 行
      while (arr.length < nextRows) arr.push([]);
      if (axis === 'rows') arr.length = nextRows;
      // 列
      arr.forEach(row => {
        while (row.length < nextCols) row.push('0');
        if (axis === 'cols') row.length = nextCols;
      });
      // 写回 ta
      ta.value = isVec
        ? arr.map(r => r[0] || '').join(', ')
        : arr.map(r => r.join(', ')).join('\n');
      // 强制同步 DOM 显示
      rowsEl.textContent = nextRows;
      if (colsEl) colsEl.textContent = nextCols;
      this._renderEngGrid(kind);
    },
    _renderPresets() {
      const key = document.getElementById('eng-task').value;
      const presets = {
        eigen: ['2, 1\n1, 2', '1, 2\n2, 4', '4, 1, 0\n1, 4, 1\n0, 1, 4'],
        inverse: ['1, 2\n3, 4', '2, 1\n1, 2'],
        det: ['1, 2, 3\n0, 4, 5\n1, 0, 6'],
        rank: ['1, 2, 3\n2, 4, 6\n1, 1, 1'],
        solve_linear: ['2, 1\n1, 1', '1, 1\n2, 3'],
        diagonalize: ['4, 1\n0, 2', '2, 0\n0, 3'],
        svd: ['3, 2, 2\n2, 3, -2'],
        qr: ['1, 1\n1, 0\n0, 1'],
        nullspace: ['1, 2, 3\n2, 4, 6', '1, 1, 1\n1, 1, 1'],
        orthogonal_project: ['3, 2', '1, 1'],
      };
      const box = document.getElementById('eng-presets');
      box.innerHTML = '';
      (presets[key] || []).forEach(p => {
        const b = document.createElement('button');
        b.className = 'engine-preset';
        b.textContent = p.replace(/\n/g, ' ; ');
        b.addEventListener('click', () => {
          if (key === 'orthogonal_project') {
            // 投影任务:分别填两个向量
            const parts = p.split('|').map(s => s.trim());
            if (parts[0]) document.getElementById('eng-vector').value = parts[0];
            if (parts[1]) document.getElementById('eng-u').value = parts[1];
            this._renderEngGrid('vector');
            this._renderEngGrid('u');
            return;
          }
          document.getElementById('eng-matrix').value = p;
          this._renderEngGrid('matrix');
          // 矩阵 b(若可见)也填入 preset 第二段
          if (p.includes('|')) {
            const parts = p.split('|').map(s => s.trim());
            if (parts[1] && document.getElementById('eng-b-wrap').style.display !== 'none') {
              document.getElementById('eng-b').value = parts[1];
              this._renderEngGrid('b');
            }
          }
        });
        box.appendChild(b);
      });
    },
    async run() {
      const out = document.getElementById('eng-result');
      const key = document.getElementById('eng-task').value;
      let body = { task: key };
      try {
        if (key === 'orthogonal_project') {
          body.vector = this._parseVector(document.getElementById('eng-vector').value);
          body.subspace = { type: 'line', u: this._parseVector(document.getElementById('eng-u').value) };
        } else {
          body.matrix = this._parseMatrix(document.getElementById('eng-matrix').value);
          if (document.getElementById('eng-b-wrap').style.display !== 'none') {
            body.b = this._parseVector(document.getElementById('eng-b').value);
          }
        }
      } catch (e) {
        out.innerHTML = `<div class="wf-error">⚠️ ${this._esc(e.message)}</div>`;
        return;
      }
      out.innerHTML = `<div class="wf-loading"><div class="wf-spinner"></div><span>引擎计算中（符号+数值+验证）…</span></div>`;
      try {
        const data = await this._post('/api/engine/solve', body);
        this._render(out, data);
      } catch (e) {
        out.innerHTML = `<div class="wf-error">⚠️ ${this._esc(e.message)}</div>`;
      }
    },
    _render(out, d) {
      const badge = d.verified
        ? `<span class="eng-verify ok">✓ 已验证</span>`
        : `<span class="eng-verify warn">⚠ 部分未通过</span>`;
      let html = `<div class="eng-result-head"><b>${this._esc(d.task_label || d.task)}</b> ${badge}</div>`;

      // 步骤
      if (Array.isArray(d.steps) && d.steps.length) {
        html += `<div class="eng-steps">`;
        d.steps.forEach((s, i) => {
          const detailHtml = /[一-鿿]/.test(s.detail || '')
            ? this._esc(s.detail)                                   // 含中文：当纯文本，避免中文进入数学模式
            : `$$${this._esc(s.detail)}$$`;                         // 纯数学：显示模式渲染
          html += `<div class="eng-step"><div class="eng-step-no">${i + 1}</div><div class="eng-step-body"><div class="eng-step-title">${this._esc(s.title)}</div><div class="eng-step-detail">${detailHtml}</div></div></div>`;
        });
        html += `</div>`;
      }

      // 符号解 + 数值解
      html += `<div class="eng-grid">`;
      html += `<div class="eng-box"><div class="eng-box-title">符号解（SymPy）</div><div class="eng-tex">$$${this._esc(d.symbolic || '')}$$</div></div>`;
      html += `<div class="eng-box"><div class="eng-box-title">数值解 / 说明（NumPy）</div><div class="eng-num">${this._esc(d.numeric || '')}</div></div>`;
      html += `</div>`;

      // 验证说明
      if (Array.isArray(d.verification_notes) && d.verification_notes.length) {
        html += `<div class="eng-notes"><div class="eng-notes-title">🔬 交叉验证</div><ul>${d.verification_notes.map(n => `<li>${this._esc(n)}</li>`).join('')}</ul></div>`;
      }

      // 可视化
      if (d.plot) {
        html += `<div class="eng-plot"><div class="eng-box-title">📈 几何可视化</div><img src="${d.plot}" alt="可视化" /></div>`;
      }

      // 可运行代码(v=20260866 加"运行验证"按钮:后端真实执行)
      if (d.code) {
        html += `<div class="eng-code-wrap"><div class="eng-box-title">🐍 可一键运行的 Python 代码</div><div class="eng-code-bar">
          <button class="engine-preset" data-act="run" data-code="${this._esc(d.code)}">▶ 运行验证</button>
          <button class="engine-preset" data-act="copy" data-code="${this._esc(d.code)}">📋 复制代码</button>
        </div><pre class="eng-code">${this._esc(d.code)}</pre><div class="eng-code-result" data-role="run-result" style="display:none;"></div><div class="eng-code-note">点击「运行验证」在后端真实执行,复现上述结果。</div></div>`;
      }

      html += `<div class="eng-ai-note">本结果由符号/数值计算引擎生成并自动验证，可复现、可核验。</div>`;
      out.innerHTML = html;

      const wrap = out.querySelector('.eng-code-wrap');
      if (wrap) wrap.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-act]');
        if (!btn) return;
        const code = btn.dataset.code || d.code;
        const act = btn.dataset.act;
        if (act === 'copy') {
          navigator.clipboard && navigator.clipboard.writeText(code);
          btn.textContent = '已复制 ✓';
          setTimeout(() => btn.textContent = '📋 复制代码', 1500);
        } else if (act === 'run') {
          const resultEl = wrap.querySelector('[data-role="run-result"]');
          btn.disabled = true;
          btn.textContent = '⏳ 运行中…';
          if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = '正在后端执行代码…'; }
          App.engineRunCode(code)
            .then((r) => {
              if (resultEl) {
                const ok = r.ok && r.returncode === 0;
                const hasErr = r.stderr && r.stderr.trim();
                resultEl.style.display = 'block';
                resultEl.className = 'eng-code-result ' + (ok && !hasErr ? 'ok' : 'warn');
                resultEl.innerHTML = '<div class="eng-code-result-title">' + (ok && !hasErr ? '✅ 运行成功' : '⚠️ 运行输出') + '</div><pre>' + App._esc(r.stdout || '') + (hasErr ? '\n[stderr] ' + App._esc(r.stderr) : '') + '</pre>';
              }
            })
            .catch((e) => {
              if (resultEl) {
                resultEl.style.display = 'block';
                resultEl.className = 'eng-code-result warn';
                resultEl.innerHTML = '<div class="eng-code-result-title">⚠️ 运行失败</div><pre>' + App._esc(e.message || e) + '</pre>';
              }
            })
            .finally(() => { btn.disabled = false; btn.textContent = '▶ 运行验证'; });
        }
      });
      App.renderLatexInElement(out);
    }
  };


// 启动应用
document.addEventListener('DOMContentLoaded', () => App.init());

// 导出全局 App（index.html 中存在大量 inline onclick="App.xxx" 调用，
// const 声明不会挂到 window 上，必须显式导出，否则这些按钮全部失效）
window.App = App;

/* ════════════ v=20260922j PWA 安装引导 + APP 卡片相关 ════════════ */
(function () {
  // 1. 捕获 beforeinstallprompt,留作卡片按钮触发
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('hac-pwa-btn');
    if (btn) btn.style.display = 'flex';
    console.log('[PWA] beforeinstallprompt 已捕获');
  });
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] 已安装到主屏幕');
    const btn = document.getElementById('hac-pwa-btn');
    if (btn) btn.style.display = 'none';
  });
  // 2. 暴露方法
  App.pwaInstall = async function () {
    if (!deferredPrompt) {
      // 不支持或已被使用 → 弹通用引导
      App.iosInstallGuide();
      return;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] 安装选择:', outcome);
      if (outcome === 'accepted') {
        const btn = document.getElementById('hac-pwa-btn');
        if (btn) btn.style.display = 'none';
      }
    } catch (e) {
      console.warn('[PWA] 安装异常:', e);
    }
    deferredPrompt = null;
  };
  // 3. iOS 引导弹窗
  App.iosInstallGuide = function () {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      App._showHACModal('🍎 iPhone 添加到主屏幕', [
        { num: 1, html: '用 <b>Safari 浏览器</b>打开本页面(其他浏览器不支持)' },
        { num: 2, html: '点击底部的 <span class="hac-step-ico">⬆️</span><b>分享</b>按钮(正方形带向上箭头)' },
        { num: 3, html: '在弹出的菜单中,选择 <b>「添加到主屏幕」</b>' },
        { num: 4, html: '名称保持默认「<b>秩研Agent</b>」,点击右上角 <b>「添加」</b>' },
        { num: 5, html: '回到桌面,点击 <b>秩研Agent 图标</b>,即可全屏启动 🚀' }
      ], '💡 提示:必须在 Safari 中操作,Chrome/微信内置浏览器均不支持安装 PWA');
    } else {
      // 安卓: 通用引导 + APK 下载强调
      App._showHACModal('📲 安装到主屏幕', [
        { num: 1, html: '点击下方紫色按钮 <b>「下载安卓 APK」</b> 下载安装包' },
        { num: 2, html: '下载完成后,点击 APK 文件(部分手机需先在 <b>设置 → 安全</b> 中允许「安装未知来源应用」)' },
        { num: 3, html: '按提示完成安装,桌面将出现 <b>秩研Agent 图标</b>' },
        { num: 4, html: '打开后以 <b>全屏模式</b>运行,无浏览器地址栏,启动更快 ✅' }
      ], '🎁 APK 仅 76KB,无广告无追踪,所有计算均在本地完成');
    }
  };
  // 4. 模态显示/关闭
  App._showHACModal = function (title, steps, foot) {
    const modal = document.getElementById('hac-modal');
    const titleEl = document.getElementById('hac-modal-title');
    const bodyEl = document.getElementById('hac-modal-body');
    if (!modal) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = steps.map(s => `<div class="hac-step"><span class="hac-step-num">${s.num}</span><div class="hac-step-txt">${s.html}</div></div>`).join('') +
      (foot ? `<div style="margin-top:14px;padding:10px 12px;background:#f5f3ff;border-radius:10px;font-size:12px;color:#5b21b6;line-height:1.6;">${foot}</div>` : '');
    modal.style.display = 'flex';
  };
  App.hacClose = function () {
    const modal = document.getElementById('hac-modal');
    if (modal) modal.style.display = 'none';
  };
  // 5. 已安装 PWA 时(standalone) → 卡片降级为「已安装」状态
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    document.addEventListener('DOMContentLoaded', () => {
      const card = document.getElementById('home-app-card');
      if (card) {
        const desc = card.querySelector('.hac-desc');
        const foot = card.querySelector('.hac-foot');
        if (desc) desc.innerHTML = '✅ 你正在以 <b>APP 模式</b>运行秩研Agent,体验最佳!';
        if (foot) foot.innerHTML = '🎉 已从桌面图标启动,无浏览器地址栏';
        const actions = card.querySelector('.hac-actions');
        if (actions) actions.style.display = 'none';
      }
    });
  }
})();
