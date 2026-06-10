import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";

function ctx(approval = { request: vi.fn(async () => true) }): ToolContext {
  return {
    workspace: "/tmp/workspace",
    browser: null,
    approval,
    task: { goal: "Read HTTP source", profile: "auto" },
    headless: true,
  };
}

async function withServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe("http_get readonly connector", () => {
  it("reads HTTP sources through ToolRegistry without approval and redacts response secrets", async () => {
    const { server, url } = await withServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello api_key=sk-http-secret-123456");
    });
    const approval = { request: vi.fn(async () => true) };
    const registry = buildDefaultRegistry();

    try {
      const result = await registry.execute("http_get", { url }, ctx(approval));

      expect(result.isError).toBe(false);
      expect(result.content).toContain("connector=http_get");
      expect(result.content).toContain(`source_url=${url}/`);
      expect(result.content).toContain("HTTP 200 OK");
      expect(result.content).toContain("hello [REDACTED]");
      expect(result.content).not.toContain("sk-http-secret-123456");
      expect(approval.request).not.toHaveBeenCalled();
      expect(registry.get("http_get")).toMatchObject({
        permission: "readonly",
        riskLevel: "R0",
        sideEffect: "none",
        reversible: true,
      });
    } finally {
      server.close();
    }
  });

  it("rejects write-like options and reports connector failures structurally", async () => {
    const registry = buildDefaultRegistry();

    await expect(registry.execute("http_get", { url: "http://127.0.0.1:1", method: "POST" }, ctx())).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("write_unsupported=http_get_readonly"),
    });
    await expect(registry.execute("http_get", { url: "http://127.0.0.1:1" }, ctx())).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("connector_failure=http_get_unavailable"),
    });
  });
});
