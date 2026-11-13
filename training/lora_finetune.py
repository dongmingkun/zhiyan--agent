# -*- coding: utf-8 -*-
"""
lora_finetune.py · 线性代数垂类大模型 LoRA / QLoRA 微调脚本

目标：在通用基座模型（如 Qwen2.5-7B-Instruct / InternLM2.5-7B-Chat /
deepseek-math-7b）之上，用本项目的 SFT 数据集（training/sft_combined.json）
做参数高效微调。样本数与来源见数据集 meta；本交付未执行模型微调。

技术栈：transformers + peft(4-bit QLoRA) + trl(SFTTrainer) + bitsandbytes
（可选 accelerate 多卡）。

训练流程：
    1) 4-bit 量化加载基座（QLoRA，显存友好）；
    2) 仅训练 LoRA 低秩适配层（r=16, alpha=32, dropout=0.05）；
    3) 用 ChatML/基座模板把 {instruction,input,output} 拼成对话样本；
    4) SFTTrainer 监督微调；
    5) 合并权重并导出（merge_and_unload），供推理部署。

验证（无 GPU / 无依赖时也可跑）：
    python training/lora_finetune.py --dry-run
    —— 仅校验数据集格式、统计字符规模、打印训练计划，不加载模型。

真实训练（需 GPU + 依赖）：
    pip install torch transformers peft trl bitsandbytes accelerate
    python training/lora_finetune.py \
        --base_model Qwen/Qwen2.5-7B-Instruct \
        --data training/sft_combined.json \
        --output_dir outputs/lora-linear-algebra \
        --epochs 3 --batch_size 4 --lr 2e-4

注意：本项目线上推理走的是“RAG + 动态 Few-shot”路径（见 main.py 的
dynamic few-shot），本脚本用于产出可离线部署的专用微调权重，二者互补：
微调负责“教学风格与领域语感”，RAG 负责“权威知识不出错”。
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_DATA = os.path.join(HERE, "sft_combined.json")


def validate_dataset(path: str):
    """校验 SFT 数据集格式，返回 (samples, stats)。"""
    if not os.path.exists(path):
        raise FileNotFoundError(f"数据集不存在: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("train")
    if not isinstance(data, list):
        raise ValueError("数据集应为 {train: [...], meta: {...}} 或 Alpaca list[{instruction,input,output}]")
    if not data:
        raise ValueError("数据集不得为空")
    required = {"instruction", "output"}
    bad = [i for i, r in enumerate(data)
           if not isinstance(r, dict) or not required.issubset(r)
           or not all(isinstance(r.get(k, ""), str) for k in ("instruction", "input", "output"))
           or not r["instruction"].strip() or not r["output"].strip()]
    if bad:
        raise ValueError(f"以下样本缺少必需字段: {bad[:10]}")
    # 不加载分词器，只统计字符；token 数取决于实际使用的基座模型。
    total_chars = sum(len(r["instruction"]) + len(r.get("input", "")) + len(r["output"]) for r in data)
    stats = {
        "samples": len(data),
        "total_chars": total_chars,
        "avg_chars": total_chars // len(data),
        "missing_field_count": len(bad),
    }
    return data, stats


def dry_run(path: str):
    print("=" * 60)
    print("DRY RUN · 仅校验数据集与训练计划（不加载模型）")
    print("=" * 60)
    data, stats = validate_dataset(path)
    print(f"样本数:        {stats['samples']}")
    print(f"总字符数:      {stats['total_chars']:,}（非 token 数）")
    print(f"平均字符/样本: {stats['avg_chars']}")
    print("\n示例样本:")
    for r in data[:2]:
        print("  instruction:", r["instruction"][:60])
        print("  output     :", r["output"][:60].replace("\n", " "))
        print("  ---")
    print("\n建议训练配置（7B 模型 / 单张 24G 显卡）:")
    print("  method      : QLoRA (4-bit NF4)")
    print("  lora_r      : 16")
    print("  lora_alpha  : 32")
    print("  lora_dropout: 0.05")
    print("  target_modules: all-linear (含 q,k,v,o,gate,up,down)")
    print("  epochs      : 3")
    print("  lr          : 2e-4 (cosine)")
    print("  per_device_bs: 4  (gradient_accumulation=4 => 有效 bs=16)")
    print("\n数据格式校验通过。实际训练仍需兼容的 GPU、依赖与基座模型；本次未验证这些条件。")


def real_train(args):
    """真实训练路径（需 GPU 与依赖）。"""
    try:
        import torch
        from transformers import (AutoModelForCausalLM, AutoTokenizer,
                                  BitsAndBytesConfig, TrainingArguments)
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from trl import SFTTrainer
    except ImportError as e:
        print(f"[错误] 缺少训练依赖: {e}\n请先安装: pip install torch transformers peft trl bitsandbytes accelerate")
        sys.exit(1)

    data, stats = validate_dataset(args.data)
    print(f"加载数据集: {stats['samples']} 条")

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules="all-linear",
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    def fmt(example):
        instr = example["instruction"]
        inp = example.get("input", "")
        out = example["output"]
        user = instr + (("\n\n" + inp) if inp else "")
        # 采用基座的对话模板（ChatML 风格）
        text = tokenizer.apply_chat_template(
            [{"role": "user", "content": user}, {"role": "assistant", "content": out}],
            tokenize=False,
        )
        return {"text": text}

    import datasets
    ds = datasets.Dataset.from_list(data).map(fmt)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        bf16=True,
        logging_steps=10,
        save_strategy="epoch",
        optim="paged_adamw_8bit",
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=ds,
        dataset_text_field="text",
        max_seq_length=args.max_seq_len,
        tokenizer=tokenizer,
    )
    trainer.train()

    # 导出：保存 LoRA 适配器，并提供合并脚本入口
    trainer.save_model(args.output_dir)
    print(f"LoRA 适配器已保存到 {args.output_dir}")
    print("如需合并为完整权重用于部署：")
    print(f"  from peft import PeftModel; m=PeftModel.from_pretrained(base, '{args.output_dir}'); m.merge_and_unload().save_pretrained('merged/')")


def main():
    p = argparse.ArgumentParser(description="线性代数垂类 LoRA/QLoRA 微调")
    p.add_argument("--base_model", default="Qwen/Qwen2.5-7B-Instruct")
    p.add_argument("--data", default=DEFAULT_DATA)
    p.add_argument("--output_dir", default=os.path.join(HERE, "outputs", "lora-linear-algebra"))
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--batch_size", type=int, default=4)
    p.add_argument("--grad_accum", type=int, default=4)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--lora_r", type=int, default=16)
    p.add_argument("--lora_alpha", type=int, default=32)
    p.add_argument("--lora_dropout", type=float, default=0.05)
    p.add_argument("--max_seq_len", type=int, default=1024)
    p.add_argument("--dry-run", action="store_true", help="仅校验数据集与训练计划，不训练")
    args = p.parse_args()

    if args.dry_run:
        dry_run(args.data)
    else:
        real_train(args)


if __name__ == "__main__":
    main()
