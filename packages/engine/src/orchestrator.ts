import { vlog, vwarn } from "./logger.js";
import { complete, type Api, type Model } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { LoopProfile, SkillMeta, Task } from "./types.js";
import { makeConvergentExecProfile } from "./profiles/convergent-exec.js";
import { makeDivergentResearchProfile } from "./profiles/divergent-research.js";
import { makeConvergentVerifiedProfile } from "./profiles/convergent-verified.js";
import { makeConversationalProfile } from "./profiles/conversational.js";
import { extractToolCalls } from "./utils.js";
import { scoreSkill } from "./profiles/strategies.js";

// ── Profile 注册表 ────────────────────────────────────────────────────

export type ProfileName = "convergent-exec" | "convergent-verified" | "divergent-research" | "conversational";

// convergent-exec 的 skill 匹配阈值：scoreSkill 中 name 命中 +10、tags 命中 +2、
// description 弱命中 +1。设为 2 可滤掉「仅 description 弱命中一个英文词」的噪声。
// 规则分类（rule 4）和兜底守卫（guardProfileChoice）共用此阈值。
const SKILL_MATCH_THRESHOLD = 2;

export interface ProfileRegistry {
  get(name: ProfileName): LoopProfile;
  names(): ProfileName[];
}

export type ProfileSelectionRuleId =
  | "explicit_profile"
  | "obvious_chitchat"
  | "success_def_assertions"
  | "research_keyword"
  | "url_execution_keyword"
  | "skill_match";

export interface ProfileClassificationDecision {
  profile: ProfileName;
  method: "rule";
  ruleId: ProfileSelectionRuleId;
  rationale: string;
  signals: string[];
}

export interface RegistryOptions {
  memoryDir?: string;
  skillsUsed?: string[];
  model?: Model<Api>;
  apiKey?: string;
}

function makeDefaultRegistry(opts: RegistryOptions = {}): ProfileRegistry {
  const { memoryDir = ".keigent/memory", skillsUsed = [] } = opts;
  return {
    get(name) {
      switch (name) {
        case "convergent-exec":
          return makeConvergentExecProfile(2);
        case "convergent-verified":
          // 需要 model + apiKey（裁判调用 LLM）
          if (!opts.model || !opts.apiKey) {
            vwarn("[registry] convergent-verified 需要 model + apiKey，降级为 convergent-exec");
            return makeConvergentExecProfile(2);
          }
          return makeConvergentVerifiedProfile(opts.model, opts.apiKey);
        case "divergent-research":
          return makeDivergentResearchProfile(memoryDir, skillsUsed);
        case "conversational":
          return makeConversationalProfile();
      }
    },
    names: () => ["convergent-exec", "convergent-verified", "divergent-research", "conversational"],
  };
}

export const defaultRegistry = makeDefaultRegistry();

export function makeRegistry(opts: RegistryOptions): ProfileRegistry {
  return makeDefaultRegistry(opts);
}

// ── 规则分类（档位 2）────────────────────────────────────────────────

/**
 * 高置信度闲聊识别（零 LLM）。只拦最高频最确定的纯问候/感谢；
 * 故意从严——漏判会落到 LLM 意图兜底，误判才是要避免的。
 */
