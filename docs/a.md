# 量化回测系统 - ETF 统计指标计算模块设计（对齐当前仓库）

> 本文描述的是当前 `maga` 仓库中的落地方式，而不是脱离现状的通用实现方案。
>
> 截至本次修订，爬虫、ETF 同步、日 K 同步和 `Task` 运行框架已有基础实现；
> `packages/crawler/src/calc.ts` 仍是计算入口占位实现，统计指标模块尚未完成。

## 1. 当前仓库现状

### 1.1 工程结构

项目是 pnpm workspace，不是单包项目：

```text
maga/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── db/
│   │   ├── src/index.ts
│   │   ├── src/prisma/schema.prisma
│   │   └── src/prisma/dev.db
│   └── crawler/
│       ├── src/main.ts
│       ├── src/runCrawler.ts
│       ├── src/utils.ts
│       ├── src/etfs.ts
│       ├── src/kline.ts
│       └── src/calc.ts
└── docs/
```

因此，本文中的统计代码应放在 `packages/crawler/src/stats/`，不要放在仓库根目录 `src/stats/`。

### 1.2 当前数据流

```text
packages/crawler/src/main.ts
  -> runCrawler()
     -> etfTask
     -> getKlineTask(code)
     -> getCalcTask(code)
```

`runCrawler` 当前只取规模最大的 1 只 ETF 进行同步和计算，这是开发阶段的临时限制：

```ts
const etfs = await prisma.etf.findMany({
  take: 1,
  orderBy: { scale: "desc" },
});
```

完成计算模块后，再决定是否改为批量处理全部 ETF。统计模块本身不要依赖这个 `take: 1`。

### 1.3 当前计算入口

`packages/crawler/src/calc.ts` 目前的实际形态是：

```ts
export const getCalcTask = (code: string): Task<Kline[]> => {
  return {
    name: `${code}_calc`,
    fetch: async () => {
      const klines = await prisma.kline.findMany({
        where: { code },
        orderBy: { date: "desc" },
      });
      return klines;
    },
    async save(klines) {
      // 阶段涨幅
      // 涨跌分布
      console.log(klines);
    },
  };
};
```

统计模块接入时应保留 `Task<Kline[]>` 这一层，由 `getCalcTask` 负责取数和编排，统计函数负责纯计算。

### 1.4 当前任务框架

`packages/crawler/src/utils.ts` 定义了：

```ts
export interface Task<T = any> {
  name: string;
  fetch: () => Promise<T>;
  save: (data: T) => Promise<void>;
}
```

`runTask` 会在执行前检查 `Task` 表，在 `save` 成功后把任务标记为 `success`，失败时标记为 `failed`。当前 `needRun()` 中有临时 `return true`，所以暂时不会跳过当天已成功的任务；这是现有行为，统计模块不需要自行实现任务状态。

### 1.5 当前依赖与测试方式

- 运行时：Node.js + TypeScript。
- 包管理：pnpm workspace。
- 数据库：Prisma + SQLite。
- 日期库：`dayjs` 已在 crawler 包中可用。
- 测试：使用 Node.js 原生 `node:test` 和 `node:assert/strict`。
- 当前 crawler 没有安装 `decimal.js`、`ml-matrix`、jest 或 vitest。

除非明确有必要的精度需求，否则不要假设这些库存在。若后续要引入 `decimal.js`，应同时修改 `packages/crawler/package.json` 和锁文件；核心指标的第一版可先使用原生 `number` 数组并保证公式正确。

## 2. 现有 Prisma 模型

权威定义位于 `packages/db/src/prisma/schema.prisma`。相关模型如下：

```prisma
model Etf {
  code          String @id
  name          String
  trackingIndex String
  trackIndex    String
  scale         Float
  premiumRate   Float?
  @@map("etf")
}

model Kline {
  code          String
  date          Int          // YYYYMMDD
  open          Float
  high          Float
  low           Float
  close         Float
  volume        Float
  amount        Float
  change        Float
  changePercent Float

  @@id([code, date])
  @@unique([code, date])
  @@index([code, date])
  @@map("kline")
}

model Task {
  name      String   @id
  status    String   // success/failed
  message   String?
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("task")
}
```

`packages/db/src/index.ts` 已导出：

```ts
export type Kline = Prisma.KlineCreateInput;
export type Etf = Prisma.EtfCreateInput;
```

