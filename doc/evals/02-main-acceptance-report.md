# KeiGent main 分支验收情况说明

> 验收时间：2026-06-09 16:43:33 UTC
>
> 验收对象：`origin/main`
>
> 验收提交：`9715c034449241fc51601f365e4ad26ebddc431c`
>
> 验收角色：产品负责人 / 架构师 / 验收人
>
> 验收口径：不以阶段性 demo 或 MVP 为目标，而以“产品逻辑清晰、架构事实一致、工程能力可复现、验收证据充分”为判断标准。

---

## 1. 验收结论

本轮结论：

```text
工程质量门：通过
核心 runtime / eval / governance baseline：基本通过
产品级整体蓝图验收：暂缓通过
```

换句话说，当前 main 可以接受为一版 **工程主干健康、核心治理能力明显成熟** 的提交；但还不应宣布为“产品蓝图与架构事实源已经完成”的版本。

阻断整体通过的主要原因不是测试失败，而是：

1. README 中部分入口命令仍不可直接复现。
2. `eval:replay` 的常用命令示例仍容易误导。
3. CLI 的 JSON/compact 输出语义不统一。
4. `doc/design/01-architecture.md` 仍保留旧架构事实，与当前实现冲突。
5. `AGENTS.md` 作为 AI 协作者入口仍混有旧阶段叙事，可能误导后续工作。

---

## 2. 分支同步情况

验收前已从远端同步：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

同步结果：

```text
LOCAL  = 9715c034449241fc51601f365e4ad26ebddc431c
REMOTE = 9715c034449241fc51601f365e4ad26ebddc431c
## main...origin/main
```

确认：本地 `main` 与远端 `origin/main` 一致，工作区干净。

---

## 3. 已执行质量门

### 3.1 通过的质量门

| 验收项 | 命令 / 方法 | 结果 |
|---|---|---|
| Git 空白检查 | `git diff --check` | 通过 |
| Markdown 链接检查 | 自定义脚本扫描 `README.md` 与 `doc/**/*.md` | 42 个 md 文件，0 个缺失链接 |
| TypeScript 检查 | `corepack pnpm -r check` | 通过 |
| 单元测试 | `corepack pnpm -r test` | 通过 |
| 构建 | `corepack pnpm -r --if-present build` | 通过 |
| Engine smoke eval | `corepack pnpm --filter @keigent/engine eval:smoke` | 57 / 57 通过 |
| Engine orchestrator eval | `corepack pnpm --filter @keigent/engine eval:orchestrator` | 32 / 32 通过，profileAccuracy = 1 |
| Replay 回归 | `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/eval-replay.test.ts` | 6 / 6 通过 |
| Attention 验收 | `corepack pnpm --filter @keigent/engine verify:attention` | 通过 |
| Browser 验收 | `PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright corepack pnpm --filter @keigent/engine verify:browser` | 通过 |
| CLI eval smoke 包装 | `corepack pnpm --filter @keigent/cli start eval smoke --compact` | 57 / 57 通过 |
| CLI eval orchestrator 包装 | `corepack pnpm --filter @keigent/cli start eval orchestrator` | 32 / 32 通过 |
| CLI web print | `corepack pnpm --filter @keigent/cli start web --print` | 能输出本地 Workbench 启动命令 |

### 3.2 测试规模

本轮测试覆盖规模：

```text
engine: 31 files, 114 tests passed
cli:     9 files, 40 tests passed
web:     5 files, 24 tests passed
```

这说明当前 main 已经具备较强的确定性回归基础，尤其是 runtime、workflow、governance、eval、CLI 与 Web view model 层均已有测试覆盖。

---

## 4. 关键能力完成情况

### 4.1 Runtime / Profile / Orchestrator

验收判断：基本通过。

当前已具备：

- `LoopEngine` 参数化主循环。
- `conversational` / `divergent-research` / `convergent-exec` / `convergent-verified` 四类 profile。
- Orchestrator 规则分类、LLM fallback 与 guard 机制。
- 32 个 orchestrator fixture，当前 profileAccuracy = 1。

注意边界：profile accuracy 只证明路由 fixture 当前无退化，不等于真实世界任务成功率。

### 4.2 ToolRegistry 与权限治理

