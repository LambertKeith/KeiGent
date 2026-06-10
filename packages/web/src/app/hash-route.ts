import type { AppSection } from "./nav.js";

export interface WorkbenchRoute {
  section: AppSection;
  selectedRunId?: string;
  evalKind?: "real-world" | "generic";
  evalDatasetId?: string;
}

const sections = new Set<AppSection>(["runs", "conversation", "dashboard", "skills", "config"]);

export function parseHashRoute(hash: string): WorkbenchRoute {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const parts = normalized.split("/").filter(Boolean).map(decodeURIComponent);
  const [head, second, third] = parts;

  if (head === "runs") {
    return second ? { section: "runs", selectedRunId: second } : { section: "runs" };
  }

  if (head === "eval") {
    if (second === "real-world" && third) {
      return { section: "dashboard", evalKind: "real-world", evalDatasetId: third };
    }
    return second
      ? { section: "dashboard", evalKind: "generic", evalDatasetId: second }
      : { section: "dashboard" };
  }

  if (sections.has(head as AppSection)) {
    return { section: head as AppSection };
  }

  return { section: "runs" };
}

export function hashForSection(section: AppSection): string {
  return `#${section}`;
}
