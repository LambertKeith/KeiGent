# Permission Risk Governance P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first enforceable permission/risk governance slice: every tool has risk metadata, non-interactive execution denies high-risk tools by default, and approval prompts receive enough structured context to be auditable.

**Architecture:** Extend the existing `ToolDef` contract instead of adding a second policy system. `ToolRegistry.execute()` remains the single enforcement point for tool permissions, timeout, abort, and output truncation. CLI REPL keeps interactive approval; one-shot CLI uses a deny-by-default gate for approval-required actions.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, existing `ToolRegistry`, existing CLI REPL/run-once entrypoints.

---

## Scope

This plan implements P1 governance metadata and non-interactive denial. It does not implement full workflow policy inheritance, quarantine, online doctor, UI approval inspector, or persistent approval trajectory events.

Document requirements covered:

- `doc/design/09-permission-risk-governance.md`: risk levels, tool metadata, richer approval prompt context, non-interactive deny for high-risk actions.
- `doc/product/02-task-taxonomy-and-routing.md`: dangerous permission without approval must be rejected.
- `doc/product/04-local-runtime-experience.md`: permission denied must explain the needed risk/approval.
- `doc/evals/01-real-world-eval-suite.md`: permission/risk cases should be deterministic and machine-checkable.

## File Structure

- Modify `packages/engine/src/tools/types.ts`: add `RiskLevel`, `SideEffect`, `ApprovalRequest`, `DenyByDefaultGate`, and metadata fields on `ToolDef`.
- Modify `packages/engine/src/tools/registry.ts`: centralize `requiresApproval()` and pass structured approval context to `ApprovalGate`.
- Modify tool implementation files under `packages/engine/src/tools/impl/`: add `riskLevel`, `sideEffect`, and `reversible`.
- Modify `packages/cli/src/repl.ts`: render structured approval prompt with action/resource/risk/reversibility.
- Modify `packages/cli/src/run-once.ts`: replace `AllowAllGate` with `DenyByDefaultGate`.
- Modify `packages/engine/src/lib.ts`: export new governance types/gates.
- Add/modify tests:
  - `packages/engine/src/__tests__/tool-registry-governance.test.ts`
  - `packages/engine/src/__tests__/tool-metadata.test.ts`
  - `packages/cli/src/__tests__/run-once.test.ts`

---

### Task 1: Add Governance Types and Enforcement Tests

**Files:**
- Create: `packages/engine/src/__tests__/tool-registry-governance.test.ts`
- Modify: `packages/engine/src/tools/types.ts`
- Modify: `packages/engine/src/tools/registry.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/src/__tests__/tool-registry-governance.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { DenyByDefaultGate, type ApprovalRequest, type ToolContext, type ToolDef } from "../tools/types.js";

function ctx(approval = { request: vi.fn(async () => true) }): ToolContext {
  return {
    workspace: "/tmp/workspace",
    browser: null,
    approval,
    task: { goal: "Run a command", profile: "auto" },
    headless: true,
  };
}

function tool(overrides: Partial<ToolDef>): ToolDef {
  return {
    name: "test_tool",
    description: "test",
    parameters: {},
    permission: "readonly",
    riskLevel: "R0",
    sideEffect: "none",
    reversible: true,
    execute: vi.fn(async () => ({ content: "ok", isError: false })),
    ...overrides,
  };
}

describe("ToolRegistry permission governance", () => {
  it("sends structured approval context for approval-required tools", async () => {
    const approval = { request: vi.fn(async (_request: ApprovalRequest) => true) };
    const registry = new ToolRegistry().register(
      tool({
        name: "shell",
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "local",
        reversible: false,
      }),
    );

    const result = await registry.execute("shell", { command: "rm -rf dist" }, ctx(approval));

    expect(result.isError).toBe(false);
    expect(approval.request).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "shell",
        args: { command: "rm -rf dist" },
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "local",
        reversible: false,
        action: "执行工具 shell",
        targetResource: "workspace:/tmp/workspace",
      }),
    );
  });

  it("DenyByDefaultGate rejects high-risk tools in non-interactive execution", async () => {
    const registry = new ToolRegistry().register(
      tool({
        name: "keyboard",
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "external",
        reversible: false,
      }),
    );

    const result = await registry.execute("keyboard", { action: "type", text: "secret" }, ctx(new DenyByDefaultGate()));

    expect(result.isError).toBe(true);
    expect(result.content).toContain("未获授权");
    expect(result.content).toContain("R5");
  });

  it("does not ask approval for readonly R0 tools", async () => {
    const approval = { request: vi.fn(async () => true) };
    const registry = new ToolRegistry().register(tool({ name: "file_read" }));

    const result = await registry.execute("file_read", { path: "a.txt" }, ctx(approval));

    expect(result.isError).toBe(false);
    expect(approval.request).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/tool-registry-governance.test.ts
```

