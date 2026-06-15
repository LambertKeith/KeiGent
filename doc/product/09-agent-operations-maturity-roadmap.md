# Agent Operations Maturity Roadmap

> **状态**：下一阶段产品 / 架构 / 验收蓝图  
> **角色边界**：本文件面向设计师、架构师、产品负责人、验收人与 coding agent，不是单次实现说明。  
> **核心原则**：需求为王；不以阶段性 demo 或 MVP 为目标；所有后续开发必须能被产品逻辑、证据与验收用例约束。

---

## 1. 背景与目标

KeiGent 当前已经具备 profile-switchable loop、workflow envelope、risk / approval、success evidence、eval / replay、Workbench view model 等基础能力。但这些能力还没有完全组成一个长期可运营的本地 Agent Operations 系统。

下一阶段的目标不是“再做一个可演示功能”，而是把 KeiGent 推进到：

> **本地可持续运营的 Agent Operations Workbench。**

这意味着系统必须持续回答：

1. 每次 run 为什么这样路由？
2. 每个成功是否有证据？
3. 每个失败是否有 failure code、blocking evidence 与下一步？
4. 每个 skill 是否有状态、来源、eval coverage 与风险边界？
5. 每个 automation 是否能表达 no-op、scope 与未证明内容？
6. 每个 sub-agent 是否有角色、权限、review 责任与 parent / child 关系？
7. 每个 eval 是否明确它能证明什么、不能证明什么？

---

## 2. 产品成熟度判断

### 2.1 已经被证明的能力

| 能力 | 当前状态 | 证明方式 |
|---|---|---|
| 单一 `LoopEngine` + 多 profile | 已有基础 | 架构文档、profile routing、orchestrator eval |
| success evidence / assertion | 已有基础 | smoke / real-world eval、failure semantics 文档 |
| workflow envelope | 已有基础 | workflow run envelope 文档与基线实现 |
| risk / approval governance | 已有基础 | permission-risk 文档与相关测试 |
| skill lifecycle 方向 | 已有设计 | skill governance 文档 |
| eval / replay 基线 | 已有基础 | smoke、orchestrator、real-world、replay fixture |
| Web Workbench | view model / 静态 shell 阶段 | web blueprint 与当前 README 约束 |

### 2.2 尚未充分证明的能力

| 未完成能力 | 风险 |
|---|---|
| RunRecord 作为所有 run 的事实源仍不完整 | UI、eval、debug、automation 会各说各话 |
| Workbench 还不能审计真实 run 全链路 | 用户无法复盘 agent 行为 |
| skill 解释面不足 | 用户不知道为什么注入某个 skill、是否可靠 |
| eval 与 run detail 没有产品级联动 | eval 仍可能停留在孤立 JSON 报告 |
| reviewed-loop 的 maker/checker 没有产品化 | review 容易变成同一模型自证成功 |
| automation no-op / scope / 未证明内容不够明确 | 容易出现“没有发现问题 = 系统健康”的虚假信心 |
| worktree isolation 尚未成为并行工作的前置地基 | fanout / tournament 会污染主 workspace |
| connector 还未进入 readonly-first 产品约束 | 外部系统风险、权限、redaction 不可控 |
| debug bundle / observability 不完整 | 失败定位依赖人工猜测 |
| 性能与预算边界不够产品化 | loop、child run、tool call 可能失控 |

---

## 3. 总体路线

后续路线分为四个 maturity milestone：

```text
Milestone 1：Run 可审计
Milestone 2：Eval 可复盘
Milestone 3：Loop 可治理
Milestone 4：Ops 可扩展
```

推荐工作量估算：

```text
59 ~ 96 人日
约 12 ~ 20 周单人工作量
约 6 ~ 10 周双人工作量
约 4 ~ 7 周三人小队工作量
```

这不是表面功能估算，而是包括产品设计、实现、测试、eval、文档、回归、UI view model、CLI、failure case 与稳定性治理。

---

## 4. Milestone 1：Run 可审计

### 4.1 目标

让当前已有的 RunRecord、Workbench、skill 治理与稳定性测试形成第一条产品闭环。

### 4.2 开发包

