import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer, preview } from "vite";

let browser, server, origin;
before(async () => {
  server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium" });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
});

test("guest keyboard navigation, default Live run and automatic output updates", async () => {
  const page = await browser.newPage({ viewport: { width: 1250, height: 970 }, colorScheme: "light" });
  try {
    await page.goto(origin);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Skip to content");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "content");
    assert.equal(await page.locator(".planned-card a").count(), 0);
    await page.keyboard.press("Tab");
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Open Conventional AM/);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Conventional AM" }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), "content");
    assert.equal(await page.getByLabel("Simulation mode").inputValue(), "live");
    await page.locator("figcaption").nth(1).getByText(/largest absolute value 2 at 400/).waitFor();
    await page.getByLabel("Sample count").fill("2049");
    await page.getByText("This batch is limited to 2048 samples.", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Sample count").getAttribute("aria-invalid"), "true");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    assert.equal(await page.getByLabel("Sample count").inputValue(), "320");
    await page.getByRole("spinbutton", { name: "Carrier amplitude" }).fill("4");
    await page.locator("figcaption").nth(1).getByText(/largest absolute value 4 at 400/).waitFor();
    assert.equal(await page.locator("canvas").count(), 2);
    assert.match(await page.locator("figcaption").nth(0).innerText(), /largest absolute value 6 at 0/);
    assert.match(await page.locator("figcaption").nth(1).innerText(), /largest absolute value 4 at 400/);
    if (process.env.LAB_SCREENSHOT) await page.screenshot({ path: process.env.LAB_SCREENSHOT, fullPage: true });
    await page.getByRole("spinbutton", { name: "Carrier amplitude" }).evaluate(node => {
      for (const value of ["8", "1", "3"]) {
        node.value = value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.getByText(/Previous result/).waitFor();
    assert.equal(await page.locator("canvas").count(), 2);
    await page.locator("figcaption").nth(0).getByText(/largest absolute value 4.5 at 0/).waitFor();
    await page.locator("figcaption").nth(1).getByText(/largest absolute value 3 at 400/).waitFor();
    assert.equal(await page.getByText(/Previous result/).isVisible(), false);
    await page.getByRole("spinbutton", { name: "Carrier amplitude" }).fill("0");
    await page.locator("figcaption").nth(0).getByText(/largest absolute value 0 at 0/).waitFor();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.locator("figcaption").nth(1).getByText(/largest absolute value 2 at 400/).waitFor();
    await page.getByLabel("Carrier frequency").fill("2500");
    await page.getByText(/sampled spectrum folds frequencies/).waitFor();
    assert.equal(await page.getByLabel("Carrier frequency").getAttribute("max"), null);
    assert.equal(await page.getByLabel("Carrier frequency").inputValue(), "2500");
    assert.equal(await page.getByLabel("Sampling frequency").inputValue(), "4000");
    assert.equal(await page.locator(".diagnostic-warning").count(), 1);
    assert.equal(await page.locator("canvas").count(), 2);
    await page.setViewportSize({ width: 375, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test("worker cancellation, stale responses, failure recovery and route cleanup", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      window.testWorkers = [];
      window.Worker = class {
        constructor() { window.testWorkers.push(this); }
        postMessage(data) { this.request = JSON.parse(data); this.late = this.onmessage; }
        terminate() { this.terminated = true; }
      };
    });
    await page.goto(origin + "/#/labs/conventional-am");
    const run = page.getByRole("button", { name: "Run simulation" });
    await page.getByRole("button", { name: "Cancel run" }).click();
    await page.getByText("Run cancelled.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.testWorkers[0].terminated), true);
    await page.getByLabel("Simulation mode").selectOption("manual");
    await run.click();
    await page.getByLabel("Message frequency").fill("60");
    await page.evaluate(() => window.testWorkers[1].late({ data: { status: "success" } }));
    assert.equal(await page.locator("canvas").count(), 0);
    assert.equal(await page.evaluate(() => window.testWorkers[1].terminated), true);
    await run.click();
    await page.evaluate(() => window.testWorkers[2].onerror(new Error("test")));
    await page.getByText("Run did not complete. Run again to retry.", { exact: true }).waitFor();
    await run.click();
    await page.getByRole("link", { name: "Guided simulations" }).click();
    await page.getByRole("heading", { name: "Guided simulations" }).waitFor();
    assert.equal(await page.evaluate(() => window.testWorkers.every(worker => worker.terminated)), true);
  } finally { await page.close(); }
});

test("worker responses with wrong correlation or oversized output fail closed", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      window.Worker = class {
        postMessage(data) {
          const request = JSON.parse(data);
          const count = window.largeOutput ? 2049 : request.model.sampleCount;
          this.onmessage({ data: { status: "success", diagnostics: [],
            provenance: { ...request, runId: "wrong", requestedOutputs: request.outputs },
            outputs: { sampleRateHz: 4000, sampleCount: count, startTimeSeconds: 0,
              waveform: new Float64Array(count),
              spectrum: { binWidthHz: 4000 / count, peakAmplitude: new Float64Array(Math.floor(count / 2) + 1) } },
            outputUnits: { waveform: "V", spectrum: "V" } } });
        }
        terminate() {}
      };
    });
    await page.goto(origin + "/#/labs/conventional-am");
    const run = page.getByRole("button", { name: "Run simulation" });
    await page.getByText(/mismatched response/).waitFor();
    await page.evaluate(() => { window.largeOutput = true; });
    await run.click();
    await page.getByText(/browser worker could not complete/).waitFor();
    assert.equal(await page.locator("canvas").count(), 0);
  } finally { await page.close(); }
});

test("Live coalesces edits and Manual suppresses automatic workers, including reset", async () => {
  const page = await browser.newPage();
  try {
    await page.clock.install();
    await page.addInitScript(() => {
      window.testWorkers = [];
      window.Worker = class {
        constructor() { window.testWorkers.push(this); }
        postMessage(data) {
          this.request = JSON.parse(data);
          this.late = this.onmessage;
        }
        terminate() { this.terminated = true; }
      };
    });
    await page.goto(origin + "/#/labs/conventional-am");
    const input = page.getByRole("spinbutton", { name: "Carrier amplitude" });
    const slider = page.getByRole("slider", { name: "Carrier amplitude quick adjustment" });
    // Deliver the sequence in one task to exercise replacement of pending work.
    await input.evaluate(node => {
      for (const value of ["", "3", "4", "12.375"]) {
        node.value = value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.clock.runFor(220);
    assert.equal(await page.evaluate(() => window.testWorkers.length), 2);
    assert.equal(await page.evaluate(() => window.testWorkers[0].terminated), true);
    assert.equal(await page.evaluate(() => window.testWorkers[1].request.model.carrierAmplitude), 12.375);
    assert.equal(await input.inputValue(), "12.375");
    assert.equal(await slider.inputValue(), "10");
    await slider.evaluate(node => {
      for (const value of ["1.25", "2.5", "5.25"]) {
        node.value = value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    assert.equal(await input.inputValue(), "5.25");
    await page.clock.runFor(220);
    assert.equal(await page.evaluate(() => window.testWorkers[2].request.model.carrierAmplitude), 5.25);
    await input.fill("");
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await page.evaluate(() => document.activeElement.id), "carrierAmplitude");
    await page.clock.runFor(220);
    assert.equal(await page.evaluate(() => window.testWorkers.length), 3);
    await page.getByLabel("Simulation mode").selectOption("manual");
    await input.fill("7");
    await page.clock.runFor(220);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.clock.runFor(220);
    assert.equal(await input.inputValue(), "2");
    assert.equal(await page.evaluate(() => window.testWorkers.length), 3);
    await page.getByRole("button", { name: "Run simulation" }).click();
    assert.equal(await page.evaluate(() => window.testWorkers[3].request.model.carrierAmplitude), 2);
  } finally { await page.close(); }
});

test("scope playback moves only the display cursor, pauses, and stops on exit", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      window.frames = new Set();
      const request = requestAnimationFrame.bind(window);
      const cancel = cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        const id = request(time => { window.frames.delete(id); callback(time); });
        window.frames.add(id);
        return id;
      };
      window.cancelAnimationFrame = id => { window.frames.delete(id); cancel(id); };
    });
    await page.goto(origin + "/#/labs/conventional-am");
    const scope = page.locator("figure").first();
    const canvas = scope.locator("canvas");
    const pixels = () => canvas.evaluate(node => node.toDataURL());
    await page.waitForFunction(() => document.querySelector("canvas")?.width > 300);
    const original = await pixels();
    const summary = await scope.locator("figcaption").innerText();
    await scope.getByRole("button", { name: "Play cursor" }).click();
    await scope.getByLabel("Cursor playback speed").selectOption("4");
    await page.waitForFunction(start => document.querySelector("canvas").toDataURL() !== start, original);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.evaluate(() => window.frames.size), 0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await scope.getByRole("button", { name: "Pause cursor" }).click();
    await page.waitForFunction(() => window.frames.size === 0);
    const paused = await pixels();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await pixels(), paused);
    assert.equal(await scope.locator("figcaption").innerText(), summary);
    await scope.getByRole("button", { name: "Play cursor" }).click();
    await page.getByRole("link", { name: "Guided simulations" }).click();
    await page.getByRole("heading", { name: "Guided simulations" }).waitFor();
    assert.equal(await page.evaluate(() => window.frames.size), 0);
  } finally { await page.close(); }
});

