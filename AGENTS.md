# AGENTS.md

本文件是 KeiGent 仓库的 AI 协作者入口。每个任务开始时必须读取本文件，并按这里的项目事实与工作规则执行。

---

## 1. 协作者硬规则

- **语言**：所有面向用户的回复使用简体中文。
- **模型声明**：每个任务开始时先说明当前模型名称，并确认已读取本文件。
- **先查再改**：涉及接口、命令、架构事实时，优先查询本地源码和文档，不凭记忆猜。
- **主动验证**：代码或命令行为变更必须补/跑对应测试；文档入口变更必须跑 grep 或链接检查等可复现验证。
- **保护用户改动**：可能存在用户未提交改动。不得回退、覆盖或删除非本任务改动。
- **数据库安全**：禁止删除数据库、表或数据。数据库 schema 变更必须走显式迁移；迁移文件绝对禁止修改。
- **文件规模**：新增或重写代码文件尽量控制在 700 行以内，按职责拆分。

---

## 2. 项目定位

KeiGent 是一个 **skill-driven、profile-switchable、evidence-first 的 Agent Runtime / Operations Workbench**，TypeScript + pnpm monorepo。

核心命题：

> 不同任务需要不同的 agent loop 纪律。

当前架构不复制多个 loop；系统只有一个 `LoopEngine`，行为差异由 `LoopProfile` 的五个策略旋钮控制：

| 旋钮 | 作用 |
|---|---|
| attention | 注入哪些 skill、memory、历史和工具 |
| terminate | 何时停止 |
| verify | 如何验证 checkpoint/assertion |
| recover | 失败后 retry/repair/escalate |
| memory | 是否沉淀经验 |

主事实源：

- 系统总览：[`doc/design/00-system-overview.md`](doc/design/00-system-overview.md)
- 当前架构事实源：[`doc/design/01-architecture.md`](doc/design/01-architecture.md)
- 产品蓝图：[`doc/product/01-product-blueprint.md`](doc/product/01-product-blueprint.md)
- 架构边界：[`doc/strategy/01-architecture-boundaries-and-non-goals.md`](doc/strategy/01-architecture-boundaries-and-non-goals.md)

---

## 3. 常用命令

从仓库根目录运行。推荐显式使用 `corepack pnpm ...`，避免目标环境中裸 `pnpm` 不在 PATH。

```bash
# 依赖
corepack pnpm install

# 根级质量门
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build

# 本地开发入口
corepack pnpm --filter @keigent/engine dev
corepack pnpm --filter @keigent/cli start
corepack pnpm --filter @keigent/cli start "任务描述"

# 配置与诊断
corepack pnpm --filter @keigent/cli start doctor
corepack pnpm --filter @keigent/cli start doctor --json
corepack pnpm --filter @keigent/cli start doctor --compact
corepack pnpm --filter @keigent/cli start config show
corepack pnpm --filter @keigent/cli start config show --json
corepack pnpm --filter @keigent/cli start config show --compact

# Eval / replay
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/eval-replay.test.ts
corepack pnpm --filter @keigent/cli start eval smoke --compact
corepack pnpm --filter @keigent/cli start eval orchestrator --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
corepack pnpm --filter @keigent/cli start replay /path/to/trajectory.json --compact

# 单项验收
corepack pnpm --filter @keigent/engine verify:attention
corepack pnpm --filter @keigent/engine verify:browser
corepack pnpm --filter @keigent/engine exec tsx src/verify-tools.ts
```

真实 replay 必须传 trajectory 映射：

```bash
corepack pnpm --filter @keigent/engine eval:replay -- --trajectory smoke-conversational-hello=/path/to/trajectory.json
corepack pnpm --filter @keigent/cli start eval replay --trajectory smoke-conversational-hello=/path/to/trajectory.json
```

配置位置：

| 数据 | 默认位置 |
|---|---|
| Config | `~/.keigent/config.json` |
| Skills | `~/.keigent/skills/` |
| Workspace | `~/.keigent/workspace/` |
| Memory | `~/.keigent/memory/` |
| Runs | `~/.keigent/runs/` |

环境变量：复制 `.env.example` 为 `.env.local`，设置 `KEIGENT_API_KEY`；可选设置 `KEIGENT_API_PROTOCOL=openai|anthropic`、`KEIGENT_BASE_URL`、`KEIGENT_MODEL_ID`。

---

## 4. 当前架构地图

