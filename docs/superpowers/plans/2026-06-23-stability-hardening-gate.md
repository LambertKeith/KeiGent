# P0-05 Stability Hardening Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic P0 stability gate that checks nine false-confidence redlines and can run from an engine package script.

**Architecture:** Build `packages/engine/src/evals/stability-gate.ts` on top of the existing real-world L2 fixture report and RunRecord facts. Add a small CLI wrapper and package script, export the API, then document the P0-05 delta and P0 acceptance boundary.

**Tech Stack:** TypeScript, pnpm, Vitest, existing engine eval harness.

## Global Constraints

- Backlog item is `P0-05 Stability Hardening Gate`.
- Do not create a second agent loop.
- Do not change database schema or migration files.
- Do not change `RunRecord` schema.
- Gate must use RunRecord/eval facts, not final text.
- Fixture pass must not claim product health or human acceptance.

---

### Task 1: Stability Gate API

**Files:**
- Create: `packages/engine/src/evals/stability-gate.ts`
- Modify: `packages/engine/src/evals/index.ts`
- Modify: `packages/engine/src/lib.ts`
- Test: `packages/engine/src/__tests__/stability-gate.test.ts`

**Interfaces:**
- Consumes: `runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor())`.
- Produces: `runStabilityGate(): Promise<StabilityGateReport>`.

- [x] **Step 1: Write failing tests**

Create tests that assert:

```ts
const report = await runStabilityGate();
expect(report.status).toBe("passed");
expect(report.redlines.map((check) => check.id)).toEqual([
  "final_text_not_success",
  "tool_attempted_not_succeeded",
  "replay_not_fresh",
  "empty_evidence_not_100",
  "approval_not_bypassed",
  "blocked_skill_not_injected",
  "reviewer_readonly",
  "parent_timeout_authoritative",
  "secret_redaction",
]);
expect(report.failedRedlines).toBe(0);
```

- [x] **Step 2: Run RED**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/stability-gate.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement API**

Implement `runStabilityGate`, `buildStabilityGateReport`, and redline helpers. Each helper must return one `StabilityGateCheck`.

- [x] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/stability-gate.test.ts
```

Expected: PASS.

### Task 2: CLI and Script

**Files:**
- Create: `packages/engine/src/evals/stability-gate-cli.ts`
- Modify: `packages/engine/package.json`
- Test: `packages/engine/src/__tests__/stability-gate-cli.test.ts`

**Interfaces:**
- Consumes: `runStabilityGate()`.
- Produces: `eval:stability` script.

- [x] **Step 1: Write failing CLI test**

Use `node:child_process` to run:

```bash
corepack pnpm --filter @keigent/engine eval:stability -- --compact
```

Assert exit code 0 and JSON payload with `status: "passed"` and `totalRedlines: 9`.

- [x] **Step 2: Run RED**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/stability-gate-cli.test.ts
```

Expected: FAIL because script does not exist.

- [x] **Step 3: Implement CLI**

Add CLI script that prints JSON compactly when `--compact` is present and exits non-zero when `failedRedlines > 0`.

- [x] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/stability-gate-cli.test.ts
```

Expected: PASS.

### Task 3: Documentation and P0 Acceptance Delta

**Files:**
- Create: `doc/evals/10-stability-hardening-gate-delta-2026-06-23.md`
- Create: `doc/evals/11-p0-acceptance-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: P0-05 spec, implementation, and verification output.
- Produces: P0-05 delta and P0 acceptance boundary.

- [x] **Step 1: Document package delta**

Write changed files, redline matrix, tests, proof boundary, and remaining risks.

- [x] **Step 2: Document P0 acceptance delta**

List P0-01 through P0-05 evidence references and explicitly state what remains unproven.

- [x] **Step 3: Run verification**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/stability-gate.test.ts src/__tests__/stability-gate-cli.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P0-05|Stability Hardening|eval:stability|final_text_not_success|secret_redaction" AGENTS.md docs/superpowers doc packages
```

Expected: all commands pass; `eval:stability` returns `status: "passed"` and nine redlines.

- [x] **Step 4: Commit**

```bash
git add AGENTS.md doc/evals/README.md doc/evals/10-stability-hardening-gate-delta-2026-06-23.md doc/evals/11-p0-acceptance-delta-2026-06-23.md doc/product/12-development-priority-backlog.md docs/superpowers/specs/2026-06-23-stability-hardening-gate-design.md docs/superpowers/plans/2026-06-23-stability-hardening-gate.md packages/engine/package.json packages/engine/src/evals/index.ts packages/engine/src/evals/stability-gate.ts packages/engine/src/evals/stability-gate-cli.ts packages/engine/src/lib.ts packages/engine/src/__tests__/stability-gate.test.ts packages/engine/src/__tests__/stability-gate-cli.test.ts
git commit -m "feat: add stability hardening gate"
```
