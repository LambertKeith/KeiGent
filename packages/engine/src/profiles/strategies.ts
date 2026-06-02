import { vlog, vwarn } from "../logger.js";
import type { Context, Tool } from "@earendil-works/pi-ai";
import { WriteThroughMemory } from "../memory.js";
import type {
  AttentionStrategy,
  LoopState,
  MemoryStrategy,
  RecoverDecision,
  RecoverStrategy,
  SkillContext,
  SkillMeta,
  StateSnapshot,
  SuccessDef,
  Task,
  TerminateStrategy,
  Verdict,
  VerifyStrategy,
} from "../types.js";
import { renderSkillIndex } from "../skills.js";

// 单篇 skill body 注入的字节上限（参考 OpenHuman inject.rs 的 8 KiB）
const MAX_INJECTION_BYTES = 8 * 1024;

// 中→英概念映射：让中文任务能匹配英文 skill 的 tags/description。
// key 是中文词，value 是对应的英文概念词（与 tags/description 比对）。
const CN_EN_CONCEPTS: Record<string, string[]> = {
  抓取: ["fetch", "scrape", "crawl"],
  获取: ["fetch", "get"],
  总结: ["summarize", "summary"],
  摘要: ["summarize", "summary"],
  提取: ["extract"],
  数据: ["data"],
  结构化: ["structured", "structure"],
  表格: ["table"],
  网页: ["web", "webpage", "page"],
  页面: ["page", "web"],
  填写: ["fill", "form"],
  下载: ["download"],
};

/**
 * 给一个 skill 对任务的相关度打分（中英文都鲁棒）。
 * 评分维度：
 *   - skill name 在 goal 中出现（最强信号，+10）
 *   - tags 命中（英文直接命中 +2，中文经概念映射命中 +2）
 *   - description 英文词命中（+1）
 *   - description / goal 中文双字组交集（+1）
 * 返回 0 表示不相关。
 */
export function scoreSkill(meta: SkillMeta, goal: string): number {
  const g = goal.toLowerCase();
  let score = 0;

  if (g.includes(meta.name.toLowerCase())) score += 10;

  // 把 goal 里的中文词经概念映射展开成英文概念集
  const goalConcepts = new Set<string>();
  for (const [cn, ens] of Object.entries(CN_EN_CONCEPTS)) {
    if (goal.includes(cn)) ens.forEach((e) => goalConcepts.add(e));
  }
  // goal 里的英文词也直接进概念集
  for (const w of goal.toLowerCase().match(/[a-z]{3,}/g) ?? []) goalConcepts.add(w);

  // tags 命中（最可靠的结构化信号）
  for (const tag of meta.tags) {
    if (goalConcepts.has(tag.toLowerCase())) score += 2;
  }

  // description 英文词命中
  const stop = new Set(["the", "use", "this", "when", "user", "wants", "from", "and", "any", "for", "that", "into", "out"]);
  for (const w of new Set(meta.description.toLowerCase().match(/[a-z]{3,}/g) ?? [])) {
    if (!stop.has(w) && goalConcepts.has(w)) score += 1;
  }

  // 中文双字组交集
  const cnBigrams = (s: string): Set<string> => {
    const chars = (s.match(/[一-龥]/g) ?? []).join("");
    const grams = new Set<string>();
    for (let i = 0; i < chars.length - 1; i++) grams.add(chars.slice(i, i + 2));
    return grams;
  };
  const goalGrams = cnBigrams(goal);
  for (const gram of cnBigrams(meta.description)) {
    if (goalGrams.has(gram)) score += 1;
  }

  return score;
}

