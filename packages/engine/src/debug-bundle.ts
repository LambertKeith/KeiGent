import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { redactObject, redactText } from "./redaction.js";
import type { RunArtifact, RunRecord } from "./run-record.js";

export type DebugBundleFileKind =
  | "record"
  | "trajectory"
  | "workflow_trajectory"
  | "eval_case"
  | "eval_report"
  | "replay_report"
  | "triage_report"
  | "generated_file"
  | "diff"
  | "log_excerpt"
  | "redacted_config"
  | "redaction_summary"
  | "observability_summary"
  | "tool_summary"
  | "triage_summary"
  | "failure_summary";

export interface ExportRunDebugBundleOptions {
  bundleDir: string;
  config?: Record<string, unknown>;
}

export interface DebugBundleFile {
  kind: DebugBundleFileKind;
  path: string;
  relativePath: string;
  sizeBytes: number;
}

export interface DebugBundleMissingArtifact {
  kind: RunArtifact["kind"];
  path: string;
  reason: string;
}

export interface DebugBundleExportResult {
  runId: string;
  bundleDir: string;
  files: DebugBundleFile[];
  missingArtifacts: DebugBundleMissingArtifact[];
}

export async function exportRunDebugBundle(
  record: RunRecord,
  options: ExportRunDebugBundleOptions,
): Promise<DebugBundleExportResult> {
  await mkdir(options.bundleDir, { recursive: true });
  const files: DebugBundleFile[] = [];
  const missingArtifacts: DebugBundleMissingArtifact[] = [];

  files.push(await writeJsonFile(options.bundleDir, "record.json", "record", redactObject(record)));
  files.push(await writeJsonFile(options.bundleDir, "redacted-config.json", "redacted_config", redactObject(options.config ?? {})));
  files.push(await writeJsonFile(options.bundleDir, "tool-summary.json", "tool_summary", toolSummary(record)));
  files.push(await writeJsonFile(options.bundleDir, "observability-summary.json", "observability_summary", observabilitySummary(record)));
  files.push(await writeJsonFile(options.bundleDir, "triage-summary.json", "triage_summary", triageSummary(record)));
  files.push(await writeTextFile(options.bundleDir, "failure-summary.md", "failure_summary", failureSummary(record)));

  for (const artifact of record.artifacts) {
    if (artifact.kind === "record") continue;
    const relativePath = artifactRelativePath(artifact);
    try {
      const content = await readFile(artifact.path, "utf8");
      files.push(await writeTextFile(options.bundleDir, relativePath, artifact.kind, redactText(content)));
    } catch (error) {
      missingArtifacts.push({
        kind: artifact.kind,
        path: artifact.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  files.push(await writeJsonFile(options.bundleDir, "redaction-summary.json", "redaction_summary", redactionSummary(record, {
    files,
    missingArtifacts,
  })));

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  missingArtifacts.sort((a, b) => a.path.localeCompare(b.path));
  return { runId: record.id, bundleDir: options.bundleDir, files, missingArtifacts };
}

async function writeJsonFile(
  bundleDir: string,
  relativePath: string,
  kind: DebugBundleFileKind,
  value: unknown,
): Promise<DebugBundleFile> {
  return writeTextFile(bundleDir, relativePath, kind, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextFile(
  bundleDir: string,
  relativePath: string,
  kind: DebugBundleFileKind,
  value: string,
): Promise<DebugBundleFile> {
  const path = join(bundleDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
  return {
    kind,
    path,
    relativePath,
    sizeBytes: (await stat(path)).size,
  };
}

function artifactRelativePath(artifact: RunArtifact): string {
  switch (artifact.kind) {
    case "trajectory":
      return "trajectory.json";
    case "workflow_trajectory":
      return "workflow-trajectory.json";
    case "eval_case":
      return "eval-case.json";
    case "eval_report":
      return "eval-report.json";
    case "replay_report":
      return "replay-report.json";
    case "triage_report":
      return "triage-report.json";
    case "generated_file":
    case "diff":
    case "log_excerpt":
      return join("artifacts", basename(artifact.path));
    case "record":
      return "record.json";
  }
}

function toolSummary(record: RunRecord): Record<string, unknown> {
  return redactObject({
    runId: record.id,
    totalToolCalls: record.execution.totalToolCalls,
    successfulToolCalls: record.execution.successfulToolCalls,
    failedToolCalls: record.execution.failedToolCalls,
    tools: record.tools ?? [],
    approvals: record.approvals,
  }) as Record<string, unknown>;
}

function observabilitySummary(record: RunRecord): Record<string, unknown> {
  const failureTaxonomy = new Map<string, { code: string; layer: string; count: number }>();
  for (const failure of record.failures) {
    const key = `${failure.code}:${failure.layer}`;
    const current = failureTaxonomy.get(key) ?? { code: failure.code, layer: failure.layer, count: 0 };
    current.count++;
    failureTaxonomy.set(key, current);
  }

  return redactObject({
    runId: record.id,
    status: record.status,
    workflow: record.workflow
      ? {
          id: record.workflow.id,
          mode: record.workflow.mode,
          exitReason: record.workflow.exitReason,
          childRuns: record.workflow.childRuns,
        }
      : undefined,
    timeline: Object.entries(record.execution.eventCounts).map(([event, count]) => ({ event, count })),
    budget: record.workflow
      ? {
          exceeded: record.workflow.budgetExceeded,
          usage: record.workflow.budgetUsage,
          limits: record.workflow.budget,
        }
      : undefined,
    recovery: {
      attempts: record.workflow?.budgetUsage.recoveryAttempts ?? record.execution.eventCounts["recovery"] ?? 0,
      limit: record.workflow?.budget.maxRecoveryAttemptsPerRun ?? null,
    },
    providerUsage: record.workflow?.budgetUsage.providerUsage,
    timeoutAbort: {
      timedOut: record.workflow?.exitReason === "timeout" || record.execution.exitReason === "timeout" || record.failures.some((failure) => failure.code === "timeout"),
      aborted: /aborted/i.test(record.execution.finalResponseSummary),
    },
    latency: {
      totalDurationMs: record.workflow?.budgetUsage.durationMs ?? record.execution.durationMs,
      toolLatency: { status: "not_recorded" },
      modelLatency: { status: "not_recorded" },
    },
    failureTaxonomy: [...failureTaxonomy.values()],
  }) as Record<string, unknown>;
}

function triageSummary(record: RunRecord): Record<string, unknown> {
  return redactObject({
    runId: record.id,
    status: record.status,
    task: {
      source: record.task.source,
      goal: record.task.goal,
      resolvedProfile: record.task.resolvedProfile,
      resolvedWorkflowMode: record.task.resolvedWorkflowMode,
    },
    evidenceStatus: record.evidence.status,
    blockingEvidence: record.evidence.blocking,
    failures: record.failures.map((failure) => ({
      code: failure.code,
      layer: failure.layer,
      message: failure.message,
      nextAction: failure.nextAction,
    })),
    proofBoundary: record.proofBoundary,
    automation: record.automation
      ? {
          trigger: record.automation.trigger,
          scope: record.automation.scope,
          noOpReason: record.automation.noOpReason,
          doesNotProve: record.automation.doesNotProve,
        }
      : undefined,
    replay: record.replay,
    nextAction: record.nextAction,
  }) as Record<string, unknown>;
}

function redactionSummary(
  record: RunRecord,
  input: { files: DebugBundleFile[]; missingArtifacts: DebugBundleMissingArtifact[] },
): Record<string, unknown> {
  const copiedArtifactFiles = input.files
    .filter((file) => ![
      "record",
      "redacted_config",
      "tool_summary",
      "observability_summary",
      "triage_summary",
      "failure_summary",
    ].includes(file.kind))
    .map((file) => file.relativePath);

  return redactObject({
    schemaVersion: 1,
    runId: record.id,
    applied: record.redaction.applied,
    rawPayloadStored: record.redaction.rawPayloadStored,
    rules: [
      "secret_like_keys",
      "secret_like_text",
      "user_home_path_segments",
    ],
    scopes: [
      {
        name: "record",
        redacted: true,
        files: ["record.json"],
      },
      {
        name: "config",
        redacted: true,
        files: ["redacted-config.json"],
      },
      {
        name: "generated_summaries",
        redacted: true,
        files: ["tool-summary.json", "observability-summary.json", "triage-summary.json", "failure-summary.md"],
      },
      {
        name: "artifact_copies",
        redacted: true,
        files: copiedArtifactFiles,
      },
    ],
    filesRedacted: [
      ...input.files.map((file) => file.relativePath),
      "redaction-summary.json",
    ].sort(),
    missingArtifacts: input.missingArtifacts,
    doesNotProve: [
      "Pattern-based redaction does not prove every possible PII value was detected.",
      "Debug bundle export does not prove source artifacts outside the bundle are secret-free.",
    ],
  }) as Record<string, unknown>;
}

function failureSummary(record: RunRecord): string {
  const lines = [
    "# Failure Summary",
    "",
    `Run: ${redactText(record.id)}`,
    `Status: ${record.status}`,
    `Evidence: ${record.evidence.status} (${record.evidence.passed}/${record.evidence.total} passed)`,
    "",
    "## Blocking Evidence",
    ...listOrNone(record.evidence.blocking.map((item) => redactText(item))),
    "",
    "## Failures",
    ...listOrNone(record.failures.map((failure) =>
      `${failure.code} (${failure.layer}): ${redactText(failure.message)}; next action: ${redactText(failure.nextAction)}`)),
    "",
    "## Next Action",
    record.nextAction ? redactText(record.nextAction) : "No next action recorded.",
    "",
  ];
  return lines.join("\n");
}

function listOrNone(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- none"];
}
