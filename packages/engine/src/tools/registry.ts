import type { Tool as PiAiTool } from "@earendil-works/pi-ai";
import type { ApprovalRequest, ToolContext, ToolDef, ToolResult } from "./types.js";
import { err } from "./types.js";
import { redactObject } from "../redaction.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT = 30_000;

/**
 * 工具注册表：管理所有通用工具原语。
 *
 * 引擎不再写死 switch(toolName)，而是 registry.execute(name, args, ctx)。
 * 这把"引擎逻辑"和"工具实现"解耦——新增工具不改引擎。
 *
 * execute 统一负责：权限检查 → 审批门 → 超时 → 错误捕获 → 输出截断。
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): this {
    if (this.tools.has(tool.name)) {
      console.warn(`[registry] 工具重复注册，覆盖: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: ToolDef[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 转成发给 LLM 的 pi-ai Tool[]（可选过滤，如按步骤暴露子集）。 */
  toPiAiTools(filter?: (t: ToolDef) => boolean): PiAiTool[] {
    return this.list()
      .filter((t) => (filter ? filter(t) : true))
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
  }

  /**
   * 执行工具。统一处理权限、审批、超时、错误、截断。
   * 注意：checkpoint 工具（request_verification）由引擎拦截，不走这里。
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return err(`未知工具: ${name}`);
    }

    if (ctx.signal?.aborted) {
      return err(`工具 ${name} aborted`);
    }

    // 需要审批的工具统一过审批门；non-interactive gate 可按风险拒绝。
    if (requiresApproval(tool)) {
      const approval = buildApprovalRequest(tool, args, ctx);
      const approved = await ctx.approval.request(approval);
      ctx.onApprovalDecision?.({
        request: redactApprovalRequest(approval),
        approved,
        decidedAt: new Date().toISOString(),
      });
      if (ctx.signal?.aborted) {
        return err(`工具 ${name} aborted`);
      }
      if (!approved) {
        return err(`工具 ${name} 未获授权，已拒绝执行（risk=${tool.riskLevel}, permission=${tool.permission}）`);
      }
    }

    // 超时包装
    const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let result: ToolResult;
    try {
      result = await withTimeout(tool.execute(args, ctx), timeoutMs, name, ctx.signal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(`工具 ${name} 执行异常: ${msg}`);
    }

    // 输出截断
    const maxChars = tool.maxOutputChars ?? DEFAULT_MAX_OUTPUT;
    if (result.content.length > maxChars) {
      result = {
        ...result,
        content: result.content.slice(0, maxChars) + `\n…[输出截断，共 ${result.content.length} 字符]`,
      };
    }

    return result;
  }
}

function requiresApproval(tool: ToolDef): boolean {
  return tool.permission === "dangerous" || tool.riskLevel === "R3" || tool.riskLevel === "R4" || tool.riskLevel === "R5";
}

function buildApprovalRequest(tool: ToolDef, args: Record<string, unknown>, ctx: ToolContext): ApprovalRequest {
  return {
    toolName: tool.name,
    args,
    permission: tool.permission,
    riskLevel: tool.riskLevel,
    sideEffect: tool.sideEffect,
    reversible: tool.reversible,
    action: `执行工具 ${tool.name}`,
    targetResource: `workspace:${ctx.workspace}`,
    evidenceRequired: evidenceFor(tool),
    exposesSecrets: exposesSecrets(args),
  };
}

function redactApprovalRequest(request: ApprovalRequest): ApprovalRequest {
  return {
    ...request,
    args: redactObject(request.args),
  };
}

function evidenceFor(tool: ToolDef): string[] {
  if (tool.riskLevel === "R0") return [];
  if (tool.name.startsWith("file_")) return ["file path", "tool result"];
  if (tool.name.startsWith("browser_")) return ["current URL", "DOM/text state", "tool result"];
  if (tool.name === "shell") return ["command", "exit code", "stdout/stderr excerpt"];
  if (tool.permission === "dangerous") return ["approval decision", "post-action observation"];
  return ["tool result"];
}

function exposesSecrets(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/key|token|secret|password|authorization/i.test(key)) return true;
    if (exposesSecrets(nested)) return true;
  }
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(new Error(`${label} aborted`));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => finish(() => reject(new Error(`${label} aborted`)));
    const timer = setTimeout(() => finish(() => reject(new Error(`${label} 超时（${ms}ms）`))), ms);

    signal?.addEventListener("abort", onAbort, { once: true });
    p.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
