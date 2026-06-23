import { describe, expect, it } from "vitest";
import * as api from "../lib.js";
import type {
  CheckpointEvidence,
  EvidenceBundle,
  EvalReport,
  FailureSummary,
  ToolCallEvidence,
  WorkflowPolicy,
} from "../lib.js";

const _typedPublicApiSmoke: {
  bundle: EvidenceBundle | null;
  tool: ToolCallEvidence | null;
  checkpoint: CheckpointEvidence | null;
  evalReport: EvalReport | null;
  failure: FailureSummary | null;
  policy: WorkflowPolicy | null;
} = {
  bundle: null,
  tool: null,
  checkpoint: null,
  evalReport: null,
  failure: null,
  policy: null,
};

void _typedPublicApiSmoke;

describe("@keigent/engine public API", () => {
  it("exports all built-in profile factories for external callers", () => {
    expect(api).toHaveProperty("makeConversationalProfile");
    expect(api).toHaveProperty("makeConvergentExecProfile");
    expect(api).toHaveProperty("makeConvergentVerifiedProfile");
    expect(api).toHaveProperty("makeDivergentResearchProfile");
  });

  it("exports eval harness APIs for external runners and CLI integration", () => {
    expect(api).toHaveProperty("runEvalCases");
    expect(api).toHaveProperty("buildEvalReport");
    expect(api).toHaveProperty("DEFAULT_EVAL_CASES");
    expect(api).toHaveProperty("createSmokeEvalExecutor");
    expect(api).toHaveProperty("createEngineEvalExecutor");
    expect(api).toHaveProperty("createTrajectoryReplayExecutor");
    expect(api).toHaveProperty("createTrajectoryReplayExecutorFromFiles");
    expect(api).toHaveProperty("loopResultFromTrajectory");
    expect(api).toHaveProperty("parseEvalCliArgs");
    expect(api).toHaveProperty("runOrchestratorEvalCases");
    expect(api).toHaveProperty("DEFAULT_ORCHESTRATOR_EVAL_CASES");
    expect(api).toHaveProperty("BROWSER_EVAL_CASES");
    expect(api).toHaveProperty("classifyByRulesDetailed");
    expect(api).toHaveProperty("runStabilityGate");
    expect(api).toHaveProperty("buildStabilityGateReport");
    expect(api).toHaveProperty("STABILITY_GATE_REDLINE_IDS");
  });

  it("exports workflow envelope APIs for external runners", () => {
    expect(api).toHaveProperty("DEFAULT_WORKFLOW_BUDGET");
    expect(api).toHaveProperty("chooseExecutionMode");
    expect(api).toHaveProperty("createWorkflowSpec");
    expect(api).toHaveProperty("WorkflowRunner");
    expect(api).toHaveProperty("createEngineWorkflowChildRunner");
    expect(api).toHaveProperty("saveWorkflowTrajectory");
    expect(api).toHaveProperty("loadWorkflowTrajectory");
    expect(api).toHaveProperty("replayWorkflowTrajectory");
    expect(api).toHaveProperty("isToolAllowedByWorkflowPolicy");
    expect(api).toHaveProperty("approvalScopeMatches");
  });

  it("exports evidence, assertion, and failure helpers for consumers", () => {
    expect(api).toHaveProperty("buildEvidenceBundle");
    expect(api).toHaveProperty("countSuccessfulToolCalls");
    expect(api).toHaveProperty("countPassedCheckpoints");
    expect(api).toHaveProperty("hasApprovedScope");
    expect(api).toHaveProperty("hasCollectedSource");
    expect(api).toHaveProperty("describeAssertion");
    expect(api).toHaveProperty("evaluateAssertion");
    expect(api).toHaveProperty("evaluateAssertions");
    expect(api).toHaveProperty("failureSummaryForLoopExit");
    expect(api).toHaveProperty("failureSummaryForWorkflowExit");
    expect(api).toHaveProperty("recommendedNextActionFor");
  });
});
