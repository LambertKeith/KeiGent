# P1-05 CLI Runs Replay Handoff Delta

## Backlog Item

- 编号：P1-05
- 开发包：CLI Operator Ergonomics
- 目标：让本地 operator 通过 `runs replay <run-id>` 获得可复制 replay command 和明确 replay proof boundary。
- 非目标：不执行 replay；不启动 Workbench；不实现交互式 TUI；不改变 run store 默认位置。

## Changed Files

- `docs/superpowers/specs/2026-06-23-cli-runs-replay-handoff-design.md`
- `docs/superpowers/plans/2026-06-23-cli-runs-replay-handoff.md`
- `packages/cli/src/runs-commands.ts`
- `packages/cli/src/__tests__/runs-commands.test.ts`
- `doc/evals/16-cli-runs-replay-handoff-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`

## Product Contract

- `runs replay <run-id>` 只打印 replay handoff，不执行 replay。
- human 输出必须展示 run id、copyable command、trajectory、`Fresh execution: false`、does-not-prove 和 next action。
- compact/json 输出必须带出相同 proof boundary。
- replay command 必须 shell-safe quote trajectory path。

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts`
- PASS: `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts src/__tests__/package-metadata.test.ts src/__tests__/eval-commands.test.ts`
- PASS: `corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- PASS: `corepack pnpm -r check`
- PASS: `corepack pnpm -r test`
- PASS: `corepack pnpm -r --if-present build`
- PASS: `git diff --check`
- PASS: `rg "P1-05|CLI Operator Ergonomics|runs replay|Replay command|Historical replay" docs/superpowers doc packages`

## Evidence

- 已证明：human `runs replay` 输出 replay proof boundary。
- 已证明：compact `runs replay` 输出结构化 proof boundary。
- 已证明：路径含空格和单引号时 replay command 使用 shell-safe quoting。

## Remaining Risks

- blocking：无。
- non-blocking：本命令仍不执行 replay，也不验证 replay report 是否通过。
- next action：P1 完成后按 backlog 推进 P2。
