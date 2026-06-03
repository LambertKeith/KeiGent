import type { Tool } from "@earendil-works/pi-ai";
import type { ToolRegistry } from "./tools/index.js";

/**
 * 按 profile 决定暴露给 LLM 的工具子集。
 * conversational：只给 ask_user + 只读工具（不含 write/execute/dangerous），
 *   既能追问澄清、又能跑安全只读动作，有副作用的操作留给任务 profile。
 * 其它 profile：全量工具。
 */
export function toolsForProfile(registry: ToolRegistry, profileName: string): Tool[] {
  if (profileName === "conversational") {
    // ask_user 当前是 readonly，已被谓词涵盖；显式列出 name 作为防御——
    // 即便将来收紧 ask_user 权限，对话 profile 也必须保留追问能力。
    return registry.toPiAiTools((t) => t.permission === "readonly" || t.name === "ask_user");
  }
  return registry.toPiAiTools();
}