test("zoom and pan inspect actual coordinates, DPR follows size, and reduced motion disables playback", async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 2, reducedMotion: "reduce", colorScheme: "dark" });
  try {
    await page.goto(origin + "/#/labs/conventional-am");
    const scope = page.locator("figure").first();
    const spectrum = page.locator("figure").nth(1);
    const canvas = scope.locator("canvas");
    assert.equal(await scope.getByRole("button", { name: "Play cursor" }).isDisabled(), true);
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      return canvas && canvas.width === Math.round(canvas.getBoundingClientRect().width * 2);
    });
    const initialWidth = await canvas.evaluate(node => node.width);
    const inspect = scope.getByRole("slider", { name: "Waveform inspect position" });
    await inspect.focus();
    await inspect.press("Home");
    assert.match(await scope.locator(".plot-readout").innerText(), /Time \(s\) 0, Voltage \(V\) 3/);
    await scope.getByRole("button", { name: "Zoom in" }).click();
    await inspect.focus();
    await inspect.press("Home");
    assert.match(await scope.locator(".plot-readout").innerText(), /Time \(s\) 0.02,/);
    await scope.getByRole("button", { name: "Pan right" }).click();
    await inspect.focus();
    await inspect.press("Home");
    assert.match(await scope.locator(".plot-readout").innerText(), /Time \(s\) 0.03,/);
    await scope.getByRole("button", { name: "Reset view" }).click();
    await inspect.focus();
    await inspect.press("Home");
    assert.match(await scope.locator(".plot-readout").innerText(), /Time \(s\) 0,/);
    const spectrumInspect = spectrum.getByRole("slider", { name: "Amplitude spectrum inspect position" });
    await spectrumInspect.fill("200");
    assert.match(await spectrum.locator(".plot-readout").innerText(), /Frequency \(Hz\) 400, Peak amplitude \(V\) 2/);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForFunction(oldWidth => {
      const canvas = document.querySelector("canvas");
      return canvas && canvas.width !== oldWidth && canvas.width === Math.round(canvas.getBoundingClientRect().width * 2);
    }, initialWidth);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test("multiple traces use their own coordinates and preserve original buffers", async () => {
  const dev = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  const page = await browser.newPage();
  try {
    await dev.listen();
    await page.goto(`http://127.0.0.1:${dev.httpServer.address().port}`);
    await page.evaluate(async () => {
      const { createScientificPlot } = await import("/src/scientific-plot.ts");
      const plot = createScientificPlot({ title: "Overlay fixture", xLabel: "Time (s)", yLabel: "V" });
      const a = Float64Array.of(1, 2, 3);
      const b = Float64Array.of(30, 20, 10);
      plot.setTraces([
        { label: "Uniform", values: a, axis: { start: 0, step: 1 }, mode: "line" },
        { label: "Explicit", color: "#ff0000", values: b, axis: { coordinates: Float64Array.of(0, 0.4, 2) }, mode: "line" },
      ]);
      document.body.append(plot.root);
      window.verifyFixture = () => {
        const canvas = plot.root.querySelector("canvas");
        const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const hasOverlay = data.some((value, i) => i % 4 === 0 && value === 255 &&
          data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] > 0);
        plot.dispose();
        return { hasOverlay, a: [...a], b: [...b] };
      };
    });
    const plot = page.locator("figure").filter({ hasText: "Overlay fixture" });
    await plot.getByRole("slider").fill("200");
    assert.match(await plot.locator(".plot-readout").innerText(), /Uniform: Time \(s\) 0, V 1 · Explicit: Time \(s\) 0.4, V 20/);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(() => window.verifyFixture()), { hasOverlay: true, a: [1, 2, 3], b: [30, 20, 10] });
  } finally { await page.close(); await dev.close(); }
});

