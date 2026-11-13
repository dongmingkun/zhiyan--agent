"""
可执行可验证线性代数求解引擎
================================
不依赖任何大模型，纯本地 SymPy(符号) + NumPy(数值) + Matplotlib(可视化) 实现。
核心差异化能力：
  - 对每一道題同时给出 **符号解（SymPy）** 与 **数值解（NumPy）**，并做交叉验证；
  - 自动生成 **可一键运行的 Python(SymPy/NumPy) 代码**；
  - 对关键恒等式（A·A⁻¹=I、Av=λv、A=PDP⁻¹、A≈USVᵀ 等）做 **数值回代验证**；
  - 对 2×2 特征值 / 正交投影等生成 **几何可视化图**。

这是通用 LLM / Codex 类工具做不了的：它们没有接入学科符号计算与可验证生态。
"""

import io
import os
import re
import base64
import traceback
import numpy as np
import sympy as sp

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

# 注册中文字体，通过 FontProperties 直接指定，确保图表中文标题可渲染。
# v=20260911 根因修复：不再硬编码单一 Linux 路径（本地 Windows 上必失败且无提示），
# 改为候选路径存在性检查 —— 逐个尝试，全部不存在才回退默认字体，并且只警告一次。
_CJK_FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",  # Debian/Ubuntu: fonts-noto-cjk（见 Dockerfile）
    "C:/Windows/Fonts/msyh.ttc",                              # Windows: 微软雅黑
    "C:/Windows/Fonts/simhei.ttf",                            # Windows: 黑体
]


def _load_cjk_font():
    """返回可渲染中文的 FontProperties；候选字体都不存在时回退默认并打印一次警告。"""
    for path in _CJK_FONT_CANDIDATES:
        if not os.path.isfile(path):
            continue
        try:
            fm.fontManager.addfont(path)
            return fm.FontProperties(fname=path)
        except Exception:
            continue
    print("[engine] 未找到可用的中文字体（已尝试：" + "、".join(_CJK_FONT_CANDIDATES)
          + "），图表中文标题可能显示为方块；容器内请安装 fonts-noto-cjk")
    return fm.FontProperties()


CJK_FP = _load_cjk_font()


# ---------------------------------------------------------------------------
# 输入安全：矩阵元素 → sympy 的安全解析
# ---------------------------------------------------------------------------
# 白名单字符集：字母/数字/下划线 + 四则运算/乘方/括号/逗号/空白（sympy 表达式所需字符）
_SYMPY_ALLOWED = re.compile(r'^[0-9A-Za-z_+\-*/^().,\s]*$')


def _safe_sympify(x):
    """把矩阵元素安全地解析为 sympy 对象。

    sp.sympify 内部走 eval，是字符串元素的注入面。这里独立实现等价 sanitizer
    （engine.py 不能 import core，避免拖入 fastapi 依赖），在解析前拦截：
      1) 出现 '__'（__class__/__globals__/__import__ 等属性链与魔法名）；
      2) 出现白名单以外的字符（引号、方括号、分号、等号等构造语法所必需）；
      3) '.' 只能出现在两个数字之间（即只允许小数点，禁止属性访问）。
    """
    s = str(x).strip()
    if '__' in s or not _SYMPY_ALLOWED.match(s):
        raise ValueError('非法矩阵元素')
    # 点号只能出现在两个数字之间（防属性访问；小数点保留）
    for m in re.finditer(r'\.', s):
        i = m.start()
        if not (i > 0 and i + 1 < len(s) and s[i-1].isdigit() and s[i+1].isdigit()):
            raise ValueError('非法矩阵元素')
    return sp.sympify(s)


