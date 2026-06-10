import { vlog, vwarn } from "./logger.js";
import { complete, type Api, type AssistantMessage, type Context, type Model, type Tool, type ToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
import type {
  ExitReason,
  LoopProfile,
  LoopResult,
  LoopState,
  ProgressCallback,
  SkillContext,
  StateCapture,
  Task,
  Trajectory,
} from "./types.js";
import { TrajectoryCollector } from "./trajectory.js";
import { failureSummaryForLoopExit } from "./failures.js";
import { deduplicateToolCalls, extractToolCalls, stripThinkBlocks } from "./utils.js";
import { ToolRegistry, CHECKPOINT_TOOL_NAME, type ToolContext, type ApprovalGate } from "./tools/index.js";
import type { ApprovalRequest } from "./tools/types.js";
import { AllowAllGate } from "./tools/types.js";
import { approvalScopeMatches } from "./workflow/policy.js";
import { explainSkillMatches } from "./profiles/strategies.js";
import { addProviderUsage, normalizeProviderUsage } from "./provider-usage.js";

const CHECKPOINT_TOOL = CHECKPOINT_TOOL_NAME;
const DEFAULT_LLM_TIMEOUT_MS = 60_000;

export interface EngineOptions {
  model: Model<Api>;
  apiKey: string;
  maxIterations?: number;
  maxToolCalls?: number;
  maxTokenEstimate?: number;
  maxProviderCostUsd?: number;
  maxWallTimeMs?: number;
  maxRecoveryAttempts?: number;
  registry: ToolRegistry;       // 工具注册表（B0：工具与引擎解耦）
  workspace?: string;           // 文件沙箱根目录
  approval?: ApprovalGate;      // dangerous 工具审批门
  headless?: boolean;           // 浏览器可见性
  askUser?: (question: string) => Promise<string>;  // 交互提问回调（CLI 注入，单次模式不传）
  llmTimeoutMs?: number;        // 单次 LLM 请求上限，防止真实供应商流式响应卡死
}

export interface LoopEngineRunOptions {
  signal?: AbortSignal;
  inheritedApprovalScopes?: string[];
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function abortMessage(): string {
  return "[错误] aborted";
}

export class LoopEngine {
  private readonly model: Model<Api>;
  private readonly apiKey: string;
  private readonly maxIterations: number;
  private readonly maxToolCalls?: number;
  private readonly maxTokenEstimate?: number;
  private readonly maxProviderCostUsd?: number;
  private readonly maxWallTimeMs?: number;
  private readonly maxRecoveryAttempts?: number;
  private readonly registry: ToolRegistry;
  private readonly workspace: string;
  private readonly approval: ApprovalGate;
  private readonly headless: boolean;
  private readonly askUser?: (question: string) => Promise<string>;
  private readonly llmTimeoutMs: number;
  private _emit: ProgressCallback = () => {};

  constructor(opts: EngineOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.maxIterations = opts.maxIterations ?? 10;
    this.maxToolCalls = opts.maxToolCalls;
    this.maxTokenEstimate = opts.maxTokenEstimate;
    this.maxProviderCostUsd = opts.maxProviderCostUsd;
    this.maxWallTimeMs = opts.maxWallTimeMs;
    this.maxRecoveryAttempts = opts.maxRecoveryAttempts;
    this.registry = opts.registry;
    this.workspace = opts.workspace ?? process.cwd();
    this.approval = opts.approval ?? new AllowAllGate();
    this.headless = opts.headless ?? false;
    this.askUser = opts.askUser;
    this.llmTimeoutMs = opts.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  }

  async run(
    task: Task,
    skillContext: SkillContext,
    profile: LoopProfile,
    stateCapture: StateCapture,
    availableTools: Tool[],
    onProgress?: ProgressCallback,
    options: LoopEngineRunOptions = {},
  ): Promise<LoopResult> {
    const signal = options.signal;
    const emit = onProgress ?? (() => {});
    this._emit = emit;     // result() 用它发 done 事件
    vlog(`\n[engine] ▶ profile=${profile.name} goal="${task.goal}"`);
    const startedAt = Date.now();

    // 重置 profile 实例级可变状态，确保 profile 复用安全（S2/S3 修复）
    profile.attention.reset();
    profile.recover.reset();

    // 轨迹收集器——贯穿整个 run 方法
    const collector = new TrajectoryCollector();

    // 工具执行上下文（B0：工具通过 registry 执行）
    const toolCtx: ToolContext = {
      workspace: this.workspace,
      browser: null,        // B1 懒启动浏览器会话后填充
      approval: approvalWithInheritedScopes(this.approval, options.inheritedApprovalScopes),
      task,
      headless: this.headless,
      askUser: this.askUser,
      signal,
      onApprovalDecision: (decision) => {
        collector.addApproval(state.iteration, decision);
        emit({
          kind: "approval",
          iteration: state.iteration,
          request: decision.request,
          approved: decision.approved,
          decidedAt: decision.decidedAt,
        });
      },
    };

    // AttentionStrategy 决定匹配哪些 skill
    const matchedSkills = profile.attention.matchSkills(task, skillContext.metas);
    const skillExplanations = explainSkillMatches(task, skillContext.metas, matchedSkills);
    collector.addSkillMatches(skillExplanations);
    skillContext = { ...skillContext, matched: matchedSkills };
    vlog(`[engine] matched skills: [${matchedSkills.join(", ") || "none"}]`);
    emit({ kind: "skills_matched", skills: matchedSkills, explanations: skillExplanations });

    // skill body 注入由 attention 旋钮负责（S1 修复）：
    // 收敛只注入 1 篇，发散注入全部——这是收敛/发散行为差异的核心载体
    const skillInjection = await profile.attention.renderInjection(matchedSkills, skillContext);

    const state: LoopState = {
      task,
      iteration: 0,
      messages: [],
      snapshots: [],
      checkpointCount: 0,
      toolCallCount: 0,
      tokenEstimate: 0,
      failed: false,
    };
    let recoveryAttempts = 0;

    if (isAborted(signal)) {
      return this.result(state, "error", abortMessage(), collector, matchedSkills);
    }

    // 首条用户消息（skill body 前置注入）
    const userContent = skillInjection
      ? `${skillInjection}\n\n${task.goal}`
      : task.goal;

    state.messages.push({
      role: "user",
      content: userContent,
      timestamp: Date.now(),
    });

    while (!profile.terminate.shouldStop(state)) {
      if (this.isWallTimeBudgetExceeded(startedAt, state)) {
        return this.result(state, "budget_exceeded", "[错误] budget_exceeded: maxWallTimeMs", collector, matchedSkills);
      }
      if (isAborted(signal)) {
        return this.result(state, "error", abortMessage(), collector, matchedSkills);
      }

      if (state.iteration >= this.maxIterations) {
        vlog(`[engine] 达到最大迭代次数 ${this.maxIterations}`);
        return this.result(state, "max_iterations", undefined, collector, matchedSkills);
      }

      state.iteration++;
      vlog(`\n[engine] ── 迭代 ${state.iteration} ─────────────────`);
      emit({ kind: "iteration_start", iteration: state.iteration });

      // AttentionStrategy 构建本轮 context（tools 按步骤控制）
      const context = await profile.attention.buildContext(
        state,
        skillContext,
        availableTools,
      );
      state.tokenEstimate = (state.tokenEstimate ?? 0) + estimateContextTokens(context);
      if (this.isTokenBudgetExceeded(state)) {
        return this.result(state, "budget_exceeded", "[错误] budget_exceeded: maxTokenEstimate", collector, matchedSkills);
      }
      if (isAborted(signal)) {
        return this.result(state, "error", abortMessage(), collector, matchedSkills);
      }

      // LLM 调用
      const response = await this.callLLM(context, signal);
      state.providerUsage = addProviderUsage(state.providerUsage, normalizeProviderUsage(response.usage));
      if (this.isProviderCostBudgetExceeded(state)) {
        return this.result(state, "budget_exceeded", `[错误] budget_exceeded: maxProviderCostUsd (${state.providerUsage!.costUsd} > ${this.maxProviderCostUsd})`, collector, matchedSkills);
      }
      if (isAborted(signal)) {
        return this.result(state, "error", abortMessage(), collector, matchedSkills);
      }

      if (response.stopReason === "error") {
        console.error(`[engine] LLM 错误: ${response.errorMessage}`);
        state.failed = true;
        collector.addError(state.iteration, response.errorMessage ?? "LLM error");
        return this.result(state, "error", `[错误] ${response.errorMessage}`, collector, matchedSkills);
      }

      // 提取文本（剥离 <think> 思考块——它们是模型内部推理，不该作为回复）
      const text = stripThinkBlocks(
        response.content
          .filter((c) => c.type === "text")
          .map((c) => (c.type === "text" ? c.text : ""))
          .join(""),
      );

      if (text) {
        vlog(`[engine] 文本: ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`);
        state.finalResponse = text;
        collector.addTextOutput(state.iteration, text);   // ← 记录文本输出
        emit({ kind: "text", iteration: state.iteration, text });
      }

      // 无工具调用时的退出逻辑
      if (response.stopReason !== "toolUse") {
        // allowEarlyTextExit=true（发散）：有文本就退出
        if (profile.terminate.allowEarlyTextExit) {
          if (text) return this.result(state, "success", undefined, collector, matchedSkills);
          return this.result(state, "error", "[错误] 模型无输出", collector, matchedSkills);
        }

        // allowEarlyTextExit=false（收敛）：必须满足 terminate 才能退出
        if (profile.terminate.shouldStop(state)) {
          return this.result(state, "success", undefined, collector, matchedSkills);
        }

        // 未满足：把模型文本加入历史，推进步骤，推动下一步 checkpoint
        if (text) {
          vlog(`[engine] terminate 未满足（checkpoints=${state.checkpointCount}），推进步骤等待 checkpoint`);
          state.messages.push({
            role: "assistant",
            content: response.content,
            api: response.api,
            provider: response.provider,
            model: response.model,
            usage: response.usage,
            stopReason: response.stopReason,
            timestamp: response.timestamp,
          });
          // 文本输出后推进步骤（无工具步骤完成）
          if ("advanceStep" in profile.attention && "getStep" in profile.attention) {
            const narrow = profile.attention as unknown as { advanceStep(): void; getStep(): number };
            narrow.advanceStep();
            vlog(`[engine] 步骤推进（文本输出后）→ step=${narrow.getStep()}`);
          }
          // 步骤指令已在 system prompt 里，不需要额外 user message 提示
          continue;
        }

        // 模型既无工具也无文本：若之前已产出过答案，用它收尾（防止凑 checkpoint
        // 过程中模型吐空导致整轮 error）；否则才算真的无输出。
        if (state.finalResponse) {
          vlog("[engine] 模型本轮无输出，但已有答案，用既有答案收尾");
          return this.result(state, "success", undefined, collector, matchedSkills);
        }
        return this.result(state, "error", "[错误] 模型无输出", collector, matchedSkills);
      }

      // 统一去重幽灵 ToolCall（pi-ai 流式解析 gpt-5.5 的并发工具调用 bug）
      const cleanContent = deduplicateToolCalls([...response.content]);
      const toolCalls = extractToolCalls(cleanContent);
      state.messages.push({
        role: "assistant",
        content: cleanContent,
        api: response.api,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        stopReason: response.stopReason,
        timestamp: response.timestamp,
      });

      // 处理每个工具调用
      for (const toolCall of toolCalls) {
        if (this.isToolCallBudgetExceeded(state)) {
          return this.result(state, "budget_exceeded", "[错误] budget_exceeded: maxToolCalls", collector, matchedSkills);
        }
        state.toolCallCount++;
        vlog(`[engine] 工具: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);
        emit({ kind: "tool_call", iteration: state.iteration, toolName: toolCall.name, args: toolCall.arguments as Record<string, unknown> });

        // ── checkpoint 信号拦截 ──────────────────────────────────
        if (toolCall.name === CHECKPOINT_TOOL) {
          const desc = String(toolCall.arguments?.checkpoint_desc ?? "(无描述)");
          state.lastCheckpointDesc = desc;
          vlog(`[engine] ⚑ checkpoint: "${desc}"`);
          emit({ kind: "checkpoint", iteration: state.iteration, desc });

          // 验证观察：引擎强制采集客观快照
          if (isAborted(signal)) {
            return this.result(state, "error", abortMessage(), collector, matchedSkills);
          }
          const snapshot = await stateCapture.capture();
          if (isAborted(signal)) {
            return this.result(state, "error", abortMessage(), collector, matchedSkills);
          }
          state.snapshots.push(snapshot);
          vlog(`[engine] StateCapture → url=${snapshot.url ?? "n/a"}`);

          // 裁判验证
          if (isAborted(signal)) {
            return this.result(state, "error", abortMessage(), collector, matchedSkills);
          }
          const verdict = await profile.verify.check(
            snapshot,
            task.successDef,
            skillContext,
          );
          if (isAborted(signal)) {
            return this.result(state, "error", abortMessage(), collector, matchedSkills);
          }
          vlog(`[engine] 裁判 → ${verdict.passed ? "✓ 通过" : "✗ 失败"}: ${verdict.evidence}`);
          emit({ kind: "verdict", iteration: state.iteration, passed: verdict.passed, evidence: verdict.evidence });

          // 记录 checkpoint 到轨迹
          collector.addCheckpoint({
            iteration: state.iteration,
            desc,
            snapshot,
            verdictPassed: verdict.passed,
            verdictEvidence: verdict.evidence,
          });

          if (!verdict.passed) {
            if (isAborted(signal)) {
              return this.result(state, "error", abortMessage(), collector, matchedSkills);
            }
            if (this.isRecoveryBudgetExceeded(recoveryAttempts)) {
              return this.result(state, "budget_exceeded", "[错误] budget_exceeded: maxRecoveryAttempts", collector, matchedSkills);
            }
            const decision = await profile.recover.handle(state, verdict);
            if (isAborted(signal)) {
              return this.result(state, "error", abortMessage(), collector, matchedSkills);
            }
            recoveryAttempts++;
            const recovery = recoveryPayload(decision);
            collector.addRecovery(state.iteration, recovery);
            emit({ kind: "recovery", iteration: state.iteration, decision: recovery.decision, ...(recovery.hint ? { hint: recovery.hint } : {}), ...(recovery.reason ? { reason: recovery.reason } : {}) });
            if (decision.kind === "escalate") {
              vlog(`[engine] 升级人类: ${decision.reason}`);
              emit({ kind: "escalate", reason: decision.reason });
              this.pushToolResult(state, toolCall, `验证失败，升级处理: ${decision.reason}`);
              return this.result(state, "escalated", undefined, collector, matchedSkills);
            }
            // repair/retry：把修复提示注入工具结果，让模型重新来
            const hint = decision.kind === "repair" ? decision.hint : "请重试";
            this.pushToolResult(state, toolCall, `验证未通过: ${verdict.evidence}。${hint}`);
            continue;
          }

          state.checkpointCount++;
          this.pushToolResult(state, toolCall, "验证通过 ✓");
          continue;
        }

        // ── 普通工具执行（通过 registry，B0 解耦）──────────────────────
        if (isAborted(signal)) {
          return this.result(state, "error", abortMessage(), collector, matchedSkills);
        }
        const toolRes = await this.registry.execute(
          toolCall.name,
          toolCall.arguments as Record<string, unknown>,
          toolCtx,
        );
        if (isAborted(signal)) {
          return this.result(state, "error", abortMessage(), collector, matchedSkills);
        }
        const result = toolRes.content;
        vlog(`[engine] 结果: ${result.slice(0, 100)}`);
        emit({ kind: "tool_result", iteration: state.iteration, toolName: toolCall.name, result, succeeded: !toolRes.isError });
        this.pushToolResult(state, toolCall, result);

        // 记录工具调用到轨迹
        collector.addToolCall({
          iteration: state.iteration,
          toolName: toolCall.name,
          toolArgs: toolCall.arguments as Record<string, unknown>,
          toolResult: result,
          succeeded: !toolRes.isError,
        });
        if (toolRes.isError && (result.includes("未获授权") || result.includes("non_interactive_input_required"))) {
          return this.result(state, "error", result, collector, matchedSkills);
        }

        // 收敛：步骤推进（NarrowAttention）
        if ("advanceStep" in profile.attention && "getStep" in profile.attention) {
          const narrow = profile.attention as unknown as { advanceStep(): void; getStep(): number };
          narrow.advanceStep();
          vlog(`[engine] 步骤推进 → step=${narrow.getStep()}`);
        }
        // 发散：标记工具已用（WideAttention 防重复）
        if ("markToolUsed" in profile.attention) {
          (profile.attention as unknown as { markToolUsed(n: string): void }).markToolUsed(toolCall.name);
        }
      }

      // 记忆策略
      if (isAborted(signal)) {
        return this.result(state, "error", abortMessage(), collector, matchedSkills);
      }
      await profile.memory.maybePersist(state);
      if (isAborted(signal)) {
        return this.result(state, "error", abortMessage(), collector, matchedSkills);
      }
    }

    return this.result(state, "success", undefined, collector, matchedSkills);
  }

  private assistantError(message: string): AssistantMessage {
    return {
      stopReason: "error",
      errorMessage: message,
      content: [],
      api: this.model.api,
      provider: this.model.provider,
      model: this.model.id,
      usage: {},
      timestamp: Date.now(),
    } as unknown as AssistantMessage;
  }

  private async callLLM(context: import("@earendil-works/pi-ai").Context, signal?: AbortSignal): Promise<AssistantMessage> {
    if (isAborted(signal)) return this.assistantError("aborted");

    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    signal?.addEventListener("abort", relayAbort, { once: true });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const completion = complete(this.model, context, {
        apiKey: this.apiKey,
        signal: controller.signal,
        onPayload: (payload) => {
          // parallel_tool_calls: false 减少并发调用（gpt-5.5 并发时 pi-ai 流式解析有 bug）
          if (payload && typeof payload === "object") {
            (payload as Record<string, unknown>)["parallel_tool_calls"] = false;
          }
          return payload;
        },
      });

      const bounded = new Promise<AssistantMessage>((resolve) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          resolve(this.assistantError(`LLM request timed out after ${this.llmTimeoutMs}ms`));
        }, this.llmTimeoutMs);
        signal?.addEventListener("abort", () => resolve(this.assistantError("aborted")), { once: true });
      });

      return await Promise.race([completion, bounded]);
    } catch (e) {
      if (isAborted(signal)) return this.assistantError("aborted");
      return this.assistantError(e instanceof Error ? e.message : String(e));
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", relayAbort);
    }
  }

  private isToolCallBudgetExceeded(state: LoopState): boolean {
    return this.maxToolCalls !== undefined && state.toolCallCount >= this.maxToolCalls;
  }

  private isWallTimeBudgetExceeded(startedAt: number, state: LoopState): boolean {
    if (this.maxWallTimeMs === undefined) return false;
    if (state.iteration === 0) return false;
    return Date.now() - startedAt >= this.maxWallTimeMs;
  }

  private isTokenBudgetExceeded(state: LoopState): boolean {
    return this.maxTokenEstimate !== undefined && (state.tokenEstimate ?? 0) > this.maxTokenEstimate;
  }

  private isProviderCostBudgetExceeded(state: LoopState): boolean {
    return this.maxProviderCostUsd !== undefined
      && state.providerUsage?.costStatus === "priced"
      && state.providerUsage.costUsd > this.maxProviderCostUsd;
  }

  private isRecoveryBudgetExceeded(recoveryAttempts: number): boolean {
    return this.maxRecoveryAttempts !== undefined && recoveryAttempts >= this.maxRecoveryAttempts;
  }

  private pushToolResult(
    state: LoopState,
    toolCall: ToolCall,
    content: string,
  ): void {
    const msg: ToolResultMessage = {
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: "text", text: content }],
      isError: false,
      timestamp: Date.now(),
    };
    state.messages.push(msg);
  }

  private result(
    state: LoopState,
    exitReason: ExitReason,
    override?: string,
    collector?: TrajectoryCollector,
    skillsUsed?: string[],
  ): LoopResult {
    const finalResponse = override ?? state.finalResponse ?? "(无输出)";
    const failure = failureSummaryForLoopExit(exitReason, finalResponse);
    vlog(`\n[engine] ■ 退出 reason=${exitReason} iterations=${state.iteration} checkpoints=${state.checkpointCount}`);

    const trajectory: Trajectory = collector
      ? collector.finalize({
          task: state.task,
          profile: state.task.profile,
          exitReason,
          finalResponse,
          skillsUsed: skillsUsed ?? [],
          estimatedTokens: state.tokenEstimate,
          providerUsage: state.providerUsage,
          ...(failure ? { failure } : {}),
        })
      : {
          task: state.task,
          profile: state.task.profile,
          exitReason,
          steps: [],
          finalResponse,
          durationMs: 0,
          skillsUsed: [],
          estimatedTokens: state.tokenEstimate,
          providerUsage: state.providerUsage,
          ...(failure ? { failure } : {}),
        };

    this._emit({ kind: "done", exitReason, finalResponse, ...(failure ? { failure } : {}) });

    return {
      exitReason,
      finalResponse,
      iterations: state.iteration,
      checkpointsPassed: state.checkpointCount,
      totalToolCalls: state.toolCallCount,
      estimatedTokens: state.tokenEstimate,
      providerUsage: state.providerUsage,
      trajectory,
      ...(failure ? { failure } : {}),
    };
  }
}

function estimateContextTokens(context: Context): number {
  const source = context as unknown as { messages?: unknown; tools?: unknown };
  const serialized = JSON.stringify({
    messages: source.messages ?? [],
    tools: source.tools ?? [],
  });
  return Math.max(1, Math.ceil(serialized.length / 4));
}

function approvalWithInheritedScopes(base: ApprovalGate, scopes: string[] | undefined): ApprovalGate {
  if (!scopes || scopes.length === 0) return base;
  return {
    async request(request: ApprovalRequest): Promise<boolean> {
      if (approvalScopeMatches(request.targetResource, scopes)) return true;
      return base.request(request);
    },
  };
}

function recoveryPayload(decision: import("./types.js").RecoverDecision): { decision: import("./types.js").RecoverDecision["kind"]; hint?: string; reason?: string } {
  if (decision.kind === "repair") return { decision: "repair", hint: decision.hint };
  if (decision.kind === "escalate") return { decision: "escalate", reason: decision.reason };
  return { decision: "retry" };
}
