"""本地 Web 层的 REST 契约 + 前端宿主

契约极简，只暴露"看状态 / 跑 dry-run / 单步重跑 / 作废"四类能力。

**前端形态（TECH-015 §4.8）**：
  · 若 `minicare-platform/web/dist` 存在 → FastAPI **同端口托管 React 构建产物**（生产/日常）
  · 否则 → 回退到内嵌单页 v0（`web/ui.py`），保证纯后端环境（未装 Node）也能用
  开发期如需热更新：在 `minicare-platform/web` 跑 `npm run dev`，Vite 把 `/api` 代理到 8787。

⚠️ **写库闸门**：本层**硬编码拒绝任何写库请求**。原因（不是懒，是有据）：
  1. 迁移 021（`retrieval_status` / `review_state`）尚未执行，库结构还是旧语义；
  2. `index` 步骤的**真实入库路径从未在本地验证过**（缺 DB 与 TOKENHUB_API_KEY）；
  3. 一旦在界面上开放写库，等于把一个未验证过的路径放到"点一下就执行"的位置。
要开放写库，先满足 TECH-015 §9.1 的前置条件，再打开这里的 `ALLOW_WRITE`。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .. import __version__ as PIPELINE_VERSION
from .. import run_registry
from ..config import effective_thresholds, get_settings
from ..orchestrator import Orchestrator
from ..registry import STEP_ORDER, STEP_REGISTRY
from .ui import render_index_html

ALLOW_WRITE = False

WRITE_REJECT = (
    "本环境不开放写库：迁移 021 尚未执行，且 index 的真实入库路径未在本地验证。"
    "如需写库请用 CLI（kb-pipeline run --write），或先完成 TECH-015 §9.1 的前置条件。"
)


class _StaticCacheHeaders:
    """给前端静态产物补 `Cache-Control` —— 否则「代码改了、dist 也重建了，页面还是旧的」。

    根因（实测踩到，2026-10-08）：`StaticFiles` 只发 `etag` / `last-modified`，
    **不发 `Cache-Control`**。浏览器于是按启发式规则自行决定新鲜期
    （约 "last-modified 距今" 的 10%），在新鲜期内**连校验请求都不发**，于是持续跑旧 bundle。
    用户看到的就是「上传入口明明加了却没有」；而在应用内点「刷新」只重新拉 `/api` 数据，
    **不会重新加载 JS**，所以那个刷新按钮也救不回来。

    策略按「文件名是否带内容哈希」区分（Vite 产物带哈希，`index.html` 不带）：
      · `/assets/*`、`/pdfjs/*` → 一年 `immutable`（文件名变了才会换 URL）
      · `/`、`*.html`           → `no-cache`（**不是不缓存**，而是每次都带 etag 校验；
                                   命中则 304，改动则立刻拿到新的）

    🚨 **必须是纯 ASGI 中间件，不能用 `@app.middleware("http")`**（后者是 `BaseHTTPMiddleware`）：
    它会在下游响应发完之后**再补发一个空的 body 消息**，而 `FileResponse` / `StaticFiles`
    已经按 `Content-Length` 把 body 发完了 —— uvicorn 于是抛
    `RuntimeError: Response content shorter than Content-Length`（实测 2026-10-09，`GET /` 上偶发）。
    这里只改 `http.response.start` 的 header，完全不碰 body；也不引入 starlette 依赖
    （保持本模块在缺 Web 依赖时仍可导入并给出友好报错）。
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path") or ""
        if path.startswith("/api") or path == "/health":
            await self.app(scope, receive, send)
            return
        if path.startswith("/assets/") or path.startswith("/pdfjs/"):
            cache = "public, max-age=31536000, immutable"
        elif path == "/" or path.endswith(".html"):
            cache = "no-cache"
        else:
            await self.app(scope, receive, send)
            return

        async def send_with_cache(message):
            if message["type"] == "http.response.start":
                kept = [(k, v) for k, v in message.get("headers", [])
                        if k.lower() != b"cache-control"]
                message["headers"] = [*kept, (b"cache-control", cache.encode())]
            await send(message)

        await self.app(scope, receive, send_with_cache)


