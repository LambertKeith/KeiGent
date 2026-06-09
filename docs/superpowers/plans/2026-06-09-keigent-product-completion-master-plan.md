# KeiGent Product Completion Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` for each implementation slice. This plan is the standing execution queue: finish one slice, verify it, update status, then continue to the next slice unless a blocker requires redesign.

**Goal:** Implement the product, governance, evidence, eval, workflow, config, Web Workbench, and skill lifecycle requirements documented under `doc/product/`, `doc/design/`, `doc/evals/`, and `doc/strategy/`.

**Architecture:** Keep the core invariant: one `LoopEngine`, behavior selected by `LoopProfile`, with workflow as a parent envelope rather than a second loop. All new claims must be backed by structured events, trajectory evidence, and eval coverage. New implementation should extend existing modules instead of creating parallel policy/eval/UI systems.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, existing `@keigent/engine`, `@keigent/cli`, `@keigent/web`, Eval Harness, WorkflowRunner, ToolRegistry, Playwright-based browser tools.

---

## Execution Policy

- Do not wait after each task for manual approval. Complete a slice, run its validation, update this plan status, then move to the next slice.
- Stop only for blockers that cannot be solved from local context: destructive operation risk, unclear product tradeoff that changes scope, external credential need, or repeated verification failure after a coherent fix attempt.
- Every behavior change uses TDD: write failing test, confirm RED, implement minimal GREEN, then run package-level verification.
- Each slice must add or update eval coverage where the docs require it.
- Never modify database migration files. This repo currently has no database task in scope.
- Do not revert pre-existing local changes unless explicitly asked.

## Current Completed Slices

### C1. Routing Explainability

**Status:** Done, uncommitted.

**Implemented surface:**
- `profile_selected` progress event includes `ruleId`, `rationale`, `signals`, `guardApplied`, and `unguardedProfile`.
- CLI and Web normalization preserve routing metadata.
- Orchestrator eval reports routing rationale and guard metadata.

**Evidence already run:**
- engine/cli/web checks and tests.
- `eval:smoke`
- `eval:orchestrator`

### C2. Permission/Risk Governance P1

**Status:** Done, uncommitted.

**Implemented surface:**
- Every built-in tool declares `permission`, `riskLevel`, `sideEffect`, and `reversible`.
- `ToolRegistry` centrally requires approval for `dangerous` and R3-R5 tools.
- CLI one-shot mode uses `DenyByDefaultGate`.
- REPL approval prompt shows structured context.

**Key tests:**
- `tool-registry-governance.test.ts`
- `tool-metadata.test.ts`
- `run-once.test.ts`

### C3. Approval Trajectory P2

**Status:** Done, uncommitted.

**Implemented surface:**
- Approval decision enters `ProgressEvent` and `TrajectoryStep`.
- Approval request args are redacted before trajectory persistence.
- CLI renderer shows approval summary without args.
- Web timeline normalizes approval decisions with redacted args.
- Smoke eval includes `smoke-permission-deny-shell`.

**Key tests:**
- `engine-approval-trajectory.test.ts`
- `renderer.test.ts`
- `conversation.test.ts`
- `eval-runner.test.ts`

---

## Global Quality Gates

Run after every slice unless the slice is documentation-only:

```bash
corepack pnpm --filter @keigent/engine check
corepack pnpm --filter @keigent/cli check
corepack pnpm --filter @keigent/web check
corepack pnpm --filter @keigent/engine test
corepack pnpm --filter @keigent/cli test
corepack pnpm --filter @keigent/web test
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
git diff --check
```

Extended gates when the slice touches browser tooling or Web rendering:

```bash
corepack pnpm --filter @keigent/engine verify:browser
```

Extended gates when the slice touches eval replay:

```bash
corepack pnpm --filter @keigent/engine eval:replay -- --trajectory <case-id>=<path>
```

---

## Phase 1: Success/Evidence Core

