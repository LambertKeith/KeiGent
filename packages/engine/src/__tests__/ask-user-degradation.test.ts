import { describe, expect, it } from "vitest";
import { askUserTool } from "../tools/impl/agent.js";
import type { ToolContext } from "../tools/types.js";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workspace: "/tmp/workspace",
    browser: null,
    approval: { request: async () => true },
    task: { goal: "Handle it", profile: "auto" },
    headless: true,
    ...overrides,
  };
}

describe("ask_user degradation", () => {
  it("returns a structured error when user input is required in non-interactive mode", async () => {
    const result = await askUserTool.execute({ question: "Which file should I update?" }, ctx());

    expect(result.isError).toBe(true);
    expect(result.content).toContain("non_interactive_input_required");
    expect(result.content).toContain("Which file should I update?");
    expect(result.content).toContain("REPL");
  });

  it("uses the interactive callback when available", async () => {
    const result = await askUserTool.execute(
      { question: "Continue?" },
      ctx({ askUser: async () => "yes" }),
    );

    expect(result.isError).toBe(false);
    expect(result.content).toContain("yes");
  });
});