# ---------------------------------------------------------------------------
# 任务元信息（供前端构建下拉与说明）
# ---------------------------------------------------------------------------
TASK_META = {
    "eigen": {"label": "特征值与特征向量", "needs": "matrix",
              "desc": "求方阵的特征值、特征向量，并验证 Av=λv。"},
    "inverse": {"label": "逆矩阵", "needs": "matrix",
                "desc": "求可逆方阵的逆，并验证 A·A⁻¹=I。"},
    "det": {"label": "行列式", "needs": "matrix",
            "desc": "计算方阵行列式（符号+数值），展示特征多项式。"},
    "rank": {"label": "矩阵的秩", "needs": "matrix",
             "desc": "求秩并给出行最简形 RREF。"},
    "solve_linear": {"label": "解线性方程组", "needs": "matrix+b",
                     "desc": "求解 Ax=b，区分唯一解/无穷解/无解，给出通解。"},
    "diagonalize": {"label": "矩阵对角化", "needs": "matrix",
                    "desc": "求 P、D 使 A=PDP⁻¹，并验证。"},
    "svd": {"label": "奇异值分解 SVD", "needs": "matrix",
            "desc": "数值分解 A=USVᵀ，并验证重建误差。"},
    "qr": {"label": "QR 分解", "needs": "matrix",
           "desc": "Gram–Schmidt 正交化得到 A=QR，验证 Q 正交。"},
    "nullspace": {"label": "零空间 / 基础解系", "needs": "matrix",
                  "desc": "求 Ax=0 的基础解系（零空间基）。"},
    "orthogonal_project": {"label": "正交投影", "needs": "vector",
                           "desc": "将向量正交投影到给定方向/子空间，几何可视化。"},
}

TASK_LIST = [{"key": k, **v} for k, v in TASK_META.items()]


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
def _matrix_from(matrix):
    """将 list[list] 转为 sympy 矩阵，并做基本校验。"""
    if not matrix or not isinstance(matrix, list) or not isinstance(matrix[0], list):
        raise ValueError("矩阵格式应为二维数组（行列表）。")
    rows = len(matrix)
    cols = len(matrix[0])
    for r in matrix:
        if len(r) != cols:
            raise ValueError("矩阵各行长度必须一致。")
        for x in r:
            # v=20260911 安全：bool 是 int 的子类，会伪装成 0/1 绕过数值语义（如 True 当 1），显式拒绝
            if x is None or isinstance(x, bool) or isinstance(x, (list, tuple, dict, set)) or \
                    not isinstance(x, (int, float, complex, str, sp.Basic)):
                raise ValueError("矩阵元素须为数字或表示符号的字符串，不能为 None、布尔值或嵌套结构。")
    # v=20260911 安全：字符串元素统一走 _safe_sympify（原实现直接 sp.sympify 且失败后
    # 回退 sp.Matrix(matrix)，等于绕过所有校验，可被 eval 注入）。
    def _elem(x):
        if _is_rational_str(x):
            return sp.Rational(str(x))     # 数字字面量：保持既有有理数/浮点表示
        return _safe_sympify(x)            # 符号表达式：白名单校验后再 sympify
    try:
        A = sp.Matrix([[_elem(x) for x in row] for row in matrix])
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"矩阵元素无法解析：{e}")
    return A, rows, cols


def _is_rational_str(x):
    try:
        float(x)
        return True
    except Exception:
        return False


def _to_float(np_arr):
    return np.array([[float(v) for v in row] for row in np_arr.tolist()], dtype=float)


def _latex_matrix(M):
    return sp.latex(M)


def _vec_to_list(v):
    return [sp.nsimplify(x) for x in v]


def _fig_to_b64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight",
                facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode("ascii")


def _complex_str(z, tol=1e-9):
    z = complex(z)
    if abs(z.imag) < tol:
        return f"{z.real:.6g}"
    return f"{z.real:.6g}{z.imag:+.6g}j"


_SYMBOLIC_GUARD_MSG = "含符号参数，请改用数值矩阵"


