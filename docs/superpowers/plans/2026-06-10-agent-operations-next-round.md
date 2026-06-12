# Agent Operations Next Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the previous acceptance risks and implement the R1-R7 requirements from `doc/product/11-agent-project-learning-development-requirements.md`.

**Architecture:** Keep one `LoopEngine` and extend existing facts: `ProgressEvent`, `WorkflowEvent`, `WorkflowResult`, `RunRecord`, eval reports, CLI commands, and Web view models. Add stable event/proof/autonomy/capability records as provider-neutral data, not as a second agent runtime.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Node.js, local Web API/SSE, existing `@keigent/engine`, `@keigent/cli`, and `@keigent/web` packages.

---

## File Structure

- `scripts/verify-node-version.mjs`: release gate for Node `>=22.19.0`.
- `package.json`: add `verify:node` and keep root gates.
- `packages/cli/bin/keigent.mjs`: commit executable bit and keep shim behavior.
- `packages/cli/src/config.ts`: add `ModelCapabilities` to config defaults and `buildModel`.
- `packages/cli/src/config-doctor.ts`: add actionable `nextAction`, Node/browser/git capability issues, and provider capability validation.
- `packages/cli/src/config-commands.ts`: expose new doctor fields in JSON/compact output.
- `packages/engine/src/loop-events.ts`: stable Loop Event Protocol mapper.
- `packages/engine/src/proof-boundary.ts`: shared proof-boundary derivation.
- `packages/engine/src/run-record.ts`: add autonomy, proof boundary, event timeline, context/provider limitation fields.
- `packages/engine/src/workflow/types.ts`: add autonomy/self-repair/escalation types and event fields.
- `packages/engine/src/workflow/runner.ts`: emit repair/escalation protocol events and record bounded repair attempts.
- `packages/engine/src/evals/real-world.ts`: add autonomy, repair, proof-boundary cases and report fields.
- `packages/engine/src/evals/operator-scenarios.ts`: add proof boundary and acceptance packet semantics.
- `packages/cli/src/web-api-server.ts`: support deterministic E2E use of persisted runs and event protocol output.
- `packages/cli/src/__tests__/*`: add acceptance-risk, doctor, provider, operator, and E2E tests.
- `packages/engine/src/__tests__/*`: add protocol, proof, autonomy, repair, provider, and eval tests.
- `packages/web/src/conversation/*`: consume stable loop event protocol and keep unknown event fallback.
- `packages/web/src/runs/model.ts`: expose proof boundary, autonomy, repair, and event timeline.
- `packages/web/src/runs/workbench.ts`: render proof boundary and autonomy/repair sections.
- `packages/web/src/dashboard/*`: expose proof boundary in real-world eval report view.
- `packages/web/src/__tests__/*`: add proof boundary, event protocol, and E2E Workbench tests.
- `README.md`, `config.example.json`, `doc/product/10-release-and-upgrade.md`, `doc/evals/README.md`: document new gates and starter path.

---

### Task 1: Acceptance Risk Closure

**Files:**
- Create: `scripts/verify-node-version.mjs`
- Modify: `package.json`
- Modify mode: `packages/cli/bin/keigent.mjs`
- Modify: `packages/cli/src/config-doctor.ts`
- Modify: `packages/cli/src/__tests__/package-metadata.test.ts`
- Modify: `packages/cli/src/__tests__/config-doctor.test.ts`
- Modify: `doc/product/10-release-and-upgrade.md`

- [ ] **Step 1: Write failing tests for Node/bin/browser risk closure**

Add assertions that:

