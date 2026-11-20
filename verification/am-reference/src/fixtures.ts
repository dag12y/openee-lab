/**
 * Analytical reference data for T-05. No production engine module is imported.
 * Frequencies are Hz; amplitudes are peak values in an arbitrary signal unit.
 */
export type Parameters = Readonly<{
  carrierAmplitude: number;
  modulationIndex: number;
  messageFrequencyHz: number;
  carrierFrequencyHz: number;
  sampleRateHz: number;
  sampleCount: number;
}>;

export type ExpectedLine = Readonly<{
  bin: number;
  oneSidedPeak: number;
  twoSidedMagnitude: number;
}>;

export type CoherentFixture = Readonly<{
  id: string;
  parameters: Parameters;
  selectedSamples: ReadonlyArray<Readonly<{ index: number; value: number }>>;
  expectedLines: ReadonlyArray<ExpectedLine>;
  interpretation: string;
}>;

/**
 * Product-to-sum reference:
 * Ac cos(wc t) + (Ac mu/2) cos((wc-wm)t) + (Ac mu/2) cos((wc+wm)t).
 * This is deliberately separate from the proposed multiplicative engine form.
 */
export function analyticalSamples(p: Parameters): number[] {
  const lower = p.carrierFrequencyHz - p.messageFrequencyHz;
  const upper = p.carrierFrequencyHz + p.messageFrequencyHz;
  return Array.from({ length: p.sampleCount }, (_, n) => {
    const t = n / p.sampleRateHz;
    return p.carrierAmplitude * Math.cos(2 * Math.PI * p.carrierFrequencyHz * t)
      + p.carrierAmplitude * p.modulationIndex / 2 * Math.cos(2 * Math.PI * lower * t)
      + p.carrierAmplitude * p.modulationIndex / 2 * Math.cos(2 * Math.PI * upper * t);
  });
}

const base = {
  carrierAmplitude: 2,
  messageFrequencyHz: 1,
  carrierFrequencyHz: 2,
  sampleRateHz: 8,
  sampleCount: 8
} as const;

