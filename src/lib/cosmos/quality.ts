/**
 * The single alignment objective function for Cosmic Collage.
 *
 * One formula is used everywhere: ranking baseline weakness, validating AI
 * recommendations, and reporting improvement. If these ever diverge the app
 * optimises one thing and reports another, which is how a "+0.05 structure"
 * result can hide a net quality loss.
 */

import type { Mosaic, MosaicTile } from "./types";

export const QUALITY_WEIGHTS = {
  structure: 0.45,
  similarity: 0.35,
  brightness: 0.15,
  continuity: 0.05,
} as const;

export interface QualityScores {
  structureScore: number;
  similarityScore: number;
  brightnessScore: number;
  /** local neighbour continuity, 0..1 — defaults to neutral when unknown */
  continuityScore?: number;
}

/** Composite alignment quality of one tile, 0..1. */
export function alignmentQuality(t: QualityScores): number {
  return (
    t.structureScore * QUALITY_WEIGHTS.structure +
    t.similarityScore * QUALITY_WEIGHTS.similarity +
    t.brightnessScore * QUALITY_WEIGHTS.brightness +
    (t.continuityScore ?? 0.5) * QUALITY_WEIGHTS.continuity
  );
}

export function averageQuality(tiles: QualityScores[]): number {
  if (tiles.length === 0) return 0;
  return tiles.reduce((a, t) => a + alignmentQuality(t), 0) / tiles.length;
}

/** Minimum composite gain before an AI recommendation is applied. */
export const MIN_REFINEMENT_DELTA = 0.012;

export interface ContinuityCell {
  luminance: number;
}

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/**
 * Continuity of one tile brightness against its neighbours: 1 means the mosaic's
 * local brightness gradient matches the target's, 0 means it breaks continuity.
 */
export function continuityFor(
  brightnessScore: number,
  row: number,
  column: number,
  ctx: {
    tileAt: (row: number, column: number) => MosaicTile | undefined;
    cellAt: (row: number, column: number) => ContinuityCell | undefined;
    rows: number;
    columns: number;
  },
): number {
  const self = ctx.cellAt(row, column);
  if (!self) return 0.5;
  let acc = 0;
  let n = 0;
  for (const [dr, dc] of NEIGHBORS) {
    const r = row + dr;
    const c = column + dc;
    if (r < 0 || c < 0 || r >= ctx.rows || c >= ctx.columns) continue;
    const nt = ctx.tileAt(r, c);
    const nCell = ctx.cellAt(r, c);
    if (!nt || !nCell) continue;
    const targetDelta = Math.abs(self.luminance - nCell.luminance);
    const mosaicDelta = Math.abs(brightnessScore - nt.brightnessScore);
    acc += Math.min(1, Math.abs(mosaicDelta - targetDelta) * 1.6);
    n++;
  }
  return n ? 1 - acc / n : 0.5;
}

/** Continuity for every tile of a mosaic. */
export function buildContinuity(
  mosaic: Mosaic,
  cells: ContinuityCell[],
): Map<string, number> {
  const { columns, rows } = mosaic.settings;
  const byKey = new Map<string, MosaicTile>();
  for (const t of mosaic.tiles) byKey.set(`${t.row}:${t.column}`, t);
  const ctx = {
    tileAt: (r: number, c: number) => byKey.get(`${r}:${c}`),
    cellAt: (r: number, c: number) => cells[r * columns + c],
    rows,
    columns,
  };
  const out = new Map<string, number>();
  for (const t of mosaic.tiles) {
    out.set(t.id, continuityFor(t.brightnessScore, t.row, t.column, ctx));
  }
  return out;
}

/** Attach continuity to tiles so quality is computed from one consistent record. */
export function withContinuity(tiles: MosaicTile[], continuity: Map<string, number>) {
  return tiles.map((t) => ({ ...t, continuityScore: continuity.get(t.id) ?? 0.5 }));
}
