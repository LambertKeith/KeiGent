#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = join(packageDir, "node_modules", "tsx", "dist", "cli.mjs");
const entrypoint = join(packageDir, "src", "main.ts");

const result = spawnSync(process.execPath, [tsxCli, entrypoint, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(`[keigent] failed to start CLI: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
