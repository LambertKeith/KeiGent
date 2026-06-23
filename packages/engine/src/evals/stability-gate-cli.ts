import { runStabilityGate } from "./stability-gate.js";

const compact = process.argv.includes("--compact");

try {
  const report = await runStabilityGate();
  console.log(JSON.stringify(report, null, compact ? 0 : 2));
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[stability-gate] ${message}`);
  process.exitCode = 1;
}