验收判断：基本通过。

当前实现已包含：

- `ToolRegistry` 与工具元数据。
- `permission` / `risk` / `sideEffect` / `reversible` 等治理字段。
- R3-R5 / dangerous 工具审批门。
- 审批与拒绝证据进入 trajectory。

相关测试包括：

- `tool-registry-governance.test.ts`
- `tool-metadata.test.ts`
- `engine-approval-trajectory.test.ts`

### 4.3 Evidence / Assertion / Failure / Recovery

验收判断：基本通过。

当前实现已包含：

- `SuccessDef` / assertion / evidence 模型。
- final text 不等同成功证据的评估边界。
- failure code 与失败语义。
- recovery trajectory。
- replay fixture 与 replay 回归测试。

相关测试包括：

- `success-evidence.test.ts`
- `failures.test.ts`
- `engine-recovery-trajectory.test.ts`
- `eval-replay.test.ts`

### 4.4 Eval Harness

验收判断：通过工程基线，未覆盖真实世界完整可信度。

当前确定性 eval：

```text
smoke suite:        57 / 57
orchestrator suite: 32 / 32
replay tests:        6 / 6
```

Eval Harness 已经可以作为主干回归门，但仍需明确边界：

- Eval pass 不等于产品完全可信。
- profile accuracy 不等于任务成功。
- tool attempted 不等于 tool succeeded。
- replay pass 不等于 fresh execution pass。

### 4.5 CLI

验收判断：基本通过，但命令语义需要统一。

当前 CLI 已具备：

- REPL / 单次执行入口。
- config / doctor 命令。
- eval smoke / orchestrator / replay 包装入口。
- replay summary。
- web 启动命令打印。

主要问题是 JSON/compact 语义不统一，见“未通过项”。

### 4.6 Web Workbench

验收判断：视图模型阶段通过；完整产品不通过。

当前可以确认：

- `conversation` normalization。
- `dashboard` report model。
- `replay` model。
- `skills` model。
- `config` view model。
- Web build 通过。

当前不能宣称：

- 完整交互式 Operations Workbench 已可用。
- run inspect / replay / eval trigger / config center / skill library 已形成完整产品闭环。

README 与产品蓝图已较明确地承认 Web 仍处于 view model shell 阶段，这一口径是正确的。

---

## 5. 未通过项与风险分级

### P0-1：README 根级命令不可直接复现

README 当前常用命令包含：

```bash
corepack pnpm build
corepack pnpm check
corepack pnpm test
```

但 root `package.json` 中脚本为：

```json
{
  "build": "pnpm -r build",
  "check": "pnpm -r check",
  "test": "pnpm -r test"
}
```

在当前环境中，外层 `corepack pnpm check` 能启动，但脚本内部调用裸 `pnpm`，导致：

```text
sh: 1: pnpm: not found
```

可复现通过的命令是：

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
```

验收影响：README 是第一入口，入口命令失败会直接破坏用户信任，因此这是 P0。

建议：README 改为推荐 `corepack pnpm -r ...`，或修正 root scripts，但不建议在 package scripts 内递归调用 `corepack`。

### P0-2：`eval:replay` 示例仍可能误导

README 常用命令中仍包含：

```bash
corepack pnpm --filter @keigent/engine eval:replay
```

但 replay 模式需要传入 trajectory：

```text
--trajectory case-id=/path/to/trajectory.json
```

否则会报错。建议把常用质量门中的 replay 改为：

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/eval-replay.test.ts
```

并把真实 replay 放到示例区：

```bash
corepack pnpm --filter @keigent/engine eval:replay -- --trajectory smoke-conversational-hello=/path/to/trajectory.json
```

### P0-3：主架构文档仍是旧事实源

`doc/design/01-architecture.md` 仍保留旧口径，例如：

```text
状态：设计草案 v0.3
三个基线 profile
去掉 ToolRegistry 预设
底层操作 tool 的封装形式已废
第一版用最笨可靠的方式：任务自带 profile 声明
```

但当前实现已经具备：

- 四个 profile。
- ToolRegistry。
- 权限 / 风险 / 审批治理。
- Orchestrator 规则 + LLM fallback + guard。
- Workflow policy。
- Evidence / assertion / failure / trajectory。

