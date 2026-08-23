# M3 · 健康数据查询与家庭共享（技术方案）

> 模块：M3 ｜ 状态：规划中 ｜ 优先级：P2

## 1. 技术设计概览

```
模型 ──query_baby_data(query)──▶ 宿主（ctx.babyId 注入，模型不可见）
                                   └─▶ mysql2 只读连接池 ──▶ CynosDB（SELECT only）
回答 + data 来源说明条
```

**关键约束**：
- 直连 CynosDB 只读账号（GRANT SELECT），工具执行 <1s（避免 HTTP 依赖与冷启动）；
- babyId 由服务端从 `x-agent-ctx` 注入，模型无从越权；
- 全部 prepared statement，拒绝写入。

## 2. 只读连接池（lib/db.js）

```js
// lib/db.js — 单例，进程启动预热
import mysql from 'mysql2/promise'
let pool
export function getDb() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASS,
      database: process.env.DB_NAME, connectionLimit: 5,
      waitForConnections: true, enableKeepAlive: true,
    })
    pool.query('SELECT 1')            // 启动预热，避免冷启动首查慢
  }
  return pool
}
```

- 账号权限：仅 SELECT（控制台/MCP 创建，用户侧前置待办）。

## 3. query_baby_data 工具

```ts
// lib/tools/query-baby-data.js
import { z } from 'zod'
export const QUERY_BABY_DATA_TOOL = {
  name: 'query_baby_data',
  description: '查询宝宝健康记录（喂养/睡眠/尿布/生长/健康/症状/活动），按时间窗聚合。回答自家宝宝数据问题时必须调用，结果带统计口径。',
  parameters: z.object({
    metric: z.enum(['feeding','sleep','diaper','growth','health','symptom','activity']),
    days: z.number().int().min(1).max(90).optional().default(7),
    aggregate: z.enum(['list','sum','avg','count','trend']).optional().default('list'),
  }),
  execute: async ({ metric, days, aggregate }, ctx) => {
    const babyId = ctx.babyId            // 服务端注入，模型不可见、不可改
    const rows = await queryMetric(babyId, metric, days, aggregate)
    return JSON.stringify({ ok: true, metric, days, rows, summary: summarize(rows),
      note: `数据来自 ${timeRange(days)} 的 ${metric} 记录` })
  },
}
```

### 3.1 metric → 表映射

| metric | 表 | 关键列 |
|---|---|---|
| feeding | feeding_record | feed_type(breast/formula), formula_ml, duration_min, record_time |
| sleep | sleep_record | sleep_type, start_time, end_time, duration_min |
| diaper | diaper_record | diaper_type, record_time |
| growth | growth_record | height_cm, weight_kg, record_time |
| health | health_record | temperature, allergy_symptoms, record_time |
| symptom | symptom_record | symptom_type, severity, record_time |
| activity | activity_record | activity_type, duration_min, record_time |

### 3.2 聚合 SQL（示例：喂养 trend）

```sql
SELECT DATE(record_time) d,
       SUM(CASE WHEN feed_type='formula' THEN formula_ml ELSE 0 END) total_ml,
       SUM(CASE WHEN feed_type='breast'  THEN duration_min ELSE 0 END) total_breast_min,
       COUNT(*) cnt
FROM feeding_record
WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
GROUP BY DATE(record_time) ORDER BY d;
```

- list：按时间倒序取最近 N 条；sum/avg/count：窗口内聚合；trend：按天分组（上例）；
- 时间窗自然语言解析（模型侧）："上周/最近一周"→7，"这个月"→30，服务端 days 参数 clamp 1-90；
- 疑似误录（单日数值与前后差异大）→ trend 结果中标注 `suspect: true`，供模型提示"请确认是否误录"。

## 4. 数据隔离（三层）

1. **会话层**：userId 维度（FlexDB session key）；
2. **归属层**：minicare-server 代理校验 familyId/babyId 归属（M8）；
3. **工具层**：babyId 从 ctx 注入（本模块），模型无法传参越权；
- 越权兜底：即使 ctx 被篡改，babyId 归属校验在 NestJS 已拦（审计日志）。

## 5. 家庭共享

- 同家庭多成员：代理层校验"成员 ∈ 该家庭"通过即可查询同一 babyId（无需额外逻辑）；
- 跨家庭：代理层 403；agent 侧不做二次校验（信任注入）。

## 6. 测试与验证

- 聚合正确性：造 7 天喂养数据 → 工具返回日均/总量与手工核算一致；
- 越权：构造其他家庭 babyId 请求 → 代理 403（agent 侧无此路径）；
- 空数据：无记录 → `{ ok:true, rows:[], summary:{} }` → 模型输出"暂无记录"；
- 冷启动：容器重启后首查 <1s（预热连接池）。
