---
name: minicare-design
description: 敏宝日记（minicare）项目的视觉风格指南。当用户需要对 minicare/ui-draft 下的任意 HTML 页面进行视觉升级、新增页面、统一样式、应用设计规范时使用。包含色彩 Token、图标规范、组件样式、页面结构模板，确保所有页面与 home.html 的视觉风格高度一致。
---

# Minicare 视觉风格指南

## 快速上手

处理任何 minicare 页面时，遵循以下核心原则：

1. **颜色全部走 CSS 变量**（见 design-tokens.md），禁止硬编码除下方规定以外的色值
2. **图标颜色用 `color` 控制**（非 `stroke`），因为通过 `<use href>` 引用 SVG symbol 时颜色走 `currentColor` 继承链
3. **字体颜色走暖调**，避免纯黑（`#1E1E1E`），用暖棕灰系（`#3D2B2E`/`#7A5A60`）
4. **卡片背景白色**，页面背景暖白 `#FDF7F5`，形成层次感

## 颜色速查

```css
/* 主色 */
--primary: #f87098; /* 玫瑰粉，按钮/激活/强调 */
--primary-lt: #fff0f4; /* 极浅粉，图标背景/选中态背景 */
--primary-md: #f8b8cc; /* 中粉，描边/次要 */

/* 文字 */
--text: #3d2b2e; /* 主文字，暖棕灰 */
--sub-text: #9a7e82; /* 次级文字，暖灰 */

/* 背景 */
--bg: #fdf7f5; /* 页面背景，暖白 */
--card-bg: #ffffff; /* 卡片背景 */
```

详细 Token 见 [design-tokens.md](design-tokens.md)

## 图标规范

### 颜色控制（关键！）

```css
/* ✅ 正确：通过 color 控制，走 currentColor 继承 */
.icon-box .icon {
  color: #f0b8c8;
}

/* ❌ 错误：stroke 对 <use> 引用的 symbol 无效 */
.icon-box .icon {
  stroke: #f0b8c8;
}
```

### 图标色阶

| 场景                  | 颜色      | 说明                           |
| --------------------- | --------- | ------------------------------ |
| 默认粉色图标          | `#F0B8C8` | 快捷记录/时间线，浅粉轻盈      |
| 暖色图标（状态/活动） | `#DDB870` | 搭配 `#FFF8EC` 背景            |
| 警示图标              | `#F0A0B0` | 过敏/症状，搭配 `#FFF0F4` 背景 |
| Tab 未激活            | `#F0B8C8` | 浅粉                           |
| Tab 激活              | `#E8507A` | 深粉                           |

### 图标盒子

```html
<!-- 标准粉色图标盒子 -->
<div class="qb-icon-box">
  <svg class="icon" viewBox="0 0 24 24"><use href="#icon-{name}"></use></svg>
</div>

<!-- 暖色图标盒子（状态/活动类） -->
<div class="qb-icon-box">
  <svg class="icon" style="color:#DDB870" viewBox="0 0 24 24">
    <use href="#icon-smile"></use>
  </svg>
</div>
```

## 页面结构模板

### 首页型（英雄区 + 内容卡片）

```html
<!-- 1. 英雄渐变区 -->
<div class="header">...</div>
<div class="hero-section">
  <div class="baby-card">...</div>
  <div class="sleep-banner">...</div>
  <!-- 可选 -->
</div>

<!-- 2. 内容卡片（间距 12px 16px） -->
<div class="content-card">
  <div class="card-label">区域标题</div>
  <!-- 内容 -->
</div>
```

### 表单页型（次级页面）

```html
<div class="nav-bar">
  <button class="nav-back" onclick="nav('home.html')">←</button>
  <span class="nav-title">页面标题</span>
  <span class="nav-action">操作</span>
</div>
<div class="scroll-area">
  <div class="form-section">
    <div class="form-row">...</div>
  </div>
  <button class="btn-primary">保存</button>
</div>
```

## Tab Bar 颜色规范

在每个带 Tab Bar 的页面 `<style>` 中添加：

```css
/* 未激活：浅粉图标 */
.tab-item .tab-icon-svg .icon {
  color: #f0b8c8;
}
/* 激活：深粉图标 */
.tab-item.active .tab-icon-svg .icon {
  color: #e8507a;
}
```

文字颜色已在 `common.css` 统一定义（深粉 `#E8507A`），无需重复。

## 时间线列表规范

```html
<div class="list-row" onclick="nav(...)">
  <span class="tl-time">08:45</span>
  <div class="tl-icon" style="background:#FFF0F4">
    <svg class="icon" style="color:#F0B8C8" viewBox="0 0 24 24">
      <use href="#icon-moon"></use>
    </svg>
  </div>
  <div class="tl-body">
    <div class="tl-title" style="color:#7A5A60">标题文字</div>
    <div class="tl-desc">描述文字</div>
  </div>
  <span class="tl-arrow">›</span>
</div>
```

关键点：

- 标题 `color: #7A5A60`（柔和暖棕，非纯黑）
- 图标背景 `#FFF0F4`（浅粉），颜色 `color: #F0B8C8`

## 应用到其他页面的步骤

1. 检查页面是否有 `color: var(--gray-400)` 等冷灰色 → 改为暖灰（`#B09A9D`）
2. 检查图标是否用 `stroke` 控制颜色 → 改为 `color`
3. 检查列表/记录行的标题是否为纯黑 → 改为 `#7A5A60`
4. 检查 Tab Bar 图标是否有激活/未激活状态分离 → 参考上方规范
5. 检查 `var(--blue)` 旧别名 → 已在 common.css 映射到主色，可保留

## 参考文件

- [design-tokens.md](design-tokens.md) — 完整色彩、间距、阴影 Token 表
- [components.md](components.md) — 所有组件的 CSS 类名和用法速查
