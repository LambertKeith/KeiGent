import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Learner, WorkflowResult } from "@keigent/engine";
import type { KeigentConfig } from "../config.js";
import { runEvalCommand } from "../eval-commands.js";
import { persistWorkflowAndLearn } from "../post-run.js";
import { createWebApiServer } from "../web-api-server.js";

interface WebRunDetailView {
  summary: { id: string };
  route: { selectedProfile: string };
  evidence: { status: string };
  proofBoundary: { proven: string[]; notProven: string[]; assumptions: string[] };
  autonomy: { outcome: string; repairAttempts: unknown[]; escalations: unknown[] };
  replay: { supported: boolean; freshExecution: boolean };
  nextAction: { required: boolean; label: string };
}

interface WebWorkbenchModule {
  buildRunWorkbenchView(records: unknown[], selectedRunId?: string): unknown;
  renderRunWorkbench(view: unknown): string;
}

interface WebDashboardModule {
  normalizeRealWorldEvalReport(report: unknown): {
    cases: Array<{ id: string; runId: string; runDetailHref: string }>;
  };
}

interface WebModelModule {
  normalizeRunRecord(input: unknown): WebRunDetailView;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolveClose) => server.close(() => resolveClose()))));
  servers.length = 0;
});

describe("CLI to Web Workbench product E2E", () => {
  it("serves a persisted CLI RunRecord through the Web API and renders audit panels", async () => {
    const home = await mkdtemp(join(tmpdir(), "keigent-product-e2e-"));
    const runsDir = join(home, "runs");
    const config = testConfig(home);
    const workflow = fixtureWorkflowResultWithEvidenceAndProof();
    const learner = {
      learn: vi.fn(async () => ({ trajectoryId: "learn_fixture", patches: [], summary: "not needed", writtenTo: [] })),
    } as unknown as Learner;

    const persisted = await persistWorkflowAndLearn(workflow, config, learner, new Map(), {
      taskSource: "cli",
      silent: true,
      runsDir,
    });
    const baseUrl = await serve(createWebApiServer({ runsDir }));
    const store = await fetchJson(`${baseUrl}/api/runs`) as { records: unknown[] };
    const { normalizeRunRecord } = await loadWebModelModule();
    const { buildRunWorkbenchView, renderRunWorkbench } = await loadWebWorkbenchModule();
    const view = normalizeRunRecord(store.records[0]);
    const html = renderRunWorkbench(buildRunWorkbenchView(store.records, persisted.record.id));

    expect(store.records).toHaveLength(1);
    expect(view.summary.id).toBe(persisted.record.id);
    expect(view.route.selectedProfile).toBe("convergent-verified");
    expect(view.evidence.status).toBe("passed");
    expect(view.proofBoundary.proven.length).toBeGreaterThan(0);
    expect(view.proofBoundary.notProven).toContain("External production health is not proven by this run.");
    expect(view.proofBoundary.assumptions.length).toBeGreaterThan(0);
    expect(view.autonomy.outcome).toBe("self_repaired");
    expect(view.autonomy.repairAttempts).toHaveLength(1);
    expect(view.replay.supported).toBe(true);
    expect(view.nextAction).toEqual({ required: false, label: "No action required" });
    expect(html).toContain("Proof boundary");
    expect(html).toContain("Autonomy");
    expect(html).toContain("Repair attempts");
    expect(html).toContain("Next action");
    expect(html).toContain("No action required");
  });

  it("persists real-world eval case records so Workbench deep links resolve to Run Detail", async () => {
    const home = await mkdtemp(join(tmpdir(), "keigent-eval-product-e2e-"));
    const runsDir = join(home, "runs");
    const output: string[] = [];

    await runEvalCommand(["real-world", "--compact", "--open"], {
      runsDir,
      stdout: (line) => output.push(line),
    });

    const report = JSON.parse(output[0]!) as {
      workbenchHref: string;
      persistedRunRecords: { total: number; runIds: string[] };
    };
    const reportObject = report as unknown as { cases: unknown[] };
    const baseUrl = await serve(createWebApiServer({ runsDir }));
    const store = await fetchJson(`${baseUrl}/api/runs`) as { records: unknown[] };
    const latestReport = await fetchJson(`${baseUrl}/api/evals/real-world/local-real-task-v1/latest`);
    const { normalizeRunRecord } = await loadWebModelModule();
    const { buildRunWorkbenchView, renderRunWorkbench } = await loadWebWorkbenchModule();
    const { normalizeRealWorldEvalReport } = await loadWebDashboardModule();
    const dashboard = normalizeRealWorldEvalReport(latestReport);
    const persistedIds = new Set(report.persistedRunRecords.runIds);
    const insufficientEvidenceCase = dashboard.cases.find((testCase) => testCase.id === "insufficient-evidence-success-claim");
    const replayView = normalizeRunRecord(store.records.find((record) =>
      typeof record === "object" && record !== null && "id" in record && record.id === "run_replay-report"));
    const replayHtml = renderRunWorkbench(buildRunWorkbenchView(store.records, "run_replay-report"));
    const noOpHtml = renderRunWorkbench(buildRunWorkbenchView(store.records, "run_no-op-automation"));

    expect(report).toMatchObject({
      workbenchHref: "http://127.0.0.1:5173/#eval/real-world/local-real-task-v1",
      persistedRunRecords: { total: 20 },
    });
    expect(report.persistedRunRecords.runIds).toContain("run_replay-report");
    expect(store.records).toHaveLength(20);
    expect(latestReport).toMatchObject({
      datasetId: "local-real-task-v1",
      cases: expect.arrayContaining([
        expect.objectContaining({ runId: "run_replay-report" }),
      ]),
    });
    expect(reportObject.cases.length).toBe(dashboard.cases.length);
    expect(insufficientEvidenceCase).toMatchObject({
      runId: "run_insufficient-evidence-success-claim",
      runDetailHref: "#runs/run_insufficient-evidence-success-claim",
    });
    expect(dashboard.cases.every((testCase) => persistedIds.has(testCase.runId))).toBe(true);
    expect(replayView.summary.id).toBe("run_replay-report");
    expect(replayView.replay.freshExecution).toBe(false);
    expect(replayHtml).toContain("Replay report, not fresh execution");
    expect(noOpHtml).toContain("No hidden failures outside this scope.");
  });
});

