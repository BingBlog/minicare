"""平台运行态库（本机 SQLite）：任务是队列，队列即表；台账、评测集、缺口、发布记录都在这里

对应 TECH-015 §6.1 的存储分布决策 —— **平台运行态放本机**，远程库只放检索面数据
（`knowledge_base` + `kb_search_log`）。这样"除最终入库外其余环节都在本机执行"才成立：
断网也能完成登记 → 解析 → 切块 → 校验 → 质检。

⚠️ 用标准库 sqlite3，不引入 ORM —— 单用户本机，schema 简单。
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from .fsutil import ensure_dir

SCHEMA = """
-- 文档处理工作流状态（暂停点确认结果，解决 TECH-015 Q-11）
-- 文档级人工产物：只存「信息确认」表单的取值（meta_json）
-- ⚠️ 早期还有 meta_confirmed / chunks_approved 两个「暂停点放行」标记列，
--    人工闸门机制已于 2026-10-09 整体移除，两列随之删除（历史库靠 PlatformDB._migrate 迁移）。
CREATE TABLE IF NOT EXISTS kb_doc_state (
  doc_id           TEXT PRIMARY KEY,
  region           TEXT NOT NULL DEFAULT 'cn',
  meta_json        TEXT,
  updated_at       TEXT NOT NULL
);

