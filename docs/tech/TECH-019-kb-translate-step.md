# TECH-019 — 知识库「翻译」步骤（块级双语对）实现方案 · 阶段 A

> 文档编号：TECH-019 ｜ 版本：v1.0 ｜ 日期：2026-10-09 ｜ 状态：**已实施（阶段 A 落地；CLI + 接口实测通过，页面待人工过目）**
> 上游：[`TECH-018`](TECH-018-kb-multilingual-research.md)（多语言策略调研 → 本方案是其 §6.2 的落地实现，范围收窄为「阶段 A」）
> 配套：[`TECH-015`](TECH-015-kb-platform.md)（KB 平台）｜ [`TECH-015-kb-platform-gotchas.md`](TECH-015-kb-platform-gotchas.md)（缓存铁律）
> 代码基线：`minicare-platform/api/`（Python `kb_pipeline` + `web/` 后端）、`minicare-platform/web/`（React 前端）。所有"现状"描述均基于 2026-10-09 代码实测。
>
> **已按用户拍板（2026-10-09）**：
> ① 本批**只做阶段 A**（翻译链路 + 界面），不做迁移 / 检索消费 / agent-poc；
> ② 干跑（dry_run）**照常翻译**（与关键词网关一致，网页端跑完即可见）；
> ③ 人工修正译文入口**放在「解析详情 → 切片对照」TAB**（`ChunkCompareView`）；
> ④ 表格块**默认整块翻译**（保 HTML 结构），质量不行再退「只翻摘要」。

---

## 0. 结论摘要

| # | 结论 |
|---|---|
| **C-1** | 新增**第 7 步 `translate`**，拓扑 `validate → translate → index`；`index.requires` 改为 `("translate",)`，为「译文变更 → 索引自动标 stale」预留传导通道。 |
| **C-2** | 翻译**与 index 同源装配**：把 index 运行时的「validate 产物 + 人工编辑 + 复核结论」装配抽成共享函数，translate 与 index 都走它；`chunk_edits_hash` 进 translate 的缓存参数 —— 人工编辑后重跑，只有改过的块重新翻。 |
| **C-3** | **三层缓存**：内容级 `kb_translate_cache`（platform.db 新表，跨文档复用、省 token）＋ 步骤级 artifact（模型/prompt/术语表/人工编辑/可用性 五类参数）＋ 人工修正覆盖层。**全程不碰 `platform.version`、不升上游标记**。 |
| **C-4** | 干跑照常翻译（决策②）：翻译无库副作用，dry-run 与 `--write` 产物一致；先 dry 后 write 不会重复调 LLM。 |
| **C-5** | 人工修正走**覆盖层** `edits/translations.edited.json`：最高优先、重跑不丢、**不触发任何 invalidate**（只影响展示与未来消费层）。修正入口在「切片对照」TAB。 |
| **C-6** | 本批**不动任何检索物件**：无迁移、不写 `knowledge_base`、不改 embedding、不动 agent-poc。全库翻译实测成本在首份文档上先行记录。 |

---

## 1. 背景与范围

### 1.1 要解决什么

20 份语料（16 PDF + 4 HTML）中国际文献为英文原文。三个触点上"英文不友好"（详见 TECH-018 §1.1）：解析确认（人工核对）、检索（中文问 × 英文文档）、LLM 消费。本批解决**第一优先触点 + 为后续铺路**：

- **人工核对**：切片对照页提供「原文 ⇄ 译文」对照，机翻打标、可人工修正；
- **链路铺路**：译文作为「一等辅助产物」进入管线（块级双语对），阶段 B 的索引消费、评测、agent-poc 都建立在它的产物契约上。

### 1.2 本批范围（阶段 A）

| 做 | 不做（阶段 B 另案） |
|---|---|
| `translate` 步骤（第 7 步）+ 翻译网关 + 术语表 + 产物 `translate.json` | ❌ 迁移 025 / `knowledge_base.content_zh` |
| 干跑照常翻译（决策②） | ❌ index 消费译文 / embedding 策略 |
| 切片对照 TAB 的「译文对照 + 修正」 | ❌ 跨语言召回评测（阶段 B 前置） |
| 接口 3 个 + CLI 自动支持 + 文档同步 | ❌ agent-poc 消费拼装 / 契约版本 |
| 中文块自动跳过、表格整块翻（决策④） | ❌ 解析前翻译 / 查询翻译 / 换向量模型 |

