"""
数据飞轮自进化训练引擎（Self-Training Engine）
====================================================
理念：让大模型自己训练自己 —— 大模型自出题 → 自多角度作答（发散）→
SymPy/NumPy 双引擎数值验证 + LLM 质量打分 → 优质(题, 多解法)入库
→ 每次用户提问时动态注入 few-shot / RAG 检索，回答质量随迭代轮数持续进化。
每轮迭代将当前训练库 + 语料库保存为版本快照（相当于“保留新模型参数”），
支持离线挂机无限循环。

用法：
  python training/self_train.py                     # 无限循环，每轮间隔 600s（低速常挂）
  python training/self_train.py --rounds 5           # 只跑 5 轮
  python training/self_train.py --interval 120       # 每轮间隔 120 秒
  python training/self_train.py --max-per-round 2    # 每轮最多入库 2 条
  python training/self_train.py --dry-run            # 仍会请求大模型，演练 1 轮，不写库
环境变量：LLM_API_KEY / LLM_MODEL / LLM_BASE_URL（与 main.py 共用）
"""
from pathlib import Path
import sys

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from dotenv import load_dotenv
load_dotenv(Path(PROJECT_ROOT) / ".env")

import argparse
import hashlib
import json
import os
import random
import re
import signal
import time
from datetime import datetime

import openai

BASE_DIR = PROJECT_ROOT
# 数据文件已统一迁到 data/（与后端 backend/paths.py 的 DATA_DIR 语义一致），
# 脚本必须读写同一份文件，否则 RAG 会因读不到语料而静默降级为空检索。
DATA_DIR = os.path.join(BASE_DIR, "data")
TRAINING_FILE = os.path.join(DATA_DIR, "training_data.json")
CORPUS_FILE = os.path.join(DATA_DIR, "knowledge_corpus.json")
VERSION_DIR = os.path.join(BASE_DIR, "model_versions")
RUN_STATE_FILE = os.path.join(BASE_DIR, "self_train_state.json")

RAG_ENABLED = True
TOP_K = 3
PASS_THRESHOLD = 80          # 质量分 >= 80 才入库
MAX_RETRY = 2                # 单轮 LLM 调用失败重试次数

# 48 个拓扑知识点池（自进化选题空间）
KNOWLEDGE_POOL = [
    ("第一章 行列式", "行列式定义与逆序数"), ("第一章 行列式", "余子式与代数余子式"),
    ("第一章 行列式", "行列式核心性质"), ("第一章 行列式", "行列式行列展开定理"),
    ("第一章 行列式", "常规行列式计算方法"), ("第一章 行列式", "克拉默法则应用"),
    ("第二章 矩阵", "矩阵概念与线性运算"), ("第二章 矩阵", "矩阵乘法运算与运算律"),
    ("第二章 矩阵", "方阵幂运算"), ("第二章 矩阵", "转置矩阵性质与运算"),
    ("第二章 矩阵", "伴随矩阵定义与核心性质"), ("第二章 矩阵", "逆矩阵求解与运算律"),
    ("第二章 矩阵", "矩阵可逆性判定"), ("第二章 矩阵", "矩阵方程求解"),
    ("第二章 矩阵", "矩阵初等变换与应用"), ("第二章 矩阵", "初等方阵与矩阵等价"),
    ("第二章 矩阵", "矩阵秩的求解与判定"), ("第二章 矩阵", "分块矩阵运算与技巧"),
    ("第三章 向量与线性方程组", "向量概念与基础运算"), ("第三章 向量与线性方程组", "向量线性组合与线性表示"),
    ("第三章 向量与线性方程组", "向量组等价判定"), ("第三章 向量与线性方程组", "向量组线性相关/无关定义"),
    ("第三章 向量与线性方程组", "向量组线性相关性判别方法"), ("第三章 向量与线性方程组", "极大线性无关组求解"),
    ("第三章 向量与线性方程组", "向量组秩与矩阵秩关联"), ("第三章 向量与线性方程组", "齐次线性方程组解的性质与结构"),
    ("第三章 向量与线性方程组", "非齐次线性方程组解的性质与结构"), ("第三章 向量与线性方程组", "线性方程组解的存在性判定"),
    ("第三章 向量与线性方程组", "初等行变换解方程组"), ("第三章 向量与线性方程组", "方程组公共解与同解问题"),
    ("第三章 向量与线性方程组", "矩阵与方程组的关联应用"), ("第四章 特征值与特征向量", "特征值与特征向量定义及性质"),
    ("第四章 特征值与特征向量", "特征值与特征向量求解方法"), ("第四章 特征值与特征向量", "相似矩阵概念与核心性质"),
    ("第四章 特征值与特征向量", "方阵可对角化判定条件"), ("第四章 特征值与特征向量", "矩阵相似对角化运算"),
    ("第四章 特征值与特征向量", "实对称矩阵专属性质"), ("第四章 特征值与特征向量", "对角化求矩阵幂与矩阵"),
    ("第五章 二次型", "二次型定义与矩阵表示"), ("第五章 二次型", "矩阵合同概念与判定"),
    ("第五章 二次型", "等价/相似/合同矩阵三者区分"), ("第五章 二次型", "二次型标准形求解"),
    ("第五章 二次型", "正交变换化二次型标准形"), ("第五章 二次型", "配方法化简二次型"),
    ("第五章 二次型", "正定二次型与正定矩阵判定"),
    ("第六章 向量空间", "向量内积与正交定义"), ("第六章 向量空间", "施密特正交化方法"),
    ("第六章 向量空间", "正交矩阵性质与判定"),
]

