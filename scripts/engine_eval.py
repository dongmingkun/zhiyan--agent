"""
30 题计算引擎交叉验证评测（可复现）。

对应《效果验证报告》§4.2：5 类主力任务（det / inverse / rank / eigen / solve_linear），
每类随机 6 题，全部经符号解（SymPy）与数值解（NumPy）交叉验证。
固定随机种子保证每次运行得到同一组题目；输出日志可直接作为《效果验证报告》附录 A4。

用法：
    python scripts/engine_eval.py                     # 打印到控制台
    python scripts/engine_eval.py --log <路径.txt>    # 同时写入日志文件

不访问网络、不调用大模型、不操作数据库。
"""
import argparse
import datetime
import random
import sys
from pathlib import Path

import sympy as sp

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from backend import engine

SEED = 20260824
N_PER_TASK = 6
TASKS = ["det", "inverse", "rank", "eigen", "solve_linear"]


def rand_matrix(task: str, n: int = 3, lo: int = -4, hi: int = 4):
    """生成 n×n 整数矩阵；inverse/solve_linear/eigen 要求可逆（或选 2×2 便于精确特征值）。"""
    n = 2 if task == "eigen" else n
    while True:
        A = [[random.randint(lo, hi) for _ in range(n)] for _ in range(n)]
        if task in ("inverse", "solve_linear", "eigen"):
            if sp.Matrix(A).det() != 0:
                return A
        else:
            return A


def main():
    parser = argparse.ArgumentParser(description="30 题计算引擎交叉验证评测")
    parser.add_argument("--log", type=str, default=None, help="日志输出文件路径")
    args = parser.parse_args()

    random.seed(SEED)
    lines = []
    lines.append("秩研 Agent 计算引擎交叉验证评测（30 题）")
    lines.append(f"运行时间：{datetime.datetime.now():%Y-%m-%d %H:%M:%S}")
    lines.append(f"引擎版本：v20260824l ｜ 随机种子：{SEED}（可复现）｜ 每任务 {N_PER_TASK} 题")
    lines.append("验证判据：det 相对误差<1e-6；inverse A·A⁻¹≈I 最大偏差<1e-6；rank SymPy/SVD 一致；")
    lines.append("          eigen 每特征对 ‖Av-λv‖<1e-7；solve_linear 回代残差<1e-6。")
    lines.append("")

    total = passed = 0
    summary = []
    for task in TASKS:
        task_pass = 0
        for i in range(N_PER_TASK):
            A = rand_matrix(task)
            b = [random.randint(-4, 4) for _ in range(len(A))] if task == "solve_linear" else None
            r = engine.solve(task, matrix=A, b=b)
            ok = bool(r.get("verified"))
            total += 1
            passed += ok
            task_pass += ok
            a_str = str(A).replace(" ", "")
            b_str = f" b={b}" if b else ""
            note = "；".join(r.get("verification_notes", []))
            lines.append(f"[{task} #{i + 1}] A={a_str}{b_str} -> verified={ok}  |  {note}")
        summary.append(f"{task}: {task_pass}/{N_PER_TASK}")
        lines.append(f"  -- {task} 通过 {task_pass}/{N_PER_TASK}")
        lines.append("")

    lines.append(f"合计：{passed}/{total} 通过（{passed / total * 100:.0f}%）")
    lines.append("各任务：" + "  ".join(summary))
    lines.append("")
    text = "\n".join(lines)
    print(text)
    if args.log:
        Path(args.log).parent.mkdir(parents=True, exist_ok=True)
        Path(args.log).write_text(text + "\n", encoding="utf-8")
        print(f"[日志已写入] {args.log}")


if __name__ == "__main__":
    main()
