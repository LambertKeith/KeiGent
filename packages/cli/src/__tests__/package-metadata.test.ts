import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function readPackageJson(): Promise<Record<string, any>> {
  return JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
}

describe("CLI package metadata", () => {
  it("publishes a bin entry without npx or pnpm wrapper noise", async () => {
    const pkg = await readPackageJson();
    const bin = await readFile(join(process.cwd(), "bin", "keigent.mjs"), "utf8");

    expect(pkg.bin).toMatchObject({ keigent: "./bin/keigent.mjs" });
    expect(pkg.scripts.build).toContain("tsconfig.build.json");
    expect(pkg.scripts.test).toBe("vitest run src");
    expect(bin.split("\n")[0]).toBe("#!/usr/bin/env node");
    expect(bin).not.toContain("npx");
    expect(bin).not.toContain("pnpm");
  });

  it("declares the repository license and contribution policy for release governance", async () => {
    const repoRoot = join(process.cwd(), "../..");
    const packagePaths = [
      "package.json",
      "packages/engine/package.json",
      "packages/cli/package.json",
      "packages/web/package.json",
    ];

    for (const packagePath of packagePaths) {
      const pkg = JSON.parse(await readFile(join(repoRoot, packagePath), "utf8")) as Record<string, unknown>;
      expect(pkg.license, packagePath).toBe("Apache-2.0");
    }
    await expect(readFile(join(repoRoot, "LICENSE"), "utf8")).resolves.toContain("Apache License");
    await expect(readFile(join(repoRoot, "CONTRIBUTING.md"), "utf8")).resolves.toContain("Apache-2.0");
  });
});
