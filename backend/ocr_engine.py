# -*- coding: utf-8 -*-
"""
v=20260824 RapidOCR 引擎封装(基于 PaddleOCR ONNX Runtime 实现)
- 提供统一接口 init_ocr / ocr_image
- 支持图片路径 / 字节输入 / / dataURL
- 返回结构化结果(文本 + 行级 box/score)
- 单例延迟初始化(避免启动时下载模型阻塞)
"""
from __future__ import annotations
import os
import time
import logging
import threading
from typing import Optional, Dict, Any, List

# 抑制 RapidOCR 内部 tqdm/onnxruntime 日志
os.environ.setdefault("TQDM_DISABLE", "1")
os.environ.setdefault("ORT_LOGGING_LEVEL", "3")

logger = logging.getLogger("ocr_engine")

# v=20260824 开关:可通过环境变量禁用 OCR(失败/加载慢时降级)
OCR_ENABLED = os.environ.get("OCR_ENABLED", "true").lower() in ("1", "true", "yes", "on")

# v=OCR_FIX 识别质量参数(均可用环境变量微调,支持不重启逻辑解释)
OCR_PREPROCESS = os.environ.get("OCR_PREPROCESS", "true").lower() in ("1", "true", "yes", "on")  # 是否做预处理
OCR_MAX_SIZE = int(os.environ.get("OCR_MAX_SIZE", "4096"))        # 超长边先缩小,避免 OOM
OCR_MIN_SCORE = float(os.environ.get("OCR_MIN_SCORE", "0.55"))    # 置信度低于此的行丢弃(去乱码)
OCR_LOWCONF_AVG = float(os.environ.get("OCR_LOWCONF_AVG", "0.6")) # 平均置信度低于此判定不可靠
OCR_AUTOCONTRAST_CUTOFF = int(os.environ.get("OCR_AUTOCONTRAST_CUTOFF", "0"))  # autocontrast 截断(0=全范围)
OCR_UPSCALE_MIN = int(os.environ.get("OCR_UPSCALE_MIN", "1280"))  # 短边小于此值则放大
OCR_TARGET_SHORT = int(os.environ.get("OCR_TARGET_SHORT", "1600"))  # 放大目标短边
OCR_MAX_UPSCALE = float(os.environ.get("OCR_MAX_UPSCALE", "2.5"))  # 放大上限(防失真)
OCR_SHARPEN = os.environ.get("OCR_SHARPEN", "true").lower() in ("1", "true", "yes", "on")  # 轻度锐化

_engine = None
_engine_lock = threading.Lock()
_init_failed = False


def _preprocess_for_ocr(pil):
    """v=OCR_FIX 识别前预处理:缩放 → 灰度 → 对比度增强 → 小图放大 → 轻度锐化。
    目标:低对比度截图/手机拍题/小字题目在丢给 RapidOCR 前先提升可读性。
    对正常清晰印刷体基本中性,不会显著降低其识别率。"""
    from PIL import Image, ImageOps, ImageFilter
    # 1) 超大图先缩小(防 OOM,且 RapidOCR 对超大图识别精度无明显提升)
    w, h = pil.size
    m = max(w, h)
    if m > OCR_MAX_SIZE:
        ratio = OCR_MAX_SIZE / m
        pil = pil.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    # 2) 灰度(后续 autocontrast / 锐化基于单通道更稳定)
    if pil.mode != "L":
        pil = pil.convert("L")
    # 3) 自动对比度增强(低对比度/灰底/阴影题图提升明显;清晰印刷体近乎不变)
    pil = ImageOps.autocontrast(pil, cutoff=OCR_AUTOCONTRAST_CUTOFF)
    # 4) 小图放大(低分辨率截图/手机拍题,放大后小字可识别)
    w, h = pil.size
    short = min(w, h) or 1
    if short < OCR_UPSCALE_MIN:
        scale = min(OCR_TARGET_SHORT / short, OCR_MAX_UPSCALE)
        pil = pil.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    # 5) 轻度锐化(仅对模糊图有益;温和 UnsharpMask 避免过度伪影)
    if OCR_SHARPEN:
        pil = pil.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))
    return pil


def init_ocr() -> Optional[Any]:
    """延迟单例初始化 RapidOCR。失败返回 None,后续调用走降级。"""
    global _engine, _init_failed
    if _engine is not None or _init_failed or not OCR_ENABLED:
        return _engine
    with _engine_lock:
        if _engine is not None or _init_failed:
            return _engine
        try:
            t0 = time.time()
            from rapidocr_onnxruntime import RapidOCR
            _engine = RapidOCR()
            logger.info(f"[OCR] RapidOCR 初始化完成 ({time.time()-t0:.1f}s)")
            return _engine
        except Exception as e:
            _init_failed = True
            logger.warning(f"[OCR] RapidOCR 初始化失败,OCR 接口将不可用: {e}")
            return None


