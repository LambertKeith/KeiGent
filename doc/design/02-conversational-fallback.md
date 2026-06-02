# 设计文档：对话兜底分支 + 分类误判修复

> 状态：已评审通过，待实现
> 日期：2026-06-03
> 关联：`doc/design/01-architecture.md`（主架构）

---

## 1. 背景与问题

### 1.1 现象

在 REPL 中输入闲聊（如「你好」），agent 会连续迭代 6 轮、反复触发验证失败，最终以 `escalated`（升级人类）退出：

```
◆ profile convergent-exec (rule)
  迭代 1  💬 你好！有什么我可以帮你的吗？
  迭代 3  ⚙ request_verification  →  裁判 ✗ SelfCheck: 快照无可观测状态
  迭代 4  ⚙ request_verification  →  裁判 ✗ SelfCheck: 快照无可观测状态
  迭代 6  ⚠ 升级人类: 连续 3 次失败
◆ 完成 (escalated)
```

整个过程没有任何代码崩溃，`escalated` 是设计内的正常退出。问题在于**任务被错误分类**：闲聊被判成了「网页抓取执行任务」。

### 1.2 根因分析

**根因 A —— 规则 4 命中条件写错（`orchestrator.ts:93-100`）**

```ts
const matchedSkill = metas.find((m) =>
  task.goal.toLowerCase().includes(m.name) ||
  executionSkillVerbs.some((v) => m.description.toLowerCase().includes(v)),  // ← bug
);
```

后半个条件检查的是「**技能库里有没有**执行类 skill」，与任务本身无关。技能库里 `web-summarize`（描述含 fetch）、`data-extract`（描述含 extract）一直存在，于是**任何输入**——包括「你好」——都命中规则 4，被判为 `convergent-exec`。

**根因 B —— 缺少闲聊/对话兜底分支**

`convergent-exec` 是为「抓网页 → 总结 → 验证」硬编码的：固定步骤（fetch_url → 输出文本 → request_verification），终止条件 `SkillWorkflowDone(2)` 且 `allowEarlyTextExit=false`（光输出文本不算完，必须攒够 2 个通过的 checkpoint）。

闲聊产生不出任何可观测页面状态，于是：
- 模型输出问候文本 → `allowEarlyTextExit=false`，文本不算数，引擎推进步骤逼它继续；
- 模型被逼调 `request_verification` → 引擎强制采集快照 → 无 url/无文本 → `SelfCheck` 判不通过（`strategies.ts:314-317`）；
- 连续失败 3 次 → `SimpleRetry(3)` 触发 `escalate`。

### 1.3 一个连带发现：`ask_user` 链路是断的

`ask_user` 工具已注册（`agentTools`），但依赖 `ctx.askUser` 回调注入。`engine.ts` 构建 `toolCtx`（71-77 行）时未填该字段，`repl.ts` 也未传入。因此模型即便调用 `ask_user`，只会走 `if (!ctx.askUser)` 分支返回「非交互模式，请自行决策」——**追问能力当前不可用**。要让对话兜底真正能「追问澄清」，这条链路必须补上。

### 1.4 一个约束：REPL 跨轮无对话历史

REPL 每轮输入都是独立的一次 `engine.run`，`state.messages` 每次从空开始（`engine.ts:89-97`）。这意味着「追问」只能发生在**同一轮 run 内部**（模型调 `ask_user` → REPL 弹问 → 答案回到同一个 loop），而非跨多次回车记住上文。本设计不改变这一约束。

---

## 2. 方案概览

四处改动，全部复用现有机制，**不改引擎主循环结构**：

```
   用户输入 "你好"  ───▶  Orchestrator.classifyByRules
                          ① 修规则4：复用 scoreSkill 评分          ← 改动A
                          ② 加规则0.5：高置信度闲聊 → conversational ← 改动B（快路径）
                          ③ 判不出 → 升级 LLM（选项含 conversational）← 改动B（兜底）
                                    ▼
                        makeConversationalProfile（新）            ← 改动C
                          ConversationalAttention（不注入skill、不移除工具、动态能力清单）
                          + ModelSelfJudge(allowEarlyTextExit=true)
                          + NoVerify + SimpleRetry(2) + NoWrite
                                    ▼
                        LoopEngine.run（不改结构）
                          + 补 ctx.askUser 注入链路                ← 改动D
```

