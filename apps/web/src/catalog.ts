import { mountAmLab } from "./am-lab";
import { mountRandomProcessesLab } from "./random-processes-lab";

export type Experiment = {
  slug: string; title: string; chapter: string; description: string;
  mount?: (root: HTMLElement) => () => void;
};

export const experiments: readonly Experiment[] = [
  { slug: "conventional-am", title: "Conventional AM", chapter: "Chapter 2",
    description: "Change carrier and message settings and inspect the sampled waveform and amplitude spectrum.", mount: mountAmLab },
  ...[
    ["signals", "Signal fundamentals"], ["lti", "LTI systems and convolution"],
    ["fourier-series", "Fourier series"], ["fourier-transform", "Fourier transform"],
    ["probability", "Probability and random variables"],
    ["random-processes", "Random processes"],
    ["spectral-noise", "Spectral analysis and noise"],
  ].map(([slug, title]) => ({
    slug: slug!, title: title!, chapter: "Chapter 1",
    description: slug === "random-processes"
      ? "Generate random-process ensembles and explore their statistics, correlation, stationarity and ergodicity."
      : "",
    ...(slug === "random-processes" ? { mount: mountRandomProcessesLab } : {}),
  })),
  ...["DSB-SC", "SSB", "VSB"].map(title => ({ slug: title.toLowerCase(), title, chapter: "Chapter 2", description: "" })),
];
