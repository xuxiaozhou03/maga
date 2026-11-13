# A股ETF 量化回测系统 — 最终执行文档（单文件自包含版）

> **技术栈**：hono.js + Prisma(SQLite) + TypeScript（后端）；`public/` 下不编译 HTML + 原生 JS + CDN ECharts（前端）。
> **全链路**：爬虫（`Task<T>` + 交易日历幂等，红隼 API）→ 存储 → 特征预计算（单标的 + 横截面排名）→ 回测引擎（后台执行 + SSE 进度）→ 落库 → 前端展示。
> **执行方式**：策略在 hono 进程内执行，`strategies/` 动态注册。**回测后台执行 + SSE 进度；爬虫同步顺序执行（带交易日历跳过）**。**所有订单仅按当日收盘价成交（盘后定价、默认成交），不考虑涨跌停**。
> **本文件零外部引用，Codex 仅凭此文档即可实现全部功能。**

---

## 目录

1. 硬约束
2. 目录结构
3. Prisma Schema
4. 爬虫与同步（交易日历幂等）
5. 存储约定与数据加载
6. 引擎（完整代码）
7. 策略注册与示例
8. hono 路由（完整代码）
9. 前端（完整代码）
10. 错误处理与日志
11. 验收清单
12. 明确不做

---

## 1. 硬约束

1. **成交语义**：`handleBar(T)` 只能读 ≤ T 日数据；策略设目标权重，**以 T 日 close 成交**。严禁未来函数。
2. **成交价**：买 `close×(1+slip)`、卖 `close×(1−slip)`，滑点默认 0。
3. **费用**：佣金万 2.5、最低 5 元/笔；ETF 无印花税。
4. **T+1**：T 日买入 T+1 可卖；卖出资金 T+0 可用。
5. **最小单位**：100 份，向下取整整手。
6. **涨跌停**：不实现，不加 `limitRate`。
7. **订单类型**：仅市价（= close 成交）。
8. **组合语义**：目标权重 `{code: w}`，现金为剩余；未调用 `setTargetWeight` 当日不动作；调用则覆盖式（未列出=0，权重和>1 归一化）。
9. **资金/持仓不足**：按权重比例缩放，裁剪日志仅 `console.log`。
10. **执行模型**：**回测后台执行 + SSE 进度推送**（进程内 `EventEmitter`）；**爬虫同步顺序执行**（不 SSE，带交易日历跳过）。
11. **既有表改动边界**：`Etf`/`Kline`/`Valuation`/`Distribution` **不改**；`Task` **仅增量加** `finishedAt`、`error` 两个可空字段。
12. **特征排名口径固定**：池子=全部已同步 ETF；`rank_*` 越优越接近 1；回测沿用全池预先算好的 `rank_*`。
13. **回测触发唯一入口**：`POST /api/backtests`。
14. **同步幂等（交易日历）**：以 A 股交易时间 15:00 收盘为数据可用点。若 `finishedAt` 之后不存在“已过 15:00 的交易日”，则跳过；否则重跑。上次失败或 `finishedAt` 为空则必跑；`force` 强制重跑。
15. **数据口径**：
    - **Kline 以 ETF `code` 抓取**；`Kline.code` = ETF code。
    - **Valuation 与 Distribution 以 `trackIndex`（指数代码）抓取**；`Valuation.code`/`Distribution.code` = trackIndex。
    - 引擎 `getValuation(etfCode, type, date)` **内部做 `code→trackIndex` 映射**，策略无感。
16. **任务命名**：`etfs`、`{code}-klines`、`index-valuation-{trackIndex}-{type}`、`index-distribution-{trackIndex}`、`{code}-features`、`feature-cross`。**不用 `sync:*` 前缀**。

---

## 2. 目录结构

```
src/
  index.ts
  db.ts
  prisma/index.ts          # 既有：导出 prisma 与类型
  utils/runTask.ts         # 既有 Task<T> + 交易日历幂等
  crawler/
    etf.ts                 # 既有 etfsTask（新增 Feature 清理）
    kline.ts               # 既有 getKlineTask
    valuation.ts           # 既有 getIndexValuationTasks
    distribution.ts        # 既有 getIndexDistributionTask
    features.ts            # 新增：computeSingleFeatures
    feature-task.ts        # 新增：getFeatureTask / getCrossSectionTask
    features-cross.ts      # 新增：computeCrossSection
    index.ts               # 新增：runDailySync 编排
  routes/
    strategies.ts  backtests.ts  sync.ts  features.ts
  engine/
    types.ts  context.ts  engine.ts  metrics.ts  progress.ts
  strategies/
    types.ts  indicators.ts  index.ts  ma-cross.ts  valuation-timing.ts  momentum-rank.ts
public/
  index.html  create.html  detail.html  app.js  style.css
prisma/schema.prisma
```

---

## 3. Prisma Schema

既有表 `Etf`/`Kline`/`Valuation`/`Distribution` 保持原样。`Task` 增量加字段；新增四表。

```prisma
model Task {
  name        String    @id
  status      String
  finishedAt  DateTime?
  error       String?
  @@map("task")
}

model BacktestRun {
  id          String   @id @default(cuid())
  strategyKey String
  params      String
  codes       String
  startDate   Int
  endDate     Int
  status      String
  error       String?
  totalReturn Float?  annualReturn Float?  maxDrawdown Float?
  sharpe      Float?  winRate      Float?  tradeCount  Int?
  createdAt   DateTime @default(now())
  finishedAt  DateTime?
  dailies     BacktestDaily[]
  trade       BacktestTrade?
  @@map("backtest_run")
}

model BacktestDaily {
  runId     String
  date      Int
  equity    Float
  cash      Float
  positions String
  run BacktestRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@id([runId, date])
  @@index([runId, date])
  @@map("backtest_daily")
}

model BacktestTrade {
  runId  String @id
  trades String
  run BacktestRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@map("backtest_trade")
}

model Feature {
  code  String
  date  Int
  name  String
  value Float
  @@id([code, name, date])
  @@index([name, date, value])
  @@index([code, name, date])
  @@map("feature")
}
```

迁移：`npx prisma migrate dev --name add_backtest_feature_task_finished`。

---

## 4. 爬虫与同步（交易日历幂等）

### 4.1 依赖

```bash
npm i @yiliang114/trading-day
```

该包提供 `isTradingDay(date)` 判断 A 股交易日 。A 股连续竞价 9:30–11:30、13:00–15:00，收盘集合竞价 14:57–15:00，**15:00 后当日收盘数据才完整可用**。因此幂等判断以“交易日 15:00”为数据可用点。

### 4.2 `utils/runTask.ts`（完整）