---

## 2. 现状约束（代码事实，勿凭记忆开发）

| 事实 | 落点 |
|---|---|
| 六步注册表 + 拓扑自检 | `registry.py`：`STEP_ORDER` / `STEP_REGISTRY` / `assert_registry_consistent()` |
| 步骤执行/缓存/失效 | `orchestrator.py`：`default_params()` 参与 cache_key；`_run_step_inner` 有 **segment 的 `excludes_hash` 特例**（人工决定的指纹必须进参数，否则恢复后重跑命中旧缓存）——translate 照此手法 |
| 步骤契约 | `steps/__init__.py`：`run(ctx) -> (payload, stats)`；`get_step_func()` 显式分发；`local_only=False` 表示外部 IO |
| **人工产物不在 validate 产物里** | `steps/index.py` 开头才 `apply_chunk_edits` + `apply_resolutions`；`edits/store.py`（chunks.edited / review_resolutions / excludes） |
| LLM 网关范式 | `keywords.py`：DeepSeek OpenAI 兼容、JSON mode、内容 hash 缓存（`kb_keyword_cache`）、预算、**降级不报错**；`validate` 步骤调用 |
| prompt 目录约定 | `PROMPTS_DIR = minicare-platform/api/prompts/<touchpoint>/v<N>.md`（现有 keyword_extraction / metadata_extraction / metadata_schema） |
| 配置体系 | `config.py`（pydantic + `SECTION_MAP` + `effective_thresholds()`）＋ `config/pipeline.yaml`（阈值唯一权威） |
| platform.db | `platform_db.py` 单段 `SCHEMA` executescript；关键词缓存表就在其中 |
| 产物语义 | `artifact/store.py`：`write_run` 仅当 **artifact_hash 变化**才标下游 stale；`prune(keep=3)`；`mark_cached` 不触发失效传播 |
| CLI / Web 运行 | `run`/`step` 默认 dry-run，`--write` 开副作用；web `run_doc` **恒 dry_run=True**；`kb-pipeline steps` 动态读注册表（自动跟随） |
| 前端 | 「解析详情」= `Workbench.tsx` 工作台，切块 TAB = `ChunkCompareView`（`ChunkCompare.tsx`，左 PDF + 右切片列表 + 选中即操作面板）；步骤常量在 `labels.ts` / `nav.ts`（旧 `ui.py` 另有一份，已知漂移债务） |

⚠️ 一个必须写进设计视野的既有语义：`invalidate()` 只标 stale，**不改变 cache_key** —— 标脏后能否真正重跑，取决于"该步参数/上游 hash 是否变了"，否则要靠 `--force`。translate 的 `chunk_edits_hash` 正是让"人工编辑 → 重跑生效"在无 `--force` 时也能成立的机制（它同时让下游 index 经由译文产物的 hash 变化被动重算）。

---

## 3. 总体设计

### 3.1 拓扑与注册表变更

```python
STEP_ORDER = ("preflight", "parse", "normalize", "segment", "validate", "translate", "index")

# registry.py
"translate": StepSpec("translate", "翻译", ("validate",), "llm", "v1", "translate.json", local_only=False),
"index": StepSpec("index", "索引", ("translate",), ...),   # requires 从 ("validate",) 改为 ("translate",)
```

- `downstream_of()` / `prune` / `snapshot` / run_registry 的 `total_steps` **全部自动跟随**，无需改动；
- `index.requires` 改依赖的语义：译文产物变化 → index 自动标 stale（本批 index 尚未消费译文，重跑为无害空转；阶段 B 直接生效）；
- 步骤 label「翻译」；engine=`llm`、engine_version=`v1`（模型名走参数，见 §3.9）。

### 3.2 输入与「同源装配」（本方案最关键的一处）

**新增共享装配函数**（建议 `steps/finalize.py`）：

```python
def finalize_chunks(store, validate_payload, settings) -> tuple[list[dict], dict, dict]:
    """validate 产物 → 人工编辑 → 复核结论 → 最终块列表（+ edit_stats + review_stats）
    与 index.py 现行开头三段完全同源；index 重构为调用它（要求行为不变）。"""
```

