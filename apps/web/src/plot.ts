import { element } from "./ui";

export type PlotSeries = {
  title: string; xLabel: string; yLabel: string;
  step: number; values: Float64Array; mode: "line" | "stems";
};

const format = (value: number) => Number(value.toPrecision(4)).toString();

export function plot(series: PlotSeries): HTMLElement {
  const frame = element("figure", undefined, "plot");
  const canvas = element("canvas");
  canvas.width = matchMedia("(max-width: 675px)").matches ? 480 : 840;
  canvas.height = 260;
  canvas.setAttribute("aria-hidden", "true");
  const { values, step, title, mode, xLabel, yLabel } = series;
  let low = 0, high = 0, peakIndex = 0;
  values.forEach((value, index) => {
    low = Math.min(low, value);
    high = Math.max(high, value);
    if (Math.abs(value) > Math.abs(values[peakIndex]!)) peakIndex = index;
  });
  const caption = element("figcaption");
  const summary = element("p", `${values.length} values · largest absolute value ${format(values[peakIndex]!)} at ${format(peakIndex * step)}. ${xLabel} / ${yLabel}.`, "summary");
  caption.append(element("strong", title), summary);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => css.getPropertyValue(token).trim();
    const left = 75, right = canvas.width - 16, top = 18, bottom = 203;
    const scale = Math.max(Math.abs(low), high) || 1;
    const lower = low / scale;
    const upper = high / scale || (low === 0 ? 1 : 0);
    const y = (v: number) => bottom - (v / scale - lower) / (upper - lower) * (bottom - top);
    const x = (i: number) => left + i / Math.max(1, values.length - 1) * (right - left);
    ctx.font = "14px system-ui";
    for (let i = 0; i <= 4; i++) {
      const fraction = i / 4;
      const row = top + fraction * (bottom - top);
      const column = left + fraction * (right - left);
      ctx.strokeStyle = color("--border");
      ctx.beginPath(); ctx.moveTo(left, row); ctx.lineTo(right, row);
      ctx.moveTo(column, top); ctx.lineTo(column, bottom); ctx.stroke();
      ctx.fillStyle = color("--muted");
      ctx.textAlign = "right";
      ctx.fillText(format((upper - fraction * (upper - lower)) * scale), left - 8, row + 5);
      ctx.textAlign = i === 0 ? "left" : i === 4 ? "right" : "center";
      ctx.fillText(format((fraction * (values.length - 1)) * step), column, bottom + 22);
    }
    ctx.strokeStyle = color("--trace");
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((value, i) => {
      if (mode === "stems" || i === 0) ctx.moveTo(x(i), mode === "stems" ? y(0) : y(value));
      ctx.lineTo(x(i), y(value));
    });
    ctx.stroke();
    if (values.length === 1 || mode === "stems") {
      ctx.fillStyle = color("--trace");
      values.forEach((value, i) => ctx.fillRect(x(i) - 1.5, y(value) - 1.5, 3, 3));
    }
    ctx.fillStyle = color("--muted");
    ctx.textAlign = "center";
    ctx.fillText(xLabel, (left + right) / 2, 248);
  }
  frame.append(caption, element("div", yLabel, "axis-label"), canvas);
  return frame;
}
