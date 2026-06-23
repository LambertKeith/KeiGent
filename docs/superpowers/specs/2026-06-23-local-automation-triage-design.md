# P1-02 Local Automation Triage Design

## Backlog Item

- 编号：P1-02
- 开发包：Local Automation Triage
- 目标：提供第一个低风险本地 automation，用于扫描本地 run store 并输出失败、降级、证据缺口、stale schema 的 triage 结果。
- 非目标：不修复被 triage 的 run，不宣称系统健康，不执行外部写操作，不替代人类 operator 审查。

## Current Baseline

当前 runtime 已有：

- `automation triage local` CLI 入口。
- `runs triage` 轻量候选列表。
- `buildAutomationTriageReport()`、`saveAutomationTriageReport()`、`saveAutomationTriageTrajectory()` 与 `buildAutomationTriageRunRecord()`。
- 本地 run store 读取、legacy schema migration warning 与 redaction。
- no-op automation RunRecord、triage report、trajectory artifact。
- Workbench 可展示 automation no-op scope、source runs 与 report artifact。

## Gap

P1-02 的产品要求不仅是生成 JSON artifact，还要让本地 operator 在默认 human 输出中直接看到可审计入口和下一步：

- no-op 不能只输出没有候选，必须展示 automation RunRecord、report、trajectory、next action 和 `doesNotProve`。
- attention-required 不能只输出候选行，必须展示 automation RunRecord、report、trajectory、source run ids 和 next action。
- source run ids 必须在 report、RunRecord、trajectory、Workbench 和默认 human 输出中可追溯。
- no-op 明确只证明声明 scope 内未发现候选，不证明隐藏失败不存在。

## Requirements

1. `keigent automation triage local` 默认 human 输出在 no-op 时必须包含：
   - `No triage candidates found.`
   - `Status: no-op`
   - `Scope: last N runs`
   - `Automation record: <path>`
   - `Report: <path>`
   - `Trajectory: <path>`
   - `Next action: Review automation scope before treating no-op as health.`
   - `Does not prove: No hidden failures outside this scope.`
2. `keigent automation triage local` 默认 human 输出在 attention-required 时必须包含：
   - `Triage candidates: N`
   - `Automation record: <path>`
   - `Report: <path>`
   - `Trajectory: <path>`
   - `Next action: Review N triage candidates before retrying or accepting affected runs.`
   - `Source runs: <run ids>`
   - 每个候选的 `runId	status	reason	nextAction`
3. `--json` 与 `--compact` 输出继续保持机器可读，并包含 `automationRecord.reportPath`、`automationRecord.trajectoryPath`、`sourceRunIds`。
4. failed assertion 必须 classified 为 `blocking_failure`。
5. degraded / cancelled / failed 且无 blocking evidence 的 run 必须 classified 为 `review_needed`。
6. missing evidence / not checked / zero assertion 必须 classified 为 `missing_evidence`。
7. stale schema 或 unknown status 必须 classified 为 `stale_schema`。
8. local triage 不能递归 triage 自己生成的 automation RunRecord。
9. no-op RunRecord、report、trajectory 和 Workbench surface 都必须保留 proof boundary。

## Tests

- `packages/cli/src/__tests__/automation-commands.test.ts`
  - no-op `--compact` 保存 report、trajectory 和 no-op RunRecord。
  - no-op 默认 human 输出包含 automation record、report、trajectory、next action 和 does-not-prove。
  - failed / degraded / missing evidence / unknown 生成 candidates 和 source run ids。
  - attention-required 默认 human 输出包含 automation record、report、trajectory、source runs 和 next action。
  - legacy schema warning 即使归一化为 successful 也进入 `stale_schema`。
  - local triage 不把之前的 local triage automation record 当作候选。
- `packages/engine/src/__tests__/automation-triage.test.ts`
  - no-op 和 attention-required artifact / RunRecord proof boundary。
- `packages/web/src/__tests__/run-workbench.test.ts`
  - Workbench 展示 P1-02 automation triage source runs 和 report artifact。

## Proof Boundary

本包证明：

- local automation triage 可以在声明 scope 内扫描本地 RunRecord。
- no-op / failed / degraded / missing evidence / stale schema 语义可复测。
- 默认 human 输出提供可审计 artifact 路径、source run ids 和 next action。
- no-op 不被表达为系统健康。

本包不证明：

- scope 之外不存在隐藏失败。
- 被 triage 的失败已经修复。
- 外部系统状态健康。
- 自动 triage 可以替代人类 operator 审查。
