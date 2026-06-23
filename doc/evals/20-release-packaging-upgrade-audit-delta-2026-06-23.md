# P2-04 Release Packaging Upgrade Audit Delta

## Backlog Item

- 编号：P2-04
- 开发包：Release / Packaging / Upgrade Path
- 目标：从开发仓库走向本地产品。
- 非目标：不发布 package；不创建 release tag；不自动修改用户配置；不自动迁移 run store；不宣称 CI workflow 文件存在等同 hosted CI 已运行。

## Changed Files

- `.github/workflows/ci.yml`
- `docs/superpowers/specs/2026-06-23-release-packaging-upgrade-audit-design.md`
- `docs/superpowers/plans/2026-06-23-release-packaging-upgrade-audit.md`
- `packages/cli/src/__tests__/package-metadata.test.ts`
- `doc/evals/20-release-packaging-upgrade-audit-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`
- `doc/product/10-release-and-upgrade.md`

## Product Contract

- CLI package metadata must expose a direct `keigent` bin shim without pnpm/npx wrapper noise.
- Sample config and `.env.example` must remain secret-safe.
- Legacy config without `configVersion` must resolve as `configVersion: 1`.
- Unknown future config versions must be reported by doctor as unsupported.
- First-run guide must be read-only and machine-readable.
- Upgrade-check guide must be read-only and must not claim upgrade safety.
- Release checklist must be reproducible and must not claim release readiness before gates run.
- CI workflow must run deterministic Node 22.19 release gates without real secrets.

## Tests / Evals

- PASS：`corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts`
- PASS：`corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/guide-command.test.ts src/__tests__/config.test.ts src/__tests__/config-doctor.test.ts`
- PASS：`corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- PASS：`corepack pnpm -r check`
- PASS：`corepack pnpm -r test`
- PASS：`corepack pnpm -r --if-present build`
- PASS：`git diff --check`
- PASS：`rg -n "P2-04|Release Packaging Upgrade|release-packaging-upgrade|node-version: 22.19.0|corepack prepare pnpm@10.33.2|guide upgrade-check|does_not_claim_upgrade_safe|20-release-packaging-upgrade" .github docs/superpowers doc packages/cli/src`

## Evidence

- 已证明：`.github/workflows/ci.yml` 在 push / pull_request 上以 Node.js `22.19.0` 运行确定性 gates。
- 已证明：CI workflow 启用 Corepack 并固定 pnpm `10.33.2`。
- 已证明：CI workflow 包含 install、`verify:node`、check、test、build 和 clean bin shim JSON gates。
- 已证明：package metadata test 覆盖 bin shim、license/contribution policy、release verification script、bin executable bit 和 clean `runs list --compact` JSON。
- 已证明：现有 guide/config/doctor 测试覆盖 first-run、upgrade-check、release checklist、sample config、config compatibility 和 actionable doctor diagnostics。

## Proof Boundary

已证明：

- P2-04 的 Node 22+ CI 定义存在并被测试锁定。
- 本地 release / upgrade 指南与 package metadata 有自动化回归覆盖。
- 版本兼容边界记录在 `doc/product/10-release-and-upgrade.md`。

未证明：

- GitHub hosted CI 已经在远端 PR 上实际运行。
- package 已发布。
- release tag 已创建。
- 真实用户已完成 first-run。
- browser verification 已在 CI 中运行。
- upgrade-check guide 已迁移任何历史配置或 RunRecord。

## Remaining Risks

- blocking：无。
- non-blocking：CI 当前不跑 browser verification；正式 release checklist 仍要求显式 Playwright browser cache 后手动运行 `verify:browser`。
- next action：P2-04 完成后继续推进 P2-05 Performance / Budget Controls。
