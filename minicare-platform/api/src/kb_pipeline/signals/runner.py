"""干跑子进程调度（TECH-029 §5.3 / S3）：同步模型 + 超时 + 输出归一化。

- 复用 ``agent_eval.runner`` 的 ``find_node`` / ``clean_child_env``（单一实现，勿复制）；
- 所有方法返回 dict（``ok`` + 失败摘要），不向上抛业务异常——路由层直接透传；
- 子进程 stdout 可能混有 dotenv tip 等噪音行，取「最后一个 JSON 行」为结果。
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from ..agent_eval.runner import clean_child_env, find_node
from ..config import REPO_ROOT

AGENT_DIR = REPO_ROOT / "minicare-agent"
TIMEOUTS = {"value": 30, "diff": 60, "assert": 120}


class SignalRunner:
    """同步执行 Node 干跑脚本（signal-dump / perception-diff / verify-*）。"""

    def _node(self) -> str:
        node = find_node()
        if not node:
            raise RuntimeError("未找到 node 可执行文件（find_node 兜底失败）")
        return node

    def _exec(self, args: list[str], timeout: int) -> tuple[int, str, str]:
        proc = subprocess.run(
            [self._node(), *args],
            cwd=str(AGENT_DIR),
            env=clean_child_env(),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, proc.stdout or "", proc.stderr or ""

    @staticmethod
    def _last_json(stdout: str) -> dict | None:
        lines = [l for l in stdout.splitlines() if l.strip().startswith("{")]
        if not lines:
            return None
        try:
            return json.loads(lines[-1])
        except json.JSONDecodeError:
            return None

    def _call(self, kind: str, args: list[str]) -> dict:
        try:
            code, stdout, stderr = self._exec(args, TIMEOUTS[kind])
        except subprocess.TimeoutExpired:
            return {"ok": False, "stage": kind, "error": f"超时（>{TIMEOUTS[kind]}s），可重试"}
        except RuntimeError as e:
            return {"ok": False, "stage": kind, "error": str(e)}
        payload = self._last_json(stdout)
        if payload is None:
            return {
                "ok": False,
                "stage": kind,
                "error": "子进程无 JSON 输出",
                "exit": code,
                "stderr_tail": stderr[-500:],
            }
        return payload

    # ── 单信号实测（US-02「跑一遍」）────────────────────────────────
    def value(self, key: str, baby: str, datasource: str = "dev", config_file: str | None = None) -> dict:
        args = ["scripts/signal-dump.mjs", f"--baby={baby}", f"--key={key}"]
        if datasource == "prod":
            args.append("--prod")
        if config_file:
            args.append(f"--config={config_file}")
        return self._call("value", args)

    # ── 改前/改后对比（US-06 干跑）──────────────────────────────────
    def diff(self, baby: str, datasource: str = "dev", config_file: str | None = None) -> dict:
        args = ["scripts/perception-diff.mjs", f"--baby={baby}"]
        if datasource == "prod":
            args.append("--prod")
        if config_file:
            args.append(f"--config={config_file}")
        return self._call("diff", args)

    # ── 全量信号实测（US-01 表格「实测值」列）───────────────────────
    def value_all(self, baby: str, datasource: str = "dev", config_file: str | None = None) -> dict:
        args = ["scripts/signals-all.mjs", f"--baby={baby}"]
        if datasource == "prod":
            args.append("--prod")
        if config_file:
            args.append(f"--config={config_file}")
        return self._call("diff", args)  # 全量跑比单信号久，用 diff 档超时（60s）

    # ── 词表试跑（US-05）：归一化 + 归类 + 高致敏命中 ────────────────
    def wordlist_try(self, foods: list[str], config_file: str | None = None) -> dict:
        joined = "、".join([f for f in foods if str(f).strip()])
        args = ["scripts/wordlist-try.mjs", f"--foods={joined}"]
        if config_file:
            args.append(f"--config={config_file}")
        return self._call("value", args)

    # ── 断言集（US-07 发布步骤②）───────────────────────────────────
    def assert_all(self, config_file: str | None = None) -> dict:
        """三套断言串行：
        verify-signals（结构/一致性/兜底——固定读磁盘真源）
        verify-perception / verify-profile（行为层——草稿提供时以草稿配置运行）
        """
        scripts = [
            ("verify-signals.mjs", None),
            ("verify-perception.mjs", config_file),
            ("verify-profile.mjs", config_file),
        ]
        results = []
        total_fails = 0
        total_passes = 0
        for script, cfg in scripts:
            args = [f"scripts/{script}"]
            if cfg:
                args.append(f"--config-file={cfg}")
            try:
                code, stdout, stderr = self._exec(args, TIMEOUTS["assert"])
                fails = [l.strip() for l in stdout.splitlines() if l.strip().startswith("FAIL")]
                summary_line = next(
                    (l.strip() for l in reversed(stdout.splitlines()) if "PASS" in l and "FAIL" in l),
                    "",
                )
                # 解析「结果: N PASS / M FAIL」
                n_pass = n_fail = 0
                if summary_line:
                    import re

                    m = re.search(r"(\d+)\s*PASS\s*/\s*(\d+)\s*FAIL", summary_line)
                    if m:
                        n_pass, n_fail = int(m.group(1)), int(m.group(2))
                passed = code == 0 and not fails
                total_fails += n_fail if summary_line else len(fails)
                total_passes += n_pass
                results.append(
                    {
                        "script": script,
                        "passed": passed,
                        "exit": code,
                        "passCount": n_pass,
                        "failCount": n_fail if summary_line else len(fails),
                        "fails": fails[:20],
                        "stderrTail": (stderr[-400:] if code != 0 and not fails else ""),
                    }
                )
            except subprocess.TimeoutExpired:
                total_fails += 1
                results.append(
                    {
                        "script": script,
                        "passed": False,
                        "exit": None,
                        "passCount": 0,
                        "failCount": 1,
                        "fails": [f"超时（>{TIMEOUTS['assert']}s）"],
                        "stderrTail": "",
                    }
                )
        return {
            "ok": total_fails == 0,
            "totalPasses": total_passes,
            "totalFails": total_fails,
            "scripts": results,
        }


def check_config_file(config_file: str | None) -> str | None:
    """路由层入参守卫：草稿文件必须存在（不存在直接 400，避免静默跑基线）。"""
    if not config_file:
        return None
    p = Path(config_file)
    if not p.is_file():
        raise ValueError(f"草稿文件不存在：{config_file}")
    return str(p)
