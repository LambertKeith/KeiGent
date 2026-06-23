# P1-01 Reviewed-loop v1 Design

## Backlog Item

- 编号：P1-01
- 开发包：Reviewed-loop v1
- 目标：把 maker / checker 分离产品化为明确的 reviewer readonly policy contract。
- 非目标：不新增第二套 agent loop，不实现 fanout/tournament，不让 reviewer 替代人类验收，不改变 RunRecord schema。

## Current Baseline

当前 runtime 已有：

- `ExecutionMode = "reviewed-loop"`。
- `WorkflowRunner` 顺序执行 worker 和 reviewer child。
- 默认 `ReviewRubric` 与 `ReviewSummary`。
- reviewer checkpoint 派生 blocking issues。
- RunRecord child role / review summary 持久化。
- Workbench 展示 Review rubric、Reviewer issues 与 child run timeline。
- L2 fixture 覆盖 `reviewed-loop-accepted` 与 `reviewer-readonly-violation`。

## Gap

现有 readonly 语义主要通过历史字段 `verifierReadonly` 表达。P1-01 需要把 reviewer 作为产品角色显式建模：

- reviewer policy 必须有 `reviewerReadonly=true`。
- reviewer tool policy 必须被强制收敛为 `maxPermission=readonly`、`maxRiskLevel=R0`、`allowExternalSideEffects=false`。
- 调用方传入更宽松 policy 时，reviewer child 不能继承写权限、危险权限或 external side effect。
- `verifierReadonly` 保留兼容，但不再作为 reviewed-loop 产品语义的唯一字段。

## Requirements

1. `WorkflowPolicy` 新增 `reviewerReadonly?: boolean`。
2. `createWorkflowSpec({ mode: "reviewed-loop" })` 生成的 policy 必须包含：
   - `reviewerReadonly: true`
   - `verifierReadonly: true`
   - `maxPermission: "readonly"`
   - `maxRiskLevel: "R0"`
   - `allowExternalSideEffects: false`
3. `WorkflowRunner` 创建 reviewer child 时必须再次收敛 reviewer policy，防止直接传入宽松 `spec.policy`。
4. `isToolAllowedByWorkflowPolicy()` 必须识别 `reviewerReadonly`，并继续兼容 `verifierReadonly`。
5. reviewed-loop 的 reviewer 通过不能覆盖 worker failure 或 failed assertion。
6. Workbench 继续展示 worker/reviewer timeline 与 review summary。

## Tests

- `workflow-planner.test.ts`
  - reviewed-loop 默认 policy 显式包含 `reviewerReadonly` 和 readonly 上限。
  - 调用方传入宽松 policy 时，reviewer policy 不被放宽。
- `workflow-policy.test.ts`
  - `reviewerReadonly` 阻止 reviewer write / external side effect。
  - `verifierReadonly` 兼容路径仍通过。
- `workflow-runner.test.ts`
  - reviewer child policy 被收敛为 readonly。
  - worker failure 即使 reviewer checkpoint passed，parent 仍失败。
- `real-world-eval.test.ts`
  - reviewed-loop L2 fixture 保持 worker/reviewer child role 与 review summary。

## Proof Boundary

本包证明：

- reviewed-loop 的 reviewer 是明确 readonly 产品角色。
- worker/reviewer child role、rubric、issues 与 RunRecord/Workbench 复盘链路保持稳定。
- reviewer 不能通过成功文本覆盖 worker failure。

本包不证明：

- 人类 reviewer 已验收。
- fanout/tournament/judge 能力。
- reviewer 能替代独立测试或 code owner review。
