import { DEFAULT_ORCHESTRATOR_EVAL_CASES, runOrchestratorEvalCases } from "./orchestrator-eval.js";

const report = runOrchestratorEvalCases(DEFAULT_ORCHESTRATOR_EVAL_CASES);
console.log(JSON.stringify(report, null, 2));

if (report.failed > 0) {
  process.exitCode = 1;
}
