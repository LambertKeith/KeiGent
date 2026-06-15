# Release and Upgrade Path

> 状态：产品化发布入口 / 本地 operator 指南  
> 目标：让本地用户能完成首次运行、版本升级前检查、发布验收和变更追踪。

---

## 1. First-run Guide

CLI 可先打印只读首次运行指引，不会写配置、不会发起网络检查、不会宣称产品健康。机器可读输出中的每个步骤都带有 `gate`、`proves` 和 `doesNotProve`，便于 operator 区分 setup、diagnostic、fixture、release 与 Workbench 边界：

```bash
corepack pnpm --filter @keigent/cli start guide first-run
corepack pnpm --filter @keigent/cli start guide first-run --compact
```

从仓库根目录执行：

```bash
corepack pnpm install
mkdir -p ~/.keigent
cp config.example.json ~/.keigent/config.json
```

推荐用环境变量注入密钥，避免把 secret 写入文件：

```bash
export KEIGENT_API_KEY="..."
```

确认有效配置和本地目录状态：

```bash
corepack pnpm --filter @keigent/cli start config show --compact
corepack pnpm --filter @keigent/cli start doctor --compact
```

`doctor` 会检查 Node 版本、API key、配置 schema、model capabilities 与浏览器 cache 提示。缺少 `PLAYWRIGHT_BROWSERS_PATH` 时会给出可行动 next action；正式浏览器验收仍需显式设置 browser cache 路径。

最小 starter 验收路径：

```bash
corepack pnpm install
corepack pnpm --filter @keigent/cli start doctor --compact
corepack pnpm --filter @keigent/cli start eval smoke --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
```

operator fixture / human packet 入口：

```bash
corepack pnpm --filter @keigent/engine eval:operator -- --compact
corepack pnpm --filter @keigent/cli start eval operator --packet
corepack pnpm --filter @keigent/cli start eval operator --acceptance /path/to/operator-signoff.json --compact
```

real-world L2 与 operator L3 fixture 只证明确定性本地样本和人工验收 packet 生成路径；它们不证明生产健康、外部系统状态、完整 Workbench 成熟度或真人已接受。

正式 CLI bin shim 验证：

```bash
node packages/cli/bin/keigent.mjs runs list --compact
node packages/cli/bin/keigent.mjs skill list --compact
corepack pnpm --filter @keigent/cli start web --api --print
```

该入口必须只输出命令自身 JSON，不应出现 `pnpm` / `npx` wrapper 噪音。

---

## 2. Upgrade Check Guide

CLI 可打印只读升级预检指引，不会修改配置、不会迁移 RunRecord store、不会宣称升级安全：

```bash
corepack pnpm --filter @keigent/cli start guide upgrade-check
corepack pnpm --filter @keigent/cli start guide upgrade-check --compact
node packages/cli/bin/keigent.mjs guide upgrade-check --compact
```

机器可读输出中的步骤覆盖：

- `config show --compact`：证明有效配置可以带 `configVersion` 和 redaction 渲染；不证明未来 schema 被支持。
- `doctor --compact`：证明 doctor 能报告 `configVersion` 与本地可行动问题；不证明在线模型质量。
- `runs list --compact`：证明 RunRecord store 可通过正式 bin shim 只读读取并暴露 `migrationReport`；不证明 legacy records 在语义上已被接受。
- `guide release-checklist --compact`：证明 release checklist 可作为机器可读 JSON 输出；不证明 release gates 已执行。

升级预检边界：

- 该指南只读，不会重写 config 或 run records。
- 未知未来 config version 必须被拒绝或标记，不得静默 reinterpret。
- 预检通过不等于 release ready，也不等于产品健康。

---

## 3. Config Upgrade Policy

当前配置 schema：

```json
{
  "configVersion": 1
}
```

兼容规则：

