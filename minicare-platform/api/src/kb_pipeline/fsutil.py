"""文件系统小工具

`ensure_dir` 存在的理由：`Path.mkdir(exist_ok=True)` 在正常情况下对已存在目录是幂等的，
但在**沙箱/被劫持的 mkdir**（如某些 IDE 的 shim 会拦截 mkdir 并对已存在路径抛
`PermissionError(EEXIST)`）下会失败 —— 而本项目大量使用"确保目录存在"这一模式，
且产物目录天然会被反复创建（同参数重跑、断点续跑）。

因此统一走"先判断、再创建"，既避免无谓系统调用，也不依赖 exist_ok 的实现细节。
"""
from __future__ import annotations

from pathlib import Path


def ensure_dir(path: Path | str) -> Path:
    """幂等创建目录（已存在则直接返回，不调用 mkdir）"""
    p = Path(path)
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)
    return p


__all__ = ["ensure_dir"]
