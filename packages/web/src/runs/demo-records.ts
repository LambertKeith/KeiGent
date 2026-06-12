type DemoRunStatus = "succeeded" | "failed" | "degraded" | "cancelled" | "no_op";
type DemoEvidenceStatus = "passed" | "failed" | "insufficient_evidence" | "not_checked";
type DemoRiskLevel = "R0" | "R1" | "R2" | "R3" | "R4";

interface DemoFailure {
  code: string;
  layer: string;
  message: string;
  nextAction: string;
}

interface DemoProofBoundary {
  proven: string[];
  notProven: string[];
  assumptions: string[];
  evidenceGaps: string[];
}

interface DemoRunRecordInput {
  id: string;
  order: number;
  status: DemoRunStatus;
  goal: string;
  finalResponseSummary: string;
  evidenceStatus: DemoEvidenceStatus;
  evidencePassed: number;
  evidenceFailed: number;
  evidenceSources: string[];
  evidenceBlocking?: string[];
  riskLevel?: DemoRiskLevel;
  approvalRequired?: boolean;
  sideEffectsAttempted?: number;
  sideEffectsSucceeded?: number;
  replaySupported?: boolean;
  replayFreshExecution?: boolean;
  latestReplayReportId?: string;
  failures?: DemoFailure[];
  nextAction?: string;
  proofBoundary: DemoProofBoundary;
  automation?: {
    classification: string;
    scope: string;
    doesNotProve: string[];
  };
  approvals?: Array<{
    toolName: string;
    approved: boolean;
    riskLevel: DemoRiskLevel;
    permission: string;
    sideEffect: string;
    reversible: boolean;
    targetResource: string;
  }>;
  tools?: Array<{
    name: string;
    attempted: boolean;
    succeeded: boolean;
    permission: string;
    riskLevel: DemoRiskLevel;
    sideEffect: string;
    targetResource: string;
  }>;
}

const sharedBudget = {
  maxChildRuns: 1,
  maxIterationsPerRun: 3,
  maxAggregateIterations: 3,
  maxToolCallsPerRun: 5,
  maxAggregateToolCalls: 5,
  maxTokenEstimatePerRun: 8_000,
  maxAggregateTokenEstimate: 8_000,
  maxRecoveryAttemptsPerRun: 2,
  timeoutMs: 120_000,
};