def ocr_image(image, lang: str = "ch", use_det: bool = True, use_cls: bool = True,
              use_rec: bool = True, max_size: int = 4096) -> Dict[str, Any]:
    """
    v=20260824 OCR 识别统一接口。

    入参:
      image: 图片路径(str) / 字节(bytes) / numpy array / PIL Image
      lang: 语言(默认 ch 中文+英文)
      use_det/use_cls/use_rec: 是否启用检测/方向/识别(都启用)
      max_size: 图片最大边长(超过则缩放,避免 OOM)

    返回:
      {
        ok: bool,
        text: str,                 # 全文(按行拼接,空行分隔)
        lines: [
          {"text": str, "score": float(0-1), "box": [[x1,y1],...,[x4,y4]]}
        ],
        engine: "rapidocr" | "unavailable",
        cost_ms: int,
        error: str | None,
        skipped: bool              # 被禁用了(OCR_ENABLED=false)
      }
    """
    t0 = time.time()
    if not OCR_ENABLED:
        return {
            "ok": False, "engine": "disabled", "cost_ms": 0,
            "text": "", "lines": [],
            "skipped": True,
            "error": "OCR 已禁用 (OCR_ENABLED=false)",
        }

    engine = init_ocr()
    if engine is None:
        return {
            "ok": False, "engine": "unavailable", "cost_ms": int((time.time()-t0)*1000),
            "text": "", "lines": [],
            "error": "OCR 引擎初始化失败(可能是 rapidocr-onnxruntime 未安装)",
        }

    # 统一加载为 PIL Image(便于预处理/统一格式)
    try:
        from PIL import Image
        if isinstance(image, str):
            pil = Image.open(image)
        elif isinstance(image, (bytes, bytearray)):
            import io
            pil = Image.open(io.BytesIO(image))
        elif isinstance(image, Image.Image):
            pil = image
        else:
            # numpy array 或其他
            pil = Image.fromarray(image)

        # v=OCR_FIX 预处理(缩放/灰度/对比度/放大/锐化),显著提升模糊/小字题图识别率
        if OCR_PREPROCESS:
            pil = _preprocess_for_ocr(pil)
        image_input = pil
    except Exception as e:
        return {
            "ok": False, "engine": "rapidocr", "cost_ms": int((time.time()-t0)*1000),
            "text": "", "lines": [],
            "error": f"图片加载失败: {e}",
        }

    try:
        # RapidOCR 返回 (results, elapse),results 为 [box, text, score] 三元组列表
        result, elapse_list = engine(image_input)
    except Exception as e:
        logger.exception("[OCR] 识别失败")
        return {
            "ok": False, "engine": "rapidocr", "cost_ms": int((time.time()-t0)*1000),
            "text": "", "lines": [],
            "error": f"识别失败: {str(e)[:200]}",
        }

    lines: List[Dict[str, Any]] = []
    if result:
        for item in result:
            try:
                box, text, score = item
            except (ValueError, TypeError):
                continue
            try:
                s = float(score) if score is not None else 0.0
            except (ValueError, TypeError):
                s = 0.0
            # v=OCR_FIX 置信度过滤:丢弃低分误识别,避免乱码碎片污染 LLM 输入
            if s < OCR_MIN_SCORE:
                continue
            t = str(text or "").strip()
            if not t:
                continue
            lines.append({
                "text": t,
                "score": s,
                "box": [[float(p[0]), float(p[1])] for p in box] if box else [],
            })

    # 全文:按 box 顶部 y 排序(保持阅读顺序)
    lines.sort(key=lambda x: min(p[1] for p in x["box"]) if x["box"] else 0)
    full_text = "\n".join(l["text"] for l in lines)

    # v=OCR_FIX 可靠性自检:有效行数为 0 或平均置信度过低 → 标记不可靠。
    # 上层 main.py 在 text 为空时会给出"请上传更清晰的图片"提示,而非基于乱码硬答。
    valid_n = len(lines)
    avg_score = (sum(l["score"] for l in lines) / valid_n) if valid_n else 0.0
    low_confidence = (valid_n == 0) or (avg_score < OCR_LOWCONF_AVG)

    return {
        "ok": True,
        "engine": "rapidocr",
        "cost_ms": int((time.time()-t0)*1000),
        "text": full_text,
        "lines": lines,
        "line_count": valid_n,
        "avg_score": round(avg_score, 3),
        "low_confidence": low_confidence,
        "skipped": False,
        "elapse": list(elapse_list) if elapse_list else None,
    }


def is_available() -> bool:
    """OCR 是否可用(已启用 + 初始化成功)。"""
    return OCR_ENABLED and _engine is not None and not _init_failed