```ts
import { prisma } from "../prisma/index.js";
import { isTradingDay } from "@yiliang114/trading-day";

export interface Task<T> {
  name: string;
  fetch: () => Promise<T>;
  save: (data: T) => Promise<void>;
}

/** 判断某个时刻是否已过该交易日的 15:00 数据可用点 */
function isAfterMarketClose(d: Date): boolean {
  const close = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    15,
    0,
    0,
    0,
  );
  return d >= close;
}

/**
 * 判断从 from 到 to 之间，是否存在“已过 15:00 的交易日”。
 * 若存在，则数据可能已更新，需要重跑。
 */
function hasNewTradingDaySince(from: Date, to: Date): boolean {
  // 情况1：from 本身是交易日，但当时未到 15:00
  if (isTradingDay(from) && !isAfterMarketClose(from)) {
    const sameDayClose = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      15,
      0,
      0,
      0,
    );
    if (to >= sameDayClose) return true;
  }

  // 情况2：从 from 的次日开始，到 to 之间是否有交易日且已过 15:00
  const cur = new Date(from);
  cur.setDate(cur.getDate() + 1);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (cur <= end) {
    if (isTradingDay(cur)) {
      const close = new Date(
        cur.getFullYear(),
        cur.getMonth(),
        cur.getDate(),
        15,
        0,
        0,
        0,
      );
      if (to >= close) return true;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

export async function shouldRun(name: string, force = false): Promise<boolean> {
  if (force) return true;
  const t = await prisma.task.findUnique({ where: { name } });
  if (!t || t.status !== "success" || !t.finishedAt) return true;
  return hasNewTradingDaySince(t.finishedAt, new Date());
}

export async function runTask<T>(task: Task<T>, force = false) {
  if (!(await shouldRun(task.name, force))) {
    console.log(`[skip] ${task.name} 未过期（无新交易日收盘）`);
    return;
  }
  try {
    const data = await task.fetch();
    await task.save(data);
    await prisma.task.upsert({
      where: { name: task.name },
      update: { status: "success", finishedAt: new Date(), error: null },
      create: {
        name: task.name,
        status: "success",
        finishedAt: new Date(),
        error: null,
      },
    });
  } catch (e: any) {
    await prisma.task.upsert({
      where: { name: task.name },
      update: {
        status: "failed",
        finishedAt: new Date(),
        error: String(e?.message ?? e),
      },
      create: {
        name: task.name,
        status: "failed",
        finishedAt: new Date(),
        error: String(e?.message ?? e),
      },
    });
    throw e;
  }
}
```

**行为对照**：

| 上次完成时间 | 当前时间     | 结果 | 说明                         |
| ------------ | ------------ | ---- | ---------------------------- |
| 周五 15:30   | 周六 10:00   | 跳过 | 周五已收盘完成，周末无交易日 |
| 周五 14:00   | 周五 15:30   | 重跑 | 上次未到收盘，数据不完整     |
| 周五 15:30   | 下周一 09:00 | 跳过 | 周一未到 15:00               |
| 周五 15:30   | 下周一 15:30 | 重跑 | 周一已收盘，有新数据         |
| 周一 15:30   | 周二 10:00   | 跳过 | 周二盘中，收盘数据未出       |

### 4.3 既有爬虫

**`crawler/etf.ts`**：保留你的 `fetchEtfs`。`save` 在原两级清理基础上新增 `feature.deleteMany`：

```ts
save: async (data) => {
  await prisma.$transaction(async (tx) => {
    for (const etf of data) {
      await tx.etf.upsert({
        where: { code: etf.code },
        create: etf,
        update: etf,
      });
    }
    const codes = data.map((e) => e.code);
    await tx.etf.deleteMany({ where: { code: { notIn: codes } } });
    await tx.kline.deleteMany({ where: { code: { notIn: codes } } });
    await tx.feature.deleteMany({ where: { code: { notIn: codes } } });
  });
};
```

**`crawler/kline.ts`**：`getKlineTask(code)` 保持不变（`name = `${code}-klines``）。

**`crawler/valuation.ts`**：`getIndexValuationTasks(trackIndex)` 保持不变（返回 4 个任务）。

**`crawler/distribution.ts`**：`getIndexDistributionTask(trackIndex)` 保持不变。

### 4.4 特征（新增，完整代码）

**`crawler/features.ts`**：

```ts
import type { Bar } from "../engine/types.js";

export const SINGLE_FEATURES = [
  "ret_1w",
  "ret_1m",
  "ret_3m",
  "vol_20d",
  "max_dd_60d",
  "ma_dev_20d",
  "turnover_20d",
  "val_percent",
] as const;

export function computeSingleFeatures(
  bars: Bar[],
  valuations: { date: number; percent: number }[],
): { date: number; name: string; value: number }[] {
  const out: { date: number; name: string; value: number }[] = [];
  const valMap = new Map(valuations.map((v) => [v.date, v.percent]));
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const annVol = (cs: number[]) => {
    const r = cs.slice(1).map((c, i) => c / cs[i] - 1);
    const m = mean(r);
    const sd = Math.sqrt(mean(r.map((x) => (x - m) ** 2)));
    return sd * Math.sqrt(252);
  };
  const maxDD = (cs: number[]) => {
    let p = cs[0],
      dd = 0;
    for (const c of cs) {
      p = Math.max(p, c);
      dd = Math.min(dd, c / p - 1);
    }
    return dd;
  };
  for (let i = 0; i < bars.length; i++) {
    const d = bars[i].date;
    const push = (name: string, v: number | null) => {
      if (v != null && isFinite(v)) out.push({ date: d, name, value: v });
    };
    if (i >= 5) push("ret_1w", bars[i].close / bars[i - 5].close - 1);
    if (i >= 21) push("ret_1m", bars[i].close / bars[i - 21].close - 1);
    if (i >= 63) push("ret_3m", bars[i].close / bars[i - 63].close - 1);
    if (i >= 20)
      push("vol_20d", annVol(bars.slice(i - 19, i + 1).map((b) => b.close)));
    if (i >= 60)
      push("max_dd_60d", maxDD(bars.slice(i - 59, i + 1).map((b) => b.close)));
    if (i >= 20) {
      const ma = mean(bars.slice(i - 19, i + 1).map((b) => b.close));
      push("ma_dev_20d", bars[i].close / ma - 1);
    }
    if (i >= 20)
      push(
        "turnover_20d",
        mean(bars.slice(i - 19, i + 1).map((b) => b.amount)),
      );
    const vp = valMap.get(d);
    if (vp != null) push("val_percent", vp);
  }
  return out;
}
```

**`crawler/features-cross.ts`**：

```ts
import { prisma } from "../prisma/index.js";

export async function computeCrossSection(
  poolCodes: string[],
  dates: number[],
) {
  const src = await prisma.feature.findMany({
    where: {
      code: { in: poolCodes },
      date: { in: dates },
      name: { in: ["ret_1m", "vol_20d", "val_percent"] },
    },
  });
  const groups = new Map<string, { code: string; value: number }[]>();
  for (const r of src) {
    const k = `${r.date}|${r.name}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ code: r.code, value: r.value });
  }
  const out: { code: string; date: number; name: string; value: number }[] = [];
  for (const [k, arr] of groups) {
    const [ds, name] = k.split("|");
    const date = Number(ds);
    arr.sort((a, b) => a.value - b.value);
    arr.forEach((it, i) => {
      const pct = arr.length > 1 ? i / (arr.length - 1) : 0.5;
      let outName = "",
        v = pct;
      if (name === "ret_1m") {
        outName = "rank_ret_1m";
      }
      if (name === "vol_20d") {
        outName = "rank_vol_20d";
        v = 1 - pct;
      }
      if (name === "val_percent") {
        outName = "rank_val_percent";
        v = 1 - pct;
      }
      out.push({ code: it.code, date, name: outName, value: v });
    });
  }
  return out;
}
```

**`crawler/feature-task.ts`**：

```ts
import type { Task } from "../utils/runTask.js";
import { prisma } from "../prisma/index.js";
import { computeSingleFeatures, SINGLE_FEATURES } from "./features.js";
import { computeCrossSection } from "./features-cross.js";

type FeatureRow = { date: number; name: string; value: number };

