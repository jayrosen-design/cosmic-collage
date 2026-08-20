/**
 * Virtual Target Canvas — the single source of truth for composition geometry.
 *
 * Every part of the application (deterministic matcher, AI alignment, target view,
 * reconstruction view, compare view, exports, assembly map) derives its geometry
 * from this module. Nothing here generates imagery: padding regions are described
 * only as *analytical feature targets* derived from the real target photograph, and
 * are then filled with crops of real source photographs by the matcher.
 */

import { describeRegion, type AnalysisBitmap } from "./engine";
import type { ImageFeatures, MosaicSettings, VirtualTargetLayout } from "./types";

export type { VirtualTargetLayout };

export type CanvasAspectMode = "auto" | "3:2" | "4:3" | "16:9" | "1:1" | "custom";

export const CANVAS_ASPECT_MODES: CanvasAspectMode[] = [
  "auto",
  "3:2",
  "4:3",
  "16:9",
  "1:1",
  "custom",
];

export const CANVAS_ASPECT_LABEL: Record<CanvasAspectMode, string> = {
  auto: "Auto",
  "3:2": "3:2",
  "4:3": "4:3",
  "16:9": "16:9",
  "1:1": "1:1",
  custom: "Custom",
};

const RATIOS: Partial<Record<CanvasAspectMode, number>> = {
  "3:2": 3 / 2,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  "1:1": 1,
};

export const MIN_TARGET_SCALE = 0.4;
export const MAX_TARGET_SCALE = 1;

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);


/* ------------------------------------------------------------------ */
/* background descriptor                                               */
/* ------------------------------------------------------------------ */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = clamp(p, 0, 1) * (s.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

/**
 * Derive a representative astronomical background descriptor from the real target
 * photograph: outer edges, corners and the darkest low-structure patches.
 * Never a flat black constant.
 */
export function deriveBackgroundFeatures(bmp: AnalysisBitmap): {
  features: ImageFeatures;
  lowLuminance: number;
} {
  const patch = 0.14;
  const probes: Array<[number, number]> = [];
  // corners
  for (const x of [0, 1 - patch]) for (const y of [0, 1 - patch]) probes.push([x, y]);
  // edge midpoints and quarter points
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    probes.push([t - patch / 2, 0]);
    probes.push([t - patch / 2, 1 - patch]);
    probes.push([0, t - patch / 2]);
    probes.push([1 - patch, t - patch / 2]);
  }
  const samples = probes.map(([x, y]) =>
    describeRegion(bmp, clamp(x, 0, 1 - patch), clamp(y, 0, 1 - patch), patch, patch),
  );

  // keep the darkest, least structured half — that is the true sky
  const ranked = [...samples].sort(
    (a, b) => a.luminance + a.edgeDensity * 0.35 - (b.luminance + b.edgeDensity * 0.35),
  );
  const keep = ranked.slice(0, Math.max(4, Math.round(ranked.length * 0.5)));

  const histogram = new Array<number>(12)
    .fill(0)
    .map((_, i) => median(keep.map((f) => f.histogram[i] ?? 0)));
  const luminance = median(keep.map((f) => f.luminance));
  const lowLuminance = percentile(
    samples.map((f) => f.luminance),
    0.12,
  );
  const structure = new Array<number>(16)
    .fill(0)
    .map((_, i) => median(keep.map((f) => f.structure[i] ?? luminance)));

  const features: ImageFeatures = {
    r: median(keep.map((f) => f.r)),
    g: median(keep.map((f) => f.g)),
    b: median(keep.map((f) => f.b)),
    h: median(keep.map((f) => f.h)),
    s: median(keep.map((f) => f.s)),
    v: median(keep.map((f) => f.v)),
    luminance,
    contrast: median(keep.map((f) => f.contrast)),
    histogram,
    edgeDensity: median(keep.map((f) => f.edgeDensity)),
    edgeDirection: median(keep.map((f) => f.edgeDirection)),
    structure,
  };
  return { features, lowLuminance };
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

export function resolveCanvasAspect(settings: MosaicSettings, targetAspect: number): number {
  const mode = settings.canvasAspect ?? "auto";
  if (mode === "auto") return targetAspect;
  if (mode === "custom") return clamp(settings.customAspect ?? targetAspect, 0.4, 3.5);
  return RATIOS[mode] ?? targetAspect;
}

/**
 * Largest contain-style target rectangle that preserves the target aspect ratio,
 * fits inside the requested Target Scale and is positioned by the H/V controls.
 */
export function computeVirtualTargetLayout(
  settings: MosaicSettings,
  targetBmp: AnalysisBitmap,
): VirtualTargetLayout {
  const targetAspect = targetBmp.width / Math.max(1, targetBmp.height);
  const canvasAspect = resolveCanvasAspect(settings, targetAspect);
  const padding = settings.mosaicPadding !== false;
  const scale = padding
    ? clamp(settings.targetScale ?? 0.72, MIN_TARGET_SCALE, MAX_TARGET_SCALE)
    : 1;

  // physical canvas: width = canvasAspect, height = 1
  const boxW = scale * canvasAspect;
  const boxH = scale;
  let h = Math.min(boxH, boxW / targetAspect);
  let w = h * targetAspect;
  // normalise back to 0..1 canvas coordinates
  const targetWidth = clamp(w / canvasAspect, 0.01, 1);
  const targetHeight = clamp(h, 0.01, 1);

  const ox = clamp(settings.targetOffsetX ?? 0.5);
  const oy = clamp(settings.targetOffsetY ?? 0.5);
  const bg = deriveBackgroundFeatures(targetBmp);

  return {
    canvasAspect,
    targetX: (1 - targetWidth) * ox,
    targetY: (1 - targetHeight) * oy,
    targetWidth,
    targetHeight,
    backgroundFeatures: bg.features,
    backgroundLowLuminance: bg.lowLuminance,
  };
}

/** Tile width / height ratio implied by the composition. */
export function tileAspectFor(
  settings: Pick<MosaicSettings, "aspectMode" | "columns" | "rows">,
  layout: VirtualTargetLayout | null | undefined,
): number {
  if (settings.aspectMode === "square" || !layout) return 1;
  const a = (layout.canvasAspect * settings.rows) / Math.max(1, settings.columns);
  return clamp(a, 0.25, 4);
}

/* ------------------------------------------------------------------ */
/* cell mapping                                                        */
/* ------------------------------------------------------------------ */

export function blendFeatures(a: ImageFeatures, b: ImageFeatures, t: number): ImageFeatures {
  const k = clamp(t);
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    r: mix(a.r, b.r),
    g: mix(a.g, b.g),
    b: mix(a.b, b.b),
    h: mix(a.h, b.h),
    s: mix(a.s, b.s),
    v: mix(a.v, b.v),
    luminance: mix(a.luminance, b.luminance),
    contrast: mix(a.contrast, b.contrast),
    histogram: a.histogram.map((v, i) => mix(v, b.histogram[i] ?? v)),
    edgeDensity: mix(a.edgeDensity, b.edgeDensity),
    edgeDirection: k < 0.5 ? a.edgeDirection : b.edgeDirection,
    structure: a.structure.map((v, i) => mix(v, b.structure[i] ?? v)),
  };
}

