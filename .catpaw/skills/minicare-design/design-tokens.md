# Minicare Design Tokens

完整的设计变量参考，对应 `common.css` 中的 `:root` 定义。

## 色彩系统

### 主色（玫瑰粉）
| Token | 值 | 用途 |
|-------|----|------|
| `--primary` | `#F87098` | 按钮、激活状态、强调色 |
| `--primary-dk` | `#E85580` | 深粉，hover/press 深色 |
| `--primary-lt` | `#FFF0F4` | 极浅粉，图标背景、选中态背景 |
| `--primary-md` | `#F8B8CC` | 中粉，描边、次级强调 |

> 旧别名 `--blue` / `--blue-lt` 等已在 common.css 映射到上述主色，兼容保留。

### 文字色（暖调，非冷灰）
| Token | 值 | 用途 |
|-------|----|------|
| `--text` | `#3D2B2E` | 主文字，暖棕灰 |
| `--sub-text` | `#9A7E82` | 次级文字，柔和暖灰 |

**特定场景硬编码色（不进 Token，直接 inline）：**
- 时间线标题：`#7A5A60`（柔和暖棕，比 --text 更轻）
- 快捷记录图标：`#F0B8C8`（浅粉）
- Tab 未激活图标：`#F0B8C8`
- Tab 激活图标/文字：`#E8507A`

### 灰度（暖灰，非冷灰）
| Token | 值 | 用途 |
|-------|----|------|
| `--gray-50` | `#FAFAFA` | hover 背景 |
| `--gray-100` | `#F5F5F5` | 分割线、按钮背景 |
| `--gray-200` | `#E8E8E8` | 边框 |
| `--gray-300` | `#D2D2D2` | 占位图标 |
| `--gray-400` | `#B09A9D` | 辅助文字（暖玫瑰灰） |
| `--gray-500` | `#9A7E82` | 同 --sub-text |
| `--gray-700` | `#5C4448` | 次级强调文字 |
| `--gray-900` | `#3D2B2E` | 同 --text |

### 辅色
| Token | 值 | 用途 |
|-------|----|------|
| `--yellow` | `#F8C870` | 暖金，辅食/状态图标 |
| `--yellow-dk` | `#C0922A` | 深金 |
| `--yellow-lt` | `#FFF8E6` | 浅金背景 |
| `--teal` | `#68D0B8` | 薄荷绿，数据/健康模块 |
| `--green` | `#4CAF82` | 成功/正常 |
| `--orange` | `#F5A623` | 警告/观察期 |
| `--red` | `#F05070` | 危险/过敏/错误 |
| `--red-lt` | `#FFF1F4` | 浅红背景 |

### 背景
| Token | 值 | 用途 |
|-------|----|------|
| `--bg` | `#FDF7F5` | 页面背景，暖白 |
| `--card-bg` | `#FFFFFF` | 卡片背景 |
| `--border` | `#EDE5E3` | 默认边框 |

## 英雄区渐变色（首页专属）

```css
/* 顶部 Header */
background: linear-gradient(180deg, #F87098 0%, #F9A8C0 100%);

/* Hero Section */
background: linear-gradient(180deg, #F9A8C0 0%, #F87098 60%, #F06090 100%);
```

## 圆角
| Token | 值 | 用途 |
|-------|----|------|
| `--radius-xl` | `24px` | Modal、Bottom Sheet |
| `--radius-lg` | `18px` | 内容卡片 |
| `--radius-md` | `12px` | 表单块、图标盒子 |
| `--radius-sm` | `8px` | 按钮、标签 |
| `--radius-xs` | `6px` | Badge、小标签 |

## 间距规律

- 页面边距：`16px`
- 卡片内边距：`16px 18px`
- 列表行高：`padding: 13px 16px`
- 卡片标题行：`padding: 14px 16px 6px`
- 卡片间间距：`margin: 12px 16px 0`

## 阴影
| Token | 值 | 用途 |
|-------|----|------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.06)` | 卡片默认 |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,.08)` | 悬浮元素 |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,.10)` | 模态框 |

内容卡片专用阴影（带粉色调）：
```css
box-shadow: 0 2px 12px rgba(200,100,120,.08), 0 1px 3px rgba(0,0,0,.04);
```

## 字体

```css
--font: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
```

### 字号层级
| 层级 | 大小 | 字重 | 用途 |
|------|------|------|------|
| 大标题 | `24px` | 700 | 页面主标题（早上好） |
| 标题 | `17-18px` | 700 | 导航标题、卡片大标题 |
| 正文 | `14-15px` | 500-600 | 列表标题、表单标签 |
| 辅助 | `12-13px` | 400-500 | 描述文字 |
| 标注 | `10-11px` | 500 | 卡片区域标签、Badge |
