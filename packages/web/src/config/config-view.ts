export type ConfigStatus = "ready" | "needs_attention" | "invalid";
export type ModelApiProtocol = "openai" | "anthropic";

export interface ConfigFieldView {
  label: string;
  effectiveValue: string;
  source: "env" | "file" | "default" | "missing";
  secret?: boolean;
  issues: string[];
}

export interface ConfigPageView {
  status: ConfigStatus;
  fields: ConfigFieldView[];
  doctorIssues: { code: string; severity: "info" | "warning" | "error"; message: string }[];
}

export function deriveConfigStatus(view: Pick<ConfigPageView, "fields" | "doctorIssues">): ConfigStatus {
  if (view.doctorIssues.some((issue) => issue.severity === "error")) return "invalid";
  if (view.doctorIssues.some((issue) => issue.severity === "warning") || view.fields.some((field) => field.source === "missing")) return "needs_attention";
  return "ready";
}

export function protocolLabel(protocol: ModelApiProtocol): string {
  return protocol === "anthropic" ? "Anthropic Messages compatible" : "OpenAI Chat Completions compatible";
}

export const SAMPLE_CONFIG_VIEW: ConfigPageView = {
  status: "needs_attention",
  fields: [
    { label: "apiKey", effectiveValue: "[MISSING]", source: "missing", secret: true, issues: ["apiKey is required"] },
    { label: "apiProtocol", effectiveValue: "openai", source: "default", issues: [] },
    { label: "baseUrl", effectiveValue: "https://api.openai.com/v1", source: "default", issues: [] },
    { label: "modelId", effectiveValue: "gpt-4o-mini", source: "default", issues: [] },
    { label: "workspace", effectiveValue: "~/.keigent/workspace", source: "default", issues: [] },
    { label: "maxIterations", effectiveValue: "12", source: "default", issues: [] },
  ],
  doctorIssues: [{ code: "apiKey.missing", severity: "error", message: "KEIGENT_API_KEY or config apiKey is required" }],
};
