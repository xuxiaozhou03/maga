# ETF 数据结构设计文档

**文档名称：** DATA-MODEL.md  
**产品版本：** V0.6  
**文档状态：** 设计规范  
**适用对象：** Codex、开发人员

---

## 1. 设计目标

本系统采用 JSON 文件作为主要数据存储形式。

数据结构必须同时满足：

1. 支持 Node.js 计算任务使用。
2. 支持 React 前端直接读取。
3. 支持每日完整结果保存。
4. 支持历史日期查询。
5. 支持 ETF 全池排名。
6. 支持分类动态筛选和统计。
7. 支持历史数据修正。
8. 保证计算任务与前端使用统一的数据类型。

核心原则：

- 使用 TypeScript 定义所有核心数据结构。
- JSON 文件必须符合对应 TypeScript 类型。
- 同一个业务字段在不同模块中保持一致。
- 缺失值统一使用 null。
- 不允许用 0 代替缺失值。
- ETF 代码、指数代码统一使用字符串。
- 日期统一使用 YYYYMMDD 整数。
- 时间戳统一使用 ISO 8601 字符串。
- 每日分析结果是前端展示的主要数据来源。

---

## 2. 项目数据目录

建议采用以下目录：

```text
data/
├── config/
│   ├── categories.json
│   ├── etf-category-mapping.json
│   └── system-config.json
│
├── valuation/
│   ├── 000001.json
│   ├── 000016.json
│   └── 000300.json
│
├── daily/
│   ├── 20261113.json
│   ├── 20261114.json
│   └── 20261115.json
│
├── backups/
│   └── daily/
│
└── current.json
```

说明：

- `config/`：保存分类和系统配置。
- `valuation/`：保存指数估值历史。
- `daily/`：保存每日完整分析结果。
- `backups/`：保存历史修正前的结果备份。
- `current.json`：指向当前最新完整分析结果的数据副本。

原始 ETF 日 K 线不长期保存，不在上述目录中建立 K 线历史文件。

---

## 3. 公共基础类型

### 3.1 日期类型

```ts
type DateNumber = number; // YYYYMMDD
```

例如：

```ts
const date: DateNumber = 20261115;
```

日期必须符合真实日历日期。

### 3.2 时间类型

```ts
type ISODateTime = string;
```

统一采用 ISO 8601 格式，包含时区信息。

例如：

```text
2026-11-15T19:30:00+08:00
```

### 3.3 数值类型

所有计算结果使用 number。

缺失值使用：

```ts
number | null;
```

不得将 NaN、Infinity、-Infinity 写入 JSON。

计算结果无法生成有效数值时，必须转换为 null。

### 3.4 通用数据质量状态

```ts
type DataQualityStatus = "valid" | "missing" | "insufficient" | "invalid";
```

说明：

| 状态         | 含义             |
| ------------ | ---------------- |
| valid        | 数据有效         |
| missing      | 数据缺失         |
| insufficient | 有数据但样本不足 |
| invalid      | 数据异常或无效   |

---

## 4. ETF 基础数据结构

### 4.1 ETF

```ts
interface Etf {
  code: string;
  name: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string;
  premiumRate: number | null;
  amount: number | null;
}
```

字段说明：

| 字段          | 类型        | 说明                                 |
| ------------- | ----------- | ------------------------------------ |
| code          | string      | ETF 代码                             |
| name          | string      | ETF 名称                             |
| scale         | number/null | ETF 规模，单位元                     |
| trackingIndex | string/null | 跟踪指数名称                         |
| trackIndex    | string      | 跟踪指数代码                         |
| premiumRate   | number/null | 溢价率，单位按数据源验证后的统一口径 |
| amount        | number/null | 最新成交额，单位元                   |

ETF 代码和指数代码不能使用 number 类型。

### 4.2 研究池

```ts
interface ResearchPool {
  date: DateNumber;
  etfs: Etf[];
  summary: ResearchPoolSummary;
}
```

### 4.3 研究池筛选统计

```ts
interface ResearchPoolSummary {
  sourceCount: number;
  invalidFieldCount: number;
  excludedNameCount: number;
  excludedScaleCount: number;
  excludedAmountCount: number;
  duplicateIndexCount: number;
  finalCount: number;
}
```

### 4.4 研究池变化

```ts
interface ResearchPoolChange {
  added: string[];
  removed: string[];
  unchanged: string[];
  pendingCategory: string[];
}
```

---

## 5. ETF 分类数据结构

### 5.1 分类

