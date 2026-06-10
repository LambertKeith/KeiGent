import { join } from "node:path";
import {
  exportRunDebugBundle,
  readRunRecord,
  readRunStore,
  type RunRecord,
  type RunStoreError,
} from "@keigent/engine";
import { KEIGENT_HOME } from "./config.js";
import { formatJson, parseJsonOutputFormat } from "./json-output.js";

export interface RunsCommandOptions {
  runsDir?: string;
  stdout?: (line: string) => void;
}

interface RunListItem {
  id: string;
  status: string;
  createdAt: string;
  goal: string;
  profile: string;
  workflowMode: string;
  evidenceStatus: string;
  replayFreshExecution: boolean;
}

interface RunTriageItem {
  id: string;
  status: string;
  createdAt: string;
  goal: string;
  evidenceStatus: string;
  blocking: string[];
  nextAction?: string;
}

const DEFAULT_RUNS_DIR = join(KEIGENT_HOME, "runs");
const DEFAULT_WORKBENCH_URL = "http://127.0.0.1:5173";

function print(options: RunsCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

export async function runRunsCommand(
  args: string[] = [],
  options: RunsCommandOptions = {},
): Promise<void> {
  const [subcommand = "list", ...rest] = args;
  const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;

  if (subcommand === "list") {
    const outputFormat = parseJsonOutputFormat(rest);
    const store = await readRunStore({ runsDir });
    const payload = {
      total: store.records.length,
      runs: store.records.map(runListItem),
      errors: store.errors.map(runStoreError),
    };
    if (outputFormat.json) {
      print(options, formatJson(payload, rest));
      return;
    }
    if (payload.runs.length === 0) {
      print(options, "No run records saved");
      return;
    }
    for (const run of payload.runs) {
      print(options, `${run.id}\t${run.status}\t${run.evidenceStatus}\t${run.goal}`);
    }
    return;
  }

  if (subcommand === "show") {
    const runId = runIdArg(rest, "Usage: keigent runs show <run-id> [--json|--compact]");
    const outputArgs = outputArgsFor(rest);
    const record = await readRecordById(runsDir, runId);
    const outputFormat = parseJsonOutputFormat(outputArgs);
    if (outputFormat.json) {
      print(options, formatJson(record, outputArgs));
      return;
    }
    print(options, `${record.id}\t${record.status}\t${record.task.goal}`);
    if (record.nextAction) print(options, `Next action: ${record.nextAction}`);
    if (record.automation) print(options, `Automation scope: ${record.automation.scope}`);
    return;
  }

  if (subcommand === "open") {
    const runId = runIdArg(rest, "Usage: keigent runs open <run-id> [--json|--compact]");
    const outputArgs = outputArgsFor(rest);
    const record = await readRecordById(runsDir, runId);
    const payload = {
      runId: record.id,
      runDetailHref: runDetailHref(record.id),
    };
    if (parseJsonOutputFormat(outputArgs).json) {
      print(options, formatJson(payload, outputArgs));
      return;
    }
    print(options, payload.runDetailHref);
    return;
  }

  if (subcommand === "replay") {
    const runId = runIdArg(rest, "Usage: keigent runs replay <run-id> [--json|--compact]");
    const outputArgs = outputArgsFor(rest);
    const record = await readRecordById(runsDir, runId);
    if (!record.replay.supported || !record.replay.trajectoryPath) {
      throw new Error(`run ${record.id} has no replay trajectory`);
    }
    const payload = {
      runId: record.id,
      trajectoryPath: record.replay.trajectoryPath,
      command: replayCommand(record.replay.trajectoryPath),
      freshExecution: false,
    };
    if (parseJsonOutputFormat(outputArgs).json) {
      print(options, formatJson(payload, outputArgs));
      return;
    }
    print(options, payload.command);
    return;
  }

  if (subcommand === "triage") {
    const outputFormat = parseJsonOutputFormat(rest);
    const store = await readRunStore({ runsDir });
    const runs = store.records.filter(isTriageCandidate).map(runTriageItem);
    const payload = {
      total: runs.length,
      runs,
      errors: store.errors.map(runStoreError),
    };
    if (outputFormat.json) {
      print(options, formatJson(payload, rest));
      return;
    }
    if (runs.length === 0) {
      print(options, "No triage candidates found");
      return;
    }
    for (const run of runs) {
      const detail = run.nextAction ?? run.blocking.join("; ") ?? "";
      print(options, `${run.id}\t${run.status}\t${run.evidenceStatus}\t${detail}`);
    }
    return;
  }

  if (subcommand === "debug-bundle") {
    const runId = runIdArg(rest, "Usage: keigent runs debug-bundle <run-id> [--out DIR] [--json|--compact]");
    const outputArgs = outputArgsFor(rest);
    const record = await readRecordById(runsDir, runId);
    const result = await exportRunDebugBundle(record, {
      bundleDir: bundleDirArg(rest, join(runsDir, record.id, "debug-bundle")),
    });
    if (parseJsonOutputFormat(outputArgs).json) {
      print(options, formatJson(result, outputArgs));
      return;
    }
    print(options, `Debug bundle: ${result.bundleDir}`);
    return;
  }

  throw new Error("Usage: keigent runs list|show|open|replay|triage|debug-bundle");
}

function runListItem(record: RunRecord): RunListItem {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    goal: record.task.goal,
    profile: record.task.resolvedProfile ?? record.route.selectedProfile ?? "unknown",
    workflowMode: record.task.resolvedWorkflowMode ?? record.workflow?.mode ?? "unknown",
    evidenceStatus: record.evidence.status,
    replayFreshExecution: record.replay.freshExecution,
  };
}

function runStoreError(error: RunStoreError): RunStoreError {
  return error;
}

function outputArgsFor(args: string[]): string[] {
  return args.filter((arg) => arg.startsWith("--"));
}

function runIdArg(args: string[], usage: string): string {
  const runId = args.find((arg) => !arg.startsWith("--"));
  if (!runId) throw new Error(usage);
  return runId;
}

async function readRecordById(runsDir: string, runId: string): Promise<RunRecord> {
  return readRunRecord(join(runsDir, runId, "record.json"));
}

function runDetailHref(runId: string, baseUrl = DEFAULT_WORKBENCH_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/#runs/${encodeURIComponent(runId)}`;
}

function replayCommand(trajectoryPath: string): string {
  return `keigent replay ${trajectoryPath}`;
}

function bundleDirArg(args: string[], fallback: string): string {
  const index = args.indexOf("--out");
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function isTriageCandidate(record: RunRecord): boolean {
  return record.status !== "succeeded";
}

function runTriageItem(record: RunRecord): RunTriageItem {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    goal: record.task.goal,
    evidenceStatus: record.evidence.status,
    blocking: record.evidence.blocking,
    nextAction: record.nextAction,
  };
}
