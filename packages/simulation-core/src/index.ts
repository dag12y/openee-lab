import { matchCapabilities, type RunContext } from "../../contracts/src/index.js";
import { amEngine, amEngineRef, amModelRef, type AmModel } from "../../engine-communications/src/index.js";
import { encodeDispatch, unsuccessful, type ExecutionAdapter, type Execution, type Outcome } from "./dispatch.js";

export type RunRecord = Readonly<{
  context: RunContext;
  requestedOutputs: readonly string[];
  status: "validating" | "queued" | "running" | Outcome["status"];
  dispatched: boolean;
  cancellationRequested: boolean;
  outcome?: Outcome;
}>;

let nextRun = 0;

export class RunController {
  #revision = 0;
  #latest: string | undefined;
  #records = new Map<string, RunRecord>();
  #waiters = new Map<string, Array<(outcome: Outcome) => void>>();
  #active = new Map<string, Execution>();

  constructor(private readonly execute: ExecutionAdapter) {}

  get revision(): string { return String(this.#revision); }
  get history(): readonly RunRecord[] { return [...this.#records.values()]; }
  get current(): Extract<Outcome, { status: "success" }> | undefined {
    const latest = this.#latest === undefined ? undefined : this.#records.get(this.#latest);
    return latest?.context.modelRevision === this.revision && latest.outcome?.status === "success"
      ? latest.outcome : undefined;
  }

  completed(runId: string): Promise<Outcome> {
    const run = this.#records.get(runId);
    if (!run) return Promise.reject(new RangeError("Unknown run ID"));
    if (run.outcome) return Promise.resolve(run.outcome);
    return new Promise(resolve => {
      const waiters = this.#waiters.get(runId) ?? [];
      waiters.push(resolve);
      this.#waiters.set(runId, waiters);
    });
  }

  edit(): void {
    this.#supersedeQueued();
    this.#revision++;
    this.#latest = undefined;
  }

  submit(model: AmModel, outputs: readonly string[]): string {
    this.#supersedeQueued();
    const runId = String(++nextRun);
    this.#latest = runId;
    const context = Object.freeze({ runId, modelRevision: this.revision, modelRef: amModelRef, engine: amEngineRef });
    // Bound the list before copying caller-owned data.
    const bounded = outputs.length >= 1 && outputs.length <= 2 &&
      Array.from(outputs).every(kind => typeof kind === "string" && kind.length <= 128);
    const requestedOutputs = Object.freeze(bounded ? [...outputs] : []);
    this.#set(runId, { context, requestedOutputs, status: "validating", dispatched: false, cancellationRequested: false });
    try {
      if (!bounded || matchCapabilities(amEngine.capabilities, amEngineRef, amModelRef, requestedOutputs) !== "supported") {
        this.#finish(runId, unsuccessful("rejected", context, "unsupported-output", "Request waveform, spectrum, or both."));
        return runId;
      }
      const validation = amEngine.validate(model, amModelRef);
      if (!validation.ok) {
        this.#finish(runId, { status: "rejected", context, diagnostics: validation.diagnostics });
        return runId;
      }
      const snapshotContext = Object.freeze({ ...context, inputFingerprint: validation.input.inputFingerprint });
      const message = encodeDispatch(snapshotContext, validation.input.model, requestedOutputs);
      this.#set(runId, { ...this.#records.get(runId)!, context: snapshotContext, status: "queued" });
      queueMicrotask(() => void this.#dispatch(runId, message));
    } catch {
      this.#finish(runId, unsuccessful("failed", context, "validation-failed", "Run preparation failed."));
    }
    return runId;
  }

  cancel(runId: string): void {
    const run = this.#records.get(runId);
    if (!run || run.outcome || run.cancellationRequested) return;
    this.#set(runId, { ...run, cancellationRequested: true });
    if (run.status === "queued") {
      this.#finish(runId, unsuccessful("cancelled", run.context, "cancelled", "Queued run cancelled."));
    } else if (run.status === "running") {
      try {
        this.#active.get(runId)?.cancel();
      } catch {
        this.#finish(runId, unsuccessful("failed", run.context, "execution-failed", "Cancellation delivery failed."));
      }
    }
  }

  #supersedeQueued(): void {
    if (this.#latest !== undefined && this.#records.get(this.#latest)?.status === "queued") this.cancel(this.#latest);
  }

  #set(runId: string, run: RunRecord): void {
    this.#records.set(runId, Object.freeze(run));
  }

  #finish(runId: string, candidate: Outcome): void {
    const run = this.#records.get(runId)!;
    if (run.outcome) return;
    const outcome = Object.freeze(candidate);
    this.#active.delete(runId);
    this.#set(runId, { ...run, status: outcome.status, outcome });
    const waiters = this.#waiters.get(runId);
    this.#waiters.delete(runId);
    for (const resolve of waiters ?? []) resolve(outcome);
  }

  async #dispatch(runId: string, message: string): Promise<void> {
    const run = this.#records.get(runId)!;
    if (run.status !== "queued") return;
    this.#set(runId, { ...run, status: "running", dispatched: true });
    try {
      const execution = this.execute(message);
      this.#active.set(runId, execution);
      const outcome = await execution.result;
      if (!["success", "rejected", "cancelled", "failed"].includes(outcome.status)) {
        throw new Error("Invalid outcome status");
      }
      const expected = run.context;
      const actual = outcome.status === "success" ? outcome.provenance : outcome.context;
      if (actual.runId !== expected.runId || actual.modelRevision !== expected.modelRevision ||
          actual.engine.engineId !== expected.engine.engineId ||
          actual.engine.engineVersion !== expected.engine.engineVersion ||
          actual.modelRef.domain !== expected.modelRef.domain || actual.modelRef.kind !== expected.modelRef.kind ||
          actual.modelRef.modelVersion !== expected.modelRef.modelVersion ||
          (actual.inputFingerprint !== expected.inputFingerprint &&
            !(outcome.status === "rejected" && actual.inputFingerprint === undefined)) ||
          (outcome.status === "success" &&
            (outcome.provenance.requestedOutputs.length !== run.requestedOutputs.length ||
              !run.requestedOutputs.every((kind, i) => kind === outcome.provenance.requestedOutputs[i]))) ||
          (outcome.status !== "success" && ("outputs" in outcome || "outputUnits" in outcome))) {
        throw new Error("Invalid response association");
      }
      this.#finish(runId, outcome);
    } catch {
      this.#finish(runId, unsuccessful("failed", run.context, "execution-failed", "Execution adapter failed or returned a mismatched response."));
    }
  }
}
