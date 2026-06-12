# Agent Operations Product Direction

> 状态：产品方向 / 架构判断 / 后续路线约束  
> 形成时间：2026-06-11  
> 依据：`agent-operations-next-round` 分支增量、产品蓝图、架构事实源、外部 Agent 项目学习与本地验收报告。  
> 适用读者：产品负责人、架构师、设计师、验收人、AI 协作者与后续 coding agent。

---

## 1. 结论

KeiGent 当前不应继续以“能做更多 Agent demo”为目标，而应收敛为：

```text
TypeScript-first、provider-neutral、loop-explicit、acceptance-driven 的 Agent Operations Workbench。
```

更面向用户的表达是：

```text
KeiGent 帮用户把 Agent 的执行循环工程化为可控制、可观测、可验收、可恢复、可复盘的运行过程。
```

近期 `agent-operations-next-round` 的核心价值不是堆叠新功能，而是补齐 Agent 产品的可信运行骨架：稳定事件协议、证明边界、自治摘要、模型能力声明、operator 审证包，以及 CLI RunRecord 到 Workbench 的产品级 E2E 回归。

正确产品口径：

```text
KeiGent 已具备稳定事件协议、证明边界、自治摘要、能力声明、operator 审证包与 CLI→Workbench E2E 回归的本地 Agent Operations 基线。
```

不得宣称：

```text
完整交互式 Agent Operations Workbench 已成熟；
fixture pass 已证明真实生产环境健康；
human acceptance packet 等价于真人实际审证；
P2 dynamic planner / tournament / autonomous swarm 已完成；
无人值守外部写操作可以默认开放。
```

---

## 2. 产品心智

KeiGent 不与通用 Agent SDK 比“内置能力更多”，也不做大而全 no-code agent workspace。它应继续占住更窄、更硬的心智：

1. 一个 `LoopEngine` 承载不同执行纪律。
2. `LoopProfile` 切换 attention、terminate、verify、recover、memory 策略。
3. skill 负责“怎么做”。
4. `SuccessDef`、assertion、evidence、checkpoint、verdict 负责“怎么验”。
5. `RunRecord`、trajectory、eval、replay、Workbench 负责“怎么复盘”。
6. permission、risk、approval、proof boundary 负责“怎么治理”。

这意味着 KeiGent 的差异点不在于：

- 支持最多模型；
- 内置最多工具；
- 提供最炫 multi-agent 编排；
- 复制 OpenAI Agents SDK、Mastra、LangChain 或 no-code workspace；
- 把聊天窗口包装成完整 agent product。

KeiGent 的差异点在于：

```text
把一次 Agent run 变成可解释、可审计、可验证、可恢复、可治理的工程对象。
```

---

## 3. 近期更新的产品含义

### 3.1 Stable Loop Event Protocol

稳定事件协议让 CLI、Live Console、Workbench、eval report 和 Feishu/report 不再各自解析 raw logs。

关键产品要求：

- UI 只消费稳定 event / RunRecord 语义；
- unknown event 不让 UI 崩溃；
- tool attempted、tool succeeded、approval requested、approval denied、assertion checked、repair started、run degraded 必须可区分；
- event timeline 必须能映射回 RunRecord。

### 3.2 Proof Boundary

Proof Boundary 防止“最终回答”伪装成成功证据。

每个 trusted run 都应表达：

- 已证明什么；
- 未证明什么；
- 依赖了什么假设；
- 有哪些 evidence gaps；
- 哪些证据来自工具、测试、文件、截图或 checkpoint；
- 哪些只是模型判断。

产品规则：final text 只能解释结果，不能覆盖 evidence gap。

### 3.3 Workflow Autonomy Summary

KeiGent 应默认追求 Agent 在明确边界内自主完成工作，而不是把人类介入做成产品中心。

升级只应发生在：

- 权限不足；
- 高风险或危险副作用；
- 目标存在阻塞性歧义；
- 证据补足失败；
- assertion 自修失败；
- 预算耗尽；
- 外部依赖阻塞。

普通不确定性不应直接问用户；Agent 应先补证据或有限自修。

### 3.4 Provider Capability Guards

Provider-neutral 不等于假装所有 provider 能力相同。

配置应继续以协议和能力为中心：

- `openai` / `anthropic` API shape；
- user-supplied `baseUrl`、`modelId`、`apiKey`；
- `toolCalling`、`streaming`、`jsonMode`、`vision`、`maxContextTokens`、`parallelToolCalls`；
- relay provider 只作为 URL/protocol，不成为一等品牌。

工具型任务在 `toolCalling=false` 时必须明确降级或失败，并把原因记录到 evidence/failure。