Expected: FAIL because `riskLevel`, `sideEffect`, `reversible`, `ApprovalRequest`, and `DenyByDefaultGate` do not exist yet.

- [ ] **Step 3: Implement governance contract**

Modify `packages/engine/src/tools/types.ts`:

```ts
export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
export type SideEffect = "none" | "local" | "external";

export interface ApprovalRequest {
  toolName: string;
  args: Record<string, unknown>;
  permission: PermissionLevel;
  riskLevel: RiskLevel;
  sideEffect: SideEffect;
  reversible: boolean;
  action: string;
  targetResource: string;
  evidenceRequired: string[];
  exposesSecrets: boolean;
}

export interface ApprovalGate {
  request(request: ApprovalRequest): Promise<boolean>;
}

export class AllowAllGate implements ApprovalGate {
  async request(): Promise<boolean> {
    return true;
  }
}

export class DenyByDefaultGate implements ApprovalGate {
  async request(): Promise<boolean> {
    return false;
  }
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: TSchema;
  permission: PermissionLevel;
  riskLevel: RiskLevel;
  sideEffect: SideEffect;
  reversible: boolean;
  concurrencySafe?: boolean;
  timeoutMs?: number;
  maxOutputChars?: number;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
```

Modify `packages/engine/src/tools/registry.ts`:

```ts
function requiresApproval(tool: ToolDef): boolean {
  return tool.permission === "dangerous" || tool.riskLevel === "R3" || tool.riskLevel === "R4" || tool.riskLevel === "R5";
}

function approvalRequest(tool: ToolDef, args: Record<string, unknown>, ctx: ToolContext) {
  return {
    toolName: tool.name,
    args,
    permission: tool.permission,
    riskLevel: tool.riskLevel,
    sideEffect: tool.sideEffect,
    reversible: tool.reversible,
    action: `执行工具 ${tool.name}`,
    targetResource: `workspace:${ctx.workspace}`,
    evidenceRequired: evidenceFor(tool),
    exposesSecrets: exposesSecrets(args),
  };
}
```

Use `requiresApproval(tool)` in `execute()` instead of `tool.permission === "dangerous"`.

