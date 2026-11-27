export type Point2D = Readonly<{ x: number; y: number }>;

export type EpicycleShapeId =
  | "pi"
  | "note"
  | "star"
  | "heart"
  | "lightning"
  | "square"
  | "custom";

export function resampleClosedPath(points: readonly Point2D[], targetCount = 512): Point2D[] {
  if (points.length < 2) {
    return Array.from({ length: targetCount }, () => ({ x: 0, y: 0 }));
  }
  const closed = [...points, points[0]!];
  const cumLen = new Float64Array(closed.length);
  for (let i = 1; i < closed.length; i++) {
    const dx = closed[i]!.x - closed[i - 1]!.x;
    const dy = closed[i]!.y - closed[i - 1]!.y;
    cumLen[i] = cumLen[i - 1]! + Math.hypot(dx, dy);
  }
  const totalLen = cumLen[closed.length - 1]!;
  if (totalLen <= 1e-12) {
    return Array.from({ length: targetCount }, () => ({ x: points[0]!.x, y: points[0]!.y }));
  }

  const sampled: Point2D[] = [];
  let seg = 0;
  for (let m = 0; m < targetCount; m++) {
    const s = (m / targetCount) * totalLen;
    while (seg + 1 < closed.length && cumLen[seg + 1]! < s) seg++;
    const s0 = cumLen[seg]!;
    const s1 = cumLen[Math.min(seg + 1, closed.length - 1)]!;
    const span = s1 - s0;
    const frac = span > 1e-12 ? (s - s0) / span : 0;
    const p0 = closed[seg]!;
    const p1 = closed[Math.min(seg + 1, closed.length - 1)]!;
    sampled.push({
      x: p0.x + frac * (p1.x - p0.x),
      y: p0.y + frac * (p1.y - p0.y),
    });
  }

  // Center around centroid and normalize bounding radius to 1.0 for clean epicycle framing
  let cx = 0;
  let cy = 0;
  for (const p of sampled) { cx += p.x; cy += p.y; }
  cx /= sampled.length;
  cy /= sampled.length;
  let maxR = 1e-9;
  for (const p of sampled) {
    maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy));
  }
  return sampled.map(p => ({ x: (p.x - cx) / maxR, y: (p.y - cy) / maxR }));
}

function cubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, steps = 20): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

function lineSeg(a: Point2D, b: Point2D, steps = 16): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }
  return out;
}

function buildPiContour(): Point2D[] {
  // Crisp mathematical Pi glyph closed outline (y-up mathematical coordinates)
  const pts: Point2D[] = [
    ...cubicBezier({ x: -0.92, y: 0.35 }, { x: -0.82, y: 0.78 }, { x: -0.55, y: 0.78 }, { x: -0.20, y: 0.78 }, 20),
    ...lineSeg({ x: -0.20, y: 0.78 }, { x: 0.85, y: 0.78 }, 20),
    ...cubicBezier({ x: 0.85, y: 0.78 }, { x: 0.94, y: 0.78 }, { x: 0.94, y: 0.50 }, { x: 0.82, y: 0.50 }, 16),
    ...lineSeg({ x: 0.82, y: 0.50 }, { x: 0.42, y: 0.50 }, 16),
    ...cubicBezier({ x: 0.42, y: 0.50 }, { x: 0.36, y: 0.05 }, { x: 0.36, y: -0.35 }, { x: 0.48, y: -0.52 }, 22),
    ...cubicBezier({ x: 0.48, y: -0.52 }, { x: 0.60, y: -0.66 }, { x: 0.74, y: -0.45 }, { x: 0.79, y: -0.32 }, 16),
    ...cubicBezier({ x: 0.79, y: -0.32 }, { x: 0.85, y: -0.55 }, { x: 0.72, y: -0.85 }, { x: 0.45, y: -0.85 }, 18),
    ...cubicBezier({ x: 0.45, y: -0.85 }, { x: 0.14, y: -0.85 }, { x: 0.14, y: -0.35 }, { x: 0.18, y: 0.50 }, 24),
    ...lineSeg({ x: 0.18, y: 0.50 }, { x: -0.20, y: 0.50 }, 16),
    ...cubicBezier({ x: -0.20, y: 0.50 }, { x: -0.28, y: -0.10 }, { x: -0.38, y: -0.58 }, { x: -0.52, y: -0.80 }, 24),
    ...cubicBezier({ x: -0.52, y: -0.80 }, { x: -0.62, y: -0.92 }, { x: -0.82, y: -0.82 }, { x: -0.78, y: -0.62 }, 16),
    ...cubicBezier({ x: -0.78, y: -0.62 }, { x: -0.62, y: -0.32 }, { x: -0.48, y: 0.10 }, { x: -0.44, y: 0.50 }, 24),
    ...cubicBezier({ x: -0.44, y: 0.50 }, { x: -0.68, y: 0.50 }, { x: -0.78, y: 0.44 }, { x: -0.92, y: 0.35 }, 16),
  ];
  return pts;
}

