import { describe, expect, it } from "vitest";
import { buildModel, redactConfig, resolveConfig } from "../config.js";

describe("CLI config", () => {
  it("does not provide a hardcoded API key fallback", () => {
    expect(() => resolveConfig({}, {}, "/tmp/keigent-home")).toThrow("KEIGENT_API_KEY or apiKey in ~/.keigent/config.json is required");
  });

  it("uses generic env API key with highest precedence", () => {
    const config = resolveConfig({ apiKey: "file-key" }, { KEIGENT_API_KEY: "env-key" }, "/tmp/keigent-home");
    expect(config.apiKey).toBe("env-key");
  });

  it("does not let an empty KEIGENT_API_KEY shadow a file API key", () => {
    const config = resolveConfig({ apiKey: "file-key" }, { KEIGENT_API_KEY: "   " }, "/tmp/keigent-home");
    expect(config.apiKey).toBe("file-key");
  });

  it("resolves OpenAI-compatible protocol with a custom URL", () => {
    const config = resolveConfig(
      { apiProtocol: "openai", baseUrl: "https://gateway.example.com/v1", modelId: "custom-openai-model", apiKey: "file-key" },
      {},
      "/tmp/keigent-home",
    );
    const model = buildModel(config);

    expect(config.apiProtocol).toBe("openai");
    expect(model.api).toBe("openai-completions");
    expect(model.provider).toBe("openai-compatible");
    expect(model.baseUrl).toBe("https://gateway.example.com/v1");
  });

  it("resolves Anthropic-compatible protocol with a custom URL", () => {
    const config = resolveConfig(
      { apiProtocol: "anthropic", baseUrl: "https://anthropic-gateway.example.com", modelId: "claude-custom", apiKey: "file-key" },
      {},
      "/tmp/keigent-home",
    );
    const model = buildModel(config);

    expect(config.apiProtocol).toBe("anthropic");
    expect(model.api).toBe("anthropic-messages");
    expect(model.provider).toBe("anthropic-compatible");
    expect(model.baseUrl).toBe("https://anthropic-gateway.example.com");
  });

  it("allows generic env vars to override model protocol, URL, and model id", () => {
    const config = resolveConfig(
      { apiKey: "file-key", apiProtocol: "openai", baseUrl: "https://api.openai.com/v1", modelId: "file-model" },
      {
        KEIGENT_API_KEY: "env-key",
        KEIGENT_API_PROTOCOL: "anthropic",
        KEIGENT_BASE_URL: "https://api.anthropic.com",
        KEIGENT_MODEL_ID: "claude-env",
      },
      "/tmp/keigent-home",
    );

    expect(config).toMatchObject({
      apiKey: "env-key",
      apiProtocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      modelId: "claude-env",
    });
  });

  it("redacts secret values for diagnostics", () => {
    const config = resolveConfig({ apiKey: "***" }, {}, "/tmp/keigent-home");
    expect(redactConfig(config)).toMatchObject({ apiKey: "[REDACTED]" });
    expect(JSON.stringify(redactConfig(config))).not.toContain("***");
  });
});
