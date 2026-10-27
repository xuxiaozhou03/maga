# ETF 数据持久化与任务化采集设计

> 项目：ETF 行情中心
>
> 适用范围：ETF 列表、日 K 线、统计指标与任务触发

## 1. 设计目标

将当前“请求页面时实时抓取上游数据”的方式，调整为：

- 页面和查询 API 只读取本地数据库；
- 数据同步由 HTTP 接口按需触发；
- ETF 列表、K 线、统计指标持久化到 SQLite；
- K 线按 ETF 代码拆分为独立任务；
- 统计指标按 ETF 代码拆分为独立任务；
- 任务完成后统一记录状态、完成时间和失败原因。

目标数据流：

```text
上游数据源
    │
POST /api/tasks
    │
任务执行器
    │
SQLite
    │
GET /api/etfs
GET /api/:code/kline
    │
Vue + KLineCharts
```

核心原则：

- 查询接口不访问上游；
- 每个 ETF 的 K 线和统计任务独立执行；
- ETF 按 `code` UPSERT；
- 前复权 K 线每次全量抓取，并按 `(code, trade_date)` UPSERT；
- 单个任务失败不影响其他任务；
- 任务只在执行结束后写入完成记录。

## 2. 技术选型

| 组件 | 方案 |
| --- | --- |
| Web 框架 | Hono |
| 数据库 | SQLite |
| SQLite 驱动 | `better-sqlite3` |
| ORM / 查询层 | Drizzle ORM |
| 前端 | Vue 3 |
| K 线图 | KLineCharts |

当前约 23 只 ETF、每只约 2,700 条日 K，总量约 6.2 万行，SQLite 足够支撑。

## 3. 数据表设计

### 3.1 ETF 表 `etf`

ETF 列表每次同步后，直接按 `code` UPSERT。

