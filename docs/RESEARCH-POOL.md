# ETF 研究池设计文档

**文档名称：** RESEARCH-POOL.md  
**产品版本：** V0.6  
**文档状态：** 已确认  
**适用对象：** Codex、开发人员

---

## 1. 设计目标

ETF 研究池是整个 ETF 分析系统的数据分析范围。

系统首先从数据源获取 ETF 基础信息，通过统一的筛选规则生成研究池，再对研究池中的 ETF 进行行情采集、估值关联、特征计算和排名。

本模块负责：

1. 获取 ETF 候选数据。
2. 筛选符合要求的 ETF。
3. 根据跟踪指数去重。
4. 生成最终研究池。
5. 管理 ETF 分类。
6. 建立 ETF 与跟踪指数的关联。
7. 输出待确认分类清单。

本模块不负责 ETF 指标计算和排名。

---

## 2. ETF 基础信息

### 2.1 上游原始数据结构

数据源返回的 ETF 原始字段如下：

```ts
interface OriginalEtf {
  securityName: string;
  securityCode: string;
  scale: number | null;
  trackingIndex: string | null;
  trackIndex: string | null;
  premiumRate: string | number | null;
  amount: string;
}
```

字段说明：

| 字段          | 类型                     | 说明         |
| ------------- | ------------------------ | ------------ |
| securityName  | string                   | ETF 名称     |
| securityCode  | string                   | ETF 代码     |
| scale         | number \| null           | ETF 规模     |
| trackingIndex | string \| null           | 跟踪指数名称 |
| trackIndex    | string \| null           | 跟踪指数代码 |
| premiumRate   | string \| number \| null | 溢价率       |
| amount        | string                   | 成交额       |

注意：

- `trackingIndex` 是指数名称。
- `trackIndex` 是指数代码。
- ETF 代码与指数代码不是同一个概念。
- `scale` 和 `amount` 的单位必须通过实际数据源验证，不允许仅凭字段名称推断。
- `premiumRate` 的字符串 `"0"` 是有效数值，不允许因 truthiness 判断而转换为 null。
- `scale` 允许为空，需要显式处理。

### 2.2 系统内部 ETF 结构

研究池内部统一使用以下字段：

```ts
interface Etf {
  code: string;
  name: string;
  scale: number | null;
  trackingIndex: string;
  trackIndex: string;
  premiumRate: number | null;
  amount: number | null;
}
```

字段转换规则：

| 上游字段      | 内部字段      |
| ------------- | ------------- |
| securityCode  | code          |
| securityName  | name          |
| scale         | scale         |
| trackingIndex | trackingIndex |
| trackIndex    | trackIndex    |
| premiumRate   | premiumRate   |
| amount        | amount        |

转换要求：

- 数值字段必须统一转换为 number。
- 无效数值转换为 null。
- 空字符串转换为 null。
- 字符串 `"0"` 转换为数值 `0`。
- ETF 代码和指数代码统一保留字符串格式，避免前导零丢失。

---

## 3. ETF 研究池筛选规则

筛选必须严格按照以下顺序执行。

### 3.1 必填字段检查

必须同时满足：

- `securityCode` 不为空。
- `securityName` 不为空。
- `trackIndex` 不为空。

不满足任意条件，直接排除。

`trackingIndex` 当前不作为额外必填条件。

### 3.2 名称排除

ETF 名称包含以下关键词时排除：

- 短融
- 债

采用名称包含判断，不区分关键词在名称中的位置。

### 3.3 规模过滤

ETF 规模必须达到 3 亿元。

规则：

```ts
scale >= 300000000;
```

处理方式：

- scale 小于 300000000：排除。
- scale 等于 300000000：保留。
- scale 为 null：排除。
- scale 为无效数值：排除。

### 3.4 成交额过滤

成交额阈值为 1500 万元。

规则：

```ts
amount >= 15000000;
```

处理方式：

- amount 有有效数值且小于 15000000：排除。
- amount 等于 15000000：保留。
- amount 大于 15000000：保留。
- amount 为空：不因成交额条件排除。
- amount 为无效数值：按缺失值处理，不因成交额条件排除。

注意：成交额字段单位必须在数据源接入阶段核实。如果上游返回单位不是元，必须先转换为元，再执行过滤。

### 3.5 跟踪指数去重

同一个 `trackIndex` 只保留规模最大的 ETF。

规则：

1. 按 `trackIndex` 分组。
2. 每组按照 `scale` 降序排列。
3. 每组只保留规模最大的 ETF。
4. 其他 ETF 排除。

