import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

  it("declares release verification and keeps the CLI bin executable", async () => {
    const repoRoot = join(process.cwd(), "../..");
    const rootPkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const binPath = join(process.cwd(), "bin", "keigent.mjs");
    const binStat = await stat(binPath);

    expect(rootPkg.scripts).toMatchObject({
      "verify:node": "node scripts/verify-node-version.mjs",
    });
    expect(binStat.mode & 0o111).toBeGreaterThan(0);
  });

  it("executes runs list --compact through the bin shim as clean JSON", async () => {
    const repoRoot = join(process.cwd(), "../..");
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "bin", "keigent.mjs"),
      "runs",
      "list",
      "--compact",
    ], {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf8",
    });
    const stdout = result.stdout.trim();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(stdout).toMatch(/^\{.*\}$/);
    expect(stdout.split("\n")).toHaveLength(1);
    expect(JSON.parse(stdout)).toMatchObject({
      total: expect.any(Number),
      runs: expect.any(Array),
      errors: expect.any(Array),
      migrationReport: expect.objectContaining({
        schemaVersion: 1,
        totalRecords: expect.any(Number),
      }),
    });
  });

  it("declares Node 22.19 CI gates for release packaging", async () => {
    const repoRoot = join(process.cwd(), "../..");
    const workflow = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");

    expect(workflow).toContain("node-version: 22.19.0");
    expect(workflow).toContain("corepack prepare pnpm@10.33.2 --activate");
    expect(workflow).toContain("corepack pnpm install --frozen-lockfile");
    expect(workflow).toContain("corepack pnpm verify:node");
    expect(workflow).toContain("corepack pnpm -r check");
    expect(workflow).toContain("corepack pnpm -r test");
    expect(workflow).toContain("corepack pnpm -r --if-present build");
    expect(workflow).toContain("node packages/cli/bin/keigent.mjs guide first-run --compact");
    expect(workflow).toContain("node packages/cli/bin/keigent.mjs guide upgrade-check --compact");
    expect(workflow).toContain("node packages/cli/bin/keigent.mjs runs list --compact");
  });
});
