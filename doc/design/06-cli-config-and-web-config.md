# CLI Config and Web Config Design

> **Goal:** Make KeiGent configuration secure, source-aware, debuggable, provider-neutral, and consistent across CLI and web surfaces.

## 1. Configuration goals

1. No hidden credentials: no hardcoded API key, no sample key fallback, no raw secret in logs/UI/doctor.
2. Provider-neutral by default: KeiGent must not expose a product-specific entrance for a third-party relay platform.
3. Protocol-first model setup: users choose an API protocol shape, not a vendor-specific integration path.
4. Clear precedence: users can see where every active value came from.
5. Safe first run: missing config produces setup guidance, not opaque crashes.
6. CLI and web config share resolver, validator, redactor, and writer.
7. Product logic must expose missing/invalid/overridden/unreachable states explicitly.

## 2. Model endpoint model

KeiGent supports two LLM API protocol formats:

| `apiProtocol` | pi-ai API | Meaning |
| --- | --- | --- |
| `openai` | `openai-completions` | OpenAI Chat Completions compatible endpoint. |
| `anthropic` | `anthropic-messages` | Anthropic Messages compatible endpoint. |

The configured provider is therefore represented as:

```ts
{
  apiProtocol: "openai" | "anthropic";
  baseUrl: string;
  modelId: string;
  apiKey: string;
  modelPricing: null | {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}
```

Rules:

- `baseUrl` is user-editable for both protocols.
- Official defaults are allowed as convenience defaults:
  - OpenAI protocol: `https://api.openai.com/v1`
  - Anthropic protocol: `https://api.anthropic.com`
- Third-party relay URLs are just custom `baseUrl` values; they must not get dedicated product entry points, names, or hidden defaults.
- UI copy should say “OpenAI-compatible” / “Anthropic-compatible”, not the name of a relay provider.
- `modelPricing` is an explicit local price table in USD per million tokens, matching pi-ai `Model.cost` fields. KeiGent does not fetch or guess provider prices.

## 3. Canonical config file

Default path:

```text
~/.keigent/config.json
```

Supported fields:

| Field | Type | Required | Secret | Default |
| --- | --- | --- | --- | --- |
| `configVersion` | `1` | yes | no | `1` |
| `apiKey` | string | yes | yes | none |
| `apiProtocol` | `openai` \| `anthropic` | yes | no | `openai` |
| `baseUrl` | URL | yes | no | protocol default |
| `modelId` | string | yes | no | `gpt-4o-mini` |
| `workspace` | path | yes | no | `~/.keigent/workspace` |
| `skillsDir` | path | yes | no | `~/.keigent/skills` |
| `memoryDir` | path | yes | no | `~/.keigent/memory` |
| `headless` | boolean | yes | no | `false` |
| `maxIterations` | integer | yes | no | `12` |
| `maxChildRuns` | integer | yes | no | `1` |
| `maxToolCalls` | integer | yes | no | `20` |
| `maxTokenEstimate` | integer | yes | no | `64000` |
| `maxProviderCostUsd` | number \| `null` | yes | no | `null` |
| `modelPricing` | object \| `null` | yes | no | `null` |
| `maxWallTimeMs` | integer | yes | no | `120000` |
| `maxRecoveryAttempts` | integer | yes | no | `3` |

## 4. Precedence

Effective value order:

1. CLI/runtime override.
2. Generic environment variables.
3. Config file.
4. Defaults for non-secret fields only.

Generic environment variables:

```text
KEIGENT_API_KEY
KEIGENT_API_PROTOCOL
KEIGENT_BASE_URL
KEIGENT_MODEL_ID
```

`apiKey` resolution:

```text
runtime secret override > KEIGENT_API_KEY > config.json apiKey > missing error
```

Empty environment variables are treated as absent so they do not shadow a valid config file value.

Version compatibility:

- Current config schema version is `1`.
- Legacy config files without `configVersion` are resolved as version `1`.
- Future or unknown versions are reported by doctor as `configVersion.unsupported`; the loader does not silently reinterpret newer schemas.

## 5. Source-aware model

Future resolver should return metadata, not only values:

```ts
export interface ResolvedConfigField<T> {
  value: T;
  source: "cli" | "env" | "file" | "default" | "missing";
  redactedValue?: string;
  valid: boolean;
  issues: ConfigIssue[];
}
```

This prevents the UI from implying a saved file key or endpoint is active when an environment variable overrides it.

## 6. Security rules

- `apiKey` never logged raw.
- Redact recursively for keys matching `/key|token|secret|password|authorization/i`.
- Show `[MISSING]`, `[REDACTED]`, or optional fingerprint `[REDACTED:...abcd]`.
- Write config atomically with restrictive permissions where possible.
- Config page binds to `127.0.0.1` by default with a one-time token.
- Browser receives only secret presence/source/fingerprint metadata, never raw key.
- Remote non-HTTPS endpoints are rejected unless explicitly allowed for local/dev.
- `doctor --offline` performs no network calls.

## 7. CLI commands

### `keigent config init`

Interactive first-run setup. Creates directories, asks for protocol (`openai` or `anthropic`), asks for base URL with protocol defaults, prompts for missing API key unless `KEIGENT_API_KEY` exists, writes secure config, runs offline validation, offers online validation.

### `keigent config show`

Shows effective config, redacted values, and source for each field. Options: `--json`, `--file-only`, `--effective`.

### `keigent config set <key> <value>`