def _symbolic_fallback(steps, code="#" + _SYMBOLIC_GUARD_MSG + "\n"):
    """纯数值算法（SVD / QR / 对角化 / 零空间）遇到符号参数时的兜底结构。

    与 _task_eigen 等任务的兜底风格保持一致（返回完整结果结构而非抛异常），
    额外带 error 字段，便于前端/调用方明确提示用户改用数值矩阵。
    """
    steps.append({"title": "结论", "detail": _SYMBOLIC_GUARD_MSG + "。"})
    return {
        "steps": steps, "code": code, "symbolic": "—",
        "numeric": "含符号参数，不适用数值验证",
        "verified": False,
        "verification_notes": [_SYMBOLIC_GUARD_MSG],
        "plot": None,
        "error": _SYMBOLIC_GUARD_MSG,
    }


# ---------------------------------------------------------------------------
# 各任务处理器 —— 返回统一结构
#   {steps, code, symbolic, numeric, verified, verification_notes, plot?}
# ---------------------------------------------------------------------------

def _task_eigen(A, params):
    n = A.rows
    steps, notes = [], []
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})

    # 特征多项式
    lam = sp.symbols("λ")
    char_poly = (A - lam * sp.eye(n)).det()
    steps.append({"title": "构造特征方程",
                  "detail": f"|A-\\lambda I| = {sp.latex(sp.expand(char_poly))} = 0"})

    ev = A.eigenvects()  # (eigenval, mult, [vecs])
    eigvals = []
    eigvecs = []
    for val, mult, vecs in ev:
        eigvals.extend([val] * mult)
        eigvecs.extend(vecs)
    steps.append({"title": "求解特征值",
                  "detail": "特征值： " + ", ".join(sp.latex(v) for v in eigvals)})

    vec_lines = []
    for val, mult, vecs in ev:
        for v in vecs:
            vn = sp.nsimplify(v)
            vec_lines.append(f"\\lambda={sp.latex(val)} \\Rightarrow \\; \\mathbf{{v}}={sp.latex(vn)}")
    steps.append({"title": "求解特征向量",
                  "detail": "\\begin{aligned} " + " \\\\ ".join(vec_lines) + " \\end{aligned}"})

    # 交叉验证：优先数值（Av=λv），含符号参数时退回符号验证
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "for val, mult, vecs in A.eigenvects():\n"
        "    print('特征值:', val, '代数重数:', mult)\n"
        "    for v in vecs:\n"
        "        print('特征向量:', v.T)\n"
    )
    symbolic = ("\\begin{aligned} \\lambda &= " + ", ".join(sp.latex(v) for v in eigvals)
                + " \\\\ " + " \\\\ ".join(vec_lines) + " \\end{aligned}")
    plot = None
    try:
        M = _to_float(A)
        w_num, V_num = np.linalg.eig(M)
        ok = True
        for val, mult, vecs in ev:
            for v in vecs:
                vn = np.array([complex(x) for x in v], dtype=complex).reshape(-1, 1)
                lhs = M @ vn
                rhs = complex(val) * vn
                if np.max(np.abs(lhs - rhs)) > 1e-7:
                    ok = False
        verified = bool(ok)
        notes.append("对每个特征对验证 ‖Av-λv‖<1e-7：" + ("通过 ✓" if verified else "未通过 ✗"))
        numeric = "数值特征值：" + ", ".join(_complex_str(w) for w in sorted(w_num, key=lambda z: (z.real, z.imag)))
        if n == 2:
            plot = _plot_eigen_arrows(M, w_num, V_num)
    except (TypeError, ValueError):
        ok = True
        for val, mult, vecs in ev:
            for v in vecs:
                if not sp.simplify(A * v - val * v).is_zero_matrix:
                    ok = False
        verified = bool(ok)
        notes.append("含符号参数：符号验证每个特征对 Av=λv：" + ("通过 ✓" if verified else "未通过 ✗"))
        numeric = "含符号参数，不适用数值验证"

    return {"steps": steps, "code": code, "symbolic": symbolic, "numeric": numeric,
            "verified": verified, "verification_notes": [n for n in notes if n],
            "plot": plot}


