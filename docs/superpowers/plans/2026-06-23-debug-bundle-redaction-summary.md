# P1-04 Debug Bundle Redaction Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before implementation. Track steps with checkbox syntax.

**Goal:** Add an explicit redaction summary artifact to debug bundles so operators can audit what was redacted and what remains unproven.

**Architecture:** Keep the existing `redaction.ts` policy and RunRecord schema. Extend `debug-bundle.ts` with a small `redactionSummary()` builder, write it as `redaction-summary.json`, and cover engine plus CLI bundle export paths.

**Tech Stack:** TypeScript, pnpm, Vitest, existing engine debug bundle helpers and CLI runs command.

## Global Constraints

- Backlog item is `P1-04 Schema Migration / Redaction Hardening`.
- Do not change migration files.
- Do not rewrite existing RunRecords.
- Do not broaden scope to generic PII detection.
- Do not change real artifact paths used for file reads.
- `redaction-summary.json` itself must be redacted.

---

### Task 1: Engine Debug Bundle Redaction Summary

**Files:**
- Modify: `packages/engine/src/debug-bundle.ts`
- Test: `packages/engine/src/__tests__/debug-bundle.test.ts`

**Interfaces:**
- Consumes: `exportRunDebugBundle(record, options)`.
- Produces: `redaction-summary.json` with kind `redaction_summary`.

- [x] **Step 1: Write failing engine test**

Add assertions to the existing debug bundle export test:

```ts
expect(result.files).toContainEqual(expect.objectContaining({ relativePath: "redaction-summary.json" }));
const redactionSummary = JSON.parse(await readFile(join(bundleDir, "redaction-summary.json"), "utf8"));
expect(redactionSummary).toMatchObject({
  schemaVersion: 1,
  runId: "run_failed",
  applied: true,
  rawPayloadStored: false,
  rules: expect.arrayContaining(["secret_like_keys", "secret_like_text", "user_home_path_segments"]),
  scopes: expect.arrayContaining([
    expect.objectContaining({ name: "record", redacted: true }),
    expect.objectContaining({ name: "config", redacted: true }),
    expect.objectContaining({ name: "generated_summaries", redacted: true }),
    expect.objectContaining({ name: "artifact_copies", redacted: true }),
  ]),
});
expect(JSON.stringify(redactionSummary)).not.toContain("sk-config-secret-123456");
```

- [x] **Step 2: Run RED**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts
```

Observed: FAIL because `redaction-summary.json` did not exist.

- [x] **Step 3: Implement summary artifact**

Add `redaction_summary` to `DebugBundleFileKind`, write `redaction-summary.json`, and build a summary with rules, scopes, files, missing artifacts, and does-not-prove boundaries. Wrap the summary with `redactObject()`.

- [x] **Step 4: Run GREEN**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts
```

Observed: PASS, 1 test file / 1 test.

### Task 2: CLI Debug Bundle Surface

**Files:**
- Test: `packages/cli/src/__tests__/runs-commands.test.ts`

**Interfaces:**
- Consumes: `runRunsCommand(["debug-bundle", ...])`.
- Produces: compact output listing `redaction-summary.json` and a redacted summary file on disk.

- [x] **Step 1: Write failing CLI assertion**

Extend the existing CLI debug bundle test to expect:

```ts
expect(payload.files).toContainEqual(expect.objectContaining({ relativePath: "redaction-summary.json" }));
const redactionSummary = await readFile(join(bundleDir, "redaction-summary.json"), "utf8");
expect(redactionSummary).not.toContain("sk-record-secret-123456");
expect(redactionSummary).not.toContain("sk-workflow-secret-123456");
```

- [x] **Step 2: Run CLI focused test**

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts
```

Observed after engine implementation: PASS, 1 test file / 13 tests.

### Task 3: Docs and Acceptance

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-debug-bundle-redaction-summary-design.md`
- Create: `docs/superpowers/plans/2026-06-23-debug-bundle-redaction-summary.md`
- Create: `doc/evals/15-debug-bundle-redaction-summary-delta-2026-06-23.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/12-development-priority-backlog.md`
- Modify: `doc/design/12-agent-debuggability.md`

**Interfaces:**
- Consumes: P1-04 backlog requirements.
- Produces: spec, plan, eval delta, and design traceability.

- [x] **Step 1: Document P1-04 product contract**

Write a spec that states debug bundles include explicit redaction scope and proof boundary.

- [x] **Step 2: Document implementation plan**

Write this plan with TDD RED/GREEN steps and exact verification commands.

- [x] **Step 3: Document acceptance delta**

Create `doc/evals/15-debug-bundle-redaction-summary-delta-2026-06-23.md` with changed files, tests, evidence, proof boundary, and risks.

- [x] **Step 4: Run final verification**

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/debug-bundle.test.ts src/__tests__/run-record.test.ts src/__tests__/real-world-eval.test.ts
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/runs-commands.test.ts src/__tests__/config.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
corepack pnpm --filter @keigent/engine eval:stability -- --compact
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg "P1-04|Schema Migration / Redaction|redaction-summary|redaction_summary|Redaction Summary" docs/superpowers doc packages
```

Observed: all commands passed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-debug-bundle-redaction-summary-design.md docs/superpowers/plans/2026-06-23-debug-bundle-redaction-summary.md doc/evals/15-debug-bundle-redaction-summary-delta-2026-06-23.md doc/evals/README.md doc/product/12-development-priority-backlog.md doc/design/12-agent-debuggability.md packages/engine/src/debug-bundle.ts packages/engine/src/__tests__/debug-bundle.test.ts packages/cli/src/__tests__/runs-commands.test.ts
git commit -m "feat: add debug bundle redaction summary"
```
