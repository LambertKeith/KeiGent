import { describe, expect, it } from "vitest";
import { DEFAULT_ORCHESTRATOR_EVAL_CASES, runOrchestratorEvalCases } from "../evals/orchestrator-eval.js";
import type { OrchestratorEvalCase } from "../evals/orchestrator-eval.js";

const cases: OrchestratorEvalCase[] = [
  {
    id: "hello-cn",
    task: { goal: "你好", profile: "auto" },
    expectedProfile: "conversational",
    expectedMethod: "rule",
    expectedRuleId: "obvious_chitchat",
    metas: [],
  },
  {
    id: "verified-success-def",
    task: {
      goal: "打开页面并确认提交成功",
      profile: "auto",
      successDef: { goal: "提交成功", assertions: [{ description: "页面显示成功", signal: "text" }] },
    },
    expectedProfile: "convergent-verified",
    expectedMethod: "rule",
    expectedRuleId: "success_def_assertions",
    metas: [],
  },
  {
    id: "research-cn",
    task: { goal: "调研 KeiGent 和普通 coding agent 的区别", profile: "auto" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "research_keyword",
    metas: [],
  },
  {
    id: "url-exec",
    task: { goal: "总结 https://example.com 的内容", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    metas: [{ name: "web-summarize", description: "Summarize fetch extract URL web pages", tags: ["web", "url", "summarize", "fetch", "extract"] }],
  },
];

describe("orchestrator eval", () => {
  it("evaluates deterministic rule profile selection with rationales", () => {
    const report = runOrchestratorEvalCases(cases);

    expect(report.total).toBe(4);
    expect(report.passed).toBe(4);
    expect(report.profileAccuracy).toBe(1);
    expect(report.cases.map((c) => c.ruleId)).toEqual([
      "obvious_chitchat",
      "success_def_assertions",
      "research_keyword",
      "url_execution_keyword",
    ]);
    expect(report.cases.every((c) => c.rationale.length > 0)).toBe(true);
  });

  it("records guard corrections as failed when expected profile does not account for guard", () => {
    const report = runOrchestratorEvalCases([
      {
        id: "guarded",
        task: { goal: "打开本地文件", profile: "convergent-exec" },
        expectedProfile: "convergent-exec",
        expectedMethod: "rule",
        expectedRuleId: "explicit_profile",
        metas: [],
      },
    ]);

    expect(report.passed).toBe(0);
    expect(report.cases[0]).toMatchObject({
      selectedProfile: "divergent-research",
      unguardedProfile: "convergent-exec",
      guardApplied: true,
      failures: ["expected profile convergent-exec, got divergent-research"],
    });
  });

  it("reports null profile accuracy for empty matrices instead of fake 100%", () => {
    const report = runOrchestratorEvalCases([]);
    expect(report.total).toBe(0);
    expect(report.profileAccuracy).toBeNull();
  });

  it("ships with enough default fixtures to catch obvious profile regressions", () => {
    expect(DEFAULT_ORCHESTRATOR_EVAL_CASES.length).toBeGreaterThanOrEqual(12);
    const report = runOrchestratorEvalCases(DEFAULT_ORCHESTRATOR_EVAL_CASES);
    expect(report.failed).toBe(0);
    expect(report.profileAccuracy).toBe(1);
  });
});
