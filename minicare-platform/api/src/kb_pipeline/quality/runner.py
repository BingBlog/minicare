"""检索质检运行调度器（PRD-011 US-03/US-04）：前置检查 + 后台线程 + 进度 + 中止。

与 Agent 测评调度器（`agent_eval/runner.py`）同范式，区别是**进程内执行**（无子进程）：
检索调用本身就在平台进程里，起线程即可；进度通过回调写入内存态，页面 2s 轮询。

并发：模块级单例 `RUNNER`，同一时间仅一个运行（PRD §11 决策 7）。
平台重启：`start()/precheck()` 时顺带做孤儿清扫（running → failed，保留已完成部分）。
"""
from __future__ import annotations

import threading
import time

from ..config import Settings, get_settings
from ..platform_db import PlatformDB
from ..regression import RegressionRunner, parse_scope, scope_label
from .ledger import RecallLedger


class QualityRunner:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict | None = None
        self._thread: threading.Thread | None = None
        self._swept = False

    # ── 依赖 ────────────────────────────────────────────────────────────

    @staticmethod
    def _settings() -> Settings:
        return get_settings()

    def _runner(self) -> RegressionRunner:
        s = self._settings()
        return RegressionRunner(s, PlatformDB(s.platform_cfg.db_path), s.platform_cfg.data_root)

    def _ledger(self) -> RecallLedger:
        return RecallLedger(PlatformDB(self._settings().platform_cfg.db_path))

    def _sweep_once(self) -> None:
        if self._swept:
            return
        self._swept = True
        try:
            self._ledger().sweep_orphans()
        except Exception:  # noqa: BLE001 - 清扫失败不阻塞主流程
            pass

    # ── 前置检查（US-03）───────────────────────────────────────────────

    def precheck(self, scope: str = "all") -> dict:
        self._sweep_once()
        chk = self._runner().precheck(scope)
        running = self._active is not None
        if running:
            a = self._active
            chk["issues"] = [*chk.get("issues", []),
                             f"已有质检运行进行中（{a['run_id']}，进度 {a['done']}/{a['total']}）"]
            chk["ok"] = False
        chk["running"] = running
        chk["active_run_id"] = (self._active or {}).get("run_id")
        return chk

    # ── 发起运行（US-03）───────────────────────────────────────────────

    def start(self, *, scope: str = "all", top_k: int | None = None,
              diag_depth: int | None = None) -> dict:
        parse_scope(scope)      # 非法 scope 立刻抛 ValueError（400）
        with self._lock:
            self._sweep_once()
            if self._active is not None:
                a = self._active
                raise RuntimeError(
                    f"已有质检运行进行中（{a['run_id']}，进度 {a['done']}/{a['total']}）"
                    "——等待其完成或先中止"
                )
            runner = self._runner()
            chk = runner.precheck(scope)
            if not chk["ok"]:
                raise RuntimeError("前置检查未通过：" + "；".join(chk["issues"]))

            s = self._settings()
            tk = int(top_k or 10)
            dd = max(int(diag_depth or s.regression_cfg.diag_depth), tk)
            # 预检已能算出范围内题数；运行内再取一次（保持单一来源）
            cases = runner.cases(scope)
            label = scope_label(scope, len(cases))
            run_id = runner._new_run_id()
            env = runner.build_env_snapshot(top_k=tk, diag_depth=dd, cases=cases,
                                            kb_count=chk.get("kb_count"))
            ledger = self._ledger()
            ledger.create_run(run_id=run_id, scope=scope, scope_label=label,
                              top_k=tk, diag_depth=dd, env_snapshot=env)

            self._active = {
                "run_id": run_id, "scope": scope, "scope_label": label,
                "status": "running", "done": 0, "total": len(cases),
                "current": None, "started_ms": int(time.time() * 1000),
                "recent": [], "cancel_requested": False,
            }
            self._thread = threading.Thread(
                target=self._worker, args=(run_id, scope, tk, dd), daemon=True)
            self._thread.start()
            return {"run_id": run_id, "scope": scope, "scope_label": label,
                    "case_count": len(cases)}

    # ── 进度 / 中止（US-04）────────────────────────────────────────────

    def progress(self, run_id: str) -> dict | None:
        a = self._active
        if a is None or a["run_id"] != run_id:
            run = self._ledger().get_run(run_id, with_cases=False)
            if not run:
                return None
            done = None
            if run["status"] in ("running",):
                done = self._ledger().db.query_one(
                    "SELECT COUNT(*) AS n FROM kb_recall_case_result WHERE run_id=?", (run_id,))
                done = int(done["n"]) if done else 0
            return {"run_id": run_id, "status": run["status"], "live": False,
                    "done": done, "total": None, "current": None,
                    "elapsed_ms": run["duration_ms"], "recent": []}
        return {
            "run_id": run_id, "status": a["status"], "live": True,
            "done": a["done"], "total": a["total"], "current": a["current"],
            "elapsed_ms": int(time.time() * 1000) - a["started_ms"],
            "recent": a["recent"][-8:],
        }

    def cancel(self, run_id: str) -> bool:
        with self._lock:
            a = self._active
            if a is None or a["run_id"] != run_id:
                return False
            a["cancel_requested"] = True
        return True

    def active_snapshot(self) -> dict | None:
        """首页「运行中」快照（只读；None = 无运行）。"""
        a = self._active
        if a is None:
            return None
        return {"run_id": a["run_id"], "scope_label": a["scope_label"],
                "done": a["done"], "total": a["total"], "current": a["current"]}

    # ── 工作线程 ────────────────────────────────────────────────────────

    def _worker(self, run_id: str, scope: str, top_k: int, diag_depth: int) -> None:
        runner = self._runner()
        ledger = self._ledger()

        def progress_cb(done: int, total: int, current: str | None, rec: dict | None) -> None:
            a = self._active
            if a is None or a["run_id"] != run_id:
                return
            a["done"] = done
            a["total"] = total
            a["current"] = current
            if rec is not None:
                a["recent"].append(rec)

        def cancel_check() -> bool:
            a = self._active
            return bool(a and a["run_id"] == run_id and a.get("cancel_requested"))

        try:
            result = runner.run(scope=scope, top_k=top_k, diag_depth=diag_depth,
                                run_id=run_id, ledger=ledger,
                                progress_cb=progress_cb, cancel_check=cancel_check)
            # gold_stale / not_executed 分支已在核心内 finish_run(status='failed')，
            # 这里把内存态收尾保持一致
            status = "failed" if result.get("status") in ("gold_stale", "not_executed", "failed") \
                else ("cancelled" if result.get("cancelled") else "completed")
            self._set_status(run_id, status)
        except Exception as e:  # noqa: BLE001 - 任何异常都落到台账，供页面排查
            try:
                led_run = ledger.get_run(run_id, with_cases=False)
                if led_run and led_run["status"] == "running":
                    ledger.finish_run(run_id, status="failed", error=f"运行异常：{e}")
                self._set_status(run_id, "failed")
            except Exception:  # noqa: BLE001
                pass

    def _set_status(self, run_id: str, status: str) -> None:
        with self._lock:
            a = self._active
            if a is not None and a["run_id"] == run_id:
                a["status"] = status
                # 终态后保留一小段内存快照（页面最后一次轮询能读到 done/total），随后释放
                self._active = None if status in ("completed", "cancelled", "failed") else a
                self._thread = None


RUNNER = QualityRunner()
