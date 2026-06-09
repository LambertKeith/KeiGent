import { Type } from "@earendil-works/pi-ai";
import type { ToolDef } from "../types.js";
import { ok, err } from "../types.js";

/**
 * 懒加载 nut.js（原生模块）。
 * macOS 需要"辅助功能"权限；无权限或加载失败时返回清晰错误，不崩溃进程。
 * 这里用动态 import 是必要的——nut.js 是原生模块，必须延迟到真正用到才加载。
 */
let nutCache: typeof import("@nut-tree-fork/nut-js") | null = null;
let nutError: string | null = null;

async function loadNut(): Promise<typeof import("@nut-tree-fork/nut-js") | null> {
  if (nutCache) return nutCache;
  if (nutError) return null;
  try {
    nutCache = await import("@nut-tree-fork/nut-js");
    return nutCache;
  } catch (e) {
    nutError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export const mouseTool: ToolDef = {
  name: "mouse",
  description: "控制鼠标：move（移动）、click（点击）、double_click、drag（拖拽）。坐标为屏幕绝对像素",
  permission: "dangerous",
  riskLevel: "R5",
  sideEffect: "external",
  reversible: false,
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal("move"),
      Type.Literal("click"),
      Type.Literal("double_click"),
      Type.Literal("drag"),
    ]),
    x: Type.Optional(Type.Number({ description: "目标 X 坐标" })),
    y: Type.Optional(Type.Number({ description: "目标 Y 坐标" })),
    button: Type.Optional(Type.Union([Type.Literal("left"), Type.Literal("right"), Type.Literal("middle")])),
    start_x: Type.Optional(Type.Number({ description: "拖拽起点 X" })),
    start_y: Type.Optional(Type.Number({ description: "拖拽起点 Y" })),
  }),
  async execute(args) {
    const nut = await loadNut();
    if (!nut) return err(`nut.js 不可用（可能缺少辅助功能权限）: ${nutError}`);
    const { mouse, Point, Button, straightTo } = nut;

    const action = String(args["action"]);
    const x = Number(args["x"] ?? 0);
    const y = Number(args["y"] ?? 0);
    const button = args["button"] === "right" ? Button.RIGHT : args["button"] === "middle" ? Button.MIDDLE : Button.LEFT;

    try {
      switch (action) {
        case "move":
          await mouse.move(straightTo(new Point(x, y)));
          return ok(`鼠标移动到 (${x}, ${y})`);
        case "click":
          await mouse.move(straightTo(new Point(x, y)));
          await mouse.click(button);
          return ok(`在 (${x}, ${y}) 点击`);
        case "double_click":
          await mouse.move(straightTo(new Point(x, y)));
          await mouse.doubleClick(button);
          return ok(`在 (${x}, ${y}) 双击`);
        case "drag": {
          const sx = Number(args["start_x"] ?? x);
          const sy = Number(args["start_y"] ?? y);
          await mouse.move(straightTo(new Point(sx, sy)));
          await mouse.pressButton(button);
          await mouse.move(straightTo(new Point(x, y)));
          await mouse.releaseButton(button);
          return ok(`从 (${sx}, ${sy}) 拖拽到 (${x}, ${y})`);
        }
        default:
          return err(`未知 action: ${action}`);
      }
    } catch (e) {
      return err(`鼠标操作失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const keyboardTool: ToolDef = {
  name: "keyboard",
  description: "控制键盘：type（输入文本）、press（单键）、hotkey（组合键如 cmd+c）",
  permission: "dangerous",
  riskLevel: "R5",
  sideEffect: "external",
  reversible: false,
  parameters: Type.Object({
    action: Type.Union([Type.Literal("type"), Type.Literal("press"), Type.Literal("hotkey")]),
    text: Type.Optional(Type.String({ description: "type 动作输入的文本" })),
    key: Type.Optional(Type.String({ description: "press 动作的按键名" })),
    keys: Type.Optional(Type.Array(Type.String(), { description: "hotkey 的组合键" })),
  }),
  async execute(args) {
    const nut = await loadNut();
    if (!nut) return err(`nut.js 不可用（可能缺少辅助功能权限）: ${nutError}`);
    const { keyboard, Key } = nut;
    const action = String(args["action"]);

    // 把按键名映射到 nut.js 的 Key 枚举
    const toKey = (name: string): unknown => {
      const k = (Key as unknown as Record<string, unknown>)[name];
      return k ?? name;
    };

    try {
      switch (action) {
        case "type": {
          const text = String(args["text"] ?? "");
          await keyboard.type(text);
          return ok(`输入文本: ${text.slice(0, 40)}`);
        }
        case "press": {
          const key = String(args["key"] ?? "");
          await keyboard.pressKey(toKey(key) as never);
          await keyboard.releaseKey(toKey(key) as never);
          return ok(`按键: ${key}`);
        }
        case "hotkey": {
          const keys = (args["keys"] as string[]) ?? [];
          const nutKeys = keys.map((k) => toKey(k)) as never[];
          for (const k of nutKeys) await keyboard.pressKey(k);
          for (const k of [...nutKeys].reverse()) await keyboard.releaseKey(k);
          return ok(`组合键: ${keys.join("+")}`);
        }
        default:
          return err(`未知 action: ${action}`);
      }
    } catch (e) {
      return err(`键盘操作失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const screenshotTool: ToolDef = {
  name: "screenshot",
  description: "对整个屏幕截图（系统级，非浏览器），返回图像",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  parameters: Type.Object({}),
  async execute() {
    const nut = await loadNut();
    if (!nut) return err(`nut.js 不可用（可能缺少屏幕录制权限）: ${nutError}`);
    try {
      const { screen } = nut;
      const img = await screen.grab();
      // nut.js 的 Image → PNG base64
      const buffer = await (img as unknown as { toRGB(): Promise<{ data: Buffer }> }).toRGB();
      return ok("已截屏（系统级）", { data: buffer.data.toString("base64"), mimeType: "image/png" });
    } catch (e) {
      return err(`截屏失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const computerTools: ToolDef[] = [mouseTool, keyboardTool, screenshotTool];
