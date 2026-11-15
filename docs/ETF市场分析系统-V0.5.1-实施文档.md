# ETF 市场分析系统 V0.5.1

## 产品与技术实施文档（v2 重写版 / Codex 开发基线）

| 项目         | 内容                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文档版本     | V0.5.1                                                                                                                                                                                                                                                                                         |
| 文档状态     | 可执行基线。除文中明确标注“待确认”的事项外，Codex 按本文实现。                                                                                                                                                                                                                                 |
| 文档性质     | 产品范围 + 数据契约 + 技术设计 + 开发实施规范 + 验收标准                                                                                                                                                                                                                                       |
| 目标读者     | Codex、开发人员                                                                                                                                                                                                                                                                                |
| 技术方向     | Node.js + TypeScript + JSON 文件存储 + Hono + 服务端渲染 HTML                                                                                                                                                                                                                                  |
| 代码基线     | `v2` 分支全新重写；`main` 只作为上游爬虫接口参考，不迁移其应用代码                                                                                                                                                                                                                             |
| 当前仓库事实 | `v2` 已完成阶段 0–10（脚手架、真实接口验证、数据源适配层、JSON 存储与配置加载、研究池选择、日 K 图表缓存、指数估值历史、ETF 特征引擎、全池排名、市场分析、规则发现、快照发布、任务审计、只读 API 与服务端渲染页面）；阶段 11 报告/E2E/运维尚未开始；`main` 有旧的 Prisma/SQLite 实现和爬虫代码 |
| 编写日期     | 2026-11-15                                                                                                                                                                                                                                                                                     |

---

# 零、本版修订说明

## 0.1 本版相对 V0.5 的主要变化

1. **明确 v2 全新重写。** 不迁移 `main` 的 Prisma、SQLite、回测、策略、旧路由、旧页面；只参考 `main` 中已经验证过的上游接口行为。
2. **明确四项存储决策。** D1–D4 全部采用推荐方案，并同步到目录结构和数据契约。
3. **明确上游代码格式。** ETF 代码和指数代码都带交易所/市场后缀，例如 `510300.SH`、`000300.SH`。文档示例不再使用裸 `510300`。
4. **明确计算公式。** 收益、年化、波动率、回撤、Sharpe、Sortino、Calmar、均线排列、BOLL、排名、空值处理的公式全部固定。
5. **明确排名矩阵。** 收益、趋势、风险、成交、估值分别定义排名代码、方向、样本和并列规则；综合排名在 V0.5.1 默认关闭。
6. **明确数据源契约。** 以 2026-11-15 的实测响应为准，记录 ETF 列表、日 K、指数估值的 URL、字段、单位、分页和异常行为。
7. **明确研究池生命周期。** 增加 `poolVersion`、`poolHash`、代表 ETF 切换、新增/移出 ETF 的处理规则。
8. **明确快照发布机制。** 增加原子写、文件锁、manifest、checksum、`inputFingerprint`、发布门槛、崩溃恢复和备份要求。
9. **明确图表数据来源。** 原始日 K 不作为权威长期存储，但增加一个有界、可重建的日 K 缓存，仅用于详情页图表。
10. **明确 AI 报告边界。** AI 报告独立存储、引用快照、失败不阻塞基础快照，且不得生成快照之外的事实。

## 0.2 本版基线决策

以下决策是 V0.5.1 的实施基线。Codex 不得自行改变。若用户后续否决，应发布新的文档版本，而不是在代码里临时改口径。

| 编号 | 决策                                                              | 状态   | 影响                                                  |
| ---- | ----------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| D-01 | `v2` 全新重写；`main` 只参考爬虫接口                              | 已采用 | 不复制旧应用、旧数据库、旧回测                        |
| D-02 | TypeScript + Node.js + JSON 文件；不使用 Prisma/SQLite/其他数据库 | 已采用 | 存储层全部自实现                                      |
| D-03 | 原始日 K 不作为权威长期存储；每次任务重新获取                     | 已采用 | 历史修正依赖上游可回取                                |
| D-04 | 保存每日每只 ETF 的完整核心特征                                   | 已采用 | `snapshots/{date}/{version}/etfs/{code}.json`         |
| D-05 | 保存历史统计到每日快照                                            | 已采用 | ETF 文件包含 `history` 段                             |
| D-06 | 快照保存当时的分类和分类映射版本                                  | 已采用 | ETF 文件包含 `category` 段                            |
| D-07 | AI 报告独立存储，失败不阻塞基础快照                               | 已采用 | `data/reports/`                                       |
| D-08 | 综合排名默认关闭                                                  | 已采用 | V0.5.1 不生成 `rankings/overall.json`                 |
| D-09 | 分类不是计算前置条件                                              | 已采用 | 首次运行不等待分类确认                                |
| D-10 | 估值类型只做 PE/PB/PS；旧实现的 `DID` 不进入 V0.5.1               | 已采用 | 旧数据如需保留，另做迁移，不混入新模型                |
| D-11 | `scale` 为 null/非法值时排除出研究池，并记录原因                  | 已采用 | 不把未知规模当作 0                                    |
| D-12 | 非交易日、且无新数据时不生成新分析日期快照                        | 已采用 | 只允许因修正生成新版本                                |
| D-13 | `analysisDate` 是分析对应的交易日，不是任务运行日                 | 已采用 | 周末运行仍指向最近交易日                              |
| D-14 | 估值百分位统一按上游 0–100 百分数处理，保存为 0–1                 | 已采用 | `73.76 → 0.7376`                                      |
| D-15 | 所有比例内部保存为小数；展示层再乘 100                            | 已采用 | 收益 `0.08` 表示 8%                                   |
| D-16 | 允许一个有界、可重建的日 K 缓存，仅用于图表                       | 已采用 | `data/cache/klines/`，不参与计算                      |
| D-17 | 分类映射人工确认放到最后收尾，不阻塞阶段 1–11                     | 已采用 | 先以 `pending` 计算和发布；最后批量确认并生成下一快照 |
| D-18 | `adjust=1` 即前复权；全系统统一按前复权计算                       | 已采用 | 不做二次复权/校准；上游复权误差按可接受误差处理       |

### 0.2.1 关于“原始日 K 不长期保存”的边界

本版把“原始日 K 不长期保存”解释为：

- 计算和快照不得依赖本地长期 K 线数据库。
- 每次分析任务重新从上游获取 K 线，在内存中计算。
- 详情页图表需要 OHLC 数据，因此允许 `data/cache/klines/{code}.json` 保存最近最多 1000 行，作为**派生缓存**。
- 缓存可以随时删除并重建；不进入快照 checksum，不作为历史修正的事实来源。
- 快照、排名、市场统计、规则发现都不能读取该缓存。

如果用户要求连图表缓存也不能落盘，则详情页只能改为按需请求上游；这会带来页面延迟和限流风险，需要另行确认。

## 0.3 本次实测结论

2026-11-15 对 `main` 中的上游接口做了只读探测，结果如下。实施时以这些行为为基线；如果上游变更，更新本节并增加测试夹具。

| 项目          | 实测结果                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ETF 列表      | `https://hongsehuojian.com/fundex-quote/allPage/findListByEtf` 可用；`pageSize=2000` 一次返回全部 1721 条                         |
| ETF 代码格式  | `securityCode` 形如 `510300.SH`，带交易所后缀；不带后缀请求日 K 会返回空                                                          |
| 指数代码格式  | `trackIndex` 形如 `000300.SH`、`399006.SZ`、`HSI.HI`、`Au9999.SGE`，带市场后缀                                                    |
| 规模单位      | `scale` 单位为元；示例 `188245848179.1`                                                                                           |
| 成交额单位    | ETF 列表 `amount` 为字符串，可能是科学计数法，例如 `3.4890357E9`，单位为元                                                        |
| 溢价率        | `premiumRate` 为字符串，示例 `-0.24`，按百分数解释                                                                                |
| 日 K          | `line/kline` 可用；`columns=week,tradeDate,open,high,low,close,volume,amount,change,changePercent`；`items` 为分号分隔的 CSV 文本 |
| 日 K 最新日期 | 2026-11-15 为周日，最新数据为 2026-11-13                                                                                          |
| 复权          | 请求参数 `adjust=1` 即前复权；全系统统一按前复权计算，不额外校准                                                                  |
| 估值          | `index/valuation` 可用；`historicalPercentile` 为 0–100，示例 `73.76`                                                             |
| 估值覆盖      | `000300.SH`、`000905.SH`、`399006.SZ`、`HSI.HI` 有数据；`NDX.GI`、`SPX.GI` 返回 `data: {}`（`items` 字段缺失）                    |
| PEG           | PE/PB/PS 响应都带 `peg` 字段；本版只在 PE 中保存，且默认不参与排名                                                                |
| 研究池规模    | 按第二章规则过滤后约 243 只 ETF、243 个唯一 `trackIndex`；118 个重复组，最大同指数 22 只                                          |

---

# 一、项目目标与范围

## 1.1 产品定位

构建一个以 ETF 研究池为核心的市场分析系统。系统采集 ETF 日 K 和指数估值，计算 ETF 的收益、趋势、风险、成交活跃度、估值和历史统计，形成：

1. ETF 全池排名。
2. 单只 ETF 历史表现分析。
3. ETF 市场整体分析。
4. 市场状态与异常现象识别。
5. 规则化研究发现。
6. AI 辅助研究报告。
7. 历史快照查询与对比。

系统是研究分析工具，不负责实盘交易，不生成自动交易指令，不构成投资建议。

## 1.2 核心研究问题

| 问题                           | 对应功能             |
| ------------------------------ | -------------------- |
| 当前 ETF 市场整体表现如何？    | 市场总览、市场分析   |
| 当前哪些 ETF 表现更好？        | ETF 全列表、全池排名 |
| 某只 ETF 自身历史表现如何？    | ETF 详情、历史统计   |
| 当前市场有哪些值得关注的现象？ | 规则发现、研究报告   |

## 1.3 V0.5.1 交付范围

- ETF 研究池自动获取、筛选、去重、排序。
- 六大类 ETF 分类体系和映射；离线人工确认，不做在线审批系统。
- 日 K 采集、校验、周 K/月 K 聚合。
- 指数 PE/PB/PS 估值历史采集和长期保存。
- ETF 收益、趋势、风险、成交、估值、历史统计。
- ETF 全池排名和筛选集排名。
- 市场整体统计和市场状态。
- 规则分析与研究发现。
- 每日分析快照、同日多版本、历史修正。
- 当前快照指针和快照索引。
- HTML 页面和 JSON API。
- 任务执行、状态、互斥、幂等和失败恢复。
- AI 研究报告（可选，失败不阻塞基础快照）。

## 1.4 非目标

V0.5.1 不实现：

- 实盘交易、券商账户、自动下单。
- 量化策略回测引擎；`main` 中的 backtest/strategies 不迁移。
- 数据库持久化、Prisma、SQLite、Redis、分布式缓存。
- 用户权限、多租户、在线分类审批。
- 完整技术指标研究平台；MACD/RSI/ATR 不作为核心预计算指标。
- 行业成分分布分析；`main` 的 `industryDistribution` 接口暂不使用。
- 对上游数据的商业使用合规判断；上线前需单独确认数据使用条款。

## 1.5 成功标准

1. 能从真实上游接口生成一份完整、可校验、可回溯的每日快照。
2. 任意已发布快照都能回答“当时的研究池、分类、特征、排名、市场统计和发现是什么”。
3. 历史修正生成新版本，不覆盖旧快照。
4. 缺失数据不被填 0，页面能显示数据质量和有效样本。
5. 同一份输入重复运行不会产生不一致结果；相同输入默认不重复发布版本。
6. 全流程不依赖数据库，数据目录可备份、可恢复、可重建。

---

# 二、研究池、分类与估值规则

## 2.1 ETF 原始数据契约

上游 ETF 列表接口返回的对象，经过本节规范化后进入研究池。

```ts
interface RawEtf {
  securityName: string;
  securityCode: string; // 例：510300.SH
  scale: number | null; // 单位：元
  trackingIndex: string | null; // 指数名称，例：沪深300
  trackIndex: string | null; // 指数代码，例：000300.SH
  premiumRate: string | number | null; // 百分数，例：-0.24
  amount: string | number | null; // 单位：元，可能是科学计数法
}
```

规范化后的研究池对象：

```ts
interface Etf {
  code: string; // 510300.SH
  name: string; // 沪深300ETF华泰柏瑞
  exchange: "SH" | "SZ" | "BJ" | "OTHER";
  scale: number; // 元
  trackingIndex: string | null; // 沪深300
  trackIndex: string; // 000300.SH
  premiumRate: number | null; // 小数，-0.24% → -0.0024
  amount: number | null; // 元
}
```

## 2.2 研究池筛选规则

按以下顺序执行，顺序不可交换：

1. `securityCode` 必须存在，trim 后非空。
2. `securityName` 必须存在，trim 后非空。
3. `trackIndex` 必须存在，trim 后非空。
4. `securityName` 包含“短融”或“债”的 ETF 排除。
5. `scale` 必须是有限数字且 `>= 300_000_000`；`null`、`NaN`、`Infinity`、负数一律排除并记录原因。
6. `amount` 为空（`null`、`undefined`、空字符串）时，**不按成交额规则排除**。
7. `amount` 有值时解析为数字：
   - 有限数字且 `< 15_000_000`：排除。
   - `"0"` 解析为 0，按规则排除。
   - 非数字或非有限值：视为缺失，跳过成交额规则，但记录 `amount_invalid` 警告。
8. 同一个 `trackIndex` 只保留规模最大的 ETF。
9. 最终按 `scale` 降序排列。

### 2.2.1 去重平局规则

同一 `trackIndex` 下：

1. 先比较 `scale`，大者保留。
2. `scale` 相同，比较 `amount`，大者保留；`amount` 为 null 视为最小。
3. 仍相同，保留 `code` 字典序最小者。
4. 被淘汰的 ETF 写入选择报告，便于审计。

### 2.2.2 单位与空值约束

- `scale`、`amount` 单位均为元；阈值分别是 3 亿元、1500 万元。
- `premiumRate` 上游为百分数，内部除以 100 保存为小数。
- 字符串 `"0"` 必须保留为数字 0，不能因为 truthiness 变成 null。
- 不允许把 `scale=null` 当作 0 后静默排除；必须记录 `scale_missing_or_invalid`。
- 不允许把 `amount` 缺失当作 0 后参与成交额规则。

### 2.2.3 选择报告

每次研究池刷新都写：

```text
data/system/selection/latest.json
```

结构：

```json
{
  "fetchedAt": "2026-11-15T08:00:00.000Z",
  "sourceTotal": 1721,
  "poolCount": 243,
  "reasons": {
    "missing_code": 0,
    "missing_name": 0,
    "missing_track_index": 28,
    "debt_name": 53,
    "scale_missing_or_invalid": 1,
    "scale_below_threshold": 905,
    "amount_invalid": 0,
    "amount_below_threshold": 133,
    "duplicate_track_index": 358
  },
  "afterBasicFilter": 601,
  "duplicateGroups": 118,
  "maxGroupSize": 22,
  "rejected": [
    {
      "code": "159973.SZ",
      "reason": "duplicate_track_index",
      "trackIndex": "000300.SH",
      "scale": 1000000000
    }
  ]
}
```

以上数值是 2026-11-15 实测结果，用于说明结构；实际运行时以当日结果为准。`rejected` 只保留必要字段，不保存完整原始响应。完整原始响应可临时写入 `data/temp/` 并在任务结束后删除。

## 2.3 ETF 分类体系

一级分类固定六类，二级分类及代码固定如下。`categories.json` 必须完整包含全部条目。

| 一级代码       | 一级名称     | 二级代码                   | 二级名称         |
| -------------- | ------------ | -------------------------- | ---------------- |
| `broad_market` | 宽基指数     | `cn_core`                  | A股核心宽基      |
| `broad_market` | 宽基指数     | `cn_small_mid`             | A股中小盘宽基    |
| `broad_market` | 宽基指数     | `us_broad`                 | 美股宽基         |
| `broad_market` | 宽基指数     | `hk_broad`                 | 港股宽基         |
| `industry`     | 行业指数     | `finance`                  | 金融             |
| `industry`     | 行业指数     | `healthcare`               | 医药医疗         |
| `industry`     | 行业指数     | `food_beverage`            | 食品饮料         |
| `industry`     | 行业指数     | `consumer_retail`          | 消费零售         |
| `industry`     | 行业指数     | `tech_semiconductor`       | 科技与半导体     |
| `industry`     | 行业指数     | `new_energy_power`         | 新能源与电力设备 |
| `industry`     | 行业指数     | `advanced_manufacturing`   | 高端制造         |
| `industry`     | 行业指数     | `defense`                  | 军工             |
| `industry`     | 行业指数     | `nonferrous_metals`        | 有色金属         |
| `industry`     | 行业指数     | `coal_energy`              | 煤炭与能源       |
| `industry`     | 行业指数     | `chemicals`                | 化工             |
| `industry`     | 行业指数     | `real_estate_construction` | 房地产与建筑     |
| `industry`     | 行业指数     | `transportation`           | 交通运输         |
| `industry`     | 行业指数     | `utilities_environment`    | 公用事业与环保   |
| `industry`     | 行业指数     | `agriculture`              | 农业             |
| `industry`     | 行业指数     | `other_industry`           | 其他行业         |
| `theme`        | 主题指数     | `ai_computing`             | 人工智能与算力   |
| `theme`        | 主题指数     | `robotics`                 | 机器人           |
| `theme`        | 主题指数     | `digital_economy`          | 数字经济         |
| `theme`        | 主题指数     | `cloud_big_data`           | 云计算与大数据   |
| `theme`        | 主题指数     | `internet`                 | 互联网           |
| `theme`        | 主题指数     | `low_altitude_economy`     | 低空经济         |
| `theme`        | 主题指数     | `innovative_drugs`         | 创新药           |
| `theme`        | 主题指数     | `soe_reform`               | 国企改革与央企   |
| `theme`        | 主题指数     | `belt_and_road`            | 一带一路         |
| `theme`        | 主题指数     | `other_theme`              | 其他主题         |
| `strategy`     | 策略指数     | `dividend`                 | 红利             |
| `strategy`     | 策略指数     | `low_volatility`           | 低波动           |
| `strategy`     | 策略指数     | `value`                    | 价值             |
| `strategy`     | 策略指数     | `growth`                   | 成长             |
| `strategy`     | 策略指数     | `quality`                  | 质量             |
| `strategy`     | 策略指数     | `equal_weight`             | 等权             |
| `strategy`     | 策略指数     | `multi_factor`             | 多因子           |
| `strategy`     | 策略指数     | `other_strategy`           | 其他策略         |
| `commodity`    | 商品指数     | `gold`                     | 黄金             |
| `commodity`    | 商品指数     | `silver`                   | 白银             |
| `commodity`    | 商品指数     | `nonferrous_commodity`     | 有色金属商品     |
| `commodity`    | 商品指数     | `energy_commodity`         | 能源商品         |
| `commodity`    | 商品指数     | `agricultural_commodity`   | 农产品           |
| `commodity`    | 商品指数     | `other_commodity`          | 其他商品         |
| `other_asset`  | 其他资产类别 | `reits`                    | REITs            |
| `other_asset`  | 其他资产类别 | `money_market_cash`        | 货币及现金管理   |
| `other_asset`  | 其他资产类别 | `other_comprehensive`      | 其他综合资产     |

### 2.3.1 分类规则

1. 每个池内 ETF 必须有一条分类映射记录，状态为 `pending` 或 `confirmed`。
2. `confirmed` 必须有且只有一个合法的一级分类和一个合法的二级分类。
3. `pending` 可以有建议分类，也可以为空；为空时页面显示“待确认”，不得猜测。
4. 分类不是计算前置条件；`pending` 的 ETF 仍进入研究池、特征计算和全池排名。
5. `pending` 不计入正式分类统计；页面显示“未分类/待确认”。
6. 分类变化不触发 ETF 特征重算、全池排名重算或市场整体统计重算。
7. 历史快照保留创建时的分类；分类映射变化只影响之后生成的快照。
8. 分类建议必须包含依据、置信度和来源；不得把模型猜测直接写成 `confirmed`。
9. 不开发在线审批页面；提供 CLI 和 JSON 文件进行人工确认。
10. 分类映射的人工确认排在阶段 12，作为最后收尾动作；阶段 1–11 不得因为 `pending` 数量多而停止开发或发布测试快照。

### 2.3.2 分类确认流程

```bash
pnpm categories:suggest          # 生成 data/config/category-suggestions.json
pnpm categories:confirm --code 510300.SH --primary broad_market --secondary cn_core
pnpm categories:validate         # confirmed 必须恰好一个二级分类；pending 允许为空
```

`etf-category-mapping.json` 结构：

```json
{
  "version": 1,
  "updatedAt": "2026-11-15T08:00:00.000Z",
  "items": [
    {
      "etfCode": "510300.SH",
      "primaryCode": "broad_market",
      "secondaryCode": "cn_core",
      "status": "confirmed",
      "reason": "跟踪沪深300指数，A股核心宽基",
      "confidence": 1,
      "updatedAt": "2026-11-15T08:00:00.000Z"
    }
  ]
}
```

约束：

- 池内每只 ETF 都必须出现在 `items` 中；缺失条目在 `categories:validate` 时失败。
- `confirmed` 的 `primaryCode/secondaryCode` 必须能在 `categories.json` 中找到。
- `pending` 允许 `primaryCode/secondaryCode` 为 null；如有建议值，必须标记 `confidence < 1`。
- 同一 ETF 只能有一条记录。

