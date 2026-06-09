const SECRET_KEY = /key|token|secret|password|authorization/i;
const SECRET_TEXT = /(sk-[A-Za-z0-9._-]{8,}|Bearer\s+[A-Za-z0-9._~-]+|api[_-]?key\s*[:=]\s*[^\s,;]+)/gi;

export function redactText(value: string): string {
  return value.replace(SECRET_TEXT, "[REDACTED]");
}

export function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) {
    if (value === undefined || value === null || value === "") return "[MISSING]";
    const text = String(value);
    return text.length >= 8 ? `[REDACTED:...${text.slice(-4)}]` : "[REDACTED]";
  }

  if (Array.isArray(value)) return value.map((item) => redactObject(item));
  if (value && typeof value === "object") return redactObject(value as Record<string, unknown>);
  if (typeof value === "string") return redactText(value);
  return value;
}

export function redactObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactObject(item)) as T;
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = redactValue(key, child);
  }
  return result as T;
}
