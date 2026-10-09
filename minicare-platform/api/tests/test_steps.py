"""六步实现：预检 / 正文清洗 / 切块 / 内容复核 / 索引（本地可验证路径，不依赖云服务）"""
from __future__ import annotations

from kb_pipeline.artifact import ArtifactStore
from kb_pipeline.steps import StepContext
from kb_pipeline.steps import preflight as preflight_step


def _ctx(settings, tmp_path, corpus, **kw) -> StepContext:
    return StepContext(
        settings=settings,
        store=ArtifactStore(tmp_path / "data", corpus["doc_id"], settings.platform_cfg.version),
        doc_id=corpus["doc_id"],
        region=corpus["region"],
        source_dir=corpus["source_dir"],
        out_dir=corpus["out_dir"],
        **kw,
    )


# ── 预检 ────────────────────────────────────────────────────────────────


def test_preflight_detects_scanned_pdf(blank_pdf, repo_settings, tmp_path):
    """全空白页 PDF → 必须判为扫描件并要求 OCR（替代手工维护的 ocr_files 清单）"""
    ctx = _ctx(repo_settings, tmp_path, blank_pdf)
    payload, stats = preflight_step.run(ctx)
    assert payload["kind"] == "pdf"
    assert payload["page_count"] == 3
    assert payload["scanned_pages"] == [0, 1, 2]
    assert payload["need_ocr"] is True
    assert payload["scanned_ratio"] == 1.0
    assert stats["need_ocr"] is True


def test_preflight_reports_missing_source(corpus, repo_settings, tmp_path):
    """源文件缺失不应抛异常，而是标记 + 给 warning（不阻塞流程）"""
    ctx = _ctx(repo_settings, tmp_path, corpus)
    payload, _ = preflight_step.run(ctx)
    assert payload["source_missing"] is True
    assert "source_missing" in payload["warnings"]
    assert payload["recommended_tier"] == "standard"


def test_preflight_html_needs_no_ocr(corpus, repo_settings, tmp_path):
    region_dir = corpus["source_dir"] / "国内"
    region_dir.mkdir(parents=True, exist_ok=True)
    (region_dir / f"{corpus['doc_id']}.html").write_text("<html><body>hi</body></html>", encoding="utf-8")
    ctx = _ctx(repo_settings, tmp_path, corpus)
    payload, _ = preflight_step.run(ctx)
    assert payload["kind"] == "html"
    assert payload["need_ocr"] is False
    assert payload["recommended_tier"] == "standard"


# ── 解析（local 模式：消费已在盘上的 MinerU 产物）────────────────────────


def test_parse_local_collects_product_and_copies_raw(corpus, repo_settings, tmp_path):
    from kb_pipeline.steps import parse as parse_step

    ctx = _ctx(repo_settings, tmp_path, corpus)
    payload, stats = parse_step.run(ctx)
    assert payload["mode"] == "local"
    assert payload["md_chars"] > 0
    assert payload["content_list_path"]
    assert stats["images"] == 1
    # raw/ 原样保留（PRD FR-1.6）
    assert (ctx.store.raw_root / f"{corpus['doc_id']}.md").exists()
    assert (ctx.store.raw_root / "images" / "tbl-1.png").exists()


def test_parse_cloud_without_token_raises_clearly(corpus, repo_settings, tmp_path):
    from kb_pipeline.steps import parse as parse_step

    region_dir = corpus["source_dir"] / "国内"
    region_dir.mkdir(parents=True, exist_ok=True)
    (region_dir / f"{corpus['doc_id']}.pdf").write_bytes(b"%PDF-1.4 dummy")

    ctx = _ctx(repo_settings, tmp_path, corpus, params={"mode": "cloud"})
    try:
        parse_step.run(ctx)
    except RuntimeError as e:
        assert "MINERU_API_TOKEN" in str(e)
    else:
        raise AssertionError("缺 token 时应明确报错，而不是静默失败")


def test_parse_cloud_without_source_raises_clearly(corpus, repo_settings, tmp_path):
    from kb_pipeline.steps import parse as parse_step

    ctx = _ctx(repo_settings, tmp_path, corpus, params={"mode": "cloud"})
    try:
        parse_step.run(ctx)
    except FileNotFoundError as e:
        assert "未找到源文件" in str(e)
    else:
        raise AssertionError("源文件缺失时应明确报错")


