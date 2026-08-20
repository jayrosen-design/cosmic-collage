/**
 * Deterministic structural measurements used by AI Alignment.
 * Pure mathematics — no network calls, no pixel synthesis.
 */

import { describeRegion, type AnalysisBitmap } from "./engine";
import type { Mosaic, MosaicTile } from "./types";

export interface CellImportance {
  /** 0..1 — how structurally significant this target cell is. */
  importance: number;
  luminance: number;
  contrast: number;
  edgeDensity: number;
}

/** Per-cell importance of the target: bright, high-contrast, edge-rich cells matter most. */
export function targetCellImportance(
  bmp: AnalysisBitmap,
  columns: number,
  rows: number,
): CellImportance[] {
  const cells: CellImportance[] = [];
  let maxContrast = 0.0001;
  let maxEdge = 0.0001;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const f = describeRegion(bmp, col / columns, row / rows, 1 / columns, 1 / rows);
      maxContrast = Math.max(maxContrast, f.contrast);
      maxEdge = Math.max(maxEdge, f.edgeDensity);
      cells.push({
        importance: 0,
        luminance: f.luminance,
        contrast: f.contrast,
        edgeDensity: f.edgeDensity,
      });
    }
  }
  for (const c of cells) {
    const contrast = c.contrast / maxContrast;
    const edge = c.edgeDensity / maxEdge;
    c.importance = Math.min(1, 0.25 + 0.35 * contrast + 0.25 * edge + 0.3 * c.luminance);
  }
  return cells;
}

export function cellAt(cells: CellImportance[], columns: number, row: number, column: number) {
  return cells[row * columns + column];
}

/**
 * Neighbour disagreement: how far a tile's luminance sits from its neighbours
 * compared with how far the target's cells sit from each other. High values mean
 * the tile breaks local visual continuity.
 */
export function neighborDisagreement(
  mosaic: Mosaic,
  cells: CellImportance[],
): Map<string, number> {
  const { columns, rows } = mosaic.settings;
  const byKey = new Map<string, MosaicTile>();
  for (const t of mosaic.tiles) byKey.set(`${t.row}:${t.column}`, t);
  const out = new Map<string, number>();

  for (const t of mosaic.tiles) {
    const self = cellAt(cells, columns, t.row, t.column);
    let acc = 0;
    let n = 0;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const r = t.row + dr;
      const c = t.column + dc;
      if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
      const nt = byKey.get(`${r}:${c}`);
      const nCell = cellAt(cells, columns, r, c);
      if (!nt || !self || !nCell) continue;
      // target gradient vs. mosaic gradient, expressed through brightness scores
      const targetDelta = Math.abs(self.luminance - nCell.luminance);
      const mosaicDelta = Math.abs(t.brightnessScore - nt.brightnessScore);
      acc += Math.min(1, Math.abs(mosaicDelta - targetDelta) * 1.6);
      n++;
    }
    out.set(t.id, n ? acc / n : 0);
  }
  return out;
}

export interface WeakTile {
  tile: MosaicTile;
  weakness: number;
  importance: number;
}

/**
 * Local weakness score. Combines the deterministic match scores with target
 * importance, neighbour continuity and any AI-flagged region weight.
 */
export function rankWeakTiles(
  mosaic: Mosaic,
  cells: CellImportance[],
  regionWeight: (tile: MosaicTile) => number,
  limit: number,
): WeakTile[] {
  const { columns } = mosaic.settings;
  const disagreement = neighborDisagreement(mosaic, cells);

  return mosaic.tiles
    .filter((t) => !t.locked && t.alternatives.length > 0)
    .map((tile) => {
      const cell = cellAt(cells, columns, tile.row, tile.column);
      const importance = cell?.importance ?? 0.5;
      const structural = 1 - tile.structureScore;
      const brightness = 1 - tile.brightnessScore;
      const base =
        (1 - tile.similarityScore) * 0.55 + structural * 0.28 + brightness * 0.17;
      const weakness =
        (base + (disagreement.get(tile.id) ?? 0) * 0.25) * importance * regionWeight(tile);
      return { tile, weakness, importance };
    })
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, limit);
}
