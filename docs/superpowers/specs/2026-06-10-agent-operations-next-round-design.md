# Agent Operations Next Round Design

> Status: approved working design for the next development round.
>
> Date: 2026-06-10
>
> Source requirements:
> - `doc/evals/04-main-acceptance-report-2026-06-10-agent-operations-foundation.md`
> - `doc/product/11-agent-project-learning-development-requirements.md`
> - `AGENTS.md`

## 1. Goal

Resolve the risks from the previous acceptance report, then move KeiGent from an Agent Operations Workbench v1 foundation to a runtime that can:

- proceed autonomously inside explicit permissions, budget, evidence, and task boundaries;
- self-repair failed assertions before escalating;
- expose a stable loop event protocol to CLI, Workbench, Live Console, reports, and RunRecord timeline;
- carry proof boundaries through RunRecord, eval reports, and Workbench;
- route or degrade based on declared provider capabilities;
- provide human review packets without letting human acceptance hide failed evidence;
- give a starter path that is honest about fixture and demo boundaries.

## 2. Scope

### In Scope

- Acceptance risk closure:
  - Node 22.19+ release/CI verification entry.
  - Browser verification environment guard for `PLAYWRIGHT_BROWSERS_PATH`.
  - Stable CLI bin executable-mode decision.
  - Product E2E test for `CLI run -> RunRecord -> Web API -> Workbench`.
- P0 requirements:
  - R1 Autonomy-first Escalation.
  - R2 Self-repair before Escalation.
  - R3 Loop Event Protocol.
  - R5 Proof Boundary.
  - Real product E2E acceptance.
- P1 requirements:
  - R4 Provider Capability-aware Routing.
  - R6 Acceptance Packet for Human Review.
  - R7 Starter Path without Demo Deception.
  - Worktree isolation and automation triage productization only where it supports the above.

### Out of Scope

The next round does not implement:

- generative UI;
- dynamic planner;
- tournament ranking;
- autonomous swarm;
- unattended external write operations;
- fanout as a quality signal.

Those remain P2 or non-goals in `doc/product/11-agent-project-learning-development-requirements.md`.

## 3. Architecture

The design preserves the current KeiGent invariants:

- There is still one `LoopEngine`; no second execution loop is added.
- Workflow remains a parent envelope over `LoopEngine.run()`.
- Skill says how to work; engine and workflow say how to verify.
- Final response is never success evidence.
- Tool execution remains behind `ToolRegistry`, risk metadata, and approval gates.

New concepts are added as first-class, provider-neutral records:

```ts
type EscalationReason =
  | "permission_required"
  | "risk_confirmation_required"
  | "goal_ambiguity_blocking"
  | "evidence_insufficient_after_retry"
  | "acceptance_failed_after_repair"
  | "budget_exhausted"
  | "external_dependency_blocked";

type AutonomyOutcome =
  | "completed_without_escalation"
  | "self_repaired"
  | "degraded_without_escalation"
  | "escalated";

interface ProofBoundary {
  proven: string[];
  notProven: string[];
  assumptions: string[];
  evidenceGaps: string[];
}

interface ModelCapabilities {
  toolCalling: boolean;
  streaming: boolean;
  jsonMode: boolean;
  vision: boolean;
  maxContextTokens?: number;
  parallelToolCalls?: boolean;
}
```

These are not parallel acceptance systems. They attach to existing `WorkflowResult`, `RunRecord`, eval reports, and Workbench view models.

## 4. Loop Event Protocol

KeiGent already has `ProgressEvent` and `WorkflowEvent`, but UI and CLI currently interpret local shapes directly. The next round introduces a stable protocol surface:

```ts
type LoopEventType =
  | "run_created"
  | "route_decided"
  | "skill_matched"
  | "iteration_started"
  | "tool_requested"
  | "tool_completed"
  | "evidence_collected"
  | "assertion_checked"
  | "repair_started"
  | "escalation_decided"
  | "run_succeeded"
  | "run_failed"
  | "run_degraded";
```

Implementation rule:

- Existing `ProgressEvent` and `WorkflowEvent` remain internal compatibility inputs.
- `packages/engine/src/loop-events.ts` maps internal events to `LoopEvent`.
- Web Live Console and RunRecord timeline consume `LoopEvent`, not raw internal event variants.
- Unknown events become `unknown` timeline items and never crash UI.
- Tool attempted, tool completed, approval requested, approved, and denied remain distinguishable.

## 5. Proof Boundary

Every trusted run and real-world eval report should state what was proven, what was not proven, what assumptions were used, and what evidence gaps remain.

Rules:

- Successful verified runs can claim only assertions backed by passed evidence.
- Replay can prove historical replay behavior, not fresh execution.
- No-op automation must include scope and `doesNotProve`.
- Empty or insufficient evidence must become an evidence gap and must not be hidden by final text.
- Workbench Run Detail displays `notProven`, `assumptions`, and `evidenceGaps` near evidence and next action.

## 6. Autonomy and Escalation

Escalation is not the default center of the product. The default path is:

```text
attempt within policy
-> collect missing low-risk evidence
-> self-repair if an assertion failed and repair budget remains
-> degrade/fail/escalate with a structured reason only when bounded autonomy cannot continue
```

Escalation happens only for:

- permission or risk confirmation;
- blocking goal ambiguity;
- evidence still insufficient after retry/repair;
- acceptance still failed after repair;
- budget exhausted;
- external dependency blocked.

RunRecord records:

- `autonomy.outcome`;
- `autonomy.escalations`;
- repair attempts;
- target assertion;
- final verdict.

## 7. Self-repair

Self-repair is bounded and evidence-linked:

- It starts only from a concrete failed assertion, checkpoint, or failure summary.
- Each attempt records the target and reason.
- It re-runs verification after repair.
- It is capped by `maxRecoveryAttempts`.
- Budget exhaustion becomes `degraded` or `failed`, never `succeeded`.

The P0 eval suite adds two L2 cases:

- first assertion fails, repair succeeds, final record shows `self_repaired`;
- repair budget exhausted, result is degraded/failed with `budget_exhausted` or `evidence_insufficient_after_retry`.

## 8. Provider Capability-aware Routing

Provider config declares capabilities instead of giving brand-specific privilege.

Rules:

- `toolCalling=false` prevents tool-dependent workflow selection unless an explicit non-tool degraded path exists.
- `jsonMode=false` uses deterministic parser/fallback for structured outputs.
- `maxContextTokens` limits task context and records context limitation in RunRecord/proof boundary.
- relay providers remain URL/protocol configurations, not first-class brands.

The default config stays provider-neutral and conservative:

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

## 9. Human Review Packet

Human review remains a precise escalation artifact, not a default takeover path.

Packets include:

- task;
- route;
- evidence;
- failures;
- risk;
- proof boundary;
- next actions;
- explicit evidence-inspected flag;
- override reason when overriding a failed fact.

Human acceptance does not overwrite failed assertions unless a deliberate override reason is recorded.

## 10. Starter Path

The starter path must get a new user to a local sample run without demo deception:

- provider-neutral config template;
- sample smoke run command;
- sample eval report with fixture boundary and `doesNotProve`;
- sample skill marked with coverage and risk;
- doctor issues with concrete next actions for missing API key, browser path, git permission, and unsupported Node.

## 11. Acceptance Risk Closure

Risk closure implementation:

1. Node:
   - add a version verification command that fails below `>=22.19.0`;
   - document that local dev may pass on Node 20 but release acceptance must run on Node 22.19+.
2. Browser:
   - add a browser verification wrapper or doctor issue that reports the actual Playwright path and suggested `PLAYWRIGHT_BROWSERS_PATH`;
   - avoid false browser failure when the configured path is missing.
3. CLI bin mode:
   - commit `packages/cli/bin/keigent.mjs` as executable because it is a CLI bin shim;
   - add a test or script check that the bin is executable.
4. E2E:
   - add a deterministic E2E test with a temp runs directory;
   - execute or fixture a workflow run, persist RunRecord, read through Web API, normalize in Workbench model, and assert route/evidence/next action/proof boundary are inspectable.

## 12. Testing Strategy

Required tests:

- Unit tests for event normalization and unknown event fallback.
- Unit tests for proof boundary derivation.
- Workflow tests for self-repair success and repair budget exhaustion.
- RunRecord tests for autonomy, repair, escalation, proof boundary, and provider capability limitation.
- CLI tests for doctor next actions, Node version check, bin executable mode, operator acceptance packet, and starter sample commands.
- Web tests for Live Console event protocol, Run Detail proof boundary, eval dashboard proof boundary, and E2E Workbench inspection.
- Engine real-world eval tests for new L2 autonomy/self-repair/proof-boundary cases.

Quality gates:

```bash
corepack pnpm -r test
corepack pnpm -r check
corepack pnpm -r --if-present build
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/cli start eval operator --compact
```

Release acceptance additionally runs the same gates on Node 22.19+.

## 13. Completion Criteria

The next round is complete only when:

- all four acceptance risks have a code, script, test, or documented release gate;
- R1-R7 have implemented artifacts and tests;
- P2 non-goals remain unimplemented and documented as such;
- the real CLI/Web API/Workbench E2E proves product-chain inspection;
- docs point to the new commands and boundaries;
- root tests, checks, builds, real-world eval, and operator eval pass.
