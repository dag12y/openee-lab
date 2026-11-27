# CH1 random-processes lab

**Status** — Browser implementation with deterministic, seeded numerical checks; independent review and broader numerical validation remain open.

The Chapter 1 Random Processes lab generates bounded ensembles in the browser. Controls are in the desktop right sidebar and move above the plots on narrow screens. The four views expose sample paths, ensemble statistics/PDFs, correlation, and stationarity/ergodicity. The PDF sample slider selects the time pair used for the first- and second-order distributions. **Play signals** continuously scrolls and repeats the generated realizations in the waveform plot; pause, restart, and speed controls affect the display only, not the generated samples. Playback is disabled when reduced motion is requested. Two-dimensional statistics use a paired-sample scatter plot and a fixed-lag correlation curve rather than block heatmaps.

Mathematical notation in headings, parameter labels, and diagnostic cards is typeset from inline LaTeX with the locally bundled KaTeX renderer; explanatory sentences and accessible chart labels remain readable text.

## Model conventions

All records are finite discrete-time sequences with a reproducible 32-bit seed. The current generator includes:

- Uniform random phase sinusoids, iid symmetric binary samples, and Gaussian white noise.
- A jointly Gaussian process formed by a finite Gaussian-shaped moving-average filter. An optional Gaussian per-realization offset keeps the ensemble stationary while making its mean and autocorrelation non-ergodic; the lab calls out WSS ⇒ SSS.
- Symmetric random walk, Wiener increments with `Δt = 0.1` per sample, and cumulative Poisson counts with rate measured per sample.
- Exponentially decaying Poisson shot noise with a finite pre-record warm-up.
- A two-state Markov chain initialized from its stationary distribution, AR(1), MA(1), and ARMA(1,1) Gaussian models.
- A zero-mean Gaussian example with periodic variance for cyclostationarity.

Voltage-driven examples use volts; Poisson output is an event count; Markov states and explicitly normalized filter/noise outputs are unitless.
Ensemble mean and variance use population moments across realizations at each sample. PDFs use normalized histogram density. The second-order PDF view plots ensemble samples of `(X[n], X[n + lag])`. The two-time correlation view plots the ensemble estimate of `Rₓ(n, n + lag)` across the record. Correlation functions use a finite-record biased estimate with a fixed record-length denominator; the resulting Toeplitz autocorrelation estimate is checked for positive semidefiniteness. `R(0)` is the estimated mean-square power. Cross statistics compare the first two independent realizations.

Stationarity verdicts are model-based, not statistical hypothesis tests on a finite record. Strict- and wide-sense checks pass for the stationary generators and fail for random walk, Wiener, Poisson counting, and periodic-variance examples. Shot-noise stationarity is approximate because its prehistory is bounded. The ergodicity view compares one-record running mean and autocorrelation estimates with ensemble estimates; ergodicity is not assessed for nonstationary models.

## Verification

`apps/web/tests/random-processes.test.mjs` checks repeatability, finite bounded outputs for every model, white-noise moments, an analytical sinusoid autocorrelation, PDF normalization, representative stationarity verdicts, and positive-semidefinite correlation checks. The browser suite covers model switching, PDF-time selection, validation, repeated waveform movement, pause, and reduced-motion behavior. Cross-browser and assistive-technology validation remain to be reviewed.
