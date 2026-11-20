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

test("guest keyboard navigation and actual worker output, validation and reset", async () => {
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
    const run = page.getByRole("button", { name: "Run simulation" });
    await page.getByLabel("Sample count").fill("2049");
    await run.click();
    await page.getByText("This batch is limited to 2048 samples.", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Sample count").getAttribute("aria-invalid"), "true");
    await page.getByRole("button", { name: "Reset" }).click();
    assert.equal(await page.getByLabel("Sample count").inputValue(), "320");
    await page.getByLabel("Carrier amplitude").fill("4");
    await run.click();
    await page.getByText("Amplitude spectrum", { exact: true }).waitFor();
    assert.equal(await page.locator("canvas").count(), 2);
    assert.match(await page.locator("figcaption").nth(0).innerText(), /largest absolute value 6 at 0/);
    assert.match(await page.locator("figcaption").nth(1).innerText(), /largest absolute value 4 at 400/);
    if (process.env.LAB_SCREENSHOT) await page.screenshot({ path: process.env.LAB_SCREENSHOT, fullPage: true });
    await page.getByLabel("Carrier amplitude").fill("3");
    assert.equal(await page.locator("canvas").count(), 0);
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
    await run.click();
    await page.getByRole("button", { name: "Cancel run" }).click();
    await page.getByText("Run cancelled.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.testWorkers[0].terminated), true);
    await run.click();
    await page.getByLabel("Message frequency").fill("60");
    await page.evaluate(() => window.testWorkers[1].late({ data: { status: "success" } }));
    assert.equal(await page.locator("canvas").count(), 0);
    assert.equal(await page.evaluate(() => window.testWorkers[1].terminated), true);
    await run.click();
    await page.evaluate(() => window.testWorkers[2].onerror(new Error("test")));
    await page.getByText("Run did not complete.", { exact: true }).waitFor();
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
    await run.click();
    await page.getByText(/mismatched response/).waitFor();
    await page.evaluate(() => { window.largeOutput = true; });
    await run.click();
    await page.getByText(/browser worker could not complete/).waitFor();
    assert.equal(await page.locator("canvas").count(), 0);
  } finally { await page.close(); }
});
