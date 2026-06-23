# P2-03 Observability Debug Package Audit Design

## Context

P2-03 requires a debug bundle that a developer can inspect without reproducing the original environment. The existing bundle already exports redacted run facts, copied artifacts, tool summary, failure summary, triage summary, and `observability-summary.json`.

This audit hardens the evidence boundary for timeout and abort diagnostics. A boolean is useful, but a developer also needs to know which recorded facts caused that classification. The bundle must not infer hidden runtime behavior.

## Goal

Make the P2-03 debug bundle independently auditable by documenting and testing that observability output includes event timeline, budget, recovery, timeout/abort source signals, failure taxonomy, and explicit `not_recorded` latency status.

## Non-Goals

- Do not add zip/tar packaging.
- Do not upload bundles or call external services.
- Do not fabricate per-tool or model latency.
- Do not introduce automatic judge conclusions from debug data.
- Do not change migration files or database schema.

## Current Surface

`exportRunDebugBundle()` writes:

- `record.json`
- copied trajectory / workflow / eval artifacts when present
- `redacted-config.json`
- `tool-summary.json`
- `observability-summary.json`
- `triage-summary.json`
- `failure-summary.md`
- `redaction-summary.json`

`observability-summary.json` is the P2-03 artifact for structured event counts, workflow budget, recovery attempts, provider usage, timeout/abort status, latency recording status, and failure taxonomy.

## Required Behavior

1. `observability-summary.json` keeps the existing `timeoutAbort.timedOut` and `timeoutAbort.aborted` booleans.
2. `timeoutAbort.timeoutSources` lists the recorded source fields that prove timeout was observed.
3. `timeoutAbort.abortSources` lists the recorded source fields that prove abort was observed.
4. Source lists only mention recorded RunRecord facts, such as `workflow.exitReason`, `execution.exitReason`, `failures.timeout`, or `execution.finalResponseSummary`.
5. Missing tool/model latency remains explicit as `{ "status": "not_recorded" }`.
6. The bundle remains fully redacted.

## Acceptance Evidence

- Engine test exports a timeout/abort debug bundle and asserts the timeout/abort source arrays.
- Engine test continues to assert redaction, failure summary, budget, recovery, provider usage, failure taxonomy, and `not_recorded` latency.
- CLI test continues to prove `runs debug-bundle` exports the expected redacted files.
- Stability gate and full repo checks remain green.
