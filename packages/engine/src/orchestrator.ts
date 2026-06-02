import { vlog, vwarn } from "./logger.js";
import { complete, type Model } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { LoopProfile, SkillMeta, Task } from "./types.js";
import { makeConvergentExecProfile } from "./profiles/convergent-exec.js";
import { makeDivergentResearchProfile } from "./profiles/divergent-research.js";
import { makeConvergentVerifiedProfile } from "./profiles/convergent-verified.js";
import { extractToolCalls } from "./utils.js";
import { scoreSkill } from "./profiles/strategies.js";

// ── Profile 注册表 ────────────────────────────────────────────────────

export type ProfileName = "convergent-exec" | "convergent-verified" | "divergent-research" | "conversational";

export interface ProfileRegistry {
  get(name: ProfileName): LoopProfile;
  names(): ProfileName[];
}

export interface RegistryOptions {
  memoryDir?: string;
  skillsUsed?: string[];
  model?: Model<"openai-completions">;
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
        case "conversational": {
          // 懒加载：conversational.ts 由 Task 4 创建，静态导入会导致测试在 Task 4 前失败
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { makeConversationalProfile } = require("./profiles/conversational.js");
          return makeConversationalProfile();
        }
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
export function classifyByRules(task: Task, metas: SkillMeta[]): ProfileName | null {
  // 规则 0：显式指定 profile → 直接用（向后兼容）
  if (task.profile && (task.profile as ProfileName) in { "convergent-exec": 1, "divergent-research": 1 }) {
    return task.profile as ProfileName;
  }

  // 规则 0.5：高置信度闲聊 → 对话兜底（在所有任务规则之前，但尊重规则0的显式指定）
  if (isObviousChitchat(task)) {
    return "conversational";
  }

  // 规则 1：有 successDef + assertions → 用真实裁判的验证收敛 profile
  if (task.successDef && task.successDef.assertions.length > 0) {
    return "convergent-verified";
  }

  const goal = task.goal.toLowerCase();

  // 规则 2：目标含开放探索词 → 发散研究
  const researchKeywords = [
    "调研", "分析", "了解", "探索", "研究", "比较", "评估",
    "overview", "research", "analyze", "explore", "compare",
  ];
  if (researchKeywords.some((kw) => goal.includes(kw))) {
    return "divergent-research";
  }

  // 规则 3：目标含具体执行词 + URL → 收敛执行
  const executionKeywords = [
    "抓取", "总结", "提取", "填写", "发送", "创建", "下载", "打开",
    "fetch", "summarize", "extract", "submit", "download", "navigate",
  ];
  const hasUrl = /https?:\/\//.test(task.goal);
  if (hasUrl && executionKeywords.some((kw) => goal.includes(kw))) {
    return "convergent-exec";
  }

  // 规则 4：任务对某 skill 真实相关（复用 attention 层的 scoreSkill 评分）→ 收敛执行
  // 修复：旧逻辑检查「库里有没有执行 skill」（与任务无关），导致任何输入都误判。
  const SKILL_MATCH_THRESHOLD = 2; // name 命中 +10、tags 命中 +2、description 弱命中 +1
  const bestSkillScore = metas
    .map((m) => scoreSkill(m, task.goal))
    .reduce((max, s) => Math.max(max, s), 0);
  if (bestSkillScore >= SKILL_MATCH_THRESHOLD) {
    return "convergent-exec";
  }

  // 规则无法判断
  return null;
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
  model: Model<"openai-completions">,
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
- 不确定时优先选 convergent-exec（更安全）

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

// ── Orchestrator 主类 ─────────────────────────────────────────────────

export interface OrchestratorOptions {
  model: Model<"openai-completions">;
  apiKey: string;
  registry?: ProfileRegistry;
}

export class Orchestrator {
  private readonly model: Model<"openai-completions">;
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
  ): Promise<{ profile: LoopProfile; name: ProfileName; method: "rule" | "llm" }> {
    // 档位 2：规则分类
    const ruleResult = classifyByRules(task, metas);
    if (ruleResult) {
      vlog(`[orchestrator] 规则分类 → ${ruleResult}`);
      return { profile: this.registry.get(ruleResult), name: ruleResult, method: "rule" };
    }

    // 档位 3：LLM 分类 agent
    vlog("[orchestrator] 规则无法判断，升级到 LLM 分类...");
    const llmResult = await classifyByLLM(task, metas, this.model, this.apiKey);
    vlog(`[orchestrator] LLM 分类 → ${llmResult}`);
    return { profile: this.registry.get(llmResult), name: llmResult, method: "llm" };
  }
}