def frontend_dist() -> Path | None:
    """定位前端构建产物目录（`minicare-platform/web/dist`）。

    定位优先级（TECH-015 §4.8：生产期 FastAPI 同端口托管构建产物）：
      1. 环境变量 `KB_PLATFORM_WEB_DIST`（部署时显式指定）
      2. 仓库内约定路径 `<repo>/minicare-platform/web/dist`
      3. 当前工作目录下同名路径（从仓库根启动时命中）

    三者都不存在时返回 None —— 此时回退到内嵌单页 v0，**开发不受影响**。
    判据是 `index.html` 是否真实存在（只看目录存在会把空目录误判为已构建）。
    """
    import os

    candidates: list[Path] = []
    env = os.environ.get("KB_PLATFORM_WEB_DIST")
    if env:
        candidates.append(Path(env))
    # api.py = <repo>/minicare-platform/api/src/kb_pipeline/web/api.py
    #   → parents[4] = <repo>/minicare-platform（api/ 的上一级，web/ 是其兄弟目录）
    candidates.append(Path(__file__).resolve().parents[4] / "web" / "dist")
    candidates.append(Path.cwd() / "minicare-platform" / "web" / "dist")

    for c in candidates:
        if (c / "index.html").is_file():
            return c
    return None


def _orchestrator() -> Orchestrator:
    return Orchestrator(get_settings())


def _doc_index() -> dict[str, dict[str, Any]]:
    """文档索引 = **MinerU 产物目录 ∪ 语料台账（kb_corpus）**

    为什么要并上台账：上传（US-01）只把源文件落到 `source_dir/`，产物目录要等 `parse`
    跑完才出现。只扫产物目录的话，刚登记的文档在「文档管理」里根本看不见 ——
    用户会以为上传失败了。并进来之后，这些文档以「待处理 + 六步全灰」出现，
    操作按钮自然变成「进行预检」，整条链路在界面上才闭环。

    每个条目额外带两个标记（前端用来区分「已解析」与「只登记了」）：
      · `has_products` —— 有没有 MinerU 产物目录
      · `registered`   —— 有没有进 `kb_corpus` 台账
    """
    from ..logger import get_logger
    from ..mineru.result import scan_documents

    log = get_logger(__name__)
    s = get_settings()
    out: dict[str, dict[str, Any]] = {}
    try:
        for d in scan_documents(s.out_dir, s):
            out[d.doc_id] = {
                "region": d.region, "source": d.source,
                "registered": False, "has_products": True,
                # 有没有源 PDF —— 列表页卡片据此决定"显示首页缩略图"还是"HTML 来源占位"，
                # 免得对 HTML 来源的文档发一次注定 404 的缩略图请求
                "has_pdf": d.pdf_path is not None,
            }
    except Exception as e:  # noqa: BLE001 - 目录缺失/结构异常不应让整个文档列表接口挂掉
        log.warning(f"[web] 扫描产物目录失败（文档列表可能为空）: {e}")

    # 台账里已登记、但产物还没生成的文档（上传之后、解析之前）
    try:
        from ..corpus import CorpusLedger

        for row in CorpusLedger(_orchestrator().db).list():
            did = row["doc_id"]
            if row.get("status") == "archived":
                continue
            if did in out:
                out[did]["registered"] = True
                continue
            out[did] = {
                "region": row.get("region") or "cn",
                "source": row.get("source_name") or did,
                "registered": True, "has_products": False, "has_pdf": False,
            }
    except Exception as e:  # noqa: BLE001 - 台账读不到时退回"只显示已解析的文档"
        log.warning(f"[web] 读取语料台账失败（已登记未解析的文档不会出现在列表）: {e}")
    return out


def _steps_detail(store) -> dict[str, dict[str, Any]]:
    """每个步骤「当前 run」的明细：耗时 / 产物指纹 / 统计 / 引擎

    供「文档管理」列表直接展示六步进度（不必再逐个进详情页）。
    数据源与「处理详情」完全一致：manifest 的 `steps.<id>.runs` 里 `current_run` 那一条。
    任何异常都吞掉返回空 dict —— 列表不能因为某个文档没有 manifest 就整体挂掉。
    """
    from ..registry import STEP_REGISTRY

    try:
        manifest = store.load_manifest()
    except Exception:  # noqa: BLE001 - manifest 缺失/损坏不应影响列表
        return {}

    steps = manifest.get("steps") or {}
    out: dict[str, dict[str, Any]] = {}
    for step_id in STEP_REGISTRY:
        entry = steps.get(step_id) or {}
        runs = entry.get("runs") or []
        cur = next((r for r in runs if r.get("run_id") == entry.get("current_run")), None)
        if cur is None:
            out[step_id] = {"status": entry.get("status") or "pending"}
            continue
        out[step_id] = {
            "status": entry.get("status") or cur.get("status") or "pending",
            "duration_ms": cur.get("duration_ms"),
            "run_id": cur.get("run_id"),
            "artifact_hash": (cur.get("artifact_hash") or "")[:12],
            "stats": cur.get("stats") or {},
            "finished_at": cur.get("finished_at"),
            "engine": cur.get("engine"),
            "runs": len(runs),
        }
    return out


