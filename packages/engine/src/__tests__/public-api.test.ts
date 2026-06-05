import { describe, expect, it } from "vitest";
import * as api from "../lib.js";

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
    expect(api).toHaveProperty("classifyByRulesDetailed");
  });

  it("exports workflow envelope APIs for external runners", () => {
    expect(api).toHaveProperty("DEFAULT_WORKFLOW_BUDGET");
    expect(api).toHaveProperty("chooseExecutionMode");
    expect(api).toHaveProperty("createWorkflowSpec");
    expect(api).toHaveProperty("WorkflowRunner");
    expect(api).toHaveProperty("saveWorkflowTrajectory");
    expect(api).toHaveProperty("loadWorkflowTrajectory");
    expect(api).toHaveProperty("replayWorkflowTrajectory");
  });
});