# ---------------- 基础工具 ----------------

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def _update_state(**kw):
    """更新运行状态文件(self_train_state.json),供开发者控制台实时监测。"""
    state = load_json(RUN_STATE_FILE, {})
    state.update(kw)
    state["updated"] = datetime.now().isoformat()
    try:
        save_json(RUN_STATE_FILE, state)
    except Exception:
        pass
    return state


def load_json(path, fallback):
    """读取 JSON；解析失败时**告警**（不再静默返回空容器）。

    静默吞异常会让上层把“文件损坏/路径错误”误判成“数据为空”，
    进而用空数据覆盖真实训练库/语料库，因此解析失败必须留下日志。
    文件不存在属于正常情况（如首次运行的状态文件），返回 fallback 且不告警。
    """
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(f"  ⚠ 读取 {path} 失败({type(e).__name__}: {e})，返回空默认值，请检查文件是否损坏")
        return fallback


def save_json(path, data):
    """原子写：先写 path + '.tmp'，成功后再 os.replace 覆盖。

    避免写入过程中崩溃/被 kill 时留下半截 JSON（下次读取解析失败 → 数据被清空）。
    """
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def get_client():
    api_key = os.environ.get("LLM_API_KEY")
    if not api_key:
        raise RuntimeError("未配置 LLM_API_KEY")
    base_url = os.environ.get("LLM_BASE_URL") or None
    return openai.OpenAI(api_key=api_key, base_url=base_url)


def llm_call(client, system, user, temperature=0.6, max_tokens=2200):
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (resp.choices[0].message.content or "").strip()


def extract_json(text):
    """从 LLM 输出中稳健提取 JSON 对象。"""
    if not text:
        return None
    # 直接尝试
    try:
        return json.loads(text)
    except Exception:
        pass
    # 找 ```json ... ``` 或 { ... } 片段
    m = None
    for pat in [r"```json\s*([\s\S]*?)```", r"```\s*([\s\S]*?)```", r"(\{[\s\S]*\})"]:
        mm = re.search(pat, text)
        if mm:
            m = mm.group(1)
            break
    if m:
        try:
            return json.loads(m)
        except Exception:
            pass
    # 尝试截取第一个 { 到最后一个 }
    try:
        i, j = text.find("{"), text.rfind("}")
        if i >= 0 and j > i:
            return json.loads(text[i:j + 1])
    except Exception:
        pass
    return None


# ---------------- RAG 上下文检索 ----------------

def rag_retrieve(question, top_k=TOP_K):
    """轻量 BM25 检索 knowledge_corpus.json,返回相关语料片段。"""
    if not RAG_ENABLED:
        return []
    corpus = load_json(CORPUS_FILE, {"passages": []}).get("passages", [])
    if not corpus:
        return []
    # 简易词袋 BM25
    import math
    from collections import Counter
    tok = lambda s: re.findall(r"[\w\u4e00-\u9fff]+", s.lower())
    q_tokens = tok(question)
    if not q_tokens:
        return []
    idf = {}
    n = len(corpus)
    for p in corpus:
        for w in set(tok((p.get("text") or "") + (p.get("content") or ""))):
            idf[w] = idf.get(w, 0) + 1
    scores = []
    for p in corpus:
        doc_tokens = tok((p.get("text") or "") + (p.get("content") or ""))
        cnt = Counter(doc_tokens)
        score = sum((1 + math.log(cnt.get(w, 0) + 1)) * math.log(1 + n / (1 + idf.get(w, 0))) for w in q_tokens)
        scores.append((score, p))
    scores.sort(key=lambda x: -x[0])
    return [p for _, p in scores[:top_k] if _ > 0]


