import type { EpicyclesAnalysis, Point2D } from "../../../packages/engine-communications/src/ch1/s3/index.js";
import { element } from "./ui";
import { attachClickZoomGuard } from "./zoom-guard";

export function createEpicyclesView(onCustomPath: (pts: Point2D[]) => void) {
  const root = element("div", undefined, "epicycles-stage");
  const controls = element("div", undefined, "plot-controls");
  const canvas = element("canvas");
  canvas.className = "epicycles-canvas";
  canvas.width = 640;
  canvas.height = 460;
  const readout = element("p", "Watch rotating complex phasors trace the closed contour.", "plot-readout");

  let analysis: EpicyclesAnalysis | undefined;
  let playing = true;
  let speed = 1;
  let t = 0;
  let lastTime: number | undefined;
  let showCircles = true;
  let showTarget = true;
  let followTip = false;
  let manualZoom = 1;
  let panX = 0;
  let panY = 0;
  let drawMode = false;
  let drawing = false;
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let origPanX = 0;
  let origPanY = 0;
  let customSketch: Point2D[] = [];
  let traceTrail: Point2D[] = [];
  let frame = 0;
  let disposed = false;
  let active = false;
  let canvasW = 640;
  let canvasH = 460;

  const playBtn = element("button", "Pause");
  playBtn.type = "button";
  playBtn.addEventListener("click", () => {
    playing = !playing;
    lastTime = undefined;
    playBtn.textContent = playing ? "Pause" : "Play";
    if (playing) schedule();
  });

  const resetBtn = element("button", "Restart trace");
  resetBtn.type = "button";
  resetBtn.addEventListener("click", () => {
    t = 0;
    traceTrail = [];
  });

  const speedSel = element("select");
  speedSel.setAttribute("aria-label", "Epicycles playback speed");
  for (const v of [0.25, 0.5, 1, 2]) {
    const opt = element("option", `${v}×`);
    opt.value = String(v);
    speedSel.append(opt);
  }
  speedSel.value = "1";
  speedSel.addEventListener("change", () => { speed = Number(speedSel.value); });

  const toggleCircles = element("button", "Circles: On");
  toggleCircles.type = "button";
  toggleCircles.addEventListener("click", () => {
    showCircles = !showCircles;
    toggleCircles.textContent = showCircles ? "Circles: On" : "Circles: Off";
  });

  const toggleTarget = element("button", "Target: On");
  toggleTarget.type = "button";
  toggleTarget.addEventListener("click", () => {
    showTarget = !showTarget;
    toggleTarget.textContent = showTarget ? "Target: On" : "Target: Off";
  });

  const toggleFollow = element("button", "Tip Zoom: Off");
  toggleFollow.type = "button";
  toggleFollow.addEventListener("click", () => {
    followTip = !followTip;
    toggleFollow.textContent = followTip ? "Tip Zoom: On" : "Tip Zoom: Off";
  });

  const resetViewBtn = element("button", "Reset view");
  resetViewBtn.type = "button";
  resetViewBtn.addEventListener("click", () => {
    manualZoom = 1;
    panX = 0;
    panY = 0;
  });

  controls.append(playBtn, resetBtn, speedSel, toggleCircles, toggleTarget, toggleFollow, resetViewBtn);
  root.append(controls, canvas, readout);

  function toNorm(e: PointerEvent): Point2D {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width, rect.height) * 0.4;
    return {
      x: (e.clientX - rect.left - rect.width / 2) / scale,
      y: -(e.clientY - rect.top - rect.height / 2) / scale,
    };
  }

  canvas.addEventListener("pointerdown", e => {
    if (drawMode) {
      drawing = true;
      customSketch = [toNorm(e)];
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    origPanX = panX;
    origPanY = panY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (drawing && drawMode) {
      customSketch.push(toNorm(e));
      return;
    }
    if (panning) {
      const baseScale = Math.min(canvasW, canvasH) * 0.38 * (followTip ? 2.8 : 1) * manualZoom;
      panX = origPanX - (e.clientX - panStartX) / Math.max(1, baseScale);
      panY = origPanY + (e.clientY - panStartY) / Math.max(1, baseScale);
    }
  });
  canvas.addEventListener("pointerup", () => {
    if (drawing && drawMode) {
      drawing = false;
      if (customSketch.length >= 3) {
        drawMode = false;
        onCustomPath(customSketch);
      }
    }
    panning = false;
  });
  canvas.addEventListener("pointercancel", () => { drawing = false; panning = false; });
  const zoomGuard = attachClickZoomGuard(canvas);
  canvas.addEventListener("wheel", e => {
    if (drawMode || !zoomGuard.isActive()) return;
    e.preventDefault();
    manualZoom = Math.max(0.3, Math.min(12, manualZoom * (e.deltaY < 0 ? 1.15 : 0.87)));
  }, { passive: false });

  function render(now: number) {
    frame = 0;
    if (disposed || !active || document.hidden) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(3, devicePixelRatio || 1);
    const pw = Math.round(canvasW * ratio);
    const ph = Math.round(canvasH * ratio);
    if (pw > 0 && ph > 0 && (canvas.width !== pw || canvas.height !== ph)) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const w = canvasW;
    const h = canvasH;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const traceCol = css.getPropertyValue("--trace").trim() || "#087a75";
    const muted = css.getPropertyValue("--muted").trim() || "#465b70";
    const border = css.getPropertyValue("--border").trim() || "#c9d4df";

    ctx.clearRect(0, 0, w, h);

    if (drawMode) {
      ctx.fillStyle = muted;
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Draw any closed loop with your pointer, then release.", w / 2, 28);
      if (customSketch.length > 1) {
        const scale = Math.min(w, h) * 0.4;
        ctx.strokeStyle = traceCol;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        customSketch.forEach((p, idx) => {
          const px = w / 2 + p.x * scale;
          const py = h / 2 - p.y * scale;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      schedule();
      return;
    }

    if (!analysis) return;

    if (playing) {
      if (lastTime !== undefined) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        t += (dt * speed) / 8;
        if (t >= 1) {
          t -= 1;
          traceTrail = [];
        }
      }
      lastTime = now;
    }

    // Evaluate tip chain at current t
    let x = 0;
    let y = 0;
    const joints: Array<{ cx: number; cy: number; nx: number; ny: number; r: number }> = [];
    for (const term of analysis.terms) {
      const cx = x;
      const cy = y;
      const ang = 2 * Math.PI * term.k * t;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      x += term.re * cs - term.im * sn;
      y += term.re * sn + term.im * cs;
      joints.push({ cx, cy, nx: x, ny: y, r: term.radius });
    }
    traceTrail.push({ x, y });
    if (traceTrail.length > 1200) traceTrail.shift();

    const baseScale = Math.min(w, h) * 0.38;
    const zoomFactor = (followTip ? 2.8 : 1) * manualZoom;
    const camX = followTip ? x : panX;
    const camY = followTip ? y : panY;
    const sx = (vx: number) => w / 2 + (vx - camX) * baseScale * zoomFactor;
    const sy = (vy: number) => h / 2 - (vy - camY) * baseScale * zoomFactor;

    // Subtle target outline
    if (showTarget && analysis.targetContour.length > 1) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      analysis.targetContour.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(sx(p.x), sy(p.y));
        else ctx.lineTo(sx(p.x), sy(p.y));
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Full reconstructed contour preview (subtle)
    if (analysis.reconstructed.length > 1) {
      ctx.strokeStyle = "#ad6a2c";
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      analysis.reconstructed.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(sx(p.x), sy(p.y));
        else ctx.lineTo(sx(p.x), sy(p.y));
      });
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Rotating epicycle circles and vectors
    if (showCircles) {
      for (const j of joints) {
        const px = sx(j.cx);
        const py = sy(j.cy);
        const nx = sx(j.nx);
        const ny = sy(j.ny);
        const rad = j.r * baseScale * zoomFactor;
        if (rad > 1) {
          ctx.strokeStyle = muted;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Drawn luminous trail
    if (traceTrail.length > 1) {
      ctx.strokeStyle = traceCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      traceTrail.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(sx(p.x), sy(p.y));
        else ctx.lineTo(sx(p.x), sy(p.y));
      });
      ctx.stroke();
    }

    // Active drawing tip dot
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(sx(x), sy(y), 4.5, 0, 2 * Math.PI);
    ctx.fill();

    readout.textContent = `t = ${t.toFixed(3)} · ${analysis.terms.length} rotating phasors (K = ${(analysis.terms.length - 1) / 2})`;
    schedule();
  }

  function schedule() {
    if (!frame && !disposed && active && !document.hidden) frame = requestAnimationFrame(render);
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    canvasW = Math.max(240, entry.contentRect.width);
    canvasH = Math.max(220, entry.contentRect.height);
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
    setAnalysis(next: EpicyclesAnalysis) {
      analysis = next;
      drawMode = false;
      t = 0;
      traceTrail = [];
      lastTime = undefined;
      schedule();
    },
    enterDrawMode() {
      drawMode = true;
      customSketch = [];
      readout.textContent = "Draw a closed loop inside the canvas to compute its Fourier epicycles.";
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      zoomGuard.dispose();
      resize.disconnect();
    },
  };
}