function buildTrebleNoteContour(): Point2D[] {
  // Crisp beamed musical note silhouette
  const pts: Point2D[] = [
    // Left note head
    ...cubicBezier({ x: -0.75, y: -0.55 }, { x: -0.75, y: -0.80 }, { x: -0.35, y: -0.86 }, { x: -0.22, y: -0.68 }, 20),
    ...lineSeg({ x: -0.22, y: -0.68 }, { x: -0.22, y: 0.48 }, 22),
    ...lineSeg({ x: -0.22, y: 0.48 }, { x: 0.62, y: 0.68 }, 18),
    ...lineSeg({ x: 0.62, y: 0.68 }, { x: 0.62, y: -0.35 }, 22),
    // Right note head
    ...cubicBezier({ x: 0.62, y: -0.35 }, { x: 0.72, y: -0.58 }, { x: 0.32, y: -0.74 }, { x: 0.18, y: -0.54 }, 20),
    ...cubicBezier({ x: 0.18, y: -0.54 }, { x: 0.10, y: -0.36 }, { x: 0.34, y: -0.20 }, { x: 0.48, y: -0.26 }, 16),
    ...lineSeg({ x: 0.48, y: -0.26 }, { x: 0.48, y: 0.46 }, 18),
    ...lineSeg({ x: 0.48, y: 0.46 }, { x: -0.08, y: 0.32 }, 16),
    ...lineSeg({ x: -0.08, y: 0.32 }, { x: -0.08, y: -0.58 }, 20),
    ...cubicBezier({ x: -0.08, y: -0.58 }, { x: -0.08, y: -0.32 }, { x: -0.55, y: -0.28 }, { x: -0.75, y: -0.55 }, 20),
  ];
  return pts;
}

function buildStarContour(): Point2D[] {
  const vertices: Point2D[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 1.0 : 0.40;
    vertices.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  const pts: Point2D[] = [];
  for (let i = 0; i < vertices.length; i++) {
    pts.push(...lineSeg(vertices[i]!, vertices[(i + 1) % vertices.length]!, 24));
  }
  return pts;
}

function buildHeartContour(): Point2D[] {
  const pts: Point2D[] = [];
  const count = 256;
  for (let i = 0; i < count; i++) {
    const t = (2 * Math.PI * i) / count;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push({ x: x / 17, y: y / 17 });
  }
  return pts;
}

function buildLightningContour(): Point2D[] {
  const verts: Point2D[] = [
    { x: 0.12, y: 0.95 },
    { x: -0.58, y: 0.02 },
    { x: -0.08, y: 0.02 },
    { x: -0.32, y: -0.95 },
    { x: 0.58, y: 0.14 },
    { x: 0.06, y: 0.14 },
  ];
  const pts: Point2D[] = [];
  for (let i = 0; i < verts.length; i++) {
    pts.push(...lineSeg(verts[i]!, verts[(i + 1) % verts.length]!, 24));
  }
  return pts;
}

function buildSquareContour(): Point2D[] {
  const verts: Point2D[] = [
    { x: -0.8, y: 0.8 },
    { x: 0.8, y: 0.8 },
    { x: 0.8, y: -0.8 },
    { x: -0.8, y: -0.8 },
  ];
  const pts: Point2D[] = [];
  for (let i = 0; i < verts.length; i++) {
    pts.push(...lineSeg(verts[i]!, verts[(i + 1) % verts.length]!, 32));
  }
  return pts;
}

export const epicycleShapeCatalog: ReadonlyArray<{ id: Exclude<EpicycleShapeId, "custom">; label: string }> = [
  { id: "pi", label: "Pi Symbol (π)" },
  { id: "note", label: "Beamed Music Note" },
  { id: "star", label: "5-Point Star" },
  { id: "heart", label: "Heart Curve" },
  { id: "lightning", label: "Lightning Bolt" },
  { id: "square", label: "Square Contour" },
];

export function getShapeContour(
  shapeId: EpicycleShapeId,
  customPath: readonly Point2D[] = [],
  sampleCount = 512,
): Point2D[] {
  switch (shapeId) {
    case "pi": return resampleClosedPath(buildPiContour(), sampleCount);
    case "note": return resampleClosedPath(buildTrebleNoteContour(), sampleCount);
    case "star": return resampleClosedPath(buildStarContour(), sampleCount);
    case "heart": return resampleClosedPath(buildHeartContour(), sampleCount);
    case "lightning": return resampleClosedPath(buildLightningContour(), sampleCount);
    case "square": return resampleClosedPath(buildSquareContour(), sampleCount);
    case "custom": return resampleClosedPath(customPath, sampleCount);
  }
}
