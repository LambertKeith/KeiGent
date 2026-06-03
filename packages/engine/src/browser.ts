import { vlog, vwarn } from "./logger.js";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync } from "fs";
import type { StateCapture, StateSnapshot } from "./types.js";

// ── Chrome 路径跨平台探测 ──────────────────────────────────────────────

function findChrome(): string | undefined {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((p) => existsSync(p));
}

// ── 全局浏览器单例（跨工具调用共享会话）────────────────────────────────

let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;
let currentHeadless = true;

export interface BrowserLaunchOptions {
  headless?: boolean;
}

export async function getBrowserPage(opts: BrowserLaunchOptions = {}): Promise<Page> {
  const headless = opts.headless ?? currentHeadless;
  // headless 模式变化时重启浏览器
  if (browserInstance && browserInstance.isConnected() && headless !== currentHeadless) {
    await closeBrowser();
  }
  currentHeadless = headless;

  if (!browserInstance || !browserInstance.isConnected()) {
    const execPath = findChrome();
    vlog(`[browser] 启动 Chrome（headless=${headless}）...`);
    browserInstance = await chromium.launch({
      ...(execPath ? { executablePath: execPath } : {}),
      headless,
    });
  }
  if (!pageInstance || pageInstance.isClosed()) {
    pageInstance = await browserInstance.newPage();
    await pageInstance.setViewportSize({ width: 1280, height: 800 });
    await pageInstance.setExtraHTTPHeaders({
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    });
  }
  return pageInstance;
}

