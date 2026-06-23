# P1-02 Local Automation Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before implementation. Track steps with checkbox syntax.

**Goal:** Make local automation triage produce operator-readable, audit-ready output for no-op and attention-required runs.

**Architecture:** Keep local triage as a read-only automation over the local run store. Reuse existing report, trajectory, RunRecord, redaction, and Workbench surfaces; tighten the CLI human output so artifact paths, source ids, next action, and proof boundary are visible without requiring JSON parsing.

**Tech Stack:** TypeScript, pnpm, Vitest, existing CLI command modules, engine automation triage helpers, Workbench view model tests.

## Global Constraints

- Backlog item is `P1-02 Local Automation Triage`.
- Do not delete or mutate source RunRecords.
- Do not modify migration files.
- Do not claim no-op means system health.
- Do not execute external writes.
- Preserve `--json` and `--compact` machine-readable output.

---

### Task 1: Human Output Contract

**Files:**
- Modify: `packages/cli/src/automation-commands.ts`
- Test: `packages/cli/src/__tests__/automation-commands.test.ts`

**Interfaces:**
- Consumes: `runAutomationCommand(args, options)` from `packages/cli/src/automation-commands.ts`.
- Produces: default human output lines for no-op and attention-required triage.

- [x] **Step 1: Write failing no-op human output test**

Add a test that saves one successful source run, invokes `runAutomationCommand(["triage", "local"])`, and expects:

```ts
[
  "No triage candidates found.",
  "Status: no-op",
  "Scope: last 20 runs",
  expect.stringContaining("Automation record: "),
  expect.stringContaining("Report: "),
  expect.stringContaining("Trajectory: "),
  "Next action: Review automation scope before treating no-op as health.",
  "Does not prove: No hidden failures outside this scope.",
]
```

- [x] **Step 2: Write failing attention-required human output test**

Add a test that saves one failed source run, invokes `runAutomationCommand(["triage", "local"])`, and expects:

```ts
[
  "Triage candidates: 1",
  expect.stringContaining("Automation record: "),
  expect.stringContaining("Report: "),
  expect.stringContaining("Trajectory: "),
  "Next action: Review 1 triage candidates before retrying or accepting affected runs.",
  "Source runs: run_failed",
  "run_failed\tfailed\tblocking_failure\tInspect the failed assertion.",
]
```

- [x] **Step 3: Run RED**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/automation-commands.test.ts
```

Expected: FAIL because default human output omits automation record / trajectory / next action for no-op and omits summary artifact lines for attention-required.

- [x] **Step 4: Implement minimal CLI output**

In `runAutomationCommand()`, keep JSON output unchanged. For default no-op output, print automation record path, report path, trajectory path, next action, and does-not-prove. For attention-required output, print candidate count, automation record path, report path, trajectory path, next action, source run ids, then candidate rows.

- [x] **Step 5: Run GREEN**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/automation-commands.test.ts
```

Observed: PASS, 1 test file / 7 tests.

### Task 2: Regression Coverage

**Files:**
- Test: `packages/engine/src/__tests__/automation-triage.test.ts`
- Test: `packages/cli/src/__tests__/runs-commands.test.ts`
- Test: `packages/web/src/__tests__/run-workbench.test.ts`

**Interfaces:**
- Consumes: automation report / RunRecord helpers and Workbench view model rendering.
- Produces: proof that engine artifact semantics, lightweight runs triage, and Workbench display still match P1-02.

- [x] **Step 1: Run engine artifact tests**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/automation-triage.test.ts
```

Observed: PASS, 2 test files / 3 tests when paired with `debug-bundle.test.ts`.

- [x] **Step 2: Run CLI runs triage tests**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts
```

Observed: PASS, 1 test file / 13 tests.

- [x] **Step 3: Run Workbench P1-02 regression**

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Observed: PASS, 1 test file / 14 tests.

### Task 3: Docs and Acceptance

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-local-automation-triage-design.md`
- Create: `docs/superpowers/plans/2026-06-23-local-automation-triage.md`
- Create: `doc/evals/13-local-automation-triage-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`

**Interfaces:**
- Consumes: P1-02 backlog requirements.
- Produces: spec, plan, delta, eval index, and backlog traceability.

- [x] **Step 1: Document P1-02 product contract**

Write a spec that states no-op, attention-required, source run id, artifact path, and proof boundary requirements.

- [x] **Step 2: Document implementation plan**

Write this plan with TDD RED/GREEN steps and exact verification commands.

- [x] **Step 3: Document acceptance delta**

Create `doc/evals/13-local-automation-triage-delta-2026-06-23.md` with changed files, tests, evidence, proof boundary, and risks.

- [x] **Step 4: Run final verification**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/automation-commands.test.ts src/__tests__/runs-commands.test.ts
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/automation-triage.test.ts src/__tests__/debug-bundle.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P1-02|Local Automation Triage|automation triage local|Automation record|Source runs" docs/superpowers doc packages
```

Observed: all commands passed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-local-automation-triage-design.md docs/superpowers/plans/2026-06-23-local-automation-triage.md doc/evals/13-local-automation-triage-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md packages/cli/src/automation-commands.ts packages/cli/src/__tests__/automation-commands.test.ts
git commit -m "feat: improve local automation triage output"
```