# ---------------- 自进化核心 ----------------

def pick_knowledge():
    """随机选 1-2 个知识点作为本轮自进化主题。"""
    n = random.randint(1, 2)
    picks = random.sample(KNOWLEDGE_POOL, n)
    lines = []
    for ch, kp in picks:
        hits = rag_retrieve(kp, 2)
        ctx = "；".join((h.get("text") or h.get("content") or "")[:300] for h in hits) or "（知识库暂无该知识点语料，基于通用线性代数知识）"
        lines.append(f"章节: {ch} | 知识点: {kp}\n知识参考: {ctx[:400]}")
    return "\n\n".join(lines)


def self_generate(client, context, used_questions):
    """第一段 LLM 调用：自出题 + 多角度自答（发散、步骤清晰）。"""
    system = (
        "你是线性代数金牌教师的「出题+解题」双角色引擎。请基于给定的章节/知识点，"
        "生成一道高质量练习题并完整解答。要求：\n"
        "1) 题目要有区分度与易错点，避免过于简单；可以是计算题或概念辨析题。\n"
        "2) 解答必须【步骤清晰】：先给思路，再分步推导，每步注明依据。\n"
        "3) 解答要【多角度发散】：至少两个角度（如直接法+几何意义 / 定义法+快捷技巧 / 正向+反例验证）。\n"
        "4) 对计算类题目，给出可供 SymPy 验证的表达式与期望结果（在 verification 字段）。\n"
        "5) 总结易错点 2-4 条。\n"
        "只输出 JSON，不要任何额外文字，结构：\n"
        "{\n"
        '  "question": "题目",\n'
        '  "chapter": "章节",\n'
        '  "section": "二级知识点",\n'
        '  "difficulty": "基础|中等|进阶",\n'
        '  "answer": "完整多角度解答",\n'
        '  "verification": {"sympy_expr": "如 det(Matrix([[1,2],[3,4]])) 或 (x+1)**2 展开等，可为空字符串", "expected": "期望结果，可为空字符串"},\n'
        '  "key_points": ["要点1", "要点2"],\n'
        '  "common_mistakes": ["易错点1", "易错点2"]\n'
        "}"
    )
    user = f"本轮自进化主题：\n{context}"
    for attempt in range(MAX_RETRY + 1):
        try:
            raw = llm_call(client, system, user, temperature=0.85, max_tokens=2600)
        except Exception as e:
            log(f"  ⚠ 出题调用失败({attempt + 1}/{MAX_RETRY + 1}): {e}")
            time.sleep(3)
            continue
        gen = extract_json(raw)
        if gen and gen.get("question") and gen.get("answer"):
            q = gen["question"].strip()
            if q not in used_questions and len(q) >= 6:
                return gen
        log("  ⚠ 出题输出非预期 JSON，重试…")
    return None


# 安全表达式白名单：只允许数字/字母/下划线/四则与幂运算符/括号/逗号/空白。
# 供 _safe_sympify 使用——历史实现曾对 LLM 返回的字符串 exec/eval 代码片段，
# 属于任意代码执行（RCE）风险，已彻底移除，改为纯 sympify 解析。
# 含 [ ]：自出题 prompt 示例为 det(Matrix([[1,2],[3,4]]))，方括号本身无 RCE 面
# （危险路径依赖 dunder/属性访问/引号，已被下方规则阻断），不允许则计算题永不通过验证
_SAFE_EXPR_RE = re.compile(r"^[0-9A-Za-z_+\-*/^().,\[\]\s]*$")


def _safe_sympify(expr):
    """把字符串安全地解析为 SymPy 表达式；无法安全解析时返回 None。

    白名单规则（任一不满足即返回 None，规则见 _SAFE_EXPR_RE）：
      1) 只含数字/字母/下划线/四则与幂运算符/圆括号/方括号/逗号/空白，长度不超过 2000；
      2) 不含连续两个下划线（阻断 __class__ / __subclasses__ 等属性穿越）；
      3) 点号只允许出现在两个数字之间（即小数点），其余（属性访问）一律拒绝。
    解析失败或抛任何异常也返回 None，语义为"无法验证"——调用方不得据此放行。
    """
    if not expr or not isinstance(expr, str):
        return None
    s = expr.strip()
    if not s or len(s) > 2000:
        return None
    if not _SAFE_EXPR_RE.match(s):
        return None
    if "__" in s:
        return None
    for i, ch in enumerate(s):
        if ch == ".":
            if i == 0 or i == len(s) - 1 or not (s[i - 1].isdigit() and s[i + 1].isdigit()):
                return None
    try:
        import sympy as sp
        return sp.sympify(s)
    except Exception:
        return None


