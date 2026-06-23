# P1-03 Worktree Isolation Conflict Summary Design

## Backlog Item

- 编号：P1-03
- 开发包：Worktree Isolation Foundation
- 目标：让启用 workspace isolation 的 workflow child run 具备可审计的 workspace id、artifact、cleanup 与跨 child conflict summary。
- 非目标：不实现 fanout、tournament、自动 merge、真实 `git worktree add` provider、外部写 connector 或 reviewer 修改 worker workspace。

## Current Baseline

当前 runtime 已有：

- `createIsolatedWorkspace()` 创建 child workspace 与 `.keigent-workspace.json` manifest。
- `collectWorkspaceArtifacts()` 回收 child workspace 产物。
- `detectWorkspaceConflicts()` 可以对多个 workspace 的 artifact 做同路径冲突检测。
- `cleanupIsolatedWorkspace()` 支持 `remove` 与 `mark_abandoned`。
- `canWriteWorkspace()` 拒绝 reviewer / verifier 写 worker workspace。
- `WorkflowRunner` 在显式 `workspaceIsolation` 配置下为 child run 创建 workspace，并把 `workspacePath` 传入 production child runner。
- RunRecord / Workbench 已能展示 child workspace audit summary。

## Gap

`detectWorkspaceConflicts()` 的工具能力是跨 workspace 的，但 `WorkflowRunner` 目前在每个 child workspace 收口时只传入单个 workspace。这样 reviewed-loop 等多 child workflow 即使两个 child 产出相同 `relativePath`，每个 child summary 中的 `conflicts` 仍为空。

P1-03 的验收要求包含 `conflict detection 可验`。因此 workflow result、workflow trajectory、RunRecord child summary 和 Workbench 应拿到跨 child conflict summary，而不是每个 child 只看自己。

## Requirements

1. `WorkflowRunner` 必须先收集所有启用 isolation 的 child workspace artifacts。
2. cleanup 仍按每个 child 的 `cleanupModeFor()` 执行：
   - success 默认 `remove`；
   - timeout / non-success 默认 `mark_abandoned`；
   - 显式 `workspaceIsolation.cleanupMode` 优先。
3. 在所有 child workspace artifacts 收集完成后，`WorkflowRunner` 必须调用 `detectWorkspaceConflicts()` 进行跨 child conflict detection。
4. 每个相关 child 的 `workspace.conflicts` 必须包含涉及该 child workspace 的 conflict。
5. `WorkflowTrajectory.childRuns[].workspace.conflicts` 必须与 `WorkflowResult.childRuns[].workspace.conflicts` 一致。
6. 不改变 `worktree-isolation.ts` 的 primitive contract。
7. 不引入真实 git worktree provider、自动 merge 或 fanout 调度。

## Tests

- `packages/engine/src/__tests__/workflow-runner.test.ts`
  - reviewed-loop 启用 `workspaceIsolation` 时，worker 和 reviewer 分别写入同名 artifact，两个 child workspace summary 都包含同一条 conflict。
  - workflow trajectory 中保留同样的 conflict summary。
- `packages/engine/src/__tests__/worktree-isolation.test.ts`
  - 继续覆盖 primitive 层跨 workspace conflict detection。
- `packages/engine/src/__tests__/run-record.test.ts`
  - 继续覆盖 RunRecord child workspace summary 持久化。
- `packages/web/src/__tests__/run-workbench.test.ts`
  - 继续覆盖 Workbench 展示 child workspace conflicts。

## Proof Boundary

本包证明：

- 启用 `workspaceIsolation` 的多 child workflow 可以把同路径 artifact conflict 写入 child summary 和 workflow trajectory。
- cleanup、abandoned 标记、artifact collection 和 Workbench audit surface 与 P1-03 foundation 保持一致。

本包不证明：

- 真实 git worktree 已创建。
- fanout / tournament / parallel scheduling 已产品化。
- 冲突能自动 merge 或自动解决。
- conflict detection 能判断内容级或语义级冲突。
