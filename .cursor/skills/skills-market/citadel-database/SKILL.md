---
name: citadel-database
description: "学城多维表格操作工具。支持:文档/表格创建与管理、数据增删改查、批量操作、筛选排序、文件上传、账号转换。当用户需要操作多维表格、批量处理表格数据、数据同步、数据收集、表格自动化时使用。触发词:表格、多维表格、XTable、批量操作、数据导入。"

metadata:
  skillhub.creator: "zhangshufei02"
  skillhub.updater: "zhangshufei02"
  skillhub.version: "V7"
  skillhub.source: "FRIDAY Skillhub"
  skillhub.skill_id: "3859"
  skillhub.high_sensitive: "true"
---

# 📊 学城多维表格 XTable 

学城多维表格操作工具，通过 CLI 快速创建、查询和管理多维表格数据。认证自动处理，支持批量操作。

## 核心特性

- ✅ **HTTP REST API**:直接使用 HTTP 接口,高效稳定
- ✅ **简洁的二维数组格式**:使用 `[["值1", "值2"]]` 格式操作数据,自动类型转换
- ✅ **完整的 CRUD**:支持创建、查询、更新、删除操作
- ✅ **Token 自动缓存**:认证信息自动保存,后续调用无需重复认证
- ✅ **支持筛选和排序**:灵活的数据查询能力

## 目录

