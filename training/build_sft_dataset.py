# -*- coding: utf-8 -*-
"""
build_sft_dataset.py · 构造线性代数垂类 SFT（监督微调）数据集

输入（统一 data/ 目录，与后端 DATA_DIR 一致）：
    data/training_data.json    —— 当前 QA 数据（含 key_points / common_mistakes）
    data/knowledge_corpus.json —— 当前知识片段（含整理内容及生成内容）

做法（数据增强，无需调用大模型）：
    1) 对每条训练样本，按“直接解答 / 引导式 / 纠错 / 要点总结”等教学模式生成多种指令变体；
    2) 对每条知识片段，生成“详细讲解 / 一句话要点”两种指令，把权威教材内容作为目标输出；
    3) 统一导出为 Alpaca 格式（{instruction,input,output}）与 ShareGPT 格式
       （{conversations:[{from,value}]}），供 QLoRA / SFT 直接消费。

输出：
    默认只生成 sft_combined.json：{train: [...], meta: {...}}。
    --format alpaca / sharegpt / all 可按需导出兼容格式。

用法：
    python training/build_sft_dataset.py
    python training/build_sft_dataset.py --format all
"""
import argparse
import hashlib
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from backend.paths import PROJECT_ROOT  # noqa: E402  (需先插入项目根目录)
# 数据文件已统一迁到 data/（与后端 backend/paths.py 的 DATA_DIR 语义一致）
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
TRAIN_PATH = os.path.join(DATA_DIR, "training_data.json")
CORPUS_PATH = os.path.join(DATA_DIR, "knowledge_corpus.json")

OUT_ALPACA = os.path.join(HERE, "sft_alpaca.json")
OUT_SHAREGPT = os.path.join(HERE, "sft_sharegpt.json")
OUT_COMBINED = os.path.join(HERE, "sft_combined.json")
OUT_STATS = os.path.join(HERE, "sft_stats.json")

def strip_matrix_hint(q: str) -> str:
    """去掉题干中用于排版的 '|a b; c d|' 风格提示，保留语义。"""
    return q.replace("|", "").replace("；", ";").strip()


def make_alpaca(instruction: str, output: str, inp: str = "") -> dict:
    return {"instruction": instruction, "input": inp, "output": output}


def make_sharegpt(instruction: str, output: str, inp: str = "") -> dict:
    user = instruction + (("\n\n" + inp) if inp else "")
    return {"conversations": [
        {"from": "human", "value": user},
        {"from": "gpt", "value": output},
    ]}


def source_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# ---------------------------------------------------------------------------
# 1) 基于 training_data.json 的指令变体
# ---------------------------------------------------------------------------
def build_from_training(entries):
    out = []
    for e in entries:
        q = e["question"]
        ans = e["answer"]
        kp = e.get("key_points", [])
        cm = e.get("common_mistakes", [])
        chap = e.get("chapter", "")
        sec = e.get("section", "")
        diff = e.get("difficulty", "")

        # (a) 直接解答
        out.append(make_alpaca(
            f"【{diff} · {chap} · {sec}】{q}",
            ans))
        # (b) 引导式教学（苏格拉底式）
        guided_out = (
            f"我们一步步来。{q}\n"
            "先用直觉理解：你能说出这道题属于哪类问题、核心概念是什么吗？\n"
            "（待学生回应）很好。接下来请尝试写出关键公式或步骤，我会帮你检查。\n"
            "参考完整解法如下，便于对照：\n" + ans
        )
        out.append(make_alpaca(
            f"请用引导式（苏格拉底式）教学，循序渐进地帮助学生理解：{q}",
            guided_out))
        # (c) 纠错式（基于常见错误）
        if cm:
            cm_text = "；".join(cm)
            out.append(make_alpaca(
                f"学生在做“{q}”时容易犯这些错误：{cm_text}。请先指出错误根源，再给出正确解法。",
                f"常见误区：{cm_text}。\n正确解法：{ans}\n"
                f"建议你重点检查：第一步是否用对公式、符号与维度是否匹配。"))
        # (d) 要点总结
        if kp:
            kp_text = "；".join(kp)
            out.append(make_alpaca(
                f"请总结“{sec}”的核心知识点与解题要点（{chap}）。",
                f"核心要点：{kp_text}。\n典型例题：{q}\n标准答案要点：{ans}"))
    return out