| 编号 | 开发包 | 估算 | 优先级 |
|---|---|---:|---|
| M1-A | Workbench Run Detail v1 | 5 ~ 8 人日 | P0 |
| M1-B | RunRecord Completeness | 4 ~ 7 人日 | P0 |
| M1-C | Skill Explanation Surface | 3 ~ 5 人日 | P0 |
| M1-D | Stability Hardening Gate | 3 ~ 5 人日 | P0 |

### 4.3 Workbench Run Detail v1

#### 产品目标

Web 不再只是静态 shell，而是能审计真实 run。

#### 范围

Run List 至少展示：

- run id；
- status；
- createdAt；
- profile；
- workflow mode；
- risk level；
- evidence summary；
- duration；
- replay status。

Run Detail 至少包含：

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
```

#### 必须回答的问题

| 问题 | 页面证据 |
|---|---|
| 为什么选这个 profile？ | Route panel |
| 用了哪些 skill？ | Skills panel |
| 做了哪些工具调用？ | Tools / Timeline |
| 成功证据是什么？ | Evidence panel |
| 有无风险动作？ | Risk panel |
| 失败在哪里？ | Failure panel |
| 能否 replay？ | Replay panel |
| 下一步怎么办？ | Next Action |

#### 验收用例

1. succeeded run；
2. failed assertion run；
3. approval denied run；
4. replay run；
5. insufficient evidence run；
6. no-op automation run，先预留产品语义；
7. parent workflow with child run，先预留产品语义。

#### 稳定性要求

- record 缺字段时 UI 不崩；
- unknown status 显示为 `unknown`，不得显示成功；
- evidence 为空显示 `not_checked`；
- replay run 明确标记 `freshExecution: false`；
- failed run 必须突出 blocking evidence。

当前实现备注（2026-06-15）：已新增前端内存事件流 Live Run Console、Web Run Launcher，以及 Run Workbench v1 审计 surface。Live Run Console 展示 live/replay 标签、event timeline、pending tool/checkpoint/approval 统计与 selected event inspector；Run Workbench 包含 Run list、Run summary、Timeline、Route and skills、Evidence、Risk and approvals、Tools and budget、Replay and artifacts、Failures、Raw redacted record。Run list 已展示 run id、status、createdAt、profile、workflow mode、risk、evidence summary、duration 与 replay status。页面使用 `RunRecord` / progress event view model，默认选择最新 run，展示 needs-action / replayable / failed-degraded 队列统计，并在 inspector 中递归脱敏。已新增 `keigent web --api` 本地 API/SSE foundation，支持读取 run store、读取 latest real-world eval report、以 `task.source=web` 发起 run、订阅 run session workflow events、更新 Live Console，并在收到 `run_finished.recordId` 后 handoff 到 Run Detail；当前仍不是完整交互式 Workbench。

### 4.4 RunRecord Completeness

#### 产品目标

`RunRecord` 成为所有运行路径的产品事实源。

#### 需要覆盖的 run 类型

| 类型 | 要求 |
|---|---|
| CLI single run | 必须生成 record |
| workflow run | parent / child 关系清晰 |
| eval run | case result 可关联 run id |
| replay run | `freshExecution: false` |
| failed run | failure code + blocking evidence |
| approval run | approval trail |
| no-op run | 合法状态，不伪装 success |
| automation run | 预留 source / scope / no-op |

#### Parent / child mapping

RunRecord 必须能够表达：

```ts
parentRunId?: string;
childRunIds?: string[];
childRole?: "worker" | "reviewer" | "verifier" | "judge";
```

#### Artifact model

统一管理：

- trajectory；
- workflow trajectory；
- eval report；
- replay report；
- generated file；
- diff；
- log excerpt。

#### Schema compatibility

当前 schemaVersion 为 1。兼容读取要求：

- 旧 record 读取；
- unknown field 容忍；
- missing field fallback；
- Web compatibility；
- migration report。

当前实现备注（2026-06-12）：`readRunStore` 会在兼容归一化的同时生成只读 migration report，区分 missing / unsupported schemaVersion、unknown status 与 missing core fields；报告通过 `runs list --json|--compact` 和本地 Web API 暴露，Run Workbench 显示 Schema compatibility 摘要。该流程不会自动写回或修改历史 RunRecord。

#### 验收标准

任意 run 都能从 record 回答：

```text
任务是什么？
为什么这么路由？
用了什么 skill？
调了什么工具？
证据是什么？
风险是什么？
失败在哪里？
是否可 replay？
下一步是什么？
```

### 4.5 Skill Explanation Surface

#### 产品目标

让用户知道：

> 为什么这次用了这个 skill？它是否可靠？它有没有通过 eval？

#### 建议数据形态

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

#### UI 行为

| Skill 状态 | UI 行为 |
|---|---|
| verified | 正常显示 eval coverage |
| candidate | 显示“候选，需 review” |
| learned-note-only | 不默认注入 |
| deprecated | 显示 warning |
| blocked | 命中也不能注入 |

#### 验收用例

- verified skill 正常注入；
- candidate skill 有提示；
- blocked skill 不注入；
- deprecated skill 显示 warning；
- no skill 显示 none；
- skill match reason 可读。

当前实现备注（2026-06-12）：已新增 Skill Workbench 治理 surface，包含 Skill list、Selected skill、Match explanations、Governance、Eval coverage、Recent matches and learning。页面展示 executable / needs-review / blocked-deprecated / eval coverage 队列统计，区分 verified、candidate、blocked、deprecated 等状态，并显示 injected、risk delta、operator message、source trajectory 与 eval coverage 链接。Trigger conditions 与 required/allowed tools、permissions、non-goals、dangerous actions 分开展示，避免把安全边界误当成匹配理由。CLI 同步提供只读 `skill list` / `skill inspect` inventory，能查看全部生命周期状态、source、coverage 与安全边界；当前仍是只读审计面，不包含 promotion/apply 操作。

### 4.6 Stability Hardening Gate

#### 产品目标

建立稳定性红线测试，防止后续功能越做越散。

#### 红线测试

| 风险 | 测试 |
|---|---|
| final text 伪造成功 | finalResponse 不能单独让 status=succeeded |
| tool attempted 当 succeeded | attempted / succeeded 分开 |
| replay 伪装 fresh | replay 必须 `freshExecution=false` |
| empty evidence 100% | empty evidence -> `not_checked` |
| approval 绕过 | R3+ 必须有 approval trail |
| blocked skill 注入 | blocked 永不注入 |
| reviewer 写操作 | readonly reviewer 不能写 |
| parent timeout 被 child success 覆盖 | late success 不覆盖 parent failure |
| secret 泄漏 | redaction test |

---

## 5. Milestone 2：Eval 可复盘

### 5.1 目标

让 real-world eval 从“JSON 报告”变成可复盘产品入口。

### 5.2 开发包

| 编号 | 开发包 | 估算 | 优先级 |
|---|---|---:|---|
| M2-A | Eval-run linkage and report UX | 3 ~ 5 人日 | P0 |
| M2-B | L2 false-confidence case expansion | 包含在 M2-A 或独立拆分 | P0 |

### 5.3 链路要求

```text
eval case
  -> run id
  -> run record
  -> Workbench case detail
  -> reviewer verdict
