# KeiGent main 分支验收报告：Agent Operations Foundation

> 验收时间：2026-06-10 10:31:37 UTC
>
> 验收对象：`origin/main`
>
> 验收提交：`dd12167c0bba94c1a226bb3185cb3989102e1166`
>
> 提交标题：`feat: expand operations workbench and eval reporting`
>
> 验收角色：产品负责人 / 架构师 / 验收人
>
> 验收口径：本报告不只检查工程质量门，也按此前 Agent Operations / Loop Engineering 产品设计要求进行 traceability 验收。

---

## 1. 验收结论

本轮结论：

```text
工程质量门：通过
M1 Run 可审计：基本通过
M2 Eval 可复盘：基本通过
M3 Loop 可治理：部分 foundation 通过
产品整体成熟度：Agent Operations Workbench v1 foundation 可接受
```

当前 main 可以接受为一版 **Agent Operations Foundation**：它已经把 RunRecord、Workbench、Skill Governance、Real-world Eval、Live Console、Web API、debug bundle、worktree isolation foundation 等能力推进到可回归、可审计、可继续演化的状态。

但本轮不应宣称：

```text
完整交互式 Agent Operations Workbench 已成熟
真实生产环境外部系统运行已经被 L2 fixture 证明
autonomous swarm / tournament / dynamic planner 已准备好
```

正确口径是：

```text
KeiGent 已从“核心 loop runtime + eval baseline”推进到“本地可审计 Agent Operations Workbench v1 foundation”。
```

---

## 2. 分支同步情况

验收前执行：

```bash
git pull --ff-only origin main
```

同步后：

```text
branch: main
remote: origin/main
HEAD: dd12167
commit: dd12167 feat: expand operations workbench and eval reporting
```

验收结束后工作区已恢复为 clean。

---

## 3. 已执行工程质量门

| 验收项 | 命令 / 方法 | 结果 |
|---|---|---|
| 依赖安装 | `corepack pnpm install` | 通过 |
| TypeScript 检查 | `corepack pnpm -r check` | 通过 |
| 单元测试 | `corepack pnpm -r test` | 通过，68 files / 289 tests |
| 构建 | `corepack pnpm -r --if-present build` | 通过 |
| Engine smoke eval | `corepack pnpm --filter @keigent/engine eval:smoke` | 57 / 57，通过 |
| Engine orchestrator eval | `corepack pnpm --filter @keigent/engine eval:orchestrator` | 32 / 32，通过，profileAccuracy = 1 |
| Engine real-world eval | `corepack pnpm --filter @keigent/engine eval:real-world -- --compact` | 17 / 17，通过 |
| Replay 回归 | `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/eval-replay.test.ts` | 6 / 6，通过 |
| CLI eval smoke | `corepack pnpm --filter @keigent/cli start eval smoke --compact` | 通过 |
| CLI eval orchestrator | `corepack pnpm --filter @keigent/cli start eval orchestrator --compact` | 通过 |
| CLI eval real-world | `corepack pnpm --filter @keigent/cli start eval real-world --compact` | 通过 |
| Attention 验收 | `corepack pnpm --filter @keigent/engine verify:attention` | 通过 |
| Browser 验收 | `PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright corepack pnpm --filter @keigent/engine verify:browser` | 通过 |
| Tools 验收 | `corepack pnpm --filter @keigent/engine exec tsx src/verify-tools.ts` | 通过 |

测试规模：

```text
packages/engine: 40 files passed, 153 tests passed
packages/cli:    13 files passed, 77 tests passed
packages/web:    15 files passed, 59 tests passed
```

---

## 4. 设计要求 traceability 验收

### 4.1 M1-A：Workbench Run Detail v1

设计要求：Web 不再只是静态 shell，而是能审计真实 run。

本轮实现证据：

- `packages/web/src/runs/workbench.ts`
- `packages/web/src/runs/model.ts`
- `packages/web/src/conversation/live-console.ts`
- `packages/web/src/conversation/web-run.ts`
- `packages/cli/src/web-api-server.ts`
- `packages/web/src/api/client.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`
- `packages/web/src/__tests__/live-console.test.ts`
- `packages/cli/src/__tests__/web-api-server.test.ts`

验收判断：**基本通过。**

已覆盖：

- run list / summary；
- route and skills；
- evidence；
- risk and approvals；
- tools and budget；
- replay and artifacts；
- failures；
- raw redacted record；
- live / replay event surface；
- local API / SSE foundation。

边界：当前仍是 Workbench v1 foundation，不应宣称完整交互式 operator workbench 已成熟。

### 4.2 M1-B：RunRecord Completeness

设计要求：RunRecord 成为所有运行路径的产品事实源。

本轮实现证据：

- `packages/engine/src/run-record.ts`
- `packages/cli/src/runs-commands.ts`
- `packages/cli/src/post-run.ts`
- `packages/engine/src/__tests__/run-record.test.ts`
- `packages/cli/src/__tests__/runs-commands.test.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`

验收判断：**基本通过。**

已覆盖：

- workflow parent / child；
- route；
- skill match；
- tool attempted / succeeded；
- evidence；
- risk / approval；
- failure code；
- artifacts；
- replay metadata；
- redaction；
- no-op / automation 语义。

剩余建议：补一个真实端到端 fixture：

```text
CLI run -> run store -> web api -> Workbench Run Detail -> evidence inspection
```

### 4.3 M1-C：Skill Explanation Surface

