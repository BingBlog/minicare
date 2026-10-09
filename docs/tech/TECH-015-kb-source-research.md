# TECH-015 附录 · KB 平台「原文 ↔ 解析结果」技术调研与实现细节

> 本文件从项目长期记忆（`.workbuddy/memory/MEMORY.md`）迁出，内容为 2026-10-03 的源码调研结论与
> US-14 对照页的实现细节。长期记忆只保留可操作要点，深度考证留在这里，避免记忆膨胀。
> 相关主文档：`docs/tech/TECH-015-kb-platform.md`、`minicare-platform/api/docs/KB-CONTRACT.md`。

## 1. 前端形态与路由

- 前端独立于 `minicare-platform/api/` 包，位于 `minicare-platform/web/`（React 18.3 + Vite 6 + Tailwind 3.4 + TS 5.6）。
- **形态由 dist 决定**：`web/api.py` 的 `frontend_dist()` 找 `minicare-platform/web/dist`；有则 FastAPI 同端口托管
  （`StaticFiles` 挂在 `/`，**必须最后挂载**），无则回退内嵌单页 v0。看 `/health` 的 `frontend` 字段
  （`react` / `embedded-v0`）。
- 路由用 **`?page=&doc=` 查询参数**（非 history 路由），静态托管不需要 SPA fallback。
- 改后端接口必须同步改前端 `src/lib/api.ts` + `src/lib/types.ts`；改页面契约同步 `src/nav.ts`。
- **新增页面必须同步三处**：`src/nav.ts` 的 `NAV`、`src/App.tsx` 的 `PAGES`、`web/ui.py` 的 `NAV`。
  若在 `ui.py` 标 `impl: True`，必须同时写回退页的精简实现。
- 当前 **16 个页面**（15 + US-14「原文对照」）。

## 2. 解析与切片 = 文档工作台（US-14，2026-10-03 二次改造）

**IA 约定**：解析与切片阶段**不是多个并列页**。

- 侧栏 ② 组只有 **2 项**：`source`（原文对照 / 工作台）+ `progress`（跨文档全局队列，刻意不并入）。
- 「文档库」已改名「**文档管理**」（侧栏 + 标题 + `ui.py` NAV 同步）。
- 文档管理列表**本身就是进度看板**：每行 6 个六步小片（短标签 + 耗时，按状态着色），悬停显示
  「状态 / 产物指纹 / 引擎 / 共跑过几次 / 统计」；KPI 多一个「六步全绿」。
  数据来自 `/api/overview` 的 `steps_detail`（`web/api.py:_steps_detail`，读 manifest 的 `runs[current_run]`）；
  异常吞掉返回 `{}`，不能让列表整体挂掉。
- 工作台 `src/pages/Workbench.tsx` = 文档头（状态 + 六步圆点 + 「处理详情/记录」入口）+ 页签 + 页签内容；
  核心视图是 `SourceCompare.tsx` 的 `CompareView`。
- 工作台页签 **5 个**：`compare`(默认) / `meta` / `review` / `numbers` / `excluded`
  —— 后 4 个直接复用原页面组件（只依赖 `useApp().doc`），不是重写。
- 「处理详情」+「处理记录」已合并成一个「**处理弹框**」，挂在文档管理上按行打开
  （`pages/ProcessingModal.tsx` + `components/Modal.tsx`，`?modal=processing`），复用
  `DetailPage`/`RecordsPage`（给它们加了 `docId` / `onChanged` 两个可选 prop）。
- **路由三套翻译**（`app-context.go()`，让各页面内部跳转一行都不用改）：
  `meta|review|numbers|excluded` → `page=source&tab=<id>`；
  `detail|records` → `page=corpus&modal=processing`；
  弹框内同页刷新（`go('corpus',{refresh:true})`）保留弹框（换页才关）。
- 文档管理点行 → 直达工作台（默认 `compare` 页签）；「跑六步」完成后刷新列表并打开处理弹框。

## 3. 左栏 pdf.js 连续滚动（对齐 mineru.net Extractor）

