# 秩研 Agent · 线性代数智能助学系统

本项目是面向线性代数的学科垂类智能助学系统源代码仓库，基于 2026-09-10 可核对的前端与所提供后端源码整理。首页及其 24 个同源静态依赖与原始压缩包逐字节一致；以这组文件为基础保留功能、清理重复并补齐资源。具体变更和验证范围见 [整理报告](docs/archive/audit/CLEANUP_REPORT.md)。

仓库地址：<https://github.com/dongmungkung/zhiyan--agent>

> **GitHub 只托管源代码，不运行 FastAPI 后端，因此本仓库地址不是在线体验地址。**
> 在线演示请观看提交材料中的演示视频/APK，或按下方「启动」在本地运行完整系统。
> “当前版本”指本次可核对的前端与所提供后端源码，不代表已取得生产数据库或模型权重。

## Demo

| 项目 | 内容 |
| --- | --- |
| 演示账号 | `demo` / `demo123` |
| 本地地址 | `http://127.0.0.1:8000`（可用 `PORT` 修改） |
| 移动端 | `uploads/downloads/秩研Agent-1.0.6.apk` |
| 演示视频 | 见提交材料 `06—效果验证报告` |
| 核心能力 | 智能问答、分步讲解、可验证计算引擎、拍图识题、错题本、学习画像 |

本地首次演示需要在 `.env` 中设置 `ENABLE_DEMO_SEED=true`（仅对空库生效），然后使用上述账号登录；首页也提供「一键演示账号登录」按钮。

## 启动

建议 Python 3.11，打开终端：

```bash
git clone https://github.com/dongmungkung/zhiyan--agent.git
cd zhiyan--agent
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# 编辑 .env：本地演示设置 ENABLE_DEMO_SEED=true；智能问答还需填写 LLM_API_KEY
.\.venv\Scripts\python.exe run.py
```

macOS / Linux：

```bash
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
# 编辑 .env：本地演示设置 ENABLE_DEMO_SEED=true；智能问答还需填写 LLM_API_KEY
.venv/bin/python run.py
```

打开 `http://127.0.0.1:8000`。默认端口 8000，可通过 `PORT` 修改。前端为原生 HTML/CSS/JavaScript，无 npm 构建步骤；运行主站不需要 Node.js。Node.js 仅用于语法检查和可选维护工具。

