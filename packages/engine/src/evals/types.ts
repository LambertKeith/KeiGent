import type { ProfileName } from "../orchestrator.js";
import type { ExitReason, LoopResult, Task } from "../types.js";

export type EvalCategory = "conversational" | "research" | "verified-exec" | "tool-smoke";

export type EvalFailureCode =
  | "profile_mismatch"
  | "exit_reason"
  | "tool_missing"
  | "tool_forbidden"
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
}

export interface EvalCase {
  id: string;
  title: string;
  category: EvalCategory;
  task: Task;
  expectedProfile?: ProfileName;
  acceptance: EvalAcceptance;
  timeoutMs?: number;
}

export interface EvalExecution {
  selectedProfile?: ProfileName | string;
  result: LoopResult;
}

export interface EvalExecutor {
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
  failures: string[];
  failureCodes: EvalFailureCode[];
  finalResponse: string;
}

export interface EvalReport {
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  failuresByCode: Partial<Record<EvalFailureCode, number>>;
  cases: EvalCaseResult[];
}
