# Development Priority Backlog Delta - 2026-06-15

> 范围：`P0-02 Workbench Run Detail v1`、`P1-03 Worktree Isolation Foundation`、`P1-04 Schema Migration / Redaction Hardening`、`P1-01 Reviewed-loop v1`、`P1-02 Local Automation Triage`、`P1-05 CLI Operator Ergonomics`、`P2-01 Readonly Connector Baseline` 与 `P2-02 L3 Operator Scenario Eval` 的增量交付。
>
> 依据：`doc/product/12-development-priority-backlog.md`。

## Backlog Item

- 编号：P0-02
- 开发包：Workbench Run Detail v1
- 目标：Run List 与 Run Detail 覆盖 backlog 要求的审计字段。
- 非目标：不把静态 Workbench 扩展为完整交互式 operator 产品。

## Changed Files

- `packages/web/src/runs/model.ts`
- `packages/web/src/runs/workbench.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`
- `doc/product/03-web-workbench-blueprint.md`
- `doc/product/09-agent-operations-maturity-roadmap.md`

## Tests / Evals

- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts src/__tests__/runs-view.test.ts`
- `corepack pnpm -r test`
- `corepack pnpm -r check`
- `corepack pnpm -r --if-present build`
- 结果：全部通过。

## Evidence

- 已证明：Run List 展示 run id、status、createdAt、profile、workflow mode、risk、evidence summary、duration、replay status。
- 已证明：Run Detail 展示 `Timeline` 面板，包含 route、workflow、budget、iterations、tools、checkpoints、events。
- 未证明：完整交互式 Workbench 成熟度。
- evidence gaps：未做浏览器人工验收；本轮为 view model / render 层回归。

## Risks / Follow-ups

- blocking：无。
- non-blocking：后续可补真实浏览器截图验收。
- next action：继续按 backlog 推进 P1 / P2。

## Backlog Item

- 编号：P1-03
- 开发包：Worktree Isolation Foundation
- 目标：child run workspace id、cleanup、artifact、conflict 与 Workbench 审计闭环。
- 非目标：不实现 fanout、tournament、自动 merge、自动 `git worktree add` provider 或外部写 connector。

## Changed Files

- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/workflow/planner.ts`
- `packages/engine/src/workflow/engine-child-runner.ts`
- `packages/engine/src/run-record.ts`
- `packages/engine/src/lib.ts`
- `packages/cli/src/workflow-execution.ts`
- `packages/cli/src/repl.ts`
- `packages/web/src/runs/child-workspaces.ts`
- `packages/web/src/runs/model.ts`
- `packages/web/src/runs/workbench.ts`
- `doc/design/14-worktree-isolation-and-parallel-runs.md`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/worktree-isolation.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/workflow-engine-child-runner.test.ts src/__tests__/run-record.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts src/__tests__/runs-view.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/run-once.test.ts src/__tests__/post-run.test.ts src/__tests__/product-e2e.test.ts`
- `corepack pnpm -r test`
- `corepack pnpm -r check`
- `corepack pnpm -r --if-present build`
- 结果：全部通过。

## Evidence

- 已证明：显式 `workspaceIsolation` 配置下，`WorkflowRunner` 为 child run 创建独立 workspace，并把 workspace path 传给 production child adapter。
- 已证明：成功路径可 `remove` cleanup，超时路径可 `mark_abandoned` 并保留 manifest。
- 已证明：RunRecord child summary 可保存 workspace id、branch、cleanup state、artifacts、conflicts。
- 已证明：Workbench Run Detail 的 `Child workspaces` 面板展示 workspace id、cleanup state、artifacts 与 conflict 摘要。
- 未证明：自动 `git worktree add` provider、fanout 并行调度、自动 merge、真实外部写隔离。
- evidence gaps：当前 conflict detection 只按相同 `relativePath` 检测，不证明内容级或语义级冲突。

## Risks / Follow-ups

- blocking：无。
- non-blocking：默认 workflow 仍不启用隔离，避免改变 CLI / REPL 工作目录语义。
- next action：后续可把特定 fanout / automation spawned workflow 显式接入 `workspaceIsolation`。

## Backlog Item

- 编号：P1-04
- 开发包：Schema Migration / Redaction Hardening
- 目标：RunRecord、CLI、Workbench 与 eval report 不暴露本机用户目录路径敏感部分。
- 非目标：不引入迁移文件，不改变真实文件系统读写路径，不实现全量 PII 检测。

## Changed Files

- `packages/engine/src/redaction.ts`
- `packages/engine/src/run-record.ts`
- `packages/engine/src/evals/real-world.ts`
- `packages/engine/src/__tests__/run-record.test.ts`
- `packages/engine/src/__tests__/real-world-eval.test.ts`
- `packages/cli/src/__tests__/runs-commands.test.ts`
- `packages/web/src/shared/redaction.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts`
- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：`/Users/<user>/...`、`/home/<user>/...`、`C:\Users\<user>\...` 在 RunRecord 读取、落盘、summary、failure、artifact、replay path 中替换为 `[REDACTED_USER]`。
- 已证明：run store migration warning 与 malformed record error 的 diagnostic path 不暴露用户目录名。
- 已证明：CLI `runs show --compact`、Workbench Run Detail/raw inspector 与 real-world eval report 序列化输出均覆盖路径脱敏断言。
- 已证明：实际保存路径返回值不被脱敏，调用方仍可定位 `record.json`。
- 未证明：任意自然语言 PII、组织内部路径命名、非 home 目录项目名。

## Risks / Follow-ups

- blocking：无。
- non-blocking：engine 与 web 仍各有一份同构 redaction helper；后续可抽成共享包避免漂移。
- next action：继续按 backlog 审计 P2 项。

## Backlog Item

- 编号：P1-01
- 开发包：Reviewed-loop v1
- 目标：reviewed-loop 具备 worker / reviewer 子运行审计面、readonly reviewer 成功 fixture 与 L2 eval 覆盖。
- 非目标：不新增第二套 loop，不改变 reviewer readonly policy，不实现多人并行 review。

## Changed Files

- `packages/engine/src/evals/real-world.ts`
- `packages/engine/src/__tests__/real-world-eval.test.ts`
- `packages/web/src/runs/workbench.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`
- `packages/web/src/__tests__/dashboard.test.ts`
- `packages/cli/src/__tests__/eval-commands.test.ts`
- `packages/cli/src/__tests__/product-e2e.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/real-world-eval.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts src/__tests__/workflow-policy.test.ts src/__tests__/workflow-engine-child-runner.test.ts src/__tests__/real-world-eval.test.ts src/__tests__/run-record.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts src/__tests__/runs-view.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/eval-commands.test.ts src/__tests__/product-e2e.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/dashboard.test.ts src/__tests__/run-workbench.test.ts src/__tests__/runs-view.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：L2 fixture `reviewed-loop-accepted` 产生 `reviewed-loop` RunRecord，并记录 worker 与 reviewer child run。
- 已证明：review summary 包含 reviewer run id、rubric success criteria、required evidence、forbidden claims、false-confidence risks、blocking rules 与空 issue 集。
- 已证明：reviewer child run 使用 readonly review 语义，不依赖工具调用或审批来通过 fixture。
- 已证明：Workbench Run Detail 新增 `Child run timeline`，展示 child id、role、profile fallback、exit reason、iterations、tool calls 与 checkpoints。
- 未证明：真实 LLM reviewer 的判断质量、多人 review、跨 workspace merge 后审查。

