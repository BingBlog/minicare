# MinerU 功能深入调研

> 生成时间：2026-08-20 ｜ 调研对象：OpenDataLab/MinerU（文档解析引擎，专为 LLM/RAG/Agent 工作流设计）
> 来源：GitHub 仓库 README、官方文档（opendatalab.github.io/MinerU）、Changelog、CSDN 技术解析、ModelScope 技能页

---

## 一、项目定位

MinerU 是上海 AI Lab 旗下 OpenDataLab 开源的**高精度文档解析引擎**，诞生于 InternLM 预训练数据处理过程。核心使命：把复杂文档（PDF/Office/图片）转换为**LLM 可直接消费的结构化 Markdown/JSON**。

与"PDF 转文本"类工具（pypdf/pdftotext）的本质区别：MinerU 做的是**版面理解 + 结构重建**，不是字符抽取。

---

## 二、输入/输出格式

| 方向 | 格式 | 版本 |
|---|---|---|
| 输入 | PDF（含扫描版自动检测）、图片（扫描/手写）、DOCX、PPTX、XLSX、网页 | DOCX 3.0.0+、PPTX/XLSX 3.1.0+ |
| 输出 | **Markdown**（多模态/NLP 两模式）、**JSON**（按阅读顺序排序）、中间格式（调试/可视化） | 全版本 |

---

## 三、核心解析能力（六大模块）

### 3.1 版面分析（Layout Analysis）
- **24 种版面元素分类**：abstract / algorithm / chart / display_formula / doc_title / image / table / text / inline_formula / seal / list / index 等
- 自动**去除页眉、页脚、脚注、页码**，保证语义连贯
- **阅读顺序重建**：按人类阅读顺序输出，适配单栏/多栏/复杂布局
- 跨页表格自动合并
- 扫描版/乱码 PDF 自动检测并启用 OCR
- 底层模型：PPDocLayoutV2（RT-DETR + LayoutLMv3 架构）

### 3.2 表格识别（Table Recognition）
- 自动识别表格 → **HTML 格式**输出（保留行列结构，非平铺文本）
- 支持表格内图片/公式解析、跨页表格合并、表格标题与脚注提取
- 底层：SLANet+（PaddleOCR 系）+ RapidTable/TableMaster/structEqTable 可切换

### 3.3 公式识别（Formula Recognition）
- 自动识别文档公式 → **LaTeX 格式**输出
- 3.0.0 起新增行间公式编号识别
- 中文公式走 PP-FormulaNet+M，英文公式走 UniMERNet Small
- 底层：UniMERNet（OpenDataLab 自研）

### 3.4 OCR
- **双引擎架构**：VLM + OCR
- **109 种语言**识别
- **PP-OCRv6**（3.4 版本升级，OmniDocBench v1.6 准确率 +11%、速度 +100%）
- 语言路由简化：日语/繁体中文/英语/拉丁语统一走 `ch` OCR 模型
- 3.3 起 VLM 模型自带**原生多语言 OCR**

### 3.5 其他
- 图片及**图片描述提取**（多模态输出模式）
- 印章文字识别（3.0.0+）
- 竖排文字支持（3.0.0+）
- 滑窗 + 流式落盘：**上万页长文档无需拆分**

### 3.6 已知局限（官方声明）
- 极复杂布局下阅读顺序可能局部错乱
- 罕见列表格式识别可能失败；代码块版面分类不支持
- 漫画/画册/小学教材/练习题解析效果差
- 复杂表格可能行列识别错误
- 冷门语言 OCR 准确率下降（如拉丁变音符、阿拉伯语易混字符）

---

## 四、三大解析引擎（后端架构）

| 引擎 | 原理 | 适用场景 | 准确率（OmniDocBench v1.6） |
|---|---|---|---|
| **pipeline** | 原子模型流水线（布局→OCR→公式→表格→段落重组） | 日常推荐，CPU/GPU 均可，**快速稳定无幻觉** | 86.47 |
| **vlm-engine** | 视觉语言模型驱动（MinerU2.5-Pro-1.2B） | 高精度、极复杂布局 | 95.39 |
| **hybrid-engine** | VLM + Pipeline 混合，原生文本提取、低幻觉 | 复杂版式文档 + 高精度需求 | 95.39 / 95.26 |
| **\*-http-client** | 连接 OpenAI 兼容服务器 | 无需本地 GPU，调用远端 | 95.30 |

**补充说明**：
- 3.3 起新增 `effort` 参数（medium/high）控制解析强度；medium 不支持 image analysis
- medium vs high 速度提升：Linux ~80%（文本）/35%（OCR）、macOS ~220%/50%
- 敏感文档（法律/医疗）建议默认 pipeline（低幻觉），仅对劣质扫描/超复杂版式用 vlm

---

## 五、VLM 模型版本线

| 版本 | 模型 | 变化 |
|---|---|---|
| 3.1.0 | MinerU2.5-Pro-2604-1.2B | 首次引入 VLM 引擎 |
| 3.3 | MinerU2.5-Pro-2605-1.2B | 修复 2604 问题，新增原生多语言 OCR |
| 4.0（开发中） | v4.0.0a6（2026-08-14） | 大版本迭代中 |

---

## 六、部署与硬件

| 项目 | 要求 |
|---|---|
| CPU | pipeline 后端可纯 CPU 运行（Linux 2019+ 发行版） |
| GPU | NVIDIA Volta+；显存最低 4GB（pipeline）/ 8GB（vlm） |
| Apple Silicon | **MPS 加速**（macOS 14.0+，本机可直接跑） |
| 国产芯片 | 昇腾/寒武纪/燧原/沐曦/摩尔线程/昆仑芯/天数智芯/海光/壁仞/平头哥（10+ 种） |
| 系统 | Windows（Py 3.10-3.12）、Linux、macOS 14.0+ |
| 内存/磁盘 | 16GB 内存（推荐 32GB+）、20GB 磁盘（推荐 SSD） |
| Python | 3.10 ~ 3.13 |

