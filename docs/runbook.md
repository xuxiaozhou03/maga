# ETF 市场分析系统运行手册

适用版本：`0.5.1`（v2 重写）  
默认部署：单机、单写者、本地 JSON 文件、只读 Web/API。

## 1. 运行原则

1. 页面和读接口只读取 `published` 快照，不在请求中执行全量采集或指标重算。
2. 快照版本发布后不可覆盖；修正必须生成新版本。
3. `current.json` 只前进；快照或 `current` 损坏时由恢复流程选择最新有效快照。
4. 报告是快照的解释层，不进入 `manifest.files`，生成报告不会改变快照 checksum 或 `current`。
5. 所有持久化写入使用临时文件、`fsync` 和原子 rename。
6. 全系统 K 线统一使用上游 `adjust=1` 前复权数据，不再做二次复权或校准。

## 2. 数据目录

默认 `DATA_ROOT=./data`。

| 路径                              | 用途                         | 备份                    |
| --------------------------------- | ---------------------------- | ----------------------- |
| `data/config/`                    | 数据源、计算、规则、分类配置 | 是                      |
| `data/master/`                    | 研究池                       | 是                      |
| `data/valuation/`                 | 指数 PE/PB/PS 历史           | 是                      |
| `data/snapshots/`                 | 已发布快照与 manifest        | 是                      |
| `data/reports/`                   | 模板/AI 报告与报告索引       | 是                      |
| `data/system/current.json`        | 当前快照指针                 | 是                      |
| `data/system/snapshot-index.json` | 快照索引                     | 是                      |
| `data/system/selection/`          | 研究池选择报告               | 是                      |
| `data/system/tasks/`              | 任务审计                     | 可选，`--include-tasks` |
| `data/cache/`                     | K 线图表缓存                 | 否，可重建              |
| `data/temp/`                      | 构建临时目录                 | 否                      |
| `data/system/locks/`              | 任务锁                       | 否                      |
| `data/system/restore-backups/`    | 恢复前配置备份               | 不纳入备份包            |

磁盘建议至少预留 5GB；快照、估值和报告合计通常小于 1GB/年。

## 3. 环境变量

| 变量                       | 默认值                      | 说明                                  |
| -------------------------- | --------------------------- | ------------------------------------- |
| `DATA_ROOT`                | `./data`                    | 数据根目录                            |
| `PORT`                     | `3000`                      | HTTP 端口                             |
| `HOST`                     | `127.0.0.1`                 | 绑定地址；默认只监听本机              |
| `LOG_LEVEL`                | `info`                      | pino 日志级别                         |
| `ADMIN_TOKEN`              | 空                          | 管理接口令牌；绑定非 loopback 时必填  |
| `REPORT_AI_API_KEY`        | 空                          | 报告模型 Key；也兼容 `OPENAI_API_KEY` |
| `REPORT_AI_MODEL`          | 空                          | 报告模型名称；也兼容 `OPENAI_MODEL`   |
| `REPORT_AI_BASE_URL`       | `https://api.openai.com/v1` | OpenAI 兼容接口                       |
| `REPORT_AI_PROVIDER`       | `openai-compatible`         | 报告元数据中的 provider               |
| `REPORT_AI_PROMPT_VERSION` | `report-v1`                 | Prompt 版本                           |

安全约束：

- 绑定 `0.0.0.0`、局域网地址或公网地址时，`ADMIN_TOKEN` 必须设置，否则服务拒绝启动。
- 管理接口可用 `Authorization: Bearer <token>` 或 `X-Admin-Token: <token>`。
- Key 只从环境变量读取，不写入配置、快照、报告或日志。
- 管理请求体上限 1MB。

## 4. 安装、启动与停止

```bash
pnpm install
pnpm data:init
pnpm system:check
pnpm dev
```

生产启动：

```bash
pnpm build
DATA_ROOT=/srv/maga/data PORT=3000 HOST=127.0.0.1 pnpm start
```

启动时会自动执行恢复：

