// Compile-time domain integration illustration with metadata-only output.
import { createValidatedInput, provenanceFor, type DomainEngine } from "../../contracts/src/index.js";
import { recordDuration, type SamplingGrid } from "./index.js";

type LessonParameters = SamplingGrid & { label: string };
type LessonResult = { durationSeconds: number };

const modelRef = { domain: "chapter-1", kind: "example-metadata", modelVersion: "1" };
const engineRef = { engineId: "example-metadata", engineVersion: "1" };

// Illustrates the local engine boundary. Registration and dispatch are separate.
export const exampleEngine: DomainEngine<LessonParameters, LessonResult> = {
  capabilities: { engine: engineRef, models: [{ model: modelRef, outputKinds: ["duration"] }] },
  validate(model, ref) {
    try {
      recordDuration(model);
    } catch {
      return { ok: false, diagnostics: [{
        severity: "error", code: "lesson.invalid-grid", message: "Check the sampling grid.",
      }] };
    }
    return { ok: true, input: createValidatedInput({
      modelRef: ref, model,
      sampling: { sampleRate: { value: model.sampleRateHz, unit: "Hz" },
        sampleCount: model.sampleCount, startTime: { value: model.startTimeSeconds, unit: "s" } },
      assumptions: ["exclusive record endpoint"],
    }) };
  },
  async run(request, cancellation) {
    const provenance = provenanceFor(request);
    if (cancellation.requested) return { status: "cancelled", context: provenance, diagnostics: [] };
    return { status: "success", provenance, diagnostics: [],
      outputUnits: { durationSeconds: "s" },
      outputs: { durationSeconds: recordDuration(request.input.model) } };
  },
};
