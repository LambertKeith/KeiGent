import type { ApiHealthPayload, KeigentApiClient } from "./client.js";

export interface ApiConnectionState {
  configured: boolean;
  connected: boolean;
  baseUrl?: string;
  health?: ApiHealthPayload;
  error?: string;
}

export interface ApiConnectionMonitor {
  state(): ApiConnectionState;
  refresh(options?: { force?: boolean }): Promise<ApiConnectionState>;
}

export interface ApiConnectionMonitorOptions {
  cacheMs?: number;
  now?: () => number;
}

export async function resolveApiConnectionState(
  client: KeigentApiClient | undefined,
  baseUrl: string | undefined,
): Promise<ApiConnectionState> {
  if (!client) return { configured: false, connected: false };

  try {
    const health = await client.fetchHealth();
    return {
      configured: true,
      connected: health.status === "ok",
      ...(baseUrl ? { baseUrl } : {}),
      health,
      ...(health.status === "ok" ? {} : { error: `Unexpected health status: ${health.status}` }),
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      ...(baseUrl ? { baseUrl } : {}),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createApiConnectionMonitor(
  client: KeigentApiClient | undefined,
  baseUrl: string | undefined,
  options: ApiConnectionMonitorOptions = {},
): ApiConnectionMonitor {
  const cacheMs = options.cacheMs ?? 5000;
  const now = options.now ?? (() => Date.now());
  let cached: ApiConnectionState = {
    configured: Boolean(client),
    connected: false,
    ...(baseUrl ? { baseUrl } : {}),
  };
  let lastCheckedAt = 0;
  let inFlight: Promise<ApiConnectionState> | undefined;

  return {
    state() {
      return cached;
    },
    async refresh(refreshOptions = {}) {
      if (!refreshOptions.force && lastCheckedAt > 0 && now() - lastCheckedAt < cacheMs) return cached;
      if (inFlight) return await inFlight;

      inFlight = resolveApiConnectionState(client, baseUrl)
        .then((state) => {
          cached = state;
          lastCheckedAt = now();
          return cached;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return await inFlight;
    },
  };
}
