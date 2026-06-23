# Run Review Workbench V1 Design

> Status: implementation-ready product spec  
> Date: 2026-06-23  
> Backlog anchor: Design Package 1 / P0 Design, with P1-P3 design boundaries carried forward  
> Source of truth inputs: `doc/product/12-development-priority-backlog.md`, `doc/product/13-recent-research-internalization-and-next-design.md`, `doc/product/03-web-workbench-blueprint.md`, `doc/design/05-web-dashboard.md`

## 1. Objective

Build the next Workbench increment around a single operator question:

```text
Can I decide within 30 seconds whether this run is trustworthy, why it failed, and what to do next?
```

The work must keep KeiGent as a TypeScript-first, provider-neutral, loop-explicit, evidence-first, operator-facing Agent Operations Workbench. It must not turn the UI into a chat skin, a raw log viewer, a generic dashboard, or a false health scoreboard.

## 2. Scope

### P0 Design Scope: Run Review Workbench V1

This is the first executable design package.

Deliverables:

1. Run Queue / Run Detail information architecture.
2. Trust header status and copy rules.
3. Timeline grouping rules.
4. Proof boundary component copy.
5. Empty, failed, denied, replay, no-op, and degraded state copy.
6. Seven fixture expectations for:
   - succeeded run;
   - failed assertion run;
   - approval denied run;
   - replay run;
   - insufficient evidence run;
   - no-op automation run;
   - parent workflow with child run.

### P1 Design Scope: Skill Governance Surface

This remains a design boundary for the next package. The Run Review increment must preserve surfaces for skill status, match reason, blocked/deprecated state, eval coverage, recent matches, and promotion/deprecate/block semantics. It must not implement write actions for skill governance in this package.

### P2 Design Scope: Eval Review Dashboard

This remains a design boundary for the following package. The Run Review increment must preserve run linkage, false-confidence findings, route/task/evidence/risk split metrics, replay freshness boundary, and must not introduce a total health score.

### P3 Design Scope: Calibrated Escalation Flow

This remains a design boundary for the later package. The Run Review increment must preserve escalation reason taxonomy, bounded repair visibility, approval/permission request display, degraded state copy, and user decision audit hooks. It must not allow human acceptance to overwrite failed evidence without an override reason.

## 3. Non-Goals

- Do not add a second agent loop or a new planner.
- Do not implement fanout, tournament ranking, autonomous swarm, or dynamic planner behavior.
- Do not add external write connectors.
- Do not add skill promotion/deprecation/block write actions yet.
- Do not add a global product health score or "100% success" copy.
- Do not make final text, fixture pass, replay pass, or acceptance packet sufficient proof of success.
- Do not mutate RunRecord schema unless a separate migration-driven spec is written.

## 4. Information Architecture

Run Review Workbench V1 uses three zones:

```text
Left: Run Queue / Filters
Center: Run Timeline / Evidence Story
Right: Inspector / Proof Boundary / Next Action
```

The existing static Workbench can implement this as stacked panels if the layout remains responsive, but the view model must preserve these logical zones.

### Left: Run Queue

Purpose: select a run and identify review queues quickly.

Required fields per row:

- run id / short title;
- status;
- createdAt / duration;
- selected profile / workflow mode;
- risk level;
- evidence summary;
- replay badge;
- needs-action badge;
- trust label.

Queue buckets:

1. Needs Action.
2. Failed / Degraded.
3. Awaiting Approval.
4. Replay / Eval.
5. Recent Succeeded.

### Center: Run Timeline / Evidence Story

Purpose: explain the execution without making the user read raw logs.

Timeline groups:

- route decision;
- profile selected;
- skills matched / injected / blocked;
- tool requested / attempted / succeeded / failed / denied;
- checkpoint / assertion checked;
- repair started / repair succeeded / repair failed;
- approval requested / approved / denied;
- run succeeded / failed / degraded;
- final response.

Rules:

- Attempted and succeeded must be visually and textually distinct.
- Failure, denied, degraded, and budget-exceeded states must not be hidden as weak secondary hints.
- Long output is summarized in the timeline and redacted detail belongs in the inspector.
- Unknown events render as unknown, not success.

### Right: Inspector / Proof Boundary / Next Action

Purpose: inspect selected event or overall run boundary.

Required panels:

- selected event detail;
- redacted payload;
- evidence links / artifact links;
- assertion verdict;
- failure code;
- proof boundary with `proven`, `notProven`, `assumptions`, `evidenceGaps`;
- next action;
- escalation reason when present.

## 5. Trust Header

The trust header answers: "What is the current trust state of this run?"

### Trust Labels

| Label | Rule | Required Copy |
|---|---|---|
| `evidence-backed` | status is `succeeded`, evidence has at least one passed check, fresh execution is true, and there are no evidence gaps | Evidence-backed completion |
| `needs-review` | failed, degraded, cancelled, awaiting approval, or next action required | Needs review |
| `insufficient-evidence` | evidence status is `not_checked` or `insufficient_evidence` | Not enough evidence to mark this run successful |
| `replay-only` | replay exists with `freshExecution=false` | Replay result, not a fresh execution |
| `not-checked` | no evidence was checked and no stronger failure state applies | Not checked |

Rules:

