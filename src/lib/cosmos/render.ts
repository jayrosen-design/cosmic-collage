import { loadImage } from "./engine";
import type { Mosaic, MosaicTile, SourceImage } from "./types";

export interface RenderOptions {
  /** pixel size of one tile on the long axis */
  tilePx?: number;
  gap?: number;
  border?: number;
  highlightTileId?: string | null;
}

export async function preloadImages(images: SourceImage[]) {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    images.map(async (i) => {
      map.set(i.id, await loadImage(i.url));
    }),
  );
  return map;
}

function tileGeometry(mosaic: Mosaic, tilePx: number) {
  const { columns, rows, aspectMode } = mosaic.settings;
  const tileW = tilePx;
  const tileH = aspectMode === "square" ? tilePx : tilePx;
  return { tileW, tileH, width: columns * tileW, height: rows * tileH };
}

/** Draw the collage. Every pixel comes from a source photograph crop. */
export async function renderMosaic(
  canvas: HTMLCanvasElement,
  mosaic: Mosaic,
  sources: SourceImage[],
  options: RenderOptions = {},
) {
  const images = await preloadImages(
    sources.filter((s) => mosaic.tiles.some((t) => t.sourceImageId === s.id)),
  );
  const tilePx =
    options.tilePx ??
    Math.max(
      8,
      Math.floor(Math.min(3600 / mosaic.settings.columns, 3600 / mosaic.settings.rows, 64)),
    );
  const gap = options.gap ?? mosaic.settings.tileGap;
  const border = options.border ?? mosaic.settings.tileBorder;
  const { tileW, tileH, width, height } = tileGeometry(mosaic, tilePx);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b0d11";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;

  for (const tile of mosaic.tiles) {
    const img = images.get(tile.sourceImageId);
    if (!img) continue;
    const x = tile.column * tileW + gap / 2;
    const y = tile.row * tileH + gap / 2;
    const w = tileW - gap;
    const h = tileH - gap;
    const sx = tile.cropX * img.naturalWidth;
    const sy = tile.cropY * img.naturalHeight;
    const sw = tile.cropWidth * img.naturalWidth;
    const sh = tile.cropHeight * img.naturalHeight;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((tile.rotation * Math.PI) / 180);
    const dw = tile.rotation % 180 === 0 ? w : h;
    const dh = tile.rotation % 180 === 0 ? h : w;
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    if (border > 0) {
      ctx.strokeStyle = "rgba(10,12,16,0.85)";
      ctx.lineWidth = border;
      ctx.strokeRect(x + border / 2, y + border / 2, w - border, h - border);
    }
    if (options.highlightTileId && tile.id === options.highlightTileId) {
      ctx.strokeStyle = "#f0b64a";
      ctx.lineWidth = Math.max(2, tilePx * 0.06);
      ctx.strokeRect(x, y, w, h);
    }
  }
  return { width, height };
}

/** Assembly blueprint: numbered cells over a dimmed collage. */
export async function renderAssemblyMap(
  canvas: HTMLCanvasElement,
  mosaic: Mosaic,
  sources: SourceImage[],
  highlightSourceId?: string | null,
) {
  const cell = 84;
  const { columns, rows } = mosaic.settings;
  const work = document.createElement("canvas");
  await renderMosaic(work, mosaic, sources, { tilePx: cell, gap: 0, border: 0 });

  canvas.width = columns * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(work, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(9,11,15,0.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `500 ${Math.round(cell * 0.24)}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const tile of mosaic.tiles) {
    const x = tile.column * cell;
    const y = tile.row * cell;
    const isHighlight = highlightSourceId && tile.sourceImageId === highlightSourceId;
    if (isHighlight) {
      ctx.fillStyle = "rgba(240,182,74,0.28)";
      ctx.fillRect(x, y, cell, cell);
    }
    ctx.strokeStyle = isHighlight ? "rgba(240,182,74,0.9)" : "rgba(160,180,205,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.fillStyle = isHighlight ? "#f6d79c" : "rgba(226,235,245,0.92)";
    ctx.fillText(tile.id, x + cell / 2, y + cell / 2);
    ctx.fillStyle = "rgba(160,180,205,0.75)";
    ctx.font = `400 ${Math.round(cell * 0.15)}px "IBM Plex Mono", monospace`;
    ctx.fillText(tile.sourceImageId, x + cell / 2, y + cell * 0.78);
    ctx.font = `500 ${Math.round(cell * 0.24)}px "IBM Plex Mono", monospace`;
  }
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string, type = "image/png") {
  const url = canvas.toDataURL(type, type === "image/jpeg" ? 0.92 : undefined);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function downloadText(text: string, filename: string, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function tileManifestCsv(mosaic: Mosaic, sources: SourceImage[]): string {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const head = [
    "id",
    "row",
    "column",
    "sourceImageId",
    "sourceTitle",
    "nasaId",
    "mission",
    "wavelength",
    "credit",
    "cropX",
    "cropY",
    "cropWidth",
    "cropHeight",
    "rotation",
    "scale",
    "similarityScore",
    "locked",
  ];
  const rows = mosaic.tiles.map((t: MosaicTile) => {
    const s = byId.get(t.sourceImageId);
    return [
      t.id,
      t.row,
      t.column,
      t.sourceImageId,
      JSON.stringify(s?.name ?? ""),
      s?.nasaId ?? "",
      s?.mission ?? "",
      s?.wavelength ?? "",
      JSON.stringify(s?.credit ?? s?.photographer ?? ""),
      t.cropX.toFixed(4),
      t.cropY.toFixed(4),
      t.cropWidth.toFixed(4),
      t.cropHeight.toFixed(4),
      t.rotation,
      t.scale,
      t.similarityScore.toFixed(4),
      t.locked,
    ].join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

/** Crop a single candidate region into a small canvas (Tile Inspector previews). */
export async function renderCandidatePreview(
  canvas: HTMLCanvasElement,
  source: SourceImage,
  crop: { x: number; y: number; w: number; h: number },
  rotation: 0 | 90 | 180 | 270 = 0,
  size = 96,
) {
  const img = await loadImage(source.url);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.translate(size / 2, size / 2);
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
}