```ts
expect(packageJson.scripts["verify:node"]).toBe("node scripts/verify-node-version.mjs");
expect(statSync(join(root, "packages/cli/bin/keigent.mjs")).mode & 0o111).toBeGreaterThan(0);
expect(validateConfig(configWithMissingBrowserPath).map((issue) => issue.code)).toContain("browser.playwright_path_unset");
expect(issue.nextAction).toContain("PLAYWRIGHT_BROWSERS_PATH");
```

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts src/__tests__/config-doctor.test.ts
```

Expected: FAIL because the script, executable mode assertion, and browser next action do not all exist yet.

- [ ] **Step 2: Implement Node release gate**

Create `scripts/verify-node-version.mjs` that:

```js
#!/usr/bin/env node
const minimum = [22, 19, 0];
const current = process.versions.node.split(".").map((part) => Number(part));
const ok = current[0] > minimum[0]
  || (current[0] === minimum[0] && current[1] > minimum[1])
  || (current[0] === minimum[0] && current[1] === minimum[1] && current[2] >= minimum[2]);
if (!ok) {
  console.error(`Node ${process.versions.node} is below KeiGent release requirement >=22.19.0`);
  process.exit(1);
}
console.log(`Node ${process.versions.node} satisfies KeiGent release requirement >=22.19.0`);
```

Add to root `package.json` scripts:

```json
"verify:node": "node scripts/verify-node-version.mjs"
```

- [ ] **Step 3: Commit executable CLI bin mode**

Run:

```bash
chmod +x packages/cli/bin/keigent.mjs
git diff --summary packages/cli/bin/keigent.mjs
```

Expected: mode change to `100755`.

- [ ] **Step 4: Add actionable browser doctor issue**

Extend `ConfigIssue` with `nextAction?: string`. Add a browser issue when `PLAYWRIGHT_BROWSERS_PATH` is missing:

```ts
issues.push({
  code: "browser.playwright_path_unset",
  severity: "warning",
  message: "PLAYWRIGHT_BROWSERS_PATH is not set; browser verification may use an unavailable default cache.",
  nextAction: "Set PLAYWRIGHT_BROWSERS_PATH to the installed Playwright browser cache before running verify:browser.",
});
```

- [ ] **Step 5: Run risk-closure tests**

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/package-metadata.test.ts src/__tests__/config-doctor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update release docs**

Document:

```text
Release acceptance must run `corepack pnpm verify:node` on Node >=22.19.0.
Browser acceptance should set PLAYWRIGHT_BROWSERS_PATH when the browser cache is not in the default path.
The CLI bin shim is intentionally executable.
```

---

### Task 2: Stable Loop Event Protocol

**Files:**
- Create: `packages/engine/src/loop-events.ts`
- Modify: `packages/engine/src/lib.ts`
- Test: `packages/engine/src/__tests__/loop-events.test.ts`
- Modify: `packages/web/src/conversation/normalize.ts`
- Modify: `packages/web/src/conversation/live-console.ts`
- Test: `packages/web/src/__tests__/live-console.test.ts`
- Test: `packages/web/src/__tests__/conversation.test.ts`

- [ ] **Step 1: Write failing engine event protocol tests**

Test cases:

```ts
expect(loopEventFromProgress({ kind: "tool_call", iteration: 1, toolName: "file_read", args: {} })).toMatchObject({
  type: "tool_requested",
  toolName: "file_read",
  status: "requested",
});
expect(loopEventFromProgress({ kind: "tool_result", iteration: 1, toolName: "file_read", result: "ok", succeeded: true })).toMatchObject({
  type: "tool_completed",
  toolName: "file_read",
  status: "succeeded",
});
expect(loopEventFromProgress({ kind: "approval", iteration: 1, request, approved: false, decidedAt })).toMatchObject({
  type: "escalation_decided",
  escalationReason: "permission_required",
  approvalStatus: "denied",
});
expect(loopEventFromUnknown({ kind: "future_event" })).toMatchObject({ type: "unknown" });
```

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/loop-events.test.ts
```

Expected: FAIL because `loop-events.ts` does not exist.

- [ ] **Step 2: Implement protocol types and mappers**

Create `packages/engine/src/loop-events.ts` with:

