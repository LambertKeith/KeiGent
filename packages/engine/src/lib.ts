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
export { AllowAllGate, DenyByDefaultGate } from "./tools/types.js";
export type { ApprovalRequest, RiskLevel, SideEffect } from "./tools/types.js";
export { WriteThroughMemory } from "./memory.js";
export { setVerbose, isVerbose } from "./logger.js";
export {
  buildEvidenceBundle,
  countPassedCheckpoints,
  countSuccessfulToolCalls,
  hasApprovedScope,
} from "./evidence.js";
export type {
  CheckpointEvidence,
  EvidenceBundle,
  ToolCallEvidence,
} from "./evidence.js";
export { describeAssertion, evaluateAssertion, evaluateAssertions } from "./assertions.js";
export { failureSummaryForLoopExit, failureSummaryForWorkflowExit, recommendedNextActionFor } from "./failures.js";
export type { FailureCode, FailureLayer, FailureSummary } from "./failures.js";
export { addProviderUsage, normalizeProviderUsage } from "./provider-usage.js";
export {
  mergeProofBoundaries,
  proofBoundaryForRunRecord,
  proofBoundaryForWorkflowResult,
} from "./proof-boundary.js";
export type { ProofBoundary } from "./proof-boundary.js";
export {
  loopEventFromProgress,
  loopEventFromUnknown,
  loopEventsFromWorkflow,
} from "./loop-events.js";
export type { LoopEvent, LoopEventType } from "./loop-events.js";
export type {
  AutonomyOutcome,
  AutonomySummary,
  EscalationReason,
  EscalationDecision,
  RepairAttemptSummary,
} from "./workflow/types.js";
export {
  buildNoOpRunRecord,
  buildRunRecordFromWorkflowResult,
  readRunRecord,
  readRunStore,
  saveRunRecord,
  summarizeRunRecord,
} from "./run-record.js";
export {
  canWriteWorkspace,
  cleanupIsolatedWorkspace,
  collectWorkspaceArtifacts,
  createIsolatedWorkspace,
  detectWorkspaceConflicts,
  readWorkspaceManifest,
} from "./worktree-isolation.js";
export { exportRunDebugBundle } from "./debug-bundle.js";
export type {
  ApprovalSummary,
  AutomationSummary,
  BuildNoOpRunRecordOptions,
  BuildRunRecordOptions,
  ChildRunSummary,
  EvidenceSummary as RunEvidenceSummary,
  ExecutionSummary as RunExecutionSummary,
  RedactionSummary,
  ReplayCapability,
  RiskSummary,
  RouteDecisionSnapshot,
  RunArtifact,
  RunEvidenceStatus,
  RunRecord,
  RunStoreError,
  RunStoreReadResult,
  RunStatus,
  RunTaskSnapshot,
  RunTaskSource,
  SaveRunRecordOptions,
  SkillRunSummary,
  ToolRunSummary,
  WorkflowSnapshot,
} from "./run-record.js";
export type {
  CleanupIsolatedWorkspaceOptions,
  CreateIsolatedWorkspaceOptions,
  IsolatedWorkspace,
  WorkspaceArtifact,
  WorkspaceArtifactKind,
  WorkspaceArtifactSet,
  WorkspaceCleanupMode,
  WorkspaceConflict,
  WorkspaceStatus,
} from "./worktree-isolation.js";
export type {
  DebugBundleExportResult,
  DebugBundleFile,
  DebugBundleFileKind,
  DebugBundleMissingArtifact,
  ExportRunDebugBundleOptions,
} from "./debug-bundle.js";

export type {
  Task,
  SuccessDef,
  Assertion,
  AssertionFailureCode,
  AssertionResult,
  LoopResult,
  LoopProfile,
  ProgressEvent,
  ProgressCallback,
  Trajectory,
  TrajectoryStep,
  SkillContext,
  SkillMatchExplanation,
  ExitReason,
  ProviderCostStatus,
  ProviderUsageSummary,
} from "./types.js";

export { makeConversationalProfile } from "./profiles/conversational.js";
export { makeConvergentExecProfile } from "./profiles/convergent-exec.js";
export { makeConvergentVerifiedProfile } from "./profiles/convergent-verified.js";
export { makeDivergentResearchProfile } from "./profiles/divergent-research.js";
export { toolsForProfile } from "./tool-filter.js";
export { runEvalCases, buildEvalReport, toolsUsedFromResult, successfulToolsUsedFromResult } from "./evals/runner.js";
export { DEFAULT_EVAL_CASES, createSmokeEvalExecutor } from "./evals/cases.js";
export { BROWSER_EVAL_CASES } from "./evals/browser-cases.js";
export { createEngineEvalExecutor } from "./evals/engine-executor.js";
export {
  createTrajectoryReplayExecutor,
  createTrajectoryReplayExecutorFromFiles,
  loadReplayFixtureSet,
  loopResultFromTrajectory,
} from "./evals/replay.js";
export { parseEvalCliArgs } from "./evals/cli-options.js";
export { DEFAULT_ORCHESTRATOR_EVAL_CASES, runOrchestratorEvalCases } from "./evals/orchestrator-eval.js";
export {
  DEFAULT_REAL_WORLD_L2_CASES,
  REAL_WORLD_L2_DATASET_ID,
  createRealWorldFixtureExecutor,
  runRealWorldEvalCases,
} from "./evals/real-world.js";
export {
  DEFAULT_OPERATOR_L3_CASES,
  OPERATOR_L3_DATASET_ID,
  buildOperatorAcceptanceRecord,
  createOperatorScenarioFixtureReviewer,
  formatOperatorAcceptancePacket,
  runOperatorScenarioEvalCases,
} from "./evals/operator-scenarios.js";
export type {
  OperatorAcceptanceCaseRecord,
  OperatorAcceptanceCaseSignoff,
  OperatorAcceptanceIssue,
  OperatorAcceptanceRecord,
  OperatorAcceptanceSignoff,
  OperatorEvidenceLink,
  OperatorScenarioCaseResult,
  OperatorScenarioDecision,
  OperatorScenarioEvalCase,
  OperatorScenarioEvalReport,
  OperatorScenarioFinding,
  OperatorScenarioJourney,
  OperatorScenarioReview,
  OperatorScenarioReviewer,
} from "./evals/operator-scenarios.js";
export {
  createEngineWorkflowChildRunner,
  DEFAULT_WORKFLOW_BUDGET,
  WorkflowRunner,
  chooseExecutionMode,
  createWorkflowSpec,
  loadWorkflowTrajectory,
  replayWorkflowTrajectory,
  saveWorkflowTrajectory,
  approvalScopeMatches,
  isToolAllowedByWorkflowPolicy,
} from "./workflow/index.js";
export type {
  ChildRunResult,
  ChildRunSpec,
  ExecutionMode,
  WorkflowBudget,
  WorkflowBudgetUsage,
  WorkflowChildRunOptions,
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
export type {
  RealWorldEvalCase,
  RealWorldEvalCaseExpectedResult,
  RealWorldEvalCaseResult,
  RealWorldEvalCaseResultKind,
  RealWorldEvalExecutor,
  RealWorldEvalExecution,
  RealWorldEvalFinding,
  RealWorldEvalLevel,
  RealWorldEvalReport,
} from "./evals/real-world.js";