- `steps/index.py` 重构为调用 `finalize_chunks()`（**纯重构、行为不变**，验收含等效性抽查）；
- `steps/translate.py` 同样调用它，并对每块计算 `src_hash = sha256(canonical_json({title, content}))[:16]`；
- **`chunk_edits_hash`**：`chunks.edited.json` + `review_resolutions.json` 的稳定指纹（照 `noise.overrides_hash` 手法），由 orchestrator 在 `_run_step_inner` 特例注入（与 segment 的 `excludes_hash` 同款）：
  - 人工编辑切片 / 内容复核 → `invalidate("segment")`（既有）→ 重跑时 translate 参数变化 → 真正重翻；
  - 注意：**`translations.edited.json`（修正译文）不进这个 hash** —— 修正译文不触发重跑（§3.8）。

### 3.3 产物 `translate.json`

```json
{
  "doc_id": "WAO_DRACMA_2012_牛奶蛋白过敏完整指南",
  "region": "intl",
  "model": "deepseek-v4-flash",
  "prompt_version": "v1",
  "glossary_version": "ab12cd34ef56",
  "counts": {"total": 128, "translated": 61, "cached": 35, "skipped_zh": 24,
             "skipped_excluded": 5, "failed": 3},
  "tokens": {"in": 48210, "out": 51230},
  "items": {
    "WAO_DRACMA_2012_牛奶蛋白过敏完整指南-12": {
      "status": "translated",            // translated | cached→translated（合并计数）| skipped_zh | skipped_excluded | failed
      "lang": "en",
      "zh": "……译文正文……",
      "title_zh": "……标题译文……",
      "quality": "mt",                   // mt（机翻）；人工修正不在产物里（见覆盖层）
      "src_hash": "9f2c0d…",
      "glossary_hit": ["eHF", "CMPA"]
    },
    "…-15": {"status": "skipped_zh", "lang": "zh"},
    "…-18": {"status": "failed", "lang": "en", "error": "HTTP 429（重试 1 次后仍失败）"}
  },
  "warnings": ["3 个块翻译失败（可在修正/重跑后补齐）"]
}
```

- `items` 覆盖**所有被考虑的块**（含跳过原因，界面可解释"为什么这块没有译文"）；
- 被屏蔽块（excluded/disabled）默认**不出现**在产物里（`translate_excluded=true` 时才翻）；
- **不要**在 payload 里放 dry_run / write 模式标记 —— 会污染内容寻址（artifact_hash 变化会让下游无谓标 stale）。
- **运行态统计不进 payload**（实施修正）：`counts.cached` / `tokens` 只进 manifest stats ——
  否则"内容没变、只是多命中几次缓存"也会改变 artifact_hash、把下游误标 stale（实测教训）。

### 3.4 语言判定与跳过规则（块级）

```python
def detect_lang(text) -> "zh" | "en" | "empty":
    cjk   = len(re.findall(r"[\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z][A-Za-z'\-]*", text))   # 词数
    if cjk + latin == 0: return "empty"
    return "zh" if cjk / (cjk + latin) >= skip_cjk_ratio else "en"   # 默认 0.5
```

| 规则 | 行为 |
|---|---|
| `lang == "zh"` / `"empty"` | 跳过（`skipped_zh`）—— 国内中文文档整体近零成本 |
| `excluded` / `disabled` | 跳过（`skipped_excluded`），除非 `translate_excluded=true` |
| `review` 块 | **照翻**（人工核对最需要它；入库拦不拦是既有机制的事） |
| 表格块（`chunk_type=table`，LLM 摘要 + HTML） | **整块翻**，prompt 约束保留 HTML 标签结构，只翻标签间文本（决策④） |
| 图片引用 / URL / 数字 / 单位 | prompt 层原样保留（§3.7） |

### 3.5 术语表

**新文件 `minicare-platform/api/config/glossary.yaml`**（与 pipeline.yaml 分离：一个是阈值、一个是术语数据；git 可 diff / review）：