| 改动 | 文件 | 内容 |
|---|---|---|
| A | `orchestrator.ts` | 规则 4 改为复用 `scoreSkill`，按任务真实相关度判断 |
| B | `orchestrator.ts` | 规则层加 `isObviousChitchat` 快路径 + LLM 分类器新增 `conversational` 选项 |
| C | `profiles/conversational.ts`、`strategies.ts` | 新 profile + 新 `ConversationalAttention` 类 |
| D | `engine.ts`、`repl.ts` | 接通 `ask_user` 追问链路 |

**范围边界**：单次模式（`run-once.ts`）按设计无人值守，不接 `ask_user`，模型调用时走「非交互模式，请自行决策」降级分支（见 §6）；分类修复对单次模式同样生效。学习 loop 不变——对话 profile 用 `NoWrite` 且不匹配 skill，`skillsUsed` 为空，自然不触发学习。

---

## 3. 改动 A：修复规则 4 的误判

把「库里有执行 skill」改为「该任务对某 skill 真实相关」，复用 `strategies.ts` 已有的中英鲁棒评分 `scoreSkill`：

```ts
// orchestrator.ts，规则 4
// 旧：metas.find(m => goal.includes(m.name) || verbs.some(v => m.description.includes(v)))
// 新：按任务对每个 skill 打分，只有真实相关（score >= 阈值）才算匹配
const SKILL_MATCH_THRESHOLD = 2;
const best = metas
  .map((m) => scoreSkill(m, task.goal))
  .reduce((a, b) => Math.max(a, b), 0);
if (best >= SKILL_MATCH_THRESHOLD) {
  return "convergent-exec";
}
```

- `scoreSkill` 已在 `strategies.ts:50-88` 实现并被 attention 层使用，但当前是**模块私有**，需新增 `export` 供 orchestrator 调用。复用它保证 orchestrator 与 attention 的匹配判断一致。
- 阈值 2：`scoreSkill` 中 `tags` 命中得 +2、`name` 整词命中 +10、description 弱命中仅 +1。设为 2 可滤掉「仅 description 弱命中一个英文词」这类噪声。
- **验证点**：「你好」对 `web-summarize`、`data-extract` 均无 name/tags/概念命中，`scoreSkill` 返回 0 < 2，不再被规则 4 吸入——这正是根因 A 的修复确认。

---

## 4. 改动 B：闲聊识别（规则快路径 + LLM 意图兜底）

分两层，与现有「档位 2 规则 / 档位 3 LLM」同构。

### 4.1 第一层：规则快路径（零 LLM）

只拦**高置信度**纯问候/感谢，从严匹配（整句 `$` 锚定）：

```ts
function isObviousChitchat(task: Task): boolean {
  if (task.successDef) return false;
  const goal = task.goal.trim();
  if (/https?:\/\//.test(goal) || goal.length > 20) return false;  // 有URL/偏长 → 交后续
  return [
    /^(你好|您好|hi|hello|hey|嗨|在吗|早|晚上好)[\s!！。.~]*$/i,
    /^(谢谢|感谢|thanks|thank\s?you|好的|ok|okay|拜拜|再见|bye)[\s!！。.~]*$/i,
  ].some((p) => p.test(goal));
}
```

设计取舍：快路径**故意收得很严**——只抓最高频最确定的问候/感谢，漏判没关系，会落到第二层 LLM 兜底。这样既省掉最常见问候的 LLM 开销，又不会因为贪多而误吞短任务（如「抓取X」）。

### 4.2 第二层：LLM 意图兜底

快路径没拦住、现有任务规则（successDef / 探索词 / URL+执行词 / scoreSkill）也判不出的输入，降级到 `classifyByLLM`。改动两处：

1. `select_profile` 工具的 `profile` 枚举**新增 `conversational`**（连同 `divergent-research`、`convergent-exec`）。
2. system prompt 增加一行定义：
   > `conversational`：闲聊、问候、感谢、询问你的能力、或没有明确可执行目标的对话。

这样「今天天气不错」「你觉得呢」这类正则永远覆盖不全的输入，靠 LLM 判意图兜住。

### 4.3 判定顺序（`classifyByRules` 内）

规则0 显式 profile → **规则0.5 `isObviousChitchat`** → 规则1 successDef → 规则2 探索词 → 规则3 URL+执行词 → 规则4（修正后 scoreSkill）→ 返回 null → 升级 LLM（选项含 conversational）。

