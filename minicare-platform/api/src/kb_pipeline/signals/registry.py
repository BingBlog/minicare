"""信号注册表解析与配置视图（TECH-029 §3 / S3）。

数据源（只读）：
  minicare-agent/config/registry.yaml —— 结构真源（组 / 信号 / flag / 参数元数据）
  minicare-agent/config/signals.yaml  —— 值真源（当前生效值）

设计：**不做进程内缓存**——单用户场景下 YAML 解析成本可忽略（毫秒级），
每次请求读盘保证「外部修改（手工编辑 / git pull）即时可见」，
这也是后续「外部变更检测」（US-08）的天然基础。
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import yaml

from ..config import REPO_ROOT

AGENT_DIR = REPO_ROOT / "minicare-agent"
REGISTRY_PATH = AGENT_DIR / "config" / "registry.yaml"
SIGNALS_PATH = AGENT_DIR / "config" / "signals.yaml"

GROUP_LABEL = {
    "ref": "参考值",
    "threshold": "新鲜度与派生阈值",
    "throttle": "提醒频控",
    "wordlist": "词表",
    "inject": "总开关",
    "flag_switch": "提醒开关",
    "flag_strength": "提醒强度",
}

STRENGTH_LABEL = {"strong": "强", "medium": "中", "weak": "弱", "intercept": "拦截"}


def file_fingerprint(p: Path) -> str | None:
    """文件指纹（sha256 前 16 位）；不存在返回 None。"""
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()[:16]
    except OSError:
        return None


def _read_yaml(p: Path) -> tuple[dict | None, str | None]:
    """返回 (doc, error)；解析失败给中文摘要（不抛异常）。"""
    if not p.is_file():
        return None, f"文件不存在：{p}"
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        return None, f"YAML 解析失败：{str(e)[:200]}"
    if not isinstance(doc, dict):
        return None, f"内容为空或非对象：{p}"
    return doc, None


class SignalRegistry:
    """一次实例化 = 一次读盘快照（给单次请求用；勿跨请求复用）。"""

    def __init__(self) -> None:
        self.registry, self.registry_error = _read_yaml(REGISTRY_PATH)
        self.signals, self.signals_error = _read_yaml(SIGNALS_PATH)

    def _values(self) -> dict:
        return (self.signals or {}).get("values") or {}

    # ── US-01 信号图谱 ──────────────────────────────────────────────
    def overview(self) -> dict:
        reg = self.registry or {}
        groups: list[dict] = []
        total_signals = 0
        degraded_groups = 0
        for g in reg.get("groups", []) or []:
            sigs = g.get("signals", []) or []
            active = [s for s in sigs if s.get("status") == "active"]
            total = len(sigs)
            total_signals += total
            if total and len(active) < total:
                degraded_groups += 1
            groups.append(
                {
                    "id": g.get("id"),
                    "name": g.get("name"),
                    "scope": g.get("scope"),
                    "signalCount": total,
                    "activeCount": len(active),
                    "note": g.get("note"),
                    # 组内信号明细（US-01 下钻 → US-02 详情用；字段与 registry.yaml 逐项对应）
                    "signals": [
                        {
                            "id": s.get("id"),
                            "name": s.get("name"),
                            "layer": s.get("layer"),
                            "caliber": s.get("caliber"),
                            "source": s.get("source"),
                            "params": s.get("params") or [],
                            "evidence": s.get("evidence"),
                            "status": s.get("status"),
                            "statusNote": s.get("status_note") or "",
                        }
                        for s in sigs
                    ],
                }
            )
        vflags = self._values().get("flags") or {}
        flags = []
        for f in reg.get("flags", []) or []:
            fc = vflags.get(f.get("key")) or {}
            flags.append(
                {
                    "key": f.get("key"),
                    "name": f.get("name"),
                    "triggerDesc": f.get("trigger_desc"),
                    "strength": fc.get("strength") or f.get("default_strength"),
                    "strengthLabel": STRENGTH_LABEL.get(fc.get("strength") or f.get("default_strength"), ""),
                    "enabled": fc.get("enabled", True),
                    "origin": f.get("origin"),
                    "evidence": f.get("evidence"),
                }
            )
        params = reg.get("params", []) or []
        changed = self._changed_keys()
        return {
            "stats": {
                "groups": len(groups),
                "signals": total_signals,
                "flags": len(flags),
                "params": len(params),
                "configRows": len(params) + len(flags) * 2,
                "degradedGroups": degraded_groups,
                "changedParams": len(changed),
            },
            "groups": groups,
            "flags": flags,
            "params": params,
            "reverseIndex": self._reverse_index(),
            "groupLabels": GROUP_LABEL,
            "errors": [e for e in (self.registry_error, self.signals_error) if e],
        }

    def _changed_keys(self) -> list[str]:
        """当前值 ≠ 默认值的参数键（词表类默认以代码内置为准，不参与对比）。"""
        reg = self.registry or {}
        values = self._values()
        out = []
        for p in reg.get("params", []) or []:
            key = p.get("key")
            default = p.get("default")
            if default is None:
                continue
            if key in values and values.get(key) != default:
                out.append(key)
        vflags = values.get("flags") or {}
        for f in reg.get("flags", []) or []:
            fc = vflags.get(f.get("key")) or {}
            if fc.get("enabled") is False or (
                fc.get("strength") and fc.get("strength") != f.get("default_strength")
            ):
                out.append(f"flag.{f.get('key')}")
        return out

    def _reverse_index(self) -> dict:
        """参数键 → 引用它的信号 / flag（US-03 影响面提示）。"""
        idx: dict[str, dict] = {}
        reg = self.registry or {}

        def slot(k):
            return idx.setdefault(k, {"signals": [], "flags": []})

        for g in reg.get("groups", []) or []:
            for s in g.get("signals", []) or []:
                for pkey in s.get("params", []) or []:
                    slot(pkey)["signals"].append(
                        {"id": s.get("id"), "name": s.get("name"), "group": g.get("id")}
                    )
        for f in reg.get("flags", []) or []:
            for pkey in f.get("params", []) or []:
                slot(pkey)["flags"].append({"key": f.get("key"), "name": f.get("name")})
        return idx

    # ── US-03 配置清单（58 行视图）──────────────────────────────────
    def config_items(self) -> dict:
        reg = self.registry or {}
        values = self._values()
        vflags = values.get("flags") or {}
        items: list[dict] = []

        for p in reg.get("params", []) or []:
            key = p.get("key")
            default = p.get("default")
            current = values.get(key, default if default is not None else None)
            changed = default is not None and current is not None and current != default
            items.append(
                {
                    "key": key,
                    "name": p.get("name"),
                    "group": p.get("group"),
                    "type": p.get("type"),
                    "unit": p.get("unit") or "",
                    "range": p.get("range") or [],
                    "presets": p.get("presets") or [],
                    "current": current,
                    "default": default,  # null = 以代码内置为准（词表类）
                    "status": "changed" if changed else "default",
                    "medical": bool(p.get("medical")),
                    "evidence": p.get("evidence"),
                    "note": p.get("note") or "",
                    "isFlag": False,
                }
            )

        for f in reg.get("flags", []) or []:
            key = f.get("key")
            fc = vflags.get(key) or {}
            enabled = fc.get("enabled", True)
            items.append(
                {
                    "key": f"flag.{key}.enabled",
                    "name": f"{f.get('name')} · 开关",
                    "group": "flag_switch",
                    "type": "bool",
                    "unit": "",
                    "range": [],
                    "presets": [],
                    "current": enabled,
                    "default": True,
                    "status": "changed" if enabled is False else "default",
                    "medical": False,
                    "evidence": f.get("evidence"),
                    "note": f.get("trigger_desc") or "",
                    "isFlag": True,
                    "flagKey": key,
                }
            )
            cur_s = fc.get("strength") or f.get("default_strength")
            items.append(
                {
                    "key": f"flag.{key}.strength",
                    "name": f"{f.get('name')} · 强度",
                    "group": "flag_strength",
                    "type": "enum",
                    "unit": "",
                    "range": [],
                    "presets": ["strong", "medium", "weak", "intercept"],
                    "current": cur_s,
                    "default": f.get("default_strength"),
                    "status": "changed" if cur_s != f.get("default_strength") else "default",
                    "medical": False,
                    "evidence": f.get("evidence"),
                    "note": f"强度中文：{STRENGTH_LABEL.get(cur_s, cur_s)}",
                    "isFlag": True,
                    "flagKey": key,
                }
            )

        return {
            "items": items,
            "count": len(items),
            "groupLabels": GROUP_LABEL,
            "errors": [e for e in (self.registry_error, self.signals_error) if e],
        }

    # ── 文件健康（US-08 外部变更检测的基础）──────────────────────────
    def health(self) -> dict:
        rv = (self.registry or {}).get("schema_version")
        sv = (self.signals or {}).get("schema_version")
        files = [
            {
                "path": str(REGISTRY_PATH),
                "exists": REGISTRY_PATH.is_file(),
                "fingerprint": file_fingerprint(REGISTRY_PATH),
                "error": self.registry_error,
            },
            {
                "path": str(SIGNALS_PATH),
                "exists": SIGNALS_PATH.is_file(),
                "fingerprint": file_fingerprint(SIGNALS_PATH),
                "error": self.signals_error,
            },
        ]
        schema_ok = rv is not None and rv == sv
        return {
            "ok": not self.registry_error and not self.signals_error and schema_ok,
            "files": files,
            "schema": {"registry": rv, "signals": sv, "compatible": schema_ok},
        }