```ts
interface EtfCategory {
  id: string;
  name: string;
  parentId: string | null;
}
```

### 5.2 分类体系配置

```ts
interface CategoryConfig {
  version: number;
  categories: EtfCategory[];
}
```

### 5.3 ETF 分类映射

```ts
interface EtfCategoryMapping {
  categoryId: string | null;
  status: "confirmed" | "pending";
}

interface EtfCategoryMappingConfig {
  version: number;
  mappings: Record<string, EtfCategoryMapping>;
}
```

映射关系以 ETF 代码作为 key。

每只 ETF 只能对应一个二级分类。

### 5.4 分类建议

```ts
interface EtfCategorySuggestion {
  etfCode: string;
  suggestedCategoryId: string | null;
  reason: string;
  confidence: number | null;
  status: "suggested" | "pending";
}
```

---

## 6. K 线数据结构

### 6.1 Kline

```ts
interface Kline {
  code: string;
  date: DateNumber;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
}
```

规则：

- 当前系统只使用前复权 K 线。
- 不建立独立 KlineRaw。
- 原始日 K 不长期保存。
- K 线按日期升序排列。
- 同一 ETF 同一日期只能有一条 K 线。

### 6.2 周 K 和月 K

```ts
interface PeriodKline {
  code: string;
  period: "week" | "month";
  date: DateNumber;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}
```

聚合规则：

- open：周期内第一条日 K 的开盘价。
- high：周期内最高价。
- low：周期内最低价。
- close：周期内最后一条日 K 的收盘价。
- volume：周期内成交量合计。
- amount：周期内成交额合计。
- date：该周期最后一个有效交易日。

周 K、月 K 根据截至分析日期已有的日 K 数据聚合。

---

## 7. 指数估值数据结构

### 7.1 估值类型

```ts
type ValuationType = "PE" | "PB" | "PS";
```

### 7.2 指数估值记录

```ts
interface IndexValuation {
  code: string;
  date: DateNumber;
  type: ValuationType;
  value: number | null;
  historicalPercentile: number | null;
}
```

说明：

- `code`：指数代码。
- `date`：估值实际日期。
- `type`：估值类型。
- `value`：估值数值。
- `historicalPercentile`：上游近五年历史百分位，统一保存为 0～1。

### 7.3 指数估值历史

```ts
interface IndexValuationHistory {
  code: string;
  updatedAt: ISODateTime;
  records: IndexValuation[];
}
```

唯一业务键：

```text
code + date + type
```

### 7.4 ETF 估值特征

```ts
interface EtfValuationFeature {
  indexCode: string;
  indexName: string | null;

  pe: number | null;
  pePercentile: number | null;
  peDate: DateNumber | null;
  peLagDays: number | null;

  pb: number | null;
  pbPercentile: number | null;
  pbDate: DateNumber | null;
  pbLagDays: number | null;

  ps: number | null;
  psPercentile: number | null;
  psDate: DateNumber | null;
  psLagDays: number | null;
}
```

PE、PB、PS 必须独立处理。

某个估值类型缺失时，不影响其他估值类型。

---

## 8. ETF 特征数据结构

ETF 特征是计算引擎输出的核心数据。

### 8.1 周期收益

```ts
interface PeriodReturn {
  d1: number | null;
  d5: number | null;
  d20: number | null;
  d60: number | null;
  d120: number | null;
  d250: number | null;
  ytd: number | null;
}
```

收益率统一使用小数形式：

- 1% 保存为 0.01。
- -2% 保存为 -0.02。

### 8.2 收益分布

```ts
interface ReturnDistribution {
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  positiveRatio: number | null;
  negativeRatio: number | null;
}
```

### 8.3 趋势特征

```ts
interface TrendFeatures {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma250: number | null;

  priceAboveMa20: boolean | null;
  priceAboveMa60: boolean | null;

  maAlignment: string | null;

  bollUpper: number | null;
  bollMiddle: number | null;
  bollLower: number | null;
  bollPosition: number | null;
}
```

`maAlignment` 的具体枚举和 BOLL 计算口径由计算引擎文档定义。

### 8.4 风险特征

```ts
interface RiskFeatures {
  volatility20: number | null;
  volatility60: number | null;
  volatility120: number | null;

  maxDrawdown20: number | null;
  maxDrawdown60: number | null;
  maxDrawdown120: number | null;
  maxDrawdown250: number | null;

  currentDrawdown: number | null;
  drawdownDuration: number | null;
}
```

### 8.5 成交活跃度