/** 按相关度排序的 skill 名（只返回 score > 0 的）。 */
function rankSkills(task: Task, metas: SkillMeta[]): string[] {
  return metas
    .map((m) => ({ name: m.name, score: scoreSkill(m, task.goal) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.name);
}

/** 把一组 skill body 渲染成注入块，带字节预算控制（超预算截断 + 跳过）。 */
async function renderBodies(
  names: string[],
  skillContext: SkillContext,
  budgetBytes: number,
): Promise<string> {
  const parts: string[] = [];
  let used = 0;
  for (const name of names) {
    const body = await skillContext.loadBody(name);
    if (!body) continue;
    const size = Buffer.byteLength(body, "utf-8");
    if (used + size > budgetBytes) {
      vlog(`[attention] skill body 预算耗尽，跳过: ${name}`);
      break;
    }
    parts.push(`<skill name="${name}">\n${body}\n</skill>`);
    used += size;
    vlog(`[attention] 注入 body: ${name} (${size} bytes)`);
  }
  return parts.join("\n\n");
}

// ── AttentionStrategy 实现 ─────────────────────────────────────────────

/**
 * 收敛注意力（NarrowAttention）：
 * - matchSkills: 严格匹配，最多取 1 篇最相关的 skill
 * - renderInjection: 只注入那 1 篇 body
 * - 每轮只给当前步骤相关的工具（stepToolNames 顺序控制）
 *
 * step 是实例级可变状态，reset() 在每次 run 开始时清零，保证 profile 复用安全。
 */
export class NarrowAttention implements AttentionStrategy {
  private step = 0;

  constructor(
    private readonly systemPromptBase: string,
    private readonly stepToolNames: string[][],
  ) {}

  reset(): void {
    this.step = 0;
  }

  matchSkills(task: Task, metas: SkillMeta[]): string[] {
    // 收敛：取相关度最高的 1 篇（中英文鲁棒评分）
    return rankSkills(task, metas).slice(0, 1);
  }

  async renderInjection(matchedNames: string[], skillContext: SkillContext): Promise<string> {
    // 收敛：只注入第一篇（最相关的）
    return renderBodies(matchedNames.slice(0, 1), skillContext, MAX_INJECTION_BYTES);
  }

  buildContext(state: LoopState, skillContext: SkillContext, availableTools: Tool[]): Promise<Context> {
    const currentStepTools = this.stepToolNames[this.step] ?? this.stepToolNames.at(-1) ?? [];
    const tools = availableTools.filter((t) => currentStepTools.includes(t.name));

    // 步骤指令放进 system prompt 最顶部——权重最高，模型不会忽略
    const stepInstruction = this.buildStepInstruction(state, currentStepTools);
    const systemPrompt = [
      stepInstruction ? `## 当前指令\n${stepInstruction}` : "",
      this.systemPromptBase,
      renderSkillIndex(skillContext.metas),
    ]
      .filter(Boolean)
      .join("\n\n");

    return Promise.resolve({
      systemPrompt,
      messages: state.messages,
      tools: tools.length > 0 ? tools : undefined,
    });
  }

  private buildStepInstruction(state: LoopState, stepTools: string[]): string {
    const urlMatch = /https?:\/\/[^\s）)】\]]+/.exec(state.task.goal);
    const url = urlMatch?.[0] ?? "";

    if (stepTools.includes("fetch_url") && url) {
      return `**当前步骤 ${this.step + 1}：调用 fetch_url 工具抓取页面。必须传参数 url="${url}"**`;
    }
    if (stepTools.length === 0) {
      return `**当前步骤 ${this.step + 1}：根据已获取的内容，按 skill 格式输出完整总结。不要调用工具。**`;
    }
    if (stepTools.includes("request_verification")) {
      return `**当前步骤 ${this.step + 1}：调用 request_verification 工具，声明步骤完成。checkpoint_desc 填写完成的描述。**`;
    }
    return "";
  }

  advanceStep(): void {
    this.step++;
  }

  getStep(): number {
    return this.step;
  }
}

/**
 * 发散注意力（WideAttention）：
 * - matchSkills: 宽松匹配，返回所有 skill
 * - renderInjection: 注入所有匹配的 body（预算内）
 * - 暴露全部工具
 *
 * 防死循环：已成功调用过的工具（非 checkpoint 类）从下一轮工具列表移除。
 * usedTools 是实例级状态，reset() 在每次 run 开始时清空。
 */
export class WideAttention implements AttentionStrategy {
  private usedTools = new Set<string>();

  constructor(private readonly systemPromptBase: string) {}

  reset(): void {
    this.usedTools.clear();
  }

  matchSkills(_task: Task, metas: SkillMeta[]): string[] {
    return metas.map((m) => m.name);
  }

  async renderInjection(matchedNames: string[], skillContext: SkillContext): Promise<string> {
    // 发散：注入全部匹配的 body（预算内）——多看几篇 skill
    return renderBodies(matchedNames, skillContext, MAX_INJECTION_BYTES);
  }

  markToolUsed(name: string): void {
    if (name !== "request_verification") {
      this.usedTools.add(name);
    }
  }

  buildContext(state: LoopState, skillContext: SkillContext, availableTools: Tool[]): Promise<Context> {
    const tools = availableTools.filter((t) => !this.usedTools.has(t.name));

    const systemPrompt = [
      this.systemPromptBase,
      renderSkillIndex(skillContext.metas),
    ]
      .filter(Boolean)
      .join("\n\n");

    return Promise.resolve({
      systemPrompt,
      messages: state.messages,
      tools: tools.length > 0 ? tools : undefined,
    });
  }
}

// ── TerminateStrategy 实现 ─────────────────────────────────────────────

/**
 * 模型自判停止：模型输出文本即退出（发散场景）。
 * allowEarlyTextExit=true：拿到文本就走，不等 checkpoint。
 */
export class ModelSelfJudge implements TerminateStrategy {
  readonly allowEarlyTextExit = true;

  shouldStop(_state: LoopState): boolean {
    return false; // 实际退出由引擎检测 allowEarlyTextExit 处理
  }
}

