"""
retrieval.py · 纯 Python BM25 检索器（无第三方依赖）

- 启动时加载 knowledge_corpus.json 构建索引
- 查询时返回与问题最相关的 top_k 个知识片段
- 专为线性代数中文语料设计：CJK 单字切分 + bigram + 学术术语词典 + 英文/数字按词切分
- 支持查询扩展（同义词映射）、缓存机制（60秒TTL）

用法：
    from retrieval import Retriever
    r = Retriever("knowledge_corpus.json")   # 文件缺失则 RAG 不可用
    hits = r.search("特征值怎么求", top_k=4)
    # hits -> [{"doc": {...}, "score": float}, ...]
"""

import json
from collections import OrderedDict
from .paths import PROJECT_ROOT
import math
import os
import re
import time

_CORPUS = os.path.join(PROJECT_ROOT, "data", "knowledge_corpus.json")

# ── 学术术语词典 ──
_ACADEMIC_TERMS = [
    "特征值", "特征向量", "行列式", "逆矩阵",
    "线性相关", "线性无关", "齐次方程", "非齐次",
    "对角化", "正交矩阵", "二次型", "正定矩阵",
    "基础解系", "极大无关组", "代数余子式",
]

# ── 同义词映射（查询扩展） ──
_SYNONYM_MAP = {
    "行列式": ["determinant", "det"],
    "特征值": ["特征根", "eigenvalue", "本征值"],
    "特征向量": ["eigenvector"],
    "逆矩阵": ["求逆", "矩阵求逆", "inverse"],
    "可逆": ["逆矩阵", "非奇异", "满秩", "invertible", "可逆矩阵"],
    "秩": ["rank", "矩阵的秩"],
    "线性相关": ["线性无关", "相关", "无关"],
    "对角化": ["相似对角化", "可对角化"],
    "二次型": ["标准形", "规范形"],
    "正定": ["正定矩阵", "正定性"],
    "正交": ["正交化", "正交矩阵"],
    "特征方程": ["特征多项式", "λE-A", "特征值方程"],
    "方程组": ["线性方程组", "解方程", "求解方程组"],
    "可对角化": ["对角矩阵", "相似对角化"],
    "相似": ["相似矩阵", "矩阵相似"],
    "内积": ["点积", "dot product", "数量积"],
}

# LaTeX 符号模式（保留但降低权重）
_LATEX_PATTERN = re.compile(r"\$[^$]*\$|\\[a-zA-Z]+")


def _extract_chinese_ngrams(text: str, n: int):
    """从文本中提取中文 n-gram。"""
    chinese_chars = re.findall(r"[一-鿿]", text)
    result = []
    for i in range(len(chinese_chars) - n + 1):
        result.append("".join(chinese_chars[i : i + n]))
    return result


def tokenize(text: str, include_bigram: bool = True, include_terms: bool = True):
    """
    增强版中文分词：
    - 单字切分（保留）
    - bigram 双字词组切分（默认开启）
    - 学术术语词典匹配（默认开启）
    - 英文/数字按词切分
    - LaTeX 符号保留但标记为低权重
    统一小写。
    返回 token 列表。
    """
    text = (text or "").lower()
    tokens = []

    # 1. 中文字符单字切分
    chinese_chars = re.findall(r"[一-鿿]", text)
    for c in chinese_chars:
        tokens.append(c)

    # 2. bigram 双字词组切分
    if include_bigram:
        for i in range(len(chinese_chars) - 1):
            bigram = chinese_chars[i] + chinese_chars[i + 1]
            tokens.append(bigram)

    # 3. 学术术语词典匹配
    if include_terms:
        for term in _ACADEMIC_TERMS:
            if term in text:
                tokens.append(term)

    # 4. 英文/数字按词切分
    for m in re.findall(r"[a-z0-9]+", text):
        tokens.append(m)

    # 5. LaTeX 符号：保留原始形式（不额外拆分，保持原样以支持精确匹配）
    for m in _LATEX_PATTERN.findall(text):
        tokens.append(m)

    return tokens