```ts
interface TradingActivityFeatures {
  amount: number | null;
  amountMa5: number | null;
  amountMa20: number | null;
  amountChange: number | null;
  amountRatio: number | null;
}
```

### 8.6 单只 ETF 完整特征

```ts
interface EtfFeatures {
  code: string;
  date: DateNumber;

  close: number | null;
  changePercent: number | null;

  returns: PeriodReturn;
  distribution: ReturnDistribution;
  trend: TrendFeatures;
  risk: RiskFeatures;
  activity: TradingActivityFeatures;
  valuation: EtfValuationFeature;
}
```

说明：

- `date` 是特征分析日期。
- `close` 是分析日期最新有效收盘价。
- `changePercent` 是分析日期当日涨跌幅。
- 其他字段按对应计算规则生成。
- 所有缺失或无法计算的数值必须使用 null。

---

## 9. ETF 排名数据结构

### 9.1 排名方向

```ts
type RankingDirection = "desc" | "asc";
```

- desc：数值越大，排名越靠前。
- asc：数值越小，排名越靠前。

风险指标需要根据指标定义确定排名方向。

### 9.2 单项排名

```ts
interface MetricRanking {
  rank: number | null;
  total: number;
  value: number | null;
  direction: RankingDirection;
}
```

### 9.3 ETF 排名

```ts
interface EtfRanking {
  code: string;

  returns: {
    d1: MetricRanking;
    d5: MetricRanking;
    d20: MetricRanking;
    d60: MetricRanking;
    d120: MetricRanking;
    d250: MetricRanking;
    ytd: MetricRanking;
  };

  trend: {
    score: MetricRanking;
  };

  risk: {
    score: MetricRanking;
  };

  activity: {
    score: MetricRanking;
  };

  valuation: {
    pe: MetricRanking;
    pb: MetricRanking;
    ps: MetricRanking;
  };

  composite: MetricRanking;
}
```

说明：

- 所有排名默认基于整个 ETF 研究池。
- 分类筛选不能修改这些排名。
- 无效样本的 rank 为 null。
- `total` 表示参与该指标排名的有效 ETF 数量。
- 综合排名计算规则必须由排名文档定义。

注意：这里的 trend、risk、activity score 是排名所使用的标准化分数，不是原始特征值。具体分数的定义和计算方法由 `RANKING-AND-ANALYSIS.md` 确定。

---

## 10. ETF 每日分析记录

### 10.1 ETF 分析记录

```ts
interface EtfDailyAnalysis {
  info: Etf;
  category: {
    categoryId: string | null;
    categoryName: string | null;
    parentCategoryId: string | null;
    parentCategoryName: string | null;
    status: "confirmed" | "pending";
  };
  features: EtfFeatures;
  ranking: EtfRanking;
}
```

每只 ETF 的分析记录包含：

- ETF 基础信息。
- 分类信息。
- 全部分析特征。
- 全池排名。

前端无需再从多个 JSON 文件拼接一只 ETF 的分析数据。

### 10.2 每日 ETF 集合

每日结果中的 ETF 集合采用数组：

```ts
etfs: EtfDailyAnalysis[];
```

按照研究池标准顺序保存。

---

## 11. 市场概览数据结构

### 11.1 市场数量

```ts
interface MarketCounts {
  total: number;
  valid: number;
  missingKline: number;
  missingValuation: number;
  up: number;
  down: number;
  flat: number;
}
```

### 11.2 市场收益

```ts
interface MarketReturns {
  average: PeriodReturn;
  median: PeriodReturn;
}
```

### 11.3 市场分布

```ts
interface DistributionBucket {
  label: string;
  count: number;
  ratio: number;
}

interface MarketDistribution {
  returns: DistributionBucket[];
  trend: DistributionBucket[];
  risk: DistributionBucket[];
  activity: DistributionBucket[];
}
```

### 11.4 市场估值

```ts
interface MarketValuation {
  pe: {
    average: number | null;
    median: number | null;
    percentileAverage: number | null;
    validCount: number;
  };

  pb: {
    average: number | null;
    median: number | null;
    percentileAverage: number | null;
    validCount: number;
  };

  ps: {
    average: number | null;
    median: number | null;
    percentileAverage: number | null;
    validCount: number;
  };
}
```

市场统计默认使用整个研究池。

所有统计必须记录有效样本数量。

无有效样本时，数值返回 null。

### 11.5 市场概览

```ts
interface MarketOverview {
  counts: MarketCounts;
  returns: MarketReturns;
  distributions: MarketDistribution;
  valuation: MarketValuation;
}
```

