# Approval Trajectory P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist tool approval decisions as structured run evidence and make permission-denied behavior machine-checkable in evals and Web normalization.

**Architecture:** Keep `ToolRegistry.execute()` as the single permission enforcement point. Add a small approval-decision callback on `ToolContext`, let `LoopEngine` wire it to `ProgressEvent` and `TrajectoryCollector`, and extend eval acceptance to assert approval decisions without inventing a second policy layer.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, existing `LoopEngine`, `ToolRegistry`, `TrajectoryCollector`, eval runner, and Web run normalization.

---

### Task 1: Record Approval Decisions

**Files:**
- Modify: `packages/engine/src/tools/types.ts`
- Modify: `packages/engine/src/tools/registry.ts`
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/trajectory.ts`
- Modify: `packages/engine/src/engine.ts`
- Test: `packages/engine/src/__tests__/tool-registry-governance.test.ts`
- Test: `packages/engine/src/__tests__/engine-approval-trajectory.test.ts`

- [ ] Write a failing registry test proving approval callbacks receive approved and denied decisions with the original structured request.
- [ ] Add `ApprovalDecision` and optional `ToolContext.onApprovalDecision`.
- [ ] Emit approval decisions after `ApprovalGate.request()` resolves.
- [ ] Add `approval` trajectory step and collector method.
- [ ] Wire `LoopEngine` to record and stream approval decisions.
- [ ] Run focused engine tests.

### Task 2: Expose Approval in Web Run Normalization

**Files:**
- Modify: `packages/web/src/conversation/normalize.ts`
- Test: `packages/web/src/__tests__/conversation.test.ts`

- [ ] Write a failing Web normalization test for an approval-denied event with secret-like args.
- [ ] Add `approval` progress event and timeline item support with redaction.
- [ ] Run focused Web tests.

### Task 3: Add Permission Eval Semantics

**Files:**
- Modify: `packages/engine/src/evals/types.ts`
- Modify: `packages/engine/src/evals/runner.ts`
- Modify: `packages/engine/src/evals/cases.ts`
- Test: `packages/engine/src/__tests__/eval-runner.test.ts`

- [ ] Write a failing eval runner test for `requiredApprovals` and `permission_denied`.
- [ ] Extend eval acceptance and failure codes.
- [ ] Add deterministic smoke permission case.
- [ ] Run eval runner tests and `eval:smoke`.

### Task 4: Final Verification

**Files:**
- All touched files.

- [ ] Run `corepack pnpm --filter @keigent/engine check`.
- [ ] Run `corepack pnpm --filter @keigent/web check`.
- [ ] Run focused and package tests for engine/web.
- [ ] Run `corepack pnpm --filter @keigent/engine eval:smoke`.
- [ ] Run `corepack pnpm --filter @keigent/engine eval:orchestrator`.
- [ ] Run `git diff --check` and inspect `git status --short --branch`.