async function serve(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return await response.json();
}

async function loadWebModelModule(): Promise<WebModelModule> {
  return await importWebModule<WebModelModule>("runs/model.ts");
}

async function loadWebWorkbenchModule(): Promise<WebWorkbenchModule> {
  return await importWebModule<WebWorkbenchModule>("runs/workbench.ts");
}

async function loadWebDashboardModule(): Promise<WebDashboardModule> {
  return await importWebModule<WebDashboardModule>("dashboard/report-model.ts");
}

async function importWebModule<T>(relativePath: string): Promise<T> {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const modulePath = resolve(testDir, "../../../web/src", relativePath);
  return await import(pathToFileURL(modulePath).href) as T;
}

function testConfig(home: string): KeigentConfig {
  return {
    configVersion: 1,
    apiKey: "test-key",
    apiProtocol: "openai",
    baseUrl: "https://example.invalid/v1",
    modelId: "test-model",
    workspace: join(home, "workspace"),
    skillsDir: join(home, "skills"),
    memoryDir: join(home, "memory"),
    headless: true,
    maxIterations: 3,
    maxChildRuns: 1,
    maxToolCalls: 5,
    maxTokenEstimate: 8_000,
    maxProviderCostUsd: null,
    modelPricing: null,
    modelCapabilities: {
      toolCalling: true,
      streaming: true,
      jsonMode: false,
      vision: false,
      maxContextTokens: 128_000,
      parallelToolCalls: false,
    },
    maxWallTimeMs: 120_000,
    maxRecoveryAttempts: 2,
  };
}