---

## 12. 分类表现数据结构

分类表现由前端从每日 ETF 数据动态计算。

不需要独立生成分类 JSON。

建议前端使用以下结构：

```ts
interface CategoryPerformance {
  categoryId: string;
  categoryName: string;
  parentCategoryId: string;
  parentCategoryName: string;

  etfCount: number;

  averageReturns: PeriodReturn;
  medianReturns: PeriodReturn;

  upCount: number;
  downCount: number;
  flatCount: number;

  etfs: EtfDailyAnalysis[];
}
```

要求：

- 分类 ETF 集合通过 `categoryId` 筛选。
- 分类收益通过当前分类内有效 ETF 计算。
- 分类内排序动态计算。
- 不覆盖原有全池排名。
- 待确认 ETF 不参与已确认分类的统计。
- 分类统计必须使用自身有效样本数量。

---

## 13. 每日分析结果 JSON

这是整个系统最重要的数据结构。

### 13.1 根结构

```ts
interface DailyAnalysisResult {
  version: string;

  date: DateNumber;

  generatedAt: ISODateTime;

  status: "complete" | "partial";

  summary: {
    etfCount: number;
    validCount: number;
    pendingCategoryCount: number;
  };

  market: MarketOverview;

  etfs: EtfDailyAnalysis[];

  task: {
    researchPool: ResearchPoolSummary;
    dataStatus: {
      etfBasic: DataQualityStatus;
      kline: DataQualityStatus;
      valuation: DataQualityStatus;
    };
    warnings: string[];
  };
}
```

### 13.2 字段说明

| 字段        | 说明                   |
| ----------- | ---------------------- |
| version     | 数据结构版本           |
| date        | 分析日期               |
| generatedAt | 结果生成时间           |
| status      | 完整或部分结果         |
| summary     | 全局数量统计           |
| market      | 市场概览               |
| etfs        | ETF 全量分析结果       |
| task        | 数据采集和任务质量状态 |

### 13.3 完整性规则

`status = complete`：

- 研究池生成成功。
- 所有必要数据处理完成。
- 所有 ETF 均有明确的分析处理结果。
- 计算与排名完成。
- 市场概览生成完成。

`status = partial`：

- 部分数据源采集失败。
- 部分 ETF 数据缺失或异常。
- 仍然生成了可用分析结果。
- 必须明确列出 warnings。

不允许任务失败时生成一个看似完整的空结果。

### 13.4 示例

```json
{
  "version": "1.0.0",
  "date": 20261113,
  "generatedAt": "2026-11-13T18:30:00+08:00",
  "status": "complete",
  "summary": {
    "etfCount": 23,
    "validCount": 23,
    "pendingCategoryCount": 0
  },
  "market": {
    "counts": {
      "total": 23,
      "valid": 23,
      "missingKline": 0,
      "missingValuation": 0,
      "up": 15,
      "down": 7,
      "flat": 1
    },
    "returns": {
      "average": {
        "d1": 0.002,
        "d5": 0.01,
        "d20": 0.025,
        "d60": 0.05,
        "d120": 0.08,
        "d250": 0.12,
        "ytd": 0.1
      },
      "median": {
        "d1": 0.001,
        "d5": 0.009,
        "d20": 0.022,
        "d60": 0.045,
        "d120": 0.075,
        "d250": 0.11,
        "ytd": 0.095
      }
    },
    "distributions": {
      "returns": [],
      "trend": [],
      "risk": [],
      "activity": []
    },
    "valuation": {
      "pe": {
        "average": null,
        "median": null,
        "percentileAverage": null,
        "validCount": 0
      },
      "pb": {
        "average": null,
        "median": null,
        "percentileAverage": null,
        "validCount": 0
      },
      "ps": {
        "average": null,
        "median": null,
        "percentileAverage": null,
        "validCount": 0
      }
    }
  },
  "etfs": [],
  "task": {
    "researchPool": {
      "sourceCount": 0,
      "invalidFieldCount": 0,
      "excludedNameCount": 0,
      "excludedScaleCount": 0,
      "excludedAmountCount": 0,
      "duplicateIndexCount": 0,
      "finalCount": 23
    },
    "dataStatus": {
      "etfBasic": "valid",
      "kline": "valid",
      "valuation": "valid"
    },
    "warnings": []
  }
}
```

以上示例仅用于说明结构，不代表真实行情或真实排名数据。

---

## 14. 历史结果与当前结果

### 14.1 每日历史结果

保存路径：

```text
data/daily/{YYYYMMDD}.json
```

