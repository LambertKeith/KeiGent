# Skill Explanation Run Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `P0-03 Skill Explanation Surface` for the run audit path so RunRecord and Run Detail preserve why skills were injected or withheld.

**Architecture:** Keep skill lifecycle decisions in the existing engine skill matching path. Add optional read-only fields to `SkillRunSummary`, normalize them in the Web run model, and render them in the existing `Route and skills` panel without adding write actions or changing RunRecord schema version.

**Tech Stack:** TypeScript, pnpm, Vitest, existing `@keigent/engine` RunRecord and Web Workbench view models.

## Global Constraints

- `LoopEngine` remains the only runtime loop.
- Skill is execution knowledge, not success evidence.
- `learned-note-only`, `candidate`, `blocked`, `quarantined`, and `deprecated` skills must not be silently injected.
- This package is read-only: no promote, verify, deprecate, block, marketplace, database, or migration work.
- Eval coverage must be displayed as skill governance evidence, not task success evidence.
- No-skill runs must render as an explicit empty state, not a runtime failure.

---

## File Structure

- Modify `packages/engine/src/run-record.ts`: extend `SkillRunSummary` and `summarizeSkills()` to preserve optional match explanation fields.
- Modify `packages/web/src/runs/model.ts`: normalize/redact skill explanation fields for Run Detail.
- Modify `packages/web/src/runs/workbench.ts`: render status, match, injection, confidence/score, exclusion reason, blocked reason, risk, eval coverage, and no-skill empty state.
- Modify `packages/engine/src/__tests__/run-record.test.ts`: add RunRecord preservation tests.
- Modify `packages/web/src/__tests__/runs-view.test.ts`: add run view model normalization tests.
- Modify `packages/web/src/__tests__/run-workbench.test.ts`: add Workbench rendering tests for candidate / blocked / deprecated / no-skill states.
- Create `doc/evals/08-skill-explanation-run-surface-delta-2026-06-23.md`: acceptance delta.

---

### Task 1: Preserve Skill Match Explanation Fields In RunRecord

**Files:**
- Modify: `packages/engine/src/run-record.ts`
- Test: `packages/engine/src/__tests__/run-record.test.ts`

**Interfaces:**
- Consumes: `SkillMatchExplanation` from `packages/engine/src/types.ts`.
- Produces optional fields on `SkillRunSummary`: `matched`, `score`, `confidence`, `includedBody`, `exclusionReason`, `blockedReason`.

- [ ] **Step 1: Write the failing test**

Add this test in `packages/engine/src/__tests__/run-record.test.ts`:

```ts
  it("preserves injected and withheld skill match explanations in run records", () => {
    const result = workflowResult();
    const skillStep = result.childRuns[0]!.result.trajectory.steps.find((step) => step.kind === "skill_match");
    if (!skillStep) throw new Error("missing skill match step");
    skillStep.skillMatches = [
      {
        name: "file-write",
        status: "verified",
        score: 12,
        signals: ["tag:file"],
        matched: true,
        injected: true,
        matchedBy: ["tag:file"],
        confidence: "high",
        includedBody: true,
        riskDelta: "declared R2",
        evalCoverage: ["file-write-success"],
      },
      {
        name: "candidate-browser",
        status: "candidate",
        score: 7,
        signals: ["tag:browser"],
        matched: true,
        injected: false,
        matchedBy: ["tag:browser"],
        confidence: "medium",
        includedBody: false,
        exclusionReason: "candidate_not_enabled",
        evalCoverage: ["candidate-browser-positive"],
      },
      {
        name: "blocked-shell",
        status: "blocked",
        score: 9,
        signals: ["tag:shell"],
        matched: true,
        injected: false,
        matchedBy: ["tag:shell"],
        confidence: "medium",
        includedBody: false,
        exclusionReason: "blocked",
        blockedReason: "unsafe shell command",
      },
    ];
    result.childRuns[0]!.trajectory = result.childRuns[0]!.result.trajectory;
    result.trajectory.childRuns = result.childRuns;

    const record = buildRunRecordFromWorkflowResult(result, { id: "run_skill_explanations" });

    expect(record.skills).toEqual([
      expect.objectContaining({
        name: "file-write",
        status: "verified",
        reason: "tag:file",
        injected: true,
        matched: true,
        score: 12,
        confidence: "high",
        includedBody: true,
        riskDelta: "R2",
        evalCoverage: ["file-write-success"],
      }),
      expect.objectContaining({
        name: "candidate-browser",
        status: "candidate",
        reason: "tag:browser",
        injected: false,
        matched: true,
        score: 7,
        confidence: "medium",
        includedBody: false,
        exclusionReason: "candidate_not_enabled",
        evalCoverage: ["candidate-browser-positive"],
      }),
      expect.objectContaining({
        name: "blocked-shell",
        status: "blocked",
        injected: false,
        matched: true,
        exclusionReason: "blocked",
        blockedReason: "unsafe shell command",
      }),
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts
```

