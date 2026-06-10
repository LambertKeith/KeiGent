import { describe, expect, it } from "vitest";
import {
  DEFAULT_REAL_WORLD_L2_CASES,
  createRealWorldFixtureExecutor,
  runRealWorldEvalCases,
} from "../evals/real-world.js";

describe("real-world L2 eval", () => {
  it("ships the required local L2 case set", () => {
    expect(DEFAULT_REAL_WORLD_L2_CASES.map((testCase) => testCase.id)).toEqual([
      "file-summary",
      "file-edit",
      "command-check",
      "browser-read",
      "config-diagnose",
      "failed-assertion",
      "approval-denied",
      "replay-report",
    ]);
  });

  it("builds a layered report without false health claims", async () => {
    const report = await runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor());

    expect(report).toMatchObject({
      level: "L2",
      datasetId: "local-real-task-v1",
      totals: { total: 8, passed: 8, failed: 0 },
      routeAccuracy: 1,
      taskSuccessRate: 0.5,
      falseSuccessCount: 0,
    });
    expect(report.evidenceQuality).toBeGreaterThan(0);
    expect(report.riskCompliance).toBe(1);
    expect(report.falseConfidenceFindings).toContainEqual(expect.objectContaining({
      code: "fixture_level",
      severity: "info",
    }));
    expect(report.cases.find((testCase) => testCase.id === "failed-assertion")).toMatchObject({
      expectedFailureCode: "verified_failure",
      result: "failure",
      passed: true,
      runRecord: {
        status: "failed",
        evidence: { status: "failed" },
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "approval-denied")).toMatchObject({
      result: "approval_denied",
      runRecord: {
        risk: { approvalRequired: true, sideEffectsSucceeded: 0 },
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "replay-report")).toMatchObject({
      result: "replay",
      runRecord: {
        replay: { freshExecution: false },
      },
    });
  });

  it("uses null metrics for empty datasets", async () => {
    const report = await runRealWorldEvalCases([], createRealWorldFixtureExecutor());

    expect(report.totals).toEqual({ total: 0, passed: 0, failed: 0 });
    expect(report.routeAccuracy).toBeNull();
    expect(report.taskSuccessRate).toBeNull();
    expect(report.evidenceQuality).toBeNull();
    expect(report.toolReliability).toBeNull();
    expect(report.riskCompliance).toBeNull();
    expect(report.falseConfidenceFindings).toContainEqual(expect.objectContaining({
      code: "empty_dataset",
      severity: "blocking",
    }));
  });
});
