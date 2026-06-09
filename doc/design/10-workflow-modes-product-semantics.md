# Workflow Modes Product Semantics

> 目标：定义什么时候需要 workflow，以及每种 workflow mode 的产品语义、边界、预算与验收。

## 1. 总原则

Workflow 不是“更高级的 loop”，而是 parent envelope。每个 child 仍然运行 `LoopEngine`。只有当任务需要多阶段证据、隔离、评审或比较时，才启用 workflow。

## 2. Mode 矩阵

| Mode | 产品意义 | 适用任务 | 不适用 | 成功证据 |
|---|---|---|---|---|
| single-loop | 普通一次运行 | 闲聊、简单研究、简单执行 | 复杂审批/评审 | LoopResult + trajectory |
| verified-loop | 对单次执行加证据门 | 有明确 assertions 的执行任务 | 开放创作/研究 | passed checkpoint/verdict |
| reviewed-loop | worker 后接 reviewer | 方案、文档、代码评审 | 低价值快速任务 | reviewer rubric + worker evidence |
| fanout-synthesis | 多候选并行后综合 | 方案探索、创意、策略比较 | 精确副作用执行 | candidates + synthesis rationale |
| tournament | 多候选排名 | 高价值设计/文案/方案 | 无 rubric 的偏好任务 | ranking rubric + judge trace |
| quarantined-research | 不可信输入隔离 | 公网研究、网页总结 | 本地可信文件任务 | no side-effect proof + summary |

## 3. P0/P1/P2 边界

### P0 已有/保持

- `single-loop`
- conservative `verified-loop`
- sequential child run
- budget/timeout/failure/evidence trajectory

### P1 可设计实现

- reviewed-loop：worker + readonly reviewer。
- stronger assertion evaluation。
- workflow policy enforcement。

### P2 以后再做

- fanout-synthesis。
- tournament。
- quarantined-research with strict tool segregation。
- dynamic planner。

## 4. 禁止规则

- 没有 rubric 不启用 reviewer/tournament。
- 没有 assertions 不显示 verified success。
- dynamic planner 不能创建超过 policy 的 child。
- fanout child 不能共享可变 tool callback 状态。
- verifier 不能执行修复性副作用。

## 5. Budget 模型

每个 workflow 必须声明：

```ts
{
  maxChildRuns: number;
  maxIterationsPerRun: number;
  maxAggregateIterations?: number;
  maxAggregateToolCalls?: number;
  timeoutMs?: number;
}
```

超过预算的结果是 workflow failure，不是 child failure。

## 6. Failure Semantics

| Failure | 含义 | 用户表达 |
|---|---|---|
| child_error | child runtime 异常 | 子运行崩溃，未完成目标 |
| child_escalated | child 需要人类介入 | 自动化边界到达 |
| verified_failure | child 完成但证据不通过 | 操作可能完成，但证据不足/失败 |
| budget_exceeded | parent 预算耗尽 | 需要调整任务或预算 |
| timeout | 父级超时 | 取消已传播，不再信任 late success |

## 7. 验收标准

- 每个 workflow result 有 childRuns、budgetUsage、evidence、trajectory。
- parent timeout 后 late child success 不能覆盖 parent result。
- verified-loop 至少要求一个 passed checkpoint/verdict。
- reviewed-loop 的 reviewer 默认 readonly。
- fanout/tournament 进入实现前必须先有 eval fixture 与 rubric。