export async function closeBrowser(): Promise<void> {
  if (pageInstance) {
    await pageInstance.close().catch(() => {});
    pageInstance = null;
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

// ── snapshot+ref 范式：给可交互元素打 ref 编号 ─────────────────────────

const REF_ATTR = "data-keigent-ref";

/** 元素快照条目 */
export interface SnapshotEntry {
  ref: string;          // e1, e2, ...
  tag: string;          // button, a, input, ...
  role: string;         // 元素角色
  text: string;         // 可见文本/label
  attrs: string;        // 关键属性摘要（href/placeholder/type 等）
}

/**
 * BrowserSession：封装一个浏览器页面的所有操作。
 * 工具层（tools/impl/browser.ts）调用这些方法。
 */
export class BrowserSession {
  constructor(private readonly headless: boolean) {}

  private async page(): Promise<Page> {
    return getBrowserPage({ headless: this.headless });
  }

  async navigate(url: string): Promise<string> {
    const page = await this.page();
    vlog(`[browser] 导航: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(600);
    const title = await page.title();
    return `已打开 ${page.url()}（标题: ${title}）`;
  }

  /**
   * 快照：扫描所有可交互元素，给每个分配 ref，返回结构化列表。
   * 这是 snapshot+ref 范式的核心——模型据此用 ref 点击，无需猜坐标。
   */
  async snapshot(): Promise<{ url: string; title: string; entries: SnapshotEntry[] }> {
    const page = await this.page();
    const title = await page.title();
    const url = page.url();

    const entries = await page.evaluate((refAttr) => {
      const selector = "a,button,input,textarea,select,[role=button],[role=link],[role=tab],[onclick]";
      const els = Array.from(document.querySelectorAll(selector));
      const result: { ref: string; tag: string; role: string; text: string; attrs: string }[] = [];
      let counter = 0;

      for (const el of els) {
        const htmlEl = el as HTMLElement;
        // 跳过不可见元素
        const rect = htmlEl.getBoundingClientRect();
        const style = window.getComputedStyle(htmlEl);
        if (rect.width === 0 || rect.height === 0 || style.display === "none" || style.visibility === "hidden") {
          continue;
        }

        const ref = `e${++counter}`;
        htmlEl.setAttribute(refAttr, ref);

        const tag = htmlEl.tagName.toLowerCase();
        const role = htmlEl.getAttribute("role") || tag;
        // 文本：innerText / value / placeholder / aria-label
        let text = (htmlEl.innerText || "").trim().slice(0, 60);
        if (!text) {
          text = (htmlEl.getAttribute("aria-label") || htmlEl.getAttribute("placeholder") || (htmlEl as HTMLInputElement).value || "").slice(0, 60);
        }

        // 关键属性
        const attrParts: string[] = [];
        const href = htmlEl.getAttribute("href");
        if (href) attrParts.push(`href=${href.slice(0, 50)}`);
        const type = htmlEl.getAttribute("type");
        if (type) attrParts.push(`type=${type}`);
        const placeholder = htmlEl.getAttribute("placeholder");
        if (placeholder) attrParts.push(`placeholder=${placeholder.slice(0, 30)}`);

        result.push({ ref, tag, role, text, attrs: attrParts.join(" ") });
        if (result.length >= 80) break; // 上限防爆
      }
      return result;
    }, REF_ATTR);

    return { url, title, entries };
  }

  /** 用 ref 或 selector 定位元素 */
  private locator(refOrSelector: string) {
    return refOrSelector.startsWith("e") && /^e\d+$/.test(refOrSelector)
      ? `[${REF_ATTR}="${refOrSelector}"]`
      : refOrSelector;
  }

  async click(refOrSelector: string): Promise<string> {
    const page = await this.page();
    const sel = this.locator(refOrSelector);
    await page.click(sel, { timeout: 8000 });
    await page.waitForTimeout(500);
    return `已点击 ${refOrSelector}（当前 URL: ${page.url()}）`;
  }

  async type(refOrSelector: string, text: string): Promise<string> {
    const page = await this.page();
    const sel = this.locator(refOrSelector);
    await page.fill(sel, text, { timeout: 8000 });
    return `已在 ${refOrSelector} 输入: ${text.slice(0, 40)}`;
  }

  async press(key: string): Promise<string> {
    const page = await this.page();
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
    return `已按键: ${key}`;
  }

  async getText(refOrSelector?: string): Promise<string> {
    const page = await this.page();
    if (refOrSelector) {
      const sel = this.locator(refOrSelector);
      return (await page.textContent(sel, { timeout: 5000 })) ?? "";
    }
    // 无参数：返回整页正文
    return page.evaluate(() => {
      const noisy = document.querySelectorAll("script,style,nav,footer,header,aside");
      noisy.forEach((el) => el.remove());
      return (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 5000);
    });
  }

  async screenshot(): Promise<{ data: string; mimeType: string }> {
    const page = await this.page();
    const buf = await page.screenshot({ type: "png", fullPage: false });
    return { data: buf.toString("base64"), mimeType: "image/png" };
  }

  async scroll(direction: "up" | "down", amount = 600): Promise<string> {
    const page = await this.page();
    const dy = direction === "down" ? amount : -amount;
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(300);
    return `已滚动 ${direction} ${amount}px`;
  }

  async waitFor(refOrSelector: string, timeoutMs = 8000): Promise<string> {
    const page = await this.page();
    const sel = this.locator(refOrSelector);
    await page.waitForSelector(sel, { timeout: timeoutMs });
    return `元素 ${refOrSelector} 已出现`;
  }
}

// ── 旧 fetchUrl（web_fetch 工具仍用）─────────────────────────────────

export async function fetchUrl(url: string): Promise<string> {
  vlog(`[browser] 导航到: ${url}`);
  const page = await getBrowserPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(800);
  const title = await page.title();
  const text = await page.evaluate(() => {
    const noisy = document.querySelectorAll("script,style,nav,footer,header,aside,[role=navigation],[role=banner]");
    noisy.forEach((el) => el.remove());
    return (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 3000);
  });
  vlog(`[browser] 抓取完成: "${title}" (${text.length} chars)`);
  return `标题: ${title}\n内容: ${text}`;
}

// ── 真实 StateCapture ─────────────────────────────────────────────────

export class PlaywrightStateCapture implements StateCapture {
  async capture(): Promise<StateSnapshot> {
    if (!pageInstance || pageInstance.isClosed()) {
      return { raw: { error: "browser not open" } };
    }
    const url = pageInstance.url();
    const title = await pageInstance.title();
    const visibleText = await pageInstance.evaluate(() =>
      (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    );
    const domDigest = await pageInstance.evaluate(() => {
      const tags: string[] = [];
      document.querySelectorAll("h1,h2,h3,p,a,button,input,form").forEach((el) => {
        const text = el.textContent?.trim().slice(0, 30) ?? "";
        if (text) tags.push(`<${el.tagName.toLowerCase()}>${text}`);
      });
      return tags.slice(0, 20).join(" | ");
    });
    vlog(`[state-capture] url=${url} title="${title}" text=${visibleText.length}chars`);
    return { url, domDigest, visibleText, raw: { title } };
  }
}
