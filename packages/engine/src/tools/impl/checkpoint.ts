import { Type } from "@earendil-works/pi-ai";
import type { ToolDef } from "../types.js";
import { ok } from "../types.js";

export const CHECKPOINT_TOOL_NAME = "request_verification";

/**
 * request_verification —— checkpoint 信号工具。
 *
 * 注意：这个工具由【引擎拦截】，不走 registry.execute——引擎收到它就
 * 触发 StateCapture + verify。这里的定义仅提供 schema（发给 LLM）+
 * 一个永不被调用的兜底 execute（保持接口完整）。
 */
export const checkpointTool: ToolDef = {
  name: CHECKPOINT_TOOL_NAME,
  description: "声明当前步骤已完成，请求引擎进行独立验证（checkpoint 信号）",
  permission: "readonly",
  parameters: Type.Object({
    checkpoint_desc: Type.String({ description: "当前完成的节点描述" }),
  }),
  async execute() {
    // 引擎拦截，正常不会走到这里
    return ok("(checkpoint 由引擎处理)");
  },
};