### 2.3.3 分类建议最小实现

分类建议是人工确认的辅助，不是自动分类器。V0.5.1 采用可解释的规则建议：

1. 读取 `data/config/category-overrides.json`（人工维护的精确映射）；命中则 `confidence=1.0`。
2. 按 ETF 名称、`trackingIndex`、`securityFullName` 做关键词匹配；命中则 `confidence=0.7`。
3. 按指数代码前缀和已知指数清单做启发式匹配；命中则 `confidence=0.5`。
4. 以上都不命中，输出 `pending`，分类为空，`confidence=0`。
5. 关键词规则必须放在配置文件或独立规则表中，不得散落在代码里。
6. 人工维护的 `data/config/category-overrides.json` 示例：

```json
{
  "schemaVersion": 1,
  "items": [
    {
      "etfCode": "510300.SH",
      "primaryCode": "broad_market",
      "secondaryCode": "cn_core",
      "reason": "沪深300核心宽基"
    }
  ]
}
```

7. 建议结果写入 `data/config/category-suggestions.json`：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-15T08:00:00.000Z",
  "items": [
    {
      "etfCode": "510300.SH",
      "primaryCode": "broad_market",
      "secondaryCode": "cn_core",
      "confidence": 1,
      "reason": "overrides: 沪深300核心宽基",
      "source": "override"
    }
  ]
}
```

8. 建议文件不等于正式映射；必须经 `pnpm categories:confirm` 或人工编辑 `etf-category-mapping.json` 后才成为 `confirmed`。
9. AI 可以生成建议文本，但不得直接写 `confirmed`；AI 建议也必须经过同一确认流程。

### 2.3.4 实施与确认顺序

1. 阶段 1–11 只实现分类映射读取、建议生成、`pending` 展示和快照留存，不等待人工确认。
2. 首次完整快照可以在全部分类为 `pending` 的情况下发布，排名、特征和市场统计照常计算。
3. 阶段 11 完成并通过 E2E 后，执行阶段 12：生成分类建议、人工批量确认、运行 `pnpm categories:validate`。
4. 分类确认完成后不需要重算历史特征或历史排名；下一次每日任务会在新快照中写入确认后的分类。
5. 若用户希望立即看到确认后的分类视图，可运行一次新的快照任务；不得原地修改已发布快照。

## 2.4 指数估值规则

估值对象是指数，不是 ETF。ETF 通过 `trackIndex` 关联估值；同一指数的 ETF 共享估值。

### 2.4.1 采集范围

1. 从研究池提取唯一 `trackIndex`，保留完整后缀，例如 `000300.SH`。
2. 每个指数分别采集 `PE`、`PB`、`PS`。
3. 每次估值任务重新获取近五年数据。
4. 单个指数、单个类型失败不影响其他指数、其他类型。
5. 上游返回缺失或空 `items` 视为“该指数该类型无数据”，不是系统错误；记录 `unsupported`。
6. 海外指数、商品指数可能没有估值；市场估值统计按有效样本计算，不要求全覆盖。

### 2.4.2 保存结构

```json
{
  "schemaVersion": 1,
  "code": "000300.SH",
  "updatedAt": "2026-11-15T08:00:00.000Z",
  "items": [
    {
      "date": "2026-11-13",
      "type": "PE",
      "value": 13.4199,
      "historicalPercentile": 0.7376,
      "peg": -40.9339,
      "pegUsable": false,
      "source": "hongsehuojian",
      "collectedAt": "2026-11-15T08:00:00.000Z"
    }
  ]
}
```

唯一键：`code + date + type`。

### 2.4.3 估值规则

1. `historicalPercentile` 按上游百分数处理：`73.76 / 100 = 0.7376`。不使用“大于 1 才除 100”的猜测逻辑。
2. 百分位必须在 `[0, 100]`；超出范围视为无效，保存 null 并记录警告。
3. 缺失值用 `null`，不填 0。
4. `peg` 只从 PE 响应保存；PB/PS 响应中的 `peg` 忽略，避免把同一个 PE PEG 复制到三种类型。
5. `pegUsable = peg != null && peg > 0`；非正 PEG 保存但不参与任何排名。
6. 估值日期使用上游 `tradeDate`，转换为 `YYYY-MM-DD`。
7. 估值日期可以与 K 线日期不同；估值历史文件保存实际日期；`lagDays`（自然日）和 `lagTradingDays`（交易日）依赖 `analysisDate`，在特征计算和快照阶段生成，不回填估值历史文件。
8. 不允许使用 `analysisDate` 之后的估值。
9. 上游某次缺少数据，不得删除已有历史记录。
10. 按唯一键 Upsert；保留本次未返回的历史记录。
11. PE/PB/PS 独立更新、独立排名。
12. `valuePercent`（ETF 列表字段）只用于交叉校验，不作为估值事实来源。

## 2.5 日 K 规则

### 2.5.1 上游格式

请求：

```text
GET /fundex-quote/line/kline
  ?securityCode=510300.SH
  &count=-1000
  &begin=20261115
  &period=day
  &adjust=1
  &ts=<毫秒时间戳>