function fixtureWorkflowResultWithEvidenceAndProof(): WorkflowResult {
  const task = {
    goal: "Verify the release checklist",
    profile: "auto",
    successDef: {
      goal: "Release checklist evidence is present",
      assertions: [{ kind: "checkpointPassed" as const, minCount: 1 }],
    },
  };
  const approval = {
    approved: true,
    decidedAt: "2026-06-10T00:00:01.000Z",
    request: {
      toolName: "shell",
      args: { command: "corepack pnpm -r check" },
      permission: "execute" as const,
      riskLevel: "R3" as const,
      sideEffect: "local" as const,
      reversible: true,
      action: "run local checks",
      targetResource: "workspace:quality-gates",
      evidenceRequired: ["checkpointPassed"],
      exposesSecrets: false,
    },
  };
  const workerTrajectory = {
    task,
    profile: "convergent-verified",
    exitReason: "success" as const,
    steps: [
      {
        iteration: 0,
        kind: "skill_match" as const,
        skillMatches: [{
          name: "release-checklist",
          status: "verified" as const,
          score: 10,
          signals: ["tag:release"],
          matched: true,
          injected: true,
          evalCoverage: ["real-world:release-checklist"],
        }],
      },
      { iteration: 1, kind: "approval" as const, approval },
      {
        iteration: 1,
        kind: "tool_call" as const,
        toolName: "shell",
        toolArgs: { command: "corepack pnpm -r check" },
        toolResult: "all checks passed",
        toolSucceeded: true,
      },
      {
        iteration: 2,
        kind: "recovery" as const,
        recovery: { decision: "repair" as const, hint: "rerun failed assertion after adding evidence", reason: "missing checkpoint evidence" },
      },
      {
        iteration: 3,
        kind: "checkpoint" as const,
        checkpointDesc: "release evidence exists",
        snapshot: { raw: { report: "quality gates passed" } },
        verdictPassed: true,
        verdictEvidence: "quality gates passed",
      },
    ],
    finalResponse: "Release checklist evidence verified.",
    durationMs: 30,
    skillsUsed: ["release-checklist"],
  };
  const workerResult = {
    exitReason: "success" as const,
    finalResponse: workerTrajectory.finalResponse,
    iterations: 3,
    checkpointsPassed: 1,
    totalToolCalls: 1,
    trajectory: workerTrajectory,
  };
  const autonomy = {
    outcome: "self_repaired" as const,
    repairAttempts: [{
      targetAssertion: "checkpointPassed:minCount=1",
      reason: "missing checkpoint evidence",
      attempt: 1,
      finalVerdict: "passed" as const,
    }],
    escalations: [],
  };
  const budget = {
    maxChildRuns: 1,
    maxIterationsPerRun: 4,
    maxAggregateIterations: 4,
    maxToolCallsPerRun: 5,
    maxAggregateToolCalls: 5,
    maxTokenEstimatePerRun: 8_000,
    maxAggregateTokenEstimate: 8_000,
    maxRecoveryAttemptsPerRun: 2,
    timeoutMs: 120_000,
  };
  const budgetUsage = {
    childRuns: 1,
    iterations: 3,
    toolCalls: 1,
    tokenEstimate: 400,
    recoveryAttempts: 1,
    checkpointsPassed: 1,
    durationMs: 30,
  };
  const evidence = [
    { kind: "checkpoint" as const, passed: true, message: "quality gates passed", sourceChildRunId: "wf_product_e2e:worker-1" },
  ];
  const events = [
    { kind: "workflow_start" as const, workflowId: "wf_product_e2e", mode: "verified-loop" as const, goal: task.goal },
    { kind: "child_start" as const, workflowId: "wf_product_e2e", childRunId: "wf_product_e2e:worker-1", role: "worker" as const },
    {
      kind: "child_event" as const,
      workflowId: "wf_product_e2e",
      childRunId: "wf_product_e2e:worker-1",
      event: {
        kind: "profile_selected" as const,
        profile: "convergent-verified",
        via: "rule" as const,
        ruleId: "verified_goal",
        rationale: "success definition requires checkpoint evidence",
        signals: ["successDef"],
      },
    },
    { kind: "child_done" as const, workflowId: "wf_product_e2e", childRunId: "wf_product_e2e:worker-1", exitReason: "success" as const },
    { kind: "workflow_verdict" as const, workflowId: "wf_product_e2e", passed: true, evidence },
    { kind: "workflow_done" as const, workflowId: "wf_product_e2e", exitReason: "success" as const },
  ];

  return {
    workflowId: "wf_product_e2e",
    mode: "verified-loop",
    exitReason: "success",
    finalResponse: workerResult.finalResponse,
    childRuns: [{ id: "wf_product_e2e:worker-1", role: "worker", result: workerResult, trajectory: workerTrajectory }],
    evidence,
    budget,
    budgetUsage,
    autonomy,
    durationMs: 30,
    trajectory: {
      schemaVersion: 1,
      workflowId: "wf_product_e2e",
      mode: "verified-loop",
      goal: task.goal,
      rootTask: task,
      startedAt: "2026-06-10T00:00:00.000Z",
      durationMs: 30,
      exitReason: "success",
      finalResponse: workerResult.finalResponse,
      budget,
      budgetUsage,
      autonomy,
      evidence,
      events,
      childRuns: [{ id: "wf_product_e2e:worker-1", role: "worker", result: workerResult, trajectory: workerTrajectory }],
    },
  };
}