### T1. Assertion DSL Type Upgrade

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/design/08-success-evidence-model.md`
- `doc/product/01-product-blueprint.md`
- `doc/design/10-workflow-modes-product-semantics.md`

**Goal:** Replace the current weak `{ description, signal }` assertion shape with a discriminated assertion DSL while preserving compatibility for existing natural-language assertions.

**Files likely touched:**
- `packages/engine/src/types.ts`
- `packages/engine/src/__tests__/success-evidence.test.ts`
- `packages/engine/src/evals/types.ts`

**Tasks:**
- Add `Assertion` union variants:
  - `legacySignal`
  - `urlContains`
  - `textIncludes`
  - `fileExists`
  - `fileHashEquals`
  - `commandExitCode`
  - `toolSucceeded`
  - `checkpointPassed`
  - `humanApproved`
  - `jsonPathEquals`
- Add stable `AssertionResult` with `kind`, `passed`, `evidence`, and `failureCode`.
- Keep existing `description/signal` tests green by mapping old assertions to `legacySignal`.

**Acceptance:**
- Existing verified smoke case still compiles.
- New tests prove the DSL supports all P0 variants without relying on final response as success evidence.

### T2. Evidence Extraction From Trajectory

**Status:** Done, uncommitted.

**Goal:** Build deterministic evidence extraction from trajectory steps so evals and workflow verdicts can reason about tool success, approvals, checkpoints, file evidence, and command results.

**Files likely touched:**
- `packages/engine/src/evidence.ts`
- `packages/engine/src/__tests__/evidence.test.ts`
- `packages/engine/src/types.ts`

**Tasks:**
- Create `EvidenceBundle` from a `Trajectory`.
- Extract:
  - tool calls and success/failure counts
  - approval decisions
  - checkpoint/verdict pairs
  - final response as communication-only evidence
  - text outputs by iteration
- Add helpers:
  - `toolSucceeded(bundle, toolName, minCount)`
  - `humanApproved(bundle, scopeOrTool)`
  - `checkpointPassed(bundle, checkpointIdOrMinCount)`
- Redact secret-like values in evidence bundle.

**Acceptance:**
- Tests show final text alone does not satisfy operation/evidence assertions.
- Approval evidence remains redacted.

### T3. Assertion Evaluator P0

**Status:** Done, uncommitted.

**Goal:** Evaluate structured assertions against `EvidenceBundle`.

**Files likely touched:**
- `packages/engine/src/assertions.ts`
- `packages/engine/src/__tests__/assertions.test.ts`

**Tasks:**
- Implement deterministic evaluators for:
  - `textIncludes`
  - `toolSucceeded`
  - `checkpointPassed`
  - `humanApproved`
  - `jsonPathEquals`
- Add graceful `unsupported_assertion` result for variants requiring unavailable data, such as screenshot judge.
- Add failure codes:
  - `evidence_missing`
  - `assertion_failed`
  - `assertion_unsupported`

**Acceptance:**
- A task with `toolSucceeded(file_write)` passes only if the tool result succeeded.
- A task with `humanApproved(shell)` passes only if an approval decision exists and is approved.
- A task with only final response saying “done” fails operation/evidence assertions.

### T4. Verified-Loop Uses Assertion Evidence

**Status:** Done, uncommitted.

**Goal:** Make verified execution and workflow evidence gates use assertion results instead of checkpoint count or final text alone.

**Files likely touched:**
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/profiles/strategies.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`

**Tasks:**
- Add assertion evaluation into workflow evidence assembly.
- Treat assertion absence as `verified_failure` for verified mode.
- Ensure checkpoint count alone is insufficient if assertions fail.
- Preserve P0 rule: verified-loop requires at least one passed checkpoint/verdict.

**Acceptance:**
- Verified child success without assertion evidence becomes `verified_failure`.
- Late child success after timeout still cannot overwrite parent failure.

---

## Phase 2: Failure and Recovery Semantics

### T5. Structured Failure Codes and Next Actions

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/design/13-failure-recovery-semantics.md`
- `doc/product/04-local-runtime-experience.md`

**Goal:** Centralize failure codes, user-facing failure summaries, and recommended next actions.

**Files likely touched:**
- `packages/engine/src/failures.ts`
- `packages/engine/src/types.ts`
- `packages/cli/src/renderer.ts`
- `packages/web/src/conversation/normalize.ts`

**Tasks:**
- Define `FailureCode` union:
  - `missing_target`
  - `profile_mismatch`
  - `skill_missing`
  - `permission_denied`
  - `tool_unavailable`
  - `network_error`
  - `auth_failed`
  - `checkpoint_missing`
  - `verified_failure`
  - `max_iterations`
  - `timeout`
  - `malformed_tool`
  - `final_missing`
  - `executor_error`
  - `child_error`
- Add `recommendedNextActionFor(code)`.
- Attach failure code and next action to terminal progress/workflow events.
- Preserve existing `exitReason` but add more precise failure metadata.

**Acceptance:**
- Failed run can state layer, completed actions, side effects, missing evidence/permission, next action, and whether trajectory/report was saved.

### T6. Non-Interactive `ask_user` Structured Degradation

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/product/02-task-taxonomy-and-routing.md`
- `doc/design/09-permission-risk-governance.md`
- `doc/product/04-local-runtime-experience.md`

