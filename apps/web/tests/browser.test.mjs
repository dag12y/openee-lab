import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { preview } from "vite";

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
    await page.getByRole("button", { name: "Reset" }).click();
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
    await page.getByRole("button", { name: "Reset" }).click();
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
    await slider.fill("5.25");
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
    await page.getByRole("button", { name: "Reset" }).click();
    await page.clock.runFor(220);
    assert.equal(await input.inputValue(), "2");
    assert.equal(await page.evaluate(() => window.testWorkers.length), 3);
    await page.getByRole("button", { name: "Run simulation" }).click();
    assert.equal(await page.evaluate(() => window.testWorkers[3].request.model.carrierAmplitude), 2);
  } finally { await page.close(); }
});
