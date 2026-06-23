# P2-01 Readonly Connector Baseline Audit Delta

## Backlog Item

- 编号：P2-01
- 开发包：Readonly Connector Baseline
- 目标：readonly connector 通过 `ToolRegistry` 执行，记录结构化 source evidence，失败具备稳定 failure code，写路径明确 unsupported。
- 非目标：不实现写型 connector；不引入外部账号 token flow；不把 connector source 等同于业务验收结论。

## Changed Files

- `docs/superpowers/specs/2026-06-23-readonly-connector-baseline-audit-design.md`
- `docs/superpowers/plans/2026-06-23-readonly-connector-baseline-audit.md`
- `doc/evals/17-readonly-connector-baseline-audit-delta-2026-06-23.md`
- `doc/evals/README.md`
- `doc/product/12-development-priority-backlog.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`

## Product Contract

- readonly connector 必须经过 `ToolRegistry`。
- readonly connector 必须保持 `permission=readonly`、`riskLevel=R0`、`sideEffect=none`、`reversible=true`。
- readonly connector 成功读取时必须返回结构化 `sources`。
- HTTP / GitHub response secret 必须在进入 tool output 前 redaction。
- connector failure 必须使用 `connector_failure=*`。
- write-like 参数必须使用 `write_unsupported=*`。
- verified workflow 可以通过 `sourceCollected` assertion 使用 external source evidence。

## Tests / Evals

- PASS：`corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/failures.test.ts src/__tests__/readonly-connector-sources.test.ts src/__tests__/http-readonly-tool.test.ts src/__tests__/github-readonly-tool.test.ts src/__tests__/git-tool.test.ts src/__tests__/success-evidence.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/public-api.test.ts`
- PASS：`corepack pnpm --filter @keigent/engine eval:stability -- --compact`
- PASS：`corepack pnpm -r check`
- PASS：`corepack pnpm -r test`
- PASS：`corepack pnpm -r --if-present build`
- PASS：`git diff --check`
- PASS：`rg "P2-01|Readonly Connector Baseline|readonly connector|sourceCollected|github_repo_read|http_get|git_status" docs/superpowers doc packages`

## Evidence

- 已证明：`git_status`、`http_get`、`github_repo_read` 保持 readonly/R0/no-side-effect metadata。
- 已证明：readonly connector 不触发 approval。
- 已证明：HTTP / GitHub tool output redacts secret-bearing response text。
- 已证明：file、web、browser、git、HTTP、GitHub readonly tools 返回结构化 `sources`。
- 已证明：`sourceCollected` assertion 可进入 workflow evidence。
- 已证明：connector failure 和 write unsupported 进入稳定 failure summary。

## Proof Boundary

已证明：

- P2-01 当前 readonly connector baseline 满足 ToolRegistry metadata、source evidence、redaction、failure mapping 和 workflow evidence 要求。
- 目标测试覆盖 local git、HTTP、GitHub、file、browser、web readonly source。
- Stability gate 仍通过 false-confidence 红线。

未证明：

- 真实外部网络长期可用性。
- 外部 source 内容真实性或时效性。
- 认证 GitHub API、OAuth、token flow。
- 任意外部写 connector。
- connector text 直接等同业务成功。

## Remaining Risks

- blocking：无。
- non-blocking：browser `get_text` / `screenshot` source 仍以 `current_page` 表示，后续可提升为真实 URL。
- next action：P2-01 完成后继续推进 P2-02 L3 Operator Scenario Eval。
