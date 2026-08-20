import {
  type CandidateCrop,
  type EngineProgress,
  type ImageFeatures,
  type Mosaic,
  type MosaicAnalysisEngine,
  type MosaicSettings,
  type MosaicTile,
  type SourceImage,
  tileLabel,
} from "./types";

/* ------------------------------------------------------------------ */
/* utilities                                                           */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

const imageCache = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Could not load image: ${url}`));
    img.src = url;
  });
}

export interface AnalysisBitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Low-resolution analysis representation. Never analyse at full resolution. */
export function makeAnalysisBitmap(img: HTMLImageElement, maxSize = 448): AnalysisBitmap {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { data, width: w, height: h };
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0.0001) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max <= 0 ? 0 : d / max, max];
}

/** Descriptors for a normalised region of an analysis bitmap. */
export function describeRegion(
  bmp: AnalysisBitmap,
  nx: number,
  ny: number,
  nw: number,
  nh: number,
): ImageFeatures {
  const S = 8;
  const lum = new Float64Array(S * S);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const histogram = new Array<number>(12).fill(0);

  const x0 = nx * bmp.width;
  const y0 = ny * bmp.height;
  const rw = nw * bmp.width;
  const rh = nh * bmp.height;

  for (let gy = 0; gy < S; gy++) {
    for (let gx = 0; gx < S; gx++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let n = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = Math.min(
            bmp.width - 1,
            Math.max(0, Math.round(x0 + ((gx + (sx + 0.5) / 2) * rw) / S)),
          );
          const py = Math.min(
            bmp.height - 1,
            Math.max(0, Math.round(y0 + ((gy + (sy + 0.5) / 2) * rh) / S)),
          );
          const i = (py * bmp.width + px) * 4;
          ar += bmp.data[i]! / 255;
          ag += bmp.data[i + 1]! / 255;
          ab += bmp.data[i + 2]! / 255;
          n++;
        }
      }
      ar /= n;
      ag /= n;
      ab /= n;
      sr += ar;
      sg += ag;
      sb += ab;
      const l = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
      lum[gy * S + gx] = l;
      const dom = ar >= ag && ar >= ab ? 0 : ag >= ab ? 1 : 2;
      const lb = Math.min(3, Math.floor(l * 4));
      histogram[dom * 4 + lb] = histogram[dom * 4 + lb]! + 1;
    }
  }

  const count = S * S;
  for (let i = 0; i < histogram.length; i++) histogram[i] = histogram[i]! / count;

  const r = sr / count;
  const g = sg / count;
  const b = sb / count;
  const [h, s, v] = rgbToHsv(r, g, b);

  let mean = 0;
  for (let i = 0; i < count; i++) mean += lum[i]!;
  mean /= count;
  let varSum = 0;
  for (let i = 0; i < count; i++) varSum += (lum[i]! - mean) ** 2;
  const contrast = Math.sqrt(varSum / count);

  // gradients -> edge density + dominant orientation (double-angle accumulation)
  let edgeSum = 0;
  let accX = 0;
  let accY = 0;
  for (let gy = 1; gy < S - 1; gy++) {
    for (let gx = 1; gx < S - 1; gx++) {
      const dx = lum[gy * S + gx + 1]! - lum[gy * S + gx - 1]!;
      const dy = lum[(gy + 1) * S + gx]! - lum[(gy - 1) * S + gx]!;
      const mag = Math.hypot(dx, dy);
      edgeSum += mag;
      accX += dx * dx - dy * dy;
      accY += 2 * dx * dy;
    }
  }
  const edgeDensity = clamp(edgeSum / ((S - 2) * (S - 2)) / 0.6);
  let edgeDirection = 0.5 * Math.atan2(accY, accX);
  if (edgeDirection < 0) edgeDirection += Math.PI;

  // 4x4 structure grid
  const structure = new Array<number>(16).fill(0);
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      let acc = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) acc += lum[(by * 2 + dy) * S + (bx * 2 + dx)]!;
      structure[by * 4 + bx] = acc / 4;
    }
  }

  return { r, g, b, h, s, v, luminance: mean, contrast, histogram, edgeDensity, edgeDirection, structure };
}

function rotateGrid(grid: number[], rotation: number): number[] {
  if (rotation === 0) return grid;
  const out = new Array<number>(16).fill(0);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      let tx = x;
      let ty = y;
      if (rotation === 90) {
        tx = 3 - y;
        ty = x;
      } else if (rotation === 180) {
        tx = 3 - x;
        ty = 3 - y;
      } else {
        tx = y;
        ty = 3 - x;
      }
      out[ty * 4 + tx] = grid[y * 4 + x]!;
    }
  }
  return out;
}

export function rotateFeatures(f: ImageFeatures, rotation: 0 | 90 | 180 | 270): ImageFeatures {
  if (rotation === 0) return f;
  const dir = (f.edgeDirection + (rotation * Math.PI) / 180) % Math.PI;
  return { ...f, edgeDirection: dir, structure: rotateGrid(f.structure, rotation) };
}

/* ------------------------------------------------------------------ */
/* scoring                                                             */
/* ------------------------------------------------------------------ */

export interface MatchWeights {
  brightness: number;
  color: number;
  contrast: number;
  edge: number;
  structure: number;
  direction: number;
}

export function weightsForAbstraction(a: number): MatchWeights {
  return {
    brightness: 1.2 - 0.5 * a,
    color: 1.1 - 0.85 * a,
    contrast: 0.5 - 0.2 * a,
    edge: 0.5 - 0.15 * a,
    structure: 1.0 - 0.65 * a,
    direction: 0.3 + 0.1 * a,
  };
}

export interface ScoreParts {
  similarity: number;
  brightness: number;
  color: number;
  structure: number;
}

export function scoreFeatures(t: ImageFeatures, c: ImageFeatures, w: MatchWeights): ScoreParts {
  const brightness = 1 - Math.min(1, Math.abs(t.luminance - c.luminance) * 2.2);

  const colorDist =
    (Math.abs(t.r - c.r) + Math.abs(t.g - c.g) + Math.abs(t.b - c.b)) / 3 * 1.6 +
    Math.abs(t.s - c.s) * 0.5;
  const color = 1 - Math.min(1, colorDist);

  let sd = 0;
  for (let i = 0; i < 16; i++) sd += Math.abs(t.structure[i]! - c.structure[i]!);
  const structure = 1 - Math.min(1, (sd / 16) * 3.2);

  const contrast = 1 - Math.min(1, Math.abs(t.contrast - c.contrast) * 4);
  const edge = 1 - Math.min(1, Math.abs(t.edgeDensity - c.edgeDensity) * 2);

  let dd = Math.abs(t.edgeDirection - c.edgeDirection);
  if (dd > Math.PI / 2) dd = Math.PI - dd;
  const strength = Math.min(t.edgeDensity, c.edgeDensity);
  const direction = 1 - (dd / (Math.PI / 2)) * clamp(strength * 2);

  const total =
    w.brightness + w.color + w.contrast + w.edge + w.structure + w.direction || 1;
  const similarity =
    (brightness * w.brightness +
      color * w.color +
      contrast * w.contrast +
      edge * w.edge +
      structure * w.structure +
      direction * w.direction) /
    total;

  return { similarity: clamp(similarity), brightness, color, structure };
}

/* ------------------------------------------------------------------ */
/* browser engine                                                      */
/* ------------------------------------------------------------------ */

const ROTATIONS: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
const CROP_SCALES = [1.0, 1.5, 2.0];
const OVERLAP = 0.75; // 25% overlap between crop windows
const MAX_CANDIDATES_PER_SOURCE = 260;

interface AnalyzedSource {
  image: SourceImage;
  bitmap: AnalysisBitmap;
}

export class BrowserAnalysisEngine implements MosaicAnalysisEngine {
  readonly mode = "visual" as const;

  /** candidate pool from the most recent generation, used by the Tile Inspector */
  candidates: CandidateCrop[] = [];
  rotatedFeatures: ImageFeatures[][] = [];

  async analyzeImage(image: SourceImage): Promise<ImageFeatures> {
    const img = await loadImage(image.url);
    const bmp = makeAnalysisBitmap(img, 256);
    return describeRegion(bmp, 0, 0, 1, 1);
  }

  async findCandidates(target: ImageFeatures, limit = 8): Promise<CandidateCrop[]> {
    const w = weightsForAbstraction(0.5);
    return [...this.candidates]
      .map((c) => ({ c, s: scoreFeatures(target, c.features, w).similarity }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.c);
  }

  featuresFor(candidateIndex: number, rotation: 0 | 90 | 180 | 270): ImageFeatures {
    const base = this.candidates[candidateIndex]!.features;
    const rot = this.rotatedFeatures[candidateIndex];
    if (!rot) return rotateFeatures(base, rotation);
    return rot[ROTATIONS.indexOf(rotation)] ?? base;
  }

  private buildCandidates(sources: AnalyzedSource[]): CandidateCrop[] {
    const out: CandidateCrop[] = [];
    for (const src of sources) {
      const perSource: CandidateCrop[] = [];
      const shortSide = Math.min(src.bitmap.width, src.bitmap.height);
      for (const scale of CROP_SCALES) {
        const cropPx = (shortSide / 7) * scale;
        const nw = cropPx / src.bitmap.width;
        const nh = cropPx / src.bitmap.height;
        if (nw > 1 || nh > 1) continue;
        const stepX = nw * OVERLAP;
        const stepY = nh * OVERLAP;
        for (let y = 0; y + nh <= 1.0001; y += stepY) {
          for (let x = 0; x + nw <= 1.0001; x += stepX) {
            perSource.push({
              index: -1,
              sourceId: src.image.id,
              x: Math.min(x, 1 - nw),
              y: Math.min(y, 1 - nh),
              w: nw,
              h: nh,
              scale,
              features: describeRegion(src.bitmap, Math.min(x, 1 - nw), Math.min(y, 1 - nh), nw, nh),
            });
          }
        }
      }
      // decimate evenly if a photograph produced too many windows
      const stride = Math.max(1, Math.ceil(perSource.length / MAX_CANDIDATES_PER_SOURCE));
      for (let i = 0; i < perSource.length; i += stride) out.push(perSource[i]!);
    }
    out.forEach((c, i) => (c.index = i));
    return out;
  }

  async generateMosaic(
    settings: MosaicSettings,
    ctx: {
      target: SourceImage;
      sources: SourceImage[];
      lockedTiles?: MosaicTile[];
      onProgress?: (p: EngineProgress) => void;
    },
  ): Promise<Mosaic> {
    const { target, sources, onProgress } = ctx;
    const report = (phase: string, value: number, detail?: string) =>
      onProgress?.(detail === undefined ? { phase, value } : { phase, value, detail });

    report("Analyzing archive...", 0.02);
    await yieldToUI();

    const analyzed: AnalyzedSource[] = [];
    for (let i = 0; i < sources.length; i++) {
      const image = sources[i]!;
      const el = await loadImage(image.url);
      analyzed.push({ image, bitmap: makeAnalysisBitmap(el, 448) });
      report("Analyzing archive...", 0.02 + (0.18 * (i + 1)) / sources.length, image.name);
      await yieldToUI();
    }
    if (analyzed.length === 0) throw new Error("No source photographs are enabled.");

    const targetEl = await loadImage(target.url);
    const targetBmp = makeAnalysisBitmap(targetEl, 640);

    const candidates = this.buildCandidates(analyzed);
    this.candidates = candidates;
    this.rotatedFeatures = candidates.map((c) =>
      ROTATIONS.map((r) => (settings.allowRotation ? rotateFeatures(c.features, r) : c.features)),
    );
    report("Generating candidate regions...", 0.32, `${candidates.length} candidate regions`);
    await yieldToUI();

    const { columns, rows } = settings;
    const total = columns * rows;
    const rng = mulberry32(settings.seed);
    const weights = weightsForAbstraction(settings.abstraction);
    const effRandom = clamp(settings.randomness + 0.45 * Math.max(0, settings.abstraction - 0.4));
    const sampleSize = total > 900 ? 220 : total > 400 ? 320 : candidates.length;
    const rotations: Array<0 | 90 | 180 | 270> = settings.allowRotation ? ROTATIONS : [0];

    const wavelengthOf = new Map(analyzed.map((a) => [a.image.id, a.image.wavelength]));
    const mixBonus = (sourceId: string) => {
      const wl = wavelengthOf.get(sourceId);
      if (!wl) return 0;
      const pref = settings.sourceMix[wl];
      return pref === undefined ? 0 : (pref - 0.5) * 0.6;
    };

    const usage = new Map<string, number>();
    const maxPerSource = Math.max(1, Math.ceil(total * settings.maxTilesPerSource));
    const lockedByKey = new Map<string, MosaicTile>();
    for (const t of ctx.lockedTiles ?? []) if (t.locked) lockedByKey.set(`${t.row}:${t.column}`, t);

    const tiles: MosaicTile[] = [];
    report("Matching target tiles...", 0.34, `${total} target tiles`);
    await yieldToUI();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const locked = lockedByKey.get(`${row}:${col}`);
        if (locked) {
          tiles.push({ ...locked });
          usage.set(locked.sourceImageId, (usage.get(locked.sourceImageId) ?? 0) + 1);
          continue;
        }

        const cellFeatures = describeRegion(targetBmp, col / columns, row / rows, 1 / columns, 1 / rows);

        const pool: number[] = [];
        if (sampleSize >= candidates.length) {
          for (let i = 0; i < candidates.length; i++) pool.push(i);
        } else {
          for (let i = 0; i < sampleSize; i++) pool.push(Math.floor(rng() * candidates.length));
        }

        type Scored = {
          index: number;
          rotation: 0 | 90 | 180 | 270;
          parts: ScoreParts;
          adjusted: number;
        };
        const scored: Scored[] = [];
        for (const idx of pool) {
          const cand = candidates[idx]!;
          const used = usage.get(cand.sourceId) ?? 0;
          if (used >= maxPerSource && analyzed.length > 1) continue;
          const reuse = (used / Math.max(1, total / analyzed.length)) * 0.55 * settings.diversity;
          for (const rot of rotations) {
            const feats = this.rotatedFeatures[idx]?.[ROTATIONS.indexOf(rot)] ?? cand.features;
            const parts = scoreFeatures(cellFeatures, feats, weights);
            const adjusted =
              parts.similarity - reuse + mixBonus(cand.sourceId) + (rng() - 0.5) * 0.5 * effRandom;
            scored.push({ index: idx, rotation: rot, parts, adjusted });
          }
        }
        if (scored.length === 0) {
          const cand = candidates[Math.floor(rng() * candidates.length)]!;
          const parts = scoreFeatures(cellFeatures, cand.features, weights);
          scored.push({ index: cand.index, rotation: 0, parts, adjusted: parts.similarity });
        }
        scored.sort((a, b) => b.adjusted - a.adjusted);

        const poolSize = Math.max(1, Math.min(scored.length, 1 + Math.round(effRandom * 18)));
        const pick = scored[Math.floor(rng() ** 1.6 * poolSize)] ?? scored[0]!;
        const cand = candidates[pick.index]!;
        usage.set(cand.sourceId, (usage.get(cand.sourceId) ?? 0) + 1);

        const alternatives: number[] = [];
        for (const s of scored) {
          if (s.index === pick.index || alternatives.includes(s.index)) continue;
          alternatives.push(s.index);
          if (alternatives.length >= 8) break;
        }

        tiles.push({
          id: tileLabel(row, col),
          row,
          column: col,
          sourceImageId: cand.sourceId,
          candidateIndex: cand.index,
          cropX: cand.x,
          cropY: cand.y,
          cropWidth: cand.w,
          cropHeight: cand.h,
          rotation: pick.rotation,
          scale: cand.scale,
          similarityScore: pick.parts.similarity,
          brightnessScore: pick.parts.brightness,
          colorScore: pick.parts.color,
          structureScore: pick.parts.structure,
          locked: false,
          alternatives,
        });
      }
      if (row % 2 === 0) {
        report("Matching target tiles...", 0.34 + (0.6 * (row + 1)) / rows, `${total} target tiles`);
        await yieldToUI();
      }
    }

    report("Rendering mosaic...", 0.98);
    await yieldToUI();

    return {
      settings: { ...settings },
      targetId: target.id,
      tiles,
      candidateCount: candidates.length,
      createdAt: Date.now(),
      engine: "visual",
    };
  }

  /** Re-score a single cell against the existing candidate pool (Tile Inspector). */
  scoreCell(
    targetBmp: AnalysisBitmap,
    tile: MosaicTile,
    settings: MosaicSettings,
    abstraction: number,
  ) {
    const cell = describeRegion(
      targetBmp,
      tile.column / settings.columns,
      tile.row / settings.rows,
      1 / settings.columns,
      1 / settings.rows,
    );
    const w = weightsForAbstraction(abstraction);
    return this.candidates
      .map((c) => ({ candidate: c, parts: scoreFeatures(cell, c.features, w) }))
      .sort((a, b) => b.parts.similarity - a.parts.similarity);
  }
}

export const browserEngine = new BrowserAnalysisEngine();
