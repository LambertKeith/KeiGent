import { describe, it, expect } from "vitest";
import type { Tool } from "@earendil-works/pi-ai";
import { ConversationalAttention } from "../profiles/strategies.js";
import type { LoopState, SkillContext, SkillMeta, Task } from "../types.js";

const METAS: SkillMeta[] = [
  { name: "web-summarize", description: "fetch a webpage and summarize", tags: ["web", "fetch"] },
];

const skillContext: SkillContext = {
  metas: METAS,
  matched: [],
  loadBody: async () => null,
};

const task: Task = { goal: "你好", profile: "conversational" };
const state: LoopState = {
  task, iteration: 1, messages: [], snapshots: [],
  checkpointCount: 0, toolCallCount: 0, failed: false,
};

const tools: Tool[] = [
  { name: "ask_user", description: "ask", parameters: { type: "object", properties: {} } },
  { name: "fetch_url", description: "fetch", parameters: { type: "object", properties: {} } },
];

describe("ConversationalAttention", () => {
  const att = new ConversationalAttention("你是 KeiGent。");

  it("不匹配任何 skill（不触发学习）", () => {
    expect(att.matchSkills(task, METAS)).toEqual([]);
  });

  it("不注入 skill body", async () => {
    expect(await att.renderInjection([], skillContext)).toBe("");
  });

  it("每轮都暴露全部传入工具（ask_user 不被移除）", async () => {
    const ctx = await att.buildContext(state, skillContext, tools);
    const names = (ctx.tools ?? []).map((t) => t.name);
    expect(names).toContain("ask_user");
    expect(names).toContain("fetch_url");
  });

  it("system prompt 含动态 skill 索引（能力清单）", async () => {
    const ctx = await att.buildContext(state, skillContext, tools);
    expect(ctx.systemPrompt).toContain("web-summarize");
    expect(ctx.systemPrompt).toContain("你是 KeiGent。");
  });
});
