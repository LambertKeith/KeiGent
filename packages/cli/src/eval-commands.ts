import { readFile } from "node:fs/promises";
import {
  DEFAULT_EVAL_CASES,
  DEFAULT_ORCHESTRATOR_EVAL_CASES,
  createSmokeEvalExecutor,
  createTrajectoryReplayExecutorFromFiles,
  parseEvalCliArgs,
  runEvalCases,
  runOrchestratorEvalCases,
  type Trajectory,
} from "@keigent/engine";

export interface EvalCommandOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

function print(options: EvalCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

function pretty(args: string[]): number {
  return args.includes("--compact") ? 0 : 2;
}

export async function runEvalCommand(
  args: string[] = [],
  options: EvalCommandOptions = {},
): Promise<void> {
  const [subcommand = "smoke", ...rest] = args;

  if (subcommand === "orchestrator") {
    const report = runOrchestratorEvalCases(DEFAULT_ORCHESTRATOR_EVAL_CASES);
    print(options, JSON.stringify(report, null, pretty(rest)));
    if (report.failed > 0) process.exitCode = 1;
    return;
  }

  if (subcommand === "smoke") {
    const opts = parseEvalCliArgs(rest);
    const report = await runEvalCases(DEFAULT_EVAL_CASES, createSmokeEvalExecutor());
    print(options, JSON.stringify(report, null, opts.pretty ? 2 : 0));
    if (report.failed > 0) process.exitCode = 1;
    return;
  }

  if (subcommand === "replay") {
    const opts = parseEvalCliArgs(["--mode", "replay", ...rest]);
    if (Object.keys(opts.trajectories).length === 0) {
      throw new Error("replay eval requires at least one --trajectory case-id=/path/to/trajectory.json mapping");
    }
    const executor = await createTrajectoryReplayExecutorFromFiles({
      pathsByCaseId: opts.trajectories,
    });
    const evalCases = DEFAULT_EVAL_CASES.filter((evalCase) => Object.hasOwn(opts.trajectories, evalCase.id));
    const report = await runEvalCases(evalCases, executor);
    print(options, JSON.stringify(report, null, opts.pretty ? 2 : 0));
    if (report.failed > 0) process.exitCode = 1;
    return;
  }

  throw new Error("Usage: keigent eval smoke|orchestrator|replay");
}

export async function runReplayCommand(
  args: string[] = [],
  options: EvalCommandOptions = {},
): Promise<void> {
  const path = args[0];
  if (!path) throw new Error("Usage: keigent replay <trajectory.json>");

  const trajectory = JSON.parse(await readFile(path, "utf8")) as Trajectory;
  const summary = {
    replay: true,
    freshExecution: false,
    path,
    task: trajectory.task,
    profile: trajectory.profile,
    exitReason: trajectory.exitReason,
    steps: Array.isArray(trajectory.steps) ? trajectory.steps.length : 0,
    durationMs: trajectory.durationMs,
    skillsUsed: trajectory.skillsUsed ?? [],
    finalResponse: trajectory.finalResponse,
  };
  print(options, JSON.stringify(summary, null, args.includes("--compact") ? 0 : 2));
}