## Risks / Follow-ups

- blocking：无。
- non-blocking：当前 Web child timeline 是静态审计面，不提供 child run drill-down 跳转。
- next action：继续按 backlog 推进 P2 项。

## Backlog Item

- 编号：P1-02
- 开发包：Local Automation Triage
- 目标：本地 run store triage automation 具备 no-op / attention-required 两条可审计闭环。
- 非目标：不实现定时调度器、外部账号 connector、自动修复、fanout 或高风险副作用。

## Changed Files

- `packages/engine/src/automation-triage.ts`
- `packages/engine/src/__tests__/automation-triage.test.ts`
- `packages/engine/src/run-record.ts`
- `packages/engine/src/debug-bundle.ts`
- `packages/engine/src/lib.ts`
- `packages/cli/src/automation-commands.ts`
- `packages/cli/src/__tests__/automation-commands.test.ts`
- `packages/web/src/runs/model.ts`
- `packages/web/src/runs/workbench.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/automation-commands.test.ts`
- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/automation-triage.test.ts src/__tests__/debug-bundle.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：`automation triage local --compact` 在无候选时保存 `no_op` automation RunRecord、`triage-report.json` 与 `trajectory.json`。
- 已证明：存在 failed / degraded / missing evidence / stale schema 候选时保存 `degraded` automation RunRecord，包含 source run ids、next action、triage report artifact、trajectory artifact 与 proof boundary。
- 已证明：旧 local triage automation RunRecord 不会在下一轮被递归当作 triage candidate。
- 已证明：Debug bundle 支持 `triage_report` artifact，Workbench Run Detail 展示 Automation triage scope、source run ids 与 does-not-prove 边界。
- 未证明：定时触发、跨仓库 triage、自动修复、真实 operator 已人工处理候选。

