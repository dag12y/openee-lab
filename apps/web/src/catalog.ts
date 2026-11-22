import { mountAmLab } from "./am-lab";
import { mountFourierLab } from "./fourier-lab";

export type Experiment = {
  slug: string; title: string; chapter: string; description: string;
  mount?: (root: HTMLElement) => () => void;
};

export const experiments: readonly Experiment[] = [
  { slug: "conventional-am", title: "Conventional AM", chapter: "Chapter 2",
    description: "Change carrier and message settings and inspect the sampled waveform and amplitude spectrum.", mount: mountAmLab },
  { slug: "fourier-series", title: "Fourier series & transform", chapter: "Chapter 1 · S3",
    description: "Analyze periodic signals, inspect simplified symbolic series and spectra, draw Fourier epicycle shapes, and evaluate continuous Fourier transforms.", mount: mountFourierLab },
  ...[
    ["signals", "Signal fundamentals"], ["lti", "LTI systems and convolution"],
    ["fourier-transform", "Fourier transform"],
    ["probability", "Probability and random variables"], ["random-processes", "Random processes"],
    ["spectral-noise", "Spectral analysis and noise"],
  ].map(([slug, title]) => ({ slug: slug!, title: title!, chapter: "Chapter 1", description: "" })),
  ...["DSB-SC", "SSB", "VSB"].map(title => ({ slug: title.toLowerCase(), title, chapter: "Chapter 2", description: "" })),
];