def _doc_status(orc: Orchestrator, doc_id: str, meta: dict[str, Any]) -> dict[str, Any]:
    store = orc.store_for(doc_id)
    steps = store.snapshot()
    status = orc.derive_status(doc_id)
    return {
        "doc_id": doc_id,
        "region": meta.get("region", "cn"),
        "status": status,
        "steps": steps,
        "steps_detail": _steps_detail(store),
        # 是否已有 MinerU 产物 / 是否已进台账 —— 上传后未解析的文档靠这两个标记区分
        "has_products": bool(meta.get("has_products", True)),
        "registered": bool(meta.get("registered", False)),
        # 有源 PDF 才能渲染首页缩略图（HTML 来源的文档用占位样式）
        "has_pdf": bool(meta.get("has_pdf", False)),
        # 运行中摘要（无运行时为 null）：页面/刷新后据此恢复卡片的进度显示
        "running": run_registry.brief(doc_id),
    }


def create_app():
    try:
        from fastapi import Body, FastAPI, HTTPException
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "缺少 Web 依赖。安装：cd minicare-platform/api && .venv/bin/pip install -e \".[web]\""
        ) from e

    app = FastAPI(title="敏宝管理平台 · 本地 v0", version=PIPELINE_VERSION)

    # 前端静态产物的缓存策略（见 `_StaticCacheHeaders` 的说明）
    app.add_middleware(_StaticCacheHeaders)

    # 前端形态：优先托管 React 构建产物（minicare-platform/web/dist）；
    # 未构建时回退到内嵌单页 v0（kb_pipeline/web/ui.py），保证纯后端环境也能用。
    dist = frontend_dist()

    # 第 2–5 期能力的路由（语料档案 / 暂停点 / 校对 / 核对 / 质检 / 契约 / 发布 / 缺口）
    from .routers import router as extra_router

    app.include_router(extra_router)

    # Agent 测评域（PRD-010）：/api/agent-eval/*（运行调度 + 台账）
    from .router_agent_eval import router as agent_eval_router

    app.include_router(agent_eval_router)

    # 检索质检台（PRD-011）：/api/quality/*（用例集 + 执行台账 + 运行调度）
    from .router_quality import router as quality_router

    app.include_router(quality_router)

    # 全局配置（「生效阈值」页升级）：/api/config/*（明细 / 写回 pipeline.yaml 与 .env / 热重载 / 原文预览）
    from .router_config import router as config_router

    app.include_router(config_router)

    def _guard_write(payload: dict | None) -> dict:
        payload = payload or {}
        if payload.get("write"):
            raise HTTPException(status_code=403, detail=WRITE_REJECT)
        if not ALLOW_WRITE and payload.get("allow_write"):
            raise HTTPException(status_code=403, detail=WRITE_REJECT)
        return payload

    if dist is None:
        from fastapi.responses import HTMLResponse

        @app.get("/", response_class=HTMLResponse)
        def index() -> str:
            return render_index_html()

    @app.get("/health")
    def health() -> dict:
        s = get_settings()
        return {
            "ok": True,
            "pipeline_version": PIPELINE_VERSION,
            "platform_version": s.platform_cfg.version,
            "yaml_loaded": s.yaml_loaded,
            "config_file": s.config_file,
            "allow_write": ALLOW_WRITE,
            "frontend": "react" if dist is not None else "embedded-v0",
            "frontend_dist": str(dist) if dist is not None else None,
        }

    @app.get("/api/overview")
    def overview() -> dict:
        s = get_settings()
        orc = _orchestrator()
        docs = [_doc_status(orc, doc_id, meta) for doc_id, meta in sorted(_doc_index().items())]

        groups: dict[str, dict] = {}
        for row in effective_thresholds(s):
            g = groups.setdefault(row["group"], {"group": row["group"], "source": row["source"], "rows": []})
            g["rows"].append({"key": row["key"], "value": row["value"]})
        return {
            "pipeline_version": PIPELINE_VERSION,
            "platform_version": s.platform_cfg.version,
            "yaml_loaded": s.yaml_loaded,
            "allow_write": ALLOW_WRITE,
            "docs": docs,
            "steps": [
                {"step_id": sid, "label": STEP_REGISTRY[sid].label,
                 "requires": list(STEP_REGISTRY[sid].requires)}
                for sid in STEP_ORDER
            ],
            "config_groups": list(groups.values()),
        }

    @app.get("/api/docs/{doc_id}")
    def doc_detail(doc_id: str) -> dict:
        orc = _orchestrator()
        meta = _doc_index().get(doc_id)
        store = orc.store_for(doc_id)
        if not store.manifest_path.exists() and meta is None:
            raise HTTPException(status_code=404, detail=f"未知文档: {doc_id}")
        return {
            "doc_id": doc_id,
            "region": (meta or {}).get("region", "cn"),
            "status": orc.derive_status(doc_id),
            "manifest": store.load_manifest(),
        }

    @app.post("/api/docs/{doc_id}/run")
    def run_doc(doc_id: str, payload: dict = Body(default={})) -> dict:
        p = _guard_write(payload)
        orc = _orchestrator()
        meta = _doc_index().get(doc_id)
        if meta is None:
            raise HTTPException(status_code=404, detail=f"未知文档: {doc_id}")
        return orc.run_pipeline(
            doc_id,
            region=meta["region"],
            until=p.get("until"),
            force=bool(p.get("force")),
            dry_run=True,                                  # v0 恒 dry-run
        )

    @app.get("/api/docs/{doc_id}/run-progress")
    def run_progress(doc_id: str) -> dict:
        """该文档的**运行进度**快照（前端 1s 轮询）。

        三种形态：
          · `running: true`  —— 运行中，带当前步骤 / 序号 / 已耗时 / 各步完成情况；
          · `running: false` 且带 `mode` —— 刚跑完（30s 保留窗口内），前端据此收尾浮标；
          · `running: false` 且无 `mode` —— 该文档当前没有运行记录。

        ⚠️ 纯内存读取（`run_registry`），**不碰 DB、不触发任何计算** ——
        高频轮询的开销必须可忽略。运行本身仍是同步阻塞的 `POST /run`，互不影响。
        """
        snap = run_registry.snapshot(doc_id)
        if snap is None:
            return {"doc_id": doc_id, "running": False}
        return snap

    @app.post("/api/docs/{doc_id}/steps/{step_id}/run")
    def run_one_step(doc_id: str, step_id: str, payload: dict = Body(default={})) -> dict:
        p = _guard_write(payload)
        if step_id not in STEP_REGISTRY:
            raise HTTPException(status_code=400, detail=f"未知步骤: {step_id}")
        orc = _orchestrator()
        meta = _doc_index().get(doc_id) or {"region": "cn"}
        res = orc.run_step(
            doc_id, step_id,
            region=meta["region"],
            force=bool(p.get("force")),
            dry_run=True,
        )
        return {"step_id": res.step_id, "status": res.status, "duration_ms": res.duration_ms,
                "stats": res.stats, "warnings": res.warnings, "error": res.error}

    @app.post("/api/docs/{doc_id}/invalidate")
    def invalidate(doc_id: str, payload: dict = Body(default={})) -> dict:
        from_step = (payload or {}).get("from_step") or "segment"
        if from_step not in STEP_REGISTRY:
            raise HTTPException(status_code=400, detail=f"未知步骤: {from_step}")
        marked = _orchestrator().invalidate(doc_id, from_step)
        return {"doc_id": doc_id, "marked": marked}

    @app.get("/api/docs/{doc_id}/excluded")
    def excluded_list(doc_id: str) -> dict:
        """已屏蔽内容清单（US-07）：规则命中的块 + 人工恢复过的块

        数据源是 `segment` 产物而非入库计划 —— 因为人工恢复的留痕（`exclude_by`）
        只存在于切块结果里。
        """
        from ..quality.noise import load_overrides

        orc = _orchestrator()
        store = orc.store_for(doc_id)
        seg = store.read_current_artifact("segment")
        if seg is None:
            return {"doc_id": doc_id, "excluded": [], "restored": [], "summary": {},
                    "overrides": {"restore": [], "exclude": []}, "ready": False}

        excluded: list[dict] = []
        restored: list[dict] = []
        for c in seg.get("chunks", []):
            row = {
                "kb_id": c["kb_id"], "title": c.get("title", ""),
                "header_path": c.get("header_path", ""), "page_idx": c.get("page_idx"),
                "rule": c.get("exclude_rule"), "reason": c.get("exclude_reason"),
                "by": c.get("exclude_by"), "chars": len(c.get("content") or ""),
                "chunk_type": c.get("chunk_type"),
            }
            if c.get("excluded"):
                excluded.append(row)
            elif c.get("exclude_by") == "manual_restore":
                restored.append(row)
        return {
            "doc_id": doc_id,
            "excluded": excluded,
            "restored": restored,
            "summary": seg.get("excluded_summary", {}),
            "overrides": load_overrides(store.edits_root),
            "ready": True,
        }

    def _toggle_exclude(doc_id: str, kb_id: str, action: str) -> dict:
        """恢复 / 屏蔽某块，并**立即重跑 segment→validate→index**（dry-run）让结果可见

        重跑是必要的：人工决定落 `edits/excludes.json`，而它的指纹已在 segment 的
        cache_key 里（TECH-015 §8.6），所以重跑会真实重算而不是命中旧缓存。
        """
        from ..quality.noise import load_overrides, save_overrides

        orc = _orchestrator()
        store = orc.store_for(doc_id)
        if store.current_run("segment") is None:
            raise HTTPException(status_code=409, detail="该文档还没有切块产物，请先跑六步")

        ov = load_overrides(store.edits_root)
        restore = set(ov.get("restore") or [])
        exclude = set(ov.get("exclude") or [])
        if action == "restore":
            restore.add(kb_id)
            exclude.discard(kb_id)
        else:
            exclude.add(kb_id)
            restore.discard(kb_id)
        save_overrides(store.edits_root, {"restore": sorted(restore), "exclude": sorted(exclude)})
        orc.invalidate(doc_id, "segment")

        meta = _doc_index().get(doc_id) or {"region": "cn"}
        result = orc.run_pipeline(doc_id, region=meta["region"], dry_run=True)
        return {"doc_id": doc_id, "kb_id": kb_id, "action": action,
                "overrides": {"restore": sorted(restore), "exclude": sorted(exclude)},
                "status": result["status"]}

    @app.post("/api/docs/{doc_id}/excluded/{kb_id}/restore")
    def restore_excluded(doc_id: str, kb_id: str) -> dict:
        return _toggle_exclude(doc_id, kb_id, "restore")

    @app.post("/api/docs/{doc_id}/excluded/{kb_id}/exclude")
    def exclude_chunk(doc_id: str, kb_id: str) -> dict:
        return _toggle_exclude(doc_id, kb_id, "exclude")

    # （2026-10-09 删除）队列端点 `GET /api/queue`、`POST /api/queue/resume`、
    # `POST /api/queue/cancel-all` 已随「处理进度」页一并移除（文档按篇处理，无队列 UI 场景）。
    # 队列本体保留：`kb_task` 表 + CLI（`kb-pipeline run --enqueue` / `queue --resume·--cancel-all` / `drain`）。

    # ── 前端静态资源托管（必须最后挂载）─────────────────────────────────────
    # Starlette 按注册顺序匹配：上面所有 /api 与 /health 已注册，故挂到 "/" 只兜底其余路径。
    # 本 SPA 用查询参数路由（?page=&doc=），不依赖 history 路由，故 `html=True` 足够，
    # 无需额外的 catch-all 重写到 index.html。
    if dist is not None:
        from fastapi.staticfiles import StaticFiles

        app.mount("/", StaticFiles(directory=str(dist), html=True), name="frontend")

    return app


app = None      # 由 `kb-pipeline serve` 或 uvicorn 工厂方式创建


def get_asgi_app():
    """uvicorn 工厂入口：`uvicorn kb_pipeline.web.api:get_asgi_app --factory`"""
    return create_app()
