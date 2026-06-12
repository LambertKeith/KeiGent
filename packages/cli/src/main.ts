import { runRepl } from "./repl.js";
import { runOnce } from "./run-once.js";
import { printError } from "./renderer.js";
import { runConfigCommand, runDoctor } from "./config-commands.js";
import { parseCliArgs } from "./args.js";
import { runEvalCommand, runReplayCommand } from "./eval-commands.js";
import { runRunsCommand } from "./runs-commands.js";
import { runSkillCommand } from "./skill-commands.js";
import { runAutomationCommand } from "./automation-commands.js";
import { runWebCommand } from "./web-command.js";
import { runGuideCommand } from "./guide-command.js";

async function main() {
  const invocation = parseCliArgs(process.argv.slice(2));

  switch (invocation.kind) {
    case "doctor":
      await runDoctor(invocation.args);
      return;
    case "config":
      await runConfigCommand(invocation.args);
      return;
    case "eval":
      await runEvalCommand(invocation.args);
      return;
    case "guide":
      await runGuideCommand(invocation.args);
      return;
    case "replay":
      await runReplayCommand(invocation.args);
      return;
    case "runs":
      await runRunsCommand(invocation.args);
      return;
    case "skill":
      await runSkillCommand(invocation.args);
      return;
    case "automation":
      await runAutomationCommand(invocation.args);
      return;
    case "web":
      await runWebCommand(invocation.args);
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
