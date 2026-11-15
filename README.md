# maga

ETF 市场分析系统 v2 重写。

- 实施基线：[docs/ETF市场分析系统-V0.5.1-实施文档.md](docs/ETF市场分析系统-V0.5.1-实施文档.md)
- 上游验证记录：[docs/data-verification.md](docs/data-verification.md)
- 运行手册：[docs/runbook.md](docs/runbook.md)
- 当前状态：阶段 0–11 完成（数据源、存储、研究池、图表缓存、估值、特征、排名、市场分析、规则发现、快照发布、只读 API/页面、模板与 AI 报告、引用校验、目录式备份恢复、E2E、运行手册），已生成 243 只 ETF 研究池和 243 条 `pending` 分类映射。阶段 12 仅剩分类映射人工确认与最后收尾。
- 数据源：`hongsehuojian.com`，接口行为参考 `main` 的爬虫代码。
- 复权口径：`adjust=1` 即前复权；全系统统一使用，不做二次复权或校准。

## 本地命令

```bash
pnpm install
pnpm data:init        # 创建 data/ 运行目录，不覆盖配置
pnpm dev              # http://127.0.0.1:3000，页面与只读 API
pnpm typecheck
pnpm test             # 不访问真实网络
pnpm verify:source    # 只读验证 ETF 列表、日 K、指数估值
pnpm pool:refresh     # 刷新研究池、选择报告和缺失的 pending 分类映射
pnpm valuations:refresh --index 000300.SH  # 刷新单指数 PE/PB/PS；省略 --index 则刷新全池
pnpm snapshot:verify --date 2026-11-13   # 校验指定日期快照；也支持 --all / --version
pnpm snapshot:verify --repair-index      # 校验并重建 snapshot-index/current
pnpm system:recover                      # 清理过期临时文件、修复索引、current 和 stale lock
pnpm system:check                        # 只读检查配置、全部快照和 current
pnpm report:generate --mode template     # 为 current 快照生成模板报告
pnpm report:generate --date 2026-11-13 --version 1 --mode ai
pnpm data:backup --to /backup/maga       # 目录式备份，自动生成 SHA-256 manifest
pnpm data:restore --from /backup/maga/20261115T090000Z --dry-run
pnpm data:restore --from /backup/maga/20261115T090000Z
pnpm build
pnpm start
```

数据源代码位于 `src/sources/`：`HttpClient` 负责超时、重试、并发与最小间隔；`EtfSource`、`KlineSource`、`ValuationSource` 只负责上游契约和基础校验，不写文件、不做筛选或计算。

存储代码位于 `src/storage/`：`DataPaths` 负责 `data/` 根目录内路径与软链接校验；`JsonStore` 负责 schema 校验、canonical JSON、同目录临时文件、`fsync` 和原子 rename；`LockManager` 使用 proper-lockfile 提供任务互斥。配置统一通过 `ConfigLoader` 加载并生成稳定 `configHash`。

研究池代码位于 `src/collectors/`：基础筛选严格按文档顺序执行，同指数仅保留一只代表 ETF，并写入 `data/master/etfs.json`、`data/system/selection/latest.json`。`poolVersion` 仅成员集合或代表 ETF 变化时提升，`poolHash` 覆盖全部规范化字段。

图表 K 线代码位于 `src/charts/`：日 K 经过排序、去重、OHLCV 校验后，写入最多 1000 行的 `data/cache/klines/{code}.json`；周 K/月 K 由日 K 聚合。缓存可在删除后按单只 ETF 从上游重建，但只能服务详情页图表，特征、排名、市场统计、规则发现和快照不得读取。

估值代码位于 `src/collectors/valuation-*.ts`：从研究池提取唯一 `trackIndex`，按指数、按 PE/PB/PS 独立采集，写入 `data/valuation/indexes/{indexCode}.json`。百分位统一由 0–100 转为 0–1，PEG 只保留 PE；单类型失败或空响应不会删除该类型旧数据，无数据指数标记为 `unsupported`。

特征代码位于 `src/calculations/`：收益、趋势、风险、成交、估值和历史统计都是纯函数，只接收已规范化的 `Kline[]`、`IndexValuationItem[]` 和配置，不读取 `data/cache/klines`。计算前过滤未来行并拒绝重复日期；最新 K 线等于 `analysisDate` 时才标记 `sampleValid=true`，否则当日依赖指标为 null、历史统计保留并输出 `KLINE_STALE`；空 K 线输出 `KLINE_EMPTY`。全精度计算，序列化前统一 `roundTo(12)`，缺失值保持 null。

排名代码位于 `src/rankings/`：生成文档定义的 13 个排名，使用竞赛排名 `1,2,2,4`、相对容差并列和最小样本门槛；`risk_score` 由波动率与回撤的横截面数值百分位合成，按风险由低到高排名。筛选集排名在内存中重新计算，并同时保留 `fullPoolRank` 与 `filteredRank`；V0.5.1 不生成 `overall.json`。