```sql
CREATE TABLE etf (
  code             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  tracking_index   TEXT,
  track_index      TEXT NOT NULL,
  scale            REAL,
  premium_rate     REAL
);

CREATE INDEX idx_etf_scale
  ON etf(scale DESC);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `code` | ETF 代码，例如 `159941.SZ` |
| `name` | ETF 名称 |
| `tracking_index` | 跟踪指数名称 |
| `track_index` | 跟踪指数代码 |
| `scale` | 基金规模 |
| `premium_rate` | 溢价率 |

写入语句：

```sql
INSERT INTO etf (
  code, name, tracking_index, track_index, scale, premium_rate
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  tracking_index = excluded.tracking_index,
  track_index = excluded.track_index,
  scale = excluded.scale,
  premium_rate = excluded.premium_rate;
```

说明：

- 只按 `code` UPSERT；
- 不增加活跃状态、首次出现时间、抓取时间等字段；
- 不保存规模、溢价率的逐日历史；
- 同步失败时不修改已有 ETF 数据。

### 3.2 日 K 线表 `etf_kline`

```sql
CREATE TABLE etf_kline (
  code             TEXT NOT NULL,
  trade_date       TEXT NOT NULL,
  open             REAL NOT NULL,
  high             REAL NOT NULL,
  low              REAL NOT NULL,
  close            REAL NOT NULL,
  volume           REAL NOT NULL,
  amount           REAL NOT NULL,
  change           REAL,
  change_percent   REAL,
  PRIMARY KEY (code, trade_date),
  FOREIGN KEY (code) REFERENCES etf(code)
);

CREATE INDEX idx_etf_kline_code_date
  ON etf_kline(code, trade_date DESC);
```

约束：

- `trade_date` 使用 `YYYY-MM-DD`；
- 唯一键为 `(code, trade_date)`；
- 上游数据为前复权，不在表中重复保存复权类型；
- 查询时按 `trade_date ASC` 返回。

UPSERT：

```sql
INSERT INTO etf_kline (
  code, trade_date, open, high, low, close,
  volume, amount, change, change_percent
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(code, trade_date) DO UPDATE SET
  open = excluded.open,
  high = excluded.high,
  low = excluded.low,
  close = excluded.close,
  volume = excluded.volume,
  amount = excluded.amount,
  change = excluded.change,
  change_percent = excluded.change_percent;
```

### 3.3 每日统计表 `etf_stats_daily`

```sql
CREATE TABLE etf_stats_daily (
  code              TEXT NOT NULL,
  trade_date        TEXT NOT NULL,
  close             REAL NOT NULL,
  ma5               REAL,
  ma20              REAL,
  ma60              REAL,
  return_1d         REAL,
  return_5d         REAL,
  return_20d        REAL,
  return_60d        REAL,
  return_120d       REAL,
  return_250d       REAL,
  volatility_20     REAL,
  max_drawdown_250  REAL,
  high_52w          REAL,
  low_52w           REAL,
  avg_amount_20     REAL,
  volume_ratio_20   REAL,
  PRIMARY KEY (code, trade_date),
  FOREIGN KEY (code) REFERENCES etf(code)
);

CREATE INDEX idx_etf_stats_date_code
  ON etf_stats_daily(trade_date DESC, code);
```

统计按 `(code, trade_date)` UPSERT，基于最新全量前复权 K 线计算，每个交易日保留一只 ETF 的一行。横向比较直接读取同一 `trade_date` 下的多行，不新增汇总表。

### 3.4 任务记录表 `task_run`

任务执行中不写记录，只在任务结束后写入最终结果。

```sql
CREATE TABLE task_run (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key        TEXT NOT NULL,
  status          TEXT NOT NULL,
  completed_at    TEXT NOT NULL,
  error_message   TEXT
);

CREATE INDEX idx_task_run_key_id
  ON task_run(task_key, id DESC);
```

状态：

| 状态 | 说明 |
| --- | --- |
| `success` | 执行成功 |
| `failed` | 执行失败 |

字段：

| 字段 | 说明 |
| --- | --- |
| `task_key` | 任务标识 |
| `status` | `success` 或 `failed` |
| `completed_at` | 任务完成时间 |
| `error_message` | 失败原因，成功时为 `NULL` |

查询任务完成情况时，每个 `task_key` 取最新一条记录。

## 4. 任务设计

任务分为三类：

| task_key | 执行内容 |
| --- | --- |
| `sync-etfs` | 抓取 ETF 列表并按 `code` UPSERT 到 `etf` |
| `{code}-klines` | 抓取指定 ETF 的完整前复权日 K，并 UPSERT 到 `etf_kline` |
| `{code}-stat` | 根据指定 ETF 的最新 K 线计算统计指标，并 UPSERT 到 `etf_stats_daily` |

示例：

```text
sync-etfs
159941.SZ-klines
159941.SZ-stat
513050.SH-klines
513050.SH-stat
```

规则：

- 每只 ETF 分别拥有一个 K 线任务和一个统计任务；
- `{code}-klines` 和 `{code}-stat` 独立触发；
- 任务之间的状态和失败原因互不影响；
- 新 ETF 写入 `etf` 表后，自动拥有对应的 K 线和统计任务标识。

## 5. 任务接口

统一使用：

```text
GET  /api/tasks
POST /api/tasks
```

### 5.1 获取任务完成情况

```http
GET /api/tasks
```

响应示例：

```json
{
  "serverTime": "2026-10-27T20:15:00+08:00",
  "tasks": [
    {
      "taskKey": "sync-etfs",
      "status": "success",
      "completedAt": "2026-10-27T18:32:10+08:00",
      "errorMessage": null
    },
    {
      "taskKey": "159941.SZ-klines",
      "status": "failed",
      "completedAt": "2026-10-27T19:15:42+08:00",
      "errorMessage": "上游接口返回 HTTP 500"
    },
    {
      "taskKey": "159941.SZ-stat",
      "status": null,
      "completedAt": null,
      "errorMessage": null
    },
    {
      "taskKey": "513050.SH-klines",
      "status": "success",
      "completedAt": "2026-10-27T19:16:08+08:00",
      "errorMessage": null
    },
    {
      "taskKey": "513050.SH-stat",
      "status": "success",
      "completedAt": "2026-10-27T19:16:12+08:00",
      "errorMessage": null
    }
  ]
}
```

返回范围：

- `sync-etfs`；
- `etf` 表中每只 ETF 对应的 `{code}-klines`；
- `etf` 表中每只 ETF 对应的 `{code}-stat`。

从未执行过的任务返回 `status: null`、`completedAt: null`。

### 5.2 触发单个任务

```http
POST /api/tasks
Content-Type: application/json
```

触发 ETF 列表同步：

```json
{
  "task": "sync-etfs"
}
```

触发指定 ETF 的 K 线同步：

```json
{
  "task": "159941.SZ-klines"
}
```

触发指定 ETF 的统计计算：

```json
{
  "task": "159941.SZ-stat"
}
```

接收成功：

```http
HTTP/1.1 202 Accepted
```

```json
{
  "taskKey": "159941.SZ-klines",
  "accepted": true
}
```

状态码：

| 状态码 | 场景 |
| --- | --- |
| `202` | 任务已接收 |
| `400` | 任务标识格式不正确 |
| `401` | 未提供管理鉴权 |
| `404` | 任务对应的 ETF 不存在 |
| `409` | 同一任务正在执行 |

## 6. ETF 列表同步

任务标识：`sync-etfs`

流程：

1. 调用上游 ETF 列表接口；
2. 校验返回结构；
3. 开启事务；
4. 按 `code` UPSERT `etf`；
5. 提交事务；
6. 写入 `task_run`。

任务结束后写入：

```text
task_key: sync-etfs
status: success | failed
completed_at: 2026-10-27T18:32:10+08:00
error_message: 失败时填写原因
```

同步失败时保留数据库中已有 ETF 数据。

## 7. K 线同步

任务标识：`{code}-klines`

由于上游返回前复权数据，历史价格可能因复权因子变化而被重写，因此每次同步都抓取该 ETF 的完整历史 K 线。

流程：

1. 校验 ETF 代码存在；
2. 分页获取该 ETF 的完整 K 线；
3. 校验所有返回数据；
4. 开启事务；
5. 按 `(code, trade_date)` UPSERT 每一行；
6. 提交事务；
7. 写入 `task_run`。

规则：

- 不使用只抓最近 N 天的增量策略；
- 不使用只追加写入；
- 同一 `(code, trade_date)` 已存在时更新全部行情字段；
- 失败时不删除该 ETF 的已有 K 线。

失败记录示例：

```text
task_key: 159941.SZ-klines
status: failed
completed_at: 2026-10-27T19:15:42+08:00
error_message: 上游接口返回 HTTP 500
```

### 并发与限流

单个任务只处理一只 ETF。调用方可以并行触发多个 ETF 任务，建议：

```text
并发数：2 ~ 3
请求间隔：200 ~ 500ms 随机抖动
单次请求超时：10 ~ 15s
最大重试次数：3
重试退避：1s、2s、4s
```

只对网络错误、超时、`429` 和 `5xx` 重试。数据格式错误或 `404` 直接记录失败原因。

## 8. 统计计算

任务标识：`{code}-stat`

统计任务只处理一只 ETF，在对应 K 线任务完成后单独触发。每个交易日统计结果保存为一只 ETF 一行，便于直接进行横向比较。

流程：

1. 校验 ETF 代码存在；
2. 读取该 ETF 的完整 K 线历史（至少覆盖 250 个交易日）；
3. 计算统计指标；
4. 按 `(code, trade_date)` UPSERT `etf_stats_daily`；
5. 写入 `task_run`。

指标定义：

| 字段 | 定义 |
| --- | --- |
| `return_1d` | 最新收盘价 / 前一交易日收盘价 - 1 |
| `return_5d` | 最新收盘价 / 5 个交易日前收盘价 - 1 |
| `return_20d` | 最新收盘价 / 20 个交易日前收盘价 - 1 |
| `return_60d` | 最新收盘价 / 60 个交易日前收盘价 - 1 |
| `return_120d` | 最新收盘价 / 120 个交易日前收盘价 - 1 |
| `return_250d` | 最新收盘价 / 250 个交易日前收盘价 - 1 |
| `ma5` | 最近 5 个交易日收盘价均值 |
| `ma20` | 最近 20 个交易日收盘价均值 |
| `ma60` | 最近 60 个交易日收盘价均值 |
| `volatility_20` | 最近 20 个日收益率标准差 × √252 |
| `max_drawdown_250` | 最近 250 个交易日最大回撤 |
| `high_52w` | 最近 250 个交易日最高价 |
| `low_52w` | 最近 250 个交易日最低价 |
| `avg_amount_20` | 最近 20 个交易日成交额均值 |
| `volume_ratio_20` | 最新成交量 / 最近 20 个交易日平均成交量 |

横向比较直接查询同一 `trade_date` 的 `etf_stats_daily`：

```sql
SELECT
  code,
  return_20d,
  volatility_20,
  max_drawdown_250,
  RANK() OVER (ORDER BY return_20d DESC) AS return_20d_rank
FROM etf_stats_daily
WHERE trade_date = ?
  AND return_20d IS NOT NULL
ORDER BY return_20d DESC;
```

历史数据不足时写入 `NULL`，不要使用 0 代替。

## 9. 查询 API

### 9.1 ETF 列表与横向比较

```http
GET /api/etfs
```

从 `etf` 表读取 ETF，并关联统计。默认使用全部 ETF 都有的最新共同交易日，避免把不同日期的数据混在一起比较。按统计指标比较时，同名次使用 `RANK()` 规则：

```http
GET /api/etfs?date=2026-10-27&sort=return20d&order=desc
```

```json
[
  {
    "code": "159941.SZ",
    "name": "纳指ETF广发",
    "trackingIndex": "纳斯达克100",
    "trackIndex": "NDX.GI",
    "scale": 123.45,
    "premiumRate": 0.12,
    "tradeDate": "2026-10-27",
    "return20d": 0.052,
    "return20dRank": 3,
    "volatility20": 0.21,
    "maxDrawdown250": -0.183,
    "volumeRatio20": 1.42
  }
]
```

横向比较参数：

| 参数 | 说明 |
| --- | --- |
| `date` | 指定统一的 `YYYY-MM-DD`；不传时取最新共同交易日 |
| `sort` | 排序字段，例如 `return20d`、`volatility20`、`maxDrawdown250`、`volumeRatio20` |
| `order` | `asc` 或 `desc`，默认 `desc` |

示例：

```http
GET /api/etfs?date=2026-10-27&sort=return20d&order=desc
```

响应中 `return20dRank` 为同一 `trade_date` 下按当前 `sort` 和 `order` 计算的名次。相同值名次相同，后续名次按 `RANK()` 规则跳跃。未指定 `sort` 时不返回排名；某只 ETF 当日缺少该指标时，该指标和排名均为 `null`，不参与排名。`sort` 仅允许使用预定义字段白名单，不能直接拼接 SQL。

### 9.2 ETF K 线

```http
GET /api/:code/kline
```

从 `etf_kline` 表读取数据，按日期升序返回。

支持可选日期范围：

```http
GET /api/:code/kline?from=2026-01-01&to=2026-10-27
```

参数规则：

- `code` 必须存在；
- 日期格式为 `YYYY-MM-DD`；
- `from <= to`；
- 未传参数时返回全部 K 线。

## 10. 任务执行器

建议目录结构：

```text
src/
  tasks/
    runner.ts
    lock.ts
    handlers/
      syncEtfs.ts
      syncKlines.ts
      calculateStats.ts
  repositories/
    etfRepository.ts
    klineRepository.ts
    statsRepository.ts
    taskRepository.ts
  db/
    client.ts
    schema.ts
    migrations/
```

执行器职责：

1. 解析并校验 `task_key`；
2. 校验对应 ETF 是否存在；
3. 获取进程内任务锁；
4. 执行任务；
5. 写入一条 `success` 或 `failed` 记录；
6. 记录完成时间和失败原因；
7. 释放任务锁。

### 防止重复执行

- 同一个 `task_key` 同时只允许一个实例执行；
- 重复触发返回 `409 Conflict`；
- 锁只在进程内维护，不写入数据库；
- 服务重启后锁自动释放。

### 失败隔离

- `sync-etfs` 失败时不修改已有 ETF 数据；
- `{code}-klines` 失败时不删除该 ETF 已有 K 线；
- `{code}-stat` 失败时不影响 K 线数据和 ETF 数据；
- 每个任务独立记录失败原因。

## 11. 数据校验

入库前至少检查：

- 响应结构是否符合预期；
- 返回代码是否与请求代码一致；
- 日期是否为合法 `YYYY-MM-DD`；
- 日期是否重复；
- `low <= open <= high`；
- `low <= close <= high`；
- 价格是否为正数；
- 成交量、成交额是否非负；
- 是否存在 `NaN`、`Infinity`；
- 涨跌幅是否处于合理范围。

无效记录不能覆盖数据库中的有效数据。

## 12. 安全与 SQLite 配置

### 触发接口鉴权

`POST /api/tasks` 会触发上游抓取和数据库写入，需要保护：

- 仅允许内网访问；或
- 使用 `Authorization: Bearer <ADMIN_TOKEN>`；
- 不从前端公开页面直接触发；
- 增加基础频率限制。

`GET /api/tasks` 为只读接口，公网部署时也建议限制访问。

### SQLite 配置

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

数据库文件：

```text
data/market.db
```

将 `data/` 加入 `.gitignore`。

## 13. 落地步骤

### 第一阶段：持久化与查询

1. 引入 SQLite 和迁移；
2. 创建 `etf`、`etf_kline`；
3. 将 `/api/etfs` 和 `/api/:code/kline` 改为查询数据库；
4. 实现 `sync-etfs` 和 `{code}-klines`。

### 第二阶段：任务接口

1. 创建 `task_run`；
2. 实现 `GET /api/tasks`；
3. 实现 `POST /api/tasks`；
4. 增加任务锁、失败隔离和错误记录。

### 第三阶段：统计与页面

1. 创建 `etf_stats_daily`；
2. 实现 `{code}-stat`；
3. 将统计结果合并到 ETF 列表或 K 线响应；
4. 支持按统一 `trade_date` 对统计指标排序和排名；
5. 增加任务状态查看页面和失败告警。

## 14. 验收标准

- [ ] `/api/etfs` 和 `/api/:code/kline` 只读取数据库；
- [ ] `GET /api/tasks` 返回全部任务完成情况；
- [ ] `POST /api/tasks` 可单独触发 `sync-etfs`、`{code}-klines`、`{code}-stat`；
- [ ] 同一任务不能并发重复执行；
- [ ] 任务记录包含 `task_key`、状态、完成时间和失败原因；
- [ ] 任务记录只在执行结束后写入；
- [ ] 任务状态只有 `success` 和 `failed`；
- [ ] ETF 列表按 `code` UPSERT 到 `etf`；
- [ ] `etf` 表只保存代码、名称、指数、规模和溢价率；
- [ ] 前复权 K 线每次全量抓取；
- [ ] K 线严格按 `(code, trade_date)` UPSERT；
- [ ] 重复执行不会产生重复 K 线；
- [ ] 单个 ETF 任务失败不影响其他 ETF；
- [ ] 统计可以基于最新前复权 K 线重算；
- [ ] `/api/etfs` 可以按统一 `trade_date` 横向比较并返回排名；
- [ ] `yarn build` 通过。

## 15. 结论

采用：

```text
HTTP 接口触发任务
+ SQLite 持久化
+ ETF 按 code UPSERT
+ 前复权 K 线全量抓取并按 code + trade_date UPSERT
+ 每只 ETF 独立的 {code}-klines 和 {code}-stat 任务
+ 统一 /api/tasks 查询与触发接口
+ /api/etfs 按统一 trade_date 横向比较与排名
```
