# 数据、文档与发布资源审计（2026-09-10）

本审计以解压后的 `work/original/05—作品代码` 为原始依据。文档作为待核对资料阅读，未执行其中的命令或指令。下述修改仅发生在 `outputs/zhiyan-agent`，原始包未修改。

## 原包统计与精确重复

原始目录共 126 个文件，合计 13,057,523 字节。全文件 SHA-256 分组仅发现两组精确重复：

| 文件对 | 单份字节 | SHA-256 | 处理 |
|---|---:|---|---|
| `对比实验报告.md` 与 `uploads/downloads/秩研Agent-对比实验报告.md` | 5,475 | `7724345e9049b257f73ea9f65f3270b28a92db86fb683ecda1d6eca73cd7212a` | 已移除交付根目录的重复报告；保留下载中心副本 |
| `uploads/apk/秩研Agent-1.0.6.apk` 与 `uploads/downloads/秩研Agent-1.0.6.apk` | 147,142 | `77e083c1dc7b29c65dd2e98e60c7274f18d888316fdeece320b728aaae85b604` | 已交根代理处理路径兼容，不由本代理修改 |

`js/*.js` / `js/*.v3.19.js` 与两份主样式不在精确重复组；它们是不同内容的历史/现行实现，是否移除由前端引用审计决定。字体的 `.woff` 与 `.woff2` 是不同编码，不宜按相同名称删去。

## 数据完整性

| 数据 | 当前原包事实 | 结论 |
|---|---|---|
| `knowledge_corpus.json` | 553 条；ID 无重复；整条记录无精确重复；非空 text/content 各自无完全重复 | 已保留全部源条目 |
| `training_data.json` | 347 条；问题无精确重复；整条记录无精确重复 | 已保留全部源 QA |
| corpus 的 text/content | 553 条有 text，542 条有 content，只有 6 条两字段完全相同 | 不属于可整体删除的重复字段；生成器需覆盖只有 text 的 11 条 |
| corpus 来源 | 321 条 source 标注为自进化生成，其余含整理知识、文献拓展等 | 不应把全库称作均为人工专家标注或教材原文 |
| 旧 SFT 四文件 | source_training=20、source_corpus=207、total=494 | 与当前源数据不一致，属于过期导出 |
| 旧 SFT 格式关系 | alpaca 等于 combined.train；ShareGPT 为逐条等价转换；stats 等于 combined.meta | 可以规范为一份主文件并保留按需转换能力 |
| `self_train_state.json` | 更新于 2026-09-05，计数 347/553，running=true | 是历史运行状态，不代表交付机器当前运行 |
| `seed_data.json` | 11 用户，213 聊天消息，63 会话，以及私信、画像、学习记录等 | 是数据库种子，并非只是知识点与题库；含非空凭据字段，不能凭旧说明断言均为合成数据 |

原包所有 JSON 均可解析。没有把近似主题、相似题目或不同答案当成可删数据。

## 已完成的训练数据整理

交付默认只保留 `training/sft_combined.json`，结构为 `{train: [...], meta: {...}}`，由当前 347 QA + 553 知识片段确定性生成。共生成 2,494 条候选，去除 57 条字段完全一致的衍生样本，保留 2,437 条。数据文件变大是因为旧导出只覆盖早期 20 QA + 207 语料，现在覆盖当前输入，不能把增长认定为代码冗余。

修改 `training/build_sft_dataset.py`：

- 默认只导出 combined；`--format alpaca/sharegpt/all` 可按需生成其他格式，`--output-dir` 可指定临时导出目录。
- 语料使用 `content or text`，避免漏掉 11 条仅 text 的条目。
- 只对生成样本做完整字段去重，不修改根目录两个源 JSON。
- 固定局部随机种子，记录源文件 SHA-256，确保可复现并能检测源数据是否变化。
- 只读两个本地 JSON，写指定导出目录，不访问网络、不调用大模型、不启动训练。

修改 `training/lora_finetune.py`：

- 默认读取 combined 的 train 字段，同时兼容原 Alpaca 列表。
- 校验数据非空、必需字符串字段存在，拒绝格式错误。
- 修正 Hugging Face 对话模板的 `value` 为 `content`。
- 将原本误称 token 数的字符总数正确标为字符数；明确 dry-run 仅验证数据格式。

