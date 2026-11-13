"""routes_media.py —— OCR、视觉识别、上传、教材引用（原 backend/main.py 第 8622–8804 行，2026-09-11 模块化拆分）。"""
from .core import *  # noqa: F401,F403  共享服务层（app / 鉴权 / RAG / 数据访问）


@app.post("/api/ocr")
async def api_ocr(file: UploadFile = FastAPIFile(...), user: dict = __import__('fastapi').Depends(require_user)):
    """v=20260824 OCR 图片文字识别(基于 RapidOCR / PaddleOCR ONNX)。
    用于 Agent 图片问答 OCR 降级路径(用户发题图但未配视觉模型时,服务端提取文字交给主 LLM)。
    输入:图片文件(multipart)。输出:{text, lines[], engine, cost_ms}。"""
    if ocr_engine is None:
        raise HTTPException(status_code=503, detail="OCR 引擎未安装/未初始化")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件")
    MAX = 4 * 1024 * 1024
    data = await file.read()
    if len(data) > MAX:
        raise HTTPException(status_code=400, detail="图片过大(上限 4MB)")
    result = ocr_engine.ocr_image(data)
    # v=20260824 计费/记账(按次计费 + 额度):有用户则扣积分
    if result.get("ok") and user.get("id", 0) > 0:
        try:
            # 按次计费：prompt_tokens=1 次调用，completion_tokens=0（与 core._consume_credits 新签名对齐）
            _consume_credits(user["id"], 1, 0, kind="ocr",
                             note=f"OCR 识别 {result.get('line_count', 0)} 行")
        except Exception:
            pass
    return result


@app.get("/api/ocr/status")
def api_ocr_status():
    """v=20260824 OCR 引擎状态(供前端探测/管理后台展示)。"""
    if ocr_engine is None:
        return {"available": False, "reason": "ocr_engine 未加载"}
    return {
        "available": ocr_engine.is_available(),
        "engine": "rapidocr" if ocr_engine.is_available() else "unavailable",
    }


# v=20260824d 公开的图片问答能力状态(普通用户/admin 都可查,用于前端提示当前模式)
@app.get("/api/vision/status")
def api_vision_status():
    """返回当前图片问答的识别模式。
    v=20260824f 优先检测 SPARK_IMAGE_(科大讯飞星火图片理解 WebSocket);
    其次 LLM_VISION_(OpenAI 兼容);都没有则 OCR 兜底。
    """
    spark_ok = spark_image is not None and spark_image._is_configured()
    vision_key = os.environ.get("LLM_VISION_API_KEY", "")
    ocr_ok = ocr_engine is not None and ocr_engine.is_available()
    configured = spark_ok or bool(vision_key)
    if spark_ok:
        mode, engine = "vision", "spark-image"
    elif vision_key:
        mode, engine = "vision", "openai-compatible"
    else:
        mode, engine = "ocr-fallback", "rapidocr" if ocr_ok else "unavailable"
    return {
        "vision_configured": configured,
        "vision_engine": engine,
        "spark_configured": spark_ok,
        "vision_model": (
            f"spark-{os.environ.get('SPARK_IMAGE_DOMAIN', 'image')}" if spark_ok
            else _display_model(os.environ.get("LLM_VISION_MODEL") or "(未配置)")
        ),
        "vision_base_url": (
            "wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image" if spark_ok
            else (os.environ.get("LLM_VISION_BASE_URL") or "(未配置)")
        ),
        "ocr_available": ocr_ok,
        "ocr_engine": "rapidocr" if ocr_ok else "unavailable",
        "mode": mode,
        "config_hint": (
            "已启用科大讯飞星火图片理解(WebSocket):直接配置 SPARK_IMAGE_APPID/API_KEY/API_SECRET。"
            if spark_ok else
            "启用云端视觉模型:① 科大讯飞星火 → SPARK_IMAGE_APPID/API_KEY/API_SECRET ② OpenAI 兼容 → LLM_VISION_API_KEY/BASE_URL/MODEL。"
            "当前未配置时,图片问答自动降级为 RapidOCR 提取文字 + 主 LLM 解答(本地 OCR,无需联网)。"
        ),
    }


