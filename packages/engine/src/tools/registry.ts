import type { Tool as PiAiTool } from "@earendil-works/pi-ai";
import type { ToolContext, ToolDef, ToolResult } from "./types.js";
import { err } from "./types.js";

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

    // dangerous 工具过审批门
    if (tool.permission === "dangerous") {
      const approved = await ctx.approval.request(name, args);
      if (!approved) {
        return err(`工具 ${name} 未获授权，已拒绝执行`);
      }
    }

    // 超时包装
    const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let result: ToolResult;
    try {
      result = await withTimeout(tool.execute(args, ctx), timeoutMs, name);
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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
    ),
  ]);
}
