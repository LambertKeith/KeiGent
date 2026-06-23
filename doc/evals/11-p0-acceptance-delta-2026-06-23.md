# P0 Acceptance Delta - 2026-06-23

## Scope

本报告汇总 `P0-01` 至 `P0-05` 的本地 Agent Operations 最小闭环。目标是证明一次 run 可被记录、审计、解释、复盘，并且已知 false-confidence 红线进入可执行门禁。

## Package Evidence

| Backlog | Evidence reference | Acceptance state |
|---|---|---|
| P0-01 RunRecord Completeness | `packages/engine/src/run-record.ts`, `packages/engine/src/__tests__/run-record.test.ts` | RunRecord 覆盖 task、route、workflow、execution、evidence、risk、approval、failure、artifact、replay、redaction |
| P0-02 Workbench Run Detail v1 | `doc/evals/07-run-review-workbench-v1-delta-2026-06-23.md` | Workbench 可复盘 succeeded、failed、approval denied、replay、insufficient evidence、no-op、parent timeout |
| P0-03 Skill Explanation Surface | `doc/evals/08-skill-explanation-run-surface-delta-2026-06-23.md` | skill match reason、status、injection、risk delta 与 eval coverage 进入 run surface |
| P0-04 Eval-run Linkage and Report UX | `doc/evals/09-eval-run-linkage-report-ux-delta-2026-06-23.md` | eval case 可链接 run detail，case review 展示 verdict 和 next action |
| P0-05 Stability Hardening Gate | `doc/evals/10-stability-hardening-gate-delta-2026-06-23.md` | 9 条 P0 false-confidence 红线进入 `eval:stability` 门禁 |

## Proven Matrix

| Question | Proven by |
|---|---|
| 任务是什么、为何选择 profile/workflow | RunRecord task/route/workflow summary |
| 工具调用是否区分 attempted 和 succeeded | RunRecord tools/execution summary and stability redline |
| 成功或失败凭什么成立 | evidence summary、failures、proofBoundary |
| risk/approval 是否可追踪 | approvals、risk summary、approval denied fixture |
| replay 是否区别 fresh execution | replay summary、real-world fixture、stability redline |
| no-op 是否不冒充健康 | automation summary、proofBoundary、Workbench trust label |
| parent failure 是否优先于 child success | workflow summary、parent-timeout fixture、stability redline |
| skill 注入是否可解释 | SkillRunSummary、Workbench skill surface、blocked/deprecated fixture |
| eval 是否能复盘到 run detail | real-world report runId、Workbench eval-run linkage |

## Not Proven

- P0 fixture pass 不证明生产健康、外部系统状态或真人验收。
- P0 不包含 P1 的完整 reviewed-loop 产品化、automation triage、worktree isolation、schema migration/redaction hardening 或 CLI operator ergonomics。
- P0 不包含 P2 的 provider registry、debug bundle、workflow telemetry、full Workbench navigation 或 real browser operator scenarios。
- `eval:stability` 当前只覆盖 P0 已知 false-confidence 红线；新增能力必须新增对应红线。

## Required Verification Before Merge

```bash
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

## Acceptance Decision

状态：ready for local P0 acceptance after verification commands pass.

理由：P0 的事实源、Workbench 审计、skill 解释、eval-run 复盘与 false-confidence 门禁均已有本地可运行证据，同时文档明确了未证明范围。