- [ ] **Step 4: Run governance tests**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/tool-registry-governance.test.ts
```

Expected: PASS.

---

### Task 2: Add Metadata to All Built-in Tools

**Files:**
- Modify: `packages/engine/src/tools/impl/*.ts`
- Create: `packages/engine/src/__tests__/tool-metadata.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/engine/src/__tests__/tool-metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDefaultRegistry } from "../tools/index.js";

describe("built-in tool governance metadata", () => {
  it("declares risk metadata for every default tool", () => {
    const registry = buildDefaultRegistry({ includeComputer: true });

    for (const tool of registry.list()) {
      expect(tool.riskLevel, tool.name).toMatch(/^R[0-5]$/);
      expect(["none", "local", "external"], tool.name).toContain(tool.sideEffect);
      expect(typeof tool.reversible, tool.name).toBe("boolean");
    }
  });

  it("classifies shell and computer input as approval-required R5 actions", () => {
    const registry = buildDefaultRegistry({ includeComputer: true });

    expect(registry.get("shell")).toMatchObject({ permission: "dangerous", riskLevel: "R5", sideEffect: "local", reversible: false });
    expect(registry.get("mouse")).toMatchObject({ permission: "dangerous", riskLevel: "R5", sideEffect: "external", reversible: false });
    expect(registry.get("keyboard")).toMatchObject({ permission: "dangerous", riskLevel: "R5", sideEffect: "external", reversible: false });
  });

  it("classifies workspace write and readonly tools separately", () => {
    const registry = buildDefaultRegistry();

    expect(registry.get("file_write")).toMatchObject({ permission: "write", riskLevel: "R1", sideEffect: "local", reversible: true });
    expect(registry.get("file_read")).toMatchObject({ permission: "readonly", riskLevel: "R0", sideEffect: "none", reversible: true });
    expect(registry.get("web_fetch")).toMatchObject({ permission: "readonly", riskLevel: "R0", sideEffect: "none", reversible: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/tool-metadata.test.ts
```

Expected: FAIL until all built-in tools include metadata.

- [ ] **Step 3: Add metadata**

Use this mapping:

| Tools | riskLevel | sideEffect | reversible |
|---|---|---|---|
| `request_verification`, `get_current_time`, `memory_recall`, `ask_user`, `file_read`, `file_list`, `grep`, `web_fetch`, `fetch_url`, `browser_snapshot`, `browser_get_text`, `browser_screenshot`, `browser_wait`, `screenshot` | R0 | none | true |
| `file_write` | R1 | local | true |
| `browser_navigate`, `browser_click`, `browser_type`, `browser_press`, `browser_scroll`, `http_request` | R2 | local | true |
| `shell` | R5 | local | false |
| `mouse`, `keyboard` | R5 | external | false |

- [ ] **Step 4: Run metadata tests**

Run:

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/tool-metadata.test.ts
```

Expected: PASS.

---

### Task 3: Fix Non-interactive CLI Approval

**Files:**
- Modify: `packages/cli/src/run-once.ts`
- Modify: `packages/cli/src/repl.ts`
- Modify: `packages/cli/src/__tests__/run-once.test.ts`

- [ ] **Step 1: Update failing run-once test**

Modify the `@keigent/engine` mock in `packages/cli/src/__tests__/run-once.test.ts` to export `DenyByDefaultGate` and assert that `LoopEngine` is constructed with a deny gate in one-shot mode:

```ts
const mocks = vi.hoisted(() => ({
  workflowRun: vi.fn(),
  loopEngineOptions: [] as unknown[],
  // existing mocks...
}));

class LoopEngine {
  constructor(opts: unknown) {
    mocks.loopEngineOptions.push(opts);
  }
}

class DenyByDefaultGate {}
```

Add test:

```ts
it("uses a deny-by-default approval gate in one-shot mode", async () => {
  mocks.workflowRun.mockResolvedValueOnce(workflowResult("success"));
  const { runOnce } = await import("../run-once.js");

  await runOnce("Do the thing");

  expect(mocks.loopEngineOptions[0]).toMatchObject({
    approval: expect.any(Object),
  });
  expect(mocks.loopEngineOptions[0]).not.toMatchObject({
    approval: expect.objectContaining({ constructor: expect.objectContaining({ name: "AllowAllGate" }) }),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/run-once.test.ts
```

Expected: FAIL because one-shot mode still uses `AllowAllGate`.

- [ ] **Step 3: Implement CLI gate change**

Modify `packages/cli/src/run-once.ts`:

```ts
import { DenyByDefaultGate } from "@keigent/engine";

// ...
approval: new DenyByDefaultGate(),
```

Modify `packages/cli/src/repl.ts` interactive approval prompt to use the structured request:

```ts
async request(request: ApprovalRequest): Promise<boolean> {
  const argStr = JSON.stringify(request.args).slice(0, 120);
  const answer = await this.rl.question(
    `${c.yellow}⚠ ${request.action}${c.reset}\n` +
    `  target: ${request.targetResource}\n` +
    `  risk: ${request.riskLevel} permission=${request.permission} sideEffect=${request.sideEffect} reversible=${request.reversible}\n` +
    `  evidence: ${request.evidenceRequired.join(", ") || "none"}\n` +
    `  args: ${c.dim}${argStr}${c.reset}\n` +
    `  允许执行? [y/N] `,
  );
  return answer.trim().toLowerCase() === "y";
}
```

- [ ] **Step 4: Run CLI tests**

Run:

```bash
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/run-once.test.ts
corepack pnpm --filter @keigent/cli test
```

Expected: PASS.

---

### Task 4: Final Verification Gate

**Files:**
- All touched files.

- [ ] **Step 1: Run package checks**

Run:

```bash
corepack pnpm --filter @keigent/engine check
corepack pnpm --filter @keigent/cli check
corepack pnpm --filter @keigent/web check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run tests**

Run:

```bash
corepack pnpm --filter @keigent/engine test
corepack pnpm --filter @keigent/cli test
corepack pnpm --filter @keigent/web test
```

Expected: all tests pass.

- [ ] **Step 3: Run eval gates**

Run:

```bash
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
```

Expected: smoke eval passes all default cases; orchestrator eval remains 12/12 with profile accuracy 1.

- [ ] **Step 4: Diff hygiene**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors; status only includes intentional edits plus pre-existing local changes.

