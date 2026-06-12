export type CliInvocation =
  | { kind: "doctor"; args: string[] }
  | { kind: "config"; args: string[] }
  | { kind: "eval"; args: string[] }
  | { kind: "guide"; args: string[] }
  | { kind: "replay"; args: string[] }
  | { kind: "runs"; args: string[] }
  | { kind: "skill"; args: string[] }
  | { kind: "automation"; args: string[] }
  | { kind: "web"; args: string[] }
  | { kind: "run"; task: string }
  | { kind: "repl" };

function stripLeadingSeparator(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

export function parseCliArgs(rawArgs: string[]): CliInvocation {
  const args = stripLeadingSeparator(rawArgs);

  if (args[0] === "doctor") {
    return { kind: "doctor", args: args.slice(1) };
  }
  if (args[0] === "config") {
    return { kind: "config", args: args.slice(1) };
  }
  if (args[0] === "eval") {
    return { kind: "eval", args: args.slice(1) };
  }
  if (args[0] === "guide") {
    return { kind: "guide", args: args.slice(1) };
  }
  if (args[0] === "replay") {
    return { kind: "replay", args: args.slice(1) };
  }
  if (args[0] === "runs") {
    return { kind: "runs", args: args.slice(1) };
  }
  if (args[0] === "skill" || args[0] === "skills") {
    return { kind: "skill", args: args.slice(1) };
  }
  if (args[0] === "automation") {
    return { kind: "automation", args: args.slice(1) };
  }
  if (args[0] === "web") {
    return { kind: "web", args: args.slice(1) };
  }

  if (args[0] === "run" && args[1]) {
    return { kind: "run", task: args.slice(1).join(" ") };
  }
  if (args.length > 0 && !args[0]!.startsWith("-")) {
    return { kind: "run", task: args.join(" ") };
  }

  return { kind: "repl" };
}
