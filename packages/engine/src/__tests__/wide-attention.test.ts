import { describe, it, expect } from "vitest";
import { WideAttention } from "../profiles/strategies.js";
import type { SkillMeta, Task } from "../types.js";

const METAS: SkillMeta[] = [
  { name: "web-summarize", description: "fetch a webpage and summarize its content", tags: ["web", "summarize", "fetch"] },
  { name: "data-extract", description: "extract structured data from a page", tags: ["data", "extract", "structured", "table"] },
];

const task = (goal: string): Task => ({ goal, profile: "divergent-research" });

describe("WideAttention.matchSkills — 只匹配相关 skill（防学习误触发）", () => {
  const att = new WideAttention("调研助手");

  it("无关任务（查天气）匹配 0 篇 → skillsUsed 为空 → 不触发学习", () => {
    expect(att.matchSkills(task("查询一下温州的天气"), METAS)).toEqual([]);
  });

  it("无关任务（推荐穿搭）匹配 0 篇", () => {
    expect(att.matchSkills(task("推荐一下穿搭"), METAS)).toEqual([]);
  });

  it("相关任务命中对应 skill", () => {
    expect(att.matchSkills(task("帮我总结这个网页"), METAS)).toContain("web-summarize");
  });
});