function isObviousChitchat(task: Task): boolean {
  if (task.successDef) return false;
  const goal = task.goal.trim();
  if (/https?:\/\//.test(goal) || goal.length > 20) return false;
  return [
    /^(你好|您好|hi|hello|hey|嗨|在吗|早|晚上好)[\s!！。.~]*$/i,
    /^(谢谢|感谢|thanks|thank\s?you|好的|ok|okay|拜拜|再见|bye)[\s!！。.~]*$/i,
  ].some((p) => p.test(goal));
}

/**
 * 基于任务硬信号选择 profile，无需 LLM 调用。
 * 返回 null 表示规则无法确定，需要升级到分类 agent。
 */
export function classifyByRulesDetailed(task: Task, metas: SkillMeta[]): ProfileClassificationDecision | null {
  // 规则 0：显式指定 profile → 直接用（向后兼容）。
  // 仅放行这两个由 task.profile 字段直接指定的 profile：convergent-verified 需要 model+apiKey
  // 不宜走这条无参路径，conversational 只应由闲聊识别或 /profile 手动强制触发。
  const explicitProfiles: ProfileName[] = ["convergent-exec", "divergent-research"];
  if (task.profile && explicitProfiles.includes(task.profile as ProfileName)) {
    return {
      profile: task.profile as ProfileName,
      method: "rule",
      ruleId: "explicit_profile",
      rationale: `任务显式指定 profile=${task.profile}`,
      signals: [`profile:${task.profile}`],
    };
  }

  // 规则 0.5：高置信度闲聊 → 对话兜底（在所有任务规则之前，但尊重规则0的显式指定）
  if (isObviousChitchat(task)) {
    return {
      profile: "conversational",
      method: "rule",
      ruleId: "obvious_chitchat",
      rationale: "任务是短问候/感谢等高置信度闲聊，无需工具或研究循环",
      signals: ["short_chitchat"],
    };
  }

  // 规则 1：有 successDef + assertions → 用真实裁判的验证收敛 profile
  if (task.successDef && task.successDef.assertions.length > 0) {
    return {
      profile: "convergent-verified",
      method: "rule",
      ruleId: "success_def_assertions",
      rationale: "任务携带 successDef assertions，需要验证型收敛执行",
      signals: [`assertions:${task.successDef.assertions.length}`],
    };
  }

  const goal = task.goal.toLowerCase();

  // 规则 2：目标含开放探索词 → 发散研究
  const researchKeywords = [
    "调研", "分析", "了解", "探索", "研究", "比较", "评估",
    "overview", "research", "analyze", "explore", "compare",
  ];
  const matchedResearchKeyword = researchKeywords.find((kw) => goal.includes(kw));
  if (matchedResearchKeyword) {
    return {
      profile: "divergent-research",
      method: "rule",
      ruleId: "research_keyword",
      rationale: `任务包含开放探索关键词 ${matchedResearchKeyword}`,
      signals: [`keyword:${matchedResearchKeyword}`],
    };
  }

  // 规则 3：目标含具体执行词 + URL → 收敛执行
  const executionKeywords = [
    "抓取", "总结", "提取", "填写", "发送", "创建", "下载", "打开",
    "fetch", "summarize", "extract", "submit", "download", "navigate",
  ];
  const hasUrl = /https?:\/\//.test(task.goal);
  const matchedExecutionKeyword = executionKeywords.find((kw) => goal.includes(kw));
  if (hasUrl && matchedExecutionKeyword) {
    return {
      profile: "convergent-exec",
      method: "rule",
      ruleId: "url_execution_keyword",
      rationale: `任务同时包含 URL 和执行关键词 ${matchedExecutionKeyword}`,
      signals: ["url", `keyword:${matchedExecutionKeyword}`],
    };
  }

  // 规则 4：任务对某 skill 真实相关（复用 attention 层的 scoreSkill 评分）→ 收敛执行
  // 修复：旧逻辑检查「库里有没有执行 skill」（与任务无关），导致任何输入都误判。
  const skillScores = metas.map((m) => ({ meta: m, score: scoreSkill(m, task.goal) }));
  const bestSkill = skillScores.reduce<{ name?: string; score: number }>(
    (best, current) => current.score > best.score ? { name: current.meta.name, score: current.score } : best,
    { score: 0 },
  );
  if (bestSkill.score >= SKILL_MATCH_THRESHOLD) {
    return {
      profile: "convergent-exec",
      method: "rule",
      ruleId: "skill_match",
      rationale: `任务匹配执行 skill ${bestSkill.name}，score=${bestSkill.score}`,
      signals: [`skill:${bestSkill.name}`, `score:${bestSkill.score}`],
    };
  }

  // 规则无法判断
  return null;
}

export function classifyByRules(task: Task, metas: SkillMeta[]): ProfileName | null {
  return classifyByRulesDetailed(task, metas)?.profile ?? null;
}

// ── 分类 Agent（档位 3 简化版）────────────────────────────────────────

const classifyTool = {
  name: "select_profile",
  description: "选择最适合当前任务的 agent loop profile",
  parameters: Type.Object({
    profile: Type.Union(
      [
        Type.Literal("convergent-exec"),
        Type.Literal("divergent-research"),
        Type.Literal("conversational"),
      ],
      { description: "选择的 profile" },
    ),
    reasoning: Type.String({ description: "选择理由（1-2 句话）" }),
  }),
};

async function classifyByLLM(
  task: Task,
  metas: SkillMeta[],
  model: Model<Api>,
  apiKey: string,
): Promise<ProfileName> {
  const skillList = metas.map((m) => `- ${m.name}: ${m.description}`).join("\n");

  const response = await complete(
    model,
    {
      systemPrompt: `你是一个 AI agent 调度器，负责根据任务描述选择最合适的执行策略。

可用策略：
- convergent-exec：收敛执行。适用于有明确目标、具体操作步骤、需要精确完成某件事的任务。如抓取网页、填写表单、提取数据。
- divergent-research：发散研究。适用于开放性探索、信息收集、知识沉淀类任务。如调研、分析、比较。
- conversational：闲聊、问候、感谢、询问你的能力、或没有明确可执行目标的对话。

可用 Skills：
${skillList || "(无)"}

选择原则：
- 有 URL 且需要具体操作 → convergent-exec
- 需要分析、比较、探索 → divergent-research
- convergent-exec 仅适合有对应 skill 工作流的精确执行任务；通用的"查一下/找一下/问答"类任务（无对应 skill）应选 divergent-research
- 不确定时优先选 divergent-research（更灵活，有答案即可结束）

必须调用 select_profile 工具返回决策。`,
      messages: [
        {
          role: "user",
          content: `请为以下任务选择 profile：\n\n${task.goal}`,
          timestamp: Date.now(),
        },
      ],
      tools: [classifyTool],
    },
    {
      apiKey,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const p = payload as Record<string, unknown>;
          p["parallel_tool_calls"] = false;
          p["tool_choice"] = { type: "function", function: { name: "select_profile" } };
        }
        return payload;
      },
    },
  );

  // 解析结果（用统一的幽灵去重工具）
  const toolCalls = extractToolCalls([...response.content]);
  const validCall = toolCalls.find(
    (c) => c.name === "select_profile" || "profile" in (c.arguments as Record<string, unknown>),
  );

  if (validCall) {
    const args = validCall.arguments as { profile: ProfileName; reasoning: string };
    if (args.reasoning) {
      vlog(`[orchestrator] LLM 分类理由: ${args.reasoning}`);
    }
    return args.profile ?? "convergent-exec";
  }

  // 降级：无法分类时默认收敛
  vwarn("[orchestrator] LLM 分类失败，降级使用 convergent-exec");
  return "convergent-exec";
}

