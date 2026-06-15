import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../tools/types.js";

vi.mock("../browser.js", () => ({
  fetchUrl: vi.fn(async (url: string) => `标题: ${url}\n内容: mocked`),
  BrowserSession: class {
    async snapshot() {
      return { url: "https://example.com/app", title: "Example App", entries: [] };
    }

    async getText() {
      return "Example body";
    }

    async screenshot() {
      return { data: "abc123", mimeType: "image/png" };
    }
  },
}));

function ctx(workspace: string): ToolContext {
  return {
    workspace,
    browser: null,
    approval: { request: vi.fn(async () => true) },
    task: { goal: "Read readonly connector sources", profile: "auto" },
    headless: true,
  };
}

describe("readonly connector sources", () => {
  it("attaches workspace file sources to file readonly tools", async () => {
    const { buildDefaultRegistry } = await import("../tools/index.js");
    const workspace = await mkdtemp(join(tmpdir(), "keigent-file-sources-"));
    await mkdir(join(workspace, "docs"));
    await writeFile(join(workspace, "docs", "readme.md"), "hello source", "utf8");
    const registry = buildDefaultRegistry();

    await expect(registry.execute("file_read", { path: "docs/readme.md" }, ctx(workspace))).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "file", ref: join(workspace, "docs", "readme.md"), connector: "file_read" }],
    });
    await expect(registry.execute("file_list", { path: "docs" }, ctx(workspace))).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "workspace_path", ref: join(workspace, "docs"), connector: "file_list" }],
    });
    await expect(registry.execute("grep", { path: "docs", pattern: "source" }, ctx(workspace))).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "workspace_path", ref: join(workspace, "docs"), connector: "grep" }],
    });
  });

  it("attaches URL and browser state sources to web and browser readonly tools", async () => {
    const { buildDefaultRegistry } = await import("../tools/index.js");
    const registry = buildDefaultRegistry();
    const context = ctx("/tmp/workspace");

    await expect(registry.execute("web_fetch", { url: "https://example.com/page" }, context)).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "url", ref: "https://example.com/page", connector: "web_fetch" }],
    });
    await expect(registry.execute("browser_snapshot", {}, context)).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "browser_state", ref: "https://example.com/app", connector: "browser_snapshot" }],
    });
    await expect(registry.execute("browser_get_text", {}, context)).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "browser_state", ref: "current_page", connector: "browser_get_text" }],
    });
    await expect(registry.execute("browser_screenshot", {}, context)).resolves.toMatchObject({
      isError: false,
      sources: [{ kind: "browser_state", ref: "current_page", connector: "browser_screenshot" }],
    });
  });
});