```

功能要求：

- L2 eval 每个 case 生成或引用 run record；
- report 中包含 run id；
- Workbench 中 case 可点击进入 Run Detail；
- false confidence findings 独立展示；
- route accuracy、task success、evidence quality 分开显示；
- 不出现“总健康分 100%”。

### 5.4 新增 L2 cases

建议新增：

1. no-op automation；
2. stale skill blocked；
3. deprecated skill warning；
4. parent timeout child success；
5. reviewer readonly violation；
6. redaction leak guard；
7. replay stale schema；
8. insufficient evidence success claim。

### 5.5 验收标准

- eval case 可以跳转或关联到 run detail；
- report 不把 fixture/schema 通过率包装成产品健康度；
- false confidence findings 有独立区域；
- replay 与 fresh execution 明确分离；
- insufficient evidence 不被记为成功。

当前实现备注（2026-06-12）：已新增 Dashboard real-world eval surface，展示 route accuracy、task success、evidence quality、tool reliability、risk compliance 的分离指标；case table 包含 `runDetailHref` 指向 `#runs/<runId>`；false-confidence findings 独立展示；replay case 显示为 Replay report，不伪装 fresh execution；页面文案明确 fixture-level report 不是 product health。`eval real-world --open` 会持久化每个 L2 case 的 `RunRecord` 和 latest report，Web API 可读取 latest report，产品 E2E 覆盖 `eval case -> saved RunRecord -> Web API -> Workbench Run Detail` 链路。

