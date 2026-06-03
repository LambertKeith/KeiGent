import { Type } from "@earendil-works/pi-ai";
import { BrowserSession, type SnapshotEntry } from "../../browser.js";
import type { ToolContext, ToolDef } from "../types.js";
import { ok, err } from "../types.js";

// 共享 BrowserSession（懒启动，按 headless 绑定）
let session: BrowserSession | null = null;
let sessionHeadless: boolean | null = null;

function getSession(ctx: ToolContext): BrowserSession {
  if (!session || sessionHeadless !== ctx.headless) {
    session = new BrowserSession(ctx.headless);
    sessionHeadless = ctx.headless;
  }
  return session;
}

function renderSnapshot(entries: SnapshotEntry[]): string {
  if (entries.length === 0) return "（无可交互元素）";
  return entries
    .map((e) => `[${e.ref}] <${e.tag}${e.role !== e.tag ? ` role=${e.role}` : ""}> "${e.text}"${e.attrs ? ` (${e.attrs})` : ""}`)
    .join("\n");
}

export const browserNavigateTool: ToolDef = {
  name: "browser_navigate",
  description: "在浏览器中打开指定 URL",
  permission: "execute",
  parameters: Type.Object({
    url: Type.String({ description: "要打开的网页 URL" }),
  }),
  async execute(args, ctx) {
    const url = String(args["url"] ?? "");
    if (!url) return err("browser_navigate 需要 url 参数");
    try {
      return ok(await getSession(ctx).navigate(url));
    } catch (e) {
      return err(`导航失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserSnapshotTool: ToolDef = {
  name: "browser_snapshot",
  description: "扫描当前页面的可交互元素，返回带 ref 编号的列表。后续用 browser_click/browser_type 引用 ref 操作元素（无需猜坐标）",
  permission: "readonly",
  parameters: Type.Object({}),
  async execute(_args, ctx) {
    try {
      const snap = await getSession(ctx).snapshot();
      return ok(`页面: ${snap.title}\nURL: ${snap.url}\n\n可交互元素:\n${renderSnapshot(snap.entries)}`);
    } catch (e) {
      return err(`快照失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserClickTool: ToolDef = {
  name: "browser_click",
  description: "点击页面元素。target 可以是 browser_snapshot 返回的 ref（如 e3）或 CSS 选择器",
  permission: "execute",
  parameters: Type.Object({
    target: Type.String({ description: "元素的 ref（如 e3）或 CSS 选择器" }),
  }),
  async execute(args, ctx) {
    const target = String(args["target"] ?? "");
    if (!target) return err("browser_click 需要 target 参数");
    try {
      return ok(await getSession(ctx).click(target));
    } catch (e) {
      return err(`点击失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserTypeTool: ToolDef = {
  name: "browser_type",
  description: "在输入框中填入文本。target 为 ref 或选择器",
  permission: "execute",
  parameters: Type.Object({
    target: Type.String({ description: "输入框的 ref 或 CSS 选择器" }),
    text: Type.String({ description: "要输入的文本" }),
  }),
  async execute(args, ctx) {
    const target = String(args["target"] ?? "");
    const text = String(args["text"] ?? "");
    if (!target) return err("browser_type 需要 target 参数");
    try {
      return ok(await getSession(ctx).type(target, text));
    } catch (e) {
      return err(`输入失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserPressTool: ToolDef = {
  name: "browser_press",
  description: "按下键盘按键（如 Enter、Tab、Escape、ArrowDown）",
  permission: "execute",
  parameters: Type.Object({
    key: Type.String({ description: "按键名（Enter/Tab/Escape/ArrowDown 等）" }),
  }),
  async execute(args, ctx) {
    const key = String(args["key"] ?? "");
    if (!key) return err("browser_press 需要 key 参数");
    try {
      return ok(await getSession(ctx).press(key));
    } catch (e) {
      return err(`按键失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserGetTextTool: ToolDef = {
  name: "browser_get_text",
  description: "读取页面或指定元素的文本内容。不传 target 则返回整页正文",
  permission: "readonly",
  parameters: Type.Object({
    target: Type.Optional(Type.String({ description: "元素 ref 或选择器（可选）" })),
  }),
  async execute(args, ctx) {
    const target = args["target"] ? String(args["target"]) : undefined;
    try {
      const text = await getSession(ctx).getText(target);
      return ok(text || "（无文本）");
    } catch (e) {
      return err(`读取文本失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserScreenshotTool: ToolDef = {
  name: "browser_screenshot",
  description: "对当前页面截图，返回图像（供视觉判断页面状态）",
  permission: "readonly",
  parameters: Type.Object({}),
  async execute(_args, ctx) {
    try {
      const img = await getSession(ctx).screenshot();
      return ok("已截图（见图像）", img);
    } catch (e) {
      return err(`截图失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserScrollTool: ToolDef = {
  name: "browser_scroll",
  description: "滚动页面",
  permission: "execute",
  parameters: Type.Object({
    direction: Type.Union([Type.Literal("up"), Type.Literal("down")], { description: "滚动方向" }),
    amount: Type.Optional(Type.Number({ description: "滚动像素（默认 600）" })),
  }),
  async execute(args, ctx) {
    const direction = args["direction"] === "up" ? "up" : "down";
    const amount = typeof args["amount"] === "number" ? args["amount"] : 600;
    try {
      return ok(await getSession(ctx).scroll(direction, amount));
    } catch (e) {
      return err(`滚动失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserWaitTool: ToolDef = {
  name: "browser_wait",
  description: "等待某个元素出现",
  permission: "readonly",
  parameters: Type.Object({
    target: Type.String({ description: "等待的元素 ref 或选择器" }),
    timeout_ms: Type.Optional(Type.Number({ description: "超时毫秒（默认 8000）" })),
  }),
  async execute(args, ctx) {
    const target = String(args["target"] ?? "");
    const timeout = typeof args["timeout_ms"] === "number" ? args["timeout_ms"] : 8000;
    if (!target) return err("browser_wait 需要 target 参数");
    try {
      return ok(await getSession(ctx).waitFor(target, timeout));
    } catch (e) {
      return err(`等待超时: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const browserTools: ToolDef[] = [
  browserNavigateTool,
  browserSnapshotTool,
  browserClickTool,
  browserTypeTool,
  browserPressTool,
  browserGetTextTool,
  browserScreenshotTool,
  browserScrollTool,
  browserWaitTool,
];
