import type { ProfileName } from "../orchestrator.js";
import type { ExitReason, LoopResult, Task } from "../types.js";

export type EvalExecutionMode = "smoke" | "replay" | "live";

export type EvalCategory =
  | "conversational"
  | "research"
  | "verified-exec"
  | "tool-smoke"
  | "file"
  | "shell"
  | "browser"
  | "config"
  | "permission"
  | "workflow"
  | "skill"
  | "dashboard";

export type EvalFailureCode =
  | "profile_mismatch"
  | "exit_reason"
  | "tool_missing"
  | "tool_forbidden"
  | "evidence_missing"
  | "forbidden_claim"
  | "approval_missing"
  | "permission_denied"
  | "checkpoint_missing"
  | "output_missing"
  | "executor_error"
  | "timeout";

export interface EvalAcceptance {
  /** Accepted engine exit reasons. Defaults to ["success"]. */
  exitReasons?: ExitReason[];
  /** Minimum number of passed checkpoints required. Defaults to 0. */
  minCheckpoints?: number;
  /** Tools that must appear in the trajectory. */
  requiredTools?: string[];
  /** Tools that must not appear in the trajectory. */
  forbiddenTools?: string[];
  /** Substrings that must be present in finalResponse. */
  finalResponseIncludes?: string[];
  /** Approval decisions that must appear in the trajectory. */
  requiredApprovals?: Array<{ toolName: string; approved?: boolean; riskLevel?: string }>;
  /** Set true for cases whose expected behavior is a safe refusal. */
  allowDeniedApprovals?: boolean;
}

export interface EvalCase {
  id: string;
  title: string;
  category: EvalCategory;
  task: Task;
  expectedProfile?: ProfileName;
  acceptance: EvalAcceptance;
  proves?: string;
  doesNotProve?: string;
  requiredEvidence?: string[];
  forbiddenClaims?: string[];
  timeoutMs?: number;
}

export interface EvalExecution {
  selectedProfile?: ProfileName | string;
  executionMode?: EvalExecutionMode;
  result: LoopResult;
}

export interface EvalExecutor {
  executionMode?: EvalExecutionMode;
  run(evalCase: EvalCase): Promise<EvalExecution>;
}

export interface EvalCaseResult {
  id: string;
  title: string;
  category: EvalCategory;
  passed: boolean;
  selectedProfile?: string;
  expectedProfile?: ProfileName;
  profileMatched: boolean | null;
  exitReason: ExitReason;
  iterations: number;
  checkpointsPassed: number;
  totalToolCalls: number;
  toolsUsed: string[];
  successfulToolsUsed: string[];
  durationMs: number;
  executionMode?: EvalExecutionMode;
  failures: string[];
  failureCodes: EvalFailureCode[];
  finalResponse: string;
  proves?: string;
  doesNotProve?: string;
  requiredEvidence: string[];
  forbiddenClaims: string[];
}

export interface EvalReport {
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  executionModes: Partial<Record<EvalExecutionMode, number>>;
  failuresByCode: Partial<Record<EvalFailureCode, number>>;
  cases: EvalCaseResult[];
}
