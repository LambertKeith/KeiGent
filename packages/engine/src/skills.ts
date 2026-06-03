import { vlog, vwarn } from "./logger.js";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import type { SkillContext, SkillMeta } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

interface ParsedSkill {
  meta: SkillMeta;
  bodyPath: string;    // 磁盘路径，按需读取（渐进式披露第二层）
  rawContent: string;  // 完整原始文本（body 从这里切出）
}

function parseFrontmatter(content: string): { meta: SkillMeta; body: string } | null {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return null;

  const yaml = match[1]!;
  const body = match[2]!.trim();

  // 简单的 key: value 解析，不引入 yaml 库
  const nameMatch = /^name:\s*(.+)$/m.exec(yaml);
  const descMatch = /^description:\s*(.+)$/m.exec(yaml);

  if (!nameMatch || !descMatch) return null;

  // 解析 tags（支持 `tags: [a, b]` 行内数组形式，可能在 metadata 缩进下）
  const tagsMatch = /tags:\s*\[([^\]]*)\]/.exec(yaml);
  const tags = tagsMatch
    ? tagsMatch[1]!.split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
    : [];

  // description 可能是多行（以缩进延续），取第一行够用
  return {
    meta: {
      name: nameMatch[1]!.trim(),
      description: descMatch[1]!.trim(),
      tags,
    },
    body,
  };
}

/**
 * 从指定目录扫描所有 SKILL.md，返回 SkillContext。
 * 目录结构：skillsDir/<skill-name>/SKILL.md
 *
 * 渐进式披露：
 *   第一层（常驻 system prompt）：meta.name + meta.description，~100 token/skill
 *   第二层（按需，注入 user message）：完整 body，通过 loadBody(name) 获取
 */
export async function loadSkillContext(skillsDir: string): Promise<SkillContext> {
  const parsed: ParsedSkill[] = [];

  let entries: string[] = [];
  try {
    entries = await readdir(skillsDir);
  } catch {
    // 目录不存在时返回空 context
    vwarn(`[skills] 目录不存在: ${skillsDir}`);
  }

  for (const entry of entries) {
    const skillMdPath = join(skillsDir, entry, "SKILL.md");
    try {
      const content = await readFile(skillMdPath, "utf-8");
      const result = parseFrontmatter(content);
      if (!result) {
        vwarn(`[skills] 解析失败（无 frontmatter）: ${skillMdPath}`);
        continue;
      }
      parsed.push({
        meta: result.meta,
        bodyPath: skillMdPath,
        rawContent: content,
      });
      vlog(`[skills] 已加载 meta: ${result.meta.name} — ${result.meta.description.slice(0, 60)}...`);
    } catch {
      // 跳过不存在的文件
    }
  }

  // 按需 body 加载（渐进式披露第二层）
  const bodyCache = new Map<string, string>();

  return {
    metas: parsed.map((p) => p.meta),
    matched: [],

    async loadBody(name: string): Promise<string | null> {
      if (bodyCache.has(name)) return bodyCache.get(name)!;
      const skill = parsed.find((p) => p.meta.name === name);
      if (!skill) return null;
      const result = parseFrontmatter(skill.rawContent);
      if (!result) return null;
      // 8 KiB 上限（参考 OpenHuman inject.rs 的 DEFAULT_MAX_INJECTION_BYTES）
      const MAX_BYTES = 8 * 1024;
      let body = result.body;
      if (Buffer.byteLength(body, "utf-8") > MAX_BYTES) {
        body = body.slice(0, MAX_BYTES) + "\n[SKILL:truncated]";
        vwarn(`[skills] body 超 8 KiB，已截断: ${name}`);
      }
      bodyCache.set(name, body);
      return body;
    },
  };
}

/**
 * 把所有 skill meta 渲染成 system prompt 里的索引块（常驻，轻量）。
 * 注：skill body 的注入由 AttentionStrategy.renderInjection 负责
 * （收敛注入 1 篇、发散注入多篇），见 profiles/strategies.ts。
 */
export function renderSkillIndex(metas: SkillMeta[]): string {
  if (metas.length === 0) return "";
  const lines = metas.map((m) => `- **${m.name}**: ${m.description}`);
  return `## Available Skills\n\n${lines.join("\n")}`;
}
