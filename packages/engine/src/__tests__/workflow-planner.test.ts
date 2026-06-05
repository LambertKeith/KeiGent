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
