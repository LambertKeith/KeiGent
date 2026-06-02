import { describe, it, expect } from "vitest";
import { classifyByRules } from "../orchestrator.js";
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
