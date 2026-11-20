import { matchCapabilities, type Cancellation, type RunContext, type RunOutcome } from "../../contracts/src/index.js";
import { amEngine, amEngineRef, amModelRef, type AmModel, type AmOutput } from "../../engine-communications/src/index.js";

export type Outcome = RunOutcome<AmOutput>;
export type Execution = { result: Promise<Outcome>; cancel(): void };
export type ExecutionAdapter = (message: string) => Execution;

export function unsuccessful(
  status: "rejected" | "cancelled" | "failed", context: RunContext, code: string, message: string,
): Outcome {
  const diagnostics = [{ severity: status === "cancelled" ? "info" as const : "error" as const,
    code: `run.${code}`, message }];
  switch (status) {
    case "rejected": return { status, context, diagnostics };
    case "cancelled": return { status, context, diagnostics };
    case "failed": return { status, context, diagnostics };
  }
}

export const maxDispatchLength = 4096;
const fields = [
  "carrierAmplitude", "modulationIndex", "messageFrequencyHz",
  "carrierFrequencyHz", "sampleRateHz", "sampleCount",
] as const;

export function encodeDispatch(context: RunContext, model: AmModel, outputs: readonly string[]): string {
  return JSON.stringify({ ...context, model, outputs }, (_key, value: unknown) =>
    Object.is(value, -0) ? "-0" : value);
}

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

const shortText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;

export async function executeDispatch(raw: unknown, cancellation: Cancellation): Promise<Outcome> {
  let context: RunContext = { runId: "", modelRevision: "", modelRef: amModelRef, engine: amEngineRef };
  const rejected = (code: string, message: string) => unsuccessful("rejected", context, code, message);
  if (typeof raw !== "string" || raw.length > maxDispatchLength) {
    return rejected("invalid-dispatch", "Expected a bounded dispatch string.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return rejected("invalid-dispatch", "Dispatch could not be parsed.");
  }
  if (!record(value, ["runId", "modelRevision", "modelRef", "engine", "inputFingerprint", "model", "outputs"]) ||
      !shortText(value.runId) || !shortText(value.modelRevision) ||
      !record(value.modelRef, ["domain", "kind", "modelVersion"]) ||
      !shortText(value.modelRef.domain) || !shortText(value.modelRef.kind) || !shortText(value.modelRef.modelVersion) ||
      !record(value.engine, ["engineId", "engineVersion"]) ||
      !shortText(value.engine.engineId) || !shortText(value.engine.engineVersion)) {
    return rejected("invalid-dispatch", "Invalid dispatch identity or envelope.");
  }
  context = {
    runId: value.runId, modelRevision: value.modelRevision,
    modelRef: { domain: value.modelRef.domain, kind: value.modelRef.kind, modelVersion: value.modelRef.modelVersion },
    engine: { engineId: value.engine.engineId, engineVersion: value.engine.engineVersion },
  };
  if (typeof value.inputFingerprint !== "string" || value.inputFingerprint.length > 2048 ||
      !Array.isArray(value.outputs) || value.outputs.length < 1 || value.outputs.length > 2 ||
      !value.outputs.every(shortText) || !record(value.model, fields)) {
    return rejected("invalid-dispatch", "Invalid model shape, fingerprint or output list.");
  }
  const model: Record<string, number> = {};
  for (const key of fields) {
    const parameter = value.model[key];
    if (typeof parameter !== "number" && parameter !== "-0") {
      return rejected("invalid-dispatch", "Expected scalar AM parameters.");
    }
    model[key] = parameter === "-0" ? -0 : parameter;
  }
  const match = matchCapabilities(amEngine.capabilities, context.engine, context.modelRef, value.outputs);
  if (match !== "supported") return rejected(match, "Dispatch does not match built-in capabilities.");
  const validated = amEngine.validate(model as AmModel, context.modelRef);
  if (!validated.ok) return { status: "rejected", context, diagnostics: validated.diagnostics };
  if (validated.input.inputFingerprint !== value.inputFingerprint) {
    return rejected("fingerprint-mismatch", "Dispatch identity does not match the validated input.");
  }
  return amEngine.run({ ...context, input: validated.input, requestedOutputs: value.outputs }, cancellation);
}
