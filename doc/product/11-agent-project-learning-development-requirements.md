# Agent Project Learning Development Requirements

> 状态：下一轮开发要求 / 外部优秀 Agent 项目提炼
>
> 形成时间：2026-06-10
>
> 来源：对近期 GitHub Agent 项目与方法论的学习，包括 OpenAI Agents SDK、Mastra、Microsoft Agent Framework、HumanLayer 12-Factor Agents、CopilotKit / AG-UI、VoltAgent、Plano、Coze Loop、Google Agent Starter Pack 等。
>
> 目的：把外部可取点转化为 KeiGent 下一轮开发约束，同时明确不盲目跟随的边界。

---

## 1. 核心判断

外部项目给出的共同趋势是：Agent 产品正在从“能调用模型和工具”走向：

```text
可控制的执行循环
可审计的运行事实
可声明的协议边界
可复盘的证据链
可治理的工具与风险
可嵌入的 UI / 操作界面
```

KeiGent 不应和通用 Agent SDK 比“内置能力更多”，也不应走大而全 no-code agent workspace。KeiGent 应继续占住一个更窄、更硬的心智：

```text
TypeScript-first、provider-neutral、loop-explicit、acceptance-driven 的 Agent loop control layer。
```

产品表达：

```text
KeiGent 帮你把 Agent 的执行循环变成可控制、可观测、可验收、可恢复、可复盘的工程过程。
```

---

## 2. 外部项目可取点

### 2.1 OpenAI Agents SDK：原语清晰，但避免厂商绑定

可取点：

- Agent / Tool / Handoff / Guardrail / Session / Trace 等原语清晰；
- tracing、guardrails、sessions、人机协作边界进入框架主路径；
- multi-agent workflow 不是 demo，而是 SDK 级抽象。

KeiGent 内化方式：

- 不复制 OpenAI 专属对象；
- 保留 provider-neutral / protocol-first；
- 把外部 `handoff` 思想翻译为 KeiGent 的 `route decision`、`child run`、`workflow envelope`；
- 把 `guardrails` 翻译为 `SuccessDef`、`Assertion`、`RiskPolicy`、`FailureCode`。

不跟随：

- 不将 OpenAI 生态对象作为 KeiGent 一等产品语言；
- 不将模型供应商 tracing 当作唯一事实源。

### 2.2 Mastra：TypeScript-first 值得学，但不做全家桶

可取点：

- TypeScript-first 的开发体验；
- workflows、agents、tools、memory、eval 等工程组合；
- 面向现代 JS/TS app 的集成方式。

KeiGent 内化方式：

- 强化 TypeScript-first runtime / CLI / Web workbench 一体体验；
- 提供更清晰的 local-first developer ergonomics；
- 让 loop profile、workflow mode、RunRecord、eval 形成统一 TS 类型体系。

不跟随：

- 不做“AI application framework 全家桶”；
- 不把 memory、RAG、workflow、deployment 都变成 KeiGent 自己的一套平台。

### 2.3 Microsoft Agent Framework：生产化能力值得学

可取点：

- durability、restartability、observability、governance、human oversight；
- graph / workflow 模式和生产级运行时语义；
- 对长任务、失败恢复、运行状态的重视。

KeiGent 内化方式：

- RunRecord 必须成为长期事实源；
- workflow envelope 应表达 parent / child、budget、timeout、replay、artifact；
- failure / degraded / no-op / replay 不能被 final text 覆盖；
- Workbench 应优先服务审计、恢复、复盘，而不是聊天包装。

不跟随：

- 不绑定 Azure / .NET / Python 生态；
- 不把云平台 governance 当作 KeiGent 的前提。

### 2.4 12-Factor Agents：可靠 LLM software 原则值得产品化

可取点：

- 把上下文、工具、控制流、错误、人工反馈视为软件工程问题；
- 强调明确边界、状态外部化、可测试、可恢复；
- 避免“让模型自己决定所有事”的黑盒 agent 叙事。

KeiGent 内化方式：

- 所有成功必须有 evidence，而不是 final response；
- context / skill / memory 需要 lifecycle 与 eval guard；
- Agent 输出必须携带 proof boundary：证明了什么、没证明什么、依赖什么假设。

不跟随：

- 不把原则停留在文档；必须落到 tests、evals、RunRecord、Workbench UI。

### 2.5 CopilotKit / AG-UI：Agent UI 协议值得关注

可取点：

- Agent 与 UI 的事件协议；
- generative UI / copilot UI 对长任务状态、tool call、approval、streaming 的展示；
- 前端不应解析 raw logs，而应消费稳定事件。

KeiGent 内化方式：

