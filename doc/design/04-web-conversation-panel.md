# Web Visual Conversation Panel Design

> **Goal:** Render one active or replayed KeiGent run as a readable, auditable conversation-plus-loop timeline.

## 1. Product logic

The panel is not a generic chat UI. It must expose KeiGent's actual loop mechanics:

| Engine concept | UI concept |
| --- | --- |
| `Task.goal` | User task card |
| `profile_selected` | Profile decision banner |
| `skills_matched` | Skill chips |
| `iteration_start` | Iteration group |
| `tool_call` / `tool_result` | Tool activity card |
| `text` | Assistant message bubble |
| `checkpoint` / `verdict` | Verification card |
| `escalate` | Human-intervention warning |
| `done` | Completion summary |
| `Trajectory.steps` | Replay timeline |

The UI must keep four concepts distinct:

1. Conversation output: what the model says.
2. Operational events: tools, iterations, skills.
3. Verification events: checkpoints and verdict evidence.
4. Final outcome: `success`, `escalated`, `max_iterations`, or `error`.

## 2. Information architecture

Desktop layout:

```text
Top bar: run title / status / elapsed / controls
Left rail: run metadata, profile, skills, metrics
Main timeline: task, profile, iterations, tools, checkpoints, final answer
Right inspector: selected event details, redacted JSON, evidence
```

Mobile layout:

- Single-column timeline.
- Summary rail becomes collapsible card.
- Inspector opens as full-screen sheet.
- No horizontal page overflow at 375px.

## 3. Core states

- Empty: explains KeiGent loop/profile/verification model; CTAs: start task, open trajectory.
- Draft: task input, profile selector, optional success definition.
- Running: appends stream events, current iteration highlighted, pending tool/checkpoint states visible.
- Waiting for user: distinct interruption state, not an error.
- Success: final answer card and metrics.
- Escalated: amber human-decision state; final answer not presented as fully trusted.
- Max iterations: bounded failure; show last iteration and missing completion signal.
- Error: calm error card; raw details only in inspector.
- Replay: badge `Replay`, no live pending cursor, preserve original ordering/duration.

## 4. Normalized view model

```ts
export type RunStatus =
  | "idle"
  | "draft"
  | "running"
  | "waiting_for_user"
  | "success"
  | "escalated"
  | "max_iterations"
  | "error";

export interface ConversationRunView {
  id: string;
  mode: "live" | "replay";
  task: { goal: string; profile?: string };
  status: RunStatus;
  selectedProfile?: string;
  profileVia?: "rule" | "llm";
  skills: string[];
  durationMs?: number;
  metrics: {
    iterations: number;
    toolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    checkpoints: number;
    checkpointsPassed: number;
  };
  timeline: TimelineItem[];
  finalResponse?: string;
  exitReason?: "success" | "escalated" | "max_iterations" | "error";
}
```

## 5. Normalization rules

1. `tool_result` attaches to the most recent unmatched `tool_call` with same `iteration` and `toolName`.
2. `verdict` attaches to the most recent unmatched `checkpoint` with same `iteration`.
3. `done` determines terminal status.
4. `escalate` marks the run as escalated unless a later terminal event gives a more specific error.
5. Unknown event kinds render as neutral debug events, not fatal UI errors.
6. Secret-like keys are redacted recursively before display: `apiKey`, `token`, `authorization`, `password`, `secret`, and `/key|token|secret|password|authorization/i`.

## 6. Visual direction

Warm, bright, low-saturation operations cockpit.

- Background: cream/ivory with peach light.
- Mixed accents: faint mint and sky only as ambient light.
- Text: blue-gray graphite, not coffee-brown.
- Avoid: purple gradients, neon blue, black glassmorphism, AI sparkle motifs, coffee/café metaphors.
- Checkpoint/verdict cards must be visually distinct from generic tool cards.

## 7. Component inventory

- `RunShell`
- `TaskComposer`
- `RunSummaryRail`
- `Timeline`
- `IterationGroup`
- `AssistantMessage`
- `ToolCard`
- `CheckpointCard`
- `DoneCard`
- `EventInspector`
- `RunStatusBadge`
- `SkillChips`

## 8. Acceptance standards

### Product acceptance

- A user can start or inspect a KeiGent run from a task goal.
- Selected profile is visible before or near the first iteration.
- Matched skills are visible when present.
- Iterations are visually grouped.
- Tool calls and results are paired.
- Checkpoints and verdicts are paired.
- Final response is separated from intermediate model text.
- Exit reason is always visible.
- Escalated/failed runs are not styled as successful.
- Raw data is available for audit but not required to understand the run.

### Normalization acceptance

- Pending `tool_call` remains pending until matched.
- Run end with unmatched tool call marks it incomplete, not succeeded.
- Pending checkpoint without verdict becomes unverified at run end.
- Malformed event does not crash the whole panel.
- Secret-like payload fields are redacted in timeline and inspector.

### Accessibility acceptance

- Timeline cards are keyboard reachable.
- Enter/Space selects a card in inspector.
- Status does not rely on color alone.
- `aria-live="polite"` for live updates; assertive only for escalation/error.
- Reduced motion disables animated background and slide-ins.

### Performance acceptance

A run with 100 iterations, 500 tool events, 100 text events, and 50 checkpoints must render under 1s on a normal dev laptop; timeline truncates large tool results while inspector keeps full redacted detail.