**Goal:** When `ask_user` is unavailable, return a structured failure/degradation event instead of hanging or pretending success.

**Files likely touched:**
- `packages/engine/src/tools/impl/agent.ts`
- `packages/engine/src/tools/types.ts`
- `packages/engine/src/evals/cases.ts`
- `packages/engine/src/__tests__/ask-user-degradation.test.ts`

**Tasks:**
- Return explicit `missing_user_input` or `non_interactive_input_required`.
- Include question, reason, and recommended next action.
- Add eval case for ambiguous task in one-shot mode.

**Acceptance:**
- Non-interactive mode never waits for user input.
- Final response does not claim success.

### T7. Recovery Attempt Trajectory Events

**Status:** Done, uncommitted.

**Goal:** Record retry/repair/escalate decisions as structured trajectory evidence.

**Files likely touched:**
- `packages/engine/src/types.ts`
- `packages/engine/src/trajectory.ts`
- `packages/engine/src/engine.ts`
- `packages/web/src/conversation/normalize.ts`

**Tasks:**
- Add `recovery` progress/trajectory step.
- Record recover strategy decision, reason/hint, and budget impact.
- Add Web timeline normalization.

**Acceptance:**
- Failed run explains whether it retried, repaired, escalated, or stopped.

---

## Phase 3: Eval Suite Expansion

### T8. Product Eval Case Schema

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/evals/01-real-world-eval-suite.md`
- `doc/product/02-task-taxonomy-and-routing.md`

**Goal:** Add product-level eval schema with `proves`, `doesNotProve`, `requiredEvidence`, and `forbiddenClaims`.

**Files likely touched:**
- `packages/engine/src/evals/types.ts`
- `packages/engine/src/evals/runner.ts`
- `packages/engine/src/__tests__/eval-runner.test.ts`

**Tasks:**
- Add optional fields to `EvalCase`.
- Preserve existing smoke/orchestrator tests.
- Add report output for `proves` and `doesNotProve`.

**Acceptance:**
- Every new eval case explains what it proves and does not prove.

### T9. Deterministic Eval Case Expansion to 50+

**Status:** Done, uncommitted.

**Goal:** Expand deterministic evals toward the documented minimum set.

**Files likely touched:**
- `packages/engine/src/evals/cases.ts`
- `packages/engine/src/evals/orchestrator-eval.ts`
- `packages/engine/src/__tests__/eval-runner.test.ts`

**Tasks by category:**
- Conversational: greeting, capability, clarification, unsupported ask, ambiguous task.
- Research: source requirements, comparison, boundary statement, no fake citation, multi-source summary.
- File: write, read, path escape deny, content hash, failed write.
- Shell: success, failure, timeout, abort, permission deny.
- Browser: snapshot/ref/click, form, download intent, DOM evidence, browser missing.
- Config: missing key, env override, redaction, doctor offline, invalid protocol.
- Permission: R3 approval, R5 deny, approval redaction, same-scope approval, denied side effect.
- Workflow: verified success, verified failure, child error, timeout, child-success-no-evidence.
- Skill: correct match, no false match, deprecated not injected, quarantined not injected, eval coverage.
- Dashboard: empty report, invalid report, unknown failure code, failure count semantics, profile accuracy distinction.

**Acceptance:**
- `eval:smoke` stays deterministic and fast.
- Failure codes remain machine-readable.

### T10. Replay-Based Eval Coverage 20+

**Status:** Done, uncommitted.

**Goal:** Add replay fixtures and reports that validate historical trajectory semantics without claiming fresh execution.

**Files likely touched:**
- `packages/engine/src/evals/replay.ts`
- `packages/engine/src/evals/fixtures/`
- `packages/engine/src/__tests__/eval-replay.test.ts`

**Tasks:**
- Add fixture loader for checked-in JSON trajectories.
- Add replay cases for permission, workflow, evidence, failure, and dashboard semantics.
- Validate missing/invalid trajectory degradation.

**Acceptance:**
- Replay report clearly identifies replay mode and does not claim live success.

---

## Phase 4: Routing, Risk, and Workflow Policy

### T11. Routing Fixture Matrix 30+

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/product/02-task-taxonomy-and-routing.md`

