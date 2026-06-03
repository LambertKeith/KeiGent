import { Type } from "@earendil-works/pi-ai";
import type { ToolDef } from "../types.js";
import { ok } from "../types.js";

export const currentTimeTool: ToolDef = {
  name: "get_current_time",
  description: "获取当前时间，返回 ISO 8601 格式字符串",
  permission: "readonly",
  concurrencySafe: true,
  parameters: Type.Object({}),
  async execute() {
    return ok(new Date().toISOString());
  },
};
