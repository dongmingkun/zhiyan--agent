> 归档说明（2026-09-10）：以下为原始版本资料，保留用于追溯。部分版本号、目录、数据统计和评测陈述已过期；当前使用方法见 [根目录 README](../../README.md)。本次未重新验证历史评测结果。

# 后端 API（FastAPI）

为「线性代数助学智能体」提供**大模型问答**与**错题本持久化**。密钥只存在于后端，前端永不接触。

## 安装
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 配置
复制 `.env.example` 为 `.env`，填入密钥，并选择服务商（**已默认讯飞星火**，贴合挑战杯发榜单位）：
```bash
cp .env.example .env
```
- **讯飞星火（默认）**：`LLM_API_KEY` 取星火控制台「HTTP 服务接口认证信息 → APIPassword」，`LLM_BASE_URL=https://spark-api-open.xf-yun.com/v1`，`LLM_MODEL=generalv3.5`。
- 备选 DeepSeek / OpenAI / 混元：取消 `.env.example` 中对应注释即可，切换零成本。

## 运行
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
接口文档（自动生成）：http://localhost:8000/docs

## RAG 知识库（检索增强生成）
智能问答默认启用 RAG：先对用户问题做 BM25 检索（纯 Python 实现，无额外依赖），把命中的线性代数知识点作为上下文注入大模型，并要求模型**优先依据知识库作答、标注出处**。这直接对应挑战杯功能点③「知识权威可信」与「内容可追溯」。

- 语料来自前端 `js/knowledge.js` 的 6 章知识体系，由 `build_corpus.js` 切分为 17 个知识片段，生成 `knowledge_corpus.json`（**改了知识点后请重跑 `node build_corpus.js`**）。
- 检索器：`retrieval.py`，中文按单字、英文/数字按词做 BM25，关键词加权召回。
- 配置项（`.env`）：
  - `RAG_ENABLED=true|false` —— 是否启用（默认 true）
  - `RAG_TOP_K=4` —— 每次检索返回的知识点数量（默认 4）

## 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ask` | body: `{"question":"..."}` 或 `{"messages":[{"role","content"}...], "mode":"direct\|detailed\|guided"}` → `{"answer":"...", "citations":["..."], "rag_used":true, "sources":[{"source","chapter","section","snippet"}]}`（多轮优先用 messages；citations 为【出处】溯源；sources 为 RAG 命中知识点） |
| POST | `/api/rag/search` | body: `{"query":"...","top_k":4}` → 返回检索命中的知识片段（含得分 score），用于演示/调试检索效果 |
| POST | `/api/notes` | body: `{"question","answer","note"}` → `{"ok":true,"id":N}` |
| GET  | `/api/notes` | → `{"notes":[...]}` |
| GET  | `/` | 健康检查，返回 `rag_enabled / rag_available / corpus_size` 等状态 |

## 前端如何对接
- **同源部署**：后端与前端同一域名，前端 `fetch('/api/ask')` 即可（`app.js` 顶部 `API_BASE = ''`）。
- **分域部署**：把 `app.js` 顶部 `API_BASE` 改成后端地址，如 `'https://your-backend.com'`。
- **兜底**：后端不可用时，前端自动回退到内置规则模拟（`ChatEngine`），问答功能不中断。

## 部署建议
- 最快：Render / Railway / 腾讯云函数，上传本目录 + `.env` 即给公网地址。
- 自有服务器：`uvicorn` + `nginx` 反代 + `systemd` 守护进程。

### 容器化一键部署
本目录已提供 `Dockerfile` 与 `Procfile`，可直接部署到 Render / Railway / 任意容器平台：
1. 把 `backend/` 目录推到 Git 仓库（含 `requirements.txt` / `Dockerfile` / `Procfile`）。
2. 在平台新建 Web Service，构建命令 `pip install -r requirements.txt`，启动命令由 `Procfile` 提供（`uvicorn main:app --host 0.0.0.0 --port $PORT`）。
3. 在平台环境变量中设置 `LLM_API_KEY` 等（**不要写进仓库**），并注入 `PORT`（平台自动）。
4. 记下后端公网地址，例如 `https://la-tutor-backend.onrender.com`。
5. 前端侧：把 `js/config.js` 里的 `APP_CONFIG.API_BASE` 改成该地址，重新部署前端即可联调。

> 注意：`tutor.db`（错题本 SQLite）写在容器文件系统内，容器重启会丢失；生产可用挂载卷或换用云数据库。

