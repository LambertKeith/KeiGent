import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_EVAL_CASES,
  DEFAULT_ORCHESTRATOR_EVAL_CASES,
  DEFAULT_OPERATOR_L3_CASES,
  DEFAULT_REAL_WORLD_L2_CASES,
  buildOperatorAcceptanceRecord,
  createSmokeEvalExecutor,
  createOperatorScenarioFixtureReviewer,
  createRealWorldFixtureExecutor,
  createTrajectoryReplayExecutorFromFiles,
  formatOperatorAcceptancePacket,
  parseEvalCliArgs,
  runEvalCases,
  runOperatorScenarioEvalCases,
  runOrchestratorEvalCases,
  runRealWorldEvalCases,
  saveRunRecord,
  type OperatorAcceptanceSignoff,
  type RealWorldEvalReport,
  type RunRecord,
  type Trajectory,
} from "@keigent/engine";
import { KEIGENT_HOME } from "./config.js";
import { formatJson } from "./json-output.js";

export interface EvalCommandOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  runsDir?: string;
}

function print(options: EvalCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

interface ReplayCommandArgs {
  path: string;
  outputArgs: string[];
}

interface OperatorCommandArgs {
  outputArgs: string[];
  packet: boolean;
  acceptancePath?: string;
}

const DEFAULT_WORKBENCH_URL = "http://127.0.0.1:5173";
const DEFAULT_RUNS_DIR = join(KEIGENT_HOME, "runs");
const DEFAULT_EVAL_REPORTS_DIR = join(KEIGENT_HOME, "evals");

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

function parseOperatorCommandArgs(args: string[]): OperatorCommandArgs {
  const outputArgs: string[] = [];
  let packet = false;
  let acceptancePath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json" || arg === "--compact" || arg === "--pretty") {
      outputArgs.push(arg);
      continue;
    }
    if (arg === "--packet") {
      packet = true;
      continue;
    }
    if (arg === "--acceptance") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--acceptance requires a JSON file path");
      acceptancePath = value;
      i++;
      continue;
    }
    throw new Error(`unknown operator eval option ${arg}`);
  }

  return { outputArgs, packet, acceptancePath };
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
    const realWorldArgs = parseRealWorldCommandArgs(rest);
    const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;
    const evalReportsDir = evalReportsDirForRunsDir(runsDir);
    const persistedRunRecords = realWorldArgs.persistRuns
      ? await persistEvalRunRecords(report.cases.map((testCase) => testCase.runRecord), runsDir)
      : undefined;
    const persistedEvalReport = realWorldArgs.persistRuns
      ? await persistRealWorldEvalReport(report, evalReportsDir)
      : undefined;
    const payload = realWorldArgs.open
      ? {
        ...report,
        workbenchHref: realWorldEvalHref(report.datasetId),
        ...(persistedRunRecords ? { persistedRunRecords } : {}),
        ...(persistedEvalReport ? { persistedEvalReport } : {}),
      }
      : persistedRunRecords ? { ...report, persistedRunRecords, ...(persistedEvalReport ? { persistedEvalReport } : {}) } : report;
    const outputArgs = realWorldArgs.outputArgs;
    print(options, formatJson(payload, outputArgs));
    if (report.totals.failed > 0 || report.falseSuccessCount > 0) process.exitCode = 1;
    return;
  }

  if (subcommand === "operator") {
    const operatorArgs = parseOperatorCommandArgs(rest);
    const report = await runOperatorScenarioEvalCases(DEFAULT_OPERATOR_L3_CASES, createOperatorScenarioFixtureReviewer());
    if (operatorArgs.acceptancePath) {
      const signoff = JSON.parse(await readFile(operatorArgs.acceptancePath, "utf8")) as OperatorAcceptanceSignoff;
      const record = buildOperatorAcceptanceRecord(report, signoff);
      print(options, formatJson(record, operatorArgs.outputArgs));
      if (!record.accepted) process.exitCode = 1;
      return;
    }
    print(options, operatorArgs.packet ? formatOperatorAcceptancePacket(report) : formatJson(report, operatorArgs.outputArgs));
    if (report.totals.failed > 0 || report.findings.some((finding) => finding.severity === "blocking")) process.exitCode = 1;
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

  throw new Error("Usage: keigent eval smoke|orchestrator|real-world|operator|replay");
}

interface RealWorldCommandArgs {
  outputArgs: string[];
  open: boolean;
  persistRuns: boolean;
}

function parseRealWorldCommandArgs(args: string[]): RealWorldCommandArgs {
  const outputArgs: string[] = [];
  let open = false;
  let persistRuns = false;

  for (const arg of args) {
    if (arg === "--json" || arg === "--compact" || arg === "--pretty") {
      outputArgs.push(arg);
      continue;
    }
    if (arg === "--open") {
      open = true;
      persistRuns = true;
      continue;
    }
    if (arg === "--persist-runs") {
      persistRuns = true;
      continue;
    }
    throw new Error(`unknown real-world eval option ${arg}`);
  }

  return { outputArgs, open, persistRuns };
}

async function persistEvalRunRecords(records: RunRecord[], runsDir: string): Promise<{ total: number; runsDir: string; runIds: string[] }> {
  const runIds: string[] = [];
  for (const record of records) {
    await saveRunRecord(record, { runsDir });
    runIds.push(record.id);
  }
  return { total: runIds.length, runsDir, runIds };
}

async function persistRealWorldEvalReport(report: RealWorldEvalReport, evalReportsDir: string): Promise<{ datasetId: string; path: string }> {
  const reportDir = join(evalReportsDir, "real-world", report.datasetId);
  await mkdir(reportDir, { recursive: true });
  const path = join(reportDir, "latest.json");
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { datasetId: report.datasetId, path };
}

function evalReportsDirForRunsDir(runsDir: string): string {
  return runsDir === DEFAULT_RUNS_DIR ? DEFAULT_EVAL_REPORTS_DIR : join(runsDir, "..", "evals");
}

function realWorldEvalHref(datasetId: string, baseUrl = DEFAULT_WORKBENCH_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/#eval/real-world/${encodeURIComponent(datasetId)}`;
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
