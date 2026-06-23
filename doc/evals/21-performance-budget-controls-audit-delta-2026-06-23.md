# P2-05 Performance Budget Controls Audit Delta

## Backlog Item

- 编号：P2-05
- 开发包：Performance / Budget Controls
- 目标：让 loop 不失控。
- 非目标：不新增远程价格表同步；不内置模型价格；不把 `pricing_not_configured` 解释为免费；不宣称 fixture pass 等同生产健康。

## Changed Files

- `docs/superpowers/specs/2026-06-23-performance-budget-controls-audit-design.md`
- `docs/superpowers/plans/2026-06-23-performance-budget-controls-audit.md`
- `packages/web/src/runs/model.ts`
- `packages/web/src/__tests__/runs-view.test.ts`
- `doc/evals/21-performance-budget-controls-audit-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`

## Product Contract

- LoopEngine must stop on max tool calls, wall time, token estimate, recovery attempts, and priced provider cost ceilings.
- WorkflowRunner must preserve parent / child budget boundaries and surface budget failures as workflow evidence.
- Budget exhaustion must use stable `budget_exceeded` failure semantics where applicable.
- RunRecord must contain budget limits, usage, budget exceeded flag, provider usage/cost status, and budget failure evidence.
- Workbench must show budget usage, provider token usage, and exact `pricing_not_configured` when local model pricing is absent.
- Eval must include deterministic `budget-exceeded` coverage.

## Tests / Evals

- PASS：`corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts`
- PASS：`corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/engine-budget.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/real-world-eval.test.ts src/__tests__/run-record.test.ts`
- PASS：`corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- PASS：`corepack pnpm --filter @keigent/engine eval:real-world -- --compact`
- PASS：`corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- PASS：`corepack pnpm -r check`
- PASS：`corepack pnpm -r test`
- PASS：`corepack pnpm -r --if-present build`
- PASS：`git diff --check`
- PASS：`rg -n "P2-05|Performance Budget Controls|performance-budget-controls|budget-exceeded|pricing_not_configured|provider cost pricing_not_configured|21-performance-budget-controls" docs/superpowers doc packages/engine/src packages/web/src`

## Evidence

- 已证明：LoopEngine 单测覆盖 max tool calls、max wall time、max token estimate、recovery budget、priced provider cost ceiling，以及未配置价格时的 `pricing_not_configured` 非强制行为。
- 已证明：WorkflowRunner 单测覆盖 max child runs、per-run iterations、aggregate iterations/tool calls、token estimate、recovery attempts、timeout 和 priced provider cost ceiling。
- 已证明：real-world L2 `budget-exceeded` case 的 RunRecord 包含 `workflow.budgetExceeded=true`、预算用量、`budget_exceeded` failure、blocking evidence 与 proof boundary。
- 已证明：Workbench run model 显示 budget usage、provider tokens、priced cost，并在未配置价格时显示 `pricing_not_configured` 而不是 `$0.000000`。
- 已证明：RunRecord budget summary 对 unpriced provider usage 输出 `provider cost pricing_not_configured`。

## Proof Boundary

已证明：

- P2-05 预算控制在 deterministic local tests / eval 中可审计。
- 超预算不会被 final text 或 child success 覆盖为成功。
- 未配置价格不会被解释成免费成本。

未证明：

- 真实供应商成本完全准确；成本只来自 provider usage 和本地 `modelPricing`。
- 外部生产环境健康。
- 所有未来模型 provider 都能报告 usage。
- 浏览器或外部工具的第三方内部耗时都已细粒度采集。

## Remaining Risks

- blocking：无。
- non-blocking：真实 tool/model latency instrumentation 仍可继续扩展；当前 P2-05 只证明预算边界和 provider usage/cost status。
- next action：P2-05 完成后执行 P0/P1/P2 全优先级 completion audit。
