# P0-04 Eval-run Linkage and Report UX Delta

## Backlog Item

- 编号：P0-04
- 开发包：Eval-run Linkage and Report UX
- 目标：让 eval case 可从 Workbench 复盘到 run detail，并在 case surface 展示 reviewer-facing verdict 与 next action。
- 非目标：不新增 eval runner；不把 fixture pass 解释为生产健康；不把 case review verdict 解释为人工 sign-off。

## Changed Files

- `docs/superpowers/specs/2026-06-23-eval-run-linkage-report-ux-design.md`
- `docs/superpowers/plans/2026-06-23-eval-run-linkage-report-ux.md`
- `packages/web/src/dashboard/report-model.ts`
- `packages/web/src/dashboard/workbench.ts`
- `packages/web/src/__tests__/dashboard.test.ts`
- `packages/web/src/__tests__/eval-dashboard-workbench.test.ts`
- `doc/product/03-web-workbench-blueprint.md`
- `doc/design/05-web-dashboard.md`
- `doc/product/12-development-priority-backlog.md`

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts`
- PASS: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/eval-dashboard-workbench.test.ts`
- PASS: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts src/__tests__/eval-dashboard-workbench.test.ts`
- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts`
- PASS: `corepack pnpm -r check`
- PASS: `corepack pnpm -r test`
- PASS: `corepack pnpm -r --if-present build`
- PASS: `git diff --check`

## Evidence

- 已证明：`normalizeRealWorldEvalReport()` 产生 `caseReview`，包含 `verdict`、`label`、`reason` 与 `nextAction`。
- 已证明：`caseReview` 使用 eval result、RunRecord evidence/risk/replay/failure/proof boundary 派生，不依赖 final text。
- 已证明：Workbench Eval-run linkage 表格展示 `Reviewer verdict` 与 `Next action`，并保留 Run Detail link。
- 已证明：replay case 显示 `Replay result, not a fresh execution`。
- 已证明：no-op automation case 的 next action 为 `Review automation scope before treating no-op as health.`。
- 未证明：人类 reviewer 已实际检查并签署 case。
- 未证明：fixture pass 代表生产健康或外部系统状态。

## Risks / Follow-ups

- blocking：无。
- non-blocking：当前 Workbench 仍是静态 dashboard table；未来可把 case review 扩展为交互式 case drawer。
- next action：继续推进 P0-05 Stability Hardening Gate，把 false-confidence 红线集中纳入主干验收。