@app.post("/api/vision/latex")
async def vision_latex(file: UploadFile = FastAPIFile(...), task: str = "latex"):
    """图片公式识别：上传图片，返回 LaTeX 或矩阵文本。"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件")
    MAX = 4 * 1024 * 1024
    data = await file.read()
    if len(data) > MAX:
        raise HTTPException(status_code=400, detail="图片过大（上限 4MB）")
    mime = file.content_type or "image/png"
    b64 = _encode_image_to_base64(data, mime)
    try:
        result = _call_vision_model(b64, "请识别图片中的数学内容。", task=task)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"多模态识别失败: {e}")
    return {"task": task, "recognized": result}


@app.post("/api/vision/matrix-calc")
async def vision_matrix_calc(file: UploadFile = FastAPIFile(...)):
    """手写矩阵拍照 → 自动识别并计算行列式、秩、逆、特征值。"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件")
    MAX = 4 * 1024 * 1024
    data = await file.read()
    if len(data) > MAX:
        raise HTTPException(status_code=400, detail="图片过大（上限 4MB）")
    mime = file.content_type or "image/png"
    b64 = _encode_image_to_base64(data, mime)
    try:
        raw = _call_vision_model(
            b64,
            "请识别图片中的矩阵，并输出其标准 Python 列表形式（例如 [[1,2],[3,4]]）。",
            task="matrix",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"多模态识别失败: {e}")

    A = _extract_matrix_list(raw)
    if A is None:
        return {"recognized": raw, "error": "未能从识别结果中解析出矩阵，请尝试拍摄更清晰的图片", "matrix": None, "results": None}

    results = _matrix_compute(A)
    return {
        "recognized": raw,
        "matrix": A.tolist(),
        "shape": list(A.shape),
        "results": results,
    }


# ---------- 图片上传 ----------

@app.post("/api/upload")
async def upload_image(file: UploadFile = FastAPIFile(...),
                       user: dict = __import__('fastapi').Depends(require_user)):
    """上传图片（群聊/动态/私信），返回可访问 URL"""
    if user["id"] == 0:
        raise HTTPException(status_code=401, detail="请先登录")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件")
    # 大小限制 5MB
    MAX = 5 * 1024 * 1024
    data = await file.read()
    if len(data) > MAX:
        raise HTTPException(status_code=400, detail="图片过大（上限 5MB）")
    ext = (file.filename or "png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "gif", "webp", "bmp"):
        ext = "png"
    fname = f"{user['id']}_{secrets.token_hex(8)}.{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        f.write(data)
    url = "/uploads/" + fname
    return {"ok": True, "url": url, "size": len(data)}


# ── 电子教材下载（线性代数第六版 PDF / 单页 PNG / 打包 ZIP） ──

# v=20260904c 版权收敛：教材全文（PDF/分页截图）已下线，以下接口统一返回「仅列引用」
_TEXTBOOK_CITATION = "《线性代数》第六版 · 同济大学数学系 编 · 高等教育出版社 · ISBN 978-7-04-039661-4；仅列引用，全文请向出版社获取"


@app.get("/api/textbook/info")
def textbook_info(user: dict = Depends(require_user)):
    """返回教材引用信息（版权收敛：不提供全文/页数）。"""
    return {
        "ok": True,
        "citation": _TEXTBOOK_CITATION,
        "full_text_available": False,
    }


@app.get("/api/textbook/download")
def textbook_download(user: dict = Depends(require_user), format: str = "pdf"):
    """教材全文已下线，仅列引用。"""
    raise HTTPException(status_code=403, detail=_TEXTBOOK_CITATION)


@app.get("/api/textbook/page/{n}")
def textbook_page(n: int, user: dict = Depends(require_user)):
    """教材分页截图已下线，仅列引用。"""
    raise HTTPException(status_code=403, detail=_TEXTBOOK_CITATION)