- 清理超过 24 小时的 `data/temp/` 内容；
- 扫描并校验所有快照；
- 重建 `snapshot-index.json`；
- 修复无效或落后于最新有效快照的 `current.json`；
- 清理 PID 已不存在的 stale lock。

停止：前台进程发送 `SIGINT`/`SIGTERM`；由 systemd 等进程管理器托管时使用对应停止命令。

## 5. 日常检查

```bash
pnpm system:check
pnpm snapshot:verify --all
curl -s http://127.0.0.1:3000/api/health
```

`system:check` 检查配置、快照 schema/checksum 和 current 指向；发现问题时退出码非 0。

页面入口：

- `/`：市场总览
- `/etfs`、`/etfs/:code`：ETF 列表与详情
- `/market`：市场分析
- `/reports`、`/reports/:id`：报告列表与详情
- `/admin`：只读系统状态

## 6. 快照操作

```bash
pnpm snapshot:verify --date 2026-11-13
pnpm snapshot:verify --date 2026-11-13 --version 1
pnpm snapshot:verify --all
pnpm snapshot:verify --repair-index
pnpm system:recover
```

规则：

- 相同输入 fingerprint 已发布时，重复发布返回 `skipped`。
- `force` 发布生成新版本，旧版本及其 checksum 不变。
- 指标计算或发布校验失败时，`current` 不前进。
- 快照发布后若 `current` 更新失败，任务为 `partial_success`；下次启动或 `system:recover` 修复。
- 完整每日分析由上层调度器调用快照发布服务；本仓库当前运维命令聚焦校验、恢复、报告与备份，不以页面触发全量任务。

## 7. 报告生成

### 7.1 模板报告

```bash
pnpm report:generate --mode template
pnpm report:generate --date 2026-11-13 --version 1 --mode template
pnpm report:generate --date 2026-11-13 --version 1 --type risk_note --mode template
```

报告写入：

```text
data/reports/{analysisDate}/{reportId}.json
data/reports/{analysisDate}/index.json
```

同一快照可生成多份报告，`reportId` 递增，旧报告保留。

### 7.2 AI 报告

配置 Key 和模型后：

```bash
REPORT_AI_API_KEY=... REPORT_AI_MODEL=... \
  pnpm report:generate --date 2026-11-13 --version 1 --mode ai
```

AI 输出必须通过：

1. 内容 schema；
2. 每个 section 至少一条 citation；
3. `citation.path` 属于该快照 `manifest.files`；
4. `citation.field` 是 RFC 6901 JSON Pointer，并解析到标量值。

AI 超时、限流、无 Key、非法 JSON、schema 错误或引用无效时：

- 自动降级模板报告；
- 文件记录 `mode="template"`、`fallbackFrom="ai"` 和 `error`；
- 任务记 `REPORT_AI_FALLBACK` warning；
- 快照、`current`、旧报告均不受影响；
- 不会删除无效引用后继续冒充 AI 报告。

### 7.3 HTTP 接口

```bash
curl 'http://127.0.0.1:3000/api/reports?date=2026-11-13&version=1'
curl 'http://127.0.0.1:3000/api/reports/report_20261113_001?date=2026-11-13'

curl -X POST 'http://127.0.0.1:3000/api/admin/reports/generate' \
  -H 'Authorization: Bearer <ADMIN_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-11-13","version":1,"mode":"template"}'
```

管理接口返回 `202` 与 `taskId`，通过 `GET /api/tasks/:id` 轮询终态。

## 8. 备份

```bash
pnpm data:backup --to /backup/maga
pnpm data:backup --to /backup/maga --include-tasks
```

行为：

- 在目标目录下创建时间戳目录，例如 `/backup/maga/20261115T090000Z/`；
- 先写临时目录，完成后原子 rename；
- 生成 `manifest.json`，记录每个文件的相对路径、字节数和 SHA-256；
- 默认包含配置、研究池、估值、快照、报告、current/index 和研究池选择报告；
- 默认不包含任务审计；需要审计时使用 `--include-tasks`；
- 始终排除 cache、temp、locks；
- 目标目录不得位于 `DATA_ROOT` 内。