用户用 `/profile` 显式指定时（规则 0）仍优先尊重用户。

---

## 5. 改动 C：`conversational` profile

### 5.1 为什么需要新的 Attention 类

复用 `WideAttention` 有坑：它的 `markToolUsed` 会把用过的工具从下一轮移除（`strategies.ts:227-231`），只豁免 `request_verification`，**没豁免 `ask_user`**。对话场景下模型第一次追问后 `ask_user` 就被摘掉，无法再次追问。因此新建一个职责单一的 `ConversationalAttention`，而非给 `WideAttention` 加分支。

### 5.2 `ConversationalAttention`（新增于 `strategies.ts`）

```ts
export class ConversationalAttention implements AttentionStrategy {
  constructor(private readonly systemPromptBase: string) {}
  reset(): void {}                          // 无可变状态

  matchSkills(): string[] { return []; }    // 不匹配 skill → skillsUsed 为空 → 不触发学习
  async renderInjection(): Promise<string> { return ""; }  // 不注入 skill body

  buildContext(state, skillContext, availableTools): Promise<Context> {
    // 关键1：每轮都给全量（已过滤的）工具，绝不移除 ask_user —— 支持多次追问
    // 关键2：把 skill 索引（name+description）注入 system prompt —— 动态能力清单
    const systemPrompt = [
      this.systemPromptBase,
      "## 你能帮用户做的事\n" + renderSkillIndex(skillContext.metas),
    ].join("\n\n");
    return Promise.resolve({ systemPrompt, messages: state.messages, tools: availableTools });
  }
}
```

**动态能力清单**：能力不写死，复用现有 `renderSkillIndex(metas)`（输出每个 skill 的 name + description）。新增/删除 skill 时清单自动跟随，用户问「你能做什么」时模型读的是实时 skill 索引，答得准且永不过时。

### 5.3 五旋钮组合（`profiles/conversational.ts`，新增）

| 旋钮 | 实现 | 理由 |
|---|---|---|
| attention | `ConversationalAttention`（新） | 不注入 body、全量工具不移除、注入动态 skill 索引 |
| terminate | `ModelSelfJudge`（`allowEarlyTextExit=true`） | 有文本就退，根治死循环 |
| verify | `NoVerify` | 闲聊无客观状态可验 |
| recover | `SimpleRetry(2)` | 兜底，NoVerify 下几乎不触发 |
| memory | `NoWrite` | 不沉淀，防污染 |

### 5.4 工具暴露：仅 `ask_user` + 只读工具

对话 profile 暴露的工具集**限定为 `ask_user` + 只读类**（`fetch_url`、`memory_recall` 等 `permission === "readonly"` 的工具），不含 write / execute / dangerous。模糊意图能追问、安全只读动作能即时响应；写文件 / shell 这类有副作用的操作留给正经任务 profile（convergent / divergent）。

过滤在调用方（`repl.ts`）完成，profile 本身不感知 registry，保持解耦。具体落点见 §5.5。

### 5.5 工具过滤的落点

`engine.run` 接收 `availableTools`，由 CLI 侧 `registry.toPiAiTools()` 提供。在 `repl.ts` 选定 profile 后：若为 `conversational`，按 `permission === "readonly" || name === "ask_user"` 过滤 `registry` 工具列表，把子集传入 `engine.run`；其它 profile 仍传全量工具。`registry` 已带 `permission` 元数据，过滤无需新接口。

### 5.6 system prompt 基底

> 你是 KeiGent，一个可切换策略的 AI agent，当前处于日常对话。简洁友好地回应。如果用户意图模糊、或像是想让你做事但说得不具体，调用 `ask_user` 反问澄清，不要空猜。下面列出了你能帮用户做的事。

（能力清单不写在基底里，由 `ConversationalAttention` 用 `renderSkillIndex` 动态拼接，见 §5.2。）

---

## 6. 改动 D：接通 `ask_user` 追问链路

把 readline 的提问能力从 CLI 一路传到工具上下文，分三段：

1. **`EngineOptions` 增加可选字段** `askUser?: (q: string) => Promise<string>`；`engine.ts` 构建 `toolCtx` 时填充 `askUser: this.askUser`。
2. **`repl.ts` 传回调**（REPL 已持有 `rl`）：
   ```ts
   const engine = new LoopEngine({ ...,
     askUser: async (q) => (await rl.question(`${c.yellow}? ${q}${c.reset}\n  ❯ `)).trim(),
   });
   ```
