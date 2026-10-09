"""本地 Web 层 v0 的界面（内嵌 HTML/CSS/JS，无构建、无外部 CDN，离线可用）

设计说明（为什么不是家长端的玫瑰粉设计系统）：
  `minicare-design` 面向 `minicare/ui-draft` 的**移动端家长页**（Tab Bar、图标盒子、玫瑰粉主色）。
  本平台是**桌面端内部维护工具**（15 个页面、密集表格、侧栏导航），套用移动端配色不合适。
  因此：
    · **复用**它的圆角（6/8/12/18）、阴影（sm/md）、间距（12/16）刻度 —— 保持视觉家族感
    · **改用**中性工具色板（深灰蓝侧栏 + 暖白底 + 蓝色主操作 + 语义状态色）
    · 遵守它的两条原则：颜色全走 CSS 变量、文字不用纯黑

导航结构直接映射 PRD-008 §1.2 的 4 阶段旅程，未实现的页面在导航里**显式标注所属期次**，
让"平台做到哪一步了"在界面上可见，而不是藏进文档。
"""
from __future__ import annotations

# ── 导航定义（单一数据源：侧栏 HTML 与前端页面元数据都由它生成）─────────────
NAV: list[dict] = [
    {
        "group": "① 语料入库",
        "items": [
            {"id": "corpus", "label": "文档管理", "impl": True, "phase": 1,
             "story": "US-01 / US-02",
             "desc": "文档列表（含七步进度明细）、来源档案与合规治理"},
            # （2026-10-09 删除）「元信息总览」跨文档视图已按用户要求整体移除（React 与回退页同删，
            #   连同后端 `/api/metadata`）；`?page=metadata` 不再提供。
        ],
    },
    {
        "group": "② 解析与切片",
        "items": [
            {"id": "source", "label": "解析详情", "impl": True, "phase": 1,
             "story": "US-14 / US-03~07",
             "desc": "文档工作台：预检检查项、原文对照（bbox 高亮）、切块产物与元信息"},
            # （2026-10-09 删除）「处理进度」页已按用户要求移除（文档按篇处理，无队列场景）；
            #   React 与回退页同删、后端 `/api/queue*` 同删；队列本体保留为 CLI（同「元信息总览」先例）。
        ],
    },
    {
        "group": "③ 索引与发布",
        "items": [
            {"id": "indexresult", "label": "入库结果", "impl": True, "phase": 5,
             "story": "US-09", "desc": "向量模型版本、关键词来源与抽样、维度一致性"},
            {"id": "publish", "label": "发布上线", "impl": True, "phase": 4,
             "story": "US-10", "desc": "发布前 4 项检查、快照、发布计划与验证"},
            # （2026-10-09 删除）「发布记录」独立页已移除 —— 留档与快照回滚由「发布上线」承接；
            # 深链接 ?page=publishlog 由 initFromUrl 翻译回 publish。
        ],
    },
    {
        "group": "④ 消费与验证",
        "items": [
            {"id": "quality", "label": "检索质检", "impl": True, "phase": 4,
             "story": "US-11", "desc": "Recall@10 / 有害召回；gold 失效识别；不达标阻塞发布"},
            {"id": "gaps", "label": "知识缺口", "impl": True, "phase": 5,
             "story": "US-12", "desc": "未命中主题聚合；区分覆盖缺口与切片问题"},
            # （2026-10-09 删除）旧侧栏页 `contract`（智能体对接）已随 React 版一并移除
            #   （知识库对接 Agent 的测评由「Agent 测评」域覆盖）；后端 `/api/contract*` 与渲染函数同删。
        ],
    },
    {
        "group": "系统",
        "items": [
            {"id": "config", "label": "生效阈值", "impl": True, "phase": 1,
             "story": "§12.2 / TECH-015 S-10", "desc": "阈值唯一来源与来源标注（yaml / code-default）"},
        ],
    },
]

_STYLE = """
:root{
  /* 色板：中性工具色（非移动端玫瑰粉） */
  --bg:#F4F3F0; --surface:#FFFFFF; --surface-2:#FAF9F7; --sidebar:#F7F6F3;
  --line:#E5E3DD; --line-strong:#D4D1C9;
  --text:#2F2C2A; --text-2:#6B6560; --text-3:#98928C;
  --accent:#2F6FB0; --accent-bg:#EAF2FA; --accent-line:#B7D2EA;
  --ok:#3F6E15; --ok-bg:#EDF5E1;
  --warn:#8A540B; --warn-bg:#FBF0DA;
  --danger:#A82E2E; --danger-bg:#FBEAEA;
  --neutral-bg:#EFEDE8;
  /* 复用 minicare-design 的圆角/阴影刻度 */
  --r-xs:6px; --r-sm:8px; --r-md:12px; --r-lg:18px;
  --sh-sm:0 1px 3px rgba(0,0,0,.06); --sh-md:0 4px 12px rgba(0,0,0,.08);
  --sidebar-w:160px; --topbar-h:60px;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font:13px/1.6 -apple-system,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased}
code,kbd,pre,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{color:inherit;text-decoration:none}
button{font:inherit;font-size:12px;padding:5px 11px;border-radius:var(--r-sm);
  border:1px solid var(--line-strong);background:var(--surface);color:var(--text);cursor:pointer}
button:hover{background:var(--surface-2)}
button:disabled{opacity:.45;cursor:not-allowed}
button.primary{color:#fff;background:var(--accent);border-color:var(--accent)}
button.primary:hover{filter:brightness(1.06)}
button.ghost{border-color:transparent;background:transparent;color:var(--text-2)}
button.ghost:hover{background:var(--neutral-bg)}

/* ── 应用外壳 ───────────────────────────────────────────── */
.app{display:grid;grid-template-columns:var(--sidebar-w) minmax(0,1fr);min-height:100vh}
.sidebar{background:var(--sidebar);border-right:1px solid var(--line);
  display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.brand{padding:16px 16px 12px;border-bottom:1px solid var(--line)}
.brand b{display:block;font-size:14px;font-weight:600;letter-spacing:.2px}
.brand span{font-size:11px;color:var(--text-3)}
.nav{flex:1;overflow-y:auto;padding:8px 8px 16px}
.nav-group{margin-top:12px}
.nav-group:first-child{margin-top:4px}
.nav-group-title{font-size:11px;color:var(--text-3);padding:6px 8px;letter-spacing:.3px}
.nav-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--r-sm);
  color:var(--text-2);cursor:pointer;font-size:13px}
.nav-item:hover{background:var(--neutral-bg);color:var(--text)}
.nav-item.active{background:var(--accent-bg);color:var(--accent);font-weight:500}
.nav-item .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);flex:0 0 auto}
.nav-item.todo{color:var(--text-3)}
.nav-item.todo .dot{background:var(--line-strong)}
.nav-item .ph{margin-left:auto;font-size:10px;color:var(--text-3);
  border:1px solid var(--line-strong);border-radius:var(--r-xs);padding:0 5px}
.sidebar-foot{padding:10px 11px;border-top:1px solid var(--line);font-size:11px;color:var(--text-3);
  display:flex;flex-direction:column;gap:5px}
.sidebar-foot .row{display:flex;align-items:center;gap:6px}

/* ── 主区 ──────────────────────────────────────────────── */
.main{display:flex;flex-direction:column;min-width:0}
.topbar{height:var(--topbar-h);background:var(--surface);border-bottom:1px solid var(--line);
  display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 20px;
  position:sticky;top:0;z-index:5}
.topbar h1{font-size:15px;font-weight:600;margin:0}
.topbar .sub{font-size:12px;color:var(--text-3);margin:2px 0 0}
.topbar-actions{display:flex;align-items:center;gap:8px}
.content{padding:14px 16px 34px;min-width:0}

/* ── 卡片与工具条 ──────────────────────────────────────── */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);
  box-shadow:var(--sh-sm);margin-bottom:14px;overflow:hidden}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:11px 14px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.card-h h2{font-size:13px;font-weight:600;margin:0}
.card-h .meta{font-size:12px;color:var(--text-3)}
.card-b{padding:14px}
.card-b.flush{padding:0}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;align-items:start}

/* ── 指标条 ────────────────────────────────────────────── */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:11px 13px}
.kpi .k{font-size:11px;color:var(--text-3)}
.kpi .v{font-size:19px;font-weight:600;margin-top:2px;line-height:1.25}
.kpi .u{font-size:11px;color:var(--text-3);font-weight:400;margin-left:3px}

/* ── 表格 ──────────────────────────────────────────────── */
table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
th,td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left;
  vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
th{font-size:11px;font-weight:600;color:var(--text-3);background:var(--surface-2);
  position:sticky;top:0;letter-spacing:.2px}
tbody tr:last-child td{border-bottom:none}
tbody tr.clickable{cursor:pointer}
tbody tr.clickable:hover{background:var(--accent-bg)}
tbody tr.selected{background:var(--accent-bg)}
tbody tr.selected td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
td.mono{font-size:12px;color:var(--text-2)}
.wrap{white-space:normal}

/* ── 状态与标记 ────────────────────────────────────────── */
.pill{display:inline-block;font-size:11px;padding:1px 7px;border-radius:var(--r-xs);
  border:1px solid;white-space:nowrap}
.pill.ok{color:var(--ok);background:var(--ok-bg);border-color:var(--ok)}
.pill.warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn)}
.pill.danger{color:var(--danger);background:var(--danger-bg);border-color:var(--danger)}
.pill.plain{color:var(--text-2);background:var(--neutral-bg);border-color:var(--line-strong)}
.pill.accent{color:var(--accent);background:var(--accent-bg);border-color:var(--accent-line)}
.tag{font-size:10px;color:var(--text-3);border:1px solid var(--line-strong);
  border-radius:var(--r-xs);padding:0 5px;margin-left:6px;white-space:nowrap}

/* 七步圆点 */
.dots{display:inline-flex;gap:4px;align-items:center}
.sdot{width:10px;height:10px;border-radius:50%;background:var(--neutral-bg);
  border:1px solid rgba(0,0,0,.08)}
.sdot.succeeded{background:#639922}
.sdot.skipped_cached{background:#9FC7E8}
.sdot.stale{background:#EDB05A}
.sdot.failed{background:#DB5B5B}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--text-3);margin-top:10px}

/* 步骤条 */
.steps{display:flex;flex-wrap:wrap;gap:8px}
.step{display:flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--surface);font-size:12px}
.step .nm{font-weight:500}
.step .st{color:var(--text-3);font-size:11px}
.step.done{border-color:var(--line-strong)}
.step.stale{border-color:var(--warn);background:var(--warn-bg)}
.step.failed{border-color:var(--danger);background:var(--danger-bg)}

/* 表单控件 */
label.chk{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text-2)}
input[type=text],input[type=search],select{font:inherit;font-size:12px;padding:5px 8px;
  border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.toolbar .sep{width:1px;height:20px;background:var(--line)}
.hint{font-size:12px;color:var(--text-3)}
.notice{background:var(--warn-bg);border:1px solid var(--warn);color:var(--warn);
  border-radius:var(--r-sm);padding:9px 11px;font-size:12px;margin-bottom:14px}
.notice b{font-weight:600}
.empty{padding:36px 16px;text-align:center;color:var(--text-3)}
.empty .big{font-size:14px;color:var(--text-2);margin-bottom:4px}
details.fold{border-top:1px solid var(--line);padding:10px 14px}
details.fold summary{cursor:pointer;color:var(--text-2);font-size:12px}
pre.box{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);
  padding:10px;overflow:auto;max-height:320px;font-size:11px;margin:8px 0 0}
.toast{position:fixed;right:20px;bottom:20px;background:#2F2C2A;color:#fff;padding:10px 14px;
  border-radius:var(--r-sm);font-size:12px;box-shadow:var(--sh-md);opacity:0;pointer-events:none;
  transition:opacity .18s;max-width:56ch;z-index:50}
.toast.show{opacity:1}
.spin{display:inline-block;width:12px;height:12px;border:2px solid var(--accent-line);
  border-top-color:var(--accent);border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}

/* ── US-14：页面图 + bbox 高亮叠层 ─────────────────────── */
.pg-stage{position:relative;width:100%;line-height:0;background:var(--surface-2);
  overflow:auto;max-height:calc(100vh - 300px)}
.pg-img{display:block;width:100%;height:auto}
.pg-overlay{position:absolute;inset:0;pointer-events:none}
.pg-box{position:absolute;border:1.5px solid;border-radius:2px;pointer-events:auto;
  cursor:pointer;box-sizing:border-box;transition:box-shadow .12s}
.pg-box:hover{box-shadow:0 0 0 2px rgba(0,0,0,.16)}
.pg-box.active{box-shadow:0 0 0 2px rgba(47,111,176,.5);z-index:2}
.pg-box.furniture{border-style:dashed}
.cmp-block.active{background:var(--accent-bg);box-shadow:inset 3px 0 0 var(--accent)}
.cmp-typetag{display:inline-block;font-size:11px;padding:0 6px;border:1px solid;
  border-radius:var(--r-xs);background:var(--surface);white-space:nowrap}

@media (max-width:880px){
  .app{grid-template-columns:1fr}
  .sidebar{position:static;height:auto}
  .nav{max-height:240px}
}
"""

