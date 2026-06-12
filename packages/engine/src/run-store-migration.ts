import { redactText } from "./redaction.js";
import type { RunRecord } from "./run-record.js";

export type RunStoreMigrationWarningCode =
  | "missing_schema_version"
  | "unsupported_schema_version"
  | "unknown_status"
  | "missing_core_field";

export interface RunStoreMigrationWarning {
  runId: string;
  path: string;
  code: RunStoreMigrationWarningCode;
  message: string;
  field?: string;
  originalValue?: unknown;
  normalizedValue?: unknown;
}

export interface RunStoreMigrationReport {
  schemaVersion: 1;
  totalRecords: number;
  normalizedRecords: number;
  legacyRecords: number;
  unsupportedRecords: number;
  warnings: RunStoreMigrationWarning[];
}

export function emptyMigrationReport(): RunStoreMigrationReport {
  return {
    schemaVersion: 1,
    totalRecords: 0,
    normalizedRecords: 0,
    legacyRecords: 0,
    unsupportedRecords: 0,
    warnings: [],
  };
}

export function addMigrationDiagnostics(
  report: RunStoreMigrationReport,
  input: unknown,
  record: RunRecord,
  path: string,
): void {
  const source = objectValue(input);
  const runId = record.id;
  let normalized = false;

  if (source.schemaVersion === undefined) {
    report.legacyRecords += 1;
    normalized = true;
    report.warnings.push({
      runId,
      path,
      code: "missing_schema_version",
      field: "schemaVersion",
      message: "record schemaVersion is missing; normalized as schemaVersion 1",
      normalizedValue: 1,
    });
  } else if (source.schemaVersion !== 1) {
    report.unsupportedRecords += 1;
    normalized = true;
    report.warnings.push({
      runId,
      path,
      code: "unsupported_schema_version",
      field: "schemaVersion",
      message: `record schemaVersion ${diagnosticValueLabel(source.schemaVersion)} is unsupported; normalized as schemaVersion 1`,
      originalValue: diagnosticValue(source.schemaVersion),
      normalizedValue: 1,
    });
  }

  if (typeof source.status !== "string" || record.status !== source.status) {
    normalized = true;
    report.warnings.push({
      runId,
      path,
      code: "unknown_status",
      field: "status",
      message: "record status is unknown; normalized as unknown",
      originalValue: diagnosticValue(source.status),
      normalizedValue: record.status,
    });
  }

  for (const field of missingCoreFields(source)) {
    normalized = true;
    report.warnings.push({
      runId,
      path,
      code: "missing_core_field",
      field,
      message: `record ${field} is missing; normalized with safe defaults`,
    });
  }

  if (normalized) report.normalizedRecords += 1;
}

export function sortMigrationWarnings(report: RunStoreMigrationReport): void {
  report.warnings.sort((a, b) => a.runId.localeCompare(b.runId) || a.code.localeCompare(b.code));
}

function missingCoreFields(source: Record<string, unknown>): string[] {
  const fields = ["task", "route", "execution", "evidence", "risk", "replay"];
  return fields.filter((field) => !isObject(source[field]));
}

function diagnosticValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return "[non-scalar]";
}

function diagnosticValueLabel(value: unknown): string {
  const normalized = diagnosticValue(value);
  return typeof normalized === "string" ? normalized : String(normalized);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}
