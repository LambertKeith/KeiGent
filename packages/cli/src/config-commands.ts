import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  KEIGENT_HOME,
  PROTOCOL_DEFAULT_BASE_URLS,
  loadConfig,
  redactConfig,
  resolveConfig,
  type KeigentConfig,
  type KeigentConfigInput,
} from "./config.js";
import { doctorConfig, redactSecret, type ConfigSource } from "./config-doctor.js";
import { formatJson, parseJsonOutputFormat } from "./json-output.js";

export interface ConfigCommandOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

interface SourceAwareField {
  value: unknown;
  source: ConfigSource | "missing";
}

const DEFAULT_CONFIG_PATH = join(KEIGENT_HOME, "config.json");

const CONFIG_KEYS = new Set<keyof KeigentConfig>([
  "apiKey",
  "apiProtocol",
  "baseUrl",
  "modelId",
  "workspace",
  "skillsDir",
  "memoryDir",
  "headless",
  "maxIterations",
]);

const ENV_KEYS: Partial<Record<keyof KeigentConfig, string>> = {
  apiKey: "KEIGENT_API_KEY",
  apiProtocol: "KEIGENT_API_PROTOCOL",
  baseUrl: "KEIGENT_BASE_URL",
  modelId: "KEIGENT_MODEL_ID",
};

function print(options: ConfigCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function defaultConfigTemplate(): KeigentConfigInput {
  return {
    apiKey: "",
    apiProtocol: "openai",
    baseUrl: PROTOCOL_DEFAULT_BASE_URLS.openai,
    modelId: "gpt-4o-mini",
    headless: false,
    maxIterations: 12,
  };
}

async function readConfigFile(configPath: string): Promise<KeigentConfigInput> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as KeigentConfigInput;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeConfigFileAtomic(configPath: string, config: KeigentConfigInput): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const tmpPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(tmpPath, content, { mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, configPath);
  await chmod(configPath, 0o600);
}

function parseConfigValue(key: keyof KeigentConfig, value: string): KeigentConfig[keyof KeigentConfig] {
  switch (key) {
    case "headless":
      if (value !== "true" && value !== "false") {
        throw new Error("headless must be true or false");
      }
      return value === "true";
    case "maxIterations": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("maxIterations must be an integer >= 1");
      }
      return parsed;
    }
    case "apiProtocol":
      if (value !== "openai" && value !== "anthropic") {
        throw new Error("apiProtocol must be openai or anthropic");
      }
      return value;
    default:
      return value;
  }
}

function parseKey(key: string | undefined): keyof KeigentConfig {
  if (!key || !CONFIG_KEYS.has(key as keyof KeigentConfig)) {
    throw new Error(`unknown config key: ${key ?? "(missing)"}`);
  }
  return key as keyof KeigentConfig;
}

function sourceForFileValue(value: unknown): ConfigSource | "missing" {
  if (value === undefined || value === "") return "missing";
  return "file";
}

function buildSourceAwareConfig(
  fileConfig: KeigentConfigInput,
  env: NodeJS.ProcessEnv,
  configPath: string,
): Record<keyof KeigentConfig, SourceAwareField> {
  const configHome = dirname(configPath);
  const fileProtocol = fileConfig.apiProtocol === "anthropic" ? "anthropic" : "openai";
  const defaultBaseUrl = PROTOCOL_DEFAULT_BASE_URLS[fileProtocol];
  const defaults: Omit<KeigentConfig, "apiKey"> & { apiKey: string } = {
    apiKey: "",
    apiProtocol: "openai",
    baseUrl: defaultBaseUrl,
    modelId: "gpt-4o-mini",
    workspace: join(configHome, "workspace"),
    skillsDir: join(configHome, "skills"),
    memoryDir: join(configHome, "memory"),
    headless: false,
    maxIterations: 12,
  };

  const fields = {} as Record<keyof KeigentConfig, SourceAwareField>;
  for (const key of CONFIG_KEYS) {
    const envKey = ENV_KEYS[key];
    const envValue = envKey ? optionalEnv(env, envKey) : undefined;
    if (envValue !== undefined) {
      fields[key] = {
        value: key === "apiKey" ? redactSecret(envValue) : envValue,
        source: "env",
      };
      continue;
    }

    const fileValue = fileConfig[key];
    const fileSource = sourceForFileValue(fileValue);
    if (fileSource === "file") {
      fields[key] = {
        value: key === "apiKey" ? redactSecret(String(fileValue)) : fileValue,
        source: "file",
      };
      continue;
    }

    if (key === "apiKey") {
      fields[key] = { value: "[MISSING]", source: "missing" };
    } else {
      fields[key] = { value: defaults[key], source: "default" };
    }
  }
  return fields;
}