---

## 6. Milestone 3：Loop 可治理

### 6.1 目标

让 KeiGent 具备受控的 loop operations 能力，同时不提前进入不可审计的 fanout / tournament。

### 6.2 开发包

| 编号 | 开发包 | 估算 | 优先级 |
|---|---|---:|---|
| M3-A | Reviewed-loop v1 | 5 ~ 8 人日 | P1 |
| M3-B | Local Automation Triage | 4 ~ 7 人日 | P1 |
| M3-C | Worktree Isolation Foundation | 5 ~ 8 人日 | P1 |
| M3-D | Schema Migration / Redaction Hardening | 4 ~ 6 人日 | P1 |
| M3-E | CLI Operator Ergonomics | 3 ~ 5 人日 | P1 |

### 6.3 Reviewed-loop v1

#### 产品目标

maker / checker 分离产品化。

```text
worker 执行
-> reviewer readonly 审查
-> parent 汇总 verdict
-> RunRecord 展示两个角色
```

#### 需要设计

- reviewer role；
- readonly tool policy；
- review rubric schema；
- reviewed-loop result mapping；
- child role 进入 RunRecord；
- reviewer blocking / non-blocking issue；
- eval fixture。

#### Rubric schema

```ts
interface ReviewRubric {
  taskGoal: string;
  successCriteria: string[];
  requiredEvidence: string[];
  forbiddenClaims: string[];
  falseConfidenceRisks: string[];
  blockingIssueRules: string[];
}
```

#### 验收标准

- reviewer 默认 readonly；
- reviewer 不能修改 worker artifact；
- reviewer 说通过不能覆盖 failed assertion；
- parent 能汇总 worker / reviewer 结果；
- Workbench 能区分 worker / reviewer timeline；
- reviewed-loop 有 real-world L2 fixture。

当前实现备注（2026-06-12）：`reviewed-loop` 已支持 worker + readonly reviewer child run、默认 `ReviewRubric`、`ReviewSummary`、reviewer blocking issue 汇总、RunRecord 持久化与 Run Workbench 的 Review rubric / Reviewer issues 展示。reviewer 的通过不会覆盖 worker failed assertion；review issue 目前由 reviewer checkpoint evidence 派生，后续仍可扩展更细的 reviewer rubric parser。

### 6.4 Local Automation Triage

#### 产品目标

做第一个低风险 automation。

建议入口：

```bash
keigent automation triage local
```

读取：

- 最近 runs；
- failed / degraded；
- blocking failure；
- false confidence finding；
- stale records；
- missing evidence。

输出：

- triage report；
- no-op record；
- recommended next action。

#### no-op 语义

没有失败时不能显示“系统健康 100%”。必须表达：

```text
No triage candidates found.
Status: no-op
Scope: last N runs
Does not prove: no hidden failures outside this scope.
```

#### 验收用例

- no failed runs -> no-op；
- failed assertion -> blocking issue；
- degraded run -> review needed；
- missing evidence -> insufficient evidence；
- stale schema -> migration warning；
- report contains source run ids。

当前实现备注（2026-06-12）：`automation triage local` 已实现本地 run store 扫描、no-op RunRecord 写入、failed / degraded / missing evidence / stale schema 候选输出。triage 会消费 `readRunStore` 的只读 migration report；即使 legacy record 被兼容归一化为 `succeeded` + `passed`，只要存在 schema migration warning，也会以 `stale_schema` 候选进入报告，并保留 source run id、warning code、blocking schema warning 与 next action。no-op record 继续显式展示 scope 与 doesNotProve，不宣称系统健康。

### 6.5 Worktree Isolation Foundation

#### 产品目标

为未来 fanout / tournament / automation spawned work 打地基。

