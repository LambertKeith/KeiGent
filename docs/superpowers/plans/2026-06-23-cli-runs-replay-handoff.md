# P1-05 CLI Runs Replay Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before implementation. Track steps with checkbox syntax.

**Goal:** Make `runs replay <run-id>` output a copyable replay command plus explicit replay proof boundary for local operators.

**Architecture:** Keep `runs replay` as a read-only handoff command. Extend the replay payload in `packages/cli/src/runs-commands.ts` with proof-boundary fields and shell-safe command quoting; cover both human and compact output in CLI tests.

**Tech Stack:** TypeScript, pnpm, Vitest, existing CLI runs command.

## Global Constraints

- Backlog item is `P1-05 CLI Operator Ergonomics`.
- Do not execute replay from `runs replay`.
- Do not change run store location.
- Do not add an interactive TUI.
- Preserve `--json|--compact` output.
- Replay handoff must not imply fresh execution.

---

### Task 1: Replay Handoff Output

**Files:**
- Modify: `packages/cli/src/runs-commands.ts`
- Test: `packages/cli/src/__tests__/runs-commands.test.ts`

**Interfaces:**
- Consumes: `runRunsCommand(["replay", runId, ...])`.
- Produces: replay handoff payload with `doesNotProve` and `nextAction`.

- [x] **Step 1: Write failing human output test**

Add a test where `trajectoryPath` contains spaces and expect default output:

```ts
[
  "Run: run_replayable",
  "Replay command: keigent replay '/tmp/workflow path.json'",
  "Trajectory: /tmp/workflow path.json",
  "Fresh execution: false",
  "Does not prove: Historical replay does not prove fresh execution.",
  "Next action: Run the replay command, then inspect the replay report before accepting the result.",
]
```

- [x] **Step 2: Extend compact output assertion**

Update the existing compact replay test to expect:

```ts
{
  runId: "run_replayable",
  trajectoryPath: "/tmp/workflow path.json",
  command: "keigent replay '/tmp/workflow path.json'",
  freshExecution: false,
  doesNotProve: ["Historical replay does not prove fresh execution."],
  nextAction: "Run the replay command, then inspect the replay report before accepting the result.",
}
```

- [x] **Step 3: Run RED**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts
```

Expected: FAIL because human replay output is a single command and compact output lacks proof boundary fields / quoting.

- [x] **Step 4: Implement replay payload and shell quoting**

Add a replay handoff payload builder and quote trajectory paths for shell use. Human output should print run id, command, trajectory, fresh boundary, does-not-prove, and next action.

- [x] **Step 5: Run GREEN**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts
```

Expected: PASS.

### Task 2: Docs and Acceptance

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-cli-runs-replay-handoff-design.md`
- Create: `docs/superpowers/plans/2026-06-23-cli-runs-replay-handoff.md`
- Create: `doc/evals/16-cli-runs-replay-handoff-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/product/09-agent-operations-maturity-roadmap.md`

**Interfaces:**
- Consumes: P1-05 backlog requirements.
- Produces: spec, plan, eval delta, and product traceability.

- [x] **Step 1: Document P1-05 replay handoff contract**

Write a spec that states `runs replay` is a read-only handoff and must include replay proof boundary.

- [x] **Step 2: Document implementation plan**

Write this plan with TDD RED/GREEN steps and exact verification commands.

- [x] **Step 3: Document acceptance delta**

Create `doc/evals/16-cli-runs-replay-handoff-delta-2026-06-23.md` with changed files, tests, evidence, proof boundary, and risks.

- [x] **Step 4: Run final verification**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts src/__tests__/package-metadata.test.ts src/__tests__/eval-commands.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P1-05|CLI Operator Ergonomics|runs replay|Replay command|Historical replay" docs/superpowers doc packages
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-cli-runs-replay-handoff-design.md docs/superpowers/plans/2026-06-23-cli-runs-replay-handoff.md doc/evals/16-cli-runs-replay-handoff-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/product/09-agent-operations-maturity-roadmap.md packages/cli/src/runs-commands.ts packages/cli/src/__tests__/runs-commands.test.ts
git commit -m "feat: improve runs replay handoff"
```
