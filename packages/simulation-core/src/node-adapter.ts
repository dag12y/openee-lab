import { Worker } from "node:worker_threads";
import { maxDispatchLength, type ExecutionAdapter, type Outcome } from "./dispatch.js";

export function nodeExecutionAdapter(entry = new URL("./node-worker.js", import.meta.url)): ExecutionAdapter {
  return message => {
    if (typeof message !== "string" || message.length > maxDispatchLength) {
      throw new TypeError("Dispatch exceeds transport bounds");
    }
    const flag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const worker = new Worker(entry, { workerData: { message, buffer: flag.buffer } });
    const result = new Promise<Outcome>((resolve, reject) => {
      worker.once("message", (outcome: Outcome) => {
        resolve(outcome);
        void worker.terminate().catch(() => {});
      });
      worker.once("error", reject);
      worker.once("exit", () => reject(new Error("Worker exited without a response")));
    });
    return { result, cancel: () => { Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); } };
  };
}
