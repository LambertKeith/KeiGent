# Observability Debug Package Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete P2-03 by giving the debug bundle a documented, tested observability summary with explicit timeout/abort source signals.

**Architecture:** Keep `exportRunDebugBundle()` as the single debug bundle writer. Add a small source extraction helper inside `packages/engine/src/debug-bundle.ts` so `observability-summary.json` exposes recorded timeout/abort evidence without inventing latency or runtime facts.

**Tech Stack:** TypeScript, pnpm, Vitest, existing RunRecord and debug bundle APIs.

## Global Constraints

- All responses and docs should align with AGENTS.md project boundaries.
- Do not edit database migration files.
- Do not fabricate latency; missing tool/model latency must remain `not_recorded`.
- Do not introduce automatic judge conclusions from debug bundle data.
- Keep changes scoped to P2-03 docs, tests, debug bundle implementation, and acceptance delta.

---

### Task 1: Add P2-03 Regression Test

**Files:**
- Modify: `packages/engine/src/__tests__/debug-bundle.test.ts`

**Interfaces:**
- Consumes: `exportRunDebugBundle(record, { bundleDir, config? })`
- Produces: A failing test that requires `observability-summary.json.timeoutAbort.timeoutSources` and `abortSources`.

- [x] **Step 1: Write the failing test**

Add a test that exports a cancelled run with `workflow.exitReason = "timeout"`, a timeout failure code, and an aborted final response summary. Assert:

```ts
expect(observability.timeoutAbort).toMatchObject({
  timedOut: true,
  aborted: true,
  timeoutSources: expect.arrayContaining(["workflow.exitReason", "failures.timeout"]),
  abortSources: ["execution.finalResponseSummary"],
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts
```

Expected before implementation: FAIL because `timeoutSources` and `abortSources` are missing.

### Task 2: Add Timeout / Abort Source Extraction

**Files:**
- Modify: `packages/engine/src/debug-bundle.ts`

**Interfaces:**
- Consumes: `RunRecord`
- Produces: `timeoutAbort` with `timedOut`, `aborted`, `timeoutSources`, and `abortSources`.

- [x] **Step 1: Implement source extraction**

Add helper functions:

```ts
function timeoutAbortSummary(record: RunRecord): Record<string, unknown> {
  const timeoutSources = timeoutSourceSignals(record);
  const abortSources = abortSourceSignals(record);
  return {
    timedOut: timeoutSources.length > 0,
    aborted: abortSources.length > 0,
    timeoutSources,
    abortSources,
  };
}
```

- [x] **Step 2: Wire helper into `observabilitySummary()`**

Replace the inline `timeoutAbort` object with `timeoutAbort: timeoutAbortSummary(record)`.

- [x] **Step 3: Run targeted test**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts
```

Expected: PASS.

### Task 3: Add P2-03 Acceptance Delta

**Files:**
- Create: `doc/evals/19-observability-debug-package-audit-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/product/09-agent-operations-maturity-roadmap.md`

**Interfaces:**
- Consumes: P2-03 backlog definition and verification output.
- Produces: A discoverable acceptance delta for P2-03.

- [x] **Step 1: Document acceptance scope**

The delta must list proven items:

- redacted debug bundle files
- failure summary
- budget / recovery
- timeout / abort source signals
- failure taxonomy
- `not_recorded` latency

- [x] **Step 2: Link docs**

Add README and backlog links to the new delta.

### Task 4: Verify and Commit

**Files:**
- All P2-03 files changed above.

**Interfaces:**
- Consumes: repository commands.
- Produces: pushed commit on `agent-operations-next-round`.

- [x] **Step 1: Run P2-03 target commands**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
```

- [x] **Step 2: Run repo quality gates**

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

- [x] **Step 3: Commit and push**

```bash
git add docs/superpowers/specs/2026-06-23-observability-debug-package-audit-design.md docs/superpowers/plans/2026-06-23-observability-debug-package-audit.md packages/engine/src/__tests__/debug-bundle.test.ts packages/engine/src/debug-bundle.ts doc/evals/19-observability-debug-package-audit-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/product/09-agent-operations-maturity-roadmap.md
git commit -m "feat: harden observability debug package"
git push
```