For `apiKey`, prefer secure hidden prompt; command-line secret values should warn or be rejected.

### `keigent config unset <key>`

Removes field from config file; explains resulting effective source.

### `keigent config path`

Prints active config path without creating it unless `--create` is passed.

### `keigent config edit`

Opens editor, validates after exit, offers rollback if invalid.

### `keigent doctor`

Modes: default/offline, `--online`, `--json`, `--fix`.

Checks config existence, parse, effective key, protocol validity, precedence, paths, permissions, URL validity, model ID, runtime budgets, provider cost ceiling, browser availability, and optional network/auth/model probe.

### `keigent config web`

Launches localhost config page with one-time token. Dangerous public bind requires explicit flag.

## 8. Web config page sections

1. Status summary: Ready / Needs attention / Invalid.
2. API credentials: missing/saved/env override/auth-failed states.
3. Protocol and endpoint: `apiProtocol`, `baseUrl`, `modelId`, endpoint warnings.
4. Paths: `workspace`, `skillsDir`, `memoryDir`, create/fix controls.
5. Runtime behavior: `headless`, `maxIterations`, `maxChildRuns`, `maxToolCalls`, `maxTokenEstimate`, `maxProviderCostUsd`, `modelPricing`, `maxWallTimeMs`, `maxRecoveryAttempts`.
6. Effective config/source table.
7. Doctor panel with offline/online/fix states.

## 9. Validation issue model

```ts
export interface ConfigIssue {
  code: string;
  severity: "info" | "warning" | "error";
  field?: keyof KeigentConfig;
  message: string;
  source?: "cli" | "env" | "file" | "default" | "missing";
  fix?: { label: string; action: string; safe: boolean };
}
```

Important codes:

```text
config.file.missing
config.file.invalid_json
config.file.permissions_open
configVersion.unsupported
apiKey.missing
apiKey.env_overrides_file
apiProtocol.invalid
baseUrl.invalid
baseUrl.insecure_remote
baseUrl.custom_endpoint
modelId.empty
workspace.missing
workspace.not_writable
workspace.too_broad
maxIterations.invalid
maxIterations.high
maxChildRuns.invalid
maxChildRuns.high
maxToolCalls.invalid
maxToolCalls.high
maxTokenEstimate.invalid
maxTokenEstimate.high
maxProviderCostUsd.invalid
modelPricing.invalid
modelPricing.missing_for_cost_budget
maxWallTimeMs.invalid
maxWallTimeMs.high
maxRecoveryAttempts.invalid
maxRecoveryAttempts.high
network.unreachable
auth.failed
model.unavailable
browser.unavailable
```

## 10. Acceptance standards

### CLI

- No hardcoded API key.
- No product-specific third-party relay provider is built into config defaults, commands, or UI labels.
- Missing key gives clear error and setup guidance using `KEIGENT_API_KEY`.
- `apiProtocol` supports exactly `openai` and `anthropic` in P0.
- `baseUrl` can be any valid HTTPS URL or localhost HTTP URL.
- `buildModel` maps `openai` to `openai-completions` and `anthropic` to `anthropic-messages`.
- `config show` never prints raw secret and shows source for each field.
- `config set apiKey` does not encourage shell-history leaks.
- `unset apiKey` respects `KEIGENT_API_KEY` if present.
- `doctor --offline` performs no network calls.
- `doctor --online` distinguishes network failure, auth failure, model unavailable, and success.
- JSON doctor output is machine-readable and redacted.

### Web config

- Launches on localhost with one-time token.
- Raw API key is never rendered or sent back to browser.
- Env override is explicit.
- Protocol choice is explicit: OpenAI-compatible or Anthropic-compatible.
- Custom endpoint URL is shown as a user-owned endpoint, not as a named relay integration.
- Invalid values are blocked before save.
- Online doctor requires explicit action.
- Fix actions show exactly what will change.
- Does not bind publicly without explicit danger flag.

### Validation

- Defaults allowed only for non-secret fields.
- `configVersion` must be `1`; missing legacy version is upgraded to `1` at resolution time.
- `apiKey` is effectively required.
- `apiProtocol` must be `openai` or `anthropic`.
- `baseUrl` must be valid URL.
- `modelId` non-empty.
- `headless` boolean.
- `maxIterations` bounded integer.
- `maxProviderCostUsd` must be `null` or a positive number; `null` means no provider cost ceiling.
- `modelPricing` must be `null` or non-negative `input`, `output`, `cacheRead`, and `cacheWrite` numbers in USD per million tokens.
- If `maxProviderCostUsd` is set while `modelPricing` is `null`, doctor warns with `modelPricing.missing_for_cost_budget`; provider cost ceilings only enforce priced usage.
- Paths valid, expanded, writable or fixable.

## 11. First implementation scope

P0:

- Provider-neutral `resolveConfig`, `redactConfig`, and `buildModel`.
- Tests for missing key, generic env precedence, empty env handling, OpenAI-compatible model mapping, Anthropic-compatible model mapping, and redaction.
- Source-aware validation and doctor data model.
- `keigent doctor --json` offline.

P1:

- `config show/set/unset/path`.
- Atomic write and permissions.
- Local web config shell.

P2:

- Online doctor.
- Full web config editor.
- Public-bind danger gate.
- Clean CLI bin shim at `packages/cli/bin/keigent.mjs`; it starts package-local `tsx` without `pnpm` / `npx` wrapper output, so machine-readable commands can emit pure JSON.