# ── 编排链路（用真实语料跑 normalize → segment → validate → index）─────


def _run_chain(orc, corpus, **kw):
    return orc.run_pipeline(
        corpus["doc_id"],
        region=corpus["region"],
        source_dir=corpus["source_dir"],
        out_dir=corpus["out_dir"],
        dry_run=True,
        **kw,
    )


def test_normalize_fixes_heading_levels(orc, corpus):
    """标题层级修复：MinerU 全输出 `##`，需按编号规则恢复层级"""
    _run_chain(orc, corpus, until="normalize")
    res = orc.run_step(corpus["doc_id"], "normalize", region=corpus["region"], force=True,
                       source_dir=corpus["source_dir"], out_dir=corpus["out_dir"])
    assert res.status == "succeeded"
    payload = orc.store_for(corpus["doc_id"]).read_current_artifact("normalize")
    md = payload["md"]
    assert "\n## 一、定义" in md, "中文章节号应保持 h2"
    assert "\n### （一）IgE介导" in md, "## （一）→ ###"
    assert "\n#### 1. 肥大细胞直接激活" in md, "无 # 前缀的编号短行应被补为 h4"
    assert payload["heading_count"] >= 10


def test_normalize_removes_sup_and_page_furniture(orc, corpus):
    """清洗必须真正生效：去 <sup> 引用 + 去期刊页眉行"""
    doc_id = "脏文档_2026"
    md_dir = corpus["out_dir"] / "国内" / doc_id
    md_dir.mkdir(parents=True)
    md_dir.joinpath(f"{doc_id}.md").write_text(
        "## 一、测试\n\n这是一段<sup>[1]</sup>正文。\n\n中华预防医学杂志 2025 年 6 月第 59 卷第 6 期\n\n## 二、另一节\n\n内容。",
        encoding="utf-8",
    )
    md_dir.joinpath("c_content_list.json").write_text("[]", encoding="utf-8")

    orc.run_pipeline(doc_id, region="cn", until="normalize", meta_confirmed=True, dry_run=True,
                     source_dir=corpus["source_dir"], out_dir=corpus["out_dir"])
    md = orc.store_for(doc_id).read_current_artifact("normalize")["md"]
    assert "<sup>" not in md, "应去掉 <sup> 引用标记"
    assert "[1]" not in md
    assert "中华预防医学杂志" not in md, "应去掉期刊页眉/卷期行"
    assert "这是一段正文。" in md, "正文内容必须保留"


def test_segment_produces_section_and_table_chunks(orc, corpus):
    _run_chain(orc, corpus, until="segment")
    payload = orc.store_for(corpus["doc_id"]).read_current_artifact("segment")
    chunks = payload["chunks"]
    assert chunks, "切块不应为空"
    kinds = {c["chunk_type"] for c in chunks}
    assert "section" in kinds
    assert "table" in kinds, "表格必须独立成块（自研切块的关键差异点）"
    for c in chunks:
        assert c["header_path"], "每块必须有章节路径"
        assert len(c["kb_id"]) <= 32, "kb_id 受 VARCHAR(32) 唯一键约束"


def test_validate_flags_missing_numbers(orc, corpus):
    _run_chain(orc, corpus, until="validate")
    payload = orc.store_for(corpus["doc_id"]).read_current_artifact("validate")
    assert payload["review_items"], "样例里的‘为 次’‘（ 岁）’必须被数字门禁命中"
    for item in payload["review_items"]:
        assert item["reason"].startswith("数字缺失")
        assert item["kb_id"]
    # 命中 review 的块必须升为 caution 以上（医疗安全门禁）
    review_ids = {i["kb_id"] for i in payload["review_items"]}
    for c in payload["chunks"]:
        if c["kb_id"] in review_ids:
            assert c["review"] is True
            assert c["risk_level"] != "low"


def test_index_dry_run_emits_plan_without_side_effects(orc, corpus):
    _run_chain(orc, corpus)
    payload = orc.store_for(corpus["doc_id"]).read_current_artifact("index")
    assert payload["mode"] == "dry_run"
    assert payload["counts"]["chunks_total"] == len(payload["plan"])
    statuses = {p["retrieval_status"] for p in payload["plan"]}
    assert statuses <= {"enabled", "review"}
    assert any(w.startswith("dry_run") for w in payload["warnings"])