async function loadCommandConfig(options: ConfigCommandOptions): Promise<KeigentConfig> {
  if (!options.configPath) {
    return loadConfig({ ensureDirs: false });
  }
  const fileConfig = await readConfigFile(options.configPath);
  return resolveConfig(fileConfig, options.env ?? process.env, dirname(options.configPath));
}

export async function runDoctor(
  args: string[] = [],
  options: ConfigCommandOptions = {},
): Promise<void> {
  const outputFormat = parseJsonOutputFormat(args);
  try {
    const config = await loadCommandConfig(options);
    const result = await doctorConfig(config);
    const payload = { ...result, config: redactConfig(config) };
    if (outputFormat.json) {
      print(options, formatJson(payload, args));
    } else {
      print(options, `KeiGent doctor: ${result.status}`);
      for (const issue of result.issues) {
        print(options, `- [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    }
    if (result.status === "error") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = {
      status: "error",
      checkedAt: new Date().toISOString(),
      issues: [{ code: "config.load_failed", severity: "error", message }],
    };
    if (outputFormat.json) print(options, formatJson(payload, args));
    else (options.stderr ?? console.error)(`KeiGent doctor: error\n- [error] config.load_failed: ${message}`);
    process.exitCode = 1;
  }
}

export async function runConfigCommand(
  args: string[] = [],
  options: ConfigCommandOptions = {},
): Promise<void> {
  const [subcommand, ...rest] = args;
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const env = options.env ?? process.env;

  switch (subcommand) {
    case "path": {
      print(options, configPath);
      return;
    }
    case "init": {
      const force = rest.includes("--force");
      if (existsSync(configPath) && !force) {
        throw new Error(`config already exists: ${configPath}`);
      }
      await writeConfigFileAtomic(configPath, defaultConfigTemplate());
      print(options, `created ${configPath}`);
      return;
    }
    case "show": {
      const outputFormat = parseJsonOutputFormat(rest);
      const fileConfig = await readConfigFile(configPath);
      const fields = buildSourceAwareConfig(fileConfig, env, configPath);
      if (outputFormat.json) {
        print(options, formatJson({ configPath, fields }, rest));
        return;
      }

      for (const key of CONFIG_KEYS) {
        const field = fields[key];
        print(options, `${key}: ${String(field.value)} (${field.source})`);
      }
      return;
    }
    case "set": {
      const key = parseKey(rest[0]);
      const value = rest.slice(1).join(" ");
      if (value.length === 0) throw new Error(`missing value for ${key}`);
      const fileConfig = await readConfigFile(configPath);
      fileConfig[key] = parseConfigValue(key, value) as never;
      await writeConfigFileAtomic(configPath, fileConfig);
      print(options, `set ${key}`);
      return;
    }
    case "unset": {
      const key = parseKey(rest[0]);
      const fileConfig = await readConfigFile(configPath);
      delete fileConfig[key];
      await writeConfigFileAtomic(configPath, fileConfig);
      print(options, `unset ${key}`);
      return;
    }
    default:
      print(options, "Usage: keigent config init|show|set|unset|path");
  }
}
