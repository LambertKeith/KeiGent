# Run Record and Run Lifecycle Product Spec

> 状态：产品规格 / 下一阶段 P0
>
> 目的：把一次 agent run 从“命令输出”提升为可保存、可解释、可复盘、可验收、可治理的产品对象。
>
> 适用读者：产品负责人、架构师、实现者、验收人、AI 协作者。

## 1. 产品问题

当前 KeiGent 已经具备 `LoopEngine`、profile、trajectory、evidence、workflow、eval 等底层能力，但用户真正需要的不是一堆分散事件，而是一个可以被理解和审计的运行对象。

用户在一次任务结束后必须能回答：

| 用户问题 | 需要的事实 |
|---|---|
| 这次任务为什么这样执行？ | routing decision、profile、workflow mode、rationale |
| 它用了哪些知识？ | skill match explanation、skill body 注入摘要 |
| 它做了哪些动作？ | tool call/result、permission/risk、side effect |
| 它凭什么说成功？ | successDef、assertions、evidence、checkpoint、verdict |
| 如果失败，失败在哪里？ | failure code、failed assertion、recovery decision |
| 它是否安全可复盘？ | redacted trajectory、approval trail、replay capability |
| 下次是否能回归验证？ | eval case link、trajectory path、replay report |

因此，下一阶段的第一产品对象应是 `RunRecord`。

## 2. 产品定义

`RunRecord` 是一次 KeiGent run 的持久化产品事实源。它不是 raw log，也不是最终回答，而是把 routing、execution、evidence、risk、approval、failure 和 replay 组织成可读、可查询、可展示的数据结构。

它必须满足五个原则：

1. **事实优先**：final text 不能单独证明成功。
2. **可追溯**：每个 conclusion 都能回到 event/evidence。
3. **可脱敏**：面向 UI 和报告的 payload 必须先经过 redaction。
4. **可复盘**：run record 能定位 trajectory，trajectory 能被 replay。
5. **可验收**：验收人能用它判断 run 是否可信。

## 3. 生命周期状态

建议将 run 生命周期定义为以下状态：

| 状态 | 含义 | 进入条件 | 退出条件 |
|---|---|---|---|
| `created` | run 已创建但尚未路由 | 接收 task | 开始 orchestrator |
| `routed` | 已选择 profile/mode | routing decision 产生 | 开始 child/loop |
| `running` | loop 或 workflow 正在执行 | 第一条 execution event | checkpoint、approval、terminal |
| `awaiting_approval` | 等待人类批准风险动作 | high risk tool request | approved / denied / timeout |
| `verifying` | 正在验证 checkpoint/assertion | verification requested | verdict produced |
| `succeeded` | 终态：任务成功且证据通过 | terminal verdict success | 无 |
| `failed` | 终态：任务失败 | blocking failure | 无 |
| `degraded` | 终态：自动化降级但有可交付输出 | ask_user unavailable、partial evidence | 无 |
| `cancelled` | 终态：用户或预算取消 | abort / timeout / budget | 无 |

禁止规则：

- `finalResponse` 不得单独把状态推进到 `succeeded`。
- `tool attempted` 不得等同 `tool succeeded`。
- `checkpoint passed` 不得掩盖 parent workflow budget/timeout failure。
- `replay succeeded` 不得覆盖 fresh execution failure。

## 4. 建议数据模型

```ts
interface RunRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  task: RunTaskSnapshot;
  route: RouteDecisionSnapshot;
  workflow?: WorkflowSnapshot;
  execution: ExecutionSummary;
  evidence: EvidenceSummary;
  risk: RiskSummary;
  approvals: ApprovalSummary[];
  failures: FailureSummary[];
  artifacts: RunArtifact[];
  replay: ReplayCapability;
  redaction: RedactionSummary;
}
```

### 4.1 Task snapshot

必须保留：

- `goal`
- requested `profile`，如果有
- resolved `profile`
- requested / resolved workflow mode
- `successDef` 摘要
- task source：CLI / Web / eval / replay

### 4.2 Route decision

