import { parentPort, workerData } from "node:worker_threads";
import { executeDispatch } from "./dispatch.js";

const flag = new Int32Array(workerData.buffer as SharedArrayBuffer);
const outcome = await executeDispatch(workerData.message, {
  get requested() { return Atomics.load(flag, 0) !== 0; },
});
parentPort!.postMessage(outcome);
