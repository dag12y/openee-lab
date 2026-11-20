import assert from "node:assert/strict";
import test from "node:test";
import { amEngine, amEngineRef, amModelRef } from "../../engine-communications/src/index.js";
import { encodeDispatch, executeDispatch, unsuccessful, type ExecutionAdapter, type Outcome } from "./dispatch.js";
import { RunController } from "./index.js";
import { nodeExecutionAdapter } from "./node-adapter.js";

const model = {
  carrierAmplitude: 2, modulationIndex: 0.5, messageFrequencyHz: 1,
  carrierFrequencyHz: 2, sampleRateHz: 8, sampleCount: 8,
};
const token = { requested: false };
const outputs = ["waveform", "spectrum"];

function wire() {
  const validation = amEngine.validate(model, amModelRef);
  assert.ok(validation.ok);
  return encodeDispatch({
    runId: "run", modelRevision: "revision", modelRef: amModelRef, engine: amEngineRef,
    inputFingerprint: validation.input.inputFingerprint,
  }, model, outputs);
}

function controlled() {
  const tasks: Array<{
    resolve: (outcome: Outcome) => void; actual: Promise<Outcome>; cancellation: boolean;
  }> = [];
  const controller = new RunController(message => {
    let resolve!: (outcome: Outcome) => void;
    const promise = new Promise<Outcome>(complete => { resolve = complete; });
    const task = { resolve, actual: executeDispatch(message, token), cancellation: false };
    tasks.push(task);
    return { result: promise, cancel: () => { task.cancellation = true; } };
  });
  return { controller, tasks };
}

function currentId(controller: RunController) {
  return controller.current?.provenance.runId;
}

function inspect(controller: RunController, id: string) {
  const record = controller.history.find(run => run.context.runId === id);
  assert.ok(record);
  return record;
}

test("Node worker runs validated snapshots repeatedly with matching provenance", async () => {
  const execute = nodeExecutionAdapter();
  const results: Outcome[] = [];
  const controller = new RunController(message => {
    const execution = execute(message);
    void execution.result.then(outcome => results.push(outcome)).catch(() => {});
    return execution;
  });
  const source = { ...model, modulationIndex: -0 };
  const first = controller.submit(source, outputs);
  source.carrierAmplitude = 99;
  await controller.completed(first);
  const second = controller.submit({ ...model, modulationIndex: -0 }, outputs);
  await controller.completed(second);
  const [a, b] = results;
  assert.ok(a?.status === "success" && b?.status === "success");
  assert.equal(a.outputs.waveform?.[0], 2);
  assert.equal(a.provenance.runId, first);
  assert.equal(b.provenance.runId, second);
  assert.equal(a.provenance.inputFingerprint, b.provenance.inputFingerprint);
  assert.deepEqual(a.outputs, b.outputs);
  assert.equal(currentId(controller), second);
});

test("dispatch rejects invalid model, version, capability, fingerprint and structure", async () => {
  const base = JSON.parse(wire());
  const cases: [unknown, string][] = [
    [JSON.stringify({ ...base, model: { ...model, sampleRateHz: 0 } }), "am.invalid-sampling"],
    [JSON.stringify({ ...base, model: { ...model, sampleCount: 2049 } }), "am.resource-limit"],
    [JSON.stringify({ ...base, modelRef: { ...amModelRef, modelVersion: "2" } }), "run.unsupported-model"],
    [JSON.stringify({ ...base, engine: { ...amEngineRef, engineVersion: "2" } }), "run.unsupported-engine"],
    [JSON.stringify({ ...base, outputs: ["psd"] }), "run.unsupported-output"],
    [JSON.stringify({ ...base, inputFingerprint: "wrong" }), "run.fingerprint-mismatch"],
    [JSON.stringify({ ...base, model: { ...model, carrierAmplitude: [[[2]]] } }), "run.invalid-dispatch"],
    [" ".repeat(4097), "run.invalid-dispatch"],
    [{}, "run.invalid-dispatch"],
  ];
  for (const [input, code] of cases) {
    const outcome = await executeDispatch(input, token);
    assert.equal(outcome.status, "rejected");
    assert.equal(outcome.diagnostics[0]?.code, code);
    assert.equal(Object.hasOwn(outcome, "outputs"), false);
  }
  const outcome = await nodeExecutionAdapter()(cases[0]![0] as string).result;
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.diagnostics[0]?.code, "am.invalid-sampling");
});

test("queued cancellation and supersession prevent dispatch", async () => {
  const { controller, tasks } = controlled();
  const cancelled = controller.submit(model, outputs);
  assert.equal(inspect(controller, cancelled).status, "queued");
  controller.cancel(cancelled);
  controller.cancel(cancelled);
  const superseded = controller.submit(model, outputs);
  const latest = controller.submit(model, outputs);
  await Promise.resolve();
  assert.equal(tasks.length, 1);
  assert.equal(inspect(controller, latest).status, "running");
  for (const id of [cancelled, superseded]) {
    const record = inspect(controller, id);
    assert.equal(record.status, "cancelled");
    assert.equal(record.dispatched, false);
    assert.equal(Object.hasOwn(record.outcome!, "outputs"), false);
  }
  tasks[0]!.resolve(await tasks[0]!.actual);
});