统计模块统一从 `@maga/db` 导入 `Kline`，不要重新定义一套结构相同的本地类型。

**约束**：本次统计模块不新增或修改 Prisma 表结构。计算任务的状态继续复用现有 `Task` 表，计算结果暂时通过日志、内存返回值或后续的独立 API/文件输出承接。

## 3. 模块边界与目录

建议在现有 crawler 包中增加：

```text
packages/crawler/src/stats/
├── index.ts          # 统一导出
├── types.ts          # 统计相关接口
├── utils.ts          # 日期、收益、标准差等纯函数工具
├── dataQuality.ts    # 阶段 1：数据质量
├── coreMetrics.ts    # 阶段 2：收益与风险
├── rolling.ts        # 阶段 3：滚动收益与净值
├── technical.ts      # 阶段 4：技术指标
├── crossSection.ts   # 阶段 5：多 ETF 横截面
└── supplementary.ts  # 阶段 6：补充指标
```

### 3.1 纯函数设计

统计模块不负责访问数据库。`getCalcTask` 已经调用 Prisma 拉取 `Kline[]`，因此统计函数优先接收 `Kline[]`，这样更容易做单元测试：

```ts
import type { Kline } from "@maga/db";

export function calculateCoreMetrics(
  klines: readonly Kline[],
  options?: { startDate?: number; endDate?: number },
): CoreMetrics;
```

如果保留 `code + startDate + endDate` 的便捷接口，可以提供一个很薄的包装函数，但不要在每项指标内部重复查询数据库。

### 3.2 `getCalcTask` 的接入方式

当前查询按 `date` 降序返回。所有收益、回撤和滚动指标都必须按时间升序计算，建议在接入时把查询改成：

```ts
orderBy: { date: "asc" }
```

也可以在统计工具中统一执行升序归一化，但不能让各指标函数自行假设输入顺序。

推荐在 `calc.ts` 中形成以下流程：

```ts
fetch: 读取一只 ETF 的全部 Kline（时间升序）
save:
  1. 调用 checkDataQuality
  2. 调用 calculateCoreMetrics
  3. 调用 rolling / technical 等后续阶段
  4. 将结构化结果交给当前的日志输出或后续持久化层
```

阶段 1、2 完成前，不要为了让 `save` 有输出而改动 `Task` 表或新增统计结果表。

## 4. 统一计算约定

```ts
const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_RISK_FREE_RATE = 0;
```

- 收益率统一使用小数，`0.01` 表示 `1%`。
- 日收益率优先使用相邻 `close` 重算：

```ts
function calcDailyReturn(prevClose: number, close: number): number {
  if (prevClose <= 0) return 0;
  return close / prevClose - 1;
}
```

- 样本标准差使用 `ddof = 1`，即除以 `n - 1`。
- 数据不足时返回 `null`，不要返回 `NaN` 或 `Infinity`。
- 日期字段继续使用 `YYYYMMDD` 整数；需要转换时使用：

```ts
function dateToInt(date: Date): number;
function intToDate(value: number): Date;
```

- 所有统计函数传入的 `Kline[]` 应按日期升序；范围过滤使用闭区间。
- 除零、无收益样本、零波动、无回撤等情况必须显式处理。

## 5. 阶段 1：数据质量检查

目标文件：

```text
packages/crawler/src/stats/dataQuality.ts
packages/crawler/src/stats/types.ts
packages/crawler/src/stats/utils.ts
```

建议接口：

```ts
export interface DataQualityResult {
  code: string;
  startDate: number | null;
  endDate: number | null;
  tradingDays: number;
  missingDates: number[];
  anomalies: Array<{
    date: number;
    type:
      | "price_jump"
      | "zero_volume"
      | "negative_value"
      | "return_mismatch"
      | "negative_price";
    message: string;
    value?: number;
  }>;
  continuityErrors: Array<{
    date: number;
    storedReturn: number;
    calculatedReturn: number;
    diff: number;
  }>;
  isHealthy: boolean;
}
```

检查项：

1. 统计最早日期、最晚日期和交易日数量。
2. 检测相邻日期间隔；第一版可把间隔大于 15 个自然日标记为可能缺失。
3. 检测非正价格：`open/high/low/close <= 0`。
4. 检测负成交量和负成交额；`volume === 0` 单独记录为 `zero_volume`。
5. 检测单日 `changePercent` 绝对值大于 25% 的异常波动，阈值可配置。
6. 用相邻 `close` 计算收益率，与 `changePercent / 100` 比较；差值大于 `1e-5` 时记录连续性错误。
7. 根据异常数量、连续性错误和缺失日期综合得到 `isHealthy`。

