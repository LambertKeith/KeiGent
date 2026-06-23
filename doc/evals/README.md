# KeiGent Eval Documents

| 状态 | 文档 | 用途 |
|---|---|---|
| 设计蓝图 | [01 Real-world Eval Suite](01-real-world-eval-suite.md) | 真实世界 eval/benchmark 的目标、边界与准入计划 |
| 验收报告 | [02 Main Acceptance Report](02-main-acceptance-report.md) | main 分支产品、架构、工程质量验收意见 |
| Eval 路线图 | [03 Real-world Eval Roadmap](03-real-world-eval-roadmap.md) | 下一阶段 P0：L1/L2/L3 分层 eval、false confidence 防线与准入条件 |
| 验收报告 | [04 Agent Operations Foundation Acceptance](04-main-acceptance-report-2026-06-10-agent-operations-foundation.md) | 2026-06-10 main 分支按 Agent Operations 设计要求的 traceability 验收报告 |
| 验收报告 | [05 Agent Operations Next Round Acceptance](05-agent-operations-next-round-acceptance-report.md) | `agent-operations-next-round` 分支按 Loop Event、Proof Boundary、Autonomy、Provider Capability 与产品级 E2E 的增量验收报告 |
| 验收报告 | [06 Development Priority Backlog Delta](06-development-priority-backlog-delta-2026-06-15.md) | P0-P2 backlog 增量的历史验收 delta |
| 验收报告 | [07 Run Review Workbench V1 Delta](07-run-review-workbench-v1-delta-2026-06-23.md) | P0-02 Run Review Workbench V1 的验收 delta |
| 验收报告 | [08 Skill Explanation Run Surface Delta](08-skill-explanation-run-surface-delta-2026-06-23.md) | P0-03 Skill Explanation Surface 的验收 delta |
| 验收报告 | [09 Eval-run Linkage Report UX Delta](09-eval-run-linkage-report-ux-delta-2026-06-23.md) | P0-04 Eval-run Linkage and Report UX 的验收 delta |
| 验收报告 | [10 Stability Hardening Gate Delta](10-stability-hardening-gate-delta-2026-06-23.md) | P0-05 Stability Hardening Gate 的验收 delta |
| 验收报告 | [11 P0 Acceptance Delta](11-p0-acceptance-delta-2026-06-23.md) | P0-01 至 P0-05 的本地验收边界汇总 |
| 验收报告 | [12 Reviewed-loop V1 Delta](12-reviewed-loop-v1-delta-2026-06-23.md) | P1-01 Reviewed-loop v1 的验收 delta |
| 验收报告 | [13 Local Automation Triage Delta](13-local-automation-triage-delta-2026-06-23.md) | P1-02 Local Automation Triage 的验收 delta |
| 验收报告 | [14 Worktree Isolation Conflict Summary Delta](14-worktree-isolation-conflict-summary-delta-2026-06-23.md) | P1-03 Worktree Isolation Foundation 的 conflict summary 验收 delta |
| 验收报告 | [15 Debug Bundle Redaction Summary Delta](15-debug-bundle-redaction-summary-delta-2026-06-23.md) | P1-04 Schema Migration / Redaction Hardening 的 debug bundle redaction summary 验收 delta |
| 验收报告 | [16 CLI Runs Replay Handoff Delta](16-cli-runs-replay-handoff-delta-2026-06-23.md) | P1-05 CLI Operator Ergonomics 的 runs replay handoff 验收 delta |

当前本地 L2 fixture 基线入口：

```bash
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact --open
```

边界：L2 real-world fixture 只证明确定性本地 case 被执行和记录；它不证明产品健康、生产可用性、外部系统状态或真人验收。

L2 report 现在包含 proof boundary：每个 case 必须说明已证明内容、未证明内容、假设和 evidence gaps。新增 self-repair / budget-exhausted fixture 会进入 autonomy summary，用于防止“失败后直接问人”或“repair 失败伪装成功”。

`eval:stability` 是 P0 false-confidence 主干门禁。它复用 L2 fixture 和空 dataset report，集中检查 final text 伪造成功、attempted/succeeded 混淆、replay fresh 伪装、empty evidence 100%、approval bypass、blocked skill 注入、reviewer 写操作、parent timeout 覆盖与 secret redaction。任一红线失败时命令返回非零退出码。

`real-world --open` 会把 L2 fixture 中每个 case 的 `RunRecord` 写入 run store，并把 latest report 写入 `evals/real-world/<dataset>/latest.json`，随后在报告中输出 Workbench dashboard 链接。该入口用于验证 `eval case -> saved RunRecord -> Web API -> Workbench Run Detail` 的复盘链路；它仍然只是 fixture 级证明，不代表生产健康。

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

该链路验证 CLI 持久化的 RunRecord 和 real-world eval case RunRecord 可通过本地 Web API 被 Workbench 渲染，并展示 proof boundary、autonomy、repair attempts、replay boundary、no-op scope 和 next action。

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