def _plot_eigen_arrows(M, w, V):
    fig, ax = plt.subplots(figsize=(4.2, 4.2))
    ax.axhline(0, color="#cbd5e1", lw=1)
    ax.axvline(0, color="#cbd5e1", lw=1)
    colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706"]
    for i in range(V.shape[1]):
        v = V[:, i]
        if not np.allclose(v.imag, 0):
            continue  # 复数特征向量无法在二维平面绘制箭头，跳过
        v = v.real
        nrm = np.linalg.norm(v)
        if nrm < 1e-9:
            continue
        d = v / nrm
        ax.arrow(0, 0, d[0], d[1], head_width=0.08, head_length=0.12,
                 fc=colors[i % 4], ec=colors[i % 4], lw=2.2,
                 label=f"λ≈{_complex_str(w[i])}")
        ax.plot([d[0]], [d[1]], "o", color=colors[i % 4])
    ax.set_xlim(-1.3, 1.3)
    ax.set_ylim(-1.3, 1.3)
    ax.set_aspect("equal")
    ax.set_title("特征向量方向（单位化）", fontsize=11, fontproperties=CJK_FP)
    ax.legend(fontsize=8, loc="upper right", prop=CJK_FP)
    ax.grid(True, ls=":", color="#e2e8f0")
    return _fig_to_b64(fig)


