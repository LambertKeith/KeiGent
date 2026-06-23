import { describe, expect, it } from "vitest";
import type { Task } from "../types.js";
import { chooseExecutionMode, createWorkflowSpec, DEFAULT_WORKFLOW_BUDGET } from "../workflow/planner.js";

function task(overrides: Partial<Task> = {}): Task {
  return { goal: "Do the thing", profile: "auto", ...overrides };
}

describe("workflow planner", () => {
  it("chooses single-loop when the task has no success assertions", () => {
    expect(chooseExecutionMode(task())).toBe("single-loop");
  });

  it("chooses verified-loop when the task has success assertions", () => {
    const withAssertions = task({
      successDef: {
        goal: "Done",
        assertions: [{ description: "answer is visible", signal: "text" }],
      },
    });

    expect(chooseExecutionMode(withAssertions)).toBe("verified-loop");
  });

  it("respects an explicit mode override", () => {
    const spec = createWorkflowSpec({ id: "wf-1", task: task(), mode: "verified-loop" });

    expect(spec.mode).toBe("verified-loop");
  });

  it("requires success assertions for reviewed-loop and gives it a two-child default budget", () => {
    expect(() => createWorkflowSpec({ id: "wf-reviewed-missing", task: task(), mode: "reviewed-loop" })).toThrow(
      "reviewed-loop requires successDef assertions",
    );

    const spec = createWorkflowSpec({
      id: "wf-reviewed",
      task: task({
        successDef: {
          goal: "Review rubric",
          assertions: [{ description: "reviewer accepts result", signal: "text" }],
        },
      }),
      mode: "reviewed-loop",
    });

    expect(spec.mode).toBe("reviewed-loop");
    expect(spec.budget.maxChildRuns).toBeGreaterThanOrEqual(2);
    expect(spec.policy).toMatchObject({
      reviewerReadonly: true,
      verifierReadonly: true,
      maxPermission: "readonly",
      maxRiskLevel: "R0",
      allowExternalSideEffects: false,
    });
  });

  it("does not let caller-provided reviewed-loop policy widen reviewer permissions", () => {
    const spec = createWorkflowSpec({
      id: "wf-reviewed-wide-policy",
      task: task({
        successDef: {
          goal: "Review rubric",
          assertions: [{ description: "reviewer accepts result", signal: "text" }],
        },
      }),
      mode: "reviewed-loop",
      policy: {
        maxPermission: "dangerous",
        maxRiskLevel: "R5",
        allowExternalSideEffects: true,
      },
    });

    expect(spec.policy).toMatchObject({
      reviewerReadonly: true,
      verifierReadonly: true,
      maxPermission: "readonly",
      maxRiskLevel: "R0",
      allowExternalSideEffects: false,
    });
  });

  it("attaches a default review rubric for reviewed-loop", () => {
    const spec = createWorkflowSpec({
      id: "wf-reviewed-rubric",
      task: task({
        goal: "Draft release notes",
        successDef: {
          goal: "Review release notes",
          assertions: [{ description: "reviewer accepts result", signal: "text" }],
        },
      }),
      mode: "reviewed-loop",
    });

    expect(spec.review).toMatchObject({
      rubric: {
        taskGoal: "Draft release notes",
        successCriteria: ["[signal:text] reviewer accepts result"],
        requiredEvidence: ["reviewer checkpoint verdict"],
        forbiddenClaims: ["Do not claim reviewer acceptance without a passed reviewer checkpoint."],
        falseConfidenceRisks: ["Reviewer approval cannot override failed worker evidence."],
        blockingIssueRules: ["Any failed reviewer checkpoint is blocking."],
      },
    });
  });

  it("applies default budget values", () => {
    const spec = createWorkflowSpec({ id: "wf-1", task: task() });

    expect(spec.budget).toEqual(DEFAULT_WORKFLOW_BUDGET);
  });

  it("merges partial budget overrides with defaults", () => {
    const spec = createWorkflowSpec({
      id: "wf-1",
      task: task(),
      budget: { maxAggregateToolCalls: 3 },
    });

    expect(spec.budget).toEqual({ ...DEFAULT_WORKFLOW_BUDGET, maxAggregateToolCalls: 3 });
  });

  it("does not mutate the input task", () => {
    const input = task({
      successDef: {
        goal: "Done",
        assertions: [{ description: "answer is visible", signal: "text" }],
      },
    });
    const before = structuredClone(input);

    createWorkflowSpec({ id: "wf-1", task: input, budget: { maxChildRuns: 0 } });

    expect(input).toEqual(before);
  });
});
