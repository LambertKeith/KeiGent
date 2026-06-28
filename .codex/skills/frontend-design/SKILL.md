---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that do not read as templated defaults.
license: Apache-2.0
source: claude-plugins-official/frontend-design
---

# Frontend Design

Use this skill when reshaping KeiGent Web UI, especially Chat-first workflow, information architecture, interaction hierarchy, typography, and visual system decisions.

## KeiGent-Specific Brief

KeiGent Web is not a generic chatbot and not a raw debug dashboard. It is a Chat-first Agent Workbench:

- The default user task is to tell KeiGent what to do.
- Evidence, tools, approvals, timeline, and RunRecord must stay available.
- Audit depth is shown on demand, not as the first interaction surface.
- Operational UI should feel quiet, precise, and work-focused.

## Design Direction

Design for local operators and builders who need trust without friction. The interface should feel like a controlled operations cockpit with a plain task desk in front of it:

- Default surface: one prominent task composer, current run status, final answer, next action.
- Secondary surface: evidence summary and run handoff.
- Tertiary surface: detailed timeline, approvals, tool events, raw redacted JSON.

Avoid marketing hero layouts, decorative gradients, oversized cards, and one-note palettes. Use restrained contrast, dense but readable spacing, and clear hierarchy.

## Process

1. Name the page's single job before designing it.
2. Define a compact token system: colors, type roles, layout rhythm, and one signature interaction.
3. Check whether the design hides internal complexity until the user asks for it.
4. Keep every visible label user-facing: "Run detail", not "workflow_event"; "Needs approval", not "R3 sideEffect".
5. Verify with tests and browser screenshots after implementation.

## Interaction Principles

- Chat is primary; audit is reachable.
- Every run state must answer: what is happening, what changed, what should I do next?
- A failed run must show cause and next action without requiring raw event inspection.
- Advanced panels must be collapsible and closed by default on the Chat page.
- Run Detail may expose dense audit information, but it must remain organized by human questions.

## Visual Principles

- Use layout density appropriate for an operations tool.
- Keep type restrained in panels; reserve large type for page-level context.
- Do not put cards inside cards.
- Use full-width work surfaces with repeated items as cards only when needed.
- Stable dimensions are required for composer, run result, status strips, and timeline rows.
- Text must not overlap or overflow on mobile or desktop.

