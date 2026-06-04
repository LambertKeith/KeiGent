import { describe, expect, it } from "vitest";
import { casesWithFailureCode, summarizeEvalReport, type EvalReportView } from "../dashboard/report-model.js";

const baseCase = {
  id: "case-1",
  title: "Case 1",
  category: "tool-smoke",
  passed: true,
  profileMatched: true,
  exitReason: "success",
  iterations: 1,
  checkpointsPassed: 0,
  totalToolCalls: 0,
  toolsUsed: [],
  successfulToolsUsed: [],
  durationMs: 1,
  failures: [],
  failureCodes: [],
  finalResponse: "ok",
};

describe("dashboard report model", () => {
  it("derives pass rate while preserving null profile accuracy semantics", () => {
    const report: EvalReportView = {
      startedAt: "2026-06-04T00:00:00.000Z",
      durationMs: 10,
      total: 0,
      passed: 0,
      failed: 0,
      profileAccuracy: null,
      failuresByCode: {},
      cases: [],
    };

    expect(summarizeEvalReport(report)).toMatchObject({ passRate: null, profileAccuracy: null, invalid: false });
  });

  it("does not confuse failure code count with failed case count", () => {
    const report: EvalReportView = {
      startedAt: "2026-06-04T00:00:00.000Z",
      durationMs: 10,
      total: 1,
      passed: 0,
      failed: 1,
      profileAccuracy: 0,
      failuresByCode: { profile_mismatch: 1, checkpoint_missing: 1 },
      cases: [{ ...baseCase, passed: false, failureCodes: ["profile_mismatch", "checkpoint_missing"] }],
    };

    const summary = summarizeEvalReport(report);
    expect(summary.failureCodeCount).toBe(2);
    expect(report.failed).toBe(1);
    expect(casesWithFailureCode(report, "checkpoint_missing")).toHaveLength(1);
  });

  it("flags inconsistent reports as invalid instead of rendering authoritative metrics", () => {
    const report: EvalReportView = {
      startedAt: "2026-06-04T00:00:00.000Z",
      durationMs: 10,
      total: 10,
      passed: 2,
      failed: 2,
      profileAccuracy: 2,
      failuresByCode: {},
      cases: [],
    };

    expect(summarizeEvalReport(report).issues.map((issue) => issue.code)).toEqual([
      "total.cases_mismatch",
      "summary.inconsistent",
      "profileAccuracy.invalid",
    ]);
  });
});