# ---------------------------------------------------------------------------
# 2) 基于 knowledge_corpus.json 的权威讲解
# ---------------------------------------------------------------------------
def build_from_corpus(passages):
    out = []
    for p in passages:
        chap = p.get("chapter", "")
        sec = p.get("section", "")
        content = (p.get("content") or p.get("text") or "").strip()
        if not content:
            continue
        # (a) 详细讲解
        out.append(make_alpaca(
            f"请详细讲解《线性代数》{chap}中的“{sec}”，要求先给直觉理解，再给严格定义与计算步骤，并标注易错点。",
            content))
        # (b) 一句话要点（压缩式指令，训练简洁表达）
        first_sentence = content.split("\n")[0].replace("#", "").strip()
        if first_sentence:
            out.append(make_alpaca(
                f"用一句话概括“{sec}”（{chap}）最关键的内容。",
                first_sentence))
    return out


def main():
    parser = argparse.ArgumentParser(description="从当前源数据构建可复现的 SFT 数据集")
    parser.add_argument("--format", choices=("combined", "alpaca", "sharegpt", "all"), default="combined")
    parser.add_argument("--output-dir", default=HERE, help="导出目录；默认 training/")
    args = parser.parse_args()
    # 读入前先检查存在性，给出可读报错（而不是 FileNotFoundError 堆栈）
    for path in (TRAIN_PATH, CORPUS_PATH):
        if not os.path.isfile(path):
            parser.error(
                f"数据文件不存在：{path}\n"
                f"请确认项目 data/ 目录完整（data/training_data.json、data/knowledge_corpus.json）。"
            )
    with open(TRAIN_PATH, "r", encoding="utf-8") as f:
        train = json.load(f)
    with open(CORPUS_PATH, "r", encoding="utf-8") as f:
        corpus = json.load(f).get("passages", [])

    records = []
    records += build_from_training(train)
    records += build_from_corpus(corpus)

    # 只删除字段完全一致的衍生样本，不按章节或相近题目合并。
    original_count = len(records)
    records = list({json.dumps(r, ensure_ascii=False, sort_keys=True): r for r in records}.values())
    # 固定局部随机数种子，使相同源数据产生相同输出。
    random.Random(42).shuffle(records)

    alpaca = records
    sharegpt = [make_sharegpt(r["instruction"], r["output"], r["input"]) for r in records]

    meta = {
        "source_training": len(train),
        "source_corpus": len(corpus),
        "total": len(records),
        "duplicates_removed": original_count - len(records),
        "source_sha256": {
            os.path.basename(path): source_hash(path)
            for path in (TRAIN_PATH, CORPUS_PATH)
        },
        "task": "linear-algebra-tutor-sft",
        "canonical_format": "combined",
        "record_format": "alpaca",
        "available_exports": ["combined", "alpaca", "sharegpt"],
        "base_recommended": "Qwen2.5-7B-Instruct / InternLM2.5-7B-Chat / deepseek-math-7b",
        "note": "从当前 QA 和知识库确定性生成的衍生数据；包含生成内容。未执行模型微调，数学正确性与训练适用性仍需独立评估。",
    }

    exports = {
        "combined": (os.path.basename(OUT_COMBINED), {"train": alpaca, "meta": meta}),
        "alpaca": (os.path.basename(OUT_ALPACA), alpaca),
        "sharegpt": (os.path.basename(OUT_SHAREGPT), sharegpt),
    }
    selected = list(exports) if args.format == "all" else [args.format]
    os.makedirs(args.output_dir, exist_ok=True)
    for name in selected:
        filename, data = exports[name]
        path = os.path.join(args.output_dir, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  -> {path}")
    if args.format == "all":
        with open(os.path.join(args.output_dir, os.path.basename(OUT_STATS)), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"源 QA 数量:          {len(train)}")
    print(f"源知识片段数量:      {len(corpus)}")
    print(f"SFT 指令样本总数:    {len(records)}")
    print(f"完全重复衍生样本:    {original_count - len(records)}")


if __name__ == "__main__":
    main()