export const getFeatureTask = (code: string): Task<FeatureRow[]> => ({
  name: `${code}-features`,
  fetch: async () => {
    const bars = await prisma.kline.findMany({
      where: { code },
      orderBy: { date: "asc" },
    });
    if (bars.length < 6) return [];
    const etf = await prisma.etf.findUnique({ where: { code } });
    const trackIndex = etf?.trackIndex ?? "";
    const vals = await prisma.valuation.findMany({
      where: { code: trackIndex, type: "PE" },
      orderBy: { date: "asc" },
    });
    return computeSingleFeatures(
      bars.map((b) => ({
        code: b.code,
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        amount: b.amount,
        change: b.change,
        changePercent: b.changePercent,
      })),
      vals.map((v) => ({ date: v.date, percent: v.percent })),
    );
  },
  save: async (rows) => {
    await prisma.$transaction([
      prisma.feature.deleteMany({
        where: { code, name: { in: [...SINGLE_FEATURES] } },
      }),
      prisma.feature.createMany({ data: rows.map((r) => ({ code, ...r })) }),
    ]);
  },
});

export const getCrossSectionTask = (): Task<any[]> => ({
  name: "feature-cross",
  fetch: async () => {
    const codes = (await prisma.etf.findMany({ select: { code: true } })).map(
      (e) => e.code,
    );
    const recent = await prisma.kline.findMany({
      select: { date: true },
      orderBy: { date: "desc" },
      distinct: ["date"],
      take: 30,
    });
    return computeCrossSection(
      codes,
      recent.map((r) => r.date),
    );
  },
  save: async (rows) => {
    const ranks = ["rank_ret_1m", "rank_vol_20d", "rank_val_percent"];
    await prisma.$transaction([
      prisma.feature.deleteMany({ where: { name: { in: ranks } } }),
      prisma.feature.createMany({ data: rows }),
    ]);
  },
});
```

### 4.5 编排 `crawler/index.ts`

```ts
import { runTask } from "../utils/runTask.js";
import { etfsTask } from "./etf.js";
import { getKlineTask } from "./kline.js";
import { getIndexValuationTasks } from "./valuation.js";
import { getIndexDistributionTask } from "./distribution.js";
import { getFeatureTask, getCrossSectionTask } from "./feature-task.js";
import { prisma } from "../prisma/index.js";

export async function runDailySync(force = false) {
  await runTask(etfsTask, force);

  const etfs = await prisma.etf.findMany({
    select: { code: true, trackIndex: true },
  });
  for (const { code, trackIndex } of etfs) {
    await runTask(getKlineTask(code), force);
    if (trackIndex) {
      for (const t of getIndexValuationTasks(trackIndex))
        await runTask(t, force);
      await runTask(getIndexDistributionTask(trackIndex), force);
    }
    await runTask(getFeatureTask(code), force);
  }
  await runTask(getCrossSectionTask(), force);
}
```

> Distribution 不再单独设 7 天 TTL，统一按交易日收盘判断。如需“一周才跑”，可在 `runTask` 外层额外加自然日判断，本版不做。

---

## 5. 存储约定与数据加载

- `date` 一律 `YYYYMMDD` 整数；`Valuation.percent` 归一为 `[0,1]`；`Distribution` 无日期，不参与回测。
- **口径**：`Kline.code` = ETF code；`Valuation.code`/`Distribution.code` = trackIndex。
- 回测加载：
  - `etf.findMany({ where: { code: { in: codes } } })` 建 `trackOf: Map<code, trackIndex>`。
  - 读 `Kline`（ETF code）、`Valuation`（**trackIndex 集合**）、`Feature`（ETF code）。
  - 构造 `barsByCode`、`valuationMap`（key `${trackIndex}|${type}|${date}`）、`featureMap`（key `${code}|${name}|${date}`）。

---

## 6. 引擎（完整代码）

### 6.1 `src/engine/types.ts`

```ts
export interface Bar {
  code: string;
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
}
export interface ValuationSnap {
  value: number;
  percent: number;
}
export interface Fill {
  code: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  fee: number;
  date: number;
}

export interface Context {
  readonly date: number;
  readonly codes: string[];
  readonly equity: number;
  readonly cash: number;
  readonly positions: Record<string, number>;
  readonly targetWeights: Record<string, number>;
  getBars(code: string, lookback?: number): Bar[];
  getValuation(
    code: string,
    type: "PE" | "PB" | "PS" | "DID",
    date: number,
  ): ValuationSnap | null;
  getFeature(code: string, name: string): number | null;
  setTargetWeight(weights: Record<string, number>): void;
  order(code: string, side: "buy" | "sell", shares: number): void;
  log(msg: string): void;
}
export interface Strategy {
  initialize?(p: Record<string, any>): void;
  handleBar(ctx: Context): void;
  onOrder?(f: Fill): void;
}
export interface BacktestConfig {
  commissionRate: number;
  minCommission: number;
  slippage: number;
}
export interface RunBacktestInput {
  strategyKey: string;
  params: Record<string, any>;
  codes: string[];
  startDate: number;
  endDate: number;
  config?: Partial<BacktestConfig>;
  initialCash?: number;
  runId?: string;
}
```

### 6.2 `src/engine/context.ts`

```ts
import type { Bar, Context, ValuationSnap } from "./types.js";

export interface BuildContextOpts {
  date: number;
  codes: string[];
  cash: number;
  positions: Record<string, number>;
  equity: number;
  barsByCode: Map<string, Bar[]>;
  trackOf: Map<string, string>;
  valuationMap: Map<string, ValuationSnap>;
  featureMap: Map<string, number>;
  targetWeightsRef: { value: Record<string, number>; set: boolean };
  manualOrders: { code: string; side: "buy" | "sell"; shares: number }[];
  logger: (m: string) => void;
}

export function buildContext(o: BuildContextOpts): Context {
  return {
    date: o.date,
    codes: o.codes,
    equity: o.equity,
    cash: o.cash,
    positions: { ...o.positions },
    get targetWeights() {
      return { ...o.targetWeightsRef.value };
    },
    getBars(code, lookback) {
      const all = o.barsByCode.get(code) ?? [];
      const visible = all.filter((b) => b.date <= o.date);
      return lookback ? visible.slice(-lookback) : visible;
    },
    getValuation(code, type, date) {
      if (date > o.date) return null;
      const trackIndex = o.trackOf.get(code);
      if (!trackIndex) return null;
      return o.valuationMap.get(`${trackIndex}|${type}|${date}`) ?? null;
    },
    getFeature(code, name) {
      return o.featureMap.get(`${code}|${name}|${o.date}`) ?? null;
    },
    setTargetWeight(w) {
      o.targetWeightsRef.value = { ...w };
      o.targetWeightsRef.set = true;
    },
    order(code, side, shares) {
      o.manualOrders.push({ code, side, shares });
    },
    log(m) {
      o.logger(m);
    },
  };
}
```

### 6.3 `src/engine/progress.ts`

```ts
import { EventEmitter } from "node:events";
export const progressBus = new EventEmitter();
progressBus.setMaxListeners(0);
export function emitProgress(runId: string, payload: any) {
  progressBus.emit(`run:${runId}`, payload);
}
```

### 6.4 `src/engine/metrics.ts`

```ts
import type { Fill } from "./types.js";

