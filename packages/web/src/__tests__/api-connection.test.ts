import { describe, expect, it } from "vitest";
import { createApiConnectionMonitor, resolveApiConnectionState } from "../api/connection.js";
import type { KeigentApiClient } from "../api/client.js";

describe("Workbench API connection state", () => {
  it("marks the API connected only when the health endpoint returns ok", async () => {
    const client = clientWithHealth({ status: "ok", service: "keigent-web-api" });

    await expect(resolveApiConnectionState(client, "http://127.0.0.1:5174")).resolves.toMatchObject({
      configured: true,
      connected: true,
      baseUrl: "http://127.0.0.1:5174",
      health: {
        status: "ok",
        service: "keigent-web-api",
      },
    });
  });

  it("keeps Chat and Settings disconnected when the health request fails", async () => {
    const client = clientWithHealth(new Error("connect ECONNREFUSED 127.0.0.1:5174"));

    await expect(resolveApiConnectionState(client, "http://127.0.0.1:5174")).resolves.toMatchObject({
      configured: true,
      connected: false,
      baseUrl: "http://127.0.0.1:5174",
      error: "connect ECONNREFUSED 127.0.0.1:5174",
    });
  });

  it("marks the API unconfigured when no API client exists", async () => {
    await expect(resolveApiConnectionState(undefined, undefined)).resolves.toEqual({
      configured: false,
      connected: false,
    });
  });

  it("caches health checks so repeated render refreshes do not hit the API", async () => {
    let calls = 0;
    let now = 1000;
    const client = clientWithHealthFactory(async () => {
      calls++;
      return { status: "ok", service: "keigent-web-api" };
    });
    const monitor = createApiConnectionMonitor(client, "http://127.0.0.1:5174", {
      cacheMs: 1000,
      now: () => now,
    });

    await expect(monitor.refresh()).resolves.toMatchObject({ connected: true });
    await expect(monitor.refresh()).resolves.toMatchObject({ connected: true });
    now = 2500;
    await expect(monitor.refresh()).resolves.toMatchObject({ connected: true });

    expect(calls).toBe(2);
  });

  it("reuses the in-flight health request for concurrent refreshes", async () => {
    let calls = 0;
    let resolveHealth: ((value: { status: string; service: string }) => void) | undefined;
    const client = clientWithHealthFactory(async () => {
      calls++;
      return await new Promise((resolve) => {
        resolveHealth = resolve;
      });
    });
    const monitor = createApiConnectionMonitor(client, "http://127.0.0.1:5174", {
      cacheMs: 1000,
      now: () => 1000,
    });

    const first = monitor.refresh();
    const second = monitor.refresh();
    resolveHealth?.({ status: "ok", service: "keigent-web-api" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ connected: true }),
      expect.objectContaining({ connected: true }),
    ]);
    expect(calls).toBe(1);
  });
});

function clientWithHealth(result: Awaited<ReturnType<KeigentApiClient["fetchHealth"]>> | Error): KeigentApiClient {
  return clientWithHealthFactory(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
}

function clientWithHealthFactory(fetchHealth: KeigentApiClient["fetchHealth"]): KeigentApiClient {
  return {
    fetchHealth,
    async fetchRunStore() {
      throw new Error("fetchRunStore should not be called");
    },
    async fetchLatestRealWorldEvalReport() {
      throw new Error("fetchLatestRealWorldEvalReport should not be called");
    },
    async startRun() {
      throw new Error("startRun should not be called");
    },
    openRunEvents() {
      throw new Error("openRunEvents should not be called");
    },
  };
}
