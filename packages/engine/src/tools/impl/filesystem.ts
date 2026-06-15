import { readFile, writeFile, readdir, mkdir, stat } from "fs/promises";
import { resolve, join, relative, dirname } from "path";
import { Type } from "@earendil-works/pi-ai";
import type { ToolContext, ToolDef } from "../types.js";
import { ok, err } from "../types.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * 路径沙箱：把相对路径解析到 workspace 内，拒绝逃逸（.. / 绝对路径越界）。
 * 返回绝对路径，或 null（越界）。
 */
function resolveInWorkspace(workspace: string, p: string): string | null {
  const wsRoot = resolve(workspace);
  const target = resolve(wsRoot, p);
  const rel = relative(wsRoot, target);
  // rel 以 .. 开头或为绝对路径 → 逃逸
  if (rel.startsWith("..") || resolve(rel) === rel) {
    return null;
  }
  return target;
}

export const fileReadTool: ToolDef = {
  name: "file_read",
  description: "读取 workspace 内的文件内容（相对路径，10MB 上限）",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  parameters: Type.Object({
    path: Type.String({ description: "相对 workspace 的文件路径" }),
  }),
  async execute(args, ctx: ToolContext) {
    const p = String(args["path"] ?? "");
    const abs = resolveInWorkspace(ctx.workspace, p);
    if (!abs) return err(`路径越界（必须在 workspace 内）: ${p}`);
    try {
      const st = await stat(abs);
      if (st.size > MAX_FILE_BYTES) return err(`文件过大（>${MAX_FILE_BYTES} 字节）`);
      const content = await readFile(abs, "utf-8");
      return ok(content, undefined, [{ kind: "file", ref: abs, connector: "file_read" }]);
    } catch (e) {
      return err(`读取失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const fileWriteTool: ToolDef = {
  name: "file_write",
  description: "写入文件到 workspace（创建或覆盖，自动建父目录）",
  permission: "write",
  riskLevel: "R1",
  sideEffect: "local",
  reversible: true,
  parameters: Type.Object({
    path: Type.String({ description: "相对 workspace 的文件路径" }),
    content: Type.String({ description: "文件内容" }),
  }),
  async execute(args, ctx: ToolContext) {
    const p = String(args["path"] ?? "");
    const content = String(args["content"] ?? "");
    const abs = resolveInWorkspace(ctx.workspace, p);
    if (!abs) return err(`路径越界（必须在 workspace 内）: ${p}`);
    try {
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf-8");
      return ok(`已写入 ${p}（${Buffer.byteLength(content, "utf-8")} 字节）`);
    } catch (e) {
      return err(`写入失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const fileListTool: ToolDef = {
  name: "file_list",
  description: "列出 workspace 内目录的文件",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: "相对 workspace 的目录路径（默认根）" })),
  }),
  async execute(args, ctx: ToolContext) {
    const p = String(args["path"] ?? ".");
    const abs = resolveInWorkspace(ctx.workspace, p);
    if (!abs) return err(`路径越界: ${p}`);
    try {
      const entries = await readdir(abs, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return ok(lines.join("\n") || "（空目录）", undefined, [{ kind: "workspace_path", ref: abs, connector: "file_list" }]);
    } catch (e) {
      return err(`列目录失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const grepTool: ToolDef = {
  name: "grep",
  description: "在 workspace 内按正则搜索文件内容，返回 path:line:text",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  parameters: Type.Object({
    pattern: Type.String({ description: "正则表达式" }),
    path: Type.Optional(Type.String({ description: "搜索目录（默认 workspace 根）" })),
    max_matches: Type.Optional(Type.Number({ description: "最大匹配数（默认 100）" })),
  }),
  async execute(args, ctx: ToolContext) {
    const pattern = String(args["pattern"] ?? "");
    if (!pattern) return err("grep 需要 pattern 参数");
    const dir = resolveInWorkspace(ctx.workspace, String(args["path"] ?? "."));
    if (!dir) return err("路径越界");
    const maxMatches = typeof args["max_matches"] === "number" ? args["max_matches"] : 100;

    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch (e) {
      return err(`正则无效: ${e instanceof Error ? e.message : String(e)}`);
    }

    const matches: string[] = [];
    async function walk(d: string): Promise<void> {
      if (matches.length >= maxMatches) return;
      const entries = await readdir(d, { withFileTypes: true });
      for (const e of entries) {
        if (matches.length >= maxMatches) return;
        const full = join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name.startsWith(".")) continue;
          await walk(full);
        } else {
          try {
            const st = await stat(full);
            if (st.size > 1024 * 1024) continue; // 跳过 >1MB
            const text = await readFile(full, "utf-8");
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i]!)) {
                const rel = relative(ctx.workspace, full);
                matches.push(`${rel}:${i + 1}:${lines[i]!.trim().slice(0, 120)}`);
                if (matches.length >= maxMatches) return;
              }
            }
          } catch {
            // 跳过二进制/无法读取的文件
          }
        }
      }
    }

    try {
      await walk(dir);
      return ok(matches.length > 0 ? matches.join("\n") : "（无匹配）", undefined, [{ kind: "workspace_path", ref: dir, connector: "grep" }]);
    } catch (e) {
      return err(`搜索失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const filesystemTools: ToolDef[] = [fileReadTool, fileWriteTool, fileListTool, grepTool];
