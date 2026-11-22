import {
  createValidatedInput,
  matchCapabilities,
  provenanceFor,
  type Cancellation,
  type Diagnostic,
  type DomainEngine,
  type EngineCapabilities,
  type RunContext,
  type RunOutcome,
  type RunRequest,
  type ValidatedInput,
} from "../../../../contracts/src/index.js";
import {
  defaultFourierModel,
  fourierEngineRef,
  fourierModelRef,
  validateFourierModel,
  type FourierModel,
} from "./model.js";
import {
  analyzeFourierSeries,
  inspectSingleHarmonic,
  sampleInputRegion,
  sampleSeriesViewport,
  sampleTransformViewport,
  solveEpicycles,
  type EpicyclesAnalysis,
  type HarmonicCoefficient,
  type SeriesAnalysis,
  type TransformAnalysis,
} from "./math.js";
import {
  buildEpicycleLatex,
  buildEpicycleMathSteps,
  buildSeriesLatex,
  buildTransformLatex,
  type SeriesLatexBundle,
  type TransformLatexBundle,
} from "./latex.js";
import type { MathStep } from "./transform-symbolic.js";
import { wasmKernel } from "./wasm-kernel.js";

export * from "./calculus.js";
export * from "./calculus-derivation.js";
export * from "./model.js";
export * from "./expr.js";
export * from "./shapes.js";
export * from "./symbolic.js";
export * from "./transform-symbolic.js";
export * from "./math.js";
export * from "./latex.js";
export { wasmKernel } from "./wasm-kernel.js";

export type FourierOutput = Readonly<{
  mode: FourierModel["mode"];
  wasmAccelerated: boolean;
  series?: Readonly<{
    analysis: SeriesAnalysis;
    inspected: HarmonicCoefficient;
    latex: SeriesLatexBundle;
    viewport: ReturnType<typeof sampleSeriesViewport>;
  }>;
  transform?: Readonly<{
    analysis: TransformAnalysis;
    latex: TransformLatexBundle;
  }>;
  epicycles?: Readonly<{
    analysis: EpicyclesAnalysis;
    latex: string;
    steps: readonly MathStep[];
  }>;
}>;

const capabilities: EngineCapabilities = Object.freeze({
  engine: fourierEngineRef,
  models: Object.freeze([
    Object.freeze({
      model: fourierModelRef,
      outputKinds: Object.freeze(["waveform", "spectrum", "epicycles"]),
    }),
  ]),
});

const issued = new WeakSet<object>();

function toSnapshotData(model: FourierModel) {
  return {
    mode: model.mode,
    sampleCount: model.sampleCount,
    series: {
      inputKind: model.series.inputKind,
      presetId: model.series.presetId,
      amplitude: model.series.amplitude,
      periodStart: model.series.periodStart,
      period: model.series.period,
      continuation: model.series.continuation,
      dutyCycle: model.series.dutyCycle,
      dcOffset: model.series.dcOffset,
      expression: model.series.expression,
      piecewiseStart: model.series.piecewiseStart,
      piecewiseSegments: model.series.piecewiseSegments.map(s => ({
        start: s.start,
        end: s.end,
        expr: s.expr,
      })),
      graphicalPoints: model.series.graphicalPoints.map(p => ({ x: p.x, y: p.y })),
      graphicalInterp: model.series.graphicalInterp,
      harmonics: model.series.harmonics,
      inspectN: model.series.inspectN,
      viewMin: model.series.viewMin,
      viewMax: model.series.viewMax,
    },
    transform: {
      signalId: model.transform.signalId,
      amplitude: model.transform.amplitude,
      width: model.transform.width,
      shift: model.transform.shift,
      modFreqHz: model.transform.modFreqHz,
      decayRate: model.transform.decayRate,
      customExpr: model.transform.customExpr,
      timeMin: model.transform.timeMin,
      timeMax: model.transform.timeMax,
      freqMin: model.transform.freqMin,
      freqMax: model.transform.freqMax,
    },
    epicycles: {
      shapeId: model.epicycles.shapeId,
      customPath: model.epicycles.customPath.map(p => ({ x: p.x, y: p.y })),
      harmonics: model.epicycles.harmonics,
    },
  };
}

