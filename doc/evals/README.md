# KeiGent Eval Documents

| 状态 | 文档 | 用途 |
|---|---|---|
| 设计蓝图 | [01 Real-world Eval Suite](01-real-world-eval-suite.md) | 真实世界 eval/benchmark 的目标、边界与准入计划 |
| 验收报告 | [02 Main Acceptance Report](02-main-acceptance-report.md) | main 分支产品、架构、工程质量验收意见 |
| Eval 路线图 | [03 Real-world Eval Roadmap](03-real-world-eval-roadmap.md) | 下一阶段 P0：L1/L2/L3 分层 eval、false confidence 防线与准入条件 |

当前本地 L2 fixture 基线入口：

```bash
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
```

当前本地 L3 operator scenario fixture 入口：

```bash
corepack pnpm --filter @keigent/engine eval:operator -- --compact
corepack pnpm --filter @keigent/cli start eval operator --compact
corepack pnpm --filter @keigent/cli start eval operator --packet
corepack pnpm --filter @keigent/cli start eval operator --acceptance /path/to/operator-signoff.json --compact
```

`--packet` 输出面向人类 reviewer 的 L3 acceptance packet，包含 evidence links、scenario checklist 与 manual sign-off；它不把 fixture pass 解释为真实人工验收通过。

`--acceptance` 读取人类 reviewer 填写的 JSON sign-off，输出 `operator-human-acceptance` 结构化记录；它只校验签署完整性、override reason、evidence inspected 和 false-confidence 风险确认，不能替代真人实际审证。

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
