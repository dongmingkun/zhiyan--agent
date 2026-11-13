# 训练数据与导出

本目录默认保留一份规范数据 `sft_combined.json`，结构为 `{"train": [...], "meta": {...}}`，每条记录采用 Alpaca 的 `instruction` / `input` / `output` 字段。

当前规范数据由根目录 347 条 QA 和 553 条知识片段重新生成，共 2,437 条指令样本；仅去除 57 条字段完全一致的衍生样本，未删改任何源 QA 或知识片段。`meta.source_sha256` 记录输入文件指纹。知识片段优先读取 `content`，为空时使用 `text`，因此原来仅有 `text` 的 11 条也能导出。

源数据中包含生成内容。这里的“当前”表示与本次交付源文件一致，不代表所有答案已通过数学审校或已完成模型微调。

在项目根目录运行：

```bash
python training/build_sft_dataset.py
python training/lora_finetune.py --dry-run
```

前一个命令只读根目录两个源 JSON，写本地导出文件；不访问网络，不调用模型，不修改源数据。固定种子确保相同输入可得到相同结果。第二个命令仅检查数据格式，不加载模型。

如外部工具需要其他格式，可按需导出，避免日常维护三份同样的数据：

```bash
python training/build_sft_dataset.py --format alpaca --output-dir work/sft-exports
python training/build_sft_dataset.py --format sharegpt --output-dir work/sft-exports
python training/build_sft_dataset.py --format all --output-dir work/sft-exports
```

`all` 还生成 `sft_stats.json`；它的内容与 combined 中的 `meta` 相同。微调脚本默认读取 combined，也兼容 Alpaca 列表。

在线问答使用 RAG 与动态 Few-shot，读取根目录知识库和 QA，不依赖本目录 SFT 导出。`lora_finetune.py` 是可选的 GPU 微调入口，需要另行准备兼容的 PyTorch / Transformers / TRL / PEFT / bitsandbytes 环境。本次验证范围为数据生成、格式与 Python 语法，没有运行 GPU 训练、下载模型或升级这组训练依赖。
