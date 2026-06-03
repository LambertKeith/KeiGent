import { vlog, vwarn } from "./logger.js";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { LearningResult, SkillPatch } from "./types.js";

// ── LEARNING.md 的节区标题约定 ───────────────────────────────────────

const SECTION_HEADERS: Record<string, string> = {
  workflow: "## Learned Workflow Refinements",
  guidelines: "## Learned Guidelines",
  recovery: "## Learned Recovery Patterns",
  examples: "## Execution Examples",
};

/**
 * 把 LLM 产出的 patches 写入 skill 目录下的 LEARNING.md。
 *
 * 设计原则：
 * - 不修改 SKILL.md 主体（保持标准格式不变）
 * - 所有学习内容写入 LEARNING.md（执行经验积累层）
 * - LEARNING.md 同样会被渐进式披露机制加载（第二层 body）
 * - 积累到一定量后由人工 review 决定哪些提升到 SKILL.md
 */
export async function applyPatches(
  patches: SkillPatch[],
  skillsDir: string,
  trajectoryId: string,
): Promise<string[]> {
  // 按 skillName 分组
  const bySkill = new Map<string, SkillPatch[]>();
  for (const p of patches) {
    const arr = bySkill.get(p.skillName) ?? [];
    arr.push(p);
    bySkill.set(p.skillName, arr);
  }

  const writtenPaths: string[] = [];

  for (const [skillName, skillPatches] of bySkill) {
    const learningPath = join(skillsDir, skillName, "LEARNING.md");
    let existing = "";
    try {
      existing = await readFile(learningPath, "utf-8");
    } catch {
      // 首次创建
      existing = `# ${skillName} — Learning Log\n\n> 本文件由学习 loop 自动生成。记录执行经验，供 SKILL.md 改进参考。\n`;
    }

    const timestamp = new Date().toISOString();
    const header = `\n\n---\n<!-- trajectory: ${trajectoryId} | ${timestamp} -->\n`;

    let additions = header;
    for (const patch of skillPatches) {
      const sectionHeader = SECTION_HEADERS[patch.section] ?? `## ${patch.section}`;

      additions += `\n${sectionHeader}\n\n`;
      additions += `> **理由**: ${patch.rationale}\n\n`;
      additions += patch.content;
      additions += "\n";
    }

    const newContent =
      patch_action(existing, additions, skillPatches[0]?.action ?? "append");

    await writeFile(learningPath, newContent, "utf-8");
    vlog(`[skill-patch] 写入: ${learningPath} (${skillPatches.length} patches)`);
    writtenPaths.push(learningPath);
  }

  return writtenPaths;
}

function patch_action(
  existing: string,
  additions: string,
  action: "append" | "prepend" | "replace",
): string {
  switch (action) {
    case "prepend":
      return additions + "\n\n" + existing;
    case "replace":
      return additions;
    case "append":
    default:
      return existing + additions;
  }
}

/**
 * 格式化 LearningResult 的摘要，供日志输出。
 */
export function formatLearningResult(result: LearningResult): string {
  const lines = [
    `[learner] 学习完成 id=${result.trajectoryId}`,
    `  patches: ${result.patches.length}`,
    `  写入: ${result.writtenTo.join(", ") || "无"}`,
    `  摘要: ${result.summary.slice(0, 200)}`,
  ];
  return lines.join("\n");
}
