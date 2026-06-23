# P1-04 Debug Bundle Redaction Summary Delta

## Backlog Item

- 编号：P1-04
- 开发包：Schema Migration / Redaction Hardening
- 目标：让 debug bundle 明确表达 redaction policy、scope、raw payload 边界和未证明内容。
- 非目标：不引入迁移文件；不重写历史 run store；不实现全量 PII 检测；不改变真实 artifact 读取路径。

## Changed Files

- `docs/superpowers/specs/2026-06-23-debug-bundle-redaction-summary-design.md`
- `docs/superpowers/plans/2026-06-23-debug-bundle-redaction-summary.md`
- `packages/engine/src/debug-bundle.ts`
- `packages/engine/src/__tests__/debug-bundle.test.ts`
- `packages/cli/src/__tests__/runs-commands.test.ts`
- `doc/evals/15-debug-bundle-redaction-summary-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/design/12-agent-debuggability.md`

## Product Contract

- debug bundle 必须包含 `redaction-summary.json`。
- summary 必须说明 redaction 是否应用、raw payload 是否存储、规则、scope、redacted files、missing artifact diagnostics 和 proof boundary。
- summary 自身必须经过 redaction。
- 本增量不修改 RunRecord schema，不修改 migration files，不静默重写 legacy records。

## Tests / Evals

- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts`，1 file / 1 test，包含 RED/GREEN 新增 redaction summary 断言。
- PASS: `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts src/__tests__/run-record.test.ts src/__tests__/real-world-eval.test.ts`，3 files / 24 tests。
- PASS: `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts src/__tests__/config.test.ts`，2 files / 27 tests。
- PASS: `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`，1 file / 14 tests。
- PASS: `corepack pnpm --filter @keigent/engine eval:stability -- --compact`，9/9 redlines passed。
- PASS: `corepack pnpm -r check`。
- PASS: `corepack pnpm -r test`，engine 46 files / 198 tests，cli 16 files / 107 tests，web 15 files / 83 tests。
- PASS: `corepack pnpm -r --if-present build`。
- PASS: `git diff --check`。
- PASS: `rg "P1-04|Schema Migration / Redaction|redaction-summary|redaction_summary|Redaction Summary" docs/superpowers doc packages`。

## Evidence

- 已证明：engine debug bundle 生成 `redaction-summary.json`。
- 已证明：CLI debug bundle compact output 暴露 `redaction-summary.json`。
- 已证明：summary 不泄漏 raw API key、bearer token、artifact secret 或 user home segment。
- 已证明：RunRecord migration、CLI/Web/eval redaction 回归保持通过。

## Remaining Risks

- blocking：无。
- non-blocking：redaction 仍是 pattern-based，不证明任意自然语言 PII 都被识别。
- next action：继续推进 P1-05 CLI Operator Ergonomics。