```

响应：

```json
{
  "code": "200",
  "msg": "成功.",
  "data": {
    "columns": "week,tradeDate,open,high,low,close,volume,amount,change,changePercent",
    "items": "星期五,2026-11-13,4.124,4.127,4.076,4.083,8510502.50,3489035700.000,-0.062,-1.50"
  }
}
```

解析规则：

1. `columns.split(",")` 得到列顺序。
2. `items.split(";")` 得到行；空字符串表示无数据。
3. 每行 `split(",")` 后按列映射。
4. `week` 列忽略。
5. `tradeDate` 从 `YYYY-MM-DD` 转为内部 `YYYY-MM-DD` 字符串。
6. 数值字段用 `Number()` 解析；任何 `NaN`/`Infinity` 都视为该行无效。
7. 行按日期升序排序；重复日期保留最后一条并记录警告。
8. `changePercent` 上游为百分数，内部除以 100 保存为小数。
9. `volume` 单位为股/份；`amount` 单位为元；两者不参与单位换算。

### 2.5.2 规范化 K 线类型

```ts
interface Kline {
  code: string; // 510300.SH
  date: string; // 2026-11-13
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
  change: number;
  changePercent: number; // 小数，-1.50% → -0.015
}
```

### 2.5.3 K 线规则

- 当前使用 `adjust=1`，按前复权处理；该口径已由用户确认，全系统统一使用，不做二次复权或校准。
- 原始日 K 不写入权威长期存储；任务内存中使用。
- 每次任务最多获取最近 1000 行（约 4 年），用于 2 年历史统计和 250 日窗口。
- 日 K 为空：该 ETF 当日标记无效，不填 0。
- 日 K 重复：按 `code + date` 去重，保留最后一条，记录警告。
- 日 K 乱序：排序后计算。
- 日 K 价格 `<= 0`、`high < low`、`volume < 0`、`amount < 0`：该行无效，记录原因。
- 周 K/月 K 由日 K 聚合，仅用于图表；不参与权威特征计算。
- 停牌或缺失交易日：不向前填充；该 ETF 当日 `latestKlineDate` 可能早于 `analysisDate`，相关指标标记无效。

### 2.5.4 有界图表缓存

路径：`data/cache/klines/{code}.json`

```json
{
  "code": "510300.SH",
  "updatedAt": "2026-11-15T08:00:00.000Z",
  "source": "hongsehuojian",
  "adjust": 1,
  "rows": [
    {
      "date": "2026-11-13",
      "open": 4.124,
      "high": 4.127,
      "low": 4.076,
      "close": 4.083,
      "volume": 8510502.5,
      "amount": 3489035700
    }
  ]
}
```

约束：

- 最多 1000 行；写入时截断最旧数据。
- 写入时拒绝晚于 `analysisDate` 的日 K；图表读取时只返回 `date <= analysisDate` 的行。
- 周 K 按自然周（周一至周日）聚合，日期取该周最后一个交易日；月 K 同理按月聚合。
- 聚合时 `amount` 只要组内任一日为 `null`，聚合结果即为 `null`；不以 0 替代缺失值。
- 只服务详情页图表；不得被特征、排名、市场统计、规则发现读取。
- 可随时删除；缺失时按需从上游获取单只 ETF 并重建。
- 不进入快照 `manifest.files`，不参与 checksum。
- API 读取缓存；缓存缺失或超过 1 个交易日未更新时，服务端按单只 ETF 补拉，带锁和限流。

---

# 三、上游数据源契约

## 3.1 通用 HTTP 规则

基础地址：

```text
https://hongsehuojian.com
```

请求头基线（与 `main` 爬虫保持一致；不要随意删减，除非实测证明可省略）：

```text
accept: application/json, text/plain, */*
accept-language: zh-CN,zh;q=0.9,en;q=0.8
cache-control: no-cache
pragma: no-cache
pro: RedRocket-PC
```

规则：

1. 所有 GET 请求带 `ts=<Date.now()>`，避免缓存。
2. 超时 15 秒；单次请求最多重试 3 次。
3. 重试间隔 1s、2s、4s，加 0–300ms 随机抖动。
4. `408`、`429`、`5xx`、网络错误可重试；其他 `4xx` 不重试。
5. 默认并发 2；同一主机请求最小间隔 300ms。可在 `source-config.json` 调整。
6. 响应必须先校验 HTTP 状态，再校验业务 `code === "200"`。
7. 业务成功但 `data` 为 `{}`、`items` 缺失或 `items` 为空数组，按“无数据”处理，不当作 HTTP 失败。
8. 每次请求记录：URL（去掉 `ts`）、attempt、durationMs、httpStatus、businessCode、itemCount、errorCode。
9. 不在日志中输出完整响应体；只输出摘要和错误片段。
10. 不绕过登录、验证码或访问控制；若上游要求认证，使用环境变量，不写入仓库。

## 3.2 ETF 列表接口

### 3.2.1 请求

```text
GET /fundex-quote/allPage/findListByEtf
  ?classA=
  &classB=
  &orderBy=l.scale
  &order=desc
  &searchValue=
  &isSelected=
  &pageNo=1
  &pageSize=2000
  &position=
```

分页：

1. 首次请求 `pageNo=1`，`pageSize=2000`。
2. 读取 `data.total`；若 `data.data.length < total`，继续请求 `pageNo + 1`。
3. 最多 10 页；超过则报 `ETF_PAGINATION_GUARD`。
4. 不信任响应里的 `data.pageSize`（实测返回 0）。
5. 若多页结果出现重复 `securityCode`，保留第一条并记录警告。
6. 若 `total` 与最终条数差异超过 10%，记录警告，但不自动判定失败。

### 3.2.2 响应

```ts
interface RawEtfListResponse {
  code: string;
  msg: string;
  data: {
    total: number;
    pageNo: number;
    pageSize: number;
    data: RawEtf[];
  };
}
```

`RawEtf` 字段很多，只声明必需字段，其余忽略：

```ts
interface RawEtf {
  securityName?: string | null;
  securityCode?: string | null;
  securityFullName?: string | null;
  scale?: number | string | null;
  trackingIndex?: string | null;
  trackIndex?: string | null;
  premiumRate?: string | number | null;
  amount?: string | number | null;
  price?: string | null;
  changePercent?: string | null;
  valuePercent?: number | null;
  tradeDate?: number | null;
}
```

`RawEtf` 保留上游原貌。`securityCode`、`securityName`、`trackIndex` 缺失时不得让整批列表解析失败；这些行进入研究池选择器后分别记录 `missing_code`、`missing_name`、`missing_track_index`，便于审计和统计。

实测样例：

```json
{
  "securityName": "沪深300ETF华泰柏瑞",
  "securityCode": "510300.SH",
  "scale": 188245848179.1,
  "trackingIndex": "沪深300",
  "trackIndex": "000300.SH",
  "premiumRate": "-0.24",
  "amount": "3.4890357E9",
  "valuePercent": 73.76
}
```

### 3.2.3 规范化

1. `code = securityCode.trim()`，不删除后缀。
2. `exchange` 从后缀解析：`.SH → SH`、`.SZ → SZ`、`.BJ → BJ`，其他为 `OTHER`。
3. `name = securityName.trim()`。
4. `scale = Number(scale)`；非有限值 → null。
5. `trackingIndex = trimOrNull(trackingIndex)`。
6. `trackIndex = trackIndex.trim()`；空字符串视为缺失。
7. `premiumRate = parseNumberOrNull(premiumRate)`；按 `source-config.premiumRateScale` 归一（`percent` 时 `/100`）；`"0"` → `0`。
8. `amount = parseNumberOrNull(amount)`；科学计数法由 `Number()` 解析。
9. 不在规范化阶段做筛选；筛选在 `EtfPoolSelector` 中完成，便于单测和审计。

## 3.3 日 K 接口

### 3.3.1 请求

```text
GET /fundex-quote/line/kline
  ?securityCode=510300.SH
  &count=-1000
  &begin=20261115
  &period=day
  &adjust=1
  &ts=<毫秒时间戳>
```

参数说明：

| 参数           | 值          | 说明                               |
| -------------- | ----------- | ---------------------------------- |
| `securityCode` | `510300.SH` | 必须带后缀；裸代码实测返回空       |
| `count`        | `-1000`     | 最多返回 1000 行                   |
| `begin`        | `YYYYMMDD`  | 截止日期；实测返回该日期之前的数据 |
| `period`       | `day`       | 日线                               |
| `adjust`       | `1`         | 前复权；已确认口径，全系统统一使用 |
| `ts`           | 毫秒时间戳  | 缓存穿透                           |

分页：

1. 默认一次请求 1000 行，覆盖约 4 年，满足 2 年统计和 250 日窗口。
2. 若返回行数等于 1000，且最早日期仍晚于所需窗口，使用 `begin=<最早日期>` 再取一页；最多 2 页。
3. 合并时按 `date` 去重，保留后返回页中的重复日期需要人工确认；默认保留已有行并记录警告。
4. 若上游返回不足 1000 行，使用全部可用数据；不足指标窗口时对应指标为 null。

### 3.3.2 响应

```ts
interface RawKlineResponse {
  code: string;
  msg: string;
  data: {
    columns: string;
    items: string;
  };
}
```

实测：

```json
{
  "columns": "week,tradeDate,open,high,low,close,volume,amount,change,changePercent",
  "items": "星期五,2026-11-13,4.124,4.127,4.076,4.083,8510502.50,3489035700.000,-0.062,-1.50"
}
```

解析约束：

- `items === ""` → 空数组，不报错。
- 每行字段数必须等于 `columns` 数量；否则该行无效并记录 `KLINE_COLUMN_MISMATCH`。
- `week` 列忽略；`tradeDate` 支持 `YYYY-MM-DD`，统一转 `YYYY-MM-DD`。
- 数值字段必须有限；无效行不进入计算。
- `changePercent` 上游为百分数，按 `source-config.changePercentScale` 归一（`percent` 时 `/100`）。
- `amount` 可能为 0 或空；为空时用 null，不填 0。
- 行按日期升序排列；重复日期保留最后一条，记录 `KLINE_DUPLICATE_DATE`。

### 3.3.3 复权口径

`adjust=1` 已确认为前复权，全系统统一按前复权计算：

1. 不实现前复权、后复权或不复权的切换参数。
2. 不对上游价格做二次复权或校准系数修正。
3. 上游前复权价格与第三方数据之间的少量误差按可接受误差处理；不得因此引入临时补丁。
4. 公式与黄金样本测试仍按本系统自身定义的计算精度执行，不因上游数据误差而放宽核心计算断言。

## 3.4 指数估值接口

### 3.4.1 请求

```text
GET /fundex-quote/index/valuation
  ?securityCode=000300.SH
  &valuationType=PE
  &timeInterval=last_5_years
  &ts=<毫秒时间戳>
```

`valuationType` 只允许 `PE`、`PB`、`PS`。`DID` 不进入 V0.5.1。

### 3.4.2 响应

```ts
interface RawValuationResponse {
  code: string;
  msg: string;
  data: {
    items?: Array<{
      tradeDate: string; // "20261113"
      valuationValue: number;
      historicalPercentile: number; // 0–100
      peg: number | null;
    }>;
    // 其他字段忽略：valuation、percentile、valuationTag 等
  };
}
```

实测样例：

```json
{
  "tradeDate": "20261113",
  "valuationValue": 13.4199,
  "historicalPercentile": 73.76,
  "peg": -40.9339
}
```

行为：

| 场景                                            | 行为                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| `code === "200"` 且 items 非空                  | 正常入库                                       |
| `code === "200"` 且 `data={}`、items 缺失或为空 | 该指数该类型无数据；记录 `unsupported`，不重试 |
| `code !== "200"`                                | 该类型失败；记录错误；其他类型继续             |
| `historicalPercentile` 不在 0–100               | 该条百分位保存 null，记录警告                  |
| `valuationValue` 非有限数                       | 该条无效，跳过                                 |
| `peg` 为 null/负数                              | 保存；`pegUsable=false`；不参与排名            |

### 3.4.3 覆盖与性能

- 唯一指数约 243 个；每指数 3 个类型，约 729 次请求/日。
- 部分海外/商品指数无估值；不要把“无估值”当作系统失败。
- 估值历史每类型约 1212 条（近五年）；三个类型约 3636 条/指数。
- 估值文件预计 0.5–2MB/指数；243 个指数合计约 150–300MB。
- 每日全量重取近五年是既定决策；如果实测耗时超过 20 分钟，再讨论“每日增量 + 每周全量校正”，但不得由 Codex 自行改变。

## 3.5 行业分布接口（V0.5.1 不使用）

`main` 中还存在：

```text
GET /fundex-quote/security/component/industryDistribution
  ?securityCode=000300.SH
  &industryLevel=3
```

它只返回最新行业分布，不提供历史。V0.5.1 不用于分类、计算或快照。未来如用于分类辅助，必须单独定义数据契约，且不能替代人工确认。

## 3.6 数据源适配器接口

```ts
interface EtfSource {
  fetchAll(): Promise<RawEtf[]>;
}

interface KlineSource {
  fetchDaily(code: string, endDate: DateString, limit: number): Promise<Kline[]>;
}

interface ValuationSource {
  fetch(indexCode: string, type: ValuationType): Promise<RawValuation[]>;
}
```

边界：

- `sources/` 只负责 HTTP、重试、响应解析和基础校验，不写文件、不做筛选、不做计算。
- `collectors/` 负责调用 source、规范化、筛选、去重、生成选择报告。
- `calculations/` 只接收已规范化的 `Kline[]`、`IndexValuation[]` 和配置，纯函数，不发请求、不写文件。
- 测试必须能注入 mock source，不依赖真实网络。

错误类型：

```ts
type SourceErrorCode =
  | "SOURCE_HTTP"
  | "SOURCE_BUSINESS"
  | "SOURCE_PAYLOAD"
  | "SOURCE_UNSUPPORTED"
  | "SOURCE_TIMEOUT"
  | "SOURCE_RATE_LIMIT";
```

## 3.7 字段字典与单位

| 字段                    | 来源       | 类型          | 单位/范围        | 空值规则           | 内部规范化      |
| ----------------------- | ---------- | ------------- | ---------------- | ------------------ | --------------- |
| `securityCode`          | ETF 列表   | string        | `510300.SH`      | 必须存在           | trim，保留后缀  |
| `securityName`          | ETF 列表   | string        | 中文名称         | 必须存在           | trim            |
| `scale`                 | ETF 列表   | number        | 元               | null 排除          | 不换算          |
| `amount`                | ETF 列表   | string/number | 元               | 缺失跳过成交额规则 | `Number()`      |
| `premiumRate`           | ETF 列表   | string/number | 百分数           | null 保留          | `/100`          |
| `trackingIndex`         | ETF 列表   | string        | 指数名称         | null 允许          | trim            |
| `trackIndex`            | ETF 列表   | string        | 指数代码，带后缀 | 必须存在           | trim            |
| `tradeDate`（K 线）     | 日 K       | string        | `YYYY-MM-DD`     | 行无效             | 转 `YYYY-MM-DD` |
| `open/high/low/close`   | 日 K       | number        | 元               | 行无效             | 不换算          |
| `volume`                | 日 K       | number        | 股/份            | 行无效             | 不换算          |
| `amount`（K 线）        | 日 K       | number        | 元               | null               | 不换算          |
| `change`                | 日 K       | number        | 元               | 行无效             | 不换算          |
| `changePercent`         | 日 K       | number        | 百分数           | 行无效             | `/100`          |
| `tradeDate`（估值）     | 估值       | string        | `YYYYMMDD`       | 行无效             | 转 `YYYY-MM-DD` |
| `valuationValue`        | 估值       | number        | 倍数             | 无效跳过           | 不换算          |
| `historicalPercentile`  | 估值       | number        | 0–100            | null 允许          | `/100`          |
| `peg`                   | 估值（PE） | number        | 倍数             | null 允许          | 不换算          |
| 所有收益/波动/回撤/偏离 | 计算       | number        | 小数             | 样本不足 null      | 不四舍五入      |
| 所有展示百分比          | UI         | string        | `%`              | null 显示 `—`      | 值 × 100        |

## 3.8 时间语义与交易日历

### 3.8.1 时区与日期

- 所有业务时间使用 `Asia/Shanghai`。
- 内部日期统一 `YYYY-MM-DD` 字符串；排序和比较使用 ISO 字符串或 `dayjs`。
- 文件中的 `createdAt`、`updatedAt`、`publishedAt` 使用 UTC ISO 字符串，带 `Z`。
- 上游 `YYYYMMDD`、`YYYY-MM-DD` 只在解析边界转换。

### 3.8.2 交易日

- 交易日历通过 `TradingCalendar` 接口注入；初始实现可使用 `@yiliang114/trading-day`。
- 必须验证 2026 年节假日、调休和周末；验证结果写入 `docs/data-verification.md`。
- A 股收市时间按 15:00；数据可用缓冲到 15:30。

### 3.8.3 `analysisDate`

```text
expectedTradingDate(now) =
  now < 当日 15:30  ? 上一个交易日
                    : 当日（若为交易日）或上一个交易日
```

- `analysisDate` 是分析对应的交易日，不是任务运行日。
- 周末/节假日运行，`analysisDate` 仍为最近交易日。
- 若无新交易日、且没有 `--force` 或修正请求，任务状态为 `skipped`，不生成新快照。
- 同一 `analysisDate` 只允许因修正或强制重算生成新版本。

### 3.8.4 数据截止

- K 线只使用 `date <= analysisDate` 的行。
- 估值只使用 `date <= analysisDate` 的行。
- `latestKlineDate` 是 ETF 在本次任务中最后一条有效 K 线日期。
- 日报任务中，只有 `latestKlineDate === analysisDate` 的 ETF 才视为当日有效样本。
- 停牌 ETF 不向前填充；当日指标为 null，并在数据质量中记录。

### 3.8.5 滞后天数

- `lagDays`：估值日期到 `analysisDate` 的自然日差。
- `lagTradingDays`：估值日期之后、`analysisDate` 之前的交易日数量，含 `analysisDate`、不含估值日。
- 同一天为 0。
- 估值新鲜度：`lagDays <= 7` 为 fresh；`8–30` 为 stale；`> 30` 为 too_stale。阈值在配置中。

## 3.9 数据源验证清单

阶段 0 必须完成并记录：

| 验证项             | 方法                             | 通过标准                            |
| ------------------ | -------------------------------- | ----------------------------------- |
| ETF 列表分页       | 与 `total` 对比                  | 所有条目无重复、无缺失              |
| 代码后缀           | 分别请求 `510300` 与 `510300.SH` | 只有带后缀返回数据                  |
| `scale` 单位       | 与公开规模对比                   | 元                                  |
| `amount` 单位      | 与公开成交额对比                 | 元                                  |
| `premiumRate` 单位 | 与公开溢价率对比                 | 百分数                              |
| 估值百分位         | 与 ETF 列表 `valuePercent` 对比  | 同一指数同一日期一致                |
| 估值覆盖           | 对 10 个代表性指数请求           | 记录有/无数据清单                   |
| K 线复权           | 用户确认                         | `adjust=1` 即前复权；全系统统一使用 |
| 交易日历           | 2026 节假日表                    | 与交易所一致                        |
| 最新数据时点       | 15:30/16:00/17:00 各请求一次     | 确定稳定可用时间                    |

---

# 四、系统架构

## 4.1 架构原则

1. **计算与数据分离。** 采集、规范化、计算、排名、市场统计、规则、快照发布各自独立。
2. **纯函数优先。** 所有指标计算、排名、市场统计、规则判定都实现为纯函数，输入输出可序列化。
3. **快照不可变。** 已发布快照只读；修正生成新版本。
4. **页面只读快照。** API 和页面不得在请求过程中执行全量采集或重新计算。
5. **缺失即 null。** 不用 0、空字符串或猜测值替代缺失。
6. **边界校验。** 上游响应、配置文件、JSON 文件、API 参数都在边界用 schema 校验。
7. **可重放。** 相同输入、配置、算法版本必须得到相同结果。
8. **单机单写者。** V0.5.1 假定一台机器、一个分析写入进程；通过文件锁防止并发写。

## 4.2 分层与模块边界

| 层/模块        | 职责                                     | 不负责                 |
| -------------- | ---------------------------------------- | ---------------------- |
| `sources`      | HTTP、重试、响应解析、基础校验           | 筛选、计算、写文件     |
| `collectors`   | 研究池刷新、K 线采集、估值采集、选择报告 | 特征计算、排名         |
| `processing`   | K 线排序/去重/校验、周月聚合、交易日对齐 | 长期保存日 K           |
| `calculations` | 收益、趋势、风险、成交、估值、历史统计   | 页面、文件、网络       |
| `rankings`     | 全池排名、百分位、并列规则               | 市场统计、AI           |
| `market`       | 市场统计、市场状态                       | ETF 筛选、快照发布     |
| `rules`        | ETF/市场规则、证据、严重度               | 修改指标、生成投资建议 |
| `snapshots`    | 快照构建、校验、发布、版本、current      | 采集行情               |
| `storage`      | JSON 读写、原子写、锁、schema 校验       | 业务计算               |
| `reports`      | AI/模板报告、引用校验                    | 修改快照事实           |
| `server`       | API、页面、查询参数校验                  | 采集、重算             |
| `web`          | 服务端渲染、图表、展示                   | 直接调用 sources       |
| `tasks`        | 任务状态、步骤、幂等、互斥               | 业务计算               |

依赖方向：

```text
sources ← collectors ← tasks
                 ↓
            processing
                 ↓
            calculations
           ↙      ↓      ↘
     rankings   market   rules
           ↘      ↓      ↙
              snapshots
                 ↓
              storage

snapshots → server → web
```

禁止：

- `web` 直接 import `sources`。
- `calculations` import `storage` 或 `server`。
- `rankings` import `sources`。
- `snapshots` 在发布过程中调用上游。
- 任何模块把 `data/cache/klines` 当作计算输入。

## 4.3 v2 目录结构

```text
maga/
├── docs/
│   ├── ETF市场分析系统-V0.5.1-实施文档.md
│   └── data-verification.md
├── data/                         # 运行时数据，默认不入库
│   ├── config/                   # 可提交的配置
│   │   ├── categories.json
│   │   ├── category-overrides.json
│   │   ├── category-suggestions.json
│   │   ├── etf-category-mapping.json
│   │   ├── calculation-config.json
│   │   ├── rule-config.json
│   │   └── source-config.json
│   ├── master/
│   │   └── etfs.json
│   ├── valuation/
│   │   └── indexes/
│   │       └── 000300.SH.json
│   ├── snapshots/
│   │   └── 2026-11-13/
│   │       ├── v1/
│   │       └── v2/
│   ├── reports/
│   │   └── 2026-11-13/
│   │       └── report_....json
│   ├── cache/
│   │   └── klines/
│   │       └── 510300.SH.json
│   ├── system/
│   │   ├── current.json
│   │   ├── snapshot-index.json
│   │   ├── selection/latest.json
│   │   ├── tasks/
│   │   └── locks/
│   └── temp/
├── public/
│   ├── css/
│   ├── js/
│   └── vendor/echarts.min.js
├── src/
│   ├── cli.ts
│   ├── config/
│   ├── domain/
│   ├── sources/
│   ├── collectors/
│   ├── processing/
│   ├── calculations/
│   ├── rankings/
│   ├── market/
│   ├── rules/
│   ├── snapshots/
│   ├── storage/
│   ├── reports/
│   ├── tasks/
│   ├── server/
│   └── web/
├── test/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/
│   └── verify-source.ts
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

## 4.4 技术栈

| 项目     | 选择                              | 说明                            |
| -------- | --------------------------------- | ------------------------------- |
| 运行时   | Node.js 22 LTS 或更高             | `engines.node >= 22`            |
| 语言     | TypeScript                        | `strict: true`，禁止隐式 any    |
| 包管理   | pnpm                              | 不沿用 `main` 的 yarn           |
| Web      | Hono + `@hono/node-server`        | 轻量，支持服务端 JSX            |
| 页面     | Hono JSX + 原生 CSS/JS            | 不做 React/Vue SPA              |
| 图表     | ECharts 5.x 本地 vendor           | 不使用外部 CDN                  |
| 校验     | Zod                               | 配置、上游响应、JSON、API 参数  |
| 测试     | Vitest                            | 单测、集成、E2E                 |
| 日期     | dayjs + timezone                  | 统一 Asia/Shanghai              |
| 交易日历 | `@yiliang114/trading-day`（初始） | 通过 `TradingCalendar` 接口隔离 |
| 文件锁   | `proper-lockfile` 或等价实现      | 单机互斥；需处理 stale lock     |
| 日志     | pino                              | JSON 结构化日志                 |
| CLI      | citty                             | `pnpm etf <command>`            |
| HTTP     | Node 原生 `fetch`                 | 不自造 HTTP 客户端              |

建议脚本：

```json
{
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:source": "tsx scripts/verify-source.ts",
    "etf": "tsx src/cli.ts",
    "categories:suggest": "tsx src/cli.ts categories suggest",
    "categories:confirm": "tsx src/cli.ts categories confirm",
    "categories:validate": "tsx src/cli.ts categories validate",
    "data:backup": "tsx src/cli.ts data backup",
    "data:restore": "tsx src/cli.ts data restore"
  }
}
```

---

# 五、JSON 存储与配置

## 5.1 数据目录规则

1. 所有业务文件必须位于 `data/` 下；禁止写到仓库根目录或系统临时目录作为最终位置。
2. 路径统一通过 `DataPaths` 构造；禁止拼接未校验的 `..`。
3. `data/config/` 可提交；其余目录默认不提交。
4. 单个 JSON 文件目标上限：
   - ETF 特征文件：< 20KB。
   - 排名文件：< 2MB。
   - 市场统计文件：< 1MB。
   - findings 文件：< 5MB；超过则按 ETF 拆分。
   - 估值文件：< 3MB；超过则按年拆分并更新读取逻辑。
5. 超过上限必须拆分，不得继续增长为巨型 JSON。

`.gitignore` 至少包含：

```gitignore
node_modules/
dist/
.env
data/master/
data/valuation/
data/snapshots/
data/reports/
data/cache/
data/system/current.json
data/system/snapshot-index.json
data/system/selection/
data/system/tasks/
data/system/locks/
data/temp/
```

## 5.2 `source-config.json`

```json
{
  "schemaVersion": 1,
  "baseUrl": "https://hongsehuojian.com",
  "timeoutMs": 15000,
  "retries": 3,
  "retryBaseDelayMs": 1000,
  "retryJitterMs": 300,
  "concurrency": 2,
  "minIntervalMs": 300,
  "etfPageSize": 2000,
  "klineLimit": 1000,
  "valuationInterval": "last_5_years",
  "percentileScale": "percent",
  "premiumRateScale": "percent",
  "changePercentScale": "percent",
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "pro": "RedRocket-PC"
  }
}
```

不得把 Cookie、Token、账号密码写入此文件。

## 5.3 `calculation-config.json`

```json
{
  "schemaVersion": 1,
  "algorithmVersion": "0.5.1",
  "annualizationDays": 252,
  "riskFreeRateAnnual": 0,
  "volatilityDdof": 0,
  "klineLookbackRows": 1000,
  "returnPeriods": [1, 5, 20, 60, 120, 250],
  "movingAveragePeriods": [5, 10, 20, 60, 120],
  "volatilityPeriods": [20, 60, 120],
  "drawdownPeriods": [20, 60, 120, 250],
  "historyPeriods": {
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "1y": 250,
    "2y": 500
  },
  "bollinger": {
    "period": 20,
    "standardDeviation": 2
  },
  "trendAlignment": {
    "periods": [5, 10, 20, 60],
    "requireCloseAboveShortest": true,
    "strict": true
  },
  "valuationFreshness": {
    "freshDays": 7,
    "maxUsableDays": 30
  },
  "activity": {
    "minAmountSampleRatio": 0.8
  },
  "ranking": {
    "minSample": 5,
    "tieTolerance": 1e-12,
    "overall": {
      "enabled": false,
      "weights": {}
    }
  },
  "distributionBins": {
    "return1d": [-1, -0.03, -0.01, 0, 0.01, 0.03, 1],
    "return20d": [-1, -0.1, -0.05, 0, 0.05, 0.1, 1],
    "volatility": [0, 0.1, 0.2, 0.3, 0.4, 1],
    "drawdown": [-1, -0.2, -0.1, -0.05, 0]
  },
  "marketState": {
    "strongPositiveRatio": 0.65,
    "weakPositiveRatio": 0.35,
    "strongMedianReturn20d": 0.02,
    "weakMedianReturn20d": -0.02,
    "strongAboveMa20Ratio": 0.6,
    "weakAboveMa20Ratio": 0.3,
    "highVolatility20d": 0.28,
    "riskRisingPositiveRatioMax": 0.45,
    "highDrawdown60d": -0.15,
    "highRiskScore": 0.7,
    "highDispersion20d": 0.1,
    "dispersionPositiveRatioMin": 0.4,
    "dispersionPositiveRatioMax": 0.6,
    "activityImprovement": 0.2,
    "activityPositiveRatioMin": 0.5,
    "riskConcentrationRatio": 0.4
  }
}
```

说明：

- `algorithmVersion` 进入 manifest；任何公式或口径变化都必须提升版本。
- `volatilityDdof=0` 表示总体标准差；若改为样本标准差，必须提升算法版本。
- 所有阈值都可通过配置调整；不得在代码中散落魔法数字。
- `distributionBins` 使用左闭右开区间，最后一个上界为闭区间。

## 5.4 `rule-config.json`

规则阈值集中在此文件。完整规则表见第十章；结构示例：

```json
{
  "schemaVersion": 1,
  "ruleVersion": "1",
  "rules": [
    {
      "code": "etf_return20d_top20",
      "enabled": true,
      "level": "etf",
      "severity": "info",
      "maxFindings": 50,
      "params": {
        "minPercentile": 0.8
      }
    },
    {
      "code": "etf_drawdown_warning",
      "enabled": true,
      "level": "etf",
      "severity": "warning",
      "maxFindings": 50,
      "params": {
        "currentDrawdownThreshold": -0.1,
        "maxDrawdown60dThreshold": -0.15
      }
    }
  ]
}
```

规则代码、版本、启用状态和阈值都进入快照 manifest 的哈希。

## 5.5 `categories.json`

```json
{
  "schemaVersion": 1,
  "version": 1,
  "categories": [
    {
      "code": "broad_market",
      "name": "宽基指数",
      "children": [
        { "code": "cn_core", "name": "A股核心宽基" },
        { "code": "cn_small_mid", "name": "A股中小盘宽基" },
        { "code": "us_broad", "name": "美股宽基" },
        { "code": "hk_broad", "name": "港股宽基" }
      ]
    }
  ]
}
```

实际文件必须包含第二章表中的全部 6 个一级分类和全部二级分类，不能只保留示例。

## 5.6 `master/etfs.json`

```json
{
  "schemaVersion": 1,
  "poolVersion": 12,
  "poolHash": "sha256:...",
  "updatedAt": "2026-11-15T08:00:00.000Z",
  "sourceFetchedAt": "2026-11-15T07:59:50.000Z",
  "sourceTotal": 1721,
  "items": [
    {
      "code": "510300.SH",
      "name": "沪深300ETF华泰柏瑞",
      "exchange": "SH",
      "scale": 188245848179.1,
      "trackingIndex": "沪深300",
      "trackIndex": "000300.SH",
      "premiumRate": -0.0024,
      "amount": 3489035700
    }
  ]
}
```

规则：

- 只保存当前研究池；不保存历史池成员。
- `poolVersion` 在成员集合或同指数代表 ETF 变化时 +1；仅 scale/amount 等字段变化不提升成员版本。
- `poolHash` 是规范化 `items` 的 sha256；任何字段变化都会更新，用于判断输入是否变化。
- 采集失败时保留旧文件，不得用空数组覆盖。
- 新研究池数量相对旧池低于 70% 或高于 130% 时，默认拒绝写入；需 `--force-pool-change` 并记录原因。

## 5.7 `valuation/indexes/{indexCode}.json`

文件名为完整指数代码加 `.json`，例如 `000300.SH.json`。

```json
{
  "schemaVersion": 1,
  "code": "000300.SH",
  "updatedAt": "2026-11-15T08:00:00.000Z",
  "coverage": {
    "PE": { "supported": true, "lastDate": "2026-11-13", "count": 1212 },
    "PB": { "supported": true, "lastDate": "2026-11-13", "count": 1212 },
    "PS": { "supported": true, "lastDate": "2026-11-13", "count": 1212 }
  },
  "items": [
    {
      "date": "2026-11-13",
      "type": "PE",
      "value": 13.4199,
      "historicalPercentile": 0.7376,
      "peg": -40.9339,
      "pegUsable": false,
      "source": "hongsehuojian",
      "collectedAt": "2026-11-15T08:00:00.000Z"
    }
  ]
}
```

Upsert 规则：

1. 读取旧文件；若不存在，创建空结构。
2. 按 `date + type` 合并新数据；同键以新数据为准。
3. 保留旧文件中未被本次返回的键。
4. 单个类型失败不删除该类型旧数据。
5. 写入前校验所有条目；发现重复键、无效日期、非有限数值则整体拒绝写入。
6. 使用原子写。

## 5.8 快照目录

```text
data/snapshots/2026-11-13/v1/
├── manifest.json
├── etfs/
│   ├── 510300.SH.json
│   └── ...
├── rankings/
│   ├── return_1d.json
│   ├── return_5d.json
│   ├── return_20d.json
│   ├── return_60d.json
│   ├── return_120d.json
│   ├── return_250d.json
│   ├── return_ytd.json
│   ├── trend_score.json
│   ├── risk_score.json
│   ├── activity_amount_20d.json
│   ├── valuation_pe.json
│   ├── valuation_pb.json
│   └── valuation_ps.json
├── market/
│   ├── overview.json
│   ├── returns.json
│   ├── trend.json
│   ├── risk.json
│   ├── activity.json
│   ├── valuation.json
│   └── state.json
└── findings/
    ├── market.json
    └── etfs.json
```

`rankings/overall.json` 默认不存在；只有显式启用综合排名时才生成。

## 5.9 报告目录

```text
data/reports/2026-11-13/
└── report_20261113_001.json
```

报告不在快照目录内，引用 `analysisDate + snapshotVersion`。删除或重新生成报告不影响快照发布。

## 5.10 系统文件

`data/system/current.json`：

```json
{
  "schemaVersion": 1,
  "analysisDate": "2026-11-13",
  "snapshotVersion": 2,
  "snapshotPath": "snapshots/2026-11-13/v2",
  "updatedAt": "2026-11-15T08:05:00.000Z"
}
```

`data/system/snapshot-index.json`：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-11-15T08:05:00.000Z",
  "dates": [
    {
      "analysisDate": "2026-11-13",
      "latestVersion": 2,
      "versions": [
        { "version": 1, "status": "published", "publishedAt": "2026-11-13T08:05:00.000Z" },
        { "version": 2, "status": "published", "publishedAt": "2026-11-15T08:05:00.000Z" }
      ]
    }
  ]
}
```

`data/system/tasks/{taskId}.json` 见第十二章。

## 5.11 规范化 JSON 与版本

1. JSON 使用 2 空格缩进、UTF-8、LF、末尾换行。
2. 对象 key 按字典序排序后写出，保证相同内容得到相同字节。
3. 禁止写入 `NaN`、`Infinity`、`undefined`；出现即序列化失败。
4. 所有数据文件带 `schemaVersion`。
5. V0.5.1 是全新数据目录，不读取旧 Prisma/SQLite 数据。
6. 读取未知 `schemaVersion` 时必须失败并给出明确错误，不得猜测兼容。
7. 配置变化通过 `configHash` 记录；数据 schema 变化通过 `schemaVersion` 记录。

---

# 六、每日分析快照

## 6.1 快照目录与文件

每个交易日、每个版本一个独立目录（目录名为 `v{version}`）：

```text
data/snapshots/{analysisDate}/v{version}/
```

必需文件：

- `manifest.json`
- `etfs/{code}.json`：研究池内每只 ETF 一个文件
- `rankings/{rankingCode}.json`：所有启用的排名
- `market/overview.json`
- `market/returns.json`
- `market/trend.json`
- `market/risk.json`
- `market/activity.json`
- `market/valuation.json`
- `market/state.json`
- `findings/market.json`
- `findings/etfs.json`

可选文件：

- `rankings/overall.json`：仅当 `calculation-config.json` 中 `ranking.overall.enabled=true` 时生成。

## 6.2 `manifest.json`

```json
{
  "schemaVersion": 1,
  "analysisDate": "2026-11-13",
  "snapshotVersion": 1,
  "status": "published",
  "dataStatus": "complete",
  "createdAt": "2026-11-15T08:00:00.000Z",
  "publishedAt": "2026-11-15T08:05:00.000Z",
  "algorithmVersion": "0.5.1",
  "configVersion": 1,
  "configHash": "sha256:...",
  "ruleVersion": "1",
  "ruleConfigHash": "sha256:...",
  "categoryMappingVersion": 1,
  "categoryMappingHash": "sha256:...",
  "poolVersion": 12,
  "poolHash": "sha256:...",
  "etfCount": 243,
  "klineValidCount": 240,
  "valuationValidIndexCount": 180,
  "valuationValidEtfCount": 220,
  "sourceAsOf": {
    "etfListFetchedAt": "2026-11-15T07:59:50.000Z",
    "klineLastDate": "2026-11-13",
    "valuationLastDate": "2026-11-13"
  },
  "inputFingerprint": "sha256:...",
  "parentVersion": null,
  "reason": "daily",
  "counts": {
    "etfs": 243,
    "rankings": 13,
    "market": 7,
    "findings": 2
  },
  "files": [
    {
      "path": "etfs/510300.SH.json",
      "checksum": "sha256:...",
      "bytes": 4321
    }
  ],
  "warnings": []
}
```

字段规则：

| 字段               | 规则                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `status`           | `building` / `validated` / `published` / `failed`；只有 `published` 能被 current 指向 |
| `dataStatus`       | `complete` / `partial`；partial 必须有 `--allow-partial` 且 UI 显示横幅               |
| `snapshotVersion`  | 同一 `analysisDate` 内从 1 递增，永不重用                                             |
| `reason`           | `first_run` / `daily` / `recompute` / `force` / `valuation_recompute`                 |
| `parentVersion`    | 重算时填写被替代的版本；首次为空                                                      |
| `inputFingerprint` | 见 6.3；用于幂等和审计                                                                |
| `files`            | 不包含 `manifest.json` 自身；每项 checksum 为文件字节 sha256                          |
| `warnings`         | 结构 `{code, message, context?}`；不得为空字符串                                      |

## 6.3 `inputFingerprint`

`inputFingerprint` 必须覆盖所有会影响结果的输入。建议结构：

```ts
interface InputDigest {
  analysisDate: string;
  algorithmVersion: string;
  configHash: string;
  ruleConfigHash: string;
  categoryMappingHash: string;
  poolHash: string;
  etfs: Array<{
    code: string;
    firstDate: string | null;
    lastDate: string | null;
    rowCount: number;
    rowsHash: string; // 规范化 Kline 行的 sha256
  }>;
  valuations: Array<{
    code: string;
    type: "PE" | "PB" | "PS";
    lastDate: string;
    count: number;
    rowsHash: string;
  }>;
}
```

规则：

1. `etfs` 按 `code` 升序；`valuations` 按 `code + type` 升序。
2. `rowsHash` 使用规范化 JSON 的 sha256；不包含 `collectedAt`、`updatedAt` 等非计算字段。
3. 最终 `inputFingerprint = sha256(canonicalJson(inputDigest))`。
4. `configHash` 覆盖 `calculation-config.json` 和 `source-config.json`；`ruleConfigHash` 覆盖 `rule-config.json`；`categoryMappingHash` 覆盖分类映射。任何影响结果的配置变化都必须改变对应哈希。
5. 同一 `analysisDate` 已存在相同 fingerprint 的 published 快照时，默认跳过发布，返回已有版本。
6. `--force` 时即使 fingerprint 相同也生成新版本，并在 `reason` 中记录。
7. 完整 `InputDigest` 写入 `data/temp/{taskId}/input-digest.json`，不进入快照，避免 manifest 过大。

## 6.4 ETF 特征文件

路径：`etfs/{code}.json`

```json
{
  "schemaVersion": 1,
  "code": "510300.SH",
  "name": "沪深300ETF华泰柏瑞",
  "exchange": "SH",
  "analysisDate": "2026-11-13",
  "latestKlineDate": "2026-11-13",
  "category": {
    "primaryCode": "broad_market",
    "secondaryCode": "cn_core",
    "status": "confirmed",
    "mappingVersion": 1
  },
  "dataQuality": {
    "sampleValid": true,
    "klineRows": 1000,
    "firstKlineDate": "2022-11-14",
    "lastKlineDate": "2026-11-13",
    "amountSampleCount20d": 20,
    "warnings": []
  },
  "features": {
    "returns": {
      "1d": -0.015,
      "5d": 0.012,
      "20d": 0.034,
      "60d": 0.081,
      "120d": 0.12,
      "250d": 0.18,
      "ytd": 0.16
    },
    "trend": {
      "close": 4.083,
      "ma5": 4.15,
      "ma10": 4.16,
      "ma20": 4.17,
      "ma60": 4.02,
      "ma120": 3.88,
      "ma20Deviation": -0.011,
      "ma60Deviation": 0.016,
      "aboveMa20": false,
      "aboveMa60": true,
      "aboveMa120": true,
      "maAlignment": "neutral",
      "maAlignmentScore": 3,
      "boll20": {
        "middle": 4.17,
        "upper": 4.32,
        "lower": 4.02,
        "percentB": 0.18,
        "bandwidth": 0.072
      }
    },
    "risk": {
      "volatility20d": 0.19,
      "volatility60d": 0.21,
      "volatility120d": 0.2,
      "maxDrawdown20d": -0.05,
      "maxDrawdown60d": -0.08,
      "maxDrawdown120d": -0.12,
      "maxDrawdown250d": -0.15,
      "currentDrawdown": -0.03,
      "sampleHigh": 4.42,
      "distanceFromSampleHigh": -0.076,
      "maxDrawdown60dPeakDate": "2026-09-20",
      "maxDrawdown60dTroughDate": "2026-10-12"
    },
    "activity": {
      "amount": 3489035700,
      "averageAmount5d": 4200000000,
      "averageAmount20d": 3900000000,
      "averageAmount60d": 3700000000,
      "amountRatio20d": -0.105,
      "amountRatio60d": -0.057,
      "amountSampleCount20d": 20
    },
    "valuation": {
      "pe": {
        "value": 13.4199,
        "historicalPercentile": 0.7376,
        "date": "2026-11-13",
        "lagDays": 0,
        "lagTradingDays": 0,
        "peg": -40.9339,
        "pegUsable": false,
        "source": "hongsehuojian",
        "freshness": "fresh"
      },
      "pb": null,
      "ps": null
    },
    "history": {
      "1m": {
        "tradingDays": 21,
        "totalReturn": 0.034,
        "annualizedReturn": null,
        "meanDailyReturn": 0.0016,
        "medianDailyReturn": 0.0011,
        "dailyReturnStd": 0.012,
        "annualizedVolatility": 0.19,
        "maxDrawdown": -0.05,
        "sharpe": 0.13,
        "sortino": 0.21,
        "calmar": null,
        "maxUpStreak": 4,
        "maxDownStreak": 3,
        "newHighCount": 2,
        "averageAmount": 3900000000,
        "amountSampleCount": 21
      }
    }
  },
  "computedAt": "2026-11-15T08:01:00.000Z"
}
```

说明：

- `returns` 中的 key 固定为 `1d/5d/20d/60d/120d/250d/ytd`。
- `history` 中的 key 固定为 `1m/3m/6m/ytd/1y/2y`；示例只列 `1m`，实际必须全部输出。
- 某个周期行数不足时，该周期的 `history[key]` 为 null，不输出半套字段。
- `annualizedReturn` 对短周期仍计算，但 UI 标注“样本期年化”；`tradingDays < 20` 时可为 null。
- `maxDrawdown60dPeakDate/TroughDate` 是 60 日窗口内最大回撤的峰值日和谷值日；其他窗口不要求日期。
- `sampleValid=false` 时，所有依赖当日价格的特征应为 null；历史统计可保留但 UI 标注“非当日样本”。
- 若日 K 为空，`latestKlineDate`、`firstKlineDate`、`lastKlineDate` 均为 null；ETF 文件仍生成，用于记录数据质量。
- 不得在 ETF 文件中嵌入排名，排名通过排名文件在读取时关联，避免重复事实。

## 6.5 排名文件

路径：`rankings/{rankingCode}.json`

```json
{
  "schemaVersion": 1,
  "rankingCode": "return_20d",
  "analysisDate": "2026-11-13",
  "snapshotVersion": 1,
  "direction": "desc",
  "interpretation": "higher_is_better",
  "totalCount": 243,
  "eligibleCount": 240,
  "insufficientSample": false,
  "minSample": 5,
  "items": [
    {
      "rank": 1,
      "code": "510300.SH",
      "value": 0.12,
      "percentile": 1.0,
      "sampleValid": true
    }
  ]
}
```

规则：

- `eligibleCount < minSample` 时，`items=[]`，`insufficientSample=true`。
- 只保存有效样本；无效样本不占排名。
- `value` 是原始指标值，不做展示四舍五入。
- `percentile` 为 0–1，1 表示最好；估值的“最好”仅表示百分位最低，不代表投资结论。

## 6.6 快照不可变与版本

1. 发布后的快照目录只读，不得原地修改任何文件。
2. 同一分析日期的版本号从已有最大版本 +1。
3. 历史修正为每个受影响日期创建新版本，旧版本保留。
4. `current.json` 只指向已发布快照。
5. `current.json` 的分析日期只能前进；修正旧日期不改变 current。
6. 同一分析日期修正后，`current.json` 指向该日期最新已发布版本。
7. `snapshot-index.json` 是查询索引，可由目录扫描重建；重建不得改变版本号。
8. 已发布快照的 checksum 不一致时，视为数据损坏，页面拒绝读取并报 `SNAPSHOT_CORRUPT`。

---

# 七、ETF 特征计算

## 7.1 输入与对齐

计算输入：

- ETF 代码、名称、分类。
- 已规范化、按日期升序、已去重的 `Kline[]`。
- 该 ETF `trackIndex` 对应的 `IndexValuation[]`。
- `analysisDate`。
- `calculation-config.json`。

对齐规则：

1. `rows` 只保留 `date <= analysisDate` 的有效行。
2. `i` 是 `rows` 中最后一条的索引；其日期必须等于 `latestKlineDate`。
3. **收益、波动、回撤、历史统计的周期按 ETF 自身有效行数计算**，不按自然日或市场日历补齐。
4. 停牌导致的行缺失不向前填充；周期是“该 ETF 的 N 个有效交易区间”。
5. 估值按日期独立关联，不使用 K 线日期代替估值日期。
6. 任何指标样本不足返回 null，不返回 0。
7. 计算使用全精度；序列化前统一 `roundTo(12)`，排名比较使用 `1e-12` 容差。

## 7.2 收益指标

定义 `N` 为区间数，`close[i]` 为分析日收盘价。

| 指标 | N      | 公式                                 | 最少行数        |
| ---- | ------ | ------------------------------------ | --------------- |
| 1D   | 1      | `close[i] / close[i-1] - 1`          | 2               |
| 5D   | 5      | `close[i] / close[i-5] - 1`          | 6               |
| 20D  | 20     | `close[i] / close[i-20] - 1`         | 21              |
| 60D  | 60     | `close[i] / close[i-60] - 1`         | 61              |
| 120D | 120    | `close[i] / close[i-120] - 1`        | 121             |
| 250D | 250    | `close[i] / close[i-250] - 1`        | 251             |
| YTD  | 不固定 | `close[i] / close[prevYearLast] - 1` | 上一年至少 1 行 |

YTD：

- `prevYearLast` 是 `date < {analysisDate 的年份}-01-01` 的最后一行。
- 若没有上一年数据，`ytd=null`。
- 1 月初运行也使用上一年最后一行，不使用当年第一行。

示例：

```text
close[i-20] = 10.00, close[i] = 10.80
20D return = 10.80 / 10.00 - 1 = 0.08
```

## 7.3 趋势指标

### 7.3.1 均线

```text
MA(N) = mean(close[i-N+1 ... i])
```

计算 MA5、MA10、MA20、MA60、MA120。样本不足时对应均线为 null。

价格偏离：

```text
maNDEviation = close[i] / MA(N) - 1
```

V0.5.1 至少输出 `ma20Deviation`、`ma60Deviation`。

### 7.3.2 均线排列

严格比较，不使用容差：

- `bullish`：`close > MA5 > MA10 > MA20 > MA60`
- `bearish`：`close < MA5 < MA10 < MA20 < MA60`
- `neutral`：其他

`maAlignmentScore` 为 6 个二值条件之和，范围 0–6：

1. `close > MA5`
2. `MA5 > MA10`
3. `MA10 > MA20`
4. `MA20 > MA60`
5. `close > MA20`
6. `close > MA60`

MA120 不参与排列，只输出 `aboveMa120`。

### 7.3.3 BOLL

```text
middle = MA(20)
std = populationStd(close[i-19 ... i])
upper = middle + 2 * std
lower = middle - 2 * std
percentB = (close - lower) / (upper - lower)  // upper > lower
bandwidth = (upper - lower) / middle          // middle > 0
```

`upper <= lower` 或 `middle <= 0` 时对应字段为 null。

## 7.4 风险指标

### 7.4.1 波动率

`volatilityN` 使用最近 N 个**日收益率**，即 N+1 个收盘价：

```text
r_j = close[j] / close[j-1] - 1
meanR = mean(r)
stdR = sqrt(sum((r - meanR)^2) / N)   // 总体标准差，ddof=0
volatilityN = stdR * sqrt(252)
```

计算 20、60、120 日。样本不足或 N < 2 时 null。

### 7.4.2 最大回撤

`maxDrawdownN` 使用最近 N 个区间（N+1 个收盘价）：

```text
peak = close[start]
maxDD = 0
for each close c in window:
  peak = max(peak, c)
  dd = c / peak - 1
  maxDD = min(maxDD, dd)
```

结果范围 `[-1, 0]`。计算 20、60、120、250 日。60 日窗口额外记录峰值日和谷值日。

### 7.4.3 当前回撤与样本高点

```text
sampleHigh = max(close[0 ... i])
currentDrawdown = close[i] / sampleHigh - 1
distanceFromSampleHigh = currentDrawdown
```

`sampleHigh` 只代表本次获取的样本（最多 1000 行），不是无限历史最高价。UI 必须标注“样本内”。

## 7.5 成交活跃度

```text
averageAmountN = mean(amount[i-N+1 ... i])   // N 个交易日
amountRatioN = amount[i] / averageAmountN - 1
```

规则：

- 计算 5、20、60 日均额。
- 有效 `amount` 数量必须满足 `validCount / N >= 0.8`；否则均值为 null。
- 均值为 0 或 null 时，`amountRatioN` 为 null。
- 缺失成交额不补 0。
- 输出 `amountSampleCount20d`，供 UI 显示样本。

## 7.6 估值特征

对 PE、PB、PS 分别执行：

1. 在 `date <= analysisDate` 的估值中取最后一条。
2. 没有数据 → 对应类型为 null。
3. `historicalPercentile` 已是 0–1；缺失为 null。
4. `lagDays = analysisDate - valuation.date`（自然日）。
5. `lagTradingDays` 按交易日历计算。
6. `freshness`：`fresh` / `stale` / `too_stale`。
7. `peg` 只在 PE 中输出；`pegUsable` 见 2.4.3。
8. 不使用 ETF 的行情日期替代估值日期。

## 7.7 历史统计

### 7.7.1 周期

| 周期 key | N（区间数） | 行数（N+1）            |
| -------- | ----------- | ---------------------- |
| `1m`     | 21          | 22                     |
| `3m`     | 63          | 64                     |
| `6m`     | 126         | 127                    |
| `1y`     | 250         | 251                    |
| `2y`     | 500         | 501                    |
| `ytd`    | 动态        | 上一年最后一行至分析日 |

### 7.7.2 统计字段

对每个周期：

```text
windowCloses = 最近 N+1 个收盘价
dailyReturns = N 个日收益率
totalReturn = windowCloses[last] / windowCloses[first] - 1
annualizedReturn = (1 + totalReturn)^(252 / N) - 1
meanDailyReturn = mean(dailyReturns)
medianDailyReturn = median(dailyReturns)
dailyReturnStd = populationStd(dailyReturns)
annualizedVolatility = dailyReturnStd * sqrt(252)
maxDrawdown = 窗口内最大回撤
```

年化：

- `1 + totalReturn <= 0` → `annualizedReturn=null`。
- `N < 20` → `annualizedReturn=null`，避免短样本误导。
- 短周期年化仅作参考，UI 标注“样本期年化”。

Sharpe：

```text
rfDaily = (1 + riskFreeRateAnnual)^(1/252) - 1
sharpe = (meanDailyReturn - rfDaily) / dailyReturnStd * sqrt(252)
```

`dailyReturnStd=0` → null。

Sortino：

```text
downside = sqrt(mean(min(0, r - rfDaily)^2))
sortino = (meanDailyReturn - rfDaily) / downside * sqrt(252)
```

`downside=0` → null。

Calmar：

```text
calmar = annualizedReturn / abs(maxDrawdown)
```

`maxDrawdown=0` 或 `annualizedReturn=null` → null。

连涨/连跌：

- `maxUpStreak`：连续 `r > 0` 的最大天数；零或负收益中断。
- `maxDownStreak`：连续 `r < 0` 的最大天数；零或正收益中断。
- 没有对应天数时为 0。

创新高：

- 从窗口第二行开始，若 `close > runningMax`，计数 +1。
- 第一行初始化 `runningMax`，不计入。

成交额：

- `averageAmount` 为窗口内有效成交额均值。
- 有效比例 `< 0.8` → null。

## 7.8 空值、单位与展示

1. 所有内部比例保存小数：`0.08` 表示 8%。
2. 所有展示百分比乘 100，保留 2 位小数。
3. 金额展示：≥1 亿显示“X.XX 亿”，≥1 万显示“X.XX 万”，否则显示元。
4. null 在 UI 显示 `—`，tooltip 给出原因，例如“样本不足”“上游无估值”“停牌”。
5. 不允许把 null 序列化为 0、空字符串或 `"N/A"`。
6. 计算中间值不提前四舍五入；只在序列化前 `roundTo(12)`。
7. 排名和规则判定使用序列化后的值，保证可重放。

---

# 八、ETF 全池排名

## 8.1 排名范围

- 默认对整个研究池排名。
- 分类不改变全池排名。
- 页面按分类筛选时，可额外计算“筛选集排名”，但必须与全池排名同时显示并明确标识。
- 筛选集排名在读取时由快照特征确定性计算，不持久化。
- 全池排名必须持久化到快照。

## 8.2 V0.5.1 排名矩阵

| 排名代码              | 指标                                | 方向 | 解释                         | 最少有效样本 |
| --------------------- | ----------------------------------- | ---- | ---------------------------- | ------------ |
| `return_1d`           | `returns.1d`                        | desc | 越高越好                     | 5            |
| `return_5d`           | `returns.5d`                        | desc | 越高越好                     | 5            |
| `return_20d`          | `returns.20d`                       | desc | 越高越好                     | 5            |
| `return_60d`          | `returns.60d`                       | desc | 越高越好                     | 5            |
| `return_120d`         | `returns.120d`                      | desc | 越高越好                     | 5            |
| `return_250d`         | `returns.250d`                      | desc | 越高越好                     | 5            |
| `return_ytd`          | `returns.ytd`                       | desc | 越高越好                     | 5            |
| `trend_score`         | `trend.maAlignmentScore`            | desc | 越高越偏多头                 | 5            |
| `risk_score`          | 波动与回撤合成                      | asc  | 越低风险越低                 | 5            |
| `activity_amount_20d` | `activity.averageAmount20d`         | desc | 越高成交越活跃               | 5            |
| `valuation_pe`        | `valuation.pe.historicalPercentile` | asc  | 越低估值百分位越低；中性解释 | 5            |
| `valuation_pb`        | `valuation.pb.historicalPercentile` | asc  | 同上                         | 5            |
| `valuation_ps`        | `valuation.ps.historicalPercentile` | asc  | 同上                         | 5            |

不生成：

- 综合排名 `overall`。
- PEG 排名。
- 任何未在表中定义的排名。

## 8.3 `risk_score`

风险分数使用横截面百分位，避免不同量纲直接相加：

```text
volPercentile = percentileRank(volatility20d, ascending)   // 波动越高，百分位越高
ddPercentile  = percentileRank(abs(maxDrawdown60d), ascending) // 回撤越大，百分位越高
riskScore = (volPercentile + ddPercentile) / 2             // 0–1，越高风险越高
```

规则：

- 两个分量都必须有值；任一为 null，`riskScore=null`，不参与风险排名。
- `percentileRank` 使用 8.4 的并列规则，返回 0–1，越高表示值越大。
- `risk_score` 排名按 `asc`，分数最低为第 1 名。
- UI 标签为“风险由低到高”，不得写成“最优”。

## 8.4 排名算法

输入：`items: {code, value}[]`、`direction`、`minSample`、`tieTolerance`。

步骤：

1. 过滤 `value` 为 null、NaN、Infinity 的项。
2. 若有效项数 `< minSample`，返回空 rank 列表，`insufficientSample=true`。
3. 按方向排序：
   - `desc`：值大在前。
   - `asc`：值小在前。
4. 并列判定：`abs(a - b) <= tieTolerance * max(1, abs(a), abs(b))`。
5. 采用竞赛排名：`1, 2, 2, 4`。
6. 并列项按 `code` 升序稳定排列。
7. `percentile`：

```text
n > 1 ? (n - rank) / (n - 1) : 1
```

8. `rank=1` 的 percentile 为 1.0；最后一名的 percentile 为 0.0。

## 8.5 排名文件规则

- 每个排名一个文件。
- 顶层包含方向、解释、有效样本、总样本、最小样本、是否样本不足。
- `items` 只包含有效项。
- 排名文件不包含被排除项的列表；排除原因在任务记录和 manifest warnings 中汇总。
- 排名文件生成后不得修改；修正生成新快照。

## 8.6 筛选集排名

API 查询：

```text
GET /api/rankings?date=2026-11-13&ranking=return_20d&category=broad_market
```

返回：

```json
{
  "scope": "filtered",
  "filter": { "category": "broad_market" },
  "fullPool": { "rankingCode": "return_20d", "eligibleCount": 240 },
  "filtered": { "eligibleCount": 18, "items": [] }
}
```

规则：

- 全池排名来自快照文件。
- 筛选集排名使用同一算法在内存中计算。
- 每项同时给出 `fullPoolRank` 和 `filteredRank`。
- 不得用筛选集排名替换全池排名。

## 8.7 综合排名（V0.5.1 关闭）

只有同时满足以下条件才生成 `overall.json`：

1. `calculation-config.json` 中 `ranking.overall.enabled=true`。
2. 权重非空、全部非负、总和为 1。
3. 所有参与排名的维度都有有效值。
4. 用户已明确确认权重和缺失值策略。

V0.5.1 默认不满足以上条件，因此不生成综合排名，页面显示“综合排名未启用”。

---

# 九、市场整体分析

## 9.1 分析范围

- 默认使用整个 ETF 研究池。
- 分类只作为辅助维度，不改变默认全池口径。
- 每个指标使用自己的有效样本数作为分母。
- 样本不足返回 null，不填 0。
- 市场统计不按规模加权；默认等权。

## 9.2 样本定义

```json
{
  "poolCount": 243,
  "klineValidCount": 240,
  "valuationValidIndexCount": 180,
  "valuationValidEtfCount": 220,
  "staleEtfCodes": ["..."],
  "valuationUnsupportedIndexes": ["NDX.GI"]
}
```

- `klineValidCount`：`latestKlineDate === analysisDate` 且至少有一条有效 K 线的 ETF 数。
- `valuationValidIndexCount`：至少一个估值类型在 `maxUsableDays` 内有效的唯一指数数。
- `valuationValidEtfCount`：其 `trackIndex` 有有效估值的 ETF 数；用于展示覆盖率，不用于估值分布分母。
- 每个市场指标再按自身字段非 null 过滤。

## 9.3 收益统计

对 1D、5D、20D、60D、120D、250D、YTD 分别计算：

```json
{
  "validCount": 240,
  "mean": 0.012,
  "median": 0.008,
  "upCount": 160,
  "downCount": 70,
  "flatCount": 10,
  "positiveRatio": 0.667,
  "negativeRatio": 0.292,
  "p10": -0.03,
  "p25": -0.01,
  "p75": 0.03,
  "p90": 0.06,
  "distribution": [
    { "lower": -1, "upper": -0.03, "count": 8 },
    { "lower": -0.03, "upper": -0.01, "count": 20 }
  ]
}
```

涨跌平定义：

- `return > 1e-9`：上涨。
- `return < -1e-9`：下跌。
- 其他：平盘。

分位数使用线性插值；`n < 5` 时 `p10/p25/p75/p90` 为 null。

## 9.4 趋势统计

```json
{
  "validCount": 240,
  "bullishCount": 60,
  "bearishCount": 40,
  "neutralCount": 140,
  "bullishRatio": 0.25,
  "aboveMa20Count": 150,
  "aboveMa20Ratio": 0.625,
  "aboveMa60Count": 120,
  "aboveMa60Ratio": 0.5,
  "aboveMa120Count": 100,
  "aboveMa120Ratio": 0.417
}
```

## 9.5 风险统计

```json
{
  "validCount": 240,
  "meanVolatility20d": 0.22,
  "medianVolatility20d": 0.2,
  "highVolatilityCount": 40,
  "meanMaxDrawdown60d": -0.09,
  "highDrawdownCount": 25,
  "highDrawdownRatio": 0.104,
  "meanRiskScore": 0.5,
  "highRiskCount": 60,
  "highRiskRatio": 0.25,
  "volatilityDistribution": [{ "lower": 0, "upper": 0.1, "count": 20 }],
  "drawdownDistribution": [{ "lower": -1, "upper": -0.2, "count": 10 }]
}
```

高波动定义：`volatility20d >= marketState.highVolatility20d`。
高回撤定义：`maxDrawdown60d <= -0.15`（配置项）；`highDrawdownRatio = highDrawdownCount / validCount`。
高风险定义：`risk_score >= 0.7` 或“高波动且高回撤”；V0.5.1 采用 `risk_score >= 0.7`。

## 9.6 成交活跃度统计

```json
{
  "validCount": 240,
  "totalAmount": 120000000000,
  "meanAmount": 500000000,
  "medianAmount": 300000000,
  "meanAmountRatio20d": 0.08,
  "expandedCount": 60,
  "expandedRatio": 0.25,
  "amountDistribution": [{ "lower": 0, "upper": 100000000, "count": 80 }]
}
```

成交放大定义：`amountRatio20d >= 0.5`。

## 9.7 估值统计

对 PE、PB、PS 分别计算：

```json
{
  "pe": {
    "validCount": 180,
    "validEtfCount": 220,
    "coverageRatio": 0.741,
    "etfCoverageRatio": 0.905,
    "medianPercentile": 0.55,
    "lowCount": 30,
    "highCount": 45,
    "staleCount": 12,
    "tooStaleCount": 3,
    "insufficientSample": false,
    "distribution": [{ "lower": 0, "upper": 0.2, "count": 30 }]
  },
  "pb": {},
  "ps": {}
}
```

规则：

- 低估值百分位：`<= 0.2`。
- 高估值百分位：`>= 0.8`。
- 只用 `lagDays <= maxUsableDays` 的样本。
- 估值分布按**唯一指数**统计，避免同一指数下多只 ETF 重复计权。
- `validCount` 是唯一指数数；`coverageRatio = validCount / 研究池唯一指数数`。
- `validEtfCount` 用于展示 ETF 覆盖率，不进入估值分布分母。
- `validCount < 5` 或 `coverageRatio < 0.5` 时 `insufficientSample=true`，中位数/计数为 null。
- 估值高低是描述性统计，不是买卖建议。

## 9.8 市场状态

市场状态按优先级匹配，第一条命中的规则生效：

| 优先级 | 状态代码             | 标签           | 条件（默认阈值）                                                                      |
| ------ | -------------------- | -------------- | ------------------------------------------------------------------------------------- |
| 1      | `risk_rising`        | 风险上升       | `meanVolatility20d >= 0.28` 且 `positiveRatio1d <= 0.45`                              |
| 2      | `weak`               | 整体偏弱       | `positiveRatio1d <= 0.35` 或（`medianReturn20d <= -0.02` 且 `aboveMa20Ratio <= 0.3`） |
| 3      | `strong`             | 整体偏强       | `positiveRatio1d >= 0.65` 且 `medianReturn20d >= 0.02` 且 `aboveMa20Ratio >= 0.6`     |
| 4      | `diverging`          | 震荡分化       | `p90Return20d - p10Return20d >= 0.10` 且 `positiveRatio1d` 在 0.4–0.6                 |
| 5      | `activity_improving` | 成交活跃度改善 | `meanAmountRatio20d >= 0.20` 且 `positiveRatio1d >= 0.5`                              |
| 6      | `neutral`            | 中性震荡       | 以上都不满足                                                                          |

输出：

```json
{
  "schemaVersion": 1,
  "analysisDate": "2026-11-13",
  "code": "neutral",
  "label": "中性震荡",
  "matchedRule": "neutral",
  "evidence": {
    "positiveRatio1d": 0.52,
    "medianReturn20d": 0.005,
    "aboveMa20Ratio": 0.48,
    "meanVolatility20d": 0.21,
    "p90Return20d": 0.06,
    "p10Return20d": -0.05
  },
  "thresholds": {
    "strongPositiveRatio": 0.65,
    "weakPositiveRatio": 0.35
  }
}
```

规则：

- 状态必须由规则和证据支撑，不得由 AI 自由生成。
- 阈值来自 `calculation-config.json` 的 `marketState` 段。
- 市场状态阈值与 `rule-config.json` 中 `market_breadth_*` 等规则阈值相互独立；默认值保持一致，修改时必须同时检查，避免页面状态与发现矛盾。
- 同一份输入必须得到同一状态。
- 页面展示状态时同时展示证据和阈值，避免“黑箱标签”。

## 9.9 市场文件职责

| 文件                    | 内容                                             |
| ----------------------- | ------------------------------------------------ |
| `market/overview.json`  | 首页摘要，引用其他市场文件的精选指标，不独立计算 |
| `market/returns.json`   | 多周期收益统计和分布                             |
| `market/trend.json`     | 均线排列、价格位置统计                           |
| `market/risk.json`      | 波动、回撤、风险分数统计                         |
| `market/activity.json`  | 成交额、放大比例统计                             |
| `market/valuation.json` | PE/PB/PS 分布和覆盖率                            |
| `market/state.json`     | 市场状态、命中的规则、证据、阈值                 |

---

# 十、规则分析与研究发现

## 10.1 规则原则

1. 规则判定是确定性函数，不调用 AI。
2. 每条发现必须能追溯到规则代码、阈值、指标值和有效样本数。
3. 规则不得修改指标、排名或市场统计。
4. 规则结果不得表述为买入/卖出建议。
5. 规则代码、版本、启用状态和阈值进入快照 manifest 的哈希。
6. 阈值只能在 `rule-config.json` 中定义；代码不得散落魔法数字。
7. 规则配置变化后，仅为之后生成的快照生效；历史快照保留旧规则版本。

## 10.2 ETF 级规则

| 规则代码                | 条件（默认）                                                      | 严重度  | 证据字段                                       |
| ----------------------- | ----------------------------------------------------------------- | ------- | ---------------------------------------------- |
| `etf_return20d_top20`   | `rankPercentile(return_20d) >= 0.80`                              | info    | `return20d`, `rankPercentile`                  |
| `etf_return60d_top20`   | `rankPercentile(return_60d) >= 0.80`                              | info    | `return60d`, `rankPercentile`                  |
| `etf_bullish_alignment` | `maAlignment === "bullish"`                                       | info    | `ma5`, `ma10`, `ma20`, `ma60`, `close`         |
| `etf_ma20_overextended` | `ma20Deviation >= 0.08`                                           | warning | `close`, `ma20`, `ma20Deviation`               |
| `etf_volatility_spike`  | `volatility20d >= 0.30` 且 `volatility20d >= 1.3 * volatility60d` | warning | `volatility20d`, `volatility60d`               |
| `etf_drawdown_warning`  | `currentDrawdown <= -0.10` 或 `maxDrawdown60d <= -0.15`           | warning | `currentDrawdown`, `maxDrawdown60d`            |
| `etf_amount_expansion`  | `amountRatio20d >= 0.50` 且 `averageAmount20d >= 10_000_000`      | info    | `amount`, `averageAmount20d`, `amountRatio20d` |
| `etf_pe_low`            | `valuation.pe.historicalPercentile <= 0.20` 且 `lagDays <= 30`    | info    | `pePercentile`, `lagDays`                      |
| `etf_pb_low`            | `valuation.pb.historicalPercentile <= 0.20` 且 `lagDays <= 30`    | info    | `pbPercentile`, `lagDays`                      |
| `etf_ps_low`            | `valuation.ps.historicalPercentile <= 0.20` 且 `lagDays <= 30`    | info    | `psPercentile`, `lagDays`                      |
| `etf_trend_improving`   | 存在上一快照，且 `maAlignmentScore` 提升 >= 2，当前分数 >= 4      | info    | `previousScore`, `currentScore`                |

规则说明：

- `rankPercentile` 来自对应排名文件；排名样本不足时规则不触发。
- `etf_trend_improving` 依赖上一交易日已发布快照；不存在时状态为 `not_evaluated`，不生成发现。
- “低估值”只描述百分位，不代表未来收益。
- 每条 ETF 规则每天最多为每只 ETF 生成一条发现。

## 10.3 市场级规则

| 规则代码                    | 条件（默认）                                                 | 严重度  | 证据字段                                  |
| --------------------------- | ------------------------------------------------------------ | ------- | ----------------------------------------- |
| `market_breadth_strong`     | `positiveRatio1d >= 0.65`                                    | info    | `positiveRatio1d`, `validCount`           |
| `market_breadth_weak`       | `positiveRatio1d <= 0.35`                                    | warning | `positiveRatio1d`, `validCount`           |
| `market_dispersion_high`    | `p90Return20d - p10Return20d >= 0.10`                        | info    | `p90Return20d`, `p10Return20d`            |
| `market_volatility_rising`  | `meanVolatility20d >= 0.28`                                  | warning | `meanVolatility20d`                       |
| `market_activity_improving` | `meanAmountRatio20d >= 0.20` 且 `positiveRatio1d >= 0.50`    | info    | `meanAmountRatio20d`, `positiveRatio1d`   |
| `market_trend_improving`    | `aboveMa20Ratio >= 0.60` 且 `bullishRatio >= 0.40`           | info    | `aboveMa20Ratio`, `bullishRatio`          |
| `market_risk_concentration` | `highRiskRatio >= 0.40`                                      | warning | `highRiskRatio`, `highRiskCount`          |
| `market_drawdown_pressure`  | `meanMaxDrawdown60d <= -0.15` 或 `highDrawdownRatio >= 0.30` | warning | `meanMaxDrawdown60d`, `highDrawdownRatio` |
| `market_valuation_low`      | `pe.medianPercentile <= 0.30` 且 `pe.validCount >= 20`       | info    | `peMedianPercentile`, `peValidCount`      |
| `market_valuation_high`     | `pe.medianPercentile >= 0.80` 且 `pe.validCount >= 20`       | info    | `peMedianPercentile`, `peValidCount`      |

规则说明：

- 市场规则每天每条最多一条发现。
- `market_valuation_low/high` 只描述估值位置，不构成方向判断。
- 阈值来自 `rule-config.json`；默认值与第九章市场状态阈值可以不同。

## 10.4 发现文件结构

`findings/market.json`：

```json
{
  "schemaVersion": 1,
  "analysisDate": "2026-11-13",
  "snapshotVersion": 1,
  "level": "market",
  "ruleVersion": "1",
  "items": [
    {
      "id": "market:market_breadth_strong:2026-11-13",
      "ruleCode": "market_breadth_strong",
      "ruleVersion": "1",
      "level": "market",
      "severity": "info",
      "title": "市场上涨比例较高",
      "description": "研究池内 68% 的 ETF 当日上涨。",
      "evidence": {
        "positiveRatio1d": 0.68,
        "upCount": 163,
        "validCount": 240
      },
      "thresholds": {
        "positiveRatio1dMin": 0.65
      },
      "snapshotRef": {
        "analysisDate": "2026-11-13",
        "snapshotVersion": 1
      }
    }
  ]
}
```

`findings/etfs.json`：

```json
{
  "schemaVersion": 1,
  "analysisDate": "2026-11-13",
  "snapshotVersion": 1,
  "level": "etf",
  "ruleVersion": "1",
  "items": [
    {
      "id": "etf:510300.SH:etf_drawdown_warning:2026-11-13",
      "ruleCode": "etf_drawdown_warning",
      "ruleVersion": "1",
      "level": "etf",
      "etfCode": "510300.SH",
      "severity": "warning",
      "title": "当前回撤较大",
      "description": "当前回撤 -10.2%，超过 -10% 阈值。",
      "evidence": {
        "currentDrawdown": -0.102,
        "maxDrawdown60d": -0.08
      },
      "thresholds": {
        "currentDrawdownMax": -0.1
      },
      "snapshotRef": {
        "analysisDate": "2026-11-13",
        "snapshotVersion": 1
      }
    }
  ]
}
```

## 10.5 发现排序、去重与上限

1. 去重键：`level + etfCode? + ruleCode + analysisDate`。
2. 市场发现最多 10 条；每只 ETF 最多 5 条；ETF 发现总数最多 500 条。
3. 排序：严重度 `critical > warning > info`，然后 `ruleCode` 升序，再 `etfCode` 升序。
4. 超过上限时截断并写 warning；不得随机选择。
5. 发现不得重复堆叠同一事实；同一规则不在同一天对同一对象重复生成。
6. 发现 ID 必须稳定，便于前端链接和历史对比。

## 10.6 证据与描述

- `evidence` 只允许 `number | string | boolean | null`，不允许嵌套对象或数组。
- 每个数值证据必须来自快照，不得由 AI 生成或推算。
- `description` 使用模板生成，模板变量来自 `evidence` 和 `thresholds`。
- 描述中出现的百分比、金额、数量必须与 evidence 一致；测试必须校验。
- 不使用“建议买入”“推荐配置”“必然上涨”等表述。

## 10.7 规则配置与版本

`rule-config.json` 中每条规则：

```json
{
  "code": "etf_drawdown_warning",
  "enabled": true,
  "level": "etf",
  "severity": "warning",
  "maxFindings": 50,
  "params": {
    "currentDrawdownThreshold": -0.1,
    "maxDrawdown60dThreshold": -0.15
  }
}
```

- 新增规则、修改阈值、修改严重度都必须提升 `ruleVersion`。
- `ruleConfigHash` 进入 manifest。
- 规则启用状态影响 findings，但不影响 ETF 特征、排名和市场统计。
- 规则失败不得导致整个快照失败；单条规则异常记录 warning 并跳过，除非所有规则都失败。

---

# 十一、任务与计算流程

## 11.1 任务类型

| 类型                  | 用途                      |
| --------------------- | ------------------------- |
| `first_run`           | 首次全量初始化            |
| `daily_analysis`      | 每日分析快照              |
| `pool_refresh`        | 只刷新研究池              |
| `valuation_refresh`   | 只刷新估值历史            |
| `recompute`           | 历史行情修正/指定日期重算 |
| `valuation_recompute` | 估值修正重算              |
| `report`              | 生成 AI/模板报告          |
| `maintenance`         | 备份、索引重建、数据校验  |

## 11.2 首次全量运行

```text
1. 校验配置、目录、Node 版本
2. 获取 ETF 列表（全部分页）
3. 规范化、筛选、去重、排序
4. 写入 master/etfs.json 和 selection/latest.json
5. 生成分类建议（可选，不阻塞）
6. 获取研究池全部 ETF 日 K（最多 1000 行）
7. 校验日 K、更新图表缓存
8. 提取唯一 trackIndex
9. 对每个指数分别获取 PE/PB/PS 近五年数据
10. Upsert 估值历史
11. 计算 ETF 特征
12. 计算全池排名
13. 计算市场统计和市场状态
14. 执行规则分析
15. 构建快照临时目录
16. 校验 JSON、样本、完整性、发布门槛
17. 发布快照，更新 snapshot-index 和 current
18. 写任务记录
19. 异步生成报告（可选）
```

首次运行**不等待分类确认**。未确认分类的 ETF 以 `pending` 进入计算和快照；分类只影响分类展示和分类统计。

## 11.3 每日运行

```text
1. 获取 analysisDate 对应的每日锁
2. 判断是否有新交易日；无新数据且非 force → skipped
3. 刷新 ETF 列表；失败则保留旧池并记录 warning
4. 更新 poolHash；若成员集合或代表 ETF 变化，提升 poolVersion
5. 获取全部研究池 ETF 日 K（最多 1000 行）
6. 校验 K 线、更新图表缓存
7. 对唯一 trackIndex 获取 PE/PB/PS 近五年数据
8. 按类型 Upsert 估值历史
9. 计算 ETF 特征
10. 计算全池排名
11. 计算市场统计和市场状态
12. 执行规则分析
13. 构建新快照版本
14. 校验并发布
15. 更新 snapshot-index 和 current
16. 写任务记录，释放锁
17. 异步生成报告
```

注意：这是“快照增量”，不是“抓取增量”。每天仍会重新获取每只 ETF 的 1000 行 K 线和每个指数的近五年估值，这是无权威 K 线存储和估值全量校正的必然结果。

## 11.4 研究池刷新

1. 获取失败：保留旧池，任务继续使用旧池，manifest 记录 `poolSourceStale=true`。
2. 新池为空：拒绝写入，任务失败。
3. 新池数量相对旧池 `< 70%` 或 `> 130%`：默认拒绝；使用 `--force-pool-change` 并记录原因。
4. 池成员变化：提升 `poolVersion`；新快照使用新池；旧快照不变。
5. 同指数代表 ETF 切换：在选择报告中记录 `previousCode` 和 `newCode`；历史快照仍保留旧代表。
6. 新增 ETF：自动在分类映射中写入 `pending` 记录（分类可为空），提升映射版本；不阻塞计算。
7. 新增 ETF 历史不足：进入研究池；依赖窗口的指标为 null；UI 显示样本不足。
8. 移出 ETF：不再出现在新快照；历史快照保留；分类映射记录可保留用于审计。

## 11.5 估值刷新

1. 对每个唯一 `trackIndex` 分别请求 PE、PB、PS。
2. 单类型失败：记录错误，保留旧数据，其他类型继续。
3. `data={}`、items 缺失或为空：记录 `unsupported`，不删除旧数据。
4. 每次成功返回后按唯一键 Upsert。
5. 估值文件使用原子写；写入前校验。
6. 估值刷新完成后再进入计算；单个指数失败不阻塞其他指数。

## 11.6 历史行情修正

触发：

```bash
pnpm etf recompute --from 2026-10-10 --to 2026-11-13 --reason kline_correction
```

流程：

1. 获取研究池和 K 线（每只 ETF 最多 1000 行，只取一次）。
2. 对每个受影响分析日期，过滤 `date <= analysisDate` 的 K 线和估值。
3. 确定受影响日期：默认只重算已有已发布快照的交易日；`--create-missing` 可补建缺失日期。
4. 每个日期独立计算特征、排名、市场统计、规则。
5. 每个日期创建新版本；旧版本保留。
6. `current` 只在修正日期等于当前分析日期时前进到新版本。
7. 任务记录 `affectedDates`、`versionsCreated`、`warnings`。
8. 若修正日期早于可用 K 线窗口，导致所需历史不足：生成快照但相关指标为 null，并写 `history_truncated` warning；不得伪造。
9. 若上游已无法返回修正数据：任务失败，不生成快照。

## 11.7 估值修正

```bash
pnpm etf recompute --from 2026-10-10 --to 2026-11-13 --reason valuation_correction --valuation-only
```

流程：

1. 重新获取并 Upsert 受影响的指数估值。
2. 对受影响分析日期重新构建**完整快照**，不能只替换估值文件后发布半成品。
3. 行情特征可以重新计算；不得从旧快照复制未经校验的中间结果。
4. 旧版本保留；新版本 `reason=valuation_recompute`。
5. 估值修正不影响未受影响日期的快照。

## 11.8 分类修正

1. 更新 `etf-category-mapping.json`，提升 `version`。
2. 不触发历史快照重算。
3. 下一次每日快照使用新分类。
4. 若需要当前日期立即反映分类，运行 `pnpm etf recompute --date <current> --reason category_mapping`，生成新版本。
5. 页面可显示“快照分类”和“当前分类”；两者不一致时给出提示。

## 11.9 报告生成

1. 基础快照发布成功后异步触发。
2. 报告任务独立记录状态。
3. AI 不可用/无 Key 时生成模板报告。
4. 报告失败不改变 current，不改变快照。
5. 同一快照版本重复生成报告时，新报告使用新 `reportId`，旧报告保留或按配置清理。

## 11.10 失败、重试与幂等

| 场景               | 策略                                                          |
| ------------------ | ------------------------------------------------------------- |
| HTTP 超时/429/5xx  | 自动重试 3 次，指数退避                                       |
| 上游业务错误       | 记录错误；该指数/ETF 失败，其他继续                           |
| 计算异常           | 任务失败，不发布                                              |
| 快照校验失败       | 任务失败，current 不变，保留 temp 供诊断                      |
| 发布 rename 失败   | 任务失败，current 不变                                        |
| current 更新失败   | 快照已发布但 current 旧；任务 `partial_success`，下次启动修复 |
| 重复运行相同输入   | fingerprint 相同 → `skipped`，返回已有版本                    |
| `--force` 重复运行 | 创建新版本，`reason=force`                                    |
| 并发同日任务       | 第二个任务 `TASK_CONFLICT`，不等待或最多等 60 秒              |

## 11.11 调度

- 每日 16:00 Asia/Shanghai 运行一次。
- 15:30 前不生成当日快照。
- 16:00 数据仍不完整时，按发布门槛决定 `partial` 或失败。
- 交易日历由 `TradingCalendar` 判断；非交易日默认 `skipped`。
- 支持手动 `pnpm etf daily --force`。

---

# 十二、快照发布与文件安全

## 12.1 发布原则

1. 快照必须完整生成后才能发布。
2. 禁止直接在正式快照目录中逐个覆盖文件。
3. 禁止覆盖已发布版本。
4. 发布失败时 `current.json` 保持不变。
5. 所有写入必须原子化；读取方只看到完整文件。
6. 单机单写者；通过文件锁防止并发发布。

## 12.2 原子写

```ts
interface JsonStore {
  read<T>(path: string, schema: ZodType<T>): Promise<T | null>;
  writeAtomic<T>(path: string, data: T, schema: ZodType<T>): Promise<void>;
  updateAtomic<T>(path: string, schema: ZodType<T>, updater: (current: T | null) => T): Promise<T>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
}
```

`writeAtomic` 步骤：

1. resolve 到 `data/` 根目录内；拒绝 `..`、绝对路径逃逸和软链接逃逸。
2. 用 Zod 校验数据。
3. 规范化为稳定 key 顺序的 JSON。
4. 确保父目录存在。
5. 同目录创建临时文件 `.{basename}.{pid}.{random}.tmp`，使用 `wx` 防止覆盖。
6. 写入、`fd.sync()`、关闭。
7. `rename(temp, target)`；目标已存在时按业务规则处理（快照版本不允许覆盖）。
8. 对父目录执行 `fsync`（POSIX）；Windows 下使用重试和替代策略。
9. 任一步失败删除临时文件并抛错。

`read` 遇到 JSON 解析错误、schema 错误、NaN/Infinity 文本时抛 `DATA_CORRUPT`，不得返回部分数据。

## 12.3 快照构建与发布

```text
1. 获取 data/system/locks/daily-{analysisDate}.lock
2. 在 data/temp/snapshots/{analysisDate}/{version}-{taskId}/ 构建
3. 写入 etfs/rankings/market/findings
4. 计算每个文件的 sha256 和 bytes
5. 写入 manifest（status=validated，files 已填）
6. 执行发布门槛校验
7. 重写 manifest（status=published，publishedAt）
8. fsync 临时目录
9. rename 临时目录到 data/snapshots/{analysisDate}/v{version}
10. fsync snapshots 目录
11. 原子更新 snapshot-index.json
12. 原子更新 current.json（仅当应前进）
13. 释放锁
```

如果第 9 步目标已存在：立即失败，不覆盖。版本号在加锁后重新计算，避免竞态。

## 12.4 发布门槛

默认门槛（可在配置中调整，但必须显式记录）：

| 门槛              | 默认值                                | 失败动作                           |
| ----------------- | ------------------------------------- | ---------------------------------- |
| 研究池非空        | `poolCount >= 1`                      | 失败                               |
| 研究池数量波动    | 旧池的 70%–130%                       | 失败，除非 `--force-pool-change`   |
| K 线有效率        | `klineValidCount / poolCount >= 0.95` | 失败；90%–95% 可 `--allow-partial` |
| ETF 特征文件完整  | 池内每只一个                          | 失败                               |
| 排名文件完整      | 所有启用排名                          | 失败                               |
| 市场文件完整      | 7 个                                  | 失败                               |
| findings 文件完整 | 2 个                                  | 失败                               |
| JSON schema       | 全部通过                              | 失败                               |
| checksum          | 全部匹配                              | 失败                               |
| 未来数据          | 无 `date > analysisDate`              | 失败                               |
| 重复键            | 无重复 ETF/排名项                     | 失败                               |
| 数值范围          | 无 NaN/Infinity                       | 失败                               |
| 估值覆盖率        | 不阻断发布                            | 市场估值标记 `insufficientSample`  |
| 报告              | 不阻断发布                            | 报告任务独立失败                   |

`dataStatus=partial` 的条件：

- K 线有效率 90%–95%，且使用 `--allow-partial`。
- 研究池使用旧池，但 K 线/估值新鲜。
- 单规则失败但其他规则成功。

partial 快照必须在 UI 顶部显示数据质量横幅，并记录所有 warning。

## 12.5 current 与 snapshot-index

1. `current.json` 只指向 `status=published` 且 checksum 校验通过的快照。
2. `snapshot-index.json` 记录每个日期的最新版本和全部版本。
3. `snapshot-index.json` 只记录 `published` 版本；`building/validated/failed` 不进入索引。
4. `current` 的 `analysisDate` 只能前进；同一日期可前进到更高版本。
5. 修正旧日期不改变 current。
6. `current` 更新失败时，快照仍可用日期查询；任务标记 `partial_success`。
7. 启动时校验 current；无效则从 snapshot-index 或目录扫描选择最新有效快照并修复。
8. `snapshot-index` 可重建；重建不得改变版本或 checksum。

## 12.6 文件锁

| 锁                             | 范围     | 用途                |
| ------------------------------ | -------- | ------------------- |
| `master.lock`                  | 全局     | 研究池写入          |
| `valuation-{indexCode}.lock`   | 单指数   | 估值文件读写        |
| `daily-{analysisDate}.lock`    | 单分析日 | 该日期快照构建/发布 |
| `report-{date}-{version}.lock` | 单报告   | 报告生成            |

实现要求：

- 使用 `proper-lockfile` 或等价机制；锁文件包含 `pid`、`taskId`、`host`、`acquiredAt`。
- stale 超时 10 分钟；进程不存在时可安全破锁，并记录 warning。
- 获取超时 60 秒；超时返回 `TASK_CONFLICT`。
- 不允许两个任务同时写同一个估值文件或同一日期快照。
- Web/API 读取不加锁，只读已发布文件。

## 12.7 崩溃恢复

启动时执行：

1. 清理 `data/temp/` 下超过 24 小时的临时目录，移动到 quarantine 或删除。
2. 扫描 `data/snapshots/**/manifest.json`：
   - 缺少 manifest、JSON 损坏、checksum 不匹配 → 标记 invalid，不参与查询。
   - `status != published` → 不参与查询。
3. 重建 `snapshot-index.json`（若缺失或损坏）。
4. 校验 `current.json`；无效时选择最新有效 published 快照并修复。
5. 检查 stale locks；仅当 PID 不存在时清理。
6. 输出恢复报告到日志和任务记录。

## 12.8 备份与恢复

备份命令：

```bash
pnpm data:backup --to /backup/maga
```

包含：

- `data/config/`
- `data/master/`
- `data/valuation/`
- `data/snapshots/`
- `data/reports/`
- `data/system/current.json`
- `data/system/snapshot-index.json`
- `data/system/selection/`

不包含：

- `data/cache/`（可重建）
- `data/temp/`
- `data/system/locks/`
- `data/system/tasks/`（可选，建议保留任务审计）

恢复流程：

1. 停止服务。
2. 校验备份包。
3. 恢复上述目录；不覆盖 `data/config` 前先备份当前配置。
4. 运行 `pnpm etf verify --repair-index`。
5. 校验 current 和 manifest checksum。
6. 启动服务，检查首页和快照查询。

建议保留：30 个日备份、12 个月备份。磁盘至少预留 5GB。

## 12.9 数据损坏

- 发现 checksum 不一致：该快照标记 corrupt；API 返回 `SNAPSHOT_CORRUPT`；current 不指向它。
- 发现估值文件损坏：该指数估值视为不可用，保留原文件供人工恢复；任务失败或 partial。
- 发现 master 损坏：拒绝运行，要求从备份恢复；不得用空池继续。
- 发现配置损坏：拒绝启动，给出具体字段路径。
- 所有损坏事件写入日志和任务记录。

## 12.10 保留与归档

- V0.5.1 默认保留全部已发布快照，便于审计。
- 数据量估算：243 只 ETF × 250 天 × 约 5KB ≈ 300MB/年；估值约 150–300MB；总计 < 1GB/年。
- 若需要归档，按年打包 `data/archive/{year}.tar.zst`，保留 manifest/index；不得删除最近 2 年。
- 归档前必须校验 checksum。

---

# 十三、任务状态管理

## 13.1 任务记录

路径：`data/system/tasks/{taskId}.json`

```json
{
  "schemaVersion": 1,
  "taskId": "task_20261113_20261115T080000Z_ab12cd",
  "type": "daily_analysis",
  "status": "success",
  "analysisDate": "2026-11-13",
  "trigger": "schedule",
  "reason": null,
  "requestedAt": "2026-11-15T08:00:00.000Z",
  "startedAt": "2026-11-15T08:00:01.000Z",
  "finishedAt": "2026-11-15T08:06:30.000Z",
  "steps": [
    {
      "name": "fetch_etfs",
      "status": "success",
      "startedAt": "2026-11-15T08:00:01.000Z",
      "finishedAt": "2026-11-15T08:00:03.000Z",
      "counts": { "fetched": 1721, "pool": 243 },
      "warnings": 0,
      "error": null
    }
  ],
  "snapshotVersion": 1,
  "inputFingerprint": "sha256:...",
  "warnings": [],
  "error": null
}
```

## 13.2 状态

| 状态              | 含义                                        |
| ----------------- | ------------------------------------------- |
| `pending`         | 已创建，未开始                              |
| `running`         | 执行中                                      |
| `success`         | 全部成功                                    |
| `partial_success` | 快照已发布但有 warning，或 current 更新失败 |
| `failed`          | 未完成，未发布或发布失败                    |
| `skipped`         | 无新交易日、相同 fingerprint、或显式跳过    |

任务步骤状态：`pending/running/success/failed/skipped`。

## 13.3 任务 ID

```text
task_{analysisDate}_{UTC时间戳}_{6位随机}
```

示例：`task_20261113_20261115T080000Z_ab12cd`。

任务 ID 只用于审计，不参与快照版本号。

## 13.4 幂等与冲突

1. 同一 `analysisDate` 的写任务必须获取 `daily-{analysisDate}.lock`。
2. 获取不到锁：CLI 最多等 60 秒；API 立即返回 `TASK_CONFLICT`。
3. 发布前计算 `inputFingerprint`；若同日期已有相同 fingerprint 的 published 快照，默认 `skipped`。
4. `--force` 时忽略 fingerprint，生成新版本。
5. 任务重试必须重新获取锁，不得假设锁仍持有。
6. 任务失败不得删除已发布快照。
7. 任务记录写入是原子写；不允许半个 JSON。

## 13.5 步骤命名

固定步骤名，便于统计：

```text
fetch_etfs
select_pool
fetch_klines
validate_klines
fetch_valuations
upsert_valuations
calculate_features
calculate_rankings
calculate_market
run_rules
build_snapshot
validate_snapshot
publish_snapshot
update_current
generate_report
```

每个步骤记录开始、结束、状态、计数、warning 数、错误。

## 13.6 CLI

```bash
pnpm etf first-run
pnpm etf daily
pnpm etf daily --force
pnpm etf daily --allow-partial
pnpm etf pool refresh
pnpm etf valuations refresh
pnpm etf recompute --from 2026-10-10 --to 2026-11-13 --reason kline_correction
pnpm etf recompute --date 2026-11-13 --reason manual
pnpm etf snapshot verify --date 2026-11-13
pnpm etf snapshot verify --all
pnpm etf report --date 2026-11-13 --version 1
pnpm etf data backup --to /backup/maga
pnpm etf data restore --from /backup/maga/xxx.tar.gz
```

## 13.7 保留

- 任务记录保留 1 年；之后可归档到 `data/archive/tasks/{year}.tar.zst`。
- 失败任务的临时目录保留 24 小时，便于诊断；之后清理。
- 日志保留 30 天，结构化 JSON，按天切割。

---

# 十四、AI 研究报告

## 14.1 定位

AI 报告是**快照的解释层**，不是事实来源。报告只能引用快照中已有的指标、排名、市场统计和发现；不得生成新的数值事实。

## 14.2 模式

| 模式       | 说明                                     |
| ---------- | ---------------------------------------- |
| `template` | 无 AI 时由模板和规则生成，确定性、可测试 |
| `ai`       | 调用模型生成，必须引用快照字段           |

默认 `template`；配置 AI 后才使用 `ai`。

## 14.3 报告结构

路径：`data/reports/{analysisDate}/{reportId}.json`

```json
{
  "schemaVersion": 1,
  "reportId": "report_20261113_001",
  "analysisDate": "2026-11-13",
  "snapshotVersion": 1,
  "type": "daily_market_report",
  "mode": "ai",
  "status": "success",
  "model": {
    "provider": "openai",
    "name": "configured-model",
    "promptVersion": "report-v1"
  },
  "generatedAt": "2026-11-15T08:10:00.000Z",
  "inputFingerprint": "sha256:...",
  "content": {
    "title": "2026-11-13 ETF 市场观察",
    "summary": "市场整体震荡，成交活跃度改善，风险水平中性。",
    "sections": [
      {
        "heading": "市场概览",
        "body": "研究池 240 只有效样本，20 日收益中位数 0.8%。",
        "citations": [
          { "path": "market/returns.json", "field": "/returns/20d/median" },
          { "path": "market/returns.json", "field": "/returns/20d/validCount" }
        ]
      }
    ],
    "keyFindings": [{ "ruleCode": "market_activity_improving", "text": "成交活跃度改善。" }]
  },
  "citations": [
    { "path": "market/returns.json", "field": "/returns/20d/median" },
    { "path": "market/state.json", "field": "code" }
  ],
  "error": null
}
```

## 14.4 生成流程

```text
1. 读取已发布快照
2. 构建紧凑报告上下文：市场摘要、主要发现、强弱 ETF、风险与估值
3. 若 AI 关闭：用模板生成
4. 若 AI 开启：发送上下文和输出 schema
5. 解析 JSON；校验 schema
6. 校验每个 citation 的 path/field 存在
7. 校验正文中的百分比/金额是否来自上下文（至少校验 citation 覆盖）
8. 失败：重试 1 次；仍失败则生成模板报告并标记 mode=template
9. 原子写入报告文件
10. 更新报告索引
```

### 14.4.1 报告上下文

传给 AI 的上下文是从快照派生的紧凑对象，不包含原始 K 线：

```json
{
  "analysisDate": "2026-11-13",
  "snapshotVersion": 1,
  "market": {
    "state": { "code": "neutral", "label": "中性震荡", "evidence": {} },
    "returns": { "1d": {}, "20d": {}, "60d": {} },
    "trend": {},
    "risk": {},
    "activity": {},
    "valuation": {}
  },
  "topFindings": [],
  "strongEtfs": [],
  "weakEtfs": [],
  "riskEtfs": [],
  "valuationLowEtfs": [],
  "dataQuality": {
    "klineValidCount": 240,
    "poolCount": 243,
    "valuationCoverage": 0.74,
    "warnings": []
  }
}
```

限制：

- `topFindings` 最多 10 条；每类 ETF 列表最多 10 只。
- ETF 项只包含代码、名称、关键指标、排名和发现，不包含完整特征文件。
- 上下文本身写入 `data/temp/{taskId}/report-context.json` 供审计。

## 14.5 引用校验

1. `path` 必须是快照内已存在的相对路径，例如 `market/returns.json`。
2. `field` 必须是 JSON Pointer（RFC 6901），例如 `/returns/20d/median`；不要使用点号路径，避免数字开头的 key 歧义。
3. 引用值必须是 number、string 或 boolean；null 可以引用但正文不得把它写成 0。
4. 任一 citation 无效 → 整份 AI 报告失败，不回退到“删掉引用继续用”。
5. 报告中的每个关键数字至少有一个 citation。

## 14.6 失败与降级

- AI 超时（60 秒）、限流、无 Key、输出非法 JSON、引用无效：记录失败原因。
- 默认降级为模板报告；报告文件 `mode="template"`、`fallbackFrom="ai"`，并保留 `error` 摘要。
- 模板报告也失败时，报告 `status="failed"`，不影响基础快照和 current。
- AI 报告失败不得删除已成功生成的旧报告。

## 14.7 报告索引

`data/reports/{analysisDate}/index.json`：

```json
{
  "schemaVersion": 1,
  "analysisDate": "2026-11-13",
  "reports": [
    {
      "reportId": "report_20261113_001",
      "snapshotVersion": 1,
      "type": "daily_market_report",
      "mode": "ai",
      "status": "success",
      "generatedAt": "2026-11-15T08:10:00.000Z"
    }
  ]
}
```

## 14.8 安全与成本

- 模型 API Key 只从环境变量读取，不写入配置文件、日志或快照。
- 发送给模型的内容只包含快照摘要、发现和必要的 ETF 名称/代码；不发送 `.env`、任务日志或用户隐私。
- 单次报告设置 60 秒超时、最大输出 token、单日调用次数上限。
- 模型名称、Prompt 版本、生成时间、输入 fingerprint 必须记录。
- 报告页面必须显示“AI 生成/模板生成”标识和引用来源。

## 14.9 报告不进入快照

- 报告文件不进入 `manifest.files`。
- 删除报告不影响快照 checksum。
- 同一快照版本可以有多个报告；以 `reportId` 区分。

---

# 十五、HTML 页面设计

## 15.1 技术方式

- 服务端使用 Hono JSX 渲染页面。
- 客户端只做图表和交互，不重复业务计算。
- ECharts 本地 vendor，不使用 CDN。
- CSS 使用原生 CSS；不引入大型 UI 框架。
- 所有数据通过服务端注入或 API 获取；页面不直接请求上游。

## 15.2 导航

```text
市场总览
ETF 全列表
市场分析
研究报告
系统管理
```

ETF 详情从列表、市场分析、报告进入，不作为一级导航。

## 15.3 全局元素

每个页面必须显示：

- 分析日期、快照版本。
- 数据状态：`complete` / `partial`。
- 最新 K 线日期、有效样本数、估值覆盖率。
- 日期/版本选择器（至少市场总览、市场分析、ETF 列表支持）。
- 数据质量入口；partial 时显示黄色横幅。

## 15.4 市场总览

首页展示：

- 分析日期、ETF 数量、有效样本数、最新行情日期。
- 多周期收益：均值、中位数、上涨比例。
- 涨跌分布、趋势结构、风险分布、估值概况。
- 市场状态及证据。
- 强势/弱势 ETF 各 5–10 只。
- 重要市场发现。
- 成交活跃度变化。

首页以摘要为主，不堆叠全量表格。每个数字旁边提供“样本数/日期”tooltip。

## 15.5 ETF 全列表

功能：

- 全研究池列表。
- 代码/名称搜索。
- 一级/二级分类筛选，含“未分类/待确认”。
- 多维度排序。
- 全池排名和筛选集排名同时显示。
- 分页，默认 50 条/页。

默认列：

| 列              | 说明                          |
| --------------- | ----------------------------- |
| 全池排名        | 当前排序维度下的全池 rank     |
| ETF             | 代码、名称                    |
| 分类            | 一级/二级；pending 显示待确认 |
| 1D/20D/60D 收益 | 小数转百分比                  |
| MA20 偏离       | 趋势位置                      |
| 20D 波动        | 年化波动                      |
| 当前回撤        | 当前回撤                      |
| 20D 均额        | 成交活跃度                    |
| PE 百分位       | 估值位置，附估值日期/滞后     |

规则：

- 切换排序维度时，全池排名仍来自快照；筛选集排名在读取时计算。
- 缺失值显示 `—`，不得显示 0。
- 估值百分位低不标成“推荐”，只显示“偏低”。

## 15.6 ETF 详情

Tab：

1. 综合表现
2. 行情趋势
3. 收益分析
4. 风险分析
5. 成交分析
6. 估值分析
7. 研究发现

展示：

- 基础信息、交易所、跟踪指数、分类状态。
- 多周期收益、均线、BOLL、波动、回撤、成交、估值、历史统计。
- 全池排名和百分位。
- 规则发现。
- 数据质量：K 线行数、最新日期、估值滞后。

行情趋势：

- 日 K/周 K/月 K 蜡烛图，来自 `data/cache/klines`。
- MA5/10/20/60/120 叠加。
- 成交量/成交额副图。
- 周/月 K 由日 K 聚合；聚合规则：open=首日 open，high=max，low=min，close=末日 close，volume/amount=sum。
- 当前周/月未完成时，按已有日数据聚合，并在图表标注“未完成周期”。
- 缓存缺失时，API 按单只 ETF 补拉；页面显示加载状态，不直接访问上游。

历史特征图：

- 从每日快照读取收益、波动、回撤、估值百分位等时间序列。
- 不能从 K 线缓存重算历史特征。

## 15.7 市场分析

- 收益分布、趋势结构、风险分布、成交活跃度、估值分布。
- 历史日期/时间范围选择。
- 市场状态时间线。
- 分类辅助统计；明确标注“辅助维度，不改变全池口径”。
- 数据质量与样本数。

## 15.8 研究报告

- 报告列表：日期、类型、模式、状态、模型、生成时间。
- 报告详情：摘要、分节、引用。
- 引用可点击跳转到对应快照数据/图表。
- AI 报告显示标识；失败报告显示原因和模板替代。

## 15.9 系统管理

- 研究池：数量、poolVersion、最近更新时间、选择报告。
- 分类：已确认/待确认数量、CLI 提示。
- 数据状态：K 线有效性、估值覆盖率、估值滞后、损坏文件。
- 计算任务：状态、步骤、耗时、错误。
- 历史快照：日期、版本、状态、checksum、current。
- 算法/配置/规则版本。
- 规则配置查看（只读；修改用文件+CLI）。

## 15.10 UI 规范

1. 所有百分比保留 2 位小数；金额按亿/万格式化。
2. 缺失值统一 `—` + tooltip；禁止 0 替代。
3. 颜色只辅助，不单独表达含义；涨跌同时用文字/符号。
4. 不使用“买入/卖出/推荐/必涨”等词。
5. 估值高低用“百分位偏低/偏高”，不做方向判断。
6. 页面必须能在 1280px 桌面和 768px 平板使用；手机端至少可读。
7. 图表必须有标题、单位、日期范围、数据来源、空状态。
8. 每个页面有明确空状态和错误状态，不显示空白表格。

---

# 十六、API 设计

## 16.1 通用约定

- 所有接口返回 JSON。
- 成功：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "analysisDate": "2026-11-13",
    "snapshotVersion": 1,
    "generatedAt": "2026-11-15T08:05:00.000Z"
  }
}
```