test("random-process lab switches models, updates PDFs, and exposes model-based checks", async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(origin + "/#/labs/random-processes");
    const process = page.getByLabel("Process model");
    const generate = page.getByRole("button", { name: "Generate ensemble" });
    await page.getByRole("heading", { name: "Random processes" }).waitFor();
    assert.ok(await page.locator(".scientific-plot figcaption .katex").count() >= 1);
    assert.ok(await page.locator(".random-property .katex").count() >= 1);
    await page.getByRole("tab", { name: "Stationarity & ergodicity" }).click();
    await process.selectOption("gaussian");
    await generate.click();
    await page.getByText("NO · model").first().waitFor();
    assert.equal(await page.getByText("PASS · model").count(), 2);
    assert.equal(await page.getByText("ACF ergodicity").count(), 1);
    assert.equal(await page.locator(".random-explanation .katex").count(), 1);

    await process.selectOption("poisson");
    await generate.click();
    await page.getByText("N/A · nonstationary").first().waitFor();
    assert.equal(await page.getByText("FAIL · model").count(), 2);

    await page.getByRole("tab", { name: "Statistics" }).click();
    const inspectLabel = await page.locator(".scientific-plot input[type=range]").first().getAttribute("aria-label");
    assert.doesNotMatch(inspectLabel, /\\[a-z]/i);
    await page.getByLabel("PDF sample position").fill("40");
    assert.equal(await page.locator("output").innerText(), "n = 40");
    assert.equal(await page.locator(".random-heatmap").count(), 0);
    assert.equal(await page.locator(".random-scatter").count(), 1);

    await process.selectOption("markov");
    assert.equal(await page.getByLabel("Transition probability p00").count(), 1);
    assert.equal(await page.getByLabel("Transition probability p11").count(), 1);
    await page.getByRole("tab", { name: "Stationarity & ergodicity" }).click();
    await generate.click();
    await page.getByText(/Markov chain.*24 paths/).waitFor();
    assert.equal(await page.getByText("PASS · model").count(), 2);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByLabel("Amplitude").waitFor();
    const samples = page.getByRole("spinbutton", { name: "Samples N" });
    assert.equal(await samples.inputValue(), "320");
    assert.equal(await page.getByLabel("Correlation lag ℓ").inputValue(), "8");
    assert.equal(await page.getByLabel("Amplitude").count(), 1);
    await samples.fill("128");
    const lag = page.getByLabel("Correlation lag ℓ");
    await lag.fill("33");
    await generate.click();
    assert.equal(await lag.getAttribute("aria-invalid"), "true");
    assert.match(await page.getByRole("status").innerText(), /Lag must be/);
    await page.getByRole("button", { name: "Reset", exact: true }).click();

    await page.setViewportSize({ width: 375, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test("random-process animation loops the signal, pauses, resets, and respects reduced motion", async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(origin + "/#/labs/random-processes");
    const plot = page.locator(".looping-signal-plot canvas");
    await page.waitForFunction(() => document.querySelector(".looping-signal-plot canvas")?.width > 0 &&
      document.querySelector(".random-status")?.textContent?.includes("Random-phase"));
    const initial = await plot.evaluate(canvas => canvas.toDataURL());
    await page.getByRole("button", { name: "Play signals" }).click();
    await page.waitForTimeout(500);
    assert.notEqual(await plot.evaluate(canvas => canvas.toDataURL()), initial);
    await page.getByRole("button", { name: "Pause signals" }).click();
    const paused = await plot.evaluate(canvas => canvas.toDataURL());
    await page.waitForTimeout(250);
    assert.equal(await plot.evaluate((canvas, image) => canvas.toDataURL() === image, paused), true);
    await page.getByLabel("Animation speed").selectOption("2");
    await page.getByRole("button", { name: "Restart animation" }).click();
    assert.equal(await page.getByRole("button", { name: "Play signals" }).getAttribute("aria-pressed"), "false");
    assert.equal(await plot.evaluate((canvas, image) => canvas.toDataURL() === image, initial), true);
    assert.equal(await page.locator(".random-sync-source").count(), 0);
  } finally { await page.close(); }

  const reduced = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await reduced.goto(origin + "/#/labs/random-processes");
    await reduced.getByRole("button", { name: "Play signals" }).waitFor();
    assert.equal(await reduced.getByRole("button", { name: "Play signals" }).isDisabled(), true);
  } finally { await reduced.close(); }
});
