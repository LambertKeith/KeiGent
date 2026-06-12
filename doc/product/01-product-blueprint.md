# KeiGent Product Blueprint v1

> 状态：产品与系统成熟度基线  
> 目的：把 KeiGent 约束为一个需求导向、可验证、可审计、可治理的产品系统。

## 1. 产品定位

KeiGent 是一个 **skill-driven、profile-switchable、evidence-first 的 Agent Runtime / Operations Workbench**。

它不是通用聊天机器人，也不是任意多 agent 拼图框架。它的核心价值是：

1. 用同一个 `LoopEngine` 承载不同执行纪律。
2. 用 `LoopProfile` 区分聊天、研究、精确执行、强验证执行。
3. 用 skill 提供“怎么做”的工作流知识。
4. 用 success definition、checkpoint、verdict、trajectory 提供“怎么证明做成了”的证据。
5. 用 eval/replay/dashboard 让 agent 行为可回归、可审计、可调试。

## 2. 目标用户

| 用户 | 需要 KeiGent 解决的问题 | 关键验收证据 |
|---|---|---|
| Agent framework builder | 不同任务需要不同 loop，而不是一个万能循环 | profile routing matrix、workflow trajectory |
| 高阶自动化用户 | 浏览器/文件/命令任务要可控、可恢复、可验证 | checkpoint/verdict、permission trail |
| AI operator / reviewer | 想知道 agent 为什么这样做、成功证据是什么 | structured event、debug timeline |
| 内部工具团队 | 需要可配置、可审计的本地 agent runtime | doctor、redacted config、eval report |

## 3. 一级场景

1. **Conversational control**：能力询问、澄清、轻量交互。
2. **Divergent research**：开放调研、资料整理、知识沉淀建议。
3. **Convergent execution**：按 skill 精确完成文件、shell、网页等任务。
4. **Verified execution**：对缺少廉价验证器的任务建立证据闭环。
5. **Workflow envelope**：把 child runs、预算、失败、证据包装为可追踪父运行。
6. **Eval / replay / dashboard**：回归、复盘、调试 agent 行为。
7. **Skill governance**：把可复用经验从 trajectory 安全晋升为正式 skill。

## 4. 非目标

- 不做万能聊天机器人。
- 不做 LangChain 式任意节点编排器。
- 不做无边界 autonomous swarm。
- 不把“最终回答说成功了”当成功证据。
- 不自动执行危险外部副作用。
- 不自动把学习笔记晋升为正式 skill。
- 不把 replay pass 当 fresh execution pass。
- 不为第三方 relay 平台做一等产品入口；模型配置保持 protocol-first。

## 5. 成熟度模型

| 层级 | 名称 | 判断标准 | 不足以证明 |
|---|---|---|---|
| M0 | 可运行 | CLI 能启动，LoopEngine 能完成示例 | 产品可用、结果可信 |
| M1 | 可配置 | provider-neutral config、doctor、redaction | 执行可靠 |
| M2 | 可观测 | progress events、trajectory、dashboard view model | 成功真实 |
| M3 | 可验收 | successDef、assertion、checkpoint、eval report | 适合高风险自动化 |
| M4 | 可治理 | permission、approval、skill lifecycle、workflow policy | 所有任务自动完成 |
| M5 | 可运营 | web workbench、replay、regression suite、debuggability | SaaS 多租户能力 |

## 6. 系统模块地图

| 模块 | 产品职责 | 架构事实源 | 必须验收 |
|---|---|---|---|
| Orchestrator | 任务路由 | routing fixture / profile event | profile 与 risk 选择正确 |
| LoopEngine | 执行纪律 | LoopProfile + ProgressEvent | 不同 profile 行为差异真实存在 |
| Skill system | 怎么做 | SKILL.md + match rationale | 匹配可解释，不污染知识库 |
| Success/Evidence | 怎么验 | SuccessDef + Assertion + Verdict | final text 不能伪造成功 |
| ToolRegistry | 能做什么 | Tool metadata + permission | 权限、超时、取消生效 |
| Workflow Envelope | 父运行与 child evidence | WorkflowTrajectory | 预算、失败、证据不丢失 |
| Eval Harness | 回归判断 | EvalReport | failure code 语义稳定 |
| Web Workbench | 操作与审计界面 | normalized view models | 不混淆成功/证据/回放 |

