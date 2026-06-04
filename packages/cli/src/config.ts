import { readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Api, Model } from "@earendil-works/pi-ai";

export type ModelApiProtocol = "openai" | "anthropic";

export interface KeigentConfig {
  apiKey: string;
  apiProtocol: ModelApiProtocol;
  baseUrl: string;
  modelId: string;
  workspace: string;     // 文件沙箱根
  skillsDir: string;     // skill 库
  memoryDir: string;     // 记忆存储
  headless: boolean;
  maxIterations: number;
}

export type KeigentConfigInput = Partial<KeigentConfig>;

const KEIGENT_HOME = join(homedir(), ".keigent");

const PROTOCOL_DEFAULT_BASE_URLS: Record<ModelApiProtocol, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

const DEFAULTS = {
  apiProtocol: "openai",
  modelId: "gpt-4o-mini",
  headless: false,
  maxIterations: 12,
} satisfies Omit<KeigentConfig, "apiKey" | "baseUrl" | "workspace" | "skillsDir" | "memoryDir">;

function defaultPaths(home: string): Pick<KeigentConfig, "workspace" | "skillsDir" | "memoryDir"> {
  return {
    workspace: join(home, "workspace"),
    skillsDir: join(home, "skills"),
    memoryDir: join(home, "memory"),
  };
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function isModelApiProtocol(value: unknown): value is ModelApiProtocol {
  return value === "openai" || value === "anthropic";
}

export function resolveConfig(
  fileConfig: KeigentConfigInput = {},
  env: NodeJS.ProcessEnv = process.env,
  home = KEIGENT_HOME,
): KeigentConfig {
  const apiKey = optionalEnv(env, "KEIGENT_API_KEY") || fileConfig.apiKey;
  if (!apiKey) {
    throw new Error("KEIGENT_API_KEY or apiKey in ~/.keigent/config.json is required");
  }

  const requestedProtocol = optionalEnv(env, "KEIGENT_API_PROTOCOL") ?? fileConfig.apiProtocol ?? DEFAULTS.apiProtocol;
  const apiProtocol: ModelApiProtocol = isModelApiProtocol(requestedProtocol) ? requestedProtocol : DEFAULTS.apiProtocol;
  const baseUrl = optionalEnv(env, "KEIGENT_BASE_URL") ?? fileConfig.baseUrl ?? PROTOCOL_DEFAULT_BASE_URLS[apiProtocol];
  const modelId = optionalEnv(env, "KEIGENT_MODEL_ID") ?? fileConfig.modelId ?? DEFAULTS.modelId;

  return {
    ...DEFAULTS,
    ...defaultPaths(home),
    ...fileConfig,
    apiKey,
    apiProtocol,
    baseUrl,
    modelId,
  };
}

export function redactConfig(config: KeigentConfig): KeigentConfig {
  return { ...config, apiKey: "[REDACTED]" };
}

export interface LoadConfigOptions {
  ensureDirs?: boolean;
}

/**
 * 加载配置：~/.keigent/config.json 覆盖默认值，通用 KEIGENT_* 环境变量优先级最高。
 * 默认确保 workspace / skills / memory 目录存在；诊断类命令可关闭该副作用。
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<KeigentConfig> {
  let fileConfig: KeigentConfigInput = {};
  const configPath = join(KEIGENT_HOME, "config.json");
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(await readFile(configPath, "utf-8"));
    } catch (e) {
      console.warn(`[config] 配置文件解析失败，使用默认值: ${e}`);
    }
  }

  const config = resolveConfig(fileConfig);

  if (options.ensureDirs !== false) {
    await mkdir(config.workspace, { recursive: true });
    await mkdir(config.skillsDir, { recursive: true });
    await mkdir(config.memoryDir, { recursive: true });
  }

  return config;
}

function modelApiForProtocol(protocol: ModelApiProtocol): "openai-completions" | "anthropic-messages" {
  return protocol === "anthropic" ? "anthropic-messages" : "openai-completions";
}

function providerForProtocol(protocol: ModelApiProtocol): string {
  return protocol === "anthropic" ? "anthropic-compatible" : "openai-compatible";
}

/** 构建 pi-ai Model 对象 */
export function buildModel(config: KeigentConfig): Model<Api> {
  return {
    id: config.modelId,
    name: `${config.modelId} (${config.apiProtocol}-compatible)` ,
    api: modelApiForProtocol(config.apiProtocol),
    provider: providerForProtocol(config.apiProtocol),
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

export { KEIGENT_HOME, PROTOCOL_DEFAULT_BASE_URLS };
