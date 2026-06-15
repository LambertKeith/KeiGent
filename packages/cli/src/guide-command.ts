import { formatJson, parseJsonOutputFormat } from "./json-output.js";

export interface GuideCommandOptions {
  stdout?: (line: string) => void;
}

interface GuideStep {
  id: string;
  title: string;
  command: string;
  purpose: string;
  gate: "setup" | "diagnostic" | "fixture" | "release" | "upgrade" | "workbench";
  proves: string[];
  doesNotProve: string[];
}

interface FirstRunGuide {
  kind: "first-run-guide";
  status: "informational";
  steps: GuideStep[];
  doesNotDo: string[];
  boundaries: string[];
}

interface ReleaseGate {
  id: string;
  title: string;
  command: string;
  required: boolean;
  proves: string[];
  doesNotProve: string[];
}

interface ManualReleaseCheck {
  id: string;
  title: string;
  required: boolean;
  evidence: string;
  doesNotProve: string[];
}

interface ReleaseChecklistGuide {
  kind: "release-checklist-guide";
  status: "informational";
  gates: ReleaseGate[];
  manualChecks: ManualReleaseCheck[];
  doesNotDo: string[];
  boundaries: string[];
}

interface UpgradeCheckGuide {
  kind: "upgrade-check-guide";
  status: "informational";
  steps: GuideStep[];
  doesNotDo: string[];
  boundaries: string[];
}

type Guide = FirstRunGuide | ReleaseChecklistGuide | UpgradeCheckGuide;

