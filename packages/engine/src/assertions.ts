import type { Assertion, AssertionResult } from "./types.js";
import type { EvidenceBundle } from "./evidence.js";
import { countPassedCheckpoints, countSuccessfulToolCalls, hasApprovedScope } from "./evidence.js";

type TextAssertionSource = "dom" | "stdout" | "file" | "final" | undefined;

export function describeAssertion(assertion: Assertion): string {
  switch (assertion.kind) {
    case undefined:
    case "legacySignal":
      return `[signal:${assertion.signal}] ${assertion.description}`;
    case "urlContains":
      return `url contains ${assertion.value}`;
    case "textIncludes":
      return `${assertion.source ?? "text"} includes ${assertion.value}`;
    case "fileExists":
      return `file exists ${assertion.path}`;
    case "fileHashEquals":
      return `file hash ${assertion.path} equals ${assertion.sha256}`;
    case "commandExitCode":
      return `command ${assertion.commandId} exit code is ${assertion.code}`;
    case "toolSucceeded":
      return `tool ${assertion.toolName} succeeded ${assertion.minCount ?? 1} time(s)`;
    case "checkpointPassed":
      return `checkpoint passed ${assertion.minCount ?? 1} time(s)`;
    case "humanApproved":
      return `human approved ${assertion.scope}`;
    case "jsonPathEquals":
      return `json path ${assertion.path} equals ${JSON.stringify(assertion.value)}`;
    case "screenshotJudge":
      return `screenshot judge: ${assertion.rubric}`;
  }
}

export function evaluateAssertions(assertions: Assertion[], bundle: EvidenceBundle): AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(assertion, bundle));
}

export function evaluateAssertion(assertion: Assertion, bundle: EvidenceBundle): AssertionResult {
  switch (assertion.kind) {
    case "toolSucceeded": {
      const minCount = assertion.minCount ?? 1;
      const count = countSuccessfulToolCalls(bundle, assertion.toolName);
      return count >= minCount
        ? pass(assertion, `tool ${assertion.toolName} succeeded ${count} time(s)`)
        : fail(assertion, "evidence_missing", `tool ${assertion.toolName} succeeded ${count}/${minCount} required time(s)`);
    }
    case "checkpointPassed": {
      const minCount = assertion.minCount ?? 1;
      const count = countPassedCheckpoints(bundle);
      return count >= minCount
        ? pass(assertion, `${count} checkpoint(s) passed`)
        : fail(assertion, "evidence_missing", `${count}/${minCount} required checkpoint(s) passed`);
    }
    case "humanApproved":
      return hasApprovedScope(bundle, assertion.scope)
        ? pass(assertion, `approved scope ${assertion.scope}`)
        : fail(assertion, "evidence_missing", `approval for ${assertion.scope} missing or denied`);
    case "textIncludes": {
      const haystack = textSource(assertion.source, bundle);
      return haystack.includes(assertion.value)
        ? pass(assertion, `text includes ${assertion.value}`)
        : fail(assertion, "assertion_failed", `text missing ${assertion.value}`);
    }
    case "urlContains": {
      const urls = bundle.checkpoints.map((checkpoint) => checkpoint.url ?? "").join("\n");
      return urls.includes(assertion.value)
        ? pass(assertion, `URL evidence contains ${assertion.value}`)
        : fail(assertion, "evidence_missing", `URL evidence missing ${assertion.value}`);
    }
    case "jsonPathEquals":
    case "fileExists":
    case "fileHashEquals":
    case "commandExitCode":
    case "screenshotJudge":
      return fail(assertion, "assertion_unsupported", `${assertion.kind} is not supported by deterministic evidence yet`);
    case undefined:
    case "legacySignal":
      return fail(assertion, "assertion_unsupported", "legacy natural-language assertion requires verifier judgment");
  }
}

function textSource(source: TextAssertionSource, bundle: EvidenceBundle): string {
  switch (source) {
    case "final":
      return bundle.finalResponse;
    case "dom":
      return bundle.checkpoints.map((checkpoint) => checkpoint.visibleText ?? "").join("\n");
    case "stdout":
    case "file":
      return bundle.toolCalls.map((tool) => tool.toolResult).join("\n");
    case undefined:
      return [...bundle.textOutputs, ...bundle.checkpoints.map((checkpoint) => checkpoint.visibleText ?? "")].join("\n");
  }
}

function pass(assertion: Assertion, evidence: string): AssertionResult {
  return { assertion, passed: true, evidence };
}

function fail(assertion: Assertion, failureCode: NonNullable<AssertionResult["failureCode"]>, evidence: string): AssertionResult {
  return { assertion, passed: false, evidence, failureCode };
}