注意：上游 `changePercent` 的口径可能和本文假设不同。第一版应把差异作为质量告警，不要直接修改原始 Kline。

## 6. 阶段 2：核心收益与风险指标

目标文件：

```text
packages/crawler/src/stats/coreMetrics.ts
```

建议接口：

```ts
export interface CoreMetrics {
  code: string;
  period: { start: number; end: number; tradingDays: number };

  totalReturn: number | null;
  annualizedReturnSimple: number | null;
  annualizedReturnCompound: number | null;
  avgDailyReturn: number | null;
  positiveDaysRatio: number | null;

  volatilityDaily: number | null;
  volatilityAnnualized: number | null;
  downsideVolatility: number | null;
  maxDrawdown: number | null;
  maxDrawdownStartDate: number | null;
  maxDrawdownEndDate: number | null;
  currentDrawdown: number | null;

  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;

  winRate: number | null;
  profitLossRatio: number | null;
  profitFactor: number | null;
}
```

公式：

1. 累计收益率：

   \[
   R = \prod_{t=1}^{N}(1+r_t) - 1
   \]

2. 复利年化：

   \[
   R_{ann} = (1+R)^{252/N} - 1
   \]

3. 年化波动率：

   \[
   \sigma_{ann} = \operatorname{std}(r_t) \times \sqrt{252}
   \]

4. 最大回撤：

   \[
   NAV_t = \prod_{i=1}^{t}(1+r_i)
   \]

   \[
   MDD = \min_t\left(\frac{NAV_t}{peak_t}-1\right)
   \]

5. 夏普比率：

   \[
   Sharpe = \frac{R_{ann}-r_f}{\sigma_{ann}}
   \]

6. 索提诺比率：下行波动率只使用 \(r_t < 0\) 的样本，风险自由利率默认为 0。
7. 卡玛比率：

   \[
   Calmar = \frac{R_{ann}}{|MDD|}
   \]

交易统计约定：

- `winRate`: 正收益天数 / 非零收益天数；无非零收益时为 `null`。
- `profitLossRatio`: 正收益平均值 / 负收益绝对值平均值；缺少任一侧时为 `null`。
- `profitFactor`: 正收益总和 / 负收益绝对值总和；没有亏损时为 `null`。

必须提供并测试以下辅助函数：

```ts
calculateReturns(klines: readonly Kline[]): number[];
calculateNAV(returns: readonly number[]): number[];
calculateMaxDrawdown(nav: readonly number[]): {
  mdd: number;
  startIdx: number;
  endIdx: number;
};
```

边界：

- 少于 2 个有效收盘价时，需要收益样本的指标返回 `null`。
- `n - 1 = 0` 时不计算样本标准差。
- 年化波动率为 0 时，夏普和索提诺返回 `null`。
- 最大回撤为 0 时，卡玛返回 `null`。

## 7. 阶段 3：滚动收益与净值曲线

目标文件：

```text
packages/crawler/src/stats/rolling.ts
```

建议接口：

```ts
export interface RollingResult {
  dates: number[];
  nav: number[];
  rollingReturn: Array<{
    date: number;
    return: number | null;
    annualizedReturn?: number | null;
  }>;
}
```

要求：

- 支持任意正整数 `window`，例如 20、60、120、250。
- `dates`、`nav` 与输入 Kline 日期逐位对齐。
- 完整净值序列起始值为 1。
- 窗口不足时，对应对应位置返回 `null`，不要截断数组。
- 所有日期和索引关系必须可测试。

建议签名：

```ts
calculateRollingMetrics(
  klines: readonly Kline[],
  window: number,
  options?: { startDate?: number; endDate?: number },
): RollingResult;
```

## 8. 阶段 4：技术指标

目标文件：

```text
packages/crawler/src/stats/technical.ts
```

指标和输出：

| 指标 | 默认参数 | 输出字段 |
| --- | --- | --- |
| SMA | 5 / 10 / 20 / 60 | `sma` |
| EMA | 12 / 26 | `ema` |
| MACD | 12 / 26 / 9 | `dif`, `dea`, `histogram` |
| RSI | 14 | `rsi` |
| 布林带 | 20 / 2 | `middle`, `upper`, `lower`, `bandwidth`, `percentB` |
| ATR | 14 | `atr` |

