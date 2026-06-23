# P2-02 L3 Operator Scenario Eval Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a current, independently verifiable P2-02 L3 operator scenario eval acceptance package.

**Architecture:** Treat the existing operator scenario eval implementation as the subject under audit. Bind the current engine fixture, CLI packet output, human sign-off validation, proof boundary, and false-acceptance guards to an explicit spec, plan, acceptance delta, and fresh verification commands.

**Tech Stack:** TypeScript, pnpm, Vitest, existing `@keigent/engine` operator scenario eval and `@keigent/cli` eval command.

## Global Constraints

- Backlog item is `P2-02 L3 Operator Scenario Eval`.
- Do not replace human reviewer with automatic judge.
- Do not claim fixture pass proves production health or human acceptance.
- Do not widen connector/write permissions.
- Keep the seven backlog operator journeys visible in tests and docs.

---

### Task 1: Current L3 Operator Eval Audit Documents

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-l3-operator-scenario-eval-audit-design.md`
- Create: `docs/superpowers/plans/2026-06-23-l3-operator-scenario-eval-audit.md`
- Create: `doc/evals/18-l3-operator-scenario-eval-audit-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/product/09-agent-operations-maturity-roadmap.md`

**Interfaces:**
- Consumes: P2-02 backlog requirements and existing operator scenario eval implementation.
- Produces: current spec, implementation/audit plan, eval delta, and product traceability.

- [x] **Step 1: Write current spec**

Document the current P2-02 contract:

```text
operator journeys -> fixture report -> human packet -> sign-off validation -> operator-human-acceptance record
```

- [x] **Step 2: Write audit plan**

Document exact files, commands, proof boundary, and commit steps.

- [x] **Step 3: Write acceptance delta**

Create the P2-02 acceptance delta with changed files, tests, evidence, proof boundary, and remaining risks.

- [x] **Step 4: Run target verification**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/operator-scenario-eval.test.ts
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/eval-commands.test.ts
corepack pnpm --filter @keigent/engine eval:operator -- --compact
corepack pnpm --filter @keigent/cli start eval operator --compact
corepack pnpm --filter @keigent/cli start eval operator --packet
```

Expected: all commands pass; packet output contains proof boundary and manual sign-off sections.

- [x] **Step 5: Run final verification**

```bash
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P2-02|L3 Operator Scenario Eval|operator-human-acceptance|Fixture results are not human acceptance|operator-scenario-v1|Override reason|Evidence inspected" docs/superpowers doc packages
```

Expected: all commands pass.

- [x] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-l3-operator-scenario-eval-audit-design.md docs/superpowers/plans/2026-06-23-l3-operator-scenario-eval-audit.md doc/evals/18-l3-operator-scenario-eval-audit-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/product/09-agent-operations-maturity-roadmap.md
git commit -m "docs: add l3 operator scenario eval audit"
```