```ts
export type LoopEventType = "run_created" | "route_decided" | "skill_matched" | "iteration_started" | "tool_requested" | "tool_completed" | "evidence_collected" | "assertion_checked" | "repair_started" | "escalation_decided" | "run_succeeded" | "run_failed" | "run_degraded" | "unknown";
export interface LoopEvent {
  type: LoopEventType;
  iteration?: number;
  toolName?: string;
  status?: "requested" | "succeeded" | "failed" | "pending" | "approved" | "denied";
  escalationReason?: EscalationReason;
  approvalStatus?: "approved" | "denied";
  rawKind?: string;
  message?: string;
  payload?: Record<string, unknown>;
}
export function loopEventFromProgress(event: ProgressEvent): LoopEvent { /* deterministic switch */ }
export function loopEventFromWorkflow(event: WorkflowEvent): LoopEvent[] { /* unwrap child_event, map workflow terminal */ }
export function loopEventFromUnknown(event: unknown): LoopEvent { return { type: "unknown", rawKind: rawKind(event), payload: safePayload(event) }; }
```

Use exact event mappings:

| Internal event | Loop event |
|---|---|
| `profile_selected` | `route_decided` |
| `skills_matched` | `skill_matched` |
| `iteration_start` | `iteration_started` |
| `tool_call` | `tool_requested` |
| `tool_result` | `tool_completed` |
| `checkpoint` | `evidence_collected` |
| `verdict` | `assertion_checked` |
| `recovery` with repair | `repair_started` |
| `escalate` | `escalation_decided` |
| `done` success | `run_succeeded` |
| `done` error/max/budget/escalated | `run_failed` or `run_degraded` |

- [ ] **Step 3: Export protocol**

Add exports in `packages/engine/src/lib.ts`.

- [ ] **Step 4: Adapt Web normalization**

Keep current input compatibility, but map through `LoopEvent` for timeline state. Unknown protocol events render as `debug_unknown` with a stable inspector payload.

- [ ] **Step 5: Run protocol tests**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/loop-events.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/conversation.test.ts src/__tests__/live-console.test.ts
```

Expected: PASS.

---

### Task 3: Proof Boundary in RunRecord, Eval, and Workbench

**Files:**
- Create: `packages/engine/src/proof-boundary.ts`
- Modify: `packages/engine/src/run-record.ts`
- Modify: `packages/engine/src/evals/real-world.ts`
- Modify: `packages/web/src/runs/model.ts`
- Modify: `packages/web/src/runs/workbench.ts`
- Modify: `packages/web/src/dashboard/report-model.ts`
- Test: `packages/engine/src/__tests__/proof-boundary.test.ts`
- Test: `packages/engine/src/__tests__/run-record.test.ts`
- Test: `packages/engine/src/__tests__/real-world-eval.test.ts`
- Test: `packages/web/src/__tests__/runs-view.test.ts`
- Test: `packages/web/src/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write failing proof-boundary tests**

Assert:

