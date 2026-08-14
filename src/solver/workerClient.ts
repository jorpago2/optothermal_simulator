import type { OptothermalConfig, OptothermalResult } from "./types";

interface WorkerResponse {
  ok: boolean;
  result?: OptothermalResult;
  error?: string;
}

let activeWorker: Worker | undefined;

export function cancelActiveSimulation() {
  activeWorker?.terminate();
  activeWorker = undefined;
}

export function runSimulation(config: OptothermalConfig): Promise<OptothermalResult> {
  cancelActiveSimulation();
  const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  activeWorker = worker;
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (activeWorker === worker) activeWorker = undefined;
      if (event.data.ok && event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? "The simulation worker failed."));
    };
    worker.onerror = (event) => {
      worker.terminate();
      if (activeWorker === worker) activeWorker = undefined;
      reject(new Error(event.message || "The simulation worker failed."));
    };
    worker.postMessage(config);
  });
}
