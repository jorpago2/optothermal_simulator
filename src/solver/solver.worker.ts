/// <reference lib="webworker" />

import { runWasmSimulation } from "./wasmCore";
import type { OptothermalConfig } from "./types";

self.onmessage = async (event: MessageEvent<OptothermalConfig>) => {
  try {
    const result = await runWasmSimulation(event.data);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
