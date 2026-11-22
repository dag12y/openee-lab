/**
 * S4: Fourier Transform & Frequency Domain — model types and constants.
 *
 * Domain: chapter-1 / fourier-transform
 * Issue:  #13 (https://github.com/dag12y/openee-lab/issues/13)
 *
 * Mathematical conventions
 * ------------------------
 * Forward DFT sign convention: X[k] = (1/N) Σ x[n] exp(-j 2π kn / N)
 * Bin spacing: Δf = fₛ / N
 * One-sided bins: 0 … floor(N/2) inclusive. Interior amplitudes doubled (excludes DC and Nyquist).
 * Two-sided bins: DFT array order (k = 0 … N-1). Signed frequency for k ≥ ceil(N/2) is k – N.
 *
 * All conventions are inherited from packages/numerics `directDft`; this module does not
 * duplicate the transform implementation.
 *
 * Parameter units
 * ---------------
 * frequency  → Hz (hertz)
 * amplitude  → V  (volts, real-valued)
 * phase      → radians (0 is the only currently supported initial phase)
 * time       → seconds
 * sample rate → Hz (samples per second)
 * sample count → dimensionless positive integer
 */

/** A single sinusoidal component: A·cos(2π f t) with phase locked to sample index 0. */
export type ToneComponent = Readonly<{
  /** Peak amplitude in volts. Must be finite and ≥ 0. */
  amplitudeV: number;
  /** Frequency in Hz. Must be finite and ≥ 0. */
  frequencyHz: number;
}>;

/**
 * Input model for the S4 Fourier-transform experiment.
 *
 * The signal is x(t) = Σ_i Aᵢ · cos(2π fᵢ t), evaluated at t = n/fₛ for n = 0…N-1.
 * Adding a DC term is supported by setting frequencyHz = 0 for one component.
 */
export type FtModel = Readonly<{
  /**
   * One or more sinusoidal components. At least one; at most `maxComponents`.
   * The combined signal is their sum (superposition principle).
   */
  components: readonly ToneComponent[];
  /**
   * Sampling rate in Hz. Must be finite and positive.
   * fₛ determines the Nyquist limit: fₙ = fₛ / 2.
   */
  sampleRateHz: number;
  /**
   * Number of samples. Must be a safe positive integer ≤ `maxFtSamples`.
   * N determines bin resolution: Δf = fₛ / N.
   */
  sampleCount: number;
  /**
   * Requested spectrum representation: "one-sided" (default) or "two-sided".
   * One-sided bins run from 0 to floor(N/2). Two-sided bins use DFT array order.
   */
  sidedness: "one-sided" | "two-sided";
}>;

/** Maximum number of sinusoidal components per experiment. */
export const maxComponents = 8;

/**
 * Maximum sample count for the S4 engine.
 * Matches the shared DFT resource limit in packages/numerics.
 */
export const maxFtSamples = 2048;

/** Available output kinds for the S4 engine. */
export type FtOutputKind = "waveform" | "spectrum";

/**
 * Spectrum portion of the S4 output, present only when "spectrum" is requested.
 */
export type FtSpectrum = Readonly<{
  /** Spectrum sidedness matching the input model. */
  sidedness: "one-sided" | "two-sided";
  /** Bin frequencies in Hz, length = bins (one- or two-sided). */
  binFrequenciesHz: Float64Array;
  /** DFT real coefficients Re{X[k]} in volts, length = bins. */
  real: Float64Array;
  /** DFT imaginary coefficients Im{X[k]} in volts, length = bins. */
  imaginary: Float64Array;
  /**
   * Amplitude spectrum |X[k]| (one-sided: doubled for interior bins), in volts.
   * Length = bins.
   */
  amplitude: Float64Array;
  /** Bin spacing Δf = fₛ / N in Hz. */
  binWidthHz: number;
}>;

/**
 * Structured output of the S4 engine.
 *
 * All array lengths match sampleCount (waveform) or the bin count implied by sidedness
 * and sampleCount (spectrum).
 */
export type FtOutput = Readonly<{
  sampleRateHz: number;
  sampleCount: number;
  /** Signal unit for all amplitude values: "V". */
  unit: "V";
  /** Time-domain samples x[n] in volts, length = sampleCount. Present when "waveform" requested. */
  waveform?: Float64Array;
  /** Spectrum result. Present when "spectrum" is requested. */
  spectrum?: FtSpectrum;
}>;
