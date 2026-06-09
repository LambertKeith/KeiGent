export interface JsonOutputFormat {
  json: boolean;
  compact: boolean;
}

export function parseJsonOutputFormat(args: string[]): JsonOutputFormat {
  const compact = args.includes("--compact");
  return {
    json: compact || args.includes("--json"),
    compact,
  };
}

export function formatJson(value: unknown, args: string[]): string {
  return JSON.stringify(value, null, parseJsonOutputFormat(args).compact ? 0 : 2);
}
