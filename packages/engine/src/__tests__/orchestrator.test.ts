import { describe, it, expect } from "vitest";
import { classifyByRules, __guardProfileChoice as guard } from "../orchestrator.js";
import type { SkillMeta, Task } from "../types.js";

// 复刻线上 skill 库：两个执行类 skill，描述含 fetch/extract
const METAS: SkillMeta[] = [
  { name: "web-summarize", description: "fetch a webpage and summarize its content", tags: ["web", "summarize", "fetch"] },
  { name: "data-extract", description: "extract structured data from a page", tags: ["data", "extract", "structured", "table"] },
];

const task = (goal: string, extra: Partial<Task> = {}): Task => ({ goal, profile: "auto", ...extra });

describe("classifyByRules — 规则4 误判修复", () => {
  it("闲聊「你好」在有执行 skill 的库里不再被判为 convergent-exec", () => {
    expect(classifyByRules(task("你好"), METAS)).not.toBe("convergent-exec");
  });

  it("真正相关任务仍判为 convergent-exec", () => {
    expect(classifyByRules(task("帮我用 web-summarize 总结这个网页"), METAS)).toBe("convergent-exec");
  });
});

describe("classifyByRules — 闲聊快路径", () => {
  it("「你好」走 conversational", () => {
    expect(classifyByRules(task("你好"), METAS)).toBe("conversational");
  });
  it("「谢谢」走 conversational", () => {
    expect(classifyByRules(task("谢谢"), METAS)).toBe("conversational");
  });
  it("短执行任务「用 web-summarize 总结网页」不被当闲聊", () => {
    expect(classifyByRules(task("用 web-summarize 总结网页"), METAS)).toBe("convergent-exec");
  });
  it("带 URL 的输入即使短也不当闲聊", () => {
    const r = classifyByRules(task("你好 https://example.com"), METAS);
    expect(r).not.toBe("conversational");
  });
  it("超 20 字的问候不进快路径（交后续规则/LLM）", () => {
    const long = "你好你好你好你好你好你好你好你好你好你好你好你好"; // 24 字
    expect(classifyByRules(task(long), METAS)).not.toBe("conversational");
  });
});

describe("guardProfileChoice — convergent-exec 错配兜底", () => {
  it("无匹配 skill 且无 successDef 的 convergent-exec → 改走 divergent-research（修复查天气崩溃）", () => {
    // 这正是「查询一下今天杭州的天气」的场景：LLM 选了 convergent-exec，
    // 但任务不匹配任何 skill，硬跑会反复凑 checkpoint 导致啰嗦/吐空 error。
    expect(guard("convergent-exec", task("查询一下今天杭州的天气"), METAS)).toBe("divergent-research");
  });

  it("匹配到 skill 的 convergent-exec 保持不变", () => {
    expect(guard("convergent-exec", task("用 web-summarize 总结网页"), METAS)).toBe("convergent-exec");
  });

  it("带 successDef+assertions 的 convergent-exec 保持不变", () => {
    const t = task("抓取页面", {
      successDef: { goal: "抓取成功", assertions: [{ description: "有 url", signal: "url" }] },
    });
    expect(guard("convergent-exec", t, METAS)).toBe("convergent-exec");
  });

  it("非 convergent-exec 的选择原样透传", () => {
    expect(guard("conversational", task("你好"), METAS)).toBe("conversational");
    expect(guard("divergent-research", task("调研 X"), METAS)).toBe("divergent-research");
  });
});
