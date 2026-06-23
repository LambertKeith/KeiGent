# P0-05 Stability Hardening Gate Design

## Backlog Item

- 编号：P0-05
- 开发包：Stability Hardening Gate
- 目标：把 P0 false-confidence 红线变成可执行主干门，而不是散落的测试约定。
- 非目标：不新增 agent loop，不改变 RunRecord schema，不接入外部系统，不把 fixture pass 解释为生产健康。

## Context

P0-01 到 P0-04 已经让 RunRecord、Workbench Run Detail、skill explanation 和 eval-run linkage 具备事实源与 UI 复盘能力。P0-05 需要把这些能力压成一个稳定 gate，回答：

```text
当前本地确定性主干是否仍然阻止已知 false-confidence 失败模式？
```

## Requirements

`@keigent/engine` 必须新增一个 deterministic stability gate：

- 输入：默认使用 `DEFAULT_REAL_WORLD_L2_CASES` 和 fixture executor 生成的 L2 report。
- 输出：结构化 `StabilityGateReport`。
- CLI：`corepack pnpm --filter @keigent/engine eval:stability -- --compact`。
- 退出码：任一红线失败时非零退出。

## Redline Checks

| 红线 | 检查方式 |
|---|---|
| final text 伪造成功 | `insufficient-evidence-success-claim` 必须是 failure，RunRecord status 不能是 `succeeded`，evidence 必须是 `insufficient_evidence` |
| tool attempted 当 succeeded | 所有 RunRecord `tools` 必须允许 attempted/succeeded 分离；存在 attempted 且未 succeeded 的工具时，不能计入 succeeded |
| replay 伪装 fresh | `replay-report` 与 `replay-stale-schema` 必须 `freshExecution=false` |
| empty evidence 100% | 空 dataset metrics 必须为 `null`，`empty_dataset` finding 必须 blocking |
| approval 绕过 | `approval-denied` 必须有 denied approval trail，sideEffectsSucceeded 必须为 0 |
| blocked skill 注入 | `stale-skill-blocked` / `deprecated-skill-warning` 必须失败，且不能包含 injected blocked skill |
| reviewer 写操作 | `reviewer-readonly-violation` 必须是 permission failure，file_write 不得 succeeded |
| parent timeout 被 child success 覆盖 | `parent-timeout-child-success` parent status 必须 `cancelled`，workflow exitReason 必须 `timeout` |
| secret 泄漏 | serialized L2 report 不得包含 fixture secret/user path raw tokens |

## Report Shape

```ts
interface StabilityGateReport {
  generatedAt: string;
  datasetId: string;
  totalRedlines: number;
  passedRedlines: number;
  failedRedlines: number;
  status: "passed" | "failed";
  redlines: StabilityGateCheck[];
  proofBoundary: ProofBoundary;
}
```

每个 check 必须包含 `id`、`title`、`passed`、`evidence`、`failure` 和 `caseIds`。`proofBoundary.notProven` 必须写明 fixture 不能证明生产健康或真人验收。

## Tests

- `packages/engine/src/__tests__/stability-gate.test.ts`
  - 默认 gate 必须覆盖九条红线且全绿。
  - 篡改 replay fresh / approval side effect / insufficient evidence success 时，gate 必须失败。
  - empty dataset check 必须拒绝伪造 100%。
- `packages/engine/src/__tests__/stability-gate-cli.test.ts`
  - CLI compact 输出包含 `status` 与九条 redlines。
  - 默认命令 exit code 为 0。

## Acceptance

本包完成后可证明：

- 九条 P0 false-confidence 红线有集中、可运行的 gate。
- gate 基于 RunRecord/eval facts，而不是 final text。
- gate 报告明确 proof boundary，不宣称产品健康。

本包不能证明：

- 真实外部系统健康。
- 人类 reviewer 已实际验收。
- P1/P2 全部目标已完成。
