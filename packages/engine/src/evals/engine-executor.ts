import type { Tool } from "@earendil-works/pi-ai";
import type { LoopEngine } from "../engine.js";
import type { Orchestrator, ProfileName, ProfileSelectionRuleId } from "../orchestrator.js";
import type { LoopProfile, LoopResult, ProgressCallback, ProgressEvent, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";
import { toolsForProfile } from "../tool-filter.js";
import type { EvalCase, EvalExecution, EvalExecutor } from "./types.js";

export interface EngineProfileSelection {
  profile: LoopProfile;
  name: ProfileName;
  method: "rule" | "llm";
  ruleId?: ProfileSelectionRuleId;
  rationale?: string;
  signals?: string[];
  guardApplied?: boolean;
  unguardedName?: ProfileName;
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

export function profileSelectionToProgressEvent(selection: EngineProfileSelection): ProgressEvent {
  return {
    kind: "profile_selected",
    profile: selection.name,
    via: selection.method,
    ...(selection.ruleId ? { ruleId: selection.ruleId } : {}),
    ...(selection.rationale ? { rationale: selection.rationale } : {}),
    ...(selection.signals ? { signals: selection.signals } : {}),
    ...(selection.guardApplied !== undefined ? { guardApplied: selection.guardApplied } : {}),
    ...(selection.unguardedName ? { unguardedProfile: selection.unguardedName } : {}),
  };
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
      opts.onProgress?.(profileSelectionToProgressEvent(selected));

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