```yaml
version: 1
terms:
  - { en: "CMPA", zh: "牛奶蛋白过敏", keep_en: true }          # 缩写：译文中保留英文
  - { en: "extensively hydrolyzed formula", zh: "深度水解配方" }
  - { en: "extensively hydrolyzed casein formula", zh: "深度水解酪蛋白配方" }
  - { en: "amino acid formula", zh: "氨基酸配方" }
  - { en: "partially hydrolyzed formula", zh: "适度水解配方" }
  - { en: "oral food challenge", zh: "口服食物激发试验" }
  - { en: "cow's milk protein allergy", zh: "牛奶蛋白过敏" }
  - { en: "immunoglobulin E", zh: "免疫球蛋白 E", keep_en: true }
```

- 起步 ~40 条（实施时整理）：`keywords.py::MED_TERMS` 现有词 + 20 份文档对照名 + CMPA 高频缩写（eHF / AAF / OFC / SPT / AD…）；
- 匹配：大小写不敏感子串（缩写要求词边界）；命中条数上限 `max_glossary_hits=20`；
- **只注入「该块命中的术语」**（控 token、保相关）；命中集合参与内容缓存键；
- `glossary_hash = sha256(canonical(terms))[:16]` 进步骤参数 —— 改术语表只重翻受影响块。

### 3.6 翻译网关（新模块 `src/kb_pipeline/translation.py`）

照抄 `keywords.py` 骨架（这是项目里已验证的 LLM 网关范式）：

```python
class TranslationGateway:
    """LLM 主路径 + 内容级缓存 + 预算 + 降级（无规则兜底，降级=未翻译）"""
    def __init__(self, db, settings): ...
        # api_key / base_url / model 全部从 settings 取（不要 os.environ，踩过）
    def translate_chunks(self, units) -> tuple[dict[str, Result], dict]:
        # ThreadPoolExecutor(cfg.concurrency=4)；每块重试 1 次（~1.5s 间隔）
        # 单块失败 → 记 failed 不中断；预算超限 → 剩余块标 failed(reason=budget)
        # 无 key / 网关异常 → 全部 failed(reason=no_key)，步骤仍 succeeded + warnings
```

- **内容级缓存**：platform.db 新表（追加到 `platform_db.py` 的 `SCHEMA`）：

  ```sql
  -- 翻译缓存：按 源文本+模型+prompt+术语命中 去重，跨文档复用，避免重复烧 token
  CREATE TABLE IF NOT EXISTS kb_translate_cache (
    cache_key      TEXT PRIMARY KEY,   -- sha256(model|prompt_version|hit_terms|text)[:32]
    zh             TEXT NOT NULL,
    title_zh       TEXT,
    model          TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at     TEXT NOT NULL
  );
  ```

- 预算默认：`budget_calls_per_doc=200` / `budget_tokens_per_doc=400000`（翻译的调用量显著高于关键词；
  实测含大表的 20 块文档 ≈ 15 万 token —— 表格 HTML 逐单元格翻译是 token 大头。**预算进步骤参数**：
  调大后重跑才能"补翻"此前被拦下的块；它是安全阀，不是成本闸）；
- **dry_run 行为**：照常翻译（决策②）。翻译无库副作用、产物内容与 write 模式一致，先 dry 后 `--write` 不会重复调 LLM。

### 3.7 prompt：`prompts/translation/v1.md`

要点（系统性约束，防幻觉 + 保结构 + 术语受控）：

1. 忠实翻译、**不增不减不总结**；不确定处保留英文并以 `（原文）` 标注；
2. 数字 / 剂量 / 单位 / 统计值 / 表格数值**原样保留**；药物名、缩写按术语表处理；
3. 术语注入占位 `{{GLOSSARY}}`（该块命中条目，en→zh，`keep_en` 的在译文中保留英文）；
4. 保留 Markdown 结构（标题层级 / 列表）与 HTML 标签（表格块只翻标签间文本）；
5. 参考编号 / URL / 图片路径（`images/…`）原样保留；
6. 输出 JSON：`{"title_zh": "…", "zh": "…"}`（无标题时 `title_zh` 输出空串）。

### 3.8 人工修正覆盖层

**新文件 `edits/translations.edited.json`**（`EditStore` 扩展 `load_translations / set_translation / clear_translation`）：

```json
{
  "entries": {
    "WAO_DRACMA_2012_牛奶蛋白过敏完整指南-12": {
      "zh": "人工修正后的译文",
      "src_hash": "9f2c0d…",
      "at": "2026-10-09T15:50:00+08:00"
    }
  }
}
```

