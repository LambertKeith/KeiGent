# KeiGent Development Priority Backlog

> 状态：开发优先级总表 / 交付排期入口  
> 形成时间：2026-06-15  
> 依据：`01-product-blueprint.md`、`09-agent-operations-maturity-roadmap.md`、`11-agent-project-learning-development-requirements.md`、`02-agent-operations-product-direction.md` 与当前 main 基线。  
> 适用读者：开发负责人、coding agent、产品负责人、架构师、验收人。

---

## 1. 使用方式

本文件把下一阶段所有开发包按优先级写成可排期 backlog。开发团队应按以下规则执行：

1. **先 P0 后 P1，再 P2**：除非 P0 被阻塞，否则不要跳到后续优先级堆功能。
2. **每个开发任务必须绑定一个 backlog 编号**：PR / commit / 验收报告中写明 `P0-01`、`P1-03` 等。
3. **先证据闭环，再炫技能力**：不要在 RunRecord、Workbench 审计、skill 治理、eval 复盘未稳定前做 fanout / tournament / dynamic planner。
4. **每个包必须同时交付产品语义、实现、测试、eval/fixture 和文档入口**：只改代码或只改文档都不算完成。
5. **验收不能只看 final text**：必须检查 RunRecord、evidence、failure code、proof boundary、redaction 与可复盘路径。

---

## 2. 总体排期建议

| 优先级 | 阶段目标 | 建议顺序 | 估算 |
|---|---|---|---:|
| P0 | Run 可审计 + Eval 可复盘的最小产品闭环 | P0-01 → P0-05 | 18 ~ 30 人日 |
| P1 | Loop 可治理，本地 operator 可持续使用 | P1-01 → P1-05 | 21 ~ 34 人日 |
| P2 | Ops 可扩展，进入更完整本地产品形态 | P2-01 → P2-05 | 20 ~ 32 人日 |
| 合计 | 从当前基线推进到本地 Agent Operations 系统 | 全部开发包 | 59 ~ 96 人日 |

> 备注：估算包含产品设计、实现、测试、eval、Workbench view model、CLI、文档、失败用例和验收报告，不是纯编码时间。

---

## 3. P0：Run 可审计 + Eval 可复盘

P0 的目标是让用户和验收人能真实回答：一次 agent run 为什么这样执行、做了什么、凭什么成功、失败在哪里、能否 replay、下一步是什么。

### P0 总表

| 编号 | 开发包 | 估算 | 交付目标 | 核心验收 |
|---|---|---:|---|---|
| P0-01 | RunRecord Completeness | 4 ~ 7 人日 | `RunRecord` 成为所有 run 的事实源 | 任意 run 可回答九个事实问题 |
| P0-02 | Workbench Run Detail v1 | 5 ~ 8 人日 | Workbench 可审计真实 run | succeeded / failed / approval denied / replay / insufficient evidence 都可复盘 |
| P0-03 | Skill Explanation Surface | 3 ~ 5 人日 | skill 注入原因、状态、覆盖度可见 | verified / candidate / blocked / deprecated / no skill 行为正确 |
| P0-04 | Eval-run Linkage and Report UX | 3 ~ 5 人日 | eval case 可跳到 run detail | false-confidence findings 独立展示，replay 不伪装 fresh |
| P0-05 | Stability Hardening Gate | 3 ~ 5 人日 | false-confidence 红线进入主干 | final text、empty evidence、approval bypass、redaction 等红线有测试 |

### P0-01：RunRecord Completeness

**目标**：让 `RunRecord` 覆盖 CLI single run、workflow run、eval run、replay run、failed run、approval run、no-op run 与 automation run 的共同事实。

**必须包含**：

- lifecycle：`created`、`routed`、`running`、`awaiting_approval`、`verifying`、`succeeded`、`failed`、`degraded`、`cancelled`；
- task / route / workflow / execution / evidence / risk / approvals / failures / artifacts / replay / redaction；
- parent / child mapping：`parentRunId`、`childRunIds`、`childRole`；
- artifact model：trajectory、workflow trajectory、eval report、replay report、generated file、diff、log excerpt；
- schema compatibility：旧 record 读取、unknown field 容忍、missing field fallback、migration/report 预留。

