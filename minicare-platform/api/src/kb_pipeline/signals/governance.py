"""草稿与治理（TECH-029 §5.4；S5 草稿生命周期 + S6 发布流 + S7 版本/回滚/审计/复审）。

- 草稿 = 相对当前 signals.yaml 的一组覆盖项（key → newValue + 「为什么改」理由），
  只存平台数据库（signal_draft 单行），**对 agent 零影响**；
- 保存时做三层校验：结构（必填/去重）→ 类型/范围/枚举（对照注册表）→ 跨项逻辑（合并视图）；
- 每次保存/丢弃写审计（signal_audit）；
- 基线指纹（signals.yaml 的 sha256 前 16 位）用于「外部改动漂移」提示；
- **发布（S6）**：草稿重验 → 基线检查（防覆盖平台外改动）→ 断言（runner 三套）→
  ruamel 写回（保注释）→ 备份（保留 20 份）→ 快照（YYYY-MM-DD.N）→ 清草稿 → 审计；
  断言失败默认阻塞，强制发布需理由（记 force_publish）。
- **版本与回滚（S7 / US-08）**：快照即版本（平台库为权威、备份文件为冗余）；回滚 = 重建目标版本
  完整值 → 等值变更项 → 复用发布全流程；外部变更（指纹漂移）可「登记为新快照」或「恢复最近快照」。
- **复审与审计（S7 / US-09）**：医学参数按周期（默认 180 天，可调、受审计）复审留痕；全部动作进
  signal_audit（只追加，不删除、不可编辑）。
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path

import yaml as _pyyaml
from ruamel.yaml import YAML

from ..config import get_settings
from ..platform_db import PlatformDB
from .registry import REGISTRY_PATH, SIGNALS_PATH, file_fingerprint, _read_yaml

REASON_MIN = 10  # 「为什么改」最少字数（PRD-014 US-04）
STRENGTHS = ("strong", "medium", "weak", "intercept")
MAX_BACKUPS = 20
DEFAULT_REVIEW_CYCLE_DAYS = 180  # 复审周期默认（对齐 CDSS「更新周期不长于半年」，PRD-014 US-09）
REVIEW_CYCLE_RANGE = (30, 730)   # 复审周期可调范围（天）


class PublishBlocked(ValueError):
    """发布被断言失败阻塞：failed 为失败明细列表（路由层映射 400，可强制发布）。"""

    def __init__(self, failed: list[str]) -> None:
        self.failed = failed
        super().__init__(f"断言失败 {len(failed)} 项")


def _backup_dir() -> Path:
    d = Path(get_settings().platform_cfg.data_root).resolve() / "signals_backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _drafts_dir() -> Path:
    d = Path(get_settings().platform_cfg.data_root).resolve() / "signals" / "drafts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cleanup_dir(d: Path, pattern: str, max_age_s: int) -> None:
    now = time.time()
    for f in d.glob(pattern):
        try:
            if now - f.stat().st_mtime > max_age_s:
                f.unlink()
        except OSError:
            continue


def _plain(v):
    """ruamel CommentedMap/Seq → 原生 dict/list（json 序列化前用）。"""
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    return v


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class DraftError(ValueError):
    """校验失败：errors 为逐项明细 [{key, error}]（路由层映射为 400）。"""

    def __init__(self, errors: list[dict]) -> None:
        self.errors = errors
        super().__init__(f"{len(errors)} 项校验未通过")


def _is_bool(v) -> bool:
    return isinstance(v, bool)


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


class SignalGovernance:
    def __init__(self, db: PlatformDB) -> None:
        self.db = db

    # ── 读取 ──────────────────────────────────────────────────────
    def get_draft(self) -> dict:
        row = self.db.query_one("SELECT content, updated_at FROM signal_draft WHERE id = 1")
        draft = json.loads(row["content"]) if row else None
        fp = file_fingerprint(SIGNALS_PATH)
        drift = bool(
            draft
            and draft.get("baseFingerprint")
            and fp
            and draft["baseFingerprint"] != fp
        )
        return {
            "draft": draft,
            "baseline": {"fingerprint": fp, "drift": drift},
        }

    # ── 保存（全量替换语义：items 即草稿全集）──────────────────────
    def save_draft(self, items: list[dict] | None) -> dict:
        items = items or []
        if not isinstance(items, list):
            raise DraftError([{"key": "", "error": "items 必须是数组"}])
        errors = self._validate_items(items)
        if errors:
            raise DraftError(errors)
        now = _now()
        content = {
            "items": items,
            "baseFingerprint": file_fingerprint(SIGNALS_PATH),
            "updatedAt": now,
        }
        self.db.execute(
            "INSERT INTO signal_draft(id, content, updated_at) VALUES(1, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
            (json.dumps(content, ensure_ascii=False), now),
        )
        self._audit("draft_save", None, None, json.dumps([i.get("key") for i in items], ensure_ascii=False), None)
        warnings = []
        if content["baseFingerprint"]:
            warnings.append("草稿已存。发布前将自动复核基线指纹（外部改动会提示漂移）。")
        return {"ok": True, "draft": content, "warnings": warnings}

    def discard_draft(self) -> dict:
        self.db.execute("DELETE FROM signal_draft WHERE id = 1")
        self._audit("draft_discard", None, None, None, None)
        return {"ok": True}

    # ── 校验（三层）───────────────────────────────────────────────
    def _validate_items(self, items: list[dict]) -> list[dict]:
        errors: list[dict] = []
        reg, _ = _read_yaml(REGISTRY_PATH)
        params = {p.get("key"): p for p in (reg or {}).get("params", []) or []}
        flags = {f.get("key"): f for f in (reg or {}).get("flags", []) or []}
        seen: set[str] = set()
        for it in items:
            if not isinstance(it, dict):
                errors.append({"key": "", "error": "item 必须是对象"})
                continue
            key = (it.get("key") or "").strip()
            if not key:
                errors.append({"key": "", "error": "缺少 key"})
                continue
            if key in seen:
                errors.append({"key": key, "error": "重复项"})
                continue
            seen.add(key)
            reason = str(it.get("reason") or "").strip()
            if len(reason) < REASON_MIN:
                errors.append({"key": key, "error": f"「为什么改」至少 {REASON_MIN} 字"})
            val = it.get("newValue")
            if key.startswith("flag."):
                errors.extend(self._validate_flag(key, val, flags))
                continue
            p = params.get(key)
            if not p:
                errors.append({"key": key, "error": "未知参数（不在注册表内）"})
                continue
            errors.extend(self._validate_param(key, val, p))
        # 跨项逻辑：以「当前值 ⊕ 草稿」的合并视图判定
        if not errors:
            merged = self._merged_view(items, reg)
            if _is_num(merged.get("maintainPerWeek")) and _is_num(merged.get("maintainPerWeekMax")):
                if merged["maintainPerWeek"] > merged["maintainPerWeekMax"]:
                    errors.append({"key": "maintainPerWeek", "error": "维持暴露下限不能大于上限"})
            if _is_num(merged.get("stageMinDays")) and _is_num(merged.get("stageStableDays")):
                if merged["stageMinDays"] > merged["stageStableDays"]:
                    errors.append({"key": "stageMinDays", "error": "阶内硬下限不能大于稳定参考天数"})
        return errors

    def _validate_param(self, key: str, val, p: dict) -> list[dict]:
        t = p.get("type")
        name = p.get("name") or key
        if t == "int":
            if not (isinstance(val, int) and not _is_bool(val)):
                return [{"key": key, "error": f"{name}：必须是整数"}]
        elif t == "float":
            if not _is_num(val):
                return [{"key": key, "error": f"{name}：必须是数值"}]
        elif t == "bool":
            if not _is_bool(val):
                return [{"key": key, "error": f"{name}：必须是布尔（开/关）"}]
        elif t == "list":
            if not isinstance(val, list):
                return [{"key": key, "error": f"{name}：必须是列表"}]
        elif t == "object":
            if not isinstance(val, dict):
                return [{"key": key, "error": f"{name}：必须是对象"}]
        rng = p.get("range") or []
        if len(rng) == 2 and _is_num(val):
            if val < rng[0] or val > rng[1]:
                unit = p.get("unit") or ""
                return [{"key": key, "error": f"{name}：超出范围 [{rng[0]}, {rng[1]}]{unit}"}]
        return []

    def _validate_flag(self, key: str, val, flags: dict) -> list[dict]:
        parts = key.split(".")
        if len(parts) != 3 or parts[1] not in flags:
            return [{"key": key, "error": "未知 flag（不在注册表内）"}]
        field = parts[2]
        if field == "enabled":
            if not _is_bool(val):
                return [{"key": key, "error": "开关必须是布尔（开/关）"}]
        elif field == "strength":
            if val not in STRENGTHS:
                return [{"key": key, "error": "强度只支持 strong / medium / weak / intercept"}]
        else:
            return [{"key": key, "error": "未知 flag 字段（仅 enabled / strength）"}]
        return []

    def _merged_view(self, items: list[dict], reg: dict | None) -> dict:
        """当前 signals 值 ⊕ 草稿覆盖 → 扁平视图（跨项校验用）。"""
        sig, _ = _read_yaml(SIGNALS_PATH)
        values = dict((sig or {}).get("values") or {})
        vflags = dict(values.get("flags") or {})
        for it in items:
            key = it.get("key") or ""
            if key.startswith("flag."):
                parts = key.split(".")
                fc = dict(vflags.get(parts[1]) or {})
                fc[parts[2]] = it.get("newValue")
                vflags[parts[1]] = fc
            else:
                values[key] = it.get("newValue")
        values["flags"] = vflags
        return values

    def _audit(self, action: str, key: str | None, before, after, reason) -> None:
        self.db.execute(
            "INSERT INTO signal_audit(ts, action, object_key, before, after, reason) VALUES(?,?,?,?,?,?)",
            (_now(), action, key, before, after, reason),
        )

    # ══ 发布（S6 / US-07）══════════════════════════════════════════

    def materialize_draft(self, items: list[dict] | None = None) -> Path:
        """草稿物化为完整配置临时文件（当前 signals.yaml values ⊕ items）。

        供「干跑对比」与「发布断言」共用；返回**绝对路径**（T-R7：传给子进程必须绝对化）。
        """
        if items is None:
            row = self.db.query_one("SELECT content FROM signal_draft WHERE id = 1")
            items = (json.loads(row["content"]).get("items") or []) if row else []
        sig, err = _read_yaml(SIGNALS_PATH)
        if err or not sig:
            raise DraftError([{"key": "", "error": f"signals.yaml 不可读：{err or '空文件'}"}])
        values = dict(sig.get("values") or {})
        vflags = dict(values.get("flags") or {})
        for it in items:
            key = str(it.get("key") or "").strip()
            if key.startswith("flag."):
                parts = key.split(".")
                fc = dict(vflags.get(parts[1]) or {})
                fc[parts[2]] = _plain(it.get("newValue"))
                vflags[parts[1]] = fc
            else:
                values[key] = _plain(it.get("newValue"))
        values["flags"] = vflags
        content = {
            "schema_version": sig.get("schema_version", 1),
            "source": "platform/draft（草稿物化，用后即清理）",
            "values": values,
        }
        d = _drafts_dir()
        _cleanup_dir(d, "draft-*.yaml", 86400)
        p = d / f"draft-{int(time.time() * 1000)}.yaml"
        p.write_text(_pyyaml.safe_dump(content, allow_unicode=True, sort_keys=False), encoding="utf-8")
        return p.resolve()

    def publish(self, force: bool = False, force_reason: str = "") -> dict:
        """发布流：重验 → 基线检查 → 断言 → 写回 + 备份 + 快照 + 审计。

        - 断言失败且非 force → 抛 PublishBlocked（失败明细）；
        - force 必须带 force_reason（记 force_publish 审计、快照标 forced=1）；
        - 基线指纹不一致（平台外改动）→ 阻断（防静默覆盖）。
        """
        from .runner import SignalRunner  # 延迟 import（governance 不预设 runner 依赖）

        row = self.db.query_one("SELECT content FROM signal_draft WHERE id = 1")
        if not row:
            raise DraftError([{"key": "", "error": "没有待发布的修改（草稿为空）"}])
        draft = json.loads(row["content"])
        items = draft.get("items") or []
        errors = self._validate_items(items)
        if errors:
            raise DraftError(errors)
        fp = file_fingerprint(SIGNALS_PATH)
        if draft.get("baseFingerprint") and fp and draft["baseFingerprint"] != fp:
            raise DraftError(
                [{"key": "", "error": "signals.yaml 已被平台外修改，为防覆盖已阻止发布——请在「配置清单」重新载入并保存草稿后再试"}]
            )
        if force and not (force_reason or "").strip():
            raise DraftError([{"key": "", "error": "强制发布必须填写理由"}])

        # 断言（草稿物化后跑三套 verify）
        draft_file = self.materialize_draft(items)
        assert_res = SignalRunner().assert_all(str(draft_file))
        if not assert_res.get("ok") and not force:
            failed: list[str] = []
            for sc in assert_res.get("scripts", []):
                for f in sc.get("fails") or []:
                    failed.append(f"[{sc.get('script')}] {f}")
            raise PublishBlocked(failed or ["断言未通过（无明细，请手动运行断言排查）"])

        return self._write_back(
            items,
            reason_summary=self._reason_summary(items),
            force=force,
            force_reason=force_reason,
            assert_res=assert_res,
        )

    @staticmethod
    def _reason_summary(items: list[dict]) -> str:
        rs = [str(i.get("reason") or "").strip() for i in items if str(i.get("reason") or "").strip()]
        return "；".join(rs)[:300]

    @staticmethod
    def _flat_values(doc) -> dict:
        """展平为 {key: value}（含 flag.{k}.enabled/strength），供值级 diff。"""
        values = dict(doc.get("values") or {})
        out = {k: _plain(v) for k, v in values.items() if k != "flags"}
        for fk, fc in (values.get("flags") or {}).items():
            fc = _plain(fc) or {}
            for field in ("enabled", "strength"):
                if field in fc:
                    out[f"flag.{fk}.{field}"] = fc[field]
        return out

    def _next_version(self) -> str:
        today = _now()[:10]
        rows = self.db.query("SELECT version FROM signal_snapshot WHERE version LIKE ?", (f"{today}.%",))
        return f"{today}.{len(rows) + 1}"

    @staticmethod
    def _git_hint(diff: list[dict]) -> str:
        keys = [d["key"] for d in diff][:3]
        more = "…" if len(diff) > 3 else ""
        return f"feat(signals): 调整 {', '.join(keys)}{more}（{len(diff)} 项）"

    def _trim_backups(self) -> None:
        files = sorted(_backup_dir().glob("signals-*.yaml"), key=lambda f: f.stat().st_mtime, reverse=True)
        for f in files[MAX_BACKUPS:]:
            try:
                f.unlink()
            except OSError:
                continue

    def _write_back(self, items, reason_summary, force, force_reason, assert_res,
                    audit_action: str | None = None, audit_key: str | None = None,
                    supersede_status: str = "superseded") -> dict:
        ryml = YAML()
        ryml.preserve_quotes = True
        doc = ryml.load(SIGNALS_PATH.read_text(encoding="utf-8"))
        before = self._flat_values(doc)

        version = self._next_version()
        values = doc["values"]
        for it in items:
            key = str(it.get("key") or "").strip()
            if key.startswith("flag."):
                parts = key.split(".")
                fc = values["flags"].get(parts[1]) or {}
                fc[parts[2]] = _plain(it.get("newValue"))
                values["flags"][parts[1]] = fc
            else:
                values[key] = _plain(it.get("newValue"))
        doc["updated_at"] = _now()[:10]
        doc["source"] = f"minicare-platform / {version}"
        after = self._flat_values(doc)
        diff = [
            {"key": k, "before": before.get(k), "after": after.get(k)}
            for k in sorted(set(before) | set(after))
            if json.dumps(before.get(k), ensure_ascii=False) != json.dumps(after.get(k), ensure_ascii=False)
        ]

        # 备份 + 原子写（失败自动保持原文件）
        original = SIGNALS_PATH.read_text(encoding="utf-8")
        backup = _backup_dir() / f"signals-{version}.yaml"
        backup.write_text(original, encoding="utf-8")
        self._trim_backups()
        tmp = SIGNALS_PATH.with_suffix(".yaml.tmp")
        try:
            with tmp.open("w", encoding="utf-8") as f:
                ryml.dump(doc, f)
            os.replace(tmp, SIGNALS_PATH)
        except OSError:
            # 写失败：清理临时文件，原文件未动（os.replace 前失败即原状；replace 后异常也无残留）
            try:
                tmp.unlink()
            except OSError:
                pass
            raise
        new_fp = file_fingerprint(SIGNALS_PATH)

        # 快照 + 清草稿 + 审计
        self.db.execute("UPDATE signal_snapshot SET status = ? WHERE status = 'current'", (supersede_status,))
        self.db.execute(
            "INSERT INTO signal_snapshot(version, created_at, reason, diff, file_fingerprint, status, forced)"
            " VALUES(?,?,?,?,?,?,?)",
            (version, _now(), reason_summary, json.dumps(diff, ensure_ascii=False), new_fp, "current", 1 if force else 0),
        )
        self.db.execute("DELETE FROM signal_draft WHERE id = 1")
        audit_reason = reason_summary + (f"｜强制发布理由：{force_reason.strip()}" if force else "")
        self._audit(
            audit_action or ("force_publish" if force else "publish"),
            audit_key or version,
            json.dumps(before, ensure_ascii=False)[:1500],
            json.dumps(after, ensure_ascii=False)[:1500],
            audit_reason,
        )

        git_hint = self._git_hint(diff)
        return {
            "ok": True,
            "version": version,
            "diff": diff,
            "forced": bool(force),
            "assert": {
                "totalPasses": assert_res.get("totalPasses"),
                "totalFails": assert_res.get("totalFails"),
            },
            "gitHint": git_hint,
            "checklist": [
                f"提交配置改动（建议提交信息：{git_hint}）",
                "部署 minicare-agent —— 配置随下次部署生效（页面显示「待部署」属正常）",
                "部署后到「版本与审计」页点「确认已生效」，再到「信号总览」用生产只读核对一次",
            ],
        }

    # ══ 版本 / 回滚（S7 / US-08）═══════════════════════════════════

    def _latest_snapshot(self) -> dict | None:
        return self.db.query_one(
            "SELECT version, created_at, file_fingerprint, status FROM signal_snapshot ORDER BY version DESC LIMIT 1"
        )

    def _version_full_values(self, version: str, allow_reverse: bool = True) -> dict:
        """重建「某版本发布后」的完整扁平值（键与 signals.yaml 展平口径一致）。

        路径 A（备份，首选）：``signals-{version}.yaml`` 是发布该版时的原文（即发布前状态），
        把该版 diff 的 after 全量应用即得发布后完整值；不依赖当前文件是否被外改。
        路径 B（逆推，兜底）：无备份（超 20 版被修剪）时，从当前文件值逆序撤销「该版之后全部版本」
        的 diff（把 after 还原为 before）。要求当前文件 = 最新快照状态（调用方需先做基线检查）；
        external_register 等「文件已被外改」的场景应传 allow_reverse=False。
        """
        row = self.db.query_one("SELECT diff FROM signal_snapshot WHERE version = ?", (version,))
        if not row:
            raise DraftError([{"key": "", "error": f"版本不存在：{version}"}])
        diff = json.loads(row["diff"] or "[]")
        backup = _backup_dir() / f"signals-{version}.yaml"
        if backup.is_file():
            doc, err = _read_yaml(backup)
            if doc and not err:
                full = self._flat_values(doc)
                for d in diff:
                    full[d["key"]] = _plain(d.get("after"))
                return full
        if not allow_reverse:
            raise DraftError([{"key": "", "error": f"版本 {version} 的备份文件已被清理，无法自动重建内容"}])
        sig, err = _read_yaml(SIGNALS_PATH)
        if err or not sig:
            raise DraftError([{"key": "", "error": f"signals.yaml 不可读：{err or '空文件'}"}])
        full = self._flat_values(sig)
        rows = self.db.query("SELECT version, diff FROM signal_snapshot ORDER BY version")
        versions = [r["version"] for r in rows]
        if version not in versions:
            raise DraftError([{"key": "", "error": f"版本不存在：{version}"}])
        for r in reversed(rows[versions.index(version) + 1:]):
            for d in json.loads(r["diff"] or "[]"):
                if d.get("before") is None:
                    continue  # 键集合固定场景下的防御：新增键不回溯删除（保持当前值）
                full[d["key"]] = _plain(d.get("before"))
        return full

    @staticmethod
    def _diff_summary(diff: list[dict]) -> str:
        if not diff:
            return "无值级变化"
        def fmt(v):
            if v is None:
                return "—"
            if isinstance(v, bool):
                return "开" if v else "关"
            s = str(v)
            return s if len(s) <= 24 else s[:24] + "…"
        parts = [f"{d['key']} {fmt(d.get('before'))}→{fmt(d.get('after'))}" for d in diff[:2]]
        more = f" 等 {len(diff)} 项" if len(diff) > 2 else ""
        return "、".join(parts) + more

    def list_versions(self) -> dict:
        """版本列表 + 部署状态 + 外部变更检测（US-08）。"""
        rows = self.db.query(
            "SELECT version, created_at, reason, diff, file_fingerprint, status, forced"
            " FROM signal_snapshot ORDER BY version DESC"
        )
        latest = rows[0]["version"] if rows else None
        deploy = {"currentVersion": latest, "confirmed": False, "confirmedAt": None}
        if rows:
            dc = self.db.query_one(
                "SELECT ts FROM signal_audit WHERE action = 'deploy_confirm' AND ts >= ? ORDER BY ts DESC LIMIT 1",
                (rows[0]["created_at"],),
            )
            if dc:
                deploy = {"currentVersion": latest, "confirmed": True, "confirmedAt": dc["ts"]}
        cur_fp = file_fingerprint(SIGNALS_PATH)
        latest_fp = rows[0]["file_fingerprint"] if rows else None
        versions = []
        for r in rows:
            diff = json.loads(r["diff"] or "[]")
            versions.append(
                {
                    "version": r["version"],
                    "createdAt": r["created_at"],
                    "reason": r["reason"] or "",
                    "status": r["status"],
                    "forced": bool(r["forced"]),
                    "isCurrent": r["version"] == latest,
                    "diffCount": len(diff),
                    "summary": self._diff_summary(diff),
                }
            )
        return {
            "versions": versions,
            "deploy": deploy,
            "drift": {
                "hasDrift": bool(rows and latest_fp and cur_fp and cur_fp != latest_fp),
                "currentFingerprint": cur_fp,
                "latestFingerprint": latest_fp,
                "latestVersion": latest,
            },
            "backupDir": str(_backup_dir()),
        }

    def get_version(self, version: str) -> dict:
        """版本详情（值级 diff 全量）。"""
        row = self.db.query_one(
            "SELECT version, created_at, reason, diff, file_fingerprint, status, forced"
            " FROM signal_snapshot WHERE version = ?",
            (version,),
        )
        if not row:
            raise DraftError([{"key": "", "error": f"版本不存在：{version}"}])
        return {
            "version": row["version"],
            "createdAt": row["created_at"],
            "reason": row["reason"] or "",
            "diff": json.loads(row["diff"] or "[]"),
            "fingerprint": row["file_fingerprint"],
            "status": row["status"],
            "forced": bool(row["forced"]),
        }

    def rollback(self, version: str, reason: str = "", force: bool = False, force_reason: str = "") -> dict:
        """回滚到历史版本：目标版本完整值 → 等值变更项 → 走与发布一致的流程。

        - 前置：目标存在且非最新；当前文件与最近快照指纹一致（防覆盖平台外改动）；
        - 被回滚离开的 current 版本标 ``rolled_back``；新快照 reason = 「回滚到 vX」；
        - 审计 action=rollback（对象 = 目标版本）。
        """
        from .runner import SignalRunner

        latest = self._latest_snapshot()
        if not latest:
            raise DraftError([{"key": "", "error": "尚无发布版本，无历史可回滚"}])
        target_row = self.db.query_one("SELECT version FROM signal_snapshot WHERE version = ?", (version,))
        if not target_row:
            raise DraftError([{"key": "", "error": f"目标版本不存在：{version}"}])
        if version == latest["version"]:
            raise DraftError([{"key": "", "error": "目标版本就是当前版本，无需回滚"}])
        cur_fp = file_fingerprint(SIGNALS_PATH)
        if latest.get("file_fingerprint") and cur_fp and latest["file_fingerprint"] != cur_fp:
            raise DraftError(
                [{"key": "", "error": "signals.yaml 与最近快照不一致（疑似平台外修改）——请先在版本页处理「外部变更」，再回滚"}]
            )
        target = self._version_full_values(version)
        sig, err = _read_yaml(SIGNALS_PATH)
        if err or not sig:
            raise DraftError([{"key": "", "error": f"signals.yaml 不可读：{err or '空文件'}"}])
        current = self._flat_values(sig)
        reason_txt = f"回滚到 {version}" + (f"：{reason.strip()}" if reason.strip() else "（恢复该版本全部值）")
        items = []
        for k in sorted(set(target) & set(current)):
            if json.dumps(current.get(k), ensure_ascii=False) != json.dumps(target.get(k), ensure_ascii=False):
                items.append({"key": k, "newValue": target[k], "reason": reason_txt})
        if not items:
            raise DraftError([{"key": "", "error": f"当前值与 {version} 完全一致，无需回滚"}])
        errors = self._validate_items(items)
        if errors:
            raise DraftError(errors)
        if force and not (force_reason or "").strip():
            raise DraftError([{"key": "", "error": "强制发布必须填写理由"}])

        draft_file = self.materialize_draft(items)
        assert_res = SignalRunner().assert_all(str(draft_file))
        if not assert_res.get("ok") and not force:
            failed: list[str] = []
            for sc in assert_res.get("scripts", []):
                for f in sc.get("fails") or []:
                    failed.append(f"[{sc.get('script')}] {f}")
            raise PublishBlocked(failed or ["断言未通过（无明细，请手动运行断言排查）"])

        return self._write_back(
            items,
            reason_summary=reason_txt,
            force=force,
            force_reason=force_reason,
            assert_res=assert_res,
            audit_action="rollback",
            audit_key=version,
            supersede_status="rolled_back",
        )

    # ══ 审计（S7 / US-09）══════════════════════════════════════════

    def list_audit(self, limit: int = 100, offset: int = 0) -> dict:
        """审计日志（倒序分页；只追加不删除）。"""
        total_row = self.db.query_one("SELECT COUNT(*) AS n FROM signal_audit")
        total = int(total_row["n"]) if total_row else 0
        rows = self.db.query(
            "SELECT id, ts, action, object_key, before, after, reason FROM signal_audit"
            " ORDER BY id DESC LIMIT ? OFFSET ?",
            (max(1, min(limit, 500)), max(0, offset)),
        )
        return {"items": rows, "total": total}

    # ══ 医学参数复审（S7 / US-09）══════════════════════════════════

    def review_config(self) -> dict:
        row = self.db.query_one("SELECT value, updated_at FROM signal_setting WHERE key = 'reviewCycleDays'")
        days = DEFAULT_REVIEW_CYCLE_DAYS
        if row and str(row["value"]).isdigit():
            days = int(row["value"])
        return {
            "cycleDays": days,
            "defaultDays": DEFAULT_REVIEW_CYCLE_DAYS,
            "updatedAt": row["updated_at"] if row else None,
        }

    def set_review_config(self, days) -> dict:
        if not isinstance(days, int) or isinstance(days, bool) or not (REVIEW_CYCLE_RANGE[0] <= days <= REVIEW_CYCLE_RANGE[1]):
            raise DraftError(
                [{"key": "", "error": f"复审周期必须是 {REVIEW_CYCLE_RANGE[0]}–{REVIEW_CYCLE_RANGE[1]} 之间的整数（天）"}]
            )
        old = self.review_config()["cycleDays"]
        now = _now()
        self.db.execute(
            "INSERT INTO signal_setting(key, value, updated_at) VALUES('reviewCycleDays', ?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (str(days), now),
        )
        self._audit("review_config", "reviewCycleDays", str(old), str(days), f"复审周期调整为 {days} 天（原 {old} 天）")
        return {"ok": True, **self.review_config()}

    def review_state(self) -> dict:
        """复审判定：仅对「有审阅记录」的键判超期；无记录 = 未审阅（中性，不标黄）。"""
        cycle = self.review_config()["cycleDays"]
        rows = self.db.query("SELECT key, last_reviewed_at, review_note FROM signal_param_state")
        today = datetime.now().astimezone().date()
        states: dict[str, dict] = {}
        for r in rows:
            lr = r["last_reviewed_at"]
            overdue = False
            days_since = None
            if lr:
                try:
                    days_since = (today - datetime.fromisoformat(lr).date()).days
                    overdue = days_since > cycle
                except ValueError:
                    overdue = False
            states[r["key"]] = {
                "lastReviewedAt": lr,
                "note": r["review_note"] or "",
                "pendingReview": overdue,
                "daysSince": days_since,
            }
        return {"cycleDays": cycle, "states": states}

    def mark_reviewed(self, key: str, note: str = "") -> dict:
        """标记已审阅（复审结论可附；「已审阅，维持原值」是合法结论）。"""
        reg, _err = _read_yaml(REGISTRY_PATH)
        params = {p.get("key"): p for p in (reg or {}).get("params", []) or []}
        p = params.get(key)
        if not p:
            raise DraftError([{"key": key, "error": "未知参数（不在注册表内）"}])
        if not p.get("medical"):
            raise DraftError([{"key": key, "error": "该参数非医学类，不参与复审管理"}])
        prev = self.db.query_one("SELECT last_reviewed_at FROM signal_param_state WHERE key = ?", (key,))
        now = _now()
        note = (note or "").strip()
        self.db.execute(
            "INSERT INTO signal_param_state(key, last_reviewed_at, review_note) VALUES(?,?,?)"
            " ON CONFLICT(key) DO UPDATE SET last_reviewed_at = excluded.last_reviewed_at, review_note = excluded.review_note",
            (key, now, note),
        )
        self._audit(
            "review", key,
            prev["last_reviewed_at"] if prev else None, now,
            note or "已审阅，维持原值",
        )
        return {"ok": True, "key": key, "lastReviewedAt": now}

    # ══ 部署确认 / 外部变更登记（S7 / US-08）═══════════════════════

    def deploy_confirm(self) -> dict:
        """确认「已发布版本已随部署生效」（记审计；幂等——已确认过则不重复记）。"""
        latest = self._latest_snapshot()
        if not latest:
            raise DraftError([{"key": "", "error": "尚无发布版本，无可确认的部署"}])
        existing = self.db.query_one(
            "SELECT ts FROM signal_audit WHERE action = 'deploy_confirm' AND ts >= ? ORDER BY ts DESC LIMIT 1",
            (latest["created_at"],),
        )
        if existing:
            return {"ok": True, "already": True, "version": latest["version"], "confirmedAt": existing["ts"]}
        self._audit("deploy_confirm", latest["version"], None, None, "确认配置已在运行环境生效")
        return {"ok": True, "already": False, "version": latest["version"], "confirmedAt": _now()}

    def external_register(self) -> dict:
        """把「平台外修改后的当前文件」登记为新快照（只登记，不写文件、不改值）。

        diff = 当前文件值 vs 最近快照完整值（reconstruct 只走备份路径：
        当前文件已被外改，逆推的「文件=最新快照」前提不成立）。
        """
        latest = self._latest_snapshot()
        if not latest:
            raise DraftError([{"key": "", "error": "尚无历史快照——首次发布前文件即基线，无需登记"}])
        cur_fp = file_fingerprint(SIGNALS_PATH)
        if cur_fp and latest.get("file_fingerprint") and cur_fp == latest["file_fingerprint"]:
            raise DraftError([{"key": "", "error": "当前文件与最近快照一致，无外部变更可登记"}])
        base = self._version_full_values(latest["version"], allow_reverse=False)
        sig, err = _read_yaml(SIGNALS_PATH)
        if err or not sig:
            raise DraftError([{"key": "", "error": f"signals.yaml 不可读：{err or '空文件'}"}])
        cur = self._flat_values(sig)
        diff = [
            {"key": k, "before": base.get(k), "after": cur.get(k)}
            for k in sorted(set(base) | set(cur))
            if json.dumps(base.get(k), ensure_ascii=False) != json.dumps(cur.get(k), ensure_ascii=False)
        ]
        if not diff:
            raise DraftError([{"key": "", "error": "未检出值级差异（可能仅注释或格式变化）——如属有意变更可忽略本提示"}])
        version = self._next_version()
        self.db.execute(
            "UPDATE signal_snapshot SET status = 'superseded' WHERE status = 'current'"
        )
        self.db.execute(
            "INSERT INTO signal_snapshot(version, created_at, reason, diff, file_fingerprint, status, forced)"
            " VALUES(?,?,?,?,?,?,?)",
            (version, _now(), "外部变更登记（signals.yaml 在平台外被修改）", json.dumps(diff, ensure_ascii=False), cur_fp, "current", 0),
        )
        self._audit(
            "external_register", version,
            json.dumps({d["key"]: d["before"] for d in diff}, ensure_ascii=False)[:1500],
            json.dumps({d["key"]: d["after"] for d in diff}, ensure_ascii=False)[:1500],
            f"登记平台外修改（{len(diff)} 项，基线 {latest['version']}）",
        )
        return {"ok": True, "version": version, "diff": diff}
