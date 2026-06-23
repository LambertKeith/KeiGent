# Skill Explanation Run Surface Design

> Status: implementation-ready product spec  
> Date: 2026-06-23  
> Backlog anchor: `P0-03 Skill Explanation Surface`  
> Source of truth inputs: `doc/product/12-development-priority-backlog.md`, `doc/design/11-skill-lifecycle-and-governance.md`, `doc/product/06-skill-governance-product-spec.md`, `doc/product/13-recent-research-internalization-and-next-design.md`

## 1. Objective

Make skill usage explainable from the run audit path, not only from the standalone Skill Workbench. A user reviewing a run must be able to answer:

```text
Which skills matched, which skill bodies were injected, which were withheld, and why should I trust or distrust that choice?
```

This package completes the P0-03 read-only surface. It does not implement skill promotion, deprecation, blocking, remote marketplace behavior, or any write action.

## 2. Current Baseline

The current system already has:

- `SkillMeta` with lifecycle status, source, tool boundaries, risk, and eval coverage.
- `SkillMatchExplanation` with score, signals, status, injected, exclusion reason, matchedBy, confidence, includedBody, blockedReason, riskDelta, and evalCoverage.
- `loadSkillContext()` excluding non-executable skills from body injection.
- standalone Skill Workbench view model and renderer.
- RunRecord `skills` summaries, but these currently collapse match details into `name`, `status`, `reason`, `injected`, `riskDelta`, and `evalCoverage`.

The gap is the RunRecord and Run Detail path: excluded candidate / blocked / deprecated / no-skill states are not sufficiently visible from a run review.

## 3. Scope

### In Scope

- Extend RunRecord skill summary data to preserve read-only match explanation details.
- Preserve exclusion reasons for candidate, blocked, deprecated, learned-note-only, missing eval coverage, lower-ranked, score-below-threshold, and body-not-injected cases.
- Show skill status, match reason, confidence, body-injection state, exclusion reason, blocked/deprecated reason, risk, and eval coverage in Run Detail.
- Keep no-skill runs explicit: display an empty skill state instead of implying a runtime error.
- Add focused tests for RunRecord, Run view model, and Workbench rendering.
- Add an acceptance delta documenting what this package proves and does not prove.

### Out of Scope

- No `skill promote`, `skill verify`, `skill deprecate`, or `skill block` write commands.
- No new skill lifecycle state beyond existing `draft`, `candidate`, `active`, `verified`, `learned-note-only`, `blocked`, `quarantined`, `deprecated`, and `promoted`.
- No database or migration files.
- No automatic learned-note promotion.
- No change to `LoopEngine` selection semantics unless needed to expose existing match facts.

## 4. Data Contract

`SkillRunSummary` must retain enough information for a run reviewer:

```ts
interface SkillRunSummary {
  name: string;
  status?: string;
  reason: string;
  injected: boolean;
  riskDelta: RiskLevel | "R0";
  evalCoverage: string[];
  matched?: boolean;
  score?: number;
  confidence?: "none" | "low" | "medium" | "high";
  includedBody?: boolean;
  exclusionReason?:
    | "score_below_threshold"
    | "lower_ranked"
    | "status_not_executable"
    | "body_not_injected"
    | "missing_eval_coverage"
    | "blocked"
    | "candidate_not_enabled";
  blockedReason?: string;
}
```

Notes:

- This is still a RunRecord summary, not full skill metadata.
- `reason` remains the human-readable match reason.
- `injected=false` is not a failure by itself; it must be paired with `exclusionReason` when available.
- `verified` with no eval coverage must show `missing_eval_coverage`, not `verified`.

## 5. Rendering Requirements

Run Detail `Route and skills` must show:

- skill name;
- lifecycle status;
- match state;
- injection state;
- confidence / score;
- reason;
- exclusion reason when not injected;
- blocked reason when present;
- eval coverage;
- risk delta.

Empty state:

```text
No skills matched this run
```

Forbidden copy:

- Do not say `Skill unavailable` for blocked skills without showing policy reason.
- Do not say a candidate skill was injected unless `injected=true`.
- Do not imply no-skill runs are runtime failures.
- Do not treat eval coverage as task success evidence.

## 6. Fixture Expectations

### Verified Skill Injected

- `status=verified`
- `injected=true`
- `includedBody=true`
- eval coverage visible
- risk delta visible

### Candidate Skill Matched But Withheld

- `status=candidate`
- `matched=true`
- `injected=false`
- `exclusionReason=candidate_not_enabled`
- Workbench copy indicates review is required before enabling.

### Blocked Skill Matched But Withheld

- `status=blocked`
- `matched=true`
- `injected=false`
- `exclusionReason=blocked`
- `blockedReason` visible.

### Deprecated Skill Matched But Withheld

- `status=deprecated`
- `matched=true`
- `injected=false`
- `exclusionReason=status_not_executable`
- Workbench keeps the raw status visible.

### No Skill Matched

- `skills=[]`
- route may still show `matchedSkillIds=[]`
- Workbench displays `No skills matched this run`.

## 7. Test Plan Before Implementation

Tests must be written before production code changes.

Required failing tests:

1. `packages/engine/src/__tests__/run-record.test.ts`
   - preserves non-injected skill match explanations in RunRecord summaries.
2. `packages/web/src/__tests__/runs-view.test.ts`
   - normalizes skill explanation fields for injected and excluded skills.
3. `packages/web/src/__tests__/run-workbench.test.ts`
   - renders candidate / blocked / deprecated / no-skill explanation states in Run Detail.

## 8. Acceptance Gates

Targeted gates:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts
```

Full gates:

```bash
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
```

Documentation gates:

```bash
rg -n "P0-03|Skill Explanation|candidate_not_enabled|blocked|No skills matched" docs/superpowers/specs/2026-06-23-skill-explanation-run-surface-design.md doc/product/12-development-priority-backlog.md doc/product/06-skill-governance-product-spec.md
```

## 9. Completion Evidence

This package is complete only when:

- spec and implementation plan exist;
- failing tests were observed before implementation;
- RunRecord preserves excluded skill explanations;
- Workbench renders injected, candidate, blocked, deprecated, and no-skill states;
- acceptance delta records proven / not proven / risks;
- targeted and full gates pass;
- branch is committed and pushed.