**Goal:** Expand orchestrator eval matrix to cover profile, workflow mode, risk, clarification, approval, and rationale.

**Files likely touched:**
- `packages/engine/src/evals/orchestrator-eval.ts`
- `packages/engine/src/orchestrator.ts`
- `packages/engine/src/__tests__/orchestrator*.test.ts`

**Tasks:**
- Add fixture fields:
  - `expectedWorkflowMode`
  - `riskLevel`
  - `requiresClarification`
  - `requiresApproval`
  - `rationaleMustInclude`
- Add at least 30 fixtures in documented categories.
- Ensure high-risk tasks do not land in plain `convergent-exec` auto-execute.

**Acceptance:**
- Orchestrator matrix 100% passes.
- Failures explain exact mismatch and rationale gap.

### T12. Workflow Policy Enforcement

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/design/09-permission-risk-governance.md`
- `doc/design/10-workflow-modes-product-semantics.md`

**Goal:** Enforce parent/child permission caps, verifier readonly behavior, and approval scope inheritance.

**Files likely touched:**
- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/workflow/engine-child-runner.ts`
- `packages/engine/src/tools/registry.ts`

**Tasks:**
- Add `WorkflowPolicy`:
  - `maxPermission`
  - `maxRiskLevel`
  - `allowExternalSideEffects`
  - `approvalScopes`
  - `verifierReadonly`
- Filter child tools by policy.
- Deny child tool calls above parent cap.
- Ensure verifier/reviewer child cannot write or execute side effects.

**Acceptance:**
- Policy enforcement tests prove child permissions cannot exceed parent.
- Approval inheritance applies only to matching scope.

### T13. Reviewed-Loop P1

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/design/10-workflow-modes-product-semantics.md`

**Goal:** Add worker + readonly reviewer workflow mode for reviewable tasks with rubric.

**Files likely touched:**
- `packages/engine/src/workflow/planner.ts`
- `packages/engine/src/workflow/runner.ts`
- `packages/engine/src/workflow/types.ts`
- `packages/engine/src/evals/cases.ts`

**Tasks:**
- Add `reviewed-loop` mode.
- Require rubric/successDef before enabling.
- Run worker child then reviewer child sequentially.
- Reviewer tools are readonly by policy.

**Acceptance:**
- Reviewed-loop produces worker evidence, reviewer verdict, and no side-effect tool usage by reviewer.

---

## Phase 5: Skill Lifecycle and Debuggability

### T14. Skill Metadata and Status Model

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/design/11-skill-lifecycle-and-governance.md`

**Goal:** Track skill status, required/allowed tools, non-goals, dangerous actions, examples, and eval coverage references.

**Files likely touched:**
- `packages/engine/src/skills.ts`
- `packages/engine/src/types.ts`
- `packages/engine/src/__tests__/skills.test.ts`

**Tasks:**
- Parse optional metadata from `SKILL.md`.
- Support statuses:
  - `draft`
  - `active`
  - `learned-note-only`
  - `quarantined`
  - `deprecated`
  - `promoted`
- Exclude deprecated/quarantined from automatic injection.

**Acceptance:**
- Deprecated/quarantined skill never auto-injects.
- Active skill exposes eval coverage metadata.

### T15. Skill Match Explanation Event

**Status:** Done, uncommitted.

**Goal:** Record matched and excluded skills with score, signals, injected flag, and exclusion reason.

**Files likely touched:**
- `packages/engine/src/types.ts`
- `packages/engine/src/profiles/strategies.ts`
- `packages/engine/src/engine.ts`
- `packages/web/src/conversation/normalize.ts`

**Tasks:**
- Replace plain `skills_matched: string[]` with richer event while preserving compatibility.
- Add trajectory step for skill match reasoning.
- Show excluded skills in Web inspector.

**Acceptance:**
- A run explains why a skill was injected or excluded.

### T16. Learning Promotion Guard

**Status:** Done, uncommitted.

**Goal:** Prevent failed runs and unsafe learning notes from being promoted into active skills without review/eval coverage.

