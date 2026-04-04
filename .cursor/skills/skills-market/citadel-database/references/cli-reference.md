# CLI 命令参考

完整参数说明，基于 `src/citadel-database/cli.ts` 实际实现。

## 目录

- [通用选项](#通用选项)
- [createDatabase](#createdatabase)
- [createTable](#createtable)
- [copyTable](#copytable)
- [listTables](#listtables)
- [getTableMeta](#gettablemeta)
- [queryTableData](#querytabledata)
- [addData](#adddata)
- [updateData](#updatedata)
- [deleteData](#deletedata)
- [queryDeletedTables](#querydeletedtables)
- [deleteTable](#deletetable)
- [recoveryTable](#recoverytable)
- [renameTable](#renametable)
- [sortTable](#sorttable)
- [列类型说明](#列类型说明)
- [环境变量](#环境变量)
- [示例工作流](#示例工作流)
- [getUserInfo - 获取用户信息（账号转换）](#getuserinfo---获取用户信息账号转换)

## 通用选项

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `--mis <mis>` | string | 从 `~/.config/clawdgw.json` 读取 | 用户 MIS 号，用于认证 |
| `--raw` | flag | false | 输出原始 JSON 响应 |
| `--clear-cache` | flag | — | 清除认证缓存后退出，不需要指定命令 |
| `--force-ciba` | flag | false | 强制使用 CIBA 认证策略 |

## createDatabase

创建多维表格文档（包含文档和第一个数据表）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--contentTitle` | string | ✅ | — | 文档标题 |
| `--tableTitle` | string | ✅ | — | 数据表标题 |
| `--parentId` | string | ❌ | — | 父文档 ID |
| `--spaceId` | string | ❌ | — | 空间 ID |
| `--templateId` | string | ❌ | — | 模板 ID |
| `--columnMeta` | JSON | ❌ | — | 列定义 JSON 数组 |
| `--sourceContentId` | string | ❌ | — | 复制来源文档 ID |
| `--keepData` | boolean | ❌ | false | 复制时是否保留数据 |

```bash
# 创建空白多维表格
oa-skills citadel-database createDatabase \
  --contentTitle "项目管理" \
  --tableTitle "任务列表"

# 创建带列定义的表格
oa-skills citadel-database createDatabase \
  --contentTitle "项目管理" \
  --tableTitle "任务列表" \
  --columnMeta '[
    {"columnName":"项目名称","columnType":1},
    {"columnName":"负责人","columnType":1},
    {"columnName":"状态","columnType":3,"selectOptions":["待处理","进行中","已完成"]}
  ]'
```

**输出**：文档 ID、表格 ID、表格标题。

## createTable

在现有文档中创建新的数据表。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--contentId` | string | ✅ | — | 文档 ID |
| `--tableTitle` | string | ✅ | — | 数据表标题 |
| `--columnMeta` | JSON | ❌* | — | 列定义 JSON 数组 |
| `--columnMetaFile` | string | ❌ | — | 从文件读取 columnMeta 参数（文件包含列定义数组） |
| `--sourceTableId` | string | ❌ | — | 复制来源表格 ID |
| `--keepData` | boolean | ❌ | false | 复制时是否保留数据 |

\* `--columnMeta` 和 `--columnMetaFile` 二选一，**优先使用 `--columnMetaFile`**

```bash
# 创建新表格
oa-skills citadel-database createTable \
  --contentId "2750248577" \
  --tableTitle "任务表" \
  --columnMeta '[{"columnName":"任务名","columnType":1}]'

# 从文件读取列定义（推荐用于复杂的列结构）
cat > columns.json << 'EOF'
[
  {
    "columnName": "姓名",
    "columnType": 1
  },
  {
    "columnName": "年龄",
    "columnType": 2
  },
  {
    "columnName": "状态",
    "columnType": 3,
    "selectOptions": ["在职", "离职", "休假"]
  },
  {
    "columnName": "负责人",
    "columnType": 4
  }
]
EOF

oa-skills citadel-database createTable \
  --contentId "2750248577" \
  --tableTitle "员工信息表" \
  --columnMetaFile columns.json
```

**💡 文件参数优先级**：当同时提供 `--columnMeta` 和 `--columnMetaFile` 时，使用 `--columnMetaFile` 中的数据。

**输出**：表格 ID、表格标题、视图 ID、表格类型。

## copyTable

复制数据表到指定文档。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--sourceTableId` | string | ✅ | — | 源表格 ID |
| `--targetParentId` | string | ✅ | — | 目标父文档 ID |
| `--columnIds` | string/JSON | ❌ | — | 要复制的列 ID（逗号分隔或 JSON 数组） |
| `--rowIds` | string/JSON | ❌ | — | 要复制的行 ID（逗号分隔或 JSON 数组） |
| `--stepVersion` | number | ❌ | — | 步进版本号 |
| `--viewIds` | string/JSON | ❌ | [1000] | 视图 ID 列表（逗号分隔或 JSON 数组，未提供时默认为 [1000]） |

```bash
# 复制整个表格
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750138424"

# 复制指定列和行
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750138424" \
  --columnIds "1,2,3" \
  --rowIds "100,101,102"
```

**输出**：新表格 ID、标题、视图 ID、表格类型。

## listTables

查询文档下的所有数据表。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--contentId` | string | ✅ | — | 文档 ID |

```bash
oa-skills citadel-database listTables --contentId "2750138424"
```

**输出**：表格列表（表格标题、表格 ID）。

## getTableMeta

查询表格元数据（列信息）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |

```bash
oa-skills citadel-database getTableMeta --tableId "2750248577"
```

**输出**：列信息列表（列名、列 ID、列类型）。

## queryTableData

查询表格数据，支持筛选、排序和分页。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--columnIds` | string/JSON | ❌ | 前10列 | 要查询的列 ID（逗号分隔或 JSON 数组） |
| `--filter` | JSON | ❌ | — | 筛选条件 |
| `--sort` | JSON | ❌ | — | 排序配置 |
| `--pageSize` | number | ❌ | 100 | 每页返回的行数 |
| `--pageToken` | string | ❌ | — | 分页令牌（用于获取下一页） |

```bash
# 基础查询
oa-skills citadel-database queryTableData \
  --tableId "2750248577"

# 查询指定列
oa-skills citadel-database queryTableData \
  --tableId "2750248577" \
  --columnIds "1,2,3"

# 带筛选和排序
oa-skills citadel-database queryTableData \
  --tableId "2750248577" \
  --columnIds "1,2,3" \
  --filter '{"conjunction":"and","conditions":[{"columnId":1,"operator":"==","filterValue":["值"]}]}' \
  --sort '[{"columnId":2,"desc":true}]'
```

**输出**：总行数、返回行数、数据行（包含 rowId 和 cellData）。

## addData

向表格添加新数据（使用二维数组格式）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--columnIds` | string/JSON | ✅ | — | 列 ID（逗号分隔或 JSON 数组） |
| `--data` | JSON | ✅* | — | 二维数组格式的数据 `[["值1","值2"]]` |
| `--file` | string | ❌ | — | 从文件读取 data 参数（文件包含 JSON 数组） |

\* `--data` 和 `--file` 二选一，**优先使用 `--file`**

```bash
# 添加单行数据
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2,3" \
  --data '[["张三", 25, true]]'

# 添加多行数据
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2,3" \
  --data '[["张三", 25, true], ["李四", 30, false]]'

# 富文本格式（超链接）
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1" \
  --data '[[
    [
      {"type":"text","value":"查看"},
      {"type":"link","value":"文档","link":"https://km.sankuai.com/page/123"}
    ]
  ]]'

# 从文件读取大数据量（推荐用于 > 10 行的数据）
cat > data.json << 'EOF'
[
  ["员工001", 25, true, "2024-01-15"],
  ["员工002", 30, false, "2024-01-16"],
  ["员工003", 28, true, "2024-01-17"]
]
EOF

oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2,3,4" \
  --file data.json
```

**⚠️ 自动分页**：如果 `data` 超过 500 行，系统会自动分批处理，避免 API 请求失败。

**💡 文件参数优先级**：当同时提供 `--data` 和 `--file` 时，使用 `--file` 中的数据。

**输出**：成功状态、版本号、新增行的 rowIds。

## updateData

更新表格中的现有数据。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--rowIds` | string/JSON | ✅* | — | 行 ID（逗号分隔或 JSON 数组） |
| `--rowIdsFile` | string | ❌ | — | 从文件读取 rowIds 参数（文件包含 JSON 数组） |
| `--columnIds` | string/JSON | ✅ | — | 列 ID（逗号分隔或 JSON 数组） |
| `--data` | JSON | ✅* | — | 二维数组格式的数据 |
| `--file` | string | ❌ | — | 从文件读取 data 参数（文件包含 JSON 数组） |

\* `--rowIds` 和 `--rowIdsFile` 二选一，`--data` 和 `--file` 二选一，**文件参数优先**

```bash
# 更新单行
oa-skills citadel-database updateData \
  --tableId "2750248577" \
  --rowIds "123456" \
  --columnIds "1,2" \
  --data '[["新值1", "新值2"]]'

# 更新多行
oa-skills citadel-database updateData \
  --tableId "2750248577" \
  --rowIds "123456,123457" \
  --columnIds "1,2" \
  --data '[["新值1", "新值2"], ["新值3", "新值4"]]'

# 从文件读取 rowIds 和 data（推荐用于大批量更新）
cat > rowIds.json << 'EOF'
["row_123", "row_124", "row_125"]
EOF

cat > update-data.json << 'EOF'
[
  ["新值1", 100],
  ["新值2", 200],
  ["新值3", 300]
]
EOF

oa-skills citadel-database updateData \
  --tableId "2750248577" \
  --columnIds "1,2" \
  --rowIdsFile rowIds.json \
  --file update-data.json
```

**⚠️ 自动分页**：如果 `data` 超过 500 行，系统会自动分批处理，避免 API 请求失败。

**💡 文件参数优先级**：
- 当同时提供 `--rowIds` 和 `--rowIdsFile` 时，使用 `--rowIdsFile`
- 当同时提供 `--data` 和 `--file` 时，使用 `--file`

**输出**：成功状态、版本号、更新行数。

## deleteData

删除表格中的数据行。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--rowIds` | string/JSON | ✅* | — | 行 ID（逗号分隔或 JSON 数组） |
| `--rowIdsFile` | string | ❌ | — | 从文件读取 rowIds 参数（文件包含 JSON 数组） |

\* `--rowIds` 和 `--rowIdsFile` 二选一，**优先使用 `--rowIdsFile`**

```bash
# 删除单行
oa-skills citadel-database deleteData \
  --tableId "2750248577" \
  --rowIds "123456"

# 删除多行
oa-skills citadel-database deleteData \
  --tableId "2750248577" \
  --rowIds "123456,123457,123458"

# 从文件读取要删除的行 ID（推荐用于大批量删除）
cat > delete-rows.json << 'EOF'
["row_123", "row_124", "row_125", "row_126"]
EOF

oa-skills citadel-database deleteData \
  --tableId "2750248577" \
  --rowIdsFile delete-rows.json
```

**💡 文件参数优先级**：当同时提供 `--rowIds` 和 `--rowIdsFile` 时，使用 `--rowIdsFile` 中的数据。

**输出**：成功状态、版本号。

## queryDeletedTables

查询已删除的数据表和仪表盘（回收站）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--contentId` | string | ✅ | — | 文档 ID |
| `--pageSize` | number | ❌ | 20 | 每页返回的数量 |
| `--order` | string | ❌ | desc | 排序方式（asc/desc） |

```bash
oa-skills citadel-database queryDeletedTables \
  --contentId "2750138424" \
  --pageSize 20 \
  --order desc
```

**输出**：已删除表格列表（表格标题、表格 ID、删除时间）。

## deleteTable

删除数据表或仪表盘（移至回收站）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |

```bash
oa-skills citadel-database deleteTable --tableId "2750248577"
```

**输出**：成功状态、表格 ID。

## recoveryTable

从回收站恢复已删除的数据表或仪表盘。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--contentId` | string | ❌ | — | 指定恢复到的文档 ID |

```bash
# 恢复到原文档
oa-skills citadel-database recoveryTable --tableId "2750248577"

# 恢复到指定文档
oa-skills citadel-database recoveryTable \
  --tableId "2750248577" \
  --contentId "2750138424"
```

**输出**：成功状态、表格 ID。

## renameTable

重命名数据表。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--title` | string | ✅ | — | 新的表格标题 |

```bash
oa-skills citadel-database renameTable \
  --tableId "2750248577" \
  --title "新的表格名称"
```

**输出**：成功状态、表格 ID、新标题。

## sortTable

调整数据表在文档中的位置（排序）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--tableId` | string | ✅ | — | 表格 ID |
| `--to` | number | ✅ | — | 目标位置索引（从 1 开始） |

```bash
# 将表格移动到第 2 个位置
oa-skills citadel-database sortTable \
  --tableId "2750248577" \
  --to 2
```

**输出**：成功状态、表格 ID、新位置。

## copyTable

将一个数据表（包括结构和数据）复制到指定的父文档下。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--sourceTableId` | string | ✅ | — | 源多维表格 ID |
| `--targetParentId` | string | ✅ | — | 复制到的父文档 ID |
| `--columnIds` | string/JSON | ❌ | 所有列 | 复制的列 ID 列表（逗号分隔或 JSON 数组） |
| `--rowIds` | string/JSON | ❌ | 所有行 | 复制的行 ID 列表（逗号分隔或 JSON 数组） |
| `--stepVersion` | number | ❌ | — | 复制那一刻的 step 版本（用于保证数据一致性） |
| `--viewIds` | string/JSON | ❌ | [1000] | 视图 ID 列表（逗号分隔或 JSON 数组） |

### 使用场景

- ✅ 复制表格到另一个文档
- ✅ 在模板和文档之间复制表格
- ✅ 选择性复制特定列和行
- ✅ 按指定的 step 版本复制（保证数据一致性）

### 使用示例

```bash
# 基础用法：复制整个表格到文档
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750138424"

# 只复制特定列
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750138424" \
  --columnIds "[1,2,3]"

# 只复制特定行（viewIds 未提供时自动使用默认值 [1000]）
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750138424" \
  --rowIds "[100,101,102]"

# 复制特定列和行（带 step 版本和视图 ID）
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750138424" \
  --columnIds "[1,2,3]" \
  --rowIds "[100,101,102]" \
  --stepVersion 12345 \
  --viewIds "[1000]"
```

### 注意事项

- `columnIds` 和 `rowIds` 应使用 JSON 数组格式：`"[1,2,3]"` 或逗号分隔：`"1,2,3"`
- 需要对源表格有浏览权限，对目标文档有编辑权限
- 复制后会生成新的表格 ID 和视图 ID
- 如果不指定 `columnIds`，将复制所有列；如果不指定 `rowIds`，将复制所有行
- `viewIds` 参数未提供时会自动使用默认值 `[1000]`（通常为表格的默认视图）

**输出**：成功状态、新表格 ID、新视图 ID、复制的行数。

## 列类型说明

| 类型ID | 类型名称 | 数据格式 | 说明 |
|---|---|---|---|
| 1 | 文本（富文本） | `IRichTextNode[]` | 支持纯文本、超链接、@提及 |
| 2 | 数字 | `number` | 数值类型 |
| 3 | 单选 | `string` | 单选选项的值 |
| 4 | 人员 | `number[]` | empId 数组 |
| 5 | 多选 | `string[]` | 多选选项的值数组 |
| 6 | 附件 | `string[]` | JSON 字符串数组（每个元素为 `JSON.stringify({attachmentId, name, url, ...})`） |
| 7 | 日期 | `number` | 毫秒时间戳 |
| 8 | 货币 | `number` | 数值类型 |
| 9 | 公式 | 只读 | 不支持写入 |

### 富文本节点类型

```typescript
// 纯文本
{ type: "text", value: "文本内容" }

// 超链接
{ type: "link", value: "显示文字", link: "<链接URL>" }

// @提及
{ type: "mention", value: "用户名", empId: 2015739 }
```

## 环境变量

| 变量名 | 说明 |
|---|---|
| `USER_ACCESS_TOKEN` | 用于 `${user_access_token}` 占位符的用户身份 token |
| `APP_ACCESS_TOKEN` | 用于 `${app_access_token}` 占位符的应用身份 token |
| `NO_CHECK_VERSION` | 设置为 `"true"` 时跳过 Node.js 版本检查 |

## 示例工作流

### 1. 创建完整的项目管理表格

```bash
# 步骤 1: 创建文档和表格
oa-skills citadel-database createDatabase \
  --contentTitle "项目管理系统" \
  --tableTitle "项目列表" \
  --columnMeta '[
    {"columnName":"项目名称","columnType":1},
    {"columnName":"负责人","columnType":1},
    {"columnName":"状态","columnType":3,"selectOptions":["未开始","进行中","已完成","暂停"]},
    {"columnName":"优先级","columnType":3,"selectOptions":["高","中","低"]},
    {"columnName":"进度","columnType":2},
    {"columnName":"开始日期","columnType":7},
    {"columnName":"截止日期","columnType":7}
  ]'

# 假设返回 tableId: 2750248577

# 步骤 2: 添加数据
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2,3,4,5,6,7" \
  --data '[
    ["项目A", "张三", "进行中", "高", 75, 1710000000000, 1712592000000],
    ["项目B", "李四", "未开始", "中", 0, 1710000000000, 1715088000000]
  ]'

# 步骤 3: 查询数据
oa-skills citadel-database queryTableData \
  --tableId "2750248577" \
  --filter '{"conjunction":"and","conditions":[{"columnId":3,"operator":"==","filterValue":["进行中"]}]}'
```

### 2. 数据迁移和备份

```bash
# 步骤 1: 查询源表格数据
oa-skills citadel-database queryTableData \
  --tableId "2750248577" \
  --raw > backup.json

# 步骤 2: 复制表格结构到新文档
oa-skills citadel-database copyTable \
  --sourceTableId "2750248577" \
  --targetParentId "2750999999"

# 步骤 3: 从备份恢复数据（需要解析 backup.json 并转换格式）
```

### 3. 附件列数据操作

```bash
# 步骤 1: 创建包含附件列的表格
oa-skills citadel-database createDatabase \
  --contentTitle "文档管理" \
  --tableTitle "文档列表" \
  --columnMeta '[
    {"columnName":"文档标题","columnType":1},
    {"columnName":"附件","columnType":6},
    {"columnName":"上传日期","columnType":7}
  ]'

# 假设返回 tableId: 2750248577

# 步骤 2: 添加附件数据（单个附件）
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2,3" \
  --data '[[
    "项目需求文档",
    JSON.stringify({
      attachmentId: 0,
      name: "requirements.pdf",
      url: "<文件URL>",
      size: 123456,
      mimeType: "application/pdf"
    }),
    1710000000000
  ]]'

# 步骤 3: 添加多个附件
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2" \
  --data '[[
    "设计稿",
    [
      JSON.stringify({
        attachmentId: 0,
        name: "design-v1.png",
        url: "<文件URL1>",
        size: 6105,
        width: 1920,
        height: 1080,
        mimeType: "image/png"
      }),
      JSON.stringify({
        attachmentId: 0,
        name: "design-v2.png",
        url: "<文件URL2>",
        size: 7200,
        width: 1920,
        height: 1080,
        mimeType: "image/png"
      })
    ]
  ]]'
```

**⚠️ 附件格式要点**：
- 每个附件必须使用 `JSON.stringify()` 序列化
- 必填字段：`attachmentId`（新建时为 0）、`name`、`url`
- 可选字段：`size`、`width`、`height`、`mimeType`
- 多个附件使用数组包裹多个 JSON 字符串

### 4. 使用 Token 认证的批量操作

```bash

# 批量查询多个表格
for tableId in 2750248577 2750248578 2750248579; do
  oa-skills citadel-database queryTableData \
    --tableId "$tableId" \
    --raw >> all_data.json
done
```

## getUserInfo - 获取用户信息（账号转换）

### 功能说明

`getUserInfo` 命令用于批量查询用户信息，支持 MIS 到 uid/empId/姓名等字段的转换。这是在操作人员列数据时必不可少的功能。

### 使用场景

- ✅ 查询用户的 empId（用于人员列数据）
- ✅ MIS 账号转换为 uid/empId
- ✅ 批量获取用户信息（姓名、头像等）
- ✅ 验证用户账号是否存在

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--misList` | string[] | 是 | MIS 账号列表（JSON 数组格式） |

### 返回字段

每个用户的信息包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `uid` | string | 大象 UID |
| `mis` | string | MIS 账号 |
| `name` | string | 用户姓名 |
| `empId` | number | 员工 ID（**用于人员列数据**） |
| `avatarUrl` | string | 头像 URL（200x200） |
| `bigAvatarUrl` | string | 大头像 URL |

### 使用示例

#### 1. 查询单个用户信息

```bash
oa-skills citadel-database getUserInfo \
  --misList '["zhangsan"]'
```

输出示例：
```
✅ 查询成功！找到 1 个用户

👤 MIS: zhangsan
   ├─ 姓名: 张三
   ├─ UID: 1027950
   ├─ EmpID: 2015738
   ├─ 头像: <头像URL>
   └─ 大头像: <大头像URL>
```

#### 2. 批量查询多个用户

```bash
oa-skills citadel-database getUserInfo \
  --misList '["zhangsan", "lisi", "wangwu"]'
```

#### 3. 输出原始 JSON（用于脚本处理）

```bash
oa-skills citadel-database getUserInfo \
  --misList '["zhangsan", "lisi"]' \
  --raw
```

输出示例：
```json
{
  "zhangsan": {
    "uid": "1027950",
    "mis": "zhangsan",
    "name": "张三",
    "avatarUrl": "<头像URL>",
    "bigAvatarUrl": "<大头像URL>",
    "empId": 2015738
  },
  "lisi": {
    "uid": "1027951",
    "mis": "lisi",
    "name": "李四",
    "avatarUrl": "<头像URL>",
    "bigAvatarUrl": "<大头像URL>",
    "empId": 2015739
  }
}
```

#### 4. 与人员列配合使用（完整工作流）

```bash
# 步骤 1: 查询 empId
RESULT=$(oa-skills citadel-database getUserInfo \
  --misList '["zhangsan", "lisi"]' \
  --raw)

# 步骤 2: 提取 empId（使用 jq）
EMP_IDS=$(echo "$RESULT" | jq -r '[.[] | .empId]')
# 输出: [2015738, 2015739]

# 步骤 3: 添加人员列数据
oa-skills citadel-database addData \
  --tableId "456789" \
  --columnIds "4" \
  --data "[[$EMP_IDS]]"
```

#### 5. 批量处理（从文件读取 MIS 列表）

```bash
# 从文件读取 MIS 列表（每行一个 MIS）
MIS_LIST=$(cat users.txt | jq -R . | jq -s .)

# 批量查询
oa-skills citadel-database getUserInfo \
  --misList "$MIS_LIST" \
  --raw > user_info.json
```

### 注意事项

1. **不存在的账号**
   - 不存在的 MIS 账号不会出现在返回结果中
   - 命令会在标准输出中提示哪些账号未找到
   - 不会导致命令失败

2. **批量查询建议**
   - 建议单次查询不超过 100 个用户
   - 对于大量用户，可以分批查询

3. **缓存机制**
   - 用户信息相对稳定，建议在应用层缓存查询结果
   - 头像 URL 可能会过期，建议定期更新

4. **人员列数据格式**
   - 人员列使用 **empId**（number 类型）
   - 必须先通过此命令获取 empId，再操作人员列
   - 示例：`[[2015738, 2015739]]` 表示一行包含两个人员

### API 说明

底层调用的是多维表格 v2 API：

```
GET /xtable/data-api/v2/users/getUsersByMis?misList=mis1,mis2
```

返回格式：
```json
{
  "success": true,
  "data": {
    "mis1": { ... },
    "mis2": { ... }
  }
}
```
