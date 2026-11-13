"""
v=20260897 演示账号数据批量预置脚本(v2:字段名适配)
"""
from pathlib import Path
import sys

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from backend.paths import database_path
from dotenv import load_dotenv
load_dotenv(Path(PROJECT_ROOT) / ".env")

import sqlite3, hashlib, json, os, random
from datetime import datetime, date, timedelta

DB = database_path()

def pwd_hash(pwd, salt):
    return hashlib.sha256((pwd + salt).encode()).hexdigest()

def seed():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    salt = 'demo_salt_2026'
    cur.execute("DELETE FROM users WHERE username='demo'")
    cur.execute("""
        INSERT INTO users (username, nickname, avatar, password_hash, salt, token, role, status, created, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ('demo', '🎓 演示账号 · 张同学', 'S', pwd_hash('demo123', salt), salt, '', 'user', 'active',
          datetime.now().isoformat(), datetime.now().isoformat()))
    uid = cur.execute("SELECT id FROM users WHERE username='demo'").fetchone()[0]
    print(f'✓ 用户 demo id={uid}')

    # student_profiles (v=20260910 修复字段 key:中文→英文;emotion 数组→对象)
    cur.execute("DELETE FROM student_profiles WHERE user_id=?", (uid,))
    cur.execute("""INSERT INTO student_profiles
        (user_id, learning_style, cognitive_level, interest_vector, study_rhythm,
         confidence_score, overall_mastery, emotion_trend, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (uid,
         json.dumps({'visual': 0.62, 'reading': 0.15, 'practice': 0.18, 'theory': 0.05}, ensure_ascii=False),
         # cognitive_level 用英文 key,匹配前端 p.cognitive_level?.speed/.accuracy
         json.dumps({'speed': 0.72, 'accuracy': 0.82, 'analogy': 0.68, 'independent': 0.76}, ensure_ascii=False),
         json.dumps({'应用题': 0.45, '几何可视化': 0.85, '抽象证明': 0.20, '数值计算': 0.65}, ensure_ascii=False),
         # study_rhythm 字段对齐前端 avg_session_min
         json.dumps({'preferred_hour': 21, 'avg_session_min': 35, 'streak_days': 5,
                     'last_active_date': date.today().isoformat()}, ensure_ascii=False),
         78, 64.5,
         # emotion_trend 改为对象,前端读 emotion.current / emotion.trend
         json.dumps({
             'current': '积极',  # 当前情绪
             'trend': '稳定向好',  # 整体趋势描述
             'history': [         # 最近 7 天每日情绪分(0-100)
                 {'date': (date.today() - timedelta(days=i)).isoformat(),
                  'score': 60 + random.randint(-15, 25)}
                 for i in range(6, -1, -1)
             ]
         }, ensure_ascii=False),
         datetime.now().isoformat()))
    print('✓ student_profiles')

    # knowledge_mastery
    # v=20260910 修正:原 `from engine import KG` 在 engine.py 中没有 KG 模块 → fallback 列表与 knowledge_graph 不同步
    # 改为直接 import knowledge_graph 单例模块 kg(其内部构建 KP_TO_CHAPTER)
    try:
        from backend import knowledge_graph as KG
        all_kps = list(KG.KP_TO_CHAPTER.keys())
        kp_to_chapter = KG.KP_TO_CHAPTER
    except Exception:
        # 最后兜底:保持旧名单,但保留字段以防崩溃
        all_kps = [
            '行列式的定义', '二阶行列式', '三阶行列式', 'n阶行列式', '行列式性质',
            '矩阵的定义', '矩阵运算', '矩阵乘法', '矩阵的秩', '逆矩阵',
            '向量组的线性相关性', '极大线性无关组', '施密特正交化方法', '向量内积',
            '线性方程组的解', '克莱姆法则', '矩阵的特征值', '特征向量', '相似矩阵',
            '二次型', '正定二次型', '线性空间', '基与维数'
        ]
        kp_to_chapter = {kp: '未分类' for kp in all_kps}

    weak_kps = ['矩阵的特征值', '特征向量', '施密特正交化方法', '相似矩阵', '正定二次型', '极大线性无关组']
    medium_kps = ['n阶行列式', '矩阵的秩', '向量内积', '克莱姆法则', '逆矩阵', '线性空间', '基与维数', '三阶行列式']

    now = datetime.now()
    mastery_data = []
    for kp in all_kps:
        if kp in weak_kps:
            score = random.uniform(28, 56)
            attempts = random.randint(3, 8)
        elif kp in medium_kps:
            score = random.uniform(58, 74)
            attempts = random.randint(2, 5)
        else:
            score = random.uniform(76, 96)
            attempts = random.randint(1, 4)
        last_p = (now - timedelta(days=random.randint(1, 12))).isoformat()
        # forgetting_score: 越久没练越高
        forgetting = round(random.uniform(0.05, 0.4), 2)
        mastery_data.append((uid, kp, round(score, 1), attempts,
                             random.randint(int(attempts*0.5), attempts),  # correct_attempts
                             round(random.uniform(15, 90), 1),  # avg_response_time
                             last_p, forgetting))

    cur.execute("DELETE FROM knowledge_mastery WHERE user_id=?", (uid,))
    cur.executemany("""INSERT INTO knowledge_mastery
        (user_id, knowledge_point, mastery_score, attempts, correct_attempts, avg_response_time, last_practiced, forgetting_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", mastery_data)
    print(f'✓ knowledge_mastery ({len(mastery_data)} 条)')

    # learning_sessions (7 天)
    cur.execute("DELETE FROM learning_sessions WHERE user_id=?", (uid,))
    sessions = []
    for i in range(6, 0, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        duration = random.randint(15, 50) * 60
        total = random.randint(8, 22)
        correct = int(total * random.uniform(0.62, 0.88))
        kps = random.sample(all_kps, k=min(3, len(all_kps)))
        sessions.append((uid, 'chat', json.dumps(kps, ensure_ascii=False), duration, correct, total, d + 'T20:00:00'))
    cur.executemany("""INSERT INTO learning_sessions
        (user_id, session_type, knowledge_points, duration_seconds, correct_count, total_count, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)""", sessions)
    print(f'✓ learning_sessions ({len(sessions)} 天)')

    # mistakes
    cur.execute("DELETE FROM mistakes WHERE user_id=?", (uid,))
    mistakes = [
        ('求矩阵 [[2,1],[1,2]] 的特征值', 'λ=1 和 λ=4', 'λ=1 和 λ=3', '矩阵的特征值', '特征值与特征向量', '我漏掉了一行展开', 0),
        ('判断向量 α=(1,2,3), β=(2,4,6) 的相关性', '线性无关', 'β = 2α, 线性相关', '向量组的线性相关性', '向量与线性方程组', '没看出成比例', 0),
        ('施密特正交化求标准正交基', '过程算错,最后两向量不正交', '未归一化导致内积≠0', '施密特正交化方法', '向量空间', '忘记归一化', 0),
        ('判断 x²+xy+y² 是否正定', '正定', '特征值有负,不是正定', '正定二次型', '二次型', '没算顺序主子式', 0),
        ('求 [[1,2],[3,4]] 的逆', '1/2 [[4,-2],[-3,1]]', '符号算错', '逆矩阵', '矩阵', '行列式算错', 0),
    ]
    cur.executemany("""INSERT INTO mistakes
        (user_id, question, user_answer, correct_answer, knowledge_point, chapter, times, last_time, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [(uid, m[0], m[1], m[2], m[3], m[4], 0, datetime.now().isoformat(), 0) for m in mistakes])
    print(f'✓ mistakes ({len(mistakes)} 条)')

    # chat_sessions + chat_messages
    cur.execute("DELETE FROM chat_sessions WHERE user_id=?", (uid,))
    cur.execute("DELETE FROM chat_messages WHERE user_id=?", (uid,))

    conversations = [
        ('什么是逆矩阵？怎么求？',
         '## 逆矩阵的定义\n\n对于 $n$ 阶方阵 $A$，若存在 $n$ 阶方阵 $B$ 使得 $AB = BA = E$，则称 $A$ **可逆**，$B$ 是 $A$ 的逆矩阵，记作 $A^{-1}$。\n\n## 求法\n\n1. **定义法**：$B = \\dfrac{A^*}{|A|}$，其中 $A^*$ 是伴随矩阵\n2. **初等变换法**：$[A | E] \\to [E | A^{-1}]$\n3. **特征值法**：若 $A = P \\Lambda P^{-1}$，则 $A^{-1} = P \\Lambda^{-1} P^{-1}$\n\n## 关键公式\n\n$$A^{-1} = \\frac{1}{\\det(A)} \\cdot \\text{adj}(A)$$\n\n## 例题\n\n求 $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\\\\end{bmatrix}$ 的逆矩阵。\n\n解：$\\det(A) = -2$，伴随矩阵 $\\text{adj}(A) = \\begin{bmatrix} 4 & -2 \\\\ -3 & 1 \\\\end{bmatrix}$\n\n$$A^{-1} = \\begin{bmatrix} -2 & 1 \\\\ \\tfrac{3}{2} & -\\tfrac{1}{2} \\\\\end{bmatrix}$$'),
        ('特征值的几何意义是什么？',
         '## 直观理解\n\n特征值 $\\lambda$ 告诉你：**线性变换 $A$ 在某些方向上只是"拉伸/压缩"**，没有旋转。\n\n## 严格定义\n\n$A\\mathbf{v} = \\lambda \\mathbf{v}$，其中 $\\mathbf{v} \\ne \\mathbf{0}$。\n\n## 几何意义\n\n- $|\\lambda| > 1$：拉伸\n- $|\\lambda| < 1$：压缩\n- $\\lambda < 0$：反向\n\n## 关键公式\n\n$$\\det(\\lambda E - A) = 0$$'),
        ('行列式有什么几何意义？',
         '## 几何意义\n\n**$n$ 阶行列式的绝对值 = 由其行向量张成的 $n$ 维平行多面体的体积。**\n\n## 二维情形\n\n$|\\det\\begin{bmatrix} a & b \\\\ c & d \\\\end{bmatrix}| = $ 平行四边形面积\n\n## 关键意义\n\n- $\\det A = 0$ ⇔ 向量共面/共线 ⇔ 体积=0 ⇔ 矩阵不可逆\n- $\\det(AB) = \\det A \\cdot \\det B$'),
        ('线性代数怎么学？',
         '## 我的学习建议\n\n1. **先建立几何直觉**：每个抽象概念都要问"在二维/三维空间里它是什么形状"\n2. **重视计算练习**：手算 + NumPy 验证双轨并行\n3. **串联知识点**：行列式 ↔ 体积 ↔ 可逆 ↔ 特征值 形成一条主线\n\n你当前综合掌握度 64.5%，信心 78/100，风格偏可视化。继续加油！'),
    ]

    now_ts = (now - timedelta(days=2)).isoformat()
    sess_id = None
    for i, (q, a) in enumerate(conversations):
        if i % 2 == 0:
            cur.execute("INSERT INTO chat_sessions (user_id, title, created, updated) VALUES (?, ?, ?, ?)",
                        (uid, q[:20], now_ts, now_ts))
            sess_id = cur.lastrowid
        cur.execute("""INSERT INTO chat_messages (session_id, user_id, role, content, mode, created)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (sess_id, uid, 'user', q, 'detailed', now_ts))
        cur.execute("""INSERT INTO chat_messages (session_id, user_id, role, content, mode, created)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (sess_id, uid, 'assistant', a, 'detailed', now_ts))
    print(f'✓ chat_history ({len(conversations)} 段)')

    # student_gamification
    cur.execute("DELETE FROM student_gamification WHERE user_id=?", (uid,))
    badges = [
        {'id': 'first_task', 'name': '🎯 首次任务', 'desc': '完成 1 个学习任务', 'ts': now.isoformat()},
        {'id': 'streak_3', 'name': '🔥 三日连击', 'desc': '连续 3 天打卡', 'ts': now.isoformat()},
        {'id': 'points_100', 'name': '💯 百分入门', 'desc': '累计获得 100 积分', 'ts': now.isoformat()},
    ]
    completed_tasks = [
        {'kp': '逆矩阵', 'points': 10, 'date': (date.today() - timedelta(days=5)).isoformat(), 'ts': now.isoformat()},
        {'kp': '三阶行列式', 'points': 10, 'date': (date.today() - timedelta(days=4)).isoformat(), 'ts': now.isoformat()},
        {'kp': '矩阵的秩', 'points': 10, 'date': (date.today() - timedelta(days=3)).isoformat(), 'ts': now.isoformat()},
        {'kp': '向量内积', 'points': 15, 'date': (date.today() - timedelta(days=2)).isoformat(), 'ts': now.isoformat()},
        {'kp': '二次型', 'points': 10, 'date': (date.today() - timedelta(days=1)).isoformat(), 'ts': now.isoformat()},
    ]
    cur.execute("""INSERT INTO student_gamification
        (user_id, points, level, streak_days, last_active_date, completed_tasks_json, badges_json, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (uid, 220, 2, 5, date.today().isoformat(),
         json.dumps(completed_tasks, ensure_ascii=False),
         json.dumps(badges, ensure_ascii=False), now.isoformat()))
    print('✓ student_gamification')

    conn.commit()
    conn.close()
    print()
    print('=' * 50)
    print('✅ 演示账号预置完成')
    print(f'   用户名: demo   密码: demo123   uid={uid}')
    print('=' * 50)

if __name__ == '__main__':
    seed()