function demoRunRecord(input: DemoRunRecordInput): Record<string, unknown> {
  const riskLevel = input.riskLevel ?? "R2";
  const replaySupported = input.replaySupported ?? true;
  const replayFreshExecution = input.replayFreshExecution ?? true;
  const createdAt = new Date(Date.UTC(2026, 5, 10, 0, 0, 10 - input.order)).toISOString();
  const totalEvidence = input.evidencePassed + input.evidenceFailed;
  const tools = input.tools ?? [{
    name: "fixture_tool",
    attempted: true,
    succeeded: input.status === "succeeded" || input.status === "no_op",
    permission: input.approvalRequired ? "write" : "read",
    riskLevel,
    sideEffect: input.sideEffectsAttempted ? "local" : "none",
    targetResource: `workspace:${input.id}`,
  }];
  const approvals = input.approvals ?? (input.approvalRequired
    ? [{
      toolName: tools[0]?.name ?? "fixture_tool",
      approved: input.status !== "cancelled",
      decidedAt: createdAt,
      riskLevel,
      permission: tools[0]?.permission ?? "write",
      sideEffect: tools[0]?.sideEffect ?? "local",
      reversible: true,
      targetResource: tools[0]?.targetResource ?? `workspace:${input.id}`,
    }]
    : []);

  return {
    schemaVersion: 1,
    id: input.id,
    createdAt,
    updatedAt: createdAt,
    status: input.status,
    task: {
      goal: input.goal,
      source: "eval",
      requestedProfile: "auto",
      resolvedProfile: "convergent-verified",
      requestedWorkflowMode: "verified-loop",
      resolvedWorkflowMode: "verified-loop",
      successDef: { goal: input.goal, assertionCount: Math.max(1, totalEvidence) },
    },
    route: {
      selectedProfile: "convergent-verified",
      source: "rule",
      ruleId: "real_world_fixture",
      rationale: "P0 run audit demo fixture",
      matchedSkillIds: ["checkpoint-verify"],
    },
    workflow: {
      id: `wf_${input.id}`,
      mode: "verified-loop",
      exitReason: input.status === "succeeded" || input.status === "no_op" ? "success" : "failure",
      childRuns: 1,
      budget: sharedBudget,
      budgetUsage: {
        childRuns: 1,
        iterations: input.status === "no_op" ? 1 : 2,
        toolCalls: tools.filter((tool) => tool.attempted).length,
        tokenEstimate: 320,
        recoveryAttempts: input.status === "degraded" ? 1 : 0,
        checkpointsPassed: input.evidencePassed,
        durationMs: 25,
      },
      budgetExceeded: input.id === "run_parent-timeout-child-success",
    },
    execution: {
      iterations: input.status === "no_op" ? 1 : 2,
      totalToolCalls: tools.filter((tool) => tool.attempted).length,
      successfulToolCalls: tools.filter((tool) => tool.succeeded).length,
      failedToolCalls: tools.filter((tool) => tool.attempted && !tool.succeeded).length,
      checkpointCount: totalEvidence,
      passedCheckpoints: input.evidencePassed,
      durationMs: 25,
      exitReason: input.status === "succeeded" || input.status === "no_op" ? "success" : "failure",
      finalResponseSummary: input.finalResponseSummary,
      eventCounts: { tool_call: tools.length, checkpoint: totalEvidence },
    },
    skills: [{
      name: "checkpoint-verify",
      reason: "matched real-world fixture",
      injected: true,
      riskDelta: riskLevel,
      evalCoverage: ["real-world:L2"],
    }],
    tools,
    evidence: {
      status: input.evidenceStatus,
      total: totalEvidence,
      passed: input.evidencePassed,
      failed: input.evidenceFailed,
      sources: input.evidenceSources,
      blocking: input.evidenceBlocking ?? [],
    },
    risk: {
      highestRiskLevel: riskLevel,
      permissionClassesUsed: [...new Set(tools.map((tool) => tool.permission))],
      sideEffectsAttempted: input.sideEffectsAttempted ?? tools.filter((tool) => tool.sideEffect !== "none").length,
      sideEffectsSucceeded: input.sideEffectsSucceeded ?? tools.filter((tool) => tool.sideEffect !== "none" && tool.succeeded).length,
      externalSideEffects: 0,
      irreversibleActions: 0,
      approvalRequired: input.approvalRequired === true,
    },
    approvals,
    failures: input.failures ?? [],
    artifacts: replaySupported ? [{ kind: "workflow_trajectory", path: `/tmp/${input.id}.json` }] : [],
    ...(input.automation ? { automation: input.automation } : {}),
    ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    replay: {
      supported: replaySupported,
      ...(replaySupported ? { trajectoryPath: `/tmp/${input.id}.json`, trajectorySchemaVersion: 1 } : { unsupportedReason: "Parent workflow did not finish cleanly." }),
      ...(input.latestReplayReportId ? { latestReplayReportId: input.latestReplayReportId } : {}),
      freshExecution: replayFreshExecution,
    },
    autonomy: {
      outcome: input.status === "degraded" ? "degraded_without_escalation" : "completed_without_escalation",
      repairAttempts: input.status === "degraded"
        ? [{ targetAssertion: "evidence:passed", reason: "missing evidence after success claim", attempt: 1, finalVerdict: "failed" }]
        : [],
      escalations: input.status === "cancelled"
        ? [{ reason: "permission_required", message: "Approval denied before side effect execution." }]
        : [],
    },
    proofBoundary: input.proofBoundary,
    redaction: { applied: true, rawPayloadStored: false },
  };
}

