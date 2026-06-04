export type AppSection = "conversation" | "dashboard" | "config";

export interface NavItem {
  id: AppSection;
  label: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
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
    id: "config",
    label: "Config",
    description: "Review source-aware local configuration safely.",
  },
];
