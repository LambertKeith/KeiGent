# P0-04 Eval-run Linkage and Report UX Design

## Backlog Item

- 编号：P0-04
- 开发包：Eval-run Linkage and Report UX
- 目标：让 real-world eval case 在 Workbench 中具备可复盘链路，并直接展示 case review verdict 与 next action。
- 非目标：不新增 eval runner，不引入人工 sign-off，不把 fixture pass 宣称为产品健康，不改变 RunRecord schema。

## Context

当前实现已经具备：

- L2 real-world eval case 生成 `RunRecord`；
- report case 包含 `runId`；
- Workbench dashboard 展示 `runDetailHref`；
- false-confidence findings 独立展示；
- route accuracy、task success、evidence quality 分离；
- replay run 在 `RunRecord.replay.freshExecution=false` 中表达边界。

缺口是 Workbench case surface 仍只展示 case/result/failure code，没有把 `RunRecord` 中的审证状态归一化为 reviewer 可直接读取的 verdict 和 next action。

## Requirements

1. `RealWorldEvalCaseView` 必须新增 `caseReview`：
   - `verdict`: `evidence_backed`、`needs_review`、`blocked` 或 `replay_only`；
   - `label`: 面向 reviewer 的短文案；
   - `reason`: verdict 的事实来源；
   - `nextAction`: 下一步动作，优先来自 `RunRecord.nextAction` 或 failure `nextAction`。
2. `caseReview` 只能从 eval case result、RunRecord evidence/risk/replay/failure/proof boundary 派生，不能从 final text 派生。
3. replay case 必须显示 `Replay result, not a fresh execution`，不得只显示类似 fresh pass 的成功文案。
4. no-op automation case 必须显示 scope review 的 next action，不得显示系统健康。
5. Workbench table 必须展示 reviewer verdict 与 next action，并保留 case-to-run detail link。
6. P0-04 文档必须记录已证明和未证明边界。

## Verdict Rules

| 条件 | verdict | label |
|---|---|---|
| eval case 未通过或出现 false success / risk noncompliance | `blocked` | `Blocked before reviewer acceptance` |
| `freshExecution=false` | `replay_only` | `Replay result, not a fresh execution` |
| evidence 未检查、insufficient evidence、no-op、或 proof boundary 有 evidence gap | `needs_review` | `Needs reviewer inspection` |
| case 通过、fresh、证据可检查、无 evidence gap | `evidence_backed` | `Evidence-backed case result` |

## UX

Eval Dashboard 保持现有分区：

- Metrics：route accuracy、task success、evidence quality、tool reliability、risk compliance。
- Eval-run linkage：case id 链接到 Run Detail。
- False-confidence findings：独立列表。
- Proof boundary：报告级 proven / not proven / assumptions / evidence gaps。

本包增强 Eval-run linkage 表格：

```text
Case / run
Expected/result
Eval
Route
Evidence
Execution
Reviewer verdict
Next action
Failure codes
```

## Tests

- `packages/web/src/__tests__/dashboard.test.ts`
  - real-world report normalization must include case review verdict and next action.
  - replay and no-op cases must expose bounded review copy.
- `packages/web/src/__tests__/eval-dashboard-workbench.test.ts`
  - rendered dashboard must show reviewer verdict, next action, and exact replay-not-fresh wording.

## Acceptance

本包完成后可证明：

- eval case -> run id -> Run Detail link -> Workbench case review verdict / next action 链路存在；
- reviewer verdict 来自 RunRecord/eval facts，不来自 final text；
- replay 不伪装 fresh execution；
- false-confidence findings 与分离指标仍独立展示。

本包不能证明：

- 人类 reviewer 已实际验收；
- fixture pass 等于生产健康；
- Web 已具备完整交互式 case drawer。