function print(options: GuideCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

export async function runGuideCommand(
  args: string[] = [],
  options: GuideCommandOptions = {},
): Promise<void> {
  const [topic = "first-run", ...rest] = args;
  if (topic !== "first-run" && topic !== "release-checklist" && topic !== "upgrade-check") {
    throw new Error(
      "Usage: keigent guide first-run|release-checklist|upgrade-check [--json|--compact]",
    );
  }

  const guide: Guide =
    topic === "first-run"
      ? firstRunGuide()
      : topic === "release-checklist"
        ? releaseChecklistGuide()
        : upgradeCheckGuide();
  const outputFormat = parseJsonOutputFormat(rest);
  if (outputFormat.json) {
    print(options, formatJson(guide, rest));
    return;
  }

  if (guide.kind === "first-run-guide") {
    printFirstRunGuide(guide, options);
    return;
  }
  if (guide.kind === "upgrade-check-guide") {
    printUpgradeCheckGuide(guide, options);
    return;
  }
  printReleaseChecklistGuide(guide, options);
}

function printFirstRunGuide(guide: FirstRunGuide, options: GuideCommandOptions): void {
  print(options, "First-run Guide");
  print(options, "");
  for (const [index, step] of guide.steps.entries()) {
    print(options, `${index + 1}. ${step.title}`);
    print(options, `   ${step.command}`);
    print(options, `   Gate: ${step.gate}`);
    print(options, `   ${step.purpose}`);
    print(options, `   Proves: ${step.proves.join("; ")}`);
    print(options, `   Does not prove: ${step.doesNotProve.join("; ")}`);
  }
  print(options, "");
  print(options, "Boundaries:");
  for (const boundary of guide.boundaries) print(options, `- ${boundary}`);
}

function printReleaseChecklistGuide(guide: ReleaseChecklistGuide, options: GuideCommandOptions): void {
  print(options, "Release Checklist Guide");
  print(options, "");
  print(options, "Does not do:");
  for (const item of guide.doesNotDo) print(options, `- ${item}`);
  print(options, "");
  for (const [index, gate] of guide.gates.entries()) {
    print(options, `${index + 1}. ${gate.title}`);
    print(options, `   ${gate.command}`);
    print(options, `   Required: ${gate.required ? "yes" : "no"}`);
    print(options, `   Proves: ${gate.proves.join("; ")}`);
    print(options, `   Does not prove: ${gate.doesNotProve.join("; ")}`);
  }
  print(options, "");
  print(options, "Manual checks:");
  for (const check of guide.manualChecks) {
    print(options, `- ${check.title}: ${check.evidence}`);
    print(options, `  Required: ${check.required ? "yes" : "no"}`);
    print(options, `  Does not prove: ${check.doesNotProve.join("; ")}`);
  }
  print(options, "");
  print(options, "Boundaries:");
  for (const boundary of guide.boundaries) print(options, `- ${boundary}`);
}

function printUpgradeCheckGuide(guide: UpgradeCheckGuide, options: GuideCommandOptions): void {
  print(options, "Upgrade Check Guide");
  print(options, "");
  print(options, "Does not do:");
  for (const item of guide.doesNotDo) print(options, `- ${item}`);
  print(options, "");
  for (const [index, step] of guide.steps.entries()) {
    print(options, `${index + 1}. ${step.title}`);
    print(options, `   ${step.command}`);
    print(options, `   Gate: ${step.gate}`);
    print(options, `   ${step.purpose}`);
    print(options, `   Proves: ${step.proves.join("; ")}`);
    print(options, `   Does not prove: ${step.doesNotProve.join("; ")}`);
  }
  print(options, "");
  print(options, "Boundaries:");
  for (const boundary of guide.boundaries) print(options, `- ${boundary}`);
}

function firstRunGuide(): FirstRunGuide {
  return {
    kind: "first-run-guide",
    status: "informational",
    doesNotDo: [
      "does_not_write_config",
      "does_not_run_network_checks",
      "does_not_claim_product_health",
    ],
    steps: [
      {
        id: "install",
        title: "Install workspace dependencies",
        command: "corepack pnpm install",
        purpose: "Install the monorepo dependencies from the repository root.",
        gate: "setup",
        proves: ["workspace dependencies can be installed"],
        doesNotProve: ["runtime configuration is valid"],
      },
      {
        id: "config_show",
        title: "Inspect effective config",
        command: "corepack pnpm --filter @keigent/cli start config show --compact",
        purpose: "Confirm config sources and secret redaction before running tasks.",
        gate: "diagnostic",
        proves: ["effective config can be rendered with secret redaction"],
        doesNotProve: ["API key works online"],
      },
      {
        id: "doctor",
        title: "Run local diagnostics",
        command: "corepack pnpm --filter @keigent/cli start doctor --compact",
        purpose: "Check Node, config schema, API key presence, model capabilities, and browser cache hints.",
        gate: "diagnostic",
        proves: ["local prerequisites and config schema are inspectable"],
        doesNotProve: ["online model quality"],
      },
      {
        id: "smoke_eval",
        title: "Run deterministic smoke eval",
        command: "corepack pnpm --filter @keigent/cli start eval smoke --compact",
        purpose: "Verify the local fixture harness without claiming production health.",
        gate: "fixture",
        proves: ["deterministic smoke fixture still passes"],
        doesNotProve: ["production health"],
      },
      {
        id: "real_world_eval",
        title: "Run real-world L2 fixture",
        command: "corepack pnpm --filter @keigent/cli start eval real-world --compact",
        purpose: "Generate fixture-level evidence and false-confidence boundaries.",
        gate: "fixture",
        proves: ["real-world L2 fixture report can be produced"],
        doesNotProve: ["external system health", "human acceptance"],
      },
      {
        id: "bin_runs_list",
        title: "Verify clean bin JSON output",
        command: "node packages/cli/bin/keigent.mjs runs list --compact",
        purpose: "Confirm the package bin shim can emit machine-readable JSON without pnpm wrapper noise.",
        gate: "release",
        proves: ["bin shim emits machine-readable JSON without pnpm wrapper noise"],
        doesNotProve: ["run store contains successful runs"],
      },
      {
        id: "web_api_print",
        title: "Print local Workbench/API startup commands",
        command: "corepack pnpm --filter @keigent/cli start web --api --print",
        purpose: "Get the local Workbench URL, API URL, and VITE_KEIGENT_API_URL dev command.",
        gate: "workbench",
        proves: ["local Workbench and API launch commands can be printed"],
        doesNotProve: ["Workbench is a complete interactive product"],
      },
    ],
    boundaries: [
      "Fixture evals do not prove production health.",
      "Workbench remains a local audit surface, not a complete interactive product.",
      "The guide is read-only and does not create config files or run diagnostics for you.",
    ],
  };
}

function releaseChecklistGuide(): ReleaseChecklistGuide {
  return {
    kind: "release-checklist-guide",
    status: "informational",
    doesNotDo: [
      "does_not_execute_release_gates",
      "does_not_modify_workspace",
      "does_not_claim_release_readiness",
    ],
    gates: [
      {
        id: "node_version",
        title: "Verify release Node version",
        command: "corepack pnpm verify:node",
        required: true,
        proves: ["current Node version satisfies the release gate"],
        doesNotProve: ["runtime behavior is correct"],
      },
      {
        id: "workspace_check",
        title: "Run workspace type checks",
        command: "corepack pnpm -r check",
        required: true,
        proves: ["all workspace check scripts pass"],
        doesNotProve: ["runtime workflows succeed"],
      },
      {
        id: "workspace_test",
        title: "Run workspace tests",
        command: "corepack pnpm -r test",
        required: true,
        proves: ["all workspace test scripts pass"],
        doesNotProve: ["manual operator acceptance is complete"],
      },
      {
        id: "workspace_build",
        title: "Run workspace builds",
        command: "corepack pnpm -r --if-present build",
        required: true,
        proves: ["all present build scripts pass"],
        doesNotProve: ["published package metadata is accepted by a registry"],
      },
      {
        id: "diff_check",
        title: "Check whitespace and patch hygiene",
        command: "git diff --check",
        required: true,
        proves: ["current diff has no whitespace errors detected by git"],
        doesNotProve: ["code review is complete"],
      },
      {
        id: "bin_first_run_guide",
        title: "Verify first-run guide bin output",
        command: "node packages/cli/bin/keigent.mjs guide first-run --compact",
        required: true,
        proves: ["first-run guide emits machine-readable JSON"],
        doesNotProve: ["first-run steps were executed"],
      },
      {
        id: "bin_upgrade_check_guide",
        title: "Verify upgrade check guide bin output",
        command: "node packages/cli/bin/keigent.mjs guide upgrade-check --compact",
        required: true,
        proves: ["upgrade check guide emits machine-readable JSON"],
        doesNotProve: ["upgrade checks were executed"],
      },
      {
        id: "bin_runs_list",
        title: "Verify run store bin output",
        command: "node packages/cli/bin/keigent.mjs runs list --compact",
        required: true,
        proves: ["run store listing emits machine-readable JSON without wrapper noise"],
        doesNotProve: ["run store records are healthy"],
      },
      {
        id: "browser_verify",
        title: "Run browser verification with explicit cache path",
        command:
          "PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright corepack pnpm --filter @keigent/engine verify:browser",
        required: true,
        proves: ["browser verification can use the installed Playwright cache"],
        doesNotProve: ["Workbench is a complete interactive product"],
      },
      {
        id: "doctor_compact",
        title: "Verify compact doctor diagnostics",
        command: "corepack pnpm --filter @keigent/cli start doctor --compact",
        required: true,
        proves: ["doctor emits machine-readable diagnostics"],
        doesNotProve: ["online model quality", "production health"],
      },
      {
        id: "bin_skill_list",
        title: "Verify skill governance inventory bin output",
        command: "node packages/cli/bin/keigent.mjs skill list --compact",
        required: true,
        proves: ["skill governance inventory emits machine-readable JSON"],
        doesNotProve: ["skill promotion was approved"],
      },
      {
        id: "web_api_print",
        title: "Print local Workbench and API startup commands",
        command: "corepack pnpm --filter @keigent/cli start web --api --print",
        required: true,
        proves: ["Workbench URL, API URL, and API-backed dev command are printable"],
        doesNotProve: ["Workbench server is already running"],
      },
      {
        id: "web_custom_port_print",
        title: "Print custom-port Workbench startup command",
        command: "corepack pnpm --filter @keigent/cli start web --port 5199 --print",
        required: true,
        proves: ["custom Workbench port dev command is printable without swallowing Vite flags"],
        doesNotProve: ["the printed server was started"],
      },
      {
        id: "real_world_open",
        title: "Run real-world eval with Run Detail handoff",
        command: "corepack pnpm --filter @keigent/cli start eval real-world --compact --open",
        required: true,
        proves: ["real-world L2 fixture can save RunRecords and print Workbench handoff links"],
        doesNotProve: ["production health", "human acceptance"],
      },
      {
        id: "operator_packet",
        title: "Print operator acceptance packet",
        command: "corepack pnpm --filter @keigent/cli start eval operator --packet",
        required: true,
        proves: ["operator packet exposes proof boundary, evidence checks, override reason, and next actions"],
        doesNotProve: ["human acceptance"],
      },
    ],
    manualChecks: [
      {
        id: "no_real_secrets",
        title: "No real secrets in examples",
        required: true,
        evidence: "Inspect config.example.json and .env.example.",
        doesNotProve: ["all local user configs are secret-free"],
      },
      {
        id: "license_metadata",
        title: "Package license metadata is Apache-2.0",
        required: true,
        evidence: "Inspect root and workspace package.json files plus LICENSE.",
        doesNotProve: ["registry publish acceptance"],
      },
      {
        id: "contributing_policy",
        title: "Contribution policy covers safety boundaries",
        required: true,
        evidence: "Inspect CONTRIBUTING.md for license, test gates, secret safety, and data safety.",
        doesNotProve: ["contributors have completed review"],
      },
      {
        id: "readme_release_links",
        title: "README links point to release and upgrade docs",
        required: true,
        evidence: "Inspect README.md and doc/product/README.md.",
        doesNotProve: ["all external docs are current"],
      },
      {
        id: "cli_bin_metadata",
        title: "CLI package bin metadata is correct",
        required: true,
        evidence: "Inspect packages/cli/package.json for bin -> ./bin/keigent.mjs.",
        doesNotProve: ["the bin was executed in this checklist run"],
      },
      {
        id: "cli_bin_executable",
        title: "CLI bin file is executable",
        required: true,
        evidence: "Inspect git file mode for packages/cli/bin/keigent.mjs.",
        doesNotProve: ["all downstream package managers preserve the mode"],
      },
      {
        id: "roadmap_notes_current",
        title: "Roadmap implementation notes are current",
        required: true,
        evidence: "Inspect doc/product/09-agent-operations-maturity-roadmap.md.",
        doesNotProve: ["future roadmap items are implemented"],
      },
      {
        id: "debug_bundle_safety",
        title: "Debug bundle is secret-safe and includes observability",
        required: true,
        evidence: "Inspect a generated debug bundle for redaction and observability-summary.json.",
        doesNotProve: ["all possible local artifacts are safe to publish"],
      },
      {
        id: "operator_acceptance_boundary",
        title: "Operator acceptance is not implied by fixtures",
        required: true,
        evidence: "Inspect operator packet and sign-off records when applicable.",
        doesNotProve: ["human acceptance is complete"],
      },
      {
        id: "operator_acceptance_validation",
        title: "Operator sign-off validation rejects incomplete acceptance",
        required: true,
        evidence:
          "Inspect operator --acceptance output for operator-human-acceptance records and required evidence/override checks.",
        doesNotProve: ["the reviewer made a correct judgment"],
      },
      {
        id: "run_record_workbench_evidence",
        title: "RunRecord and Workbench show proof and recovery context",
        required: true,
        evidence: "Inspect Run Detail for Proof boundary, Autonomy, Repair attempts, and Next action.",
        doesNotProve: ["final text is sufficient success evidence"],
      },
      {
        id: "web_run_handoff",
        title: "Web Run Launcher hands off to Run Detail",
        required: true,
        evidence: "Inspect web run output after run_finished.recordId.",
        doesNotProve: ["Live Console replaces RunRecord audit"],
      },
      {
        id: "loop_event_protocol",
        title: "Loop Event Protocol remains stable",
        required: true,
        evidence: "Inspect CLI, Live Console, Workbench, and reports for stable LoopEvent usage.",
        doesNotProve: ["raw log parsing is an acceptable UI contract"],
      },
    ],
    boundaries: [
      "The checklist is a read-only guide; it does not run release commands.",
      "Passing fixture evals does not prove production health.",
      "Human acceptance still requires reviewer sign-off on evidence.",
    ],
  };
}

function upgradeCheckGuide(): UpgradeCheckGuide {
  return {
    kind: "upgrade-check-guide",
    status: "informational",
    doesNotDo: [
      "does_not_modify_config",
      "does_not_migrate_run_store",
      "does_not_claim_upgrade_safe",
    ],
    steps: [
      {
        id: "config_show",
        title: "Inspect config schema and sources",
        command: "corepack pnpm --filter @keigent/cli start config show --compact",
        purpose:
          "Render the effective config with configVersion, source metadata, and secret redaction before upgrading.",
        gate: "diagnostic",
        proves: ["effective config can be rendered with configVersion and redaction"],
        doesNotProve: ["future config schema is supported"],
      },
      {
        id: "doctor_upgrade",
        title: "Run upgrade diagnostics",
        command: "corepack pnpm --filter @keigent/cli start doctor --compact",
        purpose:
          "Check configVersion compatibility, model capabilities, Node version, API key presence, and browser cache hints.",
        gate: "diagnostic",
        proves: ["doctor can report configVersion and actionable local issues"],
        doesNotProve: ["online model quality"],
      },
      {
        id: "runs_migration_report",
        title: "Inspect run store migration report",
        command: "node packages/cli/bin/keigent.mjs runs list --compact",
        purpose:
          "Read the run store through the package bin shim and surface migration diagnostics without wrapper noise.",
        gate: "upgrade",
        proves: [
          "run store can be read through the clean bin shim with migration diagnostics",
        ],
        doesNotProve: ["legacy run records are semantically accepted"],
      },
      {
        id: "release_checklist",
        title: "Print release checklist",
        command: "node packages/cli/bin/keigent.mjs guide release-checklist --compact",
        purpose:
          "Confirm the release candidate exposes machine-readable gates, manual checks, and proof boundaries.",
        gate: "release",
        proves: ["release checklist is available as machine-readable JSON"],
        doesNotProve: ["release gates were executed"],
      },
    ],
    boundaries: [
      "Upgrade check is read-only and does not rewrite config or run records.",
      "Unsupported future config versions must be rejected or flagged, not silently reinterpreted.",
      "Passing upgrade check does not prove release readiness or product health.",
    ],
  };
}