- 失败：

```json
{
  "ok": false,
  "error": {
    "code": "SNAPSHOT_NOT_FOUND",
    "message": "No published snapshot for 2026-11-14",
    "details": { "date": "2026-11-14" }
  }
}
```

- `date` 缺省为 current 的 `analysisDate`；`version` 缺省为该日期最新 published 版本。
- 所有字符串参数做长度和格式校验；`date` 必须匹配 `^\d{4}-\d{2}-\d{2}$`；`version` 必须为正整数；`code` 必须匹配 `^[A-Za-z0-9]+\.[A-Za-z0-9]+$`。
- 分页：`page >= 1`，`pageSize` 1–200，默认 50。
- 读接口不触发采集/重算；只读已发布快照。
- 缓存：可按 `analysisDate + version + publishedAt` 生成 ETag；current 接口不缓存。

## 16.2 读接口

| 方法 | 路径                            | 功能                             |
| ---- | ------------------------------- | -------------------------------- |
| GET  | `/api/health`                   | 健康检查、数据目录、current 状态 |
| GET  | `/api/market/overview`          | 市场总览摘要                     |
| GET  | `/api/market/analysis`          | 市场深度分析                     |
| GET  | `/api/etfs`                     | ETF 列表、筛选、分页             |
| GET  | `/api/etfs/:code`               | ETF 详情                         |
| GET  | `/api/etfs/:code/history`       | ETF 历史特征序列                 |
| GET  | `/api/etfs/:code/kline`         | 图表 K 线（缓存）                |
| GET  | `/api/rankings`                 | 排名列表/筛选集排名              |
| GET  | `/api/findings`                 | 研究发现                         |
| GET  | `/api/reports`                  | 报告列表                         |
| GET  | `/api/reports/:id`              | 报告详情                         |
| GET  | `/api/snapshots`                | 快照列表                         |
| GET  | `/api/snapshots/:date`          | 某日期最新版本                   |
| GET  | `/api/snapshots/:date/:version` | 指定版本                         |
| GET  | `/api/tasks`                    | 任务列表                         |
| GET  | `/api/tasks/:id`                | 任务详情                         |

