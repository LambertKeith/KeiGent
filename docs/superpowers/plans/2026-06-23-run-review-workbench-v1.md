# Run Review Workbench V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P0-02 Run Review Workbench V1 trust header and queue model so an operator can tell whether a run is evidence-backed, needs review, replay-only, insufficiently evidenced, or not checked.

**Architecture:** Keep `RunRecord` as the single fact source and add derived view-model fields only in `packages/web/src/runs/model.ts`. Render those derived fields in `packages/web/src/runs/workbench.ts` without changing engine schemas, migrations, workflow semantics, or proof-boundary storage.

**Tech Stack:** TypeScript, pnpm, Vitest, existing KeiGent `@keigent/engine` RunRecord fixtures, static Web Workbench renderer.

## Global Constraints

- `LoopEngine` remains the only runtime loop; this plan only changes the Web view model and rendering.
- Trust labels must not be derived from `execution.finalResponseSummary` or final text.
- `freshExecution=false` must display `Replay result, not a fresh execution`.
- Empty or unchecked evidence must not render as success.
- Proof Boundary must remain visible with `Proven`, `Not proven`, `Assumptions`, and `Evidence gaps`.
- Approval denial, no-op automation, parent timeout, insufficient evidence, and replay-only states must remain visibly reviewable.
- No database, schema migration, destructive command, or RunRecord schema mutation is part of this plan.

---

## File Structure

- Modify `packages/web/src/runs/model.ts`: add `RunTrustLabel`, `RunTrustSummary`, `RunQueueSummary`, derived `trust` fields, and queue summary helpers.
- Modify `packages/web/src/runs/workbench.ts`: render queue buckets, row trust labels, and selected-run trust header.
- Modify `packages/web/src/__tests__/runs-view.test.ts`: add view-model tests for trust labels and queue counts.
- Modify `packages/web/src/__tests__/run-workbench.test.ts`: add HTML rendering tests for trust header, queue buckets, fixture coverage, approval denial, and false-confidence guard copy.
- Create `doc/evals/07-run-review-workbench-v1-delta-2026-06-23.md`: record autonomous acceptance evidence after implementation and verification.

---

### Task 1: View-Model Trust Labels And Queues

**Files:**
- Modify: `packages/web/src/runs/model.ts`
- Test: `packages/web/src/__tests__/runs-view.test.ts`

**Interfaces:**
- Consumes: `RunRecord`, `RunEvidenceStatus`, `RunStatus`, `RunRecordDetailView.nextAction`, `ProofBoundary`.
- Produces:
  - `export type RunTrustLabel = "evidence-backed" | "needs-review" | "insufficient-evidence" | "replay-only" | "not-checked";`
  - `export interface RunTrustSummary { label: RunTrustLabel; copy: string; reason: string; }`
  - `export interface RunQueueSummary { needsAction: RunRecordListItem[]; failedOrDegraded: RunRecordListItem[]; awaitingApproval: RunRecordListItem[]; replayOrEval: RunRecordListItem[]; recentSucceeded: RunRecordListItem[]; }`
  - `RunRecordListItem.trust: RunTrustSummary`
  - `RunRecordDetailView.trust: RunTrustSummary`
  - `RunRecordCollectionView.queues: RunQueueSummary`

- [ ] **Step 1: Write the failing trust-label tests**

Add these tests inside `describe("run record view model", () => { ... })` in `packages/web/src/__tests__/runs-view.test.ts`:

```ts
  it("derives evidence-backed trust only from fresh checked evidence", () => {
    const view = normalizeRunRecord(runRecord());

    expect(view.trust).toEqual({
      label: "evidence-backed",
      copy: "Evidence-backed completion",
      reason: "Fresh execution with passed evidence and no evidence gaps.",
    });
    expect(view.summary.trust.label).toBe("evidence-backed");
  });

  it("does not let final response text upgrade unchecked evidence to success", () => {
    const view = normalizeRunRecord(runRecord({
      status: "succeeded",
      execution: {
        ...runRecord().execution,
        finalResponseSummary: "Everything succeeded and production is healthy.",
      },
      evidence: {
        status: "not_checked",
        total: 0,
        passed: 0,
        failed: 0,
        sources: [],
        blocking: [],
      },
      proofBoundary: {
        proven: [],
        notProven: ["External production health is not proven by this run."],
        assumptions: [],
        evidenceGaps: ["No verification evidence was checked."],
      },
    }));

    expect(view.trust).toEqual({
      label: "insufficient-evidence",
      copy: "Not enough evidence to mark this run successful",
      reason: "Verification evidence was not checked or was insufficient.",
    });
  });

  it("marks replay reports as replay-only even when their stored status succeeded", () => {
    const view = normalizeRunRecord(runRecord({
      status: "succeeded",
      replay: {
        supported: true,
        trajectoryPath: "/tmp/replay.json",
        latestReplayReportId: "local-real-task-v1:replay-report",
        freshExecution: false,
      },
    }));

    expect(view.trust).toEqual({
      label: "replay-only",
      copy: "Replay result, not a fresh execution",
      reason: "This record is a replay/report view and cannot prove fresh execution.",
    });
  });

  it("groups run records into review queues", () => {
    const collection = summarizeRunRecords([
      runRecord({ id: "run_succeeded", status: "succeeded" }),
      runRecord({ id: "run_failed", status: "failed", nextAction: "Inspect failed evidence." }),
      runRecord({ id: "run_approval", status: "awaiting_approval" }),
      runRecord({
        id: "run_replay",
        task: { ...runRecord().task, source: "replay" },
        replay: { supported: true, freshExecution: false, latestReplayReportId: "case:replay-report" },
      }),
      runRecord({
        id: "run_no_op",
        status: "no_op",
        nextAction: "Review automation scope before treating no-op as health.",
      }),
    ]);

    expect(collection.queues.needsAction.map((run) => run.id)).toEqual(expect.arrayContaining(["run_failed", "run_approval", "run_no_op"]));
    expect(collection.queues.needsAction).toHaveLength(3);
    expect(collection.queues.failedOrDegraded.map((run) => run.id)).toEqual(["run_failed"]);
    expect(collection.queues.awaitingApproval.map((run) => run.id)).toEqual(["run_approval"]);
    expect(collection.queues.replayOrEval.map((run) => run.id)).toEqual(["run_replay"]);
    expect(collection.queues.recentSucceeded.map((run) => run.id)).toEqual(["run_succeeded"]);
    expect(collection.runs.find((run) => run.id === "run_no_op")?.trust.label).toBe("needs-review");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts
```

Expected: FAIL with TypeScript/test errors indicating `trust` and `queues` do not exist.

- [ ] **Step 3: Implement minimal derived trust and queue model**

In `packages/web/src/runs/model.ts`, add the exported types near the existing view interfaces:

```ts
export type RunTrustLabel = "evidence-backed" | "needs-review" | "insufficient-evidence" | "replay-only" | "not-checked";

export interface RunTrustSummary {
  label: RunTrustLabel;
  copy: string;
  reason: string;
}

export interface RunQueueSummary {
  needsAction: RunRecordListItem[];
  failedOrDegraded: RunRecordListItem[];
  awaitingApproval: RunRecordListItem[];
  replayOrEval: RunRecordListItem[];
  recentSucceeded: RunRecordListItem[];
}
```

Add `trust: RunTrustSummary;` to `RunRecordListItem` and `RunRecordDetailView`. Add `queues: RunQueueSummary;` to `RunRecordCollectionView`.

Use this implementation shape:

```ts
function trustFor(record: RunRecord, nextAction: RunRecordDetailView["nextAction"]): RunTrustSummary {
  const deniedApproval = record.approvals.some((approval) => approval.approved === false);
  if (!record.replay.freshExecution) {
    return {
      label: "replay-only",
      copy: "Replay result, not a fresh execution",
      reason: "This record is a replay/report view and cannot prove fresh execution.",
    };
  }
  if (deniedApproval) {
    return {
      label: "needs-review",
      copy: "Needs review",
      reason: "Stopped because approval was denied.",
    };
  }
  if (["failed", "degraded", "cancelled", "awaiting_approval", "no_op", "unknown"].includes(record.status) || nextAction.required) {
    return {
      label: "needs-review",
      copy: "Needs review",
      reason: nextAction.label,
    };
  }
  if (record.evidence.status === "not_checked" || record.evidence.status === "insufficient_evidence" || record.evidence.total === 0) {
    return {
      label: "insufficient-evidence",
      copy: "Not enough evidence to mark this run successful",
      reason: "Verification evidence was not checked or was insufficient.",
    };
  }
  if (record.status === "succeeded" && record.evidence.status === "passed" && record.evidence.passed > 0 && record.proofBoundary.evidenceGaps.length === 0) {
    return {
      label: "evidence-backed",
      copy: "Evidence-backed completion",
      reason: "Fresh execution with passed evidence and no evidence gaps.",
    };
  }
  return {
    label: "not-checked",
    copy: "Not checked",
    reason: "No verification evidence was checked for this run.",
  };
}

function queueSummaryFor(runs: RunRecordListItem[]): RunQueueSummary {
  return {
    needsAction: runs.filter((run) => run.nextActionRequired),
    failedOrDegraded: runs.filter((run) => ["failed", "degraded", "cancelled"].includes(run.status)),
    awaitingApproval: runs.filter((run) => run.status === "awaiting_approval"),
    replayOrEval: runs.filter((run) => run.trust.label === "replay-only" || run.taskSource === "eval" || run.taskSource === "replay"),
    recentSucceeded: runs.filter((run) => run.trust.label === "evidence-backed"),
  };
}
```

