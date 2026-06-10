# Loop Engineering Development Requirements

> 状态：产品开发要求 / 外部参考提炼
>
> 来源：Addy Osmani《Loop Engineering.》（X Article, 2026-06-08）及当前 KeiGent 产品蓝图。
>
> 目的：把“从 prompt agent 转向设计 loop”的可取内容转化为 KeiGent 下一阶段开发约束，避免只追求更多 agent 或更多自动化而丢失证据、治理和工程责任。

## 1. 核心判断

Loop Engineering 的关键不是“让 agent 自己干更多事”，而是把人原本一轮轮 prompt agent 的工作，产品化为一个能持续运行的系统：

```text
发现任务 -> 分配任务 -> 隔离执行 -> 验证结果 -> 记录状态 -> 决定下一步
```

对 KeiGent 来说，这验证了现有方向：

```text
RunRecord -> Workbench Run Detail -> Skill Governance -> Reviewed/Verified Loop -> Real-world Eval
```

同时也给出明确反约束：

```text
不要在没有状态、证据、隔离、review 和治理的情况下堆 fanout / tournament / dynamic planner。
```

## 2. Loop 的六个产品构件

| 构件 | Loop Engineering 含义 | KeiGent 产品要求 | 主要事实源 |
|---|---|---|---|
| Automations | 按计划或条件自动发现/触发工作 | 任何 automation 必须产生 run record、triage 结果和明确 no-op 语义 | RunRecord、Eval Roadmap |
| Worktrees | 并行 agent 互不踩文件 | 并行/子 agent 默认隔离工作区；review bandwidth 是产品预算上限 | Workflow Modes |
| Skills | 项目知识外部化、复用化 | skill 必须有 lifecycle、match explanation、eval coverage，不自动污染知识库 | Skill Governance |
| Plugins / Connectors | 接入真实工具环境 | connector 必须经过 ToolRegistry、permission、risk、approval、redaction | Tool Governance |
| Sub-agents | maker/checker 分离 | reviewed-loop / verified-loop 必须区分 worker 与 readonly reviewer/verifier | Workflow Modes |
| Memory / State | 跨 run 的外部记忆 | run state 写入 RunRecord / trajectory / task board，不能依赖模型上下文 | RunRecord |

## 3. Automations 开发要求

Automation 不是“定时跑一个 prompt”。它必须满足以下产品条件。

### 3.1 必须定义触发语义

每个 automation 必须声明：

- 触发方式：schedule / event / manual / goal condition；
- 触发范围：repo / workspace / issue query / eval dataset；
- no-op 行为：没有发现任务时如何记录；
- 输出目的地：triage inbox / markdown state / Linear-like board / run list；
- 最大预算：时间、迭代、工具调用、child runs。

### 3.2 必须产生可审计状态

每次 automation run 必须产生：

- `RunRecord`；
- trajectory；
- finding summary；
- no-op / succeeded / failed / degraded 明确状态；
- false-confidence boundary：不能把“没有发现问题”显示成“系统完全健康”。

### 3.3 不允许的实现

- 不允许只写 cron prompt，没有状态记录。
- 不允许发现失败时静默丢弃。
- 不允许 automation 直接创建高风险副作用而不经过 approval gate。
- 不允许把 recurring prompt 写成不可维护的大段文本；可复用流程应沉淀为 skill，但须经过 skill governance。

## 4. Worktree / 隔离开发要求

并行 agent 的核心风险是工作区互相污染。任何多 child / 多 agent 能力进入产品化前，必须先定义隔离策略。

### 4.1 默认隔离

| 场景 | 默认要求 |
|---|---|
| 单次普通执行 | 可使用当前 workspace，但写操作进入 ToolRegistry 风险控制 |
| reviewed-loop | reviewer 默认 readonly，不共享 worker 可变状态 |
| verified-loop | verifier 默认 readonly，可读取 artifact / diff / test report |
| fanout / tournament | 每个 candidate 必须有独立 worktree 或等价隔离空间 |
| automation spawned work | 默认独立 branch/worktree，完成后进入 triage/review |

### 4.2 Review bandwidth 是产品预算

Worktree 只能解决文件冲突，不能解决人类 review 上限。因此所有并行能力必须有：

- `maxChildRuns`；
- reviewer queue；
- review required / auto-close no-op 规则；
- abandoned work cleanup；
- conflicting outputs 的处理规则。

### 4.3 非目标

- 不在当前阶段实现无限并行 swarm。
- 不用 fanout 数量替代质量证明。
- 不把“多个 agent 都说成功”当作通过证据。

## 5. Skill 开发要求

Loop 的复利来自 skill，但错误 skill 也会复利错误。

### 5.1 Skill 是意图资产，不是 prompt 片段

每个正式 skill 必须说明：

- 适用任务；
- 触发条件；
- 非目标；
- 需要的工具权限；
- 输出证据；
- 失败边界；
- eval coverage。

### 5.2 Skill 注入必须可解释

任何 run 中使用 skill，都必须在 RunRecord / Workbench 中可见：

```text
Skill matched: <name>
Reason: <trigger/rule/semantic reason>
Status: verified/candidate/blocked/...
Body injected: yes/no
Risk delta: R0-R5
Eval coverage: <cases>
```

### 5.3 Skill 不能替代引擎验收

禁止规则：

- skill body 不能宣称任务成功；
- skill 不能绕过 ToolRegistry；
- skill 不能把 final text 当 evidence；
- learned note 不能自动晋升 verified；
- 没有 eval 的 skill 不能成为默认注入项。

## 6. Connectors / Plugins 开发要求

Connector 让 loop 进入真实工作环境，也把风险从本地文件扩展到外部系统。

