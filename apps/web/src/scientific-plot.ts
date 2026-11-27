import { element } from "./ui";
import { plainMathText, renderMathText } from "./math-text";

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
const MIN_ZOOM = 1 / 8;
const MAX_ZOOM = 256;
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
  const plainTitle = plainMathText(options.title);
  const plainXLabel = plainMathText(options.xLabel);
  const plainYLabel = plainMathText(options.yLabel);
  const root = element("figure", undefined, "plot scientific-plot");
  const caption = element("figcaption");
  const summary = element("p", "", "summary");
  const legend = element("ul", undefined, "plot-legend");
  caption.append(renderMathText(element("strong"), options.title), summary, legend);
  const controls = element("div", undefined, "plot-controls");
  const canvas = element("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const readout = element("div", "Move over the chart or use Inspect position.", "plot-readout");
  const inspect = element("input");
  inspect.type = "range";
  inspect.min = "0";
  inspect.max = "1000";
  inspect.value = "0";
  inspect.setAttribute("aria-label", plainTitle + " inspect position");

  const events = new AbortController();
  const listener = { signal: events.signal };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  const cache = document.createElement("canvas");
  const base = cache.getContext("2d");
  const screen = canvas.getContext("2d");
  let traces: readonly ScientificTrace[] = [];
  let minX = 0, maxX = 0, low = 0, high = 0;
  let zoomX = 1, panX = 0, zoomY = 1, panY = 0, cursor = 0, speed = 1;
  let width = 0, height = 0, dpr = 1;
  let hover: number | undefined;
  let crossX = 0, crossY = 0;
  let dirty = true, playing = false, disposed = false;
  let frame = 0, previousTime: number | undefined;
  let colors: string[] = [];
  const left = 66, right = 14, top = 14, bottom = 46;
  const viewStart = () => minX + (maxX - minX) * panX;
  const viewSpan = () => (maxX - minX) / zoomX;
  const viewLow = () => low + (high - low) * panY;
  const viewHigh = () => viewLow() + (high - low) / zoomY;

  function schedule() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(render);
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  function bounds() {
    const xExtent = 1 - 1 / zoomX, yExtent = 1 - 1 / zoomY;
    panX = Math.max(Math.min(0, xExtent), Math.min(Math.max(0, xExtent), panX));
    panY = Math.max(Math.min(0, yExtent), Math.min(Math.max(0, yExtent), panY));
    invalidate();
  }

  function button(label: string, action: () => void, accessibleLabel?: string, parent: HTMLElement = controls) {
    const control = element("button", label);
    control.type = "button";
    if (accessibleLabel) {
      control.setAttribute("aria-label", accessibleLabel);
      control.title = accessibleLabel;
    }
    control.addEventListener("click", action, listener);
    parent.append(control);
    return control;
  }

  function zoomButton(label: string, zoomIn: boolean, action: () => void, parent: HTMLElement) {
    const control = button("", action, label, parent);
    control.classList.add("plot-zoom-button");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("plot-zoom-icon");
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    circle.setAttribute("cx", "10");
    circle.setAttribute("cy", "10");
    circle.setAttribute("r", "6.5");
    const handle = document.createElementNS(svg.namespaceURI, "path");
    handle.setAttribute("d", "m15 15 6 6");
    const mark = document.createElementNS(svg.namespaceURI, "path");
    mark.setAttribute("d", zoomIn ? "M7.5 10h5M10 7.5v5" : "M7.5 10h5");
    for (const shape of [circle, handle, mark]) {
      shape.setAttribute("fill", "none");
      shape.setAttribute("stroke", "currentColor");
      shape.setAttribute("stroke-width", "1.8");
      shape.setAttribute("stroke-linecap", "round");
      shape.setAttribute("stroke-linejoin", "round");
      svg.append(shape);
    }
    control.append(svg);
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

  function changeZoom(axis: "x" | "y", multiplier: number) {
    if (axis === "x") {
      const center = panX + 0.5 / zoomX;
      zoomX = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomX * multiplier));
      panX = center - 0.5 / zoomX;
    } else {
      const center = panY + 0.5 / zoomY;
      zoomY = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomY * multiplier));
      panY = center - 0.5 / zoomY;
    }
    bounds();
    if (hover !== undefined) showInspection(hover);
  }

  function zoomGroup(axis: "X" | "Y") {
    const group = element("div", undefined, "plot-zoom-group");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `${axis}-axis zoom controls`);
    group.append(element("span", `${axis} axis`, "plot-zoom-label"));
    controls.append(group);
    return group;
  }

  const xZoomGroup = zoomGroup("X");
  const yZoomGroup = zoomGroup("Y");
  zoomButton("Zoom X in", true, () => changeZoom("x", 2), xZoomGroup);
  zoomButton("Zoom X out", false, () => changeZoom("x", 0.5), xZoomGroup);
  zoomButton("Zoom Y in", true, () => changeZoom("y", 2), yZoomGroup);
  zoomButton("Zoom Y out", false, () => changeZoom("y", 0.5), yZoomGroup);
  button("Reset view", () => {
    zoomX = zoomY = 1;
    panX = panY = 0;
    cursor = 0;
    bounds();
    clearInspection();
  });
  root.append(caption, controls, renderMathText(element("div", undefined, "axis-label"), options.yLabel),
    canvas, inspect, readout);
  updatePlayback();

  function showInspection(fraction: number) {
    hover = Math.min(1, Math.max(0, fraction));
    inspect.value = String(Math.round(hover * 1000));
    const target = viewStart() + viewSpan() * hover;
    readout.replaceChildren();
    const readings = traces.map((trace, series) => {
      const after = Math.min(trace.values.length - 1, lowerBound(trace, target));
      const before = Math.max(0, after - 1);
      const index = Math.abs(xAt(trace, before) - target) < Math.abs(xAt(trace, after) - target) ? before : after;
      if (series === 0) { crossX = xAt(trace, index); crossY = trace.values[index]!; }
      const xValue = format(xAt(trace, index));
      const yValue = format(trace.values[index]!);
      const reading = element("span", undefined, "plot-reading");
      reading.append(element("span", trace.label, "plot-reading-label"));
      for (const [label, value] of [[plainXLabel, xValue], [plainYLabel, yValue]]) {
        const measurement = element("span", undefined, "plot-reading-measurement");
        measurement.append(element("span", label, "plot-reading-key"), element("strong", value));
        reading.append(measurement);
      }
      readout.append(reading);
      return `${trace.label}: ${plainXLabel} ${xValue}, ${plainYLabel} ${yValue}`;
    });
    inspect.setAttribute("aria-valuetext", readings.join(" · "));
    schedule();
  }

  function clearInspection() {
    hover = undefined;
    inspect.removeAttribute("aria-valuetext");
    readout.textContent = "Move over the chart or use Inspect position.";
    schedule();
  }
  canvas.addEventListener("pointermove", e => {
    const rect = canvas.getBoundingClientRect();
    if (width > left + right) showInspection((e.clientX - rect.left - left) / (width - left - right));
  }, listener);
  canvas.addEventListener("pointerleave", () => {
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
    const visibleLow = viewLow(), visibleHigh = viewHigh();
    const scale = Math.max(Math.abs(visibleLow), visibleHigh) || 1;
    const lo = visibleLow / scale, hi = visibleHigh / scale || (visibleLow === 0 ? 1 : 0);
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
        const visibleLow = viewLow(), visibleHigh = viewHigh();
        if (crossY >= visibleLow && crossY <= visibleHigh) {
          const scale = Math.max(Math.abs(visibleLow), visibleHigh) || 1;
          const lo = visibleLow / scale, hi = visibleHigh / scale || (visibleLow === 0 ? 1 : 0);
          const y = top + (hi - crossY / scale) / (hi - lo) * plotHeight;
          screen.beginPath();
          screen.moveTo(left, y);
          screen.lineTo(left + plotWidth, y);
          screen.stroke();
        }
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
        return `${trace.label} · ${trace.values.length} values · largest absolute value ${format(trace.values[peak]!)} at ${format(xAt(trace, peak))}. ${plainXLabel} / ${plainYLabel}.`;
      });
      if (traces.length && low === high) { low -= 1; high += 1; }
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
