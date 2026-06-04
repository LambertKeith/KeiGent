import type { Tool } from "@earendil-works/pi-ai";
import type { LoopEngine } from "../engine.js";
import type { Orchestrator, ProfileName } from "../orchestrator.js";
import type { LoopProfile, LoopResult, ProgressCallback, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";
import { toolsForProfile } from "../tool-filter.js";
import type { EvalCase, EvalExecution, EvalExecutor } from "./types.js";

export interface EngineProfileSelection {
  profile: LoopProfile;
  name: ProfileName;
  method: "rule" | "llm";
}

export interface EngineEvalOrchestrator {
  selectProfile(task: Task, metas: SkillContext["metas"]): Promise<EngineProfileSelection>;
}

export interface EngineEvalRunner {
  run(
    task: Task,
    skillContext: SkillContext,
    profile: LoopProfile,
    stateCapture: StateCapture,
    availableTools: Tool[],
    onProgress?: ProgressCallback,
  ): Promise<LoopResult>;
}

export interface EngineEvalExecutorOptions {
  orchestrator: EngineEvalOrchestrator | Orchestrator;
  engine: EngineEvalRunner | LoopEngine;
  registry: ToolRegistry;
  skillContext: SkillContext;
  stateCapture: StateCapture;
  onProgress?: ProgressCallback;
}

/**
 * Build an EvalExecutor that runs the real KeiGent orchestration path:
 * Orchestrator → profile-specific tool filtering → LoopEngine → LoopResult.
 *
 * The runner intentionally receives dependencies instead of constructing them so
 * tests can use fakes and production callers can provide configured model/API,
 * workspace, approval gate, browser state capture, and skill context.
 */
export function createEngineEvalExecutor(opts: EngineEvalExecutorOptions): EvalExecutor {
  return {
    async run(evalCase: EvalCase): Promise<EvalExecution> {
      const selected = await opts.orchestrator.selectProfile(evalCase.task, opts.skillContext.metas);
      opts.onProgress?.({ kind: "profile_selected", profile: selected.name, via: selected.method });

      // Keep the original fixture immutable-ish for report reproducibility while
      // giving LoopEngine/result trajectory the concrete selected profile name.
      const taskForRun: Task = { ...evalCase.task, profile: selected.name };
      const availableTools = toolsForProfile(opts.registry, selected.name);
      const result = await opts.engine.run(
        taskForRun,
        opts.skillContext,
        selected.profile,
        opts.stateCapture,
        availableTools,
        opts.onProgress,
      );

      return { selectedProfile: selected.name, result };
    },
  };
}
