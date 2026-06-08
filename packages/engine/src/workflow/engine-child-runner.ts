import type { Tool } from "@earendil-works/pi-ai";
import type { EngineProfileSelection, EngineEvalOrchestrator } from "../evals/engine-executor.js";
import type { LoopEngine } from "../engine.js";
import type { LoopProfile, LoopResult, ProgressCallback, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";
import { toolsForProfile } from "../tool-filter.js";
import type { WorkflowChildRunner } from "./runner.js";

export interface EngineWorkflowRunner {
  run(
    task: Task,
    skillContext: SkillContext,
    profile: LoopProfile,
    stateCapture: StateCapture,
    availableTools: Tool[],
    onProgress?: ProgressCallback,
    options?: { signal?: AbortSignal },
  ): Promise<LoopResult>;
}

export interface EngineWorkflowChildRunnerOptions {
  orchestrator: EngineEvalOrchestrator;
  createEngine(maxIterations?: number): EngineWorkflowRunner | LoopEngine;
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

      const taskForRun: Task = { ...child.task, profile: selected.name };
      const availableTools = toolsForProfile(opts.registry, selected.name);
      const engine = opts.createEngine(options?.maxIterations);

      return engine.run(
        taskForRun,
        opts.skillContext,
        selected.profile,
        opts.stateCapture,
        availableTools,
        options?.onProgress,
        { signal: options?.signal },
      );
    },
  };
}
