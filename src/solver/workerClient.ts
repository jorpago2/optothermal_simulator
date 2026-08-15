import type { OptothermalConfig, OptothermalResult } from "./types";

interface WorkerRequest {
  requestId: string;
  config: OptothermalConfig;
}

interface WorkerResponse {
  requestId: string;
  ok: boolean;
  result?: OptothermalResult;
  error?: string;
}

interface ActiveRun {
  requestId: string;
  worker: Worker;
  reject: (reason?: unknown) => void;
}

let activeRun: ActiveRun | undefined;
let requestSequence = 0;

function nextRequestId(): string {
  requestSequence += 1;
  return `optothermal-${requestSequence}`;
}

function abortError(): DOMException {
  return new DOMException("Simulation cancelled.", "AbortError");
}

export function cancelActiveSimulation(): boolean {
  const current = activeRun;
  if (!current) return false;
  activeRun = undefined;
  current.worker.terminate();
  current.reject(abortError());
  return true;
}

export function runSimulation(config: OptothermalConfig): Promise<OptothermalResult> {
  cancelActiveSimulation();
  const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  const requestId = nextRequestId();
  return new Promise((resolve, reject) => {
    const finish = (callback: () => void) => {
      if (activeRun?.requestId !== requestId) return;
      activeRun = undefined;
      worker.terminate();
      callback();
    };
    activeRun = { requestId, worker, reject };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      finish(() => {
        if (event.data.ok && event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.error ?? "The simulation worker failed."));
      });
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "The simulation worker failed.")));
    };
    try {
      const request: WorkerRequest = { requestId, config };
      worker.postMessage(request);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
