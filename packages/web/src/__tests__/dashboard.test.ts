import { describe, expect, it } from "vitest";
import {
  DEFAULT_REAL_WORLD_L2_CASES,
  createRealWorldFixtureExecutor,
  runRealWorldEvalCases,
} from "@keigent/engine";
import {
  casesWithFailureCode,
  filterDashboardCases,
  normalizeRealWorldEvalReport,
  summarizeEvalReport,
  type EvalReportView,
} from "../dashboard/report-model.js";

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

  it("separates eval pass, profile match, task success, tools, and checkpoint metrics", () => {
    const report: EvalReportView = {
      startedAt: "2026-06-04T00:00:00.000Z",
      durationMs: 10,
      total: 4,
      passed: 1,
      failed: 3,
      profileAccuracy: 0.5,
      failuresByCode: { profile_mismatch: 1, tool_missing: 1, verified_failure: 1, permission_denied: 1 },
      cases: [
        { ...baseCase, id: "guarded", totalToolCalls: 1, successfulToolsUsed: ["file_write"], checkpointsPassed: 1, guardApplied: true },
        { ...baseCase, id: "profile", passed: false, profileMatched: false, failureCodes: ["profile_mismatch"] },
        { ...baseCase, id: "tool", passed: false, exitReason: "error", totalToolCalls: 1, successfulToolsUsed: [], failureCodes: ["tool_missing"] },
        { ...baseCase, id: "verify", passed: false, exitReason: "error", failureCodes: ["verified_failure", "permission_denied"] },
      ],
    };

    const summary = summarizeEvalReport(report);
    expect(summary).toMatchObject({
      authoritative: true,
      passRate: 0.25,
      taskSuccessRate: 0.5,
      profileMatchRate: 0.75,
      toolAttemptedCases: 2,
      toolSucceededCases: 1,
      checkpointPassedCases: 1,
      failureCodeCount: 4,
    });
    expect(filterDashboardCases(report, "guardApplied").map((testCase) => testCase.id)).toEqual(["guarded"]);
    expect(filterDashboardCases(report, "profileMismatch").map((testCase) => testCase.id)).toEqual(["profile"]);
    expect(filterDashboardCases(report, "toolFailure").map((testCase) => testCase.id)).toEqual(["tool"]);
    expect(filterDashboardCases(report, "verificationFailure").map((testCase) => testCase.id)).toEqual(["verify"]);
    expect(filterDashboardCases(report, "permissionDenied").map((testCase) => testCase.id)).toEqual(["verify"]);
  });

  it("does not mark empty reports as authoritative", () => {
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

    expect(summarizeEvalReport(report)).toMatchObject({ authoritative: false, passRate: null });
  });

  it("normalizes real-world L2 reports into case-to-run detail links without health claims", async () => {
    const report = await runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor());

    const view = normalizeRealWorldEvalReport(report);

    expect(view).toMatchObject({
      level: "L2",
      datasetId: "local-real-task-v1",
      healthClaim: "Fixture-level regression, not product health",
      metrics: {
        routeAccuracy: { value: 1, label: "100.0%" },
        taskSuccessRate: { value: 5 / 19, label: "26.3%" },
        evidenceQuality: { label: expect.stringMatching(/%$/) },
      },
      proofBoundary: {
        notProven: expect.arrayContaining(["Fixture results do not prove product health."]),
      },
    });
    expect(view.cases.find((testCase) => testCase.id === "no-op-automation")).toMatchObject({
      runId: "run_no-op-automation",
      runDetailHref: "#runs/run_no-op-automation",
      result: "no_op",
      replayFreshExecution: true,
    });
    expect(view.cases.find((testCase) => testCase.id === "replay-report")).toMatchObject({
      runId: "run_replay-report",
      runDetailHref: "#runs/run_replay-report",
      replayFreshExecution: false,
    });
    expect(view.falseConfidenceFindings).toEqual([
      expect.objectContaining({ code: "fixture_level", severity: "info" }),
    ]);
  });
});
