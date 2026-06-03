import type { ProgressEvent } from "@keigent/engine";

// ── ANSI 颜色（不引依赖）──────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function trunc(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
}

/**
 * 把引擎的 ProgressEvent 渲染成终端输出。
 * 设计：缩进表示层级，颜色区分事件类型，工具调用/结果折叠为单行。
 */
export function renderProgress(ev: ProgressEvent): void {
  switch (ev.kind) {
    case "profile_selected":
      console.log(`${c.magenta}◆ profile${c.reset} ${c.bold}${ev.profile}${c.reset} ${c.dim}(${ev.via})${c.reset}`);
      break;
    case "skills_matched":
      if (ev.skills.length > 0) {
        console.log(`${c.dim}  skill: ${ev.skills.join(", ")}${c.reset}`);
      }
      break;
    case "iteration_start":
      console.log(`${c.gray}  ┌─ 迭代 ${ev.iteration} ─────────${c.reset}`);
      break;
    case "tool_call": {
      const args = trunc(JSON.stringify(ev.args), 60);
      console.log(`${c.cyan}  │ ⚙ ${ev.toolName}${c.reset} ${c.dim}${args}${c.reset}`);
      break;
    }
    case "tool_result": {
      const color = ev.succeeded ? c.green : c.red;
      const mark = ev.succeeded ? "✓" : "✗";
      console.log(`${color}  │   ${mark}${c.reset} ${c.dim}${trunc(ev.result, 80)}${c.reset}`);
      break;
    }
    case "text":
      console.log(`${c.blue}  │ 💬${c.reset} ${trunc(ev.text, 100)}`);
      break;
    case "checkpoint":
      console.log(`${c.yellow}  │ ⚑ checkpoint${c.reset} ${c.dim}"${trunc(ev.desc, 50)}"${c.reset}`);
      break;
    case "verdict": {
      const color = ev.passed ? c.green : c.red;
      const mark = ev.passed ? "✓ 通过" : "✗ 未通过";
      console.log(`${color}  │   裁判 ${mark}${c.reset} ${c.dim}${trunc(ev.evidence, 70)}${c.reset}`);
      break;
    }
    case "escalate":
      console.log(`${c.red}  │ ⚠ 升级人类: ${trunc(ev.reason, 80)}${c.reset}`);
      break;
    case "done": {
      const color = ev.exitReason === "success" ? c.green : c.yellow;
      console.log(`${c.gray}  └────────────────${c.reset}`);
      console.log(`${color}◆ 完成 (${ev.exitReason})${c.reset}`);
      break;
    }
  }
}

export function printBanner(): void {
  console.log(`${c.bold}${c.cyan}KeiGent${c.reset} ${c.dim}— 可切换 loop 的 agent${c.reset}`);
  console.log(`${c.dim}输入任务直接执行；/help 查看命令；/quit 退出${c.reset}\n`);
}

export function printResponse(text: string): void {
  console.log(`\n${c.bold}${c.green}▸ 结果${c.reset}\n${text}\n`);
}

export function printError(msg: string): void {
  console.log(`${c.red}✗ ${msg}${c.reset}`);
}

export function printInfo(msg: string): void {
  console.log(`${c.dim}${msg}${c.reset}`);
}

export const colors = c;
