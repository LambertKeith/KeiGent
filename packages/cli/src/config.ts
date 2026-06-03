import { readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Model } from "@earendil-works/pi-ai";

export interface KeigentConfig {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  workspace: string;     // 文件沙箱根
  skillsDir: string;     // skill 库
  memoryDir: string;     // 记忆存储
  headless: boolean;
  maxIterations: number;
}

const KEIGENT_HOME = join(homedir(), ".keigent");

const DEFAULTS: KeigentConfig = {
  apiKey: process.env["PACKY_API_KEY"] ?? "sk-UoqCIPbdsLMm2KsSTWVX3hpQ1g0GreMW7HmbnUr3zmWaRyPH",
  baseUrl: "https://www.packyapi.com/v1",
  modelId: "gpt-5.5",
  workspace: join(KEIGENT_HOME, "workspace"),
  skillsDir: join(KEIGENT_HOME, "skills"),
  memoryDir: join(KEIGENT_HOME, "memory"),
  headless: false,
  maxIterations: 12,
};

/**
 * 加载配置：~/.keigent/config.json 覆盖默认值，环境变量优先级最高。
 * 同时确保 workspace / skills / memory 目录存在。
 */
export async function loadConfig(): Promise<KeigentConfig> {
  let fileConfig: Partial<KeigentConfig> = {};
  const configPath = join(KEIGENT_HOME, "config.json");
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(await readFile(configPath, "utf-8"));
    } catch (e) {
      console.warn(`[config] 配置文件解析失败，使用默认值: ${e}`);
    }
  }

  const config: KeigentConfig = { ...DEFAULTS, ...fileConfig };
  // 环境变量优先
  if (process.env["PACKY_API_KEY"]) config.apiKey = process.env["PACKY_API_KEY"];

  // 确保目录存在
  await mkdir(config.workspace, { recursive: true });
  await mkdir(config.skillsDir, { recursive: true });
  await mkdir(config.memoryDir, { recursive: true });

  return config;
}

/** 构建 pi-ai Model 对象 */
export function buildModel(config: KeigentConfig): Model<"openai-completions"> {
  return {
    id: config.modelId,
    name: `${config.modelId} (keigent)`,
    api: "openai-completions",
    provider: "packyapi",
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

export { KEIGENT_HOME };