## Risks / Follow-ups

- blocking：无。
- non-blocking：`runs triage` 仍是轻量候选列表；产品级 automation record/report 闭环在 `automation triage local`。
- next action：继续按 backlog 推进 P2 项。

## Backlog Item

- 编号：P1-05
- 开发包：CLI Operator Ergonomics
- 目标：operator 常用 `runs` 路径具备人读默认输出、机器可读 compact/json 输出、failure code 与 next action 可见。
- 非目标：不实现交互式 TUI、不改变 run store 默认位置、不把 `runs triage` 扩展为自动修复系统。

## Changed Files

- `packages/cli/src/runs-commands.ts`
- `packages/cli/src/__tests__/runs-commands.test.ts`
- `packages/cli/src/__tests__/package-metadata.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts src/__tests__/runs-commands.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/guide-command.test.ts src/__tests__/eval-commands.test.ts src/__tests__/product-e2e.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：`runs list` 默认输出从 tab-separated 行升级为人读摘要，包含总数、run id、status、evidence status、failure code 与 next action。
- 已证明：`runs show <run-id>` 默认输出展示 run id、status、failure code、goal、profile、workflow、evidence 汇总、blocking evidence、next action、automation scope 与 Workbench deep link。
- 已证明：`runs triage` 默认输出展示候选总数、reason、status、failure code、blocking 与 next action。
- 已证明：`runs list --compact` 通过正式 `bin/keigent.mjs` shim 执行时输出单行可解析 JSON，不需要 pnpm wrapper。
- 未证明：真实 operator 端到端人工验收、shell 安装包发布后的全局 `keigent` 命令行为。

## Risks / Follow-ups

- blocking：无。
- non-blocking：CLI 默认输出仍是文本摘要，不提供交互式筛选、排序或分页。
- next action：继续按 backlog 推进 P2 项。

## Backlog Item

- 编号：P2-01
- 开发包：Readonly Connector Baseline
- 目标：readonly connector 通过 ToolRegistry 执行，记录结构化 source evidence，失败具备稳定 failure code，写路径明确 unsupported。
- 非目标：不实现写型 connector、不引入外部账号 token flow、不把 connector source 等同于业务验收结论。

## Changed Files

- `packages/engine/src/tools/types.ts`
- `packages/engine/src/tools/impl/filesystem.ts`
- `packages/engine/src/tools/impl/web.ts`
- `packages/engine/src/tools/impl/browser.ts`
- `packages/engine/src/tools/impl/git.ts`
- `packages/engine/src/tools/impl/github.ts`
- `packages/engine/src/engine.ts`
- `packages/engine/src/trajectory.ts`
- `packages/engine/src/evidence.ts`
- `packages/engine/src/assertions.ts`
- `packages/engine/src/failures.ts`
- `packages/engine/src/lib.ts`
- `packages/engine/src/types.ts`
- `packages/engine/src/__tests__/readonly-connector-sources.test.ts`
- `packages/engine/src/__tests__/http-readonly-tool.test.ts`
- `packages/engine/src/__tests__/github-readonly-tool.test.ts`
- `packages/engine/src/__tests__/git-tool.test.ts`
- `packages/engine/src/__tests__/success-evidence.test.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`
- `packages/engine/src/__tests__/failures.test.ts`
- `packages/engine/src/__tests__/public-api.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/failures.test.ts src/__tests__/readonly-connector-sources.test.ts src/__tests__/http-readonly-tool.test.ts src/__tests__/github-readonly-tool.test.ts src/__tests__/git-tool.test.ts src/__tests__/success-evidence.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/public-api.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：`http_get`、`github_repo_read`、`git_status`、`web_fetch`、`file_read`、`file_list`、`grep`、`browser_snapshot`、`browser_get_text`、`browser_screenshot` 返回结构化 `sources`。
- 已证明：readonly connector 仍是 `permission=readonly`、`riskLevel=R0`、`sideEffect=none`，目标测试断言不触发审批。
- 已证明：secret-bearing HTTP / GitHub 响应进入 tool output 前会脱敏，测试覆盖原始 secret 不泄漏。
- 已证明：`ToolResult.sources` 通过 `LoopEngine` 写入 trajectory `toolSources`，`buildEvidenceBundle` 收集为 `sources`。
- 已证明：新增 deterministic assertion `sourceCollected` 可让 verified-loop 把外部 source 纳入 workflow evidence。
- 已证明：`connector_failure=http_get_unavailable` 映射为 `network_error`，`connector_failure=git_status_unavailable` 映射为 `tool_unavailable`，`write_unsupported=*` 映射为 `permission_denied`。
- 未证明：真实 GitHub/HTTP 网络长期可用性、外部 source 内容真实性、写型 connector、OAuth/token 账号 connector。

