"""
进程管理脚本:清理并拉起 守护 + 训练 进程(避免 shell pkill 自噬问题)
用法: python scripts/manage_proc.py --restart-train   # 重启训练+守护
      python scripts/manage_proc.py --status          # 查看状态
"""
from pathlib import Path
import sys

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from dotenv import load_dotenv
load_dotenv(Path(PROJECT_ROOT) / ".env")

import os
import signal
import subprocess
import time

BASE = PROJECT_ROOT


def pids_of(keyword):
    """通过 /proc 精确定位含 keyword 的 python 进程(不匹配自身)。"""
    result = []
    try:
        out = subprocess.run(["pgrep", "-f", keyword], capture_output=True, text=True, timeout=10)
        for pid in out.stdout.split():
            try:
                with open(f"/proc/{pid}/cmdline", "rb") as f:
                    cmd = f.read().replace(b"\x00", b" ").decode(errors="ignore")
                if keyword in cmd and "manage_proc" not in cmd:
                    result.append(int(pid))
            except Exception:
                pass
    except Exception:
        pass
    return result


def _wait_exit(pid, timeout=10.0):
    """轮询等待进程退出：每秒用 os.kill(pid, 0) 探测一次。

    ProcessLookupError 表示进程已不存在（视为已退出）。
    返回 True 表示已退出，False 表示超时仍存活。
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        except Exception:
            # 无权限等无法探测的情形：不再傻等，交给 SIGKILL 兜底
            return False
        time.sleep(1)
    return False


def kill_pids(pids, timeout=10.0):
    """先礼后兵：SIGTERM 请求退出 → 最多等 timeout 秒 → 仍存活才 SIGKILL。

    直接 SIGKILL 会让训练进程来不及落盘/保存状态（可能留下半截 JSON），
    因此优先给进程优雅退出的机会（self_train.py 已注册 SIGTERM 处理）。
    """
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            continue          # 已经退出
        except Exception:
            continue
    for pid in pids:
        if _wait_exit(pid, timeout):
            continue
        try:
            os.kill(pid, signal.SIGKILL)
            print(f"  PID {pid} 在 {timeout:.0f}s 内未退出,已强制 SIGKILL")
        except Exception:
            pass


def spawn(cmd, tag):
    logfile = os.path.join(BASE, "logs", f"{tag}.out")
    os.makedirs(os.path.dirname(logfile), exist_ok=True)
    f = open(logfile, "a", encoding="utf-8")
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BASE, ".env"), override=False)
        for k, v in os.environ.items():
            env.setdefault(k, v)
    except Exception:
        pass
    proc = subprocess.Popen(cmd, cwd=BASE, env=env, stdout=f, stderr=subprocess.STDOUT,
                            start_new_session=True)
    print(f"[{tag}] PID {proc.pid} 已启动 → {logfile}")
    return proc


def main():
    if os.name != "posix":
        raise SystemExit("This process manager requires Linux (pgrep and /proc). Run training/self_train.py directly on other systems.")
    action = sys.argv[1] if len(sys.argv) > 1 else "--status"
    guard_pids = pids_of("guard_train.py")
    train_pids = pids_of("self_train.py")

    if action == "--restart-train":
        # 1) 停止旧的
        kill_pids(guard_pids + train_pids)
        print("已停止旧进程:", guard_pids, train_pids)
        time.sleep(3)
        # 2) 启动守护(会自动拉起训练)
        spawn([sys.executable, os.path.join(PROJECT_ROOT, "training", "guard_train.py")], "train_guard")
        print("守护已启动,等待训练进程拉起...")
        time.sleep(12)
        print("训练进程:", pids_of("self_train.py") or "尚未拉起(等下一轮检查)")
    elif action == "--start-train":
        # 直接启动训练(若守护已在跑则由守护管理)
        if not train_pids:
            spawn([sys.executable, os.path.join(PROJECT_ROOT, "training", "self_train.py"), "--interval", "600", "--max-per-round", "2"], "self_train")
    else:
        print(f"guard_train.py: {guard_pids}")
        print(f"self_train.py:  {train_pids}")


if __name__ == "__main__":
    main()
