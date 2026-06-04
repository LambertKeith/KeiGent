import { describe, expect, it } from "vitest";
import { deriveConfigStatus } from "../config/config-view.js";

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
});
