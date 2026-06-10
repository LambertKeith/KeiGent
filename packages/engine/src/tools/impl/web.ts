import { Type } from "@earendil-works/pi-ai";
import { fetchUrl } from "../../browser.js";
import type { ToolDef } from "../types.js";
import { ok, err } from "../types.js";
import { redactText } from "../../redaction.js";

/**
 * web_fetch —— 抓取 URL 的网页文本内容。
 * 迁移自原 engine.executeTool 的 fetch_url（含 task.goal URL 兜底）。
 */
export const webFetchTool: ToolDef = {
  name: "web_fetch",
  description: "抓取指定 URL 的网页内容，返回标题和正文文本",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  parameters: Type.Object({
    url: Type.String({ description: "要抓取的网页 URL" }),
  }),
  async execute(args, ctx) {
    let url = String(args["url"] ?? "");
    // 兜底：模型未传 url 时从 task.goal 提取（gpt-5.5 有时漏传参数）
    if (!url) {
      const match = /https?:\/\/[^\s）)】\]]+/.exec(ctx.task.goal);
      if (match) {
        url = match[0];
        console.log(`[web_fetch] 参数缺失，从 task.goal 提取: ${url}`);
      }
    }
    if (!url) return err("web_fetch 需要 url 参数");
    try {
      const content = await fetchUrl(url);
      return ok(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(`抓取失败: ${msg}`);
    }
  },
};

// 兼容别名：旧 skill/任务可能用 fetch_url 这个名字
export const fetchUrlAlias: ToolDef = {
  ...webFetchTool,
  name: "fetch_url",
  description: "（别名）抓取指定 URL 的网页内容，等同 web_fetch",
};

/**
 * http_get —— readonly HTTP connector. No headers/body/method override, so it
 * cannot be used as a write-capable HTTP primitive.
 */
export const httpGetTool: ToolDef = {
  name: "http_get",
  description: "Readonly connector: HTTP GET a URL without custom headers or body, returning status, source URL, and redacted response text.",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  timeoutMs: 31_000,
  maxOutputChars: 50_000,
  parameters: Type.Object({
    url: Type.String({ description: "URL to read with HTTP GET" }),
  }),
  async execute(args, ctx) {
    const url = String(args["url"] ?? "");
    if (!url) return err("http_get 需要 url 参数");
    if (args["method"] && String(args["method"]).toUpperCase() !== "GET") {
      return err("write_unsupported=http_get_readonly: method override is not allowed");
    }
    if (args["body"] !== undefined || args["headers"] !== undefined) {
      return err("write_unsupported=http_get_readonly: headers/body are not allowed");
    }
    if (ctx.signal?.aborted) return err("http_get aborted");

    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    ctx.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const resp = await fetch(url, { method: "GET", signal: controller.signal });
      const text = redactText((await resp.text()).slice(0, 50_000));
      return ok([
        "connector=http_get",
        `source_url=${redactText(resp.url)}`,
        `HTTP ${resp.status} ${resp.statusText}`,
        "",
        text,
      ].join("\n"));
    } catch (e) {
      return err(`connector_failure=http_get_unavailable\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", abortFromParent);
    }
  },
};

/**
 * http_request —— 完整 HTTP 请求（method/headers/body 控制）。
 */
export const httpRequestTool: ToolDef = {
  name: "http_request",
  description: "发送 HTTP 请求（支持 method/headers/body），返回状态码和响应体",
  permission: "execute",
  riskLevel: "R3",
  sideEffect: "external",
  reversible: false,
  maxOutputChars: 50_000,
  parameters: Type.Object({
    url: Type.String({ description: "请求 URL" }),
    method: Type.Optional(Type.String({ description: "HTTP 方法（默认 GET）" })),
    headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "请求头" })),
    body: Type.Optional(Type.String({ description: "请求体" })),
  }),
  async execute(args, ctx) {
    const url = String(args["url"] ?? "");
    if (!url) return err("http_request 需要 url 参数");
    const method = String(args["method"] ?? "GET").toUpperCase();
    const headers = (args["headers"] as Record<string, string>) ?? {};
    const body = args["body"] ? String(args["body"]) : undefined;

    if (ctx.signal?.aborted) return err("http_request aborted");
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    ctx.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const resp = await fetch(url, {
        method,
        headers,
        ...(body && method !== "GET" && method !== "HEAD" ? { body } : {}),
        signal: controller.signal,
      });
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", abortFromParent);
      const text = (await resp.text()).slice(0, 50_000);
      return ok(`HTTP ${resp.status} ${resp.statusText}\nURL: ${resp.url}\n\n${text}`);
    } catch (e) {
      return err(`请求失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", abortFromParent);
    }
  },
};
