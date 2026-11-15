# 上游数据验证记录

验证日期：2026-11-15（Asia/Shanghai）

验证方式：只读 GET 请求；不写入上游；不绕过登录/验证码。

自动化入口：`pnpm verify:source`，走正式 `src/sources/` 适配器，不使用验证脚本内单独的 HTTP 实现。

参考代码：`main` 分支 `src/crawler/etfs.ts`、`src/crawler/etf/klines.ts`、`src/crawler/index/valuation.ts`、`src/crawler/index/distribution.ts`，以及 `src/utils/runTask.ts` 中的交易日/收市判断。

---

## 1. ETF 列表

请求：

```text
GET https://hongsehuojian.com/fundex-quote/allPage/findListByEtf
  ?classA=&classB=&orderBy=l.scale&order=desc&searchValue=&isSelected=
  &pageNo=1&pageSize=2000&position=
```

请求头：

```text
accept: application/json, text/plain, */*
pro: RedRocket-PC
```

结果：

- 业务 `code=200`。
- `data.total=1721`。
- `pageSize=2000` 一次返回全部 1721 条。
- 响应中的 `data.pageSize` 实测为 0，不能依赖它判断分页大小。

样例字段：

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

结论：

- `securityCode` 必须保留 `.SH/.SZ` 后缀。
- `trackIndex` 是带市场后缀的指数代码，例如 `000300.SH`、`399006.SZ`、`HSI.HI`、`Au9999.SGE`。
- `trackingIndex` 是指数名称。
- `scale` 单位为元。
- `amount` 为字符串，可能是科学计数法，单位为元。
- `premiumRate` 为百分数字符串，例如 `-0.24` 表示 -0.24%。
- `valuePercent` 与估值接口的 PE 百分位一致（沪深300 均为 73.76）。

---

## 2. 研究池筛选实测

按 V0.5.1 第二章规则顺序执行：

```text
total 1721
missing_code 0
missing_name 0
missing_track_index 28
debt_name 53
scale_missing_or_invalid 1
scale_below_threshold 905
amount_invalid 0
amount_below_threshold 133
afterBasicFilter 601
duplicate_track_index 358
pool 243
duplicateGroups 118
maxGroupSize 22
poolVersion 1
poolHash sha256:cbd6bfc904e1d1e461d4bcac392584a45c003773165e3170cb83f4fe3f51516a
```

结论：

- 当前研究池约 243 只 ETF、243 个唯一 `trackIndex`。
- 2026-11-15 首次刷新写入 243 条 `pending` 分类映射；没有新增、移出或代表 ETF 切换，`poolVersion=1`。
- 同指数重复严重（118 个组，最大 22 只跟踪同一指数），去重规则必须严格。
- 以上数值随市场变化，不应写死在代码或测试期望中；测试使用固定夹具。

---

## 3. 日 K

请求：

```text
GET https://hongsehuojian.com/fundex-quote/line/kline
  ?securityCode=510300.SH&count=-10&begin=20261115&period=day&adjust=1&ts=1
```

结果：

- `securityCode=510300` 返回空 items；`510300.SH` 返回数据。代码后缀必须保留。
- `columns=week,tradeDate,open,high,low,close,volume,amount,change,changePercent`。
- `items` 为分号分隔的 CSV 文本。
- 最新数据日期为 2026-11-13（验证日 2026-11-15 为周日）。

样例：

```json
{
  "columns": "week,tradeDate,open,high,low,close,volume,amount,change,changePercent",
  "items": "星期五,2026-11-13,4.124,4.127,4.076,4.083,8510502.50,3489035700.000,-0.062,-1.50"
}
```

结论：

- `week` 列忽略。
- `tradeDate` 为 `YYYY-MM-DD`。
- `changePercent` 为百分数。
- `volume`/`amount` 数值可直接解析；`amount` 单位为元。
- `adjust=1` 已由用户确认为前复权。全系统统一按前复权计算，不做二次复权或校准；上游复权误差按可接受误差处理。

---

## 4. 指数估值

请求：

```text
GET https://hongsehuojian.com/fundex-quote/index/valuation
  ?securityCode=000300.SH&valuationType=PE&timeInterval=last_5_years&ts=1
```

结果：

- `code=200`。
- `data.items` 为数组；`000300.SH` PE 返回 1212 条。
- 最新一条：

```json
{
  "tradeDate": "20261113",
  "valuationValue": 13.4199,
  "historicalPercentile": 73.76,
  "peg": -40.9339
}
```

- `historicalPercentile` 为 0–100 百分数。
- `peg` 在 PE/PB/PS 响应中都会出现；本版只保存 PE 的 PEG，PB/PS 忽略。
- `000905.SH`、`399006.SZ`、`HSI.HI` 有估值数据。
- `NDX.GI`、`SPX.GI` 返回 `{"code":"200","data":{}}`，即 `items` 字段缺失，而非 `items: []`。

结论：

- 百分位统一 `/100` 保存为 0–1；不要使用“大于 1 才除 100”的猜测逻辑。
- `items` 缺失或为空数组都是“该指数该类型无数据”，不是接口失败。
- 海外/商品指数估值覆盖不完整；市场估值统计按唯一指数有效样本计算。

阶段 5 实现复核（2026-11-15）：

- `000300.SH` PE/PB/PS 各 1212 条，合计 3636 条；最新日期 2026-11-13。
- PE 最新百分位 `73.76 -> 0.7376`，PEG `-40.9339` 且 `pegUsable=false`。
- `NDX.GI` PE/PB/PS 均为空，写入 `data/valuation/indexes/NDX.GI.json` 并标记 `unsupported`。
- 单指数文件约 0.9MB，符合单个估值文件小于 3MB 的目标。

---

## 5. 行业分布（未纳入 V0.5.1）

接口存在：

```text
GET /fundex-quote/security/component/industryDistribution
  ?securityCode=000300.SH&industryLevel=3
```

本版不使用。若未来用于分类辅助，需要单独定义数据契约；它只返回最新分布，不提供历史。

---

## 6. 待验证项

| 项目                     | 状态   | 说明                               |
| ------------------------ | ------ | ---------------------------------- |
| `adjust=1` 复权含义      | 已确认 | 前复权；全系统统一使用，误差可接受 |
| `premiumRate` 单位稳定性 | 待验证 | 当前按百分数处理                   |
| 最新数据可用时间         | 待验证 | 15:30/16:00/17:00 各请求一次       |
| 2026 交易日历            | 待验证 | 与交易所节假日/调休对照            |
| 上游限流阈值             | 待验证 | 逐步提高并发，记录 429             |
| 数据使用条款             | 待确认 | 上线前确认许可                     |