**验收问题**：任意 run record 必须能回答：

1. 任务是什么？
2. 为什么选择这个 profile / workflow？
3. 做了哪些工具调用？
4. 哪些调用成功、哪些只是 attempted？
5. 成功证据是什么？
6. 失败 code 与 blocking evidence 是什么？
7. 是否涉及 risk / approval？
8. 是否可 replay，是否 fresh execution？
9. 下一步建议是什么？

**非目标**：不在本包中实现大型 planner、fanout、tournament 或外部写 connector。

### P0-02：Workbench Run Detail v1

**目标**：Web 不再只是静态 shell，而是能让 operator 审计真实 run。

**Run Review V1 规范**：[`../../docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md`](../../docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md)。

**Run List 至少展示**：run id、status、createdAt、profile、workflow mode、risk level、evidence summary、duration、replay status。

**Run Detail 至少包含**：

```text
Overview
Route
Timeline
Skills
Tools
Evidence
Risk / Approval
Failures
Replay
Next Action
Raw Redacted Record
```

**验收用例**：

- succeeded run；
- failed assertion run；
- approval denied run；
- replay run；
- insufficient evidence run；
- no-op automation run；
- parent workflow with child run。

**Run Review V1 UI checklist**：

- Run Queue 按 Needs Action、Failed / Degraded、Awaiting Approval、Replay / Eval、Recent Succeeded 分组或统计。
- Run row 展示 trust label，且 trust label 不从 final text 推导。
- Run Trust Header 展示 `evidence-backed`、`needs-review`、`insufficient-evidence`、`replay-only` 或 `not-checked`。
- `freshExecution=false` 必须显示 `Replay result, not a fresh execution`，不得显示 fresh success。
- empty evidence 必须显示 `Not enough evidence to mark this run successful` 或 `Not checked`，不得显示成功。
- approval denied 必须显示 `Stopped because approval was denied`，denied tool 不得显示 succeeded。
- no-op automation 必须显示 scope 与 `doesNotProve`，不得显示系统健康。
- parent workflow failure / timeout / budget exhaustion 优先于 child success。
- Proof Boundary 组件必须持续展示 Proven、Not proven、Assumptions、Evidence gaps。
- Timeline 必须区分 route/profile、skill、tool/approval、evidence/assertion、repair/escalation、terminal outcome。

**稳定性要求**：

- record 缺字段时 UI 不崩；
- unknown status 显示为 `unknown`，不得显示成功；
- evidence 为空显示 `not_checked`；
- replay run 明确标记 `freshExecution: false`；
- failed run 必须突出 blocking evidence；
- raw payload 默认使用 redacted / summarized 版本。

### P0-03：Skill Explanation Surface

**目标**：用户能看懂“为什么这次用了这个 skill，它是否可靠，它有没有通过 eval”。

**建议数据形态**：

```ts
interface SkillMatchExplanation {
  name: string;
  status: "learned-note-only" | "candidate" | "verified" | "deprecated" | "blocked";
  reason: string;
  injected: boolean;
  riskDelta: RiskLevel;
  evalCoverage: string[];
}
```

**UI 行为**：

| Skill 状态 | 行为 |
|---|---|
| verified | 正常显示 eval coverage |
| candidate | 显示“候选，需 review” |
| learned-note-only | 不默认注入 |
| deprecated | 显示 warning |
| blocked | 命中也不能注入 |
| no skill | 显示 none，不伪装为系统错误 |

**验收用例**：verified skill 正常注入；candidate 有提示；blocked 不注入；deprecated 显示 warning；no skill 显示 none；match reason 可读。

### P0-04：Eval-run Linkage and Report UX

**目标**：eval 不只是命令行 JSON，而是可复盘产品入口。

**Run linkage UX 规范**：[`../../docs/superpowers/specs/2026-06-23-eval-run-linkage-report-ux-design.md`](../../docs/superpowers/specs/2026-06-23-eval-run-linkage-report-ux-design.md)。

**链路要求**：

```text
eval case
  -> run id
  -> run record
  -> Workbench case detail
  -> reviewer verdict / next action
```

**必须实现 / 保持**：