- **优先级**：覆盖层 > 机翻。视图合并函数（step 不合并、**接口层与服务层合并**）：
  - `src_hash` 与当前装配块一致 → `quality: "reviewed"`，正常展示；
  - 不一致（正文被改过）→ 保留修正文本但标 **`stale: true`（译文过期）**，提示重翻/重校，不静默丢弃。
- **修正译文不触发任何 invalidate、不进 `chunk_edits_hash`** —— 它只影响展示层（与未来消费层）；
- 恢复入口：删除 overlay 条目 → 回到机翻值。

### 3.9 缓存与失效（参数清单）

translate 的步骤参数（全部经 `default_params()` + orchestrator 特例注入）：

| 参数 | 取值 | 什么时候必须变 |
|---|---|---|
| `translator` | `"llm@v1"` | 网关协议/交互逻辑变更时手动升 |
| `model` | `settings.kb_llm_model` | 换模型 |
| `prompt_version` | `"v1"` | 改 prompt 文案 |
| `glossary_hash` | glossary.yaml 指纹 | 改术语表 |
| `chunk_edits_hash` | 切片编辑+核对结论指纹 | 人工编辑切片 / 改复核结论 |
| `skip_cjk_ratio` / `translate_excluded` | 判定阈值 | 调判定策略 |
| `budget_calls_per_doc` / `budget_tokens_per_doc` | 预算 | 调预算（调大后重跑可"补翻"被拦块；已成功块走内容缓存） |
| `llm_available` | `bool(deepseek_api_key)` | 配/去 key（防"无 key 空产物被缓存、配好 key 后重跑被跳过"） |

失效传导（三条主路径）：

1. **改术语表** → translate 重跑（内容缓存只让命中受影响术语的块重翻）→ 产物 hash 变 → index 标 stale；
2. **人工编辑切片** → `invalidate("segment")`（既有）→ 全链重跑；translate 因 `chunk_edits_hash` 变化真重跑，未变块吃内容缓存；
3. **改 prompt / 模型** → translate 重跑；未变块因缓存键含 prompt/model 会重翻（属于预期）。

🚨 **铁律**：不动 `platform.version`；不升 parse / normalize / segment 的任何标记（见 gotchas §5）。

### 3.10 干跑与写模式（决策②的精确语义）

- translate **忽略 `ctx.dry_run`**：两种情况都真实翻译、都写产物与内容缓存；
- 产物 payload **不含** dry/write 标记 → dry→write 内容寻址一致、不重复烧 token；
- 副作用边界不变：`--write` 影响的仍只是 index 的写库 / 向量化；网页（恒 dry）跑完即可在对照页看到译文。

---

## 4. 接口设计（3 个新端点，`web/routers.py`）

| 端点 | 说明 |
|---|---|
| `GET /docs/{doc_id}/translation` | 读 translate 当前产物 + 覆盖层合并 + 过期检测。返回 `{ready, reason?, stats: {model, prompt_version, glossary_version, counts, tokens}, overlay_count, items: {kb_id: {status, lang, zh?, title_zh?, quality, stale?, glossary_hit?}}, warnings}`。`ready=false` 时给出原因（"还没有翻译产物"）。 |
| `POST /docs/{doc_id}/chunks/{kb_id}/translation` | body `{zh}` 保存人工修正 → 写覆盖层（含当前 `src_hash`）。守卫同 `chunk_edit`（`_guard`，拒绝携带 write 标记的 payload）。 |
| `POST /docs/{doc_id}/chunks/{kb_id}/translation/reset` | 删除覆盖层条目（回到机翻）。 |

- 过期检测复用 `finalize_chunks()` 装配 + `src_hash` 比对（与步骤同一口径，避免两处逻辑分叉）；
- 端点**不触发**任何 invalidate / 重跑。

## 5. 前端设计（`minicare-platform/web`）

### 5.1 组件与常量

