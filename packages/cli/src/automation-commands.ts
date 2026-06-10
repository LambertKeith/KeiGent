import { join } from "node:path";
import {
  buildNoOpRunRecord,
  readRunStore,
  saveRunRecord,
  type RunRecord,
  type RunStoreError,
} from "@keigent/engine";
import { KEIGENT_HOME } from "./config.js";
import { formatJson, parseJsonOutputFormat } from "./json-output.js";

export interface AutomationCommandOptions {
  runsDir?: string;
  stdout?: (line: string) => void;
}

type TriageReportStatus = "no_op" | "attention_required";
type TriageReason = "blocking_failure" | "review_needed" | "missing_evidence" | "stale_schema";

interface LocalTriageCandidate {
  runId: string;
  status: string;
  evidenceStatus: string;
  reason: TriageReason;
  blocking: string[];
  nextAction: string;
}

interface LocalTriageReport {
  kind: "local-run-triage";
  status: TriageReportStatus;
  scope: string;
  totalScanned: number;
  totalCandidates: number;
  candidates: LocalTriageCandidate[];
  errors: RunStoreError[];
  automationRecord?: {
    id: string;
    status: "no_op";
    path: string;
    noOpReason: string;
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
    const scanned = store.records.slice(0, limit);
    const candidates = scanned.map(triageCandidate).filter((item): item is LocalTriageCandidate => Boolean(item));
    const report: LocalTriageReport = {
      kind: "local-run-triage",
      status: candidates.length === 0 ? "no_op" : "attention_required",
      scope,
      totalScanned: scanned.length,
      totalCandidates: candidates.length,
      candidates,
      errors: store.errors,
    };

    if (candidates.length === 0) {
      const noOpReason = "No triage candidates found.";
      const doesNotProve = ["No hidden failures outside this scope."];
      const record = buildNoOpRunRecord({
        id: automationRunId(),
        goal: "Triage local run store",
        trigger: "manual",
        scope,
        noOpReason,
        doesNotProve,
      });
      const path = await saveRunRecord(record, { runsDir });
      report.automationRecord = {
        id: record.id,
        status: "no_op",
        path,
        noOpReason,
        doesNotProve,
      };
    }

    if (outputFormat.json) {
      print(options, formatJson(report, rest));
      return;
    }

    if (report.status === "no_op") {
      print(options, "No triage candidates found.");
      print(options, `Status: no-op`);
      print(options, `Scope: ${scope}`);
      print(options, `Does not prove: ${report.automationRecord?.doesNotProve.join("; ") ?? "No hidden failures outside this scope."}`);
      return;
    }

    for (const candidate of candidates) {
      print(options, `${candidate.runId}\t${candidate.status}\t${candidate.reason}\t${candidate.nextAction}`);
    }
    return;
  }

  throw new Error("Usage: keigent automation triage local [--json|--compact] [--limit N]");
}

function triageCandidate(record: RunRecord): LocalTriageCandidate | undefined {
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

function candidate(record: RunRecord, reason: TriageReason, fallbackNextAction: string): LocalTriageCandidate {
  return {
    runId: record.id,
    status: record.status,
    evidenceStatus: record.evidence.status,
    reason,
    blocking: record.evidence.blocking,
    nextAction: record.nextAction ?? record.failures[0]?.nextAction ?? fallbackNextAction,
  };
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
