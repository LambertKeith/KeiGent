# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目定位

KeiGent 是一个**可切换 Loop 的 Agent 框架**（TypeScript，pnpm monorepo）。

核心设计思想：同一个 Loop 引擎，通过外部传入的 `LoopProfile`（五个策略旋钮的组合）表现出截然不同的行为——调研场景走发散 profile，执行场景走收敛 profile，难量化任务走带独立裁判验证的 profile。详细设计见 `doc/design/01-architecture.md`。

---

## 命令

从仓库根目录运行：

```bash
pnpm install          # 安装所有依赖
pnpm check            # TypeScript 类型检查（所有包）
pnpm dev              # 运行 @keigent/engine demo（tsx src/index.ts）

# CLI（@keigent/cli）—— agent 的实际入口
pnpm --filter @keigent/cli start                       # 进入对话式 REPL
pnpm --filter @keigent/cli start "任务描述"             # 单次执行模式

# 验收脚本（不调 LLM 的快速验证）
pnpm --filter @keigent/engine verify:attention         # S1: attention 注入篇数
pnpm --filter @keigent/engine verify:browser           # B1: 浏览器 snapshot+ref
pnpm --filter @keigent/engine exec tsx src/verify-tools.ts  # B3/B4: 文件/shell/memory
```

配置在 `~/.keigent/config.json`（model/apiKey/headless 等）；skill 库在 `~/.keigent/skills/`；文件沙箱在 `~/.keigent/workspace/`。

在 `packages/engine/` 内单独运行：

```bash
pnpm check            # tsc --noEmit
pnpm dev              # tsx src/index.ts（需 KEIGENT_API_KEY 环境变量）
pnpm build            # tsc（输出到 dist/）
```

环境变量：复制 `.env.example` 为 `.env.local` 并填入 `KEIGENT_API_KEY`；可选设置 `KEIGENT_API_PROTOCOL=openai|anthropic` 和自定义 `KEIGENT_BASE_URL`。

---

## 架构

### 目录结构

```
packages/engine/src/
├── types.ts            # 所有接口（旋钮、Profile、Task、Trajectory、SkillPatch 等）
├── engine.ts           # LoopEngine 参数化主循环（唯一的引擎，行为由 LoopProfile 决定）
├── orchestrator.ts     # 自动调度：规则分类（档位2）+ LLM 分类降级（档位3）
├── skills.ts           # SKILL.md 两层渐进式披露加载
├── browser.ts          # 真实 Playwright StateCapture + fetch_url 工具实现
├── trajectory.ts       # 执行轨迹收集、持久化、渲染
├── learner.ts          # 学习 loop：LLM 分析轨迹 → submit_skill_patches
├── skill-patch.ts      # patch 应用器 → LEARNING.md
├── profiles/
│   ├── strategies.ts   # 五个旋钮的策略实现（NarrowAttention、WideAttention 等）
│   ├── convergent-exec.ts
│   └── divergent-research.ts
└── index.ts            # 全量闭环演示入口

skills/
├── web-summarize/
│   ├── SKILL.md        # 标准格式 mock skill
│   └── LEARNING.md     # 学习 loop 自动写入的执行经验（自动生成）
└── .trajectories/      # 执行轨迹 JSON 存档（自动生成）

doc/design/             # 架构设计文档（01-architecture.md 是主文档）
doc/references/         # 参考项目研读（hermes-agent、openhuman）
```

当前 `packages/engine/src/index.ts` 是全量闭环演示入口，跑通了 Orchestrator → LoopEngine → Trajectory → Learner → LEARNING.md 完整链路。

### 三层结构

```
Orchestrator（调度层）   读任务 → 判断性质 → 选 LoopProfile
      ↓
LoopEngine（引擎层）     唯一的参数化循环骨架，行为由 LoopProfile 决定
      ↓
能力层（复用现有）        标准 SKILL.md 知识注入 + 通用工具原语（bash/文件/执行）
```

### 核心设计原则

**一个引擎 + 多个 profile，绝不写多个 loop 函数。** LoopProfile 由五个策略旋钮组合而成：

| 旋钮 | 接口 | 作用 |
|---|---|---|
| attention | `AttentionStrategy` | 控制每轮往上下文放什么（宽/窄 skill 匹配 + 记忆裁剪）|
| terminate | `TerminateStrategy` | 终止条件（模型自判/skill 走完/结果匹配）|
| verify | `VerifyStrategy` | 验证强度（无/自检/独立裁判）|
| recover | `RecoverStrategy` | 失败恢复（重试/诊断修复/升级人类）|
| memory | `MemoryStrategy` | 记忆沉淀（写入/只读）|

**执行 loop 不写记忆，只读 skill。** 执行中间状态不许沉淀回知识库，防止污染。

**Skill 决定怎么做，引擎决定怎么验。** 状态观察分两种：工作观察（执行者按 skill 指示发起）和验证观察（引擎强制采集，执行者碰不到）。验证由 checkpoint 信号触发——执行者调 `request_verification` 工具表示"我认为到了可验证节点"，引擎收到后才运行 StateCapture + AdversarialJudge。

### pi-ai 使用注意

