import type { Tool } from "@earendil-works/pi-ai";
import { profileSelectionToProgressEvent, type EngineProfileSelection, type EngineEvalOrchestrator } from "../evals/engine-executor.js";
import type { LoopEngine } from "../engine.js";
import type { LoopProfile, LoopResult, ProgressCallback, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";
import { toolsForProfile } from "../tool-filter.js";
import { isToolAllowedByWorkflowPolicy } from "./policy.js";
import type { WorkflowChildRunner, WorkflowChildRunOptions } from "./runner.js";

export interface EngineWorkflowRunner {
  run(
    task: Task,
    skillContext: SkillContext,
    profile: LoopProfile,
    stateCapture: StateCapture,
    availableTools: Tool[],
    onProgress?: ProgressCallback,
    options?: { signal?: AbortSignal; inheritedApprovalScopes?: string[] },
  ): Promise<LoopResult>;
}

export interface EngineWorkflowChildRunnerOptions {
  orchestrator: EngineEvalOrchestrator;
  createEngine(maxIterations?: number, budget?: Pick<WorkflowChildRunOptions, "maxToolCalls" | "maxTokenEstimate" | "maxProviderCostUsd" | "maxWallTimeMs" | "maxRecoveryAttempts">): EngineWorkflowRunner | LoopEngine;
  registry: ToolRegistry;
  skillContext: SkillContext;
  stateCapture: StateCapture;
  onProfileSelected?: (selection: EngineProfileSelection) => void;
}

/**
 * Adapt the production Orchestrator → LoopEngine path into a WorkflowRunner child.
 *
 * The workflow envelope owns parent-level budgets, evidence, and trajectory. This
 * adapter owns only the concrete child execution path: choose LoopProfile,
 * construct a per-child engine with the workflow-provided maxIterations, filter
 * tools for the selected profile, and return the unmodified LoopResult.
 */
export function createEngineWorkflowChildRunner(opts: EngineWorkflowChildRunnerOptions): WorkflowChildRunner {
  return {
    async runChild(child, options) {
      const selected = await opts.orchestrator.selectProfile(child.task, opts.skillContext.metas);
      opts.onProfileSelected?.(selected);
      options?.onProgress?.(profileSelectionToProgressEvent(selected));

      const taskForRun: Task = { ...child.task, profile: selected.name };
      const profileToolNames = new Set(toolsForProfile(opts.registry, selected.name).map((tool) => tool.name));
      const availableTools = opts.registry.toPiAiTools(
        (tool) => profileToolNames.has(tool.name) && isToolAllowedByWorkflowPolicy(tool, child.policy, child.role),
      );
      const engine = opts.createEngine(options?.maxIterations, {
        maxToolCalls: options?.maxToolCalls,
        maxTokenEstimate: options?.maxTokenEstimate,
        maxProviderCostUsd: options?.maxProviderCostUsd,
        maxWallTimeMs: options?.maxWallTimeMs,
        maxRecoveryAttempts: options?.maxRecoveryAttempts,
      });

      return engine.run(
        taskForRun,
        opts.skillContext,
        selected.profile,
        opts.stateCapture,
        availableTools,
        options?.onProgress,
        { signal: options?.signal, inheritedApprovalScopes: child.policy?.approvalScopes },
      );
    },
  };
}
