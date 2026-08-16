/// <reference lib="webworker" />

import { runWasmSimulation } from "./wasmCore";
import { isWorkerRequest, type WorkerResponse } from "./protocol";

self.onmessage = async (event: MessageEvent<unknown>) => {
  if (!isWorkerRequest(event.data)) {
    const requestId = typeof event.data === "object" && event.data !== null
      && "requestId" in event.data && typeof event.data.requestId === "string"
      ? event.data.requestId
      : "";
    const response: WorkerResponse = { requestId, ok: false, error: "The simulation worker received an invalid request." };
    self.postMessage(response);
    return;
  }
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
