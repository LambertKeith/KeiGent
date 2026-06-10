import { describe, expect, it } from "vitest";
import { buildLiveConsoleView, renderLiveConsole } from "../conversation/live-console.js";

describe("live console rendering", () => {
  it("renders a non-chat run console with timeline and selected inspector", () => {
    const html = renderLiveConsole(buildLiveConsoleView({
      id: "run-render",
      mode: "live",
      task: { goal: "Create file" },
      events: [
        { kind: "profile_selected", profile: "convergent-exec", via: "rule" },
        { kind: "iteration_start", iteration: 1 },
        { kind: "tool_call", iteration: 1, toolName: "file_write", args: { path: "hello.txt" } },
      ],
    }));

    expect(html).toContain("Live Run Console");
    expect(html).toContain("Event timeline");
    expect(html).toContain("Selected event inspector");
    expect(html).toContain("tool: file_write");
    expect(html).not.toContain("chat");
  });
});