export function computeMetrics(
  dailies: { date: number; equity: number }[],
  fills: Fill[],
  initialCash: number,
) {
  if (!dailies.length) {
    return {
      totalReturn: 0,
      annualReturn: 0,
      maxDrawdown: 0,
      sharpe: 0,
      winRate: 0,
      tradeCount: fills.length,
    };
  }
  const n = dailies.length;
  const totalReturn = dailies[n - 1].equity / initialCash - 1;
  const annualReturn = Math.pow(1 + totalReturn, 252 / n) - 1;

  let peak = dailies[0].equity,
    maxDrawdown = 0;
  for (const d of dailies) {
    peak = Math.max(peak, d.equity);
    maxDrawdown = Math.min(maxDrawdown, d.equity / peak - 1);
  }

  const rets: number[] = [];
  for (let i = 1; i < n; i++)
    rets.push(dailies[i].equity / dailies[i - 1].equity - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const std = Math.sqrt(
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1),
  );
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(252);

  const avgCost: Record<string, { shares: number; cost: number }> = {};
  let wins = 0,
    closed = 0;
  for (const f of fills) {
    if (f.side === "buy") {
      const a = avgCost[f.code] ?? { shares: 0, cost: 0 };
      a.shares += f.shares;
      a.cost += f.shares * f.price + f.fee;
      avgCost[f.code] = a;
    } else {
      const a = avgCost[f.code];
      if (!a || a.shares <= 0) continue;
      const sellPrice = f.price - f.fee / f.shares;
      const buyAvg = a.cost / a.shares;
      closed++;
      if (sellPrice > buyAvg) wins++;
      a.shares -= f.shares;
      a.cost -= buyAvg * f.shares;
    }
  }
  const winRate = closed ? wins / closed : 0;
  return {
    totalReturn,
    annualReturn,
    maxDrawdown,
    sharpe,
    winRate,
    tradeCount: fills.length,
  };
}
```

### 6.5 `src/engine/engine.ts`（完整）

```ts
import { prisma } from "../db.js";
import { registry } from "../strategies/index.js";
import { buildContext } from "./context.js";
import { computeMetrics } from "./metrics.js";
import { emitProgress } from "./progress.js";
import type {
  Bar,
  BacktestConfig,
  Fill,
  RunBacktestInput,
  ValuationSnap,
} from "./types.js";

const DEFAULT_CONFIG: BacktestConfig = {
  commissionRate: 0.00025,
  minCommission: 5,
  slippage: 0,
};

export async function runBacktest(input: RunBacktestInput): Promise<string> {
  const meta = registry[input.strategyKey];
  if (!meta) throw new Error(`未知策略: ${input.strategyKey}`);
  if (!input.codes?.length) throw new Error("codes 不能为空");
  if (input.startDate > input.endDate)
    throw new Error("startDate 必须 <= endDate");

  const config: BacktestConfig = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };
  const initialCash = input.initialCash ?? 1_000_000;

  const run = input.runId
    ? { id: input.runId }
    : await prisma.backtestRun.create({
        data: {
          strategyKey: input.strategyKey,
          params: JSON.stringify({ params: input.params, config }),
          codes: JSON.stringify(input.codes),
          startDate: input.startDate,
          endDate: input.endDate,
          status: "running",
        },
      });

  try {
    const etfs = await prisma.etf.findMany({
      where: { code: { in: input.codes } },
      select: { code: true, trackIndex: true },
    });
    const trackOf = new Map<string, string>(
      etfs.map((e) => [e.code, e.trackIndex ?? ""]),
    );
    const trackIndexes = [
      ...new Set(etfs.map((e) => e.trackIndex).filter(Boolean)),
    ] as string[];

    const klines = await prisma.kline.findMany({
      where: {
        code: { in: input.codes },
        date: { gte: input.startDate, lte: input.endDate },
      },
    });
    const barsByCode = new Map<string, Bar[]>();
    for (const k of klines) {
      if (!barsByCode.has(k.code)) barsByCode.set(k.code, []);
      barsByCode.get(k.code)!.push({
        code: k.code,
        date: k.date,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        amount: k.amount,
        change: k.change,
        changePercent: k.changePercent,
      });
    }
    for (const arr of barsByCode.values()) arr.sort((a, b) => a.date - b.date);

    const valuations = await prisma.valuation.findMany({
      where: {
        code: { in: trackIndexes },
        date: { gte: input.startDate, lte: input.endDate },
      },
    });
    const valuationMap = new Map<string, ValuationSnap>();
    for (const v of valuations)
      valuationMap.set(`${v.code}|${v.type}|${v.date}`, {
        value: v.value,
        percent: v.percent,
      });

    const featureRows = await prisma.feature.findMany({
      where: {
        code: { in: input.codes },
        date: { gte: input.startDate, lte: input.endDate },
      },
    });
    const featureMap = new Map<string, number>();
    for (const f of featureRows)
      featureMap.set(`${f.code}|${f.name}|${f.date}`, f.value);

    const dateSet = new Set<number>();
    for (const arr of barsByCode.values())
      for (const b of arr) dateSet.add(b.date);
    const tradingDates = [...dateSet].sort((a, b) => a - b);
    if (!tradingDates.length) throw new Error("区间内无 K 线数据");

    let cash = initialCash;
    const positions: Record<string, number> = {};
    let buyToday: Record<string, number> = {};
    const fills: Fill[] = [];
    const dailies: {
      date: number;
      equity: number;
      cash: number;
      positions: Record<string, number>;
    }[] = [];

    const closeOf = (code: string, date: number) => {
      const arr = barsByCode.get(code);
      if (!arr) return 0;
      const b = arr.find((x) => x.date === date);
      return b?.close ?? 0;
    };

    const strategy = new (meta.new as any)();
    strategy.initialize?.(input.params ?? {});

    const total = tradingDates.length;
    for (let idx = 0; idx < total; idx++) {
      const date = tradingDates[idx];
      const equityBefore =
        cash +
        input.codes.reduce(
          (s, c) => s + (positions[c] ?? 0) * closeOf(c, date),
          0,
        );

      const targetWeightsRef = {
        value: {} as Record<string, number>,
        set: false,
      };
      const manualOrders: {
        code: string;
        side: "buy" | "sell";
        shares: number;
      }[] = [];
      const logger = (m: string) =>
        console.log(`[backtest ${run.id} ${date}] ${m}`);

      const ctx = buildContext({
        date,
        codes: input.codes,
        cash,
        positions,
        equity: equityBefore,
        barsByCode,
        trackOf,
        valuationMap,
        featureMap,
        targetWeightsRef,
        manualOrders,
        logger,
      });
      strategy.handleBar(ctx);

      type Order = { code: string; side: "buy" | "sell"; shares: number };
      const orders: Order[] = [];
      if (targetWeightsRef.set) {
        const tw = { ...targetWeightsRef.value };
        const totalW = Object.values(tw).reduce((a, b) => a + b, 0);
        const norm =
          totalW > 1
            ? Object.fromEntries(
                Object.entries(tw).map(([k, v]) => [k, v / totalW]),
              )
            : tw;
        for (const code of input.codes) {
          const w = norm[code] ?? 0;
          const price = closeOf(code, date);
          if (price <= 0) continue;
          const targetShares =
            Math.floor((equityBefore * w) / price / 100) * 100;
          const diff = targetShares - (positions[code] ?? 0);
          if (diff > 0) orders.push({ code, side: "buy", shares: diff });
          else if (diff < 0) orders.push({ code, side: "sell", shares: -diff });
        }
      } else if (manualOrders.length) {
        for (const o of manualOrders) orders.push({ ...o });
      }

      for (const o of orders.filter((o) => o.side === "sell")) {
        const sellable = Math.max(
          0,
          (positions[o.code] ?? 0) - (buyToday[o.code] ?? 0),
        );
        const shares = Math.floor(Math.min(o.shares, sellable) / 100) * 100;
        if (shares <= 0) {
          logger(`卖出裁剪 ${o.code}`);
          continue;
        }
        const price = closeOf(o.code, date) * (1 - config.slippage);
        const gross = shares * price;
        const fee = Math.max(
          config.minCommission,
          gross * config.commissionRate,
        );
        cash += gross - fee;
        positions[o.code] -= shares;
        fills.push({ code: o.code, side: "sell", shares, price, fee, date });
      }
      const priced = orders
        .filter((o) => o.side === "buy")
        .map((o) => {
          const price = closeOf(o.code, date) * (1 + config.slippage);
          return { code: o.code, want: o.shares, price };
        });
      const need = priced.reduce(
        (s, b) =>
          s +
          b.want * b.price +
          Math.max(
            config.minCommission,
            b.want * b.price * config.commissionRate,
          ),
        0,
      );
      const scale = need > cash ? cash / need : 1;
      let avail = cash;
      for (const b of priced) {
        let shares = Math.floor((b.want * scale) / 100) * 100;
        while (shares > 0) {
          const gross = shares * b.price;
          const fee = Math.max(
            config.minCommission,
            gross * config.commissionRate,
          );
          if (gross + fee <= avail) {
            avail -= gross + fee;
            positions[b.code] = (positions[b.code] ?? 0) + shares;
            buyToday[b.code] = (buyToday[b.code] ?? 0) + shares;
            fills.push({
              code: b.code,
              side: "buy",
              shares,
              price: b.price,
              fee,
              date,
            });
            break;
          }
          shares -= 100;
        }
        if (shares <= 0) logger(`买入裁剪 ${b.code}`);
      }
      cash = avail;

      const equityAfter =
        cash +
        input.codes.reduce(
          (s, c) => s + (positions[c] ?? 0) * closeOf(c, date),
          0,
        );
      dailies.push({
        date,
        equity: equityAfter,
        cash,
        positions: { ...positions },
      });

      if (idx % 10 === 0 || idx === total - 1) {
        emitProgress(run.id, {
          type: "progress",
          date,
          pct: (idx + 1) / total,
          equity: equityAfter,
        });
      }

      buyToday = {};
    }

    const metrics = computeMetrics(
      dailies.map((d) => ({ date: d.date, equity: d.equity })),
      fills,
      initialCash,
    );

    await prisma.$transaction([
      prisma.backtestDaily.createMany({
        data: dailies.map((d) => ({
          runId: run.id,
          date: d.date,
          equity: d.equity,
          cash: d.cash,
          positions: JSON.stringify(d.positions),
        })),
      }),
      prisma.backtestTrade.create({
        data: { runId: run.id, trades: JSON.stringify(fills) },
      }),
      prisma.backtestRun.update({
        where: { id: run.id },
        data: { status: "success", finishedAt: new Date(), ...metrics },
      }),
    ]);

    emitProgress(run.id, {
      type: "done",
      status: "success",
      totalReturn: metrics.totalReturn,
    });
    return run.id;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    await prisma.backtestRun.update({
      where: { id: run.id },
      data: { status: "failed", error: msg, finishedAt: new Date() },
    });
    emitProgress(run.id, { type: "error", message: msg });
    return run.id;
  }
}
```

---

## 7. 策略注册与示例

**`strategies/types.ts`**：

```ts
export type {
  Strategy,
  Context,
  Bar,
  ValuationSnap,
  Fill,
} from "../engine/types.js";
```

**`strategies/indicators.ts`**：

```ts
export const sma = (a: number[], n: number) =>
  a.slice(-n).reduce((x, y) => x + y, 0) / n;
