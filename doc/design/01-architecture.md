# KeiGent Architecture Fact Source

> 状态：当前实现事实源
>
> 适用读者：实现者、验收人、AI 协作者
>
> 最近校准：2026-06-10

本文回答一个问题：当前 KeiGent runtime 到底由哪些模块组成，它们的边界是什么，什么事实可以被源码和测试支撑。

更高层的产品定位见 [`00-system-overview.md`](00-system-overview.md) 和 [`../product/01-product-blueprint.md`](../product/01-product-blueprint.md)。本文不记录历史阶段，不作为路线图；未来规划应放在 product、strategy 或 eval 文档中。

---

## 1. 核心不变量

KeiGent 当前实现必须保持以下不变量：

1. **一个 `LoopEngine`，多个 `LoopProfile`**
   行为差异来自 profile 的策略组合，不复制多个执行 loop。

2. **Skill 决定怎么做，引擎决定怎么验**
   skill 只提供执行知识；checkpoint、assertion、verdict、trajectory 承担验收事实。

3. **Final text 不是成功证据**
   final response 只能表达结果，不能单独证明任务成功。成功需要 evidence、assertion、checkpoint 或 workflow verdict 支撑。

4. **工具执行必须经过 `ToolRegistry`**
   引擎不按工具名写分支。工具元数据、权限、风险、超时、输出截断与审批都在 registry/工具层处理。

5. **Workflow 是 parent envelope，不是第二套 agent loop**
   workflow child run 仍调用 `LoopEngine.run()`。parent 负责预算、策略、失败映射、workflow evidence 与 trajectory。

6. **执行 loop 默认不沉淀知识**
   `convergent-exec` 与验证执行只读 skill，避免把中间状态污染知识库。学习建议走显式 learner/skill patch 流程。

---

## 2. 模块边界

```text
User / CLI / Web
      |
      v
Orchestrator
  - 规则分类
  - LLM fallback
  - profile guard
      |
      v
WorkflowRunner
  - mode / budget / policy
  - child run orchestration
  - workflow evidence / trajectory
      |
      v
LoopEngine
  - profile-driven loop
  - skill injection through attention
  - checkpoint / verdict / recovery
      |
      +--> Skills / Memory
      +--> ToolRegistry
      +--> StateCapture / Judge
      +--> TrajectoryCollector
```

主要源码入口：

| 模块 | 文件 | 责任 |
|---|---|---|
| 类型事实源 | `packages/engine/src/types.ts` | `Task`、`LoopProfile`、`SuccessDef`、`Trajectory`、progress events |
| 主循环 | `packages/engine/src/engine.ts` | 单一参数化 loop、工具调用、checkpoint、trajectory |
| 路由 | `packages/engine/src/orchestrator.ts` | profile 规则分类、LLM fallback、guard |
| Profile | `packages/engine/src/profiles/*` | 内置 profile 与五个策略旋钮 |
| 工具治理 | `packages/engine/src/tools/*` | `ToolRegistry`、工具实现、权限/风险元数据 |
| Workflow | `packages/engine/src/workflow/*` | workflow envelope、policy、budget、trajectory |
| Worktree Isolation | `packages/engine/src/worktree-isolation.ts` | child workspace manifest、artifact 回收、冲突检测、cleanup foundation |
| Eval | `packages/engine/src/evals/*` | smoke/replay/orchestrator eval harness |
| CLI | `packages/cli/src/*` | REPL、单次执行、config、doctor、eval/replay 包装 |
| Web | `packages/web/src/*` | Workbench 视图模型与静态 shell |

---

## 3. Task 与 SuccessDef

`Task` 是 runtime 的输入事实源：

```ts
interface Task {
  goal: string;
  profile: string;
  successDef?: SuccessDef;
}
```

`profile: "auto"` 是默认产品路径。Orchestrator 会根据任务硬信号、skill 匹配、LLM fallback 和 guard 选择具体 profile。

`SuccessDef` 用 assertion 描述“什么算成功”：

```ts
interface SuccessDef {
  goal: string;
  assertions: Assertion[];
}
```

当前 assertion 包含 URL、DOM/text、文件、命令退出码、工具成功、checkpoint、人类审批、JSON path、截图裁判等类型。详见 [`08-success-evidence-model.md`](08-success-evidence-model.md)。

