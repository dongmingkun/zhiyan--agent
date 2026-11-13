"""
v=20260897 数据清理脚本:
1. 清理 knowledge_mastery 中「自进化生成 v*」测试性条目(避免评委溯源质疑权威性)
2. 扫描整个表,生成 source 审计报告
3. 备份被删除条目到 data_cleanup_audit.json 以便追溯

破坏面收紧(v20260897+):
- 删除条件只保留明确的中文 AI 生成前缀 ['自进化生成%', 'AI生成%', 'AI 生成%'];
  原先的 LIKE '%test%' / '%tmp%' / 'generated%' 模式过宽,会把知识点名里
  恰好含 test/tmp/generated 的正常教材条目一并误删,已从删除条件中移除。
- 删除前先用 sqlite backup API 把整库备份到 backups/cleanup_backup_<时间戳>.db,
  误删时可整库回滚(不再只有"被删条目"的 JSON 审计)。
- 支持 --dry-run: 只打印将删除的行,不备份、不写审计、不执行任何写操作。

用法:
    python scripts/cleanup_ai_corpus.py            # 执行清理(先整库备份)
    python scripts/cleanup_ai_corpus.py --dry-run  # 演练: 只看会删哪些行
"""
from pathlib import Path
import sys

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from backend.paths import database_path
from dotenv import load_dotenv
load_dotenv(Path(PROJECT_ROOT) / ".env")

import sqlite3, json, os
from datetime import datetime

DB = database_path()
AUDIT = os.path.join(PROJECT_ROOT, 'docs', 'archive', 'audit', 'data_cleanup_audit.json')
BACKUP_DIR = os.path.join(PROJECT_ROOT, 'backups')

# 删除条件白名单:只保留明确的中文 AI 生成前缀(破坏面可控,可人工核对)
DELETE_PATTERNS = ['自进化生成%', 'AI生成%', 'AI 生成%']
# 匹配子句统一构造,保证 SELECT 与 DELETE 用的条件完全一致
_MATCH_WHERE = ' OR '.join(['knowledge_point LIKE ?'] * len(DELETE_PATTERNS))


def backup_database():
    """用 sqlite backup API 把整库备份到 backups/cleanup_backup_<时间戳>.db。"""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    dst = os.path.join(BACKUP_DIR, f'cleanup_backup_{stamp}.db')
    src_conn = sqlite3.connect(DB)
    try:
        dst_conn = sqlite3.connect(dst)
        try:
            src_conn.backup(dst_conn)   # 含已提交的 WAL 数据
        finally:
            dst_conn.close()
    finally:
        src_conn.close()
    print(f'✓ 已整库备份 → {dst}')
    return dst


def cleanup(dry_run=False):
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # 备份将被删除的条目
    suspicious = cur.execute(
        f"SELECT * FROM knowledge_mastery WHERE {_MATCH_WHERE}", DELETE_PATTERNS).fetchall()
    cols = [d[1] for d in cur.execute("PRAGMA table_info(knowledge_mastery)").fetchall()]

    if dry_run:
        # 演练模式:只打印将删除的行,不备份/不写审计/不执行 DELETE 与 ALTER
        print('=' * 60)
        print('[dry-run] 以下条目将被删除(未执行任何写操作)')
        print(f'匹配条件: {DELETE_PATTERNS}')
        print(f'命中条目数: {len(suspicious)}')
        for r in suspicious:
            print(f'  - user={r[1]}, kp={r[2]}, score={r[3]}')
        conn.close()
        return len(suspicious)

    # 删除前整库备份,误删可整体回滚
    backup_database()

    audit = {
        'cleanup_time': datetime.now().isoformat(),
        'version': 'v20260897',
        'reason': '赛题要求:知识库去「自进化生成」(AI 生成)条目,改用教材原文或显式标注 AI 生成',
        'deleted_records': [dict(zip(cols, r)) for r in suspicious],
        'deleted_count': len(suspicious),
    }
    with open(AUDIT, 'w', encoding='utf-8') as f:
        json.dump(audit, f, ensure_ascii=False, indent=2)

    # 删除(与上面的 SELECT 使用同一匹配条件,参数绑定,不再写死宽模式)
    cur.execute(f"DELETE FROM knowledge_mastery WHERE {_MATCH_WHERE}", DELETE_PATTERNS)
    deleted = cur.rowcount

    # 添加 source 字段(默认 'curriculum',AI 生成条目入库时显式标 'self_evolution_ai_generated')
    cols_info = cur.execute("PRAGMA table_info(knowledge_mastery)").fetchall()
    has_source = any(c[1] == 'source' for c in cols_info)
    if not has_source:
        cur.execute("ALTER TABLE knowledge_mastery ADD COLUMN source TEXT DEFAULT 'curriculum'")
        print('✓ 添加 knowledge_mastery.source 字段(默认 curriculum)')
    else:
        print('  knowledge_mastery.source 已存在,跳过')

    conn.commit()

    # 输出审计报告
    print()
    print('=' * 60)
    print('v20260897 语料去 AI 生成化 审计报告')
    print('=' * 60)
    print(f'删除条目数: {deleted}')
    print(f'审计记录备份: {AUDIT}')
    print()
    print('删除明细:')
    for r in suspicious:
        print(f'  - user={r[1]}, kp={r[2]}, score={r[3]}')

    # 当前数据库总览
    total = cur.execute('SELECT COUNT(*) FROM knowledge_mastery').fetchone()[0]
    print(f'\n当前 knowledge_mastery 总条目数: {total}')
    cur_src = cur.execute("SELECT source, COUNT(*) FROM knowledge_mastery GROUP BY source").fetchall()
    print(f'按来源分布: {dict(cur_src)}')

    conn.close()
    return deleted

if __name__ == '__main__':
    cleanup(dry_run='--dry-run' in sys.argv)