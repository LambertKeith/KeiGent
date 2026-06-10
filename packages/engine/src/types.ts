import type { Context, Message, Tool } from "@earendil-works/pi-ai";
import type { FailureSummary } from "./failures.js";
import type { ApprovalDecision, ApprovalRequest } from "./tools/types.js";

// ── Task ─────────────────────────────────────────────────────────────

export type LegacyAssertionSignal = "url" | "dom" | "text" | "network" | "visual";

export type Assertion =
  | { kind?: "legacySignal"; description: string; signal: LegacyAssertionSignal }
  | { kind: "urlContains"; value: string }
  | { kind: "textIncludes"; value: string; source?: "dom" | "stdout" | "file" | "final" }
  | { kind: "fileExists"; path: string }
  | { kind: "fileHashEquals"; path: string; sha256: string }
  | { kind: "commandExitCode"; commandId: string; code: number }
  | { kind: "toolSucceeded"; toolName: string; minCount?: number }
  | { kind: "checkpointPassed"; checkpointId?: string; minCount?: number }
  | { kind: "humanApproved"; scope: string }
  | { kind: "jsonPathEquals"; path: string; value: unknown }
  | { kind: "screenshotJudge"; rubric: string };

export type AssertionFailureCode =
  | "evidence_missing"
  | "assertion_failed"
  | "assertion_unsupported";

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  evidence: string;
  failureCode?: AssertionFailureCode;
}

export interface SuccessDef {
  goal: string;
  assertions: Assertion[];
}

export interface Task {
  goal: string;
  profile: string;
  successDef?: SuccessDef;
}

// ── State ─────────────────────────────────────────────────────────────

export interface StateSnapshot {
  url?: string;
  domDigest?: string;
  visibleText?: string;
  screenshot?: Uint8Array;
  raw: Record<string, unknown>;
}

export interface LoopState {
  task: Task;
  iteration: number;
  messages: Message[];
  snapshots: StateSnapshot[];
  checkpointCount: number;
  lastCheckpointDesc?: string;
  toolCallCount: number;
  tokenEstimate?: number;
  providerUsage?: ProviderUsageSummary;
  failed: boolean;
  finalResponse?: string;
}

export namespace LoopState {
  export function init(task: Task, systemPrompt: string): LoopState {
    return {
      task,
      iteration: 0,
      messages: [],
      snapshots: [],
      checkpointCount: 0,
      toolCallCount: 0,
      tokenEstimate: 0,
      failed: false,
    };
  }
}

// ── LoopResult ────────────────────────────────────────────────────────

export type ExitReason =
  | "success"
  | "escalated"
  | "max_iterations"
  | "budget_exceeded"
  | "error";

export interface LoopResult {
  exitReason: ExitReason;
  finalResponse: string;
  iterations: number;
  checkpointsPassed: number;
  totalToolCalls: number;
  estimatedTokens?: number;
  providerUsage?: ProviderUsageSummary;
  trajectory: Trajectory;     // 完整执行轨迹，供学习 loop 消费
  failure?: FailureSummary;
}

export type ProviderCostStatus = "priced" | "pricing_not_configured";

export interface ProviderUsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  costStatus: ProviderCostStatus;
}

// ── 流式进度事件（供 CLI/UI 实时渲染）────────────────────────────────

export type ProgressEvent =
  | {
      kind: "profile_selected";
      profile: string;
      via: "rule" | "llm";
      ruleId?: string;
      rationale?: string;
      signals?: string[];
      guardApplied?: boolean;
      unguardedProfile?: string;
    }
  | { kind: "skills_matched"; skills: string[]; explanations?: SkillMatchExplanation[] }
  | { kind: "iteration_start"; iteration: number }
  | { kind: "tool_call"; iteration: number; toolName: string; args: Record<string, unknown> }
  | { kind: "tool_result"; iteration: number; toolName: string; result: string; succeeded: boolean }
  | { kind: "approval"; iteration: number; request: ApprovalRequest; approved: boolean; decidedAt: string }
  | { kind: "text"; iteration: number; text: string }
  | { kind: "checkpoint"; iteration: number; desc: string }
  | { kind: "verdict"; iteration: number; passed: boolean; evidence: string }
  | { kind: "recovery"; iteration: number; decision: RecoverDecision["kind"]; hint?: string; reason?: string }
  | { kind: "escalate"; reason: string }
  | { kind: "done"; exitReason: ExitReason; finalResponse: string; failure?: FailureSummary };

