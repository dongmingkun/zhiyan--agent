> 归档说明（2026-09-10）：以下为原始版本资料，保留用于追溯。部分版本号、目录、数据统计和评测陈述已过期；当前使用方法见 [根目录 README](../../README.md)。本次未重新验证历史评测结果。

# 后端部署指南 · 让别人也能访问（接真实星火大模型）

> 目标：把 FastAPI 后端部署到一个**公网可访问**的云平台，拿到 HTTPS 地址，
> 再让前端（已部署在 CloudStudio）的问答真正调用星火大模型。
> 部署前问答走内置规则模拟；部署后问答 = 真实大模型 + RAG 知识库。

---

## 一、整体架构（部署后）

```
浏览器 ──► 前端(CloudStudio 公网)
              │  发 POST /api/ask
              ▼
          后端(云平台公网，如 Render/Railway)
              │  ① BM25 检索知识库  ② 调星火大模型
              ▼
        星火 API(spark-api-open.xf-yun.com)
```

- 前端已部署：https://b97d8b1df1c84242b4ec94a4c75e666e.gz3.agentos-app.net
- 后端需你自行部署（见下），部署后拿到形如 `https://la-tutor-backend.onrender.com` 的地址
- 把该地址填进前端 `js/config.js` 的 `API_BASE`，重新部署前端即完成联调

---

## 二、前置准备（需要你提供）

| 准备项 | 说明 | 哪里获取 |
|--------|------|----------|
| 星火 APIPassword | 大模型密钥，**必填**；没有它后端无法调用模型 | 讯飞开放平台 console.xfyun.cn → 创建应用 → 服务管理 → 星火认知大模型 → 复制「APIPassword」 |
| 代码仓库（可选） | 把 `linear-algebra-app/backend/` 推到 GitHub，平台连仓库即可 | github.com |
| 云平台账号 | Render / Railway 二选一（免费层够用） | render.com / railway.app |

> 没有 GitHub 也能部署：Railway 支持直接上传/连仓库，Render 也支持手动 Deploy。
> 本项目已配好 `Dockerfile` + `Procfile`，两种平台都能直接用。

---

## 三、环境变量清单（在平台控制台填写）

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `LLM_API_KEY` | ✅ | 无 | 星火 APIPassword |
| `LLM_BASE_URL` | 否 | `https://spark-api-open.xf-yun.com/v1` | 星火 OpenAI 兼容接口 |
| `LLM_MODEL` | 否 | `generalv3.5` | 星火 Max 模型标识 |
| `ALLOWED_ORIGINS` | 否 | `*` | 允许跨域的前端域名，逗号分隔；上线建议填前端域名（如 `https://b97d8b1....gz3.agentos-app.net`） |
| `RAG_ENABLED` | 否 | `true` | 是否启用 RAG 检索增强 |
| `RAG_TOP_K` | 否 | `4` | 每次检索返回的知识点数量 |
| `DB_PATH` | 否 | `tutor.db` | 错题本 SQLite 路径（容器内自动创建） |
| `PORT` | 否 | `8000` | 平台自动注入，无需手动设 |

> 切换其他模型：把 `LLM_BASE_URL`/`LLM_MODEL` 改成 DeepSeek/OpenAI/混元（见 `.env.example`）。

---

## 四、方案 A：Render 部署（推荐，最简单）

1. 打开 https://render.com → 注册/登录（可用 GitHub 账号）。
2. 右上角 **New + → Web Service**。
3. 连接你的 GitHub 仓库（内含 `backend/` 目录）；若未推仓库，先 `git push`。
   - 也可选 "Deploy an existing image" 或手动上传（Render 对纯目录部署推荐连 GitHub）。
4. 配置：
   - **Name**：`la-tutor-backend`（任意）
   - **Region**：选 `Singapore` 或 `Oregon`（离国内近）
   - **Runtime**：`Docker`（会自动用目录里的 `Dockerfile`）
   - **Branch**：`main`（或你的默认分支）
   - **Root Directory**：填 `backend`（只部署后端子目录）
   - **Instance Type**：`Free`（免费层够用）
5. 展开 **Environment → Add Environment Variable**，逐条填入「第三节」的变量，至少填 `LLM_API_KEY`。
6. 点击 **Create Web Service**。
7. 等待构建（1–3 分钟）。完成后顶部显示 `https://la-tutor-backend.onrender.com` 即为后端公网地址。

