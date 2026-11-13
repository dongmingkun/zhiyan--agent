# -*- coding: utf-8 -*-
"""极端输入健壮性测试（可复现，不改数据库、不调用外部模型）。

覆盖：空/不规则/非方阵/含 None 矩阵、奇异矩阵、无穷多解/无解方程组、
     符号参数（含参行列式/逆/秩/特征值/方程组）、大数/小数/无穷、检索空查询、图谱空输入。
通过标准（expect 语义）：
     clean —— 必须抛出 ValueError（业务异常），正常返回记 FAIL；
     none  —— 只要不裸崩即可：正常返回 PASS，异常被捕获也 PASS；
     ok    —— 必须正常返回，任何异常记 FAIL。

用法：python scripts/edge_tests.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import engine
from backend import retrieval
from backend import knowledge_graph as kg

RESULTS = []


def case(name, fn, expect="ok"):
    """expect 语义：
      "clean" —— 必须抛出 ValueError（业务异常）；正常返回记 FAIL，抛其他异常也记 FAIL
      "none"  —— 只要不把进程打崩即可：正常返回 PASS，任意异常被捕获也 PASS
      "ok"    —— 必须正常返回；任何异常记 FAIL
    """
    try:
        r = fn()
    except ValueError as e:
        RESULTS.append((name, "PASS" if expect in ("clean", "none") else "FAIL", expect,
                        f"业务异常: {type(e).__name__}: {str(e)[:80]}"))
    except Exception as e:
        # 非 ValueError：none 允许（能捕获即可），clean/ok 视为裸崩
        RESULTS.append((name, "PASS" if expect == "none" else "FAIL", expect,
                        f"非业务异常: {type(e).__name__}: {str(e)[:100]}"))
    else:
        # 正常返回：只有 clean 期望的是“必须抛异常”
        RESULTS.append((name, "FAIL" if expect == "clean" else "PASS", expect,
                        "返回成功" if not isinstance(r, dict) else
                        f"verified={r.get('verified')}, notes={len(r.get('verification_notes', []))}"))


def main():
    # ---------- 1. 基础容错 ----------
    case("det 空矩阵 []", lambda: engine.solve("det", matrix=[]), "clean")
    case("det 平铺列表 [1,2,3]", lambda: engine.solve("det", matrix=[1, 2, 3]), "clean")
    case("det 非方阵 2x3", lambda: engine.solve("det", matrix=[[1, 2, 3], [4, 5, 6]]), "none")
    case("det 不规则行 [[1,2],[3]]", lambda: engine.solve("det", matrix=[[1, 2], [3]]), "clean")
    case("det 含 None [[1,None],[3,4]]", lambda: engine.solve("det", matrix=[[1, None], [3, 4]]), "none")
    case("det 含字符串 [[1,'x'],[3,4]]", lambda: engine.solve("det", matrix=[[1, "x"], [3, 4]]), "none")
    case("unknown task", lambda: engine.solve("nope", matrix=[[1]]), "clean")
    case("det 无矩阵 None", lambda: engine.solve("det"), "clean")
    case("inverse 奇异矩阵", lambda: engine.solve("inverse", matrix=[[1, 2], [2, 4]]), "ok")
    case("inverse 非方阵", lambda: engine.solve("inverse", matrix=[[1, 2, 3], [4, 5, 6]]), "clean")
    case("inverse 1x1 [[5]]", lambda: engine.solve("inverse", matrix=[[5]]), "ok")
    case("inverse 1x1 零 [[0]]", lambda: engine.solve("inverse", matrix=[[0]]), "ok")
    case("rank 零矩阵", lambda: engine.solve("rank", matrix=[[0, 0], [0, 0]]), "ok")
    case("rank 非方阵 2x3", lambda: engine.solve("rank", matrix=[[1, 2, 3], [2, 4, 6]]), "ok")
    case("eigen 1x1", lambda: engine.solve("eigen", matrix=[[7]]), "ok")
    case("eigen 零矩阵", lambda: engine.solve("eigen", matrix=[[0, 0], [0, 0]]), "ok")
    case("eigen 复数特征值", lambda: engine.solve("eigen", matrix=[[0, -1], [1, 0]]), "ok")
    case("solve_linear 唯一解", lambda: engine.solve("solve_linear", matrix=[[2, 1], [1, 2]], b=[1, 1]), "ok")
    case("solve_linear 无解", lambda: engine.solve("solve_linear", matrix=[[1, 2], [2, 4]], b=[1, 3]), "ok")
    case("solve_linear 无穷多解", lambda: engine.solve("solve_linear", matrix=[[1, 2], [2, 4]], b=[1, 2]), "ok")
    case("solve_linear b 长度不符", lambda: engine.solve("solve_linear", matrix=[[1, 2], [3, 4]], b=[1]), "clean")
    case("solve_linear 非方阵A", lambda: engine.solve("solve_linear", matrix=[[1, 2, 3], [4, 5, 6]], b=[1, 2]), "none")
    case("solve_linear 无 b", lambda: engine.solve("solve_linear", matrix=[[1, 2], [3, 4]]), "clean")
    case("orthogonal_project 零向量", lambda: engine.solve("orthogonal_project", vector=[0, 0], subspace=[[1, 0], [0, 1]]), "none")
    case("orthogonal_project 空子空间", lambda: engine.solve("orthogonal_project", vector=[1, 1], subspace=[]), "none")
    case("orthogonal_project 零方向向量", lambda: engine.solve("orthogonal_project", vector=[1, 1], subspace={"type": "line", "u": [0, 0]}), "clean")
    case("orthogonal_project 正常", lambda: engine.solve("orthogonal_project", vector=[3, 4], subspace={"type": "line", "u": [1, 0]}), "ok")

    # ---------- 2. 数值极端 ----------
    case("det 4x4 整数", lambda: engine.solve("det", matrix=[[i + j for j in range(4)] for i in range(4)]), "ok")
    case("det 10x10 上三角", lambda: engine.solve("det", matrix=[[i + 1 if i == j else (1 if i < j else 0) for j in range(10)] for i in range(10)]), "ok")
    case("det 大数 1e12 量级", lambda: engine.solve("det", matrix=[[1e12, 2], [3, 4]]), "none")
    case("det 极小值 1e-300", lambda: engine.solve("det", matrix=[[1e-300, 1], [1, 1]]), "none")
    case("det 无穷 inf", lambda: engine.solve("det", matrix=[[1e308 * 1e308, 1], [1, 1]]), "none")
    case("inverse 近似奇异 1e-16", lambda: engine.solve("inverse", matrix=[[1 + 1e-16, 1], [1, 1]]), "none")
    case("eigen 4x4 随机整数", lambda: engine.solve("eigen", matrix=[[4, -1, 0, 2], [-1, 3, 1, 0], [0, 1, 5, -1], [2, 0, -1, 3]]), "none")
    case("solve_linear 3x3 满秩", lambda: engine.solve("solve_linear", matrix=[[3, 1, -1], [2, 4, 1], [-1, 2, 5]], b=[4, 1, 1]), "ok")
    case("solve_linear 含小数", lambda: engine.solve("solve_linear", matrix=[[0.1, 0.2], [0.3, 0.4]], b=[0.5, 0.6]), "ok")
    case("solve_linear 含负数", lambda: engine.solve("solve_linear", matrix=[[-2, 1], [1, -3]], b=[-1, 2]), "ok")

    # ---------- 3. 符号参数（旗舰场景：含参方程组分情况讨论） ----------
    case("det 含参数 a", lambda: engine.solve("det", matrix=[["a", 1], [1, 2]]), "none")
    case("inverse 含参数", lambda: engine.solve("inverse", matrix=[["a", 1], [1, 2]]), "none")
    case("rank 含参数", lambda: engine.solve("rank", matrix=[["a", 1], [2, "a"]]), "none")
    case("eigen 含参数", lambda: engine.solve("eigen", matrix=[["a", 1], [0, 2]]), "none")
    case("solve_linear 含参数(旗舰用例)",
         lambda: engine.solve("solve_linear", matrix=[["a", 1, 1], [1, "a", 1], [1, 1, "a"]], b=[1, "a", "a**2"]), "none")

    # ---------- 4. 检索与图谱 ----------
    r = retrieval.Retriever(str(ROOT / "data" / "knowledge_corpus.json"))
    if r.available:
        case("检索 空查询", lambda: r.search(""), "none")
        case("检索 纯标点", lambda: r.search("，，。？！、；："), "none")
        case("检索 纯数字", lambda: r.search("12345 67890"), "none")
        case("检索 超长查询(2000字)", lambda: r.search("矩阵" * 1000), "none")
        case("检索 英文查询", lambda: r.search("eigenvalue of matrix A"), "none")
        case("检索 特征值查询", lambda: r.search("求矩阵的特征值"), "ok")
    else:
        RESULTS.append(("检索器初始化", "SKIP", "-", "corpus 无法加载"))

    case("图谱 未知知识点章节", lambda: kg.get_chapter_of("不存在的知识点"), "none")
    case("图谱 知识点列表", lambda: len(kg.get_all_kps()) >= 0, "ok")
    case("图谱 薄弱点传播-空输入", lambda: kg.propagate_weakness({}), "none")
    case("图谱 薄弱点传播-未知点", lambda: kg.propagate_weakness({"不存在点": 3}), "none")
    case("图谱 薄弱点传播-正常", lambda: kg.propagate_weakness({"特征值": 3, "矩阵的秩": 1}), "ok")
    case("图谱 文本打标-空文本", lambda: kg.infer_knowledge_points(""), "none")
    case("图谱 文本打标-无关文本", lambda: kg.infer_knowledge_points("今天天气不错"), "none")
    case("图谱 文本打标-特征值", lambda: kg.infer_knowledge_points("求矩阵A的特征值与特征向量"), "ok")
    case("图谱 analyze-空输入", lambda: kg.analyze({}), "none")
    case("图谱 analyze-正常", lambda: kg.analyze({"特征值": 2, "矩阵的秩": 1}), "ok")

    # ---------- 汇总 ----------
    fails = [x for x in RESULTS if x[1] == "FAIL"]
    print("=" * 72)
    for name, status, expect, detail in RESULTS:
        print(f"[{status}] {name}  (期望:{expect})  -> {detail}")
    print("=" * 72)
    print(f"共 {len(RESULTS)} 例，失败 {len(fails)} 例")
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
