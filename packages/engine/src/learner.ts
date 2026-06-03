import { vlog, vwarn } from "./logger.js";
import { complete, type Model, type Tool, Type } from "@earendil-works/pi-ai";
import { randomUUID } from "crypto";
import type {
  LearningResult,
  SkillPatch,
  Trajectory,
} from "./types.js";
import { renderTrajectoryForLLM } from "./trajectory.js";
import { applyPatches } from "./skill-patch.js";
import { extractToolCalls } from "./utils.js";

// ── SkillPatch 结构化输出工具 ─────────────────────────────────────────
// 学习 loop 通过调用这个工具来声明它的 patch 建议，
// 而非用自然语言输出——这让 patches 可以被程序可靠地解析和应用。

const submitPatchesTool: Tool = {
  name: "submit_skill_patches",
  description:
    "提交对 skill 的改进建议。每个 patch 对应 SKILL.md / LEARNING.md 里的一个具体改动。",
  parameters: Type.Object({
    patches: Type.Array(
      Type.Object({
        skill_name: Type.String({ description: "要改进的 skill 名称" }),
        section: Type.Union(
          [
            Type.Literal("workflow"),
            Type.Literal("guidelines"),
            Type.Literal("recovery"),
            Type.Literal("examples"),
          ],
          { description: "改动的节区" },
        ),
        action: Type.Union(
          [
            Type.Literal("append"),
            Type.Literal("prepend"),
            Type.Literal("replace"),
          ],
          { description: "append=追加, prepend=前置, replace=替换" },
        ),
        content: Type.String({ description: "要写入的内容（Markdown 格式）" }),
        rationale: Type.String({ description: "为什么要做这个改动（1-2 句话）" }),
      }),
    ),
    summary: Type.String({
      description: "对本次执行的整体洞察（2-4 句话，供人工审查参考）",
    }),
  }),
};

// ── 学习 loop 的 system prompt ────────────────────────────────────────

function buildLearnerSystemPrompt(skillBody: string): string {
  return `你是一个 AI agent 的学习分析师。你的任务是分析一次 agent 执行轨迹，提炼可以改进 skill 的洞察。

## 当前 Skill 内容
${skillBody || "(skill 内容为空)"}

## 你的分析维度

1. **工作流改进**（section: workflow）
   - 步骤顺序是否合理？有没有多余或遗漏的步骤？
   - 步骤指令是否足够明确，让模型能正确执行？

2. **执行规范**（section: guidelines）
   - 模型在哪些地方出现了偏差？应该加什么约束？
   - 参数传递、工具选择是否有反复出现的问题？

3. **恢复模式**（section: recovery）
   - 遇到了什么错误？应该怎么处理？
   - 如果有失败步骤，应该如何重试或降级？

4. **执行示例**（section: examples）
   - 这次执行是成功案例吗？值得作为示例保留吗？
   - 记录关键的输入/输出对，供未来参考。

## 注意事项
- 只提出有实质意义的改进，不要为了提 patch 而提 patch
- content 字段用 Markdown 格式，清晰简洁
- 如果轨迹执行正常、skill 不需要改进，可以只提一个 examples patch 记录成功案例
- 必须调用 submit_skill_patches 工具提交你的分析结果`;
}

// ── Learner 主类 ──────────────────────────────────────────────────────

export class Learner {
  constructor(
    private readonly model: Model<"openai-completions">,
    private readonly apiKey: string,
  ) {}

