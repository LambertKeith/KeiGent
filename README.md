# KeiGent

> 一个**可切换 Loop 的 Agent 框架** —— 同一个引擎，靠外部传入的策略组合（`LoopProfile`）表现出截然不同的行为。

TypeScript · pnpm monorepo · 基于 [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai)

---

## 核心思想

传统 Agent 框架往往为不同场景写多个 loop 函数（调研一个、执行一个、验证一个），逻辑重复且难维护。KeiGent 反其道而行：

**一个参数化的 Loop 引擎 + 多个 Profile，绝不写多个 loop 函数。**

每个 `LoopProfile` 由五个策略「旋钮」组合而成。换一组旋钮，同一个引擎就从「发散调研」变成「精确执行」，再变成「带独立裁判的高可信执行」，或「轻量对话」。

| 旋钮 | 接口 | 作用 |
|---|---|---|
| **attention** | `AttentionStrategy` | 每轮往上下文放什么（宽/窄 skill 匹配 + 记忆裁剪 + 工具暴露）|
| **terminate** | `TerminateStrategy` | 何时停（模型自判 / skill 流程走完 / 结果匹配）|
| **verify** | `VerifyStrategy` | 验证强度（不验 / 自检 / 独立裁判）|
| **recover** | `RecoverStrategy` | 失败怎么办（重试 / 诊断修复 / 升级人类）|
| **memory** | `MemoryStrategy` | 是否沉淀经验（写入 / 只读）|

两条不可动摇的设计原则：

- **执行 loop 只读 skill、不写记忆**——执行中间状态不许回写知识库，防止污染。
- **Skill 决定怎么做，引擎决定怎么验**——验证由 checkpoint 信号触发，执行者碰不到验证观察。

---

## 快速开始

前置：Node ≥ 22.19.0，pnpm ≥ 10。

```bash
# 1. 安装依赖
pnpm install

# 2. 配置 API key（复制模板后填入）
cp .env.example .env.local
#   编辑 .env.local，填入 KEIGENT_API_KEY=sk-xxx
#   可选：KEIGENT_API_PROTOCOL=openai|anthropic，KEIGENT_BASE_URL=自定义兼容端点

# 3. 进入对话式 REPL
pnpm --filter @keigent/cli start

# 或单次执行模式（适合脚本 / CI / 管道）
pnpm --filter @keigent/cli start "总结一下 https://example.com"
```

运行时配置在 `~/.keigent/config.json`（model / apiKey / headless 等）；skill 库在 `~/.keigent/skills/`；文件沙箱在 `~/.keigent/workspace/`。

---

## 四个内置 Profile

| Profile | 适用场景 | 行为特征 |
|---|---|---|
| `conversational` | 闲聊、问候、能力询问、模糊意图 | 有文本即退；不验证；可调 `ask_user` 反问澄清；动态能力清单 |
| `convergent-exec` | 有匹配 skill 的精确执行（如按 web-summarize 抓取总结）| 窄注意力、按步骤暴露工具、自检验证、必须走完 checkpoint |
| `convergent-verified` | 难量化、高代价任务 | 同上，但用**独立裁判**（AdversarialJudge，调 LLM）做验证 |
| `divergent-research` | 开放探索、调研、信息收集 | 宽注意力、暴露全部工具、模型自判完成、沉淀记忆 |

**自动调度**：默认 `profile: "auto"`，由 Orchestrator 自动选择——先走零 LLM 的规则分类（档位 2），规则判不出再升级到 LLM 意图分类（档位 3）。也可在 REPL 用 `/profile <name>` 手动强制。

---

## 三层结构

```
Orchestrator（调度层）   读任务 → 判断性质 → 选 LoopProfile
      ↓
LoopEngine（引擎层）     唯一的参数化循环骨架，行为由 LoopProfile 决定
      ↓
能力层（复用现有）        标准 SKILL.md 知识注入 + 通用工具原语（浏览器/文件/shell/...）
```

**Orchestrator** 用两档分类选 profile：

1. **规则分类（零 LLM）**——按硬信号判断：显式 profile → 高置信度闲聊 → successDef → 探索词 → URL+执行词 → skill 相关度评分。判不出返回 `null`。
2. **LLM 意图分类**——规则判不出时，让 LLM 在 `conversational` / `convergent-exec` / `divergent-research` 间选。
3. **错配守卫（`guardProfileChoice`）**——任何来源选中 `convergent-exec` 但任务既无匹配 skill 又无 successDef 时，确定性改走 `divergent-research`，避免通用任务被硬塞进需要凑 checkpoint 的执行流程。

