# P1-02 Local Automation Triage Delta

## Backlog Item

- 编号：P1-02
- 开发包：Local Automation Triage
- 目标：做第一个低风险本地 automation，用于本地 run store 的失败、降级、证据缺口与 stale schema triage，并给 operator 可审计输出。
- 非目标：不修复被 triage 的 runs；不把 no-op 宣称为系统健康；不执行外部写操作；不替代人类 operator 审查。

## Changed Files

- `docs/superpowers/specs/2026-06-23-local-automation-triage-design.md`
- `docs/superpowers/plans/2026-06-23-local-automation-triage.md`
- `packages/cli/src/automation-commands.ts`
- `packages/cli/src/__tests__/automation-commands.test.ts`
- `doc/evals/13-local-automation-triage-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`

## Product Contract

- `automation triage local` 会扫描声明 scope 内最近 RunRecords，并跳过本命令之前生成的 local triage automation RunRecord。
- no-op 会保存 no-op automation RunRecord、`triage-report.json` 和 `trajectory.json`。
- attention-required 会保存 degraded automation RunRecord、`triage-report.json` 和 `trajectory.json`，并保留 source run ids。
- 默认 human 输出现在展示 automation record、report、trajectory、next action、source run ids 与 `doesNotProve`。
- no-op 只表示 scope 内未发现 triage candidates，不证明 scope 外没有隐藏失败。

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/automation-commands.test.ts`，1 file / 7 tests。
- PASS: `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts`，1 file / 13 tests。
- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/automation-triage.test.ts src/__tests__/debug-bundle.test.ts`，2 files / 3 tests。
- PASS: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`，1 file / 14 tests。
- PASS: `corepack pnpm --filter @keigent/engine eval:stability -- --compact`，9/9 redlines passed。
- PASS: `corepack pnpm -r check`。
- PASS: `corepack pnpm -r test`，engine 46 files / 197 tests，cli 16 files / 107 tests，web 15 files / 83 tests。
- PASS: `corepack pnpm -r --if-present build`。
- PASS: `git diff --check`。
- PASS: `rg "P1-02|Local Automation Triage|automation triage local|Automation record|Source runs" docs/superpowers doc packages`。

## Evidence

- 已证明：no-op local triage 会保存 automation RunRecord、triage report 和 trajectory，并在默认 human 输出中显示对应路径。
- 已证明：attention-required local triage 会显示候选数量、source run ids、next action 与每个 candidate 的 reason。
- 已证明：failed assertion、degraded run、missing evidence、unknown / stale schema 都有明确 triage reason。
- 已证明：local triage 不递归 triage 自己产生的 automation records。
- 已证明：Workbench P1-02 surface 继续展示 source runs 与 report artifacts。
- 未证明：scope 外没有隐藏失败。
- 未证明：被 triage 的失败已经修复。
- 未证明：外部系统状态健康。

## Remaining Risks

- blocking：无。
- non-blocking：`runs triage` 仍是轻量候选列表；产品级 automation record/report 闭环在 `automation triage local`。
- next action：继续推进 P1-03 Worktree Isolation Foundation 或 P1-05 CLI Operator Ergonomics，具体顺序按 backlog 推荐和当前依赖确认。