- [前置检查](#前置检查)
- [意图路由](#意图路由)
- [CLI 速查](#cli-速查)
- [快速开始](#快速开始)
- [复制数据表](#复制数据表)
- [账号转换](#账号转换mis--empid--uid)
- [约束](#约束)
- [认证](#认证)
- [列类型对照表](#列类型对照表)
- [文件上传工作流](#文件上传工作流)
- [筛选和排序](#筛选和排序)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

## 前置检查

### Node.js 版本检查

执行 xtable skill 时会自动检查 Node.js 版本是否符合要求（>= 18.0.0）。如果版本过低，系统会：

1. **自动检测并安装 nvm**（如未安装）
2. **通过 nvm 自动安装并切换到 Node.js 18 或更高版本**
3. **重新执行命令**，使用新的 Node.js 版本

**无需手动干预，版本升级完全自动化。** ✨

### CLI 版本检查

每次执行命令前，先检查 `@it/oa-skills` 是否为最新版本：

```bash
npm list -g @it/oa-skills --depth=0 2>/dev/null | grep oa-skills
```

如果未安装或版本不是最新，执行更新：

```bash
npm install -g @it/oa-skills --registry=http://r.npm.sankuai.com
```

**此步骤必须在每次 skill 激活时执行一次，否则新命令可能不存在导致运行失败。**

## 典型工作流

多维表格操作遵循以下标准流程：

```
1. 准备阶段 → 2. 数据操作 → 3. 验证结果
```

**阶段 1: 准备 - 获取元数据**
- 入口：已知 contentId 或 tableId
- 操作：`getTableMeta` 获取列 ID 和列类型
- 出口：获得 columnId 列表，了解数据结构

**阶段 2: 数据操作**
- 入口：已知 tableId 和 columnId
- 操作：`addData` / `updateData` / `queryTableData` / `deleteData`
- 出口：返回操作结果（新增/更新/删除的行数）

**阶段 3: 验证**
- 入口：操作完成
- 操作：`queryTableData` 查询数据确认修改成功
- 出口：确认数据符合预期，退出码 0

## 意图路由

| 用户意图                    | 命令                                    |
| -------------------------- | --------------------------------------- |
| 创建一个新的多维表格文档     | `createDatabase --contentTitle <标题> --tableTitle <表格>` |
| 在现有文档中创建新数据表     | `createTable --contentId <id> --tableTitle "任务表" --columnMeta '[{"columnName":"任务名","columnType":1}]'` |
| 复制数据表到指定文档         | `copyTable --sourceTableId <源ID> --targetParentId <目标父文档ID>` |
| 查看文档下有哪些表格         | `listTables --contentId "2750138424"`                 |
| 查询表格的列结构（columnId） | `getTableMeta --tableId <id>`                          |
| 查询表格中的数据             | `queryTableData --tableId <id> [--columnIds <列ID>] [--filter <条件>] [--sort <排序>]` |
| 向表格中添加新数据           | `addData --tableId <id> --columnIds <列ID> --data '[...]'` |
| 更新表格中的数据             | `updateData --tableId <id> --rowIds <行ID> --data '[...]'` |
| 删除表格中的数据             | `deleteData --tableId <id> --rowIds "123456,123457"` |
| 重命名数据表                 | `renameTable --tableId <id> --title "新表格名称"`    |
| 数据表排序                   | `sortTable --tableId <id> --to 2`                    |
| **查询用户信息（账号转换）** | `getUserInfo --misList '["mis1", "mis2"]'`             |
| **上传本地文件到表格**       | `uploadFile --contentId <id> --tableId <id> --file <路径>` |
| **上传文件并添加到附件列** ⭐ | `uploadFileAndAddData --contentId <id> --tableId <id> --file <路径> --columnIds <列ID> --data '[...]'` |
| 通过 S3 URL 上传文件 🔧      | `uploadFileByS3Url --s3Url <S3地址> [--fileName <文件名>] --contentId <id>` |

**图例说明：**
- ⭐ **推荐使用** - 一步完成，适合大多数场景
- 🔧 **低层 API** - 用于调试、测试或特殊工作流集成

### 📝 文档级别操作（使用 citadel 命令）

对于以下**文档级别**的操作，请使用 `oa-skills citadel` 命令而非 `citadel-database`：

| 操作类型         | 命令                                                                 | 说明                           |
| --------------- | -------------------------------------------------------------------- | ------------------------------ |
| 删除文档         | `oa-skills citadel deleteDocument --contentId <id>`                  | 删除多维表格文档                |
| 恢复文档         | `oa-skills citadel restoreDocument --contentId <id>`                 | 从回收站恢复文档                |
| 移动文档         | `oa-skills citadel moveDocument --contentId <id> --targetParentId <目标ID>` | 移动文档到其他位置      |
| 获取划词评论     | `oa-skills citadel getFullTextComments --contentId <id>`             | 获取文档的划词评论              |

**原因**：`citadel-database` 专注于数据表和数据操作，文档级别的管理（删除/恢复/移动/评论）由 `citadel` 命令负责。

## CLI 速查

**命令格式**：`oa-skills citadel-database <command> [options]`  
**完整文档**：`{baseDir}/references/cli-reference.md`

**通用选项**：`--mis <mis>` | `--raw` | `--clear-cache` | `--force-ciba`

📖 所有命令的详细参数、示例和工作流见 references 文档

## 快速开始

### 常用命令示例

```bash
# 1. 创建多维表格文档
oa-skills citadel-database createDatabase \
  --contentTitle "项目管理" \
  --tableTitle "任务列表"

# 2. 查询表格元数据（获取列ID）
oa-skills citadel-database getTableMeta --tableId "456789"

# 3. 查询数据
oa-skills citadel-database queryTableData \
  --tableId "456789" \
  --columnIds "1,2,3"

# 4. 添加数据
oa-skills citadel-database addData \
  --tableId "456789" \
  --columnIds "1,2,3" \
  --data '[["任务A", 100, "进行中"]]'

# 5. 更新数据
oa-skills citadel-database updateData \
  --tableId "456789" \
  --rowIds "123" \
  --columnIds "3" \
  --data '[["已完成"]]'

# 6. 查看文档下的所有表格
oa-skills citadel-database listTables --contentId "2750138424"

# 7. 在现有文档中创建新表格
oa-skills citadel-database createTable \
  --contentId "2750138424" \
  --tableTitle "员工信息表" \
  --columnMeta '[{"columnName":"姓名","columnType":1},{"columnName":"年龄","columnType":2}]'

# 8. 重命名数据表
oa-skills citadel-database renameTable \
  --tableId "456789" \
  --title "项目任务表-2024"

# 9. 调整表格在文档中的位置
oa-skills citadel-database sortTable \
  --tableId "456789" \
  --to 2

# 10. 删除表格中的数据行
oa-skills citadel-database deleteData \
  --tableId "456789" \
  --rowIds "123456,123457,123458"
```

**💡 提示**：
- `--mis` 参数可选，默认从配置文件读取
- **自动分页**：`addData` 和 `updateData` 在超过 500 行时自动分批处理
- **大数据量支持**：使用 `--file` 参数从 JSON 文件读取数据，避免命令行参数过长
- 更多示例和完整参数见 `{baseDir}/references/cli-reference.md`

## 复制数据表

将数据表（结构和数据）复制到指定文档。详细参数见 `{baseDir}/references/cli-reference.md`。

```bash
oa-skills citadel-database copyTable \
  --sourceTableId "456789" \
  --targetParentId "123456"
```

## 大数据量操作（--file 参数）

使用 `--file` 参数从 JSON 文件读取数据，避免命令行参数过长。详见 `{baseDir}/references/cli-reference.md`。

## 账号转换（MIS ↔ empId）

批量查询用户信息，支持 MIS 到 empId 转换。详见 `{baseDir}/references/cli-reference.md` 的 getUserInfo 章节。

```bash
oa-skills citadel-database getUserInfo --misList '["zhangsan", "lisi"]'
```

## 约束

- `--mis` 参数可选，未指定时会从 `~/.config/clawdgw.json` 的 `defaultUserId` 字段读取
- 缺少关键参数时只追问必要字段（--contentId / --tableId / --columnIds），不给笼统报错
- 列 ID 格式灵活：支持逗号分隔字符串 `"1,2,3"` 或 JSON 数组 `[1,2,3]`
- 数据大小限制：单次操作最多 500 行，如果超过需要分页处理
- 批量删除前建议先查询数据确认要删除的行 ID
- **列类型选择强制要求**：创建表格时，必须根据数据实际用途选择对应的列类型，而不是简单地全部使用文本列。如果某列类型不支持，按照降级策略使用文本列（type: 1）作为备选方案

## 暂不支持

以下能力当前 **不可用**，不要伪造执行结果：

- 列的删除和修改
- 表格结构变更（添加/删除/修改列）

用户要求时明确说明"当前暂不支持"。替代方案：可通过 Web UI 手动操作或联系管理员。


## 认证

### 默认方式：SSO 统一认证
自动选择最佳认证策略（浏览器授权或 CIBA），Token 自动缓存。

**常见问题**：
- 认证失败 → `oa-skills citadel-database --clear-cache` 后重试

**详细说明**：参见 `{baseDir}/references/cli-reference.md` 的 Token 认证章节。

## 验证

执行完成后确认：

1. 命令退出码为 0
2. 创建类：返回了新文档/表格 ID 和链接
3. 查询类：返回了数据/列表
4. 数据操作类：返回操作结果摘要（新增/更新/删除的行数）
5. 给用户简明结论（ID、数量、链接），而非原始数据

## 多维表格链接格式

多维表格的完整链接格式为：

```
https://km.sankuai.com/xtable/{contentId}?table={tableId}&view={viewId}
```

示例：
```
https://km.sankuai.com/xtable/2750138424?table=2750248577&view=1000
```

参数说明：
- `contentId`: 多维表格文档 ID（必需）
- `tableId`: 表格 ID（可选，不指定则显示第一个表格）
- `viewId`: 视图 ID（可选，不指定则显示默认视图）

## 人员 ID 转换

人员列（columnType: 4）使用 `empId` 作为标识符。如需转换 MIS/UID/empId，使用 **account-switcher** skill：

```bash
# 安装
mtskills i account-switcher

# 使用人员列示例
# 1. 转换 MIS → empId（假设得到 2015738）
# 2. 添加数据
oa-skills citadel-database addData \
  --tableId "456789" \
  --columnIds "1,2" \
  --data '[["任务A",[2015738,2015739]]]'
```

## 列类型对照表

**📖 完整数据格式文档**：查看 `{baseDir}/references/data-format.md` 获取详细的数据格式说明、转换规则、筛选/排序语法和常见错误解决方案。

| columnType | 类型说明 | 数据结构 | CellData 字段 | 示例 |
|------------|----------|----------|--------------|------|
| 1 | 文本 | `IRichTextNode[]` | `textCellValue` | `[{type:"text",value:"任务A"}]` |
| 2 | 数字 | `number` | `numberCellValue` | `100` |
| 3 | 单选 | `string` | `selectCellValue` | `"进行中"` |
| 4 | 人员 | `empId[]` | `peopleCellValue` | `[2015738,2015739]` *（ID转换用skill 3572）* |
| 5 | 多选 | `string[]` | `multipleSelectCellValue` | `["标签1","标签2"]` |
| 6 | 附件 | `string[]` (JSON字符串) | `fileCellValue` | `[JSON.stringify({attachmentId:0,name:"file.png",url:"<文件URL>"})]` |
| 7 | 日期 | `number` (timestamp) | `dateCellValue` | `1704067200000` |
| 8 | 货币 | `number` | `numberCellValue` | `99.99` |
| 9 | 公式 | 不可编辑 | - | 只读，不支持写入 |

### 说明：公式列目前还无法读取，正在开发中，有需要可以进群反馈

### 文本类型（columnType: 1）- 富文本

文本列支持富文本格式（`IRichTextNode[]`），包括纯文本、超链接和 @提及。

**快速示例**：

```bash
# 简单文本（自动转换）
--data '[["任务A"]]'

# 超链接
--data '[[
  [
    {"type":"text","value":"查看"},
    {"type":"link","value":"文档","link":"https://km.sankuai.com/page/123"}
  ]
]]'

# @提及人员（empId 必须是数字）
--data '[[
  [
    {"type":"mention","value":"张三","empId":2015739}
  ]
]]'
```

**详细格式说明**：参见 `{baseDir}/references/data-format.md` 的富文本章节。

### 附件类型（columnType: 6）- JSON 字符串格式

附件列使用 JSON 字符串数组格式，每个附件都是一个序列化的 JSON 对象。

**快速示例**：

```bash
# 添加单个附件（attachmentId、name、url 必填）
--data '[[
  JSON.stringify({
    attachmentId: 0,
    name: "logo.png",
    url: "<你的图片URL>"  # 替换为实际的文件 URL
  })
]]'

# 添加多个附件
--data '[[
  [
    JSON.stringify({attachmentId: 0, name: "file1.png", url: "<你的图片URL1>"}),
    JSON.stringify({attachmentId: 0, name: "file2.jpg", url: "<你的图片URL2>"})
  ]
]]'
```

**详细格式说明**：参见 `{baseDir}/references/data-format.md` 的附件类型章节。

### 文件上传工作流

向附件列添加文件需要先上传，再使用返回的 `attachmentId` 和 `url` 写入单元格。

#### ⭐ 推荐方式：一步完成上传和写入

```bash
# 适用场景：上传本地文件并直接写入表格
oa-skills citadel-database uploadFileAndAddData \
  --contentId "2752755021" \
  --tableId "2752934848" \
  --file "/path/to/file.jpg" \
  --columnIds "1,2" \
  --data '[["文档标题"]]'
```

#### 🔧 通过 S3 URL 上传（低层 API）

```bash
# 适用场景：文件已在 S3 存储，需要关联到多维表格
# 使用场景：
#   1. 集成外部系统（文件已上传到 S3）
#   2. 批量处理工作流（避免重复上传）
#   3. 测试和调试文件上传功能

# 步骤 1: 上传文件（fileName 可选，未提供时从 URL 自动提取）
# 注意：<S3_URL> 需替换为实际的 S3 文件 URL
oa-skills citadel-database uploadFileByS3Url \
  --s3Url "<S3_URL>"  \
  --fileName "document.xlsx" \
  --contentId "2752755021"

# 步骤 2: 使用返回的 attachmentId 和 url 写入附件列
oa-skills citadel-database addData \
  --tableId "2752934848" \
  --columnIds "3" \
  --data '[[JSON.stringify({attachmentId: 228822745910, name: "document.xlsx", url: "https://km.sankuai.com/api/file/cdn/2752446623/228822745910"})]]'
```

**详细流程**：参见 `{baseDir}/references/cli-reference.md` 的文件上传章节。

## 筛选和排序

```bash
# 筛选：filterValue 必须是字符串数组
--filter '{"conjunction":"and","conditions":[{"columnId":1,"operator":"==","filterValue":["完成"]}]}'

# 排序
--sort '[{"columnId":2,"desc":true}]'
```

详细操作符和语法见 `{baseDir}/references/data-format.md`。

## 约束

1. **列类型严格校验**：必须按照列类型对照表传入正确格式的数据,否则 API 会报错
2. **数据量限制**：单次操作最多 500 行数据，大数据量需分批处理。若需批量写操作建议每批 ≤100 行，系统会在超过 500 行时自动分批
3. **认证机制**：使用 CIBA 设备码流程，需用户扫码确认授权
4. **风控要求**：不得在输出中包含内部 IP、Token、敏感密钥等信息

## 最佳实践

1. **先查询元数据**：使用 `getTableMeta` 获取列 ID 和列类型后再操作数据
2. **批量操作**：一次性添加或更新最多 500 行数据，提高效率
3. **错误排查**：检查错误信息中的 TraceID 用于问题追踪

## 常见问题

**Q: 如何获取列ID？**  
A: 使用 `getTableMeta` 命令查询表格元数据。

**Q: 日期格式如何处理？**  
A: 日期使用毫秒时间戳格式（13位数字），如 `1704067200000`。

**Q: 如何处理人员类型？**  
A: 人员类型需要使用 empId（数字数组），使用 `getUserInfo` 命令转换 MIS 到 empId。

**Q: 单选/多选类型需要提前创建选项吗？**  
A: 不需要。系统会自动创建不存在的选项。

**Q: 如何删除多维表格文档？**  
A: 使用 `oa-skills citadel deleteDocument --contentId <id>`（文档级操作由 citadel skill 负责）。

**Q: 认证失败怎么办？**  
A: 清除缓存重新认证 `oa-skills citadel-database --clear-cache`。

**Q: API 调用失败如何排查？**  
A: 检查错误信息中的 TraceID 用于日志追踪。

## 问题反馈
点击https://applink.neixin.cn/profile?gid=70411238253加入学城多维表格官方Skill客服群大象群