```text
packages/
├── engine/              # runtime 核心：LoopEngine、profiles、tools、workflow、evals
├── cli/                 # REPL、单次执行、config、doctor、eval/replay 包装
└── web/                 # Workbench view model 与静态 shell

packages/engine/src/
├── types.ts             # Task、SuccessDef、LoopProfile、Trajectory、ProgressEvent
├── engine.ts            # 单一参数化 LoopEngine
├── orchestrator.ts      # 规则分类 + LLM fallback + guard
├── tool-filter.ts       # 按 profile/policy 过滤工具
├── skills.ts            # SKILL.md 渐进式披露加载
├── trajectory.ts        # runtime trajectory
├── learner.ts           # trajectory -> skill patch 建议
├── skill-patch.ts       # learning note 写入
├── profiles/            # conversational / divergent / convergent / verified
├── tools/               # ToolRegistry 与浏览器/文件/shell/http/memory/computer 工具
├── workflow/            # WorkflowRunner、policy、budget、workflow trajectory
└── evals/               # smoke/replay/orchestrator eval harness

skills/                  # 本地 SKILL.md 示例与学习笔记
doc/design/              # 架构事实源与设计说明
doc/product/             # 产品蓝图与体验规划
doc/evals/               # eval/benchmark 与验收报告
doc/strategy/            # 架构边界与非目标
doc/references/          # 外部参考项目研读
```

---

## 5. 当前实现基线

- Profile：`conversational`、`divergent-research`、`convergent-exec`、`convergent-verified`。
- Orchestrator：规则分类、LLM fallback、超时降级、guard 修正。
- Runtime：`LoopEngine` 支持 abort、LLM timeout、progress events、trajectory、recovery。
- Tooling：`ToolRegistry` 统一执行工具，包含 permission/risk/sideEffect/reversible/timeout/output limit。
- Governance：R3-R5 与 dangerous 工具需要审批；审批结果进入 trajectory。
- Evidence：SuccessDef、Assertion、EvidenceBundle、checkpoint、verdict、failure code。
- Workflow：`single-loop`、`verified-loop`、`reviewed-loop` envelope，包含 budget、policy、child evidence、workflow trajectory。
- CLI：REPL、单次执行、config、doctor、eval/replay、web print；机器可读命令支持 `--json` 和 `--compact`。
- Web：当前是 Workbench view model 与静态 shell 阶段，不宣称完整交互式产品已完成。
- Eval：smoke、orchestrator、replay fixture 与 real-world L2 fixture 作为确定性主干回归门。

---

## 6. 核心边界

- **一个引擎 + 多个 profile**：不要新增第二套 agent loop。
- **Skill 负责怎么做，引擎负责怎么验**：不要把成功判断塞进 skill 文本。
- **Final text 不是成功证据**：需要 assertion/evidence/verdict/trajectory 支撑。
- **Workflow 是 parent envelope**：child run 仍通过 `LoopEngine.run()`。
- **执行 loop 默认不写知识库**：学习结果走 learner 和 skill governance。
- **危险副作用默认受控**：不要绕过 ToolRegistry、approval gate 或 workflow policy。
- **Web 当前不是完整产品**：文档和 UI 只能描述已实现 view model 能力。

---

## 7. pi-ai 使用注意

底层依赖 `@earendil-works/pi-ai`。自定义端点直接构造 `Model<Api>` 对象，不使用只接受 KnownProvider 的 `getModel()`。

KeiGent 配置层按协议区分：

- `openai` -> `openai-completions`
- `anthropic` -> `anthropic-messages`

已知兼容问题：pi-ai 在部分流式并发工具调用场景会把一次调用拆成两个互补 block。所有 LLM 调用点必须通过 `utils.ts` 的 `extractToolCalls` / `deduplicateToolCalls` 统一处理，不要在各模块手写过滤。

---

## 8. 文档使用规则

- 任务涉及架构事实时，先读 `doc/design/01-architecture.md`。
- 任务涉及产品范围或成熟度时，先读 `doc/product/01-product-blueprint.md`。
- 任务涉及下一阶段开发计划、RunRecord、Workbench V1、operator 旅程或 Loop Engineering 时，先读 `doc/product/09-agent-operations-maturity-roadmap.md`、`doc/product/05-run-record-and-run-lifecycle.md`、`doc/product/07-local-operator-user-journeys.md`、`doc/product/08-loop-engineering-development-requirements.md`。
- 任务涉及权限、风险、审批时，先读 `doc/design/09-permission-risk-governance.md`。
- 任务涉及成功证据时，先读 `doc/design/08-success-evidence-model.md`。
- 任务涉及 workflow 时，先读 `doc/design/07-workflow-run-envelope.md` 和 `doc/design/10-workflow-modes-product-semantics.md`。
- 任务涉及 skill 治理时，先读 `doc/design/11-skill-lifecycle-and-governance.md` 和 `doc/product/06-skill-governance-product-spec.md`。
- 任务涉及 eval/replay 或真实世界验收时，先读 `doc/design/03-eval-harness.md`、`doc/evals/README.md` 和 `doc/evals/03-real-world-eval-roadmap.md`。
