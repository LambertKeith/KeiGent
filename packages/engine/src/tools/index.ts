export * from "./types.js";
export { ToolRegistry } from "./registry.js";
export { CHECKPOINT_TOOL_NAME, checkpointTool } from "./impl/checkpoint.js";

import { ToolRegistry } from "./registry.js";
import { checkpointTool } from "./impl/checkpoint.js";
import { webFetchTool, fetchUrlAlias, httpRequestTool } from "./impl/web.js";
import { currentTimeTool } from "./impl/misc.js";
import { browserTools } from "./impl/browser.js";
import { filesystemTools } from "./impl/filesystem.js";
import { systemTools } from "./impl/system.js";
import { computerTools } from "./impl/computer.js";
import { agentTools } from "./impl/agent.js";

export { browserTools } from "./impl/browser.js";
export { filesystemTools } from "./impl/filesystem.js";
export { systemTools } from "./impl/system.js";
export { computerTools } from "./impl/computer.js";
export { agentTools } from "./impl/agent.js";

export interface RegistryBuildOptions {
  /** 是否包含系统级电脑操作工具（mouse/keyboard/screenshot）。默认 false——
   *  这些需要原生权限且风险高，仅在明确需要桌面自动化时开启。 */
  includeComputer?: boolean;
}

/**
 * 构建默认工具注册表。
 * B0：web_fetch + get_current_time + checkpoint
 * B1：浏览器核心工具（navigate/snapshot/click/type/...）
 * B3：文件系统（read/write/list/grep）+ shell + http_request
 * B4：电脑操作（mouse/keyboard/screenshot）+ memory + ask_user
 */
export function buildDefaultRegistry(opts: RegistryBuildOptions = {}): ToolRegistry {
  const reg = new ToolRegistry().registerAll([
    checkpointTool,
    webFetchTool,
    fetchUrlAlias,
    currentTimeTool,
    httpRequestTool,
    ...browserTools,
    ...filesystemTools,
    ...systemTools,
    ...agentTools,
  ]);
  if (opts.includeComputer) {
    reg.registerAll(computerTools);
  }
  return reg;
}