// ── Profile 选择兜底守卫 ──────────────────────────────────────────────

/**
 * convergent-exec 的步骤机（fetch→输出→verify→verify + 强制 2 个 checkpoint）
 * 是为「有匹配 skill 的工作流」设计的。若任务既没有匹配的 skill、也没有
 * successDef，硬塞进 convergent-exec 会让模型被反复逼着补 checkpoint——
 * 要么啰嗦重复输出，要么吐空导致 error。
 *
 * 这个确定性守卫拦住这种错配：无论选择来自规则还是 LLM，只要选了
 * convergent-exec 却没有可依据的 skill / successDef，就改走 divergent-research
 * （开放工具 + 模型自判 + 有答案即退），适合「查天气」这类通用 fetch-and-answer。
 */
function guardProfileChoice(
  choice: ProfileName,
  task: Task,
  metas: SkillMeta[],
): ProfileName {
  if (choice !== "convergent-exec") return choice;
  if (task.successDef && task.successDef.assertions.length > 0) return choice;

  const bestSkillScore = metas
    .map((m) => scoreSkill(m, task.goal))
    .reduce((max, s) => Math.max(max, s), 0);
  if (bestSkillScore >= SKILL_MATCH_THRESHOLD) return choice;

  vlog("[orchestrator] convergent-exec 无匹配 skill/successDef，改走 divergent-research");
  return "divergent-research";
}

/** 测试用导出：守卫逻辑是纯函数，直接单测无需 LLM。 */
export const __guardProfileChoice = guardProfileChoice;

// ── Orchestrator 主类 ─────────────────────────────────────────────────

export interface OrchestratorOptions {
  model: Model<Api>;
  apiKey: string;
  registry?: ProfileRegistry;
}

export class Orchestrator {
  private readonly model: Model<Api>;
  private readonly apiKey: string;
  private readonly registry: ProfileRegistry;

  constructor(opts: OrchestratorOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.registry = opts.registry ?? makeDefaultRegistry({
      model: opts.model,
      apiKey: opts.apiKey,
    });
  }

  /**
   * 根据任务自动选择最合适的 LoopProfile。
   * 优先规则分类（无 LLM 调用），规则无法判断时升级到分类 agent。
   */
  async selectProfile(
    task: Task,
    metas: SkillMeta[],
  ): Promise<{
    profile: LoopProfile;
    name: ProfileName;
    method: "rule" | "llm";
    ruleId?: ProfileSelectionRuleId;
    rationale?: string;
    signals?: string[];
    guardApplied?: boolean;
    unguardedName?: ProfileName;
  }> {
    // 档位 2：规则分类
    const ruleDecision = classifyByRulesDetailed(task, metas);
    if (ruleDecision) {
      const guarded = guardProfileChoice(ruleDecision.profile, task, metas);
      const guardApplied = guarded !== ruleDecision.profile;
      vlog(`[orchestrator] 规则分类 → ${ruleDecision.profile}${guardApplied ? ` → ${guarded}（守卫修正）` : ""}`);
      return {
        profile: this.registry.get(guarded),
        name: guarded,
        method: "rule",
        ruleId: ruleDecision.ruleId,
        rationale: ruleDecision.rationale,
        signals: ruleDecision.signals,
        guardApplied,
        unguardedName: ruleDecision.profile,
      };
    }

    // 档位 3：LLM 分类 agent
    vlog("[orchestrator] 规则无法判断，升级到 LLM 分类...");
    const llmResult = await classifyByLLM(task, metas, this.model, this.apiKey);
    const guarded = guardProfileChoice(llmResult, task, metas);
    const guardApplied = guarded !== llmResult;
    vlog(`[orchestrator] LLM 分类 → ${llmResult}${guardApplied ? ` → ${guarded}（守卫修正）` : ""}`);
    return {
      profile: this.registry.get(guarded),
      name: guarded,
      method: "llm",
      guardApplied,
      unguardedName: llmResult,
    };
  }
}