export interface VirtualCell {
  features: ImageFeatures;
  /** fraction of the mosaic cell covered by the real target photograph, 0..1 */
  coverage: number;
}

/** Normalised rect of one mosaic cell inside the virtual canvas. */
export function cellRect(row: number, column: number, rows: number, columns: number) {
  return { x: column / columns, y: row / rows, w: 1 / columns, h: 1 / rows };
}

/** Map a normalised canvas rect into normalised target-image coordinates. */
export function canvasRectToTarget(
  layout: VirtualTargetLayout,
  rect: { x: number; y: number; w: number; h: number },
) {
  const x0 = Math.max(rect.x, layout.targetX);
  const y0 = Math.max(rect.y, layout.targetY);
  const x1 = Math.min(rect.x + rect.w, layout.targetX + layout.targetWidth);
  const y1 = Math.min(rect.y + rect.h, layout.targetY + layout.targetHeight);
  const iw = x1 - x0;
  const ih = y1 - y0;
  if (iw <= 0 || ih <= 0) return null;
  const coverage = (iw * ih) / Math.max(1e-9, rect.w * rect.h);
  return {
    coverage,
    x: (x0 - layout.targetX) / layout.targetWidth,
    y: (y0 - layout.targetY) / layout.targetHeight,
    w: iw / layout.targetWidth,
    h: ih / layout.targetHeight,
  };
}

/**
 * Feature target for one mosaic cell inside the virtual composition.
 * Inside the target → real target pixels. Partially inside → analytical blend.
 * Outside → derived astronomical background descriptor.
 */
export function describeVirtualTargetCell(
  targetBmp: AnalysisBitmap,
  layout: VirtualTargetLayout,
  row: number,
  column: number,
  rows: number,
  columns: number,
): VirtualCell {
  const rect = cellRect(row, column, rows, columns);
  const mapped = canvasRectToTarget(layout, rect);
  if (!mapped) return { features: layout.backgroundFeatures, coverage: 0 };
  const inside = describeRegion(targetBmp, mapped.x, mapped.y, mapped.w, mapped.h);
  if (mapped.coverage > 0.995) return { features: inside, coverage: 1 };
  return {
    features: blendFeatures(layout.backgroundFeatures, inside, mapped.coverage),
    coverage: mapped.coverage,
  };
}

/* ------------------------------------------------------------------ */
/* rendering the virtual target canvas (real pixels + neutral padding)  */
/* ------------------------------------------------------------------ */

function rgbCss(f: ImageFeatures) {
  const c = (v: number) => Math.round(clamp(v) * 255);
  return `rgb(${c(f.r)},${c(f.g)},${c(f.b)})`;
}

/**
 * Draw the target photograph at its exact composition position and scale.
 * Padding is filled with the derived background tone (a neutral analytical
 * representation, used only for viewing/AI comparison — never as collage pixels).
 */
export function drawVirtualTargetCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  layout: VirtualTargetLayout,
  maxDim = 1280,
) {
  const aspect = layout.canvasAspect;
  const width = aspect >= 1 ? maxDim : Math.round(maxDim * aspect);
  const height = aspect >= 1 ? Math.round(maxDim / aspect) : maxDim;
  canvas.width = Math.max(16, width);
  canvas.height = Math.max(16, height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = rgbCss(layout.backgroundFeatures);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    img,
    layout.targetX * canvas.width,
    layout.targetY * canvas.height,
    layout.targetWidth * canvas.width,
    layout.targetHeight * canvas.height,
  );
  return { width: canvas.width, height: canvas.height };
}

/* ------------------------------------------------------------------ */
/* cell importance (shared by the matcher and weak-region ranking)     */
/* ------------------------------------------------------------------ */

/** Structural significance of one composition cell, 0..1. */
export function cellImportance(
  f: ImageFeatures,
  maxContrast: number,
  maxEdge: number,
  coverage: number,
): number {
  const contrast = f.contrast / Math.max(0.0001, maxContrast);
  const edge = f.edgeDensity / Math.max(0.0001, maxEdge);
  const base = Math.min(1, 0.25 + 0.35 * contrast + 0.25 * edge + 0.3 * f.luminance);
  // padding cells still matter, but the deep-sky object matters more
  return base * (0.3 + 0.7 * clamp(coverage));
}