### 3.5 Operator Acceptance Packet

人审是治理事实，不是覆盖事实失败的魔法状态。

Operator packet 必须区分：

- fixture pass；
- evidence inspected；
- human decision；
- override reason；
- false-confidence risk accepted；
- actual production health。

human acceptance 不应覆盖 failed assertion，除非有显式 override reason。

### 3.6 CLI → Web API → Workbench E2E

Workbench 的中心不是聊天皮肤，而是 Run 审计台。CLI 持久化的 RunRecord 能通过本地 Web API 被 Workbench 渲染，是从静态 shell 走向真实产品闭环的关键证据。

---

## 4. 后续路线

### P0：Run 审计闭环

目标：用户打开 Workbench 可以真实审一个 run。

必须展示：

- route decision 与 selected profile；
- matched skills 与匹配理由；
- tool timeline；
- evidence / assertion / verdict；
- proof boundary；
- risk / approval；
- failure code 与 blocking evidence；
- replay status；
- no-op scope 与 doesNotProve；
- next action。

验收用例：succeeded run、failed assertion run、approval denied run、replay run、insufficient evidence run、no-op automation run、parent workflow with child run。

### P1：Eval 可复盘

目标：eval 不只是命令行报告，而是产品健康雷达。

要求：

- eval case 链接 RunRecord；
- dashboard 展示 false-confidence risk；
- replay report 不伪装 fresh execution；
- real-world eval report 展示 proof boundary；
- operator packet 与 run detail 可互跳。

### P2：Skill Governance 产品化

目标：skill 不只是 prompt 文件，而是受治理的执行知识资产。

要求：

- skill status、source、coverage、risk boundary；
- matching rationale；
- promotion guard；
- deprecated / blocked 语义；
- learning note 与正式 skill 分离；
- skill outcome feedback。

### P3：Failure Recovery / Self-repair 深化

目标：Agent 不轻易问人，也不伪装成功。

要求：

- failed assertion 默认进入 bounded repair；
- repair 绑定 target assertion；
- repair attempts 受 budget 控制；
- repair 后重新验证；
- repair failed 才进入 degraded / escalation；
- escalation reason 结构化进入 RunRecord。

### P4：Worktree Isolation / Child Run Foundation

目标：为 future fanout、reviewer、verifier、judge 和 tournament 打地基，但不急着做炫技编排。

要求：

- child workspace manifest；
- artifact 回收；
- conflict detection；
- cleanup；
- parent / child RunRecord；
- child role：worker / reviewer / verifier / judge；
- 权限继承与隔离。

---

## 5. 反 demo 化原则

KeiGent 应继续坚持反 demo 化。Demo 可以存在，但不能替代产品事实。

硬规则：

1. Final text 不证明成功。
2. Replay pass 不证明 fresh execution。
3. Fixture pass 不证明生产健康。
4. No-op 不证明系统健康。
5. Human acceptance 不覆盖事实失败，除非显式 override。
6. Provider-neutral 不等于 provider capability 相同。
7. Skill 负责怎么做，引擎负责怎么验。
8. Workflow 是 parent envelope，不是第二套 loop。
9. 人类介入是校准升级，不是默认中心。
10. Workbench 展示事实，不包装成功。

---

## 6. 对后续 AI 协作者的约束

后续任何产品、架构、实现或验收工作都应遵守：

- 先查 `doc/design/01-architecture.md` 和相关产品文档，不凭记忆定义架构事实；
- 不新增第二套 agent loop；
- 不新增与 `SuccessDef`、Assertion、Evidence、RunRecord 平行的重复验收体系；
- 不把模型供应商或 relay 平台做成一等产品入口；
- 不把 Workbench 描述为完整交互式产品，除非有对应实现和验收；
- 不把 eval fixture、replay、operator packet 或 human sign-off 夸大为生产健康；
- 所有新能力必须说明：证明什么、不证明什么、失败如何表达、如何进入 RunRecord / eval / Workbench。

---

## 7. 关联事实源

- 产品蓝图：[`../product/01-product-blueprint.md`](../product/01-product-blueprint.md)
- Agent Operations 成熟路线图：[`../product/09-agent-operations-maturity-roadmap.md`](../product/09-agent-operations-maturity-roadmap.md)
- 外部 Agent 项目学习要求：[`../product/11-agent-project-learning-development-requirements.md`](../product/11-agent-project-learning-development-requirements.md)
- 架构事实源：[`../design/01-architecture.md`](../design/01-architecture.md)
- Agent Operations Next Round 验收报告：[`../evals/05-agent-operations-next-round-acceptance-report.md`](../evals/05-agent-operations-next-round-acceptance-report.md)
