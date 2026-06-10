import { access, stat } from "fs/promises";
import type { KeigentConfig } from "./config.js";
import { isModelApiProtocol, isModelCapabilities, isModelPricing } from "./config.js";

export type ConfigIssueSeverity = "info" | "warning" | "error";
export type ConfigSource = "env" | "file" | "default";

export interface ConfigIssue {
  code: string;
  severity: ConfigIssueSeverity;
  field?: keyof KeigentConfig;
  message: string;
  nextAction?: string;
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

export function validateConfig(config: KeigentConfig, env: NodeJS.ProcessEnv = process.env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (config.configVersion !== 1) {
    issues.push({ code: "configVersion.unsupported", severity: "error", field: "configVersion", message: "configVersion must be 1 for this KeiGent release" });
  }

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

  if (!Number.isInteger(config.maxChildRuns) || config.maxChildRuns < 1) {
    issues.push({ code: "maxChildRuns.invalid", severity: "error", field: "maxChildRuns", message: "maxChildRuns must be an integer >= 1" });
  } else if (config.maxChildRuns > 10) {
    issues.push({ code: "maxChildRuns.high", severity: "warning", field: "maxChildRuns", message: "maxChildRuns above 10 may hide runaway workflows" });
  }

  if (!Number.isInteger(config.maxToolCalls) || config.maxToolCalls < 1) {
    issues.push({ code: "maxToolCalls.invalid", severity: "error", field: "maxToolCalls", message: "maxToolCalls must be an integer >= 1" });
  } else if (config.maxToolCalls > 500) {
    issues.push({ code: "maxToolCalls.high", severity: "warning", field: "maxToolCalls", message: "maxToolCalls above 500 may hide runaway tool loops" });
  }

  if (!Number.isInteger(config.maxTokenEstimate) || config.maxTokenEstimate < 1) {
    issues.push({ code: "maxTokenEstimate.invalid", severity: "error", field: "maxTokenEstimate", message: "maxTokenEstimate must be an integer >= 1" });
  } else if (config.maxTokenEstimate > 200_000) {
    issues.push({ code: "maxTokenEstimate.high", severity: "warning", field: "maxTokenEstimate", message: "maxTokenEstimate above 200000 may exceed common model context limits" });
  }

  if (config.maxProviderCostUsd !== null && (!Number.isFinite(config.maxProviderCostUsd) || config.maxProviderCostUsd <= 0)) {
    issues.push({ code: "maxProviderCostUsd.invalid", severity: "error", field: "maxProviderCostUsd", message: "maxProviderCostUsd must be null or a number > 0" });
  }

  if (config.modelPricing !== null && !isModelPricing(config.modelPricing)) {
    issues.push({ code: "modelPricing.invalid", severity: "error", field: "modelPricing", message: "modelPricing must be null or non-negative input/output/cacheRead/cacheWrite numbers" });
  }

  if (config.maxProviderCostUsd !== null && config.modelPricing === null) {
    issues.push({ code: "modelPricing.missing_for_cost_budget", severity: "warning", field: "modelPricing", message: "maxProviderCostUsd only enforces priced provider usage; configure modelPricing for custom endpoints" });
  }

  if (!isModelCapabilities(config.modelCapabilities)) {
    issues.push({ code: "modelCapabilities.invalid", severity: "error", field: "modelCapabilities", message: "modelCapabilities must declare boolean feature flags and positive maxContextTokens" });
  } else if (config.modelCapabilities.maxContextTokens < 8_192 || config.modelCapabilities.maxContextTokens < config.maxTokenEstimate) {
    issues.push({
      code: "modelCapabilities.maxContextTokens.low",
      severity: "warning",
      field: "modelCapabilities",
      message: "modelCapabilities.maxContextTokens is lower than the configured runtime token budget or below the supported floor",
      nextAction: "Choose a larger-context model or lower maxTokenEstimate before running long tasks.",
    });
  }

  if (!Number.isInteger(config.maxWallTimeMs) || config.maxWallTimeMs < 1) {
    issues.push({ code: "maxWallTimeMs.invalid", severity: "error", field: "maxWallTimeMs", message: "maxWallTimeMs must be an integer >= 1" });
  } else if (config.maxWallTimeMs > 30 * 60 * 1000) {
    issues.push({ code: "maxWallTimeMs.high", severity: "warning", field: "maxWallTimeMs", message: "maxWallTimeMs above 30 minutes may hide stuck runs" });
  }

  if (!Number.isInteger(config.maxRecoveryAttempts) || config.maxRecoveryAttempts < 0) {
    issues.push({ code: "maxRecoveryAttempts.invalid", severity: "error", field: "maxRecoveryAttempts", message: "maxRecoveryAttempts must be an integer >= 0" });
  } else if (config.maxRecoveryAttempts > 20) {
    issues.push({ code: "maxRecoveryAttempts.high", severity: "warning", field: "maxRecoveryAttempts", message: "maxRecoveryAttempts above 20 may hide repeated failed repairs" });
  }

  if (typeof config.headless !== "boolean") {
    issues.push({ code: "headless.invalid", severity: "error", field: "headless", message: "headless must be boolean" });
  }

  if (!env.PLAYWRIGHT_BROWSERS_PATH?.trim()) {
    issues.push({
      code: "browser.playwright_path_unset",
      severity: "warning",
      message: "PLAYWRIGHT_BROWSERS_PATH is not set; browser verification may use an unavailable default cache.",
      nextAction: "Set PLAYWRIGHT_BROWSERS_PATH to the installed Playwright browser cache before running verify:browser.",
    });
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