- legacy config 缺少 `configVersion` 时，解析层按 version `1` 处理。
- `configVersion` 不是 `1` 时，`doctor` 输出 `configVersion.unsupported`。
- 新增非 secret 字段必须有默认值、doctor 校验、`config show` 来源展示和 `config.example.json` 示例。
- 新增 secret 字段必须有 redaction 测试，且不得出现在 shell-history 友好的命令建议中。
- `modelCapabilities` 是 provider-neutral 能力声明，包含 `toolCalling`、`streaming`、`jsonMode`、`vision`、`maxContextTokens`、`parallelToolCalls`。能力不足时必须明确降级或返回可审计 failure，不能按供应商品牌推断能力。
- 数据库 migration 文件仍然不可修改；本仓库当前没有数据库 schema 升级路径。

---

## 4. Release Checklist

CLI 可打印只读 release checklist，不运行 gate、不修改 workspace、不宣称 release ready：

```bash
corepack pnpm --filter @keigent/cli start guide release-checklist
corepack pnpm --filter @keigent/cli start guide release-checklist --compact
```

每次发布候选必须从仓库根目录运行：

```bash
corepack pnpm verify:node
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

`corepack pnpm verify:node` 是 release gate，必须在 Node.js `>=22.19.0` 环境中通过。较低 Node 版本可以用于本地探索和部分开发验证，但不得作为正式 release acceptance 结果。

Browser 验收应显式使用已安装的 Playwright browser cache，例如：

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright corepack pnpm --filter @keigent/engine verify:browser
```

如果 `doctor` 输出 `browser.playwright_path_unset`，先设置 `PLAYWRIGHT_BROWSERS_PATH` 再运行浏览器验收，避免默认 cache 路径缺失造成误报。

发布前人工检查：

- `config.example.json` 不包含真实 secret。
- `.env.example` 不包含真实 secret。
- root 与 workspace package metadata 声明 `license: "Apache-2.0"`，并与 `LICENSE` 一致。
- `CONTRIBUTING.md` 描述贡献许可、测试门槛和 secret/data 安全边界。
- `README.md` 和 `doc/product/README.md` 指向当前发布/升级文档。
- `doc/product/09-agent-operations-maturity-roadmap.md` 的实现备注没有过期声明。
- `packages/cli/package.json` 的 `bin` 指向 `./bin/keigent.mjs`。
- `packages/cli/bin/keigent.mjs` 以 executable bit 提交，可以在没有 `pnpm` wrapper 的情况下执行。
- `node packages/cli/bin/keigent.mjs guide first-run --compact` 输出为可解析 JSON，并明确 `does_not_write_config`、`does_not_run_network_checks`、`does_not_claim_product_health`。
- `node packages/cli/bin/keigent.mjs guide upgrade-check --compact` 输出为可解析 JSON，并明确 `does_not_modify_config`、`does_not_migrate_run_store`、`does_not_claim_upgrade_safe`。
- `corepack pnpm --filter @keigent/cli start doctor --compact` 输出为可解析 JSON。
- `node packages/cli/bin/keigent.mjs runs list --compact` 输出为可解析 JSON，并包含只读 `migrationReport`，不得静默写回 legacy / unsupported RunRecord。
- `node packages/cli/bin/keigent.mjs skill list --compact` 输出为可解析 JSON，并展示非执行状态 skill 的只读治理信息。
- `corepack pnpm --filter @keigent/cli start web --api --print` 输出 Workbench URL、API URL 和 `VITE_KEIGENT_API_URL` dev command。
- `corepack pnpm --filter @keigent/cli start web --port 5199 --print` 输出的 dev command 必须可直接启动到 `http://127.0.0.1:5199/`，不得用额外 `--` 吞掉 Vite flags。
- debug bundle 不泄露 secret，并包含 `observability-summary.json`。
- real-world L2 和 operator L3 fixture 报告不得宣称完整产品健康。
- `corepack pnpm --filter @keigent/cli start eval real-world --compact --open` 必须保存 L2 case RunRecord，并让报告中的 Workbench 链接可追到同一 run store 的 Run Detail。
- operator L3 `--packet` 输出必须保留 Proof boundary、Evidence inspected、Override reason、Next actions 与人工 sign-off 勾选项，并明确 fixture 不是 human acceptance。
- operator L3 `--acceptance` 输出必须是 `operator-human-acceptance` 结构化记录，且缺 evidence inspected 或 override reason 时不得 accepted。
- RunRecord / Workbench 必须展示 Proof boundary、Autonomy、Repair attempts 和 Next action。
- Web Run Launcher 收到 `run_finished.recordId` 后必须提供 Run Detail handoff，Live Console 结束态不能替代 RunRecord 审计。
- Loop Event Protocol 必须继续服务 CLI、Live Console、Workbench 和 reports，不允许 UI 回退到解析 raw logs。

