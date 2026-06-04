# KeiGent 架构设计：可切换 Loop 的 Agent

> 状态：设计草案 v0.3
> 日期：2026-05-29
> 技术栈：TypeScript（pnpm workspace），底层复用 `@earendil-works/pi-ai`
>
> v0.2 变更：依据 OpenHuman 真实 skill 注入实现，修正能力层（去掉 ToolRegistry 预设）、
> 明确 skill 整篇注入 + 注入 user message、验证标准来源（successDef 为主 + 裁判读 skill 为辅）。
>
> v0.3 变更：解决 §12 待决问题——确立核心原则"skill 决定怎么做、引擎决定怎么验"；
> OBSERVE 拆分为工作观察 vs 验证观察，验证观察用引擎强制的 StateCapture 原语 + checkpoint 信号驱动；
> 定义 SuccessDef / Assertion 结构；匹配精度纳入 attention 旋钮子维度。
>
> v0.4 变更：第 0 步代码落地（`packages/engine/src/index.ts`）——pi-ai 类型签名全部核实、
> 工具调用链路跑通、checkpoint 机制验证、§12 所有待决项关闭。设计层完整，无悬挂问题。
>
> v0.5 变更：第 1-5 步全部落地 + 验收修复。三个基线 profile 全部实现并与 §7.1 对齐；
> skill body 注入移入 attention 旋钮（收敛 1 篇/发散多篇，是核心假设的物理基础，有专门验收脚本
> `verify-attention.ts`）；profile 实例加 `reset()` 防复用污染；skill 匹配支持中英跨语言 + tags；
> 学习 loop + Orchestrator 自动调度闭环。代码现状见 `packages/engine/src/` 和 CLAUDE.md。

---

## 目录