| 文件 | 改动 |
|---|---|
| `src/lib/labels.ts` | `STEP_ORDER` 插入 `'translate'`；`STEP_LABEL.translate = '翻译'` |
| `src/nav.ts` | `STEP_SHORT.translate = '翻译'`；`STEP_BADGE` 补 `7: '⑦'`；`WORKBENCH_TABS` 的 `chunks` 页签 desc 补"含译文对照"（文案级） |
| `src/lib/types.ts` | 新增 `TranslationGet` / `TranslationItem` 类型 |
| `src/lib/api.ts` | `translation(docId)` / `chunkTranslation(docId, kbId, zh)` / `chunkTranslationReset(docId, kbId)` |
| `src/pages/ChunkCompare.tsx` | 核心改造（下节） |
| `src/styles.css` | 新增 `.ck-zh`（译文区块）/ `.ck-zh-tag`（标签）等 |
| `web/ui.py`（embedded-v0） | 顺手同步 STEP 常量（已知漂移债务，浅改） |

### 5.2 「切片对照」TAB 的交互设计（决策③）

1. **数据**：`ChunkCompareView` 并行新增 `api.translation(doc)`；未就绪/失败时不阻塞现状（该 TAB 原有功能零回归）。
2. **视图切换**（工具栏）：`原文 | 对照 | 译文` 三态，**默认「对照」**（英文有译文的块上下堆叠展示，中文/无译文块照旧显示原文）。
3. **译文区块**：`ck-item` 正文下方加 `.ck-zh` 区块；右上角标签：
   - `AI 翻译`（mt）/ `人工修正`（reviewed）/ `译文过期`（stale，附"正文已更新，建议重翻/重校"提示）
4. **修正入口**：选中块的操作面板（`ck-ops-bar`）新增「修正译文」按钮（该块有译文时出现）→ 展开内联表单（textarea 预填当前译文 + 字数对照）→ 按钮：`保存译文` / `恢复机翻`（有修正时）；
   - 保存后本地覆盖（参考既有 `markOverride` 模式，免整页重取）+ toast：**明确说明「修正只影响展示与后续消费，不触发管线重跑」**（与「编辑正文」的语义区分）；
5. **深链接兼容**：`?chunk=<kb_id>` 选中态不受影响。

---

## 6. 文件级改动清单