```ts
expect(proofBoundaryForRunRecord(noOpRecord).notProven).toContain("No hidden failures outside automation scope.");
expect(proofBoundaryForWorkflowResult(verifiedFailure).evidenceGaps).toContain("Missing passed verification evidence.");
expect(normalizeRunRecord(recordWithProof).proofBoundary.notProven).toContain("External production health.");
expect(normalizeRealWorldEvalReport(report).proofBoundary.notProven).toContain("Fixture results do not prove product health.");
```

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/proof-boundary.test.ts src/__tests__/run-record.test.ts src/__tests__/real-world-eval.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/dashboard.test.ts
```

Expected: FAIL because proof boundary is not yet a first-class field.

- [ ] **Step 2: Implement `ProofBoundary` helpers**

Create:

```ts
export interface ProofBoundary {
  proven: string[];
  notProven: string[];
  assumptions: string[];
  evidenceGaps: string[];
}
export function proofBoundaryForWorkflowResult(result: WorkflowResult): ProofBoundary;
export function proofBoundaryForRunRecord(record: Pick<RunRecord, "status" | "evidence" | "automation" | "replay" | "failures">): ProofBoundary;
export function mergeProofBoundaries(items: ProofBoundary[]): ProofBoundary;
```

Rules:

- `automation.doesNotProve` enters `notProven`.
- `replay.freshExecution === false` adds `Historical replay does not prove fresh execution.`
- `evidence.status === "not_checked"` adds `No verification evidence was checked.`
- `evidence.status === "insufficient_evidence"` adds `Evidence is insufficient for trusted success.`
- blocking failures enter `evidenceGaps`.

- [ ] **Step 3: Add proof boundary to RunRecord**

Add:

```ts
proofBoundary: ProofBoundary;
```

Populate it in `buildRunRecordFromWorkflowResult` and `buildNoOpRunRecord`.

- [ ] **Step 4: Add proof boundary to real-world eval reports**

Add `proofBoundary` to `RealWorldEvalReport` and each case result. Include fixture boundary:

```text
Fixture results do not prove product health.
```

- [ ] **Step 5: Render proof boundary in Web models**

Expose:

```ts
proofBoundary: {
  proven: string[];
  notProven: string[];
  assumptions: string[];
  evidenceGaps: string[];
}
```

Render a `Proof boundary` panel in Run Workbench and Eval Dashboard.

- [ ] **Step 6: Run proof tests**

Run the commands from Step 1.

Expected: PASS.

---

### Task 4: Autonomy-first Escalation and Self-repair

**Files:**
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/workflow/types.ts`
- Modify: `packages/engine/src/workflow/runner.ts`
- Modify: `packages/engine/src/run-record.ts`
- Modify: `packages/engine/src/evals/real-world.ts`
- Test: `packages/engine/src/__tests__/workflow-runner.test.ts`
- Test: `packages/engine/src/__tests__/real-world-eval.test.ts`
- Test: `packages/engine/src/__tests__/run-record.test.ts`

- [ ] **Step 1: Write failing autonomy and repair tests**

Add tests:

```ts
expect(result.autonomy.outcome).toBe("self_repaired");
expect(result.autonomy.repairAttempts[0]).toMatchObject({
  targetAssertion: "fileExists:output.txt",
  finalVerdict: "passed",
});
expect(budgetResult.exitReason).toBe("verified_failure");
expect(budgetResult.autonomy.escalations[0].reason).toBe("evidence_insufficient_after_retry");
expect(record.autonomy.outcome).toBe("escalated");
```

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts src/__tests__/run-record.test.ts src/__tests__/real-world-eval.test.ts
```

Expected: FAIL because autonomy fields and repair cases do not exist.

- [ ] **Step 2: Add autonomy types**

Add:

```ts
export type EscalationReason = "permission_required" | "risk_confirmation_required" | "goal_ambiguity_blocking" | "evidence_insufficient_after_retry" | "acceptance_failed_after_repair" | "budget_exhausted" | "external_dependency_blocked";
export type AutonomyOutcome = "completed_without_escalation" | "self_repaired" | "degraded_without_escalation" | "escalated";
export interface RepairAttemptSummary {
  targetAssertion: string;
  reason: string;
  attempt: number;
  finalVerdict: "passed" | "failed" | "budget_exhausted";
}
export interface EscalationDecision {
  reason: EscalationReason;
  message: string;
}
export interface AutonomySummary {
  outcome: AutonomyOutcome;
  repairAttempts: RepairAttemptSummary[];
  escalations: EscalationDecision[];
}
```

- [ ] **Step 3: Compute autonomy in workflow runner**

Derive:

- no failures and no repair -> `completed_without_escalation`;
- repair attempt with final pass -> `self_repaired`;
- budget failure without human ask -> `degraded_without_escalation`;
- approval/risk/goal/evidence escalation -> `escalated`.

Record recovery steps with decision `repair` as repair attempts.

- [ ] **Step 4: Add L2 real-world cases**

Add cases:

- `assertion-repair-success`: initial assertion failure, repair event, final evidence passed.
- `repair-budget-exhausted`: repair attempts reach budget, result is failure/degraded, not success.

- [ ] **Step 5: Persist autonomy in RunRecord**

Add `autonomy: AutonomySummary` to `RunRecord`, `buildRunRecordFromWorkflowResult`, `buildNoOpRunRecord`, and normalizers.

- [ ] **Step 6: Run autonomy tests**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/workflow-runner.test.ts src/__tests__/run-record.test.ts src/__tests__/real-world-eval.test.ts
```

