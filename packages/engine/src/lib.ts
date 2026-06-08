// @keigent/engine 公共 API 桶文件（供 CLI 等外部包使用）

export { LoopEngine, type EngineOptions } from "./engine.js";
export { loadSkillContext, renderSkillIndex } from "./skills.js";
export {
  Orchestrator,
  makeRegistry,
  defaultRegistry,
  classifyByRules,
  classifyByRulesDetailed,
  type ProfileName,
  type ProfileSelectionRuleId,
  type ProfileClassificationDecision,
} from "./orchestrator.js";
export { PlaywrightStateCapture, closeBrowser } from "./browser.js";
export { Learner } from "./learner.js";
export { saveTrajectory } from "./trajectory.js";
export { formatLearningResult } from "./skill-patch.js";
export { buildDefaultRegistry } from "./tools/index.js";
export { ToolRegistry, type ToolDef, type ApprovalGate } from "./tools/index.js";
export { AllowAllGate } from "./tools/types.js";
export { WriteThroughMemory } from "./memory.js";
export { setVerbose, isVerbose } from "./logger.js";

export type {
  Task,
  SuccessDef,
  Assertion,
  LoopResult,
  LoopProfile,
  ProgressEvent,
  ProgressCallback,
  SkillContext,
  ExitReason,
} from "./types.js";

export { makeConversationalProfile } from "./profiles/conversational.js";
export { makeConvergentExecProfile } from "./profiles/convergent-exec.js";
export { makeConvergentVerifiedProfile } from "./profiles/convergent-verified.js";
export { makeDivergentResearchProfile } from "./profiles/divergent-research.js";
export { toolsForProfile } from "./tool-filter.js";
export { runEvalCases, buildEvalReport, toolsUsedFromResult, successfulToolsUsedFromResult } from "./evals/runner.js";
export { DEFAULT_EVAL_CASES, createSmokeEvalExecutor } from "./evals/cases.js";
export { createEngineEvalExecutor } from "./evals/engine-executor.js";
export {
  createTrajectoryReplayExecutor,
  createTrajectoryReplayExecutorFromFiles,
  loopResultFromTrajectory,
} from "./evals/replay.js";
export { parseEvalCliArgs } from "./evals/cli-options.js";
export { DEFAULT_ORCHESTRATOR_EVAL_CASES, runOrchestratorEvalCases } from "./evals/orchestrator-eval.js";
export {
  createEngineWorkflowChildRunner,
  DEFAULT_WORKFLOW_BUDGET,
  WorkflowRunner,
  chooseExecutionMode,
  createWorkflowSpec,
  loadWorkflowTrajectory,
  replayWorkflowTrajectory,
  saveWorkflowTrajectory,
} from "./workflow/index.js";
export type {
  ChildRunResult,
  ChildRunSpec,
  ExecutionMode,
  WorkflowBudget,
  WorkflowBudgetUsage,
  WorkflowChildRole,
  WorkflowEvent,
  WorkflowEvidence,
  WorkflowExitReason,
  WorkflowPolicy,
  WorkflowProgressCallback,
  WorkflowResult,
  WorkflowSpec,
  WorkflowTrajectory,
  WorkflowVerificationPolicy,
  EngineWorkflowChildRunnerOptions,
  EngineWorkflowRunner,
} from "./workflow/index.js";
export type {
  EngineEvalExecutorOptions,
  EngineEvalOrchestrator,
  EngineEvalRunner,
  EngineProfileSelection,
} from "./evals/engine-executor.js";
export type {
  EvalAcceptance,
  EvalCase,
  EvalCaseResult,
  EvalCategory,
  EvalFailureCode,
  EvalExecution,
  EvalExecutor,
  EvalReport,
} from "./evals/types.js";
export type {
  TrajectoryReplayExecutorOptions,
  TrajectoryReplayFileOptions,
} from "./evals/replay.js";
export type { EvalCliMode, EvalCliOptions } from "./evals/cli-options.js";
export type {
  OrchestratorEvalCase,
  OrchestratorEvalCaseResult,
  OrchestratorEvalReport,
} from "./evals/orchestrator-eval.js";
