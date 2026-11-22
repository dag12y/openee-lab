import {
  maxSeriesEpicyclePhasors,
  type SeriesAnalysis,
} from "../../../packages/engine-communications/src/ch1/s3/index.js";
import { element } from "./ui";

const TAU = 2 * Math.PI;

export function createSeriesEpicycleView() {
  const root = element("section", undefined, "panel s3-side-card");
  const head = element("div", undefined, "s3-card-head");
  head.append(element("h3", "Series Epicycles (Phasor Projection)"));

  const controls = element("div", undefined, "plot-controls");
  let playing = true;
  let speed = 1;
  let zoomScale = 1;
  let showCircles = true;
  let showTargetWave = true;
  let maxPhasors = 50;
  let active = false;
  let disposed = false;
  let frame = 0;
  let theta = 0;
  let lastTime: number | undefined;
  let analysis: SeriesAnalysis | undefined;
  let width = 560;
  let height = 300;
  const waveHistory: Array<{ y: number; exact: number }> = [];

  const playBtn = element("button", "Pause");
  playBtn.type = "button";
  playBtn.addEventListener("click", () => {
    playing = !playing;
    lastTime = undefined;
    playBtn.textContent = playing ? "Pause" : "Play";
    if (playing) schedule();
  });

  const speedSel = element("select");
  speedSel.setAttribute("aria-label", "Series epicycle speed");
  for (const s of [0.25, 0.5, 1, 2]) {
    const opt = element("option", `${s}×`);
    opt.value = String(s);
    speedSel.append(opt);
  }
  speedSel.value = "1";
  speedSel.addEventListener("change", () => { speed = Number(speedSel.value); });

  const zoomSel = element("select");
  zoomSel.setAttribute("aria-label", "Series epicycle zoom");
  for (const z of [1, 1.5, 2]) {
    const opt = element("option", `Zoom ${z}×`);
    opt.value = String(z);
    zoomSel.append(opt);
  }
  zoomSel.value = "1";
  zoomSel.addEventListener("change", () => {
    zoomScale = Number(zoomSel.value);
    waveHistory.length = 0;
    schedule();
  });

  const circleBtn = element("button", "Circles: On");
  circleBtn.type = "button";
  circleBtn.addEventListener("click", () => {
    showCircles = !showCircles;
    circleBtn.textContent = showCircles ? "Circles: On" : "Circles: Off";
    schedule();
  });

  const refBtn = element("button", "Ref: On");
  refBtn.type = "button";
  refBtn.addEventListener("click", () => {
    showTargetWave = !showTargetWave;
    refBtn.textContent = showTargetWave ? "Ref: On" : "Ref: Off";
    schedule();
  });

  const phasorWrap = element("div", undefined, "s3-phasor-slider");
  const phasorLabel = element("label", "Phasors: 50", "s3-inline-label");
  const phasorRange = element("input");
  phasorRange.type = "range";
  phasorRange.min = "1";
  phasorRange.max = String(maxSeriesEpicyclePhasors);
  phasorRange.value = "50";
  phasorRange.setAttribute("aria-label", "Epicycle phasor count");
  phasorRange.addEventListener("input", () => {
    maxPhasors = Number(phasorRange.value);
    phasorLabel.textContent = `Phasors: ${maxPhasors}`;
    waveHistory.length = 0;
    schedule();
  });
  phasorWrap.append(phasorLabel, phasorRange);

  controls.append(playBtn, speedSel, zoomSel, circleBtn, refBtn, phasorWrap);

  const canvas = element("canvas");
  canvas.className = "s3-epi-series-canvas";
  canvas.width = 560;
  canvas.height = 300;

  const readout = element("p", "Rotating sum of harmonics projecting x_K(t).", "plot-readout");
  root.append(head, controls, canvas, readout);

  function render(now: number) {
    frame = 0;
    if (disposed || !active || document.hidden || !analysis) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = Math.min(3, devicePixelRatio || 1);
    const pw = Math.round(width * ratio);
    const ph = Math.round(height * ratio);
    if (pw < 1 || ph < 1) return;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }

    const w = width;
    const h = height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const css = getComputedStyle(document.documentElement);
    const trace = css.getPropertyValue("--trace").trim() || "#087a75";
    const muted = css.getPropertyValue("--muted").trim() || "#465b70";
    const border = css.getPropertyValue("--border").trim() || "#c9d4df";

    if (playing) {
      if (lastTime !== undefined) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        theta += dt * speed * 1.45;
      }
      lastTime = now;
    }

    ctx.clearRect(0, 0, w, h);

    // Geometry: epicycle center on left (~28% width), vertical projection divider at ~48% width, wave sweeps right
    const originX = w * 0.24;
    const centerY = h * 0.5;
    const waveLeft = w * 0.46;
    const waveWidth = w - waveLeft - 14;

    const pool = analysis.epicycleHarmonics ?? analysis.harmonics;
    const countUsed = Math.min(maxPhasors, pool.length);
    const activeHarmonics = pool.slice(0, countUsed);

    // Compute robust scale based on peak waveform magnitude (~sqrt(totalPower)*1.4 or fundamental Cn)
    const rmsRef = Math.sqrt(Math.max(1e-6, analysis.totalPower));
    const leadMag = (pool[0]?.cnMag ?? 0) + Math.abs(analysis.a0);
    const amplitudeRef = Math.max(0.5, rmsRef * 1.35, leadMag * 1.1);
    const baseScale = (Math.min(originX * 1.4, h * 0.78) * 0.45) / amplitudeRef;
    const scale = baseScale * zoomScale;

    // Subtle polar reference rings around phasor origin
    ctx.strokeStyle = border;
    ctx.lineWidth = 0.85;
    for (const rMul of [0.5, 1.0, 1.5]) {
      const rr = rMul * amplitudeRef * scale * 0.65;
      if (rr > 8 && rr < originX * 1.1) {
        ctx.beginPath();
        ctx.arc(originX, centerY, rr, 0, TAU);
        ctx.stroke();
      }
    }

    // Horizontal centerline + sweep axis divider
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, centerY);
    ctx.lineTo(w - 12, centerY);
    ctx.moveTo(originX, 12);
    ctx.lineTo(originX, h - 12);
    ctx.moveTo(waveLeft, 12);
    ctx.lineTo(waveLeft, h - 12);
    ctx.stroke();

    // Rotate phasor chain so y_up = a0 + sum C_n cos(n * theta + theta_n)
    let cx = originX;
    let cy = centerY - analysis.a0 * scale;

    for (let i = 0; i < activeHarmonics.length; i++) {
      const coef = activeHarmonics[i]!;
      if (coef.cnMag < 1e-8) continue;
      const phi = coef.n * theta + coef.thetaN;
      const rPx = coef.cnMag * scale;
      const nx = cx + rPx * Math.sin(phi);
      const ny = cy - rPx * Math.cos(phi);

      if (showCircles && rPx > 1.1) {
        ctx.strokeStyle = muted;
        ctx.globalAlpha = Math.max(0.14, 0.34 - i * 0.005);
        ctx.lineWidth = i === 0 ? 1.2 : 0.9;
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, TAU);
        ctx.stroke();
      }

      if (rPx > 0.6) {
        ctx.strokeStyle = i === 0 ? "#d97706" : i < 4 ? "#e08e26" : "#b45309";
        ctx.globalAlpha = i < 6 ? 0.92 : 0.7;
        ctx.lineWidth = i === 0 ? 1.85 : 1.25;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }

      cx = nx;
      cy = ny;
    }
    ctx.globalAlpha = 1;

    // Also evaluate high-order reference sum for dashed comparison curve
    let fullSum = analysis.a0;
    for (const coef of pool) {
      if (coef.cnMag < 1e-8) continue;
      fullSum += coef.cnMag * Math.cos(coef.n * theta + coef.thetaN);
    }
    const exactY = centerY - fullSum * scale;

    const valY = (centerY - cy) / scale;
    if (playing || waveHistory.length === 0) {
      waveHistory.unshift({ y: cy, exact: exactY });
      const maxPts = Math.max(32, Math.floor(waveWidth / 1.4));
      if (waveHistory.length > maxPts) waveHistory.length = maxPts;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(waveLeft, 8, waveWidth + 6, h - 16);
    ctx.clip();

    // Dashed full-N reference wave behind swept trace
    if (showTargetWave && waveHistory.length > 1) {
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.35;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < waveHistory.length; i++) {
        const px = waveLeft + i * 1.4;
        const py = waveHistory[i]!.exact;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Active swept trace from rotating K phasors
    if (waveHistory.length > 1) {
      ctx.strokeStyle = trace;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < waveHistory.length; i++) {
        const px = waveLeft + i * 1.4;
        const py = waveHistory[i]!.y;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Projection beam from tip to wave start
    ctx.strokeStyle = "#d97706";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(waveLeft, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Active tip halo & marker
    ctx.fillStyle = "rgba(217, 119, 6, 0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, 7.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8, 0, TAU);
    ctx.fill();

    readout.textContent = `x_K(θ) = ${valY.toFixed(3)} V · Active phasors: ${countUsed} (max ${maxSeriesEpicyclePhasors})`;
    if (playing) schedule();
  }

  function schedule() {
    if (!frame && !disposed && active && !document.hidden) {
      frame = requestAnimationFrame(render);
    }
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = Math.max(240, entry.contentRect.width);
    height = Math.max(180, entry.contentRect.height);
    schedule();
  });
  resize.observe(canvas);

  return {
    root,
    setActive(nextActive: boolean) {
      active = nextActive;
      if (!active) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = undefined;
      } else {
        lastTime = undefined;
        schedule();
      }
    },
    setAnalysis(next: SeriesAnalysis) {
      analysis = next;
      const pool = next.epicycleHarmonics ?? next.harmonics;
      const cap = Math.min(maxSeriesEpicyclePhasors, pool.length);
      phasorRange.max = String(Math.max(1, cap));
      if (maxPhasors > cap) {
        maxPhasors = cap;
      }
      phasorRange.value = String(maxPhasors);
      phasorLabel.textContent = `Phasors: ${maxPhasors}`;
      waveHistory.length = 0;
      lastTime = undefined;
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
    },
  };
}