class Retriever:
    def __init__(self, path: str = _CORPUS):
        self.available = False
        self.docs = []
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.docs = data.get("passages", [])
        except Exception:
            self.docs = []
            return
        if not self.docs:
            return

        self.tokenized = [tokenize(d.get("text", "")) for d in self.docs]
        self.N = len(self.tokenized)
        self.avgdl = sum(len(t) for t in self.tokenized) / self.N if self.N else 0
        self.k1 = 1.2   # 减少词频饱和效应
        self.b = 0.3    # 中文短文档不需要强长度归一化

        # 文档频率
        self.df = {}
        for tks in self.tokenized:
            for w in set(tks):
                self.df[w] = self.df.get(w, 0) + 1
        # IDF（BM25 标准式）
        self.idf = {
            w: math.log((self.N - c + 0.5) / (c + 0.5) + 1)
            for w, c in self.df.items()
        }

        # ── v=20260866: TF-IDF 向量索引(与 BM25 融合做语义召回) ──
        self.vocab = sorted(self.df.keys())
        self.vocab_index = {w: i for i, w in enumerate(self.vocab)}
        # 文档 TF-IDF 稀疏向量:list of dict {vocab_idx: weight}
        self.doc_vectors = []
        for tks in self.tokenized:
            vec = {}
            freq = {}
            for w in tks:
                freq[w] = freq.get(w, 0) + 1
            for w, f in freq.items():
                idx = self.vocab_index.get(w)
                if idx is None:
                    continue
                # tf-idf = (1+ln(tf)) * idf,再 L2 归一化在查询时做
                vec[idx] = (1 + math.log(f)) * self.idf.get(w, 0.1)
            self.doc_vectors.append(vec)
        # 预计算每篇文档向量 L2 范数
        self.doc_norms = [
            math.sqrt(sum(v * v for v in vec.values())) if vec else 0.0
            for vec in self.doc_vectors
        ]

        self.available = True

        # ── 缓存机制（LRU，容量上限，防无界增长）──
        self._cache = OrderedDict()   # (query, top_k) -> (timestamp, results)
        self._cache_ttl = 60          # 60 秒
        self._cache_max = 500         # 上限 500 条：超出时淘汰最久未使用的一条

    def _expand_query(self, query: str):
        """查询扩展：根据同义词映射添加扩展 token（支持双向扩展）。"""
        tokens = tokenize(query)
        expanded = list(tokens)  # 保留原始 token
        query_lower = query.lower()

        # 正向映射：query 包含中文 key → 添加英文/中文同义词
        for key, synonyms in _SYNONYM_MAP.items():
            if key in query_lower:
                for syn in synonyms:
                    syn_tokens = tokenize(syn)
                    for st in syn_tokens:
                        if st not in expanded:
                            expanded.append(st)

        # 反向映射：query 包含英文/同义词 → 添加中文 key
        for key, synonyms in _SYNONYM_MAP.items():
            for syn in synonyms:
                syn_lower = syn.lower()
                # 检查查询中是否包含同义词（作为独立词或子串）
                if syn_lower in query_lower:
                    # 将中文 key 的 token 加入
                    key_tokens = tokenize(key)
                    for kt in key_tokens:
                        if kt not in expanded:
                            expanded.append(kt)
                    # 同时也添加该 key 的其他同义词
                    for other_syn in synonyms:
                        if other_syn != syn:
                            other_tokens = tokenize(other_syn)
                            for ot in other_tokens:
                                if ot not in expanded:
                                    expanded.append(ot)

        return expanded

    def search(self, query: str, top_k: int = 4):
        if not self.available:
            return []

        # ── 缓存检查（OrderedDict 实现 LRU：命中移到队尾；过期项即时清理）──
        cache_key = (query, top_k)
        now = time.time()
        if cache_key in self._cache:
            ts, cached_results = self._cache[cache_key]
            if now - ts < self._cache_ttl:
                self._cache.move_to_end(cache_key)   # 标记为最近使用
                return cached_results
            del self._cache[cache_key]               # 过期 → 清掉，避免死条目占容量

        # ── 查询扩展 ──
        q_tokens = self._expand_query(query)
        if not q_tokens:
            return []

        # 候选池:先按 BM25 取前 40 篇
        candidate = []
        for i, tks in enumerate(self.tokenized):
            dl = len(tks)
            if dl == 0:
                continue
            freq = {}
            for w in tks:
                freq[w] = freq.get(w, 0) + 1
            score = 0.0
            for term in set(q_tokens):
                f = freq.get(term, 0)
                if f == 0:
                    continue
                weight = 0.5 if _LATEX_PATTERN.search(term) else 1.0
                idf = self.idf.get(term, math.log(self.N + 1))
                score += weight * idf * (
                    f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
                )
            if score > 0:
                candidate.append((i, score))
        candidate.sort(key=lambda x: x[1], reverse=True)
        candidate = candidate[:40]

        if not candidate:
            return []

        # ── v=20260866: TF-IDF 余弦相似度融合 ──
        # 计算查询的 TF-IDF 向量
        q_vec = {}
        q_freq = {}
        for w in q_tokens:
            q_freq[w] = q_freq.get(w, 0) + 1
        for w, f in q_freq.items():
            idx = self.vocab_index.get(w)
            if idx is not None:
                q_vec[idx] = (1 + math.log(f)) * self.idf.get(w, 0.1)
        q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

        # BM25 分数归一化基准
        max_bm25 = candidate[0][1] if candidate else 1.0
        if max_bm25 <= 0:
            max_bm25 = 1.0

        # 融合: 0.65 * BM25归一化 + 0.35 * 余弦相似度
        fused = []
        for i, bm25_score in candidate:
            doc_vec = self.doc_vectors[i]
            doc_norm = self.doc_norms[i] or 1.0
            if q_vec and doc_vec:
                dot = 0.0
                # 遍历较小的一方提高效率
                if len(q_vec) < len(doc_vec):
                    for idx, w in q_vec.items():
                        if idx in doc_vec:
                            dot += w * doc_vec[idx]
                else:
                    for idx, w in doc_vec.items():
                        if idx in q_vec:
                            dot += w * q_vec[idx]
                cosine = dot / (q_norm * doc_norm)
            else:
                cosine = 0.0
            bm25_norm = bm25_score / max_bm25
            fused_score = 0.65 * bm25_norm + 0.35 * cosine
            fused.append((i, fused_score))

        fused.sort(key=lambda x: x[1], reverse=True)

        hits = []
        for i, s in fused[:top_k]:
            d = self.docs[i]
            content = d.get("content", "")
            hits.append(
                {
                    "id": d.get("id"),
                    "chapter": d.get("chapter"),
                    "section": d.get("section"),
                    "source": d.get("source"),
                    "keywords": d.get("keywords", []),
                    "score": round(s, 4),
                    "content": content,
                    "snippet": content[:300],
                }
            )

        # ── 写入缓存（容量上限：超出则淘汰最久未使用的条目，防止内存无界增长）──
        self._cache[cache_key] = (now, hits)
        if len(self._cache) > self._cache_max:
            self._cache.popitem(last=False)

        return hits