- `src/components/PdfDocument.tsx` 自研，**只用 pdf.js 核心 API**，不用官方 PDFViewer 组件
  （那会被内部结构绑架、无法自由叠 bbox 层）。竖向滚动即翻页；工具条 = 上/下页 + 页码 + 总页数 +
  缩放 ± + 适配栏宽（默认适配栏宽，对应 MinerU 截图里的 64%）。
- 版本与 MinerU **完全一致：pdfjs-dist 6.3.289**。pdf.js 与 worker 动态导入
  （主包 317KB，pdf chunk 483KB 懒加载，worker 1.27MB 运行时才取）。
- **运行期资源必须同源提供**：`cmaps/`（CJK 字形）、`standard_fonts/`、`wasm/`（jbig2/openjpeg/qcms），
  由 `scripts/copy-pdfjs.mjs` 从 node_modules 拷到 `public/pdfjs/`（4.3MB，已 gitignore），
  `dev`/`build` 前置自动执行。Vite 只打包 import 的 JS，**不会**带上这些数据文件。
- 每页 canvas 上叠一层按块类型着色的 bbox 框（百分比定位）；靠 `IntersectionObserver` 提前一屏渲染、
  未渲染时占位骨架（135 页的 NIAID 也扛得住）。
- 未做文字层（PDF 文字不可选中/搜索），代价换来结构可控；要加就在 canvas 上再叠 `renderTextLayer`。

## 4. 右栏 = 只有 Markdown / JSON 两个页签

- **已删掉「按页块列表」**；选块改为在左栏 PDF 上直接点框。
- **Markdown 是渲染后的 HTML**（`markdown-it` 15 + `src/lib/md-render.ts`）。⚠️ **必须 `html:true`**：
  MinerU 的 md 里**表格是原始 `<table>` HTML**（不是 md 表格语法）。同时做轻量清洗
  （去 `<script>/<style>/<iframe>`、去 `on*=` 事件属性、禁 `javascript:`），外链加
  `target=_blank rel=noopener noreferrer`。
- JSON 页签按块分段展示 content_list，**含页眉/页脚等不在 md 中的块并显式标注**。

## 5. 双向联动（我们的增量，MinerU 开源版没有）

- 块 ↔ md 片段通过**块下标 `block_i`** 绑定（后端 `md_chunks[].block_i` ↔ `blocks[].i`）。
- **点击**左栏框 → 右栏滚到并高亮该片段；**hover 只高亮不抢滚动**（避免抖动）。点右栏片段 → 左栏跳该页。
- 页眉/页脚/页码类块**不在 md 中**，点选时明确提示，而不是滚到错误位置。

## 6. bbox 高亮坐标（关键结论，别再重推）

- MinerU `content_list` 的 `bbox` 是 **[x1,y1,x2,y2]，每页归一化到 0~1000**：x 按页宽、y 按页高
  **各自**归一化，**不保持页面纵横比**。
- 实测证据：全库 11174 块，**全局最大值恰为 1000、越界 0 块**；header 块 y1 中位数 44（贴顶）。
- 源码互证：MinerU `render/_internal/content_list/common.py`
  > `def normalize_bbox(bbox): """把 MiddleJson 的 0-1 bbox 转换为 Content List 的 0-1000 整数框"""`
  > `return [int(value * 1000) for value in bbox]`
- ⇒ 前端**百分比定位**（`x/space*100`）即可，**与渲染倍率无关**。上限由后端 `bbox_space` 给出，
  **前端不写死 10**（否则后端改口径会静默错位）。

## 7. 服务端栅格化（兜底路径）

- `pypdfium2`（与 MinerU 同源 pdfium）渲页面图，按 `doc_id/scale` 缓存到 `data/pages/`。
  安装：`.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple "pypdfium2>=5.10.1,<6"`。
- ⚠️ **pdfium 非线程安全**，渲染必须加 `threading.RLock`（MinerU 用 `_pdfium_lock`）——
  FastAPI 同步端点跑在线程池里，不加锁会并发崩。

## 8. 后端 4 个只读端点（`web/routers.py`，均不碰数据库）

