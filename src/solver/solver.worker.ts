/// <reference lib="webworker" />

import { runWasmSimulation } from "./wasmCore";
import type { WorkerRequest, WorkerResponse } from "./protocol";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { requestId, config } = event.data;
  try {
    const result = await runWasmSimulation(config);
    const response: WorkerResponse = { requestId, ok: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = { requestId, ok: false, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
};

export {};