查询参数：

```text
?date=2026-11-13
?version=1
?period=20d
?ranking=return_20d
?category=broad_market
?subcategory=cn_core
?q=沪深300
?sort=return_20d
?order=desc
?page=1&pageSize=50
?range=1y
?level=market|etf
```

### 16.2.1 `/api/etfs` 示例

```json
{
  "ok": true,
  "data": {
    "total": 243,
    "page": 1,
    "pageSize": 50,
    "items": [
      {
        "code": "510300.SH",
        "name": "沪深300ETF华泰柏瑞",
        "category": {
          "primaryCode": "broad_market",
          "secondaryCode": "cn_core",
          "status": "confirmed"
        },
        "returns": { "1d": -0.015, "20d": 0.034, "60d": 0.081 },
        "trend": { "ma20Deviation": -0.011, "maAlignment": "neutral" },
        "risk": { "volatility20d": 0.19, "currentDrawdown": -0.03 },
        "activity": { "amountRatio20d": -0.105 },
        "valuation": { "pePercentile": 0.7376, "peLagDays": 0 },
        "ranks": {
          "return_20d": { "rank": 80, "percentile": 0.67 },
          "valuation_pe": { "rank": 190, "percentile": 0.21 }
        }
      }
    ]
  },
  "meta": { "analysisDate": "2026-11-13", "snapshotVersion": 1 }
}
```

