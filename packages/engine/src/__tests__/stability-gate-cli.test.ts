import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

describe("stability gate CLI", () => {
  it("prints compact JSON and exits successfully when all P0 redlines pass", async () => {
    const { stdout, stderr } = await execFileAsync(
      "corepack",
      ["pnpm", "--filter", "@keigent/engine", "eval:stability", "--", "--compact"],
      { cwd: repoRoot },
    );

    const jsonLine = stdout.trim().split("\n").at(-1) ?? "";
    const report = JSON.parse(jsonLine);
    expect(stderr).toBe("");
    expect(report).toMatchObject({
      datasetId: "local-real-task-v1",
      totalRedlines: 9,
      failedRedlines: 0,
      status: "passed",
    });
    expect(jsonLine).not.toContain("\n");
  }, 30_000);
});
