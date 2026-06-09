import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowResult } from "@keigent/engine";

const mocks = vi.hoisted(() => ({
  workflowRun: vi.fn(),
  loopEngineOptions: [] as Array<Record<string, unknown>>,
  persistWorkflowAndLearn: vi.fn(async () => undefined),
  printError: vi.fn(),
  printInfo: vi.fn(),
  printResponse: vi.fn(),
  renderProgress: vi.fn(),
  renderWorkflowProgress: vi.fn(),
  closeBrowser: vi.fn(async () => undefined),
  loadConfig: vi.fn(async () => ({
    apiKey: "test-key",
    apiProtocol: "openai",
    baseUrl: "https://example.com/v1",
    modelId: "test-model",
    workspace: "/tmp/workspace",
    skillsDir: "/tmp/skills",
    memoryDir: "/tmp/memory",
    headless: true,
    maxIterations: 3,
  })),
}));

vi.mock("@keigent/engine", () => {
  class WorkflowRunner {
    async run(...args: unknown[]) {
      return mocks.workflowRun(...args);
    }
  }

  class Orchestrator {
    constructor(_opts: unknown) {}
  }

  class Learner {
    constructor(_model: unknown, _apiKey: string) {}
  }

  class LoopEngine {
    constructor(opts: Record<string, unknown>) {
      mocks.loopEngineOptions.push(opts);
    }
  }

  class PlaywrightStateCapture {}

  class AllowAllGate {
    readonly kind = "allow";
  }

  class DenyByDefaultGate {
    readonly kind = "deny";
  }

  return {
    WorkflowRunner,
    Orchestrator,
    Learner,
    LoopEngine,
    PlaywrightStateCapture,
    AllowAllGate,
    DenyByDefaultGate,
    closeBrowser: mocks.closeBrowser,
    loadSkillContext: vi.fn(async () => ({ metas: [], async loadBody() { return null; } })),
    makeRegistry: vi.fn(() => ({})),
    buildDefaultRegistry: vi.fn(() => ({})),
    createEngineWorkflowChildRunner: vi.fn((opts) => {
      opts.createEngine(3);
      return { runChild: vi.fn() };
    }),
    createWorkflowSpec: vi.fn((spec) => spec),
  };
});

vi.mock("../config.js", () => ({
  loadConfig: mocks.loadConfig,
  buildModel: vi.fn(() => ({ api: "openai-completions", provider: "test", id: "test-model" })),
}));

vi.mock("../post-run.js", () => ({
  persistWorkflowAndLearn: mocks.persistWorkflowAndLearn,
}));

vi.mock("../renderer.js", () => ({
  renderProgress: mocks.renderProgress,
  renderWorkflowProgress: mocks.renderWorkflowProgress,
  printResponse: mocks.printResponse,
  printError: mocks.printError,
  printInfo: mocks.printInfo,
}));

function workflowResult(exitReason: WorkflowResult["exitReason"]): WorkflowResult {
  return {
    workflowId: "cli-test",
    mode: "single-loop",
    exitReason,
    finalResponse: exitReason === "success" ? "done" : "failed",
    childRuns: [],
    evidence: [],
    budget: {
      maxChildRuns: 1,
      maxIterationsPerRun: 3,
      maxAggregateIterations: 3,
      maxAggregateToolCalls: 20,
      timeoutMs: 120_000,
    },
    budgetUsage: { childRuns: 0, iterations: 0, toolCalls: 0, checkpointsPassed: 0, durationMs: 1 },
    durationMs: 1,
    trajectory: {} as WorkflowResult["trajectory"],
  } as WorkflowResult;
}

describe("runOnce workflow exit semantics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.loopEngineOptions = [];
    mocks.loadConfig.mockResolvedValue({
      apiKey: "test-key",
      apiProtocol: "openai",
      baseUrl: "https://example.com/v1",
      modelId: "test-model",
      workspace: "/tmp/workspace",
      skillsDir: "/tmp/skills",
      memoryDir: "/tmp/memory",
      headless: true,
      maxIterations: 3,
    });
    process.exitCode = undefined;
  });

  it("sets a non-zero exit code when the workflow result is not success", async () => {
    mocks.workflowRun.mockResolvedValueOnce(workflowResult("budget_exceeded"));
    const { runOnce } = await import("../run-once.js");

    await runOnce("Do the thing");

    expect(process.exitCode).toBe(1);
    expect(mocks.printError).toHaveBeenCalledWith("workflow failed: budget_exceeded");
    expect(mocks.persistWorkflowAndLearn).toHaveBeenCalledOnce();
    expect(mocks.closeBrowser).toHaveBeenCalledOnce();
  });

  it("does not set a failure exit code when the workflow succeeds", async () => {
    mocks.workflowRun.mockResolvedValueOnce(workflowResult("success"));
    const { runOnce } = await import("../run-once.js");

    await runOnce("Do the thing");

    expect(process.exitCode).toBeUndefined();
    expect(mocks.printError).not.toHaveBeenCalledWith(expect.stringContaining("workflow failed"));
    expect(mocks.printResponse).toHaveBeenCalledWith("done");
  });

  it("uses a deny-by-default approval gate in one-shot mode", async () => {
    mocks.workflowRun.mockResolvedValueOnce(workflowResult("success"));
    const { runOnce } = await import("../run-once.js");

    await runOnce("Do the thing");

    expect(mocks.loopEngineOptions[0]?.approval).toMatchObject({ kind: "deny" });
  });

  it("sets a non-zero exit code when an unexpected exception escapes the workflow path", async () => {
    mocks.workflowRun.mockRejectedValueOnce(new Error("boom"));
    const { runOnce } = await import("../run-once.js");

    await runOnce("Do the thing");

    expect(process.exitCode).toBe(1);
    expect(mocks.printError).toHaveBeenCalledWith("执行出错: boom");
    expect(mocks.closeBrowser).toHaveBeenCalledOnce();
  });

  it("sets a non-zero exit code when initialization fails before workflow construction", async () => {
    mocks.loadConfig.mockRejectedValueOnce(new Error("missing config"));
    const { runOnce } = await import("../run-once.js");

    await runOnce("Do the thing");

    expect(process.exitCode).toBe(1);
    expect(mocks.printError).toHaveBeenCalledWith("执行出错: missing config");
    expect(mocks.closeBrowser).toHaveBeenCalledOnce();
  });
});
