# Skill Explanation Run Surface Acceptance Delta - 2026-06-23

## Scope

- Backlog package: `P0-03 Skill Explanation Surface`
- Spec: `docs/superpowers/specs/2026-06-23-skill-explanation-run-surface-design.md`

## Delivered

- Preserved skill match explanation fields in RunRecord summaries.
- Normalized injected and withheld skill explanations for Web Run Detail.
- Rendered injected, candidate, blocked, deprecated, and no-skill states in Run Detail.

## Acceptance Evidence

- `corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts`
- `corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts`
- `corepack pnpm -r check`
- `corepack pnpm -r test`
- `corepack pnpm -r --if-present build`

## Proven

- Verified injected skills retain coverage, confidence, body-injection, and risk metadata.
- Candidate, blocked, deprecated, and other non-injected skill matches keep exclusion reasons.
- Blocked skill reasons are visible in Run Detail.
- No-skill runs render an explicit empty state without claiming runtime failure.

## Not Proven

- This package does not implement skill promotion or blocking write actions.
- This package does not prove full skill governance approval workflows.
- This package does not prove live production skill quality beyond deterministic fixtures.

## Remaining Risks

- `SkillRunSummary` remains a compact run summary and does not replace full skill metadata.
- Future interactive filtering may need a dedicated skill queue model.