export type ProgressCallback = (event: ProgressEvent) => void;

// ── Trajectory（执行轨迹）────────────────────────────────────────────

export type TrajectoryStepKind = "skill_match" | "tool_call" | "text_output" | "checkpoint" | "approval" | "recovery" | "error";

export interface TrajectoryStep {
  iteration: number;
  kind: TrajectoryStepKind;
  // skill_match
  skillMatches?: SkillMatchExplanation[];
  // tool_call
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  toolSucceeded?: boolean;
  // text_output
  text?: string;
  // checkpoint
  snapshot?: StateSnapshot;
  verdictPassed?: boolean;
  verdictEvidence?: string;
  checkpointDesc?: string;
  // approval
  approval?: ApprovalDecision;
  // recovery
  recovery?: { decision: RecoverDecision["kind"]; hint?: string; reason?: string };
  // error
  errorMessage?: string;
}

export interface Trajectory {
  task: Task;
  profile: string;
  exitReason: ExitReason;
  steps: TrajectoryStep[];
  finalResponse: string;
  durationMs: number;
  skillsUsed: string[];       // 本次注入的 skill 名列表
  estimatedTokens?: number;
  providerUsage?: ProviderUsageSummary;
  failure?: FailureSummary;
}

// ── SkillPatch（学习 loop 对 skill 的修改建议）────────────────────────

export type PatchSection =
  | "workflow"
  | "guidelines"
  | "recovery"
  | "examples";

export type PatchAction = "append" | "prepend" | "replace";

export interface SkillPatch {
  skillName: string;
  section: PatchSection;
  action: PatchAction;
  content: string;
  rationale: string;          // LLM 解释为什么要改
  learningStatus?: SkillStatus;
  promoteToActive?: boolean;
  evalCoverage?: string[];
}

export interface LearningResult {
  trajectoryId: string;
  patches: SkillPatch[];
  summary: string;            // 学习 loop 的总结性洞察
  writtenTo: string[];        // 实际写入的文件路径
}

// ── Verdict ───────────────────────────────────────────────────────────

export interface Verdict {
  passed: boolean;
  evidence: string;
  perAssertion?: AssertionResult[];
}

// ── RecoverDecision ───────────────────────────────────────────────────

export type RecoverDecision =
  | { kind: "retry" }
  | { kind: "repair"; hint: string }
  | { kind: "escalate"; reason: string };

// ── SkillContext ──────────────────────────────────────────────────────

export type SkillStatus =
  | "draft"
  | "candidate"
  | "active"
  | "verified"
  | "learned-note-only"
  | "blocked"
  | "quarantined"
  | "deprecated"
  | "promoted";

export interface SkillMeta {
  name: string;
  description: string;
  tags: string[];
  status?: SkillStatus;
  requiredTools?: string[];
  allowedTools?: string[];
  nonGoals?: string[];
  dangerousActions?: string[];
  examples?: string[];
  version?: string;
  taskTypes?: string[];
  triggers?: string[];
  riskLevel?: string;
  permissionsExpected?: string[];
  source?: {
    type?: string;
    trajectoryId?: string;
  };
  blockedReason?: string;
  deprecatedReason?: string;
  evalCoverage?: string[];
}

export interface SkillMatchExplanation {
  name: string;
  status?: SkillStatus;
  score: number;
  signals: string[];
  matched: boolean;
  injected: boolean;
  exclusionReason?:
    | "score_below_threshold"
    | "lower_ranked"
    | "status_not_executable"
    | "body_not_injected"
    | "missing_eval_coverage"
    | "blocked"
    | "candidate_not_enabled";
  matchedBy?: string[];
  confidence?: "none" | "low" | "medium" | "high";
  includedBody?: boolean;
  blockedReason?: string;
  riskDelta?: string;
  evalCoverage?: string[];
}

