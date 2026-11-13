# -*- coding: utf-8 -*-
"""
v=20260824f 科大讯飞星火图片理解 WebSocket 引擎
- 接口:wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image
- 鉴权:HMAC-SHA256 签名拼到 URL query
- 协议:WebSocket JSON,流式响应
- 配置(环境变量):
    SPARK_IMAGE_APPID
    SPARK_IMAGE_API_KEY
    SPARK_IMAGE_API_SECRET
    SPARK_IMAGE_DOMAIN  (默认 'image')
"""
from __future__ import annotations
import os
import json
import asyncio
import base64
import hashlib
import hmac
import logging
import time
from typing import AsyncIterator, Optional, List, Dict
from urllib.parse import urlencode

logger = logging.getLogger("spark_image")


def _is_configured() -> bool:
    """v=20260824f 是否配置了星火图片理解所需的全部凭证。"""
    return bool(
        os.environ.get("SPARK_IMAGE_APPID")
        and os.environ.get("SPARK_IMAGE_API_KEY")
        and os.environ.get("SPARK_IMAGE_API_SECRET")
    )


def _get_domain() -> str:
    """v=20260824k 官方文档 domain 可选 general(基础版)/imagev3(高级版)。
    旧值 'image' 已废弃,导致 code=10003。默认 imagev3 高级版。"""
    return os.environ.get("SPARK_IMAGE_DOMAIN", "imagev3")


def _build_auth_url() -> str:
    """v=20260824f 构造带鉴权的 WebSocket URL(HMAC-SHA256)。
    参考讯飞官方:https://www.xfyun.cn/doc/sparkimage"""
    host = "spark-api.cn-huabei-1.xf-yun.com"
    path = "/v2.1/image"
    date = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
    api_key = os.environ["SPARK_IMAGE_API_KEY"]
    api_secret = os.environ["SPARK_IMAGE_API_SECRET"]
    # 1. 签名原串
    signature_origin = f"host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
    signature_sha = hmac.new(
        api_secret.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    signature = base64.b64encode(signature_sha).decode("utf-8")
    # 2. 拼 authorization 原文
    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")
    # 3. 构造完整 URL
    query = urlencode({"authorization": authorization, "date": date, "host": host})
    return f"wss://{host}{path}?{query}"


def _build_request_payload(text: str, image_data_urls: List[str], temperature: float = 0.5, max_tokens: int = 2048) -> dict:
    """v=20260824f 构造星火图片理解请求体。
    星火要求:image 作为 text content 一部分(不是单独 content_type),
    图片用 data:image/jpeg;base64,xxx 格式,再拼用户问题文字。"""
    appid = os.environ["SPARK_IMAGE_APPID"]
    domain = _get_domain()
    # v=20260824k 官方协议(2026-03 起):text 数组必须拆分——
    #   每条图片一条消息: {"role":"user","content":"纯base64","content_type":"image"}
    #   问题单独一条消息: {"role":"user","content":"问题","content_type":"text"}
    # 首个元素必须是图片;content 传纯 base64(去掉 data:xxx;base64, 前缀),模型自动判断格式。
    messages = []
    for url in image_data_urls:
        if url.startswith("data:"):
            b64 = url.split(",", 1)[1] if "," in url else url
            messages.append({
                "role": "user",
                "content": b64,
                "content_type": "image",
            })
    messages.append({
        "role": "user",
        "content": text or "请看图回答。",
        "content_type": "text",
    })
    return {
        "header": {"app_id": appid, "uid": "zhiyan-agent-user"},
        "parameter": {"chat": {
            "domain": domain,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_k": 4,
            "auditing": "default",
        }},
        "payload": {"message": {"text": messages}},
    }


async def stream_chat(text: str, image_data_urls: List[str],
                      temperature: float = 0.5, max_tokens: int = 2048,
                      timeout: float = 60.0) -> AsyncIterator[str]:
    """v=20260824f 星火图片理解流式调用。逐块 yield delta 文本片段。"""
    if not _is_configured():
        raise RuntimeError("SparkImage 未配置(缺失 SPARK_IMAGE_APPID/API_KEY/API_SECRET)")
    # 1. 构造 payload + URL
    payload = _build_request_payload(text, image_data_urls, temperature, max_tokens)
    url = _build_auth_url()
    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    # 2. WebSocket 连接 + 收发
    # v=20260911 根因修复：原实现 ping_interval=None + `async for` 无超时，服务端不回包时
    # 会永久挂起（timeout 参数形同虚设）。改为：开开心跳（ping 20s / pong 20s），
    # 并对每次 recv 施加 asyncio.wait_for 超时；超时抛内建 TimeoutError，
    # 由调用方（core._spark_image_stream / routes_admin）走既有降级链路。
    import websockets  # 局部导入,避免强依赖
    async with websockets.connect(url, ping_interval=20, ping_timeout=20, close_timeout=5) as ws:
        await ws.send(payload_bytes)
        # 3. 流式接收
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout)
            except asyncio.TimeoutError as e:
                raise TimeoutError(f"SparkImage 接收超时(>{timeout}s)") from e
            try:
                data = json.loads(raw)
            except Exception:
                continue
            header = data.get("header", {})
            code = header.get("code", 0)
            if code != 0:
                err = header.get("message", "未知错误")
                logger.warning(f"[SparkImage] 服务端错误 code={code}: {err}")
                raise RuntimeError(f"SparkImage 服务端错误(code={code}): {err}")
            resp_payload = data.get("payload", {})   # 注意：不要覆盖上面的请求 payload
            choices = resp_payload.get("choices", {})
            status = choices.get("status", 0)
            # text 增量
            text_arr = choices.get("text", [])
            if text_arr:
                for t in text_arr:
                    yield t.get("content", "")
            # status=2 表示生成结束
            if status == 2:
                usage = resp_payload.get("usage", {})
                logger.info(f"[SparkImage] 完成 usage={usage}")
                break