_SCRIPT = """
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const PAGES = JSON.parse($('#pages-json').textContent);
const STEP_ORDER = ['preflight','parse','normalize','segment','validate','translate','index'];
const STEP_LABEL = {preflight:'预检',parse:'解析',normalize:'正文清洗',segment:'切块',validate:'解析高危敏感信息复核',translate:'翻译',index:'索引'};
const DOC_STATUS = {pending:'待处理',processing:'处理中',failed:'失败',ready:'已就绪待发布',stale:'待更新',archived:'已归档'};
const STEP_STATUS_CLS = {succeeded:'ok',skipped_cached:'plain',stale:'warn',failed:'danger',pending:'plain'};
const STEP_STATUS_LABEL = {succeeded:'已完成',skipped_cached:'缓存命中',stale:'待重跑',failed:'失败',pending:'未执行'};

let STATE = {page:'corpus', doc:null, docs:[], overview:null, loading:false};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(m,ms){const t=$('#toast');t.innerHTML=m;t.classList.add('show');
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),ms||4200);}

async function req(path,opts){
  const r=await fetch(path,Object.assign({headers:{'Content-Type':'application/json'}},opts||{}));
  const b=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error((b.error&&b.error.message)||b.detail||('HTTP '+r.status));
  return b;
}

/* ── 页面元数据 ─────────────────────────────────── */
function pageMeta(id){for(const g of PAGES) for(const it of g.items) if(it.id===id) return it; return null;}
/* 解析与切片阶段已收敛进「原文对照」工作台（React 版是页签）。这些 id 不再出现在侧栏，
   但仍可由 URL 访问，因此顶栏标题需要一张兜底标签表，避免显示「—」。 */
const TAB_LABELS = {detail:'处理详情（工作台页签）', records:'处理记录（工作台页签）',
  chunks:'切片对照（工作台页签）', compare:'解析结果对照（工作台页签）',
  preflight:'预检（工作台页签）', metaextract:'元信息解析与确认（工作台页签）',
  meta:'元信息解析与确认（工作台页签）', review:'内容校对（工作台页签）',
  numbers:'解析高危敏感信息复核（工作台页签）', excluded:'已屏蔽内容（工作台页签）'};

function renderNav(){
  const html = PAGES.map(g=>`
    <div class="nav-group">
      <div class="nav-group-title">${esc(g.group)}</div>
      ${g.items.map(it=>`
        <div class="nav-item ${it.impl?'':'todo'} ${STATE.page===it.id?'active':''}" data-page="${it.id}">
          <span class="dot"></span><span>${esc(it.label)}</span>
          ${it.impl?'':`<span class="ph">第${it.phase}期</span>`}
        </div>`).join('')}
    </div>`).join('');
  $('.nav').innerHTML = html;
  $$('.nav-item').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));
}

function renderTopbar(){
  const m = pageMeta(STATE.page) || (TAB_LABELS[STATE.page] ? {label:TAB_LABELS[STATE.page], desc:'（回退页：工作台页签的完整交互在 React 版）'} : {label:'—',desc:''});
  $('#page-title').textContent = m.label;
  let sub = m.desc || '';
  if(m.impl===false) sub = `尚未实现 · 计划于第 ${m.phase} 期（${m.story}）`;
  else if(m.story) sub = `${sub} · ${m.story}`;
  $('#page-sub').textContent = sub;
  $('#page-actions').innerHTML = (['corpus','detail','records','source','excluded','meta',
    'review','numbers','indexresult','publish','quality','gaps']
    .includes(STATE.page)) ? '<button id="btn-reload">刷新</button>' : '';
  const b=$('#btn-reload'); if(b) b.addEventListener('click',()=>go(STATE.page,true));
}

function go(page,keep){
  STATE.page = page;
  // 把当前视图写进 URL，使页面可收藏/分享/直接复现
  const q = new URLSearchParams();
  q.set('page', page);
  if(STATE.doc) q.set('doc', STATE.doc);
  history.replaceState(null, '', '?' + q.toString());
  renderNav(); renderTopbar();
  const c=$('#content'); c.innerHTML='<div class="empty"><span class="spin"></span> 加载中…</div>';
  if(page==='corpus') return renderCorpus();
  if(page==='detail') return renderDetail();
  if(page==='records') return renderRecords();
  if(page==='source') return renderSource();
  if(page==='excluded') return renderExcluded();
  if(page==='meta') return renderMeta();
  if(page==='review') return renderReview();
  if(page==='numbers') return renderNumbers();
  if(page==='indexresult') return renderIndexResult();
  if(page==='publish') return renderPublish();
  if(page==='quality') return renderQuality();
  if(page==='gaps') return renderGaps();
  if(page==='config') return renderConfig();
  return renderPlaceholder(page);
}

/* ── 共用片段 ───────────────────────────────────── */
function statusPill(s){return `<span class="pill ${STEP_STATUS_CLS[s]||'plain'}">${STEP_STATUS_LABEL[s]||s}</span>`;}
function docPill(s){
  const cls = s==='ready'?'ok':(s==='failed'?'danger':(s==='stale'?'warn':'plain'));
  return `<span class="pill ${cls}">${DOC_STATUS[s]||s}</span>`;
}
function dots(steps){return `<span class="dots">${STEP_ORDER.map(s=>{
  const st=(steps&&steps[s])||'pending';
  return `<span class="sdot ${st}" title="${STEP_LABEL[s]}：${STEP_STATUS_LABEL[st]||st}"></span>`;}).join('')}</span>`;}
function legend(){return `<div class="legend">${STEP_ORDER.map(s=>`<span>${s}. ${STEP_LABEL[s]}</span>`).join('')}
  <span style="margin-left:auto">已完成 / 缓存命中 / 待重跑 / 等待闸门 / 失败 / 未执行</span></div>`;}

async function ensureOverview(force){
  if(STATE.overview && !force) return STATE.overview;
  STATE.overview = await req('/api/overview');
  STATE.docs = STATE.overview.docs;
  renderFoot(STATE.overview);
  return STATE.overview;
}

function renderFoot(ov){
  $('#foot-version').textContent = `管线 v${ov.pipeline_version} · 平台 v${ov.platform_version}`;
  const cfg = $('#foot-config');
  cfg.innerHTML = ov.yaml_loaded
    ? '<span class="pill ok">pipeline.yaml 已生效</span>'
    : '<span class="pill warn">YAML 未生效</span>';
}

/* ── 页面：文档库 ───────────────────────────────── */
async function renderCorpus(){
  try{
    const ov = await ensureOverview(true);
    const counts = ov.docs.reduce((a,d)=>{a[d.status]=(a[d.status]||0)+1;return a;},{});
    const kpi = [
      ['文档总数', ov.docs.length, '份'],
      ['已就绪待发布', counts.ready||0, '份'],
      ['待更新', counts.stale||0, '份'],
      ['失败', counts.failed||0, '份'],
    ].map(([k,v,u])=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}<span class="u">${u}</span></div></div>`).join('');

    $('#content').innerHTML = `
      <div class="notice"><b>只读环境：</b>本版本不开放写库（迁移 021 未执行、<code>index</code> 真实入库路径未验证），
        所有运行均为 dry-run，只产出入库计划不改数据库。写库请用 CLI <code>kb-pipeline run --write</code>。</div>
      <div class="notice" style="background:var(--accent-bg);border-color:var(--accent-line);color:var(--accent)">
        <b>状态口径：</b><b>每行右侧的六个小片才是各步的真实状态</b>
        （已完成 / 缓存命中 / 待重跑 / 失败 / 未执行）。
      </div>
      <div class="kpis">${kpi}</div>
      <div class="card">
        <div class="card-h">
          <h2>文档库</h2>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="text" id="until" placeholder="跑到某步为止，如 segment" style="width:180px">
            <span class="meta">共 ${ov.docs.length} 份</span>
          </div>
        </div>
        <div class="card-b flush">
          <table>
            <colgroup><col><col style="width:64px"><col style="width:118px"><col style="width:150px"><col style="width:96px"></colgroup>
            <thead><tr><th>文档</th><th>地区</th><th>状态</th><th>七步</th><th></th></tr></thead>
            <tbody>${ov.docs.map(d=>`
              <tr class="clickable ${STATE.doc===d.doc_id?'selected':''}" data-doc="${esc(d.doc_id)}">
                <td title="${esc(d.doc_id)}">${esc(d.doc_id)}</td>
                <td>${d.region==='cn'?'国内':'国际'}</td>
                <td>${docPill(d.status)}</td>
                <td>${dots(d.steps)}</td>
                <td><button class="primary" data-run="${esc(d.doc_id)}">跑七步</button></td>
              </tr>`).join('')}</tbody>
          </table>
          ${legend()}
        </div>
      </div>`;
    $$('#content tr.clickable').forEach(tr=>tr.addEventListener('click',e=>{
      if(e.target.tagName==='BUTTON') return;
      STATE.doc = tr.dataset.doc; go('source');
    }));
    $$('#content [data-run]').forEach(b=>b.addEventListener('click',async e=>{
      e.stopPropagation(); await runDoc(b.dataset.run);
    }));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

/* ── 页面：处理详情 ─────────────────────────────── */
async function renderDetail(){
  if(!STATE.doc){
    const ov = await ensureOverview();
    $('#content').innerHTML = `<div class="card"><div class="empty">
      <div class="big">尚未选择文档</div>
      请到「文档库」点选一份文档。当前已登记 ${ov.docs.length} 份。</div></div>`;
    return;
  }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc));
    const m = d.manifest.steps||{};
    const steps = STEP_ORDER.map(s=>{
      const st=(m[s]||{}).status||'pending';
      const cls = st==='stale'?'stale':(st==='failed'?'failed':(st==='succeeded'?'done':''));
      return `<div class="step ${cls}"><span class="sdot ${st}"></span>
        <span class="nm">${STEP_LABEL[s]}</span><span class="st">${STEP_STATUS_LABEL[st]||st}</span></div>`;
    }).join('');
    const rows = STEP_ORDER.map(s=>{
      const e = m[s]||{}; const cur=(e.runs||[]).find(r=>r.run_id===e.current_run)||{};
      return `<tr>
        <td>${STEP_LABEL[s]}<span class="tag">${s}</span></td>
        <td>${statusPill(e.status||'pending')}</td>
        <td class="mono" title="${esc(cur.run_id||'')}">${esc(cur.run_id||'—')}</td>
        <td class="num">${cur.duration_ms!=null?cur.duration_ms+' ms':'—'}</td>
        <td class="mono">${(cur.artifact_hash||'').slice(0,12)||'—'}</td>
        <td class="mono wrap">${Object.entries(cur.stats||{}).map(([k,v])=>k+'='+v).join(' ')||'—'}</td>
      </tr>`;}).join('');

    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>${esc(d.doc_id)}</h2><span class="meta">${docPill(d.status)} 派生状态</span></div>
        <div class="card-b">
          <div class="steps">${steps}</div>
          <div class="toolbar" style="margin:14px 0 0">
            <button class="primary" id="run-all">跑七步（dry-run）</button>
            <span class="sep"></span>
            <button data-step="segment">重跑切块</button>
            <button data-step="validate">重跑复核</button>
            <button data-step="index">重跑索引</button>
            <span class="sep"></span>
            <button id="inv">作废切块及下游</button>
            <button id="to-excluded">已屏蔽内容</button>
            <span class="sep"></span>
            <input type="text" id="until" placeholder="跑到指定步骤为止，如 segment" style="width:190px">
          </div>
          <div class="hint" style="margin-top:8px">
            「重跑」会命中缓存则直接返回（内容未变时不会重复计算）；要强制真实重算用 CLI 的 <code>--force</code>。
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>各步产物</h2><span class="meta">产物指纹 = 内容 hash，变化才会让下游待重跑</span></div>
        <div class="card-b flush">
          <table>
            <colgroup><col style="width:150px"><col style="width:100px"><col style="width:230px">
              <col style="width:90px"><col style="width:130px"><col></colgroup>
            <thead><tr><th>步骤</th><th>状态</th><th>current_run</th><th class="num">耗时</th><th>产物指纹</th><th>统计</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <details class="fold"><summary>查看 manifest 原文（执行事实唯一来源）</summary>
          <pre class="box">${esc(JSON.stringify(d.manifest,null,2))}</pre></details>
      </div>`;
    $('#run-all').addEventListener('click',()=>runDoc(d.doc_id));
    $$('#content [data-step]').forEach(b=>b.addEventListener('click',()=>runStep(d.doc_id,b.dataset.step)));
    $('#inv').addEventListener('click',()=>invalidate(d.doc_id));
    $('#to-excluded').addEventListener('click',()=>{ STATE.doc=d.doc_id; go('excluded'); });
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

/* （2026-10-09 删除）页面：处理进度（队列）—— `renderProgress()` 与端点 `/api/queue*` 已整体移除；
   队列运维走 CLI：`kb-pipeline queue [--resume|--cancel-all]` / `run --enqueue` / `drain`。 */

/* ── 页面：处理记录（历史 run 对比）─────────────── */
async function renderRecords(){
  if(!STATE.doc){ $('#content').innerHTML = `<div class="card"><div class="empty">
    <div class="big">尚未选择文档</div>请到「文档库」点选一份文档。</div></div>`; return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc));
    const m = d.manifest.steps||{};
    const rows = [];
    STEP_ORDER.forEach(s=>{
      (m[s]||{}).runs.forEach(r=>rows.push({step:s, ...r, isCurrent: r.run_id===(m[s]||{}).current_run}));
    });
    rows.sort((a,b)=>String(b.finished_at||'').localeCompare(String(a.finished_at||'')));
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>${esc(d.doc_id)} · 历史 run</h2>
          <span class="meta">共 ${rows.length} 次执行 · 当前 run 带标记</span></div>
        <div class="card-b flush">
          ${rows.length? `<table>
            <colgroup><col style="width:110px"><col style="width:210px"><col style="width:80px">
              <col><col style="width:90px"><col style="width:130px"></colgroup>
            <thead><tr><th>步骤</th><th>run_id</th><th>状态</th><th>参数</th>
              <th class="num">耗时</th><th>完成时间</th></tr></thead>
            <tbody>${rows.map(r=>`<tr>
              <td>${STEP_LABEL[r.step]}${r.isCurrent?'<span class="tag">当前</span>':''}</td>
              <td class="mono">${esc(r.run_id)}</td>
              <td>${statusPill(r.status)}</td>
              <td class="mono wrap" title="${esc(JSON.stringify(r.params||{}))}">${esc(compactParams(r.params))}</td>
              <td class="num">${r.duration_ms!=null?r.duration_ms+' ms':'—'}</td>
              <td class="mono">${esc((r.finished_at||'').replace('T',' ').slice(0,19))||'—'}</td>
            </tr>`).join('')}</tbody></table>`
          : `<div class="empty"><div class="big">还没有执行记录</div>到「处理详情」跑一次七步即可生成。</div>`}
        </div>
        <div class="card-b hint">
          对比两次切块的块数差异：在「处理详情」里看 <code>segment</code> 各次 run 的 <code>stats.chunks</code>；
          或用 CLI <code>kb-pipeline show --doc &lt;doc_id&gt;</code>。
        </div>
      </div>`;
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

function compactParams(p){
  if(!p) return '—';
  const keep = ['max_section_chars','mode','pypdf_cross_check','embedding_model','ruleset','splitter'];
  const parts = keep.filter(k=>k in p).map(k=>k+'='+p[k]);
  return parts.length? parts.join(' ') : Object.keys(p).length+ ' 项';
}

/* ── 页面：原文对照（US-14，内嵌单页版的精简实现）────────────
   完整版（模式切换 / 坐标显示 / 复制）在 React 前端 minicare-platform/web；
   这里是「未构建 dist 时的回退页」，只保留页级对照的核心功能。
   ⚠️ 回退页没有 React 版的 .cmp-* 样式，因此布局用行内样式。            */
const BLOCK_LABEL = {text:'正文', list:'列表', table:'表格', image:'图片', equation:'公式',
  aside_text:'侧边文本', table_title:'表题', figure_title:'图题',
  header:'页眉', footer:'页脚', page_number:'页码', page_footnote:'脚注'};
/* 块类型的框线颜色（与右侧标签呼应）；未知类型回退主色 */
const TYPE_COLOR = {text:'#2F6FB0', list:'#3F6E15', table:'#8A540B', image:'#7A4FA8',
  equation:'#0F766E', aside_text:'#9A7E82', table_title:'#8A540B', figure_title:'#7A4FA8',
  header:'#98928C', footer:'#98928C', page_number:'#98928C', page_footnote:'#B08968'};
function typeColor(t){ return TYPE_COLOR[t] || '#2F6FB0'; }
const FURNITURE_TYPES = new Set(['header','footer','page_number','page_footnote']);
let SRC = {page:0, only:true, hide:false};

async function renderSource(){
  if(!STATE.doc){ $('#content').innerHTML = noDoc(); return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/parsed');
    if(!d.ready){ $('#content').innerHTML = `<div class="card"><div class="empty">
      <div class="big">还没有解析产物</div>先到「处理详情」跑一次七步（至少 parse）。</div></div>`; return; }
    SRC.page = Math.min(SRC.page, Math.max(0, (d.page_count||1)-1));
    const byPage = {};
    d.blocks.forEach(b=>{ const k=(b.page_idx==null?-1:b.page_idx); (byPage[k]=byPage[k]||[]).push(b); });
    const allPages = d.page_count ? Array.from({length:d.page_count},(_,i)=>i) : [];
    const shown = SRC.only ? allPages.filter(p=>p===SRC.page) : allPages;
    const types = Object.entries(d.stats.by_type).sort((a,b)=>b[1]-a[1])
      .map(([t,n])=>`${BLOCK_LABEL[t]||t} ${n}`).join(' · ');
    const keep = (bs)=> SRC.hide ? bs.filter(b=>!FURNITURE_TYPES.has(b.type)) : bs;
    const cur = keep(byPage[SRC.page]||[]);
    const body = shown.map(p=>{
      const bs = keep(byPage[p]||[]);
      if(!bs.length) return '';
      return `<div style="position:sticky;top:0;background:var(--surface-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px 0;font-size:11px;color:var(--text-3);margin-bottom:6px">第 ${p+1} 页 · ${bs.length} 块</div>`
        + bs.map(b=>`<div class="cmp-block" data-cmpi="${b.i}" style="padding:7px 0;border-bottom:1px dashed var(--line);${FURNITURE_TYPES.has(b.type)?'opacity:.62;':''}">
            <span class="cmp-typetag" style="color:${typeColor(b.type)};border-color:${typeColor(b.type)}">${BLOCK_LABEL[b.type]||b.type}</span>
            <div style="margin-top:4px;font-size:12.5px;line-height:1.75;white-space:pre-wrap;word-break:break-word">${esc(b.text)}</div>
          </div>`).join('');
    }).join('');
    /* bbox 叠加：bbox 已按每页归一化到 0~1000 → 除 10 即百分比，与渲染倍率无关 */
    const boxes = (d.page_count && d.render_available) ? cur.filter(b=>b.bbox&&b.bbox.length===4).map(b=>{
      const [x1,y1,x2,y2]=b.bbox; const c=typeColor(b.type);
      return `<div class="pg-box ${FURNITURE_TYPES.has(b.type)?'furniture':''}" data-cmpi="${b.i}"
        style="left:${x1/10}%;top:${y1/10}%;width:${Math.max(0,x2-x1)/10}%;height:${Math.max(0,y2-y1)/10}%;border-color:${c};background:${c}1f"></div>`;
    }).join('') : '';
    const pageUrl = d.page_url_base + '/' + SRC.page + '.png?scale=' + d.render_scale;
    const last = (d.page_count||1) - 1;
    const siblings = [['compare','解析结果对照'],['detail','处理详情'],['records','处理记录'],
      ['meta','元信息解析与确认'],['review','内容校对'],['numbers','解析高危敏感信息复核'],['excluded','已屏蔽内容']]
      .map(([id,label])=>`<a class="btn" style="border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:3px 9px;font-size:12px;${id==='compare'?'background:var(--accent-bg);color:var(--accent);border-color:var(--accent-line)':''}" href="?page=${id}&doc=${encodeURIComponent(STATE.doc)}">${label}</a>`).join(' ');
    const leftPane = d.page_count
      ? `<div class="pg-stage"><img class="pg-img" src="${pageUrl}" alt="第 ${SRC.page+1} 页"><div class="pg-overlay">${boxes}</div></div>`
      : `<iframe src="${d.source_url}" style="display:block;width:100%;height:calc(100vh - 300px);min-height:420px;border:0;background:var(--surface-2)"></iframe>`;
    $('#content').innerHTML = `
      <div class="notice"><b>这是「未构建前端产物」时的精简回退视图。</b>
        React 版的完整交互是：左栏 <b>pdf.js 连续滚动</b>（页码/缩放/适配栏宽）、
        右栏只有 <b>Markdown 与 JSON 两个页签</b>（Markdown 为渲染后的 HTML，
        点击左侧区块框会滚到对应段落并高亮）；「处理详情」与「处理记录」已合并为
        <b>「文档管理」列表里的处理弹框</b>。要使用它请构建前端：
        <code>cd minicare-platform/web &amp;&amp; npm run build</code>。</div>
      <div class="toolbar" style="margin-bottom:10px">${siblings}</div>
      <div class="notice" style="background:var(--accent-bg);border-color:var(--accent-line);color:var(--accent)">
        <b>对照口径：</b>左＝源文档页面图（按 MinerU 的 bbox 叠加高亮），右＝解析产物（content_list 按 page_idx 分组）。
        bbox 是<b>每页归一化到 0~1000</b>（x 按页宽、y 按页高各自归一化），故换渲染倍率不会错位；
        两侧 hover 会互相高亮。${d.has_pdf?'':'本文档是下载页来源，没有页面图与 content_list。'}</div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start">
        <div class="card" style="margin:0">
          <div class="card-h"><h2>源文档</h2><span class="meta">${d.has_pdf?(d.render_available?'页面图':'PDF（未装栅格化依赖）'):'下载页（纯文本）'}</span></div>
          <div class="card-b card-b-flush">
            <div class="toolbar" style="margin:0;padding:10px 14px;border-bottom:1px solid var(--line)">
              <button data-cmppage="${SRC.page-1}" ${SRC.page<=0?'disabled':''}>上一页</button>
              <span class="hint">第 ${d.page_count?(SRC.page+1):'—'} / ${d.page_count||'—'} 页</span>
              <button data-cmppage="${SRC.page+1}" ${SRC.page>=last?'disabled':''}>下一页</button>
              <a class="btn" style="border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:5px 11px;font-size:12px" href="${d.source_url}" target="_blank" rel="noreferrer">新标签打开原件</a>
              ${d.page_count?`<a class="btn" style="border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:5px 11px;font-size:12px" href="${pageUrl}" target="_blank" rel="noreferrer">本页原图</a>`:''}
            </div>
            ${leftPane}
          </div>
        </div>
        <div class="card" style="margin:0">
          <div class="card-h"><h2>解析产物</h2>
            <span class="meta">${d.stats.blocks} 块 · ${d.stats.pages} 页 · ${d.md_chars} 字</span></div>
          <div class="card-b card-b-flush">
            <div class="toolbar" style="margin:0;padding:10px 14px;border-bottom:1px solid var(--line)">
              <label class="chk"><input type="checkbox" id="cmp-only" ${SRC.only?'checked':''}> 只看当前页</label>
              <label class="chk"><input type="checkbox" id="cmp-hide" ${SRC.hide?'checked':''}> 隐藏页眉页脚/页码</label>
              <span class="hint" style="margin-left:auto">${types}</span>
            </div>
            <div style="height:calc(100vh - 380px);min-height:360px;overflow:auto;padding:0 14px 14px">
              ${body || '<div class="empty"><div class="big">没有 content_list 块</div>请用 CLI 查看 markdown 产物。</div>'}
            </div>
          </div>
        </div>
      </div>`;
    $$('#content [data-cmppage]').forEach(b=>b.addEventListener('click',()=>{ SRC.page=+b.dataset.cmppage; go('source',true); }));
    const o=$('#cmp-only'); if(o) o.addEventListener('change',()=>{ SRC.only=o.checked; go('source',true); });
    const h=$('#cmp-hide'); if(h) h.addEventListener('change',()=>{ SRC.hide=h.checked; go('source',true); });
    /* 联动：hover 框或块 → 两侧同时高亮，并把块滚到可视区 */
    $$('#content .pg-box, #content .cmp-block').forEach(el=>{
      el.addEventListener('mouseenter',()=>{
        const i = el.dataset.cmpi;
        $$('#content .pg-box, #content .cmp-block').forEach(x=>{ if(x.dataset.cmpi===i) x.classList.add('active'); });
        const t = $(`#content .cmp-block[data-cmpi="${i}"]`);
        if(t) t.scrollIntoView({block:'center',behavior:'smooth'});
      });
      el.addEventListener('mouseleave',()=>{
        $$('#content .pg-box, #content .cmp-block').forEach(x=>x.classList.remove('active'));
      });
    });
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

/* ── 页面：已屏蔽内容（US-07）──────────────────── */
const RULE_LABEL = {reference_list:'参考文献', empty_table:'空表',
  page_furniture:'页眉页脚残留', figure_no_caption:'纯图无题注', manual:'人工屏蔽'};

async function renderExcluded(){
  if(!STATE.doc){ $('#content').innerHTML = noDoc(); return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/excluded');
    if(!d.ready){
      $('#content').innerHTML = `<div class="card"><div class="empty">
        <div class="big">还没有切块产物</div>先到「处理详情」跑一次七步，才能看到噪声块判定结果。</div></div>`;
      return;
    }
    const tags = Object.entries(d.summary||{}).map(([k,v])=>
      `<span class="pill warn">${RULE_LABEL[k]||k} ×${v}</span>`).join(' ') || '<span class="hint">没有块被规则屏蔽</span>';

    const rowEx = (c)=>`<tr>
      <td class="mono" title="${esc(c.kb_id)}">${esc(c.kb_id)}</td>
      <td title="${esc(c.header_path)}">${esc(c.title||'—')}</td>
      <td class="num">${c.page_idx!=null?('p.'+c.page_idx):'—'}</td>
      <td><span class="pill warn">${RULE_LABEL[c.rule]||c.rule||'—'}</span></td>
      <td class="hint wrap">${esc(c.reason||'')}</td>
      <td class="num">${c.chars}</td>
      <td><button data-restore="${esc(c.kb_id)}">恢复检索</button></td>
    </tr>`;

    const rowRs = (c)=>`<tr>
      <td class="mono" title="${esc(c.kb_id)}">${esc(c.kb_id)}</td>
      <td>${esc(c.title||'—')}</td>
      <td class="num">${c.page_idx!=null?('p.'+c.page_idx):'—'}</td>
      <td class="hint wrap">${esc(c.reason||'')}</td>
      <td class="num">${c.chars}</td>
      <td><button data-exclude="${esc(c.kb_id)}">重新屏蔽</button></td>
    </tr>`;

    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>${esc(STATE.doc)} · 已屏蔽内容</h2>
          <span class="meta">${tags}</span></div>
        <div class="card-b">
          <div class="hint">
            <b>默认屏蔽 + 可恢复 + 人工优先于规则</b>：命中规则的块不参与向量化与全文索引，
            但内容完整保留在这里；点「恢复检索」后，<b>后续重切不会再被规则屏蔽</b>
            （决定落在 <code>edits/excludes.json</code>，其指纹已进切块的 cache_key，所以重跑会真实生效）。
            ${d.overrides && d.overrides.restore.length ? `<br>人工已恢复 ${d.overrides.restore.length} 块。` : ''}
          </div>
        </div>
        <div class="card-b flush">
          ${d.excluded.length ? `<table>
            <colgroup><col style="width:230px"><col><col style="width:70px"><col style="width:110px">
              <col style="width:230px"><col style="width:82px"><col style="width:100px"></colgroup>
            <thead><tr><th>块 ID</th><th>标题</th><th class="num">页码</th><th>命中规则</th>
              <th>判定依据</th><th class="num">字数</th><th></th></tr></thead>
            <tbody>${d.excluded.map(rowEx).join('')}</tbody></table>`
          : `<div class="empty"><div class="big">没有块被屏蔽</div>
             四类规则（参考文献 / 空表 / 页眉页脚残留 / 纯图无题注）都未命中这份文档。</div>`}
        </div>
        ${d.restored.length ? `
        <div class="card-h" style="border-top:1px solid var(--line)">
          <h2>人工恢复的块</h2><span class="meta">${d.restored.length} 块 · 规则不会再屏蔽它们</span></div>
        <div class="card-b flush">
          <table>
            <colgroup><col style="width:230px"><col><col style="width:70px">
              <col style="width:230px"><col style="width:82px"><col style="width:100px"></colgroup>
            <thead><tr><th>块 ID</th><th>标题</th><th class="num">页码</th><th>原命中规则</th>
              <th class="num">字数</th><th></th></tr></thead>
            <tbody>${d.restored.map(rowRs).join('')}</tbody></table>
        </div>` : ''}
      </div>`;

    $$('#content [data-restore]').forEach(b=>b.addEventListener('click',()=>toggleExclude(b.dataset.restore,'restore')));
    $$('#content [data-exclude]').forEach(b=>b.addEventListener('click',()=>toggleExclude(b.dataset.exclude,'exclude')));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

async function toggleExclude(kbId, action){
  try{
    const url = '/api/docs/'+encodeURIComponent(STATE.doc)+'/excluded/'+encodeURIComponent(kbId)+'/'+action;
    const r = await req(url, {method:'POST'});
    toast((action==='restore'?'已恢复检索：':'已屏蔽：')+kbId.slice(-24)+' · 已重跑下游 · 状态 '+r.status);
    go('excluded', true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

function noDoc(){
  return `<div class="card"><div class="empty">
    <div class="big">尚未选择文档</div>请到「文档库」点选一份文档。</div></div>`;
}

/* ── 页面：元信息解析与确认 · 信息确认表单（US-04，可选操作，不拦流程）────── */
const META_FIELDS = [
  ['source_name','来源名称',1],['publisher','发布机构',0],['year','年份',1],
  ['region','地区',1],['evidence_level','证据级别',1],['applicable_age','适用年龄',0],
  ['license','许可证',0]
];

async function renderMeta(){
  if(!STATE.doc){ $('#content').innerHTML = noDoc(); return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/meta');
    const src = d.field_source || {};
    const rows = META_FIELDS.map(([k,label,required])=>{
      const v = (d.row && d.row[k] != null) ? d.row[k] : (d.suggestion[k] != null ? d.suggestion[k] : '');
      const s = src[k] || {};
      const miss = required && (v === '' || v == null);
      return `<tr>
        <td>${label}${required?' <span class="pill danger">必填</span>':''}</td>
        <td>${miss?'<span class="pill danger">缺失</span>':(v===''?'—':esc(String(v)))}</td>
        <td class="hint">${esc(s.origin||'—')}</td>
        <td class="hint wrap">${esc((s.evidence||'').slice(0,60))}</td>
        <td><input type="text" data-f="${k}" value="${esc(String(v==null?'':v))}" style="width:100%"></td>
      </tr>`;
    }).join('');
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>${esc(STATE.doc)} · 元信息解析与确认</h2>
          <span class="meta">派生状态 ${esc(d.derived_status)}</span></div>
        <div class="card-b">
          <div class="hint">元数据要**冗余进每个切片**做检索过滤，值得核对一遍。
            改字段**不会触发重新解析**，只会让「切块」及下游重跑。<br>
            这是<b>可选操作</b> —— 不核对也能跑完七步。
            ${d.ready?'':'<br>⚠ 该文档尚未登记进台账，保存时会自动补登记。'}</div>
          ${(d.missing_required||[]).length?`<div class="notice" style="margin-top:10px">
            必填缺失：${d.missing_required.map(esc).join('、')} —— 补齐前不可发布</div>`:''}
        </div>
        <div class="card-b flush">
          <table><colgroup><col style="width:110px"><col style="width:200px"><col style="width:110px">
            <col><col style="width:240px"></colgroup>
            <thead><tr><th>字段</th><th>当前值</th><th>来源</th><th>判定依据</th><th>修改</th></tr></thead>
            <tbody>${rows}</tbody></table>
        </div>
        <div class="card-b">
          <div class="toolbar" style="margin:0">
            <button class="primary" id="meta-save">保存</button>
          </div>
        </div>
      </div>`;
    const collect = ()=>{
      const o = {};
      $$('#content [data-f]').forEach(i=>{ o[i.dataset.f] = i.value.trim(); });
      return o;
    };
    $('#meta-save').addEventListener('click',()=>submitMeta(collect()));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

async function submitMeta(fields){
  try{
    const r = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/meta',
      {method:'PUT', body: JSON.stringify({...fields})});
    toast('已保存台账字段 · 状态 '+r.derived_status);
    go('meta', true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

/* ── 页面：切片校对（US-05，可选操作，不拦流程）────── */
async function renderReview(){
  if(!STATE.doc){ $('#content').innerHTML = noDoc(); return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/chunks');
    if(!d.ready){ $('#content').innerHTML = `<div class="card"><div class="empty">
      <div class="big">还没有切块产物</div>先跑一次七步。</div></div>`; return; }
    const st = d.edit_stats || {};
    const rec = d.recoverable || [];
    $('#content').innerHTML = `
      ${rec.length?`<div class="notice">有 ${rec.length} 条历史编辑可按相似度找回（重切后旧编辑不静默丢失）：
        ${rec.slice(0,3).map(c=>`<code>${esc(c.candidate_kb_id)}</code>(${c.similarity})`).join(' ')}</div>`:''}
      <div class="card">
        <div class="card-h"><h2>${esc(STATE.doc)} · 切片校对</h2>
          <span class="meta">共 ${d.chunks.length} 块 · 已编辑 ${st.edited||0} · 禁用 ${st.disabled||0}</span></div>
        <div class="card-b flush">
          <table><colgroup><col style="width:230px"><col><col style="width:64px"><col style="width:84px">
            <col style="width:76px"><col style="width:330px"></colgroup>
            <thead><tr><th>kb_id</th><th>标题 / 内容预览</th><th class="num">页</th><th>类型</th>
              <th class="num">字数</th><th>操作</th></tr></thead>
            <tbody>${d.chunks.map(c=>`<tr>
              <td class="mono" title="${esc(c.kb_id)}">${esc(c.kb_id)}${c.edited?'<span class="tag">已改</span>':''}
                ${(c.excluded||c.disabled)?'<span class="tag">不检索</span>':''}</td>
              <td class="wrap"><b>${esc((c.title||'').slice(0,40))}</b><br>
                <span class="hint">${esc((c.content||'').slice(0,70))}…</span></td>
              <td class="num">${c.page_idx!=null?'p.'+c.page_idx:'—'}</td>
              <td>${esc(c.chunk_type||'')}</td>
              <td class="num">${len(c.content)}</td>
              <td>
                <button data-act="edit" data-kb="${esc(c.kb_id)}">编辑</button>
                <button data-act="split" data-kb="${esc(c.kb_id)}">拆分</button>
                <button data-act="disable" data-kb="${esc(c.kb_id)}">禁用</button>
                <button data-act="delete" data-kb="${esc(c.kb_id)}">删除</button>
              </td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card-b">
          <div class="toolbar" style="margin:0">
            <span class="hint">人工编辑与机器产物并存；index 会优先读人工产物</span>
          </div>
        </div>
      </div>`;
    $$('#content [data-act]').forEach(b=>b.addEventListener('click',()=>chunkAction(b.dataset.act, b.dataset.kb)));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

function len(s){ return (s||'').length; }

async function chunkAction(act, kbId){
  const base = '/api/docs/'+encodeURIComponent(STATE.doc)+'/chunks/'+encodeURIComponent(kbId);
  try{
    if(act==='edit'){
      const text = prompt('修改切片正文（将落人工产物，不覆盖机器产物）：');
      if(text===null) return;
      await req(base+'/edit',{method:'POST',body:JSON.stringify({text})});
    } else if(act==='split'){
      const raw = prompt('拆分点字符偏移（逗号分隔，如 200,450）：');
      if(!raw) return;
      await req(base+'/split',{method:'POST',
        body:JSON.stringify({positions: raw.split(',').map(x=>x.trim()).filter(Boolean)})});
    } else {
      await req(base+'/'+act,{method:'POST'});
    }
    toast('已提交，切块及下游标记为待重跑');
    go('review', true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

/* ── 页面：解析高危敏感信息复核（US-06，原「内容复核」2026-10-09 改名）────── */
const REVIEW_STATE = {pending:'待复核',accepted:'已采纳',edited:'已编辑',
  rejected:'误报',unresolvable:'无法补全'};

async function renderNumbers(){
  if(!STATE.doc){ $('#content').innerHTML = noDoc(); return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/reviews');
    if(!d.ready){ $('#content').innerHTML = `<div class="card"><div class="empty">
      <div class="big">还没有复核产物</div>先跑一次七步。</div></div>`; return; }
    const items = d.items || [];
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>${esc(STATE.doc)} · 解析高危敏感信息复核</h2>
          <span class="meta">待处理 ${items.length} 条 · 规则例外 ${(d.rule_exceptions||[]).length} 条</span></div>
        <div class="card-b">
          <div class="hint">四态：<b>采纳</b>（用候选值补全）/ <b>手动填值</b> / <b>判为误报</b>（记规则例外，不再重复提醒）/
            <b>标记无法补全</b>（保持不可检索）。补全会改变正文 → <b>该块向量会被清空重算</b>。</div>
        </div>
        <div class="card-b flush">
          ${items.length? `<table><colgroup><col style="width:230px"><col><col style="width:70px">
            <col style="width:170px"><col><col style="width:300px"></colgroup>
            <thead><tr><th>kb_id</th><th>标题</th><th class="num">页</th><th>命中规则</th>
              <th>候选补全值</th><th>处置</th></tr></thead>
            <tbody>${items.map(it=>`<tr>
              <td class="mono" title="${esc(it.kb_id)}">${esc(it.kb_id)}</td>
              <td class="wrap">${esc((it.title||'').slice(0,40))}</td>
              <td class="num">${it.page_idx!=null?'p.'+it.page_idx:'—'}</td>
              <td class="hint">${esc((it.patterns||[]).join('/')||it.reason||'')}</td>
              <td class="hint wrap">${(it.candidates||[]).map(esc).join('<br>')||'未定位 ⚠'}</td>
              <td>
                <button data-r="accepted" data-kb="${esc(it.kb_id)}">采纳</button>
                <button data-r="edited" data-kb="${esc(it.kb_id)}">填值</button>
                <button data-r="rejected" data-kb="${esc(it.kb_id)}">误报</button>
                <button data-r="unresolvable" data-kb="${esc(it.kb_id)}">无法补全</button>
              </td></tr>`).join('')}</tbody></table>`
          : `<div class="empty"><div class="big">没有待复核项</div>
              数字门禁未命中，或已全部处置完毕。</div>`}
        </div>
      </div>`;
    $$('#content [data-r]').forEach(b=>b.addEventListener('click',()=>resolveReview(b.dataset.r, b.dataset.kb)));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

async function resolveReview(state, kbId){
  const url = '/api/docs/'+encodeURIComponent(STATE.doc)+'/reviews/'+encodeURIComponent(kbId)+'/resolve';
  let value = '';
  try{
    if(state==='accepted'){
      value = prompt('采纳的补全值（直接写要填进正文的内容）：') || '';
      if(!value) return;
    } else if(state==='edited'){
      value = prompt('手动填值：') || '';
      if(!value) return;
    }
    await req(url,{method:'POST',body:JSON.stringify({state, value})});
    toast(`${kb_id.slice(-20)} → ${REVIEW_STATE[state]}`);
    go('numbers', true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

/* ── 页面：入库结果（US-09）──────────────────────── */
async function renderIndexResult(){
  if(!STATE.doc){ $('#content').innerHTML = noDoc(); return; }
  try{
    const d = await req('/api/docs/'+encodeURIComponent(STATE.doc)+'/index-result');
    if(!d.ready){ $('#content').innerHTML = `<div class="card"><div class="empty">
      <div class="big">还没有索引产物</div>先跑一次七步。</div></div>`; return; }
    const c = d.counts || {};
    const kv = [['模式', d.mode], ['纳入检索', c.to_index], ['待复核', c.review_excluded],
                ['噪声屏蔽', c.noise_excluded], ['向量模型', (d.embedding||{}).model],
                ['向量维度', (d.embedding||{}).dim], ['向量可用', (d.embedding||{}).available],
                ['关键词来源', d.keyword_source], ['目标库', (d.target||{}).db_name]];
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>${esc(STATE.doc)} · 入库结果</h2>
          <span class="meta"><span class="pill ${d.mode==='dry_run'?'warn':'ok'}">${d.mode}</span></span></div>
        <div class="card-b"><dl class="kv">${kv.map(([k,v])=>
          `<dt>${k}</dt><dd>${esc(String(v==null?'—':v))}</dd>`).join('')}</dl></div>
        <div class="card-b flush">
          <table><colgroup><col style="width:230px"><col><col style="width:100px">
            <col style="width:80px"><col style="width:220px"></colgroup>
            <thead><tr><th>kb_id</th><th>标题</th><th>检索状态</th><th class="num">字数</th><th>关键词</th></tr></thead>
            <tbody>${(d.plan||[]).slice(0,200).map(p=>`<tr>
              <td class="mono" title="${esc(p.kb_id)}">${esc(p.kb_id)}</td>
              <td>${esc((p.title||'').slice(0,36))}</td>
              <td><span class="pill ${p.retrieval_status==='enabled'?'ok':(p.retrieval_status==='review'?'warn':'plain')}">${p.retrieval_status}</span></td>
              <td class="num">${p.content_chars}</td>
              <td class="hint wrap">${esc((p.keywords||'').slice(0,60))}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card-b hint">共 ${(d.plan||[]).length} 条计划；仅展示前 200 条。
          ${(d.warnings||[]).map(esc).join('<br>')}</div>
      </div>`;
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

/* ── 页面：发布上线（US-10）──────────────────────── */
const CHK_MARK = {pass:'✔', fail:'✘', not_executed:'·'};

async function renderPublish(){
  try{
    const st = await req('/api/publish/state');
    const ov = await ensureOverview();
    const docs = ov.docs.map(d=>d.doc_id);
    const r = await req('/api/publish/checks',{method:'POST',body:JSON.stringify({doc_ids:docs})});
    const blockers = (r.checks||[]).filter(c=>c.status==='fail');
    $('#content').innerHTML = `
      <div class="notice"><b>本环境不真正写库</b>：发布流程会跑完整检查、生成快照并留档，
        但写入动作需在迁移 021 落地后由 CLI 执行。检查项数据不足时记「未执行」，<b>不会假装通过</b>。</div>
      <div class="card">
        <div class="card-h"><h2>发布前检查</h2>
          <span class="meta">${blockers.length?`<span class="pill danger">${blockers.length} 项未通过</span>`:'<span class="pill ok">全部通过</span>'}
            · 目标 ${docs.length} 份文档</span></div>
        <div class="card-b flush"><table><tbody>
          ${(r.checks||[]).map(c=>`<tr>
            <td style="width:200px">${CHK_MARK[c.status]} ${esc(c.label)}</td>
            <td class="hint wrap">${esc(c.detail)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="card-b"><div class="toolbar" style="margin:0">
          <button class="primary" id="pub-run">生成快照并发布（计划）</button>
          <button id="pub-snap">只生成快照</button>
          <label class="chk"><input type="checkbox" id="pub-force"> 检查未通过也放行（留痕）</label>
        </div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>快照</h2><span class="meta">${(st.snapshots||[]).length} 个</span></div>
        <div class="card-b flush">${(st.snapshots||[]).length?`<table>
          <colgroup><col><col style="width:180px"><col style="width:90px"><col style="width:100px"></colgroup>
          <thead><tr><th>快照</th><th>创建时间</th><th class="num">切片</th><th>操作</th></tr></thead>
          <tbody>${st.snapshots.map(s=>`<tr>
            <td class="mono">${esc(s.name)}</td><td class="mono">${esc(s.created_at)}</td>
            <td class="num">${s.chunks}</td>
            <td><button data-rollback="${esc(s.name)}">回滚到此</button></td></tr>`).join('')}</tbody>
        </table>`:'<div class="empty"><div class="big">还没有快照</div>发布前会自动生成。</div>'}</div>
      </div>`;
    $('#pub-run').addEventListener('click',()=>doPublish(docs,false));
    $('#pub-snap').addEventListener('click',async()=>{
      const s = await req('/api/publish/snapshot',{method:'POST',body:JSON.stringify({note:'手动快照'})});
      toast('快照 '+s.name+'：'+s.chunks+' 切片'); go('publish', true);
    });
    $$('#content [data-rollback]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('确认回滚到 '+b.dataset.rollback+'？该操作会覆盖目标库现有切片')) return;
      const r = await req('/api/publish/rollback',{method:'POST',body:JSON.stringify({snapshot:b.dataset.rollback})});
      toast(r.ok?`已恢复 ${r.restored_chunks} 切片（${r.match?'与快照一致':'⚠ 不一致'}）`:'回滚失败：'+r.message, 8000);
      go('publish', true);
    }));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

async function doPublish(docs, force){
  try{
    const body = {doc_ids: docs, target_env: 'dev'};
    if($('#pub-force') && $('#pub-force').checked) body.force = true;
    const r = await req('/api/publish/run',{method:'POST',body:JSON.stringify(body)});
    if(!r.ok){ toast('已拦下：'+ (r.blockers||[]).map(b=>b.label).join('、'), 8000); return; }
    toast('发布计划已生成 · 快照 '+(r.snapshot||{}).name);
    go('publish', true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

/* ── 页面：检索质检（US-11）──────────────────────── */
async function renderQuality(){
  try{
    const s = await req('/api/quality');
    const b = s.baseline;
    const th = s.thresholds || {};
    const pass = b ? (b.recall_at_k >= th.recall_min && b.harmful_rate <= th.harmful_max) : null;
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>检索质检</h2>
          <span class="meta">测试集 ${s.cases} 题 · gold ${s.gold_pairs} 组 · 口径 ${esc(s.gold_version)}</span></div>
        <div class="card-b">
          <div class="hint">指标：精确 Recall@k（gold 命中）与有害召回（非 gold 进 top5 的比例）。
            门槛来自 <code>config/pipeline.yaml</code> 的 <code>regression</code> 组，
            不达标默认阻塞发布（可二次确认放行）。
            <b>gold 映射失效会被单独报出，绝不静默算成未命中。</b></div>
        </div>
        <div class="kpis" style="padding:0 14px">
          <div class="kpi"><div class="k">Recall@${b?b.k:'—'}</div>
            <div class="v">${b? (b.recall_at_k*100).toFixed(1)+'%' : '—'}</div>
            <div class="u">门槛 ${(th.recall_min*100).toFixed(0)}%</div></div>
          <div class="kpi"><div class="k">有害召回</div>
            <div class="v">${b? (b.harmful_rate*100).toFixed(1)+'%' : '—'}</div>
            <div class="u">门槛 ≤${(th.harmful_max*100).toFixed(0)}%</div></div>
          <div class="kpi"><div class="k">结论</div>
            <div class="v">${pass===null?'未跑':(pass?'达标':'未达标')}</div>
            <div class="u">${b?esc((b.recorded_at||'').slice(0,16)):'无基线'}</div></div>
        </div>
        <div class="card-b"><div class="toolbar" style="margin:0">
          <button class="primary" id="q-run">跑一次质检</button>
          <span class="hint">需数据库可连；测试集与 gold 为空时结果为「未执行」</span>
        </div></div>
      </div>
      <div id="q-result"></div>`;
    $('#q-run').addEventListener('click', runQuality);
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

async function runQuality(){
  toast('<span class="spin"></span> 质检运行中…', 60000);
  try{
    const r = await req('/api/quality/run',{method:'POST',body:JSON.stringify({k:10})});
    if(r.status!=='ok'){
      $('#q-result').innerHTML = `<div class="card"><div class="empty">
        <div class="big">${esc(r.status)}</div>${esc(r.message||'')}
        ${(r.broken_cases||[]).length?`<br>失效题目：${r.broken_cases.map(esc).join('、')}`:''}</div></div>`;
      toast('⚠ '+esc(r.message||r.status), 8000); return;
    }
    const m = r.metrics;
    $('#q-result').innerHTML = `<div class="card">
      <div class="card-h"><h2>结果</h2><span class="meta">
        ${r.passed?'<span class="pill ok">达标</span>':'<span class="pill danger">未达标</span>'}
        ${r.delta?` · 较基线 Recall ${(r.delta.recall_at_k*100).toFixed(1)}pt`:''}</span></div>
      <div class="card-b flush"><table>
        <colgroup><col style="width:90px"><col><col style="width:70px"><col style="width:230px"></colgroup>
        <thead><tr><th>题号</th><th>问题</th><th class="num">页码</th><th>gold</th></tr></thead>
        <tbody>${(r.misses||[]).map(x=>`<tr>
          <td class="mono">${esc(x.case_id)}</td><td class="wrap">${esc(x.question)}</td>
          <td class="num">—</td><td class="mono hint">${esc((x.expected||[]).join(', '))}</td></tr>`).join('')
          || '<tr><td colspan="4" class="hint">全部命中</td></tr>'}</tbody></table></div>
      <div class="card-b hint">未命中 ${(r.misses||[]).length} 题（上方列出）。
        到「知识缺口」可把它们收进台账并归因。</div>
    </div>`;
    toast(`Recall@${m.k} ${(m.recall_at_k*100).toFixed(1)}% · 有害 ${(m.harmful_rate*100).toFixed(1)}%`);
    ensureOverview(true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

/* ── 页面：知识缺口（US-12）──────────────────────── */
const ATTR_LABEL = {coverage_gap:'覆盖缺口', slice_excluded:'切片被屏蔽', gold_stale:'gold 映射失效'};

async function renderGaps(){
  try{
    const d = await req('/api/gaps');
    const st = d.stats || {};
    const rows = d.items || [];
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-h"><h2>知识缺口</h2>
          <span class="meta">开放 ${st.open||0} · 已关闭 ${st.closed||0} · 暂不处理 ${st.deferred||0}</span></div>
        <div class="card-b"><div class="hint">
          归因决定动作：<b>覆盖缺口</b>→补录语料；<b>切片被屏蔽</b>→去「已屏蔽内容」恢复；<b>gold 失效</b>→重做映射。
          「暂不处理」必须填原因。</div>
          <div class="toolbar" style="margin:10px 0 0">
            <button class="primary" id="g-collect">从最近质检收集</button>
          </div>
        </div>
        <div class="card-b flush">
          ${rows.length? `<table><colgroup><col><col style="width:130px"><col style="width:70px">
            <col><col style="width:80px"><col style="width:170px"></colgroup>
            <thead><tr><th>主题</th><th>归因</th><th class="num">出现</th><th>证据</th>
              <th>状态</th><th>动作</th></tr></thead>
            <tbody>${rows.map(g=>`<tr>
              <td class="wrap">${esc(g.theme)}</td>
              <td><span class="pill ${g.attribution==='coverage_gap'?'warn':'plain'}">${esc(ATTR_LABEL[g.attribution]||g.attribution)}</span></td>
              <td class="num">${g.occurrences}</td>
              <td class="hint wrap">${esc((g.evidence||'').slice(0,60))}</td>
              <td>${esc(g.state)}</td>
              <td><button data-close="${esc(g.gap_id)}">关闭</button>
                <button data-defer="${esc(g.gap_id)}">暂不处理</button></td>
            </tr>`).join('')}</tbody></table>`
          : `<div class="empty"><div class="big">暂无缺口记录</div>
              先跑「检索质检」，再点上面的「从最近质检收集」。</div>`}
        </div>
        ${(d.online_misses||[]).length? `<div class="card-b">
          <h2 style="font-size:13px;margin:0 0 6px">线上未命中 TOP（近 7 天）</h2>
          ${d.online_misses.map(m=>`<div class="hint">${m.count} 次 · ${esc(m.query)}</div>`).join('')}
        </div>`:''}
      </div>`;
    $('#g-collect').addEventListener('click', async ()=>{
      const r = await req('/api/gaps/collect',{method:'POST'});
      toast(r.ok?`已收进 ${r.added.length} 条缺口`:(r.message||'无法收集'), 7000);
      go('gaps', true);
    });
    $$('#content [data-close]').forEach(b=>b.addEventListener('click', async ()=>{
      await req('/api/gaps/'+encodeURIComponent(b.dataset.close)+'/close',{method:'POST',body:'{}'});
      toast('已关闭'); go('gaps', true);
    }));
    $$('#content [data-defer]').forEach(b=>b.addEventListener('click', async ()=>{
      const reason = prompt('暂不处理的原因（必填）：');
      if(!reason) return;
      const r = await req('/api/gaps/'+encodeURIComponent(b.dataset.defer)+'/defer',
        {method:'POST',body:JSON.stringify({reason})});
      toast(r.ok?'已标记暂不处理':'失败'); go('gaps', true);
    }));
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

/* （2026-10-09 删除）页面：智能体对接（US-13）已整体移除（React 与回退页同删，含后端 /api/contract*）；
   契约校验保留为 CLI：kb-pipeline contract show/validate/observe。 */

/* ── 页面：生效阈值 ─────────────────────────────── */
async function renderConfig(){
  try{
    const ov = await ensureOverview();
    const allYaml = ov.config_groups.every(g=>g.source==='yaml');
    $('#content').innerHTML = `
      <div class="notice" style="${allYaml?'background:var(--ok-bg);border-color:var(--ok);color:var(--ok)':''}">
        <b>配置文件：</b><code>minicare-platform/api/config/pipeline.yaml</code> ·
        ${allYaml?'已生效（所有分组来源均为 yaml）':'⚠️ 部分分组未从 yaml 读取，当前使用代码默认值'}
      </div>
      <div class="grid-2">
        ${ov.config_groups.map(g=>`
          <div class="card">
            <div class="card-h"><h2>${esc(g.group)}</h2>
              <span class="pill ${g.source==='yaml'?'ok':'warn'}">${g.source}</span></div>
            <div class="card-b flush">
              <table><tbody>${g.rows.map(r=>`<tr>
                <td class="mono wrap" style="width:46%">${esc(r.key)}</td>
                <td class="mono wrap">${esc(String(r.value))}</td></tr>`).join('')}</tbody></table>
            </div>
          </div>`).join('')}
      </div>`;
  }catch(e){ $('#content').innerHTML = errBox(e); }
}

/* ── 页面：未实现占位 ───────────────────────────── */
function renderPlaceholder(id){
  const m = pageMeta(id)||{};
  $('#content').innerHTML = `
    <div class="card">
      <div class="empty">
        <div class="big">${esc(m.label||id)} 尚未实现</div>
        <p>计划于 <b>第 ${m.phase} 期</b> 落地 · 需求来源 ${esc(m.story||'—')}</p>
        <p style="max-width:62ch;margin:10px auto 0;color:var(--text-2)">${esc(m.desc||'')}</p>
        <p style="margin-top:16px;color:var(--text-3)">
          设计依据见 <code>docs/prd/PRD-008/</code> 与 <code>docs/tech/TECH-015-kb-platform.md</code>
        </p>
      </div>
    </div>`;
}

function errBox(e){
  return `<div class="card"><div class="empty"><div class="big">加载失败</div>${esc(e.message)}</div></div>`;
}

/* ── 动作 ───────────────────────────────────────── */
function actionOpts(){
  const un=$('#until');
  return {force:false, until: un? (un.value.trim()||null) : null};
}
async function runDoc(docId){
  try{
    toast('<span class="spin"></span> 运行中（dry-run）…', 60000);
    const r = await req('/api/docs/'+encodeURIComponent(docId)+'/run',{method:'POST',body:JSON.stringify(actionOpts())});
    const done = r.steps.filter(s=>s.status==='succeeded').length;
    const cached = r.steps.filter(s=>s.status==='skipped_cached').length;
    toast(`完成 · 派生状态 ${r.status} · 执行 ${done} / 缓存 ${cached}`);
    STATE.doc = docId; await ensureOverview(true); go(STATE.page,true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}
async function runStep(docId,step){
  try{
    const o = actionOpts();
    const r = await req('/api/docs/'+encodeURIComponent(docId)+'/steps/'+step+'/run',{method:'POST',body:JSON.stringify(o)});
    toast(`${STEP_LABEL[step]||step} → ${STEP_STATUS_LABEL[r.status]||r.status}${r.error?(' · '+esc(r.error)):''}`);
    STATE.doc = docId; go(STATE.page,true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}
async function invalidate(docId){
  try{
    const r = await req('/api/docs/'+encodeURIComponent(docId)+'/invalidate',{method:'POST',body:JSON.stringify({from_step:'segment'})});
    toast('已标为待重跑：'+r.marked.join(' → '));
    go(STATE.page,true);
  }catch(e){ toast('失败：'+esc(e.message), 8000); }
}

/* ── 启动 ───────────────────────────────────────── */
/* 深链接：?page=excluded&doc=<doc_id> —— 页面可收藏、可分享、可直接贴给我排障 */
(function initFromUrl(){
  const q = new URLSearchParams(location.search);
  const p = q.get('page'), d = q.get('doc');
  if(p==='publishlog') STATE.page = 'publish';  // （2026-10-09 删除）发布记录页已移除 → 翻译回发布上线
  else if(p && pageMeta(p)) STATE.page = p;
  if(d) STATE.doc = d;
})();

renderNav(); renderTopbar();
ensureOverview(true)
  .then(()=>go(STATE.page))
  .catch(e=>{ $('#content').innerHTML = errBox(e); });
"""


