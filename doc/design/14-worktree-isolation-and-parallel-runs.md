# Worktree Isolation and Parallel Runs

> 状态：P1 foundation / 设计事实源
>
> 目的：为未来 fanout、tournament、automation spawned work 提供可审计的 child workspace 隔离地基。

## 1. 产品边界

本阶段只建立 isolation foundation，不声明 fanout、tournament 或真实并行 agent 产品化完成。

当前实现提供：

- isolated workspace manifest；
- workspace id 与 parent / child run 映射；
- 稳定 branch naming；
- artifact collection；
- conflicting output detection；
- cleanup / abandoned 标记；
- reviewer 不写 worker workspace 的基础策略函数。

当前不提供：

- 自动 `git worktree add` provider；
- fanout child 并行调度；
- tournament judge；
- 自动 merge；
- 自动解决冲突；
- reviewer 修改 worker workspace。

## 2. 核心模型

每个 child run 对应一个 `IsolatedWorkspace`：

```ts
interface IsolatedWorkspace {
  schemaVersion: 1;
  workspaceId: string;
  branchName: string;
  rootDir: string;
  workspacePath: string;
  manifestPath: string;
  parentRunId: string;
  childRunId: string;
  childRole: "worker" | "reviewer" | "verifier";
  status: "active" | "abandoned";
  taskGoal?: string;
  artifacts: WorkspaceArtifact[];
}
```

`workspaceId` 是产品级稳定标识，用于 RunRecord、debug bundle、Workbench 或 future workflow trajectory 关联。

`branchName` 是命名约定，不代表当前阶段已经创建真实 git branch。

## 3. 数据流

```text
parent workflow / automation
-> createIsolatedWorkspace()
-> child writes inside workspacePath
-> collectWorkspaceArtifacts()
-> detectWorkspaceConflicts()
-> cleanupIsolatedWorkspace(remove | mark_abandoned)
```

manifest 写入 workspace 根目录的 `.keigent-workspace.json`。

artifact collection 默认跳过：

- `.keigent-workspace.json`
- `.git/`
- `node_modules/`

当前 `WorkflowRunner` 已支持显式 opt-in：

```ts
createWorkflowSpec({
  id: "wf-example",
  task,
  workspaceIsolation: {
    rootDir: "/tmp/keigent-workspaces",
    cleanupMode: "remove" // 或 "mark_abandoned"
  }
})
```

启用后，每个 child run 会获得独立 `workspacePath`，production `createEngineWorkflowChildRunner()` 会把该路径传给 `LoopEngine` 作为 child workspace sandbox。默认不启用隔离，避免改变现有 CLI / REPL 工作目录语义。

## 4. Policy

基础写入策略：

| actor role | worker workspace | reviewer workspace |
|---|---:|---:|
| worker | 可写 | 不可写 |
| reviewer | 不可写 | 不可写 |
| verifier | 不可写 | 不可写 |

原因：

- reviewer / verifier 是 readonly 审查角色；
- worker artifact 应通过 artifact collection 和 diff 进入 review；
- reviewer 的意见应作为 evidence / issue，而不是直接改 worker workspace。

## 5. Conflict Semantics

`detectWorkspaceConflicts()` 只报告相同 `relativePath` 被多个 workspace 产出的情况。

它证明：

- 哪些 child run 产出同一路径；
- 哪些 workspace id 需要人工 review；
- parent 可以阻断自动合并。

它不证明：

- 文件内容是否语义冲突；
- 哪个候选更好；
- 是否可以自动 merge。

## 6. Cleanup Semantics

`cleanupIsolatedWorkspace()` 支持两种模式：

| mode | 行为 | 用途 |
|---|---|---|
| `remove` | 删除 workspace 目录 | 已回收 artifact 或用户明确清理 |
| `mark_abandoned` | 保留目录，manifest 标记 abandoned | parent timeout、人工中断、需要后续 triage |

abandoned workspace 是产品对象，不应静默丢弃。后续 debug bundle 和 automation triage 可以读取 manifest 进行清理建议。

## 7. Integration Path

接入状态：

1. RunRecord child summary 增加 `workspaceId`。（已完成：child summary 可携带 workspace id、branch、cleanup state、artifact 与 conflict 摘要。）
2. Workflow child runner 在显式 `workspaceIsolation` 配置下创建 workspace。（已完成：成功可 remove，失败/超时可 mark abandoned。）
3. ToolRegistry file tools 将 child workspace 作为 sandbox root。（已完成：production child adapter 将 workspace path 传给 `LoopEngine`。）
4. Reviewer 通过 artifact / diff / test report 审查，不写 worker workspace。
5. Workbench Run Detail 展示 workspace id、artifacts、conflicts、cleanup state。（已完成：Run Detail 的 Child workspaces 面板展示这些审计字段。）

## 8. 验收证据

当前 foundation 的可复现验收：

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/worktree-isolation.test.ts
corepack pnpm -r test
corepack pnpm -r check
corepack pnpm -r --if-present build
```

验收项：

- 每个 child run 有 workspace id；
- manifest 记录 parent / child run mapping；
- artifact 能回收；
- conflicting output 可检测；
- cleanup 可控；
- abandoned work 有记录；
- reviewer 不能写 worker workspace。
