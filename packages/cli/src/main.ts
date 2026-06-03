#!/usr/bin/env -S npx tsx
import { runRepl } from "./repl.js";
import { runOnce } from "./run-once.js";
import { printError } from "./renderer.js";

async function main() {
  const args = process.argv.slice(2);

  // keigent run "任务"  或  keigent "任务"  → 单次执行模式
  // keigent             → 进入 REPL
  let task: string | null = null;
  if (args[0] === "run" && args[1]) {
    task = args.slice(1).join(" ");
  } else if (args.length > 0 && !args[0]!.startsWith("-")) {
    task = args.join(" ");
  }

  if (task) {
    await runOnce(task);
  } else {
    await runRepl();
  }
}

main().catch((e) => {
  printError(`致命错误: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
