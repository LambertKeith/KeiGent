export type AppSection = "chat" | "runs" | "skills" | "settings";

export interface NavItem {
  id: AppSection;
  label: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Start a KeiGent run and see the result first.",
  },
  {
    id: "runs",
    label: "Runs",
    description: "Review saved RunRecords, evidence, risk, and replay status.",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Review skill status, match reasons, and eval coverage.",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Review source-aware local configuration safely.",
  },
];