export interface SkillContext {
  metas: SkillMeta[];
  // 按需加载 body（渐进式披露第二层）
  loadBody(name: string): Promise<string | null>;
  // 当前任务匹配的 skill names（已由 AttentionStrategy 筛选）
  matched: string[];
}

// ── 五个旋钮接口 ───────────────────────────────────────────────────────

/**
 * 注意力策略：决定每轮往上下文放什么。
 * 收敛 = 只注入最相关的一篇 skill body + 最近状态，裁剪记忆/历史。
 * 发散 = 拉入更多 skill body + 完整历史。
 *
 * 注意力旋钮全权负责 skill body 注入——这是收敛/发散行为差异的核心载体。
 * 引擎不直接注入 body，只调用 attention 的 matchSkills + renderInjection。
 */
export interface AttentionStrategy {
  /**
   * 重置实例级可变状态（步骤计数、已用工具集等）。
   * 引擎在每次 run() 开始时调用，确保 profile 实例可安全复用。
   */
  reset(): void;

  /**
   * 匹配当前任务相关的 skill（返回 name 列表）。
   * 收敛：最多 1 篇，严格匹配。
   * 发散：多篇，宽松匹配。
   */
  matchSkills(task: Task, metas: SkillMeta[]): string[];

  /**
   * 把匹配到的 skill body 渲染成注入用户消息的文本块。
   * 收敛：只渲染最相关的 1 篇。发散：渲染全部匹配的 body。
   * 这是 attention 旋钮控制"注入多少 skill"的地方（spec §6.1）。
   */
  renderInjection(
    matchedNames: string[],
    skillContext: SkillContext,
  ): Promise<string>;

  /**
   * 构建这一轮发给 LLM 的完整 Context（含 systemPrompt + messages + tools）。
   */
  buildContext(
    state: LoopState,
    skillContext: SkillContext,
    availableTools: Tool[],
  ): Promise<Context>;
}

/**
 * 终止策略：决定什么时候跳出主循环。
 *
 * allowEarlyTextExit:
 *   true  → 模型输出文本（stopReason=stop）时直接退出，不等 checkpoint
 *           用于 divergent-research（模型自判完成）
 *   false → 模型输出文本但 shouldStop 未满足时继续推进，等待 checkpoint
 *           用于 convergent-exec（必须走完 checkpoint 才算完）
 */
export interface TerminateStrategy {
  shouldStop(state: LoopState): boolean;
  allowEarlyTextExit: boolean;
}

/**
 * 验证策略：决定 checkpoint 时怎么验。
 * 吃客观 StateSnapshot，不吃 state（防止执行者确认偏误污染裁判）。
 */
export interface VerifyStrategy {
  check(
    snapshot: StateSnapshot,
    successDef: SuccessDef | undefined,
    skillContext: SkillContext,
  ): Promise<Verdict>;
}

/**
 * 恢复策略：验证失败时怎么办。
 */
export interface RecoverStrategy {
  /** 重置重试计数等实例级状态，确保 profile 复用安全。引擎在 run() 开始时调用。 */
  reset(): void;
  handle(state: LoopState, verdict: Verdict): Promise<RecoverDecision>;
}

/**
 * 记忆策略：每轮结束后是否沉淀到知识库。
 * 执行 loop = NoWrite，学习 loop = WriteThrough。
 */
export interface MemoryStrategy {
  maybePersist(state: LoopState): Promise<void>;
}

// ── LoopProfile ───────────────────────────────────────────────────────

export interface LoopProfile {
  name: string;
  attention: AttentionStrategy;
  terminate: TerminateStrategy;
  verify: VerifyStrategy;
  recover: RecoverStrategy;
  memory: MemoryStrategy;
}

// ── StateCapture ──────────────────────────────────────────────────────

/**
 * 引擎层固定原语：采集客观状态快照，执行者和 skill 都触不到。
 * 浏览器场景：PlaywrightStateCapture（browser.ts）。
 */
export interface StateCapture {
  capture(): Promise<StateSnapshot>;
}