先新增或完善设计文档：

```text
doc/design/14-worktree-isolation-and-parallel-runs.md
```

然后做最小 utility：

- create isolated workspace；
- branch naming；
- cleanup；
- artifact collection；
- conflict detection；
- parent / child run mapping。

#### 验收标准

- 每个 child run 有 workspace id；
- cleanup 可控；
- abandoned work 有记录；
- reviewer 不直接在 worker workspace 写；
- artifact 能回收；
- failure 不污染主 workspace。

当前实现备注（2026-06-12）：已新增 worktree isolation foundation utility 与设计事实源 [`../design/14-worktree-isolation-and-parallel-runs.md`](../design/14-worktree-isolation-and-parallel-runs.md)。`createIsolatedWorkspace()` 会生成稳定 workspace id、branch naming 和 parent / child / role manifest；`collectWorkspaceArtifacts()`、`detectWorkspaceConflicts()`、`cleanupIsolatedWorkspace()` 覆盖 artifact 回收、同路径冲突检测、remove / mark-abandoned 清理语义，`canWriteWorkspace()` 明确 reviewer / verifier 不写 worker workspace。当前仍未自动执行 `git worktree add`，也未把 workspace 创建接入所有 workflow child run；因此只证明隔离基础原语和策略可用，不证明 fanout、并行调度、自动 merge 或主 workspace 污染防护已经产品化完成。

### 6.6 Schema Migration / Redaction Hardening

#### 产品目标

让长期运行的 run store 更稳定。

#### Schema migration

- `schemaVersion` 读取；
- legacy record fallback；
- unknown status fallback；
- missing field defaults；
- migration report。

当前实现备注（2026-06-12）：已实现只读 RunRecord migration diagnostics，CLI / Web API / Workbench 可查看归一化数量、legacy / unsupported 数量与逐条 warning；仍未实现自动重写或批量迁移，避免静默改变历史审计数据。

#### Redaction

- API key；
- bearer token；
- file path 中的敏感部分；
- tool output 中的 secret；
- config values；
- connector payload。

#### 验收标准

- 旧 record 不导致 Web 崩溃；
- secret 不进入 UI；
- raw payload 默认不存；
- redaction summary 明确；
- redaction test 覆盖 CLI / Web / Eval。

### 6.7 CLI Operator Ergonomics

#### 产品目标

让本地 operator 更容易使用。

建议命令：

```bash
keigent runs list
keigent runs show <run-id>
keigent runs open <run-id>
keigent runs replay <run-id>
keigent runs triage
keigent eval real-world --open
```

输出要求：

- human-friendly 默认；
- `--json` 机器可读；
- `--compact` 简洁；
- failure code 高亮；
- next action 可见；
- 正式 CLI 入口必须减少 pnpm wrapper 噪音。

当前实现备注（2026-06-12）：`runs list/show/open/replay/triage/debug-bundle` 已有 CLI 入口与 `--json|--compact` 输出。`runs triage` 会输出 blocking failure、failed / degraded / cancelled review、missing evidence 与 stale schema 候选；triage 消费只读 migration diagnostics，因此 schema warning 不会因为兼容归一化为 `succeeded` 而从 operator 队列消失。每个候选包含 source run id、reason、blocking 信息与 next action。

---

## 7. Milestone 4：Ops 可扩展

### 7.1 目标

让 KeiGent 更接近长期可用的本地 Agent Ops 系统，但仍然遵守 readonly-first、evidence-first 与 approval-first 的边界。

### 7.2 开发包

| 编号 | 开发包 | 估算 | 优先级 |
|---|---|---:|---|
| M4-A | Readonly Connector Baseline | 5 ~ 8 人日 | P2 |
| M4-B | L3 Operator Scenario Eval | 4 ~ 6 人日 | P2 |
| M4-C | Observability / Debug Package | 4 ~ 7 人日 | P2 |
| M4-D | Release / Packaging / Upgrade Path | 4 ~ 6 人日 | P2 |
| M4-E | Performance / Budget Controls | 3 ~ 5 人日 | P2 |

### 7.3 Readonly Connector Baseline

#### 产品目标

先做 readonly connector，不碰外部写操作。

