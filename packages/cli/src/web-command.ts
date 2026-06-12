import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { startWebApiServer } from "./web-api-server.js";

export interface WebCommandOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  spawnProcess?: (command: string, args: string[], options?: SpawnOptions) => ChildProcess;
}

interface WebCommandConfig {
  host: string;
  port: number;
  api: boolean;
  apiPort: number;
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
    api: false,
    apiPort: 5174,
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
      case "--api":
        config.api = true;
        break;
      case "--api-port": {
        const value = Number(requireValue(args, i, "--api-port"));
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          throw new Error("--api-port must be an integer from 1 to 65535");
        }
        config.apiPort = value;
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
      "--host",
      config.host,
      "--port",
      String(config.port),
    ],
    url: `http://${displayHost(config.host)}:${config.port}`,
  };
}

function apiUrlFor(config: WebCommandConfig): string {
  return `http://${displayHost(config.host)}:${config.apiPort}`;
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
  const apiUrl = config.api ? apiUrlFor(config) : undefined;
  if (!isLocalBind(config.host)) {
    print(options, "public bind allowed");
  }
  print(options, command.url);
  if (apiUrl) print(options, `API: ${apiUrl}`);

  if (config.printOnly) {
    const envPrefix = apiUrl ? `VITE_KEIGENT_API_URL=${apiUrl} ` : "";
    print(options, `${envPrefix}${[command.command, ...command.args].join(" ")}`);
    return;
  }

  const apiServer = apiUrl ? await startWebApiServer({ host: config.host, port: config.apiPort }) : undefined;
  const child = (options.spawnProcess ?? spawn)(command.command, command.args, {
    env: apiUrl ? { ...process.env, VITE_KEIGENT_API_URL: apiUrl } : process.env,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code && code !== 0) reject(new Error(`web dev server exited with code ${code}`));
        else resolve();
      });
    });
  } finally {
    await apiServer?.close();
  }
}
