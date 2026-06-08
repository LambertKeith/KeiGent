#!/usr/bin/env -S npx tsx
import { runRepl } from "./repl.js";
import { runOnce } from "./run-once.js";
import { printError } from "./renderer.js";
import { runConfigCommand, runDoctor } from "./config-commands.js";
import { parseCliArgs } from "./args.js";

async function main() {
  const invocation = parseCliArgs(process.argv.slice(2));

  switch (invocation.kind) {
    case "doctor":
      await runDoctor(invocation.args);
      return;
    case "config":
      await runConfigCommand(invocation.args);
      return;
    case "run":
      await runOnce(invocation.task);
      return;
    case "repl":
      await runRepl();
      return;
  }
}

main().catch((e) => {
  printError(`致命错误: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