设计要求：用户应知道为什么匹配某个 skill，它是否可靠、是否注入、有无 eval coverage 和风险边界。

本轮实现证据：

- `packages/web/src/skills/model.ts`
- `packages/web/src/skills/workbench.ts`
- `packages/web/src/__tests__/skill-workbench.test.ts`
- `packages/web/src/__tests__/skills-view.test.ts`
- L2 cases：`stale-skill-blocked`、`deprecated-skill-warning`

验收判断：**基本通过。**

已覆盖：

- verified / candidate / blocked / deprecated 状态；
- injected；
- risk delta；
- eval coverage；
- recent matches；
- blocked / deprecated skill 不应静默执行。

### 4.4 M1-D：Stability Hardening Gate

设计要求：防止 false success、replay 伪 fresh、empty evidence 成功、approval 绕过、reviewer 写操作等红线退化。

本轮实现证据：

- `packages/engine/src/evals/real-world.ts`
- `packages/engine/src/__tests__/real-world-eval.test.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`
- `packages/engine/src/__tests__/debug-bundle.test.ts`
- `packages/engine/src/__tests__/engine-budget.test.ts`

Real-world L2：

```text
total: 17
passed: 17
failed: 0
routeAccuracy: 1
evidenceQuality: 1
riskCompliance: 1
falseSuccessCount: 0
```

关键红线 cases：

- `no-op-automation`
- `stale-skill-blocked`
- `deprecated-skill-warning`
- `parent-timeout-child-success`
- `reviewer-readonly-violation`
- `budget-exceeded`
- `redaction-leak-guard`
- `replay-stale-schema`
- `insufficient-evidence-success-claim`

验收判断：**通过。**

### 4.5 M2-A：Eval-run Linkage and Report UX

设计要求：real-world eval 不能停留在 JSON 报告，应能进入可复盘产品入口。

本轮实现证据：

- `packages/web/src/dashboard/report-model.ts`
- `packages/web/src/dashboard/workbench.ts`
- `packages/web/src/__tests__/eval-dashboard-workbench.test.ts`
- `packages/engine/src/evals/real-world.ts`

验收判断：**基本通过。**

已覆盖：

- route accuracy、task success、evidence quality、tool reliability、risk compliance 分离；
- case table 包含 run detail href；
- false-confidence findings 独立展示；
- replay case 不伪装 fresh execution；
- fixture-level report 不伪装 product health。

### 4.6 M2-B：False-confidence Case Expansion

设计要求：新增 L2 cases，覆盖 no-op、stale skill、deprecated skill、timeout、readonly reviewer、redaction、replay stale schema、insufficient evidence。

验收判断：**通过。**

本轮 L2 suite 已覆盖设计文档中的主要 false-confidence cases，且 17 / 17 通过。

### 4.7 M3-C：Worktree Isolation Foundation

设计要求：worktree isolation 是 fanout / tournament / automation spawned work 前置能力；先打地基，不提前做不可审计 swarm。

本轮实现证据：

- `doc/design/14-worktree-isolation-and-parallel-runs.md`
- `packages/engine/src/worktree-isolation.ts`
- `packages/engine/src/__tests__/worktree-isolation.test.ts`

验收判断：**foundation 通过。**

边界：本轮只应声明 worktree isolation foundation 已进入代码和测试，不应声明成熟 fanout / tournament / autonomous swarm 能力。

---

## 5. 主要风险与后续要求

### 5.1 环境风险：Node 版本低于声明

当前环境：

```text
Node v20.19.2
```

仓库声明：

```text
>=22.19.0
```

本轮所有验收均通过，但正式 release / CI 应在 Node 22.19+ 复跑。

### 5.2 Browser 验收依赖 Playwright 路径

当前环境需要：

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright
```

否则默认 `/opt/hermes/.playwright` 找不到浏览器，会造成误报。

### 5.3 build 会改变 CLI bin 文件权限

本轮 build 后曾出现：

```text
mode change 100644 => 100755 packages/cli/bin/keigent.mjs
```

已恢复工作区 clean。建议后续二选一：

1. 如果 CLI bin 应可执行，则正式提交 executable bit；
2. 如果不应改变，则避免 build / package manager 污染 tracked file mode。

### 5.4 仍缺真实端到端产品验收

建议下一轮补：

```text
keigent start/run
-> RunRecord persisted
-> keigent web --api
-> Web API returns run
-> Workbench opens run detail
-> user can inspect route/evidence/failure/replay/next action
```

这会把 M1/M2 从 unit/eval 可信推进到产品链路可信。

---

## 6. 新一轮开发要求入口

本轮验收同时沉淀了外部 Agent 项目学习后的下一轮开发要求：

- [Agent Project Learning Development Requirements](../product/11-agent-project-learning-development-requirements.md)

其中 P0 建议为：

1. Autonomy-first Escalation taxonomy；
2. Self-repair before escalation；
3. Loop Event Protocol 最小稳定版本；
4. Proof Boundary 进入 RunRecord / eval / Workbench；
5. 真实 CLI -> RunRecord -> Web API -> Workbench E2E 验收。

---

## 7. 最终验收意见

本轮 main 分支可以接受。

正式判断：

```text
Accept as Agent Operations Workbench v1 foundation.
Do not over-claim as mature autonomous operations platform.
Proceed to next development round with autonomy-first, self-repair, event protocol, proof boundary, and E2E product acceptance as priorities.
```
