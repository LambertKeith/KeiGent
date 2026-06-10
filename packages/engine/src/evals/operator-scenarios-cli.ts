import {
  DEFAULT_OPERATOR_L3_CASES,
  createOperatorScenarioFixtureReviewer,
  formatOperatorAcceptancePacket,
  runOperatorScenarioEvalCases,
} from "./operator-scenarios.js";

const compact = process.argv.includes("--compact");
const packet = process.argv.includes("--packet");

try {
  const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());
  console.log(packet ? formatOperatorAcceptancePacket(report) : JSON.stringify(report, null, compact ? 0 : 2));
  if (report.totals.failed > 0 || report.findings.some((finding) => finding.severity === "blocking")) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[operator-scenario-eval] ${message}`);
  process.exitCode = 1;
}
