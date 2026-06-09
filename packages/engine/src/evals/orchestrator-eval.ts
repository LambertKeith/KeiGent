import { __guardProfileChoice, classifyByRulesDetailed, type ProfileName, type ProfileSelectionRuleId } from "../orchestrator.js";
import type { SkillMeta, Task } from "../types.js";
import type { RiskLevel } from "../tools/types.js";

export type RoutingWorkflowMode = "single-loop" | "verified-loop" | "reviewed-loop" | "fanout" | "none";

export interface OrchestratorEvalCase {
  id: string;
  task: Task;
  metas: SkillMeta[];
  expectedProfile: ProfileName;
  expectedMethod: "rule";
  expectedRuleId?: ProfileSelectionRuleId;
  expectedWorkflowMode?: RoutingWorkflowMode;
  riskLevel?: RiskLevel;
  requiresClarification?: boolean;
  requiresApproval?: boolean;
  rationaleMustInclude?: string[];
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
  workflowMode?: RoutingWorkflowMode;
  expectedWorkflowMode?: RoutingWorkflowMode;
  riskLevel?: RiskLevel;
  expectedRiskLevel?: RiskLevel;
  requiresClarification?: boolean;
  expectedRequiresClarification?: boolean;
  requiresApproval?: boolean;
  expectedRequiresApproval?: boolean;
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

function inferWorkflowMode(profile: ProfileName | null): RoutingWorkflowMode {
  return profile === "convergent-verified" ? "verified-loop" : "single-loop";
}

function inferRiskLevel(task: Task): RiskLevel {
  const goal = task.goal.toLowerCase();
  if (/生产|删除|付款|支付|发布|发送|rm\s+-rf|delete production|payment|deploy|publish/.test(goal)) return "R5";
  if (/shell|命令|安装|http[-_ ]?request|调用|外部|submit|提交|download|下载/.test(goal)) return "R3";
  if (/写|创建|修改|file_write|browser|打开|填写|表单/.test(goal)) return "R2";
  if (/调研|分析|比较|research|analyze|compare|overview/.test(goal)) return "R1";
  return "R0";
}

function inferRequiresClarification(task: Task): boolean {
  const goal = task.goal.trim();
  return /^(帮我)?(处理|弄|搞|看)(一下)?(这个|一下)?[\s!！。.]*$/i.test(goal)
    || /帮我处理一下这个|帮我弄一下|处理这个|看一下这个/.test(goal);
}

function inferRequiresApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === "R3" || riskLevel === "R4" || riskLevel === "R5";
}

function productRationale(opts: {
  decisionRationale: string;
  selectedProfile: ProfileName | null;
  workflowMode: RoutingWorkflowMode;
  riskLevel: RiskLevel;
  requiresClarification: boolean;
  requiresApproval: boolean;
}): string {
  return [
    opts.decisionRationale,
    `profile:${opts.selectedProfile ?? "unclassified"}`,
    `workflow:${opts.workflowMode}`,
    `risk:${opts.riskLevel}`,
    opts.requiresClarification ? "clarification|required" : "clarification:not_required",
    opts.requiresApproval ? "approval|required" : "approval:not_required",
  ].join("；");
}

function defaultRationaleTerms(evalCase: OrchestratorEvalCase): string[] {
  return [`profile:${evalCase.expectedProfile}`];
}

function completeRoutingCase(evalCase: OrchestratorEvalCase): OrchestratorEvalCase {
  const riskLevel = evalCase.riskLevel ?? inferRiskLevel(evalCase.task);
  return {
    ...evalCase,
    expectedWorkflowMode: evalCase.expectedWorkflowMode ?? inferWorkflowMode(evalCase.expectedProfile),
    riskLevel,
    requiresClarification: evalCase.requiresClarification ?? inferRequiresClarification(evalCase.task),
    requiresApproval: evalCase.requiresApproval ?? inferRequiresApproval(riskLevel),
    rationaleMustInclude: evalCase.rationaleMustInclude ?? defaultRationaleTerms(evalCase),
  };
}