- 定义最小 Loop Event Protocol；
- Live Console、Workbench、CLI、Feishu/report 都应从同一 event / RunRecord 语义生成；
- UI 展示 `tool_requested`、`tool_completed`、`assertion_checked`、`approval_requested`、`repair_started`、`run_degraded` 等事件。

不跟随：

- 当前阶段不承诺 generative UI；
- 不把 UI 炫技置于 evidence / audit 之前。

### 2.6 Coze Loop / Plano / AgentOps 项目：评估与观测是核心竞争力

可取点：

- run-level observability；
- eval report、case linkage、trace comparison；
- task success、evidence quality、risk compliance、false confidence 分开。

KeiGent 内化方式：

- Eval report 必须链接到 RunRecord / Run Detail；
- false-confidence findings 应是一等信息；
- replay report 不得伪装 fresh execution；
- automation no-op 不得显示为健康分。

不跟随：

- 不先做大型云端 observability 平台；
- 先做本地、可验证、可导出的 agent operations workbench。

### 2.7 VoltAgent / Google Agent Starter Pack：脚手架经验可学

可取点：

- 快速创建可运行 agent app；
- 默认项目结构、配置、示例、deploy guide；
- 降低首次使用门槛。

KeiGent 内化方式：

- 做 `keigent init` 或 first-run guide；
- 提供 provider-neutral config template；
- 提供 sample run / sample eval / sample skill；
- doctor 应能解释缺失配置和下一步。

不跟随：

- 不把 starter pack 变成平台锁定；
- 不以 demo success 替代长期可运营性。

---

## 3. 下一轮开发要求

### R1：Autonomy-first Escalation

#### 背景

外部项目普遍强调 human-in-the-loop，但 KeiGent 不能把“人类接管”做成默认中心。KeiGent 应默认追求 Agent 在明确边界内自主完成工作。

#### 要求

- Agent 默认在权限、预算、证据要求、任务边界内自主推进；
- 只有在权限、风险、目标阻塞性歧义、证据补足失败、预算耗尽、外部依赖阻塞时才升级；
- 升级必须有结构化 reason；
- 普通不确定性不应直接问用户，应先自主补证据或自修；
- RunRecord 必须记录 autonomy outcome。

建议类型：

```ts
type EscalationReason =
  | "permission_required"
  | "risk_confirmation_required"
  | "goal_ambiguity_blocking"
  | "evidence_insufficient_after_retry"
  | "acceptance_failed_after_repair"
  | "budget_exhausted"
  | "external_dependency_blocked";
```

验收标准：

- 低风险缺信息任务先补证据，不直接 ask user；
- R3+ / dangerous / external write 仍触发 approval；
- budget exhausted 输出已完成、未完成、继续成本；
- 每次 escalation 进入 RunRecord；
- 不出现“模型不确定 -> 泛泛问用户”的默认路径。

### R2：Self-repair before Escalation

#### 背景

如果 Agent 一失败就问人，会削弱 KeiGent 的 autonomous task completion 能力。

#### 要求

- failed assertion 后默认进入有限自修；
- self-repair 必须绑定具体 failure / assertion；
- repair 后必须重新验证；
- repair attempts 必须受 budget 控制；
- repair 失败后才进入 degraded / failed / escalation。

验收标准：

- 新增 L2 case：第一次 assertion failed，Agent 自修后通过；
- 新增 L2 case：repair 超预算后 degraded，不伪装 success；
- RunRecord 记录 repair attempts、target assertion、final verdict。

### R3：Loop Event Protocol

#### 背景

CopilotKit / AG-UI 等项目说明：Agent UI 不能靠解析 raw logs。KeiGent 需要稳定事件协议服务 CLI、Workbench、Live Console、reports。

#### 要求

定义最小事件集：

```ts
type LoopEventType =
  | "run_created"
  | "route_decided"
  | "skill_matched"
  | "iteration_started"
  | "tool_requested"
  | "tool_completed"
  | "evidence_collected"
  | "assertion_checked"
  | "repair_started"
  | "escalation_decided"
  | "run_succeeded"
  | "run_failed"
  | "run_degraded";
```

验收标准：

- CLI、Workbench、Live Console 不能各自定义不兼容状态；
- event 可以映射到 RunRecord timeline；
- unknown event 不让 UI 崩溃；
- tool attempted / succeeded、approval requested / approved / denied 必须可区分。

### R4：Provider Capability-aware Routing

#### 背景

Mastra、OpenAI、Microsoft 等框架都在不同程度上内置模型能力假设。KeiGent 必须保持 provider-neutral，但不能假装所有 provider 能力相同。

#### 要求

Provider config 应声明 capability，而不是供应商品牌特权。

```ts
interface ModelCapabilities {
  toolCalling: boolean;
  streaming: boolean;
  jsonMode: boolean;
  vision: boolean;
  maxContextTokens?: number;
  parallelToolCalls?: boolean;
}
```