export const fourierEngine: DomainEngine<FourierModel, FourierOutput> = {
  capabilities,
  validate(model, ref) {
    if (matchCapabilities(capabilities, fourierEngineRef, ref, []) !== "supported") {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "fourier.unsupported-model",
          message: "Unsupported Fourier S3 model identity or version.",
        }],
      };
    }
    if (typeof model !== "object" || model === null || Array.isArray(model)) {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "fourier.invalid-model",
          message: "Provide a valid Fourier S3 parameter record.",
        }],
      };
    }
    const diagnostics = validateFourierModel(model);
    if (diagnostics.length > 0) return { ok: false, diagnostics };

    const canonical = toSnapshotData(model) as unknown as FourierModel;
    const sampling = model.mode === "series"
      ? {
          sampleRate: { value: model.sampleCount / (model.series.viewMax - model.series.viewMin), unit: "Hz" },
          sampleCount: model.sampleCount,
          startTime: { value: model.series.viewMin, unit: "s" },
        }
      : model.mode === "transform"
        ? {
            sampleRate: { value: model.sampleCount / (model.transform.timeMax - model.transform.timeMin), unit: "Hz" },
            sampleCount: model.sampleCount,
            startTime: { value: model.transform.timeMin, unit: "s" },
          }
        : undefined;

    const input = createValidatedInput({
      modelRef: fourierModelRef,
      model: canonical as unknown as Parameters<typeof createValidatedInput>[0]["model"],
      ...(sampling === undefined ? {} : { sampling }),
      assumptions: [
        "periodic extension over fundamental region",
        "16-point composite Gauss-Legendre quadrature",
        "arc-length uniform contour sampling for epicycles",
      ],
    }) as unknown as ValidatedInput<FourierModel>;
    issued.add(input);
    return { ok: true, input };
  },

  async run(request: RunRequest<FourierModel>, cancellation: Cancellation): Promise<RunOutcome<FourierOutput>> {
    const { input, runId, modelRevision, engine, requestedOutputs } = request;
    const local = issued.has(input);
    const context: RunContext = {
      runId,
      modelRevision,
      engine: { ...engine },
      modelRef: { ...input?.modelRef },
      ...(local ? { inputFingerprint: input.inputFingerprint } : {}),
    };
    if (!local) {
      return {
        status: "rejected",
        context,
        diagnostics: [{
          severity: "error",
          code: "fourier.invalid-snapshot",
          message: "Validate the Fourier model locally before execution.",
        }],
      };
    }

    const match = matchCapabilities(capabilities, engine, input.modelRef, requestedOutputs);
    if (match !== "supported") {
      return {
        status: "rejected",
        context,
        diagnostics: [{
          severity: "error",
          code: `fourier.${match}`,
          message: "Requested outputs do not match S3 Fourier engine capabilities.",
        }],
      };
    }

    const cancelled = (): RunOutcome<FourierOutput> => ({
      status: "cancelled",
      context,
      diagnostics: [{ severity: "info", code: "fourier.cancelled", message: "Simulation run cancelled." }],
    });

    if (cancellation.requested) return cancelled();

    try {
      const provenance = provenanceFor(request);
      const model = input.model;
      const diagnostics: Diagnostic[] = [];

      if (model.mode === "series") {
        const analysis = analyzeFourierSeries(model.series);
        if (cancellation.requested) return cancelled();
        const inspected = inspectSingleHarmonic(model.series, model.series.inspectN);
        const viewport = sampleSeriesViewport(
          model.series,
          analysis,
          model.series.viewMin,
          model.series.viewMax,
          model.sampleCount,
        );
        const latex = buildSeriesLatex(model.series, analysis, inspected);
        return {
          status: "success",
          provenance,
          outputUnits: { waveform: "V", spectrum: "V" },
          diagnostics,
          outputs: {
            mode: "series",
            wasmAccelerated: wasmKernel.active,
            series: { analysis, inspected, latex, viewport },
          },
        };
      }

      if (model.mode === "transform") {
        const analysis = sampleTransformViewport(model.transform, model.sampleCount);
        if (cancellation.requested) return cancelled();
        const latex = buildTransformLatex(model.transform);
        return {
          status: "success",
          provenance,
          outputUnits: { waveform: "V", spectrum: "V·s" },
          diagnostics,
          outputs: {
            mode: "transform",
            wasmAccelerated: wasmKernel.active,
            transform: { analysis, latex },
          },
        };
      }

      const analysis = solveEpicycles(model.epicycles);
      if (cancellation.requested) return cancelled();
      const latex = buildEpicycleLatex(model.epicycles, analysis);
      const steps = buildEpicycleMathSteps(model.epicycles, analysis);
      return {
        status: "success",
        provenance,
        outputUnits: { epicycles: "1" },
        diagnostics,
        outputs: {
          mode: "epicycles",
          wasmAccelerated: wasmKernel.active,
          epicycles: { analysis, latex, steps },
        },
      };
    } catch (err) {
      return {
        status: "failed",
        context,
        diagnostics: [{
          severity: "error",
          code: "fourier.execution-failed",
          message: err instanceof Error ? err.message : "Fourier S3 batch failed.",
        }],
      };
    }
  },
};

export function createDefaultFourierModel(): FourierModel {
  return structuredClone(defaultFourierModel);
}

export { sampleInputRegion };
