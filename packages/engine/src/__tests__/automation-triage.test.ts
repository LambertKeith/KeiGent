import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildAutomationTriageReport,
  buildAutomationTriageRunRecord,
  saveAutomationTriageReport,
  saveAutomationTriageTrajectory,
  type AutomationTriageCandidate,
} from "../lib.js";

const candidate: AutomationTriageCandidate = {
  runId: "run_failed",
  status: "failed",
  evidenceStatus: "failed",
  reason: "blocking_failure",
  blocking: ["missing output"],
  nextAction: "Inspect the failed assertion.",
};

describe("automation triage artifacts", () => {
  it("builds attention-required reports, records, and trajectories without claiming health", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-engine-automation-triage-"));
    const report = buildAutomationTriageReport({
      scope: "last 20 runs",
      totalScanned: 2,
      candidates: [candidate],
      errors: [],
    });
    const reportPath = await saveAutomationTriageReport(report, { runsDir, runId: "automation_triage_test" });
    const trajectoryPath = await saveAutomationTriageTrajectory(report, { runsDir, runId: "automation_triage_test" });
    const record = buildAutomationTriageRunRecord(report, {
      id: "automation_triage_test",
      reportPath,
      trajectoryPath,
      createdAt: "2026-06-15T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      status: "attention_required",
      sourceRunIds: ["run_failed"],
      nextAction: "Review 1 triage candidates before retrying or accepting affected runs.",
    });
    expect(record).toMatchObject({
      id: "automation_triage_test",
      status: "degraded",
      task: { source: "automation" },
      route: { ruleId: "local_run_triage" },
      automation: {
        scope: "last 20 runs",
        sourceRunIds: ["run_failed"],
        doesNotProve: ["No hidden failures outside this scope."],
      },
      evidence: {
        status: "insufficient_evidence",
        blocking: ["run_failed: blocking_failure"],
      },
      artifacts: expect.arrayContaining([
        expect.objectContaining({ kind: "triage_report", path: expect.stringContaining("triage-report.json") }),
        expect.objectContaining({ kind: "trajectory", path: expect.stringContaining("trajectory.json") }),
      ]),
      replay: {
        supported: false,
        freshExecution: true,
      },
      proofBoundary: {
        notProven: expect.arrayContaining(["No hidden failures outside this scope."]),
        evidenceGaps: ["run_failed: blocking_failure"],
      },
    });
    await expect(readFile(reportPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      status: "attention_required",
      sourceRunIds: ["run_failed"],
    });
    await expect(readFile(trajectoryPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      schemaVersion: 1,
      kind: "automation-triage",
      runId: "automation_triage_test",
      status: "attention_required",
      sourceRunIds: ["run_failed"],
      steps: expect.arrayContaining([
        expect.objectContaining({ kind: "candidate", runId: "run_failed", reason: "blocking_failure" }),
      ]),
    });
  });

  it("builds no-op reports with an explicit scope boundary", () => {
    const report = buildAutomationTriageReport({
      scope: "last 20 runs",
      totalScanned: 0,
      candidates: [],
      errors: [],
    });
    const record = buildAutomationTriageRunRecord(report, {
      id: "automation_triage_noop",
      reportPath: "/tmp/triage-report.json",
      trajectoryPath: "/tmp/trajectory.json",
      createdAt: "2026-06-15T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      status: "no_op",
      sourceRunIds: [],
      nextAction: "Review automation scope before treating no-op as health.",
    });
    expect(record).toMatchObject({
      status: "no_op",
      automation: {
        noOpReason: "No triage candidates found.",
        sourceRunIds: [],
        doesNotProve: ["No hidden failures outside this scope."],
      },
      proofBoundary: {
        notProven: expect.arrayContaining(["No hidden failures outside this scope."]),
      },
    });
  });
});
