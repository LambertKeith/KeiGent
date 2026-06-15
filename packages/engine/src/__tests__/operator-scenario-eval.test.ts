import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATOR_L3_CASES,
  OPERATOR_L3_DATASET_ID,
  buildOperatorAcceptanceRecord,
  createOperatorScenarioFixtureReviewer,
  formatOperatorAcceptancePacket,
  runOperatorScenarioEvalCases,
} from "../evals/operator-scenarios.js";

describe("operator scenario L3 eval", () => {
  it("ships the required operator journey case set", () => {
    expect(DEFAULT_OPERATOR_L3_CASES.map((testCase) => testCase.id)).toEqual([
      "repo-acceptance",
      "failure-triage",
      "skill-promotion-review",
      "workbench-review",
      "governed-execution",
      "automation-no-op-review",
      "connector-readonly-review",
    ]);
  });

  it("builds a reviewer-facing L3 report without claiming autonomous success", async () => {
    const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());

    expect(report).toMatchObject({
      level: "L3",
      datasetId: OPERATOR_L3_DATASET_ID,
      healthClaim: "Manual-review scenario fixture, not autonomous product certification",
      totals: { total: 7, passed: 7, failed: 0 },
      decisions: { accepted: 3, deferred: 3, rejected: 1 },
    });
    expect(report.averageConfidence).toBeGreaterThan(0);
    expect(report.averageConfidence).toBeLessThanOrEqual(1);
    expect(report.falseConfidenceRiskCount).toBeGreaterThan(0);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: "fixture_level", severity: "info" }));
    expect(report.proofBoundary).toMatchObject({
      proven: expect.arrayContaining(["Deterministic L3 operator scenario fixtures were evaluated."]),
      notProven: expect.arrayContaining(["Human acceptance is not proven by fixture review."]),
      assumptions: expect.arrayContaining(["Human reviewer must inspect linked evidence before accepting any scenario."]),
    });
    expect(report.cases.find((testCase) => testCase.id === "failure-triage")).toMatchObject({
      expectedDecision: "deferred",
      proofBoundary: {
        proven: expect.arrayContaining(["Fixture decision recorded: deferred"]),
        notProven: expect.arrayContaining(["Human acceptance is not proven by fixture review."]),
        assumptions: expect.arrayContaining(["Expected operator decision: deferred"]),
        evidenceGaps: expect.arrayContaining(["Blocking issue: Failure owner needs to inspect debug bundle before retry."]),
      },
      review: {
        decision: "deferred",
        blockingIssues: expect.arrayContaining(["Failure owner needs to inspect debug bundle before retry."]),
        nextActions: expect.arrayContaining(["Open the linked debug bundle and assign an owner."]),
      },
    });
    expect(report.cases.find((testCase) => testCase.id === "connector-readonly-review")).toMatchObject({
      review: {
        decision: "accepted",
        evidenceLinks: expect.arrayContaining([expect.objectContaining({ kind: "tool", ref: "github_repo_read" })]),
      },
    });
  });

  it("uses null metrics for empty L3 datasets", async () => {
    const report = await runOperatorScenarioEvalCases([], createOperatorScenarioFixtureReviewer());

    expect(report.totals).toEqual({ total: 0, passed: 0, failed: 0 });
    expect(report.averageConfidence).toBeNull();
    expect(report.findings).toContainEqual(expect.objectContaining({ code: "empty_dataset", severity: "blocking" }));
  });

  it("formats a human acceptance packet without converting fixture results into acceptance", async () => {
    const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());

    const packet = formatOperatorAcceptancePacket(report);

    expect(packet).toContain("# L3 Operator Acceptance Packet");
    expect(packet).toContain("Dataset: operator-scenario-v1");
    expect(packet).toContain("Fixture results are not human acceptance");
    expect(packet).toContain("## Manual Sign-off");
    expect(packet).toContain("- [ ] Human reviewer name:");
    expect(packet).toContain("### repo-acceptance");
    expect(packet).toContain("Expected decision: accepted");
    expect(packet).toContain("Evidence links:");
    expect(packet).toContain("run:quality-gates");
    expect(packet).toContain("Proof boundary");
    expect(packet).toContain("Evidence inspected");
    expect(packet).toContain("Override reason");
    expect(packet).toContain("Next actions");
    expect(packet).toContain("False-confidence risks:");
    expect(packet).toContain("Branch acceptance still depends on code owner review.");
    expect(packet).toContain("- [ ] Human decision matches or overrides fixture decision");
  });

  it("turns a complete human sign-off into an auditable acceptance record", async () => {
    const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());

    const record = buildOperatorAcceptanceRecord(report, {
      datasetId: OPERATOR_L3_DATASET_ID,
      reviewerName: "Casey Reviewer",
      reviewedAt: "2026-06-10T00:00:00.000Z",
      finalDecision: "accepted",
      cases: report.cases.map((testCase) => ({
        caseId: testCase.id,
        humanDecision: testCase.expectedDecision,
        evidenceInspected: true,
        falseConfidenceRisksAccepted: true,
        notes: `Reviewed ${testCase.id}`,
      })),
    });

    expect(record).toMatchObject({
      kind: "operator-human-acceptance",
      datasetId: OPERATOR_L3_DATASET_ID,
      reviewerName: "Casey Reviewer",
      finalDecision: "accepted",
      accepted: true,
      totals: { total: 7, signedOff: 7, blockingIssues: 0 },
    });
    expect(record.issues).toEqual([]);
    expect(record.fixtureOnly).toBe(false);
    expect(record.proofBoundary).toMatchObject({
      proven: expect.arrayContaining(["Human sign-off file was validated for all L3 scenarios."]),
      notProven: expect.arrayContaining(["Sign-off validation does not prove the reviewer actually inspected evidence content."]),
      assumptions: expect.arrayContaining(["Reviewer attestations are truthful and externally accountable."]),
      evidenceGaps: expect.arrayContaining(["Blocking issue: Failure owner needs to inspect debug bundle before retry."]),
    });
    expect(record.cases.find((testCase) => testCase.caseId === "failure-triage")).toMatchObject({
      evidenceLinks: expect.arrayContaining([expect.objectContaining({ kind: "debug_bundle", ref: "run_failed_001" })]),
      falseConfidenceRisks: expect.arrayContaining(["A green retry would not explain the original failure."]),
    });
    expect(record.cases.find((testCase) => testCase.caseId === "governed-execution")).toMatchObject({
      expectedDecision: "rejected",
      humanDecision: "rejected",
      evidenceInspected: true,
    });
  });

  it("blocks acceptance when a human override lacks a reason", async () => {
    const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());

    const record = buildOperatorAcceptanceRecord(report, {
      datasetId: OPERATOR_L3_DATASET_ID,
      reviewerName: "Casey Reviewer",
      reviewedAt: "2026-06-10T00:00:00.000Z",
      finalDecision: "accepted",
      cases: report.cases.map((testCase) => ({
        caseId: testCase.id,
        humanDecision: testCase.id === "repo-acceptance" ? "rejected" : testCase.expectedDecision,
        evidenceInspected: true,
        falseConfidenceRisksAccepted: true,
      })),
    });

    expect(record.accepted).toBe(false);
    expect(record.issues).toContainEqual(expect.objectContaining({
      code: "override_missing_reason",
      severity: "blocking",
      caseId: "repo-acceptance",
    }));
  });

  it("blocks accepted sign-off when evidence was not inspected or failed evidence is overridden without reason", async () => {
    const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());

    const record = buildOperatorAcceptanceRecord(report, {
      datasetId: OPERATOR_L3_DATASET_ID,
      reviewerName: "Casey Reviewer",
      reviewedAt: "2026-06-10T00:00:00.000Z",
      finalDecision: "accepted",
      cases: report.cases.map((testCase) => ({
        caseId: testCase.id,
        humanDecision: testCase.id === "governed-execution" ? "accepted" : testCase.expectedDecision,
        evidenceInspected: testCase.id !== "repo-acceptance",
        falseConfidenceRisksAccepted: true,
      })),
    });

    expect(record.accepted).toBe(false);
    expect(record.issues).toContainEqual(expect.objectContaining({
      code: "evidence_not_inspected",
      severity: "blocking",
      caseId: "repo-acceptance",
    }));
    expect(record.issues).toContainEqual(expect.objectContaining({
      code: "override_missing_reason",
      severity: "blocking",
      caseId: "governed-execution",
    }));
  });
});
