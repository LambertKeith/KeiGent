import { loadConfig, redactConfig } from "./config.js";
import { doctorConfig } from "./config-doctor.js";

export async function runDoctor(args: string[] = []): Promise<void> {
  const json = args.includes("--json");
  try {
    const config = await loadConfig({ ensureDirs: false });
    const result = await doctorConfig(config);
    const payload = { ...result, config: redactConfig(config) };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`KeiGent doctor: ${result.status}`);
      for (const issue of result.issues) {
        console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    }
    if (result.status === "error") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = {
      status: "error",
      checkedAt: new Date().toISOString(),
      issues: [{ code: "config.load_failed", severity: "error", message }],
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else console.error(`KeiGent doctor: error\n- [error] config.load_failed: ${message}`);
    process.exitCode = 1;
  }
}

export async function runConfigCommand(args: string[] = []): Promise<void> {
  const [subcommand] = args;
  switch (subcommand) {
    case "show": {
      const config = await loadConfig();
      console.log(JSON.stringify(redactConfig(config), null, 2));
      return;
    }
    default:
      console.log("Usage: keigent config show");
  }
}
