# KeiGent

> **可切换 Loop 的 Agent Runtime / Operations Workbench**
>
> 同一个参数化引擎，通过 `LoopProfile` 切换成轻量对话、发散调研、精确执行、强验证执行与 workflow envelope。

TypeScript · pnpm monorepo · 基于 [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai)

---

## 目录

- [项目定位](#项目定位)
- [核心思想](#核心思想)
- [系统成熟度](#系统成熟度)
- [快速开始](#快速开始)
- [四个内置 Profile](#四个内置-profile)
- [三层结构](#三层结构)
- [Workflow Envelope](#workflow-envelope)
- [配置系统](#配置系统)
- [Eval Harness](#eval-harness)
- [Web Workbench 蓝图](#web-workbench-蓝图)
- [项目结构](#项目结构)
- [命令](#命令)
- [验收与质量门](#验收与质量门)
- [文档地图](#文档地图)
- [设计边界](#设计边界)
- [已知约束](#已知约束)

---

## 项目定位

KeiGent 不是另一个普通聊天机器人，也不是把多个 agent 随意拼在一起的图编排器。它要解决的是一个更底层的问题：

> **不同任务需要不同的 agent loop 纪律。**
>
> 开放调研需要发散注意力；精确执行需要收敛注意力；高风险/难验证任务需要外部证据；轻量闲聊不应该被塞进复杂执行循环。

因此 KeiGent 的产品形态是：

1. **Agent Runtime**：提供统一 `LoopEngine`、profile、tool registry、trajectory、workflow envelope。
2. **Skill-driven Execution Engine**：skill 负责“怎么做”，引擎负责“怎么验”。
3. **Evidence-first Agent Framework**：不把 final text 当成功证据，而是用 checkpoint、verdict、assertion、trajectory 证明。
4. **Local Agent Operations Workbench**：通过 CLI/Web/Eval/Replay 支持执行、审计、配置、回归和 skill 治理。

目标用户包括：

| 用户 | 需要 KeiGent 解决的问题 | 关键证据 |
|---|---|---|
| Agent framework builder | 用一个引擎表达多种任务纪律 | profile/event/workflow trajectory |
| 高阶自动化用户 | 浏览器/文件/shell 任务需要可控、可恢复、可验证 | checkpoint/verdict/permission trail |
| AI operator / reviewer | 想知道 agent 为什么这么做、哪里失败、证据是什么 | structured event + replay timeline |
| 内部工具团队 | 需要本地可配置、可审计、可回归的 agent runtime | doctor/eval report/redacted config |

---

## 核心思想

传统 Agent 框架往往为不同场景写多个 loop 函数：调研一个、执行一个、验证一个、聊天一个。KeiGent 反其道而行：

> **一个参数化的 Loop 引擎 + 多个 Profile，绝不写多个 loop 函数。**

每个 `LoopProfile` 由五个策略“旋钮”组合而成。换一组旋钮，同一个引擎就从“发散调研”变成“精确执行”，再变成“带独立裁判的高可信执行”，或“轻量对话”。

| 旋钮 | 接口 | 作用 |
|---|---|---|
| **attention** | `AttentionStrategy` | 每轮往上下文放什么：宽/窄 skill 匹配、记忆裁剪、工具暴露 |
| **terminate** | `TerminateStrategy` | 何时停：模型自判、skill 流程走完、结果匹配 |
| **verify** | `VerifyStrategy` | 验证强度：不验、自检、独立裁判 |
| **recover** | `RecoverStrategy` | 失败怎么办：重试、诊断修复、升级人类 |
| **memory** | `MemoryStrategy` | 是否沉淀经验：写入、只读、禁写 |

两条不可动摇的设计原则：

- **执行 loop 只读 skill、不写记忆**：执行中间状态不许回写知识库，防止污染。
- **Skill 决定怎么做，引擎决定怎么验**：skill 提供操作工作流；successDef/checkpoint/verdict 提供成功证据。

---

## 系统成熟度

KeiGent 当前已经超过“demo 能跑”的阶段，但仍然明确区分不同成熟度：

| 层级 | 名称 | 判断标准 | 不足以证明 |
|---|---|---|---|
| M0 | 可运行 | CLI 能启动，LoopEngine 能完成示例 | 产品可用、结果可信 |
| M1 | 可配置 | provider-neutral config、doctor、redaction | 执行可靠 |
| M2 | 可观测 | progress events、trajectory、dashboard view model | 成功真实 |
| M3 | 可验收 | successDef、assertion、checkpoint、eval report | 适合高风险自动化 |
| M4 | 可治理 | permission、approval、skill lifecycle、workflow policy | 所有任务自动完成 |
| M5 | 可运营 | web workbench、replay、regression suite、debuggability | SaaS 多租户能力 |

当前主线重点不是“继续做阶段性 demo”，而是补齐 **产品逻辑、证据模型、权限治理、skill 生命周期、真实世界 eval、可解释调试** 这些让系统成熟的设计与验收基线。

---

## 快速开始

前置：Node ≥ 22.19.0，pnpm ≥ 10。

> 在某些环境中 `pnpm` 不直接在 PATH 上，可以使用 `corepack pnpm ...`。

```bash
# 1. 安装依赖
corepack pnpm install

# 2. 配置 API key（复制模板后填入）
cp .env.example .env.local
# 编辑 .env.local，填入 KEIGENT_API_KEY=sk-xxx
# 可选：KEIGENT_API_PROTOCOL=openai|anthropic
# 可选：KEIGENT_BASE_URL=自定义兼容端点
# 可选：KEIGENT_MODEL_ID=模型 ID

# 3. 配置诊断（密钥会脱敏）
corepack pnpm --filter @keigent/cli start doctor
corepack pnpm --filter @keigent/cli start config show

# 4. 进入对话式 REPL
corepack pnpm --filter @keigent/cli start

# 5. 或单次执行模式（适合脚本 / CI / 管道）
corepack pnpm --filter @keigent/cli start "总结一下 https://example.com"
```

运行时默认位置：

| 数据 | 默认位置 | 说明 |
|---|---|---|
| Config | `~/.keigent/config.json` | model/apiKey/headless/maxIterations 等 |
| Skills | `~/.keigent/skills/` | 标准 SKILL.md 技能库 |
| Workspace | `~/.keigent/workspace/` | 文件工具沙箱 |
| Memory | `~/.keigent/memory/` | 记忆存储；执行 loop 默认不写 |

---

## 四个内置 Profile

| Profile | 适用场景 | 行为特征 |
|---|---|---|
| `conversational` | 闲聊、问候、能力询问、模糊意图 | 有文本即退；不验证；可调 `ask_user` 反问；动态能力清单 |
| `convergent-exec` | 有匹配 skill 的精确执行 | 窄注意力；按步骤暴露工具；自检验证；必须走完 checkpoint |
| `convergent-verified` | 难量化、高代价、高风险任务 | 收敛执行 + 独立裁判 `AdversarialJudge` 验证 |
| `divergent-research` | 开放探索、调研、信息收集 | 宽注意力；暴露更多工具；模型自判完成；允许沉淀学习建议 |

默认 `profile: "auto"`，由 Orchestrator 自动选择：

1. **规则分类（零 LLM）**：显式 profile、高置信闲聊、successDef、探索词、URL+执行词、skill 相关度评分。
2. **LLM 意图分类**：规则判不出时，在 `conversational` / `convergent-exec` / `divergent-research` 间选择。
3. **错配守卫**：如果选中 `convergent-exec` 但没有相关 skill 且没有 successDef，确定性降级，避免普通任务被硬塞进执行流程。

---

## 三层结构

```text
Orchestrator（调度层）   读任务 → 判断性质 → 选 LoopProfile
      ↓
LoopEngine（引擎层）     唯一的参数化循环骨架，行为由 LoopProfile 决定
      ↓
能力层（复用现有）        标准 SKILL.md 知识注入 + 通用工具原语（浏览器/文件/shell/...）
```

**LoopEngine** 不写死 `switch(toolName)`，而是通过 `ToolRegistry.execute` 执行工具；工具权限、审批、超时、输出截断和取消边界由 registry/policy 统一处理。

验证观察由 checkpoint 信号触发：执行者调用 `request_verification` 表示“我到了可验证节点”，引擎才运行 StateCapture + 裁判。执行者不能直接篡改验证观察。

---

## Workflow Envelope

Workflow Envelope 是 KeiGent 未来多阶段、多子运行、多验证模式的父级事实源。它不是替代 `LoopEngine` 的第二套执行器。

P0 语义：

- `single-loop`：普通一次 LoopEngine run。
- `verified-loop`：保守强验证 envelope；只聚合已有 child checkpoint/verdict evidence，不新增自由 verifier。
- child run 顺序执行，避免当前 engine callback/tool 状态隔离不足导致并发假象。
- parent 负责 budget、timeout、failure mapping、workflow trajectory。

明确不在 P0 做：

- fanout / tournament / worktree。
- dynamic LLM workflow planner。
- 自由 JS workflow 脚本。
- recursive workflows。
- 未经 policy enforcement 的 quarantine。

Workflow 的设计原则是：**先把证据、预算、失败、轨迹做成事实源，再谈更复杂的多 agent 形态。**

---

## 配置系统

KeiGent 使用**协议优先（provider-neutral）**的模型配置，不绑定特定厂商或 relay 平台：

| 字段 | 说明 | 默认值 |
|---|---|---|
| `apiKey` | LLM 密钥（必填） | 无 |
| `apiProtocol` | `openai` 或 `anthropic` | `openai` |
| `baseUrl` | 端点 URL，支持任意兼容端点 | 协议默认值 |
| `modelId` | 模型 ID | `gpt-4o-mini` |
| `workspace` | 文件工具沙箱 | `~/.keigent/workspace` |
| `skillsDir` | skill 库目录 | `~/.keigent/skills` |
| `memoryDir` | memory 目录 | `~/.keigent/memory` |
| `headless` | 浏览器是否无头 | `false` |
| `maxIterations` | 最大轮次上限 | `12` |

优先级：

```text
CLI 运行时参数 > KEIGENT_* 环境变量 > ~/.keigent/config.json > 非密钥默认值
```

安全规则：

- 不内置任何第三方 relay 的品牌入口。
- raw API key 不进入日志、UI、doctor、eval report。
- `doctor --offline` 不做网络调用。
- `doctor --online` 需要显式动作，并区分网络失败、认证失败、模型不可用。

---

## Eval Harness

Eval Harness 是 KeiGent 的工程化验收层，不新增 agent 行为，只负责：

1. 定义任务集。
2. 运行任务并收集事件与 trajectory。
3. 按验收规则评分。
4. 输出机器可读 JSON 报告。

三个运行模式：

| 命令 | 说明 |
|---|---|
| `eval:smoke` | 不调 LLM，用 smoke executor 验证 runner/report 本身 |
| `eval:replay` | 从已保存 trajectory JSON 派生结果，离线重评历史轨迹 |
| `eval:orchestrator` | 纯规则跑 fixture，验证 Orchestrator profile 选择零退化 |

EvalCase 维度：

```text
exitReasons             — 允许的退出原因列表
requiredTools           — 必须出现成功调用的工具
forbiddenTools          — 禁止使用的工具
minCheckpoints          — 最少 checkpoint 数
finalResponseIncludes   — 最终回答必须包含的字符串
expectedProfile         — 期望选中的 profile
```

失败码包括：

```text
profile_mismatch / exit_reason / tool_missing / tool_forbidden /
checkpoint_missing / output_missing / executor_error / timeout
```

重要边界：Eval pass 不等于产品完全可信；profile accuracy 不等于任务成功；tool attempted 不等于 tool succeeded；replay pass 不等于 fresh execution pass。

---

## Web Workbench 蓝图

`packages/web` 目前仍处于设计/视图模型阶段，但产品方向已经明确：它不是普通聊天 UI，而是 **Agent Operations Workbench**。

| 区域 | 用户问题 | 核心状态 |
|---|---|---|
| Run Console | 当前任务在做什么？是否可信？ | live/replay、profile、skills、tools、checkpoints |
| Trajectory Replay | 历史 run 为什么成功/失败？ | ordered events、evidence、rescore |
| Eval Dashboard | 系统有没有退化？ | smoke/orchestrator/replay reports |
| Config Center | 当前配置为什么生效？安全吗？ | source-aware config、doctor、redaction |
| Skill Library | 哪些 skill 会影响执行？ | active/draft/learning/eval coverage |

视觉原则：温暖、明亮、低饱和；避免紫色、冷蓝、黑色玻璃、AI sparkle、咖啡棕。失败、升级、未验证状态不能视觉上像成功。

---

## 项目结构

```text
packages/
├── engine/                      # @keigent/engine —— 引擎核心
│   └── src/
│       ├── types.ts             # 五旋钮、Profile、Task、Trajectory 等核心类型
│       ├── engine.ts            # LoopEngine 参数化主循环（唯一引擎）
│       ├── orchestrator.ts      # 自动调度：规则分类 + LLM 分类 + 错配守卫
│       ├── skills.ts            # SKILL.md 两层渐进式披露加载
│       ├── browser.ts           # Playwright StateCapture + BrowserSession
│       ├── trajectory.ts        # 执行轨迹收集 / 持久化 / 渲染
│       ├── learner.ts           # 学习 loop：LLM 分析轨迹 → skill patch
│       ├── skill-patch.ts       # patch 应用器 → LEARNING.md
│       ├── tool-filter.ts       # 按 profile 过滤暴露的工具集
│       ├── profiles/            # 五旋钮策略实现 + profile 工厂
│       ├── tools/               # ToolRegistry + 工具实现（浏览器/文件/shell/…）
│       ├── workflow/            # Workflow envelope types/runner/trajectory
│       ├── evals/               # Eval Harness runner、cases、replay、orchestrator eval
│       └── __tests__/           # vitest 单元测试
├── cli/                         # @keigent/cli —— REPL + 单次模式
│   └── src/
│       ├── main.ts              # 入口（bin: keigent）
│       ├── repl.ts              # 对话式 REPL（交互审批、ask_user 注入）
│       ├── run-once.ts          # 单次执行模式（非交互）
│       ├── renderer.ts          # 流式进度渲染
│       ├── config.ts            # 配置加载（resolveConfig / buildModel / redactConfig）
│       ├── config-doctor.ts     # 配置诊断
│       └── config-commands.ts   # doctor / config show 命令实现
└── web/                         # @keigent/web —— Web Workbench 视图模型阶段
    └── src/
        ├── conversation/        # 对话面板视图模型
        ├── dashboard/           # Eval dashboard 报告模型
        ├── config/              # Web 配置页 shell
        ├── shared/redaction.ts  # 前端密钥脱敏
        └── app/nav.ts           # 导航结构

skills/                          # 标准 SKILL.md mock skill 库
doc/design/                      # 架构与特性设计文档
doc/product/                     # 产品蓝图与用户体验文档
doc/evals/                       # Eval/benchmark 设计文档
doc/strategy/                    # 架构边界与非目标
doc/references/                  # 参考项目研读（hermes-agent、openhuman）
```

---

## 命令

从仓库根目录运行：

```bash
# 安装 / 构建 / 类型检查 / 测试
corepack pnpm install
corepack pnpm build
corepack pnpm check
corepack pnpm test
corepack pnpm dev

# CLI（@keigent/cli）
corepack pnpm --filter @keigent/cli start
corepack pnpm --filter @keigent/cli start "任务描述"
corepack pnpm --filter @keigent/cli start doctor
corepack pnpm --filter @keigent/cli start doctor --json
corepack pnpm --filter @keigent/cli start config show

# Engine 单项验证
corepack pnpm --filter @keigent/engine verify:attention
corepack pnpm --filter @keigent/engine verify:browser

# Eval Harness
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:replay
corepack pnpm --filter @keigent/engine eval:orchestrator

# 包级测试
corepack pnpm --filter @keigent/engine test
corepack pnpm --filter @keigent/cli test
```

REPL 内斜杠命令：`/help` `/profile <name>` `/skills` `/headed` `/headless` `/quit`。

---

## 验收与质量门

合并主线前建议至少运行：

```bash
corepack pnpm --filter @keigent/cli test
corepack pnpm --filter @keigent/engine test
corepack pnpm -r check
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
```

设计验收不只看“文档存在”，而看是否满足：

- 是否定义用户问题、边界、非目标。
- 是否有明确 success/evidence 模型。
- 是否说明失败语义和恢复策略。
- 是否包含 anti-self-deception 规则。
- 是否能转换为 eval fixture 或人工验收用例。
- 是否不破坏“一引擎多 profile”的核心边界。

---

## 文档地图

### 主架构与已实现能力

- [`doc/design/01-architecture.md`](doc/design/01-architecture.md) —— 主架构设计：五旋钮、三层结构、LoopEngine 推导
- [`doc/design/02-conversational-fallback.md`](doc/design/02-conversational-fallback.md) —— 对话兜底分支 + 分类误判修复
- [`doc/design/03-eval-harness.md`](doc/design/03-eval-harness.md) —— Eval Harness 设计与验收标准
- [`doc/design/04-web-conversation-panel.md`](doc/design/04-web-conversation-panel.md) —— Web 对话面板设计
- [`doc/design/05-web-dashboard.md`](doc/design/05-web-dashboard.md) —— Web Eval Dashboard 设计
- [`doc/design/06-cli-config-and-web-config.md`](doc/design/06-cli-config-and-web-config.md) —— CLI 与 Web 配置系统设计
- [`doc/design/07-workflow-run-envelope.md`](doc/design/07-workflow-run-envelope.md) —— Workflow Run Envelope 与 child execution evidence

### 产品与成熟度蓝图

- [`doc/product/01-product-blueprint.md`](doc/product/01-product-blueprint.md) —— 产品定位、用户、成熟度、模块地图
- [`doc/product/02-task-taxonomy-and-routing.md`](doc/product/02-task-taxonomy-and-routing.md) —— 任务分类、profile/mode/risk 路由矩阵
- [`doc/product/03-web-workbench-blueprint.md`](doc/product/03-web-workbench-blueprint.md) —— Agent Operations Workbench 信息架构
- [`doc/product/04-local-runtime-experience.md`](doc/product/04-local-runtime-experience.md) —— 本地安装、首次运行、失败体验

### 证据、治理、调试与失败语义

- [`doc/design/08-success-evidence-model.md`](doc/design/08-success-evidence-model.md) —— SuccessDef / Assertion / Evidence 成功证据模型
- [`doc/design/09-permission-risk-governance.md`](doc/design/09-permission-risk-governance.md) —— 权限、风险与人类审批治理
- [`doc/design/10-workflow-modes-product-semantics.md`](doc/design/10-workflow-modes-product-semantics.md) —— Workflow modes 产品语义与边界
- [`doc/design/11-skill-lifecycle-and-governance.md`](doc/design/11-skill-lifecycle-and-governance.md) —— Skill 生命周期与知识治理
- [`doc/design/12-agent-debuggability.md`](doc/design/12-agent-debuggability.md) —— Agent 可调试性与解释事实源
- [`doc/design/13-failure-recovery-semantics.md`](doc/design/13-failure-recovery-semantics.md) —— 失败语义与恢复策略

### Eval 与战略边界

- [`doc/evals/01-real-world-eval-suite.md`](doc/evals/01-real-world-eval-suite.md) —— 真实世界 Eval Suite 蓝图
- [`doc/strategy/01-architecture-boundaries-and-non-goals.md`](doc/strategy/01-architecture-boundaries-and-non-goals.md) —— 架构边界与非目标
- [`CLAUDE.md`](CLAUDE.md) —— 给 AI 协作者的项目指引（含 pi-ai 使用注意、已知 bug）

---

## 设计边界

KeiGent 当前必须守住的边界：

1. **一个 LoopEngine**：行为差异来自 profile，不复制多个 loop。
2. **Skill 决定怎么做**：skill 是自然语言工作流知识，不是权限豁免。
3. **Engine 决定怎么验**：successDef/checkpoint/verdict 是成功事实源。
4. **Final text 不是成功证据**。
5. **Workflow 不替代 LoopEngine**：它是 parent envelope。
6. **Eval 不新增 agent 行为**：只运行、收集、评分、报告。
7. **Verifier 默认无副作用权限**。
8. **Protocol-first model config**：不内置 relay 品牌入口。
9. **执行中间状态不污染正式知识库**。
10. **高风险副作用需要人类审批和证据**。

短期不做：自由 JS workflow、任意 fanout swarm、dynamic planner、remote multi-user SaaS、plugin marketplace、自动晋升正式 skill、无审批危险外部操作。

---

## 已知约束

- **REPL 跨轮无对话历史**：每轮输入是独立的一次 `engine.run`，多轮追问只发生在同一轮 run 内部。
- **单次模式非交互**：`ask_user` 在单次/批处理模式下无人可答，会返回降级提示让模型自行决策。
- **pi-ai gpt-5.5 并发工具调用 bug**：流式解析会把一次调用拆成两个互补 block；`utils.ts` 的 `deduplicateToolCalls` 统一合并处理。
- **Web 界面仍是设计/视图模型阶段**：`packages/web` 已有 view model、redaction 与测试，但完整可视化 UI 尚未实现。
- **Workflow P0 是保守 envelope**：不声明 fanout/tournament/dynamic planner 已可用。

---

## License

当前仓库未声明公开许可证；发布前需要补充许可证与贡献规则。