| 端点 | 说明 |
|---|---|
| `/api/docs/{id}/parsed` | 块 + `md_preamble`/`md_chunks`/`md_full`（无块对齐时的整份 md）/`bbox_space`/`render_*` + 统计 |
| `/source` | 源文件；PDF inline、HTML 走 `text/plain` |
| `/parsed/md` | Markdown 全文 |
| `/page/{n}.png?scale=2` | 页面图，`scale` 限 0.5~4 |
| `/img/{name}` | 文档产物图片，纯文件名白名单 |

## 9. md_align：Markdown ↔ 块的对齐（右侧联动高亮的底座）

`src/kb_pipeline/md_align.py`：沿 md 顺序查找每块 anchor，用相邻起点切片。

- **anchor 策略**：`text`→`text`；`list`→`list_items[0]`；`table`→`table_caption[0]`
  （退化时从 `table_body` HTML 抠首段文字）；`image`→`img_path`；
  **`header/footer/page_number/page_footnote` → `None`（MinerU 不写进 md）**。锚点短于 2 字符则跳过。
- ⚠️ **切片起点必须回退到行首**（`rfind('\n',0,pos)+1`），否则会把行首 markdown 语法截掉：
  标题丢 `## `、列表丢 `- `、图片丢 `![]( ` —— 图片那次还会连带让 `](images/` 改写模式匹配不到。
  实测踩到过，已修 + 有测试（`tests/test_md_align.py`）。
- 两个不变式有测试守：**单调不重叠** + **`preamble + Σ chunks == 原文`**（无损）。
- 实战数据：严重过敏共识 249 块 → 178 片段、45124 == 45124 无损、54 个页眉/页脚/页码块**零片段**。
- 图片相对路径 `![](images/x.jpg)` 要改成 `<img_url_base>/x.jpg` 才能在浏览器里加载。

**若干易忘细节**：

- 源 PDF 在 `docs/knowledge/source/raw/{国内|国际}/<doc_id>.pdf`；
  **4 份是下载页来源**（HTML，无 PDF / 无 content_list）→ 退化为「源文纯文本 ↔ 解析 Markdown」。
  当前 **16/20** 份可页级高亮对照。
- **块类型集合不固定**：实测量到 `aside_text`（NIAID 有 405 块）等，标签表必须原样回退。
  `FURNITURE_TYPES` 只含 `header/footer/page_number/page_footnote`；**`aside_text` 不算噪声**。
- **文件服务的安全模型**：先经 `doc_id` **白名单**（`scan_documents` 扫到的真实目录名）查表，
  查不到即 404 —— 不接受用户拼路径，天然阻断穿越。
- ⚠️ **别手写 `Content-Disposition`**：文档名几乎都是中文，HTTP 头只接受 latin-1，裸写会
  `UnicodeEncodeError` → **500**。用 `FileResponse(..., filename=..., content_disposition_type="inline")`
  交给 Starlette 做 RFC 5987。
- 未选定文档 / 未解析 / 未装栅格化依赖，三者都要**显式提示**而不是留白（验收场景 7/8）。

## 10. MinerU 官方「原文 ↔ 解析结果」是怎么实现的（源码调研）

调研对象：`/Users/bing/Study/minicare-platform/api/open-source/MinerU`（MinerU 本体仓）。

1. **架构分工（最关键）**：MinerU 仓里的 `mineru/render/*.py` 全是**薄门面**（`render_markdown`
   /`render_html` 内部 `from docvortex.render.xxx import ...` 惰性转调）。真正的渲染、页面栅格化、
   bbox 叠加、坐标换算都在**外部 PyPI 包 `docvortex`**（`docvortex>=0.5.4,<1`，MIT）里。
   → 只看 MinerU 仓会得出"没有实现"的错误结论。
