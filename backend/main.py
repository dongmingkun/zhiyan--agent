"""
线性代数助学智能体 · 后端 API (v2.0.0)
- POST /api/auth/register  用户注册
- POST /api/auth/login     用户登录
- GET  /api/auth/profile    获取用户信息
- POST /api/ask             智能问答（大模型 + RAG + 出处溯源）
- POST /api/rag/search      RAG 检索调试
- GET  /api/history         获取问答历史
- GET/POST /api/notes       错题本

运行：uvicorn main:app --host 0.0.0.0 --port 8000
"""

import ast
from .paths import PROJECT_ROOT, database_path
import base64
try:
    from . import ocr_engine
except Exception:
    ocr_engine = None   # 不可用时降级
try:
    from . import spark_image   # v=20260824f 科大讯飞星火图片理解(WebSocket)
except Exception:
    spark_image = None
import hashlib
import json
import math
import openai
import os
import re
import secrets
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, UploadFile, File as FastAPIFile, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
from . import engine as compute_engine  # 本地可验证符号/数值求解引擎（不依赖大模型）
from . import knowledge_graph as kg  # 线性代数知识点图谱（错题归因与漏洞雷达）

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

app = FastAPI(title="线性代数助学智能体 API", version="2.0.0")


@app.get("/api/version")
def api_version():
    """版本指纹：用于验证线上运行代码是否已更新"""
    return {"version": "2.1.0-admin-v3", "auth": "env-file-rotated"}


@app.on_event("startup")
def _startup():
    try:
        ensure_admin()
    except Exception as e:  # 不阻塞启动
        print("[管理员] 种子创建失败:", e)

    # v=20260920 冷启动预热:延迟 3s 后台发一个最小 LLM 请求,
    # 提前完成 TLS/连接/首轮 prefill,避免"部署后第一个问题等 1-3 分钟"的体验问题
    def _warmup():
        try:
            import threading
            time.sleep(3)
            _client = get_client()
            _model = os.environ.get("LLM_MODEL", "deepseek-chat")
            _client.chat.completions.create(
                model=_model,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=8,
                temperature=0.0,
            )
            print("[预热] LLM 连接预热完成")
        except Exception as e:
            print(f"[预热] 跳过(不影响服务): {e}")
    import threading
    threading.Thread(target=_warmup, daemon=True).start()

# ---------- 静态文件（前端）----------
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
if os.path.exists(os.path.join(FRONTEND_DIR, "index.html")):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
    app.mount("/lib", StaticFiles(directory=os.path.join(FRONTEND_DIR, "lib")), name="lib")
    # v=20260904c 版权收敛：教材全文（/textbook_pages 翻页截图）已下线，不再静态挂载

# v=20260922 PWA 根资源（manifest / service worker / 应用图标；图标位于 assets/icons/）
_PWA_ROOT_FILES = {
    "/manifest.json": ("manifest.json", "application/manifest+json"),
    "/sw.js": ("sw.js", "application/javascript"),
    "/assets/icons/icon-192.png": ("assets/icons/icon-192.png", "image/png"),
    "/assets/icons/icon-512.png": ("assets/icons/icon-512.png", "image/png"),
    "/assets/icons/icon-180.png": ("assets/icons/icon-180.png", "image/png"),
}
def _pwa_handler(filename, media_type):
    # Closure values are not FastAPI query parameters: callers cannot override paths.
    def serve():
        path = os.path.join(FRONTEND_DIR, filename)
        if os.path.isfile(path):
            return FileResponse(path, media_type=media_type)
        return JSONResponse({"ok": False, "detail": f"{filename} not found"}, status_code=404)
    return serve


for _pwa_url, (_pwa_file, _pwa_mime) in _PWA_ROOT_FILES.items():
    app.add_api_route(_pwa_url, _pwa_handler(_pwa_file, _pwa_mime), methods=["GET"])

# v=20260904c 版权收敛：教材全文已下线（原 textbook.pdf 不再服务）
# _TEXTBOOK_PATH 已移除，教材仅保留规范引用条目

# 用户上传图片目录（群聊/动态/私信图片）
UPLOAD_DIR = os.path.join(FRONTEND_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
if os.path.exists(UPLOAD_DIR):
    # 知识元数据(供前端异步加载,免打入 JS bundle,维护更简单)
    if os.path.isfile(os.path.join(DATA_DIR, "metadata.json")):
        @app.get("/metadata.json")
        def _serve_metadata():
            return FileResponse(os.path.join(DATA_DIR, "metadata.json"), media_type="application/json", filename="metadata.json")
    @app.get("/uploads/apk/秩研Agent-1.0.6.apk", include_in_schema=False)
    def _legacy_latest_apk():
        return RedirectResponse("/uploads/downloads/%E7%A7%A9%E7%A0%94Agent-1.0.6.apk", status_code=307)

    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ══════════════════════════════════════════════════════════════════════
# 模块化拆分（2026-09-11）：原单文件 8,804 行按功能域拆分为 core 与
# routes_* 共 13 个模块。本文件保留启动引导（应用创建 / 静态挂载 /
# PWA 资源）；core 提供共享服务层与数据访问，各 routes_* 模块按功能域
# 注册 API。拆分保持原单文件的单一命名空间语义：
#   core 与各 routes_* 通过 `from .core import *` 共享同一套服务，
#   与拆分前行为完全一致；uvicorn main:app / run.py 入口不变。
# ══════════════════════════════════════════════════════════════════════
__all__ = [k for k in globals() if not k.startswith("__")]

from . import core  # noqa: F401,E402  共享服务层（原第 133–2281 行）
from . import (  # noqa: F401,E402  各功能域路由（按原文件行序注册）
    routes_base,          # 首页 / 认证基础
    routes_admin,         # 管理后台 / 开发者控制台
    routes_auth_external,  # 短信 / 二维码 / OAuth
    routes_credits,       # 积分与支付
    routes_mistakes,      # 错题本云同步 / 历史 / 会话
    routes_qa,            # 智能问答 / RAG / 工作流 / 计算引擎
    routes_knowledge,     # 薄弱路径 / 变式题 / 知识图谱
    routes_student,       # 学习画像 / 掌握度 / 复习计划
    routes_self_path,     # 自训练状态 / 自适应路径
    routes_gamification,  # 学习小精灵与游戏化
    routes_social,        # 好友 / 群组 / 动态 / 私信
    routes_media,         # OCR / 视觉 / 上传 / 教材引用
)
from .core import *  # noqa: F401,F403  兼容 main.xxx 的历史访问方式