底层依赖 `@earendil-works/pi-ai`（v0.77.0，MIT）。自定义端点直接构造 `Model<Api>` 对象，不用 `getModel()`（后者只接受 KnownProvider）。KeiGent 配置层按协议区分 `openai` / `anthropic`，再映射到 `openai-completions` / `anthropic-messages`。

**已知 bug**：pi-ai 流式解析 gpt-5.5 并发工具调用时，会把一次调用拆成两个互补的 block——一个有 id/name 但 args 空，一个 args 有内容但 id/name 空。`utils.ts` 的 `deduplicateToolCalls` 统一**合并**这两个 block（取有 id 的元数据 + 有内容的 args），所有调用 LLM 的地方（engine/learner/orchestrator/adversarial-judge）都通过 `extractToolCalls` 走这个统一处理，不要各自手写过滤。

---

## 当前进度

- **第 0 步**：✅ pi-ai 类型签名核实，协议兼容端点的工具调用链路跑通，checkpoint 机制验证。
- **第 1 步**：✅ 五旋钮引擎（`engine.ts`）+ 两个基线 profile + mock skill（`skills/web-summarize/`）。
- **第 2/3 步**：✅ 真实 Playwright（系统 Chrome）接入，两个 profile 行为差异验证，`allowEarlyTextExit` 语义设计成立。
- **第 4 步**：✅ 执行轨迹（`trajectory.ts`）→ 学习 loop LLM 分析（`learner.ts`）→ LEARNING.md 自动写入（`skill-patch.ts`）全量闭环。
- **第 5 步**：✅ Orchestrator 自动调度（`orchestrator.ts`）——规则分类（档位 2）+ LLM 分类降级（档位 3），`profile: "auto"` 不再需要手动指定。
- **验收修复**：✅ 三个 profile 与 spec §7.1 对齐；skill body 注入移入 attention 旋钮；profile 实例 `reset()` 防复用污染；skill 匹配支持中英跨语言 + tags。
- **第 6 步**：✅ 对话兜底 + 分类健壮性（设计见 `doc/design/02-conversational-fallback.md`）：
  - 新增 `conversational` profile（`profiles/conversational.ts` + `ConversationalAttention`）——闲聊/问候/能力询问走轻量对话，有文本即退，可调 `ask_user` 反问，动态能力清单。修复闲聊「你好」被误判成 convergent-exec 死循环升级。
  - 闲聊识别两层：规则快路径 `isObviousChitchat`（零 LLM）+ LLM 意图兜底（分类器加 `conversational` 选项）。
  - 修规则 4：从「库里有执行 skill」改为复用 `scoreSkill` 按任务真实相关度判断（阈值 2）。
  - `guardProfileChoice` 错配守卫：选中 convergent-exec 但无匹配 skill/successDef 时确定性改走 divergent-research——修复通用任务（如查天气）被硬塞执行流程导致的啰嗦/吐空崩溃。
  - `WideAttention.matchSkills` 收紧为 `rankSkills`（只匹配相关 skill）——防通用任务误触发学习 loop 污染知识库。
  - `ask_user` 注入链路接通（`EngineOptions.askUser` → `toolCtx`）+ `toolsForProfile` 按 profile 过滤工具（对话只给 ask_user + 只读）。
  - 引入 vitest 单元测试（`__tests__/`，零 LLM），覆盖分类、守卫、attention 行为。

### 工具集 + CLI（让 KeiGent 成为可用 agent）

- **B0 ToolRegistry**：✅ 工具与引擎解耦（`tools/registry.ts`）——引擎不再 `switch(toolName)`，改为 `registry.execute`。含权限模型（readonly/write/execute/dangerous）、审批门、超时、输出截断。
- **B1 浏览器工具**：✅ snapshot+ref 范式（`tools/impl/browser.ts` + `browser.ts` 的 `BrowserSession`）——`browser_snapshot` 给可交互元素打 ref 编号，`browser_click({target:"e3"})` 用编号点击，不猜坐标。9 个工具，headed/headless 可配置。
- **B2 CLI**：✅ `@keigent/cli` 包——对话式 REPL + 单次模式（`keigent "任务"`），流式渲染（引擎 `onProgress` 回调发 `ProgressEvent`），斜杠命令，配置加载。引擎内部日志默认静音（`logger.ts` 的 `setVerbose`），只发事件。
- **B3 文件/网络/shell**：✅ `file_read/write/list/grep`（workspace 沙箱，拒绝路径逃逸）、`shell`（env 过滤+超时+输出上限）、`http_request`。
- **B4 电脑操作/memory**：✅ `mouse/keyboard/screenshot`（nut.js，`dangerous` 权限走审批门，懒加载防无权限崩溃，默认不注册需 `includeComputer`）、`memory_recall`、`ask_user`（CLI 注入交互）。

### 验收脚本（不调 LLM 的快速验证）

| 脚本 | 验证 |
|---|---|
| `verify:attention` | attention 旋钮真正控制 skill body 注入篇数（核心假设物理基础）|
| `verify:browser` | snapshot+ref+click 真实多步浏览器流程 |
| `src/verify-tools.ts` | 文件沙箱、shell、http、memory、ask_user、computer 注册 |