- The trust label must never be derived from `finalResponse`.
- Empty evidence must not render as success.
- `replay-only` outranks success copy when `freshExecution=false`.
- `needs-review` outranks `evidence-backed` when failure, approval denial, budget exhaustion, or schema warning requires action.

## 6. State Copy

| State | Required Copy | Must Not Say |
|---|---|---|
| Evidence-backed completion | Evidence-backed completion | Successfully done! |
| Insufficient evidence | Not enough evidence to mark this run successful | Probably succeeded |
| Replay only | Replay result, not a fresh execution | Passed |
| No-op automation | No matching runs in this scope | Everything is healthy |
| Approval denied | Stopped because approval was denied | Failed unexpectedly |
| Blocked skill | Skill matched but blocked by governance policy | Skill unavailable |
| Degraded after repair failed | Degraded after bounded repair could not close the evidence gap | Auto-fixed |
| Unknown status | Unknown run status; review record schema before trusting this result | Succeeded |

## 7. Seven Fixture Expectations

### Succeeded Run

- Trust label: `evidence-backed`.
- Shows route, selected profile, injected skill, successful tool, passed evidence, proof boundary.
- Does not claim production health.

### Failed Assertion Run

- Trust label: `needs-review`.
- Shows failure code and blocking evidence.
- Proof boundary lists evidence gap.
- Next action asks user to inspect or repair the assertion failure.

### Approval Denied Run

- Trust label: `needs-review`.
- Shows approval requested and denied.
- Tool denied must not show as succeeded.
- Copy says approval denial stopped the run.

### Replay Run

- Trust label: `replay-only`.
- Shows `freshExecution=false`.
- Shows replay source and latest report when present.
- Does not claim fresh execution success.

### Insufficient Evidence Run

- Trust label: `insufficient-evidence`.
- Shows evidence status `insufficient_evidence` or `not_checked`.
- Does not show "completed" as trust copy.

### No-op Automation Run

- Trust label: `needs-review` unless explicitly no action is required for the declared scope.
- Shows automation scope, source run ids, and `doesNotProve`.
- Does not claim system health.

### Parent Workflow With Child Run

- Trust label follows the parent exit reason.
- Child success must not overwrite parent timeout, abort, budget, or failed evidence.
- Shows child role, profile, exit reason, workspace or artifact summary when available.

## 8. View Model Requirements

The Web run model must expose:

```ts
type RunTrustLabel =
  | "evidence-backed"
  | "needs-review"
  | "insufficient-evidence"
  | "replay-only"
  | "not-checked";

interface RunTrustSummary {
  label: RunTrustLabel;
  copy: string;
  reason: string;
}

interface RunQueueSummary {
  needsAction: RunRecordListItem[];
  failedOrDegraded: RunRecordListItem[];
  awaitingApproval: RunRecordListItem[];
  replayOrEval: RunRecordListItem[];
  recentSucceeded: RunRecordListItem[];
}
```

`RunRecordListItem` and `RunRecordDetailView` must include `trust: RunTrustSummary`.

`RunWorkbenchView.stats` must include queue counts for needs action, failed/degraded, awaiting approval, replay/eval, and recent succeeded.

## 9. Rendering Requirements

Run Workbench rendering must include:

- a "Run trust" panel or header;
- trust label and copy;
- reason text for the trust label;
- queue labels for the five buckets;
- proof boundary remains visible as its own panel;
- no raw payload without redaction;
- no "100% success" or generic product health copy.

The page may keep the existing stacked layout while the design matures, but the logical three-zone IA must be documented and reflected in copy.

## 10. Test Plan Before Implementation

Tests must be written before production code changes.

Required failing tests:

1. `packages/web/src/__tests__/runs-view.test.ts`
   - `assigns evidence-backed trust only to fresh succeeded runs with evidence`
   - `marks replay records as replay-only even when status is succeeded`
   - `marks missing evidence as insufficient-evidence`
   - `groups runs into review queues without treating no-op as health`

2. `packages/web/src/__tests__/run-workbench.test.ts`
   - `renders Run trust header and queue buckets`
   - `renders seven Run Review fixture expectations without false success copy`
   - `renders approval denied as stopped by approval denial`

3. Documentation verification:
   - `rg "Run Review Workbench V1|trust label|evidence-backed|replay-only|Design Package 1" docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md doc/product/03-web-workbench-blueprint.md doc/design/05-web-dashboard.md doc/product/12-development-priority-backlog.md`

## 11. Acceptance Gates

Targeted gates:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts
```

Documentation gates:

```bash
rg "Run Review Workbench V1|trust label|evidence-backed|replay-only|Design Package 1" docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md doc/product/03-web-workbench-blueprint.md doc/design/05-web-dashboard.md doc/product/12-development-priority-backlog.md
```

Full gates before completion:

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

## 12. Completion Evidence

Completion of this package requires:

- spec committed;
- implementation plan committed;
- failing tests observed before implementation;
- green targeted Web tests;
- green full workspace gates;
- updated product docs and backlog checklist;
- final delta documenting proven / not proven / risks;
- pushed branch.

This package proves Run Review Workbench V1 trust and queue semantics. It does not prove the full P1 Skill Governance write surface, P2 Eval Review Dashboard redesign, or P3 Calibrated Escalation workflow has been implemented.
