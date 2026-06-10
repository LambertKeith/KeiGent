import type { ProviderUsageSummary } from "./types.js";

export function normalizeProviderUsage(value: unknown): ProviderUsageSummary | undefined {
  if (!isObject(value)) return undefined;

  const inputTokens = numberValue(value.input);
  const outputTokens = numberValue(value.output);
  const cacheReadTokens = numberValue(value.cacheRead);
  const cacheWriteTokens = numberValue(value.cacheWrite);
  const explicitTotal = numberValue(value.totalTokens);
  const totalTokens = explicitTotal > 0
    ? explicitTotal
    : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const cost = isObject(value.cost) ? value.cost : {};
  const costUsd = roundCost(
    numberValue(cost.total)
      || numberValue(cost.input) + numberValue(cost.output) + numberValue(cost.cacheRead) + numberValue(cost.cacheWrite),
  );

  if (totalTokens === 0 && costUsd === 0) return undefined;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    costUsd,
    costStatus: costUsd > 0 ? "priced" : "pricing_not_configured",
  };
}

export function addProviderUsage(
  left: ProviderUsageSummary | undefined,
  right: ProviderUsageSummary | undefined,
): ProviderUsageSummary | undefined {
  if (!left) return right;
  if (!right) return left;

  const costUsd = roundCost(left.costUsd + right.costUsd);
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd,
    costStatus: left.costStatus === "priced" || right.costStatus === "priced"
      ? "priced"
      : "pricing_not_configured",
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function roundCost(value: number): number {
  return Number(value.toFixed(12));
}
