// @keigent/engine 公共 API 桶文件（供 CLI 等外部包使用）

export { LoopEngine, type EngineOptions } from "./engine.js";
export { loadSkillContext, renderSkillIndex } from "./skills.js";
export { Orchestrator, makeRegistry, defaultRegistry, type ProfileName } from "./orchestrator.js";
export { PlaywrightStateCapture, closeBrowser } from "./browser.js";
export { Learner } from "./learner.js";
export { saveTrajectory } from "./trajectory.js";
export { formatLearningResult } from "./skill-patch.js";
export { buildDefaultRegistry } from "./tools/index.js";
export { ToolRegistry, type ToolDef, type ApprovalGate } from "./tools/index.js";
export { AllowAllGate } from "./tools/types.js";
export { WriteThroughMemory } from "./memory.js";
export { setVerbose, isVerbose } from "./logger.js";

export type {
  Task,
  SuccessDef,
  Assertion,
  LoopResult,
  LoopProfile,
  ProgressEvent,
  ProgressCallback,
  SkillContext,
  ExitReason,
} from "./types.js";

export { makeConversationalProfile } from "./profiles/conversational.js";
export { toolsForProfile } from "./tool-filter.js";