候选 connector：

- local git readonly；
- GitHub readonly；
- HTTP readonly；
- file readonly；
- browser readonly。

所有 connector 必须经过 ToolRegistry，并具备：

```text
permission
risk
sideEffect
reversible
timeout
outputLimit
redaction
approvalPolicy
```

#### 验收标准

- readonly 不审批但记录 source；
- failed connector 有 failure code；
- secret 不泄漏；
- external source 进入 evidence；
- write path 明确 unsupported。

当前实现备注（2026-06-12）：已新增 readonly connector baseline：`git_status`、`http_get`、`github_repo_read` 均通过 `ToolRegistry` 注册为 `readonly / R0 / sideEffect=none / reversible=true`，并声明 timeout / output limit。Git 与 HTTP / GitHub connector 会输出或保留 source，失败使用 `connector_failure=*`，write-like 参数使用 `write_unsupported=*`，HTTP / GitHub 响应经过 redaction；测试覆盖无需审批、path escape、secret redaction、write-like option 拒绝和 connector failure。该基线不包含认证 GitHub API、任意自定义 headers、外部写 connector 或“connector 文本即可信 evidence”的语义。

### 7.4 L3 Operator Scenario Eval

#### 产品目标

进入真实 operator 旅程验收。

建议场景：

1. Repo acceptance；
2. Failure triage；
3. Skill promotion review；
4. Workbench review；
5. Governed execution；
6. Automation no-op review；
7. Connector readonly review。

评审方式先采用人工 reviewer：

```text
accepted / deferred / rejected
confidence
false confidence risks
blocking issues
next actions
```

不要急着让 judge 自动打分。

当前实现备注（2026-06-10）：已新增 deterministic L3 operator scenario fixture，覆盖 repo acceptance、failure triage、skill promotion review、Workbench review、governed execution、automation no-op review、readonly connector review；输出 accepted/deferred/rejected、confidence、false-confidence risks、blocking issues、next actions 与 evidence links。CLI 额外提供 `eval operator --packet` 生成人工验收 packet，并提供 `eval operator --acceptance <signoff.json>` 将人类 reviewer 的 JSON sign-off 校验为 `operator-human-acceptance` 结构化记录。fixture、packet 与 sign-off 校验都不等同真人审证本身，最终接受仍需要人类 reviewer 检查证据后签署或覆盖决定。

### 7.5 Observability / Debug Package

#### 产品目标

让问题定位更容易。

功能：

- structured event timeline；
- tool latency summary；
- model latency summary；
- timeout / abort summary；
- retry / recovery summary；
- failure taxonomy dashboard；
- export debug bundle。

Debug bundle 内容：

```text
record.json
trajectory.json
workflow-trajectory.json
eval-case.json
redacted-config.json
tool-summary.json
triage-summary.json
failure-summary.md
```

#### 验收标准

用户可以把一个 debug bundle 发给开发者，开发者不用复现环境也能判断大致问题。

当前实现备注（2026-06-15）：debug bundle 已包含 redacted record/artifacts/config、`eval-case.json` artifact、tool summary、failure summary、observability summary 与 triage summary。observability summary 覆盖 structured event timeline、budget/recovery、timeout/abort、failure taxonomy，并对尚未记录的 tool/model latency 显示 `not_recorded`。triage summary 汇总 status、blocking evidence、failure next actions、proofBoundary、automation scope / doesNotProve 与 replay boundary，让 reviewer 不复现环境也能看到 false-confidence 边界。

### 7.6 Release / Packaging / Upgrade Path

#### 产品目标

从开发仓库走向本地产品。

需要做：

- bin entry；
- package exports；
- config migration；
- sample config；
- first-run guide；
- doctor 改进；
- Node 22+ CI；
- release checklist；
- changelog；
- version compatibility。

特别要解决：通过 pnpm 启动时，JSON 输出前可能有 wrapper 噪音；正式 CLI 必须提供更干净的入口。