实现要求：

- 所有结果都与输入日期数组对齐。
- EMA 使用 \(\alpha = 2/(period+1)\)。
- RSI 使用 Wilder 平滑，并在文档注释中写清楚口径。
- `%B = (close - lower) / (upper - lower)`。
- 数据不足时填 `null`，不要以前值静默补齐。
- 先实现常用指标，不要一次性扩展到大量技术指标。

建议签名：

```ts
calculateTechnicalIndicators(
  klines: readonly Kline[],
  indicators: Array<"sma" | "ema" | "macd" | "rsi" | "boll" | "atr">,
  params?: Record<string, number>,
): TechnicalResult;
```

## 9. 阶段 5：多 ETF 横截面与对比

目标文件：

```text
packages/crawler/src/stats/crossSection.ts
```

需要实现：

1. `calculateCorrelationMatrix`
   - 输入多只 ETF 的 Kline 数据。
   - 按日期做 inner join，只保留共同交易日。
   - 使用 Pearson 相关系数。
   - 样本不足或任一方无波动时返回 `null`，不要输出 `NaN`。
2. `rankEtfs`
   - 支持 `totalReturn`、`volatility`、`maxDrawdown`、`sharpe`。
   - 明确升序/降序规则：波动率、最大回撤的绝对值按风险越低越优；收益和夏普越高越优。
3. `relativeStrength`
   - 计算 A 净值 / B 净值。
   - 日期仍做 inner join，返回对齐后的日期与比值。

多 ETF 阶段需要先解决批量取数策略。当前 `runCrawler` 只处理 1 只 ETF，实施该阶段时应在入口层扩展，而不是在横截面函数中直接访问 Prisma。

## 10. 阶段 6：补充指标

完成阶段 1、2、3 后再考虑：

- 连续上涨 / 下跌天数。
- 价格分位数。
- 量比、量价配合统计。
- 粗略换手率（基于 `amount / scale`，需确认单位）。
- VaR / CVaR 历史分位数。
- 偏度 / 峰度。

补充指标必须复用 `utils.ts` 中的收益、排序和统计工具，避免复制公式。

## 11. 测试与命令

测试文件与实现文件同级，命名如：

```text
packages/crawler/src/stats/coreMetrics.test.ts
packages/crawler/src/stats/rolling.test.ts
```

使用 Node 原生测试 API：

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
```

每个阶段至少覆盖：

- 正常上涨、下跌和震荡数据。
- 数据不足。
- 全涨、全跌、零波动。
- 空数组、单条 Kline、价格为 0 或负数。
- 对已知小样本手工计算最大回撤、年化波动和夏普，误差不超过 `1e-6`。

在仓库根目录执行：

```bash
pnpm --filter @maga/crawler test
pnpm --filter @maga/crawler typecheck
```

## 12. 执行顺序

1. 创建 `packages/crawler/src/stats/types.ts` 和 `utils.ts`。
2. 实现 `dataQuality.ts`，增加测试。
3. 实现 `coreMetrics.ts`，增加测试。
4. 接入 `packages/crawler/src/calc.ts`，确保任务可以从 `Kline[]` 得到结构化计算结果。
5. 实现 `rolling.ts`。
6. 实现 `technical.ts`。
7. 实现 `crossSection.ts`，并单独评估批量 ETF 取数。
8. 视情况实现 `supplementary.ts`。
9. 增加 `stats/index.ts` 统一导出。
10. 运行 crawler 的测试和类型检查，并做一次真实数据的烟雾验证。

每完成一个阶段，暂停并总结修改文件、测试命令和结果。

## 13. 验收标准

- 阶段 1、2 完成且测试通过。
- 所有公式与本文档一致，收益按 `close` 重算。
- 日期顺序、`null` 边界和除零行为明确且有测试。
- 不新增或修改 Prisma 表结构。
- 统计函数可独立测试，数据库访问只发生在 `Task.fetch` / 编排层。
- `pnpm --filter @maga/crawler test` 和 `pnpm --filter @maga/crawler typecheck` 通过。
- 计算模块能够通过现有 `getCalcTask` 在真实 Kline 数据上运行。
