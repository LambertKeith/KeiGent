import { spawn, type ChildProcess } from "node:child_process";

export interface WebCommandOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  spawnProcess?: (command: string, args: string[]) => ChildProcess;
}

interface WebCommandConfig {
  host: string;
  port: number;
  printOnly: boolean;
  allowPublic: boolean;
}

function print(options: WebCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseWebArgs(args: string[]): WebCommandConfig {
  const config: WebCommandConfig = {
    host: "127.0.0.1",
    port: 5173,
    printOnly: false,
    allowPublic: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--host":
        config.host = requireValue(args, i, "--host");
        i++;
        break;
      case "--port": {
        const value = Number(requireValue(args, i, "--port"));
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          throw new Error("--port must be an integer from 1 to 65535");
        }
        config.port = value;
        i++;
        break;
      }
      case "--print":
        config.printOnly = true;
        break;
      case "--allow-public":
        config.allowPublic = true;
        break;
      default:
        throw new Error(`unknown web option ${arg}`);
    }
  }

  return config;
}

function isLocalBind(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function displayHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function commandFor(config: WebCommandConfig): { command: string; args: string[]; url: string } {
  return {
    command: "corepack",
    args: [
      "pnpm",
      "--filter",
      "@keigent/web",
      "dev",
      "--",
      "--host",
      config.host,
      "--port",
      String(config.port),
    ],
    url: `http://${displayHost(config.host)}:${config.port}`,
  };
}

export async function runWebCommand(
  args: string[] = [],
  options: WebCommandOptions = {},
): Promise<void> {
  const config = parseWebArgs(args);
  if (!isLocalBind(config.host) && !config.allowPublic) {
    throw new Error("public bind requires --allow-public");
  }

  const command = commandFor(config);
  if (!isLocalBind(config.host)) {
    print(options, "public bind allowed");
  }
  print(options, command.url);

  if (config.printOnly) {
    print(options, [command.command, ...command.args].join(" "));
    return;
  }

  const child = (options.spawnProcess ?? spawn)(command.command, command.args);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code && code !== 0) reject(new Error(`web dev server exited with code ${code}`));
      else resolve();
    });
  });
}