Expected: PASS.

---

### Task 5: Provider Capability-aware Routing

**Files:**
- Modify: `packages/cli/src/config.ts`
- Modify: `packages/cli/src/config-doctor.ts`
- Modify: `packages/cli/src/workflow-execution.ts`
- Modify: `config.example.json`
- Modify: `packages/engine/src/run-record.ts`
- Test: `packages/cli/src/__tests__/config.test.ts`
- Test: `packages/cli/src/__tests__/config-doctor.test.ts`
- Test: `packages/cli/src/__tests__/run-once.test.ts`

- [ ] **Step 1: Write failing provider capability tests**

Assert:

```ts
expect(resolveConfig({ modelCapabilities: { toolCalling: false } }).modelCapabilities.toolCalling).toBe(false);
expect(validateConfig(configWithTinyContext).map((issue) => issue.code)).toContain("modelCapabilities.maxContextTokens.low");
expect(await executeWorkflowTask({ goal: "read file", config: toolCallingFalseConfig })).toMatchObject({
  result: { exitReason: "verified_failure" },
});
```

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/config.test.ts src/__tests__/config-doctor.test.ts src/__tests__/run-once.test.ts
```

Expected: FAIL because `modelCapabilities` is absent.

- [ ] **Step 2: Add model capability config**

Add `ModelCapabilities` to config with defaults:

```ts
modelCapabilities: {
  toolCalling: true,
  streaming: true,
  jsonMode: false,
  vision: true,
  maxContextTokens: 128000,
  parallelToolCalls: false,
}
```

Validate booleans and positive `maxContextTokens`.

- [ ] **Step 3: Pass capabilities to model and workflow execution**

Set `buildModel().input` to include image only when `vision=true`. Set `contextWindow` from `maxContextTokens`. In workflow execution, degrade or fail with a structured limitation when a tool-dependent workflow is requested and `toolCalling=false`.

- [ ] **Step 4: Record limitation**

Add provider/context limitation to RunRecord proof boundary or `nextAction`:

```text
Provider capability prevented tool execution; choose a tool-capable model or a non-tool workflow.
```

- [ ] **Step 5: Run provider tests**

Run the command from Step 1.

Expected: PASS.

---

### Task 6: Acceptance Packet and Starter Path

**Files:**
- Modify: `packages/engine/src/evals/operator-scenarios.ts`
- Modify: `packages/cli/src/eval-commands.ts`
- Modify: `packages/cli/src/config-doctor.ts`
- Modify: `README.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/10-release-and-upgrade.md`
- Test: `packages/cli/src/__tests__/eval-commands.test.ts`
- Test: `packages/cli/src/__tests__/config-doctor.test.ts`

- [ ] **Step 1: Write failing acceptance packet tests**

Assert packet output contains:

```text
Proof boundary
Evidence inspected
Override reason
Next actions
Fixture results are not human acceptance
```

Assert sign-off validation rejects:

```ts
{ evidenceInspected: false, humanDecision: "accepted" }
{ overridesFailedAssertion: true, overrideReason: "" }
```

- [ ] **Step 2: Add packet fields**

Extend operator packet formatter to include proof boundary, next actions, evidence inspected checklist, and override reason field.

- [ ] **Step 3: Harden sign-off validation**

Reject acceptance when evidence was not inspected. Require override reason when a human decision overrides failed evidence.

- [ ] **Step 4: Add starter path docs and doctor next actions**

README must include:

```bash
corepack pnpm install
corepack pnpm --filter @keigent/cli start doctor --compact
corepack pnpm --filter @keigent/cli start eval smoke --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
```

Each sample report must state fixture boundary and does-not-prove.

- [ ] **Step 5: Run acceptance/starter tests**

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/eval-commands.test.ts src/__tests__/config-doctor.test.ts
```

Expected: PASS.

---

### Task 7: Real CLI -> RunRecord -> Web API -> Workbench E2E

