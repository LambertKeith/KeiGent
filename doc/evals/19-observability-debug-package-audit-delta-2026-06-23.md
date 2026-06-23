# P2-03 Observability Debug Package Audit Delta

## Backlog Item

- 编号：P2-03
- 开发包：Observability / Debug Package
- 目标：让开发者拿到一个 debug bundle 后，不复现环境也能判断大致问题。
- 非目标：不自动复现环境；不上传 bundle；不自动 judge；不伪造缺失 latency；不宣称生产健康。

## Changed Files

- `docs/superpowers/specs/2026-06-23-observability-debug-package-audit-design.md`
- `docs/superpowers/plans/2026-06-23-observability-debug-package-audit.md`
- `packages/engine/src/debug-bundle.ts`
- `packages/engine/src/__tests__/debug-bundle.test.ts`
- `doc/evals/19-observability-debug-package-audit-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`

## Product Contract

- Debug bundle 必须输出 redacted `record.json`、artifact copies、`redacted-config.json`、`tool-summary.json`、`observability-summary.json`、`triage-summary.json`、`failure-summary.md` 和 `redaction-summary.json`。
- `observability-summary.json` 必须包含 structured event timeline、workflow budget、recovery attempts、provider usage/cost、timeout/abort summary、latency recording status 和 failure taxonomy。
- timeout / abort summary 必须说明来源信号，不能只给不可审计布尔值。
- 缺失 tool/model latency 必须显示 `not_recorded`，不得推断耗时。
- 所有 bundle JSON、summary 和 copied artifacts 必须经过 redaction。

## Tests / Evals

- PASS：`corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts`
- PASS：`corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts`
- PASS：`corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- PASS：`corepack pnpm -r check`
- PASS：`corepack pnpm -r test`
- PASS：`corepack pnpm -r --if-present build`
- PASS：`git diff --check`
- PASS：`rg -n "P2-03|Observability Debug Package|observability-summary|timeoutSources|abortSources|not_recorded|19-observability-debug-package" docs/superpowers doc packages/engine/src packages/cli/src`

## Evidence

- 已证明：debug bundle export 会写入 `tool-summary.json`、`observability-summary.json`、`triage-summary.json`、`failure-summary.md` 和 `redaction-summary.json`。
- 已证明：record、config、workflow trajectory、eval case、generated summaries 和 redaction summary 不泄漏测试中的 secret。
- 已证明：`observability-summary.json` 暴露 timeline、budget usage/limits、recovery attempts、provider usage/cost、failure taxonomy。
- 已证明：timeout / abort summary 暴露 `timeoutSources` 与 `abortSources`，来源限定在已记录 RunRecord 字段。
- 已证明：缺失 tool/model latency 输出 `not_recorded`。

## Proof Boundary

已证明：

- P2-03 debug bundle 能在不复现环境时提供定位问题所需的结构化摘要。
- timeout、abort、budget、recovery 和 failure taxonomy 可从 bundle 内 artifact 审计。
- Redaction summary 明确说明已脱敏范围和未证明内容。

未证明：

- 开发者一定能仅凭 bundle 修复问题。
- 原始环境可复现。
- 外部系统当前状态。
- 所有可能 PII 均被 pattern-based redaction 捕获。
- tool/model latency 已被真实采集；当前只证明缺失时不会伪造。

## Remaining Risks

- blocking：无。
- non-blocking：timeout / abort source 当前来自 RunRecord 既有字段；更细粒度取消原因仍需要未来 runtime instrumentation。
- next action：P2-03 完成后继续推进 P2-04 Release / Packaging / Upgrade Path。