export const coherentFixtures: ReadonlyArray<CoherentFixture> = [
  {
    id: "unmodulated-carrier",
    parameters: { ...base, modulationIndex: 0 },
    selectedSamples: [
      { index: 0, value: 2 }, { index: 2, value: -2 },
      { index: 4, value: 2 }, { index: 6, value: -2 }
    ],
    expectedLines: [{ bin: 2, oneSidedPeak: 2, twoSidedMagnitude: 1 }],
    interpretation: "Distinct sideband coefficients vanish when mu is zero."
  },
  {
    id: "under-modulation-distinct-sidebands",
    parameters: { ...base, modulationIndex: 0.5 },
    selectedSamples: [
      { index: 0, value: 3 }, { index: 1, value: 0 },
      { index: 2, value: -2 }, { index: 3, value: 0 },
      { index: 4, value: 1 }, { index: 5, value: 0 },
      { index: 6, value: -2 }, { index: 7, value: 0 }
    ],
    expectedLines: [
      { bin: 1, oneSidedPeak: 0.5, twoSidedMagnitude: 0.25 },
      { bin: 2, oneSidedPeak: 2, twoSidedMagnitude: 1 },
      { bin: 3, oneSidedPeak: 0.5, twoSidedMagnitude: 0.25 }
    ],
    interpretation: "Coherent, distinct lines at fc-fm, fc, and fc+fm."
  },
  {
    id: "critical-modulation",
    parameters: { ...base, modulationIndex: 1 },
    selectedSamples: [
      { index: 0, value: 4 }, { index: 2, value: -2 },
      { index: 4, value: 0 }, { index: 6, value: -2 }
    ],
    expectedLines: [
      { bin: 1, oneSidedPeak: 1, twoSidedMagnitude: 0.5 },
      { bin: 2, oneSidedPeak: 2, twoSidedMagnitude: 1 },
      { bin: 3, oneSidedPeak: 1, twoSidedMagnitude: 0.5 }
    ],
    interpretation: "The modulation factor reaches zero at n=4."
  },
  {
    id: "overmodulation-reference-only",
    parameters: { ...base, modulationIndex: 1.5 },
    selectedSamples: [
      { index: 0, value: 5 }, { index: 2, value: -2 },
      { index: 4, value: -1 }, { index: 6, value: -2 }
    ],
    expectedLines: [
      { bin: 1, oneSidedPeak: 1.5, twoSidedMagnitude: 0.75 },
      { bin: 2, oneSidedPeak: 2, twoSidedMagnitude: 1 },
      { bin: 3, oneSidedPeak: 1.5, twoSidedMagnitude: 0.75 }
    ],
    interpretation: "Factor 1+mu cos crosses zero; production acceptance is open."
  },
  {
    id: "zero-carrier-amplitude",
    parameters: { ...base, carrierAmplitude: 0, modulationIndex: 0.5 },
    selectedSamples: [{ index: 0, value: 0 }, { index: 4, value: 0 }],
    expectedLines: [],
    interpretation: "Multiplicative convention produces zero; acceptance is open."
  },
  {
    id: "nyquist-upper-sideband",
    parameters: { ...base, modulationIndex: 0.5, sampleRateHz: 6, sampleCount: 6 },
    selectedSamples: [
      { index: 0, value: 3 }, { index: 1, value: -1.25 },
      { index: 2, value: -0.75 }, { index: 3, value: 1 }
    ],
    expectedLines: [
      { bin: 1, oneSidedPeak: 0.5, twoSidedMagnitude: 0.25 },
      { bin: 2, oneSidedPeak: 2, twoSidedMagnitude: 1 },
      { bin: 3, oneSidedPeak: 0.5, twoSidedMagnitude: 0.5 }
    ],
    interpretation: "Upper sideband is at Nyquist; DC/Nyquist bins are not doubled."
  },
  {
    id: "aliased-upper-collides-with-carrier",
    parameters: { ...base, modulationIndex: 0.5, sampleRateHz: 5, sampleCount: 5 },
    selectedSamples: [
      { index: 0, value: 3 },
      { index: 1, value: 2.5 * Math.cos(4 * Math.PI / 5) + 0.5 * Math.cos(2 * Math.PI / 5) }
    ],
    expectedLines: [
      { bin: 1, oneSidedPeak: 0.5, twoSidedMagnitude: 0.25 },
      { bin: 2, oneSidedPeak: 2.5, twoSidedMagnitude: 1.25 }
    ],
    interpretation: "3 Hz aliases to 2 Hz and adds in phase to the carrier."
  },
  {
    id: "zero-message-frequency-line-collision",
    parameters: { ...base, modulationIndex: 0.5, messageFrequencyHz: 0 },
    selectedSamples: [{ index: 0, value: 3 }, { index: 2, value: -3 }],
    expectedLines: [{ bin: 2, oneSidedPeak: 3, twoSidedMagnitude: 1.5 }],
    interpretation: "Both sidebands coincide with the carrier; three-line formula does not apply."
  },
  {
    id: "carrier-equals-message-dc-collision",
    parameters: { ...base, modulationIndex: 0.5, carrierFrequencyHz: 1 },
    selectedSamples: [{ index: 0, value: 3 }, { index: 2, value: 0 }, { index: 4, value: -1 }],
    expectedLines: [
      { bin: 0, oneSidedPeak: 0.5, twoSidedMagnitude: 0.5 },
      { bin: 1, oneSidedPeak: 2, twoSidedMagnitude: 1 },
      { bin: 2, oneSidedPeak: 0.5, twoSidedMagnitude: 0.25 }
    ],
    interpretation: "Lower sideband lands at DC; distinct-sideband claim is inapplicable."
  }
];

export const invalidNumericCases: ReadonlyArray<Readonly<{
  id: string; parameters: Parameters; reason: string;
}>> = [
  { id: "nan-amplitude", parameters: { ...base, modulationIndex: 0.5, carrierAmplitude: Number.NaN }, reason: "non-finite amplitude" },
  { id: "infinite-frequency", parameters: { ...base, modulationIndex: 0.5, carrierFrequencyHz: Number.POSITIVE_INFINITY }, reason: "non-finite frequency" },
  { id: "negative-amplitude", parameters: { ...base, modulationIndex: 0.5, carrierAmplitude: -1 }, reason: "outside proposed nonnegative amplitude domain" },
  { id: "negative-index", parameters: { ...base, modulationIndex: -0.5 }, reason: "outside proposed nonnegative index domain" },
  { id: "zero-sample-rate", parameters: { ...base, modulationIndex: 0.5, sampleRateHz: 0 }, reason: "sample rate must be positive" },
  { id: "fractional-count", parameters: { ...base, modulationIndex: 0.5, sampleCount: 8.5 }, reason: "sample count must be a positive integer" }
];