export const retN = (a: number[], n: number) =>
  a.length > n ? a[a.length - 1] / a[a.length - 1 - n] - 1 : null;
```

**`strategies/ma-cross.ts`**：

```ts
import type { Strategy, Context } from "../engine/types.js";
export default class MaCross implements Strategy {
  private fast = 5;
  private slow = 20;
  initialize(p: any) {
    this.fast = p.fast ?? 5;
    this.slow = p.slow ?? 20;
  }
  handleBar(ctx: Context) {
    const code = ctx.codes[0];
    const bars = ctx.getBars(code, this.slow + 1);
    if (bars.length < this.slow + 1) return;
    const ma = (arr: typeof bars, n: number) =>
      arr.slice(-n).reduce((s, b) => s + b.close, 0) / n;
    const fN = ma(bars, this.fast),
      sN = ma(bars, this.slow);
    const p = bars.slice(0, -1),
      fP = ma(p, this.fast),
      sP = ma(p, this.slow);
    if (fP <= sP && fN > sN) ctx.setTargetWeight({ [code]: 1 });
    else if (fP >= sP && fN < sN) ctx.setTargetWeight({ [code]: 0 });
  }
}
```

**`strategies/valuation-timing.ts`**：

```ts
import type { Strategy, Context } from "../engine/types.js";
export default class ValuationTiming implements Strategy {
  private low = 0.3;
  private high = 0.7;
  initialize(p: any) {
    this.low = p.low ?? 0.3;
    this.high = p.high ?? 0.7;
  }
  handleBar(ctx: Context) {
    const code = ctx.codes[0];
    const v = ctx.getValuation(code, "PE", ctx.date);
    if (!v) return;
    if (v.percent <= this.low) ctx.setTargetWeight({ [code]: 1 });
    else if (v.percent >= this.high) ctx.setTargetWeight({ [code]: 0 });
  }
}
```

**`strategies/momentum-rank.ts`**：

```ts
import type { Strategy, Context } from "../engine/types.js";
export default class MomentumRank implements Strategy {
  private topN = 3;
  initialize(p: any) {
    this.topN = p.topN ?? 3;
  }
  handleBar(ctx: Context) {
    const scored = ctx.codes
      .map((code) => ({ code, r: ctx.getFeature(code, "rank_ret_1m") }))
      .filter((x) => x.r != null) as { code: string; r: number }[];
    if (!scored.length) return;
    scored.sort((a, b) => b.r - a.r);
    const top = scored.slice(0, this.topN);
    const w = 1 / top.length;
    ctx.setTargetWeight(Object.fromEntries(top.map((t) => [t.code, w])));
  }
}
```

**`strategies/index.ts`**：

```ts
import MaCross from "./ma-cross.js";
import ValuationTiming from "./valuation-timing.js";
import MomentumRank from "./momentum-rank.js";
import type { Strategy } from "../engine/types.js";

export interface StrategyMeta {
  key: string;
  name: string;
  description: string;
  paramsSchema: Record<
    string,
    { type: "number" | "string"; default?: any; desc?: string }
  >;
  new (): Strategy;
}

export const registry: Record<string, StrategyMeta> = {
  ma_cross: {
    key: "ma_cross",
    name: "双均线",
    description: "金叉买入、死叉清仓（单标的）",
    paramsSchema: {
      fast: { type: "number", default: 5 },
      slow: { type: "number", default: 20 },
    },
    new: MaCross as any,
  },
  valuation_timing: {
    key: "valuation_timing",
    name: "估值分位择时",
    description: "PE 分位低买高卖（单标的）",
    paramsSchema: {
      low: { type: "number", default: 0.3 },
      high: { type: "number", default: 0.7 },
    },
    new: ValuationTiming as any,
  },
  momentum_rank: {
    key: "momentum_rank",
    name: "动量排名轮动",
    description: "按 rank_ret_1m 取 TopN 等权",
    paramsSchema: { topN: { type: "number", default: 3 } },
    new: MomentumRank as any,
  },
};
```

---

## 8. hono 路由（完整代码）

**`src/db.ts`**：

```ts
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

**`src/routes/strategies.ts`**：

```ts
import { Hono } from "hono";
import { registry } from "../strategies/index.js";
export const strategiesRoute = new Hono();
strategiesRoute.get("/", (c) =>
  c.json(
    Object.values(registry).map(({ key, name, description, paramsSchema }) => ({
      key,
      name,
      description,
      paramsSchema,
    })),
  ),
);
```

**`src/routes/backtests.ts`**：

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { prisma } from "../db.js";
import { runBacktest } from "../engine/engine.js";
import { progressBus } from "../engine/progress.js";

export const backtestsRoute = new Hono();

