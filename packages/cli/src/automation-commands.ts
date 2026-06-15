import { join } from "node:path";
import {
  buildAutomationTriageReport,
  buildAutomationTriageRunRecord,
  readRunStore,
  saveRunRecord,
  saveAutomationTriageReport,
  saveAutomationTriageTrajectory,
  type AutomationTriageCandidate,
  type AutomationTriageReason,
  type AutomationTriageReport,
  type RunRecord,
  type RunStoreError,
  type RunStoreMigrationWarning,
} from "@keigent/engine";
import { KEIGENT_HOME } from "./config.js";
import { formatJson, parseJsonOutputFormat } from "./json-output.js";

export interface AutomationCommandOptions {
  runsDir?: string;
  stdout?: (line: string) => void;
}

interface LocalTriageCommandReport extends AutomationTriageReport {
  automationRecord: {
    id: string;
    status: "no_op" | "degraded";
    path: string;
    reportPath: string;
    trajectoryPath: string;
    noOpReason?: string;
    doesNotProve: string[];
  };
}

const DEFAULT_RUNS_DIR = join(KEIGENT_HOME, "runs");
const DEFAULT_TRIAGE_LIMIT = 20;

function print(options: AutomationCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

export async function runAutomationCommand(
  args: string[] = [],
  options: AutomationCommandOptions = {},
): Promise<void> {
  const [subcommand, target, ...rest] = args;
  if (subcommand === "triage" && target === "local") {
    const outputFormat = parseJsonOutputFormat(rest);
    const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;
    const limit = triageLimit(rest);
    const scope = `last ${limit} runs`;
    const store = await readRunStore({ runsDir });
    const scanned = store.records.filter((record) => !isLocalTriageAutomationRecord(record)).slice(0, limit);
    const migrationWarnings = migrationWarningsByRunId(store.migrationReport.warnings);
    const candidates = scanned.map((record) => triageCandidate(record, migrationWarnings.get(record.id) ?? []))
      .filter((item): item is AutomationTriageCandidate => Boolean(item));
    const report = buildAutomationTriageReport({
      scope,
      totalScanned: scanned.length,
      candidates,
      errors: store.errors,
    });
    const automationRecordId = automationRunId();
    const reportPath = await saveAutomationTriageReport(report, { runsDir, runId: automationRecordId });
    const trajectoryPath = await saveAutomationTriageTrajectory(report, { runsDir, runId: automationRecordId });
    const record = buildAutomationTriageRunRecord(report, { id: automationRecordId, reportPath, trajectoryPath });
    const recordPath = await saveRunRecord(record, { runsDir });
    const outputReport: LocalTriageCommandReport = {
      ...report,
      automationRecord: {
        id: record.id,
        status: record.status === "no_op" ? "no_op" : "degraded",
        path: recordPath,
        reportPath,
        trajectoryPath,
        ...(record.automation?.noOpReason ? { noOpReason: record.automation.noOpReason } : {}),
        doesNotProve: record.automation?.doesNotProve ?? [],
      },
    };

    if (outputFormat.json) {
      print(options, formatJson(outputReport, rest));
      return;
    }

    if (outputReport.status === "no_op") {
      print(options, "No triage candidates found.");
      print(options, `Status: no-op`);
      print(options, `Scope: ${scope}`);
      print(options, `Report: ${reportPath}`);
      print(options, `Does not prove: ${outputReport.automationRecord.doesNotProve.join("; ")}`);
      return;
    }

    for (const candidate of candidates) {
      print(options, `${candidate.runId}\t${candidate.status}\t${candidate.reason}\t${candidate.nextAction}`);
    }
    return;
  }

  throw new Error("Usage: keigent automation triage local [--json|--compact] [--limit N]");
}

function isLocalTriageAutomationRecord(record: RunRecord): boolean {
  return record.task.source === "automation" && record.route.ruleId === "local_run_triage";
}

function triageCandidate(record: RunRecord, schemaWarnings: RunStoreMigrationWarning[] = []): AutomationTriageCandidate | undefined {
  if (schemaWarnings.length > 0) {
    return candidate(
      record,
      "stale_schema",
      "Review run record schema before trusting this result.",
      schemaWarnings.map(formatSchemaWarning),
    );
  }

  if (record.status === "no_op" || record.status === "succeeded" && record.evidence.status === "passed") return undefined;

  if (record.status === "unknown") {
    return candidate(record, "stale_schema", "Review run record schema before trusting this result.");
  }

  if (record.evidence.blocking.length > 0) {
    return candidate(record, "blocking_failure", record.nextAction ?? "Inspect blocking evidence before retrying.");
  }

  if (record.status === "failed" || record.status === "degraded" || record.status === "cancelled") {
    return candidate(record, "review_needed", record.nextAction ?? "Review failed or degraded run before retrying.");
  }

  if (record.evidence.status === "insufficient_evidence" || record.evidence.status === "not_checked" || record.evidence.total === 0) {
    return candidate(record, "missing_evidence", record.nextAction ?? "Collect evidence before treating this run as successful.");
  }

  return undefined;
}

function candidate(
  record: RunRecord,
  reason: AutomationTriageReason,
  fallbackNextAction: string,
  schemaWarnings: string[] = [],
): AutomationTriageCandidate {
  return {
    runId: record.id,
    status: record.status,
    evidenceStatus: record.evidence.status,
    reason,
    blocking: schemaWarnings.length > 0 ? schemaWarnings : record.evidence.blocking,
    nextAction: record.nextAction ?? record.failures[0]?.nextAction ?? fallbackNextAction,
    ...(schemaWarnings.length > 0 ? { schemaWarnings } : {}),
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

function triageLimit(args: string[]): number {
  const index = args.indexOf("--limit");
  if (index === -1) return DEFAULT_TRIAGE_LIMIT;
  const raw = args[index + 1];
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TRIAGE_LIMIT;
}

function automationRunId(date = new Date()): string {
  return `automation_triage_${date.toISOString().replace(/\D/g, "").slice(0, 17)}`;
}
