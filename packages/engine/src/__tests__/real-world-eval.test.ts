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
      "assertion-repair-success",
      "repair-budget-exhausted",
      "approval-denied",
      "replay-report",
      "no-op-automation",
      "stale-skill-blocked",
      "deprecated-skill-warning",
      "parent-timeout-child-success",
      "reviewer-readonly-violation",
      "budget-exceeded",
      "redaction-leak-guard",
      "replay-stale-schema",
      "insufficient-evidence-success-claim",
    ]);
  });

  it("builds a layered report without false health claims", async () => {
    const report = await runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor());

    expect(report).toMatchObject({
      level: "L2",
      datasetId: "local-real-task-v1",
      totals: { total: 19, passed: 19, failed: 0 },
      routeAccuracy: 1,
      falseSuccessCount: 0,
    });
    expect(report.taskSuccessRate).toBeCloseTo(5 / 19);
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
    expect(report.cases.find((testCase) => testCase.id === "assertion-repair-success")).toMatchObject({
      result: "success",
      runRecord: {
        status: "succeeded",
        autonomy: {
          outcome: "self_repaired",
          repairAttempts: [expect.objectContaining({
            targetAssertion: "fileExists:output.txt",
            finalVerdict: "passed",
          })],
        },
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "repair-budget-exhausted")).toMatchObject({
      expectedFailureCode: "budget_exceeded",
      result: "failure",
      runRecord: {
        status: "cancelled",
        autonomy: {
          outcome: "degraded_without_escalation",
        },
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
      runId: "run_replay-report",
      runRecord: {
        replay: { freshExecution: false },
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "no-op-automation")).toMatchObject({
      result: "no_op",
      runId: "run_no-op-automation",
      runRecord: {
        status: "no_op",
        automation: {
          scope: "last 20 runs",
          doesNotProve: ["No hidden failures outside this scope."],
        },
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "insufficient-evidence-success-claim")).toMatchObject({
      result: "failure",
      runRecord: {
        status: "failed",
        evidence: { status: "insufficient_evidence" },
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "budget-exceeded")).toMatchObject({
      expectedFailureCode: "budget_exceeded",
      result: "failure",
      runRecord: {
        status: "cancelled",
        workflow: { budgetExceeded: true },
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
