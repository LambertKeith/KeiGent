# Web Dashboard Design

> **Goal:** Make KeiGent eval, replay, and orchestrator behavior measurable without confusing different kinds of success.

## 1. Product questions

The dashboard must answer:

1. Did the eval suite pass?
2. Did KeiGent choose the right profile?
3. If a task failed, where did it fail?
4. What evidence proves the result?
5. Can a previous trajectory be replayed and re-scored?

It is an eval observability surface, not a generic AI dashboard.

## 2. Anti-self-deception rules

The dashboard must never confuse:

| Concept | Must not be confused with |
| --- | --- |
| Eval pass/fail | Profile match only |
| Profile accuracy | Task success |
| Tool attempted | Tool succeeded |
| Checkpoint passed | Final response says success |
| Executor error | Agent behavior failure |
| Guard correction | Rule failure |
| Failure code count | Failed case count |
| Replay result | Fresh engine execution |

## 3. Pages

### Eval Overview

- Run summary.
- Pass/fail KPI.
- Profile accuracy.
- Failure breakdown by code.
- Category breakdown.
- Slowest cases.
- Recent runs.

### Eval Cases

- Case table with filters.
- Case detail drawer.
- Acceptance check result.
- Tools attempted vs successful tools.
- Failure messages and codes.
- Trajectory/replay link when available.

### Orchestrator Matrix

- Profile accuracy.
- Rule coverage.
- Guard corrections.
- Case matrix with `ruleId`, `rationale`, `signals`, `guardApplied`.

### Trajectory Replay

- Upload or map trajectory paths.
- Replay result summary.
- Step timeline.
- Tool/checkpoint/final-response inspection.
- Re-score result.

### Run Comparison

- Baseline vs candidate reports.
- Newly failing / newly passing cases.
- Changed failure codes.
- Changed selected profiles.
- Duration deltas.

## 4. Metrics and definitions

- `passRate = total === 0 ? null : passed / total`.
- `failed === total - passed` must hold for valid reports.
- `profileAccuracy: null` means not checked, not 0%.
- `failuresByCode` may sum to more than `failed`, because one case can have multiple failure codes.
- Required tools are judged by `successfulToolsUsed`, not `toolsUsed`.

Known failure codes:

```ts
"profile_mismatch"
"exit_reason"
"tool_missing"
"tool_forbidden"
"checkpoint_missing"
"output_missing"
"executor_error"
"timeout"
```

## 5. Data model assumptions

The first dashboard should accept current engine reports:

```ts
interface EvalReport {
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  failuresByCode: Partial<Record<string, number>>;
  cases: EvalCaseResult[];
}
```

```ts
interface OrchestratorEvalReport {
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  cases: OrchestratorEvalCaseResult[];
}
```

Recommended normalized run:

```ts
export interface DashboardRun {
  id: string;
  kind: "smoke" | "engine" | "replay" | "orchestrator";
  status: "passed" | "failed" | "running" | "error";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  report?: EvalReport;
  orchestratorReport?: OrchestratorEvalReport;
  error?: DashboardError;
}
```

## 6. API assumptions

Initial backend adapter may be thin around existing engine commands:

- `GET /api/runs`
- `GET /api/runs/:runId`
- `POST /api/runs/smoke`
- `POST /api/runs/orchestrator`
- `POST /api/reports/upload`
- `POST /api/replay`
- `GET /api/trajectories/:trajectoryId`

Replay default should be `mapped-cases-only`; full-suite replay may explicitly mark missing mappings as failures.

## 7. Failure states

- No runs: empty state, primary action `Run smoke eval`.
- Report load failed: error code, retry, navigation preserved.
- Invalid report: refuse authoritative metric rendering.
- Partial report: degraded state, case table disabled.
- Timeout case: timeout badge and duration.
- Executor error: distinguish harness/runtime crash from agent failure.
- Unknown failure code/category/profile: render raw value and keep filterable.
- Missing trajectory: disable replay but keep report inspection.

## 8. Visual direction

Warm, bright, technical clarity:

- Cream/ivory base.
- Apricot primary accent.
- Soft green success, warm coral failure, ochre warning.
- No purple/cold/AI-sparkle aesthetics.
- Charts must have accessible table equivalents.

## 9. Acceptance standards

### Metric correctness

- Summary numbers match source exactly.
- `passed + failed === total` and `total === cases.length` are validated.
- `profileAccuracy: null` displays `Not checked`.
- Empty reports avoid division by zero.
- Failure code bars do not imply one failure per failed case.

### Case inspection

- Failed cases sort first by default.
- Long titles truncate but full value is available in detail.
- Missing optional fields show explicit fallback.
- Failure messages preserve exact source text; no generated speculation.
- Required-vs-successful tool distinction is visible.

### Orchestrator matrix

- Default matrix must show at least 12 fixtures.
- `profileAccuracy === 100%` and `failed === 0` for current default matrix.
- `guardApplied === true` is visible without opening detail.
- Raw `rationale` and `signals` are shown unchanged.

### Compatibility

- Unknown future fields do not crash UI.
- Unknown categories/profiles/failure codes render as raw values.
- Case comparison uses `case.id`, never array index.

### Accessibility

- Status colors include text labels.
- Filters, case rows, and drawer controls are keyboard accessible.
- Charts include labels or table equivalents.
