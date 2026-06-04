import { __guardProfileChoice, classifyByRulesDetailed, type ProfileName, type ProfileSelectionRuleId } from "../orchestrator.js";
import type { SkillMeta, Task } from "../types.js";

export interface OrchestratorEvalCase {
  id: string;
  task: Task;
  metas: SkillMeta[];
  expectedProfile: ProfileName;
  expectedMethod: "rule";
  expectedRuleId?: ProfileSelectionRuleId;
}

export interface OrchestratorEvalCaseResult {
  id: string;
  passed: boolean;
  selectedProfile: ProfileName | null;
  unguardedProfile: ProfileName | null;
  expectedProfile: ProfileName;
  method: "rule" | "unclassified";
  expectedMethod: "rule";
  ruleId?: ProfileSelectionRuleId;
  expectedRuleId?: ProfileSelectionRuleId;
  guardApplied: boolean;
  rationale: string;
  signals: string[];
  failures: string[];
}

export interface OrchestratorEvalReport {
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  cases: OrchestratorEvalCaseResult[];
}

export const DEFAULT_ORCHESTRATOR_EVAL_CASES: OrchestratorEvalCase[] = [
  {
    id: "hello-cn",
    task: { goal: "你好", profile: "auto" },
    expectedProfile: "conversational",
    expectedMethod: "rule",
    expectedRuleId: "obvious_chitchat",
    metas: [],
  },
  {
    id: "hello-en",
    task: { goal: "hello", profile: "auto" },
    expectedProfile: "conversational",
    expectedMethod: "rule",
    expectedRuleId: "obvious_chitchat",
    metas: [],
  },
  {
    id: "thanks-cn",
    task: { goal: "谢谢", profile: "auto" },
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
    id: "analyze-en",
    task: { goal: "analyze how loop profiles affect agent behavior", profile: "auto" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "research_keyword",
    metas: [],
  },
  {
    id: "compare-cn",
    task: { goal: "比较 convergent 和 divergent loop 的适用场景", profile: "auto" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "research_keyword",
    metas: [],
  },
  {
    id: "url-summarize-cn",
    task: { goal: "总结 https://example.com 的内容", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    metas: [{ name: "web-summarize", description: "Summarize fetch extract URL web pages", tags: ["web", "url", "summarize", "fetch", "extract"] }],
  },
  {
    id: "url-fetch-en",
    task: { goal: "fetch https://example.com and extract the title", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    metas: [{ name: "web-summarize", description: "Summarize fetch extract URL web pages", tags: ["web", "url", "summarize", "fetch", "extract"] }],
  },
  {
    id: "explicit-divergent",
    task: { goal: "随便聊聊这个想法", profile: "divergent-research" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "explicit_profile",
    metas: [],
  },
  {
    id: "skill-match-file",
    task: { goal: "请用 file-write workflow 创建 hello.txt", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    metas: [{ name: "file-write", description: "Write files deterministically", tags: ["workflow", "file", "write"] }],
  },
  {
    id: "skill-match-browser",
    task: { goal: "运行 browser-submit workflow 提交表单", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    metas: [{ name: "browser-submit", description: "Submit browser forms", tags: ["browser", "submit", "workflow"] }],
  },
];

export function runOrchestratorEvalCases(evalCases: OrchestratorEvalCase[]): OrchestratorEvalReport {
  const cases = evalCases.map<OrchestratorEvalCaseResult>((evalCase) => {
    const decision = classifyByRulesDetailed(evalCase.task, evalCase.metas);
    const unguardedProfile = decision?.profile ?? null;
    const selectedProfile = decision ? __guardProfileChoice(decision.profile, evalCase.task, evalCase.metas) : null;
    const failures: string[] = [];

    if (!decision) {
      failures.push("expected rule classification, got unclassified");
    }
    if (selectedProfile !== evalCase.expectedProfile) {
      failures.push(`expected profile ${evalCase.expectedProfile}, got ${selectedProfile ?? "(none)"}`);
    }
    if (evalCase.expectedRuleId && decision?.ruleId !== evalCase.expectedRuleId) {
      failures.push(`expected rule ${evalCase.expectedRuleId}, got ${decision?.ruleId ?? "(none)"}`);
    }

    return {
      id: evalCase.id,
      passed: failures.length === 0,
      selectedProfile,
      unguardedProfile,
      expectedProfile: evalCase.expectedProfile,
      method: decision?.method ?? "unclassified",
      expectedMethod: evalCase.expectedMethod,
      ruleId: decision?.ruleId,
      expectedRuleId: evalCase.expectedRuleId,
      guardApplied: Boolean(decision && selectedProfile !== decision.profile),
      rationale: decision?.rationale ?? "规则无法判断",
      signals: decision?.signals ?? [],
      failures,
    };
  });
  const passed = cases.filter((c) => c.passed).length;
  return {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    profileAccuracy: cases.length === 0 ? null : cases.filter((c) => c.selectedProfile === c.expectedProfile).length / cases.length,
    cases,
  };
}
