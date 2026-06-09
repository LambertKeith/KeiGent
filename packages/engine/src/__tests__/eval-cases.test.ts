import { describe, expect, it } from "vitest";
import { DEFAULT_EVAL_CASES, createSmokeEvalExecutor } from "../evals/cases.js";
import { runEvalCases } from "../evals/runner.js";
import type { EvalCategory } from "../evals/types.js";

describe("DEFAULT_EVAL_CASES", () => {
  it("contains at least 50 deterministic product cases with proof boundaries", () => {
    expect(DEFAULT_EVAL_CASES.length).toBeGreaterThanOrEqual(50);

    const categories = new Set(DEFAULT_EVAL_CASES.map((evalCase) => evalCase.category));
    const expectedCategories: EvalCategory[] = [
      "conversational",
      "research",
      "file",
      "shell",
      "browser",
      "config",
      "permission",
      "workflow",
      "skill",
      "dashboard",
    ];
    for (const category of expectedCategories) {
      expect(categories.has(category), `missing category ${category}`).toBe(true);
      expect(
        DEFAULT_EVAL_CASES.filter((evalCase) => evalCase.category === category).length,
        `category ${category} should have at least 5 cases`,
      ).toBeGreaterThanOrEqual(5);
    }

    for (const evalCase of DEFAULT_EVAL_CASES) {
      expect(evalCase.proves, `${evalCase.id} must state proves`).toBeTruthy();
      expect(evalCase.doesNotProve, `${evalCase.id} must state doesNotProve`).toBeTruthy();
    }
  });

  it("passes through the deterministic smoke executor without live model or browser work", async () => {
    const report = await runEvalCases(DEFAULT_EVAL_CASES, createSmokeEvalExecutor());

    expect(report.total).toBeGreaterThanOrEqual(50);
    expect(report.passed).toBe(report.total);
    expect(report.failed).toBe(0);
    expect(report.failuresByCode).toEqual({});
  });

  it("covers explicit T26 tool boundary cases", () => {
    const ids = new Set(DEFAULT_EVAL_CASES.map((evalCase) => evalCase.id));
    for (const id of [
      "file-path-escape-deny",
      "file-hash-evidence",
      "shell-failure",
      "shell-timeout",
      "shell-abort",
      "http-post-r3-approval",
      "memory-recall-readonly",
    ]) {
      expect(ids.has(id), `missing tool boundary case ${id}`).toBe(true);
    }

    const httpCase = DEFAULT_EVAL_CASES.find((evalCase) => evalCase.id === "http-post-r3-approval")!;
    expect(httpCase.acceptance.requiredTools).toContain("http_request");
    expect(httpCase.acceptance.requiredApprovals).toContainEqual(
      expect.objectContaining({ toolName: "http_request", approved: true, riskLevel: "R3" }),
    );

    const memoryCase = DEFAULT_EVAL_CASES.find((evalCase) => evalCase.id === "memory-recall-readonly")!;
    expect(memoryCase.acceptance.requiredTools).toContain("memory_recall");
    expect(memoryCase.acceptance.requiredApprovals ?? []).toHaveLength(0);
  });

  it("contains at least ten browser realistic cases with key browser semantics", () => {
    const browserCases = DEFAULT_EVAL_CASES.filter((evalCase) => evalCase.category === "browser");
    const ids = new Set(browserCases.map((evalCase) => evalCase.id));

    expect(browserCases).toHaveLength(10);
    for (const id of [
      "browser-snapshot-ref",
      "browser-click-ref",
      "browser-form",
      "browser-download-intent",
      "browser-unavailable",
      "browser-local-navigation",
      "browser-dom-text",
      "browser-keyboard-submit",
      "browser-scroll-lazy-content",
      "browser-wait-for-state",
    ]) {
      expect(ids.has(id), `missing browser case ${id}`).toBe(true);
    }
  });
});