### 16.2.2 `/api/etfs/:code/kline`

```text
GET /api/etfs/510300.SH/kline?period=day&limit=250&date=2026-11-13
```

- `period`: `day|week|month`。
- `limit`: 1–1000。
- 只读取图表缓存；缓存缺失时服务端补拉单只 ETF。
- 返回 `rows`，每行 OHLCV/amount。
- 不得用于特征计算。

## 16.3 管理接口

仅允许本机访问；如绑定非 loopback，必须设置 `ADMIN_TOKEN`。

| 方法 | 路径                            | 功能              |
| ---- | ------------------------------- | ----------------- |
| POST | `/api/admin/tasks/daily`        | 触发每日任务      |
| POST | `/api/admin/tasks/first-run`    | 触发首次全量      |
| POST | `/api/admin/tasks/recompute`    | 触发历史修正      |
| POST | `/api/admin/pool/refresh`       | 刷新研究池        |
| POST | `/api/admin/valuations/refresh` | 刷新估值          |
| POST | `/api/admin/reports/generate`   | 生成报告          |
| POST | `/api/admin/snapshots/verify`   | 校验快照/重建索引 |

管理接口返回 `taskId`，任务异步执行；客户端轮询 `/api/tasks/:id`。

请求体：

```ts
interface DailyTaskRequest {
  force?: boolean;
  allowPartial?: boolean;
}

interface RecomputeRequest {
  from?: DateString;
  to?: DateString;
  date?: DateString;
  reason: "kline_correction" | "valuation_correction" | "manual" | "category_mapping";
  createMissing?: boolean;
  valuationOnly?: boolean;
  force?: boolean;
}

interface GenerateReportRequest {
  date?: DateString;
  version?: number;
  type?:
    "daily_market_report" | "etf_deep_dive" | "market_anomaly" | "risk_note" | "valuation_note";
  mode?: "template" | "ai";
}
```

