"""
自进化训练进程守护 v=20260866
====================================================
监控 self_train.py 常驻进程,异常退出(崩溃/被杀/网络抖动导致退出)后自动重启。
- 每 30s 检查一次存活状态
- 崩溃后等 5s 自动拉起,最多连续重启 3 次(超过则等 60s 再试,防死循环刷屏)
- 日志写入 logs/train_guard.log
- 主循环每轮回收已退出的子进程(poll),避免僵尸进程堆积

用法:
  nohup python training/guard_train.py > logs/train_guard.out 2>&1 &
"""
from pathlib import Path
import sys

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from dotenv import load_dotenv
load_dotenv(Path(PROJECT_ROOT) / ".env")

import os
import subprocess
import time
from datetime import datetime

BASE_DIR = PROJECT_ROOT
LOG_DIR = os.path.join(BASE_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "train_guard.log")
INTERVAL = 30          # 存活检查间隔(秒)
RESTART_DELAY = 5      # 崩溃后重启延迟(秒)
MAX_CONSECUTIVE = 3    # 连续重启上限
COOL_DOWN = 60         # 超过上限后的冷却时间(秒)

# 最近一次由本守护拉起的训练子进程句柄(本模块为函数式脚本,无类结构,故用模块级变量)。
# 必须持有它才能调用 poll() 回收僵尸进程——否则子进程退出后无人 wait,会留下僵尸。
_proc = None


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def is_running(cmd_keyword):
    """检查是否有包含 cmd_keyword 的 python 进程在跑。"""
    try:
        out = subprocess.run(
            ["pgrep", "-f", cmd_keyword],
            capture_output=True, text=True, timeout=10
        )
        return bool(out.stdout.strip())
    except Exception:
        return False


def spawn(cmd_args, tag):
    """拉起子进程,重定向输出到日志文件,不阻塞。"""
    logfile = os.path.join(LOG_DIR, f"{tag}.out")
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        f = open(logfile, "a", encoding="utf-8")
    except Exception:
        f = open(os.devnull, "a")
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    # 加载 .env 中的密钥(与 main.py 保持一致),确保子进程能读到 LLM_API_KEY
    try:
        from dotenv import load_dotenv
        dotenv_path = os.path.join(BASE_DIR, ".env")
        load_dotenv(dotenv_path, override=False)
        for k, v in os.environ.items():
            env.setdefault(k, v)
    except Exception:
        pass
    proc = subprocess.Popen(
        cmd_args, cwd=BASE_DIR, env=env,
        stdout=f, stderr=subprocess.STDOUT,
        start_new_session=True  # 独立会话,不受本守护进程退出影响
    )
    log(f"✅ 已拉起 {tag} (PID {proc.pid}) → {logfile}")
    return proc


def main():
    global _proc
    if os.name != "posix":
        raise SystemExit("This process manager requires Linux (pgrep and /proc). Run training/self_train.py directly on other systems.")
    os.makedirs(LOG_DIR, exist_ok=True)
    consecutive = 0
    log("═══ 自进化训练守护启动 ═══")

    # 立即检查:若训练未运行则拉起
    if not is_running("self_train.py"):
        _proc = spawn([sys.executable, os.path.join(PROJECT_ROOT, "training", "self_train.py"), "--interval", "600", "--max-per-round", "2"], "self_train")

    while True:
        time.sleep(INTERVAL)
        try:
            # 回收僵尸:每轮检查子进程是否已退出,poll() 会 reap 掉它并取得退出码
            if _proc is not None and _proc.poll() is not None:
                log(f"⚠️ 训练子进程 PID {_proc.pid} 已退出(退出码 {_proc.returncode}),回收句柄")
                _proc = None
            running = is_running("self_train.py")
            if not running:
                consecutive += 1
                if consecutive > MAX_CONSECUTIVE:
                    log(f"⚠️ 连续重启 {consecutive} 次,冷却 {COOL_DOWN}s 后重试")
                    time.sleep(COOL_DOWN)
                    consecutive = 0
                else:
                    log(f"⚠️ 检测到 self_train.py 已退出(连续第 {consecutive} 次),{RESTART_DELAY}s 后重启...")
                    time.sleep(RESTART_DELAY)
                    _proc = spawn([sys.executable, os.path.join(PROJECT_ROOT, "training", "self_train.py"), "--interval", "600", "--max-per-round", "2"], "self_train")
            else:
                # 正常运行,重置计数
                if consecutive > 0:
                    log(f"✅ self_train.py 恢复稳定,重置重启计数")
                consecutive = 0
        except KeyboardInterrupt:
            log("收到 Ctrl+C,守护退出")
            break
        except Exception as e:
            log(f"守护检查异常: {e}")


if __name__ == "__main__":
    main()