1. [设计动机](#1-设计动机)
2. [核心洞察](#2-核心洞察)
3. [概念模型](#3-概念模型)
4. [三层架构](#4-三层架构)
5. [Loop 引擎](#5-loop-引擎)
6. [五个旋钮（策略接口）](#6-五个旋钮策略接口)
7. [LoopProfile（策略组合）](#7-loopprofile策略组合)
8. [Orchestrator（调度层）](#8-orchestrator调度层)
9. [学习 loop 与执行 loop 的衔接](#9-学习-loop-与执行-loop-的衔接)
10. [技术选型与依赖](#10-技术选型与依赖)
11. [落地路径](#11-落地路径)
12. [开放问题](#12-开放问题)

---

## 1. 设计动机

### 1.1 问题来源

来自对 Hermes Agent 的重度使用观察：

- Hermes 在**知识沉淀**和**会话管理**上有优势，这种优势源于其 **发散性注意力**——倾向于把所有可能相关的上下文（记忆、工具、历史）都拉进来。
- 这种发散性**有利于调研和知识沉淀**，但**不利于精确执行任务**。
- 具体表现：指导 agent 完成某件事，它能按步骤做到；但一旦对任务**结果提出硬性要求**，它连原本"学会"的也无法准确执行——发散的注意力被无关上下文稀释，偏离了正确路径。

### 1.2 核心结论

> **学习/调研 和 执行任务，应该是两套不同的 agent loop。**
>
> - 学习 loop：发散注意力，最大化覆盖度，沉淀知识。
> - 执行 loop：收敛注意力，强化结果校验和任务结果定义，确保精确完成。

而且，**不同使用场景需要不同的 loop**——不应该用一种 loop 打天下。

### 1.3 目标任务领域

执行 loop 首要攻克的不是代码任务（代码有编译/测试这种廉价验证器），而是：

> **浏览器/电脑操作类任务——对人类直接、但缺少可量化判断标准的事情。**

这类任务的难点在于**缺少廉价的验证器**。代码 agent 白嫖了编译器和测试；本项目的执行 loop 必须自己造验证能力，并把它作为架构的第一公民。

---

## 2. 核心洞察

### 2.1 Agent Skill 是知识层，不是功能层

关键澄清（避免常见误解）：

- **Agent Skill**（SKILL.md）是注入到 agent **智能层**的**知识、工作流、行为模式**，告诉 agent "该怎么做这件事"。
- 它**不是**代码模块或 function call。agent 不"调用"skill，而是**加载 skill 的指令并遵循其指导**思考和行动。
- 真正执行动作（点击、输入、导航）靠**通用工具原语**（bash / 文件 / 代码执行）；**具体怎么用这些原语，由 skill body 的自然语言指令决定**（见 §4 概念澄清）。

层次关系：

```
Agent Skill（知识层）  ── 教 agent "怎么做"（纯文档）
      ↓ 注入上下文
Agent Loop（决策层）   ── agent 按 skill 指导循环决策   ← 本项目的创新所在
      ↓ 实际操作靠
通用工具原语（执行层）  ── bash/文件/执行；用法由 skill body 决定
```

### 2.2 问题出在 loop 消费 skill 的方式

Hermes 的痛点根因：**SKILL.md 里的工作流知识本身没问题，问题在于发散式 loop 怎么消费它。**

skill 说"第一步做 A，第二步做 B"，但发散 loop 把这条清晰指导和一大堆无关记忆/上下文混在一起，导致 agent 在第一步就被带跑了。

因此本项目的命题是：

> **不改 skill（既有 skill 库照用），只改 agent 消费 skill 时的循环结构。**
> 让 loop 可以根据任务性质，在"发散探索"和"收敛执行"之间切换。

### 2.3 Hermes 本质上是一个"学习 loop"

Hermes 现有的发散式循环擅长把经验沉淀进知识，但不擅长收敛执行那个知识。本项目要补的，是配套的**执行 loop**，以及一个能在两者间选择的**元层调度**。

### 2.4 核心原则：skill 决定怎么做，引擎决定怎么验

> **执行手段由 skill 驱动，验证由引擎兜底。两者之间有一条不可逾越的边界。**

这是 v0.3 确立的最重要原则，它化解了"skill 驱动执行"与"验证客观性"之间的张力：

| 维度 | 谁说了算 | 理由 |
|---|---|---|
| **怎么做**（操作步骤、用什么工具、看页面哪里来决策）| **skill body**（自然语言指导，执行者遵循）| skill 就是为了封装"怎么做"的领域知识 |
| **怎么验**（验证时采什么状态、对照什么标准、判没判通过）| **引擎 + successDef + 独立裁判** | 执行者有确认偏误，自评不可信；验证必须客观 |

推论（贯穿后续设计）：

- 状态观察分两种——**工作观察**（执行者按 skill 指示自己看，用于决策）和**验证观察**（引擎强制采集客观快照，用于裁判）。前者 skill 决定，后者引擎决定。见 §5。
- skill 能告诉 agent "截个图看看再点"，但**不能决定"验证时该看什么算成功"**——后者由 successDef 和引擎的 StateCapture 原语决定。

---

## 3. 概念模型

### 3.1 一个引擎，多种行为

**最关键的地基决策：系统只有一个 Loop 引擎，不是多个 loop 函数。**

引擎是统一的循环骨架，所有行为差异都来自外部传入的 `LoopProfile`（一组策略参数）。

- 调研任务 → 传发散 profile
- 执行任务 → 传收敛 profile
- 难量化执行任务 → 传验证收敛 profile

**新场景 = 新 profile，引擎一行不改。** 这避免了"维护 N 份 loop 代码"的灾难，必须从第一行代码就守住。

### 3.2 元层调度

系统先判断任务性质，再决定用哪个 profile 跑：

```
任务进来
   ↓
Orchestrator：判断任务性质 → 选 LoopProfile
   ↓
LoopEngine.run(task, skills, profile)
   ↓
消费既有 skill 库（注入文档指导）+ 用通用工具原语执行
```

---

## 4. 三层架构

```
┌──────────────────────────────────────────────────┐
│  创新层（从零写）                                    │
│                                                    │
│  ┌────────────────────────────────────────────┐  │
│  │ Orchestrator                                 │  │
│  │   读任务 → 判断性质 → 选 LoopProfile           │  │
│  └─────────────────┬────────────────────────────┘  │
│                    ↓                                │
│  ┌────────────────────────────────────────────┐  │
│  │ LoopEngine（唯一，参数化）                     │  │
│  │   循环骨架，行为由 LoopProfile 决定            │  │
│  │   ┌──────┬──────┬──────┬──────┬──────┐      │  │
│  │   │注意力 │ 终止  │ 验证  │ 记忆  │ 恢复 │旋钮 │  │
│  │   └──────┴──────┴──────┴──────┴──────┘      │  │
│  └─────────────────┬────────────────────────────┘  │
├────────────────────┼───────────────────────────────┤
│  基础设施层（复用 pi-ai）                            │
│  LLM 调用 / 工具调用 / 流式 / 成本 / 上下文序列化     │
├────────────────────┼───────────────────────────────┤
│  能力层（复用现有，不动）                            │
│  Agent Skills（标准 SKILL.md，纯文档注入）           │
│  通用工具原语（bash / 文件系统 / 代码执行）           │
│    ↑ 具体怎么操作浏览器/电脑，由 skill body 的自然语言决定 │
└──────────────────────────────────────────────────┘
```

职责边界：

| 层 | 谁负责 | 是否本项目创新 |
|---|---|---|
| Orchestrator | 本项目 | ✅ 核心 |
| LoopEngine + 旋钮 | 本项目 | ✅ 核心 |
| LLM/通用工具基础设施 | `pi-ai` | ❌ 复用 |
| Skill 加载机制 | 标准 SKILL.md 约定（参考 OpenHuman 两层注入）| ❌ 复用/借鉴 |
| 既有 skill 库 | 现有资产 | ❌ 不动 |
| 通用工具原语（bash/文件/执行）| `pi-ai` 工具机制 | ❌ 复用 |

### 关键概念澄清（v0.2 修正）

**没有"任务专用 tool layer"要设计。** 这是 v0.1 的概念错误。真实模型是：

- **Skill 是纯文档**，不是代码模块。标准 SKILL.md 的 body 是**自然语言工作流**，告诉 agent "怎么做"。
- **底层执行手段不是架构预设的固定 tool 集**——具体用什么操作浏览器/电脑，是 **skill body 的自然语言指令决定的**。skill 说"用 bash 跑这个脚本""导航到这个 URL"，agent 就用通用工具原语照做。
- 架构层面固定的，只有 **bash / 文件系统 / 代码执行** 这种通用原语（由 `pi-ai` 工具机制提供），而非任务专用工具。
- 这正是 Anthropic Agent Skill 的标准模型：skill 运行在有文件系统 + bash + 代码执行能力的环境里，agent 读 SKILL.md 后用这些通用原语完成任务。

**注意：不直接用 `pi-agent-core` 的 loop。** 它内置一种写死的 agent 循环，而本项目的全部创新恰在 loop 层。可读其源码借鉴消息管理（AgentMessage↔LLM Message 转换、steering/follow-up queue 设计），但循环自己写。

---

## 5. Loop 引擎

引擎是一个把"循环纪律"全部外置成旋钮的状态循环。

### 5.1 两种状态观察（v0.3 核心）

依据 §2.4 原则，状态观察拆成两类，泾渭分明：

| | 工作观察（work observation）| 验证观察（verify observation）|
|---|---|---|
| **谁发起** | 执行者按 skill 指示（用通用工具）| 引擎强制（StateCapture 原语）|
| **采什么** | skill 说了算（"截图""读 DOM"）| 引擎/环境固定，skill 碰不到 |
| **进哪** | 进 state，供下一轮决策 | 进 snapshot，只给裁判 |
| **客观性** | 不要求（执行的一部分）| 必须客观（执行者无权干预）|
| **何时** | 执行者需要时随时 | **checkpoint 信号触发时** |

`StateCapture` 是引擎层固定的通用原语，与任务/ skill 无关：

```typescript
interface StateSnapshot {
  // 通用、客观，采什么由执行环境决定，不由 skill 决定
  url?: string;
  domDigest?: string;        // DOM 结构化摘要
  visibleText?: string;
  screenshot?: Uint8Array;
  recentNetwork?: NetworkEvent[];
  raw: Record<string, unknown>;
}

interface StateCapture {
  capture(): Promise<StateSnapshot>;   // 引擎调用，执行者和 skill 都触不到
}
```

### 5.2 Checkpoint 信号驱动验证

**何时做验证观察 + 跑裁判？由执行者发 checkpoint 信号触发。**

- 执行者在它认为"完成了一个可验证节点"时，发一个特殊的 `checkpoint` 动作（这是**工作判断**——执行者最清楚什么时候到了该验的点）。
- 引擎收到 checkpoint → 调 `StateCapture.capture()` 采客观快照 → 跑 `verify` 旋钮（**验证客观性**——验什么、看什么、判没判通过，引擎和 successDef 说了算）。
- 边界清晰：执行者决定"何时验"，引擎决定"怎么验"。

这避免了两个极端：每轮都验（成本高、多数中间步骤未到可验状态）vs 只在最终验（跑偏发现太晚、纠偏链路长）。

> 注：发散 profile 的 `verify` 是 `NoVerify`，checkpoint 信号被忽略，零验证开销。验证开销只在收敛/验证 profile 下产生。

### 5.3 引擎骨架

```typescript
class LoopEngine {
  constructor(
    private llm: PiAiClient,            // 复用 pi-ai（LLM + 通用工具调用）
    private tools: ToolPrimitives,      // 通用原语：bash / 文件 / 执行
    private stateCapture: StateCapture, // 引擎固定的验证观察原语
  ) {}

  async run(
    task: Task,
    skills: SkillContext,
    profile: LoopProfile,
  ): Promise<LoopResult> {
    let state = LoopState.init(task, skills);

    while (!profile.terminate.shouldStop(state)) {
      // 旋钮①：注意力 — 决定这一轮往上下文放什么（含 skill 匹配精度，见 §6.1）
      const context = profile.attention.buildContext(state, skills);

      // 决策 + 执行（所有 profile 共用）
      // 执行者可发起【工作观察】：按 skill 指示用通用工具看页面，结果进 state
      const action = await this.llm.decide(context);

      if (action.kind === "checkpoint") {
        // ── 执行者声称到了可验证节点 ──
        // 【验证观察】：引擎强制采客观快照，执行者无权干预
        const snapshot = await this.stateCapture.capture();
        state = state.attachSnapshot(snapshot);

        // 旋钮②：验证 — 裁判只看 snapshot + successDef，看不到执行者"声称"
        const verdict = await profile.verify.check(snapshot, task.successDef, skills);
        if (verdict.failed) {
          // 旋钮③：恢复 — 失败了怎么办
          const decision = await profile.recover.handle(state, verdict);
          if (decision.kind === "escalate") return this.escalate(task, state);
          state = state.applyRecover(decision);   // repair/retry 注入修正提示
        }
      } else {
        // 普通执行动作（含工作观察）
        const result = await this.tools.execute(action);
        state = state.append(action, result);
      }

      // 旋钮④：记忆 — 这一轮产物要不要沉淀
      await profile.memory.maybePersist(state);
    }

    return state.finalize();
  }
}
```

**引擎只认接口，不认具体策略。** 这是整个设计可扩展的关键。

注意 `verify.check` 现在吃的是 `snapshot`（客观快照）而非 `state`——这从类型层面强制了"裁判看不到执行者声称"。第三个参数 `skills` 让裁判可读 skill body 做语义兜底（§6.3 方案乙）。

---

## 6. 五个旋钮（策略接口）

每个旋钮是一个策略接口，profile 是这些接口实现的组合。

### 6.1 AttentionStrategy — 注意力

治"发散失控"的核心旋钮。决定每一轮往上下文里放什么。

```typescript
interface AttentionStrategy {
  buildContext(state: LoopState, skills: SkillContext): Context;
}
```

| 实现 | 行为 |
|---|---|
| `WideAttention` | 宽：拉入相关记忆 + 多个 skill body + 完整历史（发散）|
| `NarrowAttention` | 窄：只注入当前任务匹配的 skill body + 最近状态，裁剪记忆/历史/无关 skill（收敛）|

收敛的本质是**上下文裁剪**——不给模型跑偏的材料。

**收敛的对象是记忆/历史/无关 skill，不是 skill 本身（v0.2 明确）。**
依据 OpenHuman 真实实现（`skills/inject.rs`），skill 的注入模型是两层渐进式披露：

```
第一层（常驻）：所有 skill 的 name + description 索引（轻量，~100 token/skill）
第二层（按需）：匹配命中的 skill → 注入【整篇 body】，不分段切碎
```

- **skill body 整篇注入**，不按步骤拆分（标准 SKILL.md 的 body 本就是一篇完整的自然语言工作流）。
- "收敛" = **只注入与当前任务相关的那一篇/几篇 skill**（通过匹配筛选），而非把一篇 skill 拆碎逐步喂。
- 发散 profile 会拉入更多 skill body + 记忆 + 完整历史；收敛 profile 把这些裁到最小。
- body 注入有大小预算（参考 OpenHuman 的 8 KiB 上限），超预算截断到 UTF-8 边界并标记 `truncated`，后续 skill 跳过。

#### 注入位置：user message，不是 system prompt（KV-cache 保护）

OpenHuman 和 Hermes 共同的设计纪律——**动态注入（skill body、记忆、状态）一律前置到 user message，绝不进 system prompt**：

- system prompt 只放常驻的 skill 索引（name + description），整个 session 字节稳定。
- 这保护了推理后端的 KV-cache 前缀——system prompt 一旦变动会强制重新 prefill，成本高。
- 每轮变化的内容（这一轮匹配的 skill body、最近状态快照）都挂在 user message 上。

注入层级（user message 内，从上到下）：
```
1. skill body 注入块（本轮匹配命中的）
2. 状态/记忆上下文（收敛 profile 下大幅裁剪）
3. 原始任务/用户消息
```

#### 匹配精度是 attention 的子维度（v0.3）

skill 匹配的宽严，本身就是注意力策略的一部分，由 attention 旋钮内含，不单设机制：

| attention | 匹配策略 |
|---|---|
| `WideAttention`（发散）| 宽松：`@mention` 显式 + description/tag/name 子串，命中多篇都注入 —— 调研时多看几篇 skill 是好事 |
| `NarrowAttention`（收敛）| **严格**：优先 `@mention`；自动匹配只取相关度最高的 **1 篇**，宁缺毋滥 |

这直接治理最初痛点的一个根因——**发散匹配把多篇 skill 同时注入、互相干扰**，正是"加结果要求就把学会的也做不准"的来源之一。收敛执行只注入最相关的一篇，从源头减少干扰。

（匹配的具体算法参考 OpenHuman `skills/inject.rs`：name ≤2 字符跳过 name-match 防过度匹配；tag 整词匹配；description 子串匹配。）

### 6.2 TerminateStrategy — 终止条件

```typescript
interface TerminateStrategy {
  shouldStop(state: LoopState): boolean;
}
```

| 实现 | 行为 |
|---|---|
| `ModelSelfJudge` | 模型自判"够了"（调研场景）|
| `SkillWorkflowDone` | skill 工作流步骤走完（流程明确场景）|
| `SuccessDefMatched` | 结果符合任务 success 定义（难量化执行场景）|

### 6.3 VerifyStrategy — 验证

执行 loop 的命门。决定每一步/结果要不要查、怎么查。

```typescript
interface VerifyStrategy {
  // v0.3：吃客观 snapshot，不吃 state —— 类型层面隔离执行者"声称"
  // skills 供裁判读 body 做语义兜底（方案乙）
  check(
    snapshot: StateSnapshot,
    successDef: SuccessDef | undefined,
    skills: SkillContext,
  ): Promise<Verdict>;
}

interface Verdict {
  failed: boolean;
  evidence?: string;   // 失败时的具体证据，供 recover 用
  perAssertion?: AssertionResult[];   // 逐条断言结果（AdversarialJudge 产出）
}
```

| 实现 | 行为 |
|---|---|
| `NoVerify` | 不验证（调研场景）|
| `SelfCheck` | 执行者自检（轻量场景）|
| `AdversarialJudge` | **独立裁判 agent**，对抗式找茬，多裁判投票 |

`AdversarialJudge` 设计要点：
- 裁判是**独立 agent**，与执行者上下文隔离（执行者有确认偏误）
- prompt 是"找出不符合证据"而非"确认成功"，默认怀疑，证据不足判不通过
- 多裁判投票（如 voters=3, threshold=2）对冲单裁判随机性
- 优先用结构化信号（URL/DOM/网络请求）判断，截图作补充

#### 验证标准从哪来（v0.2 明确）

依据 OpenHuman 真实实现，**标准 SKILL.md 的 body 是纯自然语言，引擎不解析、不强制任何结构化字段**——没有 `## Success Criteria`、没有"检查点"、没有机器可验证的断言（grep `Success|Criteria|Checkpoint|Verification` 零结果，约定段落都是 author-driven、engine 不感知）。

既然坚持标准 SKILL.md 格式，验证标准**不可能从 skill 文档的结构化字段来**。因此采用：

| 来源 | 角色 | 说明 |
|---|---|---|
| **任务带的 `successDef`** | **主**（方案甲）| 下任务时由人/上游提供，与 skill 解耦。是 `AdversarialJudge` 对照的硬性标准。|
| **裁判读 skill body 推断** | **辅**（方案乙）| 裁判可参考整篇 SKILL.md 理解任务意图，补充 successDef 没覆盖的隐含要求。|

这条路的好处：**完全不破坏标准 skill 格式**（skill 还是纯文档），又能让难量化任务有可验证的硬性标准。

#### SuccessDef 的表达格式（v0.3 确定）

裁判吃客观快照（§5.1），所以 SuccessDef 必须是**能对照快照检查的断言**。采用"结构化断言 + 自然语言"折中——既给裁判聚焦点，又保留语义判断的灵活：

```typescript
interface SuccessDef {
  goal: string;            // 整体目标（自然语言，给裁判理解意图 + 语义兜底）
  assertions: Assertion[]; // 可对照快照逐条检查的断言
}

interface Assertion {
  description: string;     // "页面跳转到文章详情页"
  signal: SignalKind;      // 该看快照的哪部分（聚焦裁判注意力）
  // 刻意不写死匹配规则（如正则）——裁判读 description + 看对应 signal 自己判
  // 既给聚焦点（看哪），又不僵化（怎么算通过靠裁判语义判断）
}

type SignalKind = "url" | "dom" | "text" | "network" | "visual";

interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  evidence: string;        // 裁判找到的支持/反对证据
}
```

设计要点：

- **`assertions` 把"难量化"切成几条"半可量化"检查点**——每条指明看快照哪个 signal，大幅压缩裁判判断空间，提升可靠性。
- **不写死匹配规则**——"语气是否合适"这类本就无法正则化，保留裁判语义判断。
- **`goal` + skill body 兜底**——assertions 没覆盖的隐含要求，裁判靠 goal + 读 skill（方案乙）补。
- 三档对照：纯自然语言（太松，裁判不可靠）／**结构化断言+自然语言（第一版采用）**／纯机器断言（太死，表达不了难量化任务）。

**谁产出 assertions**：第一版人类下任务时写；后续可由"契约起草 agent"起草、人确认（见 §3.2、§8）。不阻塞架构。

### 6.4 RecoverStrategy — 失败恢复

```typescript
interface RecoverStrategy {
  handle(state: LoopState, verdict: Verdict): Promise<RecoverDecision>;
}

type RecoverDecision =
  | { kind: "retry" }
  | { kind: "repair"; fix: Fix }
  | { kind: "escalate" };
```

| 实现 | 行为 |
|---|---|
| `SimpleRetry` | 换个方式重试（无状态、幂等操作）|
| `DiagnoseRepair` | 用裁判证据诊断 → 针对性修正 → 连续失败 N 次升级 |

修复式优于重试式：用裁判产出的**具体证据**决定怎么修，避免反复做错同样的事。

升级式（escalate）是诚实——在缺少验证器的领域无限重试只会烧钱无进展，连续失败就交还人类。

### 6.5 MemoryStrategy — 记忆沉淀

防止执行的中间状态污染知识库。

```typescript
interface MemoryStrategy {
  maybePersist(state: LoopState): Promise<void>;
}
```

| 实现 | 行为 |
|---|---|
| `WriteThrough` | 写沉淀（学习/调研场景）|
| `NoWrite` | 不写（执行场景，防污染）|

**执行 loop 不写记忆**是关键纪律——中间状态不许沉淀回知识库。是否值得沉淀，由学习 loop 事后复盘决定。

---

## 7. LoopProfile（策略组合）

Profile 是五个旋钮的命名组合。

```typescript
interface LoopProfile {
  name: string;
  attention: AttentionStrategy;
  terminate: TerminateStrategy;
  verify: VerifyStrategy;
  recover: RecoverStrategy;
  memory: MemoryStrategy;
}
```

### 7.1 三个基线 Profile

```typescript
// 发散探索（≈ Hermes 现状，用于调研/知识沉淀）
const DIVERGENT_RESEARCH: LoopProfile = {
  name: "divergent-research",
  attention: new WideAttention(),
  terminate: new ModelSelfJudge(),
  verify:    new NoVerify(),
  recover:   new SimpleRetry(),
  memory:    new WriteThrough(),
};

// 收敛执行（流程明确、按 skill 步骤照做）
const CONVERGENT_EXEC: LoopProfile = {
  name: "convergent-exec",
  attention: new NarrowAttention(),
  terminate: new SkillWorkflowDone(),
  verify:    new SelfCheck(),
  recover:   new SimpleRetry(),
  memory:    new NoWrite(),
};

// 验证收敛执行（难量化、有硬性结果要求 —— 最终目标形态）
const CONVERGENT_VERIFIED: LoopProfile = {
  name: "convergent-verified",
  attention: new NarrowAttention(),
  terminate: new SuccessDefMatched(),
  verify:    new AdversarialJudge({ voters: 3, threshold: 2 }),
  recover:   new DiagnoseRepair({ maxAttempts: 3 }),
  memory:    new NoWrite(),
};
```

### 7.2 旋钮对照表

| 旋钮 | divergent-research | convergent-exec | convergent-verified |
|---|---|---|---|
| attention | 宽 | 窄 | 窄 |
| terminate | 模型自判 | skill 走完 | 结果符合定义 |
| verify | 无 | 自检 | 独立裁判 |
| recover | 重试 | 重试 | 诊断修复→升级 |
| memory | 写沉淀 | 不写 | 不写 |

---

## 8. Orchestrator（调度层）

决定任务用哪个 profile。**第一版用最笨可靠的方式：任务自带 profile 声明。**

```typescript
interface Task {
  goal: string;
  profile: string;            // 第一版：显式指定 profile 名
  successDef?: SuccessDef;    // verify 收敛 profile 才需要
}
```

### 8.1 调度器演进三档

| 档位 | 方式 | 何时做 |
|---|---|---|
| **档位 1** | 显式声明（任务带 profile 名）| **第一版，先做这个** |
| 档位 2 | 规则映射（按任务来源/是否带 successDef 等硬信号选）| profile 验证有效后 |
| 档位 3 | 分类 agent（轻量 agent 读任务判断属性选 profile）| 前两档验证后 |

**不要一上来做智能分类器。** 先用显式声明把引擎跑通，验证"同 skill 换 profile 行为确实不同、确实更可靠"这个核心假设，再做自动分类。否则在未验证的假设上叠加不确定的分类器，出问题分不清哪层的锅。

### 8.2 任务属性（未来自动分类的维度）

分类不该基于"任务内容"（无穷尽），而是正交的任务属性：

- 结果是否有硬性定义？（有 → 偏 verified，无 → 偏 research）
- 探索还是执行？（探索 → research，执行 → exec/verified）
- 失败代价高不高？（高 → 加重验证）
- skill 流程是否明确？（清晰 → exec/verified，模糊 → research）

---

## 9. 学习 loop 与执行 loop 的衔接

两套 loop 通过 **trajectory（执行轨迹）** 这个单一接口通信，互不干扰各自的注意力策略。

```
执行 loop 结束（成功 or escalate）
   ↓ 产出 trajectory（步骤、断言、成败、证据）
学习 loop（异步，发散注意力，可写记忆）
   ├─ 成功轨迹      → 强化对应 skill 的工作流
   ├─ escalate + 人类干预 → 提炼新 recovery 知识，写回 skill
   └─ 反复失败的步骤 → 标记该 skill 需人工修订
```

衔接的关键是**隔离**：

- 执行时绝不写记忆（防污染）
- 复盘时才写（学习 loop 负责）
- 学习 loop 的产物（精炼后的 SKILL.md 工作流）正好是执行 loop 的输入

这呼应了 §2.3：Hermes 式发散循环天然适合扮演"学习 loop"，本项目补的是执行 loop + 调度。

---

## 10. 技术选型与依赖

### 10.1 技术栈

- **语言**：TypeScript
- **包管理**：pnpm（monorepo，与 Pi 一致）
- **Node**：≥ 22.19.0（pi-ai 要求）

### 10.2 核心依赖（已核实）

| 依赖 | 包名 | 版本 | 许可 | 用途 | 核实状态 |
|---|---|---|---|---|---|
| LLM 基础设施 | `@earendil-works/pi-ai` | 0.77.0 | MIT | LLM 调用/工具/流式/成本/序列化 | ✅ 已发布、可独立安装、不强制依赖 agent-core |

`pi-ai` 已核实事实（2026-05-29）：
- 独立发布于 npm，`npm install @earendil-works/pi-ai`
- 不依赖 pi-agent-core / pi-tui（反向才依赖）
- 主要 API：`getModel(provider, modelId)`、`complete(model, ctx)`、`stream(model, ctx)`、`Tool`（TypeBox schema）、`validateToolCall`
- 支持工具调用、thinking/reasoning、图像 I/O、成本追踪、AbortController、26+ provider
- MIT 许可，可商用/二次开发
- 2026-05-07 起从 `@mariozechner` 迁移至 `@earendil-works` scope

### 10.3 LLM 端点（协议优先）

KeiGent 不为某个第三方转发平台设置专门入口，而是按 API 协议配置模型端点：

```typescript
const model: Model<Api> = {
  id: process.env["KEIGENT_MODEL_ID"] ?? "gpt-4o-mini",
  api: protocol === "anthropic" ? "anthropic-messages" : "openai-completions",
  provider: protocol === "anthropic" ? "anthropic-compatible" : "openai-compatible",
  baseUrl: process.env["KEIGENT_BASE_URL"] ?? protocolDefaultBaseUrl,
  // ...
};
// getModel() 只接受 KnownProvider，自定义端点直接构造 Model 对象
```

配置层支持：

- `KEIGENT_API_PROTOCOL=openai|anthropic`
- `KEIGENT_BASE_URL=<任意兼容端点>`
- `KEIGENT_MODEL_ID=<模型名>`
- `KEIGENT_API_KEY=<密钥>`

**已知工程问题（gpt-5.5 + pi-ai 流式解析）**：
- pi-ai 的 `openai-completions` 流式解析器在处理 gpt-5.5 的响应时会产生 id 为空字符串的幽灵 ToolCall block。
- 根因：gpt-5.5 流式响应里某些 delta chunk 没有 `id` 字段，pi-ai 创建 block 时用 `id || ""` 填充，导致空 id block 混入 content。
- **规避方案（已在引擎层实现）**：把 assistant 消息加入历史前，过滤掉 `id === ""` 的 ToolCall，并用过滤后的 cleanContent 写入历史（而非原始 `response.content`）。
- 这个过滤逻辑将作为 LoopEngine 的标准内置行为，对所有 provider 都安全（正常 provider 不会产生空 id，过滤是 no-op）。

### 10.4 明确不直接依赖

- **`pi-agent-core`**：内置写死的 loop，与本项目创新冲突。仅参考其源码学习消息管理设计，不作为运行时依赖。
- **`pi-tui`**：UI 层，初期不需要。

---

## 11. 落地路径

每一步验证一个假设，不跳步。

| 步骤 | 内容 | 验证的假设 |
|---|---|---|
| **第 0 步** | 起 pnpm workspace，引入 `pi-ai`，跑通"调 LLM + 调一个工具" | 底层基础设施通了 |
| **第 1 步** | 定义旋钮接口 + LoopProfile + LoopEngine；只实现 `convergent-exec` profile；跑通一个浏览器任务 | 引擎骨架 + skill 消费 + 工具调用通了 |
| **第 2 步** | 加 `divergent-research` profile；同 skill 同任务切换两个 profile | **核心假设：收敛 profile 确实比发散更不跑偏**（证伪则回头改 attention 设计）|
| **第 3 步** | 落地 `StateCapture`（浏览器环境）+ checkpoint 信号 + verify 升级为 `AdversarialJudge` + recover 升级为 `DiagnoseRepair`；单独压测裁判可靠性 | 验证观察客观、checkpoint 驱动有效、裁判可靠、带验证执行能处理难量化任务 |
| **第 4 步** | 执行轨迹 → 学习 loop 复盘 → 写回 skill | 学习/执行闭环成立 |
| **第 5 步** | Orchestrator 自动选 profile（档位 2 → 3）| 自动调度有效 |

### 关键命门

- **第 2 步**是整个项目核心假设的验证关。若收敛 profile 没能改善跑偏，需回头重新设计 `AttentionStrategy`，不要往下走。
- **第 3 步**的裁判可靠性是系统命门。必须用已知成败的任务样本单独压测裁判准确率，裁判不可靠则整个验证收敛 profile 是空中楼阁。

### 地基纪律

- 第 0 步就必须让 `LoopProfile` 从外部传入，绝不写死。哪怕只有一个 profile。
- 永远是"一个引擎 + 多个 profile"，绝不写多个 loop 函数。

---

## 12. 开放问题

### 已关闭（v0.2 解决）

- ~~**SkillContext 的具体形态**~~ → **已定**：标准 Anthropic SKILL.md 格式。加载用两层渐进式披露（name+description 索引常驻 system prompt；匹配命中的 skill 整篇 body 注入 user message）。参考 OpenHuman `skills/inject.rs` 的实现。见 §4、§6.1。
- ~~**底层操作 tool 的封装形式**~~ → **已废**：这是 v0.1 的概念错误。没有任务专用 tool layer——执行手段由 skill body 的自然语言指令决定，架构只提供 bash/文件/执行通用原语（pi-ai 工具机制）。见 §4 关键概念澄清。
- ~~**验证标准来源**~~ → **已定**：successDef（任务带）为主 + 裁判读 skill body 推断为辅；不要求 skill 带结构化验证字段。见 §6.3。

### 已关闭（v0.3 解决）

- ~~**SuccessDef 的表达格式**~~ → **已定**：`{ goal, assertions[] }`——结构化断言（带 signal 聚焦）+ 自然语言兜底，不写死匹配规则。见 §6.3。
- ~~**状态采集（OBSERVE）的位置**~~ → **已定**：拆成工作观察（skill 驱动，进 state）vs 验证观察（引擎 `StateCapture` 强制采集，进 snapshot，只给裁判）。由 §2.4 原则"skill 决定怎么做、引擎决定怎么验"化解张力。何时验由执行者的 **checkpoint 信号**触发。见 §5。
- ~~**skill 匹配机制**~~ → **已定**：匹配精度是 attention 旋钮的子维度——发散宽松匹配、收敛严格匹配（只取最相关 1 篇）。见 §6.1。

### 待后续设计决议

### 已关闭（第 0 步落地核实，2026-05-29）

- ~~**`pi-ai` 的 decide 抽象**~~ → **已核实**：
  ```
  complete(model, context) → Promise<AssistantMessage>
  context: { systemPrompt?, messages: Message[], tools?: Tool[] }
  工具调用判断：response.stopReason === "toolUse"
  工具调用提取：response.content.filter(c => c.type === "toolCall") as ToolCall[]
  ToolCall: { type, id, name, arguments: Record<string, any> }
  工具结果回填：ToolResultMessage { role:"toolResult", toolCallId, toolName, content, isError }
  文本提取：response.content.filter(c => c.type === "text").map(c => c.text)
  成本：response.usage.cost.total (USD)
  ```
  注意：`ToolResultMessage.content` 是 `(TextContent | ImageContent)[]`，访问 `.text` 前必须先收窄到 `TextContent`（`c.type === "text"`）。实际运行代码见 `packages/engine/src/index.ts`。

- ~~**checkpoint 信号的具体载体**~~ → **已确定**：用普通 `Tool` 实现，name=`"request_verification"`。引擎识别 `toolCall.name === "request_verification"` 时拦截，不走普通执行路径，而是触发 `StateCapture.capture()` + `verify`。完全符合 pi-ai 工具调用模型，执行者无法绕过（只能发 tool call）。见 §5.3 骨架代码更新待做（当前骨架的 `action.kind` 改为 `toolCall.name` 判断）。

- ~~**StateCapture 的环境实现**~~ → **方向已定，第 1 步落地**：浏览器场景用 Playwright 提供 `url/dom/visibleText/screenshot`。当前 `MockStateCapture` 已在代码中验证接口契约，第 1 步真实任务时替换为 Playwright 实现。

### §12 全部关闭

**所有设计层待决项已解决。** 后续未决事项均是"需要真实任务样本和 API key 才能验证"的执行层问题，不再是设计层问题：
- 裁判 prompt 可靠性 → 第 3 步压测
- Playwright capture 细节 → 第 1 步落地
- 真实 LLM 行为 → 需 API key

---

## 附：与参考项目的关系

| 项目 | 关系 | 借鉴点 |
|---|---|---|
| Hermes Agent | 灵感来源（其发散 loop 是"学习 loop"的范本）| 知识沉淀、会话管理 |
| OpenHuman | 架构参考 | 域模块化、事件总线、KV-cache 保护意识 |
| Pi（earendil-works）| 基础设施复用 + 设计哲学 | `pi-ai` 直接用；SKILL.md 渐进披露；"省略内置、靠组合扩展"哲学 |

参考项目详细研读见 `doc/references/`。