## Risks / Follow-ups

- blocking：无。
- non-blocking：browser `get_text` / `screenshot` source 目前记录为 `current_page`，后续可从 BrowserSession 暴露实际 URL 提升审计精度。
- next action：继续按 backlog 推进 P2-02 / P2-03 / P2-04 / P2-05。

## Backlog Item

- 编号：P2-02
- 开发包：L3 Operator Scenario Eval
- 目标：L3 operator scenario fixture、packet 与 human sign-off artifact 保留结构化 proof boundary、evidence links、false-confidence risks 和人工审证边界。
- 非目标：不把 fixture pass、packet 输出或 sign-off JSON 校验等同真人实际审证，不引入自动 judge 替代 human reviewer。

## Changed Files

- `packages/engine/src/evals/operator-scenarios.ts`
- `packages/engine/src/__tests__/operator-scenario-eval.test.ts`
- `packages/cli/src/__tests__/eval-commands.test.ts`

## Tests / Evals

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/operator-scenario-eval.test.ts`
- `corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/eval-commands.test.ts`
- `corepack pnpm --filter @keigent/engine exec tsc --noEmit`
- `corepack pnpm --filter @keigent/cli start eval operator --compact`
- `corepack pnpm --filter @keigent/cli start eval operator --packet`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`
- `git diff --check`
- 结果：全部通过。

## Evidence

- 已证明：L3 report 顶层包含结构化 `proofBoundary`，明确 fixture 只证明 deterministic scenario review，不证明 human acceptance、live operator readiness 或 production health。
- 已证明：每个 scenario case 包含 case 级 `proofBoundary`，把 fixture decision、evidence links、blocking issue 和 expected operator decision 显式纳入证据边界。
- 已证明：`operator-human-acceptance` artifact 保留 `proofBoundary`，并把 fixture 的 `evidenceLinks` 与 `falseConfidenceRisks` 复制到每个 case record，供后续 Workbench / debug bundle / 验收报告复用。
- 已证明：完整 sign-off 也不会抹掉 deferred / rejected scenario 的 blocking evidence gaps，符合 human acceptance 不能覆盖事实失败的边界。
- 已证明：CLI `eval operator --compact` 输出 report 级和 case 级 proof boundary；`eval operator --packet` 仍输出人工 reviewer checklist。
- 未证明：真人 reviewer 已经打开并审查 evidence links、真实生产健康、真实外部系统状态、完整交互式 operator 产品成熟度。

## Risks / Follow-ups

- blocking：无。
- non-blocking：当前 L3 scenario 仍是 deterministic fixture reviewer；后续可把 acceptance artifact 接入 Workbench Run Detail 或 debug bundle 下载入口。
- next action：继续按 backlog 推进 P2-03 / P2-04 / P2-05。