市场代码位于 `src/market/`：收益、趋势、风险、成交和估值统计各自使用有效样本分母，估值按唯一指数去重；市场状态按 `risk_rising → weak → strong → diverging → activity_improving → neutral` 优先级匹配，并输出证据与配置阈值。

规则代码位于 `src/rules/`：11 条 ETF 规则与 10 条市场规则全部由 `rule-config.json` 驱动，输出稳定 ID、证据、阈值和快照引用。引擎按严重度、规则代码、ETF 代码排序，执行单规则上限、每只 ETF 最多 5 条、ETF 合计 500 条和市场合计 10 条限制；单规则异常隔离，全部启用规则失败时任务失败。无上一快照时 `etf_trend_improving` 标记为未评估。

快照代码位于 `src/snapshots/`：在 `data/temp/` 完整构建后校验 schema、文件完整性、重复键、未来数据与 checksum，再原子 rename 到不可覆盖的 `data/snapshots/{date}/v{version}/`。`manifest.json` 记录配置/规则/分类映射哈希、`inputFingerprint`、文件字节数与 checksum；相同输入默认 `skipped`，`--force` 生成新版本。发布成功后更新 `data/system/snapshot-index.json` 与只前进的 `data/system/current.json`；任务步骤、warning 和失败原因写入 `data/system/tasks/`。

Web/API 代码位于 `src/server/`：`SnapshotReader` 只读取并校验已发布快照，`createApp(services)` 可注入临时数据目录、K 线源和 AI Provider，测试不访问网络。API 覆盖健康检查、市场总览/分析、ETF 列表/详情/历史/K 线、排名、发现、报告、快照与任务；管理接口可异步触发报告生成。页面覆盖市场总览、ETF 全列表、ETF 详情、市场分析、报告列表/详情和系统管理。页面使用原生 CSS 与服务端 HTML；ECharts 从本地 `node_modules/echarts` 提供，不使用 CDN。K 线缓存缺失或超过 1 个交易日未更新时只按单只 ETF 补拉，历史特征只读每日快照，不从 K 线重算。

报告代码位于 `src/reports/`：模板报告确定性生成并可离线运行；AI 报告只发送紧凑快照上下文，所有 citation 必须通过快照文件白名单、RFC 6901 JSON Pointer 和标量值校验。AI 无 Key、超时、非法 JSON、schema 错误或引用无效时，降级为模板报告并保留 `fallbackFrom` 与错误摘要；报告文件不进入快照 manifest，失败不修改 `current`。

备份代码位于 `src/backups/`：备份包含配置、研究池、估值、快照、报告、current/index 和 selection，逐文件记录大小与 SHA-256，先写暂存目录再原子 rename；恢复先完整校验并拒绝额外文件或符号链接，覆盖配置前保留 `system/restore-backups`，恢复后自动修复索引/current 并复验快照 checksum。cache、temp、locks 不进入备份，任务审计可按 `--include-tasks` 选择。

## 页面与只读 API

启动后访问：

- `/`：市场总览
- `/etfs`：ETF 全列表、搜索、分类筛选、排序与分页
- `/etfs/:code`：ETF 详情、K 线、历史特征、风险/成交/估值与发现
- `/market`：市场深度分析
- `/reports`：报告列表、筛选与模式/回退状态
- `/reports/:id`：报告正文、关键发现与可点击引用
- `/admin`：配置、快照、数据质量与任务只读视图
- `/api/health`：服务与 current 状态
- `/api/market/overview`、`/api/market/analysis`
- `/api/etfs`、`/api/etfs/:code`、`/api/etfs/:code/history`、`/api/etfs/:code/kline`
- `/api/reports`、`/api/reports/:id`
- `/api/rankings`、`/api/findings`、`/api/snapshots`、`/api/tasks`
- `POST /api/admin/reports/generate`：异步生成报告，返回 `taskId`

所有读接口支持 `date`/`version` 选择已发布快照；页面和 API 不在请求中执行全量采集或重算，只有 K 线图表缓存缺失或超过 1 个交易日未更新时补拉单只 ETF。

## 报告与 AI

默认 `--mode template`。配置 `REPORT_AI_API_KEY`（或 `OPENAI_API_KEY`）与 `REPORT_AI_MODEL`（或 `OPENAI_MODEL`）后才调用模型；可用 `REPORT_AI_BASE_URL` 指向 OpenAI 兼容接口。AI 失败自动回退模板，报告文件保留错误摘要，快照和 current 不受影响。

## 备份与恢复

备份目标必须在 `DATA_ROOT` 之外。`pnpm data:backup --to /backup/maga` 生成时间戳目录和 `manifest.json`；`--include-tasks` 可附带任务审计。恢复前先停止服务，先运行 `--dry-run` 校验，再执行恢复。覆盖配置前的旧配置保存在 `data/system/restore-backups/{timestamp}/config/`。

## 分类映射

分类人工确认放在阶段 12，作为最后收尾，不阻塞研究池、特征、排名和快照发布。未确认 ETF 以 `pending` 进入计算，页面显示“待确认”；历史快照不会被分类变化原地改写。