export const DEFAULT_ORCHESTRATOR_EVAL_CASES: OrchestratorEvalCase[] = ([
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
  {
    id: "capability-question",
    task: { goal: "你能做什么", profile: "auto" },
    expectedProfile: "conversational",
    expectedMethod: "rule",
    expectedRuleId: "conversation_or_clarification",
    metas: [],
  },
  {
    id: "ambiguous-handle-this",
    task: { goal: "帮我处理一下这个", profile: "auto" },
    expectedProfile: "conversational",
    expectedMethod: "rule",
    expectedRuleId: "conversation_or_clarification",
    requiresClarification: true,
    metas: [],
  },
  {
    id: "clarification-look-this",
    task: { goal: "看一下这个", profile: "auto" },
    expectedProfile: "conversational",
    expectedMethod: "rule",
    expectedRuleId: "conversation_or_clarification",
    requiresClarification: true,
    metas: [],
  },
  {
    id: "research-evaluate-cn",
    task: { goal: "评估 workflow policy 的边界", profile: "auto" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "research_keyword",
    metas: [],
  },
  {
    id: "research-overview-en",
    task: { goal: "overview of browser automation evidence models", profile: "auto" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "research_keyword",
    metas: [],
  },
  {
    id: "research-explore-en",
    task: { goal: "explore local runtime failure recovery options", profile: "auto" },
    expectedProfile: "divergent-research",
    expectedMethod: "rule",
    expectedRuleId: "research_keyword",
    metas: [],
  },
  {
    id: "file-read-skill",
    task: { goal: "请用 file-read workflow 读取 hello.txt", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    metas: [{ name: "file-read", description: "Read files deterministically", tags: ["workflow", "file", "read"] }],
  },
  {
    id: "shell-run-skill",
    task: { goal: "运行 shell-run workflow 执行 pnpm check", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    riskLevel: "R3",
    requiresApproval: true,
    metas: [{ name: "shell-run", description: "Run shell commands with approval", tags: ["shell", "run", "workflow"] }],
  },
  {
    id: "browser-open-url",
    task: { goal: "打开 https://example.com/dashboard", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    metas: [{ name: "browser-open", description: "Open browser URL 打开网页", tags: ["browser", "open", "url", "打开"] }],
  },
  {
    id: "browser-download-url",
    task: { goal: "下载 https://example.com/report.csv", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    riskLevel: "R3",
    requiresApproval: true,
    metas: [{ name: "browser-download", description: "Download browser files", tags: ["browser", "download", "url"] }],
  },
  {
    id: "url-submit-en",
    task: { goal: "submit https://example.com/form after filling required fields", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    riskLevel: "R3",
    requiresApproval: true,
    metas: [{ name: "browser-submit", description: "Submit browser forms", tags: ["browser", "submit", "url"] }],
  },
  {
    id: "url-extract-en",
    task: { goal: "extract https://example.com metadata", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "url_execution_keyword",
    metas: [{ name: "web-extract", description: "Extract URL metadata", tags: ["web", "extract", "url"] }],
  },
  {
    id: "verified-browser-submit",
    task: {
      goal: "提交表单并确认页面显示成功",
      profile: "auto",
      successDef: { goal: "提交成功", assertions: [{ description: "页面显示成功", signal: "text" }] },
    },
    expectedProfile: "convergent-verified",
    expectedMethod: "rule",
    expectedRuleId: "success_def_assertions",
    riskLevel: "R3",
    requiresApproval: true,
    metas: [],
  },
  {
    id: "verified-payment-confirm",
    task: {
      goal: "支付订单并确认支付成功",
      profile: "auto",
      successDef: { goal: "支付成功", assertions: [{ description: "订单状态为 paid", signal: "text" }] },
    },
    expectedProfile: "convergent-verified",
    expectedMethod: "rule",
    expectedRuleId: "success_def_assertions",
    riskLevel: "R5",
    requiresApproval: true,
    metas: [],
  },
  {
    id: "verified-delete-production",
    task: {
      goal: "删除生产缓存并确认服务恢复",
      profile: "auto",
      successDef: { goal: "服务恢复", assertions: [{ description: "healthcheck 通过", signal: "text" }] },
    },
    expectedProfile: "convergent-verified",
    expectedMethod: "rule",
    expectedRuleId: "success_def_assertions",
    riskLevel: "R5",
    requiresApproval: true,
    metas: [],
  },
  {
    id: "verified-publish-release",
    task: {
      goal: "发布 release 并确认版本可见",
      profile: "auto",
      successDef: { goal: "版本可见", assertions: [{ description: "release 页面显示版本", signal: "text" }] },
    },
    expectedProfile: "convergent-verified",
    expectedMethod: "rule",
    expectedRuleId: "success_def_assertions",
    riskLevel: "R5",
    requiresApproval: true,
    metas: [],
  },
  {
    id: "explicit-exec-with-skill",
    task: { goal: "用 file-write skill 创建配置文件", profile: "convergent-exec" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "explicit_profile",
    metas: [{ name: "file-write", description: "Write files deterministically", tags: ["file", "write", "skill"] }],
  },
  {
    id: "skill-match-http-request",
    task: { goal: "使用 http-request workflow 调用内部健康检查", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    riskLevel: "R3",
    requiresApproval: true,
    metas: [{ name: "http-request", description: "Call HTTP endpoints", tags: ["http", "request", "workflow"] }],
  },
  {
    id: "skill-match-memory",
    task: { goal: "使用 memory-recall workflow 读取项目记忆", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    metas: [{ name: "memory-recall", description: "Read memory entries", tags: ["memory", "recall", "workflow"] }],
  },
  {
    id: "skill-match-dashboard",
    task: { goal: "运行 dashboard-report workflow 汇总 eval 报告", profile: "auto" },
    expectedProfile: "convergent-exec",
    expectedMethod: "rule",
    expectedRuleId: "skill_match",
    metas: [{ name: "dashboard-report", description: "Render eval dashboard reports", tags: ["dashboard", "report", "workflow"] }],
  },
] satisfies OrchestratorEvalCase[]).map(completeRoutingCase);

export function runOrchestratorEvalCases(evalCases: OrchestratorEvalCase[]): OrchestratorEvalReport {
  const cases = evalCases.map<OrchestratorEvalCaseResult>((evalCase) => {
    const completedCase = completeRoutingCase(evalCase);
    const decision = classifyByRulesDetailed(evalCase.task, evalCase.metas);
    const unguardedProfile = decision?.profile ?? null;
    const selectedProfile = decision ? __guardProfileChoice(decision.profile, evalCase.task, evalCase.metas) : null;
    const workflowMode = inferWorkflowMode(selectedProfile);
    const riskLevel = inferRiskLevel(evalCase.task);
    const requiresClarification = inferRequiresClarification(evalCase.task);
    const requiresApproval = inferRequiresApproval(riskLevel);
    const rationale = productRationale({
      decisionRationale: decision?.rationale ?? "规则无法判断",
      selectedProfile,
      workflowMode,
      riskLevel,
      requiresClarification,
      requiresApproval,
    });
    const failures: string[] = [];

    if (!decision) {
      failures.push("expected rule classification, got unclassified");
    }
    if (selectedProfile !== completedCase.expectedProfile) {
      failures.push(`expected profile ${completedCase.expectedProfile}, got ${selectedProfile ?? "(none)"}`);
    }
    if (completedCase.expectedRuleId && decision?.ruleId !== completedCase.expectedRuleId) {
      failures.push(`expected rule ${completedCase.expectedRuleId}, got ${decision?.ruleId ?? "(none)"}`);
    }
    if (workflowMode !== completedCase.expectedWorkflowMode) {
      failures.push(`expected workflow ${completedCase.expectedWorkflowMode}, got ${workflowMode}`);
    }
    if (riskLevel !== completedCase.riskLevel) {
      failures.push(`expected risk ${completedCase.riskLevel}, got ${riskLevel}`);
    }
    if (requiresClarification !== completedCase.requiresClarification) {
      failures.push(`expected requiresClarification ${completedCase.requiresClarification}, got ${requiresClarification}`);
    }
    if (requiresApproval !== completedCase.requiresApproval) {
      failures.push(`expected requiresApproval ${completedCase.requiresApproval}, got ${requiresApproval}`);
    }
    for (const expectedText of completedCase.rationaleMustInclude ?? []) {
      if (!rationale.includes(expectedText)) {
        failures.push(`rationale missing expected text: ${expectedText}`);
      }
    }
    if (riskLevel === "R5" && selectedProfile === "convergent-exec" && workflowMode !== "verified-loop") {
      failures.push("R5 task selected plain convergent-exec without verified workflow");
    }

    return {
      id: completedCase.id,
      passed: failures.length === 0,
      selectedProfile,
      unguardedProfile,
      expectedProfile: completedCase.expectedProfile,
      method: decision?.method ?? "unclassified",
      expectedMethod: completedCase.expectedMethod,
      ruleId: decision?.ruleId,
      expectedRuleId: completedCase.expectedRuleId,
      guardApplied: Boolean(decision && selectedProfile !== decision.profile),
      workflowMode,
      expectedWorkflowMode: completedCase.expectedWorkflowMode,
      riskLevel,
      expectedRiskLevel: completedCase.riskLevel,
      requiresClarification,
      expectedRequiresClarification: completedCase.requiresClarification,
      requiresApproval,
      expectedRequiresApproval: completedCase.requiresApproval,
      rationale,
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