当前实现备注（2026-06-12）：已具备 CLI bin shim、package build metadata、secret-safe sample config、doctor 改进、Node 22+ engine 声明、`configVersion: 1` 兼容边界、Apache-2.0 package metadata 与 `CONTRIBUTING.md`。legacy 无版本 config 在解析时升级为 v1，doctor 会拒绝未知未来版本。first-run guide、config upgrade policy、release checklist、changelog 与版本兼容边界已收敛到 [`doc/product/10-release-and-upgrade.md`](10-release-and-upgrade.md)。CLI 额外提供只读 `guide first-run [--json|--compact]` 和 `guide release-checklist [--json|--compact]`。first-run guide 输出安装、config show、doctor、smoke / real-world eval、bin JSON 和 Web API print 的可复现步骤；每步带 `gate`、`proves`、`doesNotProve`，并明确不写配置、不跑网络检查、不证明产品健康。release-checklist guide 输出 release gates、manual checks 与边界说明，但不运行 gate、不修改 workspace、不宣称 release ready。

### 7.7 Performance / Budget Controls

#### 产品目标

让 loop 不失控。

需要做：

- max iterations；
- max tool calls；
- max child runs；
- max wall time；
- max token estimate；
- per-tool timeout；
- retry budget；
- budget exceeded failure code；
- budget summary 进入 RunRecord。

#### 验收标准

- 超预算不会继续跑；
- failure code 稳定；
- parent / child budget 分开；
- Workbench 显示预算耗用；
- eval 覆盖 budget exceeded。

当前实现备注（2026-06-10）：已覆盖 iterations、tool calls、child runs、wall time、max token estimate（请求前保守估算）、provider usage/cost 聚合、`maxProviderCostUsd` hard ceiling（仅在 `costStatus: "priced"` 时强制执行）、显式本地 `modelPricing`（USD per million tokens）配置、retry/recovery attempts、per-tool timeout 元数据、`budget_exceeded` failure code、RunRecord/Web budget usage、debug bundle、real-world eval fixture。自定义 endpoint 未配置价格时显示 `pricing_not_configured`；远程自动价格表同步不实现，避免内置过期价格。

---

## 8. 任务库存总表

| 优先级 | 开发包 | 估算 | 核心验收 |
|---|---|---:|---|
| P0 | Workbench Run Detail v1 | 5 ~ 8 人日 | 可审计真实 run |
| P0 | RunRecord Completeness | 4 ~ 7 人日 | 任意 run 可回答九个事实问题 |
| P0 | Skill Explanation Surface | 3 ~ 5 人日 | skill 注入原因、状态、eval coverage 可见 |
| P0 | Eval-run linkage and report UX | 3 ~ 5 人日 | eval case 可复盘到 run detail |
| P0 | Stability Hardening Gate | 3 ~ 5 人日 | false-confidence 红线进入主干 |
| P1 | Reviewed-loop v1 | 5 ~ 8 人日 | maker / checker readonly 分离 |
| P1 | Local Automation Triage | 4 ~ 7 人日 | no-op / failed / degraded 语义正确 |
| P1 | Worktree Isolation Foundation | 5 ~ 8 人日 | child workspace 不污染主 workspace |
| P1 | Schema Migration / Redaction Hardening | 4 ~ 6 人日 | 旧 record 可读，secret 不泄漏 |
| P1 | CLI Operator Ergonomics | 3 ~ 5 人日 | runs list/show/open/replay/triage 可用 |
| P2 | Readonly Connector Baseline | 5 ~ 8 人日 | 外部 source readonly 可控 |
| P2 | L3 Operator Scenario Eval | 4 ~ 6 人日 | 人工 operator journey 可验收 |
| P2 | Observability / Debug Package | 4 ~ 7 人日 | debug bundle 可交付 |
| P2 | Release / Packaging / Upgrade Path | 4 ~ 6 人日 | CLI / config / upgrade 更像产品 |
| P2 | Performance / Budget Controls | 3 ~ 5 人日 | loop、child、tool、retry 有预算边界 |

合计：

```text
59 ~ 96 人日
```

---

## 9. 关键非目标

### 9.1 暂不做 fanout / tournament

没有完整 RunRecord、Workbench 审计与 worktree isolation 前，fanout 只会制造更多不可审计输出。

### 9.2 暂不做外部写 connector

readonly connector 可以进入 P2；外部写操作必须等待 approval、redaction、audit、rollback、debug bundle 更成熟。

