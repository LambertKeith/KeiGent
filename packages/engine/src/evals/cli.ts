import { DEFAULT_EVAL_CASES, createSmokeEvalExecutor } from "./cases.js";
import { parseEvalCliArgs } from "./cli-options.js";
import { createTrajectoryReplayExecutorFromFiles } from "./replay.js";
import { runEvalCases } from "./runner.js";

try {
  const opts = parseEvalCliArgs(process.argv.slice(2));
  if (opts.mode === "replay" && Object.keys(opts.trajectories).length === 0) {
    throw new Error("replay mode requires at least one --trajectory case-id=/path/to/trajectory.json mapping");
  }

  const executor = opts.mode === "smoke"
    ? createSmokeEvalExecutor()
    : await createTrajectoryReplayExecutorFromFiles({ pathsByCaseId: opts.trajectories });

  const evalCases = opts.mode === "smoke"
    ? DEFAULT_EVAL_CASES
    : DEFAULT_EVAL_CASES.filter((evalCase) => Object.hasOwn(opts.trajectories, evalCase.id));

  const report = await runEvalCases(evalCases, executor);
  console.log(JSON.stringify(report, null, opts.pretty ? 2 : 0));

  if (report.failed > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[eval] ${message}`);
  process.exitCode = 1;
}