def _nav_html() -> str:
    """服务端渲染侧栏（首屏不依赖 JS 才有导航）"""
    out: list[str] = []
    for group in NAV:
        out.append(f'<div class="nav-group"><div class="nav-group-title">{group["group"]}</div>')
        for it in group["items"]:
            cls = "nav-item" + ("" if it["impl"] else " todo")
            tag = "" if it["impl"] else f'<span class="ph">第{it["phase"]}期</span>'
            out.append(
                f'<a class="{cls}" data-page="{it["id"]}"><span class="dot"></span>'
                f'<span>{it["label"]}</span>{tag}</a>'
            )
        out.append("</div>")
    return "\n".join(out)


def render_index_html() -> str:
    import json

    pages_json = json.dumps(NAV, ensure_ascii=False)
    return (
        _PAGE
        .replace("/*STYLE*/", _STYLE)
        .replace("<!--NAV-->", _nav_html())
        .replace("/*SCRIPT*/", _SCRIPT)
        .replace("/*PAGES_JSON*/", pages_json)
    )


_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>敏宝管理平台</title>
<style>/*STYLE*/</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <b>敏宝管理平台</b>
      <span>本地维护端 · v0</span>
    </div>
    <nav class="nav"><!--NAV--></nav>
    <div class="sidebar-foot">
      <div class="row"><span class="pill accent">只读环境</span></div>
      <div class="row" id="foot-version">正在读取版本…</div>
      <div class="row" id="foot-config"></div>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <div>
        <h1 id="page-title">文档库</h1>
        <p class="sub" id="page-sub"></p>
      </div>
      <div class="topbar-actions" id="page-actions"></div>
    </header>
    <div class="content" id="content"></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script type="application/json" id="pages-json">/*PAGES_JSON*/</script>
<script>/*SCRIPT*/</script>
</body>
</html>
"""
