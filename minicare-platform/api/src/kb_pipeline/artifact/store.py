"""产物存储（ArtifactStore）：按 run_id 分目录 + manifest 作为执行事实唯一来源

对应 PRD-008 US-08 与 TECH-015 §8.1–§8.3。

设计约束：
  1. 目录名 = `cache_key[:16]` → 同参数重跑「命中即目录存在」，O(1) 判定，无需索引
  2. `manifest.json` 是执行事实的**唯一来源**；DB 只是物化视图，不一致时以 manifest 为准
  3. `cache_key` 含**平台代码版本**（PRD D-11）→ 代码改了行为变了，缓存不会错误命中
  4. 失效传播：上游重跑 → 下游标 `stale`，但**产物文件不删**（可对比、可回退）
  5. 写入原子：先写 `.tmp/` 再 rename，保证不出现半成品目录被下游引用
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..fsutil import ensure_dir
from ..registry import STEP_REGISTRY, StepRunResult, downstream_of

MANIFEST_NAME = "manifest.json"

STATUS_PENDING = "pending"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"
STATUS_STALE = "stale"
STATUS_SKIPPED_CACHED = "skipped_cached"
STATUS_SKIPPED_NO_CAPABILITY = "skipped_no_capability"

# 被视为「已成功」的状态（下游可引用）
SUCCESS_STATES = frozenset({STATUS_SUCCEEDED, STATUS_SKIPPED_CACHED, STATUS_SKIPPED_NO_CAPABILITY})


def _json_default(obj: Any) -> Any:
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, (set, frozenset)):
        return sorted(obj)
    if isinstance(obj, bytes):
        return f"<bytes {len(obj)}>"
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    raise TypeError(f"不可序列化类型: {type(obj).__name__}")


def canonical_json(obj: Any) -> str:
    """稳定序列化（键排序、无多余空白）—— 用于一切 hash 计算"""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, default=_json_default, separators=(",", ":"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def content_hash(payload: Any) -> str:
    """产物内容 hash（用于 cache_key 与变更检测）"""
    if isinstance(payload, str):
        return sha256_text(payload)
    return sha256_text(canonical_json(payload))


def params_hash(params: dict | None) -> str:
    return sha256_text(canonical_json(params or {}))[:8]


def compute_cache_key(
    *,
    step_id: str,
    upstream_hashes: dict[str, str],
    params: dict | None,
    engine: str,
    engine_version: str,
    platform_version: str,
) -> str:
    """cache_key = sha256(步骤 + 上游产物hash + 参数hash + 引擎版本 + 平台代码版本)

    任何一项变化都会让缓存失效 —— 尤其是 `platform_version`（PRD D-11），
    它避免"代码改了行为变了、缓存却仍命中"这类最难排查的不一致。
    """
    material = {
        "step": step_id,
        "upstream": dict(sorted((upstream_hashes or {}).items())),
        "params_hash": params_hash(params),
        "engine": engine,
        "engine_version": engine_version,
        "platform_version": platform_version,
    }
    return sha256_text(canonical_json(material))


def make_run_id(engine: str, engine_version: str, params: dict | None) -> str:
    return f"run__{engine}@{engine_version}__{params_hash(params)}"


def _now() -> str:
    return datetime.now(UTC).astimezone().isoformat(timespec="seconds")


class ArtifactStore:
    """一份文档的产物仓库。

    目录布局（TECH-015 §8.1）::

        {data_root}/corpus/{doc_id}/
          file/                             原始上传文件
          raw/                              解析原始产物（永不清理）
          pipeline/{step_id}/{cache16}/     各步产物（按 run 分目录）
          edits/                            人工产物（跨 run 存续，永不清理）
          llm/                              LLM 产物（元信息抽取等；既非管线产物也非人工产物）
          manifest.json                     执行事实唯一来源
    """

    def __init__(self, data_root: Path, doc_id: str, platform_version: str = "0.0.0") -> None:
        self.data_root = Path(data_root)
        self.doc_id = doc_id
        self.platform_version = platform_version
        self.root = self.data_root / "corpus" / doc_id
        self.work_root = self.root / "pipeline"
        self.raw_root = self.root / "raw"
        self.edits_root = self.root / "edits"
        # LLM 产物单独一层：放 pipeline/ 会被 prune 当缓存清掉，
        # 放 edits/ 会被误读成"人工编辑结果"（人工决定优先于规则那条语义）。
        self.llm_root = self.root / "llm"
        self.manifest_path = self.root / MANIFEST_NAME

    # ── 目录 ────────────────────────────────────────────────────────────
    def ensure_dirs(self) -> None:
        for d in (self.root, self.work_root, self.raw_root, self.edits_root, self.llm_root):
            ensure_dir(d)

    def step_dir(self, step_id: str, cache_key: str) -> Path:
        return self.work_root / step_id / cache_key[:16]

    def artifact_path(self, step_id: str, cache_key: str) -> Path:
        spec = STEP_REGISTRY[step_id]
        return self.step_dir(step_id, cache_key) / spec.artifact

    # ── manifest ────────────────────────────────────────────────────────
    def load_manifest(self) -> dict:
        if not self.manifest_path.exists():
            return {"doc_id": self.doc_id, "platform_version": self.platform_version, "steps": {}}
        try:
            return json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            # manifest 损坏时不静默丢历史：备份后重建，交由上层告警
            broken = self.manifest_path.with_suffix(".json.broken")
            try:
                shutil.copy2(self.manifest_path, broken)
            except OSError:
                pass
            return {"doc_id": self.doc_id, "platform_version": self.platform_version, "steps": {}}

    def save_manifest(self, manifest: dict) -> None:
        self.ensure_dirs()
        manifest["doc_id"] = self.doc_id
        manifest["updated_at"] = _now()
        tmp = self.manifest_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
        os.replace(tmp, self.manifest_path)   # 原子替换

    # ── 状态查询 ────────────────────────────────────────────────────────
    def step_entry(self, manifest: dict, step_id: str) -> dict:
        return manifest.setdefault("steps", {}).setdefault(step_id, {"current_run": "", "status": "pending", "runs": []})

    def current_run(self, step_id: str, manifest: dict | None = None) -> dict | None:
        """当前被下游引用的那次执行。

        **不变量**：`current_run` 必须指向**成功**状态的 run。失败记录只能作为历史留痕，
        绝不能被下游引用 —— 否则会出现"上游显示 succeeded、下游却报上游未就绪"的错乱。
        """
        m = manifest if manifest is not None else self.load_manifest()
        entry = m.get("steps", {}).get(step_id)
        if not entry:
            return None
        cur = entry.get("current_run")
        for run in entry.get("runs", []):
            if run.get("run_id") == cur and run.get("status") in SUCCESS_STATES:
                return run
        return None

    def step_status(self, step_id: str, manifest: dict | None = None) -> str:
        m = manifest if manifest is not None else self.load_manifest()
        return m.get("steps", {}).get(step_id, {}).get("status", STATUS_PENDING)

    def artifact_exists(self, step_id: str, cache_key: str) -> bool:
        return self.artifact_path(step_id, cache_key).exists()

    def read_artifact(self, step_id: str, cache_key: str) -> dict | None:
        p = self.artifact_path(step_id, cache_key)
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    def read_current_artifact(self, step_id: str, manifest: dict | None = None) -> dict | None:
        """读取某步 current_run 的产物内容 —— 下游步骤的唯一取数入口"""
        run = self.current_run(step_id, manifest)
        if not run or not run.get("cache_key"):
            return None
        return self.read_artifact(step_id, run["cache_key"])

    def upstream_hashes(self, step_id: str, manifest: dict | None = None) -> dict[str, str]:
        """收集上游 current_run 的产物内容 hash；任一上游未成功则抛错（不允许盲跑）"""
        m = manifest if manifest is not None else self.load_manifest()
        spec = STEP_REGISTRY[step_id]
        out: dict[str, str] = {}
        for dep in spec.requires:
            run = self.current_run(dep, m)
            if run is None or run.get("status") not in SUCCESS_STATES:
                raise UpstreamNotReady(
                    f"步骤 {step_id} 的上游 {dep} 未就绪（当前状态 {self.step_status(dep, m)}）"
                )
            out[dep] = run.get("artifact_hash", "")
        return out

    # ── 写入 ────────────────────────────────────────────────────────────
    def write_run(
        self,
        *,
        step_id: str,
        cache_key: str,
        payload: dict,
        engine: str,
        engine_version: str,
        params: dict | None,
        upstream: dict[str, str],
        stats: dict | None = None,
        duration_ms: int = 0,
        warnings: list[str] | None = None,
        status: str = STATUS_SUCCEEDED,
        error: str = "",
    ) -> str:
        """原子写入产物 + 追加 manifest run 记录 + 标下游 stale"""
        self.ensure_dirs()
        final = self.step_dir(step_id, cache_key)
        tmp = self.work_root / ".tmp" / f"{step_id}-{cache_key[:16]}"
        if tmp.exists():
            shutil.rmtree(tmp)
        ensure_dir(tmp)
        spec = STEP_REGISTRY[step_id]
        (tmp / spec.artifact).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8"
        )
        if final.exists():
            shutil.rmtree(final)
        ensure_dir(final.parent)
        os.rename(tmp, final)

        run_id = make_run_id(engine, engine_version, params)
        record = {
            "run_id": run_id,
            "cache_key": cache_key,
            "status": status,
            "engine": engine,
            "engine_version": engine_version,
            "platform_version": self.platform_version,
            "params": params or {},
            "params_hash": params_hash(params),
            "upstream_hashes": upstream,
            "artifact_hash": content_hash(payload),
            "stats": stats or {},
            "warnings": warnings or [],
            "error": error,
            "duration_ms": duration_ms,
            "started_at": _now(),
            "finished_at": _now(),
        }

        manifest = self.load_manifest()
        entry = self.step_entry(manifest, step_id)
        # 变更前后对比：只有**产物内容真的变了**才需要让下游重跑。
        # 若内容一致（例如只改了不影响输出的参数），下游缓存仍然有效 —— 这是内容寻址语义。
        prev = self.current_run(step_id, manifest)
        prev_hash = prev.get("artifact_hash") if prev else None
        # 同一 run_id 重跑：替换旧记录而非追加（避免 manifest 无限膨胀）
        entry["runs"] = [r for r in entry.get("runs", []) if r.get("run_id") != run_id]
        entry["runs"].append(record)
        entry["status"] = status
        if status in SUCCESS_STATES:
            entry["current_run"] = run_id
        # 失效传播：仅当产物指纹发生变化时，才把下游标为 stale
        if prev_hash != record["artifact_hash"]:
            self._mark_downstream_stale(manifest, step_id)
        self.save_manifest(manifest)
        return run_id

    def mark_failed(self, *, step_id: str, error: str, cache_key: str = "", params: dict | None = None) -> None:
        """记录一次失败执行。

        - 用真实 engine/engine_version 生成 run_id（不再用 '?' 占位，避免与成功记录混淆）
        - 按 (run_id, status=failed) 去重，避免反复重试把 manifest 撑爆
        - **不改动 current_run**：失败不改变"当前可被下游引用的产物"这一事实
        """
        manifest = self.load_manifest()
        entry = self.step_entry(manifest, step_id)
        entry["status"] = STATUS_FAILED
        spec = STEP_REGISTRY[step_id]
        run_id = make_run_id(spec.engine, spec.engine_version, params)
        runs = [
            r for r in entry.get("runs", [])
            if not (r.get("run_id") == run_id and r.get("status") == STATUS_FAILED)
        ]
        runs.append(
            {
                "run_id": run_id,
                "cache_key": cache_key,
                "status": STATUS_FAILED,
                "engine": spec.engine,
                "engine_version": spec.engine_version,
                "platform_version": self.platform_version,
                "params": params or {},
                "error": error,
                "finished_at": _now(),
            }
        )
        entry["runs"] = runs
        self.save_manifest(manifest)

    def mark_cached(self, *, step_id: str, cache_key: str) -> None:
        """命中缓存：把 current_run 指向该 cache_key 对应的**成功**记录（产物已在盘上）

        **不触发失效传播** —— 缓存命中意味着产物与上次完全一致，下游无需重跑。
        （早期版本在这里误标下游 stale，导致"只是看了一眼状态，下游就变待更新"。）
        """
        manifest = self.load_manifest()
        entry = self.step_entry(manifest, step_id)
        for run in entry.get("runs", []):
            if run.get("cache_key") == cache_key and run.get("status") in SUCCESS_STATES:
                entry["current_run"] = run.get("run_id", entry.get("current_run"))
                break
        entry["status"] = STATUS_SUCCEEDED
        self.save_manifest(manifest)

    def _mark_downstream_stale(self, manifest: dict, step_id: str) -> list[str]:
        marked: list[str] = []
        for sid in downstream_of(step_id):
            entry = self.step_entry(manifest, sid)
            if entry.get("status") in SUCCESS_STATES or entry.get("status") == STATUS_FAILED:
                entry["status"] = STATUS_STALE
                marked.append(sid)
        return marked

    # ── 作废与重跑 ──────────────────────────────────────────────────────
    def invalidate(self, from_step: str) -> list[str]:
        """作废某步及全部下游：产物文件保留，只标 stale（PRD FR-1.8）

        返回值是**完整的下游闭包**（含已经是 stale 的），因为调用方（CLI/界面）要用它
        告诉用户"这些步骤已被要求重跑"；若只返回状态发生变化的，提示会漏项。
        """
        if from_step not in STEP_REGISTRY:
            raise KeyError(f"未知步骤: {from_step}")
        manifest = self.load_manifest()
        entry = self.step_entry(manifest, from_step)
        entry["status"] = STATUS_STALE
        self._mark_downstream_stale(manifest, from_step)
        self.save_manifest(manifest)
        return [from_step, *downstream_of(from_step)]

    def set_current(self, step_id: str, run_id: str) -> None:
        """把历史 run 设为当前（用于对比后回退，PRD US-08 场景 2）"""
        manifest = self.load_manifest()
        entry = self.step_entry(manifest, step_id)
        if not any(r.get("run_id") == run_id for r in entry.get("runs", [])):
            raise KeyError(f"{step_id} 不存在 run_id={run_id}")
        entry["current_run"] = run_id
        entry["status"] = STATUS_SUCCEEDED
        self._mark_downstream_stale(manifest, step_id)
        self.save_manifest(manifest)

    def list_runs(self, step_id: str, manifest: dict | None = None) -> list[dict]:
        m = manifest if manifest is not None else self.load_manifest()
        return list(m.get("steps", {}).get(step_id, {}).get("runs", []))

    def prune(self, keep: int = 3) -> list[str]:
        """清理非 current 的旧 run 目录（raw/ 与 edits/ 除外，永不清理）"""
        removed: list[str] = []
        if keep < 0:
            return removed
        manifest = self.load_manifest()
        for step_id in STEP_REGISTRY:
            entry = manifest.get("steps", {}).get(step_id)
            if not entry:
                continue
            current = entry.get("current_run")
            others = [r for r in entry.get("runs", []) if r.get("run_id") != current]
            for run in others[: max(0, len(others) - keep)]:
                d = self.step_dir(step_id, run.get("cache_key", ""))
                if d.exists():
                    shutil.rmtree(d)
                    removed.append(str(d))
        return removed

    def snapshot(self) -> dict:
        """当前各步骤状态摘要（供状态派生与界面展示）"""
        manifest = self.load_manifest()
        return {
            step_id: self.step_status(step_id, manifest) for step_id in STEP_REGISTRY
        }


class UpstreamNotReady(RuntimeError):
    """上游产物未就绪 —— 不允许盲跑某一步（TECH-015 §8.3 第 1 步）"""


__all__ = [
    "MANIFEST_NAME",
    "STATUS_FAILED",
    "STATUS_PENDING",
    "STATUS_SKIPPED_CACHED",
    "STATUS_SKIPPED_NO_CAPABILITY",
    "STATUS_STALE",
    "STATUS_SUCCEEDED",
    "SUCCESS_STATES",
    "ArtifactStore",
    "StepRunResult",
    "UpstreamNotReady",
    "canonical_json",
    "compute_cache_key",
    "content_hash",
    "make_run_id",
    "params_hash",
    "sha256_text",
]