校验备份：

```bash
pnpm data:restore --from /backup/maga/20261115T090000Z --dry-run
```

校验会拒绝：

- manifest 缺失或 schema 错误；
- 文件缺失、额外文件、符号链接；
- 文件大小或 SHA-256 不匹配；
- 非白名单目录或路径逃逸。

## 9. 恢复

恢复前必须停止 Web 服务，避免内存配置和写任务与恢复并发。

```bash
# 1. 校验备份
pnpm data:restore --from /backup/maga/20261115T090000Z --dry-run

# 2. 恢复
pnpm data:restore --from /backup/maga/20261115T090000Z

# 3. 检查
pnpm system:check
pnpm snapshot:verify --all
pnpm start
```

恢复行为：

1. 完整校验备份后才会修改 `DATA_ROOT`。
2. 覆盖 `config/` 前，将当前配置保存到
   `data/system/restore-backups/{timestamp}/config/`。
3. 以目录整体替换方式恢复配置、研究池、估值、快照、报告和 `system/selection`。
4. 恢复 `current.json` 与 `snapshot-index.json`；备份中不存在时保持缺失。
5. 自动执行快照校验、索引重建和 current 修复。
6. 校验恢复后的 current 快照 checksum。
7. 任一替换或校验失败时，尝试回滚到恢复前目录；回滚失败时返回 `RESTORE_ROLLBACK_FAILED`，不得继续启动。
8. cache、temp、locks 不被备份覆盖；恢复不会伪造缺失的 K 线缓存。

## 10. 故障处置

| 现象                                   | 处理                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `SNAPSHOT_CORRUPT`，current 指向坏快照 | `pnpm system:recover`；从最近有效备份恢复                                            |
| 单个旧快照 checksum 损坏               | `pnpm snapshot:verify --all` 定位；恢复流程会将其排除，必要时从备份恢复              |
| `current.json` 损坏或落后              | `pnpm system:recover`，选择最新有效 published 快照                                   |
| `snapshot-index.json` 损坏             | `pnpm snapshot:verify --repair-index` 或 `pnpm system:recover`                       |
| 配置 schema 错误                       | 修正配置；或从 `restore-backups`/备份恢复 `config/`                                  |
| master 损坏                            | 停止服务，从备份恢复；不得用空研究池继续                                             |
| 估值文件损坏                           | 从备份恢复，或重新运行估值刷新；单指数失败不得删除历史                               |
| 报告索引损坏                           | 报告文件仍可按目录扫描读取；下次生成会重建索引，也可删除当日 `index.json` 后重新生成 |
| AI 报告失败                            | 检查 Key、模型、网络和限流；系统应自动生成模板回退报告                               |
| `TASK_CONFLICT`                        | 查看 `data/system/tasks/` 与日志；确认进程是否存活，禁止手工删除活进程锁             |
| stale lock                             | `pnpm system:recover` 仅清理 PID 不存在的锁                                          |
| 上游 429/超时                          | 查看结构化日志，等待退避重试；不修改已发布快照                                       |
| 磁盘不足                               | 先扩充磁盘并校验备份，禁止在空间不足时发布快照或恢复                                 |
| 非交易日运行                           | 任务应返回 `skipped`，不生成新日期快照                                               |

## 11. 日志、容量与保留

- 日志为 pino JSON，输出到标准输出；由部署层负责采集和按天切割。
- 任务记录建议保留 1 年；报告和已发布快照默认保留用于审计。
- 备份建议保留 30 个日备份、12 个月备份，并至少保留一份异地备份。
- 删除快照或报告前必须先校验备份；禁止直接编辑已发布快照。
- 定期执行一次“备份 -> 在隔离目录恢复 -> `system:check`”演练。

## 12. 验证命令

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec prettier --check .
pnpm system:check
```

`pnpm test` 中的 E2E 不访问真实网络，覆盖快照发布、重复/强制发布、模板报告、AI 回退、备份、破坏数据、恢复、API 与页面读取。
