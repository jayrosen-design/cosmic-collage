/**
 * AI Alignment analysis helpers: reduced-resolution analysis imagery, contact
 * sheets built from real source crops, structured NaviGator prompts.
 *
 * No image is generated: every pixel sent for analysis is a crop or a scaled
 * copy of an existing photograph, and NaviGator only ever chooses between them.
 */

import { z } from "zod";
import { canvasRectToTarget, cellRect, drawVirtualTargetCanvas } from "./composition";
import { loadImage } from "./engine";
import { renderMosaic } from "./render";
import { visionJson } from "./navigator";
import type {
  CandidateCrop,
  Mosaic,
  MosaicTile,
  SourceImage,
  VirtualTargetLayout,
} from "./types";

const GLOBAL_MAX_DIM = 1280;
const SHEET_MAX_DIM = 1280;
const JPEG_QUALITY = 0.84;

function toJpeg(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function fittedCanvas(w: number, h: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(16, Math.round(w * scale));
  canvas.height = Math.max(16, Math.round(h * scale));
  return canvas;
}

/**
 * Reduced-resolution copy of the Virtual Target Canvas: the real target photograph
 * at its exact composition position and scale, with padding shown as the derived
 * astronomical background tone. Not persisted, never used as collage pixels.
 */
export async function renderTargetAnalysisImage(
  target: SourceImage,
  layout: VirtualTargetLayout,
): Promise<string> {
  const img = await loadImage(target.url);
  const canvas = document.createElement("canvas");
  drawVirtualTargetCanvas(canvas, img, layout, GLOBAL_MAX_DIM);
  return toJpeg(canvas);
}

/** Reduced-resolution copy of the reconstruction. Not persisted. */
export async function renderMosaicAnalysisImage(
  mosaic: Mosaic,
  sources: SourceImage[],
): Promise<string> {
  const full = document.createElement("canvas");
  const tilePx = Math.max(
    6,
    Math.floor(GLOBAL_MAX_DIM / Math.max(mosaic.settings.columns, mosaic.settings.rows)),
  );
  const { width, height } = await renderMosaic(full, mosaic, sources, { tilePx, gap: 0, border: 0 });
  const canvas = fittedCanvas(width, height, GLOBAL_MAX_DIM);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas);
}

/* ------------------------------------------------------------------ */
/* global alignment analysis                                           */
/* ------------------------------------------------------------------ */

const unit = z.number().min(-1).max(2);

export const globalAnalysisSchema = z.object({
  overall: z.object({
    structure: unit,
    brightness: unit,
    orientation: unit,
    visualCoherence: unit,
  }),
  regions: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        importance: z.number().optional(),
        problem: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .max(24)
    .default([]),
  recommendations: z
    .object({
      preferStructure: z.number().optional(),
      preferRotationAccuracy: z.number().optional(),
      preferBrightness: z.number().optional(),
    })
    .default({}),
});

export type GlobalAnalysis = z.infer<typeof globalAnalysisSchema>;

const GLOBAL_SYSTEM =
  "You are an astronomical image-analysis assistant. You never generate, paint, blend, inpaint or modify pixels. " +
  "You only evaluate structural correspondence between two existing photographs and reply with strict JSON.";

const GLOBAL_PROMPT = `You are evaluating an astronomical photographic collage.

Image 1 is the target astronomical observation.
Image 2 is a reconstruction made entirely from cropped fragments of other real astronomical photographs.

Do not suggest generating, painting, blending, or modifying pixels.

Evaluate whether the reconstruction preserves the target's:
- overall silhouette
- central luminosity
- major structural features
- dust lanes
- spiral arms or nebular structure
- bright stellar regions
- orientation
- large-scale brightness distribution

Identify only regions where changing existing photographic tiles could improve structural correspondence.
Coordinates are normalised 0..1 with the origin at the top-left of the image.

Return structured JSON only, in exactly this shape:
{"overall":{"structure":0.0,"brightness":0.0,"orientation":0.0,"visualCoherence":0.0},
 "regions":[{"x":0.0,"y":0.0,"width":0.0,"height":0.0,"importance":0.0,"problem":"","priority":"high"}],
 "recommendations":{"preferStructure":1.0,"preferRotationAccuracy":1.0,"preferBrightness":1.0}}`;

export async function analyzeGlobalAlignment(
  targetImage: string,
  mosaicImage: string,
  signal?: AbortSignal | null,
): Promise<GlobalAnalysis> {
  return visionJson({
    system: GLOBAL_SYSTEM,
    prompt: GLOBAL_PROMPT,
    images: [targetImage, mosaicImage],
    maxTokens: 1200,
    signal: signal ?? null,
  }, (raw) => globalAnalysisSchema.parse(raw));
}

/** Weight multiplier for a tile that falls inside an AI-flagged region. */
export function regionWeightFactory(analysis: GlobalAnalysis | null, columns: number, rows: number) {
  if (!analysis || analysis.regions.length === 0) return () => 1;
  const regions = analysis.regions.map((r) => ({
    ...r,
    weight:
      1 +
      (r.importance ?? 0.7) *
        (r.priority === "high" ? 1.1 : r.priority === "medium" ? 0.7 : 0.4),
  }));
  return (tile: MosaicTile) => {
    const cx = (tile.column + 0.5) / columns;
    const cy = (tile.row + 0.5) / rows;
    let w = 1;
    for (const r of regions) {
      if (cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) {
        w = Math.max(w, r.weight);
      }
    }
    return w;
  };
}

/* ------------------------------------------------------------------ */
/* candidate contact sheets                                            */
/* ------------------------------------------------------------------ */

