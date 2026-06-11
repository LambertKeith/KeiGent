# KeiGent 验收报告：Agent Operations Next Round

> 验收时间：2026-06-11 06:20:45 UTC
>
> 验收对象：`origin/agent-operations-next-round`
>
> 本地分支：`agent-operations-next-round`
>
> 验收提交：`b4c291a1b258a44669a288194f74621448f5a4a4`
>
> 提交标题：`docs: finalize agent operations next round`
>
> 验收角色：产品负责人 / 架构师 / 验收人
>
> 验收口径：本报告验证本轮相对 `main` 的增量是否满足 Agent Operations / Loop Engineering 下一轮要求；fixture pass 不等于生产健康或真人验收。

---

## 1. 验收结论

本轮结论：

```text
分支同步：通过
Node release gate：通过（Node 22.19.0）
工程质量门：通过
核心 eval：通过
产品级 E2E 回归：通过（包含在 cli test 中）
Provider capability / doctor 基线：通过
验收建议：可以接受为 agent-operations-next-round 分支交付基线
```

该分支可以接受为 **Agent Operations Next Round** 的一版产品化基线。它补齐了上一版 foundation 报告中提出的关键下一步：

- 稳定 Loop Event Protocol，避免 UI / report 解析 raw logs；
- Proof Boundary 进入 RunRecord / eval / Workbench 语义；
- workflow autonomy summary 明确 self-repair / escalation / degraded outcome；
- CLI RunRecord -> Web API -> Workbench 的产品级 E2E 回归；
- provider capability-aware config / doctor hardening；
- operator acceptance packet / human sign-off 语义强化；
- release gate 显式升级到 Node.js `>=22.19.0`。

但本轮仍不应宣称：

```text
完整交互式 Agent Operations Workbench 已成熟
fixture pass 已证明真实生产环境健康
human acceptance packet 等价于真人实际审证
P2 dynamic planner / tournament / autonomous swarm 已完成
无人值守外部写操作可以默认开放
```

正确口径是：

```text
KeiGent 已从“本地可审计 Agent Operations Workbench v1 foundation”，推进到“具备稳定事件协议、证明边界、自治摘要、能力声明与产品级 E2E 回归的 agent operations 基线”。
```

---

## 2. 分支同步与增量范围

验收前执行：

```bash
git fetch origin
git switch --track origin/agent-operations-next-round
```

同步后：

```text
branch: agent-operations-next-round
remote: origin/agent-operations-next-round
HEAD: b4c291a
commit: b4c291a docs: finalize agent operations next round
```

与 `main` 的增量：

```text
commits: 9
files: 51 changed
shortstat: 3379 insertions(+), 161 deletions(-)
```

代表性提交：

```text
441838f docs: plan agent operations next round
aa3aa9c chore: close release verification risks
9b10fbf feat: add stable loop event protocol
5fd59d4 feat: add run proof boundaries
ff7e8e1 feat: summarize workflow autonomy
41db066 feat: add provider capability guards
943d3a4 feat: harden operator acceptance packets
2d0876d test: cover cli to workbench run flow
b4c291a docs: finalize agent operations next round
```

验收结束前工作区保持 clean，除本报告与 eval README 索引更新外无额外代码改动。

---

## 3. 已执行验收命令

### 3.1 Node release gate

当前系统默认 Node 为 `v20.19.2`，本轮新增 release gate 要求 `>=22.19.0`。直接执行会按预期失败：

```text
Node 20.19.2 is below KeiGent release requirement >=22.19.0
```

为进行正式验收，使用临时本地 Node `v22.19.0`：

```bash
mkdir -p /tmp/keigent-node22
cd /tmp/keigent-node22
npm install node@22.19.0
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH node -v
```

验收命令：

```bash
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm verify:node
```

结果：

```text
Node 22.19.0 satisfies KeiGent release requirement >=22.19.0
```

判断：**通过。**

### 3.2 根级质量门

执行：

```bash
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm -r check
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm -r test
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm -r --if-present build
```

结果：

| 验收项 | 结果 |
|---|---|
| TypeScript check | 通过，engine / cli / web 均完成 `tsc --noEmit` |
| Unit tests | 通过，71 test files / 307 tests |
| Build | 通过，engine / cli / web 均构建成功 |

测试规模：

```text
packages/engine: 42 files passed, 164 tests passed
packages/cli:    14 files passed, 83 tests passed
packages/web:    15 files passed, 60 tests passed
```

判断：**通过。**

### 3.3 Eval / product acceptance 回归

执行：

```bash
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm --filter @keigent/engine eval:smoke
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm --filter @keigent/engine eval:orchestrator
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm --filter @keigent/engine eval:real-world -- --compact
```

结果：

| 验收项 | 结果 |
|---|---|
| Engine smoke eval | 57 / 57 passed |
| Engine orchestrator eval | 32 / 32 passed，profileAccuracy = 1 |
| Engine real-world eval | 通过，命令退出码 0 |

