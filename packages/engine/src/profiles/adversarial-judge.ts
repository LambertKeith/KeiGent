import { vlog, vwarn } from "../logger.js";
import { complete, type Model, Type } from "@earendil-works/pi-ai";
import type {
  AssertionResult,
  SkillContext,
  StateSnapshot,
  SuccessDef,
  VerifyStrategy,
  Verdict,
} from "../types.js";
import { extractToolCalls } from "../utils.js";

// ── 裁判工具定义 ──────────────────────────────────────────────────────

const submitVerdictTool = {
  name: "submit_verdict",
  description: "提交对当前 checkpoint 的验证结论。默认应怀疑失败，只有在找不到任何不符合证据时才判通过。",
  parameters: Type.Object({
    overall_passed: Type.Boolean({
      description: "总体是否通过（true=通过，false=不通过）",
    }),
    evidence: Type.String({
      description: "支持或反对通过的关键证据（1-3 句话）",
    }),
    per_assertion: Type.Array(
      Type.Object({
        description: Type.String({ description: "断言描述" }),
        passed: Type.Boolean(),
        evidence: Type.String({ description: "该条断言的证据" }),
      }),
      { description: "每条 assertion 的逐条核对结果" },
    ),
  }),
};

// ── 单个裁判的内部实现 ───────────────────────────────────────────────

async function runSingleJudge(
  model: Model<"openai-completions">,
  apiKey: string,
  snapshot: StateSnapshot,
  successDef: SuccessDef | undefined,
  skillContext: SkillContext,
  judgeIndex: number,
): Promise<{ passed: boolean; evidence: string; perAssertion: AssertionResult[] }> {
  const assertionsText = successDef?.assertions
    .map((a, i) => `${i + 1}. [signal:${a.signal}] ${a.description}`)
    .join("\n") ?? "（无具体断言，依据目标和快照整体判断）";

  const snapshotText = [
    snapshot.url ? `URL: ${snapshot.url}` : null,
    snapshot.visibleText ? `可见文本（前 300 字）: ${snapshot.visibleText.slice(0, 300)}` : null,
    snapshot.domDigest ? `DOM 摘要: ${snapshot.domDigest.slice(0, 200)}` : null,
  ].filter(Boolean).join("\n");

  const skillBodySummary = skillContext.matched.length > 0
    ? `任务涉及 skill: ${skillContext.matched.join(", ")}`
    : "";

  const systemPrompt = `你是一个严格的 agent 执行验证者（裁判 ${judgeIndex + 1}）。

你的任务是**找出不符合要求的证据**，而不是确认成功。
- 默认假设失败，只有在找不到任何不符合证据时才判通过
- 状态信息不足以确认某条断言时，判该断言不通过
- 证据不完整不能作为通过的理由

${skillBodySummary}

必须调用 submit_verdict 工具提交你的结论。`;

  const userMessage = `## 验证目标
${successDef?.goal ?? "无明确目标，整体判断"}

## 期望断言
${assertionsText}

## 当前页面状态快照
${snapshotText || "（无快照信息）"}

请逐条核对每个断言，找出不符合的证据，然后给出总体结论。`;

  const response = await complete(
    model,
    {
      systemPrompt,
      messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
      tools: [submitVerdictTool],
    },
    {
      apiKey,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const p = payload as Record<string, unknown>;
          p["parallel_tool_calls"] = false;
          p["tool_choice"] = { type: "function", function: { name: "submit_verdict" } };
        }
        return payload;
      },
    },
  );

  const toolCalls = extractToolCalls([...response.content]);
  const validCall = toolCalls.find(
    (c) => c.name === "submit_verdict" ||
      "overall_passed" in (c.arguments as Record<string, unknown>),
  );

  if (!validCall) {
    // 裁判未调用工具：降级为不通过（宁可误杀）
    vwarn(`[judge-${judgeIndex + 1}] 未返回工具调用，降级判定不通过`);
    return { passed: false, evidence: "裁判未返回结构化结论，降级判定不通过", perAssertion: [] };
  }

  const args = validCall.arguments as {
    overall_passed: boolean;
    evidence: string;
    per_assertion: Array<{ description: string; passed: boolean; evidence: string }>;
  };

  const perAssertion: AssertionResult[] = (args.per_assertion ?? []).map((a, i) => ({
    assertion: successDef?.assertions[i] ?? { description: a.description, signal: "text" },
    passed: a.passed,
    evidence: a.evidence,
  }));

  return {
    passed: args.overall_passed ?? false,
    evidence: args.evidence ?? "(无证据)",
    perAssertion,
  };
}

// ── AdversarialJudge ──────────────────────────────────────────────────

export interface AdversarialJudgeOptions {
  model: Model<"openai-completions">;
  apiKey: string;
  voters?: number;       // 裁判数量，默认 3
  threshold?: number;    // 通过需要的最少同意票，默认 2
}

/**
 * 独立对抗式裁判——执行 loop 的命门。
 *
 * - 裁判与执行者完全隔离（只看 snapshot + successDef，看不到执行者的声称）
 * - 默认怀疑：宁可误杀，不可放过
 * - 多裁判投票对冲单裁判随机性
 */
export class AdversarialJudge implements VerifyStrategy {
  private readonly model: Model<"openai-completions">;
  private readonly apiKey: string;
  private readonly voters: number;
  private readonly threshold: number;

  constructor(opts: AdversarialJudgeOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.voters = opts.voters ?? 3;
    this.threshold = opts.threshold ?? 2;
  }

  async check(
    snapshot: StateSnapshot,
    successDef: SuccessDef | undefined,
    skillContext: SkillContext,
  ): Promise<Verdict> {
    vlog(`[adversarial-judge] 启动 ${this.voters} 个裁判...`);

    // 并发运行多个裁判
    const verdictPromises = Array.from({ length: this.voters }, (_, i) =>
      runSingleJudge(this.model, this.apiKey, snapshot, successDef, skillContext, i).catch(
        (err) => {
          vwarn(`[adversarial-judge] 裁判 ${i + 1} 失败: ${err}`);
          return { passed: false, evidence: `裁判 ${i + 1} 异常: ${err}`, perAssertion: [] };
        },
      ),
    );

    const results = await Promise.all(verdictPromises);

    const passCount = results.filter((r) => r.passed).length;
    const passed = passCount >= this.threshold;

    vlog(`[adversarial-judge] 投票结果: ${passCount}/${this.voters} 通过（阈值 ${this.threshold}）`);

    // 汇总证据：用反对票的证据（更有价值）
    const failEvidence = results.filter((r) => !r.passed).map((r) => r.evidence);
    const passEvidence = results.filter((r) => r.passed).map((r) => r.evidence);
    const evidence = passed
      ? `${passCount}/${this.voters} 裁判通过。${passEvidence[0] ?? ""}`
      : `${passCount}/${this.voters} 裁判通过（低于阈值 ${this.threshold}）。失败证据: ${failEvidence.join(" | ")}`;

    // 取第一个有 perAssertion 的结果
    const perAssertion = results.find((r) => r.perAssertion.length > 0)?.perAssertion ?? [];

    return { passed, evidence, perAssertion };
  }
}