**Files:**
- Create: `packages/cli/src/__tests__/product-e2e.test.ts`
- Modify: `packages/cli/src/web-api-server.ts`
- Modify: `packages/web/src/runs/model.ts`
- Modify: `packages/web/src/runs/workbench.ts`
- Test: `packages/cli/src/__tests__/web-api-server.test.ts`
- Test: `packages/web/src/__tests__/run-workbench.test.ts`

- [ ] **Step 1: Write failing E2E test**

Create a deterministic temp runs directory test:

```ts
const workflow = fixtureWorkflowResultWithEvidenceAndProof();
const persisted = await persistWorkflowAndLearn(workflow, config, learner, [], { taskSource: "cli", silent: true, runsDir });
const api = createWebApiServer({ runsDir });
const store = await fetchJson(api, "/api/runs");
const view = normalizeRunRecord(store.records[0]);
expect(view.summary.id).toBe(persisted.record.id);
expect(view.route.selectedProfile).toBe("convergent-verified");
expect(view.evidence.status).toBe("passed");
expect(view.proofBoundary.proven.length).toBeGreaterThan(0);
expect(renderRunWorkbench(buildRunWorkbenchView(store.records, persisted.record.id))).toContain("Proof boundary");
```

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/product-e2e.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Expected: FAIL until proof boundary and E2E hooks are complete.

- [ ] **Step 2: Add E2E fixtures and helpers**

Use existing `buildRunRecordFromWorkflowResult` and `saveRunRecord`. Do not call real LLM, browser, or network.

- [ ] **Step 3: Ensure Web API returns inspectable records**

`GET /api/runs` returns saved `RunRecord` including proof boundary, autonomy, evidence, risk, replay, and next action.

- [ ] **Step 4: Render Workbench proof/autonomy sections**

Run Workbench detail includes:

```text
Proof boundary
Autonomy
Repair attempts
Next action
```

- [ ] **Step 5: Run E2E tests**

Run the commands from Step 1.

Expected: PASS.

---

### Task 8: Final Documentation and Quality Gates

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `doc/evals/README.md`
- Modify: `doc/product/10-release-and-upgrade.md`
- Modify: `doc/product/11-agent-project-learning-development-requirements.md`

- [ ] **Step 1: Update docs**

Document:

- Node 22 release gate.
- Browser path warning and command.
- Loop Event Protocol.
- Proof Boundary.
- Autonomy and self-repair semantics.
- Provider capabilities.
- Acceptance packet limits.
- Starter path.
- P2 non-goals remain deferred.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/loop-events.test.ts src/__tests__/proof-boundary.test.ts src/__tests__/workflow-runner.test.ts src/__tests__/real-world-eval.test.ts src/__tests__/run-record.test.ts
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/config.test.ts src/__tests__/config-doctor.test.ts src/__tests__/eval-commands.test.ts src/__tests__/web-api-server.test.ts src/__tests__/product-e2e.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/conversation.test.ts src/__tests__/live-console.test.ts src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts src/__tests__/dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full gates**

Run:

```bash
corepack pnpm -r test
corepack pnpm -r check
corepack pnpm -r --if-present build
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/cli start eval operator --compact
```

Expected: PASS.

- [ ] **Step 4: Run release-only Node gate where available**

Run:

```bash
corepack pnpm verify:node
```

Expected on Node 22.19+: PASS. Expected on the current Node 20.19.2 environment: FAIL with a clear release-gate message; this does not block local development gates but must block formal release acceptance.

---

## Self-review

- Spec coverage: Task 1 covers acceptance risks. Tasks 2-4 cover P0 R1/R2/R3/R5. Task 5 covers R4. Task 6 covers R6/R7. Task 7 covers product E2E. Task 8 covers docs and final gates.
- Placeholder scan: The plan contains no TBD, TODO, or intentionally blank implementation steps.
- Type consistency: `EscalationReason`, `AutonomySummary`, `ProofBoundary`, `ModelCapabilities`, and `LoopEvent` names match the design spec.
- Scope boundary: P2 items remain explicitly out of scope and are not assigned implementation tasks.