## 16.4 错误码

| 错误码                 | HTTP | 说明                     |
| ---------------------- | ---- | ------------------------ |
| `INVALID_QUERY`        | 400  | 参数格式/范围错误        |
| `ETF_NOT_FOUND`        | 404  | ETF 不在快照             |
| `SNAPSHOT_NOT_FOUND`   | 404  | 日期/版本不存在          |
| `SNAPSHOT_CORRUPT`     | 500  | checksum/schema 失败     |
| `REPORT_NOT_FOUND`     | 404  | 报告不存在               |
| `TASK_NOT_FOUND`       | 404  | 任务不存在               |
| `TASK_CONFLICT`        | 409  | 同日任务正在运行         |
| `DATA_CORRUPT`         | 500  | 本地 JSON 损坏           |
| `CONFIG_INVALID`       | 500  | 配置校验失败             |
| `UPSTREAM_UNAVAILABLE` | 502  | 上游不可用（仅管理接口） |
| `ADMIN_FORBIDDEN`      | 403  | 管理接口未授权           |
| `INTERNAL_ERROR`       | 500  | 未分类错误               |

## 16.5 安全

- 默认绑定 `127.0.0.1`，不暴露公网。
- 路径参数只允许白名单字符；禁止 `..`、`/`、URL 编码绕过。
- 请求体大小限制 1MB。
- 管理接口只允许 loopback 或 `ADMIN_TOKEN`。
- 不在错误响应中输出堆栈、文件绝对路径或密钥。
- 设置基础安全响应头；页面不加载第三方脚本。

---

# 十七、核心 TypeScript 类型

以下类型是可执行契约，实施时不得退化为 `any` 或大面积 `unknown`。

```ts
type DateString = string; // YYYY-MM-DD
type EtfCode = string; // 510300.SH
type IndexCode = string; // 000300.SH
type ValuationType = "PE" | "PB" | "PS";
type SnapshotStatus = "building" | "validated" | "published" | "failed";
type DataStatus = "complete" | "partial";
type TaskStatus = "pending" | "running" | "success" | "partial_success" | "failed" | "skipped";
type Severity = "info" | "warning" | "critical";
type MarketStateCode =
  "risk_rising" | "weak" | "strong" | "diverging" | "activity_improving" | "neutral";

interface Etf {
  code: EtfCode;
  name: string;
  exchange: "SH" | "SZ" | "BJ" | "OTHER";
  scale: number;
  trackingIndex: string | null;
  trackIndex: IndexCode;
  premiumRate: number | null;
  amount: number | null;
}

interface Kline {
  code: EtfCode;
  date: DateString;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
  change: number;
  changePercent: number;
}

interface IndexValuation {
  code: IndexCode;
  date: DateString;
  type: ValuationType;
  value: number;
  historicalPercentile: number | null;
  peg: number | null;
  pegUsable: boolean;
  source: "hongsehuojian";
  collectedAt: string;
}

interface CategoryAssignment {
  primaryCode: string | null;
  secondaryCode: string | null;
  status: "pending" | "confirmed";
  mappingVersion: number;
}

interface ReturnsFeatures {
  "1d": number | null;
  "5d": number | null;
  "20d": number | null;
  "60d": number | null;
  "120d": number | null;
  "250d": number | null;
  ytd: number | null;
}

interface BollingerFeatures {
  middle: number | null;
  upper: number | null;
  lower: number | null;
  percentB: number | null;
  bandwidth: number | null;
}

interface TrendFeatures {
  close: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma20Deviation: number | null;
  ma60Deviation: number | null;
  aboveMa20: boolean | null;
  aboveMa60: boolean | null;
  aboveMa120: boolean | null;
  maAlignment: "bullish" | "bearish" | "neutral" | null;
  maAlignmentScore: number | null;
  boll20: BollingerFeatures;
}

interface RiskFeatures {
  volatility20d: number | null;
  volatility60d: number | null;
  volatility120d: number | null;
  maxDrawdown20d: number | null;
  maxDrawdown60d: number | null;
  maxDrawdown120d: number | null;
  maxDrawdown250d: number | null;
  currentDrawdown: number | null;
  sampleHigh: number | null;
  distanceFromSampleHigh: number | null;
  maxDrawdown60dPeakDate: DateString | null;
  maxDrawdown60dTroughDate: DateString | null;
}

interface ActivityFeatures {
  amount: number | null;
  averageAmount5d: number | null;
  averageAmount20d: number | null;
  averageAmount60d: number | null;
  amountRatio20d: number | null;
  amountRatio60d: number | null;
  amountSampleCount20d: number;
}

interface ValuationFeature {
  value: number;
  historicalPercentile: number | null;
  date: DateString;
  lagDays: number;
  lagTradingDays: number;
  peg: number | null;
  pegUsable: boolean;
  source: "hongsehuojian";
  freshness: "fresh" | "stale" | "too_stale";
}

interface ValuationFeatures {
  pe: ValuationFeature | null;
  pb: ValuationFeature | null;
  ps: ValuationFeature | null;
}

interface HistoryStats {
  tradingDays: number;
  totalReturn: number;
  annualizedReturn: number | null;
  meanDailyReturn: number;
  medianDailyReturn: number;
  dailyReturnStd: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxUpStreak: number;
  maxDownStreak: number;
  newHighCount: number;
  averageAmount: number | null;
  amountSampleCount: number;
}

interface EtfFeatureFile {
  schemaVersion: 1;
  code: EtfCode;
  name: string;
  exchange: Etf["exchange"];
  analysisDate: DateString;
  latestKlineDate: DateString | null;
  category: CategoryAssignment;
  dataQuality: {
    sampleValid: boolean;
    klineRows: number;
    firstKlineDate: DateString | null;
    lastKlineDate: DateString | null;
    amountSampleCount20d: number;
    warnings: string[];
  };
  features: {
    returns: ReturnsFeatures;
    trend: TrendFeatures;
    risk: RiskFeatures;
    activity: ActivityFeatures;
    valuation: ValuationFeatures;
    history: Record<"1m" | "3m" | "6m" | "ytd" | "1y" | "2y", HistoryStats | null>;
  };
  computedAt: string;
}

interface RankingItem {
  rank: number;
  code: EtfCode;
  value: number;
  percentile: number;
  sampleValid: true;
}

interface RankingFile {
  schemaVersion: 1;
  rankingCode: string;
  analysisDate: DateString;
  snapshotVersion: number;
  direction: "asc" | "desc";
  interpretation: "higher_is_better" | "lower_is_better" | "neutral";
  totalCount: number;
  eligibleCount: number;
  insufficientSample: boolean;
  minSample: number;
  items: RankingItem[];
}
```

其他类型（`SnapshotManifest`、`MarketStats`、`Finding`、`TaskRecord`、`Report`）按第六、九、十、十三、十四章定义实现，禁止使用 `Record<string, any>` 替代。

---

# 十八、数据质量与异常处理

## 18.1 异常处理矩阵

| 异常                             | 处理                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| ETF 列表请求失败                 | 保留旧研究池；任务继续或失败取决于是否有可用旧池；记录 `POOL_SOURCE_STALE` |
| ETF 列表为空                     | 拒绝覆盖旧池，任务失败                                                     |
| `securityCode` 缺失              | 排除，记录 `missing_code`                                                  |
| `securityName` 缺失              | 排除，记录 `missing_name`                                                  |
| `trackIndex` 缺失                | 排除，记录 `missing_track_index`                                           |
| `scale` 为 null/非法             | 排除，记录 `scale_missing_or_invalid`                                      |
| `scale` 低于 3 亿                | 排除，记录 `scale_below_threshold`                                         |
| 名称含“短融/债”                  | 排除，记录 `debt_name`                                                     |
| `amount` 为空                    | 跳过成交额规则                                                             |
| `amount` 非数字                  | 视为缺失，跳过规则，记录 `amount_invalid`                                  |
| 同指数重复                       | 保留规模最大；平局按 2.2.1                                                 |
| 日 K 请求失败                    | 该 ETF 无效；记录错误；其他 ETF 继续                                       |
| 日 K 为空                        | 该 ETF 无效；`sampleValid=false`；不填 0                                   |
| 日 K 重复日期                    | 保留最后一条；记录 `KLINE_DUPLICATE_DATE`                                  |
| 日 K 乱序                        | 排序；记录 `KLINE_OUT_OF_ORDER`                                            |
| 日 K 数值异常                    | 该行无效；记录原因；不静默修正                                             |
| `latestKlineDate < analysisDate` | 该 ETF 当日无效；不向前填充                                                |
| 估值请求失败                     | 保留旧估值；该类型标记失败；其他类型继续                                   |
| 估值 data 为空、items 缺失或为空 | 记录 `unsupported`；不删除旧数据                                           |
| 估值百分位超范围                 | 保存 null；记录 `VALUATION_PERCENTILE_RANGE`                               |
| 估值日期晚于分析日               | 丢弃该条；记录 `FUTURE_VALUATION`                                          |
| 样本不足                         | null；记录样本数                                                           |
| 排名样本不足                     | `insufficientSample=true`；空 items                                        |
| 单条规则异常                     | 跳过该规则，记录 warning；其他规则继续                                     |
| all rules 失败                   | 任务失败，不发布                                                           |
| 快照写入失败                     | 不发布；current 不变                                                       |
| 快照校验失败                     | 不发布；保留 temp                                                          |
| current 更新失败                 | 快照已发布；任务 `partial_success`；启动时修复                             |
| AI 报告失败                      | 模板降级；不影响快照                                                       |
| 配置损坏                         | 拒绝启动，输出字段路径                                                     |
| 数据文件损坏                     | `DATA_CORRUPT`；current 不指向；人工恢复                                   |

## 18.2 禁止的“修复”

- 不允许把缺失价格/成交额补 0。
- 不允许用前一日价格填充停牌日。
- 不允许用 ETF 行情日期替代估值日期。
- 不允许用当前分类回填历史快照。
- 不允许用最新研究池重写历史研究池。
- 不允许把 `scale=null` 当 0 后继续计算。
- 不允许把估值百分位 `1` 猜测成 1% 或 100%；本数据源统一按 0–100 百分数处理。
- 不允许在上游失败时生成“空但成功”的快照。
- 不允许为了通过校验而删除 warning。
- 不允许在测试里跳过关键断言来“通过”。

## 18.3 错误与警告结构

```ts
interface WarningItem {
  code: string;
  message: string;
  context?: Record<string, string | number | boolean | null>;
}

interface TaskError {
  code: string;
  message: string;
  step?: string;
  retryable: boolean;
  context?: Record<string, string | number | boolean | null>;
}
```

- `warning.code` 使用大写下划线，例如 `KLINE_DUPLICATE_DATE`。
- warning 不得为空字符串；必须有可读 message。
- 错误不得包含堆栈到 API 响应；堆栈只进日志。
- 日志字段：`taskId`、`step`、`code`、`durationMs`、`counts`。

## 18.4 数据验证文档

阶段 0 必须创建 `docs/data-verification.md`，至少记录：

- 请求日期、接口、参数。
- `securityCode` 后缀验证。
- `scale`/`amount` 单位验证。
- `premiumRate` 单位验证。
- `historicalPercentile` 量纲验证。
- 估值覆盖清单（支持/不支持指数）。
- `adjust=1` 前复权口径（已确认，不再作为待验证项）。
- 交易日历验证。
- 最新数据可用时间。

该文档是代码假设的依据；上游变化时必须更新。

## 18.5 日志

- 结构化 JSON 日志，输出到 stdout 和文件。
- 默认 info；调试时 debug；错误 error。
- 记录任务开始/结束、步骤、计数、耗时、失败摘要。
- 不记录完整响应体、Cookie、Token、API Key。
- 日志文件按天切割，保留 30 天。

---

# 十九、开发实施顺序

Codex 必须按阶段开发，每阶段完成后运行测试并报告，不得一次性生成全部模块后再验证。

## 阶段 0：v2 脚手架与数据验证

实现/检查：

- 检查 `v2` 工作区；确认不迁移 `main` 应用代码。
- 初始化 Node/TypeScript/pnpm 项目。
- 配置 `tsconfig`、Vitest、ESLint/Prettier（如采用）。
- 创建 `data/` 目录和配置文件骨架。
- 编写 `scripts/verify-source.ts`，通过 `pnpm verify:source` 执行 3.9 的验证项。
- 创建 `docs/data-verification.md`。

验收：

- `pnpm install`、`pnpm typecheck`、`pnpm test` 可运行。
- 能成功请求 ETF 列表、日 K、估值各一次。
- 记录代码后缀、单位、百分位、估值覆盖和已确认的前复权口径。
- 输出“现状 + 风险 + 待确认”报告。

**阶段 0 不实现业务计算。**

## 阶段 1：数据源与夹具

实现：

- `sources/http.ts`：超时、重试、限流、日志。
- `EtfSource`、`KlineSource`、`ValuationSource`。
- 原始响应类型和 Zod 校验。
- `test/fixtures/`：ETF 列表、K 线、估值样本。
- 网络 mock 测试。

验收：

- 真实接口各跑通一次。
- mock 测试不访问网络。
- 空 items、业务错误、超时、429、字段缺失都有测试。
- 解析结果与真实样例一致。

## 阶段 2：存储、配置与原子写

实现：

- `JsonStore`、`DataPaths`、`ConfigLoader`。
- Zod schema、canonical JSON、checksum。
- 原子写、目录 fsync、锁。
- `data/` 初始化和 `.gitignore`。

验收：

- 并发写同一文件不会产生半文件。
- 模拟进程崩溃后无残留目标文件损坏。
- schema 错误、路径逃逸、NaN/Infinity 被拒绝。
- 锁冲突返回 `TASK_CONFLICT`。

## 阶段 3：研究池与选择报告

实现：

- ETF 规范化。
- 第二章筛选/去重/排序。
- `master/etfs.json`、`selection/latest.json`。
- `poolVersion/poolHash`。
- 分类映射读取和 pending 处理。
- 分类映射缺失时不阻塞任务，自动写入 `pending` 记录。