backtestsRoute.post("/", async (c) => {
  const b = await c.req.json<any>();
  if (!b?.strategyKey) return c.json({ error: "strategyKey required" }, 400);
  if (!Array.isArray(b.codes) || !b.codes.length)
    return c.json({ error: "codes required" }, 400);
  if (!b.startDate || !b.endDate || b.startDate > b.endDate)
    return c.json({ error: "invalid date range" }, 400);

  const run = await prisma.backtestRun.create({
    data: {
      strategyKey: b.strategyKey,
      params: JSON.stringify({
        params: b.params ?? {},
        config: b.config ?? {},
      }),
      codes: JSON.stringify(b.codes),
      startDate: b.startDate,
      endDate: b.endDate,
      status: "running",
    },
  });
  void runBacktest({
    strategyKey: b.strategyKey,
    params: b.params ?? {},
    codes: b.codes,
    startDate: b.startDate,
    endDate: b.endDate,
    config: b.config,
    initialCash: b.initialCash,
    runId: run.id,
  });
  return c.json({ id: run.id, status: "running" });
});

backtestsRoute.get("/:id/stream", async (c) => {
  const id = c.req.param("id");
  const run = await prisma.backtestRun.findUnique({ where: { id } });
  if (!run) return c.notFound();

  return streamSSE(c, async (stream) => {
    if (run.status !== "running") {
      const ev = run.status === "success" ? "done" : "error";
      const data =
        run.status === "success"
          ? { type: "done", status: "success", totalReturn: run.totalReturn }
          : { type: "error", message: run.error };
      await stream.writeSSE({ event: ev, data: JSON.stringify(data) });
      return;
    }
    const handler = async (payload: any) => {
      await stream.writeSSE({
        event: payload.type,
        data: JSON.stringify(payload),
      });
      if (payload.type === "done" || payload.type === "error") {
        progressBus.off(`run:${id}`, handler);
        await stream.close();
      }
    };
    progressBus.on(`run:${id}`, handler);
    const hb = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
    }, 15000);
    stream.onAbort(() => {
      clearInterval(hb);
      progressBus.off(`run:${id}`, handler);
    });
  });
});

backtestsRoute.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const strategyKey = c.req.query("strategyKey");
  const code = c.req.query("code");
  const where: any = {};
  if (strategyKey) where.strategyKey = strategyKey;
  if (code) where.codes = { contains: code };
  const [rows, total] = await Promise.all([
    prisma.backtestRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        strategyKey: true,
        codes: true,
        startDate: true,
        endDate: true,
        status: true,
        totalReturn: true,
        annualReturn: true,
        maxDrawdown: true,
        sharpe: true,
        winRate: true,
        tradeCount: true,
        createdAt: true,
      },
    }),
    prisma.backtestRun.count({ where }),
  ]);
  return c.json({ total, rows });
});

backtestsRoute.get("/:id", async (c) => {
  const run = await prisma.backtestRun.findUnique({
    where: { id: c.req.param("id") },
  });
  return run ? c.json(run) : c.notFound();
});

backtestsRoute.get("/:id/daily", async (c) => {
  const rows = await prisma.backtestDaily.findMany({
    where: { runId: c.req.param("id") },
    orderBy: { date: "asc" },
  });
  return c.json(
    rows.map((r) => ({ ...r, positions: JSON.parse(r.positions) })),
  );
});

backtestsRoute.get("/:id/trades", async (c) => {
  const t = await prisma.backtestTrade.findUnique({
    where: { runId: c.req.param("id") },
  });
  return c.json(t ? JSON.parse(t.trades) : []);
});
```

**`src/routes/sync.ts`**：

```ts
import { Hono } from "hono";
import { runDailySync } from "../crawler/index.js";
export const syncRoute = new Hono();
syncRoute.post("/", async (c) => {
  const force =
    c.req.query("force") === "1" ||
    (await c.req.json().catch(() => ({})))?.force === true;
  await runDailySync(force);
  return c.json({ ok: true, force });
});
```

**`src/routes/features.ts`**：

```ts
import { Hono } from "hono";
import { prisma } from "../db.js";
export const featuresRoute = new Hono();