Expected: FAIL because `SkillRunSummary` does not preserve `matched`, `score`, `confidence`, `includedBody`, `exclusionReason`, or `blockedReason`.

- [ ] **Step 3: Implement minimal preservation**

In `packages/engine/src/run-record.ts`, add optional fields to `SkillRunSummary`:

```ts
  matched?: boolean;
  score?: number;
  confidence?: SkillMatchExplanation["confidence"];
  includedBody?: boolean;
  exclusionReason?: SkillMatchExplanation["exclusionReason"];
  blockedReason?: string;
```

Update `summarizeSkills()` to copy and redact these fields:

```ts
    ...(typeof match.matched === "boolean" ? { matched: match.matched } : {}),
    ...(typeof match.score === "number" ? { score: match.score } : {}),
    ...(match.confidence ? { confidence: match.confidence } : {}),
    ...(typeof match.includedBody === "boolean" ? { includedBody: match.includedBody } : {}),
    ...(match.exclusionReason ? { exclusionReason: match.exclusionReason } : {}),
    ...(match.blockedReason ? { blockedReason: redactText(match.blockedReason) } : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts
```

Expected: PASS for `run-record.test.ts`.

---

### Task 2: Normalize Skill Explanation Fields In Web Run Model

**Files:**
- Modify: `packages/web/src/runs/model.ts`
- Test: `packages/web/src/__tests__/runs-view.test.ts`

**Interfaces:**
- Consumes: `RunRecord.skills` with optional fields from Task 1.
- Produces: redacted `RunRecordDetailView.skills` fields for rendering.

- [ ] **Step 1: Write the failing test**

Add this test in `packages/web/src/__tests__/runs-view.test.ts`:

```ts
  it("normalizes injected and excluded skill explanations for run review", () => {
    const view = normalizeRunRecord(runRecord({
      skills: [
        {
          name: "file-write",
          status: "verified",
          reason: "tag:file",
          injected: true,
          matched: true,
          score: 12,
          confidence: "high",
          includedBody: true,
          riskDelta: "R2",
          evalCoverage: ["file-write-success"],
        },
        {
          name: "blocked-shell",
          status: "blocked",
          reason: "tag:shell",
          injected: false,
          matched: true,
          score: 9,
          confidence: "medium",
          includedBody: false,
          exclusionReason: "blocked",
          blockedReason: "unsafe shell command in /Users/privateuser/project",
          riskDelta: "R4",
          evalCoverage: [],
        },
      ],
    } as Partial<RunRecord>));

    expect(view.skills).toEqual([
      expect.objectContaining({
        name: "file-write",
        status: "verified",
        injected: true,
        matched: true,
        score: 12,
        confidence: "high",
        includedBody: true,
        evalCoverage: ["file-write-success"],
      }),
      expect.objectContaining({
        name: "blocked-shell",
        status: "blocked",
        injected: false,
        matched: true,
        exclusionReason: "blocked",
        blockedReason: "unsafe shell command in /Users/[REDACTED_USER]/project",
      }),
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts
```

Expected: FAIL because Web normalization currently passes `record.skills` through and does not redact `blockedReason`.

- [ ] **Step 3: Implement normalization**

