"""敏宝管理平台 · 本地 Web 层（v0）

定位：把已经跑通的 `kb_pipeline.orchestrator` 六步能力暴露成一个**本机可访问**的界面，
用于观察文档状态、跑 dry-run、单步重跑与作废。**不开放写库**（见 api.py 的写库闸门）。

设计取向（为什么是"无构建单页"而不是 React）：
  v0 的目标是"让编排在浏览器里可见、可操作"，而不是补齐 15 个页面。
  等前端真要做到内容校对、双栏对照这类重交互时，再按 TECH-015 §17.4 独立成
  `minicare-platform/` + React，本模块的 REST 契约可直接复用。
"""
from .api import create_app

__all__ = ["create_app"]