featuresRoute.get("/", async (c) => {
  const name = c.req.query("name");
  if (!name) return c.json({ error: "name required" }, 400);
  let date = c.req.query("date") ? Number(c.req.query("date")) : null;
  if (date == null) {
    const latest = await prisma.feature.findFirst({
      where: { name },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    date = latest?.date ?? null;
  }
  if (date == null) return c.json({ date: null, rows: [] });
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 200);
  const rows = await prisma.feature.findMany({
    where: { name, date },
    orderBy: { value: "desc" },
    take: limit,
    select: { code: true, value: true },
  });
  const etfs = await prisma.etf.findMany({
    where: { code: { in: rows.map((r) => r.code) } },
    select: { code: true, name: true },
  });
  const nameMap = new Map(etfs.map((e) => [e.code, e.name]));
  return c.json({
    date,
    rows: rows.map((r) => ({ ...r, etfName: nameMap.get(r.code) ?? "" })),
  });
});

featuresRoute.get("/:code", async (c) => {
  const code = c.req.param("code");
  const names = (c.req.query("names") ?? "").split(",").filter(Boolean);
  const start = c.req.query("start") ? Number(c.req.query("start")) : 0;
  const end = c.req.query("end") ? Number(c.req.query("end")) : 99999999;
  const where: any = { code, date: { gte: start, lte: end } };
  if (names.length) where.name = { in: names };
  const rows = await prisma.feature.findMany({
    where,
    orderBy: [{ name: "asc" }, { date: "asc" }],
  });
  return c.json(rows);
});
```

**`src/index.ts`**：

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/serve-static";
import { strategiesRoute } from "./routes/strategies.js";
import { backtestsRoute } from "./routes/backtests.js";
import { syncRoute } from "./routes/sync.js";
import { featuresRoute } from "./routes/features.js";

const app = new Hono();
app.use(
  "*",
  cors({
    origin: (o) => o ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);
app.route("/api/strategies", strategiesRoute);
app.route("/api/backtests", backtestsRoute);
app.route("/api/sync", syncRoute);
app.route("/api/features", featuresRoute);
app.use("/*", serveStatic({ root: "./public" }));
app.get("/", (c) => c.redirect("/index.html"));
export default app;
```

---

## 9. 前端（完整代码）

**`public/app.js`**：

```js
const BASE =
  location.port === "3000" || location.port === ""
    ? "/api"
    : "http://localhost:3000/api";

async function api(path, init) {
  const r = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
const fmtPct = (x) => (x == null ? "-" : (x * 100).toFixed(2) + "%");
const fmtNum = (x, d = 4) => (x == null ? "-" : Number(x).toFixed(d));
const fmtDate = (d) =>
  d == null ? "-" : String(d).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
const colorPct = (x) =>
  x == null ? "" : x > 0 ? "color:#d32f2f" : x < 0 ? "color:#2e7d32" : "";

function table(el, headers, rows) {
  el.innerHTML = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function equityChart(el, dailies) {
  if (typeof echarts === "undefined") return;
  const chart = echarts.init(el);
  chart.setOption({
    tooltip: { trigger: "axis" },
    grid: { left: 60, right: 20, top: 20, bottom: 40 },
    xAxis: { type: "category", data: dailies.map((d) => fmtDate(d.date)) },
    yAxis: { type: "value", scale: true },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        data: dailies.map((d) => d.equity),
        areaStyle: { opacity: 0.1 },
      },
    ],
  });
  window.addEventListener("resize", () => chart.resize());
  return chart;
}
```

**`public/style.css`**：

```css
body {
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
  margin: 24px;
  color: #222;
}
h1 {
  font-size: 20px;
}
h2 {
  font-size: 16px;
  margin-top: 28px;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0 24px;
}
th,
td {
  border: 1px solid #ddd;
  padding: 6px 10px;
  font-size: 13px;
  text-align: left;
}
th {
  background: #f5f5f5;
}
.toolbar {
  margin: 12px 0;
}
.btn {
  display: inline-block;
  padding: 6px 12px;
  background: #2563eb;
  color: #fff;
  border-radius: 4px;
  text-decoration: none;
  font-size: 13px;
  cursor: pointer;
}
form label {
  display: block;
  margin: 10px 0;
  font-size: 14px;
}
form input,
form select {
  margin-left: 8px;
  padding: 4px 6px;
}
#msg {
  margin-top: 12px;
  font-size: 13px;
  color: #666;
}
```

**`public/index.html`**：

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>量化回测</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <h1>回测历史</h1>
    <div class="toolbar"><a class="btn" href="create.html">+ 新建回测</a></div>
    <div id="list">加载中…</div>

    <h2>ETF 特征排名</h2>
    <div class="toolbar">
      日期 <input id="fDate" placeholder="YYYYMMDD，留空=最新" /> 特征
      <select id="fName">
        <option value="ret_1m">ret_1m</option>
        <option value="ret_1w">ret_1w</option>
        <option value="ret_3m">ret_3m</option>
        <option value="vol_20d">vol_20d</option>
        <option value="max_dd_60d">max_dd_60d</option>
        <option value="ma_dev_20d">ma_dev_20d</option>
        <option value="turnover_20d">turnover_20d</option>
        <option value="val_percent">val_percent</option>
        <option value="rank_ret_1m">rank_ret_1m</option>
        <option value="rank_vol_20d">rank_vol_20d</option>
        <option value="rank_val_percent">rank_val_percent</option>
      </select>
      TopN <input id="fLimit" type="number" value="20" style="width:70px" />
      <button class="btn" id="fBtn">查询</button>
    </div>
    <div id="feat">加载中…</div>

    <script src="app.js"></script>
    <script>
      (async () => {
        try {
          const { rows } = await api("/backtests?limit=100");
          if (!rows.length) {
            document.getElementById("list").textContent = "暂无回测记录";
          } else
            table(
              document.getElementById("list"),
              [
                "创建时间",
                "策略",
                "标的",
                "区间",
                "状态",
                "总收益",
                "年化",
                "最大回撤",
                "夏普",
                "笔数",
                "操作",
              ],
              rows.map((r) => [
                new Date(r.createdAt).toLocaleString(),
                r.strategyKey,
                JSON.parse(r.codes).join(","),
                `${fmtDate(r.startDate)}~${fmtDate(r.endDate)}`,
                r.status,
                `<span style="${colorPct(r.totalReturn)}">${fmtPct(r.totalReturn)}</span>`,
                fmtPct(r.annualReturn),
                fmtPct(r.maxDrawdown),
                fmtNum(r.sharpe, 2),
                r.tradeCount ?? "-",
                `<a href="detail.html?id=${r.id}">查看</a>`,
              ]),
            );
        } catch (e) {
          document.getElementById("list").textContent =
            "加载失败: " + e.message;
        }
      })();

      async function loadFeatures() {
        const name = document.getElementById("fName").value;
        const date = document.getElementById("fDate").value.trim();
        const limit = document.getElementById("fLimit").value || 20;
        const qs = new URLSearchParams({ name, limit });
        if (date) qs.set("date", date);
        const el = document.getElementById("feat");
        try {
          const res = await api("/features?" + qs.toString());
          if (!res.date) {
            el.textContent = "暂无特征数据";
            return;
          }
          document.getElementById("fDate").value = String(res.date);
          if (!res.rows.length) {
            el.textContent = "该日无数据";
            return;
          }
          table(
            el,
            ["排名", "代码", "名称", "值"],
            res.rows.map((r, i) => [i + 1, r.code, r.etfName, fmtNum(r.value)]),
          );
        } catch (e) {
          el.textContent = "加载失败: " + e.message;
        }
      }
      document.getElementById("fBtn").onclick = loadFeatures;
      loadFeatures();
    </script>
  </body>
</html>
```

**`public/create.html`**：

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>新建回测</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <div class="toolbar">
      <a class="btn" href="index.html">← 返回回测列表</a>
    </div>
    <h1>新建回测</h1>
    <form id="f">
      <label
        >策略
        <select id="strategy"></select
      ></label>
      <div id="params"></div>
      <label>标的（逗号分隔）<input id="codes" value="510300" /></label>
      <label>开始日期（YYYYMMDD）<input id="start" value="20240101" /></label>
      <label>结束日期（YYYYMMDD）<input id="end" value="20241231" /></label>
      <label>初始资金 <input id="cash" type="number" value="1000000" /></label>
      <button class="btn" type="submit" id="submitBtn">执行回测</button>
    </form>
    <div id="msg"></div>
    <script src="app.js"></script>
    <script>
      let metas = [];
      async function boot() {
        try {
          metas = await api("/strategies");
          document.getElementById("strategy").innerHTML = metas
            .map((m) => `<option value="${m.key}">${m.name}</option>`)
            .join("");
          renderParams();
        } catch (e) {
          document.getElementById("msg").textContent =
            "加载策略失败: " + e.message;
        }
      }
      function renderParams() {
        const m = metas.find(
          (x) => x.key === document.getElementById("strategy").value,
        );
        document.getElementById("params").innerHTML = Object.entries(
          m?.paramsSchema ?? {},
        )
          .map(
            ([k, s]) =>
              `<label>${k} <input data-k="${k}" type="${s.type === "number" ? "number" : "text"}" value="${s.default ?? ""}" step="any"></label>`,
          )
          .join("");
      }
      document.getElementById("strategy").onchange = renderParams;
      document.getElementById("f").onsubmit = async (e) => {
        e.preventDefault();
        const params = {};
        document.querySelectorAll("#params input").forEach((i) => {
          params[i.dataset.k] = i.type === "number" ? Number(i.value) : i.value;
        });
        const msg = document.getElementById("msg");
        const btn = document.getElementById("submitBtn");
        msg.textContent = "提交中…";
        btn.disabled = true;
        try {
          const run = await api("/backtests", {
            method: "POST",
            body: JSON.stringify({
              strategyKey: document.getElementById("strategy").value,
              params,
              codes: document
                .getElementById("codes")
                .value.split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              startDate: Number(document.getElementById("start").value),
              endDate: Number(document.getElementById("end").value),
              initialCash: Number(document.getElementById("cash").value),
            }),
          });
          const es = new EventSource(`${BASE}/backtests/${run.id}/stream`);
          es.addEventListener("progress", (ev) => {
            const p = JSON.parse(ev.data);
            msg.textContent = `回测中 ${p.date} (${(p.pct * 100).toFixed(0)}%) 权益 ${p.equity.toFixed(2)}`;
          });
          es.addEventListener("done", () => {
            es.close();
            msg.textContent = "完成，跳转…";
            location.href = `detail.html?id=${run.id}`;
          });
          es.addEventListener("error", (ev) => {
            es.close();
            btn.disabled = false;
            try {
              msg.textContent = "失败: " + JSON.parse(ev.data).message;
            } catch {
              msg.textContent = "失败";
            }
          });
        } catch (err) {
          msg.textContent = "失败: " + err.message;
          btn.disabled = false;
        }
      };
      boot();
    </script>
  </body>
</html>
```

**`public/detail.html`**：

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>回测详情</title>
    <link rel="stylesheet" href="style.css" />
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  </head>
  <body>
    <div class="toolbar">
      <a class="btn" href="index.html">← 返回回测列表</a>
    </div>
    <h1>回测详情</h1>
    <div id="summary">加载中…</div>
    <h2>资金曲线</h2>
    <div id="chart" style="height:320px"></div>
    <h2>每日净值</h2>
    <div id="daily"></div>
    <h2>成交明细</h2>
    <div id="trades"></div>
    <h2>同策略历史回测</h2>
    <div id="sameStrategy"></div>
    <script src="app.js"></script>
    <script>
      (async () => {
        const id = new URLSearchParams(location.search).get("id");
        if (!id) {
          document.getElementById("summary").textContent = "缺少 id";
          return;
        }
        try {
          const run = await api(`/backtests/${id}`);
          const dailies = await api(`/backtests/${id}/daily`);
          const fills = await api(`/backtests/${id}/trades`);

          table(
            document.getElementById("summary"),
            [
              "策略",
              "标的",
              "区间",
              "状态",
              "总收益",
              "年化",
              "最大回撤",
              "夏普",
              "胜率",
              "笔数",
            ],
            [
              [
                run.strategyKey,
                JSON.parse(run.codes).join(","),
                `${fmtDate(run.startDate)}~${fmtDate(run.endDate)}`,
                run.status,
                `<span style="${colorPct(run.totalReturn)}">${fmtPct(run.totalReturn)}</span>`,
                fmtPct(run.annualReturn),
                fmtPct(run.maxDrawdown),
                fmtNum(run.sharpe, 2),
                fmtPct(run.winRate),
                run.tradeCount ?? "-",
              ],
            ],
          );
          if (run.status === "failed") {
            document
              .getElementById("summary")
              .insertAdjacentHTML(
                "beforeend",
                `<p style="color:#c00">${run.error ?? ""}</p>`,
              );
          }

          equityChart(document.getElementById("chart"), dailies);

          table(
            document.getElementById("daily"),
            ["日期", "权益", "现金", "持仓"],
            dailies.map((d) => [
              fmtDate(d.date),
              fmtNum(d.equity, 2),
              fmtNum(d.cash, 2),
              Object.entries(d.positions)
                .map(([k, v]) => `${k}:${v}`)
                .join(", ") || "-",
            ]),
          );

          table(
            document.getElementById("trades"),
            ["日期", "代码", "方向", "份额", "价格", "费用"],
            fills.map((f) => [
              fmtDate(f.date),
              f.code,
              f.side,
              f.shares,
              fmtNum(f.price, 3),
              fmtNum(f.fee, 2),
            ]),
          );

          try {
            const { rows } = await api(
              `/backtests?strategyKey=${encodeURIComponent(run.strategyKey)}&limit=10`,
            );
            const others = rows.filter((r) => r.id !== run.id);
            if (!others.length) {
              document.getElementById("sameStrategy").textContent =
                "暂无其他回测";
            } else
              table(
                document.getElementById("sameStrategy"),
                [
                  "创建时间",
                  "标的",
                  "区间",
                  "状态",
                  "总收益",
                  "年化",
                  "最大回撤",
                  "操作",
                ],
                others.map((r) => [
                  new Date(r.createdAt).toLocaleString(),
                  JSON.parse(r.codes).join(","),
                  `${fmtDate(r.startDate)}~${fmtDate(r.endDate)}`,
                  r.status,
                  `<span style="${colorPct(r.totalReturn)}">${fmtPct(r.totalReturn)}</span>`,
                  fmtPct(r.annualReturn),
                  fmtPct(r.maxDrawdown),
                  `<a href="detail.html?id=${r.id}">查看</a>`,
                ]),
              );
          } catch (e) {
            document.getElementById("sameStrategy").textContent =
              "加载失败: " + e.message;
          }
        } catch (e) {
          document.getElementById("summary").textContent =
            "加载失败: " + e.message;
        }
      })();
    </script>
  </body>
</html>
```

---

## 10. 错误处理与日志

- `runBacktest` try/catch：失败置 `failed`+`error`+`finishedAt`，emit `error`，**不抛**。
- 裁剪日志仅 `console.log`。
- 爬虫：`runTask` 单任务失败写 `failed`+`error` 并抛出；`runDailySync` 顺序执行，失败向上抛由路由 500。
- SSE：`done/error/abort` 均 `off` 清理；心跳 15s。
- `Fill` 逐笔 `strategy.onOrder?.(fill)`。

---

## 11. 验收清单

**爬虫/存储/特征**

1. `POST /api/sync` 首次：各 `Task` 写 `success` 且 `finishedAt` 非空。
2. **交易日历幂等**：
   - 周五 15:30 完成，周六 10:00 再调 → **跳过**（无新交易日收盘）。
   - 周五 14:00 完成，周五 15:30 再调 → **重跑**（上次未到收盘）。
   - 周五 15:30 完成，下周一 15:30 再调 → **重跑**（周一已收盘）。
   - 周一 15:30 完成，周二 10:00 再调 → **跳过**（周二盘中）。
3. 上次 `failed` 或 `finishedAt==null` 的任务必跑；`?force=1` 全部重跑。
4. **口径**：`Valuation.code`/`Distribution.code` 为 trackIndex；`Kline.code`/`Feature.code` 为 ETF code。
5. `Feature` 有 8 个单标的 + 3 个 `rank_*`；`rank_* ∈ [0,1]` 方向正确；`GET /api/features?name=ret_1m`（无 date）返回最新日 TopN，`etfName` 非空。

**回测（含 SSE）** 6. 迁移成功，四表创建；`Task` 新字段生效；既有表未变。7. `GET /api/strategies` 三条含 `paramsSchema`。8. `POST /api/backtests` 立即返回 `{id,status:'running'}`；SSE 收 `progress` 与 `done`；`done` 后 `GET /:id` `status='success'` 且绩效已落库。9. 断线重连：run 结束后再连 `stream` 立即收 `done`/`error`。10. `getValuation(etfCode,'PE',date)` 能取到值（验证 `code→trackIndex`）；`getFeature('rank_ret_1m')` 与 `/api/features` 同日同 code 一致。11. 断言：`getBars` 末条 `date<=ctx.date`；卖出 `<=positions-buyToday`；`Fill.shares%100===0`；`cash>=0`；未知策略→`failed`+`error` 且 SSE 收 `error`。

**前端** 12. `/create.html` 实时进度、`done` 跳详情；`/index.html` 双区块可用、区块 B 默认 `ret_1m` 最新 Top20；`/detail.html` 顶部返回列表、底部同策略历史可跳转；失败态显示 `error`；hono 托管与 `npx serve public` 均可用。

---

## 12. 明确不做

- 不实现涨跌停、限价单、订单簿、部分成交、订单延迟。
- 不引入外部队列/Redis（SSE 用进程内 `EventEmitter`）。
- 爬虫同步不 SSE、不并发（顺序执行）。
- 不实现分钟/Tick；`Distribution` 不参与回测。
- 不实现策略热加载/沙箱。
- 不改既有 `Etf`/`Kline`/`Valuation`/`Distribution` 表结构；`Task` 仅加 `finishedAt`/`error`。
- 不加 ETF 搜索接口、交易明细分页、特征名称枚举接口（前端硬编码下拉）。
- 特征不做严格增量（单标的全量重算、横截面最近 30 日全量重算，均先删后插）。
- 不做依赖未来数据的标签特征。
- 不对 `Valuation`/`Distribution` 做级联清理（按 trackIndex 共享）。
- **Distribution 不单独设周级 TTL**，统一按交易日收盘判断；如需周级，后续在 `runTask` 外层加自然日判断。

---

**本文件为单文件自包含终版，Codex 仅凭此文档即可实现全部后端 + 前端。** 运行环境（Bun/Node）导致 `serveStatic`/`cors`/`streamSSE` 签名差异时以适配器文档为准，行为契约不变。
