# 数据格式参考

多维表格数据格式说明，包含列类型、单元格数据结构和转换规则。

## 目录

- [列类型 (ColumnType)](#列类型-columntype)
- [富文本格式 (TextCellValue)](#富文本格式-textcellvalue)
  - [节点类型](#节点类型)
  - [自动转换规则](#自动转换规则)
- [二维数组格式](#二维数组格式)
  - [基本结构](#基本结构)
  - [列对应关系](#列对应关系)
  - [类型示例](#类型示例)
- [查询响应格式](#查询响应格式)
- [筛选条件格式 (FilterConfig)](#筛选条件格式-filterconfig)
- [排序配置格式 (SortConfig)](#排序配置格式-sortconfig)
- [常见错误和解决方案](#常见错误和解决方案)
- [数据转换工具函数](#数据转换工具函数)
- [批量操作模式](#批量操作模式)
- [API 响应示例](#api-响应示例)

## 列类型 (ColumnType)

| 类型ID | 类型名称 | TypeScript 类型 | API 字段名 | 输入格式 | 说明 |
|---|---|---|---|---|---|
| 1 | 文本（富文本） | `IRichTextNode[]` | `textCellValue` | 字符串或节点数组 | 支持纯文本、超链接、@提及 |
| 2 | 数字 | `number` | `numberCellValue` | `number` | 数值类型 |
| 3 | 单选 | `string` | `selectCellValue` | `string` | 单选选项的值 |
| 4 | 人员 | `number[]` | `peopleCellValue` | `number[]` 或 `string[]` | empId 数组 |
| 5 | 多选 | `string[]` | `multipleSelectCellValue` | `string[]` | 多选选项的值数组 |
| 6 | 附件 | `string[]` | `fileCellValue` | `string[]` (JSON 字符串) | 附件 JSON 字符串数组 |
| 7 | 日期 | `number` | `dateCellValue` | `number` | 毫秒时间戳 |
| 8 | 货币 | `number` | `numberCellValue` | `number` | 数值类型 |
| 9 | 公式 | 只读 | - | - | 不支持写入 |

## 富文本格式 (TextCellValue)

文本列（columnType: 1）支持富文本节点数组 `IRichTextNode[]`。

### 节点类型

#### 1. 纯文本节点

```typescript
{
  type: "text",
  value: "纯文本内容"
}
```

**示例**：
```json
[
  { "type": "text", "value": "Hello World" }
]
```

#### 2. 超链接节点

```typescript
{
  type: "link",
  value: "显示文字",
  link: "<链接URL>"
}
```

**示例**：
```json
[
  { "type": "text", "value": "访问 " },
  { "type": "link", "value": "美团官网", "link": "https://meituan.com" }
]
```

#### 3. @提及节点

```typescript
{
  type: "mention",
  value: "用户名",
  empId: 2015739  // 必须是 number 类型
}
```

**示例**：
```json
[
  { "type": "text", "value": "负责人：" },
  { "type": "mention", "value": "张三", "empId": 2015739 }
]
```

#### 4. 混合格式

```json
[
  { "type": "text", "value": "请 " },
  { "type": "mention", "value": "张三", "empId": 2015739 },
  { "type": "text", "value": " 查看 " },
  { "type": "link", "value": "项目文档", "link": "https://km.sankuai.com/page/123" },
  { "type": "text", "value": " 并在本周五前完成" }
]
```

### 自动转换规则

CLI 会自动将简单字符串转换为富文本格式：

```bash
# 输入：简单字符串
--data '[["任务A"]]'

# 自动转换为：
[{"type": "text", "value": "任务A"}]
```

如需使用超链接或 @提及，必须手动构造富文本节点数组。

## 二维数组格式

### 基本结构

所有数据操作（addData、updateData）都使用**二维数组**格式：

```typescript
[
  ["行1列1", "行1列2", "行1列3"],  // 第1行
  ["行2列1", "行2列2", "行2列3"]   // 第2行
]
```

### 列对应关系

数据列的顺序必须与 `--columnIds` 参数指定的列 ID 顺序一致：

```bash
--columnIds "1,2,3"
--data '[["值1", "值2", "值3"]]'
       # ↑对应列1  ↑对应列2  ↑对应列3
```

### 类型示例

#### 1. 文本列 (columnType: 1)

```json
// 简单文本
[["简单文本"]]

// 富文本（超链接）
[[[
  {"type":"text","value":"查看"},
  {"type":"link","value":"文档","link":"https://km.sankuai.com/page/123"}
]]]

// 富文本（@提及）
[[[
  {"type":"text","value":"负责人："},
  {"type":"mention","value":"张三","empId":2015739}
]]]
```

#### 2. 数字列 (columnType: 2)

```json
[[100]]           // 整数
[[3.14]]          // 浮点数
[[0]]             // 零
[[-50]]           // 负数
```

#### 3. 单选列 (columnType: 3)

```json
[["待处理"]]      // 必须是已定义的选项值
[["进行中"]]
[["已完成"]]
```

**注意**：值必须精确匹配 `selectOptions` 中定义的选项。

#### 4. 人员列 (columnType: 4)

```json
[[2015739]]                 // 单人（数字）
[["2015739"]]               // 单人（字符串）
[[2015739, 2015740]]        // 多人（数字数组）
[["2015739", "2015740"]]    // 多人（字符串数组）
```

#### 5. 多选列 (columnType: 5)

```json
[["选项1"]]                  // 单选
[["选项1", "选项2"]]         // 多选
[[[]]]                       // 空值
```

#### 6. 附件列 (columnType: 6)

附件列使用 **JSON 字符串数组**格式，每个附件必须序列化为 JSON 字符串。

**附件对象结构**：
```typescript
interface FileAttachment {
  attachmentId: number;  // 必填：附件 ID（新建时设为 0）
  name: string;          // 必填：文件名
  url: string;           // 必填：文件 URL
  size?: number;         // 可选：文件大小（字节）
  width?: number;        // 可选：图片宽度
  height?: number;       // 可选：图片高度
  mimeType?: string;     // 可选：MIME 类型
}
```

**示例**：

```json
// 单个附件
[[
  JSON.stringify({
    attachmentId: 0,
    name: "logo.png",
    url: "<文件URL>",
    size: 6105,
    width: 300,
    height: 300,
    mimeType: "image/png"
  })
]]

// 多个附件
[[
  [
    JSON.stringify({
      attachmentId: 0,
      name: "file1.png",
      url: "<文件URL1>",
      size: 6105,
      mimeType: "image/png"
    }),
    JSON.stringify({
      attachmentId: 0,
      name: "file2.jpg",
      url: "<文件URL2>",
      size: 7475,
      mimeType: "image/jpeg"
    })
  ]
]]

// 最简格式（仅必填字段）
[[
  JSON.stringify({
    attachmentId: 0,
    name: "document.pdf",
    url: "<文件URL>"
  })
]]
```

**⚠️ 重要提示**：
- 必须使用 `JSON.stringify()` 将附件对象序列化为字符串
- `attachmentId`、`name`、`url` 三个字段必填
- 新建附件时 `attachmentId` 设为 0
- 其他字段可选，但建议提供以获得更好的展示效果

**CLI 示例**：
```bash
# 添加单个附件
oa-skills citadel-database addData \
  --tableId "456789" \
  --columnIds "1,2" \
  --data '[[
    "任务A",
    JSON.stringify({
      attachmentId: 0,
      name: "logo.png",
      url: "<文件URL>",
      mimeType: "image/png"
    })
  ]]'

# 添加多个附件
oa-skills citadel-database addData \
  --tableId "456789" \
  --columnIds "3" \
  --data '[[
    [
      JSON.stringify({attachmentId: 0, name: "file1.png", url: "<文件URL1>"}),
      JSON.stringify({attachmentId: 0, name: "file2.jpg", url: "<文件URL2>"})
    ]
  ]]'
```

#### 7. 日期列 (columnType: 7)

```json
[[1710000000000]]   // 毫秒时间戳
[[0]]               // 空日期
```

**转换示例**：
```javascript
// JavaScript Date 转时间戳
const timestamp = new Date("2024-03-10").getTime();  // 1710000000000
```

#### 8. 货币列 (columnType: 8)

```json
[[100.50]]          // 金额（数值）
[[0]]               // 零
[[-50.25]]          // 负数（退款等场景）
```

## 查询响应格式

### QueryTableDataResponse

```typescript
{
  rows: [
    {
      rowId: 184484716,              // 行 ID
      cellData: [                     // 单元格数据数组
        {
          colId: 1,                   // 列 ID
          textCellValue: [            // 文本列数据
            { type: "text", value: "任务A" }
          ]
        },
        {
          colId: 2,
          numberCellValue: 100        // 数字列数据
        },
        {
          colId: 3,
          selectCellValue: "进行中"   // 单选列数据
        }
      ],
      createdBy: 2015738,             // 创建人 empId
      createdTime: 1773884148000,     // 创建时间（毫秒）
      lastModifiedBy: 2015738,        // 最后修改人 empId
      lastModifiedTime: 1773884148000 // 最后修改时间（毫秒）
    }
  ],
  total: 1                            // 总行数
}
```

### TableMetaResponse

```typescript
{
  columns: [
    {
      colId: 1,                       // 列 ID
      columnName: "任务名称",         // 列名
      columnType: 1,                  // 列类型
      selectOptions?: string[]        // 单选/多选的选项列表（可选）
    }
  ]
}
```

## 筛选条件格式 (FilterConfig)

```typescript
{
  conjunction: "and" | "or",          // 条件连接方式
  conditions: [
    {
      columnId: 1,                    // 列 ID
      operator: "==",                 // 操作符
      filterValue: ["值"]             // 筛选值（数组）
    }
  ]
}
```

### 支持的操作符

| 操作符 | 说明 | 适用列类型 |
|---|---|---|
| `==` | 等于 | 所有类型 |
| `!=` | 不等于 | 所有类型 |
| `>` | 大于 | 数字、日期、货币 |
| `>=` | 大于等于 | 数字、日期、货币 |
| `<` | 小于 | 数字、日期、货币 |
| `<=` | 小于等于 | 数字、日期、货币 |
| `contains` | 包含 | 文本、多选 |
| `not_contains` | 不包含 | 文本、多选 |
| `is_empty` | 为空 | 所有类型 |
| `is_not_empty` | 不为空 | 所有类型 |

### 筛选示例

```bash
# 1. 单条件筛选（状态等于"进行中"）
--filter '{"conjunction":"and","conditions":[{"columnId":3,"operator":"==","filterValue":["进行中"]}]}'

# 2. 多条件筛选（AND）
--filter '{"conjunction":"and","conditions":[
  {"columnId":3,"operator":"==","filterValue":["进行中"]},
  {"columnId":4,"operator":">","filterValue":[50]}
]}'

# 3. 多条件筛选（OR）
--filter '{"conjunction":"or","conditions":[
  {"columnId":3,"operator":"==","filterValue":["待处理"]},
  {"columnId":3,"operator":"==","filterValue":["进行中"]}
]}'

# 4. 文本包含筛选
--filter '{"conjunction":"and","conditions":[{"columnId":1,"operator":"contains","filterValue":["项目"]}]}'

# 5. 日期范围筛选
--filter '{"conjunction":"and","conditions":[
  {"columnId":7,"operator":">=","filterValue":[1710000000000]},
  {"columnId":7,"operator":"<=","filterValue":[1712592000000]}
]}'
```

## 排序配置格式 (SortConfig)

```typescript
[
  {
    columnId: 2,          // 列 ID
    desc: true            // true=降序, false=升序
  }
]
```

### 排序示例

```bash
# 1. 单列排序（按进度降序）
--sort '[{"columnId":4,"desc":true}]'

# 2. 多列排序（先按状态升序，再按进度降序）
--sort '[{"columnId":3,"desc":false},{"columnId":4,"desc":true}]'
```

## 常见错误和解决方案

### 1. 列类型不匹配

**错误**：将字符串传给数字列
```json
// ❌ 错误
[["100"]]  // 数字列接收字符串

// ✅ 正确
[[100]]    // 数字列接收数字
```

### 2. empId 类型错误

**错误**：empId 使用字符串类型
```json
// ❌ 错误（在富文本中）
{"type":"mention","value":"张三","empId":"2015739"}

// ✅ 正确
{"type":"mention","value":"张三","empId":2015739}
```

### 3. 富文本嵌套层级

**错误**：富文本数据嵌套层级错误
```json
// ❌ 错误（缺少外层数组）
{"type":"text","value":"文本"}

// ✅ 正确
[{"type":"text","value":"文本"}]
```

### 4. 二维数组结构

**错误**：一维数组而非二维数组
```json
// ❌ 错误
["值1", "值2"]

// ✅ 正确（单行数据也要用二维数组）
[["值1", "值2"]]
```

### 5. 日期格式

**错误**：使用日期字符串而非时间戳
```json
// ❌ 错误
[["2024-03-10"]]

// ✅ 正确
[[1710000000000]]
```

## 数据转换工具函数

### JavaScript/TypeScript

```typescript
// 日期转时间戳
function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

// 字符串转富文本
function textToRichText(text: string): IRichTextNode[] {
  return [{ type: "text", value: text }];
}

// 创建超链接富文本
function createLink(text: string, url: string): IRichTextNode[] {
  return [
    { type: "text", value: "查看" },
    { type: "link", value: text, link: url }
  ];
}

// empId 数组转换
function parseEmpIds(input: string | number | (string | number)[]): number[] {
  if (Array.isArray(input)) {
    return input.map(id => typeof id === 'string' ? parseInt(id) : id);
  }
  return [typeof input === 'string' ? parseInt(input) : input];
}
```

### Bash

```bash
# 获取当前时间戳（毫秒）
timestamp=$(date +%s)000

# 格式化 JSON 数据
data=$(cat <<EOF
[
  ["项目A", "张三", "进行中", 75],
  ["项目B", "李四", "待处理", 0]
]
EOF
)

# 转义 JSON 用于命令行
escaped_data=$(echo "$data" | jq -c .)
```

## 批量操作模式

### 批量新增

```bash
# 准备数据文件 data.json
cat > data.json <<EOF
[
  ["项目A", "张三", "进行中", 75, 1710000000000],
  ["项目B", "李四", "待处理", 0, 1710086400000],
  ["项目C", "王五", "已完成", 100, 1709827200000]
]
EOF

# 批量新增
oa-skills citadel-database addData \
  --tableId "2750248577" \
  --columnIds "1,2,3,4,5" \
  --data "$(cat data.json)"
```

### 批量更新

```bash
# 1. 查询需要更新的行
oa-skills citadel-database queryTableData \
  --tableId "2750248577" \
  --filter '{"conjunction":"and","conditions":[{"columnId":3,"operator":"==","filterValue":["待处理"]}]}' \
  --raw > rows_to_update.json

# 2. 提取 rowIds（使用 jq）
rowIds=$(jq -r '.rows[].rowId' rows_to_update.json | tr '\n' ',' | sed 's/,$//')

# 3. 批量更新状态
oa-skills citadel-database updateData \
  --tableId "2750248577" \
  --rowIds "$rowIds" \
  --columnIds "3" \
  --data '[["进行中"]]'  # 所有行都更新为"进行中"
```

## API 响应示例

### 成功响应

```json
{
  "success": true,
  "stepVersion": 5
}
```

### 错误响应

```json
{
  "code": 400,
  "message": "列ID 999 不存在于表格元数据中。可用的列ID: 1, 2, 3, 4, 5"
}
```

### 数据查询响应（完整示例）

```json
{
  "rows": [
    {
      "rowId": 184484716,
      "cellData": [
        {
          "colId": 1,
          "textCellValue": [
            { "type": "text", "value": "查看" },
            { "type": "link", "value": "项目文档", "link": "https://km.sankuai.com/page/123" }
          ]
        },
        {
          "colId": 2,
          "textCellValue": [
            { "type": "mention", "value": "张三", "empId": 2015739 }
          ]
        },
        {
          "colId": 3,
          "selectCellValue": "进行中"
        },
        {
          "colId": 4,
          "numberCellValue": 75
        },
        {
          "colId": 5,
          "dateCellValue": 1710000000000
        }
      ],
      "createdBy": 2015738,
      "createdTime": 1773884148000,
      "lastModifiedBy": 2015738,
      "lastModifiedTime": 1773884148000
    }
  ],
  "total": 1,
  "pageToken": "next_page_token_here"
}
```
