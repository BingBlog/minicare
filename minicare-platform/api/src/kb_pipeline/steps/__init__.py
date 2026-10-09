"""六步实现（薄封装，复用现有模块，不重写算法）

每步的契约：`run(ctx) -> (payload, stats)`
  - `payload` 会被 ArtifactStore 原子写入 `pipeline/{step}/{cache16}/{artifact}`
  - `stats` 进 manifest，供界面与统计使用
  - 步骤**不直接写库**（除 index 的真实写入路径），保持可重放

第 1 期的本地可验证性设计（便于在没有云凭证时跑通编排）：
  - `parse` 支持 `mode=local`：直接消费已在盘上的 MinerU 产物目录
  - `index` 支持 `dry_run`：只产出入库计划不写库、不调向量服务
这两条是为了「先验证骨架正确性」，不是最终形态 —— 见 TECH-015 §14 的分期。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ..artifact import ArtifactStore
from ..config import Settings

REGION_DIRS = {"cn": "国内", "intl": "国际"}


@dataclass
class StepContext:
    """步骤执行上下文（不含任何全局状态）"""

    settings: Settings
    store: ArtifactStore
    doc_id: str
    region: str = "cn"                     # cn / intl
    params: dict = field(default_factory=dict)
    source_dir: Path | None = None         # 源文件目录（预检/交叉校验用）
    out_dir: Path | None = None            # MinerU 产物根目录（parse 的 local 模式用）
    dry_run: bool = False                  # 只产出计划，不产生外部副作用
    db: object | None = None               # PlatformDB（台账 / 关键词缓存 / 人工决定）

    @property
    def region_dir(self) -> str:
        return REGION_DIRS.get(self.region, "国内")

    def resolved_source_dir(self) -> Path:
        return Path(self.source_dir or self.settings.source_dir)

    def resolved_out_dir(self) -> Path:
        return Path(self.out_dir or self.settings.out_dir)

    def upstream(self, step_id: str) -> dict:
        """读取上游步骤当前产物；未就绪直接报错（禁止盲跑）"""
        from ..artifact import UpstreamNotReady

        payload = self.store.read_current_artifact(step_id)
        if payload is None:
            raise UpstreamNotReady(f"步骤 {step_id} 无可用产物（current_run 缺失）")
        return payload

    def source_pdf(self) -> Path | None:
        """源 PDF 路径（数字交叉校验用）"""
        p = self.resolved_source_dir() / self.region_dir / f"{self.doc_id}.pdf"
        return p if p.exists() else None


def get_step_func(step_id: str):
    """按 step_id 返回实现函数（延迟导入，避免循环依赖）"""
    if step_id == "preflight":
        from .preflight import run
    elif step_id == "parse":
        from .parse import run
    elif step_id == "normalize":
        from .normalize import run
    elif step_id == "segment":
        from .segment import run
    elif step_id == "validate":
        from .validate import run
    elif step_id == "translate":
        from .translate import run
    elif step_id == "index":
        from .index import run
    else:
        raise KeyError(f"未知步骤: {step_id}")
    return run


__all__ = ["REGION_DIRS", "StepContext", "get_step_func"]
