import { Type } from "@earendil-works/pi-ai";
import { WriteThroughMemory } from "../../memory.js";
import type { ToolContext, ToolDef } from "../types.js";
import { ok, err } from "../types.js";

/**
 * memory_recall —— 从长期记忆召回相关历史（关键词匹配）。
 */
export const memoryRecallTool: ToolDef = {
  name: "memory_recall",
  description: "从长期记忆中召回与查询相关的历史执行记录",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  parameters: Type.Object({
    query: Type.String({ description: "查询关键词" }),
    limit: Type.Optional(Type.Number({ description: "返回条数（默认 3）" })),
  }),
  async execute(args, ctx: ToolContext) {
    const query = String(args["query"] ?? "");
    if (!query) return err("memory_recall 需要 query 参数");
    if (!ctx.memoryDir) return ok("（未配置记忆目录，无可召回内容）");
    const limit = typeof args["limit"] === "number" ? args["limit"] : 3;
    const store = new WriteThroughMemory(ctx.memoryDir);
    const result = await store.recall(query, limit);
    return ok(result || "（无相关记忆）");
  },
};

/**
 * ask_user —— 向用户提问澄清。
 * 交互模式下真的弹问；非交互模式返回结构化降级错误。
 */
export const askUserTool: ToolDef = {
  name: "ask_user",
  description: "当任务信息不足、需要用户澄清时，向用户提问并获取回答",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  parameters: Type.Object({
    question: Type.String({ description: "向用户提出的问题" }),
  }),
  async execute(args, ctx: ToolContext) {
    const question = String(args["question"] ?? "");
    if (!question) return err("ask_user 需要 question 参数");
    if (!ctx.askUser) {
      return err(
        `non_interactive_input_required: 需要用户澄清但当前没有交互通道。` +
        ` question=${JSON.stringify(question)} nextAction=请在 REPL 中运行，或把缺失信息直接写进任务。`,
      );
    }
    const answer = await ctx.askUser(question);
    return ok(`用户回答: ${answer}`);
  },
};

export const agentTools: ToolDef[] = [memoryRecallTool, askUserTool];
