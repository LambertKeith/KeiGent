export interface RunStorePayload {
  records: unknown[];
  errors: unknown[];
  migrationReport?: {
    schemaVersion: number;
    totalRecords: number;
    normalizedRecords: number;
    legacyRecords: number;
    unsupportedRecords: number;
    warnings: unknown[];
  };
}

export interface RunSessionPayload {
  id: string;
  status: "running";
  eventsHref: string;
}

export type RealWorldEvalReportPayload = unknown;

export type EventSourceConstructor = new (url: string) => EventSource;

export interface KeigentApiClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  eventSource?: EventSourceConstructor;
}

export interface KeigentApiClient {
  fetchRunStore(): Promise<RunStorePayload>;
  fetchLatestRealWorldEvalReport(datasetId: string): Promise<RealWorldEvalReportPayload>;
  startRun(goal: string): Promise<RunSessionPayload>;
  openRunEvents(runId: string): EventSource;
}

export function apiBaseUrlFromEnv(env: Record<string, unknown>): string | undefined {
  const raw = typeof env.VITE_KEIGENT_API_URL === "string" ? env.VITE_KEIGENT_API_URL.trim() : "";
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

export function createKeigentApiClient(options: KeigentApiClientOptions): KeigentApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetcher = options.fetcher ?? fetch;
  const EventSourceImpl = options.eventSource;

  return {
    async fetchRunStore() {
      const response = await fetcher(`${baseUrl}/api/runs`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Web API request failed: GET /api/runs ${response.status}`);
      }
      return await response.json() as RunStorePayload;
    },
    async fetchLatestRealWorldEvalReport(datasetId: string) {
      const response = await fetcher(`${baseUrl}/api/evals/real-world/${encodeURIComponent(datasetId)}/latest`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Web API request failed: GET /api/evals/real-world/${datasetId}/latest ${response.status}`);
      }
      return await response.json() as RealWorldEvalReportPayload;
    },
    async startRun(goal: string) {
      const response = await fetcher(`${baseUrl}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!response.ok) {
        throw new Error(`Web API request failed: POST /api/runs ${response.status}`);
      }
      return await response.json() as RunSessionPayload;
    },
    openRunEvents(runId: string) {
      const Source = EventSourceImpl ?? globalThis.EventSource;
      if (!Source) throw new Error("EventSource is not available in this environment");
      return new Source(`${baseUrl}/api/runs/${encodeURIComponent(runId)}/events`);
    },
  };
}
