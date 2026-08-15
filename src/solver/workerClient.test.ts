import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import type { OptothermalResult } from "./types";
import { cancelActiveSimulation, runSimulation } from "./workerClient";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  request: { requestId: string } | undefined;
  postError: unknown;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: { requestId: string }) {
    if (this.postError) throw this.postError;
    this.request = request;
  }

  terminate() {
    this.terminated = true;
  }
}

describe("optothermal worker client", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    cancelActiveSimulation();
    vi.unstubAllGlobals();
  });

  it("settles every cancelled run with AbortError", async () => {
    for (let index = 0; index < 100; index += 1) {
      const promise = runSimulation(VO2_REFERENCE_CONFIG);
      expect(cancelActiveSimulation()).toBe(true);
      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    }
    expect(FakeWorker.instances).toHaveLength(100);
    expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(true);
  });

  it("ignores a stale result after a replacement run", async () => {
    const firstPromise = runSimulation(VO2_REFERENCE_CONFIG);
    const first = FakeWorker.instances[0];
    const secondPromise = runSimulation(VO2_REFERENCE_CONFIG);
    const second = FakeWorker.instances[1];
    await expect(firstPromise).rejects.toMatchObject({ name: "AbortError" });

    first.onmessage?.({ data: { requestId: first.request?.requestId, ok: true, result: {} } } as MessageEvent);
    const expected = { engine: "Rust/WASM" } as OptothermalResult;
    second.onmessage?.({ data: { requestId: second.request?.requestId, ok: true, result: expected } } as MessageEvent);

    await expect(secondPromise).resolves.toBe(expected);
    expect(first.terminated).toBe(true);
    expect(second.terminated).toBe(true);
  });
});