def _task_inverse(A, params):
    steps, notes = [], []
    if A.rows != A.cols:
        raise ValueError("逆矩阵要求方阵。")
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    det = A.det()
    steps.append({"title": "计算行列式", "detail": f"\\det(A) = {sp.latex(sp.simplify(det))}"})
    if det == 0:
        steps.append({"title": "结论", "detail": "行列式为 0，矩阵**不可逆**（奇异）。"})
        return {"steps": steps, "code": "# 矩阵奇异，逆不存在\n", "symbolic": "A 不可逆（det=0）",
                "numeric": "不可逆", "verified": False,
                "verification_notes": ["det(A)=0 ⇒ A 不可逆"], "plot": None}
    Ainv = A.inv()
    steps.append({"title": "求逆矩阵", "detail": f"A^{{-1}} = {sp.latex(Ainv)}"})
    try:
        M = _to_float(A)
        Minv = _to_float(Ainv)
        I = M @ Minv
        err = np.max(np.abs(I - np.eye(A.rows)))
        verified = bool(err < 1e-8)
        notes.append(f"验证 A·A⁻¹≈I，最大偏差 {err:.2e}：" + ("通过 ✓" if verified else "未通过 ✗"))
        numeric = f"数值逆最大偏差 {err:.2e}"
    except (TypeError, ValueError):
        I_sym = sp.simplify(A * Ainv - sp.eye(A.rows))
        verified = bool(I_sym.is_zero_matrix)
        notes.append("含符号参数：符号验证 A·A⁻¹=I：" + ("通过 ✓" if verified else "未通过 ✗"))
        numeric = "符号验证（数值验证不适用）"
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "print('A⁻¹ =', A.inv())\n"
    )
    return {"steps": steps, "code": code, "symbolic": f"A^{{-1}} = {sp.latex(Ainv)}",
            "numeric": numeric, "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_det(A, params):
    steps, notes = [], []
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    d_sym = sp.simplify(A.det())
    steps.append({"title": "符号行列式", "detail": f"\\det(A) = {sp.latex(d_sym)}"})
    try:
        M = _to_float(A)
        d_num = float(np.linalg.det(M))
        rel = abs(complex(d_sym) - d_num) / (abs(d_num) + 1e-12)
        verified = bool(np.isfinite(rel) and rel < 1e-6)
        notes.append(f"数值行列式 {d_num:.6g}；与符号值相对误差 {rel:.2e}：" + ("一致 ✓" if verified else "不一致 ✗"))
        numeric = f"数值 det ≈ {d_num:.6g}"
    except (TypeError, ValueError):
        verified = True
        notes.append("含符号参数：纯符号精确计算（数值交叉验证不适用）")
        numeric = "含符号参数，不适用数值验证"
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "print('det =', sp.simplify(A.det()))\n"
    )
    return {"steps": steps, "code": code, "symbolic": f"\\det(A) = {sp.latex(d_sym)}",
            "numeric": numeric, "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_rank(A, params):
    steps, notes = [], []
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    r = A.rank()
    rref = A.rref()[0]
    steps.append({"title": "行最简形 RREF", "detail": f"\\mathrm{{RREF}}(A) = {sp.latex(rref)}"})
    steps.append({"title": "矩阵的秩", "detail": f"\\operatorname{{rank}}(A) = {r}"})
    try:
        M = _to_float(A)
        s = np.linalg.svd(M, compute_uv=False)
        r_num = int(np.sum(s > 1e-9))
        verified = (r == r_num)
        notes.append(f"数值秩（SVD 非零奇异值计数）={r_num}：" + ("与符号秩一致 ✓" if verified else "不一致 ✗"))
        numeric = f"数值秩 {r_num}"
    except (TypeError, ValueError):
        verified = True
        notes.append("含符号参数：符号秩计算（数值验证不适用）")
        numeric = "含符号参数，不适用数值验证"
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "print('rank =', A.rank())\n"
        "print('RREF =', A.rref()[0])\n"
    )
    return {"steps": steps, "code": code, "symbolic": f"\\operatorname{{rank}}(A) = {r}",
            "numeric": numeric, "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_solve_linear(A, b, params):
    steps, notes = [], []
    steps.append({"title": "输入方程组", "detail": f"A = {sp.latex(A)},\\; b = {sp.latex(sp.Matrix(b))}"})
    bvec = sp.Matrix(b)
    try:
        sol, params_sym = A.gauss_jordan_solve(bvec)
        particular = sol
        steps.append({"title": "特解", "detail": f"x_p = {sp.latex(particular)}"})
        ns = A.nullspace()
        if ns:
            steps.append({"title": "基础解系（零空间）",
                          "detail": " \\\\ ".join(sp.latex(v) for v in ns)})
            sym = " + ".join(f"c_{i+1}{sp.latex(v)}" for i, v in enumerate(ns))
            steps.append({"title": "通解",
                          "detail": f"x = x_p + ({sym})"})
        else:
            steps.append({"title": "通解", "detail": "系数矩阵满秩，解唯一。"})
        code = (
            "import sympy as sp\n"
            "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
            "b = sp.Matrix(" + str(list(b)) + ")\n"
            "sol, params = A.gauss_jordan_solve(b)\n"
            "print('特解:', sol)\n"
            "print('零空间基:', A.nullspace())\n"
        )
        symbolic = f"x_p = {sp.latex(particular)}" + (("；基础解系: " + ", ".join(sp.latex(v) for v in ns)) if ns else "；唯一解")
        try:
            M = _to_float(A)
            bp = _to_float(bvec).reshape(-1)
            xp = np.array([complex(x) for x in particular], dtype=complex).reshape(-1)
            resid = np.max(np.abs(M @ xp - bp))
            verified = bool(resid < 1e-7)
            notes.append(f"回代验证 ‖Ax_p-b‖={resid:.2e}：" + ("通过 ✓" if verified else "未通过 ✗"))
            numeric = f"回代残差 {resid:.2e}"
        except (TypeError, ValueError):
            resid_sym = sp.simplify(A * particular - bvec)
            verified = bool(resid_sym.is_zero_matrix)
            notes.append("含自由参数：符号回代验证 A·x_p=b：" + ("通过 ✓" if verified else "未通过 ✗"))
            numeric = "符号回代验证（数值验证不适用）"
        return {"steps": steps, "code": code, "symbolic": symbolic, "numeric": numeric,
                "verified": verified, "verification_notes": notes, "plot": None}
    except ValueError as e:
        steps.append({"title": "结论", "detail": "方程组**无解**（增广矩阵秩 > 系数矩阵秩，矛盾方程组）。"})
        return {"steps": steps, "code": "# 方程组无解\n", "symbolic": "无解（不相容）",
                "numeric": "无解", "verified": True,
                "verification_notes": ["已判定为矛盾方程组（无解）"], "plot": None}


def _task_diagonalize(A, params):
    steps, notes = [], []
    if A.rows != A.cols:
        raise ValueError("对角化要求方阵。")
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    try:
        P, D = A.diagonalize()
    except ValueError:
        steps.append({"title": "结论", "detail": "该矩阵**不可对角化**（无足够线性无关特征向量）。"})
        return {"steps": steps, "code": "# 不可对角化\n", "symbolic": "A 不可对角化",
                "numeric": "不可对角化", "verified": False,
                "verification_notes": ["无 n 个线性无关特征向量"], "plot": None}
    steps.append({"title": "特征值对角阵 D", "detail": f"D = {sp.latex(D)}"})
    steps.append({"title": "可逆过渡矩阵 P", "detail": f"P = {sp.latex(P)}（列即特征向量）"})
    try:
        M = _to_float(A)
        Pn = _to_float(P)
        Dn = _to_float(D)
    except Exception:
        # 符号 P/D 已在上方步骤给出，仅数值重建验证不适用（原实现此处直接抛异常导致 500）
        return _symbolic_fallback(steps)
    recon = Pn @ Dn @ np.linalg.inv(Pn)
    err = np.max(np.abs(recon - M))
    verified = err < 1e-7
    notes.append(f"验证 A≈PDP⁻¹，最大重建误差 {err:.2e}：" + ("通过 ✓" if verified else "未通过 ✗"))
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "P, D = A.diagonalize()\n"
        "print('P=', P); print('D=', D)\n"
    )
    return {"steps": steps, "code": code,
            "symbolic": f"D = {sp.latex(D)},\\; P = {sp.latex(P)}",
            "numeric": f"重建误差 {err:.2e}", "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_svd(A, params):
    steps, notes = [], []
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    try:
        M = _to_float(A)
    except Exception:
        # SVD 是纯数值算法：含符号参数时无法计算，明确提示而非崩成 500
        return _symbolic_fallback(steps)
    U, S, Vh = np.linalg.svd(M, full_matrices=False)
    steps.append({"title": "数值分解 A=USVᵀ",
                  "detail": "U、V 正交；S 为奇异值（降序）。"})
    recon = U @ np.diag(S) @ Vh
    err = np.max(np.abs(recon - M))
    verified = err < 1e-8
    notes.append(f"重建误差 ‖A-USVᵀ‖={err:.2e}：" + ("通过 ✓" if verified else "未通过 ✗"))
    s_str = ", ".join(f"{s:.6g}" for s in S)
    code = (
        "import numpy as np\n"
        "A = np.array(" + str([list(r) for r in A.tolist()]) + ", dtype=float)\n"
        "U, S, Vh = np.linalg.svd(A, full_matrices=False)\n"
        "print('奇异值:', S)\n"
    )
    return {"steps": steps, "code": code,
            "symbolic": f"\\sigma = ({s_str})",
            "numeric": f"重建误差 {err:.2e}；奇异值 {s_str}", "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_qr(A, params):
    steps, notes = [], []
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    Q, R = A.QRdecomposition()
    steps.append({"title": "正交矩阵 Q（Gram–Schmidt）", "detail": f"Q = {sp.latex(Q)}"})
    steps.append({"title": "上三角 R", "detail": f"R = {sp.latex(R)}"})
    try:
        M = _to_float(A)
        Qn = _to_float(Q)
        Rn = _to_float(R)
    except Exception:
        # 符号 Q/R 已在上方步骤中给出，这里只放弃数值交叉验证
        return _symbolic_fallback(steps)
    recon = Qn @ Rn
    QtQ = Qn.T @ Qn
    err1 = np.max(np.abs(recon - M))
    err2 = np.max(np.abs(QtQ - np.eye(Qn.shape[1])))
    verified = (err1 < 1e-7 and err2 < 1e-7)
    notes.append(f"验证 A=QR（误差 {err1:.2e}）且 QᵀQ=I（偏差 {err2:.2e}）：" + ("通过 ✓" if verified else "未通过 ✗"))
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "Q, R = A.QRdecomposition()\n"
        "print('Q=', Q); print('R=', R)\n"
    )
    return {"steps": steps, "code": code,
            "symbolic": f"Q = {sp.latex(Q)},\\; R = {sp.latex(R)}",
            "numeric": f"A=QR 误差 {err1:.2e}", "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_nullspace(A, params):
    steps, notes = [], []
    steps.append({"title": "输入矩阵", "detail": f"A = {sp.latex(A)}"})
    ns = A.nullspace()
    if not ns:
        steps.append({"title": "结论", "detail": "零空间只有零向量（矩阵列满秩），无基础解系。"})
        return {"steps": steps, "code": "# 零空间={0}\n", "symbolic": "\\ker(A)=\\{\\mathbf{0}\\}",
                "numeric": "仅零解", "verified": True,
                "verification_notes": ["列满秩，零空间平凡"], "plot": None}
    steps.append({"title": "基础解系", "detail": " \\\\ ".join(sp.latex(v) for v in ns)})
    try:
        M = _to_float(A)
    except Exception:
        # 符号基础解系依然有效（已在上方步骤给出），数值验证不适用
        return _symbolic_fallback(steps)
    ok = True
    for v in ns:
        vn = np.array([complex(x) for x in v], dtype=complex).reshape(-1)
        if np.max(np.abs(M @ vn)) > 1e-7:
            ok = False
    verified = ok
    notes.append("验证 A·v=0 对每个基向量：" + ("通过 ✓" if verified else "未通过 ✗"))
    code = (
        "import sympy as sp\n"
        "A = sp.Matrix(" + str([list(r) for r in A.tolist()]) + ")\n"
        "print('基础解系:', A.nullspace())\n"
    )
    return {"steps": steps, "code": code,
            "symbolic": "基础解系： " + ", ".join(sp.latex(v) for v in ns),
            "numeric": f"{len(ns)} 个基向量", "verified": verified,
            "verification_notes": notes, "plot": None}


def _task_orthogonal_project(vector, subspace, params):
    steps, notes = [], []
    v = sp.Matrix(vector)
    steps.append({"title": "待投影向量", "detail": f"\\mathbf{{v}} = {sp.latex(v)}"})
    if subspace.get("type") == "line" and "u" in subspace:
        u = sp.Matrix(subspace["u"])
        if u.dot(u) == 0:
            raise ValueError("投影方向向量 u 不能为零向量。")
        steps.append({"title": "投影方向", "detail": f"\\mathbf{{u}} = {sp.latex(u)}"})
        proj = (v.dot(u) / u.dot(u)) * u
        steps.append({"title": "正交投影公式", "detail": f"\\operatorname{{proj}}_u v = \\frac{{v\\cdot u}}{{u\\cdot u}}u = {sp.latex(sp.simplify(proj))}"})
        try:
            Mv = _to_float(v).reshape(-1)
            Mu = _to_float(u).reshape(-1)
        except Exception:
            # v=20260911 与 svd/qr/diagonalize/nullspace 同口径：含符号参数的向量无法数值验证，
            # 明确回退提示（原实现直接 _to_float 抛 TypeError → 路由 500）。
            # 符号投影结果已在上方「正交投影公式」步骤给出。
            return _symbolic_fallback(steps)
        proj_num = (np.dot(Mv, Mu) / np.dot(Mu, Mu)) * Mu
        resid = Mv - proj_num
        ortho = abs(np.dot(resid, Mu)) < 1e-9
        verified = ortho
        notes.append("验证 (v-proj)⊥u：" + ("通过 ✓" if verified else "未通过 ✗"))
        code = (
            "import numpy as np\n"
            "v = np.array(" + str(list(vector)) + ", dtype=float)\n"
            "u = np.array(" + str(list(subspace['u'])) + ", dtype=float)\n"
            "proj = (v@u/(u@u))*u\n"
            "print('proj =', proj)\n"
        )
        # v=20260911 维度校验：几何示意图只对二维有意义。
        # 原实现无条件调用 _plot_projection（内部按 v[0]/v[1] 取坐标），
        # 一维会 IndexError、三维以上会画出错误示意图。
        # 用元素个数判断（对一维输入等价于 len(vector)/len(u)，对嵌套写法也稳健）。
        plot = None
        if Mv.size == 2 and Mu.size == 2:
            plot = _plot_projection(Mv, proj_num)
        elif Mv.size == 1:
            steps.append({"title": "作图说明",
                          "detail": "一维情形无需几何图示，已给出数值投影结果。"})
        else:
            steps.append({"title": "作图说明",
                          "detail": f"仅支持二维作图（当前 {Mv.size} 维），已给出数值投影结果。"})
        return {"steps": steps, "code": code,
                "symbolic": f"\\operatorname{{proj}}_u v = {sp.latex(sp.simplify(proj))}",
                "numeric": f"数值投影 {[round(float(x),4) for x in proj_num]}",
                "verified": verified, "verification_notes": notes, "plot": plot}
    else:
        raise ValueError("正交投影需提供 subspace.type='line' 与 subspace.u（投影方向向量）。")


def _plot_projection(v, proj):
    fig, ax = plt.subplots(figsize=(4.6, 4.6))
    ax.axhline(0, color="#cbd5e1", lw=1)
    ax.axvline(0, color="#cbd5e1", lw=1)
    u_dir = proj / (np.linalg.norm(proj) + 1e-12)
    ax.plot([0, u_dir[0] * 2.2], [0, u_dir[1] * 2.2], "--", color="#94a3b8", lw=1.5, label="投影子空间")
    ax.arrow(0, 0, v[0], v[1], head_width=0.12, head_length=0.18, fc="#2563eb", ec="#2563eb", lw=2.4, label="v")
    ax.arrow(0, 0, proj[0], proj[1], head_width=0.12, head_length=0.18, fc="#dc2626", ec="#dc2626", lw=2.4, label="proj")
    # 残差虚线
    ax.plot([v[0], proj[0]], [v[1], proj[1]], ":", color="#16a34a", lw=1.8, label="v-proj")
    ax.set_xlim(-2.5, 2.5)
    ax.set_ylim(-2.5, 2.5)
    ax.set_aspect("equal")
    ax.set_title("正交投影几何示意", fontsize=11, fontproperties=CJK_FP)
    ax.legend(fontsize=8, loc="upper right", prop=CJK_FP)
    ax.grid(True, ls=":", color="#e2e8f0")
    return _fig_to_b64(fig)


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def _normalize(result):
    """统一规整：把 verified 强制为 Python bool，避免 numpy.bool_ 无法被 JSON 序列化。"""
    if isinstance(result, dict) and "verified" in result:
        result["verified"] = bool(result["verified"])
    return result


def solve(task: str, matrix=None, b=None, vector=None, subspace=None, params=None):
    meta = TASK_META.get(task)
    if not meta:
        raise ValueError(f"未知任务类型：{task}")
    if task == "orthogonal_project":
        if not vector or not subspace:
            raise ValueError("正交投影需要 vector 与 subspace。")
        if not isinstance(subspace, dict):
            raise ValueError("正交投影的 subspace 应为 {'type':'line','u':[...]} 格式的对象。")
        return _normalize(_task_orthogonal_project(vector, subspace, params or {}))
    if matrix is None:
        raise ValueError("该任务需要 matrix。")
    A, rows, cols = _matrix_from(matrix)
    if task == "solve_linear":
        if b is None:
            raise ValueError("解线性方程组需要右侧向量 b。")
        if len(b) != rows:
            raise ValueError("向量 b 的长度必须等于方程个数。")
        return _normalize(_task_solve_linear(A, b, params or {}))
    return _normalize({
        "eigen": _task_eigen, "inverse": _task_inverse, "det": _task_det,
        "rank": _task_rank, "diagonalize": _task_diagonalize, "svd": _task_svd,
        "qr": _task_qr, "nullspace": _task_nullspace,
    }[task](A, params or {}))


def task_list():
    return TASK_LIST