产品级 E2E 回归包含在 `packages/cli` test 中：

```text
packages/cli/src/__tests__/product-e2e.test.ts: 1 test passed
```

判断：**通过。**

### 3.4 CLI doctor / provider capability 基线

无 API key 时执行 doctor：

```bash
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH corepack pnpm --filter @keigent/cli start doctor --compact
```

结果按预期失败：

```json
{"status":"error","issues":[{"code":"config.load_failed","severity":"error","message":"KEIGENT_API_KEY or apiKey in ~/.keigent/config.json is required"}]}
```

使用临时 dummy key 与自定义 base URL / model ID 验证配置通路：

```bash
PATH=/tmp/keigent-node22/node_modules/.bin:$PATH \
KEIGENT_API_KEY=dummy-for-doctor \
KEIGENT_MODEL_ID=gpt-5.5 \
KEIGENT_BASE_URL=https://www.packyapi.com/ \
corepack pnpm --filter @keigent/cli start doctor --compact
```

结果：

```text
status: ready
issues: []
apiProtocol: openai
modelId: gpt-5.5
baseUrl: https://www.packyapi.com/
apiKey: ***
modelCapabilities.toolCalling: true
modelCapabilities.streaming: true
modelCapabilities.vision: true
```

判断：**通过。**

---

## 4. Traceability 验收

### 4.1 Loop Event Protocol

设计要求：CLI、Live Console、Workbench、reports 使用稳定事件协议，不让 UI 解析 raw logs。

实现证据：

- `packages/engine/src/loop-events.ts`
- `packages/engine/src/__tests__/loop-events.test.ts`
- `packages/engine/src/lib.ts`
- `packages/web/src/conversation/normalize.ts`
- `packages/web/src/__tests__/conversation.test.ts`

验收判断：**通过。**

已覆盖：

- progress event -> `LoopEvent` 映射；
- workflow event -> `LoopEvent` 映射；
- terminal state 归一化为 `run_succeeded` / `run_failed` / `run_degraded`；
- tool request / completion / approval / evidence / assertion / recovery / escalation 事件归一；
- payload 与 message 走 redaction；
- unknown event 有可审计 fallback。

剩余边界：当前证明的是协议与 view model 基线，不证明完整生产 UI streaming 体验已经成熟。

### 4.2 Proof Boundary

设计要求：RunRecord、eval report、Workbench 必须显式表达已证明、未证明、假设和 evidence gaps；final text 不得覆盖证据缺口。

实现证据：

- `packages/engine/src/proof-boundary.ts`
- `packages/engine/src/__tests__/proof-boundary.test.ts`
- `packages/engine/src/run-record.ts`
- `packages/engine/src/__tests__/run-record.test.ts`
- `packages/engine/src/evals/real-world.ts`
- `packages/web/src/runs/model.ts`
- `packages/web/src/__tests__/runs-view.test.ts`

验收判断：**通过。**

已覆盖：

- workflow result -> proof boundary；
- RunRecord -> proof boundary；
- failed evidence / insufficient evidence / replay stale schema / non-success exit 进入 evidence gaps；
- historical replay 明确不证明 fresh execution；
- final response 被标记为 communication artifact，不是 proof。

剩余边界：Proof Boundary 的内容质量仍取决于 upstream evidence 是否足够，不能替代真实外部系统检查。

### 4.3 Workflow Autonomy Summary

设计要求：不要把“问人”作为默认产品中心；需要表达 bounded autonomy、repair attempts、calibrated escalation 与 degraded outcome。

实现证据：