页面、知识库和本地数学计算不需要大模型密钥。智能问答需要在 `.env` 填写实际有效的 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`；图片问答、短信、第三方登录、支付等功能还依赖各自服务配置。未配置的外部服务不能仅凭源码包恢复。

管理员初始密码通过 `ADMIN_PASSWORD` 配置；没有配置时不会创建固定密码管理员。演示种子导入默认关闭，仅在独立空库明确需要演示数据时设置 `ENABLE_DEMO_SEED=true`。本仓库的 `data/seed_data.json` 已脱敏，只保留 `demo` 演示账号及其学习记录；原始完整历史种子不随仓库公开。

## 文件分类

| 分类 | 目录 / 文件 | 作用 |
| --- | --- | --- |
| 统一入口 | `run.py`、`main.py` | 启动与备份；保留 `uvicorn main:app` 兼容入口 |
| 后端 | `backend/` | API、计算引擎、检索、知识图谱、OCR、图片模型适配、统一路径 |
| 页面 | `index.html` | 首页及各功能视图，保持原脚本加载顺序 |
| 前端逻辑 | `js/` | 主应用已按功能域拆分为 `app-01`~`app-14`（2026-09-11），其余脚本保留线上 `v3.19` 文件名 |
| 页面样式 | `css/` | 主样式已按功能域拆分为 `style-01`~`style-12`（2026-09-11），按原顺序加载，层叠顺序不变 |
| 第三方静态库 | `lib/katex/` | 公式渲染 KaTeX 0.16.9 与字体（随附许可证） |
| 应用安装 | `manifest.json`、`sw.js`、`assets/icons/` | PWA 元数据、缓存与图标 |
| 维护工具 | `scripts/` | 语料导出、数据维护、检查工具；按说明单独执行 |
| 训练工具与导出 | `training/` | 自学习脚本、SFT 生成与可选 LoRA 微调 |
| 可下载成果 | `uploads/downloads/`、`uploads/downloads.html` | 当前 APK、演示资料、自编样卷、实验报告 |
| 当前指南 | `README.md`、`技术报告.md` | 启动指南与当前版技术报告（含竞赛对照表、模型接入与 ServiceID） |
| 归档资料 | `docs/archive/` | 核验证据（audit/）与历史文档（history/），仅供追溯 |
| 部署配置 | `.env.example`、`requirements*.txt`、`Dockerfile`、`Procfile` | 环境模板、基础/可选依赖和部署入口 |

运行数据集中在 `data/` 目录，后台与维护工具按此约定读取：

| 文件 | 说明 |
| --- | --- |
| `data/knowledge_corpus.json` | 当前 553 条检索语料，源数据完整保留 |
| `data/training_data.json` | 当前 347 条问答，供动态 Few-shot / 数据导出 |
| `data/metadata.json` | 知识点关系和元信息，前后端共同使用 |
| `data/model_config.json` | 原有模型 / 自学习配置 |
| `data/seed_data.json` | 脱敏后的 demo 演示账号与学习记录；默认不导入，设置 `ENABLE_DEMO_SEED=true` 后导入 |

数据清理审计记录已归档到 `docs/archive/audit/data_cleanup_audit.json`。

`tutor.db`、`.env`、`auth_secret.key`、备份、日志、模型训练产物属于运行环境数据，不在交付源码中。首次运行会按实际需要生成本地状态；部署已有服务时应保留现有数据库、密钥及用户上传文件。

## 提交相关文档

- **当前版技术报告**：[技术报告.md](技术报告.md)，含竞赛要求对照表、功能清单、模型接入与 ServiceID 填写位、部署复现、评测数据与合规说明。
- **模型 ServiceID**：提交前在 [data/model_config.json](data/model_config.json) 的 `model_service_id` 字段填写实际 ServiceID（星火控制台「HTTP 服务接口认证信息」），并在 `.env` 填入对应密钥。
- **正版软件与开源合规**：前端第三方库 KaTeX 本地化并随附许可证（`lib/katex/LICENSE`）；后端与训练依赖均为开源许可，详见技术报告第十一节。

## 前端功能对应

| 文件 | 功能 |
| --- | --- |
| `js/app-01-core.js` ~ `js/app-14-misc.js` | 原 `app.v3.19.js`（13,520 行）按功能域拆分：core/admin/auth/resources/helpers/profile/profile-detail/social/chat/chat-stream/chat-bubbles/matrix-parse/utils/misc，成员以 App.xxx 赋值挂载，加载顺序见 index.html |
| `js/auth.v3.19.js` | 登录状态与认证请求 |
| `js/chat.js` | 问答交互 |
| `js/knowledge.js` | 知识体系 |
| `js/math-tools.js`、`js/visualizer.js` | 数学工具与几何可视化 |
| `js/quiz-bank.js`、`js/quiz-system.v3.19.js`、`js/quiz-ui.v3.19.js` | 题库、测试逻辑与界面 |
| `js/resources.js`、`js/exam-papers.js` | 教学资源与样卷 |
| `js/social.js` | 社区与交流界面 |
| `js/config.js` | 前端 API 地址，同源部署保持空值 |
| `js/floating-formulas.js` | 公式背景装饰 |

大文件中仍有正在使用的功能代码及兼容样式。本次只删除能够证明无引用或等价冗余的内容；同名选择器、不同字体格式、不同算法实现不自动视为重复。

## 检查与数据更新

```bash
python scripts/check_project.py
python scripts/smoke_test.py
python scripts/engine_eval.py        # 30 题计算引擎交叉验证评测（固定种子可复现）
python scripts/edge_tests.py         # 极端输入健壮性测试（58 例，含符号参数/奇异矩阵等）
python training/lora_finetune.py --dry-run
```

第一个命令检查语法及静态依赖，不启动服务、不改数据库；有 Node.js 时也检查 JavaScript。第二个命令在临时副本启动本地服务，验证计算、检索、静态文件及数据保留，结果写入 `work/`；不会操作现有数据库或调用外部模型。训练数据及按需导出见 [训练说明](training/README.md)。默认只保留一份当前 `sft_combined.json`：2,437 条指令样本，包含源文件 SHA-256，其他格式可随时生成。

```bash
python training/build_sft_dataset.py
node scripts/build_corpus.js
```

前一个命令由当前两个源 JSON 生成 SFT。后一个只导出前端的 17 个知识片段，默认写入 `work/knowledge-from-frontend.json`，拒绝覆盖已有文件；它是完整 553 条语料的一个子集，不能直接替代完整知识库。

可选 OCR 依赖见 `requirements-ocr.txt`。GPU 微调依赖不属于基础网站环境。管理界面中的后台训练进程控制保留原有 Linux 工具依赖，应在 Linux 环境使用。

## 部署

使用项目根目录作为构建上下文：

```bash
docker build -t zhiyan-agent .
docker run --env-file .env -p 8000:8000 -v zhiyan-data:/data -v zhiyan-backups:/app/backups -v zhiyan-uploads:/app/uploads -e DB_PATH=/data/tutor.db -e AUTH_SECRET=your-stable-random-secret zhiyan-agent
```

示例中的签名密钥必须替换为自己的稳定随机值。生产部署还应持久化用户上传目录与所需训练状态；不要覆盖包内自带的下载资料。`run.py` 启动前按实际 `DB_PATH` 备份已有数据库，默认保留最近 10 份。原始部署文档已归档，端口和目录以本 README 与当前配置为准。

浏览器 Tesseract OCR 仍使用原有 CDN 脚本与运行时资源，网络问答及其他外部服务需要联网；本项目不能宣称所有功能完全离线运行。
