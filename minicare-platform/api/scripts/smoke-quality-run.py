"""链路自测（临时库 + 桩嵌入）：验证进度 / 台账 / 指标 / delta / 中止。绝不碰真实台账。"""
import hashlib
import json
import math
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import kb_pipeline.embed.hunyuan as hy  # noqa: E402

from kb_pipeline.config import get_settings  # noqa: E402
from kb_pipeline.platform_db import PlatformDB  # noqa: E402
from kb_pipeline.quality.ledger import RecallLedger  # noqa: E402
from kb_pipeline.regression import RegressionRunner  # noqa: E402


def fake_embed(texts, settings, batch_size=16, model=None):
    out = []
    for t in texts:
        h = hashlib.sha256(t.encode("utf-8")).digest()
        vec = [((h[i % 32] / 255.0) - 0.5) for i in range(1024)]
        n = math.sqrt(sum(v * v for v in vec)) or 1.0
        out.append([v / n for v in vec])
    return out


hy.embed_texts = fake_embed  # 桩：只为链路自测，不代表检索质量

s = get_settings()
tmp = Path(tempfile.mkdtemp(prefix="quality-smoke-"))
db_path = tmp / "platform.db"
shutil.copy(s.platform_cfg.db_path, db_path)
db = PlatformDB(db_path)
r = RegressionRunner(s, db, tmp)
led = RecallLedger(db)

print("== run 1: modules:A ==")
prog = []
res1 = r.run(scope="modules:A", ledger=led,
             progress_cb=lambda done, total, cur, rec: prog.append((done, total, cur, rec and rec["case_id"])))
print("status:", res1["status"], "| run:", res1["run_id"], "| passed:", res1["passed"])
print("metrics:", json.dumps(res1["metrics"], ensure_ascii=False))
print("progress:", len(prog), "events; first:", prog[0], "; last:", prog[-1])
run1 = led.get_run(res1["run_id"])
c0 = run1["cases"][0]
print("ledger:", run1["status"], "| cases:", len(run1["cases"]),
      "| case0:", c0["case_id"], c0["verdict"], c0["attribution"],
      "| topk:", len(c0["topk"]), "| gold:", len((c0["expected"] or {}).get("gold") or []))

print("\n== run 2: modules:A（应产生 delta 对比 run1）==")
res2 = r.run(scope="modules:A", ledger=led)
run2 = led.get_run(res2["run_id"])
print("delta:", json.dumps(run2.get("delta"), ensure_ascii=False)[:400])

print("\n== run 3: 中止（跑到第 2 题后取消）==")
state = {"n": 0}


def cancel_after_two():
    return state["n"] >= 2


def counting_cb(done, total, cur, rec):
    state["n"] = done


res3 = r.run(scope="modules:A", ledger=led, progress_cb=counting_cb,
             cancel_check=cancel_after_two)
run3 = led.get_run(res3["run_id"])
print("status:", res3["status"], "| cancelled:", res3.get("cancelled"),
      "| cases kept:", len(run3["cases"]), "| run status:", run3["status"])

print("\n== 缺口联动（from_regression 用 run1 的结果）==")
from kb_pipeline.gaps import GapLedger  # noqa: E402

added = GapLedger(db).from_regression(res1)
print("gaps added:", [(g["attribution"], g["theme"][:16]) for g in added])

print("\n== 孤儿清扫 ==")
db.execute("UPDATE kb_recall_run SET status='running' WHERE run_id=?", (res3["run_id"],))
print("swept:", led.sweep_orphans(), "| baseline mirror:", (tmp / "quality" / "recall-baseline.json").exists())
print("tmp dir:", tmp)