设计边界：

- 有 `successDef.assertions` 的任务默认需要更强验证纪律。
- assertion 不是提示词装饰，而是 eval、workflow verdict、trajectory 回放的判断依据。
- `final` 来源的 text assertion 可用于轻量场景，但不能替代外部 evidence。

---

## 4. Orchestrator

Orchestrator 的职责是选择执行纪律，而不是执行任务。

当前路由层包含三段：

1. **规则分类**
   高置信度规则直接返回 profile，包括显式 profile、明显闲聊、能力询问/需要澄清、`successDef`、调研关键词、URL + 执行关键词、skill 匹配。

2. **LLM fallback**
   当规则无法判断时调用分类模型。LLM 分类有超时保护，失败时降级到 `divergent-research`。

3. **Guard**
   对不合适的收敛执行选择做确定性修正。例如选择 `convergent-exec` 但没有匹配 skill 或 successDef 时，改走 `divergent-research`，避免把通用问题硬塞进执行 profile。

内置 profile 名称：

| Profile | 触发场景 | 关键纪律 |
|---|---|---|
| `conversational` | 闲聊、问候、能力询问、信息不足 | 快速响应，必要时 `ask_user` 澄清 |
| `divergent-research` | 开放调研、比较、探索、总结 | 宽注意力，允许学习建议 |
| `convergent-exec` | 有明确目标且有匹配 skill 的执行任务 | 窄注意力，步骤纪律，自检验证 |
| `convergent-verified` | 有 assertions 或需要强验证的任务 | 收敛执行，独立裁判/证据优先 |

Orchestrator fixture 当前由 `eval:orchestrator` 覆盖；该结果只能证明路由 fixture 未退化，不等同真实任务完成率。

---

## 5. LoopProfile 五个旋钮

`LoopProfile` 由五个策略旋钮组成：

| 旋钮 | 作用 | 当前实现重点 |
|---|---|---|
| `attention` | 控制每轮上下文、skill body、memory 与工具列表 | 收敛只注入最相关 skill，发散注入更多相关 skill |
| `terminate` | 判断何时停止 | 对话/研究允许早期文本退出，执行 profile 要满足步骤或 checkpoint |
| `verify` | 生成验证 verdict | 无验证、自检、独立裁判按 profile 区分 |
| `recover` | 失败后决策 | retry、repair、escalate，记录 recovery trajectory |
| `memory` | 是否沉淀经验 | 执行 profile 默认只读，研究/学习链路可产生 skill patch 建议 |

`LoopEngine` 在每次 run 开始时会 reset profile 内部可变状态，防止 profile 复用污染下一次任务。

工具暴露也受 profile 控制：`conversational` 只暴露 `ask_user` 与只读工具；其他 profile 使用 registry 中可用工具，再由 policy/approval 约束风险。

---

## 6. LoopEngine

`LoopEngine.run()` 是唯一执行循环。它的输入包括：

- `Task`
- `SkillContext`
- 已选 `LoopProfile`
- `StateCapture`
- 按 profile/policy 过滤后的工具列表
- progress callback
- 可选 abort signal 与继承审批 scope

一次 loop 的主要阶段：

1. reset profile 状态。
2. 通过 attention 匹配 skill，并让 attention 注入 skill body。
3. 构造工具上下文：workspace、browser、approval、task、memory、askUser、abort signal。
4. 调 LLM，带请求超时与 abort 支持。
5. 解析文本和 tool calls，并统一处理 pi-ai 并发工具调用拆块问题。
6. 通过 `ToolRegistry.execute()` 执行工具。
7. 遇到 `request_verification` checkpoint 时采集 state，运行 verify 策略。
8. 将 text、tool、checkpoint、approval、recovery、error 写入 trajectory。
9. 根据 terminate/recover/maxIterations/abort 产生 `LoopResult`。

`LoopResult` 包含：

- `exitReason`
- `finalResponse`
- `iterations`
- `checkpointsPassed`
- `totalToolCalls`
- `trajectory`
- 可选 `failure`

失败语义见 [`13-failure-recovery-semantics.md`](13-failure-recovery-semantics.md)。

---

## 7. ToolRegistry 与治理

所有工具通过 `ToolRegistry` 注册和执行。工具定义包含：