验收标准：

- toolCalling=false 时，不选择需要工具调用的 workflow 或明确降级；
- jsonMode=false 时，structured output 有 fallback；
- context 不足时，RunRecord 记录 budget / context limitation；
- relay provider 只作为 URL/protocol，不成为一等品牌。

### R5：Proof Boundary as First-class Output

#### 背景

AgentOps / eval 项目反复说明：通过率、成功文本、单次 replay 都容易制造 false confidence。

#### 要求

每个 trusted run 都应表达：

```text
已证明什么
未证明什么
依赖了什么假设
哪些证据来自工具/测试/文件
哪些结论只是模型判断
```

建议类型：

```ts
interface ProofBoundary {
  proven: string[];
  notProven: string[];
  assumptions: string[];
  evidenceGaps: string[];
}
```

验收标准：

- real-world eval report 显示 proof boundary；
- Workbench Run Detail 展示 notProven / assumptions；
- no-op automation 必须显示 scope 与 doesNotProve；
- final text 不能覆盖 evidence gap。

### R6：Acceptance Packet for Human Review

#### 背景

人类 review 不应是默认接管机制，但当需要人审时，系统必须提供清晰审证包。

#### 要求

- reviewer 看到 task、route、evidence、failures、risk、proof boundary、next actions；
- reviewer 不需要读 raw logs 才能判断；
- human decision 与 evidence inspected 分开；
- override 必须有 reason。

验收标准：

- operator scenario packet 可下载或复制；
- sign-off 记录进入 RunRecord 或 acceptance artifact；
- reviewer 未审 evidence 时不能显示 accepted；
- human acceptance 不覆盖 failed assertion，除非显式 override。

### R7：Starter Path without Demo Deception

#### 背景

VoltAgent / starter pack 类项目的 onboarding 值得学习，但 KeiGent 不能靠漂亮 demo 掩盖未验收能力。

#### 要求

- first-run guide 使用 provider-neutral config；
- sample skill 必须标记 coverage / risk；
- sample eval 必须显示 doesNotProve；
- `doctor` 给出具体下一步，而不是泛泛失败；
- demo run 不允许被宣传为真实生产能力。

验收标准：

- 新用户能在本地跑通 sample smoke run；
- sample report 明确 fixture boundary；
- 缺少 API key / browser / git 权限时 doctor 给出可行动 next action。

---

## 4. 与现有路线的去重关系

这些要求不是另起一套术语，应合并到现有体系：

| 新要求 | 应合并到 | 避免重复 |
|---|---|---|
| Autonomy-first Escalation | workflow policy / failure recovery / RunRecord | 不新增 HumanTakeover 中心概念 |
| Self-repair | failure recovery / SuccessDef / Assertion | 不把 repair 做成 reviewer 的隐式职责 |
| Loop Event Protocol | trajectory / workflow events / Live Console | 不让 UI 解析 raw logs |
| Provider Capabilities | config / provider usage / routing | 不新增 Packy/OpenAI/Azure 等品牌特权 |
| Proof Boundary | RunRecord / eval report / Workbench | 不新增平行 AcceptanceSpec |
| Acceptance Packet | operator scenario eval / review artifact | 不让人工验收覆盖事实失败 |
| Starter Path | release and upgrade / README / doctor | 不把 demo success 当产品健康 |

---

## 5. 下一轮优先级建议

### P0

1. Autonomy-first Escalation taxonomy；
2. Self-repair before escalation；
3. Loop Event Protocol 最小稳定版本；
4. Proof Boundary 进入 RunRecord / eval / Workbench；
5. 真实 CLI -> RunRecord -> Web API -> Workbench E2E 验收。

### P1

1. Provider capability-aware routing；
2. Acceptance packet / human sign-off artifact；
3. first-run guide / sample eval / doctor hardening；
4. Worktree isolation 与 automation triage 产品化。

### P2

1. Generative UI；
2. dynamic planner；
3. tournament ranking；
4. autonomous swarm；
5. 无人值守外部写操作。

---

## 6. 非目标

下一轮明确不做：

- 不做大而全 no-code agent platform；
- 不做供应商绑定 SDK；
- 不用 fanout 数量证明质量；
- 不让 reviewer / human approval 替代 evidence；
- 不让 replay / fixture pass 伪装真实生产健康；
- 不以 demo onboarding 牺牲长期可运营性。

---

## 7. 一句话要求

```text
下一轮开发应把 KeiGent 从“Run 可审计 / Eval 可复盘”的 foundation，推进到“Agent 能在边界内自主完成、失败自修、证据验收、必要时精准升级，并把证明边界稳定展示给操作者”。
```
