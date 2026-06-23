import { join } from "node:path";
import {
  exportRunDebugBundle,
  readRunRecord,
  readRunStore,
  type RunRecord,
  type RunStoreError,
  type RunStoreMigrationWarning,
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
  failureCode?: string;
  nextAction?: string;
  replayFreshExecution: boolean;
}

interface RunTriageItem {
  id: string;
  status: string;
  createdAt: string;
  goal: string;
  evidenceStatus: string;
  reason: "blocking_failure" | "review_needed" | "missing_evidence" | "stale_schema";
  blocking: string[];
  failureCode?: string;
  nextAction?: string;
}

const DEFAULT_RUNS_DIR = join(KEIGENT_HOME, "runs");
const DEFAULT_WORKBENCH_URL = "http://127.0.0.1:5173";
const REPLAY_DOES_NOT_PROVE = ["Historical replay does not prove fresh execution."];
const REPLAY_NEXT_ACTION = "Run the replay command, then inspect the replay report before accepting the result.";

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
      migrationReport: store.migrationReport,
    };
    if (outputFormat.json) {
      print(options, formatJson(payload, rest));
      return;
    }
    if (payload.runs.length === 0) {
      print(options, "No run records saved");
      return;
    }
    print(options, `Runs: ${payload.runs.length}`);
    for (const run of payload.runs) print(options, humanRunListLine(run));
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
    for (const line of humanRunDetailLines(record)) print(options, line);
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
      doesNotProve: REPLAY_DOES_NOT_PROVE,
      nextAction: REPLAY_NEXT_ACTION,
    };
    if (parseJsonOutputFormat(outputArgs).json) {
      print(options, formatJson(payload, outputArgs));
      return;
    }
    for (const line of humanReplayHandoffLines(payload)) print(options, line);
    return;
  }

  if (subcommand === "triage") {
    const outputFormat = parseJsonOutputFormat(rest);
    const store = await readRunStore({ runsDir });
    const migrationWarnings = migrationWarningsByRunId(store.migrationReport.warnings);
    const runs = store.records.map((record) => runTriageItem(record, migrationWarnings.get(record.id) ?? []))
      .filter((item): item is RunTriageItem => Boolean(item));
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
    print(options, `Triage candidates: ${runs.length}`);
    for (const run of runs) {
      print(options, `- ${run.id} | ${run.reason} | ${run.status} | ${run.failureCode ?? "no failure code"}`);
      print(options, `  Blocking: ${run.blocking.join("; ") || "None"}`);
      print(options, `  Next action: ${run.nextAction ?? "Review this run before accepting it."}`);
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
  const nextAction = actionableNextAction(record);
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    goal: record.task.goal,
    profile: record.task.resolvedProfile ?? record.route.selectedProfile ?? "unknown",
    workflowMode: record.task.resolvedWorkflowMode ?? record.workflow?.mode ?? "unknown",
    evidenceStatus: record.evidence.status,
    ...(record.failures[0]?.code ? { failureCode: record.failures[0].code } : {}),
    ...(nextAction ? { nextAction } : {}),
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
  return `keigent replay ${shellQuote(trajectoryPath)}`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:.,=@%+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function humanReplayHandoffLines(payload: {
  runId: string;
  trajectoryPath: string;
  command: string;
  freshExecution: boolean;
  doesNotProve: string[];
  nextAction: string;
}): string[] {
  return [
    `Run: ${payload.runId}`,
    `Replay command: ${payload.command}`,
    `Trajectory: ${payload.trajectoryPath}`,
    `Fresh execution: ${payload.freshExecution}`,
    `Does not prove: ${payload.doesNotProve.join("; ")}`,
    `Next action: ${payload.nextAction}`,
  ];
}

function humanRunListLine(run: RunListItem): string {
  const action = run.nextAction ?? "no action";
  const failure = run.failureCode ? ` | ${run.failureCode}` : "";
  return `- ${run.id} | ${run.status} | evidence ${run.evidenceStatus}${failure} | ${action}`;
}

function humanRunDetailLines(record: RunRecord): string[] {
  const lines = [
    `Run: ${record.id}`,
    `Status: ${record.status}`,
  ];
  const failureCode = record.failures[0]?.code;
  if (failureCode) lines.push(`Failure: ${failureCode}`);
  lines.push(
    `Goal: ${record.task.goal}`,
    `Profile: ${record.task.resolvedProfile ?? record.route.selectedProfile ?? "unknown"}`,
    `Workflow: ${record.task.resolvedWorkflowMode ?? record.workflow?.mode ?? "unknown"}`,
    `Evidence: ${record.evidence.status} (${record.evidence.passed}/${record.evidence.total} passed)`,
  );
  if (record.evidence.blocking[0]) lines.push(`Blocking evidence: ${record.evidence.blocking[0]}`);
  const nextAction = actionableNextAction(record);
  if (nextAction) lines.push(`Next action: ${nextAction}`);
  if (record.automation) lines.push(`Automation scope: ${record.automation.scope}`);
  lines.push(`Workbench: ${runDetailHref(record.id)}`);
  return lines;
}

function actionableNextAction(record: RunRecord): string | undefined {
  if (record.status === "succeeded" && record.evidence.status === "passed") return undefined;
  return record.nextAction ?? record.failures[0]?.nextAction;
}

function bundleDirArg(args: string[], fallback: string): string {
  const index = args.indexOf("--out");
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function runTriageItem(record: RunRecord, schemaWarnings: RunStoreMigrationWarning[] = []): RunTriageItem | undefined {
  if (schemaWarnings.length > 0) {
    return {
      ...baseRunTriageItem(record),
      reason: "stale_schema",
      blocking: schemaWarnings.map(formatSchemaWarning),
      failureCode: "schema_warning",
      nextAction: "Review run record schema before trusting this result.",
    };
  }
  if (record.evidence.blocking.length > 0) {
    return {
      ...baseRunTriageItem(record),
      reason: "blocking_failure",
      blocking: record.evidence.blocking,
      ...(record.failures[0]?.code ? { failureCode: record.failures[0].code } : {}),
      nextAction: record.nextAction ?? record.failures[0]?.nextAction ?? "Inspect blocking evidence before retrying.",
    };
  }
  if (record.status === "failed" || record.status === "degraded" || record.status === "cancelled" || record.status === "unknown") {
    const staleSchema = record.status === "unknown";
    return {
      ...baseRunTriageItem(record),
      reason: staleSchema ? "stale_schema" : "review_needed",
      blocking: record.evidence.blocking,
      ...(record.failures[0]?.code ? { failureCode: record.failures[0].code } : {}),
      nextAction: record.nextAction ?? record.failures[0]?.nextAction ?? (
        staleSchema ? "Review run record schema before trusting this result." : "Review failed or degraded run before retrying."
      ),
    };
  }
  if (record.evidence.status === "insufficient_evidence" || record.evidence.status === "not_checked" || record.evidence.total === 0) {
    return {
      ...baseRunTriageItem(record),
      reason: "missing_evidence",
      blocking: record.evidence.blocking,
      ...(record.failures[0]?.code ? { failureCode: record.failures[0].code } : {}),
      nextAction: record.nextAction ?? "Collect evidence before treating this run as successful.",
    };
  }
  return undefined;
}

function baseRunTriageItem(record: RunRecord): Omit<RunTriageItem, "reason" | "blocking" | "nextAction"> {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    goal: record.task.goal,
    evidenceStatus: record.evidence.status,
  };
}

function migrationWarningsByRunId(warnings: RunStoreMigrationWarning[]): Map<string, RunStoreMigrationWarning[]> {
  const grouped = new Map<string, RunStoreMigrationWarning[]>();
  for (const warning of warnings) {
    const current = grouped.get(warning.runId) ?? [];
    current.push(warning);
    grouped.set(warning.runId, current);
  }
  return grouped;
}

function formatSchemaWarning(warning: RunStoreMigrationWarning): string {
  return `${warning.code}: ${warning.message}`;
}