## 7. 当前实现基线

截至 2026-06-09，仓库实现基线如下：

- CLI：支持 REPL、单次执行、`config init/show/set/unset/path`、`doctor --offline --json`、`eval smoke/orchestrator/replay`、`replay <trajectory>`、`web --print`。
- Eval：smoke suite 覆盖 57 个确定性产品用例；browser suite 覆盖 10 个本地/fixture 语义用例；orchestrator suite 覆盖 32 个路由 fixture；replay fixture 由测试覆盖。
- Evidence：SuccessDef/Assertion、EvidenceBundle、approval/checkpoint/tool 证据进入 workflow/eval 判定；final text 不作为操作成功的唯一证据。
- Governance：ToolRegistry 具备 permission/risk/sideEffect/reversible 元数据，R3-R5 与 dangerous 工具走审批门，轨迹中保存脱敏审批证据。
- Skill：skill metadata/status、匹配解释、`learned-note-only` 学习输出和 promotion eval guard 已实现。
- Web：当前是 Workbench 视图模型 shell + 本地 API/SSE foundation，覆盖 run console、Web Run Launcher、Run Detail、replay、real-world eval dashboard、config、skill library 的 normalized model，并可通过 `keigent web --api` 暴露 run store、latest real-world eval report、web-sourced run start 与 run session progress stream；完整交互式 UI 仍属后续工作。

## 8. 下一阶段产品主线

当前 runtime core baseline 已成立，下一阶段产品开发不应优先堆叠更多 profile、planner 或多 agent 花样，而应把现有能力推进为可持续使用的 Agent Operations System。

推荐主线：

```text
可运行 Runtime
    -> 可解释 Run
    -> 可复盘 Replay
    -> 可治理 Skill / Tool / Workflow
    -> 可运营 Workbench
    -> 真实世界 Eval 基线
```

下一阶段 P0 文档：

- [`05-run-record-and-run-lifecycle.md`](05-run-record-and-run-lifecycle.md)：定义 `RunRecord`、run lifecycle、CLI summary、Workbench 事实源。
- [`06-skill-governance-product-spec.md`](06-skill-governance-product-spec.md)：定义 skill 生命周期、晋升门槛、eval guard、blocked/deprecated 语义。
- [`../evals/03-real-world-eval-roadmap.md`](../evals/03-real-world-eval-roadmap.md)：定义 L1/L2/L3 eval、false confidence 防线和准入条件。

下一阶段 P1 文档：

- [`07-local-operator-user-journeys.md`](07-local-operator-user-journeys.md)：定义安装、执行、审批、复盘、skill 晋升与真实世界 eval 的 operator 旅程。
- [`08-loop-engineering-development-requirements.md`](08-loop-engineering-development-requirements.md)：把 Loop Engineering 提炼为 automation、worktree、skill、connector、sub-agent、memory 的开发要求。

## 9. 产品质量门

任何新能力进入主线前必须回答：

1. 用户问题是什么？
2. 默认任务分类是什么？
3. 是否需要 successDef？
4. 需要哪些证据？
5. 涉及什么权限和风险？
6. 失败如何表达？
7. 是否进入 eval/replay 覆盖？
8. 是否会破坏“一引擎多 profile”的边界？

## 10. P2 / 非当前基线

以下能力不得在当前基线中被文档或 UI 说成已经可用：

- fanout-synthesis。
- tournament ranking。
- dynamic planner。
- 任意 autonomous swarm。
- 完整 Web 配置编辑器与在线 doctor 自动探测。
- SaaS 多租户、远程队列、云端权限系统。

## 11. 总体验收

本蓝图通过验收当且仅当：

- 每个核心模块都能映射到明确用户问题。
- 每个用户问题都有可机器检查或可审计的证据。
- 每个被排除方向都有明确非目标声明。
- 后续设计文档都引用本蓝图中的成熟度与质量门。