def test_segment_is_deterministic(orc, corpus):
    """同输入两次切块结果必须逐字节一致（决定缓存与可复现性）"""
    _run_chain(orc, corpus, until="segment")
    store = orc.store_for(corpus["doc_id"])
    first = store.read_current_artifact("segment")["chunks"]
    orc.run_step(corpus["doc_id"], "segment", region=corpus["region"], force=True,
                 source_dir=corpus["source_dir"], out_dir=corpus["out_dir"])
    second = store.read_current_artifact("segment")["chunks"]
    assert first == second


# ── US-07 噪声块治理：端到端 ────────────────────────────────────────────


def _make_noise_corpus(corpus, doc_id: str):
    """造一份「正文 + 末尾参考文献」的合成语料，并给 content_list 页码（位置判定用页码）"""
    import json

    md_dir = corpus["out_dir"] / "国内" / doc_id
    md_dir.mkdir(parents=True)
    body = "\n\n".join(f"## 第{i}节\n\n第{i}节正文。" + "正文" * 40 for i in range(1, 9))
    md_dir.joinpath(f"{doc_id}.md").write_text(
        body + "\n\n## 参考文献\n\n[1] 某指南. 某杂志, 2020: 1-10.\n", encoding="utf-8"
    )
    # content_list 的 text 必须与块内容前缀一致，否则页码锚定（前 20 字对齐）匹配不上
    cl = [{"type": "text", "text": f"第{i}节正文。" + "正文" * 40, "page_idx": i} for i in range(1, 9)]
    cl.append({"type": "text", "text": "[1] 某指南. 某杂志, 2020: 1-10.", "page_idx": 9})
    md_dir.joinpath("c_content_list.json").write_text(json.dumps(cl, ensure_ascii=False), encoding="utf-8")
    return doc_id


def test_noise_block_flow_end_to_end(orc, corpus):
    """US-07：末尾参考文献块被屏蔽 → 不入库计划 → 人工恢复后重新可检索"""
    from kb_pipeline.quality import noise

    doc_id = _make_noise_corpus(corpus, "含参考文献_2026")
    kw = {"region": "cn", "source_dir": corpus["source_dir"], "out_dir": corpus["out_dir"],
          "dry_run": True}
    orc.run_pipeline(doc_id, **kw)
    store = orc.store_for(doc_id)

    seg = store.read_current_artifact("segment")
    refs = [c for c in seg["chunks"] if c["title"] == "参考文献"]
    assert refs, "参考文献块应存在于切块结果"
    ref = refs[0]
    assert ref["excluded"] is True, "末尾参考文献块必须被屏蔽"
    assert ref["exclude_rule"] == "reference_list"
    assert ref["exclude_by"] == "rule"
    assert ref["retrieval_status"] == "excluded"
    assert seg["excluded_summary"].get("reference_list") == 1

    # 正常正文块不受影响
    normal = [c for c in seg["chunks"] if c["title"].startswith("第")]
    assert normal and all(c["excluded"] is False for c in normal)

    # 入库计划必须反映屏蔽（且屏蔽块不占 to_index）
    idx = store.read_current_artifact("index")
    assert idx["counts"]["noise_excluded"] == 1
    plan = {p["kb_id"]: p["retrieval_status"] for p in idx["plan"]}
    assert plan[ref["kb_id"]] == "excluded"
    assert idx["counts"]["to_index"] == len(normal), "屏蔽块不进入待索引集合"

    # 人工恢复 → 重跑必须真的生效（人工决定指纹已进 segment 的 cache_key）
    noise.save_overrides(store.edits_root, {"restore": [ref["kb_id"]], "exclude": []})
    orc.run_pipeline(doc_id, **kw)
    seg2 = store.read_current_artifact("segment")
    restored = next(c for c in seg2["chunks"] if c["kb_id"] == ref["kb_id"])
    assert restored["excluded"] is False
    assert restored["exclude_by"] == "manual_restore"
    assert seg2["excluded_summary"] == {}
    idx2 = store.read_current_artifact("index")
    assert idx2["counts"]["noise_excluded"] == 0
    assert idx2["counts"]["to_index"] == len(normal) + 1
