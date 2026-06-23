import { describe, expect, it } from "vitest";
import {
  buildStabilityGateReport,
  runStabilityGate,
  type StabilityGateRedlineId,
} from "../evals/stability-gate.js";
import {
  DEFAULT_REAL_WORLD_L2_CASES,
  createRealWorldFixtureExecutor,
  runRealWorldEvalCases,
  type RealWorldEvalCaseResult,
  type RealWorldEvalReport,
} from "../evals/real-world.js";

const GENERATED_AT = "2026-06-23T00:00:00.000Z";

async function l2Report(): Promise<RealWorldEvalReport> {
  return runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor());
}

async function emptyReport(): Promise<RealWorldEvalReport> {
  return runRealWorldEvalCases([], createRealWorldFixtureExecutor());
}

function caseById(report: RealWorldEvalReport, id: string): RealWorldEvalCaseResult {
  const result = report.cases.find((testCase) => testCase.id === id);
  if (!result) throw new Error(`missing fixture case ${id}`);
  return result;
}

function failingRedlineIds(report: ReturnType<typeof buildStabilityGateReport>): StabilityGateRedlineId[] {
  return report.redlines.filter((redline) => !redline.passed).map((redline) => redline.id);
}

describe("P0 stability hardening gate", () => {
  it("passes every P0 false-confidence redline on the default deterministic fixtures", async () => {
    const report = await runStabilityGate({ generatedAt: GENERATED_AT });

    expect(report).toMatchObject({
      generatedAt: GENERATED_AT,
      datasetId: "local-real-task-v1",
      totalRedlines: 9,
      passedRedlines: 9,
      failedRedlines: 0,
      status: "passed",
    });
    expect(report.redlines.map((redline) => redline.id)).toEqual([
      "final_text_not_success",
      "tool_attempted_not_succeeded",
      "replay_not_fresh",
      "empty_evidence_not_100",
      "approval_not_bypassed",
      "blocked_skill_not_injected",
      "reviewer_readonly",
      "parent_timeout_authoritative",
      "secret_redaction",
    ]);
    expect(report.proofBoundary.notProven).toContain("Fixture gate does not prove production health.");
    expect(report.proofBoundary.notProven).toContain("Fixture gate does not prove human acceptance.");
  });

  it("fails closed when fixtures regress into trusted success or fresh replay claims", async () => {
    const report = await l2Report();
    const replayCase = caseById(report, "replay-report");
    replayCase.runRecord.replay.freshExecution = true;
    const insufficientCase = caseById(report, "insufficient-evidence-success-claim");
    insufficientCase.result = "success";
    insufficientCase.runRecord.status = "succeeded";
    insufficientCase.runRecord.evidence.status = "passed";

    const gate = buildStabilityGateReport({
      l2Report: report,
      emptyReport: await emptyReport(),
      generatedAt: GENERATED_AT,
    });

    expect(gate.status).toBe("failed");
    expect(failingRedlineIds(gate)).toEqual(expect.arrayContaining([
      "final_text_not_success",
      "replay_not_fresh",
    ]));
    expect(gate.proofBoundary.evidenceGaps).toEqual(expect.arrayContaining([
      expect.stringContaining("final_text_not_success"),
      expect.stringContaining("replay_not_fresh"),
    ]));
  });

  it("fails when approval denial, readonly review, or blocked skill policy can be bypassed", async () => {
    const report = await l2Report();
    const approvalCase = caseById(report, "approval-denied");
    approvalCase.runRecord.risk.sideEffectsSucceeded = 1;
    approvalCase.runRecord.approvals = [];
    const reviewerCase = caseById(report, "reviewer-readonly-violation");
    reviewerCase.runRecord.tools = reviewerCase.runRecord.tools?.map((tool) =>
      tool.name === "file_write" ? { ...tool, attempted: true, succeeded: true } : tool);
    const staleSkillCase = caseById(report, "stale-skill-blocked");
    staleSkillCase.runRecord.skills = [{
      name: "unsafe-deploy",
      status: "blocked",
      reason: "stale skill still injected",
      injected: true,
      riskDelta: "R0",
      evalCoverage: ["stale-skill-blocked"],
      blockedReason: "stale",
    }];

    const gate = buildStabilityGateReport({
      l2Report: report,
      emptyReport: await emptyReport(),
      generatedAt: GENERATED_AT,
    });

    expect(failingRedlineIds(gate)).toEqual(expect.arrayContaining([
      "approval_not_bypassed",
      "reviewer_readonly",
      "blocked_skill_not_injected",
    ]));
  });

  it("treats an empty evidence corpus as blocking rather than perfect", async () => {
    const badEmptyReport = await emptyReport();
    badEmptyReport.routeAccuracy = 1;
    badEmptyReport.taskSuccessRate = 1;
    badEmptyReport.evidenceQuality = 1;
    badEmptyReport.toolReliability = 1;
    badEmptyReport.riskCompliance = 1;
    badEmptyReport.falseConfidenceFindings = [];

    const gate = buildStabilityGateReport({
      l2Report: await l2Report(),
      emptyReport: badEmptyReport,
      generatedAt: GENERATED_AT,
    });

    expect(failingRedlineIds(gate)).toContain("empty_evidence_not_100");
  });
});
