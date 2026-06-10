# KeiGent Eval Documents

| 状态 | 文档 | 用途 |
|---|---|---|
| 设计蓝图 | [01 Real-world Eval Suite](01-real-world-eval-suite.md) | 真实世界 eval/benchmark 的目标、边界与准入计划 |
| 验收报告 | [02 Main Acceptance Report](02-main-acceptance-report.md) | main 分支产品、架构、工程质量验收意见 |
| Eval 路线图 | [03 Real-world Eval Roadmap](03-real-world-eval-roadmap.md) | 下一阶段 P0：L1/L2/L3 分层 eval、false confidence 防线与准入条件 |
| 验收报告 | [04 Agent Operations Foundation Acceptance](04-main-acceptance-report-2026-06-10-agent-operations-foundation.md) | 2026-06-10 main 分支按 Agent Operations 设计要求的 traceability 验收报告 |

当前本地 L2 fixture 基线入口：

```bash
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
```

边界：L2 real-world fixture 只证明确定性本地 case 被执行和记录；它不证明产品健康、生产可用性、外部系统状态或真人验收。

L2 report 现在包含 proof boundary：每个 case 必须说明已证明内容、未证明内容、假设和 evidence gaps。新增 self-repair / budget-exhausted fixture 会进入 autonomy summary，用于防止“失败后直接问人”或“repair 失败伪装成功”。

当前本地 L3 operator scenario fixture 入口：

```bash
corepack pnpm --filter @keigent/engine eval:operator -- --compact
corepack pnpm --filter @keigent/cli start eval operator --compact
corepack pnpm --filter @keigent/cli start eval operator --packet
corepack pnpm --filter @keigent/cli start eval operator --acceptance /path/to/operator-signoff.json --compact
```

`--packet` 输出面向人类 reviewer 的 L3 acceptance packet，包含 evidence links、scenario checklist 与 manual sign-off；它不把 fixture pass 解释为真实人工验收通过。

`--packet` 必须包含 Proof boundary、Evidence inspected、Override reason 和 Next actions 字段。`--acceptance` 读取人类 reviewer 填写的 JSON sign-off，输出 `operator-human-acceptance` 结构化记录；它只校验签署完整性、override reason、evidence inspected 和 false-confidence 风险确认，不能替代真人实际审证。

产品级 E2E 回归入口：

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/product-e2e.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

该链路验证 CLI 持久化的 RunRecord 可通过本地 Web API 被 Workbench 渲染，并展示 proof boundary、autonomy、repair attempts 和 next action。

最小 sign-off 形态：

```json
{
  "datasetId": "operator-scenario-v1",
  "reviewerName": "Human Reviewer",
  "reviewedAt": "2026-06-10T00:00:00.000Z",
  "finalDecision": "accepted",
  "cases": [
    {
      "caseId": "repo-acceptance",
      "humanDecision": "accepted",
      "evidenceInspected": true,
      "falseConfidenceRisksAccepted": true,
      "notes": "Reviewed linked quality gates."
    }
  ]
}
```