| 字段 | 作用 |
|---|---|
| `permission` | `readonly` / `write` / `execute` / `dangerous` |
| `riskLevel` | `R0` 到 `R5` |
| `sideEffect` | `none` / `local` / `external` |
| `reversible` | 操作是否可逆 |
| `timeoutMs` | 单工具超时 |
| `maxOutputChars` | 工具输出截断 |

当前工具族包括：

- 浏览器：navigate、snapshot、click、type、select、wait、screenshot 等。
- 文件：read、write、list、grep，受 workspace 沙箱约束。
- local git readonly：`git_status`，只读取 workspace 内 git 状态，不执行任意 git 命令。
- GitHub readonly：`github_repo_read`，只读取 public repo metadata，不接受 token/header/body/method。
- HTTP：`http_get` 是 readonly GET connector；`http_request` 是 R3 执行型请求。
- shell：命令执行，带超时和输出限制。
- memory/ask_user：记忆读取、用户澄清。
- computer：mouse、keyboard、screenshot，默认不注册，需要显式 include。

治理规则：

- `dangerous` 或高风险工具需要审批门。
- 审批请求与拒绝都进入 progress event 和 trajectory。
- workflow policy 可以按权限、risk、sideEffect 和 reviewer/verifier readonly 过滤工具。
- 浏览器交互使用 snapshot + ref 范式，不猜坐标。

详细治理模型见 [`09-permission-risk-governance.md`](09-permission-risk-governance.md)。

---

## 8. Evidence、Trajectory 与 Replay

KeiGent 的可解释性基于事实记录，而不是事后文字总结。

`Trajectory` 记录：

- skill match explanation
- tool call 与 tool result
- text output
- checkpoint snapshot 与 verdict
- approval decision
- recovery decision
- error

`Evidence` 由 assertion evaluator 和 workflow runner 使用，支撑：

- success/failure 判断
- replay 重评
- eval report
- debugging timeline
- skill lifecycle 审核

Replay 边界：

- replay 是离线重评历史 trajectory。
- replay pass 不等于 fresh execution pass。
- replay 命令必须显式传入 `--trajectory case-id=/path/to/trajectory.json`。

调试模型见 [`12-agent-debuggability.md`](12-agent-debuggability.md)。

---

## 9. Workflow Envelope

`WorkflowRunner` 是 parent envelope。当前 `ExecutionMode` 包含：

| Mode | 当前语义 |
|---|---|
| `single-loop` | 一个 worker child run，使用 `LoopEngine.run()` |
| `verified-loop` | 一个 worker child run，要求最少通过 checkpoint/assertion 证据 |
| `reviewed-loop` | worker + readonly reviewer child run，reviewer 按 rubric 审阅 worker 结果 |

Workflow 负责：

- `WorkflowBudget`：child runs、每个 child 最大迭代数/工具数/token estimate/recovery 次数、总迭代数、总工具数、总 token estimate、超时。
- `WorkflowPolicy`：profile allow-list、最大权限、最大 risk、外部副作用、审批 scope、reviewer/verifier readonly。
- `WorkflowEvidence`：checkpoint、assertion、policy、budget、child_result。
- `ReviewSummary`：reviewer run id、rubric、blocking / non-blocking issues。
- `WorkflowTrajectory`：parent events、child trajectories、budget usage、exit reason、review summary。

Workflow 不负责：

- 自动生成无限 child plans。
- 任意 fanout。
- tournament。
- 自动创建真实 git worktree。
- 自由脚本执行。

产品语义见 [`10-workflow-modes-product-semantics.md`](10-workflow-modes-product-semantics.md)，run envelope 见 [`07-workflow-run-envelope.md`](07-workflow-run-envelope.md)。

---

## 10. Worktree Isolation Foundation

Worktree isolation 当前是 P1 foundation，不是 fanout 产品化。

当前实现提供：

- `createIsolatedWorkspace()` 创建 child workspace 与 `.keigent-workspace.json` manifest。
- `collectWorkspaceArtifacts()` 回收 child workspace 产物。
- `detectWorkspaceConflicts()` 识别多个 child 输出同一路径。
- `cleanupIsolatedWorkspace()` 支持删除或标记 abandoned。
- `canWriteWorkspace()` 保证 reviewer/verifier 不写 worker workspace。

当前不提供：

