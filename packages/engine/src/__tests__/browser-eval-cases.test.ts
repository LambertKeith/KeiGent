import { describe, expect, it } from "vitest";
import { BROWSER_EVAL_CASES } from "../evals/browser-cases.js";

describe("BROWSER_EVAL_CASES", () => {
  it("exports the extended browser suite without unstable public website dependencies", () => {
    expect(BROWSER_EVAL_CASES).toHaveLength(10);
    expect(BROWSER_EVAL_CASES.map((evalCase) => evalCase.id)).toEqual([
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
    ]);
    for (const evalCase of BROWSER_EVAL_CASES) {
      expect(evalCase.task.goal).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);
    }
  });
});
