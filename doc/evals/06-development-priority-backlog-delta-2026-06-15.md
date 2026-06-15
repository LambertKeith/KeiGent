# Development Priority Backlog Delta - 2026-06-15

> 范围：`P0-02 Workbench Run Detail v1`、`P1-03 Worktree Isolation Foundation` 与 `P1-04 Schema Migration / Redaction Hardening` 的增量交付。
>
> 依据：`doc/product/12-development-priority-backlog.md`。

## Backlog Item

- 编号：P0-02
- 开发包：Workbench Run Detail v1
- 目标：Run List 与 Run Detail 覆盖 backlog 要求的审计字段。
- 非目标：不把静态 Workbench 扩展为完整交互式 operator 产品。

## Changed Files

- `packages/web/src/runs/model.ts`
- `packages/web/src/runs/workbench.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`
- `doc/product/03-web-workbench-blueprint.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`

## Tests / Evals

- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts src/__tests__/runs-view.test.ts`
- `corepack pnpm -r test`
- `corepack pnpm -r check`
- `corepack pnpm -r --if-present build`
- 结果：全部通过。

## Evidence

- 已证明：Run List 展示 run id、status、createdAt、profile、workflow mode、risk、evidence summary、duration、replay status。
- 已证明：Run Detail 展示 `Timeline` 面板，包含 route、workflow、budget、iterations、tools、checkpoints、events。
- 未证明：完整交互式 Workbench 成熟度。
- evidence gaps：未做浏览器人工验收；本轮为 view model / render 层回归。

## Risks / Follow-ups

- blocking：无。
- non-blocking：后续可补真实浏览器截图验收。
- next action：继续按 backlog 推进 P1 / P2。

## Backlog Item

- 编号：P1-03
- 开发包：Worktree Isolation Foundation
- 目标：child run workspace id、cleanup、artifact、conflict 与 Workbench 审计闭环。
- 非目标：不实现 fanout、tournament、自动 merge、自动 `git worktree add` provider 或外部写 connector。

## Changed Files

- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/workflow/planner.ts`
- `packages/engine/src/workflow/engine-child-runner.ts`
- `packages/engine/src/run-record.ts`
- `packages/engine/src/lib.ts`
- `packages/cli/src/workflow-execution.ts`
- `packages/cli/src/repl.ts`
- `packages/web/src/runs/child-workspaces.ts`
- `packages/web/src/runs/model.ts`
- `packages/web/src/runs/workbench.ts`
- `doc/design/14-worktree-isolation-and-parallel-runs.md`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/worktree-isolation.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/workflow-engine-child-runner.test.ts src/__tests__/run-record.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts src/__tests__/runs-view.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/run-once.test.ts src/__tests__/post-run.test.ts src/__tests__/product-e2e.test.ts`
- `corepack pnpm -r test`
- `corepack pnpm -r check`
- `corepack pnpm -r --if-present build`
- 结果：全部通过。

## Evidence

- 已证明：显式 `workspaceIsolation` 配置下，`WorkflowRunner` 为 child run 创建独立 workspace，并把 workspace path 传给 production child adapter。
- 已证明：成功路径可 `remove` cleanup，超时路径可 `mark_abandoned` 并保留 manifest。
- 已证明：RunRecord child summary 可保存 workspace id、branch、cleanup state、artifacts、conflicts。
- 已证明：Workbench Run Detail 的 `Child workspaces` 面板展示 workspace id、cleanup state、artifacts 与 conflict 摘要。
- 未证明：自动 `git worktree add` provider、fanout 并行调度、自动 merge、真实外部写隔离。
- evidence gaps：当前 conflict detection 只按相同 `relativePath` 检测，不证明内容级或语义级冲突。

## Risks / Follow-ups

- blocking：无。
- non-blocking：默认 workflow 仍不启用隔离，避免改变 CLI / REPL 工作目录语义。
- next action：后续可把特定 fanout / automation spawned workflow 显式接入 `workspaceIsolation`。

## Backlog Item

- 编号：P1-04
- 开发包：Schema Migration / Redaction Hardening
- 目标：RunRecord、CLI、Workbench 与 eval report 不暴露本机用户目录路径敏感部分。
- 非目标：不引入迁移文件，不改变真实文件系统读写路径，不实现全量 PII 检测。

## Changed Files

- `packages/engine/src/redaction.ts`
- `packages/engine/src/run-record.ts`
- `packages/engine/src/evals/real-world.ts`
- `packages/engine/src/__tests__/run-record.test.ts`
- `packages/engine/src/__tests__/real-world-eval.test.ts`
- `packages/cli/src/__tests__/runs-commands.test.ts`
- `packages/web/src/shared/redaction.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts`
- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：`/Users/<user>/...`、`/home/<user>/...`、`C:\Users\<user>\...` 在 RunRecord 读取、落盘、summary、failure、artifact、replay path 中替换为 `[REDACTED_USER]`。
- 已证明：run store migration warning 与 malformed record error 的 diagnostic path 不暴露用户目录名。
- 已证明：CLI `runs show --compact`、Workbench Run Detail/raw inspector 与 real-world eval report 序列化输出均覆盖路径脱敏断言。
- 已证明：实际保存路径返回值不被脱敏，调用方仍可定位 `record.json`。
- 未证明：任意自然语言 PII、组织内部路径命名、非 home 目录项目名。

## Risks / Follow-ups

- blocking：无。
- non-blocking：engine 与 web 仍各有一份同构 redaction helper；后续可抽成共享包避免漂移。
- next action：继续按 backlog 审计 P1-01 / P1-02 / P1-05 与 P2 项。