/**
 * Skill 工作流走完即停止（收敛执行场景，spec §6.2）。
 * 与 SuccessDefMatched 的区别：不要求 successDef，只看 checkpoint 数量
 * 是否达到 skill 工作流声明的步骤数。
 * allowEarlyTextExit=false：必须走完 checkpoint。
 */
export class SkillWorkflowDone implements TerminateStrategy {
  readonly allowEarlyTextExit = false;

  constructor(private readonly requiredCheckpoints: number) {}

  shouldStop(state: LoopState): boolean {
    return state.checkpointCount >= this.requiredCheckpoints;
  }
}

/**
 * 成功定义匹配：所有 checkpoint 都通过后停止（验证收敛场景）。
 * allowEarlyTextExit=false：模型给出文本不算完，必须走完 checkpoint。
 */
export class SuccessDefMatched implements TerminateStrategy {
  readonly allowEarlyTextExit = false;

  constructor(private readonly requiredCheckpoints: number) {}

  shouldStop(state: LoopState): boolean {
    return state.checkpointCount >= this.requiredCheckpoints;
  }
}

// ── VerifyStrategy 实现 ────────────────────────────────────────────────

/**
 * 不验证（发散/调研场景）。
 */
export class NoVerify implements VerifyStrategy {
  async check(_snapshot: StateSnapshot, _successDef: SuccessDef | undefined): Promise<Verdict> {
    return { passed: true, evidence: "NoVerify: 跳过验证" };
  }
}

/**
 * 执行者自检（收敛执行场景，spec §6.3）。
 * 不调用独立裁判，只做轻量的快照存在性检查——确认有可观测的状态产出。
 * 适用于流程明确、失败代价低的执行任务。
 */
export class SelfCheck implements VerifyStrategy {
  async check(snapshot: StateSnapshot, successDef: SuccessDef | undefined): Promise<Verdict> {
    // 自检：只要快照里有可观测内容（url 或 visibleText）即认为该步骤产生了效果
    const hasObservableState = Boolean(snapshot.url || snapshot.visibleText);
    if (!hasObservableState) {
      return { passed: false, evidence: "SelfCheck: 快照无可观测状态（无 url/文本）" };
    }
    return {
      passed: true,
      evidence: `SelfCheck: 快照可观测（url=${snapshot.url ?? "n/a"}），目标="${successDef?.goal ?? "无"}"`,
    };
  }
}

// ── RecoverStrategy 实现 ──────────────────────────────────────────────

/**
 * 简单重试（发散场景）。attempts 是实例级状态，reset() 在每次 run 开始时清零。
 */
export class SimpleRetry implements RecoverStrategy {
  private attempts = 0;
  constructor(private readonly max = 2) {}

  reset(): void {
    this.attempts = 0;
  }

  async handle(_state: LoopState, verdict: Verdict): Promise<RecoverDecision> {
    this.attempts++;
    if (this.attempts >= this.max) {
      return { kind: "escalate", reason: `连续 ${this.max} 次失败: ${verdict.evidence}` };
    }
    return { kind: "retry" };
  }
}

/**
 * 诊断修复（收敛执行场景）：用裁判证据生成修复提示，多次失败后升级。
 * attempts 是实例级状态，reset() 在每次 run 开始时清零。
 */
export class DiagnoseRepair implements RecoverStrategy {
  private attempts = 0;
  constructor(private readonly max = 3) {}

  reset(): void {
    this.attempts = 0;
  }

  async handle(_state: LoopState, verdict: Verdict): Promise<RecoverDecision> {
    this.attempts++;
    if (this.attempts >= this.max) {
      return {
        kind: "escalate",
        reason: `连续 ${this.max} 次验证失败，最后证据: ${verdict.evidence}`,
      };
    }
    return {
      kind: "repair",
      hint: `根据以下问题重新执行: ${verdict.evidence}`,
    };
  }
}

// ── MemoryStrategy 实现 ───────────────────────────────────────────────

/**
 * 不写记忆（执行 loop）。
 */
export class NoWrite implements MemoryStrategy {
  async maybePersist(_state: LoopState): Promise<void> {
    // 执行 loop 不写记忆，防止中间状态污染知识库
  }
}

/**
 * 写入记忆（发散/学习 loop）。
 * 每次 loop 结束时把执行结果写入 JSONL 记忆文件，供后续召回。
 * 只在 loop 结束（finalResponse 非空）时写一次。
 */
export class WriteThrough implements MemoryStrategy {
  private readonly store: WriteThroughMemory;
  private readonly skillsUsed: string[];
  private persisted = false;

  constructor(memoryDir: string, skillsUsed: string[] = []) {
    this.store = new WriteThroughMemory(memoryDir);
    this.skillsUsed = skillsUsed;
  }

  async maybePersist(state: LoopState): Promise<void> {
    if (this.persisted || !state.finalResponse) return;
    this.persisted = true;
    await this.store.persist(state, this.skillsUsed);
  }
}
