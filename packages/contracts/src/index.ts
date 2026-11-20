export type ModelRef = Readonly<{ domain: string; kind: string; modelVersion: string }>;
export type EngineRef = Readonly<{ engineId: string; engineVersion: string }>;
export type Quantity = Readonly<{ value: number; unit: string }>;
export type Sampling = Readonly<{ sampleRate: Quantity; sampleCount: number; startTime: Quantity }>;
export type Diagnostic = Readonly<{
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  location?: Readonly<{ elementId?: string; portId?: string; field?: string }>;
  remedy?: string;
}>;

type SnapshotData = null | boolean | number | string |
  readonly SnapshotData[] | { readonly [key: string]: SnapshotData };
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

type ResolvedInput<Model extends SnapshotData> = Readonly<{
  modelRef: ModelRef;
  model: Model;
  sampling?: Sampling;
  assumptions: readonly string[];
}>;

declare const validated: unique symbol;
export type ValidatedInput<Model extends SnapshotData> = DeepReadonly<ResolvedInput<Model>> &
  Readonly<{ inputFingerprint: string; [validated]: true }>;

const snapshots = new WeakSet<object>();

// The identity encodes the copied data directly. Sorted record keys and an
// explicit negative-zero representation avoid lossy JSON normalization.
function copyData(value: unknown, ancestors: Set<object>): { data: SnapshotData; key: string } {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return { data: value, key: JSON.stringify(value) };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { data: value, key: Object.is(value, -0) ? "-0" : JSON.stringify(value) };
  }
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new TypeError("Expected acyclic finite snapshot data");
  }
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Expected plain records or dense arrays");
  }
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) throw new TypeError("Expected a dense array");
  const fields = keys.flatMap(key => {
    if (array && key === "length") return [];
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor) ||
        (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
      throw new TypeError("Expected enumerable snapshot data fields");
    }
    return [{ name: key, ...copyData(descriptor.value, ancestors) }];
  });
  ancestors.delete(value);
  if (array) {
    return { data: Object.freeze(fields.map(field => field.data)),
      key: "[" + fields.map(field => field.key).join(",") + "]" };
  }
  fields.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    data: Object.freeze(Object.fromEntries(fields.map(field => [field.name, field.data]))),
    key: "{" + fields.map(field => JSON.stringify(field.name) + ":" + field.key).join(",") + "}",
  };
}

/** Called by a trusted built-in immediately after resolving and validating domain input. */
export function createValidatedInput<Model extends SnapshotData>(
  input: ResolvedInput<Model>,
): ValidatedInput<Model> {
  // Pick the defined fields so callers cannot supply an identity or extra envelope fields.
  const { modelRef, model, sampling, assumptions } = input;
  const { data, key } = copyData({
    modelRef, model, ...(sampling === undefined ? {} : { sampling }), assumptions,
  }, new Set());
  const snapshot = Object.freeze({ ...(data as object), inputFingerprint: "t06-v1:" + key });
  snapshots.add(snapshot);
  return snapshot as ValidatedInput<Model>;
}

export type RunId = string;
export type ModelRevision = string;
export type OutputKind = string;
export type Cancellation = Readonly<{ requested: boolean }>;
export type RunContext = Readonly<{
  runId: RunId;
  modelRevision: ModelRevision;
  modelRef: ModelRef;
  engine: EngineRef;
  inputFingerprint?: string;
}>;
export type RunRequest<Model extends SnapshotData> = Readonly<{
  runId: RunId;
  modelRevision: ModelRevision;
  engine: EngineRef;
  input: ValidatedInput<Model>;
  requestedOutputs: readonly OutputKind[];
}>;
export type RunProvenance = RunContext & Readonly<{
  inputFingerprint: string;
  sampling?: Sampling;
  assumptions: readonly string[];
  requestedOutputs: readonly OutputKind[];
}>;

export function provenanceFor<Model extends SnapshotData>(
  request: RunRequest<Model>,
): RunProvenance {
  const { input, runId, modelRevision, engine, requestedOutputs } = request;
  if (!snapshots.has(input)) throw new TypeError("Expected a locally validated snapshot");
  return Object.freeze({
    runId, modelRevision, engine: Object.freeze({ ...engine }),
    modelRef: input.modelRef, inputFingerprint: input.inputFingerprint,
    ...(input.sampling === undefined ? {} : { sampling: input.sampling }),
    assumptions: input.assumptions, requestedOutputs: Object.freeze([...requestedOutputs]),
  });
}

type Unsuccessful<Status extends string> = Readonly<{ status: Status; context: RunContext;
  diagnostics: readonly Diagnostic[]; outputs?: never; outputUnits?: never; provenance?: never }>;

export type RunOutcome<Output> =
  | Readonly<{ status: "success"; provenance: RunProvenance; outputs: Output;
      outputUnits: Readonly<Record<string, string>>; diagnostics: readonly Diagnostic[]; context?: never }>
  | Unsuccessful<"rejected">
  | Unsuccessful<"cancelled">
  | Unsuccessful<"failed">;

export type EngineCapabilities = Readonly<{
  engine: EngineRef;
  models: readonly Readonly<{ model: ModelRef; outputKinds: readonly OutputKind[] }>[];
}>;

export function matchCapabilities(
  descriptor: EngineCapabilities, engine: EngineRef, model: ModelRef, outputs: readonly OutputKind[],
): "supported" | "unsupported-engine" | "unsupported-model" | "unsupported-output" {
  if (descriptor.engine.engineId !== engine.engineId ||
      descriptor.engine.engineVersion !== engine.engineVersion) return "unsupported-engine";
  const entries = descriptor.models.filter(({ model: candidate }) =>
    candidate.domain === model.domain && candidate.kind === model.kind &&
    candidate.modelVersion === model.modelVersion);
  if (entries.length === 0) return "unsupported-model";
  return entries.some(entry => outputs.every(output => entry.outputKinds.includes(output)))
    ? "supported" : "unsupported-output";
}

export interface DomainEngine<Model extends SnapshotData, Output> {
  readonly capabilities: EngineCapabilities;
  validate(model: Model, ref: ModelRef):
    | { ok: true; input: ValidatedInput<Model> }
    | { ok: false; diagnostics: readonly Diagnostic[] };
  run(request: RunRequest<Model>, cancellation: Cancellation): Promise<RunOutcome<Output>>;
}
