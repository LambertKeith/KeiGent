import { DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor, runRealWorldEvalCases } from "./real-world.js";

const compact = process.argv.includes("--compact");

try {
  const report = await runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor());
  console.log(JSON.stringify(report, null, compact ? 0 : 2));
  if (report.totals.failed > 0 || report.falseSuccessCount > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[real-world-eval] ${message}`);
  process.exitCode = 1;
}