规模相同时：

- 优先保留成交额较大的 ETF。
- 如果规模和成交额都相同，按 ETF 代码升序保留。

### 3.6 最终排序

完成全部筛选和去重后：

- 按 ETF 规模降序排列。
- 规模相同时按 ETF 代码升序排列。

最终排序结果作为研究池的标准顺序。

---

## 4. 研究池生成流程

研究池生成必须采用固定流程：

```text
获取 ETF 原始数据
        |
        v
字段标准化
        |
        v
必填字段检查
        |
        v
名称关键词排除
        |
        v
规模过滤
        |
        v
成交额过滤
        |
        v
跟踪指数去重
        |
        v
按规模降序排列
        |
        v
生成研究池
        |
        v
匹配 ETF 分类
        |
        v
输出待确认分类
```

### 4.1 筛选结果统计

每次生成研究池时，输出筛选统计：

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

统计口径：

- `sourceCount`：原始 ETF 总数量。
- `invalidFieldCount`：必填字段不满足的数量。
- `excludedNameCount`：名称排除数量。
- `excludedScaleCount`：规模过滤数量。
- `excludedAmountCount`：成交额过滤数量。
- `duplicateIndexCount`：跟踪指数去重排除数量。
- `finalCount`：最终研究池 ETF 数量。

每只 ETF 只记录一个主要排除原因，按照实际执行的第一个失败条件统计，避免重复计数。

---

## 5. ETF 与跟踪指数关系

ETF 与跟踪指数采用一对一或多对一的关联关系。

例如：

```text
ETF A ----\
           \
ETF B ------> 指数 X
           /
ETF C ----/
```

同一个跟踪指数可以对应多个 ETF，但当前研究池筛选规则只保留其中规模最大的 ETF。

关联字段：

- ETF `code`：ETF 代码。
- ETF `trackingIndex`：指数名称。
- ETF `trackIndex`：指数代码。

估值数据通过 `trackIndex` 关联。

不得使用 ETF `code` 直接查询指数估值。

---

## 6. ETF 分类体系

### 6.1 分类结构

采用两级分类：

```ts
interface EtfCategory {
  id: string;
  name: string;
  parentId: string | null;
}
```

每只 ETF 必须且只能对应一个二级分类。

### 6.2 一级分类与二级分类

#### 宽基指数

- A股核心宽基
- A股中小盘宽基
- 美股宽基
- 港股宽基

#### 行业指数

- 金融
- 医药医疗
- 食品饮料
- 消费零售
- 科技与半导体
- 新能源与电力设备
- 高端制造
- 军工
- 有色金属
- 煤炭与能源
- 化工
- 房地产与建筑
- 交通运输
- 公用事业与环保
- 农业
- 其他行业

#### 主题指数

- 人工智能与算力
- 机器人
- 数字经济
- 云计算与大数据
- 互联网
- 低空经济
- 创新药
- 国企改革与央企
- 一带一路
- 其他主题

#### 策略指数

- 红利
- 低波动
- 价值
- 成长
- 质量
- 等权
- 多因子
- 其他策略

#### 商品指数

- 黄金
- 白银
- 有色金属商品
- 能源商品
- 农产品
- 其他商品

#### 其他资产类别

- REITs
- 货币及现金管理
- 其他综合资产

---

## 7. 分类判定规则

### 7.1 分类依据

分类优先级：

1. 指数正式名称。
2. 指数编制方案。
3. 指数成分及权重。
4. 指数投资范围。
5. ETF 名称和产品介绍。

不得仅根据 ETF 名称关键词自动决定分类。

### 7.2 自动分类结果

首次生成研究池后，需要为每只 ETF 生成分类建议。

建议结果：

```ts
interface EtfCategorySuggestion {
  etfCode: string;
  suggestedCategoryId: string | null;
  reason: string;
  confidence: number | null;
  status: "suggested" | "pending";
}
```

字段说明：

- `etfCode`：ETF 代码。
- `suggestedCategoryId`：建议的二级分类 ID。
- `reason`：分类依据。
- `confidence`：分类置信度，范围 0～1；无法评估时为 null。
- `status`：建议状态。

### 7.3 待确认分类

以下情况必须标记为待确认：

- 指数信息不足。
- 指数名称无法明确分类。
- 指数投资范围不明确。
- 多个分类均有可能。
- 自动分类置信度不足。

待确认 ETF 不允许自动归入“其他行业”“其他主题”等兜底分类。

### 7.4 人工确认

当前版本不建设在线分类审批页面。

分类确认通过编辑配置文件完成。