---

## 七、安装与使用

```bash
# 安装（推荐 uv）
pip install --upgrade pip && pip install uv
uv pip install -U "mineru[all]"

# 命令行（GPU 默认后端；纯 CPU 指定 pipeline）
mineru -p <input> -o <output>                    # 自动选引擎
mineru -p <input> -o <output> -b pipeline        # 强制 pipeline 后端

# 高级用法
mineru -p <input> -o <output> --effort high      # 最高精度
mineru -p <input> -o <output> --lang zh          # 指定语言提升 OCR
```

**macOS 注意**：Docker 部署仅支持 Linux/Windows（WSL2）；macOS 用原生 pip 安装 + MPS 加速。公式识别不支持 MPS，可关闭 formula 提升速度。

---

## 八、生态集成

| 场景 | 方案 |
|---|---|
| AI 编程 | **MCP Server**（Cursor、Claude Desktop、Windsurf 可用） |
| RAG 框架 | LangChain、LlamaIndex、RAGFlow、RAG-Anything、Flowise、Dify、FastGPT |
| 开发接口 | Python / Go / TypeScript SDK、CLI、REST API、Docker |
| 无代码 | mineru.net 在线版、Gradio WebUI、桌面客户端 |
| 服务化 | `mineru-api` 异步任务端点（POST /tasks）+ `mineru-router` 多 GPU 负载均衡 |

---

## 九、版本时间线与评测

| 版本 | 日期 | 核心亮点 |
|---|---|---|
| **3.4** | 2026-06-18 | PP-OCRv6 升级（准确率+11%、速度+100%）；模型下载自动选源+本地缓存 |
| **3.3** | 2026-06-11 | `effort` 解析强度参数；VLM 升级 2605-1.2B |
| **3.1.0** | 2026-04-18 | **许可证 AGPLv3 → MinerU 开源许可（基于 Apache 2.0）**；原生 PPTX/XLSX |
| **3.0.0** | 2026-03-29 | 原生 DOCX；API/CLI/Router 重架构；滑窗+流式落盘；多线程 |
| **4.0** | 开发中 | v4.0.0a1-a6（2026-07/08 密集发版） |

**评测**（OmniDocBench v1.6）：hybrid/vlm 95.39、http-client 95.30、pipeline 86.47。

---

## 十、许可证（商用关键）

**当前：MinerU Open Source License（基于 Apache 2.0 + 附加条款）**，3.1.0 起从 AGPLv3 迁移。

三个要点：
1. **可免费商用**，无需单独商业许可，但满足以下任一门槛须购买商业许可：
   - MAU > **1 亿**；或月总收入 > **2000 万美元**
2. **在线服务标识义务**：基于 MinerU 向第三方提供在线服务，须在界面或公开文档显著位置标注"使用了 MinerU"
3. 违反上述义务 → 许可证自动终止

**对 minicare 的结论**：敏宝知识库的规模远低于 1 亿 MAU/2000 万美元门槛，**可免费商用**；唯一需注意——若未来把"基于 MinerU 的文档解析"作为 minicare 对外提供的在线服务，需在文档/界面标注 MinerU 出处。

> 注：早期 3.1.0 前的版本曾用 AGPLv3，且 README 历史版本提及"使用 PyMuPDF（AGPL）"需注意——当前 3.4+ 版本已不受此影响。

---

## 十一、对敏宝知识库的适用性评估

| 敏宝需求 | MinerU 能力 | 匹配度 |
|---|---|---|
| 中文双栏医学期刊（2025 过敏共识、AD 共识等 7 份） | 中文 OCR 最强 + 阅读顺序重建 + 自动去页眉页脚 | ⭐⭐⭐⭐⭐ |
| 国际英文指南（EAACI/NIAID/DRACMA） | 109 语言 OCR + 双栏处理 | ⭐⭐⭐⭐⭐ |
| 配方阶梯表/剂量表（CMPA 资料） | 表格→HTML 结构保留 | ⭐⭐⭐⭐⭐ |
| 流程图/图片（过敏进程图等） | 多模态模式提取图片+描述 | ⭐⭐⭐⭐ |
| 溯源到原文页码 | JSON 输出含版面坐标 | ⭐⭐⭐⭐ |
| 扫描件（若有） | 自动检测 + OCR 兜底 | ⭐⭐⭐⭐⭐ |
| 本机 macOS 运行 | MPS 加速，无需 GPU | ⭐⭐⭐⭐⭐ |

**建议配置**：
- 日常解析：`-b pipeline`（快、无幻觉），文本型 PDF 已足够
- 扫描件/复杂版式：`hybrid-engine` + `--effort high`（95.39 分）
- 表格密集文档（CMPA 指南）：确认 table-config 启用（默认开）
- 输出 `--markdown`（主）+ `--json`（溯源坐标）

---

## 附：相关资源

- 官方文档：https://opendatalab.github.io/MinerU/
- Changelog：https://opendatalab.github.io/MinerU/reference/changelog/
- 在线体验：mineru.net / HuggingFace Space / ModelScope
- 技术论文：MinerU（arXiv:2409.18839）、MinerU2.5（2509.22186）、MinerU2.5-Pro（2604.04771）
- 相关项目：PDF-Extract-Kit、OmniDocBench（评测基准）、UniMERNet（公式）、MinerU-Diffusion
