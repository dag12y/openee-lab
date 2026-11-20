import { maxSamples } from "../../../packages/engine-communications/src/index.js";
import { maxDispatchLength, unsuccessful, type ExecutionAdapter, type Outcome } from "../../../packages/simulation-core/src/dispatch.js";
import type { RunContext } from "../../../packages/contracts/src/index.js";

function checkOutcome(outcome: Outcome, expected: { sampleCount: number; sampleRateHz: number }): void {
  if (outcome.status !== "success") return;
  const { waveform, spectrum, sampleCount, sampleRateHz, startTimeSeconds } = outcome.outputs;
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > maxSamples ||
      sampleCount !== expected.sampleCount || sampleRateHz !== expected.sampleRateHz || startTimeSeconds !== 0) {
    throw new Error("Invalid output metadata");
  }
  const requested = outcome.provenance.requestedOutputs;
  const check = (buffer: unknown, size: number, needed: boolean) =>
    needed ? buffer instanceof Float64Array && buffer.length === size && buffer.every(Number.isFinite)
      : buffer === undefined;
  if (!check(waveform, sampleCount, requested.includes("waveform")) ||
      (waveform && outcome.outputUnits.waveform !== "V") ||
      (spectrum && outcome.outputUnits.spectrum !== "V") ||
      !check(spectrum?.peakAmplitude, Math.floor(sampleCount / 2) + 1, requested.includes("spectrum")) ||
      (requested.includes("spectrum") !== (spectrum !== undefined)) ||
      (spectrum && spectrum.binWidthHz !== sampleRateHz / sampleCount)) {
    throw new Error("Invalid output buffers");
  }
}

export function createBrowserExecution(
  createWorker = () => new Worker(new URL("./am.worker.ts", import.meta.url), { type: "module" }),
): { execute: ExecutionAdapter; dispose(): void } {
  let stop: (() => void) | undefined;
  let disposed = false;
  return {
    execute(message) {
      if (disposed || stop || message.length > maxDispatchLength) throw new Error("Worker unavailable");
      // Only the local controller supplies this message. The receiving worker validates it independently.
      const { runId, modelRevision, modelRef, engine, inputFingerprint, model } = JSON.parse(message) as RunContext & {
        model: { sampleCount: number; sampleRateHz: number };
      };
      const context = { runId, modelRevision, modelRef, engine, inputFingerprint: inputFingerprint! };
      const worker = createWorker();
      let timer: ReturnType<typeof setTimeout>;
      let settled = false;
      let cancel = () => {};
      const result = new Promise<Outcome>(resolve => {
        const finish = (outcome: Outcome) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          worker.onmessage = worker.onerror = worker.onmessageerror = null;
          worker.terminate();
          stop = undefined;
          resolve(outcome);
        };
        const fail = () => finish(unsuccessful("failed", context, "worker-failed", "The browser worker could not complete. Run again to retry."));
        cancel = () => finish(unsuccessful("cancelled", context, "worker-stopped", "Browser worker stopped."));
        stop = cancel;
        worker.onmessage = event => {
          try {
            const outcome = event.data as Outcome;
            checkOutcome(outcome, model);
            finish(outcome);
          } catch {
            fail();
          }
        };
        worker.onerror = fail;
        worker.onmessageerror = fail;
        timer = setTimeout(fail, 15_000);
        try { worker.postMessage(message); } catch { fail(); }
      });

      return { result, cancel };
    },
    dispose() { disposed = true; stop?.(); },
  };
}
