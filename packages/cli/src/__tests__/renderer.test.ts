import { afterEach, describe, expect, it, vi } from "vitest";
import { renderProgress } from "../renderer.js";

describe("renderProgress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders approval decisions without printing secret-bearing args", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    renderProgress({
      kind: "approval",
      iteration: 1,
      approved: false,
      decidedAt: "2026-06-09T10:00:00.000Z",
      request: {
        toolName: "shell",
        args: { command: "deploy", apiKey: "sk-render-secret" },
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "local",
        reversible: false,
        action: "执行工具 shell",
        targetResource: "workspace:/tmp/workspace",
        evidenceRequired: ["command"],
        exposesSecrets: true,
      },
    });

    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("approval");
    expect(output).toContain("shell");
    expect(output).toContain("R5");
    expect(output).toContain("denied");
    expect(output).not.toContain("sk-render-secret");
  });

  it("renders terminal failure next action", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    renderProgress({
      kind: "done",
      exitReason: "error",
      finalResponse: "[错误] 工具 shell 未获授权",
      failure: {
        code: "permission_denied",
        layer: "permission",
        message: "permission denied",
        nextAction: "在交互模式批准该范围，或调整任务/配置避免高风险工具。",
      },
    });

    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("permission_denied");
    expect(output).toContain("下一步");
  });
});
