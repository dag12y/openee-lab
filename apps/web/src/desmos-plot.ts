import { element } from "./ui";
import { attachClickZoomGuard } from "./zoom-guard";

export type DesmosTrace = Readonly<{
  label: string;
  color?: string;
  dashed?: boolean;
  mode: "line" | "stems";
  values: Float64Array;
  xStart: number;
  xStep: number;
}>;

export type DesmosPlotOptions = Readonly<{
  title: string;
  xLabel: string;
  yLabel: string;
  initialXMin: number;
  initialXMax: number;
  onViewportChange: (xMin: number, xMax: number) => readonly DesmosTrace[];
}>;

const fmt = (value: number) => {
  if (Math.abs(value) < 1e-12) return "0";
  return Number(value.toPrecision(4)).toString();
};

function niceStep(span: number, targetTicks: number): number {
  const raw = span / Math.max(2, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return mult * mag;
}

export function createDesmosPlot(options: DesmosPlotOptions) {
  const root = element("figure", undefined, "plot scientific-plot desmos-plot");
  const caption = element("figcaption");
  const summary = element("p", "", "summary");
  const legend = element("ul", undefined, "plot-legend");
  caption.append(element("strong", options.title), summary, legend);

  const controls = element("div", undefined, "plot-controls");
  const canvas = element("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const idleHint = "Drag to pan · click graph to enable scroll-zoom · or use Inspect position.";
  const activeHint = "Scroll-zoom active · click outside graph to scroll page.";
  const readout = element("p", idleHint, "plot-readout");
  const inspect = element("input");
  inspect.type = "range";
  inspect.min = "0";
  inspect.max = "1000";
  inspect.value = "500";
  inspect.setAttribute("aria-label", `${options.title} inspect position`);

  let xMin = options.initialXMin;
  let xMax = options.initialXMax;
  let traces: readonly DesmosTrace[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let hoverFrac: number | undefined;
  let dragging = false;
  let dragStartX = 0;
  let dragStartMin = 0;
  let dragStartMax = 0;
  let disposed = false;
  let frame = 0;
  let colors: string[] = [];

  const left = 64;
  const right = 14;
  const top = 14;
  const bottom = 44;

  const events = new AbortController();
  const listener = { signal: events.signal };

  function btn(label: string, onClick: () => void) {
    const b = element("button", label);
    b.type = "button";
    b.addEventListener("click", onClick, listener);
    controls.append(b);
    return b;
  }

  function refreshColors() {
    const css = getComputedStyle(document.documentElement);
    const palette = [css.getPropertyValue("--trace").trim() || "#087a75", "#ad6a2c", "#8064ae"];
    colors = traces.map((t, i) => t.color ?? palette[i % palette.length]!);
    Array.from(legend.children).forEach((item, i) =>
      (item as HTMLElement).style.setProperty("--series-color", colors[i]!),
    );
  }

  function recomputeViewport() {
    traces = options.onViewportChange(xMin, xMax);
    legend.replaceChildren(...traces.map(t => element("li", t.label)));
    refreshColors();
    const first = traces[0];
    if (first && first.values.length > 0) {
      let peakIdx = 0;
      for (let i = 1; i < first.values.length; i++) {
        if (Math.abs(first.values[i]!) > Math.abs(first.values[peakIdx]!)) peakIdx = i;
      }
      summary.textContent = `Window [${fmt(xMin)}, ${fmt(xMax)}] · ${first.label} peak ${fmt(first.values[peakIdx]!)} at ${fmt(first.xStart + peakIdx * first.xStep)}.`;
    } else {
      summary.textContent = `Window [${fmt(xMin)}, ${fmt(xMax)}].`;
    }
    if (hoverFrac !== undefined) updateReadout(hoverFrac);
    schedule();
  }

  function zoomAround(centerFrac: number, factor: number) {
    const span = xMax - xMin;
    const nextSpan = Math.max(1e-5, Math.min(1e5, span * factor));
    const anchor = xMin + centerFrac * span;
    xMin = anchor - centerFrac * nextSpan;
    xMax = anchor + (1 - centerFrac) * nextSpan;
    recomputeViewport();
  }

  function panBy(frac: number) {
    const shift = (xMax - xMin) * frac;
    xMin += shift;
    xMax += shift;
    recomputeViewport();
  }

  btn("Zoom in", () => zoomAround(0.5, 0.5));
  btn("Zoom out", () => zoomAround(0.5, 2));
  btn("Pan left", () => panBy(-0.25));
  btn("Pan right", () => panBy(0.25));
  btn("Reset view", () => {
    xMin = options.initialXMin;
    xMax = options.initialXMax;
    hoverFrac = undefined;
    readout.textContent = zoomGuard.isActive() ? activeHint : idleHint;
    recomputeViewport();
  });

  root.append(caption, controls, element("div", options.yLabel, "axis-label"), canvas, inspect, readout);

  function updateReadout(frac: number) {
    hoverFrac = Math.min(1, Math.max(0, frac));
    inspect.value = String(Math.round(hoverFrac * 1000));
    const xTarget = xMin + hoverFrac * (xMax - xMin);
    const parts = traces.map(t => {
      if (t.values.length === 0) return "";
      const idx = Math.max(0, Math.min(t.values.length - 1, Math.round((xTarget - t.xStart) / (t.xStep || 1))));
      const xv = t.xStart + idx * t.xStep;
      return `${t.label}: ${fmt(xv)} → ${fmt(t.values[idx]!)}`;
    }).filter(Boolean);
    readout.textContent = parts.join(" · ");
    inspect.setAttribute("aria-valuetext", readout.textContent);
    schedule();
  }

  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartMin = xMin;
    dragStartMax = xMax;
    canvas.setPointerCapture(e.pointerId);
  }, listener);

  canvas.addEventListener("pointermove", e => {
    const plotW = Math.max(1, width - left - right);
    if (dragging) {
      const dx = e.clientX - dragStartX;
      const span = dragStartMax - dragStartMin;
      const deltaX = -(dx / plotW) * span;
      xMin = dragStartMin + deltaX;
      xMax = dragStartMax + deltaX;
      recomputeViewport();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const frac = (e.clientX - rect.left - left) / plotW;
    updateReadout(frac);
  }, listener);

  canvas.addEventListener("pointerup", () => { dragging = false; }, listener);
  canvas.addEventListener("pointercancel", () => { dragging = false; }, listener);
  const zoomGuard = attachClickZoomGuard(canvas, {
    signal: events.signal,
    onStateChange(active) {
      if (hoverFrac === undefined) {
        readout.textContent = active ? activeHint : idleHint;
      }
    },
  });

  canvas.addEventListener("pointerleave", () => {
    if (!dragging && document.activeElement !== inspect) {
      hoverFrac = undefined;
      readout.textContent = zoomGuard.isActive() ? activeHint : idleHint;
      schedule();
    }
  }, listener);

  canvas.addEventListener("wheel", e => {
    if (!zoomGuard.isActive()) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const plotW = Math.max(1, width - left - right);
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - left) / plotW));
    const factor = e.deltaY < 0 ? 0.8 : 1.25;
    zoomAround(frac, factor);
  }, { passive: false, signal: events.signal });

  inspect.addEventListener("input", () => updateReadout(Number(inspect.value) / 1000), listener);

  function schedule() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (disposed || document.hidden) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(3, devicePixelRatio || 1);
    if (ratio !== dpr) dpr = ratio;
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (pw < 1 || ph < 1 || width <= left + right || height <= top + bottom) return;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    let lo = 0;
    let hi = 0;
    for (const t of traces) {
      for (let i = 0; i < t.values.length; i++) {
        const v = t.values[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    else {
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
    }

    const toPx = (xVal: number) => left + ((xVal - xMin) / (xMax - xMin)) * plotW;
    const toPy = (yVal: number) => top + ((hi - yVal) / (hi - lo)) * plotH;

    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim() || "#465b70";
    const border = css.getPropertyValue("--border").trim() || "#c9d4df";
    const ink = css.getPropertyValue("--ink").trim() || "#17283b";

    ctx.font = "12px system-ui";
    ctx.lineWidth = 1;
    ctx.strokeStyle = border;
    ctx.fillStyle = muted;

    // Adaptive Desmos-like grid ticks
    const xStepTick = niceStep(xMax - xMin, width < 460 ? 4 : 7);
    const firstTickX = Math.ceil(xMin / xStepTick) * xStepTick;
    ctx.beginPath();
    for (let xv = firstTickX; xv <= xMax + xStepTick * 1e-6; xv += xStepTick) {
      const px = toPx(xv);
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + plotH);
      ctx.textAlign = "center";
      ctx.fillText(fmt(xv), px, top + plotH + 17);
    }

    const yStepTick = niceStep(hi - lo, 4);
    const firstTickY = Math.ceil(lo / yStepTick) * yStepTick;
    for (let yv = firstTickY; yv <= hi + yStepTick * 1e-6; yv += yStepTick) {
      const py = toPy(yv);
      ctx.moveTo(left, py);
      ctx.lineTo(left + plotW, py);
      ctx.textAlign = "right";
      ctx.fillText(fmt(yv), left - 7, py + 4);
    }
    ctx.stroke();

    // Principal axes x=0 and y=0 if in view
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    if (xMin <= 0 && xMax >= 0) {
      const px0 = toPx(0);
      ctx.moveTo(px0, top);
      ctx.lineTo(px0, top + plotH);
    }
    if (lo <= 0 && hi >= 0) {
      const py0 = toPy(0);
      ctx.moveTo(left, py0);
      ctx.lineTo(left + plotW, py0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    ctx.fillText(options.xLabel, left + plotW / 2, height - 5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, plotW, plotH);
    ctx.clip();

    traces.forEach((trace, idx) => {
      ctx.strokeStyle = ctx.fillStyle = colors[idx]!;
      ctx.lineWidth = trace.dashed ? 1.5 : 2;
      ctx.setLineDash(trace.dashed ? [6, 4] : []);
      ctx.beginPath();
      const yZero = toPy(0);
      for (let i = 0; i < trace.values.length; i++) {
        const px = toPx(trace.xStart + i * trace.xStep);
        const py = toPy(trace.values[i]!);
        if (trace.mode === "stems") {
          if (Math.abs(py - yZero) < 0.5) continue;
          ctx.moveTo(px, yZero);
          ctx.lineTo(px, py);
        } else {
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    });
    ctx.restore();

    if (hoverFrac !== undefined && traces.length > 0) {
      const px = left + hoverFrac * plotW;
      ctx.strokeStyle = colors[1] ?? "#ad6a2c";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + plotH);
      ctx.stroke();
    }
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    schedule();
  });
  resize.observe(canvas);

  const theme = matchMedia("(prefers-color-scheme: dark)");
  theme.addEventListener("change", () => { refreshColors(); schedule(); }, listener);

  return {
    root,
    setBounds(nextMin: number, nextMax: number) {
      xMin = nextMin;
      xMax = nextMax;
      recomputeViewport();
    },
    refresh() {
      recomputeViewport();
    },
    getBounds() {
      return { xMin, xMax };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      events.abort();
      resize.disconnect();
    },
  };
}
