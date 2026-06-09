export type EvalCliMode = "smoke" | "replay";

export interface EvalCliOptions {
  mode: EvalCliMode;
  trajectories: Record<string, string>;
  pretty: boolean;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseEvalCliArgs(args: string[]): EvalCliOptions {
  const options: EvalCliOptions = { mode: "smoke", trajectories: {}, pretty: true };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--mode": {
        const value = requireValue(args, i, "--mode");
        if (value !== "smoke" && value !== "replay") {
          throw new Error(`unknown eval mode ${value}; expected smoke or replay`);
        }
        options.mode = value;
        i++;
        break;
      }
      case "--trajectory": {
        const value = requireValue(args, i, "--trajectory");
        const sep = value.indexOf("=");
        if (sep <= 0 || sep === value.length - 1) {
          throw new Error("--trajectory must use case-id=/path/to/trajectory.json");
        }
        options.trajectories[value.slice(0, sep)] = value.slice(sep + 1);
        i++;
        break;
      }
      case "--pretty":
        options.pretty = true;
        break;
      case "--json":
        break;
      case "--compact":
        options.pretty = false;
        break;
      case "--":
        break;
      default:
        throw new Error(`unknown eval option ${arg}`);
    }
  }

  return options;
}