export const CANDIDATE_LETTERS = "ABCDEFGH";

export interface SheetCandidate {
  letter: string;
  candidate: CandidateCrop;
  rotation: 0 | 90 | 180 | 270;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.fillStyle = "rgba(8,10,14,0.78)";
  ctx.fillRect(x, y, size, Math.round(size * 0.2));
  ctx.fillStyle = "#e6edf6";
  ctx.font = `600 ${Math.round(size * 0.14)}px monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + size * 0.06, y + size * 0.1);
}

function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  crop: { x: number; y: number; w: number; h: number },
  rotation: number,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    img,
    crop.x * img.naturalWidth,
    crop.y * img.naturalHeight,
    crop.w * img.naturalWidth,
    crop.h * img.naturalHeight,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
  ctx.strokeStyle = "rgba(150,170,195,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

/**
 * Contact sheet: the target cell (with its immediate surroundings), the current
 * tile, and up to eight alternative crops of real photographs.
 */
export async function buildContactSheet(
  tile: MosaicTile,
  target: SourceImage,
  candidates: SheetCandidate[],
  sourceById: (id: string) => SourceImage | undefined,
  columns: number,
  rows: number,
  layout: VirtualTargetLayout,
): Promise<string> {
  const cell = Math.floor(SHEET_MAX_DIM / 4.2);
  const canvas = document.createElement("canvas");
  canvas.width = cell * 4;
  canvas.height = cell * 4;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b0d11";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // row 1: TARGET (with context, mapped through the Virtual Target Canvas) + CURRENT
  const targetImg = await loadImage(target.url);
  const base = cellRect(tile.row, tile.column, rows, columns);
  const ctxPad = 0.6;
  // expand the cell in *canvas* space, then map it into the real target image
  const expanded = {
    x: base.x - base.w * ctxPad,
    y: base.y - base.h * ctxPad,
    w: base.w * (1 + ctxPad * 2),
    h: base.h * (1 + ctxPad * 2),
  };
  const mapped = canvasRectToTarget(layout, expanded);
  if (mapped) {
    drawCrop(
      ctx,
      targetImg,
      {
        x: Math.max(0, mapped.x),
        y: Math.max(0, mapped.y),
        w: Math.min(1, mapped.w),
        h: Math.min(1, mapped.h),
      },
      0,
      0,
      0,
      cell * 2,
    );
    drawLabel(
      ctx,
      `TARGET ${tile.id} (with surroundings)`,
      0,
      0,
      cell * 2,
    );
  } else {
    // composition padding: no target pixels here — show the derived background tone
    const bg = layout.backgroundFeatures;
    const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    ctx.fillStyle = `rgb(${c(bg.r)},${c(bg.g)},${c(bg.b)})`;
    ctx.fillRect(0, 0, cell * 2, cell * 2);
    drawLabel(ctx, `TARGET ${tile.id} (composition padding / dark sky)`, 0, 0, cell * 2);
  }

  const currentSource = sourceById(tile.sourceImageId);
  if (currentSource) {
    const img = await loadImage(currentSource.url);
    drawCrop(
      ctx,
      img,
      { x: tile.cropX, y: tile.cropY, w: tile.cropWidth, h: tile.cropHeight },
      tile.rotation,
      cell * 2,
      0,
      cell * 2,
    );
    drawLabel(ctx, `CURRENT  rot ${tile.rotation}deg`, cell * 2, 0, cell * 2);
  }

  // rows 3-4: candidates A..H
  for (let i = 0; i < candidates.length && i < 8; i++) {
    const c = candidates[i]!;
    const src = sourceById(c.candidate.sourceId);
    if (!src) continue;
    const img = await loadImage(src.url);
    const x = (i % 4) * cell;
    const y = cell * 2 + Math.floor(i / 4) * cell;
    drawCrop(
      ctx,
      img,
      { x: c.candidate.x, y: c.candidate.y, w: c.candidate.w, h: c.candidate.h },
      c.rotation,
      x,
      y,
      cell,
    );
    drawLabel(ctx, `${c.letter} rot${c.rotation}`, x, y, cell);
  }

  return toJpeg(canvas);
}

export const candidateChoiceSchema = z.object({
  candidateId: z.string().min(1),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().max(400).optional(),
});

export type CandidateChoice = z.infer<typeof candidateChoiceSchema>;

const SHEET_SYSTEM =
  "You are an astronomical image-analysis assistant selecting between existing photographic fragments. " +
  "You never generate, request, paint or modify imagery. You reply with strict JSON only.";

export async function chooseCandidate(
  sheet: string,
  letters: string[],
  signal?: AbortSignal | null,
): Promise<CandidateChoice> {
  const prompt = `This contact sheet shows one region of an astronomical collage.

Top-left: the TARGET region of the real observation, including its surroundings.
Top-right: the CURRENT photographic fragment placed in that region.
Bottom two rows: alternative fragments cropped from other real photographs, labelled ${letters.join(", ")}.

Choose the candidate that best preserves the astronomical structure of the target region.

Consider:
- structure
- luminance
- orientation
- dust or emission patterns
- stellar density
- continuity with neighboring regions

Do not request new imagery. Only choose from the supplied candidates. If the CURRENT fragment is already the best, answer with candidateId "CURRENT".

Do not comment on rotation: rotation is decided numerically by the application after your choice.

Return JSON only: {"candidateId":"D","confidence":0.9,"reason":"short reason"}`;

  return visionJson({
    system: SHEET_SYSTEM,
    prompt,
    images: [sheet],
    maxTokens: 300,
    signal: signal ?? null,
  }, (raw) => candidateChoiceSchema.parse(raw));
}
