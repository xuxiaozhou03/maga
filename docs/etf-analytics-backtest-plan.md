# ETF Analytics and Backtesting Plan

## Objective

Build a local research workbench on top of the existing ETF crawler that supports:

1. Inspecting one ETF and its return, risk, liquidity, technical, and data-quality statistics.
2. Comparing multiple ETFs with aligned dates, normalized performance, risk rankings, and correlations.
3. Backtesting a user-defined daily strategy with explicit execution, cost, and portfolio rules.

## Current State

- The database contains 284 ETF metadata rows.
- Metadata is currently deduplicated by tracking index. Only the largest ETF for each index is retained.
- Only 2 ETFs have K-line data.
- `510300.SH` has 3,495 daily rows from 2012-05-28 through the latest trading day.
- `158023.SZ` has 27 daily rows.
- The crawler only fetches K-lines for the largest ETF.
- Daily task skipping is disabled, so incremental synchronization is not reliable yet.
- There is no analytics package, web application, or backtest engine.
- The first listing-day percentage change can be invalid, for example the first `510300.SH` row has `changePercent=160.435`.

## Data Rules

- Treat every ETF code as a separate product. Do not deduplicate the ETF table by tracking index.
- Add an explicit representative-product flag for selecting one ETF per tracking index when needed.
- Use adjusted daily prices consistently. Record the adjustment method used by the source.
- Calculate returns from ascending closing prices instead of trusting upstream percentage changes.
- Exclude the first listing day from return and risk statistics while retaining it in the price chart.
- Store scale in yuan and display it in hundred-million yuan in the UI.
- Treat `premiumRate` as a percentage value.
- Mark incomplete coverage and data-quality issues on every ETF instead of silently ranking incomplete products.
- Align multi-ETF calculations by date using an inner join.

## Architecture

Keep the existing pnpm workspace and add the following boundaries:

- `packages/crawler`: data collection, normalization, retries, and synchronization orchestration.
- `packages/db`: Prisma schema and shared persistence client.
- `packages/analytics`: pure analytics functions with no database access.
- `packages/backtest`: deterministic daily backtest engine.
- `apps/web`: ETF list, ETF detail, comparison, and backtest UI.

SQLite remains the initial store. Revisit DuckDB or Parquet only if the full ETF history makes local aggregation too slow.

## Delivery Phases

### 1. Data Foundation

- Fix ETF ingestion so it retains all eligible ETF products.
- Add a representative-product field or view.
- Synchronize K-lines for all selected ETFs with bounded concurrency and resumable progress.
- Restore daily task skipping and support incremental updates.
- Add a data-quality report for coverage, bad prices, invalid returns, duplicate dates, and suspicious source values.

### 2. Shared Analytics

Implement tested pure functions for:

- Total, annualized, trailing, and periodic returns.
- NAV and drawdown curves.
- Annualized and downside volatility.
- Maximum and current drawdown.
- Sharpe, Sortino, and Calmar ratios.
- Up/down day distribution, win rate, profit factor, and consecutive streaks.
- Amount and volume statistics, including ADV20 and relative volume.
- Moving averages, RSI, Bollinger Bands, and ATR.
- Date-aligned correlation matrices and relative-strength series.

The analytics package must reuse ascending, validated K-line input and return `null` for insufficient data rather than `NaN` or `Infinity`.

### 3. Single ETF View

Create `/etfs/[code]` with:

- ETF identity, scale, premium rate, tracking index, and coverage.
- Period selector and normalized price/NAV chart.
- Drawdown chart.
- Return and risk metric panels.
- Return distribution and drawdown history.
- Liquidity and technical-state panels.
- Data-quality warnings.

### 4. Comparison View

Create `/compare` with support for 2 to 8 ETFs:

- Common-period normalized performance.
- Return, volatility, drawdown, Sharpe, and liquidity comparison table.
- Rolling correlation and correlation matrix.
- Relative-strength chart.
- Ranking filters for product category, scale, liquidity, and coverage.

### 5. Backtest Engine

Use a deterministic daily execution model:

- Signals are generated using data available at the close of day `T`.
- Trades execute at the open of day `T+1` by default.
- Support target weights, cash, rebalance schedules, minimum trade units, fees, and slippage.
- Skip suspended or missing trading days.
- Produce trades, positions, daily equity, turnover, exposure, drawdown, and benchmark comparison.
- Reuse the analytics package for all performance metrics.
- Persist the strategy specification, parameter snapshot, trades, and daily NAV so a run is reproducible.

### 6. Validation

- Add synthetic unit tests for returns, drawdown, correlation, execution, costs, and insufficient data.
- Verify buy-and-hold reproduces the ETF's own return series.
- Add a no-lookahead test and transaction-cost invariants.
- Validate the complete ETF ingestion and analytics flow against real data.
- Verify the web experience on desktop and mobile layouts.

## Backtest Specification

Before implementing a specific strategy, define:

1. Universe selection rules.
2. Entry signal and required parameters.
3. Exit or replacement rule.
4. Maximum concurrent positions and rebalance frequency.
5. Initial capital, commission, slippage, and benchmark.

Without these rules, the graph and statistics can be built, but the requested strategy cannot be backtested responsibly.

## Acceptance Criteria

- ETF metadata retains multiple products tracking the same index.
- Every selected ETF has a validated K-line coverage report.
- A single ETF page exposes performance, risk, liquidity, technical, and quality information.
- Multiple ETFs can be compared only on shared dates.
- The backtest engine is deterministic, free of lookahead, and reports execution costs.
- Analytics and backtest calculations share one tested metric implementation.