**LoopEngine** 是唯一的循环骨架。它不写死 `switch(toolName)`，而是通过 `ToolRegistry.execute` 执行工具；行为完全由传入的 `LoopProfile` 决定。验证观察由 checkpoint 信号触发——执行者调 `request_verification` 工具表示「我到了可验证节点」，引擎才运行 StateCapture + 裁判，执行者碰不到验证数据。

---

## 命令

从仓库根目录运行：

```bash
pnpm install          # 安装所有依赖
pnpm check            # TypeScript 类型检查（所有包）
pnpm test             # 运行单元测试（vitest）
pnpm dev              # 运行 @keigent/engine demo（需 KEIGENT_API_KEY）

# CLI（@keigent/cli）—— agent 的实际入口
pnpm --filter @keigent/cli start                 # 对话式 REPL
pnpm --filter @keigent/cli start "任务描述"        # 单次执行模式

# 验收脚本（不调 LLM 的快速验证）
pnpm --filter @keigent/engine verify:attention   # attention 注入篇数
pnpm --filter @keigent/engine verify:browser     # 浏览器 snapshot+ref
```

REPL 内斜杠命令：`/help` `/profile <name>` `/skills` `/headed` `/headless` `/quit`。

环境变量：复制 `.env.example` 为 `.env.local`，填入 `KEIGENT_API_KEY`。可选设置 `KEIGENT_API_PROTOCOL=openai|anthropic` 和 `KEIGENT_BASE_URL` 指向任意兼容端点。

---

## 项目结构

```
packages/
├── engine/                      # @keigent/engine —— 引擎核心
│   └── src/
│       ├── types.ts             # 所有接口（五旋钮、Profile、Task、Trajectory…）
│       ├── engine.ts            # LoopEngine 参数化主循环（唯一引擎）
│       ├── orchestrator.ts      # 自动调度：规则分类 + LLM 分类 + 错配守卫
│       ├── skills.ts            # SKILL.md 两层渐进式披露加载
│       ├── browser.ts           # Playwright StateCapture + BrowserSession
│       ├── trajectory.ts        # 执行轨迹收集 / 持久化 / 渲染
│       ├── learner.ts           # 学习 loop：LLM 分析轨迹 → skill patch
│       ├── skill-patch.ts       # patch 应用器 → LEARNING.md
│       ├── tool-filter.ts       # 按 profile 过滤暴露的工具集
│       ├── profiles/            # 五旋钮策略实现 + 四个 profile 工厂
│       ├── tools/               # ToolRegistry + 工具实现（浏览器/文件/shell/…）
│       └── __tests__/           # vitest 单元测试
└── cli/                         # @keigent/cli —— REPL + 单次模式
    └── src/
        ├── main.ts              # 入口（bin: keigent）
        ├── repl.ts              # 对话式 REPL（交互审批、ask_user 注入）
        ├── run-once.ts          # 单次执行模式（非交互）
        ├── commands.ts          # 斜杠命令
        ├── renderer.ts          # 流式进度渲染
        └── config.ts            # ~/.keigent/config.json 加载

skills/                          # 标准 SKILL.md mock skill 库
doc/design/                      # 架构与特性设计文档
doc/references/                  # 参考项目研读（hermes-agent、openhuman）
```

---

## 文档

- [`doc/design/01-architecture.md`](doc/design/01-architecture.md) —— 主架构设计（五旋钮、三层结构的完整推导）
- [`doc/design/02-conversational-fallback.md`](doc/design/02-conversational-fallback.md) —— 对话兜底分支 + 分类误判修复设计
- [`CLAUDE.md`](CLAUDE.md) —— 给 AI 协作者的项目指引（含 pi-ai 使用注意、已知 bug）

---

## 测试

单元测试用 [vitest](https://vitest.dev/)，全部零 LLM 调用、确定性：

```bash
pnpm --filter @keigent/engine test
```

覆盖：Orchestrator 规则分类与错配守卫、闲聊识别、`ConversationalAttention` 行为、`WideAttention` 相关度匹配。

---

## 已知约束

- **REPL 跨轮无对话历史**——每轮输入是独立的一次 `engine.run`，多轮追问只发生在同一轮 run 内部（模型调 `ask_user` → REPL 弹问 → 答案回到同一 loop）。
- **单次模式非交互**——`ask_user` 在单次/批处理模式下无人可答，返回降级提示让模型自行决策。
- **pi-ai gpt-5.5 并发工具调用 bug**——流式解析会把一次调用拆成两个互补 block；`utils.ts` 的 `deduplicateToolCalls` 统一合并处理，所有调 LLM 的地方都走 `extractToolCalls`。详见 [`CLAUDE.md`](CLAUDE.md)。
