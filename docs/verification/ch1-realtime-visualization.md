# CH1-F02 scientific visualization

**Status** — Implementation proposal and verification record. D-01 through D-07 remain open.

The worker continues to produce all waveform and spectrum samples. The display uses immutable-by-convention result buffers, a cached Canvas layer for geometry, and requestAnimationFrame for a cursor that sweeps the visible time window. Pointer inspection snaps to recorded samples or bins. Playback repeats the cursor sweep over the finite window. It never extrapolates a periodic waveform or requests new solver work.

ModuLab's Canvas components informed the use of ResizeObserver, backing-store scaling and separate zoom and pan state. Its simulation context informed timestamp-based animation and cleanup. OpenEE Lab implements these patterns within its native TypeScript views and keeps its own worker and numerical conventions. [ModuLab source at inspected revision](https://github.com/dag12y/modulation-1/tree/53fa469d2361444f56d0fc1bd8be1b53b4a43dc8/src) · [T-08 lifecycle](run-lifecycle.md)

## Reusable plot API

Use `createScientificPlot({ title, xLabel, yLabel, playback })`, append its `root`, and call `setTraces` with the latest accepted buffers. Each trace supplies a label, optional color, line or stem mode, values, and either `{ start, step }` or explicit ascending coordinates. Supply finite data and aligned coordinates with a representable horizontal span. Treat input buffers as read-only while mounted. Call `dispose` before removing the view. The existing static `plot` helper remains available to earlier contributors. [Interactive plot source](../../apps/web/src/scientific-plot.ts)

The visible canvas uses devicePixelRatio up to 3× and sizes from ResizeObserver. The cached layer contains the grid, axes and traces. It redraws on data, viewport, size or theme changes. Animation frames composite that layer and draw the cursor and crosshair. Zoom and pan change the horizontal viewport while the full-record vertical extent stays fixed. Axis and peak summaries are based on the supplied coordinates and buffers. Crosshair readouts use nearest original values per trace and never interpolate spectral peaks. The keyboard inspection slider exposes the same readings alongside text legends and summaries.

Playback is opt-in and starts at the left of the visible window. At 1× it sweeps the display in three wall-clock seconds independent of the record's physical duration. It repeats the inspection sweep and pauses when hidden, with no hidden-time catch-up. Pause freezes the cursor and preserves the exact waveform. Reduced motion disables playback. Route cleanup cancels frames, disconnects observers, removes listeners and closes the existing worker boundary.

Live previews retain the last accepted plots with their previous-result label while the latest worker is pending. The debounce is 155 ms, down from 200 ms. AM continues to allow the engine's supported frequency settings and displays engine diagnostics through the general diagnostic area. No provisional mathematical preview is generated. [AM integration](../../apps/web/src/am-lab.ts) · [T-07 numerical conventions](am-engine.md)

## Local performance measurements

Headless Chromium, local Vite dev server, 1250 × 970 viewport. Five post-initialization edits per case, alternating between N and N−1. Times below are medians in ms, rounded. The result timestamp is the first animation-frame poll that observed the completed run status. It approximates result presentation and does not measure hardware scanout.

| Near sample count | Before edit → dispatch | After edit → dispatch | Before worker round trip | After worker round trip | Before edit → result | After edit → result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 320 | 202 | 157 | 27 | 29 | 240 | 205 |
| 2,048 | 202 | 157 | 122 | 113 | 337 | 295 |

A second run used temporary browser and worker instrumentation to separate phases. Field validation and controller submission/serialization each took under 1 ms in these samples. Startup/module loading plus outbound delivery took 16–25 ms. Worker revalidation took 1–2.3 ms. Waveform generation took up to 0.6 ms. Direct DFT took roughly 3–8 ms near 320 samples and 79–91 ms near the limit. Result return took about 1–1.6 ms. In a 60-interval sample, animation-frame spacing was 16.7 ms median and 16.8 ms p95, with instrumented callback durations at or below 0.3 ms at p95. Baseline idle frame spacing was 16.7 ms median and p95. These are local observations and do not establish supported-device targets.

Debounce and startup dominate typical edits. The DFT dominates the upper sample range, so an independently verified FFT could materially reduce large-record latency. Evaluate it separately against coherent and noncoherent fixtures, normalization and DC/edge bins, numerical drift and device measurements. The current implementation keeps the bounded direct DFT.

## Verification

Chromium exercises playback and pause, hidden-page behavior and route cleanup, reduced motion, DPR and resizing, zoom/pan coordinates, multi-trace rendering and buffer preservation. Existing browser coverage exercises Live and Manual modes, rapid edits, worker cancellation and recovery, and real AM output. Cross-browser, assistive-technology and supported-device performance evaluation remain open. [Browser tests](../../apps/web/tests/browser.test.mjs)