2. **对照界面组件树**（`mineru/kit/gradio/app.py:498-554`，左右各 `scale=4`、固定高 775px）：
   - 左栏 `mineru-kit-preview`：`gr.File(pdf_preview, visible=False)` + `gr.HTML(mineru-kit-pdf-preview)`
     → 挂载**独立 PDF.js 预览页**；另有 image / office / source(html) / generic 预览分支
   - 右栏 `mineru-kit-results`：`gr.Tabs` 下**只有两个 Tab** —— `Markdown`（`gr.HTML`，渲染后 HTML）
     与 `JSON`（`gr.Code`，structured_content JSON）
   - **右侧没有"按页块列表"**；左侧没有页码同步回调
3. **左栏显示的其实是"框已烧进去的 PDF"**：`app.py:875`
   `preview_path = artifacts.layout_pdf_path or artifacts.origin_pdf_path`。
   叠加由 `docvortex.visualization.render_layout_pdf(pdf_bytes, pages)` 生成新 PDF：
   用 **reportlab 画框 + 7pt Helvetica 类型标签**，再用 **pypdf 合并**回原 PDF。
   所以截图里那个「文本」小徽标是**烤进 PDF 的矢量标注**，不是 DOM 叠加。
   配色表 `_BLOCK_COLORS` 用的是**细粒度类型**（`image_body`/`table_caption`/`chart_body`…）。
4. **PDF.js 是本地 vendor 的**（`mineru/resources/pdf_preview/vendor/pdfjs`，pdf.js 6.3.289，
   Apache-2.0，6.2MB / 284 文件，含 cmaps + standard_fonts + wasm）→ 完全离线、无 CDN。
   `viewer.html` 工具条 = 上/下页 + 页码输入 + 总页数 + 缩放 −/+ + fit-width，主体是 PDFViewer
   （连续滚动），默认 `fitWidth=true`（对应截图里的 64%）。
5. **bbox 坐标契约（权威定义）**：`docvortex/foundation/_coordinates.py` 的 `convert_bbox` 明确
   三个空间 `unit`(0~1) / `point` / `pixel`，其中 `pixel = point × render_scale`；
   `visualization.py` 注明 "bbox 使用页面显示方向下、以 CropBox 左上角为原点的归一化坐标"。
6. **栅格化参数**（`docvortex/document/pdf/raster.py`）：`scale = dpi/72`，
   `DEFAULT_PDF_IMAGE_DPI = 200`（≈2.78×），**长边上限 `DEFAULT_MAX_RENDER_EDGE = 3500` px**，
   超限则按长边回缩。与我们 `render_pages.py` 的固定 `scale=2.0` 不同——可对齐到 dpi 口径。
7. ⚠️ **pdfium 非线程安全**：`docvortex/document/pdf/pdfium.py` 用
   `_pdfium_lock = threading.RLock()` + `pdfium_guard()` 串行化，且有 fork 检测。
8. **MinerU 开源版没有"点击联动高亮"**：`resources/*.js` 搜不到 `page-idx`/`scrollTo`/
   `docvortex-page` 的自有逻辑（命中项全在 vendor 的 pdf.js/epub.js 内）；`_prepare_preview_links`
   只给外链加 `target=_blank`；`render_html_preview` 用 `RenderMode.DEFAULT`（展平、无分页锚点），
   只有 `RenderMode.FULL` 才输出 `<section class="docvortex-page" data-page-idx="N">`。
   ⇒ 「选中原文 → Markdown 对应高亮」是我们的增量需求；若要做，`data-page-idx` 是现成挂载点。

**研究产物**：DocVortex 0.5.8 wheel 已解包在 `/tmp/dv/src/docvortex`（4.3MB，可翻源码）。

## 11. 已知边界

- 高亮是**块级**（MinerU content_list 的粒度）；更细的 span 级对照需要 `middle_json`，
  而产物目录里没有。块级已够用（查漏字/错位/表格读坏）。
- 两个前端的 NAV 必须逐项一致（现在都是 10 项）：`src/nav.ts` 与 `web/ui.py` 的 `NAV`；
  `ui.py` 回退页为已下架但仍可访问的页 id 备了 `TAB_LABELS`（避免顶栏显示「—」）。
- ⚠️ **`ui.py` 回退页的交互未与 React 版对齐**（仍是单页图 + 按页块列表），已在页面顶部加醒目说明；
  要对齐需再写一遍（未做）。