**后端（minicare-platform/api）**

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/kb_pipeline/registry.py` | 新增 translate spec；index.requires 改 `("translate",)` |
| 2 | `src/kb_pipeline/orchestrator.py` | `default_params` 加 translate 分支；`_run_step_inner` 特例注入 `glossary_hash` / `chunk_edits_hash` |
| 3 | `src/kb_pipeline/steps/__init__.py` | `get_step_func` 分发 `translate` |
| 4 | `src/kb_pipeline/steps/translate.py` | **新增**：步骤装配（finalize + 语言判定 + 网关调用 + 产物组包） |
| 5 | `src/kb_pipeline/steps/finalize.py` | **新增**：共享装配（自 index.py 抽取）；`chunk_src_hash()` 同处 |
| 6 | `src/kb_pipeline/steps/index.py` | 重构为调用 `finalize_chunks()`（行为不变） |
| 7 | `src/kb_pipeline/translation.py` | **新增**：TranslationGateway（LLM/并发/预算/缓存/降级）+ `detect_lang()` |
| 8 | `src/kb_pipeline/glossary.py` | **新增**：load / match / hash |
| 9 | `src/kb_pipeline/platform_db.py` | SCHEMA 追加 `kb_translate_cache` |
| 10 | `src/kb_pipeline/edits/store.py` + `edits/__init__.py` | 覆盖层读写 + `chunk_edits_hash()` |
| 11 | `src/kb_pipeline/config.py` | `TranslateConfig` + `SECTION_MAP` + `effective_thresholds` |
| 12 | `config/pipeline.yaml` | 新增 `translate:` 段（enabled / prompt_version / skip_cjk_ratio / budget / glossary_path / max_glossary_hits） |
| 13 | `config/glossary.yaml` | **新增**：起步 ~40 词条 |
| 14 | `prompts/translation/v1.md` | **新增**：翻译 prompt |
| 15 | `src/kb_pipeline/web/routers.py` | 3 个新端点（§4） |
| 16 | `src/kb_pipeline/web/ui.py` | STEP 常量同步（浅改） |

**前端（minicare-platform/web）**：见 §5.1 六行。

**文档**：本文件（TECH-019）｜`docs/README.md` 索引行｜`TODO.md` §九 状态更新｜实施后补 `TECH-015-kb-platform-gotchas.md` 新节（翻译缓存/踩坑）｜PRD-008「六步编排 → 七步」的变更说明（实施时回写，归属见 §9 Q-03）。

---

## 7. 实施顺序（建议按此批次提交）

1. **配置与数据**：`config.py` / `pipeline.yaml` / `prompts/translation/v1.md` / `config/glossary.yaml`；
2. **基础件**：`translation.py` 网关 + `platform_db.py` 表 + `glossary.py`；
3. **装配与人工层**：`steps/finalize.py`（抽取出）+ `index.py` 重构 + `edits` 覆盖层 + `chunk_edits_hash`；
4. **步骤接线**：`steps/translate.py` + `steps/__init__` + `registry.py` + `orchestrator.py`；
5. **接口**：`routers.py` 3 端点；
6. **前端**：labels/nav/types/api → `ChunkCompare.tsx` → `styles.css` → `ui.py`；
7. **实测验收 + 文档同步**（§8 + §6 文档行）。

---

## 8. 验收清单（KB 惯例：不跑 pytest 全量，只验当前功能）

准备：挑一份英文文档（如 `WAO_DRACMA_2012_牛奶蛋白过敏完整指南`，region=intl），确保上游产物就绪。

```bash
cd minicare-platform/api
# ① 上游就绪（未跑过才需要）
.venv/bin/kb-pipeline run  --doc <doc> --region intl --until validate
# ② 单步翻译（dry 即可——翻译无库副作用；决策②）
.venv/bin/kb-pipeline step --doc <doc> --step translate --region intl
# ③ 缓存验证：原样重跑 → 应为 skipped_cached（秒过）
.venv/bin/kb-pipeline step --doc <doc> --step translate --region intl
# ④ 术语表验证：改 1 条词条 → 重跑 → 只重翻命中该词条的块（看 stats 里的 cached 计数）
# ⑤ 中文文档：对一份国内文档跑 ②，应全 skipped_zh、零成本
```

| # | 断言点 | 期望 |
|---|---|---|
| V-1 | `translate.json` 结构 | items / counts / tokens / glossary_version 齐全；抽查 10 块译文质量（术语、数字、结构） |
| V-2 | 缓存命中 | 原样重跑 `skipped_cached`；改术语表后仅受影响块重翻 |
| V-3 | index 重构等效 | 抽取 finalize 后，对同一文档 `kb-pipeline step --step index --force`（dry）产物与重构前一致（除时长/时间戳） |
| V-4 | 切片对照页探针 | 8787 → 解析详情 → 切片对照：默认「对照」视图；切换「原文/译文」；标签正确（AI 翻译/人工修正/译文过期） |
| V-5 | 修正闭环 | 修正一块译文 → 刷新仍生效 → 「恢复机翻」回到 MT 值；正文编辑后再看 → 该块标「译文过期」 |
| V-6 | 无 key 降级 | 临时移 key 重跑 → 步骤 succeeded + warnings（不阻塞 index）；恢复 key 重跑 → 真翻译（不被空产物缓存跳过） |
| V-7 | 成本记录 | 首份文档 tokens 实测记录（写入 gotchas 或 memory）；全库预估 |
| V-8 | 步骤面 | `kb-pipeline steps` 显示 7 步；工作台步骤条 7 步；`kb-pipeline config` 显示 translate 段来源 |

---

## 9. 风险与开放项

| # | 项 | 说明 / 处置 |
|---|---|---|
| R-1 | 医学术语翻译质量 | 术语表迭代 + 每份抽样人工核对；不确定处 prompt 要求保留英文并标注；不用于任何"可引用事实"，原文仍是唯一权威 |
| R-2 | LLM 失败 / 限流 | 单块重试 1 次 + 预算上限 + 降级不阻塞；failed 块可在重跑后补齐（内容缓存兜住已成功的） |
| R-3 | 产物 prune(keep=3) 清旧 run | 内容缓存表保留翻译结果，重生成成本可忽略；无需改动 prune |
| R-4 | 与并发会话的改动冲突 | 另有会话在动 `SourceCompare`/前端；开工前先 `git status` 确认工作区，ChunkCompare 改动基于最新代码 |
| R-5 | 翻译与后续消费的语义漂移 | `src_hash` / `quality` / `stale` 三字段是阶段 B 消费的契约基线，本批就要写全 |
| Q-01 | `skip_cjk_ratio` 默认 0.5 | 中英混排块的判定可能需微调（实施时用真实块验证） |
| Q-02 | 修正范围 | 默认只修正文译文；`title_zh` 只读（后续需要再加） |
| Q-03 | PRD-008 回写形式 | 「六步 → 七步」属于对 PRD-008 的扩展，建议以「变更记录」形式回写 PRD-008（不与原六步决策冲突），实施时一并处理 |
| Q-04 | 其它页签的译文 | 内容复核 / 已屏蔽 / 解析结果（md 级）本批均不做，后续按需扩展 |

---

## 10. 与 TECH-018 的对应关系

- 本方案 = TECH-018 §6.2「P1 块级双语对」的落地实现（范围收窄为阶段 A，决策④表格整块翻）；
- TECH-018 §6.3（跨语言评测）与 §6.4（查询翻译 / 多语言向量）**不在本批**，是阶段 B 前置；
- TECH-018 的「反模式清单」在本方案的体现：原文不动（C-5/§3.8）、不参与对齐（§3.2）、术语表受控（§3.5）、失败降级可见（§3.6）。

---

## 11. 落地实况（2026-10-09 实施）

**状态：阶段 A 已落地**（CLI + 接口实测通过；页面交互式过目待人工）。

### 实现（与 §3–§5 设计的差异）

- 后端 16 个文件：`registry`（七步）/`orchestrator`（参数+注入）/`steps/{translate,finalize}`/`translation`/
  `glossary`/`platform_db`/`edits`/`config`/`pipeline.yaml`/`glossary.yaml`/`prompts/translation/v1.md`/
  `web/routers`/`web/ui.py`；前端 7 个文件：`labels`/`nav`/`steps`/`types`/`api`/`styles`/`ChunkCompare`。
- 实施中新增（必要补充）：
  1. **硬超时熔断**（180s，线程池 + `result(timeout)`）—— 与 keywords 同款护甲，防 DNS/代理挂起；
  2. **子进度上报**（「翻译 x/y」）—— 分钟级步骤的可见性，同「关键词抽取 x/y」；
  3. **预算进步骤参数** —— 调大预算后重跑才能"补翻"被拦下的块（否则命中旧缓存、看起来没生效）；
  4. 预算告警修正：仅在**确有块被拦**时触发（原先"最后一刀用完"也会误报）。

### 验证记录（2026-10-09）

| # | 项 | 结果 |
|---|---|---|
| V-1 | `AAP_2025.10_早期引入与过敏模式`（英文，20 块）首跑 | 20/20 成功；142s；27.4k in / 123.3k out（大表 HTML 为 token 大头）；抽查译文质量良好、术语命中生效 |
| V-2 | 改预算后重跑 | **20/20 走内容缓存**：97ms、0 次 LLM 调用、无误报告警 |
| V-3 | index 重构等效 | `finalize_chunks` 为纯抽取（行为不变），由 V-1/V-2 全链实测覆盖 |
| V-4 | 页面（静态级） | `tsc --noEmit` 0 错；`vite build` 通过；8787 已托管新包（bundle 含「修正译文 / AI 翻译」）；**交互式过目待人工** |
| V-5 | 修正闭环（API 级） | GET → POST 修正（`quality: reviewed` + `src_hash`）→ reset → 覆盖层清空，全通 |
| V-6 | 中文文档零成本（含语言判定） | 共识文档 37 块 = 35 跳过 + **1 英文摘要块正确翻译** + 1 屏蔽；仅 1 次调用（1.2k/3.2k token） |
| V-7 | 成本 | 首份英文文档 ≈ 15 万 token 量级（含大表）；中文文档近乎零 |
| V-8 | 步骤面 | `kb-pipeline steps` 显示 7 步；`translate:` 配置段来源 yaml；服务 `/api/overview` 返回 7 步 |

### 遗留

- 页面（切片对照三态视图 / 修正入口）人工过目一轮；
- 其余英文文档按需逐份跑（网页或 CLI，中文零成本）；
- 阶段 B 仍按 §10（迁移 `content_zh` / 跨语言评测 / index 消费 / agent-poc 契约）——另案评审后开工。
