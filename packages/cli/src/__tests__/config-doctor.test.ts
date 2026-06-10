import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { redactSecret, validateConfig } from "../config-doctor.js";

describe("config doctor", () => {
  it("reports invalid baseUrl/model/runtime budgets as explicit product states", () => {
    const config = resolveConfig(
      {
        baseUrl: "not a url",
        modelId: "",
        maxIterations: 0,
        maxChildRuns: 0,
        maxToolCalls: 0,
        maxTokenEstimate: 0,
        maxProviderCostUsd: -0.1,
        modelPricing: { input: -1, output: "bad", cacheRead: 0, cacheWrite: 0 } as never,
        maxWallTimeMs: 0,
        maxRecoveryAttempts: -1,
      },
      { KEIGENT_API_KEY: "generic_test_secret" },
      "/tmp/keigent-home",
    );

    expect(validateConfig(config).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "baseUrl.invalid",
      "modelId.empty",
      "maxIterations.invalid",
      "maxChildRuns.invalid",
      "maxToolCalls.invalid",
      "maxTokenEstimate.invalid",
      "maxProviderCostUsd.invalid",
      "modelPricing.invalid",
      "maxWallTimeMs.invalid",
      "maxRecoveryAttempts.invalid",
    ]));
  });

  it("warns when a provider cost ceiling has no local pricing", () => {
    const config = resolveConfig({ apiKey: "file-key", maxProviderCostUsd: 0.25 }, {}, "/tmp/keigent-home");

    expect(validateConfig(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "modelPricing.missing_for_cost_budget",
        severity: "warning",
        field: "modelPricing",
      }),
    ]));
  });

  it("accepts a provider cost ceiling when local pricing is configured", () => {
    const config = resolveConfig({
      apiKey: "file-key",
      maxProviderCostUsd: 0.25,
      modelPricing: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 3 },
    }, {}, "/tmp/keigent-home");

    expect(validateConfig(config).map((issue) => issue.code)).not.toContain("modelPricing.missing_for_cost_budget");
  });

  it("warns when model context capability is lower than runtime budgets need", () => {
    const config = resolveConfig({
      apiKey: "file-key",
      maxTokenEstimate: 8_000,
      modelCapabilities: { maxContextTokens: 1_024 },
    }, {}, "/tmp/keigent-home");

    expect(validateConfig(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "modelCapabilities.maxContextTokens.low",
        severity: "warning",
        field: "modelCapabilities",
      }),
    ]));
  });

  it("rejects insecure remote endpoints but permits localhost development", () => {
    const remote = resolveConfig({ baseUrl: "http://example.com", apiKey: "file-key" }, {}, "/tmp/keigent-home");
    const local = resolveConfig({ baseUrl: "http://127.0.0.1:4000", apiKey: "file-key" }, {}, "/tmp/keigent-home");

    expect(validateConfig(remote).map((issue) => issue.code)).toContain("baseUrl.insecure_remote");
    expect(validateConfig(local).map((issue) => issue.code)).not.toContain("baseUrl.insecure_remote");
  });

  it("rejects unknown model API protocols explicitly", () => {
    const config = { ...resolveConfig({ apiKey: "file-key" }, {}, "/tmp/keigent-home"), apiProtocol: "relay-specific" as never };

    expect(validateConfig(config).map((issue) => issue.code)).toContain("apiProtocol.invalid");
  });

  it("rejects unsupported config versions explicitly", () => {
    const config = { ...resolveConfig({ apiKey: "file-key" }, {}, "/tmp/keigent-home"), configVersion: 999 as never };

    expect(validateConfig(config).map((issue) => issue.code)).toContain("configVersion.unsupported");
  });

  it("reports missing Playwright browser cache as an actionable verification risk", () => {
    const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    try {
      const config = resolveConfig({ apiKey: "file-key" }, {}, "/tmp/keigent-home");

      expect(validateConfig(config)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "browser.playwright_path_unset",
          severity: "warning",
          nextAction: expect.stringContaining("PLAYWRIGHT_BROWSERS_PATH"),
        }),
      ]));
    } finally {
      if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
    }
  });

  it("redacts secrets with optional fingerprint", () => {
    expect(redactSecret(undefined)).toBe("[MISSING]");
    expect(redactSecret("abc")).toBe("[REDACTED]");
    expect(redactSecret("generic_1234567890")).toBe("[REDACTED:...7890]");
  });
});