export const demoRunRecords: unknown[] = [
  demoRunRecord({
    id: "run_file-summary",
    order: 1,
    status: "succeeded",
    goal: "Summarize a local file and verify the summary artifact.",
    finalResponseSummary: "File summary created with checkpoint evidence.",
    evidenceStatus: "passed",
    evidencePassed: 1,
    evidenceFailed: 0,
    evidenceSources: ["checkpoint:file-summary"],
    proofBoundary: {
      proven: ["summary.md exists and checkpoint evidence passed."],
      notProven: ["External production health is not proven by this run."],
      assumptions: ["The fixture file content is representative only for this demo."],
      evidenceGaps: [],
    },
  }),
  demoRunRecord({
    id: "run_failed-assertion",
    order: 2,
    status: "failed",
    goal: "Write an output file and verify it exists.",
    finalResponseSummary: "Expected output file was missing.",
    evidenceStatus: "failed",
    evidencePassed: 0,
    evidenceFailed: 1,
    evidenceSources: ["checkpoint:file-exists"],
    evidenceBlocking: ["missing-output.txt was not found"],
    failures: [{
      code: "verified_failure",
      layer: "evidence",
      message: "missing-output.txt was not found",
      nextAction: "Inspect failed evidence before retrying.",
    }],
    proofBoundary: {
      proven: [],
      notProven: ["missing-output.txt was not found"],
      assumptions: ["Final response cannot prove file creation."],
      evidenceGaps: ["File existence assertion failed."],
    },
  }),
  demoRunRecord({
    id: "run_approval-denied",
    order: 3,
    status: "cancelled",
    goal: "Attempt a risky local write with approval.",
    finalResponseSummary: "Approval was denied before execution.",
    evidenceStatus: "not_checked",
    evidencePassed: 0,
    evidenceFailed: 0,
    evidenceSources: [],
    riskLevel: "R3",
    approvalRequired: true,
    sideEffectsAttempted: 0,
    sideEffectsSucceeded: 0,
    nextAction: "Review the denied approval before retrying.",
    approvals: [{
      toolName: "file_write",
      approved: false,
      riskLevel: "R3",
      permission: "write",
      sideEffect: "local",
      reversible: true,
      targetResource: "workspace:risky-write",
    }],
    tools: [{
      name: "file_write",
      attempted: false,
      succeeded: false,
      permission: "write",
      riskLevel: "R3",
      sideEffect: "local",
      targetResource: "workspace:risky-write",
    }],
    failures: [{
      code: "permission_denied",
      layer: "governance",
      message: "Approval denied before side effect execution.",
      nextAction: "Review the denied approval before retrying.",
    }],
    proofBoundary: {
      proven: ["The dangerous write was not executed."],
      notProven: ["The requested file change was not completed."],
      assumptions: ["User approval is required for R3 side effects."],
      evidenceGaps: ["No post-write evidence exists because execution was cancelled."],
    },
  }),
  demoRunRecord({
    id: "run_replay-report",
    order: 4,
    status: "succeeded",
    goal: "Review a historical replay report without claiming fresh execution.",
    finalResponseSummary: "Replay report loaded.",
    evidenceStatus: "passed",
    evidencePassed: 1,
    evidenceFailed: 0,
    evidenceSources: ["replay-report"],
    replayFreshExecution: false,
    latestReplayReportId: "replay_fixture_report",
    proofBoundary: {
      proven: ["Replay report was parsed."],
      notProven: ["Historical replay does not prove fresh execution."],
      assumptions: ["Replay artifacts were produced by a prior run."],
      evidenceGaps: [],
    },
  }),
  demoRunRecord({
    id: "run_insufficient-evidence-success-claim",
    order: 5,
    status: "degraded",
    goal: "Reject a success claim that lacks sufficient evidence.",
    finalResponseSummary: "Success claim was downgraded because evidence was insufficient.",
    evidenceStatus: "insufficient_evidence",
    evidencePassed: 0,
    evidenceFailed: 1,
    evidenceSources: ["final-response"],
    evidenceBlocking: ["Success claim did not include assertion evidence."],
    nextAction: "Collect concrete assertion evidence before accepting success.",
    failures: [{
      code: "insufficient_evidence",
      layer: "evidence",
      message: "Success claim did not include assertion evidence.",
      nextAction: "Collect concrete assertion evidence before accepting success.",
    }],
    proofBoundary: {
      proven: [],
      notProven: ["The claimed success was not proven by checkpoints."],
      assumptions: ["Final response is a communication artifact, not proof."],
      evidenceGaps: ["Success claim did not include assertion evidence."],
    },
  }),
  demoRunRecord({
    id: "run_no-op-automation",
    order: 6,
    status: "no_op",
    goal: "Classify a no-op automation result without overstating health.",
    finalResponseSummary: "Automation had no applicable change to make.",
    evidenceStatus: "passed",
    evidencePassed: 1,
    evidenceFailed: 0,
    evidenceSources: ["automation-scope"],
    nextAction: "Review automation scope before treating no-op as health.",
    automation: {
      classification: "no_op",
      scope: "fixture workspace only",
      doesNotProve: ["No hidden failures outside this scope."],
    },
    proofBoundary: {
      proven: ["No change was needed inside the declared fixture scope."],
      notProven: ["No hidden failures outside this scope."],
      assumptions: ["The automation scope is complete for the fixture only."],
      evidenceGaps: [],
    },
  }),
  demoRunRecord({
    id: "run_parent-timeout-child-success",
    order: 7,
    status: "failed",
    goal: "Do not accept child success after the parent workflow times out.",
    finalResponseSummary: "Parent workflow timed out before accepting child success.",
    evidenceStatus: "failed",
    evidencePassed: 0,
    evidenceFailed: 1,
    evidenceSources: ["workflow-budget"],
    evidenceBlocking: ["parent workflow timed out before accepting child success"],
    replaySupported: false,
    nextAction: "Rerun the parent workflow with an explicit budget decision.",
    failures: [{
      code: "parent_timeout",
      layer: "workflow",
      message: "parent workflow timed out before accepting child success",
      nextAction: "Rerun the parent workflow with an explicit budget decision.",
    }],
    proofBoundary: {
      proven: ["A child run reported success."],
      notProven: ["parent workflow timed out before accepting child success"],
      assumptions: ["Child evidence cannot override parent workflow exit state."],
      evidenceGaps: ["Parent acceptance checkpoint did not pass."],
    },
  }),
];