-- 语料档案 / 台账（US-01、US-02）
CREATE TABLE IF NOT EXISTS kb_corpus (
  doc_id           TEXT PRIMARY KEY,
  filename         TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL DEFAULT 0,
  kind             TEXT NOT NULL DEFAULT 'pdf',
  region           TEXT NOT NULL DEFAULT 'cn',
  source_name      TEXT NOT NULL,
  publisher        TEXT,
  year             INTEGER,
  evidence_level   TEXT,
  applicable_age   TEXT,
  license          TEXT,
  source_url       TEXT,
  obtained_at      TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  supersedes       TEXT,
  superseded_by    TEXT,
  kb_domain        TEXT NOT NULL DEFAULT 'default',
  status           TEXT NOT NULL DEFAULT 'pending',
  field_source     TEXT,
  note             TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corpus_status ON kb_corpus(status);

-- 任务队列
CREATE TABLE IF NOT EXISTS kb_task (
  task_id          TEXT PRIMARY KEY,
  doc_id           TEXT NOT NULL,
  kind             TEXT NOT NULL,
  step_id          TEXT,
  params_json      TEXT,
  force            INTEGER NOT NULL DEFAULT 0,
  state            TEXT NOT NULL DEFAULT 'queued',
  progress_hint    TEXT,
  error            TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  enqueued_at      TEXT NOT NULL,
  started_at       TEXT,
  finished_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_state ON kb_task(state, enqueued_at);
CREATE INDEX IF NOT EXISTS idx_task_doc   ON kb_task(doc_id);

-- 召回测试集与 gold 映射（US-11；PRD-011 起升级为三态口径）
--   · kb_recall_case：题目 + 三态标注（expect_json：gold/acceptable/negative 条目 + key_info）
--   · kb_recall_gold：**派生表** —— 由导入通道把「条目标注 × 条目→块映射」展开为块级三元组，
--     运行期按 tier 分组消费（只有 tier='gold' 参与召回率判定）
CREATE TABLE IF NOT EXISTS kb_recall_case (
  case_id    TEXT PRIMARY KEY,
  module     TEXT,
  question   TEXT NOT NULL,
  theme      TEXT,
  enabled    INTEGER NOT NULL DEFAULT 1,
  -- PRD-011 新增列（历史库由 PlatformDB._migrate 补列）
  risk       TEXT,                                      -- low / caution / emergency
  case_type  TEXT NOT NULL DEFAULT 'answerable',        -- answerable / out_of_scope（库外负样本题）
  expect_json TEXT,                                     -- {"gold":[{code,name}],"acceptable":[...],"negative":[...],"key_info":"…"}
  source     TEXT NOT NULL DEFAULT 'seed',              -- seed / online / manual
  note       TEXT
);
CREATE TABLE IF NOT EXISTS kb_recall_gold (
  case_id      TEXT NOT NULL,
  kb_id        TEXT NOT NULL,
  is_primary   INTEGER NOT NULL DEFAULT 1,
  gold_version TEXT NOT NULL DEFAULT 'v2-manual',
  mapped_at    TEXT NOT NULL,
  -- PRD-011 新增列
  tier         TEXT NOT NULL DEFAULT 'gold',            -- gold / acceptable / negative
  entry_code   TEXT,                                    -- KB-A3（该块由哪个条目展开而来）
  chunk_title  TEXT,                                    -- 块标题（展示用，导入时随映射表带上）
  PRIMARY KEY (case_id, kb_id)
);

-- ── 检索质检运行台账（PRD-011 §4）──────────────────────────────────────
-- 一次运行一行；逐题结果在 kb_recall_case_result。写入方 = RegressionRunner（进程内执行），
-- 与 Agent 测评台账（eval_run / eval_case_result）同库、同范式。
CREATE TABLE IF NOT EXISTS kb_recall_run (
  run_id          TEXT PRIMARY KEY,             -- 形如 20261009-200512
  scope           TEXT NOT NULL,                -- all / modules:A,C / emergency / out_of_scope
  scope_label     TEXT NOT NULL,                -- 展示用：全部（48 题）/ 模块 A·C / 仅高危 / 仅负样本
  top_k           INTEGER NOT NULL DEFAULT 10,  -- 指标截断档（同跑 5/10 两档）
  diag_depth      INTEGER NOT NULL DEFAULT 20,  -- 诊断深度（归因用）
  status          TEXT NOT NULL,                -- queued/running/completed/failed/cancelled
  started_at      TEXT,
  finished_at     TEXT,
  duration_ms     INTEGER,
  env_snapshot    TEXT,                         -- JSON：embedding 模型 / 检索参数 / 语料规模 / 用例集 hash / 口径版本 / git
  metrics         TEXT,                         -- JSON：{recall5, recall10, mrr, harmful_rate, emergency_recall, buckets, n, ...}
  thresholds      TEXT,                         -- JSON：{recall5_min, recall10_min, harmful_max, emergency_min, emergency_gate}
  passed          INTEGER,                      -- 1/0/NULL（未执行）
  baseline_run_id TEXT,                         -- 对比对象（上一次同范围 completed 运行）
  delta           TEXT,                         -- JSON：指标 delta + 用例级变化（新增未命中/已修复/持续）
  error           TEXT,                         -- 失败/中止摘要
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recall_run_created ON kb_recall_run(created_at DESC);

CREATE TABLE IF NOT EXISTS kb_recall_case_result (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         TEXT NOT NULL,                 -- 关联 kb_recall_run.run_id
  case_id        TEXT NOT NULL,                 -- A-04 / F-01 / N-01
  module         TEXT,
  risk           TEXT,
  question       TEXT,
  verdict        TEXT NOT NULL,                 -- hit / miss / out_of_scope
  attribution    TEXT,                          -- map_stale / excluded / ranked / coverage（miss 时）
  first_hit_rank INTEGER,                       -- 首个 gold 位次（NULL=未命中）
  top1_score     REAL,
  expected       TEXT,                          -- JSON：gold/acceptable/negative 块清单（含 entry_code 与存活 state）
  topk           TEXT,                          -- JSON：[{rank, kb_id, title, score, tier}]
  best_rank      TEXT,                          -- 诊断：gold 最佳位次（"7" 或 "gt20"）
  harmful        TEXT,                          -- JSON：top5 中命中 negative 层的块
  ms             INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recall_case_run ON kb_recall_case_result(run_id);
CREATE INDEX IF NOT EXISTS idx_recall_case_case ON kb_recall_case_result(case_id);

-- 知识缺口（US-12）
CREATE TABLE IF NOT EXISTS kb_gap (
  gap_id        TEXT PRIMARY KEY,
  theme         TEXT NOT NULL,
  attribution   TEXT NOT NULL,
  occurrences   INTEGER NOT NULL DEFAULT 1,
  evidence      TEXT,
  suggestion    TEXT,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'open',
  close_reason  TEXT,
  linked_doc_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_gap_theme_attr ON kb_gap(theme, attribution);

-- 发布记录（US-10）
CREATE TABLE IF NOT EXISTS kb_publish (
  publish_id     TEXT PRIMARY KEY,
  published_at   TEXT NOT NULL,
  target_env     TEXT NOT NULL,
  snapshot_name  TEXT NOT NULL,
  docs_added     INTEGER NOT NULL DEFAULT 0,
  docs_updated   INTEGER NOT NULL DEFAULT 0,
  chunks_written INTEGER NOT NULL DEFAULT 0,
  vectors_written INTEGER NOT NULL DEFAULT 0,
  check_result   TEXT,
  verify_result  TEXT,
  forced         INTEGER NOT NULL DEFAULT 0,
  rolled_back_at TEXT
);

-- 关键词缓存（US-09）：按块内容 hash 去重，避免重复烧 token
CREATE TABLE IF NOT EXISTS kb_keyword_cache (
  content_hash   TEXT PRIMARY KEY,
  keywords       TEXT NOT NULL,
  source         TEXT NOT NULL,
  prompt_version TEXT,
  created_at     TEXT NOT NULL
);

-- 翻译缓存（TECH-019 §3.6）：按 源文本+模型+prompt+术语命中 去重，跨文档复用
CREATE TABLE IF NOT EXISTS kb_translate_cache (
  cache_key      TEXT PRIMARY KEY,
  zh             TEXT NOT NULL,
  title_zh       TEXT,
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

-- ── Agent 测评台账（PRD-010 §3）─────────────────────────────────────────
-- 一次运行一行；逐用例结果在 eval_case_result。写入方 = agent_eval.runner（平台侧），
-- Node harness 只输出报告 JSON，不碰库（D4：入库由 Python 侧执行）。
CREATE TABLE IF NOT EXISTS eval_run (
  run_id        TEXT PRIMARY KEY,            -- 形如 20261009-183012
  task_id       TEXT,                        -- 来源任务（TECH-021 §3.5；手工发起为 NULL）
  scope         TEXT NOT NULL,               -- all / group:l1 / ids:L1-01,R1-03
  scope_label   TEXT NOT NULL,               -- 展示用：全部（46 条）/ 分组 L1 / 指定 2 条
  judge         INTEGER NOT NULL DEFAULT 1,  -- 是否启用判分（TECH-026 B4 起 = 是否执行 deepeval 判分阶段）
  runs_n        INTEGER NOT NULL DEFAULT 1,  -- 消抖轮次
  status        TEXT NOT NULL,               -- running/completed/failed/cancelled
  started_at    TEXT,
  finished_at   TEXT,
  duration_ms   INTEGER,
  env_snapshot  TEXT,                        -- JSON：模型/judge/db/用例集 hash/git
  summary       TEXT,                        -- JSON：通过数 + 闸门六项
  error         TEXT,
  scoring       TEXT,                        -- 判分阶段（TECH-026 §4.2）：pending/running/done/failed/skipped
  scoring_error TEXT,
  scoring_meta  TEXT,                        -- JSON：引擎版本/模型/耗时/失败数
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_run_created ON eval_run(created_at DESC);

CREATE TABLE IF NOT EXISTS eval_case_result (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         TEXT NOT NULL,
  case_id        TEXT NOT NULL,
  grp            TEXT,
  priority       TEXT,
  desc           TEXT,
  pass           INTEGER NOT NULL,
  stage          TEXT,                       -- ok/deterministic/judge/error
  detail         TEXT,
  ms             INTEGER,
  tool_calls     TEXT,                       -- JSON：[{name,input,ms}]
  answer         TEXT,                       -- 回答全文（D10：不截断）
  judge          TEXT,                       -- JSON：忠实/完整/护栏/风格明细
  trace_id       TEXT,
  force_finished INTEGER NOT NULL DEFAULT 0,
  attribution        TEXT,                   -- 归因（TECH-026 §2）：env/data/exec/judge/skill；通过=NULL
  attribution_source TEXT,                   -- auto（入库自动）/ manual（人工改判）
  attribution_note   TEXT,                   -- 人工改判备注
  tokens_json        TEXT,                   -- JSON：{input,output,cacheRead,cacheCreation,total}
  sample_score       REAL,                   -- 样本分（TECH-026 §5.2：指标分算术平均；第 2 期）
  indicator_scores   TEXT                    -- JSON：{indicator_id: 指标分}（第 2 期）
);
CREATE INDEX IF NOT EXISTS idx_eval_case_run ON eval_case_result(run_id);

-- ── Agent 测评配置对象（TECH-021 §3 / TECH-026 §4.3）：指标 / 维度 / 裁判 / 用例 / 任务 ──
-- DB 为运行时唯一源；运行时由平台「物化」为 harness / 判分引擎可读的 JSON（评测语义零重写）。
CREATE TABLE IF NOT EXISTS eval_indicator (
  indicator_id TEXT PRIMARY KEY,             -- 如 ind-outcome（指标＝判分维度的聚合层，TECH-026 §3.3）
  name         TEXT NOT NULL,                -- 结果符合预期 / 安全合规 / 回答质量
  description  TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_dimension (
  dim_id       TEXT PRIMARY KEY,            -- 如 dim-faithfulness（稳定 id）
  name         TEXT NOT NULL,
  level        TEXT NOT NULL,               -- case（逐例判分）/ run（结果聚合）
  grp          TEXT,                        -- 归属组：l0..l4 / gate / custom
  description  TEXT,
  score_type   TEXT NOT NULL DEFAULT 'boolean',  -- boolean / numeric / categorical
  threshold    REAL,                        -- numeric 通过阈值；boolean 留空
  weight       REAL NOT NULL DEFAULT 1,     -- 综合分加权（第 2 期起参与指标分聚合）
  must_pass    INTEGER NOT NULL DEFAULT 0,  -- 一票否决（安全类默认开）
  indicator_id TEXT,                        -- 归属指标（TECH-026 §4.3）
  reverse      INTEGER NOT NULL DEFAULT 0,  -- 反向维度（分值取 1-x）
  metric_key   TEXT,                        -- 判分输出键（默认由 dim_id 推导）
  judge_id     TEXT,                        -- 归属裁判（裁判中心化：维度是裁判内部配置；run 级为 NULL）
  criteria     TEXT,                        -- 判定要点（判分引擎优先读取；缺省回退裁判 params.criteria → 内置模板）
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_judge (
  judge_id     TEXT PRIMARY KEY,            -- 如 jdg-faithfulness
  dim_id       TEXT NOT NULL,               -- 兼容字段：首维绑定（裁判→维度 1:N 后仅记录首维；主绑定在 dimension.judge_id）
  name         TEXT NOT NULL,               -- 裁判名（= 业务场景名，如「医疗安全审查」）
  description  TEXT,                        -- 业务场景说明（裁判中心化改版新增）
  type         TEXT NOT NULL,               -- llm / code
  model        TEXT,                        -- llm 裁判模型（默认 deepseek-v4-pro）
  temperature  REAL NOT NULL DEFAULT 0,
  prompt       TEXT,                        -- 评分器 system prompt（判定标准与输出格式约束）
  code_ref     TEXT,                        -- code 型：内置断言器引用（首期仅记录）
  metric_type  TEXT NOT NULL DEFAULT 'ternary',  -- 判分引擎类型（TECH-026 §3.3）：ternary/geval/builtin:xxx
  params_json  TEXT,                        -- JSON：引擎参数（criteria 覆盖、变量引用等）
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_case (
  case_id      TEXT PRIMARY KEY,            -- 沿用现有 id（L1-01 / R1-03）
  grp          TEXT NOT NULL,               -- l0..l4 / r1
  priority     TEXT,                        -- P0/P1/P2
  desc         TEXT,
  message      TEXT NOT NULL,
  ctx_json     TEXT,
  history_json TEXT,
  expect_json  TEXT NOT NULL,               -- 确定性断言（harness 语义原样保留）
  judge_json   TEXT,                        -- judge 配置（faithfulness/completeness/guardrail/style）
  extra_json   TEXT,                        -- 未归类字段（r1 的 kbRecall 等）原样保留
  tags         TEXT,                        -- 逗号分隔：capability / safety / realdata / regression（回归集）…
  source_json  TEXT,                        -- 来源链（US-18 飞轮）：{type:'derive',from_case,from_run}；NULL=种子
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_task (
  task_id      TEXT PRIMARY KEY,            -- 如 task-r1-regression
  name         TEXT NOT NULL,
  scope_json   TEXT NOT NULL,               -- 用例选择：{groups,ids,tags,priorities,all}
  dims_json    TEXT,                        -- 维度子集（null=全部启用维度）
  judge        INTEGER NOT NULL DEFAULT 1,  -- 是否判分（C11 起为派生值：judge_id 非空 = 1；保留供运行快照/展示兼容）
  judge_id     TEXT,                        -- 关联裁判（C11：任务下拉选择；NULL = 不启用判分）
  runs_n       INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- ── 信号管理域（TECH-029 / PRD-014）───────────────────────────────
CREATE TABLE IF NOT EXISTS signal_draft (
  id           INTEGER PRIMARY KEY CHECK (id = 1),  -- 单草稿设计
  content      TEXT NOT NULL,                       -- JSON {items:[{key,newValue,reason,evidence}], baseFingerprint, updatedAt}
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_snapshot (
  version          TEXT PRIMARY KEY,                -- 'YYYY-MM-DD.N'
  created_at       TEXT NOT NULL,
  reason           TEXT,
  diff             TEXT,                            -- JSON 值级 diff [{key,before,after}]
  file_fingerprint TEXT,                            -- sha256(signals.yaml) 前 16 位
  status           TEXT NOT NULL DEFAULT 'current', -- current | superseded | rolled_back
  forced           INTEGER NOT NULL DEFAULT 0       -- 强制发布标记
);

CREATE TABLE IF NOT EXISTS signal_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  action     TEXT NOT NULL,   -- draft_save|draft_discard|publish|force_publish|rollback|review|review_config|deploy_confirm|external_register
  object_key TEXT,
  before     TEXT,
  after      TEXT,
  reason     TEXT
);

CREATE TABLE IF NOT EXISTS signal_param_state (
  key              TEXT PRIMARY KEY,
  last_reviewed_at TEXT,
  review_note      TEXT
);

-- 信号域通用小配置（S7）：reviewCycleDays=医学参数复审周期（天）
CREATE TABLE IF NOT EXISTS signal_setting (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS signal_run (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT NOT NULL,
  kind           TEXT NOT NULL,   -- value | diff | assert
  datasource     TEXT NOT NULL,
  baby           TEXT,
  draft_hash     TEXT,
  result_summary TEXT             -- JSON（截断存储）
);

"""

STATE_QUEUED = "queued"
STATE_RUNNING = "running"
STATE_DONE = "done"
STATE_FAILED = "failed"
STATE_CANCELLED = "cancelled"
ACTIVE_STATES = (STATE_QUEUED, STATE_RUNNING)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _add_cols(conn: sqlite3.Connection, table: str, existing: set[str],
              cols: dict[str, str]) -> None:
    """逐列探测补列（SQLite `ALTER TABLE ADD COLUMN`；缺哪列补哪列，幂等）。"""
    for name, ddl in cols.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def new_id() -> str:
    return str(uuid.uuid4())


class PlatformDB:
    """平台运行态库（单文件 SQLite）"""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        ensure_dir(self.db_path.parent)
        with self._conn() as conn:
            conn.executescript(SCHEMA)
            self._migrate(conn)

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        """历史库的列级迁移。

        SQLite 没有 ``DROP COLUMN IF EXISTS``，只能先用 ``PRAGMA table_info`` 探测再删；
        补列则逐列探测后 ``ALTER TABLE ADD COLUMN``（默认值必须是常量）。
        当前做五件事：
        ① 移除 `kb_doc_state` 的两个「暂停点放行」标记列（人工闸门机制已整体移除，2026-10-09）；
           ⚠️ `meta_json` **必须保留** —— 「信息确认」表单的人工取值仍在用它。
        ② Agent 测评：`eval_run.task_id`（TECH-021 §3.5）——旧库补列，新库由 SCHEMA 直接建出。
        ③ 检索质检台（PRD-011）：`kb_recall_case` 五列 + `kb_recall_gold` 三列 —— 旧库补列。
        ④ Agent 测评报告 2.0（TECH-026 §2）：`eval_case_result` 归因与 Token 四列 —— 旧库补列。
        ⑤ 信号治理（TECH-029 S7）：`signal_param_state` 复审两列 —— 旧库若在建表时尚无这两列则补齐。
        """
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(kb_doc_state)")}
        for col in ("meta_confirmed", "chunks_approved"):
            if col in cols:
                conn.execute(f"ALTER TABLE kb_doc_state DROP COLUMN {col}")
        # Agent 测评：eval_run.task_id（TECH-021 §3.5）——旧库补列，新库由 SCHEMA 直接建出
        ev_cols = {r["name"] for r in conn.execute("PRAGMA table_info(eval_run)")}
        if ev_cols and "task_id" not in ev_cols:
            conn.execute("ALTER TABLE eval_run ADD COLUMN task_id TEXT")
        # Agent 测评判分阶段（TECH-026 §4.2）：scoring 三列 —— 逐列探测补列
        _add_cols(conn, "eval_run", ev_cols, {
            "scoring": "TEXT",
            "scoring_error": "TEXT",
            "scoring_meta": "TEXT",
        })
        # Agent 测评报告 2.0（TECH-026 §2）：归因体系 + Token 明细 —— 逐列探测补列
        ecr_cols = {r["name"] for r in conn.execute("PRAGMA table_info(eval_case_result)")}
        _add_cols(conn, "eval_case_result", ecr_cols, {
            "attribution": "TEXT",
            "attribution_source": "TEXT",
            "attribution_note": "TEXT",
            "tokens_json": "TEXT",
            # 第 2 期：样本分 / 指标分拆解（TECH-026 §4.3）
            "sample_score": "REAL",
            "indicator_scores": "TEXT",
        })
        # 第 2 期：维度挂指标 / 反向 / 判分输出键；裁判判分引擎类型与参数（TECH-026 §4.3）
        dim_cols = {r["name"] for r in conn.execute("PRAGMA table_info(eval_dimension)")}
        _add_cols(conn, "eval_dimension", dim_cols, {
            "indicator_id": "TEXT",
            "reverse": "INTEGER NOT NULL DEFAULT 0",
            "metric_key": "TEXT",
            # 裁判中心化改版（C6）：维度归属裁判 + 判定要点（引擎优先读取）
            "judge_id": "TEXT",
            "criteria": "TEXT",
        })
        judge_cols = {r["name"] for r in conn.execute("PRAGMA table_info(eval_judge)")}
        _add_cols(conn, "eval_judge", judge_cols, {
            "metric_type": "TEXT NOT NULL DEFAULT 'ternary'",
            "params_json": "TEXT",
            # 裁判中心化改版（C6）：业务场景说明
            "description": "TEXT",
        })
        # 任务 × 裁判关联（C11）：任务下拉选择裁判（judge 布尔退化为派生值）
        task_cols = {r["name"] for r in conn.execute("PRAGMA table_info(eval_task)")}
        _add_cols(conn, "eval_task", task_cols, {
            "judge_id": "TEXT",
        })
        # 用例来源链（US-18 飞轮）：派生用例记录 {type:'derive',from_case,from_run}
        case_cols = {r["name"] for r in conn.execute("PRAGMA table_info(eval_case)")}
        _add_cols(conn, "eval_case", case_cols, {
            "source_json": "TEXT",
        })
        # 检索质检台（PRD-011）：用例三态标注与映射分层 —— 逐列探测补列
        case_cols = {r["name"] for r in conn.execute("PRAGMA table_info(kb_recall_case)")}
        _add_cols(conn, "kb_recall_case", case_cols, {
            "risk": "TEXT",
            "case_type": "TEXT NOT NULL DEFAULT 'answerable'",
            "expect_json": "TEXT",
            "source": "TEXT NOT NULL DEFAULT 'seed'",
            "note": "TEXT",
        })
        gold_cols = {r["name"] for r in conn.execute("PRAGMA table_info(kb_recall_gold)")}
        _add_cols(conn, "kb_recall_gold", gold_cols, {
            "tier": "TEXT NOT NULL DEFAULT 'gold'",
            "entry_code": "TEXT",
            "chunk_title": "TEXT",
        })
        # 信号治理（TECH-029 S7）：复审两列 —— 旧库补列（新库由 SCHEMA 直接建出）
        sps_cols = {r["name"] for r in conn.execute("PRAGMA table_info(signal_param_state)")}
        _add_cols(conn, "signal_param_state", sps_cols, {
            "last_reviewed_at": "TEXT",
            "review_note": "TEXT",
        })

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def execute(self, sql: str, args: tuple = ()) -> None:
        with self._conn() as conn:
            conn.execute(sql, args)

    def query(self, sql: str, args: tuple = ()) -> list[dict]:
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql, args).fetchall()]

    def query_one(self, sql: str, args: tuple = ()) -> dict | None:
        rows = self.query(sql, args)
        return rows[0] if rows else None

    def upsert(self, table: str, key_cols: list[str], values: dict) -> None:
        """按 key_cols 幂等 upsert（本机库不需要复杂 ORM）"""
        cols = list(values)
        placeholders = ",".join("?" for _ in cols)
        updates = ",".join(f"{c}=excluded.{c}" for c in cols if c not in key_cols)
        sql = (
            f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
            + (f" ON CONFLICT({','.join(key_cols)}) DO UPDATE SET {updates}" if updates else " ON CONFLICT DO NOTHING")
        )
        self.execute(sql, tuple(values[c] for c in cols))


# ── 任务队列 ────────────────────────────────────────────────────────────


class TaskQueue:
    """单用户任务的持久化队列（`kb_task` 表即队列）"""

    def __init__(self, db: PlatformDB | Path) -> None:
        self.db = db if isinstance(db, PlatformDB) else PlatformDB(db)
        self.db_path = self.db.db_path

    def _conn(self):
        return self.db._conn()

    def enqueue(
        self,
        doc_id: str,
        kind: str = "pipeline",
        step_id: str | None = None,
        params: dict | None = None,
        force: bool = False,
    ) -> str:
        task_id = new_id()
        self.db.execute(
            "INSERT INTO kb_task (task_id, doc_id, kind, step_id, params_json, force, state, enqueued_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (task_id, doc_id, kind, step_id, json.dumps(params or {}, ensure_ascii=False),
             1 if force else 0, STATE_QUEUED, _now()),
        )
        return task_id

    def next_queued(self) -> dict | None:
        return self.db.query_one(
            "SELECT * FROM kb_task WHERE state=? AND cancel_requested=0 ORDER BY enqueued_at LIMIT 1",
            (STATE_QUEUED,),
        )

    def position(self, task_id: str) -> int:
        row = self.db.query_one("SELECT enqueued_at, state FROM kb_task WHERE task_id=?", (task_id,))
        if row is None or row["state"] != STATE_QUEUED:
            return 0
        n = self.db.query_one(
            "SELECT COUNT(*) AS c FROM kb_task WHERE state=? AND cancel_requested=0 AND enqueued_at <= ?",
            (STATE_QUEUED, row["enqueued_at"]),
        )
        return int(n["c"]) if n else 0

    def _update(self, task_id: str, **fields: Any) -> None:
        if not fields:
            return
        cols = ", ".join(f"{k}=?" for k in fields)
        self.db.execute(f"UPDATE kb_task SET {cols} WHERE task_id=?", (*fields.values(), task_id))

    def mark_running(self, task_id: str) -> None:
        self._update(task_id, state=STATE_RUNNING, started_at=_now())

    def mark_done(self, task_id: str) -> None:
        self._update(task_id, state=STATE_DONE, finished_at=_now())

    def mark_failed(self, task_id: str, error: str) -> None:
        self._update(task_id, state=STATE_FAILED, error=error[:2000], finished_at=_now())

    def mark_cancelled(self, task_id: str) -> None:
        self._update(task_id, state=STATE_CANCELLED, finished_at=_now())

    def set_progress(self, task_id: str, hint: str) -> None:
        self._update(task_id, progress_hint=hint)

    def request_cancel(self, task_id: str) -> bool:
        row = self.db.query_one("SELECT state FROM kb_task WHERE task_id=?", (task_id,))
        if row is None:
            return False
        if row["state"] == STATE_QUEUED:
            self._update(task_id, state=STATE_CANCELLED, cancel_requested=1, finished_at=_now())
        else:
            self._update(task_id, cancel_requested=1)
        return True

    def cancel_all(self) -> int:
        rows = self.db.query("SELECT task_id FROM kb_task WHERE state IN (?,?)", ACTIVE_STATES)
        return sum(1 for r in rows if self.request_cancel(r["task_id"]))

    def is_cancel_requested(self, task_id: str) -> bool:
        row = self.db.query_one("SELECT cancel_requested FROM kb_task WHERE task_id=?", (task_id,))
        return bool(row and row["cancel_requested"])

    def get(self, task_id: str) -> dict | None:
        return self.db.query_one("SELECT * FROM kb_task WHERE task_id=?", (task_id,))

    def list_tasks(self, state: str | None = None, limit: int = 100) -> list[dict]:
        if state:
            return self.db.query(
                "SELECT * FROM kb_task WHERE state=? ORDER BY enqueued_at DESC LIMIT ?", (state, limit)
            )
        return self.db.query("SELECT * FROM kb_task ORDER BY enqueued_at DESC LIMIT ?", (limit,))

    def stats(self) -> dict[str, int]:
        return {
            r["state"]: int(r["c"])
            for r in self.db.query("SELECT state, COUNT(*) AS c FROM kb_task GROUP BY state")
        }

    def resume_orphans(self) -> list[str]:
        """进程重启恢复：把上次崩溃遗留的 running 任务退回 queued（断点续跑由产物保证）"""
        rows = self.db.query("SELECT task_id FROM kb_task WHERE state=?", (STATE_RUNNING,))
        for r in rows:
            self._update(r["task_id"], state=STATE_QUEUED, started_at=None,
                         progress_hint="进程重启后重新入队")
        return [r["task_id"] for r in rows]


# ── 文档工作流状态（暂停点） ─────────────────────────────────────────────


class DocStateStore:
    """每份文档的人工产物：目前只存「信息确认」表单的取值（`meta_json`）。

    历史沿革：这里原本还存 `meta_confirmed` / `chunks_approved` 两个**暂停点**的确认结果
    （为解决 TECH-015 Q-11 的"派生状态无法长期正确"而落库）。人工闸门机制已于
    2026-10-09 整体移除 —— 保存元数据现在只是记录人工核对结果，不再决定流程能否继续。
    """

    def __init__(self, db: PlatformDB | Path) -> None:
        self.db = db if isinstance(db, PlatformDB) else PlatformDB(db)

    def get(self, doc_id: str) -> dict:
        row = self.db.query_one("SELECT * FROM kb_doc_state WHERE doc_id=?", (doc_id,))
        if row is None:
            return {"doc_id": doc_id, "region": "cn", "meta_json": None}
        return row

    def upsert(self, doc_id: str, *, region: str | None = None,
               meta: dict | None = None) -> dict:
        cur = self.get(doc_id)
        region = region or cur.get("region") or "cn"
        meta_json = json.dumps(meta, ensure_ascii=False) if meta is not None else cur.get("meta_json")
        self.db.upsert(
            "kb_doc_state",
            ["doc_id"],
            {"doc_id": doc_id, "region": region, "meta_json": meta_json,
             "updated_at": _now()},
        )
        return self.get(doc_id)
