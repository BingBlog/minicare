"""Langfuse 观测栈编排（TECH-030 §2.4）：Docker 运行时探测 + compose 生命周期 + 健康探针。

角色定位（2026-10-11 用户拍板）：**平台 = 观测服务控制面** ——
  · 平台启动（`kb-pipeline serve`）时异步拉起观测栈（`OBS_AUTOSTART`，默认开）；
  · 平台退出时停止容器（`OBS_STOP_ON_EXIT`，默认开；**保留数据卷**；`--reload` 开发模式跳过）；
  · 编排一律发生在**后端进程内** —— 浏览器直跑与 Electron 壳跑行为完全一致（TECH-017 同哲学）。

状态机（前端状态卡按此映射文案）：
  disabled → docker_missing / daemon_down → starting → running（含 ready 标志）
                                                    ├─ 失败 → degraded / error
                                                    └─ 停止流程 → stopping → stopped

已知约束（TECH-030 §5）：
  · colima 冷启动 + 首次镜像拉取可达分钟级 → 全部走后台线程，绝不阻塞平台启动；
  · Docker Desktop 会注入宿主代理（TECH-007 §0），观测栈 compose 已有对策（init 容器清代理）；
  · 所有外部命令都有超时熔断；失败时保留输出尾部供界面展示与重试。

⚠️ compose 项目名固定为 `langfuse`（见 docker-compose.yml 顶部 `name:`）——数据卷按项目名
隔离（`langfuse_langfuse_pg…`），改名 = 旧数据（账号/项目/trace）全部"失联"，勿动。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from ..config import get_settings
from ..logger import get_logger

log = get_logger(__name__)

# 探测候选（多级兜底，同 agent_eval/runner.find_node 口径：平台服务可能以受限 PATH 启动）
DOCKER_CANDIDATES = [
    "/opt/homebrew/bin/docker",
    "/usr/local/bin/docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
]
COLIMA_CANDIDATES = ["/opt/homebrew/bin/colima", "/usr/local/bin/colima"]

HEALTH_TIMEOUT_S = 2.0
DAEMON_INFO_TIMEOUT_S = 10.0
DAEMON_START_TIMEOUT_S = 300.0   # colima start 冷启动（首次可能更久；超时给错误与重试入口）
DAEMON_WAIT_S = 30.0             # colima start 返回后，等 docker daemon 可用的轮询上限
DESKTOP_WAIT_S = 90.0            # Docker Desktop 唤起后的等待上限
COMPOSE_UP_TIMEOUT_S = 300.0
COMPOSE_STOP_TIMEOUT_S = 45.0
HEALTH_WAIT_S = 120.0            # compose up 后等 web 健康探针通过
PS_CACHE_S = 15.0                # compose ps 的结果缓存窗口


def _first_exist(cands: list[str]) -> str | None:
    for c in cands:
        if Path(c).is_file():
            return c
    return None


def find_docker() -> str | None:
    """定位 docker CLI（OBS_DOCKER_CLI 显式指定 > 常见安装路径 > PATH）。"""
    s = get_settings()
    if s.obs_docker_cli:
        p = Path(s.obs_docker_cli)
        return str(p) if p.is_file() else None
    return _first_exist(DOCKER_CANDIDATES) or shutil.which("docker")


def find_colima() -> str | None:
    return _first_exist(COLIMA_CANDIDATES) or shutil.which("colima")


def _run(cmd: list[str], timeout: float, env: dict | None = None) -> tuple[int, str]:
    """跑一条外部命令；**永不抛异常**（超时/缺失都转成返回码 + 文本，供状态机消费）。"""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
        out = ((proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")).strip()
        return proc.returncode, out
    except subprocess.TimeoutExpired as e:
        got = ""
        for stream in (e.stdout, e.stderr):
            if stream:
                got += stream if isinstance(stream, str) else stream.decode(errors="replace")
        return 124, f"命令超时（{timeout:.0f}s）: {' '.join(cmd[:3])}…\n{got.strip()}".strip()
    except FileNotFoundError:
        return 127, f"命令不存在：{cmd[0]}"
    except Exception as exc:  # noqa: BLE001
        return 1, f"命令失败：{exc}"


def probe_health(host: str, timeout: float = HEALTH_TIMEOUT_S) -> dict:
    """Langfuse 健康探针（无需密钥）。

    `/api/public/health` = web 存活；`/api/public/ready` = 迁移完成、可接受流量
    （官方 self-hosting 文档口径；web 健康刻意不带 DB 检查，ready 才有）。
    """
    import httpx

    base = (host or "http://localhost:3100").rstrip("/")
    result: dict = {"reachable": False, "ready": False, "version": None, "error": None}
    try:
        r = httpx.get(f"{base}/api/public/health", timeout=timeout)
        if r.status_code == 200:
            result["reachable"] = True
            try:
                body = r.json()
                result["version"] = (body or {}).get("version")
            except Exception:  # noqa: BLE001 - 探针不因响应体解析失败而失败
                pass
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)[:200]
        return result
    try:
        r2 = httpx.get(f"{base}/api/public/ready", timeout=timeout)
        result["ready"] = r2.status_code == 200
    except Exception:  # noqa: BLE001
        pass
    return result


class ObsStackManager:
    """观测栈单例（模块级 `OBS_STACK`）。状态读写全部持锁；编排在工作线程内进行。"""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._state = "unknown"
        self._detail = ""
        self._error: str | None = None
        self._busy = False                 # 有后台编排线程在跑（启动/停止）
        self._op: str | None = None        # 当前编排操作：start / stop（供前端按钮文案区分）
        self._containers: list[dict] = []
        self._last_ps = 0.0
        self._health: dict | None = None
        self._updated_at = time.time()
        self._last_refresh = 0.0
        self._started_by_platform = False

    # ── 配置定位（每次现算：改完 .env 热重载即生效）─────────────────────────

    def compose_file(self) -> Path:
        s = get_settings()
        if s.obs_compose_file:
            return Path(s.obs_compose_file)
        return Path(s.obs_unit_dir) / "langfuse" / "docker-compose.yml"

    def _compose_env(self) -> dict:
        """compose 插值变量（端口 / 访问地址）——compose 文件用 `${VAR:-default}` 消费。"""
        s = get_settings()
        env = dict(os.environ)
        env["OBS_LANGFUSE_PORT"] = str(s.obs_langfuse_port)
        env["OBS_LANGFUSE_PUBLIC_URL"] = s.obs_langfuse_public_url
        env["OBS_PG_PORT"] = str(s.obs_pg_port)
        return env

    # ── 状态读写 ────────────────────────────────────────────────────────────

    def _set(self, state: str, detail: str = "", error: str | None = None) -> None:
        with self._lock:
            self._state = state
            self._detail = detail
            self._error = error
            self._updated_at = time.time()

    def snapshot(self) -> dict:
        s = get_settings()
        with self._lock:
            return {
                "enabled": bool(s.obs_enabled),
                "autostart": bool(s.obs_autostart),
                "stop_on_exit": bool(s.obs_stop_on_exit),
                "state": self._state,
                "detail": self._detail,
                "error": self._error,
                "busy": self._busy,
                "op": self._op,
                "updated_at": self._updated_at,
                "started_by_platform": self._started_by_platform,
                "containers": list(self._containers),
                "health": dict(self._health) if self._health else None,
                "compose_file": str(self.compose_file()),
                "compose_exists": self.compose_file().is_file(),
                "unit_dir": str(s.obs_unit_dir),
                "public_url": s.obs_langfuse_public_url,
                "port": s.obs_langfuse_port,
            }

    # ── 启停编排（后台线程）─────────────────────────────────────────────────

    def _ensure_daemon(self) -> tuple[str | None, str | None]:
        """确保 docker daemon 可用。

        返回 `(docker_cli, error)`：
          · docker_cli 非空 = daemon 已就绪；
          · 否则 error 为人类可读的失败原因（状态已同步写入）。
        """
        docker = find_docker()
        if not docker:
            self._set("docker_missing", "未检测到 Docker（本机需要 colima 或 Docker Desktop）",
                      error="未找到 docker 命令；安装 colima：brew install colima")
            return None, self._error

        rc, _ = _run([docker, "info"], DAEMON_INFO_TIMEOUT_S)
        if rc == 0:
            return docker, None

        # daemon 未运行 → 尝试 colima → 再试 Docker Desktop → 否则给安装指引
        colima = find_colima()
        if colima:
            self._set("starting", "正在启动 Docker 虚拟机（colima start，冷启动可能需数十秒）…")
            rc2, out2 = _run([colima, "start"], DAEMON_START_TIMEOUT_S)
            # colima start 返回后 daemon 可能还需几秒才就绪 → 轮询
            deadline = time.time() + DAEMON_WAIT_S
            while time.time() < deadline:
                if _run([docker, "info"], DAEMON_INFO_TIMEOUT_S)[0] == 0:
                    return docker, None
                time.sleep(2)
            hint = out2[-600:] if out2 else ""
            self._set("daemon_down", "colima 已执行但 Docker 未就绪",
                      error=f"colima start（rc={rc2}）后等待 {DAEMON_WAIT_S:.0f}s 仍未连通。\n{hint}")
            return None, self._error

        dd = Path("/Applications/Docker.app")
        if dd.exists():
            self._set("starting", "正在唤起 Docker Desktop…")
            _run(["open", "-a", "Docker"], 15.0)
            deadline = time.time() + DESKTOP_WAIT_S
            while time.time() < deadline:
                if _run([docker, "info"], DAEMON_INFO_TIMEOUT_S)[0] == 0:
                    return docker, None
                time.sleep(3)
            self._set("daemon_down", "Docker Desktop 唤起后未就绪",
                      error=f"等待 {DESKTOP_WAIT_S:.0f}s 后 docker daemon 仍不可用")
            return None, self._error

        self._set("docker_missing", "未检测到 Docker 运行时",
                  error="本机未安装 colima / Docker Desktop。安装 colima 后重试：brew install colima && colima start")
        return None, self._error

    def _compose_cmd(self, docker: str, *args: str) -> list[str]:
        return [docker, "compose", "-f", str(self.compose_file()), *args]

    def _refresh_ps(self, docker: str, force: bool = False) -> None:
        with self._lock:
            if not force and time.time() - self._last_ps < PS_CACHE_S:
                return
        rc, out = _run(self._compose_cmd(docker, "ps", "--format", "json"), 20.0, env=self._compose_env())
        items: list[dict] = []
        if rc == 0 and out:
            text = out.strip()
            try:
                if text.startswith("["):
                    items = json.loads(text)
                else:  # 兼容按行 NDJSON 的 compose 版本
                    items = [json.loads(ln) for ln in text.splitlines() if ln.strip().startswith("{")]
            except Exception:  # noqa: BLE001 - ps 解析失败不影响主流程
                items = []
        if isinstance(items, list):
            with self._lock:
                self._containers = [
                    {
                        "service": str(it.get("Service") or ""),
                        "name": str(it.get("Name") or ""),
                        "state": str(it.get("State") or ""),
                        "status": str(it.get("Status") or ""),
                    }
                    for it in items if isinstance(it, dict)
                ]
                self._last_ps = time.time()

    def _wait_health(self, host: str, timeout_s: float = HEALTH_WAIT_S) -> dict:
        deadline = time.time() + timeout_s
        last: dict = {"reachable": False, "ready": False, "version": None, "error": None}
        while time.time() < deadline:
            last = probe_health(host)
            if last["reachable"]:
                return last
            time.sleep(3)
        return last

    def start(self) -> dict:
        """异步确保观测栈运行（幂等：已在运行则只刷新状态）。"""
        with self._lock:
            if self._busy:
                return self.snapshot()
            self._busy = True
            self._op = "start"
        threading.Thread(target=self._ensure_thread, name="obs-stack-start", daemon=True).start()
        return self.snapshot()

    def _ensure_thread(self) -> None:
        s = get_settings()
        if not s.obs_enabled:
            self._set("disabled", "观测域已关闭（OBS_ENABLED=0）")
            with self._lock:
                self._busy = False
                self._op = None
            return
        try:
            docker, err = self._ensure_daemon()
            if not docker:
                return
            compose = self.compose_file()
            if not compose.is_file():
                self._set("error", "观测运行单元缺失", error=f"compose 文件不存在：{compose}")
                return
            self._set("starting", "正在启动观测栈（docker compose up -d）…")
            rc, out = _run(
                self._compose_cmd(docker, "up", "-d"),
                COMPOSE_UP_TIMEOUT_S, env=self._compose_env(),
            )
            self._refresh_ps(docker, force=True)
            if rc != 0:
                # 失败时抓一段容器日志尾，比 compose 的聚合输出更可读
                tail = self._container_logs_tail(docker)
                self._set("degraded", "观测栈启动失败", error=((out[-800:] + "\n" + tail) if out else tail)[-1500:])
                return
            health = self._wait_health(s.langfuse_host)
            with self._lock:
                self._health = health
                self._started_by_platform = True
            if health["reachable"]:
                ready = "（就绪）" if health.get("ready") else "（web 已响应，迁移可能仍在进行）"
                self._set("running", f"观测栈运行中{ready}", error=None)
            else:
                self._set("degraded", "观测栈已拉起但健康探针未通过",
                          error=f"{s.langfuse_host}/api/public/health 无响应")
        except Exception as exc:  # noqa: BLE001 - 编排线程绝不让异常外逃
            log.warning("obs stack start failed: %s", exc)
            self._set("error", "观测栈启动异常", error=str(exc)[:500])
        finally:
            with self._lock:
                self._busy = False
                self._op = None

    def _container_logs_tail(self, docker: str, tail: int = 25) -> str:
        rc, out = _run(self._compose_cmd(docker, "logs", "--tail", str(tail), "--no-log-prefix"), 20.0,
                       env=self._compose_env())
        return out[-1200:] if rc in (0, 1) and out else ""

    def stop(self) -> dict:
        """异步停止观测栈（compose stop；保留容器与数据卷，下次启动极快）。"""
        with self._lock:
            if self._busy:
                return self.snapshot()
            self._busy = True
            self._op = "stop"
        threading.Thread(target=self._stop_thread, name="obs-stack-stop", daemon=True).start()
        return self.snapshot()

    def _stop_thread(self) -> None:
        try:
            docker = find_docker()
            if not docker:
                self._set("docker_missing", "未检测到 Docker")
                return
            if _run([docker, "info"], DAEMON_INFO_TIMEOUT_S)[0] != 0:
                self._set("daemon_down", "Docker 未运行（容器已随之停止）")
                return
            if not self.compose_file().is_file():
                self._set("error", "观测运行单元缺失", error=f"compose 文件不存在：{self.compose_file()}")
                return
            self._set("stopping", "正在停止观测栈（docker compose stop）…")
            rc, out = _run(self._compose_cmd(docker, "stop"), COMPOSE_STOP_TIMEOUT_S, env=self._compose_env())
            self._refresh_ps(docker, force=True)
            if rc != 0:
                self._set("degraded", "停止命令执行失败", error=out[-800:])
            else:
                self._set("stopped", "观测栈已停止（数据卷保留）")
        except Exception as exc:  # noqa: BLE001
            log.warning("obs stack stop failed: %s", exc)
            self._set("error", "停止观测栈异常", error=str(exc)[:500])
        finally:
            with self._lock:
                self._busy = False
                self._op = None

    # ── 轻量刷新（GET /status 驱动；带节流与时钟）──────────────────────────

    def refresh_if_stale(self, interval_s: float = 3.0) -> None:
        with self._lock:
            if self._busy or time.time() - self._last_refresh < interval_s:
                return
            self._last_refresh = time.time()
        threading.Thread(target=self._refresh_thread, name="obs-stack-refresh", daemon=True).start()

    def _refresh_thread(self) -> None:
        s = get_settings()
        try:
            if not s.obs_enabled:
                if self._state != "disabled":
                    self._set("disabled", "观测域已关闭（OBS_ENABLED=0）")
                return
            docker = find_docker()
            if not docker:
                self._set("docker_missing", "未检测到 Docker（本机需要 colima 或 Docker Desktop）")
                return
            if _run([docker, "info"], 6.0)[0] != 0:
                if self._state not in ("starting", "stopping"):
                    self._set("daemon_down", "Docker 未运行")
                return
            health = probe_health(s.langfuse_host)
            with self._lock:
                self._health = health
                state_now = self._state
            if health["reachable"]:
                if state_now != "running":
                    self._set("running", "观测栈运行中（web 已响应）")
                self._refresh_ps(docker)
            else:
                if state_now not in ("starting", "stopping"):
                    self._set("stopped", "Docker 已就绪，观测栈未运行（点击「启动观测服务」）")
                self._refresh_ps(docker)
        except Exception as exc:  # noqa: BLE001
            log.warning("obs stack refresh failed: %s", exc)

    # ── 平台生命周期 ────────────────────────────────────────────────────────

    def startup(self) -> None:
        """平台启动钩子（lifespan）：默认异步拉起观测栈；不阻塞平台可用。"""
        s = get_settings()
        if not s.obs_enabled:
            self._set("disabled", "观测域已关闭（OBS_ENABLED=0）")
            return
        if s.obs_autostart:
            log.info("obs: autostart ensuring langfuse stack (unit=%s)", s.obs_unit_dir)
            self.start()
        else:
            self.refresh_if_stale(0.0)

    def shutdown(self) -> None:
        """平台退出钩子：默认停容器（保留数据卷）。

        `--reload` 开发模式下跳过（代码一存盘 worker 就会重启，避免容器来回抖动）。
        """
        s = get_settings()
        if not s.obs_enabled or not s.obs_stop_on_exit:
            return
        if os.environ.get("KB_SERVE_RELOAD"):
            log.info("obs: reload mode, skip stop-on-exit")
            return
        with self._lock:
            state = self._state
        if state not in ("running", "degraded", "starting"):
            return
        docker = find_docker()
        if not docker or _run([docker, "info"], 6.0)[0] != 0:
            return
        log.info("obs: stopping langfuse stack on platform exit")
        _run(self._compose_cmd(docker, "stop"), COMPOSE_STOP_TIMEOUT_S, env=self._compose_env())


# 模块级单例（router 与 lifespan 共同消费）
OBS_STACK = ObsStackManager()
