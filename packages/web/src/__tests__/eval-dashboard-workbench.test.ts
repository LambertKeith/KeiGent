import { describe, expect, it } from "vitest";
import type { RealWorldEvalReportView } from "../dashboard/report-model.js";
import { renderRealWorldEvalDashboard } from "../dashboard/workbench.js";

function reportView(): RealWorldEvalReportView {
  return {
    startedAt: "2026-06-10T00:00:00.000Z",
    durationMs: 42,
    level: "L2",
    datasetId: "local-real-task-v1",
    totals: { total: 2, passed: 1, failed: 1 },
    healthClaim: "Fixture-level regression, not product health",
    metrics: {
      routeAccuracy: { value: 1, label: "100.0%" },
      taskSuccessRate: { value: 0.5, label: "50.0%" },
      evidenceQuality: { value: 0.5, label: "50.0%" },
      toolReliability: { value: 1, label: "100.0%" },
      riskCompliance: { value: 0.5, label: "50.0%" },
    },
    falseSuccessCount: 1,
    falseConfidenceFindings: [
      { code: "fixture_level", severity: "info", message: "Fixture-level report only." },
      { code: "false_success", severity: "blocking", caseId: "case-failed", message: "Fresh success on expected failure." },
    ],
    proofBoundary: {
      proven: ["Deterministic L2 fixture cases were evaluated."],
      notProven: ["Fixture results do not prove product health."],
      assumptions: ["Fixtures represent selected local acceptance boundaries only."],
      evidenceGaps: [],
    },
    cases: [
      {
        id: "case-ok",
        title: "Successful case",
        level: "L2",
        runId: "run_case-ok",
        runDetailHref: "#runs/run_case-ok",
        expectedResult: "success",
        result: "success",
        passed: true,
        routeMatched: true,
        taskSucceeded: true,
        evidenceChecked: true,
        riskCompliant: true,
        falseSuccess: false,
        status: "succeeded",
        evidenceStatus: "passed",
        replayFreshExecution: true,
        failureCodes: [],
        failures: [],
        proofBoundary: {
          proven: ["Case case-ok matched fixture expectation."],
          notProven: ["Fixture case does not prove product health."],
          assumptions: ["Fixture evidence is limited to this local report."],
          evidenceGaps: [],
        },
      },
      {
        id: "case-failed",
        title: "False success case",
        level: "L2",
        runId: "run_case-failed",
        runDetailHref: "#runs/run_case-failed",
        expectedResult: "failed",
        result: "success",
        passed: false,
        routeMatched: true,
        taskSucceeded: true,
        evidenceChecked: false,
        riskCompliant: false,
        falseSuccess: true,
        status: "succeeded",
        evidenceStatus: "not_checked",
        replayFreshExecution: false,
        failureCodes: ["false_success"],
        failures: ["success without evidence"],
        proofBoundary: {
          proven: [],
          notProven: ["Fixture case does not prove product health."],
          assumptions: ["Fixture evidence is limited to this local report."],
          evidenceGaps: ["success without evidence"],
        },
      },
    ],
  };
}

describe("real-world eval dashboard workbench", () => {
  it("renders case-to-run links and false-confidence findings separately", () => {
    const html = renderRealWorldEvalDashboard(reportView());

    expect(html).toContain("Eval-run linkage");
    expect(html).toContain("#runs/run_case-ok");
    expect(html).toContain("#runs/run_case-failed");
    expect(html).toContain("False-confidence findings");
    expect(html).toContain("false_success");
    expect(html).toContain("Replay report");
    expect(html).toContain("Fixture-level regression, not product health");
    expect(html).not.toContain("Overall health");
  });
});
