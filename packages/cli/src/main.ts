#!/usr/bin/env -S npx tsx
import { runRepl } from "./repl.js";
import { runOnce } from "./run-once.js";
import { printError } from "./renderer.js";
import { runConfigCommand, runDoctor } from "./config-commands.js";

async function main() {
  const args = process.argv.slice(2);

  // keigent doctor --json → 配置诊断
  // keigent config show → 红acted effective config
  if (args[0] === "doctor") {
    await runDoctor(args.slice(1));
    return;
  }
  if (args[0] === "config") {
    await runConfigCommand(args.slice(1));
    return;
  }

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