- L2 eval 每个 case 生成或引用 run record；
- report 中包含 run id；
- Workbench 中 case 可点击进入 Run Detail；
- false confidence findings 独立展示；
- route accuracy、task success、evidence quality 分开显示；
- replay report 标注 `freshExecution: false`；
- 不出现“总健康分 100%”。

**新增或强化 L2 cases**：no-op automation、stale skill blocked、deprecated skill warning、parent timeout child success、reviewer readonly violation、redaction leak guard、replay stale schema、insufficient evidence success claim。

### P0-05：Stability Hardening Gate

**目标**：把防自欺红线变成主干测试和 CI/验收门。

**Stability Gate 规范**：[`../../docs/superpowers/specs/2026-06-23-stability-hardening-gate-design.md`](../../docs/superpowers/specs/2026-06-23-stability-hardening-gate-design.md)。

**本地门禁入口**：

```bash
corepack pnpm --filter @keigent/engine eval:stability -- --compact
```

**红线测试**：

| 风险 | 测试要求 |
|---|---|
| final text 伪造成功 | `finalResponse` 不能单独让 status=`succeeded` |
| tool attempted 当 succeeded | attempted / succeeded 分开 |
| replay 伪装 fresh | replay 必须 `freshExecution=false` |
| empty evidence 100% | empty evidence -> `not_checked` |
| approval 绕过 | R3+ 必须有 approval trail |
| blocked skill 注入 | blocked 永不注入 |
| reviewer 写操作 | readonly reviewer 不能写 |
| parent timeout 被 child success 覆盖 | late success 不覆盖 parent failure |
| secret 泄漏 | redaction test 覆盖 CLI / Web / Eval |

**P0 完成定义**：P0-01 ~ P0-05 全部完成后，必须提交一份 acceptance delta，包含文件清单、测试清单、命令输出、eval 报告路径、已证明/未证明矩阵与剩余风险。

当前 P0 acceptance delta：[`../evals/11-p0-acceptance-delta-2026-06-23.md`](../evals/11-p0-acceptance-delta-2026-06-23.md)。

---

## 4. P1：Loop 可治理

P1 的目标是把 KeiGent 从“可审计单次 run”推进到“本地 operator 可以持续治理 loop”。P1 不能绕过 P0 的 RunRecord / Workbench / evidence / redaction 基础。

### P1 总表

| 编号 | 开发包 | 估算 | 交付目标 | 核心验收 |
|---|---|---:|---|---|
| P1-01 | Reviewed-loop v1 | 5 ~ 8 人日 | maker / checker 分离产品化 | reviewer readonly，不能覆盖 failed assertion |
| P1-02 | Local Automation Triage | 4 ~ 7 人日 | 第一个低风险本地 automation | no-op / failed / degraded 语义正确 |
| P1-03 | Worktree Isolation Foundation | 5 ~ 8 人日 | child workspace 不污染主 workspace | cleanup、artifact 回收、conflict detection 可验 |
| P1-04 | Schema Migration / Redaction Hardening | 4 ~ 6 人日 | 长期 run store 稳定 | 旧 record 可读，secret 不进 UI |
| P1-05 | CLI Operator Ergonomics | 3 ~ 5 人日 | operator 可用的 runs/eval 命令 | `--json`、`--compact`、next action、failure code 清晰 |

### P1-01：Reviewed-loop v1

**目标**：把 maker / checker 分离做成产品语义，而不是同一模型自证成功。

**Reviewed-loop V1 规范**：[`../../docs/superpowers/specs/2026-06-23-reviewed-loop-v1-design.md`](../../docs/superpowers/specs/2026-06-23-reviewed-loop-v1-design.md)。

**目标流程**：

```text
worker 执行
-> reviewer readonly 审查
-> parent 汇总 verdict
-> RunRecord 展示 worker / reviewer 两个角色
```

**需要设计 / 实现**：reviewer role、readonly tool policy、review rubric schema、reviewed-loop result mapping、child role 进入 RunRecord、reviewer blocking / non-blocking issue、eval fixture。

**验收标准**：

- reviewer 默认 readonly；
- reviewer 不能修改 worker artifact；
- reviewer 说通过不能覆盖 failed assertion；
- parent 能汇总 worker / reviewer 结果；
- Workbench 能区分 worker / reviewer timeline；
- reviewed-loop 有 real-world L2 fixture。

