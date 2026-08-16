import type { OptothermalConfig, OptothermalResult } from "./types";
import { isWorkerResponse, type WorkerRequest } from "./protocol";

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
  const requestId = nextRequestId();
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }
    const finish = (callback: () => void) => {
      if (activeRun?.requestId !== requestId) return;
      activeRun = undefined;
      worker.terminate();
      callback();
    };
    activeRun = { requestId, worker, reject };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (activeRun?.requestId !== requestId) return;
      if (!isWorkerResponse(event.data)) {
        finish(() => reject(new Error("The simulation worker returned an invalid response.")));
        return;
      }
      const response = event.data;
      if (response.requestId !== requestId) return;
      finish(() => {
        if (response.ok) resolve(response.result);
        else reject(new Error(response.error));
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