必须保留：

- selected profile
- routing source：explicit / rule / skill-match / LLM fallback / guard
- rationale
- confidence，如果有
- guard correction，如果发生
- matched skill ids

### 4.3 Execution summary

必须保留：

- iterations
- total tool calls
- tool success/failure count
- checkpoint count
- duration
- exit reason
- final response 摘要
- event counts by type
- provider usage/cost summary（仅来自模型响应 usage；自定义 endpoint 可通过本地 `modelPricing` 产生成本；无价格配置时标记 `pricing_not_configured`）

### 4.4 Evidence summary

必须保留：

- assertion totals
- passed / failed / skipped / not checked
- evidence sources
- blocking failure evidence
- verdict chain

空 evidence 的语义必须是 `not_checked` 或 `insufficient_evidence`，不能显示为 100% success。

### 4.5 Risk summary

必须保留：

- highest risk level
- permission classes used
- side effects attempted
- side effects succeeded
- external side effects
- irreversible actions
- approval requirement

### 4.6 Replay capability

必须保留：

- trajectory path or id
- trajectory schema version
- replay supported / unsupported reason
- latest replay report id，如果有
- fresh execution vs replay 的明确标签

## 5. CLI 产品行为

每次 CLI run 结束后，除了 final response，还应输出一个简洁 summary：

```text
Run: run_20260610_001
Status: succeeded
Profile: convergent-verified
Workflow: single-loop
Skills: web-summarize@verified
Tools: browser.navigate ✓, browser.snapshot ✓
Evidence: 3 passed / 0 failed
Risk: R1 readonly
Trajectory: ~/.keigent/runs/run_20260610_001/trajectory.json
Replay: keigent replay ~/.keigent/runs/run_20260610_001/trajectory.json
```

失败时必须突出 failure code：

```text
Status: failed
Failure: verified_failure
Blocking evidence: assertion file.exists failed
Next: inspect run run_20260610_001
```

## 6. Web 产品行为

Workbench 第一版应优先展示真实 `RunRecord`，而不是先做复杂 dashboard。

最低可用界面：

1. Run List：状态、profile、workflow、risk、duration、createdAt。
2. Run Detail：route、timeline、skills、tools、checkpoints、verdict。
3. Evidence Panel：assertion、source、pass/fail、blocking reason。
4. Risk Panel：permission/risk/sideEffect/approval。
5. Replay Panel：trajectory、replay boundary、latest replay result。

## 7. 验收用例

| 用例 | 输入 | 期望 |
|---|---|---|
| 低风险对话 | 问候/能力询问 | `conversational`，无高风险工具，status succeeded/degraded 有明确原因 |
| 有 skill 的执行 | 文件或网页任务 | matched skill、tool events、evidence summary 存在 |
| 需要审批 | R3+ 或 dangerous 工具 | 进入 `awaiting_approval`，审批结果进入 record |
| 验证失败 | assertion fail | status failed，failure code 为 `verified_failure` |
| 用户取消 | abort signal | status cancelled，late success 不覆盖结果 |
| replay | trajectory replay | replay 标记为 replay，不宣称 fresh execution |

## 8. 非目标

- 不在本阶段实现多用户 SaaS run store。
- 不把 run record 做成全文日志数据库。
- 不把 final response 当成功证据。
- 不把 replay 结果显示为 fresh execution。
- 不在没有 redaction 的情况下把 raw payload 暴露给 UI。

## 9. 下一步实现任务边界

第一版实现应只做：

1. 定义 `RunRecord` 类型和 schema version。
2. 将已有 `LoopResult` / `WorkflowResult` / trajectory 映射为 `RunRecord`。
3. CLI 保存 run record 到 `~/.keigent/runs/<run-id>/record.json`。
4. CLI 输出 run summary。
5. Web view model 读取 run record fixture。
6. 增加 eval fixture，验证 failed / succeeded / approval / replay 四类 record。

暂不做：

- 数据库；
- 后台队列；
- 多用户权限；
- 复杂搜索；
- 云同步。