Wire `trustFor(record, nextActionFor(record))` into `normalizeRunRecord()` and `listItemFor(record)`. Add `taskSource: string` and `nextActionRequired: boolean` to `RunRecordListItem`. In `summarizeRunRecords()`, compute `const runs = ...` once and return `{ empty: false, runs, queues: queueSummaryFor(runs) }`; for empty collections return empty queue arrays.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts
```

Expected: PASS for `runs-view.test.ts`.

---

### Task 2: Render Queue Buckets And Trust Header

**Files:**
- Modify: `packages/web/src/runs/workbench.ts`
- Test: `packages/web/src/__tests__/run-workbench.test.ts`

**Interfaces:**
- Consumes: `RunRecordCollectionView.queues`, `RunRecordListItem.trust`, `RunRecordDetailView.trust`.
- Produces: HTML containing queue bucket labels and selected run trust facts.

- [ ] **Step 1: Write the failing rendering tests**

Add these tests inside `describe("run workbench page", () => { ... })` in `packages/web/src/__tests__/run-workbench.test.ts`:

```ts
  it("renders Run Review V1 queues, row trust labels, and selected trust header", () => {
    const view = buildRunWorkbenchView([
      record({ id: "run_ok", status: "succeeded" }),
      record({ id: "run_failed", status: "failed", nextAction: "Inspect failed evidence." }),
      record({
        id: "run_replay",
        replay: { supported: true, freshExecution: false, latestReplayReportId: "case:replay-report" },
      }),
    ], "run_replay");

    const html = renderRunWorkbench(view);

    expect(html).toContain("Run queues");
    expect(html).toContain("Needs Action");
    expect(html).toContain("Failed / Degraded");
    expect(html).toContain("Awaiting Approval");
    expect(html).toContain("Replay / Eval");
    expect(html).toContain("Recent Succeeded");
    expect(html).toContain("Run trust");
    expect(html).toContain("replay-only");
    expect(html).toContain("Replay result, not a fresh execution");
    expect(html).toContain("This record is a replay/report view and cannot prove fresh execution.");
  });

  it("renders approval denial as stopped and never as a succeeded tool", () => {
    const view = buildRunWorkbenchView([record({
      id: "run_denied",
      status: "cancelled",
      approvals: [{
        toolName: "shell_exec",
        approved: false,
        decidedAt: "2026-06-10T00:00:01.000Z",
        riskLevel: "R4",
        permission: "execute",
        sideEffect: "local",
        reversible: false,
        targetResource: "workspace:dangerous-command",
      }],
      tools: [{
        name: "shell_exec",
        attempted: true,
        succeeded: false,
        permission: "execute",
        riskLevel: "R4",
        sideEffect: "local",
        targetResource: "workspace:dangerous-command",
      }],
      nextAction: "Request explicit approval or choose a safer path.",
    })], "run_denied");

    const html = renderRunWorkbench(view);

    expect(html).toContain("Stopped because approval was denied.");
    expect(html).toContain("Denied");
    expect(html).toContain("Not succeeded");
    expect(html).not.toContain("<td>Succeeded</td><td>execute</td><td>R4</td>");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Expected: FAIL because queue bucket copy and trust header do not render yet.

- [ ] **Step 3: Implement minimal rendering**

In `packages/web/src/runs/workbench.ts`, update `RunWorkbenchStats` with `awaitingApproval`, `replayOrEval`, and `recentSucceeded`. Compute those values from `view.collection.queues`.

Add helpers:

```ts
function renderQueueBuckets(view: RunWorkbenchView): string {
  const queues = view.collection.queues;
  return `
    <section class="run-stats" aria-label="Run queues">
      ${renderStat("Total", view.stats.total)}
      ${renderStat("Needs Action", queues.needsAction.length)}
      ${renderStat("Failed / Degraded", queues.failedOrDegraded.length)}
      ${renderStat("Awaiting Approval", queues.awaitingApproval.length)}
      ${renderStat("Replay / Eval", queues.replayOrEval.length)}
      ${renderStat("Recent Succeeded", queues.recentSucceeded.length)}
      ${renderStat("Schema warnings", view.stats.schemaWarnings)}
    </section>
  `;
}

function renderTrustHeader(run: RunRecordDetailView): string {
  return panel("Run trust", `
    <div class="summary-strip">
      ${renderFact("Trust", run.trust.label)}
      ${renderFact("Assessment", run.trust.copy)}
      ${renderFact("Reason", run.trust.reason)}
      ${renderFact("Fresh execution", run.replay.freshExecution ? "Yes" : "No")}
      ${renderFact("Next action", run.nextAction.label)}
    </div>
  `);
}
```

Replace the existing `run-stats` block in `renderRunWorkbench()` with `${renderQueueBuckets(view)}` and render `${renderTrustHeader(view.selected)}` before `${renderSummary(view.selected)}`.

In `renderRunList()`, add row trust label and copy:

```ts
      <span>${escapeHtml(run.trust.label)} / ${escapeHtml(run.trust.copy)}</span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Expected: PASS for `run-workbench.test.ts`.

---

### Task 3: Fixture Coverage And Acceptance Delta

**Files:**
- Modify: `packages/web/src/__tests__/run-workbench.test.ts`
- Create: `doc/evals/07-run-review-workbench-v1-delta-2026-06-23.md`

**Interfaces:**
- Consumes: `buildP0RunAuditFixtureRecords()` from `packages/engine/src/evals/run-audit-fixtures.ts`, exported through `@keigent/engine`.
- Produces: fixture assertions proving the seven P0-02 audit cases render with Run Review V1 trust semantics.

- [ ] **Step 1: Add fixture expectation assertions**

Extend the existing `"renders the P0 audit fixture set across success, failure, approval, replay, no-op, and child workflow records"` test with these assertions:

```ts
    expect(view.collection.queues.needsAction).toHaveLength(5);
    expect(view.collection.queues.failedOrDegraded).toHaveLength(4);
    expect(view.collection.queues.replayOrEval).toHaveLength(6);
    expect(view.collection.runs.find((run) => run.id === "run_file-summary")?.trust.label).toBe("evidence-backed");
    expect(view.collection.runs.find((run) => run.id === "run_failed-assertion")?.trust.label).toBe("needs-review");
    expect(view.collection.runs.find((run) => run.id === "run_approval-denied")?.trust.reason).toBe("Stopped because approval was denied.");
    expect(view.collection.runs.find((run) => run.id === "run_replay-report")?.trust.label).toBe("replay-only");
    expect(view.collection.runs.find((run) => run.id === "run_insufficient-evidence-success-claim")?.trust.label).toBe("insufficient-evidence");
    expect(view.collection.runs.find((run) => run.id === "run_no-op-automation")?.trust.label).toBe("needs-review");
    expect(view.collection.runs.find((run) => run.id === "run_parent-timeout-child-success")?.trust.label).toBe("needs-review");
    expect(renderRunWorkbench(buildRunWorkbenchView(records, "run_insufficient-evidence-success-claim"))).toContain("Not enough evidence to mark this run successful");
```

- [ ] **Step 2: Run test to verify it fails if Task 1 and Task 2 are absent**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Expected before implementation: FAIL on missing `trust` or expected copy. Expected after Task 1 and Task 2: PASS.

- [ ] **Step 3: Add acceptance delta document**

Create `doc/evals/07-run-review-workbench-v1-delta-2026-06-23.md`:

```markdown
# Run Review Workbench V1 Acceptance Delta - 2026-06-23

## Scope

- Backlog package: `P0-02 Workbench Run Detail v1`
- Design package: `P0 Design Run Review Workbench v1`
- Spec: `docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md`

## Delivered

- Added derived Run Review trust labels in the Web view model.
- Added queue summaries for Needs Action, Failed / Degraded, Awaiting Approval, Replay / Eval, and Recent Succeeded.
- Rendered selected-run Run Trust header and row-level trust copy.
- Preserved Proof Boundary as a first-class panel.
- Covered the seven P0 audit fixture records.

## Acceptance Evidence

- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`

## Proven

- Fresh succeeded runs with passed evidence and no evidence gaps can display `evidence-backed`.
- Replay records display `Replay result, not a fresh execution`.
- Approval-denied runs display `Stopped because approval was denied`.
- No-op automation and parent timeout records remain review states.
- Empty or unchecked evidence cannot become trusted success through final response text.

## Not Proven

- This package does not prove the complete P1 Skill Governance Surface.
- This package does not prove the complete P2 Eval Review Dashboard.
- This package does not prove the complete P3 Calibrated Escalation Flow.

## Remaining Risks

- Queue grouping is derived from existing RunRecord fields and may need another pass when interactive filtering is added.
- This package does not add a persistent web API field; it is currently a view-model contract.
```

- [ ] **Step 4: Run final verification commands**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg -n "T[B]D|T[O]DO|implement[ ]later|fill[ ]in|待[定]|占[位]" docs/superpowers/plans/2026-06-23-run-review-workbench-v1.md docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md doc/evals/07-run-review-workbench-v1-delta-2026-06-23.md doc/product/03-web-workbench-blueprint.md doc/design/05-web-dashboard.md doc/product/12-development-priority-backlog.md
```

Expected:
- Vitest commands exit 0.
- `check`, `test`, and `build` exit 0.
- `git diff --check` exits 0.
- `rg` exits 1 with no placeholder matches.

---

## Self-Review

- Spec coverage: The plan implements trust labels, queue buckets, replay-only copy, approval-denied copy, empty evidence guard, no-op review state, parent timeout review state, and persistent Proof Boundary rendering.
- Intentional gaps: P1 Skill Governance Surface, P2 Eval Review Dashboard, and P3 Calibrated Escalation Flow are named out of scope for this first implementation package.
- Placeholder scan: This plan contains no unresolved placeholder sentinel terms, no unspecified error handling instruction, and no reference to unknown files.
- Type consistency: `RunTrustSummary`, `RunQueueSummary`, `trust`, and `queues` are defined in Task 1 before Task 2 and Task 3 consume them.