def verify_sympy(gen):
    """SymPy 数值验证：对计算题核对表达式与期望值。返回 (ok, detail)。

    ok 的三种取值（**入库语义**）：
      True  —— 验证通过，允许入库；
      False —— 验证失败（表达式可解析，但与期望值不符），不得入库；
      None  —— 无法验证（未提供验证项 / 未通过白名单 / SymPy 异常），不得入库。
    这里刻意不 fail-open：无法验证 != 已验证通过，调用方要求 `ok is True` 才放行。
    """
    ver = gen.get("verification") or {}
    expr_s = (ver.get("sympy_expr") or "").strip()
    expected_s = (ver.get("expected") or "").strip()
    if not expr_s or not expected_s:
        return None, "无法验证：未提供 sympy_expr / expected（概念题不再自动放行）"
    try:
        import sympy as sp
    except Exception as e:
        return None, f"无法验证：SymPy 不可用({str(e)[:120]})"
    value = _safe_sympify(expr_s)
    expected = _safe_sympify(expected_s)
    if value is None or expected is None:
        return None, f"无法验证：表达式未通过安全白名单或无法解析: {expr_s[:50]}"
    # 比较：数值型做数值比较；符号型做 simplify 比较
    try:
        diff = sp.simplify(value - expected)
        if diff == 0:
            return True, f"✓ SymPy 验证通过: {expr_s[:50]} == {expected_s}"
        try:
            num_diff = float(diff.evalf())
            if abs(num_diff) < 1e-6:
                return True, "✓ SymPy 数值验证通过(误差<1e-6)"
        except Exception:
            pass
        return False, f"✗ SymPy 验证失败: {expr_s[:50]} != {expected_s}"
    except Exception as e:
        return None, f"无法验证：SymPy 比较异常({str(e)[:120]})"


def quality_score(client, gen):
    """第二段 LLM 调用：质量评分（正确性/步骤清晰度/发散度/易错点）。"""
    system = (
        "你是严格的线性代数教学质量评审员。请从四个维度对给出的题目与解答评分（各 0-100 分）：\n"
        "a) 正确性 correctness；b) 步骤清晰度 clarity；c) 思路发散度 divergence（是否多角度）；d) 易错点覆盖 coverage。\n"
        "综合总分 score = 四者加权平均（权重 0.4/0.25/0.2/0.15）。\n"
        "只输出 JSON：{\"score\": 0-100 整数, \"verdict\": \"pass\" 或 \"reject\", \"reason\": \"简短理由\"}"
    )
    payload = json.dumps({
        "chapter": gen.get("chapter", ""),
        "section": gen.get("section", ""),
        "difficulty": gen.get("difficulty", ""),
        "question": gen.get("question", ""),
        "answer": gen.get("answer", ""),
        "key_points": gen.get("key_points", []),
        "common_mistakes": gen.get("common_mistakes", []),
    }, ensure_ascii=False)
    for attempt in range(MAX_RETRY + 1):
        try:
            raw = llm_call(client, system, payload, temperature=0.2, max_tokens=400)
        except Exception as e:
            log(f"  ⚠ 评分调用失败({attempt + 1}/{MAX_RETRY + 1}): {e}")
            time.sleep(3)
            continue
        qj = extract_json(raw)
        if qj and isinstance(qj.get("score"), (int, float)):
            return qj
        log("  ⚠ 评分输出非预期 JSON，重试…")
    return {"score": 0, "verdict": "reject", "reason": "评分调用失败"}


def exists_in_training(question, training):
    """简单去重：题目相似（sha256 前缀或全文包含）。"""
    for t in training:
        tq = (t.get("question") or "").strip()
        if tq and (tq == question or question in tq or tq in question):
            return True
    return False


