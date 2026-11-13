# -*- coding: utf-8 -*-
"""tutor.db 脱敏清洗 → tutor_clean.db
只保留 demo / admin / student_a / student_b 四个合成账号，
其余真实用户及全部真实用户数据清空，重新生成少量合成演示数据。

安全要点：
- 输出走“临时文件 + 原子替换”：全部写入成功后才 os.remove(旧 DST) + os.replace(tmp, DST)；
  任何异常都会删除 tmp 并保留原 DST 不动，绝不在输出路径留下未脱敏副本。
"""
from pathlib import Path
import sqlite3, hashlib, json, os, random
from datetime import datetime, date, timedelta



def pwd_hash(pwd, salt):
    return hashlib.sha256((pwd + salt).encode()).hexdigest()


def _ensure_column(db, table, col, ddl):
    """确保 table.col 列存在；缺失则 ALTER TABLE 补加（旧库/新库都能跑通）。

    返回 True 表示本次新增了列，False 表示列已存在。
    """
    cols = [r[1] for r in db.execute(f'PRAGMA table_info({table})').fetchall()]
    if col in cols:
        return False
    db.execute(f'ALTER TABLE {table} ADD COLUMN {ddl}')
    print(f'  ✓ 为 {table} 补加缺失列 {col}')
    return True

# 需要全表清空的用户数据表
CLEAR_TABLES = [
    'chat_history', 'chat_messages', 'chat_sessions', 'mistakes', 'messages',
    'moments', 'friends', 'groups', 'group_members', 'oauth_pending',
    'token_usage', 'user_credits', 'credit_orders', 'user_sessions',
    'student_profiles', 'knowledge_mastery', 'learning_sessions',
    'student_gamification', 'notes', 'favorites', 'feedback',
    'review_schedule',
]


def clean_database(SRC, DST):
    """脱敏清洗入口：产物先写到 DST + '.tmp'，全部成功后再原子替换到 DST。

    这样任何一步异常都不会在输出路径留下“未脱敏/半脱敏”的副本，
    同时保证原 DST（如果已存在）不被破坏。
    """
    tmp_dst = DST + '.tmp'
    if os.path.exists(tmp_dst):
        os.remove(tmp_dst)
    try:
        _build_clean_db(SRC, tmp_dst)
    except BaseException:
        # 失败清理：删除临时产物，保留原 DST 不动
        try:
            if os.path.exists(tmp_dst):
                os.remove(tmp_dst)
        except Exception:
            pass
        raise
    # 已 commit 并 close，替换输出
    if os.path.exists(DST):
        os.remove(DST)
    os.replace(tmp_dst, DST)
    print('\n✅ 清洗完成 →', DST)