例如：

```text
data/daily/20261113.json
```

要求：

- 每个分析日期保存独立文件。
- 文件包含完整每日分析结果。
- 不允许历史文件依赖 current.json 才能读取。
- 历史文件必须包含自身的版本和分析日期。

### 14.2 当前结果

保存路径：

```text
data/current.json
```

内容与最新完整每日结果保持一致。

要求：

- 当前结果用于前端快速读取。
- 只有成功生成有效结果后才更新。
- 历史结果写入成功后才能更新 current.json。
- 部分结果不得无条件覆盖已有完整结果。
- 更新采用安全写入方式，避免文件写入中断导致 JSON 损坏。

### 14.3 历史备份

历史修正前备份原始文件：

```text
data/backups/daily/{YYYYMMDD}/
```

备份文件至少保留：

- 原始每日结果 JSON。
- 备份时间。
- 修正原因。

---

## 15. JSON 文件读写规范

### 15.1 编码

统一使用 UTF-8。

### 15.2 格式

- 使用标准 JSON。
- 不允许注释。
- 不允许 NaN。
- 不允许 Infinity。
- 不允许 undefined。
- 不允许循环引用。

### 15.3 写入

采用安全写入：

1. 先生成完整 JSON。
2. 写入临时文件。
3. 验证临时文件能够正常解析。
4. 再替换目标文件。
5. 保留必要备份。

### 15.4 读取

读取每日结果时需要：

- 检查文件是否存在。
- 检查 JSON 是否合法。
- 检查 version。
- 检查 date。
- 检查必要字段。
- 发现结构不兼容时给出明确错误。

---

## 16. 数据结构版本管理

每日分析结果使用独立版本字段：

```ts
version: string;
```

版本规则：

- 结构字段发生不兼容变化时升级主版本。
- 新增兼容字段时升级次版本。
- 不影响结构的修正可以升级补丁版本。

历史 JSON 不允许因为代码升级而被静默修改结构。

如果需要升级历史数据，必须执行显式迁移，并保留原始备份。

---

## 17. 模块边界

数据模型模块只负责：

- 定义 TypeScript 类型。
- 定义 JSON 数据结构。
- 提供数据校验 Schema。
- 提供公共类型导出。
- 提供数据结构版本管理。
- 提供必要的序列化和反序列化工具。

不负责：

- 行情采集。
- 估值采集。
- ETF 筛选。
- 特征计算。
- 排名计算。
- 页面展示。

建议类型文件：

```text
src/shared/types/
├── common.ts
├── etf.ts
├── category.ts
├── kline.ts
├── valuation.ts
├── features.ts
├── ranking.ts
├── market.ts
└── daily-result.ts
```

计算任务和前端必须共用同一套数据类型。

---

## 18. 验收标准

### 18.1 类型定义

- 所有核心业务对象都有 TypeScript 类型。
- ETF 代码和指数代码统一使用 string。
- 日期统一使用 YYYYMMDD。
- 缺失值统一使用 null。
- 所有计算结果可以序列化为合法 JSON。

### 18.2 每日结果

- 能够生成完整每日分析结果。
- 能够生成部分结果并标记状态。
- 能够保存每日独立 JSON。
- 能够更新 current.json。
- 能够读取历史结果。
- 能够检查 JSON 结构是否合法。

### 18.3 数据一致性

- 计算任务与前端使用同一套类型。
- 分类筛选使用每日结果中的 ETF 数据。
- 全池排名保存在每日结果中。
- 分类表现不要求独立保存。
- 历史结果不依赖当前配置才能还原当日分类和排名。

### 18.4 数据安全

- 文件写入失败不能破坏已有文件。
- JSON 不允许包含非法数值。
- 历史修正必须有备份。
- 数据结构升级必须有明确版本。

---

## 19. 与其他文档的关系

| 文档                    | 关系                         |
| ----------------------- | ---------------------------- |
| PRODUCT.md              | 定义产品需要展示和分析的数据 |
| RESEARCH-POOL.md        | 定义研究池和分类结构         |
| DATA-SOURCE.md          | 定义上游数据采集和转换       |
| CALCULATION-ENGINE.md   | 定义特征计算结果             |
| RANKING-AND-ANALYSIS.md | 定义排名和市场统计结果       |
| ARCHITECTURE.md         | 定义数据模块的工程组织       |
| FRONTEND.md             | 定义前端如何消费每日结果     |
| DEVELOPMENT-PLAN.md     | 定义实现顺序                 |

**文档结束**
