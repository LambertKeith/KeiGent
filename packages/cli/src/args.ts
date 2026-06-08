export type CliInvocation =
  | { kind: "doctor"; args: string[] }
  | { kind: "config"; args: string[] }
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

  if (args[0] === "run" && args[1]) {
    return { kind: "run", task: args.slice(1).join(" ") };
  }
  if (args.length > 0 && !args[0]!.startsWith("-")) {
    return { kind: "run", task: args.join(" ") };
  }

  return { kind: "repl" };
}
