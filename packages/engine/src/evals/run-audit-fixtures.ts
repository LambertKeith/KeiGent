import type { RunRecord } from "../run-record.js";
import { DEFAULT_REAL_WORLD_L2_CASES, fixtureExecutionFor } from "./real-world.js";

export const P0_RUN_AUDIT_CASE_IDS = [
  "file-summary",
  "failed-assertion",
  "approval-denied",
  "replay-report",
  "insufficient-evidence-success-claim",
  "no-op-automation",
  "parent-timeout-child-success",
] as const;

export function buildP0RunAuditFixtureRecords(): RunRecord[] {
  return P0_RUN_AUDIT_CASE_IDS.map((caseId) => {
    const testCase = DEFAULT_REAL_WORLD_L2_CASES.find((item) => item.id === caseId);
    if (!testCase) throw new Error(`missing P0 run audit fixture case ${caseId}`);
    return fixtureExecutionFor(testCase).runRecord;
  });
}
