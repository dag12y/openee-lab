export type SamplingGrid = Readonly<{
  sampleRateHz: number;
  sampleCount: number;
  startTimeSeconds: number;
}>;

export type RealSignal = Readonly<{
  grid: SamplingGrid;
  unit: string;
  samples: Float64Array;
}>;

export type SpectrumSidedness = "one-sided" | "two-sided";

export const maxSignalSamples = 65_536;
export const maxDftSamples = 2048;

export function recordDuration(grid: SamplingGrid): number {
  const { sampleRateHz, sampleCount, startTimeSeconds } = grid;
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > maxSignalSamples) {
    throw new RangeError("Sample count is outside the supported signal range");
  }
  const duration = sampleCount / sampleRateHz;
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0 ||
      !Number.isFinite(startTimeSeconds) || !Number.isFinite(duration) ||
      sampleRateHz / sampleCount === 0 || !Number.isFinite(startTimeSeconds + duration)) {
    throw new RangeError("Sampling grid must have a representable time and frequency axis");
  }
  return duration;
}

export function sampleTime(grid: SamplingGrid, index: number): number {
  recordDuration(grid);
  if (!Number.isSafeInteger(index) || index < 0 || index >= grid.sampleCount) {
    throw new RangeError("Sample index is outside the record");
  }
  return grid.startTimeSeconds + index / grid.sampleRateHz;
}

function binCount(count: number, sidedness: SpectrumSidedness): number {
  if (sidedness === "one-sided") return Math.floor(count / 2) + 1;
  if (sidedness === "two-sided") return count;
  throw new RangeError("Unsupported spectrum sidedness");
}

export function binFrequencyHz(grid: SamplingGrid, bin: number, sidedness: SpectrumSidedness): number {
  recordDuration(grid);
  const count = grid.sampleCount;
  if (!Number.isSafeInteger(bin) || bin < 0 || bin >= binCount(count, sidedness)) {
    throw new RangeError("Bin index is outside the spectrum");
  }
  const signedBin = sidedness === "two-sided" && bin >= Math.ceil(count / 2) ? bin - count : bin;
  return signedBin * (grid.sampleRateHz / count);
}

/** Validate the borrowed runtime buffer without copying or allocating sample storage. */
export function validateSignal(signal: RealSignal): void {
  const { grid, samples, unit } = signal;
  recordDuration(grid);
  if (!(samples instanceof Float64Array) || !(samples.buffer instanceof ArrayBuffer) || samples.length !== grid.sampleCount) {
    throw new TypeError("Expected a Float64 sample buffer matching the sampling grid");
  }
  if (typeof unit !== "string" || unit.length > 64 || unit.trim().length === 0) {
    throw new TypeError("Expected an explicit signal unit");
  }
  for (const value of samples) {
    if (!Number.isFinite(value)) throw new RangeError("Samples must be finite");
  }
}

export type AmplitudeSpectrum = Readonly<{
  grid: SamplingGrid;
  unit: string;
  sidedness: SpectrumSidedness;
  real: Float64Array;
  imaginary: Float64Array;
  amplitude: Float64Array;
}>;

/** Rectangular-window forward DFT, normalized by N and relative to sample zero. */
export function directDft(signal: RealSignal, sidedness: SpectrumSidedness): AmplitudeSpectrum {
  const { samples, grid, unit } = signal;
  recordDuration(grid);
  const count = grid.sampleCount;
  if (count > maxDftSamples) throw new RangeError("Direct DFT work limit exceeded");
  const bins = binCount(count, sidedness);
  validateSignal(signal);
  let scale = 0;
  for (const value of samples) scale = Math.max(scale, Math.abs(value));

  const real = new Float64Array(bins);
  const imaginary = new Float64Array(bins);
  const amplitude = new Float64Array(bins);
  for (let k = 0; scale !== 0 && k < bins; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < count; n++) {
      const angle = 2 * Math.PI * ((k * n) % count) / count;
      const sample = samples[n]! / scale;
      re += sample * Math.cos(angle);
      im -= sample * Math.sin(angle);
    }
    real[k] = (re / count) * scale;
    imaginary[k] = (im / count) * scale;
    const interior = k !== 0 && 2 * k !== count;
    const factor = sidedness === "one-sided" && interior ? 2 : 1;
    amplitude[k] = (factor * Math.hypot(re / count, im / count)) * scale;
    if (!Number.isFinite(amplitude[k])) throw new RangeError("Spectrum amplitude exceeds Float64 range");
  }
  return { grid: Object.freeze({ ...grid }), unit, sidedness, real, imaginary, amplitude };
}
