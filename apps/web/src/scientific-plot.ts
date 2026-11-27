import { element } from "./ui";
import { attachClickZoomGuard } from "./zoom-guard";

/** The producer owns finite samples and ascending coordinates with matching lengths.
 * Keep these buffers unchanged while the plot uses them.
 */
export type ScientificTrace = Readonly<{
  label: string;
  color?: string;
  values: Float64Array;
  axis: { start: number; step: number } | { coordinates: Float64Array };
  mode: "line" | "stems";
}>;
export type ScientificPlotOptions = {
  title: string; xLabel: string; yLabel: string; playback?: boolean;
};

const format = (value: number) => Number(value.toPrecision(4)).toString();
const xAt = (trace: ScientificTrace, index: number): number =>
  "coordinates" in trace.axis ? trace.axis.coordinates[index]! :
    trace.axis.start + index * trace.axis.step;

function lowerBound(trace: ScientificTrace, value: number): number {
  let lo = 0, hi = trace.values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xAt(trace, mid) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createScientificPlot(options: ScientificPlotOptions) {
  const root = element("figure", undefined, "plot scientific-plot");
  const caption = element("figcaption");
  const summary = element("p", "", "summary");
  const legend = element("ul", undefined, "plot-legend");
  caption.append(element("strong", options.title), summary, legend);
  const controls = element("div", undefined, "plot-controls");
  const canvas = element("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const readout = element("p", "Move over the chart or use Inspect position.", "plot-readout");
  const inspect = element("input");
  inspect.type = "range";
  inspect.min = "0";
  inspect.max = "1000";
  inspect.value = "0";
  inspect.setAttribute("aria-label", options.title + " inspect position");

  const events = new AbortController();
  const listener = { signal: events.signal };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  const cache = document.createElement("canvas");
  const base = cache.getContext("2d");
  const screen = canvas.getContext("2d");
  let traces: readonly ScientificTrace[] = [];
  let minX = 0, maxX = 0, low = 0, high = 0;
  let zoom = 1, pan = 0, cursor = 0, speed = 1;
  let width = 0, height = 0, dpr = 1;
  let hover: number | undefined;
  let crossX = 0, crossY = 0;
  let dirty = true, playing = false, disposed = false;
  let frame = 0, previousTime: number | undefined;
  let colors: string[] = [];
  const left = 66, right = 14, top = 14, bottom = 46;
  const viewStart = () => minX + (maxX - minX) * pan;
  const viewSpan = () => (maxX - minX) / zoom;

  function schedule() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(render);
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  function bounds() {
    invalidate();
  }

  function button(label: string, action: () => void) {
    const control = element("button", label);
    control.type = "button";
    control.addEventListener("click", action, listener);
    controls.append(control);
    return control;
  }

  let play: HTMLButtonElement | undefined;
  if (options.playback) {
    play = button("Play cursor", () => {
      playing = !playing;
      previousTime = undefined;
      updatePlayback();
    });
    const rate = element("select");
    rate.setAttribute("aria-label", "Cursor playback speed");
    for (const value of [0.25, 0.5, 1, 2, 4]) {
      const option = element("option", value + "×");
      option.value = String(value);
      rate.append(option);
    }
    rate.value = "1";
    rate.addEventListener("change", () => { speed = Number(rate.value); }, listener);
    controls.append(rate);
  }

  function updatePlayback() {
    if (play) {
      play.disabled = motion.matches;
      play.textContent = playing ? "Pause cursor" : "Play cursor";
    }
    schedule();
  }

  function changeZoom(multiplier: number, anchorFrac = 0.5) {
    const anchorPan = pan + anchorFrac / zoom;
    zoom = Math.max(0.25, Math.min(64, zoom * multiplier));
    pan = anchorPan - anchorFrac / zoom;
    bounds();
    if (hover !== undefined) showInspection(hover);
  }

  button("Zoom in", () => changeZoom(2));
  button("Zoom out", () => changeZoom(0.5));
  function shift(direction: number) {
    pan += direction * 0.25 / zoom;
    bounds();
    if (hover !== undefined) showInspection(hover);
  }
  button("Pan left", () => shift(-1));
  button("Pan right", () => shift(1));
  button("Reset view", () => { zoom = 1; pan = 0; cursor = 0; bounds(); clearInspection(); });
  root.append(caption, controls, element("div", options.yLabel, "axis-label"), canvas, inspect, readout);
  updatePlayback();

  function showInspection(fraction: number) {
    hover = Math.min(1, Math.max(0, fraction));
    inspect.value = String(Math.round(hover * 1000));
    const target = viewStart() + viewSpan() * hover;
    const readings = traces.map((trace, series) => {
      const after = Math.min(trace.values.length - 1, lowerBound(trace, target));
      const before = Math.max(0, after - 1);
      const index = Math.abs(xAt(trace, before) - target) < Math.abs(xAt(trace, after) - target) ? before : after;
      if (series === 0) { crossX = xAt(trace, index); crossY = trace.values[index]!; }
      return `${trace.label}: ${options.xLabel} ${format(xAt(trace, index))}, ${options.yLabel} ${format(trace.values[index]!)}`;
    });
    readout.textContent = readings.join(" · ");
    inspect.setAttribute("aria-valuetext", readout.textContent);
    schedule();
  }

  function clearInspection() {
    hover = undefined;
    inspect.removeAttribute("aria-valuetext");
    readout.textContent = "Move over the chart or use Inspect position.";
    schedule();
  }
  let dragPanning = false;
  let dragStartX = 0;
  let dragStartPan = 0;

  canvas.addEventListener("pointerdown", e => {
    dragPanning = true;
    dragStartX = e.clientX;
    dragStartPan = pan;
    canvas.setPointerCapture(e.pointerId);
  }, listener);
  canvas.addEventListener("pointermove", e => {
    const rect = canvas.getBoundingClientRect();
    const plotW = Math.max(1, width - left - right);
    if (dragPanning) {
      const dx = e.clientX - dragStartX;
      pan = dragStartPan - (dx / plotW) / zoom;
      bounds();
      return;
    }
    if (width > left + right) showInspection((e.clientX - rect.left - left) / plotW);
  }, listener);
  const zoomGuard = attachClickZoomGuard(canvas, { signal: events.signal });
  canvas.addEventListener("pointerup", () => { dragPanning = false; }, listener);
  canvas.addEventListener("pointercancel", () => { dragPanning = false; }, listener);
  canvas.addEventListener("wheel", e => {
    if (!zoomGuard.isActive()) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const plotW = Math.max(1, width - left - right);
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - left) / plotW));
    changeZoom(e.deltaY < 0 ? 1.25 : 0.8, frac);
  }, { passive: false, signal: events.signal });
  canvas.addEventListener("pointerleave", () => {
    if (dragPanning) return;
    if (document.activeElement === inspect) showInspection(Number(inspect.value) / 1000);
    else clearInspection();
  }, listener);
  inspect.addEventListener("input", () => showInspection(Number(inspect.value) / 1000), listener);
  inspect.addEventListener("focus", () => showInspection(Number(inspect.value) / 1000), listener);
  inspect.addEventListener("blur", clearInspection, listener);

  function drawBase(plotWidth: number, plotHeight: number) {
    if (!base) return;
    base.setTransform(dpr, 0, 0, dpr, 0, 0);
    base.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => css.getPropertyValue(token).trim();
    const scale = Math.max(Math.abs(low), high) || 1;
    const lo = low / scale, hi = high / scale || (low === 0 ? 1 : 0);
    const y = (value: number) => top + (hi - value / scale) / (hi - lo) * plotHeight;
    const start = viewStart(), span = viewSpan();
    const x = (value: number) => left + (span === 0 ? 0 : (value - start) / span) * plotWidth;
    base.font = "12px system-ui";
    base.lineWidth = 1;
    const columns = span === 0 ? 0 : width < 470 ? 2 : 4;
    base.fillStyle = color("--muted");
    base.strokeStyle = color("--border");
    base.beginPath();
    for (let i = 0; i <= columns; i++) {
      const fraction = columns ? i / columns : 0;
      const px = left + fraction * plotWidth;
      base.moveTo(px, top); base.lineTo(px, top + plotHeight);
      base.textAlign = i === 0 ? "left" : i === columns ? "right" : "center";
      base.fillText(format(start + fraction * span), px, top + plotHeight + 17);
    }
    for (let i = 0; i <= 4; i++) {
      const py = top + i / 4 * plotHeight;
      base.moveTo(left, py); base.lineTo(left + plotWidth, py);
      base.textAlign = "right";
      base.fillText(format((hi - i / 4 * (hi - lo)) * scale), left - 7, py + 4);
    }
    base.stroke();
    base.textAlign = "center";
    base.fillText(options.xLabel, left + plotWidth / 2, height - 5);
    base.save();
    base.beginPath();
    base.rect(left - 1, top - 1, plotWidth + 2, plotHeight + 2);
    base.clip();
    traces.forEach((trace, series) => {
      const from = Math.max(0, lowerBound(trace, start) - 1);
      const to = Math.min(trace.values.length, lowerBound(trace, start + span) + 1);
      base.strokeStyle = base.fillStyle = colors[series]!;
      base.lineWidth = 1.5;
      base.setLineDash(trace.mode === "line" && series % 2 ? [5, 3] : []);
      base.beginPath();
      for (let i = from; i < to; i++) {
        const px = x(xAt(trace, i)), py = y(trace.values[i]!);
        if (trace.mode === "stems" && Math.abs(py - y(0)) < 0.5) continue;
        if (trace.mode === "stems") base.moveTo(px, y(0));
        else if (i === from) base.moveTo(px, py);
        base.lineTo(px, py);
        if (trace.values.length === 1) base.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      base.stroke();
    });
    base.restore();
  }

  function drawCursor(ctx: CanvasRenderingContext2D, fraction: number, color: string,
    plotWidth: number, plotHeight: number) {
    const px = left + fraction * plotWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + plotHeight);
    ctx.stroke();
  }

  function render(time: number) {
    frame = 0;
    if (disposed || document.hidden || !screen) return;
    const ratio = Math.min(3, devicePixelRatio || 1);
    if (ratio !== dpr) { dpr = ratio; dirty = true; }
    const pixelsWide = Math.round(width * dpr), pixelsHigh = Math.round(height * dpr);
    if (pixelsWide < 1 || pixelsHigh < 1 || width <= left + right || height <= top + bottom) return;
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh ||
        cache.width !== pixelsWide || cache.height !== pixelsHigh) {
      canvas.width = cache.width = pixelsWide;
      canvas.height = cache.height = pixelsHigh;
      dirty = true;
    }
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    if (dirty) { drawBase(plotWidth, plotHeight); dirty = false; }
    screen.setTransform(1, 0, 0, 1, 0, 0);
    screen.clearRect(0, 0, pixelsWide, pixelsHigh);
    screen.drawImage(cache, 0, 0);
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (playing) {
      if (previousTime !== undefined) cursor = (cursor + (time - previousTime) * speed / 3000) % 1;
      previousTime = time;
    }

    if (options.playback && traces.length) drawCursor(screen, cursor, colors[0]!, plotWidth, plotHeight);
    if (hover !== undefined && traces.length) {
      const start = viewStart(), span = viewSpan();
      const fraction = span === 0 ? 0 : (crossX - start) / span;
      if (fraction >= 0 && fraction <= 1) {
        const color = colors[1] ?? "#a67429";
        drawCursor(screen, fraction, color, plotWidth, plotHeight);
        const scale = Math.max(Math.abs(low), high) || 1;
        const lo = low / scale, hi = high / scale || (low === 0 ? 1 : 0);
        const y = top + (hi - crossY / scale) / (hi - lo) * plotHeight;
        screen.beginPath();
        screen.moveTo(left, y);
        screen.lineTo(left + plotWidth, y);
        screen.stroke();
      }
    }
    if (playing) schedule();
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    invalidate();
  });
  resize.observe(canvas);
  window.addEventListener("resize", invalidate, listener);
  function refreshColors() {
    const css = getComputedStyle(document.documentElement);
    const palette = [css.getPropertyValue("--trace").trim(), "#ad6a2c", "#8064ae"];
    colors = traces.map((trace, i) => trace.color ?? palette[i % palette.length]!);
    Array.from(legend.children).forEach((item, i) =>
      (item as HTMLElement).style.setProperty("--series-color", colors[i]!));
  }
  theme.addEventListener("change", () => { refreshColors(); invalidate(); }, listener);
  motion.addEventListener("change", () => {
    if (motion.matches) playing = false;
    previousTime = undefined;
    updatePlayback();
  }, listener);
  document.addEventListener("visibilitychange", () => {
    previousTime = undefined;
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  }, listener);

  return {
    root,
    setTraces(next: readonly ScientificTrace[]) {
      traces = next.filter(trace => trace.values.length > 0);
      minX = Infinity; maxX = -Infinity; low = high = 0;
      const summaries = traces.map(trace => {
        minX = Math.min(minX, xAt(trace, 0));
        maxX = Math.max(maxX, xAt(trace, trace.values.length - 1));
        let peak = 0;
        trace.values.forEach((value, i) => {
          low = Math.min(low, value);
          high = Math.max(high, value);
          if (Math.abs(value) > Math.abs(trace.values[peak]!)) peak = i;
        });
        return `${trace.label} · ${trace.values.length} values · largest absolute value ${format(trace.values[peak]!)} at ${format(xAt(trace, peak))}. ${options.xLabel} / ${options.yLabel}.`;
      });
      if (!traces.length) minX = maxX = 0;
      summary.textContent = summaries.join(" ");
      legend.replaceChildren(...traces.map(trace => element("li", trace.label)));
      refreshColors();
      bounds();
      if (hover !== undefined) showInspection(hover);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      events.abort();
      resize.disconnect();
    },
  };
}