- `packages/engine/src/workflow/autonomy.ts`
- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/workflow/trajectory.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`
- `packages/web/src/runs/model.ts`
- `doc/product/11-agent-project-learning-development-requirements.md`

验收判断：**通过。**

已覆盖：

- completed without escalation；
- repaired then completed；
- degraded without escalation；
- escalated；
- repair attempts 与 escalation reason 进入 run / workflow 审计面；
- budget exhausted、parent timeout、child error 等不被伪装成成功。

### 4.4 Provider Capability Guard

设计要求：模型/供应商配置保持协议优先，不给第三方 relay 或供应商品牌特权；toolCalling=false 等能力缺口要显式降级或失败。

实现证据：

- `packages/cli/src/config.ts`
- `packages/cli/src/config-doctor.ts`
- `packages/cli/src/config-commands.ts`
- `packages/cli/src/__tests__/config.test.ts`
- `packages/cli/src/__tests__/config-doctor.test.ts`
- `config.example.json`

验收判断：**通过。**

已覆盖：

- `modelCapabilities` 配置面；
- doctor 输出 capability 摘要；
- API key 缺失显式失败；
- key 输出脱敏；
- relay 只作为 `baseUrl`，不成为一等品牌概念。

### 4.5 Operator Acceptance Packet / Human Sign-off

设计要求：acceptance packet 辅助人工审证，但不能把 fixture pass 或 reviewer sign-off 当作事实覆盖；缺 evidence inspected 或 override reason 时不得 accepted。

实现证据：

- `packages/engine/src/evals/operator-scenarios.ts`
- `packages/engine/src/__tests__/operator-scenario-eval.test.ts`
- `packages/cli/src/__tests__/eval-commands.test.ts`
- `doc/evals/README.md`
- `doc/product/10-release-and-upgrade.md`

验收判断：**通过。**

已覆盖：

- packet 包含 proof boundary；
- evidence inspected / override reason / next actions 字段成为验收语义；
- human sign-off 输出结构化 `operator-human-acceptance`；
- false-confidence 风险需要显式确认；
- fixture 与 sign-off 不替代真人实际审证。

### 4.6 CLI -> RunRecord -> Web API -> Workbench E2E

设计要求：不只做 schema/view model 静态测试，需要至少证明 CLI 持久化的 RunRecord 能被本地 Web API 提供，并由 Workbench 渲染关键审计信息。

实现证据：

- `packages/cli/src/__tests__/product-e2e.test.ts`
- `packages/cli/src/workflow-execution.ts`
- `packages/web/src/runs/workbench.ts`
- `packages/web/src/runs/model.ts`
- `packages/web/src/__tests__/run-workbench.test.ts`
- `packages/web/src/__tests__/eval-dashboard-workbench.test.ts`

验收判断：**通过。**

已覆盖：

- CLI 运行结果持久化为 RunRecord；
- Web API 可读取 run；
- Workbench 展示 route、evidence、risk、failures、proof boundary、autonomy、next action；
- Eval Dashboard / Runs view 有回归覆盖。

---

## 5. 风险与限制

### 5.1 环境风险：默认 Node 仍低于 release gate

当前机器默认：

```text
node -v => v20.19.2
```

本轮 release gate 要求：

```text
Node.js >=22.19.0
```

本报告的正式验收使用临时 Node `v22.19.0` 完成。后续若在同一环境继续开发，建议将默认 Node 升级到 22.19+，否则 `corepack pnpm verify:node` 会持续失败。

### 5.2 Fixture 边界

本轮 eval 证明 deterministic fixture 与产品 E2E 基线路径没有退化，但仍不证明：

- 真实外部服务健康；
- 真人已逐条审查 evidence；
- 所有浏览器 / OS / shell 差异都已覆盖；
- LLM 在真实长任务中的质量稳定性。

### 5.3 Workbench 产品边界

Workbench 仍应表述为本地 Agent Operations Workbench 基线，不应宣称完整 SaaS / no-code agent platform 或无人值守运营平台已成熟。

---

## 6. 通过 / 未证明矩阵

| 维度 | 验收判断 | 已证明 | 未证明 |
|---|---|---|---|
| 工程质量 | 通过 | check / test / build 全绿 | 生产部署健康 |
| Release gate | 通过 | Node 22.19.0 下 `verify:node` 通过 | 当前机器默认 Node 已升级 |
| Loop events | 通过 | 事件协议与 redaction 基线 | 所有 UI streaming 边界 |
| Proof boundary | 通过 | RunRecord / eval / Workbench 有边界表达 | 外部系统真实状态 |
| Autonomy | 通过 | repair / escalation / degraded outcome 可审计 | 长任务自主质量稳定 |
| Provider capability | 通过 | doctor / config 能表达能力与缺口 | 所有 provider 真实 API 行为 |
| Human acceptance | 通过 | packet / sign-off 结构化且防 false confidence | 真人已完成实际审证 |
| Product E2E | 通过 | CLI -> RunRecord -> Web API -> Workbench 回归 | 完整交互式产品成熟 |

---

## 7. 最终验收意见

本轮 `agent-operations-next-round` 分支建议接受。

接受理由：

1. 所有正式质量门在 Node 22.19.0 环境下通过；
2. 本轮新增能力直接回应上一轮 Agent Operations Foundation 的下一步要求；
3. 关键 false-confidence 风险被显式纳入 proof boundary、operator acceptance packet、doctor 与 eval 语义；
4. 产品级 E2E 回归补齐了 CLI RunRecord 到 Workbench 的闭环；
5. 文档已同步调整产品口径，避免把 fixture / demo / sign-off 误说成生产健康。

下一步建议：

1. 将默认开发环境升级到 Node.js `>=22.19.0`；
2. 如果准备合入 `main`，在合入前用 Node 22.19+ 重新运行同一组质量门；
3. 合入后更新 main 分支 acceptance 报告或 release note，继续保持“不用 fixture pass 冒充生产健康”的口径；
4. 下一轮可以进入真实 operator task replay、更多 provider capability 负例、以及 Workbench 交互验收，而不是扩张 P2 swarm / tournament 概念。
