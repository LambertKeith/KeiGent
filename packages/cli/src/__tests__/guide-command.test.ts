import { describe, expect, it } from "vitest";
import { runGuideCommand } from "../guide-command.js";

function capture(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}

describe("guide command", () => {
  it("prints a compact first-run guide as machine-readable JSON", async () => {
    const output = capture();

    await runGuideCommand(["first-run", "--compact"], { stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      kind: "first-run-guide",
      status: "informational",
      doesNotDo: expect.arrayContaining([
        "does_not_write_config",
        "does_not_run_network_checks",
        "does_not_claim_product_health",
      ]),
      steps: expect.arrayContaining([
        expect.objectContaining({
          id: "install",
          command: "corepack pnpm install",
          gate: "setup",
          proves: ["workspace dependencies can be installed"],
        }),
        expect.objectContaining({
          id: "doctor",
          command: "corepack pnpm --filter @keigent/cli start doctor --compact",
          gate: "diagnostic",
          doesNotProve: ["online model quality"],
        }),
        expect.objectContaining({
          id: "smoke_eval",
          command: "corepack pnpm --filter @keigent/cli start eval smoke --compact",
          gate: "fixture",
          doesNotProve: ["production health"],
        }),
        expect.objectContaining({
          id: "bin_runs_list",
          command: "node packages/cli/bin/keigent.mjs runs list --compact",
          gate: "release",
          proves: ["bin shim emits machine-readable JSON without pnpm wrapper noise"],
        }),
      ]),
      boundaries: expect.arrayContaining([
        "Fixture evals do not prove production health.",
        "Workbench remains a local audit surface, not a complete interactive product.",
      ]),
    });
    expect(output.lines[0]).not.toContain("\n");
  });

  it("prints a human-readable first-run guide by default", async () => {
    const output = capture();

    await runGuideCommand(["first-run"], { stdout: output.stdout });

    const text = output.lines.join("\n");
    expect(text).toContain("First-run Guide");
    expect(text).toContain("corepack pnpm install");
    expect(text).toContain("Gate: setup");
    expect(text).toContain("Does not prove: production health");
    expect(text).toContain("corepack pnpm --filter @keigent/cli start doctor --compact");
    expect(text).toContain("Fixture evals do not prove production health.");
  });

  it("prints a compact release checklist without executing gates", async () => {
    const output = capture();

    await runGuideCommand(["release-checklist", "--compact"], { stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      kind: "release-checklist-guide",
      status: "informational",
      doesNotDo: expect.arrayContaining([
        "does_not_execute_release_gates",
        "does_not_modify_workspace",
        "does_not_claim_release_readiness",
      ]),
      gates: expect.arrayContaining([
        expect.objectContaining({
          id: "node_version",
          command: "corepack pnpm verify:node",
          required: true,
        }),
        expect.objectContaining({
          id: "workspace_check",
          command: "corepack pnpm -r check",
          required: true,
        }),
        expect.objectContaining({
          id: "bin_first_run_guide",
          command: "node packages/cli/bin/keigent.mjs guide first-run --compact",
          required: true,
          proves: ["first-run guide emits machine-readable JSON"],
        }),
        expect.objectContaining({
          id: "bin_upgrade_check_guide",
          command: "node packages/cli/bin/keigent.mjs guide upgrade-check --compact",
          required: true,
          proves: ["upgrade check guide emits machine-readable JSON"],
        }),
        expect.objectContaining({
          id: "browser_verify",
          command:
            "PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright corepack pnpm --filter @keigent/engine verify:browser",
          required: true,
          doesNotProve: ["Workbench is a complete interactive product"],
        }),
        expect.objectContaining({
          id: "doctor_compact",
          command: "corepack pnpm --filter @keigent/cli start doctor --compact",
          required: true,
          proves: ["doctor emits machine-readable diagnostics"],
        }),
        expect.objectContaining({
          id: "bin_skill_list",
          command: "node packages/cli/bin/keigent.mjs skill list --compact",
          required: true,
          proves: ["skill governance inventory emits machine-readable JSON"],
        }),
        expect.objectContaining({
          id: "web_api_print",
          command: "corepack pnpm --filter @keigent/cli start web --api --print",
          required: true,
          proves: ["Workbench URL, API URL, and API-backed dev command are printable"],
        }),
        expect.objectContaining({
          id: "web_custom_port_print",
          command: "corepack pnpm --filter @keigent/cli start web --port 5199 --print",
          required: true,
          proves: ["custom Workbench port dev command is printable without swallowing Vite flags"],
        }),
        expect.objectContaining({
          id: "real_world_open",
          command: "corepack pnpm --filter @keigent/cli start eval real-world --compact --open",
          required: true,
          doesNotProve: ["production health", "human acceptance"],
        }),
        expect.objectContaining({
          id: "operator_packet",
          command: "corepack pnpm --filter @keigent/cli start eval operator --packet",
          required: true,
          doesNotProve: ["human acceptance"],
        }),
      ]),
      manualChecks: expect.arrayContaining([
        expect.objectContaining({
          id: "no_real_secrets",
          doesNotProve: ["all local user configs are secret-free"],
        }),
        expect.objectContaining({ id: "license_metadata" }),
        expect.objectContaining({ id: "contributing_policy" }),
        expect.objectContaining({ id: "readme_release_links" }),
        expect.objectContaining({ id: "cli_bin_metadata" }),
        expect.objectContaining({ id: "cli_bin_executable" }),
        expect.objectContaining({ id: "roadmap_notes_current" }),
        expect.objectContaining({ id: "debug_bundle_safety" }),
        expect.objectContaining({ id: "operator_acceptance_boundary" }),
        expect.objectContaining({ id: "operator_acceptance_validation" }),
        expect.objectContaining({ id: "run_record_workbench_evidence" }),
        expect.objectContaining({ id: "web_run_handoff" }),
        expect.objectContaining({ id: "loop_event_protocol" }),
      ]),
      boundaries: expect.arrayContaining([
        "The checklist is a read-only guide; it does not run release commands.",
        "Passing fixture evals does not prove production health.",
      ]),
    });
  });

  it("prints release checklist human output with does-not-do and manual evidence details", async () => {
    const output = capture();

    await runGuideCommand(["release-checklist"], { stdout: output.stdout });

    const text = output.lines.join("\n");
    expect(text).toContain("Release Checklist Guide");
    expect(text).toContain("Does not do:");
    expect(text).toContain("- does_not_execute_release_gates");
    expect(text).toContain("corepack pnpm verify:node");
    expect(text).toContain("corepack pnpm --filter @keigent/cli start eval operator --packet");
    expect(text).toContain("Manual checks:");
    expect(text).toContain("No real secrets in examples");
    expect(text).toContain("Does not prove: all local user configs are secret-free");
    expect(text).toContain("Loop Event Protocol remains stable");
  });

  it("prints a compact upgrade check as machine-readable JSON", async () => {
    const output = capture();

    await runGuideCommand(["upgrade-check", "--compact"], { stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      kind: "upgrade-check-guide",
      status: "informational",
      doesNotDo: expect.arrayContaining([
        "does_not_modify_config",
        "does_not_migrate_run_store",
        "does_not_claim_upgrade_safe",
      ]),
      steps: expect.arrayContaining([
        expect.objectContaining({
          id: "config_show",
          command: "corepack pnpm --filter @keigent/cli start config show --compact",
          gate: "diagnostic",
          proves: ["effective config can be rendered with configVersion and redaction"],
          doesNotProve: ["future config schema is supported"],
        }),
        expect.objectContaining({
          id: "doctor_upgrade",
          command: "corepack pnpm --filter @keigent/cli start doctor --compact",
          gate: "diagnostic",
          proves: ["doctor can report configVersion and actionable local issues"],
          doesNotProve: ["online model quality"],
        }),
        expect.objectContaining({
          id: "runs_migration_report",
          command: "node packages/cli/bin/keigent.mjs runs list --compact",
          gate: "upgrade",
          proves: [
            "run store can be read through the clean bin shim with migration diagnostics",
          ],
          doesNotProve: ["legacy run records are semantically accepted"],
        }),
        expect.objectContaining({
          id: "release_checklist",
          command: "node packages/cli/bin/keigent.mjs guide release-checklist --compact",
          gate: "release",
          proves: ["release checklist is available as machine-readable JSON"],
          doesNotProve: ["release gates were executed"],
        }),
      ]),
      boundaries: expect.arrayContaining([
        "Upgrade check is read-only and does not rewrite config or run records.",
        "Unsupported future config versions must be rejected or flagged, not silently reinterpreted.",
        "Passing upgrade check does not prove release readiness or product health.",
      ]),
    });
    expect(output.lines[0]).not.toContain("\n");
  });

  it("prints a human-readable upgrade check by default", async () => {
    const output = capture();

    await runGuideCommand(["upgrade-check"], { stdout: output.stdout });

    const text = output.lines.join("\n");
    expect(text).toContain("Upgrade Check Guide");
    expect(text).toContain("Does not do:");
    expect(text).toContain("- does_not_modify_config");
    expect(text).toContain("corepack pnpm --filter @keigent/cli start config show --compact");
    expect(text).toContain("Gate: upgrade");
    expect(text).toContain("Does not prove: legacy run records are semantically accepted");
    expect(text).toContain("Unsupported future config versions must be rejected or flagged");
  });

  it("rejects unknown guide topics", async () => {
    await expect(runGuideCommand(["upgrade"])).rejects.toThrow(
      "Usage: keigent guide first-run|release-checklist|upgrade-check [--json|--compact]",
    );
  });
});