3. **`run-once.ts`（单次模式）不传** → `ctx.askUser` 为 `undefined` → 工具走已有的「非交互模式，请基于现有信息自行决策」分支。这是合理降级：批处理无人值守，弹问无人可答，报错退出反而中断脚本。

**交互冲突处理**：REPL 用 `renderProgress` 流式打印迭代过程，`ask_user` 又用 `rl.question` 读输入，两者都占 stdout。但时序上不重叠——`registry.execute` 执行 `ask_user` 时是 `await` 阻塞，引擎暂停、无并发打印。同一个 `rl` 提问安全。问句前留一个空行，与进度树视觉分开。

### 6.1 错误处理边界

- **模型空输出**：`ModelSelfJudge` + 引擎现有逻辑（`engine.ts:155-156`）已覆盖——无文本无工具时返回 `error: 模型无输出`。
- **用户空答**（`ask_user` 时直接回车）：`rl.question` 返回空串，工具回 `用户回答:`（空），模型据此自行决定继续问或给泛回应，不崩。
- **`ask_user` 被滥用**（每轮都问不结束）：`maxIterations`（默认 10）是硬上限；且 `allowEarlyTextExit=true` 意味着模型一旦输出文本即退出，死循环风险极低。

---

## 7. 测试方案

引入 **vitest** 单元测试框架（项目当前无测试框架，新增基础设施，用 pnpm 安装）。在 `packages/engine` 加 `vitest` devDependency 和 `test` 脚本。三个单元做细粒度断言，**全部零 LLM 调用**：

| 被测单元 | 断言要点 |
|---|---|
| `isObviousChitchat` | 「你好」「谢谢」→ true；「抓取X」「带URL任务」「超20字」→ false；边界（空串、纯标点） |
| `classifyByRules`（修正后） | 规则4 用 scoreSkill：无关任务 + 有执行 skill → 不再误判；真匹配任务 → convergent-exec；闲聊 → conversational；判不出 → null（触发 LLM） |
| `ConversationalAttention` | matchSkills 返回 `[]`；renderInjection 返回空；buildContext 每轮都含全部允许工具（`ask_user` 不被移除）、system prompt 含动态 skill 索引 |

`classifyByLLM` 的 conversational 分支涉及真实 LLM，不进单测，留给 verify 阶段手动实测一次（「你好」走 conversational 且不再死循环）。

---

## 8. 文件落点

```
packages/engine/
├── src/
│   ├── profiles/
│   │   ├── conversational.ts        ← 新增：makeConversationalProfile
│   │   └── strategies.ts            ← 改：新增 ConversationalAttention；导出 scoreSkill
│   ├── orchestrator.ts              ← 改：规则0.5 isObviousChitchat + 修规则4 +
│   │                                       LLM 选项加 conversational + 注册表加 conversational
│   ├── engine.ts                    ← 改：EngineOptions 加 askUser，toolCtx 填充
│   └── __tests__/                   ← 新增：orchestrator / attention 单测
├── package.json                     ← 改：加 vitest + test 脚本
packages/cli/
├── src/
│   ├── repl.ts                      ← 改：传 askUser 回调 + conversational 工具集过滤（只读）
│   └── commands.ts                  ← 改：/profile 加 conversational 选项
```

所有文件在 700 行限制内；`strategies.ts` 当前 406 行，加 ~25 行的 `ConversationalAttention` 仍安全。

---

## 9. 决策记录

| 决策点 | 选择 |
|---|---|
| 对话兜底行为 | 直答 + 可追问澄清（能调 `ask_user` 把闲聊引导成任务） |
| 意图判定位置 | 混合：规则快路径（零 LLM）+ LLM 意图兜底 |
| 规则 4 修法 | 复用 `scoreSkill` 评分，按任务真实相关度判断 |
| 承载方式 | 新增 `makeConversationalProfile`，复用五旋钮 |
| 能力清单 | 动态生成（`renderSkillIndex`），不写死 |
| 工具暴露 | `ask_user` + 只读工具（不含 write/execute/dangerous） |
| 单次模式 `ask_user` | 维持非交互降级（不报错退出） |
| 手动强制 | 支持 `/profile conversational` |
| 测试 | 引入 vitest 单元测试框架 |
| Attention 复用 | 新建 `ConversationalAttention`（`WideAttention` 会移除 `ask_user`，不可复用） |
