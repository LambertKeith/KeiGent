export type AppSection = "runs" | "conversation" | "dashboard" | "skills" | "config";

export interface NavItem {
  id: AppSection;
  label: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "runs",
    label: "Runs",
    description: "Review saved RunRecords, evidence, risk, and replay status.",
  },
  {
    id: "conversation",
    label: "Conversation",
    description: "Inspect one live or replayed KeiGent loop run.",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Measure eval, replay, and orchestrator health.",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Review skill status, match reasons, and eval coverage.",
  },
  {
    id: "config",
    label: "Config",
    description: "Review source-aware local configuration safely.",
  },
];
