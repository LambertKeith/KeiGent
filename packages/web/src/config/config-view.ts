import { redactValue } from "../shared/redaction.js";

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
  offlineDoctor?: DoctorPanelView;
  onlineDoctor?: OnlineDoctorView;
}

export interface ConfigFieldInput {
  label: string;
  effectiveValue: unknown;
  source: ConfigFieldView["source"];
  secret?: boolean;
  issues?: string[];
}

export interface DoctorPanelView {
  mode: "offline";
  status: ConfigStatus;
  issues: ConfigPageView["doctorIssues"];
}

export interface OnlineDoctorView {
  enabled: boolean;
  requiresExplicitAction: boolean;
  label: string;
}

export interface NormalizeConfigPageOptions {
  fields: ConfigFieldInput[];
  doctorIssues: ConfigPageView["doctorIssues"];
  onlineDoctorRequested?: boolean;
}

export function deriveConfigStatus(view: Pick<ConfigPageView, "fields" | "doctorIssues">): ConfigStatus {
  if (view.doctorIssues.some((issue) => issue.severity === "error")) return "invalid";
  if (view.doctorIssues.some((issue) => issue.severity === "warning") || view.fields.some((field) => field.source === "missing")) return "needs_attention";
  return "ready";
}

export function protocolLabel(protocol: ModelApiProtocol): string {
  return protocol === "anthropic" ? "Anthropic Messages compatible" : "OpenAI Chat Completions compatible";
}

function formatConfigFieldValue(label: string, value: unknown): string {
  const redacted = redactValue(label, value);
  if (typeof redacted === "object" && redacted !== null) return JSON.stringify(redacted);
  return String(redacted);
}

export function normalizeConfigPageView(options: NormalizeConfigPageOptions): ConfigPageView {
  const fields = options.fields.map((field): ConfigFieldView => ({
    label: field.label,
    effectiveValue: formatConfigFieldValue(field.label, field.effectiveValue),
    source: field.source,
    ...(field.secret !== undefined ? { secret: field.secret } : {}),
    issues: field.issues ?? [],
  }));
  const status = deriveConfigStatus({ fields, doctorIssues: options.doctorIssues });
  const onlineEnabled = options.onlineDoctorRequested === true;

  return {
    status,
    fields,
    doctorIssues: options.doctorIssues,
    offlineDoctor: {
      mode: "offline",
      status,
      issues: options.doctorIssues,
    },
    onlineDoctor: {
      enabled: onlineEnabled,
      requiresExplicitAction: !onlineEnabled,
      label: onlineEnabled ? "Online doctor requested" : "Online doctor requires explicit action",
    },
  };
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
    { label: "maxChildRuns", effectiveValue: "1", source: "default", issues: [] },
    { label: "maxToolCalls", effectiveValue: "20", source: "default", issues: [] },
    { label: "maxTokenEstimate", effectiveValue: "64000", source: "default", issues: [] },
    { label: "maxProviderCostUsd", effectiveValue: "null", source: "default", issues: [] },
    { label: "modelPricing", effectiveValue: "null", source: "default", issues: [] },
    { label: "maxWallTimeMs", effectiveValue: "120000", source: "default", issues: [] },
    { label: "maxRecoveryAttempts", effectiveValue: "3", source: "default", issues: [] },
  ],
  doctorIssues: [{ code: "apiKey.missing", severity: "error", message: "KEIGENT_API_KEY or config apiKey is required" }],
};
