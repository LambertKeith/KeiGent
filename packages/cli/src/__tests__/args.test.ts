import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../args.js";

describe("parseCliArgs", () => {
  it("treats a leading npm/pnpm -- separator as transparent for one-shot tasks", () => {
    expect(parseCliArgs(["--", "打开 https://example.com"])).toEqual({ kind: "run", task: "打开 https://example.com" });
  });

  it("keeps explicit run mode after a leading -- separator", () => {
    expect(parseCliArgs(["--", "run", "Do", "the", "thing"])).toEqual({ kind: "run", task: "Do the thing" });
  });

  it("still routes zero-arg invocation to the repl", () => {
    expect(parseCliArgs([])).toEqual({ kind: "repl" });
  });

  it("still routes doctor and config commands before task handling", () => {
    expect(parseCliArgs(["doctor", "--json"])).toEqual({ kind: "doctor", args: ["--json"] });
    expect(parseCliArgs(["config", "show"])).toEqual({ kind: "config", args: ["show"] });
  });
});
