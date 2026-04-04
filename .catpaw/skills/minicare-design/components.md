# Minicare 组件规范速查

所有组件类名均来自 `common.css`，按需在页面 `<style>` 中覆盖细节。

## 图标系统

### 引入方式
所有页面末尾加载 `icons-sprite.js`，动态注入 SVG Symbol：
```html
<script src="icons-sprite.js"></script>
```

### 使用方式
```html
<svg class="icon" viewBox="0 0 24 24">
  <use href="#icon-{name}"></use>
</svg>
```

### 可用图标名（部分）
`milk` `moon` `smile` `ruler` `stethoscope` `triangle-alert`
`house` `clipboard-list` `bar-chart-2` `user-round`
`heart` `bell` `settings` `calendar` `trending-up`

### 图标颜色（必须用 `color`，不能用 `stroke`）
```css
.icon { color: #F0B8C8; }         /* 浅粉（默认图标） */
.icon { color: #DDB870; }         /* 暖金（状态/活动） */
.icon { color: #E8507A; }         /* 深粉（激活/强调） */
```

---

## 快捷记录宫格

```html
<div class="quick-grid">
  <!-- 默认粉色 -->
  <div class="quick-btn" onclick="nav('...')">
    <div class="qb-icon-box">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-milk"></use></svg>
    </div>
    <div class="qb-label">饮食</div>
    <div class="qb-sub">喂奶 / 辅食</div>
  </div>
  <!-- 暖色变体 -->
  <div class="quick-btn q-warm" onclick="nav('...')">
    <div class="qb-icon-box">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-smile"></use></svg>
    </div>
    <div class="qb-label">状态</div>
    <div class="qb-sub">便便 / 精神</div>
  </div>
  <!-- 警示变体（带红点 Badge） -->
  <div class="quick-btn q-alert" onclick="nav('...')">
    <div class="qb-icon-box">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-triangle-alert"></use></svg>
    </div>
    <div class="qb-label">症状</div>
    <div class="qb-sub">过敏 / 皮疹</div>
    <div class="qb-badge">!</div>
  </div>
</div>
```

**变体类：**
- 默认：无额外类，背景 `#FFF0F4`，图标色 `#F0B8C8`
- `q-warm`：背景 `#FFF8EC`，图标色 `#DDB870`
- `q-alert`：背景 `#FFF0F4`，图标色 `#F0A0B0`

---

## 内容卡片

```html
<!-- 简单标题 -->
<div class="content-card">
  <div class="card-label">区域标题</div>
  <!-- 内容 -->
</div>

<!-- 带右侧链接 -->
<div class="content-card">
  <div class="card-label-row">
    <span class="card-label">今日时间线</span>
    <span class="card-label-link" onclick="nav('records.html')">全部 ›</span>
  </div>
  <!-- 内容 -->
</div>
```

---

## 时间线列表行

```html
<div class="list-row" onclick="nav('...')">
  <span class="tl-time">08:45</span>
  <div class="tl-icon" style="background:#FFF0F4">
    <svg class="icon" style="color:#F0B8C8" viewBox="0 0 24 24">
      <use href="#icon-moon"></use>
    </svg>
  </div>
  <div class="tl-body">
    <div class="tl-title" style="color:#7A5A60">标题</div>
    <div class="tl-desc">描述文字</div>
  </div>
  <span class="tl-arrow">›</span>
</div>
```

---

## Tab Bar

完整 Tab Bar（带 FAB 中央按钮）：
```html
<div class="tab-bar">
  <div class="tab-item active">
    <div class="tab-icon-svg">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-house"></use></svg>
    </div>
    <span class="tab-label">首页</span>
  </div>
  <div class="tab-item" onclick="nav('records.html')">
    <div class="tab-icon-svg">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-clipboard-list"></use></svg>
    </div>
    <span class="tab-label">记录</span>
  </div>
  <div class="tab-fab" onclick="toggleFabSheet()">＋</div>
  <div class="tab-item" onclick="nav('report.html')">
    <div class="tab-icon-svg">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-bar-chart-2"></use></svg>
    </div>
    <span class="tab-label">报告</span>
  </div>
  <div class="tab-item" onclick="nav('profile.html')">
    <div class="tab-icon-svg">
      <svg class="icon" viewBox="0 0 24 24"><use href="#icon-user-round"></use></svg>
    </div>
    <span class="tab-label">我的</span>
  </div>
</div>
```

**各页面 `<style>` 中需添加激活图标颜色：**
```css
.tab-item .tab-icon-svg .icon        { color: #F0B8C8; }
.tab-item.active .tab-icon-svg .icon { color: #E8507A; }
```
文字颜色已由 common.css 统一为深粉 `#E8507A`。

---

## 导航栏（次级页面）

```html
<div class="nav-bar">
  <button class="nav-back" onclick="nav('home.html')">←</button>
  <span class="nav-title">页面标题</span>
  <span class="nav-action">操作按钮</span>  <!-- 可选 -->
</div>
```

---

## 表单区块

```html
<div class="form-section-title">区块标题</div>
<div class="form-section">
  <div class="form-row">
    <span class="form-label">字段名</span>
    <input class="form-input" type="text" placeholder="请输入" />
    <span class="form-arrow">›</span>
  </div>
  <div class="form-row">
    <span class="form-label">时间</span>
    <input class="form-input" type="time" value="08:00" />
  </div>
</div>
```

---

## 按钮

```html
<!-- 主要操作 -->
<button class="btn-primary" onclick="save()">保存记录</button>

<!-- 次要/取消 -->
<button class="btn-secondary" onclick="nav('home.html')">取消</button>
```

---

## Chip 选择器

```html
<div class="chip-row">
  <div class="chip selected">氨基酸奶粉</div>
  <div class="chip">深度水解</div>
  <div class="chip">普通奶粉</div>
</div>
```

---

## Badge / 标签

```html
<span class="badge tag-new">⚠️ 新食物 D3</span>    <!-- 暖金 -->
<span class="badge tag-allergy">过敏风险</span>      <!-- 红色 -->
<span class="badge tag-ok">观察正常</span>           <!-- 绿色 -->
<span class="badge tag-watching">观察中</span>       <!-- 橙色 -->
```

---

## Bottom Sheet / Modal

```html
<div class="modal-overlay" id="mySheet" onclick="closeSheet(event)">
  <div class="bottom-sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">标题</div>
    <!-- 内容 -->
  </div>
</div>
```

JS 控制：
```js
document.getElementById('mySheet').classList.toggle('show');
```

---

## Toast 提示

```html
<div class="toast" id="toast"></div>
```

```js
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✓ ' + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
```

---

## 进度条

```html
<div class="progress-bar-wrap">
  <div class="progress-bar-fill" style="width:42%; background:var(--primary)"></div>
</div>
```

---

## 空状态

```html
<div class="empty-state">
  <div class="empty-icon">📝</div>
  <div class="empty-title">暂无记录</div>
  <div class="empty-sub">点击下方 ＋ 开始记录宝宝的第一条数据</div>
</div>
```
