# P1-04 Debug Bundle Redaction Summary Design

## Backlog Item

- 编号：P1-04
- 开发包：Schema Migration / Redaction Hardening
- 目标：让 debug bundle 明确说明 redaction 已应用到哪些范围，降低 operator 复盘时误以为 raw payload 可直接展示的风险。
- 非目标：不引入数据库迁移文件，不重写 run store，不实现全量 PII 检测，不改变真实 artifact 读取路径。

## Current Baseline

当前 runtime 已有：

- `redaction.ts` 覆盖 secret-like key、`sk-...`、`Bearer ...`、`api_key=...` 与用户 home path 片段。
- RunRecord 读取时归一化 legacy / unsupported schema，并生成 migration report。
- CLI / Workbench / eval / debug bundle 已有多处 raw secret 不泄漏测试。
- `exportRunDebugBundle()` 会写入 redacted `record.json`、`redacted-config.json`、artifact copy、`tool-summary.json`、`observability-summary.json`、`triage-summary.json` 和 `failure-summary.md`。

## Gap

P1-04 backlog 要求 `redaction summary 明确`。当前 debug bundle 的内容确实经过 redaction，但没有一个独立 artifact 告诉 operator：

- redaction policy 是否应用；
- raw payload 是否被保存；
- record/config/generated summaries/artifact copies 哪些范围经过 redaction；
- 哪些 artifact missing 只记录诊断而不阻断导出；
- redaction summary 本身不能包含 secret。

这会让 debug bundle 的审计边界不够清楚，尤其是当 bundle 被交给其他开发者定位问题时。

## Requirements

1. `exportRunDebugBundle()` 必须生成 `redaction-summary.json`。
2. `redaction-summary.json` 必须包含：
   - `schemaVersion: 1`
   - `runId`
   - `applied`
   - `rawPayloadStored`
   - `rules`，至少包含 `secret_like_keys`、`secret_like_text`、`user_home_path_segments`
   - `scopes`，至少包含 `record`、`config`、`generated_summaries`、`artifact_copies`
   - `filesRedacted`
   - `missingArtifacts`
   - `doesNotProve`
3. `DebugBundleFileKind` 必须包含 `redaction_summary`。
4. CLI `runs debug-bundle --compact` 的 `files` 列表必须包含 `redaction-summary.json`。
5. `redaction-summary.json` 本身必须经过 redaction，不能泄漏 config values、artifact path 中的用户目录名或 secret-like tokens。
6. 不改变 `record.redaction` 的 schema。
7. 不修改任何 migration file，不自动重写 legacy RunRecord。

## Tests

- `packages/engine/src/__tests__/debug-bundle.test.ts`
  - debug bundle export 生成 `redaction-summary.json`。
  - summary 标明 record/config/generated summaries/artifact copies 均经过 redaction。
  - summary 包含 missing artifact diagnostics，且 missing path 中用户目录名被脱敏。
  - summary 不包含 raw API key / bearer token / user home segment。
- `packages/cli/src/__tests__/runs-commands.test.ts`
  - `runs debug-bundle --compact` 输出的 files 包含 `redaction-summary.json`。
  - CLI 导出的 `redaction-summary.json` 不泄漏 record/config/artifact secret。

## Proof Boundary

本包证明：

- debug bundle 对 redaction policy、scope 和 artifact coverage 有独立可审计 summary。
- summary 与 bundle 中其他 JSON/text artifact 一样经过 redaction。

本包不证明：

- 任意自然语言 PII 都能被识别。
- scope 外的外部系统或历史 artifact 没有 secret。
- redaction 可以替代人工安全审查。
