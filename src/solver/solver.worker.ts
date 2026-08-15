/// <reference lib="webworker" />

import { runWasmSimulation } from "./wasmCore";
import type { OptothermalConfig } from "./types";

interface WorkerRequest {
  requestId: string;
  config: OptothermalConfig;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { requestId, config } = event.data;
  try {
    const result = await runWasmSimulation(config);
    self.postMessage({ requestId, ok: true, result });
  } catch (error) {
    self.postMessage({ requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