**当前增量**：[`../evals/12-reviewed-loop-v1-delta-2026-06-23.md`](../evals/12-reviewed-loop-v1-delta-2026-06-23.md) 显式化 `reviewerReadonly` policy contract，并验证宽松 caller policy 不会放宽 reviewer child。

### P1-02：Local Automation Triage

**目标**：做第一个低风险 automation，用于本地 run store 的失败/降级/证据缺口 triage。

**Local Automation Triage 规范**：[`../../docs/superpowers/specs/2026-06-23-local-automation-triage-design.md`](../../docs/superpowers/specs/2026-06-23-local-automation-triage-design.md)。

**建议入口**：

```bash
keigent automation triage local
# 或 CLI 现有结构下的等价入口：keigent runs triage
```

**读取范围**：最近 runs、failed / degraded、blocking failure、false-confidence finding、stale records、missing evidence。

**输出**：triage report、no-op record、recommended next action、source run ids。

**no-op 语义**：

```text
No triage candidates found.
Status: no-op
Scope: last N runs
Does not prove: no hidden failures outside this scope.
```

**验收用例**：无 failed runs -> no-op；failed assertion -> blocking issue；degraded run -> review needed；missing evidence -> insufficient evidence；stale schema -> migration warning；report contains source run ids。

**当前增量**：[`../evals/13-local-automation-triage-delta-2026-06-23.md`](../evals/13-local-automation-triage-delta-2026-06-23.md) 强化默认 human 输出，显式展示 automation record、report、trajectory、source run ids、next action 与 no-op proof boundary。

### P1-03：Worktree Isolation Foundation

**目标**：为 future fanout、reviewer、verifier、judge 和 tournament 打地基，但不提前实现炫技编排。

**先决文档**：`doc/design/14-worktree-isolation-and-parallel-runs.md` 必须保持为事实源。

**Worktree Isolation conflict summary 规范**：[`../../docs/superpowers/specs/2026-06-23-worktree-isolation-conflict-summary-design.md`](../../docs/superpowers/specs/2026-06-23-worktree-isolation-conflict-summary-design.md)。

**最小能力**：

- create isolated workspace；
- branch naming；
- cleanup；
- artifact collection；
- conflict detection；
- parent / child run mapping。

**验收标准**：每个 child run 有 workspace id；cleanup 可控；abandoned work 有记录；reviewer 不直接在 worker workspace 写；artifact 能回收；failure 不污染主 workspace。

**当前增量**：[`../evals/14-worktree-isolation-conflict-summary-delta-2026-06-23.md`](../evals/14-worktree-isolation-conflict-summary-delta-2026-06-23.md) 强化 workflow-level 跨 child artifact conflict summary，保证 `WorkflowResult` 与 workflow trajectory 可审计。

### P1-04：Schema Migration / Redaction Hardening

**目标**：让长期运行的 run store 更稳定，并降低 UI / eval / debug 泄密风险。

**Debug Bundle Redaction Summary 规范**：[`../../docs/superpowers/specs/2026-06-23-debug-bundle-redaction-summary-design.md`](../../docs/superpowers/specs/2026-06-23-debug-bundle-redaction-summary-design.md)。

**Schema migration**：`schemaVersion` 读取、legacy record fallback、unknown status fallback、missing field defaults、migration report。

**Redaction 覆盖**：API key、bearer token、文件路径敏感部分、tool output secret、config values、connector payload。

**验收标准**：旧 record 不导致 Web 崩溃；secret 不进入 UI；raw payload 默认不存；redaction summary 明确；redaction test 覆盖 CLI / Web / Eval。

**当前增量**：[`../evals/15-debug-bundle-redaction-summary-delta-2026-06-23.md`](../evals/15-debug-bundle-redaction-summary-delta-2026-06-23.md) 为 debug bundle 增加独立 `redaction-summary.json`，让 redaction policy、scope、raw payload 边界和未证明内容可审计。

### P1-05：CLI Operator Ergonomics

**目标**：让本地 operator 不必理解内部文件结构，也能使用 runs / eval / replay / triage。

