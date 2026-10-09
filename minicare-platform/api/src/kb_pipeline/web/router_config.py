"""全局配置路由：/api/config/*（「全局配置」页的后端）

四个端点（契约见各函数 docstring）：
  · GET  /api/config/detail —— 全量配置明细（管线条数 + 环境变量/密钥）
  · PUT  /api/config/save   —— 批量写入（yaml + .env），校验 → 备份 → 写回 → 热重载
  · POST /api/config/reload —— 重新读取磁盘配置（文件被手工改过时用）
  · GET  /api/config/raw    —— 原始文件预览（只读；仅 pipeline.yaml，.env 含密钥不落 DOM）

⚠️ 本路由写的是**本机平台配置文件**（pipeline.yaml / .env），不是知识库 ——
   与 `ALLOW_WRITE` 闸门无关（该闸门拦的是写 DB `knowledge_base`，见 api.py 顶部说明）。
   写前备份与校验在 `kb_pipeline/config_center.py` 里统一实现。
"""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..config import reload_settings
from ..config_center import ConfigError, build_detail, read_raw_file, save_config

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/detail")
def config_detail() -> dict:
    """全量配置明细：分组 × 字段的 生效值 / 代码默认 / 是否写入 yaml / 中文说明 + .env 各项状态"""
    return build_detail()


@router.put("/save")
def config_save(payload: dict = Body(default={})) -> dict:
    """批量保存配置修改。

    载荷：`{"yaml": [{"group": "chunk", "key": "chunk_size", "value": 800}],
            "env":  [{"key": "TOKENHUB_API_KEY", "value": "sk-…"}]}`
    任何一项非法 → 422 且**不做任何写入**（先全量校验，后落盘）。
    成功 → 返回 `{ok, count, applied, backups, yaml_loaded, detail}`（detail 为写后最新明细）。
    """
    try:
        return save_config(list(payload.get("yaml") or []), list(payload.get("env") or []))
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("/reload")
def config_reload() -> dict:
    """重新读取磁盘上的 pipeline.yaml / .env（热重载；文件被手工编辑过时用）"""
    reload_settings()
    return build_detail()


@router.get("/raw")
def config_raw(name: str = "pipeline") -> dict:
    """原始文件预览（只读）。`name` 目前仅支持 `pipeline`。"""
    try:
        return read_raw_file(name)
    except ConfigError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