### 6.1 Connector 必须统一进入 ToolRegistry

任何 connector 能力都必须有工具元数据：

- permission；
- risk；
- sideEffect；
- reversible；
- timeout；
- output limit；
- redaction policy；
- approval policy。

### 6.2 Connector 产品验收

| 验收项 | 要求 |
|---|---|
| readonly path | 不需要审批，但仍需记录 source |
| write path | R3+ 或 dangerous 必须审批 |
| external side effect | RunRecord 显示目标资源和结果 |
| failure | structured failure code，不静默失败 |
| secret | raw secret 不进入 UI/report/trajectory |

### 6.3 非目标

- 不把 plugin 安装等同 connector 可用。
- 不在没有 risk metadata 的情况下开放外部写操作。
- 不把 connector 返回文本直接当作可信证据。

## 7. Sub-agent / Maker-Checker 开发要求

Loop 中最重要的结构之一是 maker 与 checker 分离。但 checker 也不能只给主观意见。

### 7.1 角色边界

| 角色 | 默认权限 | 职责 |
|---|---|---|
| worker | 按 profile/policy 执行 | 产生候选结果、artifact、evidence |
| reviewer | readonly | 按 rubric 评审 worker 输出 |
| verifier | readonly + allowed tests | 执行验证命令 / assertion |
| judge | readonly | 比较候选，但不能替代 evidence |

### 7.2 Reviewer 必须绑定 rubric

没有 rubric 不启用 reviewer/tournament。rubric 至少包括：

- 任务目标；
- 成功证据；
- 禁止行为；
- false success 风险；
- 输出格式；
- blocking issue 判定。

### 7.3 Checker 不能覆盖事实

- reviewer 说“通过”不能覆盖 failed assertion；
- checkpoint passed 不能覆盖 parent timeout/budget failure；
- judge ranking 不能覆盖安全/权限失败；
- verifier 不应执行修复性副作用，除非明确声明为 worker。

## 8. Memory / State 开发要求

长期 loop 的状态必须存在模型上下文之外。

### 8.1 状态层次

| 层次 | 用途 | 是否可信事实源 |
|---|---|---|
| conversation context | 当前交互上下文 | 否，易丢失 |
| trajectory | 单次执行事件事实 | 是，但偏底层 |
| RunRecord | 产品级 run 事实 | 是，Workbench 主事实源 |
| task board / triage | 跨 run 的工作队列 | 是，需记录来源 |
| skill | 可复用流程知识 | 只有 verified 才是默认可信 |

### 8.2 必须记录 next action

失败或降级 run 不能只结束。它必须给出：

- blocking failure；
- next recommended action；
- 是否可 replay；
- 是否需要 human review；
- 是否应该产生 learned note。

## 9. 与 KeiGent 当前路线的映射

| 当前路线 | Loop Engineering 启发 | 开发要求 |
|---|---|---|
| RunRecord | 外部 memory 是 loop 脊柱 | 所有 CLI/workflow/eval run 都应能映射为 RunRecord |
| Workbench Run Detail | loop 是控制台，不是聊天气泡 | V1 先做审计界面，不做花哨 dashboard |
| Skill Governance | skill 让项目知识复利 | skill 必须 lifecycle + eval guard |
| Real-world Eval | loop 需要 proof，不是 claim | L2/L3 区分 task success、evidence quality、false confidence |
| Workflow Modes | maker/checker 分离 | reviewed/verified 先行，fanout/tournament 延后 |
| Tool Governance | connectors 触达真实环境 | 所有 connector 进 ToolRegistry |

## 10. 开发优先级调整

### P0：必须强化

1. RunRecord 覆盖所有 run 类型，包括 automation/no-op/failure/replay。
2. Workbench Run Detail 使用真实 RunRecord。
3. Skill match explanation 进入 RunRecord 和 UI。
4. Real-world Eval L2 报告跳转到 case/run detail。
5. reviewed-loop 的 readonly reviewer 与 rubric 语义。

### P1：谨慎推进

1. automation triage：先做本地、无外部账号、可 no-op 的 recurring eval/triage。
2. worktree isolation：作为 fanout 前置能力，而不是和 fanout 一起做。
3. connector plugin：先 readonly，后 write，write 必须 approval。
4. L3 operator scenario：以人工 reviewer 为主，不急于自动打分。

### P2：暂缓

1. dynamic planner；
2. tournament ranking；
3. autonomous swarm；
4. 无人值守外部写操作；
5. 自动将 learned note 变成 verified skill。

## 11. 验收清单

任一新 loop/automation/sub-agent 能力进入 main 前，必须回答：

1. 这个 loop 的触发条件是什么？
2. no-op 如何记录？
3. 状态写在哪里？
4. 是否生成 RunRecord？
5. 是否可 replay？
6. maker 和 checker 是否分离？
7. checker 是否 readonly？
8. 成功证据是什么？
9. tool attempted 和 tool succeeded 是否分离？
10. 是否经过 ToolRegistry 与 approval gate？
11. 是否有 skill lifecycle 影响？
12. 是否会制造 comprehension debt？
13. 用户需要 review 什么？
14. false confidence 如何暴露？
15. 失败后的 next action 是什么？

## 12. 产品原则

最终原则不是“让 loop 取代工程师”，而是：

```text
Build the loop, but keep the engineer accountable.
```

KeiGent 的产品表达应坚持：

- loop 可以放大判断力，也会放大逃避；
- 自动化越强，证据和审计越重要；
- verifier 是必要条件，不是充分证明；
- Workbench 的价值是帮助人保持理解，而不是让人放弃理解；
- 任何看起来更自主的能力，都必须先证明它不会制造更强的 false confidence。