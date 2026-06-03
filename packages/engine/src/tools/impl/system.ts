import { exec } from "child_process";
import { Type } from "@earendil-works/pi-ai";
import type { ToolContext, ToolDef } from "../types.js";
import { ok, err } from "../types.js";

const SHELL_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 30_000;

// 仅传递安全的环境变量（借鉴 OpenHuman 的 env 过滤）
const SAFE_ENV_KEYS = ["PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL", "TMPDIR"];

function safeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of SAFE_ENV_KEYS) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

export const shellTool: ToolDef = {
  name: "shell",
  description: "执行 shell 命令（在 workspace 目录下，60s 超时，输出上限 30k 字符）。危险操作需用户授权",
  permission: "dangerous",
  timeoutMs: SHELL_TIMEOUT_MS + 5000,
  parameters: Type.Object({
    command: Type.String({ description: "要执行的 shell 命令" }),
  }),
  async execute(args, ctx: ToolContext) {
    const command = String(args["command"] ?? "");
    if (!command) return err("shell 需要 command 参数");

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: ctx.workspace,
          timeout: SHELL_TIMEOUT_MS,
          maxBuffer: 5 * 1024 * 1024,
          env: safeEnv(),
        },
        (error, stdout, stderr) => {
          const out = (stdout || "").slice(0, MAX_OUTPUT);
          const errOut = (stderr || "").slice(0, 4000);
          if (error && error.killed) {
            resolve(err(`命令超时（${SHELL_TIMEOUT_MS}ms）`));
            return;
          }
          if (error) {
            resolve(err(`退出码 ${error.code}\n${errOut || out}`));
            return;
          }
          const combined = [out, errOut && `[stderr] ${errOut}`].filter(Boolean).join("\n");
          resolve(ok(combined || "（无输出，命令成功）"));
        },
      );
    });
  },
};

export const systemTools: ToolDef[] = [shellTool];
