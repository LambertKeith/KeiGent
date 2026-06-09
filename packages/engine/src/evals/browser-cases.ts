import { DEFAULT_EVAL_CASES } from "./cases.js";

export const BROWSER_EVAL_CASES = DEFAULT_EVAL_CASES.filter((evalCase) => evalCase.category === "browser");
