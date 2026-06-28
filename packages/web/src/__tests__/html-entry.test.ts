import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Web HTML entry", () => {
  it("declares a responsive viewport for mobile workbench layouts", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
    expect(html).toContain("initial-scale=1");
  });
});
