import { vlog, vwarn } from "./logger.js";
import { complete, type AssistantMessage, type Model, type Tool, type ToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
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
import { deduplicateToolCalls, extractToolCalls, stripThinkBlocks } from "./utils.js";
import { ToolRegistry, CHECKPOINT_TOOL_NAME, type ToolContext, type ApprovalGate } from "./tools/index.js";
import { AllowAllGate } from "./tools/types.js";

const CHECKPOINT_TOOL = CHECKPOINT_TOOL_NAME;

export interface EngineOptions {
  model: Model<"openai-completions">;
  apiKey: string;
  maxIterations?: number;
  registry: ToolRegistry;       // 工具注册表（B0：工具与引擎解耦）
  workspace?: string;           // 文件沙箱根目录
  approval?: ApprovalGate;      // dangerous 工具审批门
  headless?: boolean;           // 浏览器可见性
  askUser?: (question: string) => Promise<string>;  // 交互提问回调（CLI 注入，单次模式不传）
}

export class LoopEngine {
  private readonly model: Model<"openai-completions">;
  private readonly apiKey: string;
  private readonly maxIterations: number;
  private readonly registry: ToolRegistry;
  private readonly workspace: string;
  private readonly approval: ApprovalGate;
  private readonly headless: boolean;
  private readonly askUser?: (question: string) => Promise<string>;
  private _emit: ProgressCallback = () => {};

  constructor(opts: EngineOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.maxIterations = opts.maxIterations ?? 10;
    this.registry = opts.registry;
    this.workspace = opts.workspace ?? process.cwd();
    this.approval = opts.approval ?? new AllowAllGate();
    this.headless = opts.headless ?? false;
    this.askUser = opts.askUser;
  }

  async run(
    task: Task,
    skillContext: SkillContext,
    profile: LoopProfile,
    stateCapture: StateCapture,
    availableTools: Tool[],
    onProgress?: ProgressCallback,
  ): Promise<LoopResult> {
    const emit = onProgress ?? (() => {});
    this._emit = emit;     // result() 用它发 done 事件
    vlog(`\n[engine] ▶ profile=${profile.name} goal="${task.goal}"`);

    // 重置 profile 实例级可变状态，确保 profile 复用安全（S2/S3 修复）
    profile.attention.reset();
    profile.recover.reset();

    // 轨迹收集器——贯穿整个 run 方法
    const collector = new TrajectoryCollector();

    // 工具执行上下文（B0：工具通过 registry 执行）
    const toolCtx: ToolContext = {
      workspace: this.workspace,
      browser: null,        // B1 懒启动浏览器会话后填充
      approval: this.approval,
      task,
      headless: this.headless,
      askUser: this.askUser,
    };

    // AttentionStrategy 决定匹配哪些 skill
    const matchedSkills = profile.attention.matchSkills(task, skillContext.metas);
    skillContext = { ...skillContext, matched: matchedSkills };
    vlog(`[engine] matched skills: [${matchedSkills.join(", ") || "none"}]`);
    emit({ kind: "skills_matched", skills: matchedSkills });

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
      failed: false,
    };

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
      if (state.iteration >= this.maxIterations) {
        vlog(`[engine] 达到最大迭代次数 ${this.maxIterations}`);
        return this.result(state, "max_iterations");
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

      // LLM 调用
      const response = await this.callLLM(context);

      if (response.stopReason === "error") {
        console.error(`[engine] LLM 错误: ${response.errorMessage}`);
        state.failed = true;
        return this.result(state, "error", `[错误] ${response.errorMessage}`);
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
          const snapshot = await stateCapture.capture();
          state.snapshots.push(snapshot);
          vlog(`[engine] StateCapture → url=${snapshot.url ?? "n/a"}`);

          // 裁判验证
          const verdict = await profile.verify.check(
            snapshot,
            task.successDef,
            skillContext,
          );
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
            const decision = await profile.recover.handle(state, verdict);
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
        const toolRes = await this.registry.execute(
          toolCall.name,
          toolCall.arguments as Record<string, unknown>,
          toolCtx,
        );
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
      await profile.memory.maybePersist(state);
    }

    return this.result(state, "success", undefined, collector, matchedSkills);
  }

  private async callLLM(context: import("@earendil-works/pi-ai").Context): Promise<AssistantMessage> {
    return complete(this.model, context, {
      apiKey: this.apiKey,
      onPayload: (payload) => {
        // parallel_tool_calls: false 减少并发调用（gpt-5.5 并发时 pi-ai 流式解析有 bug）
        if (payload && typeof payload === "object") {
          (payload as Record<string, unknown>)["parallel_tool_calls"] = false;
        }
        return payload;
      },
    });
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
    vlog(`\n[engine] ■ 退出 reason=${exitReason} iterations=${state.iteration} checkpoints=${state.checkpointCount}`);

    const trajectory: Trajectory = collector
      ? collector.finalize({
          task: state.task,
          profile: state.task.profile,
          exitReason,
          finalResponse,
          skillsUsed: skillsUsed ?? [],
        })
      : {
          task: state.task,
          profile: state.task.profile,
          exitReason,
          steps: [],
          finalResponse,
          durationMs: 0,
          skillsUsed: [],
        };

    this._emit({ kind: "done", exitReason, finalResponse });

    return {
      exitReason,
      finalResponse,
      iterations: state.iteration,
      checkpointsPassed: state.checkpointCount,
      totalToolCalls: state.toolCallCount,
      trajectory,
    };
  }
}