test("editing clears eligibility and different revisions can finish out of order", async () => {
  const { controller, tasks } = controlled();
  const old = controller.submit(model, outputs);
  await Promise.resolve();
  controller.edit();
  assert.equal(currentId(controller), undefined);
  const latest = controller.submit(model, outputs);
  await Promise.resolve();
  tasks[1]!.resolve(await tasks[1]!.actual);
  await Promise.resolve();
  assert.equal(currentId(controller), latest);
  tasks[0]!.resolve(await tasks[0]!.actual);
  await Promise.resolve();
  assert.equal(inspect(controller, old).status, "success");
  assert.equal(currentId(controller), latest);
  controller.edit();
  assert.equal(currentId(controller), undefined);
});

test("latest run wins within a revision even when it fails", async () => {
  const { controller, tasks } = controlled();
  const old = controller.submit(model, outputs);
  await Promise.resolve();
  tasks[0]!.resolve(await tasks[0]!.actual);
  await Promise.resolve();
  assert.equal(currentId(controller), old);
  const slow = controller.submit(model, outputs);
  await Promise.resolve();
  const newer = controller.submit(model, outputs);
  await Promise.resolve();
  assert.equal(currentId(controller), undefined);
  assert.equal(inspect(controller, old).context.modelRevision, inspect(controller, newer).context.modelRevision);
  tasks[2]!.resolve(unsuccessful("failed", inspect(controller, newer).context, "test", "Failure"));
  await Promise.resolve();
  tasks[1]!.resolve(await tasks[1]!.actual);
  await Promise.resolve();
  assert.equal(inspect(controller, slow).status, "success");
  assert.equal(inspect(controller, newer).status, "failed");
  assert.equal(currentId(controller), undefined);
});

test("old cancellation is acknowledged explicitly and a late response cannot replace it", async () => {
  const { controller, tasks } = controlled();
  const old = controller.submit(model, outputs);
  await Promise.resolve();
  const latest = controller.submit(model, outputs);
  await Promise.resolve();
  controller.cancel(old);
  assert.equal(tasks[0]!.cancellation, true);
  assert.equal(inspect(controller, old).status, "running");
  tasks[0]!.resolve(unsuccessful("cancelled", inspect(controller, old).context, "test", "Acknowledged"));
  await Promise.resolve();
  tasks[0]!.resolve(await tasks[0]!.actual);
  tasks[1]!.resolve(await tasks[1]!.actual);
  await Promise.resolve();
  assert.equal(inspect(controller, old).status, "cancelled");
  assert.equal(currentId(controller), latest);
});

test("a dispatched Node worker observes cancellation through shared memory", async () => {
  const workerModule = new URL("./node-worker.js", import.meta.url).href;
  // Hold worker entry until cancellation is delivered, then run the actual worker code.
  const entry = new URL("data:text/javascript," + encodeURIComponent(`
    import { workerData } from "node:worker_threads";
    Atomics.wait(new Int32Array(workerData.buffer), 0, 0);
    await import(${JSON.stringify(workerModule)});
  `));
  const controller = new RunController(nodeExecutionAdapter(entry));
  const id = controller.submit(model, outputs);
  await Promise.resolve();
  assert.equal(inspect(controller, id).status, "running");
  controller.cancel(id);
  assert.equal(inspect(controller, id).status, "running");
  const outcome = await controller.completed(id);
  assert.equal(outcome.status, "cancelled");
  assert.equal(Object.hasOwn(outcome, "outputs"), false);
});

test("worker exception becomes failure despite pending cancellation and next run recovers", async () => {
  let first = true;
  const crash = nodeExecutionAdapter(new URL("data:text/javascript,throw%20new%20Error('test')"));
  const execute = nodeExecutionAdapter();
  const adapter: ExecutionAdapter = message => {
    if (!first) return execute(message);
    first = false;
    return crash(message);
  };
  const controller = new RunController(adapter);
  const id = controller.submit(model, outputs);
  await Promise.resolve();
  controller.cancel(id);
  const outcome = await controller.completed(id);
  assert.equal(outcome.status, "failed");
  assert.equal(Object.hasOwn(outcome, "outputs"), false);
  const recovery = controller.submit(model, outputs);
  assert.equal((await controller.completed(recovery)).status, "success");
});

test("controller refuses a response correlated to a different run", async () => {
  const controller = new RunController(() => ({ result: executeDispatch(wire(), token), cancel() {} }));
  const id = controller.submit(model, outputs);
  const outcome = await controller.completed(id);
  assert.equal(outcome.status, "failed");
  assert.equal(currentId(controller), undefined);
});
