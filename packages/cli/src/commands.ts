import type { ProfileName, SkillContext } from "@keigent/engine";
import { printInfo, printError, colors as c } from "./renderer.js";

export interface ReplState {
  forcedProfile: ProfileName | null;   // /profile 强制指定
  headless: boolean;
  skillContext: SkillContext;
  profileNames: readonly string[];     // 合法 profile 名（来自 registry，用于 /profile 校验）
}

export interface CommandResult {
  handled: boolean;       // 是否是斜杠命令（已处理）
  shouldQuit?: boolean;
}

/**
 * 处理斜杠命令。返回 handled=false 表示输入不是命令，应作为任务执行。
 */
export function handleCommand(input: string, state: ReplState): CommandResult {
  if (!input.startsWith("/")) return { handled: false };

  const [cmd, ...rest] = input.slice(1).trim().split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "help":
      printHelp();
      return { handled: true };

    case "quit":
    case "exit":
    case "q":
      return { handled: true, shouldQuit: true };

    case "profile":
      if (!arg) {
        printInfo(`当前强制 profile: ${state.forcedProfile ?? "（自动调度）"}`);
        printInfo(`可选: ${state.profileNames.join(" / ")} / auto`);
      } else if (arg === "auto") {
        state.forcedProfile = null;
        printInfo("已恢复自动 profile 调度");
      } else if (state.profileNames.includes(arg)) {
        state.forcedProfile = arg as ProfileName;
        printInfo(`下个任务强制使用 profile: ${arg}`);
      } else {
        printError(`未知 profile: ${arg}（可选: ${state.profileNames.join(" / ")} / auto）`);
      }
      return { handled: true };

    case "skills": {
      const metas = state.skillContext.metas;
      if (metas.length === 0) {
        printInfo("（无已加载 skill）");
      } else {
        printInfo(`已加载 ${metas.length} 个 skill:`);
        for (const m of metas) {
          console.log(`  ${c.cyan}${m.name}${c.reset} ${c.dim}— ${m.description.slice(0, 70)}${c.reset}`);
        }
      }
      return { handled: true };
    }

    case "headed":
      state.headless = false;
      printInfo("浏览器: 可见模式（headed）");
      return { handled: true };

    case "headless":
      state.headless = true;
      printInfo("浏览器: 后台模式（headless）");
      return { handled: true };

    default:
      printError(`未知命令: /${cmd}（输入 /help 查看）`);
      return { handled: true };
  }
}

function printHelp(): void {
  console.log(`${c.bold}命令:${c.reset}`);
  console.log(`  ${c.cyan}/help${c.reset}              显示帮助`);
  console.log(`  ${c.cyan}/profile <name>${c.reset}    强制下个任务用指定 profile（auto 恢复自动）`);
  console.log(`  ${c.cyan}/skills${c.reset}            列出已加载的 skill`);
  console.log(`  ${c.cyan}/headed${c.reset}            浏览器可见模式`);
  console.log(`  ${c.cyan}/headless${c.reset}          浏览器后台模式`);
  console.log(`  ${c.cyan}/quit${c.reset}              退出`);
  console.log(`${c.dim}直接输入任务描述即可执行。${c.reset}`);
}