def _build_clean_db(SRC, DST):
    # 复制源库到目标库（DST 为临时文件路径）
    # SQLite's backup API also includes committed WAL data.
    with sqlite3.connect(f"file:{Path(SRC).as_posix()}?mode=ro", uri=True) as source_db:
        with sqlite3.connect(DST) as output_db:
            source_db.backup(output_db)
    conn = sqlite3.connect(DST)
    cur = conn.cursor()

    print('=== 第 1 步：清空全部用户数据表 ===')
    # 只清真实存在的表：不同版本库里表集合可能不同，硬 DELETE 会直接抛 no such table
    existing_tables = {r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    for t in CLEAR_TABLES:
        if t not in existing_tables:
            print(f'  跳过不存在的表 {t}')
            continue
        cur.execute(f'DELETE FROM {t}')
        print(f'  清空 {t}')

    print('\n=== 第 2 步：删除全部 users，重建 4 个合成账号 ===')
    cur.execute('DELETE FROM users')

    now = datetime.now()
    accounts = [
        # (username, nickname, avatar, role, 密码, salt)
        ('demo',      '🎓 演示账号 · 张同学', 'S', 'user',  'demo123',   'demo_salt_2026'),
        ('admin',     '系统管理员',           'A', 'admin', 'admin123',  'admin_salt_2026'),
        ('student_a', '演示学生A',            'A', 'user',  'demo123',   'student_a_salt'),
        ('student_b', '演示学生B',            'B', 'user',  'demo123',   'student_b_salt'),
    ]
    uid_map = {}
    for username, nickname, avatar, role, pwd, salt in accounts:
        cur.execute("""INSERT INTO users
            (username, nickname, avatar, password_hash, salt, token, role, status, guest_quota, created, last_login, pwd_plain)
            VALUES (?, ?, ?, ?, ?, '', ?, 'active', 0, ?, NULL, '')""",
            (username, nickname, avatar, pwd_hash(pwd, salt), salt, role, now.isoformat()))
        uid = cur.lastrowid
        uid_map[username] = uid
        print(f'  创建 {username} (id={uid}, 密码={pwd})')

    demo_uid = uid_map['demo']
    sa_uid = uid_map['student_a']
    sb_uid = uid_map['student_b']

    print('\n=== 第 3 步：给 demo + 2 个合成用户造少量合成数据 ===')

    # 知识点列表（与 knowledge_graph 对齐的常见线性代数知识点）
    all_kps = [
        '行列式的定义', '二阶行列式', '三阶行列式', 'n阶行列式', '行列式性质',
        '矩阵的定义', '矩阵运算', '矩阵乘法', '矩阵的秩', '逆矩阵',
        '向量组的线性相关性', '极大线性无关组', '施密特正交化方法', '向量内积',
        '线性方程组的解', '克莱姆法则', '矩阵的特征值', '特征向量', '相似矩阵',
        '二次型', '正定二次型', '线性空间', '基与维数'
    ]
    weak_kps = ['矩阵的特征值', '特征向量', '施密特正交化方法', '相似矩阵', '正定二次型', '极大线性无关组']
    medium_kps = ['n阶行列式', '矩阵的秩', '向量内积', '克莱姆法则', '逆矩阵', '线性空间', '基与维数', '三阶行列式']

    def make_mastery(uid, seed_offset=0):
        """为一个用户生成知识点掌握度数据。

        随机数使用每用户独立的 random.Random(seed_offset or 42)：
        seed_offset 真正生效（demo=0→42、student_a=100、student_b=200），
        同一用户每次运行产出完全相同的数据，清洗结果可复现、可比对。
        """
        rng = random.Random(seed_offset or 42)
        rows = []
        for i, kp in enumerate(all_kps):
            if kp in weak_kps:
                score = rng.uniform(28, 56); attempts = rng.randint(3, 8)
            elif kp in medium_kps:
                score = rng.uniform(58, 74); attempts = rng.randint(2, 5)
            else:
                score = rng.uniform(76, 96); attempts = rng.randint(1, 4)
            last_p = (now - timedelta(days=rng.randint(1, 12))).isoformat()
            forgetting = round(rng.uniform(0.05, 0.4), 2)
            correct = rng.randint(int(attempts*0.5), attempts)
            rows.append((uid, kp, round(score, 1), attempts, correct,
                         round(rng.uniform(15, 90), 1), last_p, forgetting, now.isoformat(), 'seed'))
        # 旧库可能没有 source 列（新库由 core.py 建表时自带），INSERT 前先补齐
        _ensure_column(cur, 'knowledge_mastery', 'source', "source TEXT DEFAULT 'curriculum'")
        cur.executemany("""INSERT INTO knowledge_mastery
            (user_id, knowledge_point, mastery_score, attempts, correct_attempts, avg_response_time, last_practiced, forgetting_score, updated, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", rows)
        return len(rows)

    def make_profile(uid, mastery):
        cur.execute("""INSERT INTO student_profiles
            (user_id, learning_style, cognitive_level, interest_vector, study_rhythm, confidence_score, overall_mastery, emotion_trend, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid,
             json.dumps({'visual': 0.62, 'reading': 0.15, 'practice': 0.18, 'theory': 0.05}, ensure_ascii=False),
             json.dumps({'speed': 0.72, 'accuracy': 0.82, 'analogy': 0.68, 'independent': 0.76}, ensure_ascii=False),
             json.dumps({'应用题': 0.45, '几何可视化': 0.85, '抽象证明': 0.20, '数值计算': 0.65}, ensure_ascii=False),
             json.dumps({'preferred_hour': 21, 'avg_session_min': 35, 'streak_days': 5, 'last_active_date': date.today().isoformat()}, ensure_ascii=False),
             78, round(mastery, 1),
             json.dumps({'current': '积极', 'trend': '稳定向好', 'history': [
                 {'date': (date.today() - timedelta(days=i)).isoformat(), 'score': 60 + random.randint(-15, 25)}
                 for i in range(6, -1, -1)]}, ensure_ascii=False),
             now.isoformat()))

    def make_sessions(uid, days=6):
        rows = []
        for i in range(days, 0, -1):
            d = (date.today() - timedelta(days=i)).isoformat()
            duration = random.randint(15, 50) * 60
            total = random.randint(8, 22)
            correct = int(total * random.uniform(0.62, 0.88))
            kps = random.sample(all_kps, k=min(3, len(all_kps)))
            rows.append((uid, 'chat', json.dumps(kps, ensure_ascii=False), duration, correct, total, d + 'T20:00:00'))
        cur.executemany("""INSERT INTO learning_sessions
            (user_id, session_type, knowledge_points, duration_seconds, correct_count, total_count, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)""", rows)

    def make_gamification(uid):
        badges = [
            {'id': 'first_task', 'name': '🎯 首次任务', 'desc': '完成 1 个学习任务', 'ts': now.isoformat()},
            {'id': 'streak_3', 'name': '🔥 三日连击', 'desc': '连续 3 天打卡', 'ts': now.isoformat()},
            {'id': 'points_100', 'name': '💯 百分入门', 'desc': '累计获得 100 积分', 'ts': now.isoformat()},
        ]
        tasks = [
            {'kp': '逆矩阵', 'points': 10, 'date': (date.today() - timedelta(days=5)).isoformat(), 'ts': now.isoformat()},
            {'kp': '三阶行列式', 'points': 10, 'date': (date.today() - timedelta(days=4)).isoformat(), 'ts': now.isoformat()},
            {'kp': '矩阵的秩', 'points': 10, 'date': (date.today() - timedelta(days=3)).isoformat(), 'ts': now.isoformat()},
            {'kp': '向量内积', 'points': 15, 'date': (date.today() - timedelta(days=2)).isoformat(), 'ts': now.isoformat()},
            {'kp': '二次型', 'points': 10, 'date': (date.today() - timedelta(days=1)).isoformat(), 'ts': now.isoformat()},
        ]
        cur.execute("""INSERT INTO student_gamification
            (user_id, points, level, streak_days, last_active_date, completed_tasks_json, badges_json, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, 220, 2, 5, date.today().isoformat(), json.dumps(tasks, ensure_ascii=False), json.dumps(badges, ensure_ascii=False), now.isoformat()))

    def make_chat(uid, conversations):
        now_ts = (now - timedelta(days=2)).isoformat()
        sess_id = None
        for i, (q, a) in enumerate(conversations):
            if i % 2 == 0:
                cur.execute("INSERT INTO chat_sessions (user_id, title, created, updated) VALUES (?, ?, ?, ?)",
                            (uid, q[:20], now_ts, now_ts))
                sess_id = cur.lastrowid
            cur.execute("INSERT INTO chat_messages (session_id, user_id, role, content, mode, created) VALUES (?, ?, ?, ?, ?, ?)",
                        (sess_id, uid, 'user', q, 'detailed', now_ts))
            cur.execute("INSERT INTO chat_messages (session_id, user_id, role, content, mode, created) VALUES (?, ?, ?, ?, ?, ?)",
                        (sess_id, uid, 'assistant', a, 'detailed', now_ts))

    def make_mistakes(uid, mistakes):
        cur.executemany("""INSERT INTO mistakes
            (user_id, question, user_answer, correct_answer, knowledge_point, chapter, times, last_time, deleted)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)""",
            [(uid, m[0], m[1], m[2], m[3], m[4], now.isoformat()) for m in mistakes])

    # ---- demo 账号：完整演示数据（参考 seed_demo_account.py）----
    print('  生成 demo 账号数据…')
    make_mastery(demo_uid)
    make_profile(demo_uid, 64.5)
    make_sessions(demo_uid, 6)
    make_gamification(demo_uid)
    demo_conversations = [
        ('什么是逆矩阵？怎么求？',
         '## 逆矩阵的定义\n\n对于 $n$ 阶方阵 $A$，若存在 $n$ 阶方阵 $B$ 使得 $AB = BA = E$，则称 $A$ **可逆**，$B$ 是 $A$ 的逆矩阵，记作 $A^{-1}$。\n\n## 求法\n\n1. **定义法**：$B = \\dfrac{A^*}{|A|}$\n2. **初等变换法**：$[A | E] \\to [E | A^{-1}]$\n\n## 例题\n\n求 $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$ 的逆。\n\n解：$\\det(A) = -2$，$A^{-1} = \\begin{bmatrix} -2 & 1 \\\\ \\tfrac{3}{2} & -\\tfrac{1}{2} \\end{bmatrix}$'),
        ('特征值的几何意义是什么？',
         '## 直观理解\n\n特征值 $\\lambda$ 告诉你：**线性变换 $A$ 在某些方向上只是拉伸/压缩**，没有旋转。\n\n## 严格定义\n\n$A\\mathbf{v} = \\lambda \\mathbf{v}$，其中 $\\mathbf{v} \\ne \\mathbf{0}$。\n\n## 关键公式\n\n$$\\det(\\lambda E - A) = 0$$'),
        ('行列式有什么几何意义？',
         '## 几何意义\n\n**$n$ 阶行列式的绝对值 = 由其行向量张成的 $n$ 维平行多面体的体积。**\n\n- $\\det A = 0$ ⇔ 向量共面 ⇔ 矩阵不可逆\n- $\\det(AB) = \\det A \\cdot \\det B$'),
        ('矩阵的秩怎么理解？',
         '## 秩的直观理解\n\n矩阵的**秩** = 其行（列）向量组中**线性无关向量的最大个数**，也等于非零子式的最高阶数。\n\n## 关键结论\n\n- 秩 = 矩阵"真正包含的信息量"\n- $r(A) = r(A^T)$\n- 可逆方阵的秩 = 阶数 $n$'),
    ]
    make_chat(demo_uid, demo_conversations)
    demo_mistakes = [
        ('求矩阵 [[2,1],[1,2]] 的特征值', 'λ=1 和 λ=4', 'λ=1 和 λ=3', '矩阵的特征值', '特征值与特征向量'),
        ('判断向量 α=(1,2,3), β=(2,4,6) 的相关性', '线性无关', 'β = 2α, 线性相关', '向量组的线性相关性', '向量与线性方程组'),
    ]
    make_mistakes(demo_uid, demo_mistakes)
    print(f'  demo：掌握度 {len(all_kps)} 条、问答 {len(demo_conversations)} 段、错题 {len(demo_mistakes)} 条')

    # ---- student_a / student_b：少量合成数据 ----
    print('  生成 student_a 数据…')
    make_mastery(sa_uid, seed_offset=100)
    make_profile(sa_uid, 52.0)
    make_sessions(sa_uid, 4)
    make_gamification(sa_uid)
    sa_conversations = [
        ('行列式怎么算？', '## 二阶行列式\n\n$$\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc$$\n\n三阶用对角线法则或按行展开。'),
        ('什么是线性相关？', '## 定义\n\n若存在不全为零的数 $k_1,\\dots,k_m$ 使 $k_1\\alpha_1 + \\dots + k_m\\alpha_m = 0$，则向量组**线性相关**；否则**线性无关**。'),
    ]
    make_chat(sa_uid, sa_conversations)
    sa_mistakes = [
        ('混淆了 |AB|=|A||B| 的适用条件', '直接对不可逆矩阵套用', '|AB|=|A||B| 对任意同阶方阵都成立，但 |A+B|≠|A|+|B|', '行列式性质', '行列式'),
    ]
    make_mistakes(sa_uid, sa_mistakes)
    print(f'  student_a：掌握度 {len(all_kps)} 条、问答 {len(sa_conversations)} 段、错题 {len(sa_mistakes)} 条')

    print('  生成 student_b 数据…')
    make_mastery(sb_uid, seed_offset=200)
    make_profile(sb_uid, 71.0)
    make_sessions(sb_uid, 5)
    make_gamification(sb_uid)
    sb_conversations = [
        ('什么是二次型？', '## 二次型\n\n$n$ 元二次型是 $n$ 个变量的二次齐次多项式，可用对称矩阵表示：$f(x) = x^T A x$。'),
        ('特征值怎么求？', '## 求特征值步骤\n\n1. 求特征多项式 $\\det(\\lambda E - A)$\n2. 令其等于 0，解出 $\\lambda$\n3. 每个 $\\lambda$ 代入求特征向量'),
    ]
    make_chat(sb_uid, sb_conversations)
    sb_mistakes = [
        ('求特征向量时忘记代入具体特征值', '直接把 (λE-A) 当常矩阵', '应分别对每个 λ 解齐次方程组 (λE-A)x=0', '特征向量', '特征值与特征向量'),
    ]
    make_mistakes(sb_uid, sb_mistakes)
    print(f'  student_b：掌握度 {len(all_kps)} 条、问答 {len(sb_conversations)} 段、错题 {len(sb_mistakes)} 条')

    conn.commit()

    # 验证
    print('\n=== 第 4 步：验证清洗结果 ===')
    print('users 表：')
    for r in cur.execute('SELECT id, username, nickname, role, (token IS NULL OR token=""), (pwd_plain IS NULL OR pwd_plain="") FROM users ORDER BY id').fetchall():
        print('  ', r)
    print('chat_messages 总数：', cur.execute('SELECT COUNT(*) FROM chat_messages').fetchone()[0])
    print('mistakes 总数：', cur.execute('SELECT COUNT(*) FROM mistakes').fetchone()[0])
    print('messages(站内信) 总数：', cur.execute('SELECT COUNT(*) FROM messages').fetchone()[0])
    print('token_usage 总数：', cur.execute('SELECT COUNT(*) FROM token_usage').fetchone()[0])
    print('user_sessions 总数：', cur.execute('SELECT COUNT(*) FROM user_sessions').fetchone()[0])

    conn.close()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Create a sanitized demo database copy; never modify the source.")
    parser.add_argument("--source", required=True, help="Existing tutor.db to read")
    parser.add_argument("--output", required=True, help="New output database (must not exist)")
    args = parser.parse_args()
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    if not source.is_file():
        parser.error("source database does not exist")
    # 只禁止覆盖源库本身（源库以只读方式打开，输出已走临时文件+原子替换，
    # 因此允许输出路径已存在并被安全替换）
    if source == output:
        parser.error("output must be a different path from the source")
    output.parent.mkdir(parents=True, exist_ok=True)
    clean_database(str(source), str(output))


if __name__ == "__main__":
    main()
