import { access, stat } from "fs/promises";
import type { KeigentConfig } from "./config.js";
import { isModelApiProtocol } from "./config.js";

export type ConfigIssueSeverity = "info" | "warning" | "error";
export type ConfigSource = "env" | "file" | "default";

export interface ConfigIssue {
  code: string;
  severity: ConfigIssueSeverity;
  field?: keyof KeigentConfig;
  message: string;
  source?: ConfigSource;
}

export interface SourceAwareConfigField<T> {
  value: T;
  source: ConfigSource;
  redactedValue?: string;
  valid: boolean;
  issues: ConfigIssue[];
}

export interface ConfigDoctorResult {
  status: "ready" | "warning" | "error";
  issues: ConfigIssue[];
  checkedAt: string;
}

export function redactSecret(value: string | undefined): string {
  if (!value) return "[MISSING]";
  return value.length >= 8 ? `[REDACTED:...${value.slice(-4)}]` : "[REDACTED]";
}

export function validateConfig(config: KeigentConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (!config.apiKey) {
    issues.push({ code: "apiKey.missing", severity: "error", field: "apiKey", message: "KEIGENT_API_KEY or config apiKey is required" });
  }

  if (!isModelApiProtocol(config.apiProtocol)) {
    issues.push({ code: "apiProtocol.invalid", severity: "error", field: "apiProtocol", message: "apiProtocol must be either openai or anthropic" });
  }

  try {
    const url = new URL(config.baseUrl);
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocal) {
      issues.push({ code: "baseUrl.insecure_remote", severity: "error", field: "baseUrl", message: "baseUrl must use HTTPS unless it is localhost" });
    }
  } catch {
    issues.push({ code: "baseUrl.invalid", severity: "error", field: "baseUrl", message: "baseUrl must be a valid URL" });
  }

  if (!config.modelId.trim()) {
    issues.push({ code: "modelId.empty", severity: "error", field: "modelId", message: "modelId must be non-empty" });
  }

  if (!Number.isInteger(config.maxIterations) || config.maxIterations < 1) {
    issues.push({ code: "maxIterations.invalid", severity: "error", field: "maxIterations", message: "maxIterations must be an integer >= 1" });
  } else if (config.maxIterations > 100) {
    issues.push({ code: "maxIterations.high", severity: "warning", field: "maxIterations", message: "maxIterations above 100 may hide runaway loops" });
  }

  if (typeof config.headless !== "boolean") {
    issues.push({ code: "headless.invalid", severity: "error", field: "headless", message: "headless must be boolean" });
  }

  return issues;
}

export async function doctorConfig(config: KeigentConfig): Promise<ConfigDoctorResult> {
  const issues = validateConfig(config);
  for (const field of ["workspace", "skillsDir", "memoryDir"] as const) {
    try {
      await access(config[field]);
      const info = await stat(config[field]);
      if (!info.isDirectory()) issues.push({ code: `${field}.not_directory`, severity: "error", field, message: `${field} must be a directory` });
    } catch {
      issues.push({ code: `${field}.missing`, severity: "warning", field, message: `${field} does not exist yet` });
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  return {
    status: hasError ? "error" : hasWarning ? "warning" : "ready",
    issues,
    checkedAt: new Date().toISOString(),
  };
}