  /**
   * 分析执行轨迹，产出 skill patches 并写入 LEARNING.md。
   * 这是一个"一次性"的 LLM 调用（非循环），足以分析单次轨迹。
   */
  async learn(
    trajectory: Trajectory,
    skillsDir: string,
    skillBodies: Map<string, string>,   // skillName → body 内容
  ): Promise<LearningResult> {
    const trajectoryId = randomUUID();
    vlog(`\n[learner] ▶ 分析轨迹 id=${trajectoryId} profile=${trajectory.profile} exit=${trajectory.exitReason}`);

    const renderedTrajectory = renderTrajectoryForLLM(trajectory);

    // 为每个使用到的 skill 分别分析
    const allPatches: SkillPatch[] = [];
    let combinedSummary = "";

    for (const skillName of trajectory.skillsUsed) {
      const body = skillBodies.get(skillName) ?? "";
      const systemPrompt = buildLearnerSystemPrompt(body);

      const userMessage = `请分析以下执行轨迹，针对 skill "${skillName}" 提交改进建议：\n\n${renderedTrajectory}`;

      vlog(`[learner] 分析 skill: ${skillName}...`);

      const response = await complete(
        this.model,
        {
          systemPrompt,
          messages: [
            { role: "user", content: userMessage, timestamp: Date.now() },
          ],
          tools: [submitPatchesTool],
        },
        {
          apiKey: this.apiKey,
          // 通过 onPayload 直接注入 tool_choice 到原始 API payload
          // gpt-5.5 @ packyapi 有大内置 system prompt，会压制我们的 system 指令
          // 强制工具调用是确保学习 loop 产出结构化结果的唯一可靠方式
          onPayload: (payload) => {
            if (payload && typeof payload === "object") {
              const p = payload as Record<string, unknown>;
              p["parallel_tool_calls"] = false;
              p["tool_choice"] = {
                type: "function",
                function: { name: "submit_skill_patches" },
              };
            }
            return payload;
          },
        },
      );

      // 解析工具调用输出（用统一的幽灵去重工具）
      const toolCalls = extractToolCalls([...response.content]);
      let summary = "";
      for (const tc of toolCalls) {
        if (tc.type !== "toolCall") continue;
        const rawArgs = tc.arguments as Record<string, unknown>;
        if (!rawArgs["patches"] && !rawArgs["summary"]) continue;

        const args = tc.arguments as {
          patches: Array<{
            skill_name: string;
            section: string;
            action: string;
            content: string;
            rationale: string;
          }>;
          summary: string;
        };

        summary = args.summary ?? "";
        if (summary) combinedSummary += `[${skillName}] ${summary}\n`;

        for (const p of args.patches ?? []) {
          allPatches.push({
            skillName: p.skill_name ?? skillName,
            section: (p.section as SkillPatch["section"]) ?? "guidelines",
            action: (p.action as SkillPatch["action"]) ?? "append",
            content: p.content ?? "",
            rationale: p.rationale ?? "",
          });
        }
      }

      // 模型没调工具时，从文本里提取（降级）
      if (toolCalls.length === 0) {
        const text = response.content
          .filter((c) => c.type === "text")
          .map((c) => (c.type === "text" ? c.text : ""))
          .join("");
        if (text) {
          vwarn(`[learner] 模型未调工具，降级为文本记录`);
          allPatches.push({
            skillName,
            section: "guidelines",
            action: "append",
            content: `### 执行观察（自动提取）\n\n${text.slice(0, 500)}`,
            rationale: "模型未使用结构化工具，降级为文本记录",
          });
          combinedSummary += `[${skillName}] ${text.slice(0, 100)}\n`;
        }
      }

      vlog(`[learner] ${skillName}: ${allPatches.length} patches，摘要: ${summary.slice(0, 80)}`);
    }

    // 无 skill 时（任务没有匹配任何 skill）记录一条通用观察
    if (trajectory.skillsUsed.length === 0) {
      vlog(`[learner] 无 skill 使用，跳过学习`);
      return {
        trajectoryId,
        patches: [],
        summary: "本次执行未使用任何 skill，无学习内容",
        writtenTo: [],
      };
    }

    // 应用 patches → 写入 LEARNING.md
    const writtenTo = allPatches.length > 0
      ? await applyPatches(allPatches, skillsDir, trajectoryId)
      : [];

    return {
      trajectoryId,
      patches: allPatches,
      summary: combinedSummary.trim() || "分析完成，无重大发现",
      writtenTo,
    };
  }
}
