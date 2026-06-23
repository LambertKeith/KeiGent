# P1-01 Reviewed-loop v1 Delta

## Backlog Item

- 编号：P1-01
- 开发包：Reviewed-loop v1
- 目标：把 maker / checker 分离产品化，并让 reviewer readonly policy 成为显式可测 contract。
- 非目标：不新增第二套 agent loop；不实现 fanout/tournament；不把 reviewer 结果等同人类验收。

## Changed Files

- `docs/superpowers/specs/2026-06-23-reviewed-loop-v1-design.md`
- `docs/superpowers/plans/2026-06-23-reviewed-loop-v1.md`
- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/workflow/planner.ts`
- `packages/engine/src/workflow/policy.ts`
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/__tests__/workflow-planner.test.ts`
- `packages/engine/src/__tests__/workflow-policy.test.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`

## Product Contract

- `WorkflowPolicy.reviewerReadonly` 显式表达 reviewer 是 readonly 产品角色。
- `reviewed-loop` spec policy 会收敛为 `reviewerReadonly=true`、`verifierReadonly=true`、`maxPermission=readonly`、`maxRiskLevel=R0`、`allowExternalSideEffects=false`。
- reviewer child 创建时再次收敛 policy，调用方传入 `dangerous/R5/external` 也不能放宽 reviewer。
- `verifierReadonly` 保留为兼容字段。

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-planner.test.ts src/__tests__/workflow-policy.test.ts src/__tests__/workflow-runner.test.ts`
- Required before acceptance: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts`
- Required before acceptance: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- Required before acceptance: `corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- Required before acceptance: `corepack pnpm -r check`
- Required before acceptance: `corepack pnpm -r test`
- Required before acceptance: `corepack pnpm -r --if-present build`
- Required before acceptance: `git diff --check`

## Evidence

- 已证明：reviewed-loop 默认生成 reviewer readonly policy contract。
- 已证明：宽松 caller policy 不会放宽 reviewer child。
- 已证明：`reviewerReadonly` 直接参与 workflow policy helper 的工具过滤。
- 已证明：worker failure 优先于 reviewer success，reviewer 不能覆盖 worker failed evidence。
- 已证明：现有 L2 fixture 与 Workbench review surface 仍作为回归门。
- 未证明：人类 reviewer 已实际验收。
- 未证明：fanout、tournament、judge 或动态 planner 能力。

## Remaining Risks

- blocking：无。
- non-blocking：review issue 当前仍主要由 reviewer checkpoint evidence 派生，未来可扩展更细的 rubric parser。
- next action：继续推进 P1-02 Local Automation Triage。
