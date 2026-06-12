import { describe, expect, it, vi } from "vitest";
import {
  apiBaseUrlFromEnv,
  createKeigentApiClient,
  type EventSourceConstructor,
} from "../api/client.js";

describe("Workbench API client", () => {
  it("derives the API base URL from Vite environment values", () => {
    expect(apiBaseUrlFromEnv({ VITE_KEIGENT_API_URL: " http://127.0.0.1:5174/ " })).toBe("http://127.0.0.1:5174");
    expect(apiBaseUrlFromEnv({ VITE_KEIGENT_API_URL: "   " })).toBeUndefined();
    expect(apiBaseUrlFromEnv({})).toBeUndefined();
  });

  it("fetches run records from the local Web API", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      records: [{ id: "run_web", status: "succeeded" }],
      errors: [],
      migrationReport: {
        schemaVersion: 1,
        totalRecords: 1,
        normalizedRecords: 0,
        legacyRecords: 0,
        unsupportedRecords: 0,
        warnings: [],
      },
    }), { status: 200 }));
    const client = createKeigentApiClient({ baseUrl: "http://127.0.0.1:5174", fetcher });

    const store = await client.fetchRunStore();

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:5174/api/runs", expect.objectContaining({
      headers: { accept: "application/json" },
    }));
    expect(store).toMatchObject({
      records: [{ id: "run_web" }],
      errors: [],
      migrationReport: {
        schemaVersion: 1,
        totalRecords: 1,
        warnings: [],
      },
    });
  });

  it("fetches the latest real-world eval report from the local Web API", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      datasetId: "local-real-task-v1",
      cases: [{ id: "replay-report", runId: "run_replay-report" }],
    }), { status: 200 }));
    const client = createKeigentApiClient({ baseUrl: "http://127.0.0.1:5174", fetcher });

    const report = await client.fetchLatestRealWorldEvalReport("local-real-task-v1");

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:5174/api/evals/real-world/local-real-task-v1/latest", expect.objectContaining({
      headers: { accept: "application/json" },
    }));
    expect(report).toMatchObject({
      datasetId: "local-real-task-v1",
      cases: [{ id: "replay-report", runId: "run_replay-report" }],
    });
  });

  it("starts a web run through the local Web API", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "web_123",
      status: "running",
      eventsHref: "/api/runs/web_123/events",
    }), { status: 202 }));
    const client = createKeigentApiClient({ baseUrl: "http://127.0.0.1:5174", fetcher });

    const session = await client.startRun("Inspect the repo");

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:5174/api/runs", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ goal: "Inspect the repo" }),
    }));
    expect(session).toEqual({
      id: "web_123",
      status: "running",
      eventsHref: "/api/runs/web_123/events",
    });
  });

  it("opens an EventSource stream for run progress", () => {
    const opened: string[] = [];
    const EventSourceFake: EventSourceConstructor = class {
      constructor(url: string) {
        opened.push(url);
      }
    } as EventSourceConstructor;
    const client = createKeigentApiClient({
      baseUrl: "http://127.0.0.1:5174",
      eventSource: EventSourceFake,
    });

    client.openRunEvents("web_123");

    expect(opened).toEqual(["http://127.0.0.1:5174/api/runs/web_123/events"]);
  });

  it("fails loudly when the local Web API rejects a request", async () => {
    const client = createKeigentApiClient({
      baseUrl: "http://127.0.0.1:5174",
      fetcher: async () => new Response("missing", { status: 404 }),
    });

    await expect(client.fetchRunStore()).rejects.toThrow("Web API request failed: GET /api/runs 404");
  });

  it("fails loudly when the latest real-world eval report is missing", async () => {
    const client = createKeigentApiClient({
      baseUrl: "http://127.0.0.1:5174",
      fetcher: async () => new Response("missing", { status: 404 }),
    });

    await expect(client.fetchLatestRealWorldEvalReport("missing")).rejects.toThrow("Web API request failed: GET /api/evals/real-world/missing/latest 404");
  });
});