Replace `if (record.skills?.length) return record.skills;` in `skillsFor()` with a mapping that redacts every string field and preserves optional booleans/numbers.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts
```

Expected: PASS for `runs-view.test.ts`.

---

### Task 3: Render Skill Explanation States In Run Detail

**Files:**
- Modify: `packages/web/src/runs/workbench.ts`
- Test: `packages/web/src/__tests__/run-workbench.test.ts`

**Interfaces:**
- Consumes: normalized `RunRecordDetailView.skills`.
- Produces: route-and-skills HTML showing injected, withheld, candidate, blocked, deprecated, and no-skill states.

- [ ] **Step 1: Write the failing rendering tests**

Add these tests in `packages/web/src/__tests__/run-workbench.test.ts`:

```ts
  it("renders skill injection, candidate, blocked, and deprecated explanations in Run Detail", () => {
    const view = buildRunWorkbenchView([record({
      id: "run_skill_surface",
      skills: [
        {
          name: "file-write",
          status: "verified",
          reason: "tag:file",
          injected: true,
          matched: true,
          score: 12,
          confidence: "high",
          includedBody: true,
          riskDelta: "R2",
          evalCoverage: ["file-write-success"],
        },
        {
          name: "candidate-browser",
          status: "candidate",
          reason: "tag:browser",
          injected: false,
          matched: true,
          score: 7,
          confidence: "medium",
          includedBody: false,
          exclusionReason: "candidate_not_enabled",
          riskDelta: "R1",
          evalCoverage: ["candidate-browser-positive"],
        },
        {
          name: "blocked-shell",
          status: "blocked",
          reason: "tag:shell",
          injected: false,
          matched: true,
          score: 9,
          confidence: "medium",
          includedBody: false,
          exclusionReason: "blocked",
          blockedReason: "unsafe shell command",
          riskDelta: "R4",
          evalCoverage: [],
        },
        {
          name: "legacy-browser",
          status: "deprecated",
          reason: "tag:browser",
          injected: false,
          matched: true,
          score: 5,
          confidence: "low",
          includedBody: false,
          exclusionReason: "status_not_executable",
          riskDelta: "R1",
          evalCoverage: [],
        },
      ],
    } as Partial<RunRecord>)], "run_skill_surface");

    const html = renderRunWorkbench(view);

    expect(html).toContain("file-write");
    expect(html).toContain("verified");
    expect(html).toContain("Matched");
    expect(html).toContain("Body injected");
    expect(html).toContain("high / 12");
    expect(html).toContain("file-write-success");
    expect(html).toContain("candidate-browser");
    expect(html).toContain("candidate_not_enabled");
    expect(html).toContain("blocked-shell");
    expect(html).toContain("unsafe shell command");
    expect(html).toContain("legacy-browser");
    expect(html).toContain("status_not_executable");
  });

  it("renders an explicit no-skill empty state without implying runtime failure", () => {
    const html = renderRunWorkbench(buildRunWorkbenchView([record({
      id: "run_no_skill",
      route: {
        selectedProfile: "conversational",
        source: "rule",
        matchedSkillIds: [],
      },
      skills: [],
    } as Partial<RunRecord>)], "run_no_skill"));

    expect(html).toContain("No skills matched this run");
    expect(html).not.toContain("Skill unavailable");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Expected: FAIL because `Route and skills` does not render the new fields or no-skill empty state yet.

- [ ] **Step 3: Implement rendering**

In `renderRouteAndSkills()`, expand the table columns:

```text
Skill | Status | Match | Injection | Confidence | Reason | Exclusion | Blocked reason | Risk | Eval coverage
```

Use:

- match: `Matched` / `Not matched`
- injection: `Body injected` / `Not injected`
- confidence: `${skill.confidence ?? "not_reported"} / ${skill.score ?? "?"}`
- empty body: `<tr><td colspan="10">No skills matched this run</td></tr>`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/run-workbench.test.ts
```

Expected: PASS for `run-workbench.test.ts`.

---

### Task 4: Acceptance Delta And Final Gates

**Files:**
- Create: `doc/evals/08-skill-explanation-run-surface-delta-2026-06-23.md`

**Interfaces:**
- Consumes: outputs from Tasks 1-3.
- Produces: P0-03 acceptance evidence.

- [ ] **Step 1: Create acceptance delta**

Create `doc/evals/08-skill-explanation-run-surface-delta-2026-06-23.md` with sections:

```markdown
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
```

- [ ] **Step 2: Run final gates**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/run-record.test.ts
corepack pnpm --filter @keigent/web exec vitest run src/__tests__/runs-view.test.ts src/__tests__/run-workbench.test.ts
corepack pnpm -r check
corepack pnpm -r test
corepack pnpm -r --if-present build
git diff --check
rg -n "P0-03|Skill Explanation|candidate_not_enabled|blocked|No skills matched" docs/superpowers/specs/2026-06-23-skill-explanation-run-surface-design.md docs/superpowers/plans/2026-06-23-skill-explanation-run-surface.md doc/evals/08-skill-explanation-run-surface-delta-2026-06-23.md doc/product/12-development-priority-backlog.md doc/product/06-skill-governance-product-spec.md
rg -n "T[B]D|T[O]DO|implement[ ]later|fill[ ]in|待[定]|占[位]" docs/superpowers/specs/2026-06-23-skill-explanation-run-surface-design.md docs/superpowers/plans/2026-06-23-skill-explanation-run-surface.md doc/evals/08-skill-explanation-run-surface-delta-2026-06-23.md
```

Expected:
- all test/check/build commands exit 0;
- `git diff --check` exits 0;
- keyword `rg` exits 0 with relevant hits;
- placeholder `rg` exits 1 with no matches.

---

## Self-Review

- Spec coverage: Tasks cover RunRecord preservation, Web normalization, Run Detail rendering, no-skill empty state, and acceptance delta.
- Intentional gaps: write actions for promotion/block/deprecate/verify remain out of scope.
- Placeholder scan: No unresolved placeholder sentinel terms are required in this plan.
- Type consistency: `SkillRunSummary` fields are defined in Task 1 and consumed by Task 2 and Task 3.
