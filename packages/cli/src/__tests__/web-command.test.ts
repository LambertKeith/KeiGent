import { describe, expect, it } from "vitest";
import { runWebCommand } from "../web-command.js";

function capture(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}

describe("web command", () => {
  it("prints a localhost workbench URL and dev command", async () => {
    const output = capture();

    await runWebCommand(["--print"], { stdout: output.stdout });

    expect(output.lines.join("\n")).toContain("http://127.0.0.1:5173");
    expect(output.lines.join("\n")).toContain("corepack pnpm --filter @keigent/web dev");
  });

  it("prints the local Web API URL when requested", async () => {
    const output = capture();

    await runWebCommand(["--api", "--api-port", "5174", "--print"], { stdout: output.stdout });

    expect(output.lines.join("\n")).toContain("http://127.0.0.1:5173");
    expect(output.lines.join("\n")).toContain("API: http://127.0.0.1:5174");
    expect(output.lines.join("\n")).toContain("VITE_KEIGENT_API_URL=http://127.0.0.1:5174");
  });

  it("rejects public bind unless explicitly allowed", async () => {
    await expect(runWebCommand(["--host", "0.0.0.0", "--print"])).rejects.toThrow(
      "public bind requires --allow-public",
    );
  });

  it("allows public bind only with an explicit danger flag", async () => {
    const output = capture();

    await runWebCommand(["--host", "0.0.0.0", "--allow-public", "--print"], {
      stdout: output.stdout,
    });

    expect(output.lines.join("\n")).toContain("http://0.0.0.0:5173");
    expect(output.lines.join("\n")).toContain("public bind allowed");
  });
});
