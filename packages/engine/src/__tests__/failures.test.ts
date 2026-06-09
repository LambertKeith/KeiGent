import { describe, expect, it } from "vitest";
import { failureSummaryForLoopExit, failureSummaryForWorkflowExit, recommendedNextActionFor } from "../failures.js";

describe("failure semantics", () => {
  it("maps permission denial to a structured next action", () => {
    const summary = failureSummaryForLoopExit("error", "[错误] 工具 shell 未获授权，已拒绝执行（risk=R5, permission=dangerous）");

    expect(summary).toMatchObject({
      code: "permission_denied",
      layer: "permission",
      nextAction: "在交互模式批准该范围，或调整任务/配置避免高风险工具。",
    });
  });

  it("maps budget and timeout failures to distinct next actions", () => {
    expect(failureSummaryForLoopExit("max_iterations", "not done")).toMatchObject({
      code: "max_iterations",
      layer: "budget",
    });
    expect(failureSummaryForWorkflowExit("timeout")).toMatchObject({
      code: "timeout",
      layer: "budget",
    });
    expect(recommendedNextActionFor("verified_failure")).toContain("补充或检查证据");
  });

  it("returns undefined for successful terminal states", () => {
    expect(failureSummaryForLoopExit("success", "done")).toBeUndefined();
    expect(failureSummaryForWorkflowExit("success")).toBeUndefined();
  });
});
