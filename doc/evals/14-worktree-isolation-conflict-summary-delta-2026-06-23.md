# P1-03 Worktree Isolation Conflict Summary Delta

## Backlog Item

- 编号：P1-03
- 开发包：Worktree Isolation Foundation
- 目标：child run workspace id、cleanup、artifact、conflict 与 Workbench 审计闭环。
- 非目标：不实现 fanout、tournament、自动 merge、真实 `git worktree add` provider 或外部写 connector。

## Changed Files

- `docs/superpowers/specs/2026-06-23-worktree-isolation-conflict-summary-design.md`
- `docs/superpowers/plans/2026-06-23-worktree-isolation-conflict-summary.md`
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`
- `doc/evals/14-worktree-isolation-conflict-summary-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/design/01-architecture.md`
- `doc/design/14-worktree-isolation-and-parallel-runs.md`

## Product Contract

- `workspaceIsolation` 仍是显式 opt-in，不改变默认 CLI / REPL 工作目录语义。
- `WorkflowRunner` 会在所有 child workspace artifact 收集完成后执行跨 child conflict detection。
- 每个涉及冲突的 child workspace summary 都会包含对应 `relativePath`、`workspaceIds` 和 `childRunIds`。
- `WorkflowResult` 与 `WorkflowTrajectory` 的 child workspace conflict summary 必须一致。
- conflict summary 只阻止盲目合并，不判断内容级或语义级冲突。

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts`，1 file / 26 tests，包含 RED/GREEN 新增 conflict summary 测试。
- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts src/__tests__/worktree-isolation.test.ts src/__tests__/run-record.test.ts`，3 files / 47 tests。
- PASS: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`，1 file / 14 tests。
- PASS: `corepack pnpm --filter @keigent/engine eval:stability -- --compact`，9/9 redlines passed。
- PASS: `corepack pnpm -r check`。
- PASS: `corepack pnpm -r test`，engine 46 files / 198 tests，cli 16 files / 107 tests，web 15 files / 83 tests。
- PASS: `corepack pnpm -r --if-present build`。
- PASS: `git diff --check`。
- PASS: `rg "P1-03|Worktree Isolation|workspaceIsolation|conflict summary|detectWorkspaceConflicts" docs/superpowers doc packages`。

## Evidence

- 已证明：reviewed-loop 下 worker / reviewer 同路径 artifact 会进入两个 child workspace conflict summary。
- 已证明：workflow trajectory 保留相同 conflict summary。
- 已证明：primitive worktree isolation、RunRecord 持久化和 Workbench 展示保持回归通过。

## Remaining Risks

- blocking：无。
- non-blocking：conflict detection 仍只基于相同 `relativePath`，不证明内容级或语义级冲突。
- next action：继续推进 P1-04 / P1-05 的本轮 spec、delta 与缺口审计。