- 真实 `git worktree add` provider。
- workflow runner 默认不会自动创建 child workspace；显式 `workspaceIsolation` 配置下才创建。
- 自动 merge 或冲突解决。

详见 [`14-worktree-isolation-and-parallel-runs.md`](14-worktree-isolation-and-parallel-runs.md)。

---

## 11. Skill 与学习边界

Skill 是执行知识，不是成功事实源。当前 skill 系统具备：

- `SKILL.md` 两层渐进式披露：先读 metadata，必要时加载 body。
- task/skill 相关度评分与 match explanation。
- skill status：draft、active、learned-note-only、quarantined、deprecated、promoted。
- learner 通过 trajectory 生成 `SkillPatch` 建议。
- patch 应用器写入 learning note，不自动把经验晋升为正式 skill。

边界：

- 执行 profile 不直接写知识库。
- 学习建议需要 eval coverage 与治理流程。
- 危险动作、non-goals、requiredTools/allowedTools 由 skill metadata 和工具 policy 共同约束。

详见 [`11-skill-lifecycle-and-governance.md`](11-skill-lifecycle-and-governance.md)。

---

## 12. Eval Harness

Eval Harness 是回归与验收层，不新增 agent 行为。

当前执行模式：

| Mode | 说明 |
|---|---|
| `smoke` | 不调 LLM，用确定性 executor 验证 eval runner/report |
| `replay` | 从 trajectory 派生结果，离线重评 |
| `live` | 类型保留；真实世界 benchmark 需要单独准入 |

当前 eval 维度包括：

- conversational
- research
- verified-exec
- tool-smoke
- file/shell/browser/config
- permission
- workflow
- skill
- dashboard

验收边界：

- Eval pass 不等于产品完全可信。
- profile accuracy 不等于任务成功。
- tool attempted 不等于 tool succeeded。
- replay pass 不等于 fresh execution pass。

详见 [`03-eval-harness.md`](03-eval-harness.md) 和 [`../evals/01-real-world-eval-suite.md`](../evals/01-real-world-eval-suite.md)。

---

## 12. CLI 与 Web 边界

CLI 当前是主要用户入口：

- REPL
- 单次执行
- config init/show/set/unset/path
- doctor
- eval smoke/orchestrator/replay
- replay summary
- web 启动命令打印

单次执行模式通过 `WorkflowRunner` envelope 调用 engine child run；非交互场景默认使用 `DenyByDefaultGate` 拒绝高风险审批。

Web 当前是 Workbench view model、静态审计 surface 与本地 API/SSE foundation 阶段：

- front-end in-memory Live Run Console（progress event timeline / pending work / selected inspector）
- Web Run Launcher（local API backed task start + SSE progress subscription）
- Run Detail v1（RunRecord audit surface）
- Eval Dashboard（eval case -> run detail linkage / false-confidence findings）
- local Web API（`GET /api/runs`、`POST /api/runs`、`GET /api/runs/:id/events`）
- run session SSE event stream（workflow progress event replay / live push）
- conversation normalization
- dashboard report model
- replay model
- skills model
- config view model

当前不能宣称完整交互式 Operations Workbench 已经完成。

---

## 13. 当前验收命令

根级推荐命令使用 `corepack pnpm -r ...`，避免 package script 内部裸 `pnpm` 在某些环境不可复现。

```bash
corepack pnpm install
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build

corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/eval-replay.test.ts
corepack pnpm --filter @keigent/engine verify:attention
corepack pnpm --filter @keigent/engine verify:browser
```

真实 replay 示例：

```bash
corepack pnpm --filter @keigent/engine eval:replay -- --trajectory smoke-conversational-hello=/path/to/trajectory.json
corepack pnpm --filter @keigent/cli start eval replay --trajectory smoke-conversational-hello=/path/to/trajectory.json
```

---

## 14. 不在本文承诺的能力

当前架构不承诺：

- remote multi-user SaaS。
- plugin marketplace。
- unrestricted computer control。
- 自动晋升正式 skill。
- dynamic planner 生成任意工作流。
- fanout swarm 或 tournament。
- 无证据成功声明。
- 无审批危险外部副作用。

这些边界由 [`../strategy/01-architecture-boundaries-and-non-goals.md`](../strategy/01-architecture-boundaries-and-non-goals.md) 维护。
