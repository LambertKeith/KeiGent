import { describe, expect, it } from "vitest";
import { parseEvalCliArgs } from "../evals/cli-options.js";

describe("parseEvalCliArgs", () => {
  it("defaults to smoke mode", () => {
    expect(parseEvalCliArgs([])).toEqual({ mode: "smoke", trajectories: {}, pretty: true });
  });

  it("parses replay mode and repeated trajectory mappings", () => {
    expect(parseEvalCliArgs([
      "--mode",
      "replay",
      "--",
      "--trajectory",
      "case-a=/tmp/a.json",
      "--trajectory",
      "case-b=/tmp/b.json",
    ])).toEqual({
      mode: "replay",
      pretty: true,
      trajectories: {
        "case-a": "/tmp/a.json",
        "case-b": "/tmp/b.json",
      },
    });
  });

  it("rejects malformed trajectory mapping", () => {
    expect(() => parseEvalCliArgs(["--mode", "replay", "--trajectory", "bad-value"])).toThrow(
      "--trajectory must use case-id=/path/to/trajectory.json",
    );
  });

  it("rejects unknown mode", () => {
    expect(() => parseEvalCliArgs(["--mode", "real"])).toThrow("unknown eval mode real; expected smoke or replay");
  });
});
