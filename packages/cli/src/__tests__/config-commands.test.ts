import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { runConfigCommand, runDoctor } from "../config-commands.js";

async function tempConfigPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keigent-config-command-"));
  await mkdir(join(dir, ".keigent"), { recursive: true });
  return join(dir, ".keigent", "config.json");
}

async function run(args: string[], configPath: string, env: NodeJS.ProcessEnv = {}): Promise<string[]> {
  const lines: string[] = [];
  await runConfigCommand(args, {
    configPath,
    env,
    stdout: (line) => lines.push(line),
  });
  return lines;
}

describe("config commands", () => {
  it("prints the active config path without creating a file", async () => {
    const configPath = await tempConfigPath();

    const lines = await run(["path"], configPath);

    expect(lines).toEqual([configPath]);
    await expect(readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("initializes a secure config file without overwriting unless forced", async () => {
    const configPath = await tempConfigPath();

    await run(["init"], configPath);
    const initial = await readFile(configPath, "utf8");
    const mode = (await stat(configPath)).mode & 0o777;

    expect(JSON.parse(initial)).toMatchObject({
      configVersion: 1,
      apiKey: "",
      apiProtocol: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelId: "gpt-4o-mini",
      headless: false,
      maxIterations: 12,
      maxChildRuns: 1,
      maxToolCalls: 20,
      maxTokenEstimate: 64000,
      maxProviderCostUsd: null,
      modelPricing: null,
      maxWallTimeMs: 120000,
      maxRecoveryAttempts: 3,
    });
    expect(mode & 0o077).toBe(0);
    await expect(run(["init"], configPath)).rejects.toThrow("already exists");

    await run(["init", "--force"], configPath);
    expect(await readFile(configPath, "utf8")).toContain('"apiKey": ""');
  });

  it("sets and unsets config fields atomically", async () => {
    const configPath = await tempConfigPath();
    await run(["init"], configPath);

    await run(["set", "modelId", "gpt-test"], configPath);
    await run(["set", "headless", "true"], configPath);
    await run(["set", "maxChildRuns", "2"], configPath);
    await run(["set", "maxToolCalls", "7"], configPath);
    await run(["set", "maxTokenEstimate", "8000"], configPath);
    await run(["set", "maxProviderCostUsd", "0.25"], configPath);
    await run(["set", "modelPricing", "{\"input\":2.5,\"output\":10,\"cacheRead\":0.25,\"cacheWrite\":3}"], configPath);
    await run(["set", "maxWallTimeMs", "9000"], configPath);
    await run(["set", "maxRecoveryAttempts", "1"], configPath);
    await run(["unset", "modelId"], configPath);

    const saved = JSON.parse(await readFile(configPath, "utf8"));
    expect(saved.modelId).toBeUndefined();
    expect(saved.headless).toBe(true);
    expect(saved.maxChildRuns).toBe(2);
    expect(saved.maxToolCalls).toBe(7);
    expect(saved.maxTokenEstimate).toBe(8000);
    expect(saved.maxProviderCostUsd).toBe(0.25);
    expect(saved.modelPricing).toEqual({ input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 3 });
    expect(saved.maxWallTimeMs).toBe(9000);
    expect(saved.maxRecoveryAttempts).toBe(1);
  });

  it("rejects malformed modelPricing values in config set", async () => {
    const configPath = await tempConfigPath();
    await run(["init"], configPath);

    await expect(run(["set", "modelPricing", "{\"input\":-1,\"output\":10,\"cacheRead\":0,\"cacheWrite\":0}"], configPath))
      .rejects.toThrow("modelPricing must be null or JSON with non-negative input/output/cacheRead/cacheWrite numbers");
  });

  it("shows effective source-aware config without raw secrets", async () => {
    const configPath = await tempConfigPath();
    await run(["init"], configPath);
    await run(["set", "apiKey", "file-secret"], configPath);

    const [json] = await run(["show", "--json"], configPath, {
      KEIGENT_API_KEY: "env-secret",
      KEIGENT_MODEL_ID: "env-model",
    });
    const shown = JSON.parse(json!);

    expect(JSON.stringify(shown)).not.toContain("file-secret");
    expect(JSON.stringify(shown)).not.toContain("env-secret");
    expect(shown.fields.apiKey.source).toBe("env");
    expect(shown.fields.apiKey.value).toMatch(/^\[REDACTED/);
    expect(shown.fields.modelId).toMatchObject({ value: "env-model", source: "env" });
    expect(shown.fields.apiProtocol).toMatchObject({ value: "openai", source: "file" });
  });

  it("prints compact JSON for config show when requested", async () => {
    const configPath = await tempConfigPath();
    await run(["init"], configPath);

    const [json] = await run(["show", "--compact"], configPath);
    const shown = JSON.parse(json!);

    expect(shown.configPath).toBe(configPath);
    expect(json).not.toContain("\n");
  });

  it("runs offline doctor as local validation without network calls", async () => {
    const configPath = await tempConfigPath();
    const output = captureOutput();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await run(["init"], configPath);
    await run(["set", "apiKey", "file-secret"], configPath);

    await runDoctor(["--offline", "--json"], {
      configPath,
      stdout: output.stdout,
      env: {},
    });
    const payload = JSON.parse(output.lines[0]!);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("file-secret");
    expect(payload.config.apiKey).toBe("[REDACTED]");
    fetchSpy.mockRestore();
  });

  it("prints compact JSON for doctor when requested", async () => {
    const configPath = await tempConfigPath();
    const output = captureOutput();
    await run(["init"], configPath);
    await run(["set", "apiKey", "file-secret"], configPath);

    await runDoctor(["--offline", "--compact"], {
      configPath,
      stdout: output.stdout,
      env: {},
    });
    const payload = JSON.parse(output.lines[0]!);

    expect(payload.config.apiKey).toBe("[REDACTED]");
    expect(output.lines[0]).not.toContain("\n");
  });
});

function captureOutput(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}