### 9.3 暂不让自动 judge 取代 reviewer

judge 可以辅助，但不能替代 evidence、rubric 与人工验收。reviewer 需要先被设计成 readonly、rubric-bound 的产品角色。

### 9.4 不以“总健康分 100%”表达系统成熟度

Eval pass、fixture pass、profile accuracy、replay pass 都不能直接等同于产品健康度。

---

## 10. False-confidence 防线

后续所有任务必须显式处理以下虚假信心风险：

| 风险 | 产品要求 |
|---|---|
| final text 说成功但无证据 | 不能标记 succeeded |
| tool attempted 被当成 tool succeeded | attempted / succeeded 分离展示 |
| replay pass 被当成 fresh pass | replay 必须显示 `freshExecution=false` |
| no failed runs 被当成系统健康 | automation no-op 必须显示 scope 与未证明内容 |
| profile accuracy 被当成任务成功 | route accuracy / task success / evidence quality 分开 |
| skill 命中被当成 skill 可靠 | skill status 与 eval coverage 必须可见 |
| reviewer 与 worker 权限混同 | reviewer readonly，且不能写 worker artifact |
| child late success 覆盖 parent failure | parent timeout / abort 语义优先 |
| raw payload 进入 UI | 默认 redacted / summarized |

---

## 11. Milestone 1 细化任务建议

如果下一步要交给 coding agent 执行，先把 Milestone 1 拆成更细实施计划。建议任务如下：

### M1-1：RunRecord schema audit

- 对照产品规格检查现有 `RunRecord` 字段；
- 列出缺失字段；
- 明确哪些字段本阶段补，哪些延后；
- 增加 schema compatibility test。

### M1-2：Run store reader

- 读取 `~/.keigent/runs/*/record.json`；
- 对 malformed record 容错；
- 排序；
- 分页预留；
- 增加 tests。

### M1-3：Run List view model

- normalize status；
- normalize risk；
- normalize evidence；
- duration formatting；
- unknown fallback；
- tests。

### M1-4：Run Detail view model

- overview；
- route；
- skills；
- tools；
- evidence；
- failures；
- replay；
- next action；
- tests。

### M1-5：Evidence Panel

- passed / failed / not_checked；
- blocking reason；
- evidence source；
- final text label；
- insufficient evidence guard；
- tests。

### M1-6：Failure Panel

- failure code；
- failed assertion；
- recovery attempts；
- next action；
- human review flag；
- replay flag；
- tests。

### M1-7：Skill Explanation

- match reason；
- status；
- injected；
- eval coverage；
- risk delta；
- blocked / deprecated states；
- tests。

### M1-8：Hardening tests

- empty evidence；
- replay fresh false；
- blocked skill；
- approval missing；
- parent timeout；
- reviewer write attempt，先可做 fixture；
- redaction leak。

### M1-9：Workbench UX copy

- status 文案；
- failure 文案；
- no evidence 文案；
- replay boundary 文案；
- no-op 文案；
- false confidence warning。

### M1-10：Acceptance report

- 跑质量门；
- 跑 eval；
- 截取关键 JSON；
- 写 main acceptance delta。

---

## 12. 执行与验收规则

### 12.1 执行规则

- 任何开发任务必须先绑定到本路线图中的一个开发包。
- coding agent 不应自行扩大范围到 fanout、external write connector 或 automatic judge。
- 每个任务必须写明：目标、非目标、涉及文件、测试、eval、验收证据。
- 文档、代码、eval、Workbench view model 必须同步更新，避免只改实现不改产品语义。

### 12.2 验收规则

每个开发包完成时必须提交：

1. 文件变更清单；
2. 新增 / 修改测试清单；
3. 运行过的命令；
4. eval 报告路径或关键输出；
5. 已知未证明内容；
6. false-confidence 风险复核；
7. rollback 或降级方式。

### 12.3 合并前最低质量门

文档-only 变更至少运行：

```bash
git diff --check
git status -sb
```

代码 / schema / CLI / eval / web 变更至少运行相关 package 的 check、test 与对应 eval。若涉及主线验收，参考 README 的完整质量门。