确认后：

- 更新 ETF 分类映射。
- 后续每日任务读取最新映射。
- 不触发 ETF 特征重新计算。
- 不触发全池排名重新计算。
- 前端分类统计读取新映射。

---

## 8. 分类配置文件

### 8.1 categories.json

保存分类体系。

建议结构：

```json
{
  "version": 1,
  "categories": [
    {
      "id": "broad_market",
      "name": "宽基指数",
      "parentId": null
    },
    {
      "id": "a_share_core",
      "name": "A股核心宽基",
      "parentId": "broad_market"
    }
  ]
}
```

要求：

- 分类 ID 全局唯一。
- 二级分类必须关联有效一级分类。
- 分类 ID 一旦使用，不得随意修改。
- 分类名称可以调整，但不得改变 ID。
- 分类配置不得出现重复分类。

### 8.2 etf-category-mapping.json

保存 ETF 与二级分类的映射关系。

建议结构：

```json
{
  "version": 1,
  "mappings": {
    "510300": {
      "categoryId": "a_share_core",
      "status": "confirmed"
    },
    "159999": {
      "categoryId": null,
      "status": "pending"
    }
  }
}
```

字段说明：

- key：ETF 代码。
- `categoryId`：二级分类 ID。
- `status`：`confirmed` 或 `pending`。

约束：

- confirmed 必须具有有效的二级分类 ID。
- pending 的 categoryId 必须为 null。
- 不允许引用不存在的分类 ID。
- 不允许同一 ETF 同时映射多个分类。

---

## 9. 每日研究池更新

每日任务需要重新获取 ETF 基础信息，并生成当前有效研究池。

处理规则：

1. 获取最新 ETF 基础信息。
2. 执行统一筛选规则。
3. 生成最新研究池。
4. 加载已有分类映射。
5. 对已有 ETF 保留原分类映射。
6. 新增 ETF 生成分类建议。
7. 已不符合条件的 ETF 不再进入当前研究池。
8. 输出研究池变化报告。

### 9.1 研究池变化报告

```ts
interface ResearchPoolChange {
  added: string[];
  removed: string[];
  unchanged: string[];
  pendingCategory: string[];
}
```

说明：

- `added`：新进入研究池的 ETF。
- `removed`：从研究池中移除的 ETF。
- `unchanged`：持续保留的 ETF。
- `pendingCategory`：当前没有确认分类的 ETF。

### 9.2 历史结果

研究池变化不得修改已经生成的历史每日分析结果。

历史日期应使用当日保存的分析结果，而不是重新套用当前研究池。

---

## 10. 模块边界

研究池模块只负责：

- ETF 基础信息标准化。
- ETF 筛选。
- 跟踪指数去重。
- 研究池生成。
- 分类配置加载。
- 分类建议生成。
- 分类映射管理。
- 研究池变化报告。

不负责：

- ETF 行情采集。
- 指数估值采集。
- ETF 特征计算。
- ETF 排名。
- 市场统计。
- 前端页面展示。

---

## 11. 验收标准

### 11.1 筛选能力

- 能够获取 ETF 原始数据。
- 能够正确转换原始字段。
- 能够按照必填字段规则过滤。
- 能够排除名称包含“短融”“债”的 ETF。
- 能够按照 3 亿元规模阈值过滤。
- 能够按照 1500 万元成交额阈值过滤。
- 成交额缺失时不会错误排除。
- 能够按照 `trackIndex` 去重。
- 能够保留规模最大的 ETF。
- 能够按照规模降序输出研究池。

### 11.2 分类能力

- 能够加载完整分类体系。
- 能够加载 ETF 分类映射。
- 能够校验分类映射合法性。
- 能够为新增 ETF 生成分类建议。
- 能够输出待确认分类清单。
- 能够保留已有 ETF 分类。
- 能够识别无效分类映射。

### 11.3 更新能力

- 能够每日重新生成研究池。
- 能够输出新增和移除 ETF。
- 能够识别分类待确认 ETF。
- 不修改历史每日分析结果。
- 分类变更不触发特征计算和全池排名重算。

---

## 12. 相关文档

- `PRODUCT.md`：产品功能范围。
- `DATA-SOURCE.md`：ETF 基础信息数据源和采集规则。
- `DATA-MODEL.md`：ETF、分类及 JSON 数据结构。
- `CALCULATION-ENGINE.md`：ETF 特征计算。
- `RANKING-AND-ANALYSIS.md`：排名和市场统计。
- `decisions/DECISIONS.md`：项目决策记录。

**文档结束**