验收：

- 用夹具覆盖 null scale、空 amount、`"0"`、科学计数法、重复 trackIndex、债名。
- 过滤后数量、代表 ETF、排序与期望一致。
- 采集失败不覆盖旧池。
- 池变化触发版本提升。

## 阶段 4：日 K 处理与图表缓存

实现：

- K 线解析、排序、去重、数值校验。
- 周 K/月 K 聚合。
- `data/cache/klines` 写入和截断。
- 无未来数据校验。

验收：

- 样例 K 线解析正确。
- 重复/乱序/无效行处理符合 18.1。
- 周/月聚合 OHLCV 正确。
- 缓存最多 1000 行，删除后可重建。
- 计算模块不读取缓存。

## 阶段 5：估值历史

实现：

- 唯一指数提取。
- PE/PB/PS 独立采集。
- 百分位归一、PEG 规则、Upsert、coverage。
- 单类型失败隔离。

验收：

- `data={}`、items 缺失或为空不删除旧数据。
- 百分位 0、1、73.76、超范围、null 都有测试。
- PE/PB/PS 独立文件更新。
- 不支持指数标记 `unsupported`。

## 阶段 6：特征引擎

实现状态（2026-11-15）：已完成。`src/calculations/` 为纯计算层，不读取图表缓存；计算前过滤未来行并拒绝重复日期，序列化前统一 `roundTo(12)`。最新 K 线与 `analysisDate` 不一致时，当日依赖指标输出 null，历史统计保留并记录 `KLINE_STALE`；空 K 线记录 `KLINE_EMPTY`。分类为 `pending` 时正常计算。

实现：

- 收益、趋势、风险、成交、估值、历史统计。
- 空值、单位、roundTo、样本数。
- 黄金夹具期望值。

验收：

- 100% 公式单测通过。
- 与独立计算的黄金样本误差 `<= 1e-12`（或约定容差）。
- 样本不足返回 null，不填 0。
- 无未来数据。
- 停牌/缺失行行为符合 7.1。

## 阶段 7：排名与市场分析

实现状态（2026-11-15）：已完成。`src/rankings/` 生成 13 个排名代码，支持竞赛式并列、方向、最小样本与筛选集双排名；`risk_score` 使用波动率和回撤的横截面数值百分位合成。`src/market/` 实现收益、趋势、风险、成交、估值统计和六态优先级匹配；各指标独立分母，估值按唯一指数去重，市场状态输出证据与配置阈值。V0.5.1 不生成综合排名。

实现：

- 13 个排名代码。
- 并列、方向、百分位、样本不足。
- 市场收益/趋势/风险/成交/估值统计。
- 市场状态规则。

验收：

- 排名并列、空值、样本不足有测试。
- 筛选集排名不改变全池排名。
- 市场统计分母按指标独立。
- 市场状态与证据一致。

## 阶段 8：规则与发现

实现状态（2026-11-15）：已完成。`src/rules/` 实现 11 条 ETF 规则与 10 条市场规则，阈值全部来自 `rule-config.json`。发现包含稳定 ID、规则版本、严重度、模板描述、扁平证据、阈值和快照引用；支持严重度排序、去重、单规则上限、每只 ETF 5 条、ETF 合计 500 条、市场合计 10 条。单规则异常隔离为 warning，全部启用规则失败时任务失败；无上一快照时趋势改善规则标记为 `not_evaluated`。特征文件补充 `trend.close`，供规则直接引用快照事实。

实现：

- ETF/市场规则表。
- 证据、阈值、排序、去重、上限。
- rule-config 版本和哈希。

验收：

- 每条规则有触发/不触发测试。
- 发现可追溯到指标和快照。
- 上限/排序/去重稳定。
- 规则失败不影响其他规则。

## 阶段 9：快照、任务与发布

实现状态（2026-11-15）：已完成。`src/snapshots/` 在 `data/temp/` 构建完整快照，写入并逐文件计算 checksum 后生成 `manifest.json`；发布前校验 schema、必需文件、ETF/排名/市场/findings 完整性、重复键、未来数据和文件字节，再原子 rename 到不可覆盖的 `data/snapshots/{date}/v{version}/`。服务支持 K 线覆盖率与池规模发布门槛、`complete/partial` 数据状态、相同 `inputFingerprint` 默认 `skipped` 与 `--force` 新版本；`snapshot-index.json` 与只前进的 `current.json` 分别更新，current 更新失败记录 `CURRENT_UPDATE_FAILED` 并返回 `partial_success`。`src/tasks/` 写入任务与固定步骤状态，按分析日使用 `daily-{date}.lock`；`src/snapshots/recovery.ts` 可清理 24 小时前临时文件、识别损坏快照、重建索引、修复 current 并清理无主进程的 stale lock。CLI 提供 `pnpm snapshot:verify` 与 `pnpm system:recover`。

实现：

- 快照构建、manifest、checksum。
- 发布门槛、原子 rename、current、snapshot-index。
- 任务状态、锁、幂等、重试。
- 崩溃恢复、校验命令。

验收：

- 发布失败 current 不变。
- 已发布快照不可覆盖。
- 同日多版本可查询。
- 相同输入重复运行 `skipped`。
- 并发任务冲突可控。
- 模拟中断后可恢复。

## 阶段 10：API 与 HTML 页面

实现状态（2026-11-15）：已完成。`src/server/` 提供可注入服务上下文的 `createApp(services)` 与默认 `app`；`SnapshotReader` 只读已发布快照，当前读取执行 manifest、checksum、完整性校验，历史 ETF 读取按目标文件再次校验字节数与 SHA-256。读 API 覆盖健康检查、市场总览/分析、ETF 列表/详情/历史/K 线、排名、发现、快照与任务；统一返回 `ok/data/meta`，参数错误返回 400，缺少 ETF/快照/任务返回 404，checksum 损坏返回 `SNAPSHOT_CORRUPT`，且不向响应输出堆栈或绝对路径。页面覆盖市场总览、ETF 全列表、ETF 详情、市场分析、报告占位与系统管理；全局展示分析日期、版本、`complete/partial`、最新 K 线日期、有效样本和估值覆盖率，partial 显示黄色横幅，缺失值统一 “—”。列表同时显示全池排名与筛选集排名；K 线图表在缓存缺失或超过 1 个交易日未更新时只补拉单只 ETF，历史特征只读每日快照。ECharts 从本地 `node_modules` 提供，无 CDN；CSS 提供 1080px/768px 断点。报告列表/详情按阶段 11 实现，当前返回空列表与明确空状态。

实现：

- 第十六章读接口。
- 市场总览、ETF 列表、ETF 详情、市场分析、报告、系统管理。
- ECharts 图表、日期/版本选择、数据质量提示。
- K 线缓存补拉。

验收：

- 页面只读已发布快照。
- 历史日期/版本正确。
- 筛选/排序/分页正确。
- null 显示 `—`。
- 页面不直接调用上游。
- 1280px/768px 布局可用。

## 阶段 11：报告、E2E 与运维

实现：

- 模板报告。
- AI 报告（可选）与引用校验。
- E2E 场景。
- 备份/恢复、索引重建、数据校验。
- 运行手册。

验收：

- AI 失败降级模板，不阻塞快照。
- E2E 全部通过。
- 备份恢复后 current/checksum 正常。
- 每日任务在目标时间内完成。

## 阶段 12：分类映射确认（最后收尾）

性质：数据运营环节，不是前 11 个阶段的开发门禁。

执行：

- 运行 `pnpm categories:suggest` 生成建议。
- 按研究池分批人工确认一级/二级分类。
- 运行 `pnpm categories:validate` 校验完整性和代码合法性。
- 运行一次新的快照任务，使确认后的分类进入下一快照。

验收：

- 池内每只 ETF 都有一条映射记录；允许仍有显式 `pending`，但 `confirmed` 必须完整合法。
- 分类确认不修改任何历史快照、不触发历史特征重算。
- 页面能区分“已确认”和“待确认”，统计只纳入已确认分类。

---

# 二十、Codex 开发约束

1. `v2` 全新重写；不得复制 `main` 的 Prisma/SQLite、回测、策略、旧路由、旧页面。
2. `main` 只参考爬虫接口行为；不要把旧应用结构带进 v2。
3. 不得引入 Prisma、SQLite、PostgreSQL、MySQL、Redis 或其他数据库/缓存服务。
4. 不得让计算依赖本地权威日 K 存储；图表缓存是唯一例外，且不得被计算读取。
5. 不得使用分析日期之后的数据。
6. 不得用 0、空字符串或前值填充缺失数据。
7. 不得覆盖已发布快照；修正必须新版本。
8. 不得在页面请求中执行全量采集或全量重算。
9. 不得让 AI 生成快照之外的事实；报告必须引用快照。
10. 不得自行发明规则阈值、市场状态阈值或综合排名权重；使用配置并保留可追溯记录。
11. 不得修改六大分类体系和既定二级分类代码。
12. 不得把分类作为计算前置条件；pending 分类必须可计算。
13. 不得把筛选集排名冒充全池排名。
14. 不得使用裸 ETF/指数代码；必须保留交易所/市场后缀。
15. 不得把 `historicalPercentile` 的 0–100 量纲猜成 0–1；统一按百分数除以 100。
16. 不得把 PEG 用于 PB/PS 或默认排名。
17. 不得绕过 schema 校验直接写 JSON。
18. 不得使用非原子写入发布快照。
19. 不得在 `pnpm test` 中访问真实网络；真实接口验证由 `pnpm verify:source` 单独执行。
20. 不得在日志、配置、快照中写入密钥、Cookie、Token。
21. 所有计算、排名、市场统计、规则必须是可测试的纯函数或可注入依赖的服务。
22. 每个阶段完成后运行 `pnpm typecheck` 和 `pnpm test`，并报告结果。
23. 数据结构变化必须提升 `schemaVersion` 或 `algorithmVersion`，并更新文档。
24. 遇到本文未定义的业务口径，停止并报告，不得自行定案。
25. 不得为了简化而删除历史版本、checksum、发布门槛或数据质量检查。

---

# 二十一、验收标准

## 21.1 数据层

- 研究池筛选与第二章完全一致。
- 代码保留 `.SH/.SZ` 后缀；裸代码不会被请求。
- `scale`/`amount` 单位正确；null/空值规则正确。
- 同指数只保留一只代表 ETF；平局规则可复现。
- 日 K 不写入权威长期存储；图表缓存可删除重建。
- 估值 PE/PB/PS 独立保存、独立失败、Upsert 不丢历史。
- 所有 JSON 通过 schema 校验；无 NaN/Infinity。

## 21.2 计算层

- 1D/5D/20D/60D/120D/250D/YTD 公式与第七章一致。
- 收益、均线、BOLL、波动率、回撤、成交、历史统计全部有黄金样本测试。
- 波动率使用总体标准差 × `sqrt(252)`；年化使用几何年化；Sharpe 默认无风险利率 0。
- 样本不足返回 null，不填 0。
- 不使用未来数据。
- 停牌/缺失交易日不向前填充。
- 估值日期、滞后自然日/交易日正确。
- 相同输入重复计算结果字节级一致（在 roundTo(12) 后）。

## 21.3 排名与市场层

- 13 个排名代码全部生成，方向正确。
- 并列、空值、样本不足、最小样本规则可复现。
- 全池排名与筛选集排名同时存在且不混淆。
- 市场统计每个指标使用自己的有效样本。
- 市场状态由规则和证据生成，同一输入结果稳定。
- 综合排名默认关闭，未生成 `overall.json`。

## 21.4 规则层

- ETF/市场规则均可配置启停和阈值。
- 每条发现包含 ruleCode、ruleVersion、evidence、thresholds、snapshotRef。
- 发现可回溯到快照字段。
- 规则失败隔离，不导致整份快照失败。
- 不出现投资建议式措辞。

## 21.5 快照与历史层

- 每日快照可查询。
- 历史快照不可覆盖。
- 同日多版本可查询。
- 历史修正为每个受影响日期生成新版本。
- current 始终指向有效 published 快照。
- 快照发布失败 current 不变。
- checksum 校验能发现损坏。
- snapshot-index 可重建。
- 历史修正不伪造缺失数据。

## 21.6 API 与页面层

- 所有读接口只读已发布快照。
- 日期/版本缺省行为正确。
- 分页、筛选、排序、搜索正确。
- 页面显示分析日期、版本、样本数、数据质量。
- 缺失值显示 `—`，不显示 0。
- 页面不直接调用上游；K 线缓存补拉经服务端。
- 市场总览、ETF 列表、ETF 详情、市场分析、报告、系统管理均可访问。
- 系统管理可查看任务、快照、checksum、配置版本。

## 21.7 报告层

- 模板报告可离线生成。
- AI 报告必须通过引用校验。
- AI 失败降级模板，不阻塞快照。
- 报告记录模型、Prompt 版本、快照版本、输入 fingerprint。
- 报告不修改快照。

## 21.8 工程与运维

- `pnpm typecheck` 通过。
- `pnpm test` 通过；计算、排名、存储、快照模块覆盖率 >= 80%。
- `pnpm build` 通过。
- 无 Prisma/SQLite/数据库依赖。
- 无真实网络依赖的测试。
- 无 `any` 漏网（原始响应解析可局部使用 `unknown` + Zod）。
- 备份/恢复脚本可用。
- 数据损坏时可诊断、可恢复。
- 日志不泄露密钥。

## 21.9 E2E 场景

| 场景                             | 断言                                                  |
| -------------------------------- | ----------------------------------------------------- |
| 首次全量                         | 生成 master、valuation、snapshot、current；无分类阻塞 |
| 每日运行                         | 生成新日期快照；current 前进                          |
| 重复运行相同输入                 | `skipped`，不新增版本                                 |
| `--force` 重跑                   | 新版本，旧版本不变                                    |
| 单只 ETF 日 K 缺失               | 该 ETF 指标 null；市场样本减少；快照按门槛发布/失败   |
| 单只 ETF 日 K 重复/乱序          | 去重排序；记录 warning；结果正确                      |
| 估值接口单类型失败               | 该类型保留旧数据；其他类型更新                        |
| 估值 data 为空、items 缺失或为空 | 标记 unsupported；不删除历史                          |
| 估值百分位超范围                 | null + warning；不中断                                |
| 历史 K 线修正                    | 受影响日期生成新版本；旧版本 checksum 不变            |
| 历史估值修正                     | 完整新快照；行情未受影响时结果一致                    |
| 分类映射变化                     | 不触发历史重算；下一快照使用新分类                    |
| 研究池数量异常                   | 默认拒绝；`--force-pool-change` 可覆盖并记录          |
| 快照写入中途失败                 | current 不变；temp 保留；任务失败                     |
| checksum 损坏                    | 页面/API 报 `SNAPSHOT_CORRUPT`；current 不指向        |
| 并发同日任务                     | 第二个 `TASK_CONFLICT`，不产生双版本                  |
| 非交易日运行                     | `skipped`，不生成新日期                               |
| AI 无 Key                        | 模板报告；快照正常                                    |
| AI 引用无效                      | 报告失败/降级；快照正常                               |

## 21.10 性能目标

| 项目             | 目标                               |
| ---------------- | ---------------------------------- |
| 研究池规模       | 约 243 只（随市场变化）            |
| 日抓取请求       | 约 1 + 243 + 729 ≈ 973 次          |
| 每日任务总耗时   | 目标 < 15 分钟，硬超时 30 分钟     |
| 快照发布         | < 5 秒（本地磁盘）                 |
| 页面 API p95     | < 200ms（本地 JSON，排除首次补拉） |
| 单 ETF 特征文件  | < 20KB                             |
| 年度快照体积     | < 1GB（含估值/报告，不含备份）     |
| 数据目录最小磁盘 | 5GB                                |

## 21.11 Definition of Done

交付前逐项确认：

- [ ] 文档中的数据契约、公式、排名、规则、阈值已在代码中体现。
- [ ] 真实上游接口验证通过，`docs/data-verification.md` 已更新。
- [ ] 首次全量、每日运行、历史修正三条主流程跑通。
- [ ] 黄金样本测试通过。
- [ ] 快照失败/并发/损坏场景测试通过。
- [x] 页面和 API 可访问，缺失数据展示正确。
- [x] 模板报告、AI 引用校验与失败降级通过测试。
- [x] 备份/恢复演练通过（含破坏数据后恢复与 checksum 复验）。
- [ ] 分类映射已完成人工确认（阶段 12，最后收尾；不阻塞前 11 个阶段）。
- [ ] 无数据库依赖、无 Prisma/SQLite。
- [ ] 无 `main` 旧应用代码迁移。
- [x] README 与 `docs/runbook.md` 包含启动、任务、备份、恢复、常见故障命令。

---

# 二十二、待确认事项

以下事项不阻塞阶段 0–2 的开发；涉及展示、阈值或外部服务的，按本文默认值实现，用户可后续调整。

| 事项            | 本文默认            | 需要确认                                  |
| --------------- | ------------------- | ----------------------------------------- |
| 实际研究池分类  | 生成建议，人工确认  | 需要用户逐批确认 243 只 ETF 的分类        |
| 规则阈值        | 第十章默认值        | 首次上线前确认；可调                      |
| 市场状态阈值    | 第九章默认值        | 首次上线前确认；可调                      |
| AI 报告         | 默认模板；AI 可选   | 模型、供应商、Key、成本上限               |
| 服务部署        | `127.0.0.1:3000`    | 端口、是否内网访问                        |
| 备份位置        | 本地 `/backup/maga` | 实际备份盘/NAS                            |
| 数据使用条款    | 未判断              | 上线前确认上游数据使用许可                |
| `adjust=1` 复权 | 前复权              | 已确认：`adjust=1` 就是前复权，误差可接受 |
| 图表缓存        | 允许有界缓存        | 如不允许落盘，需改按需请求                |
| `DID` 估值      | 不进入 V0.5.1       | 如需保留，定义迁移方案                    |
| 行业分布接口    | V0.5.1 不使用       | 是否用于分类辅助或未来行业分析            |
| 快照保留        | 全部保留            | 是否需要年度归档                          |
| 报告语言/长度   | 中文、摘要 + 分节   | 是否需要固定模板/字数                     |

---

# 二十三、给 Codex 的启动指令

把本文交给 Codex 后，第一条指令应为：

```text
请阅读 docs/ETF市场分析系统-V0.5.1-实施文档.md。

当前任务：只执行“阶段 0：v2 脚手架与数据验证”，不要实现业务计算，不要迁移 main 的应用代码。

要求：
1. 检查当前 v2 工作区，确认没有旧应用代码。
2. 初始化 Node/TypeScript/pnpm 项目骨架和 data/config 目录。
3. 运行 scripts/verify-source.ts，验证 ETF 列表、日 K、估值接口。
4. 创建 docs/data-verification.md，记录代码后缀、单位、百分位、估值覆盖和已确认的复权口径。
5. 输出：现状、可复用接口、风险、待确认事项、阶段 1 计划。
6. 运行 typecheck 和 test，报告结果。
```

阶段 0 报告确认后，再按第十九章逐阶段推进。任何阶段发现文档与实际接口/数据不一致，先更新 `docs/data-verification.md` 和本文，再改代码。

---

# 附录 A：本文关键决策速查

| 主题        | 决策                                    |
| ----------- | --------------------------------------- |
| 代码格式    | `510300.SH`、`000300.SH`，保留后缀      |
| 规模/成交额 | 元；阈值 3 亿 / 1500 万                 |
| 溢价率      | 百分数 → 小数                           |
| 估值百分位  | 0–100 → 0–1                             |
| 日 K        | `adjust=1` 前复权；不权威存储；有界缓存 |
| 收益周期    | N 个区间，N+1 行                        |
| 波动率      | 总体标准差 × sqrt(252)                  |
| 年化        | 几何年化                                |
| 最大回撤    | 负值，[-1,0]                            |
| 排名并列    | 竞赛排名 1,2,2,4                        |
| 综合排名    | 默认关闭                                |
| 缺失        | null，不填 0                            |
| 快照        | 不可变，修正新版本                      |
| current     | 只前进，不因旧日期修正后退              |
| 分类        | pending 可计算，不阻塞                  |
| 报告        | 独立存储，失败不阻塞                    |
| 数据库      | 不使用                                  |

---

# 附录 B：本文与 V0.5 的差异摘要

| 项目               | V0.5         | V0.5.1                       |
| ------------------ | ------------ | ---------------------------- |
| 代码基线           | 未明确       | v2 全新重写，main 仅爬虫参考 |
| 代码格式           | 裸 `510300`  | 带后缀 `510300.SH`           |
| D1–D4              | 待确认       | 已采用                       |
| 收益/波动/年化口径 | 原则性       | 公式固定                     |
| 排名               | 维度列表     | 13 个排名代码 + 算法         |
| 综合排名           | 范围包含     | 默认关闭                     |
| 分类首次阻塞       | 是           | 否                           |
| 数据源契约         | 待检查       | 实测 URL/字段/单位           |
| 图表 K 线          | 有页面无机制 | 有界缓存 + 服务端补拉        |
| 发布门槛           | 原则         | 量化门槛 + partial 规则      |
| 测试               | 原则         | 黄金样本 + E2E 场景          |
| 运维               | 无           | 备份/恢复/日志/容量          |

---

# 文档变更记录

| 版本   | 日期       | 变更                                                                  |
| ------ | ---------- | --------------------------------------------------------------------- |
| V0.5.1 | 2026-11-15 | v2 重写基线；固定数据契约、公式、排名、规则、快照发布、测试和运维要求 |