交付移除旧 `sft_alpaca.json`、`sft_sharegpt.json`、`sft_stats.json`，新增 `training/README.md` 说明重建与转换方法。原始文件仍可从用户原 ZIP / work 原始副本追溯。

输入文件指纹：

- training_data.json：`b0fa8523c4b0b79d3c1dd6a272cd6c3efa8d6e1f116dcfe4a62a7e1b72e5b9cd`
- knowledge_corpus.json：`ba987f357e03b9cdeb2e2764acb3c9c06bfcb65cf7a350b44dc174779051b93f`

## 已完成的文档分类

| 原位置 | 交付位置 | 原文问题 |
|---|---|---|
| `README.md` | `docs/history/README.original.md` | 声称 backend 子目录与 17 片段语料，8000 端口等早期说明 |
| `DEPLOY.md` | `docs/history/DEPLOY.md` | 面向旧 backend 目录和早期接口部署 |
| `部署说明.md` | `docs/history/部署说明.md` | 比前两份新，但称已含 tutor.db、全空示例值、种子为知识点/题库等说法需纠正 |
| `技术报告.md` | `docs/history/project-originals/技术报告.md` | 混有历史数据、版本与评测陈述 |
| `成果包说明.md` | `docs/history/project-originals/成果包说明.md` | 2026-08-18 的 390 条、119 快照、旧 URL，文件大小与结构已过期 |
| `竞赛作品介绍.md` | `docs/history/project-originals/竞赛作品介绍.md` | 旧 494 SFT、41 MB 源码、不同发布日期，评测脚本未随包提供 |

六份原文均前置归档说明，指向根 README 作为当前指南；未把旧事实直接改造成“本次实测结果”。两个分类目录各新增 README 索引。

根目录重复实验报告已移除。下载中心报告保留历史实验的原文与日期；其声称的 `评测脚本/compare_llm_vs_system.py` 不在原包，不能称为本次已可复现实验。

## APK 与文档资源

- 7 个不同版本 APK 的 ZIP CRC 均通过。1.0.6 是原包中最高版本；1.0.0–1.0.5 合计 810,124 字节，是不同二进制的历史发布物，适合移出当前运行包，原包可追溯。
- 每个 APK 都发现当前用户所给 WorkBuddy 站点 URL，属于连接在线站点的安装包；原包没有 Android/Cordova 构建工程或签名材料，不能宣称具备从源码重建 APK 的完整链路。
- 1.0.6 在 `index.html:370` 使用 `/uploads/apk/…`，下载中心在 `uploads/downloads.html:117` 使用 `/uploads/downloads/…`。去重时必须同步页面引用或提供兼容路由；只删一份会造成旧链接失效。
- `uploads` 在 main.py 通过 StaticFiles 动态提供资源，且上传接口会生成 `/uploads/` URL；应保留静态挂载与上传目录。
- 路演 PPTX 的 ZIP CRC 通过，共 12 页；原包没有用于生成该 PPTX 的脚本，但这不影响既有文件下载。
- 原包缺失 PWA `icon-180.png` / `icon-192.png` / `icon-512.png`，index、manifest、后端均有引用。根代理已告知从线上补齐。
- 原文宣称的 `model_versions/`、`tutor.db`、GPU 权重与评测脚本未提供；运行数据库可初始化，不可把缺失快照或权重伪造补齐。
- 教材全文 `textbook.pdf` 与 `textbook_pages/` 在 main.py 中明确下线，存在 410 路由；不作为待恢复资源。

## 验证与限制

已验证：

1. 交付两个根源 JSON 与原包逐字节相同。
2. 相同输入重复生成 combined，结果逐字节相同。
3. 按需导出的 Alpaca / ShareGPT 与 combined 全部 2,437 样本逐条等价，stats 与 meta 相同。
4. combined 中记录的源文件 SHA-256 与实际文件一致。
5. 训练校验器接受 combined 与 Alpaca，默认 `--dry-run` 通过。
6. 两个训练 Python 脚本语法编译通过。

未运行 GPU 微调、下载基座模型或升级训练依赖；原 TRL 实训练接口仍需在兼容的 GPU / Python 依赖环境验证。没有重新验证历史评测、逐题数学正确性或从源码构建 APK。当前数据与交付源文件一致，不足以证明线上数据库、后台源代码或模型权重为最新；这些边界应由最终交付说明明确。
