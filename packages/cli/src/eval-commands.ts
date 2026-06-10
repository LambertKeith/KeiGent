import { readFile } from "node:fs/promises";
import {
  DEFAULT_EVAL_CASES,
  DEFAULT_ORCHESTRATOR_EVAL_CASES,
  DEFAULT_REAL_WORLD_L2_CASES,
  createSmokeEvalExecutor,
  createRealWorldFixtureExecutor,
  createTrajectoryReplayExecutorFromFiles,
  parseEvalCliArgs,
  runEvalCases,
  runOrchestratorEvalCases,
  runRealWorldEvalCases,
  type Trajectory,
} from "@keigent/engine";
import { formatJson } from "./json-output.js";

export interface EvalCommandOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

function print(options: EvalCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

interface ReplayCommandArgs {
  path: string;
  outputArgs: string[];
}

function parseReplayCommandArgs(args: string[]): ReplayCommandArgs {
  const outputArgs: string[] = [];
  let path: string | undefined;

  for (const arg of args) {
    if (arg === "--json" || arg === "--compact" || arg === "--pretty") {
      outputArgs.push(arg);
      continue;
    }
    if (arg === "--") continue;
    if (arg.startsWith("--")) throw new Error(`unknown replay option ${arg}`);
    if (path) throw new Error(`unexpected replay argument ${arg}`);
    path = arg;
  }

  if (!path) throw new Error("Usage: keigent replay <trajectory.json>");
  return { path, outputArgs };
}

export async function runEvalCommand(
  args: string[] = [],
  options: EvalCommandOptions = {},
): Promise<void> {
  const [subcommand = "smoke", ...rest] = args;

  if (subcommand === "orchestrator") {
    const report = runOrchestratorEvalCases(DEFAULT_ORCHESTRATOR_EVAL_CASES);
    print(options, formatJson(report, rest));
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

  if (subcommand === "real-world") {
    const report = await runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, createRealWorldFixtureExecutor());
    print(options, formatJson(report, rest));
    if (report.totals.failed > 0 || report.falseSuccessCount > 0) process.exitCode = 1;
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

  throw new Error("Usage: keigent eval smoke|orchestrator|real-world|replay");
}

export async function runReplayCommand(
  args: string[] = [],
  options: EvalCommandOptions = {},
): Promise<void> {
  const { path, outputArgs } = parseReplayCommandArgs(args);

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
  print(options, formatJson(summary, outputArgs));
}