---

## 5. Changelog

### Unreleased

- Added run records, run store commands, debug bundle export, and observability summary.
- Added local Web API/SSE foundation and Web Run Launcher for run store reads, web-sourced run starts, and run session progress event streams.
- Added real-world L2 fixture expansion and operator L3 scenario fixture.
- Added L3 operator human acceptance packet output for fixture reports.
- Added L3 operator human sign-off JSON validation and structured acceptance records.
- Added reviewed-loop readonly reviewer semantics with rubric-bound review summaries and Workbench review issue display.
- Added worktree isolation foundation.
- Added readonly git / HTTP / GitHub connector baseline.
- Added CLI bin shim and build metadata for cleaner machine-readable command output.
- Added read-only `guide upgrade-check` output for config/run-store upgrade preflight boundaries.
- Added runtime budget controls for iterations, tool calls, token estimate, provider cost ceiling, wall time, child runs, and recovery attempts.
- Added provider usage/cost observability from pi-ai response usage through LoopResult, trajectory, workflow usage, RunRecord, debug bundle, and Web view model; unpriced endpoints surface `pricing_not_configured`.
- Added explicit local `modelPricing` config for custom endpoints; values map to pi-ai `Model.cost` as USD per million tokens and avoid remote price table guessing.
- Added `configVersion: 1` with legacy no-version compatibility and doctor rejection for unsupported future versions.
- Added Apache-2.0 package metadata and contribution policy documentation.
- Added stable Loop Event Protocol and web normalization for unknown loop events.
- Added Proof Boundary to RunRecord, real-world eval reports, dashboard, and Run Workbench.
- Added autonomy/self-repair summaries for workflow results, workflow trajectories, RunRecord, eval fixtures, and Workbench.
- Added provider capability config and tool-calling guard for tool-dependent workflows.
- Hardened operator acceptance packets with proof boundary, evidence-inspected checks, override reason requirements, and next actions.
- Added starter path commands and fixture boundary notes for smoke / real-world / operator evals.
- Added CLI RunRecord -> local Web API -> Workbench product E2E regression.
- Added Web run audit handoff and real-world eval RunRecord persistence for eval case -> Run Detail review.
- Added read-only skill governance CLI inventory and inspect commands.
- Added read-only RunRecord migration diagnostics across CLI, local Web API, and Workbench schema compatibility review.
- Fixed Web dev command printing so custom Workbench ports are runnable and do not swallow Vite flags.

### 0.0.1

- Initial internal runtime baseline: `LoopEngine`, profiles, workflow envelope, eval/replay, CLI, and static Workbench view models.

---

## 6. Version Compatibility Notes

- Node.js: `>=22.19.0`
- pnpm: `>=10`
- Config schema: `configVersion: 1`
- Workflow trajectory schema: `schemaVersion: 1`
- RunRecord schema: `schemaVersion: 1`

Compatibility rule: newer schemas must be rejected explicitly or migrated through a tested path. Silent reinterpretation is not allowed.
