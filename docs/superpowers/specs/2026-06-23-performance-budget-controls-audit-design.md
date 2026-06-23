# P2-05 Performance Budget Controls Audit Design

## Context

P2-05 requires KeiGent loops, workflow children, tools, retries, and provider usage to have budget boundaries. Existing implementation already covers LoopEngine runtime budgets, WorkflowRunner parent/child budgets, RunRecord budget summaries, real-world eval budget fixtures, and Workbench budget panels.

The audit hardens one false-confidence detail: when provider pricing is not configured, the UI must surface the exact `pricing_not_configured` state rather than formatting it as zero cost or hiding it behind ambiguous copy.

## Goal

Complete P2-05 by documenting and independently validating the current budget-control surface, with an explicit Workbench regression that displays `pricing_not_configured` instead of a fabricated `$0` provider cost.

## Non-Goals

- Do not add remote provider price-table syncing.
- Do not hardcode model prices.
- Do not treat `pricing_not_configured` as free usage.
- Do not change budget semantics or migration files.
- Do not claim fixture pass proves production health.

## Required Behavior

1. LoopEngine stops on max tool calls, wall time, token estimate, recovery attempts, and priced provider cost ceilings.
2. WorkflowRunner stops or degrades on max child runs, per-run and aggregate iterations, aggregate tool calls, token estimate, recovery attempts, timeout, and priced provider cost ceilings.
3. Failure code for budget exhaustion remains `budget_exceeded` where applicable.
4. RunRecord contains workflow budget limits, usage, budget exceeded flag, provider usage/cost status, and budget failure evidence.
5. Workbench displays budget usage, provider tokens, and exact `pricing_not_configured` when no local model pricing is configured.
6. Real-world eval includes a deterministic `budget-exceeded` case.

## Acceptance Evidence

- Engine budget tests cover loop-level budget stops and provider usage cost status.
- Workflow runner tests cover parent and child budget boundaries.
- Real-world eval tests cover `budget-exceeded` RunRecord evidence.
- Web run model tests cover priced and unpriced provider usage display.
- P2-05 acceptance delta links these tests to the backlog item and states remaining proof boundaries.