def save_to_training(gen):
    """写入 training_data.json（动态 few-shot 注入）。"""
    training = load_json(TRAINING_FILE, [])
    item = {
        "chapter": gen.get("chapter", ""),
        "section": gen.get("section", ""),
        "difficulty": gen.get("difficulty", "基础"),
        "question": gen["question"].strip(),
        "answer": gen.get("answer", "").strip(),
        "key_points": gen.get("key_points", []) or [],
        "common_mistakes": gen.get("common_mistakes", []) or [],
        "source": "self-train",
    }
    training.append(item)
    save_json(TRAINING_FILE, training)
    return len(training)


def save_to_corpus(gen, version_tag):
    """写入 knowledge_corpus.json（RAG 语料扩充）。"""
    corpus = load_json(CORPUS_FILE, {"passages": []})
    passages = corpus.setdefault("passages", [])
    q = gen["question"].strip()
    a = gen.get("answer", "").strip()
    nid = f"self-train-{int(time.time())}-{random.randint(1000, 9999)}"
    passages.append({
        "id": nid,
        "chapter": gen.get("chapter", ""),
        "section": gen.get("section", ""),
        "keywords": (gen.get("key_points", []) or []) + [gen.get("section", "")],
        "source": f"自进化生成 {version_tag}",
        # text 为 BM25 索引字段：必须包含题目与知识点词，否则检索不到
        "text": f"{q}\n{gen.get('section', '')}\n{' '.join(gen.get('key_points', []) or [])}\n{a[:1600]}",
        "content": f"【题目】{q}\n【多角度解答】\n{a[:2400]}",
    })
    save_json(CORPUS_FILE, corpus)
    return len(passages)


