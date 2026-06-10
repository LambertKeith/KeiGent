import { describe, expect, it } from "vitest";
import { deriveConfigStatus, normalizeConfigPageView } from "../config/config-view.js";

describe("config page view model", () => {
  it("does not report ready when a required field is missing", () => {
    expect(
      deriveConfigStatus({
        fields: [{ label: "apiKey", effectiveValue: "[MISSING]", source: "missing", secret: true, issues: ["required"] }],
        doctorIssues: [],
      }),
    ).toBe("needs_attention");
  });

  it("treats doctor errors as invalid", () => {
    expect(
      deriveConfigStatus({
        fields: [],
        doctorIssues: [{ code: "baseUrl.invalid", severity: "error", message: "invalid" }],
      }),
    ).toBe("invalid");
  });

  it("normalizes source-aware config with redaction and offline doctor status", () => {
    const view = normalizeConfigPageView({
      fields: [
        { label: "apiKey", effectiveValue: "sk-config-secret-123456", source: "env", secret: true },
        { label: "apiProtocol", effectiveValue: "openai", source: "default" },
      ],
      doctorIssues: [{ code: "apiKey.env_overrides_file", severity: "warning", message: "env overrides file" }],
    });

    expect(JSON.stringify(view)).not.toContain("sk-config-secret-123456");
    expect(view.fields[0]).toMatchObject({ label: "apiKey", source: "env", secret: true });
    expect(view.fields[0]?.effectiveValue).toMatch(/^\[REDACTED/);
    expect(view.offlineDoctor).toMatchObject({ mode: "offline", status: "needs_attention" });
    expect(view.onlineDoctor).toMatchObject({ enabled: false, requiresExplicitAction: true });
  });

  it("only enables online doctor after an explicit action", () => {
    const view = normalizeConfigPageView({
      fields: [{ label: "apiKey", effectiveValue: "[REDACTED]", source: "env", secret: true }],
      doctorIssues: [],
      onlineDoctorRequested: true,
    });

    expect(view.onlineDoctor).toMatchObject({ enabled: true, requiresExplicitAction: false });
  });

  it("renders object config fields as JSON instead of object placeholders", () => {
    const view = normalizeConfigPageView({
      fields: [
        {
          label: "modelPricing",
          effectiveValue: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 3 },
          source: "file",
        },
      ],
      doctorIssues: [],
    });

    expect(view.fields[0]?.effectiveValue).toBe("{\"input\":2.5,\"output\":10,\"cacheRead\":0.25,\"cacheWrite\":3}");
  });
});