**Files likely touched:**
- `packages/engine/src/learner.ts`
- `packages/engine/src/skill-patch.ts`
- `packages/engine/src/__tests__/skill-lifecycle.test.ts`

**Tasks:**
- Label learning output as `learned-note-only`.
- Reject promotion unless eval coverage exists.
- Do not learn from `verified_failure`, `timeout`, `max_iterations`, or `child_error` except diagnostic notes.

**Acceptance:**
- Failed run does not update active skill body.

---

## Phase 6: Local Runtime, Config, and CLI Surface

### T17. Config Example Cleanup

**Status:** Done, uncommitted.

**Goal:** Make `config.example.json`, `.env.example`, and README align with source-aware config and secret safety.

**Files likely touched:**
- `config.example.json`
- `.env.example`
- `README.md`
- `packages/cli/src/__tests__/config.test.ts`

**Tasks:**
- Avoid implying real secret should be committed.
- Keep env override precedence documented.
- Confirm default protocol/baseUrl/model behavior.

**Acceptance:**
- Config examples are coherent and no raw secret is recommended.

### T18. `keigent config` Commands P1

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/design/06-cli-config-and-web-config.md`
- `doc/product/04-local-runtime-experience.md`

**Goal:** Add config `init/show/set/unset/path` with atomic writes and permissions.

**Files likely touched:**
- `packages/cli/src/config-commands.ts`
- `packages/cli/src/commands.ts`
- `packages/cli/src/__tests__/config-commands.test.ts`

**Tasks:**
- `config init` creates `~/.keigent/config.json` without overwriting unless forced.
- `config show` redacts secrets.
- `config set/unset` writes atomically.
- `config path` prints config location.

**Acceptance:**
- Config command tests cover redaction, atomic write, and missing file behavior.

### T19. Offline Doctor and CLI Eval/Replays

**Status:** Done, uncommitted.

**Goal:** Provide local runtime commands required by product docs.

**Files likely touched:**
- `packages/cli/src/doctor.ts`
- `packages/cli/src/eval-commands.ts`
- `packages/cli/src/replay-commands.ts`
- `packages/cli/src/__tests__/doctor*.test.ts`

**Tasks:**
- Ensure `doctor --offline --json` performs no network calls.
- Add CLI wrappers for `eval smoke/orchestrator/replay`.
- Add `replay <trajectory>` command.
- Failures distinguish install/config/browser/model issues from agent behavior failures.

**Acceptance:**
- User can complete first-run journey from CLI.

### T20. `keigent web` Local Workbench Entry

**Status:** Done, uncommitted.

**Goal:** Add CLI command to launch or print local Web Workbench URL.

**Files likely touched:**
- `packages/cli/src/web-command.ts`
- `packages/cli/src/commands.ts`
- `packages/web/package.json`

**Tasks:**
- Start local Web dev server or print command when dependencies are unavailable.
- Add public-bind danger gate before binding beyond localhost.

**Acceptance:**
- `keigent web` does not expose public bind without explicit approval.

---

## Phase 7: Web Workbench Completion

### T21. Run Console View Model

**Status:** Done, uncommitted.

**Docs covered:**
- `doc/product/03-web-workbench-blueprint.md`
- `doc/design/12-agent-debuggability.md`

**Goal:** Web run console must show task, successDef, profile/mode/rationale, skills, iteration groups, tools, checkpoints, approvals, final response, and exit reason separately.

**Files likely touched:**
- `packages/web/src/conversation/normalize.ts`
- `packages/web/src/main.ts`
- `packages/web/src/styles.css`
- `packages/web/src/__tests__/conversation.test.ts`

**Tasks:**
- Add successDef to `WebTask`.
- Add grouped iteration view model.
- Add status labels for verified/failed/unverified.
- Add raw JSON inspector with redaction.

**Acceptance:**
- A run exposes what profile was selected, what skill was used, what tool ran, what evidence exists, and why it ended.

### T22. Trajectory Replay View Model

**Status:** Done, uncommitted.

**Goal:** Web replay must preserve original event order/duration and clearly mark replay as not fresh execution.

**Files likely touched:**
- `packages/web/src/replay/`
- `packages/web/src/__tests__/replay.test.ts`

**Tasks:**
- Normalize saved trajectory into replay timeline.
- Handle missing trajectory, invalid schema, unknown event.
- Add rescore placeholder that clearly labels replay semantics.

**Acceptance:**
- Replay never appears as live execution.

### T23. Eval Dashboard Expansion

**Status:** Done, uncommitted.

**Goal:** Dashboard must distinguish eval pass, profile match, task success, tool attempted/succeeded, checkpoint passed, and failure code counts.

**Files likely touched:**
- `packages/web/src/dashboard/report-model.ts`
- `packages/web/src/__tests__/dashboard.test.ts`
- `packages/web/src/main.ts`

**Tasks:**
- Add dashboard filters:
  - guardApplied
  - profile mismatch
  - tool failure
  - verification failure
  - permission denied
- Validate invalid/empty reports.
- Preserve failure code count semantics.

**Acceptance:**
- Dashboard does not render authoritative metrics for invalid/empty report.

### T24. Config Center Shell

**Status:** Done, uncommitted.

**Goal:** Web Config Center shows source-aware config, redaction, doctor offline status, and online doctor explicit action.

**Files likely touched:**
- `packages/web/src/config/config-view.ts`
- `packages/web/src/__tests__/config-view.test.ts`

**Tasks:**
- Show source per config key: env/file/default/missing.
- Redact raw secret.
- Add doctor offline model.
- Online doctor is explicitly gated.

**Acceptance:**
- Raw secret is never rendered.

### T25. Skill Library Shell

**Status:** Done, uncommitted.

**Goal:** Web Skill Library shows status, trigger conditions, recent match history, learning notes, eval coverage, and quarantine/deprecation reason.

**Files likely touched:**
- `packages/web/src/skills/`
- `packages/web/src/__tests__/skills-view.test.ts`

**Tasks:**
- Build normalized skill view model.
- Add empty state and status labels.
- Link eval coverage references.

**Acceptance:**
- Active/deprecated/quarantined skill states are visually and textually distinct.

---

## Phase 8: Tool and Browser Semantics

### T26. Tool Semantics Eval Coverage

**Status:** Done, uncommitted.

**Goal:** Cover file/shell/http/memory/browser tool boundaries beyond smoke cases.

**Files likely touched:**
- `packages/engine/src/evals/cases.ts`
- `packages/engine/src/__tests__/tool-*.test.ts`

**Tasks:**
- File path escape deny.
- File hash evidence.
- Shell failure/timeout/abort.
- HTTP POST R3 approval requirement.
- Memory recall readonly behavior.

**Acceptance:**
- Tool boundary regressions produce deterministic failure codes.

### T27. Browser Realistic Suite

**Status:** Done, uncommitted.

**Goal:** Add at least 10 browser realistic cases, likely local fixture pages first.

**Files likely touched:**
- `packages/engine/src/evals/browser-cases.ts`
- `packages/engine/src/__tests__/browser*.test.ts`

**Tasks:**
- Snapshot/ref/click.
- Form fill.
- DOM evidence.
- Download intent.
- Browser unavailable degradation.

**Acceptance:**
- Extended browser gate can run locally without unstable public websites.

---

## Phase 9: Public API, Docs, and Release Hygiene

### T28. Public API Stabilization

**Status:** Done, uncommitted.

**Goal:** Export stable types and avoid forcing consumers to import internal paths.

**Files likely touched:**
- `packages/engine/src/lib.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/__tests__/public-api.test.ts`

**Tasks:**
- Export evidence/assertion/failure/policy/eval types.
- Keep existing public API compatibility.

**Acceptance:**
- Public API tests compile.

### T29. Documentation Sync

**Status:** Done, uncommitted.

**Goal:** Update README and docs to accurately state what is implemented and what remains non-goal/future.

**Files likely touched:**
- `README.md`
- `AGENTS.md`
- `doc/product/*.md`
- `doc/design/*.md`

**Tasks:**
- Mark implemented slices.
- Avoid claiming fanout/tournament/dynamic planner is available before eval/rubric.
- Document quality gates and local commands.

**Acceptance:**
- Docs do not overclaim capabilities.

### T30. Final Product Completion Gate

**Status:** Done, uncommitted.

**Goal:** Validate the product baseline against the documented quality gates.

**Tasks:**
- Run all global gates.
- Run extended browser gate.
- Run replay eval against checked-in fixtures.
- Review failure codes and eval reports.
- Inspect Web model tests for redaction and invalid states.

**Acceptance:**
- All implemented document requirements have tests/evals.
- Remaining future scope is explicitly marked P2/non-goal.