**CLI runs replay handoff 规范**：[`../../docs/superpowers/specs/2026-06-23-cli-runs-replay-handoff-design.md`](../../docs/superpowers/specs/2026-06-23-cli-runs-replay-handoff-design.md)。

**建议命令**：

```bash
keigent runs list
keigent runs show <run-id>
keigent runs open <run-id>
keigent runs replay <run-id>
keigent runs triage
keigent eval real-world --open
```

**输出要求**：human-friendly 默认；`--json` 机器可读；`--compact` 简洁；failure code 高亮；next action 可见；正式 CLI 入口减少 pnpm wrapper 噪音。

**当前增量**：[`../evals/16-cli-runs-replay-handoff-delta-2026-06-23.md`](../evals/16-cli-runs-replay-handoff-delta-2026-06-23.md) 强化 `runs replay <run-id>` handoff，默认输出可复制 replay command、fresh execution 边界、does-not-prove 和 next action。

---

## 5. P2：Ops 可扩展

P2 的目标是把本地 Agent Operations 系统做得更完整，但仍坚持 readonly-first、evidence-first、approval-first。P2 不是放开外部写操作，也不是把自动 judge 当成人类 reviewer。

### P2 总表

| 编号 | 开发包 | 估算 | 交付目标 | 核心验收 |
|---|---|---:|---|---|
| P2-01 | Readonly Connector Baseline | 5 ~ 8 人日 | 外部 source readonly 可控 | connector 经 ToolRegistry，write path unsupported |
| P2-02 | L3 Operator Scenario Eval | 4 ~ 6 人日 | 人工 operator journey 可验收 | packet / sign-off 不伪装真人审证 |
| P2-03 | Observability / Debug Package | 4 ~ 7 人日 | debug bundle 可交付开发者定位问题 | 不复现环境也能判断大致问题 |
| P2-04 | Release / Packaging / Upgrade Path | 4 ~ 6 人日 | CLI / config / upgrade 更像产品 | first-run、upgrade、release checklist、compatibility 清晰 |
| P2-05 | Performance / Budget Controls | 3 ~ 5 人日 | loop、child、tool、retry 有预算边界 | 超预算终止并进入 RunRecord / Workbench / eval |

### P2-01：Readonly Connector Baseline

**目标**：先做 readonly connector，不碰外部写操作。

**候选 connector**：local git readonly、GitHub readonly、HTTP readonly、file readonly、browser readonly。

**所有 connector 必须经过 ToolRegistry 并具备**：permission、risk、sideEffect、reversible、timeout、outputLimit、redaction、approvalPolicy。

**验收标准**：readonly 不审批但记录 source；failed connector 有 failure code；secret 不泄漏；external source 进入 evidence；write path 明确 unsupported。

### P2-02：L3 Operator Scenario Eval

**目标**：进入真实 operator 旅程验收，但不让 judge 自动替代人类 reviewer。

**建议场景**：Repo acceptance、Failure triage、Skill promotion review、Workbench review、Governed execution、Automation no-op review、Connector readonly review。

**评审输出**：accepted / deferred / rejected、confidence、false confidence risks、blocking issues、next actions、evidence links。

**边界**：fixture、packet、sign-off 校验都不等同真人审证本身；最终接受仍需要人类 reviewer 检查证据后签署或覆盖决定。

### P2-03：Observability / Debug Package

**目标**：让开发者拿到一个 debug bundle 后，不复现环境也能判断大致问题。

**功能**：structured event timeline、tool latency summary、model latency summary、timeout / abort summary、retry / recovery summary、failure taxonomy dashboard、export debug bundle。

**Debug bundle 内容**：

```text
record.json
trajectory.json
workflow-trajectory.json
eval-case.json
redacted-config.json
tool-summary.json
failure-summary.md
observability-summary.json
```

**验收标准**：debug bundle 脱敏；包含 failure summary；包含 budget/recovery/timeout/abort；缺失 latency 时显示 `not_recorded` 而不是伪造。

### P2-04：Release / Packaging / Upgrade Path

**目标**：从开发仓库走向本地产品。

**需要做**：bin entry、package exports、config migration、sample config、first-run guide、doctor 改进、Node 22+ CI、release checklist、changelog、version compatibility。