验收影响：主架构文档与 README、产品蓝图、源码事实冲突，导致设计蓝图不能作为可靠验收依据。

建议：将 `doc/design/01-architecture.md` 重写为“当前架构事实源”，而不是继续保留旧设计草案叙事。

### P1-1：CLI JSON/compact 语义不统一

实测：

```bash
corepack pnpm --filter @keigent/cli start eval smoke --json
```

结果：

```text
Error: unknown eval option --json
```

但 eval 输出本身又是 JSON，且 `--compact` 可用。建议统一所有机器可读命令的语义：

```text
--json     输出 JSON，不带 UI 装饰
--compact  输出紧凑 JSON
```

适用范围建议包括：doctor、config show、eval smoke、eval orchestrator、eval replay、replay。

### P1-2：AGENTS.md 仍可能误导 AI 协作者

`AGENTS.md` 是 AI 协作者入口，但仍包含旧阶段表述，例如：

- 三个基线 profile。
- mock skill。
- 架构只提供 bash/文件/执行通用原语。
- `index.ts` 是全量闭环演示入口。

验收影响：对终端用户影响较小，但对后续 AI coding agent 影响很大，可能导致自动协作者按旧事实工作。

建议：同步 README、产品蓝图和当前源码事实，把 AGENTS.md 改为协作者契约，而不是历史进度记录。

### P1-3：demo / 原型 / 草案叙事仍有残留

仍存在：

```text
doc/design/03-eval-harness.md: 架构闭环 demo
doc/product/01-product-blueprint.md: agent runtime 原型
doc/design/01-architecture.md: 设计草案 v0.3
```

考虑到项目目标已经不是阶段性 demo / MVP，建议统一改为：

- 当前实现基线。
- 产品能力边界。
- 架构事实源。
- 未来规划。
- 测试 fixture。

---

## 6. 分层验收判定

| 层级 | 判定 | 说明 |
|---|---|---|
| Git 主干同步 | 通过 | 本地 main 与 origin/main 一致 |
| 工程质量门 | 通过 | check / test / build / eval / verify 均有可通过路径 |
| Runtime 核心 | 基本通过 | profile、orchestrator、tool registry、trajectory 均有实现与测试 |
| Governance baseline | 基本通过 | permission/risk/approval/evidence/failure 已有工程基础 |
| Eval Harness | 通过工程基线 | 确定性 eval 足够做主干回归，但不等同真实任务可靠性 |
| CLI | 基本通过 | 可用，但 JSON/compact 语义需统一 |
| Web Workbench | 视图模型阶段通过 | 不应宣称完整交互式产品已完成 |
| README | 部分通过 | 结构清晰，但入口命令存在 P0 问题 |
| 主架构文档 | 不通过 | 与当前实现冲突，需重写为事实源 |
| 产品级整体蓝图 | 暂缓通过 | 工程进展明显，但事实源和验收口径未完全统一 |

---

## 7. 下一轮最小返工清单

### 必须修复（P0）

1. 修正 README 中根级命令：推荐 `corepack pnpm -r ...`，或保证 root scripts 在目标环境可复现。
2. 修正 README 中 `eval:replay` 常用命令示例，避免提供缺参数的不可运行命令。
3. 重写 `doc/design/01-architecture.md`，将其升级为当前架构事实源。

### 应尽快修复（P1）

1. 统一 CLI `--json` / `--compact` 语义。
2. 同步 AGENTS.md，使其成为准确的 AI 协作者契约。
3. 清理 demo / 原型 / 草案类旧叙事。
4. 在文档地图中标注每份文档的状态：事实源、产品蓝图、设计蓝图、实现说明、参考资料。

---

## 8. 验收人最终意见

当前 main 已经从“能跑的框架”推进到“具备工程化回归、治理基线和可解释证据模型的 agent runtime”。这是实质进步。

但产品级验收不能只看测试绿灯，还要看：入口是否可信、文档事实是否一致、协作者是否能按同一蓝图工作、用户是否能复现 README 中的路径。

因此本轮最终意见是：

```text
允许作为工程主干继续推进；
暂不作为产品/架构整体完成状态验收通过。
```
