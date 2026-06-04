import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { redactSecret, validateConfig } from "../config-doctor.js";

describe("config doctor", () => {
  it("reports invalid baseUrl/model/maxIterations as explicit product states", () => {
    const config = resolveConfig(
      { baseUrl: "not a url", modelId: "", maxIterations: 0 },
      { KEIGENT_API_KEY: "generic_test_secret" },
      "/tmp/keigent-home",
    );

    expect(validateConfig(config).map((issue) => issue.code)).toEqual([
      "baseUrl.invalid",
      "modelId.empty",
      "maxIterations.invalid",
    ]);
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

  it("redacts secrets with optional fingerprint", () => {
    expect(redactSecret(undefined)).toBe("[MISSING]");
    expect(redactSecret("abc")).toBe("[REDACTED]");
    expect(redactSecret("generic_1234567890")).toBe("[REDACTED:...7890]");
  });
});