**特别要求**：通过 pnpm 启动时，JSON 输出前可能有 wrapper 噪音；正式 CLI 必须提供更干净入口。

**验收标准**：新用户能按 first-run guide 完成配置与最小 eval；config upgrade 有兼容边界；doctor 给出可执行修复建议；release checklist 可复现。

### P2-05：Performance / Budget Controls

**目标**：让 loop 不失控。

**需要覆盖**：max iterations、max tool calls、max child runs、max wall time、max token estimate、per-tool timeout、retry budget、budget exceeded failure code、budget summary 进入 RunRecord。

**验收标准**：超预算不会继续跑；failure code 稳定；parent / child budget 分开；Workbench 显示预算耗用；eval 覆盖 budget exceeded；自定义 endpoint 未配置价格时显示 `pricing_not_configured`，不内置过期价格。

---

## 6. 跨优先级共同验收红线

以下红线适用于所有优先级：

| 红线 | 要求 |
|---|---|
| final text 不能证明成功 | 成功必须由 assertion/evidence/verdict/RunRecord 支撑 |
| fixture pass 不能等于产品健康 | report 必须写清证明范围与未证明内容 |
| replay 不能伪装 fresh execution | `freshExecution=false` 必须进入 UI/report |
| no-op 不能伪装健康 | 必须显示 scope 与 doesNotProve |
| skill 命中不能等于 skill 可靠 | 必须显示 status、match reason、eval coverage |
| reviewer 不能等于 worker | reviewer readonly，不能写 worker artifact |
| child success 不能覆盖 parent failure | parent timeout / abort / budget failure 优先 |
| raw payload 不能直接进 UI | 默认 redacted / summarized |
| provider-neutral 不能假装能力相同 | toolCalling / streaming / jsonMode / vision 等能力必须显式声明 |
| 外部写操作不能默认开放 | P2 只允许 readonly connector baseline；write path unsupported |

---

## 7. 开发交付模板

每个开发包完成时，开发者必须提交以下内容：

```markdown
## Backlog Item

- 编号：P0-01 / P1-03 / P2-05
- 开发包：
- 目标：
- 非目标：

## Changed Files

- ...

## Tests / Evals

- 命令：
- 结果：
- 报告路径：

## Evidence

- 已证明：
- 未证明：
- 假设：
- evidence gaps：

## Risks / Follow-ups

- blocking：
- non-blocking：
- next action：
```

---

## 8. 推荐开发顺序

1. **P0-01 RunRecord Completeness**：先统一事实源，否则 UI / eval / debug 会各说各话。
2. **P0-02 Workbench Run Detail v1**：让事实可被人审计。
3. **P0-03 Skill Explanation Surface**：补齐 skill-driven 产品可信度。
4. **P0-04 Eval-run Linkage and Report UX**：让 eval 与产品界面闭环。
5. **P0-05 Stability Hardening Gate**：把自欺风险锁进测试。
6. **P1-04 Schema Migration / Redaction Hardening**：P1 早期先补长期安全地基。
7. **P1-01 Reviewed-loop v1**：在 redaction / record 稳定后做 maker/checker。
8. **P1-03 Worktree Isolation Foundation**：给 child run 和未来并行能力打地基。
9. **P1-02 Local Automation Triage**：基于稳定 run store 做第一个 automation。
10. **P1-05 CLI Operator Ergonomics**：把 operator 常用路径收口为产品命令。
11. **P2-03 Observability / Debug Package**：降低后续复杂问题定位成本。
12. **P2-04 Release / Packaging / Upgrade Path**：进入更稳定的本地产品分发。
13. **P2-05 Performance / Budget Controls**：强化长期运行边界。
14. **P2-01 Readonly Connector Baseline**：只读接入外部 source。
15. **P2-02 L3 Operator Scenario Eval**：用 operator 旅程做更高阶验收。

---

## 9. 暂缓事项

以下事项不进入本轮优先级，除非 P0/P1/P2 的证据与治理基础已经完成：

- fanout-synthesis；
- tournament ranking；
- dynamic planner；
- 任意 autonomous swarm；
- 外部写 connector；
- 自动 judge 替代 reviewer；
- SaaS 多租户、远程队列、云端权限系统；
- 以总健康分或漂亮 dashboard 替代 proof boundary。