> 免费层注意：15 分钟无请求会休眠，首次访问需冷启动 10–30 秒，属正常。

---

## 五、方案 B：Railway 部署

1. 打开 https://railway.app → 注册/登录（GitHub 账号）。
2. **New Project → Deploy from GitHub repo**，选含 `backend/` 的仓库。
3. 在 Project 里选中该服务 → **Settings → Root Directory** 填 `backend`。
4. **Variables** 标签：添加 `LLM_API_KEY` 等（同第三节）。
5. Railway 会自动识别 `Dockerfile`/`Procfile` 并构建，完成后给一个 `*.railway.app` 地址。
6. 如需固定域名：Settings → Domains → Generate Domain。

---

## 六、方案 C：腾讯云容器服务（国内访问更快）

1. 登录腾讯云 → 容器服务 TKE 或「轻量应用服务器」+ Docker。
2. 把 `backend/` 目录构建镜像并推到「容器镜像服务 TCR」，或直接在 CVM 上 `docker build -t la-tutor . && docker run -d -p 8000:8000 -e LLM_API_KEY=xxx la-tutor`。
3. 配置安全组放行 8000 端口，或用 CLB/API 网关暴露 HTTPS。
4. 适合已有腾讯云资源、追求国内低延迟的场景。

---

## 七、前端联调（让线上链接接真大模型）

拿到后端公网地址（如 `https://la-tutor-backend.onrender.com`）后：

1. 把地址发给帮你部署前端的助手（或自行编辑 `js/config.js`）：
   ```js
   window.APP_CONFIG = {
     API_BASE: 'https://la-tutor-backend.onrender.com'  // 改成你的后端地址
   };
   ```
2. 重新部署前端（CloudStudio 上传更新后的 `index.html` + `js/`）。
3. 打开前端链接 → 发一条线代问题 → 答案底部出现「参考出处 / 📚 参考知识点（RAG 检索）」即说明已接真模型。

> 后端 `ALLOWED_ORIGINS` 默认 `*`，前端任意域名均可访问，无需在后端白名单加前端地址。
> 若你设置了具体 `ALLOWED_ORIGINS`，请填上前端的 CloudStudio 域名。

---

## 八、验证后端是否正常工作

```bash
# 健康检查（应返回 rag_enabled=true 等）
curl https://你的后端地址/

# RAG 检索测试（应返回相关知识点）
curl -X POST https://你的后端地址/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"特征值怎么求","top_k":3}'

# 智能问答（需 LLM_API_KEY 正确才返回答案）
curl -X POST https://你的后端地址/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是特征值？"}'
```

也可直接浏览器打开 `https://你的后端地址/docs` 用 Swagger 界面调试。

---

## 九、常见问题

- **问答返回 502 / 调用失败**：检查 `LLM_API_KEY` 是否填错（星火用「APIPassword」而非 APIKey）；确认 `LLM_BASE_URL` 未被改坏。
- **前端仍走模拟、没接模型**：确认 `config.js` 的 `API_BASE` 已是后端公网地址，且前端已重新部署；浏览器开 F12 看 Network 里 `/api/ask` 是否打到后端。
- **CORS 报错**：后端 `ALLOWED_ORIGINS` 若设了具体域名，必须包含前端域名；最简先设 `*`。
- **免费层首次很慢**：Render/Railway 休眠后冷启动 10–30 秒，多等一下或发一次请求唤醒。
- **知识库为空**：确认 `knowledge_corpus.json` 已随镜像打包（默认 `RAG_ENABLED=true` 会自动加载；若 `rag_available=false` 说明文件没打进镜像）。

---

## 十、本目录文件说明（部署用）

```
backend/
├── main.py              # FastAPI 应用：/api/ask /api/notes /api/rag/search
├── retrieval.py         # 纯 Python BM25 检索器（无第三方依赖）
├── knowledge_corpus.json# 已生成的 RAG 知识库（17 个片段，无需构建）
├── requirements.txt     # fastapi / uvicorn / openai / python-dotenv
├── Dockerfile           # python:3.11-slim + uvicorn，监听 $PORT
├── Procfile             # web: uvicorn ... --port $PORT
├── .dockerignore        # 忽略 .env / __pycache__ / 本地 db
├── .env.example         # 配置模板
└── README.md            # 接口与本地运行说明
```

> 部署只需 `backend/` 整个目录（含上述文件）。`build_corpus.js` 仅本地重建语料用，镜像内不需要。