def snapshot(round_no, added, passed, rejected):
    """版本快照：把当前训练库+语料库+元信息存为 model_versions/version_{n}/。"""
    try:
        os.makedirs(VERSION_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ver_dir = os.path.join(VERSION_DIR, f"version_{stamp}")
        os.makedirs(ver_dir, exist_ok=True)
        training = load_json(TRAINING_FILE, [])
        corpus = load_json(CORPUS_FILE, {"passages": []})
        save_json(os.path.join(ver_dir, "training_data.json"), training)
        save_json(os.path.join(ver_dir, "knowledge_corpus.json"), corpus)
        meta = {
            "version": stamp,
            "round": round_no,
            "created": datetime.now().isoformat(),
            "added_this_round": added,
            "passed_total": passed,
            "rejected_total": rejected,
            "training_count": len(training),
            "corpus_count": len(corpus.get("passages", [])),
        }
        save_json(os.path.join(ver_dir, "meta.json"), meta)
        # 合并更新运行状态(保留 started_at/interval/current_round 等字段,不覆盖)
        _update_state(
            round=round_no,
            training_count=len(training),
            corpus_count=len(corpus.get("passages", [])),
            last_version=stamp,
            running=True,
        )
        return ver_dir
    except Exception as e:
        log(f"  ⚠ 快照失败: {e}")
        return None


def run_once(client, round_no, max_per_round, dry_run):
    """执行一轮自进化：选题→自出题→验证→评分→入库→统计。"""
    # 轮次开始：记录开始时间（供控制台实时监测当前轮进度）
    _update_state(current_round=round_no, round_started_at=datetime.now().isoformat(),
                  last_error="", running=True)
    context = pick_knowledge()
    log(f"=== 第 {round_no} 轮自进化 · 主题: {context.splitlines()[0]} | {context.splitlines()[1][:40] if len(context.splitlines()) > 1 else ''} ===")
    training = load_json(TRAINING_FILE, [])
    used = {t.get("question", "") for t in training}
    added, passed, rejected = 0, 0, 0
    for i in range(max_per_round):
        gen = self_generate(client, context, used)
        if not gen:
            rejected += 1
            continue
        sym_ok, sym_detail = verify_sympy(gen)
        log(f"  · 生成题目[{i + 1}]: {gen['question'][:60]}…")
        log(f"    {sym_detail}")
        qj = quality_score(client, gen)
        score = int(qj.get("score", 0))
        verdict = qj.get("verdict", "reject")
        log(f"    质量分: {score} ({verdict}) — {str(qj.get('reason', ''))[:80]}")
        # 入库门槛：verify_sympy 的三种返回值 True/False/None 中，
        # 只有 True（已验证通过）才放行；None（无法验证）与 False（验证失败）一律拒绝。
        if sym_ok is True and verdict == "pass" and score >= PASS_THRESHOLD and not exists_in_training(gen["question"].strip(), training):
            if not dry_run:
                t_cnt = save_to_training(gen)
                c_cnt = save_to_corpus(gen, f"v{round_no}")
                log(f"    ✅ 已入库 → training({t_cnt}条) corpus({c_cnt}条)")
            else:
                log(f"    ✅ [演练] 通过，未写库（dry-run）")
            passed += 1
            added += 1
            used.add(gen["question"].strip())
        else:
            if sym_ok is not True:
                reason = "SymPy 未验证通过（None=无法验证 / False=验证失败，均不放行）"
            elif not (verdict == "pass" and score >= PASS_THRESHOLD):
                reason = "未达质量门槛"
            else:
                reason = "与已有数据重复"
            log(f"    ⏭ 拒绝入库: {reason}")
            rejected += 1
        time.sleep(1)
    # 快照（每轮一次，若本轮有产出或每 3 轮兜底）
    if added > 0 or round_no % 3 == 0:
        ver = snapshot(round_no, added, passed, rejected) if not dry_run else None
        if ver:
            log(f"  📦 版本快照已保存: {ver}")
    log(f"=== 第 {round_no} 轮结束 · 入库 {added} / 通过 {passed} / 拒绝 {rejected} ===")
    # 轮次成果上报(供控制台展示训练成果) + 历史曲线数据
    corpus = load_json(CORPUS_FILE, {"passages": []})
    hist = load_json(RUN_STATE_FILE, {}).get("history", [])
    hist.append({
        "round": round_no,
        "added": added,
        "passed": passed,
        "rejected": rejected,
        "training_count": len(load_json(TRAINING_FILE, [])),
        "corpus_count": len(corpus.get("passages", [])),
        "ts": datetime.now().isoformat(),
    })
    # 最多保留最近 200 轮,防止文件无限膨胀
    hist = hist[-200:]
    _update_state(
        round=round_no,
        last_round_result={"round": round_no, "added": added, "passed": passed, "rejected": rejected,
                           "finished_at": datetime.now().isoformat()},
        history=hist,
    )
    return added, passed, rejected


def main():
    ap = argparse.ArgumentParser(description="线性代数智能体自进化训练引擎")
    ap.add_argument("--rounds", type=int, default=0, help="轮次上限（0=无限）")
    ap.add_argument("--interval", type=int, default=600, help="每轮间隔秒数（默认600=10分钟）")
    ap.add_argument("--max-per-round", type=int, default=2, help="每轮最多入库条数（默认2）")
    ap.add_argument("--dry-run", action="store_true", help="演练模式：跑1轮不写库")
    args = ap.parse_args()

    # 优雅退出
    stop = {"flag": False}
    def _sig(s, f):
        log("收到退出信号，保存状态后退出…")
        stop["flag"] = True
    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    try:
        client = get_client()
        log(f"自进化训练引擎启动 · 模型={os.environ.get('LLM_MODEL', 'deepseek-chat')} · 间隔={args.interval}s · 每轮上限={args.max_per_round}")
    except RuntimeError as e:
        log(f"启动失败: {e}")
        sys.exit(1)

    round_no = 0
    total_passed = 0
    total_rejected = 0
    _update_state(started_at=datetime.now().isoformat(), stopped_at="",
                  interval=args.interval, target_rounds=args.rounds, running=True,
                  current_round=0, round_started_at="", last_error="")
    while True:
        round_no += 1
        try:
            added, passed, rejected = run_once(client, round_no, args.max_per_round, args.dry_run)
            total_passed += passed
            total_rejected += rejected
            log(f"📈 累计: 通过 {total_passed} / 拒绝 {total_rejected}")
        except Exception as e:
            log(f"⚠ 本轮异常: {e}，跳过本轮继续")
            _update_state(last_error=f"第{round_no}轮异常: {e}")
        if args.dry_run:
            log("演练完成，退出。")
            break
        if args.rounds and round_no >= args.rounds:
            log(f"已达到轮次上限 {args.rounds}，退出。")
            break
        # 睡眠，支持中途打断
        for _ in range(args.interval):
            if stop["flag"]:
                break
            time.sleep(1)
        if stop["flag"]:
            break
    # 退出时写最终状态
    try:
        _update_state(
            round=round_no,
            training_count=len(load_json(TRAINING_FILE, [])),
            corpus_count=len(load_json(CORPUS_FILE, {"passages": []}).get("passages", [])),
            last_version=datetime.now().strftime("%Y%m%d_%H%M%S"),
            running=False,
            stopped_at=datetime.now().isoformat(),
            last_error="",
        )
    except Exception:
        pass
    log("自进化训练引擎已停止。")


if __name__ == "__main__":
    main()
