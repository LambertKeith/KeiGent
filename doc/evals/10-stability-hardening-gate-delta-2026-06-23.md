# P0-05 Stability Hardening Gate Delta

## Backlog Item

- 编号：P0-05
- 开发包：Stability Hardening Gate
- 目标：把 P0 false-confidence 红线集中成可执行主干门禁。
- 非目标：不新增 agent loop；不改变 RunRecord schema；不把 fixture pass 解释为生产健康或真人验收。

## Changed Files

- `docs/superpowers/specs/2026-06-23-stability-hardening-gate-design.md`
- `docs/superpowers/plans/2026-06-23-stability-hardening-gate.md`
- `packages/engine/src/evals/stability-gate.ts`
- `packages/engine/src/evals/stability-gate-cli.ts`
- `packages/engine/src/evals/real-world.ts`
- `packages/engine/src/evals/index.ts`
- `packages/engine/src/lib.ts`
- `packages/engine/package.json`
- `packages/engine/src/__tests__/stability-gate.test.ts`
- `packages/engine/src/__tests__/stability-gate-cli.test.ts`
- `packages/engine/src/__tests__/public-api.test.ts`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `AGENTS.md`

## Redline Matrix

| Redline | Fixture facts used | Expected gate result |
|---|---|---|
| `final_text_not_success` | `insufficient-evidence-success-claim` | insufficient evidence remains `failed` with `verified_failure` |
| `tool_attempted_not_succeeded` | `reviewer-readonly-violation` | attempted `file_write` is not counted as succeeded |
| `replay_not_fresh` | `replay-report`, `replay-stale-schema` | replay records remain `freshExecution=false` |
| `empty_evidence_not_100` | empty L2 dataset report | metrics are `null` and `empty_dataset` is blocking |
| `approval_not_bypassed` | `approval-denied` | denied approval leaves `sideEffectsSucceeded=0` |
| `blocked_skill_not_injected` | `stale-skill-blocked`, `deprecated-skill-warning` | non-executable skills are matched but not injected |
| `reviewer_readonly` | `reviewer-readonly-violation` | reviewer write attempt fails with `permission_denied` |
| `parent_timeout_authoritative` | `parent-timeout-child-success` | parent `timeout` keeps run `cancelled` despite child success |
| `secret_redaction` | `redaction-leak-guard` | serialized report contains no raw secret markers |

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/stability-gate.test.ts src/__tests__/stability-gate-cli.test.ts`
- Required before acceptance: `corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- Required before acceptance: `corepack pnpm -r check`
- Required before acceptance: `corepack pnpm -r test`
- Required before acceptance: `corepack pnpm -r --if-present build`
- Required before acceptance: `git diff --check`

## Evidence

- 已证明：`runStabilityGate()` 输出 `StabilityGateReport`，包含 9 条 P0 红线、通过/失败计数、结构化 evidence 和 proof boundary。
- 已证明：`eval:stability -- --compact` 可作为 engine package script 执行，任一红线失败时 CLI 会以非零退出码阻断。
- 已证明：门禁判断基于 RunRecord/eval facts，不从 final text 推断成功。
- 已证明：stale/deprecated skill fixture 现在记录为非可执行匹配且 `injected=false`。
- 未证明：真实生产环境健康。
- 未证明：外部系统、浏览器、网络 connector 的实时状态。
- 未证明：人类 reviewer 已完成验收。

## Remaining Risks

- blocking：无。
- non-blocking：当前 gate 覆盖的是 P0 已知 deterministic redlines；新增 P1/P2 治理能力时需要继续扩展 redline set。
- next action：把 `eval:stability -- --compact` 纳入主干质量门或 CI 配置。
