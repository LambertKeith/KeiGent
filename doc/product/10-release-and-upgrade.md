# Release and Upgrade Path

> 状态：产品化发布入口 / 本地 operator 指南  
> 目标：让本地用户能完成首次运行、版本升级前检查、发布验收和变更追踪。

---

## 1. First-run Guide

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
corepack pnpm --filter @keigent/cli start web --api --print
```

该入口必须只输出命令自身 JSON，不应出现 `pnpm` / `npx` wrapper 噪音。

---

## 2. Config Upgrade Policy

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
- 数据库 migration 文件仍然不可修改；本仓库当前没有数据库 schema 升级路径。

---

## 3. Release Checklist

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
- `corepack pnpm --filter @keigent/cli start doctor --compact` 输出为可解析 JSON。
- `node packages/cli/bin/keigent.mjs runs list --compact` 输出为可解析 JSON。
- `corepack pnpm --filter @keigent/cli start web --api --print` 输出 Workbench URL、API URL 和 `VITE_KEIGENT_API_URL` dev command。
- debug bundle 不泄露 secret，并包含 `observability-summary.json`。
- real-world L2 和 operator L3 fixture 报告不得宣称完整产品健康。
- operator L3 `--packet` 输出必须保留 Proof boundary、Evidence inspected、Override reason、Next actions 与人工 sign-off 勾选项，并明确 fixture 不是 human acceptance。
- operator L3 `--acceptance` 输出必须是 `operator-human-acceptance` 结构化记录，且缺 evidence inspected 或 override reason 时不得 accepted。

---

## 4. Changelog

### Unreleased

- Added run records, run store commands, debug bundle export, and observability summary.
- Added local Web API/SSE foundation and Web Run Launcher for run store reads, web-sourced run starts, and run session progress event streams.
- Added real-world L2 fixture expansion and operator L3 scenario fixture.
- Added L3 operator human acceptance packet output for fixture reports.
- Added L3 operator human sign-off JSON validation and structured acceptance records.
- Added reviewed-loop readonly reviewer semantics.
- Added worktree isolation foundation.
- Added readonly git / HTTP / GitHub connector baseline.
- Added CLI bin shim and build metadata for cleaner machine-readable command output.
- Added runtime budget controls for iterations, tool calls, token estimate, provider cost ceiling, wall time, child runs, and recovery attempts.
- Added provider usage/cost observability from pi-ai response usage through LoopResult, trajectory, workflow usage, RunRecord, debug bundle, and Web view model; unpriced endpoints surface `pricing_not_configured`.
- Added explicit local `modelPricing` config for custom endpoints; values map to pi-ai `Model.cost` as USD per million tokens and avoid remote price table guessing.
- Added `configVersion: 1` with legacy no-version compatibility and doctor rejection for unsupported future versions.
- Added Apache-2.0 package metadata and contribution policy documentation.

### 0.0.1

- Initial internal runtime baseline: `LoopEngine`, profiles, workflow envelope, eval/replay, CLI, and static Workbench view models.

---

## 5. Version Compatibility Notes

- Node.js: `>=22.19.0`
- pnpm: `>=10`
- Config schema: `configVersion: 1`
- Workflow trajectory schema: `schemaVersion: 1`
- RunRecord schema: `schemaVersion: 1`

Compatibility rule: newer schemas must be rejected explicitly or migrated through a tested path. Silent reinterpretation is not allowed.
