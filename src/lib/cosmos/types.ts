/**
 * Cosmic Collage core data model.
 * Entities: Project, SourceImage, ImageFeatures, CandidateCrop, Mosaic, MosaicTile, Settings.
 * Community entities (User, Profile, Collection, License, CommunityProject, Contribution)
 * are intentionally not implemented in this build.
 */

export type Wavelength =
  | "rgb"
  | "uv"
  | "ir"
  | "ha"
  | "oiii"
  | "sii"
  | "mono"
  | "dark"
  | "composite"
  | "other";

export const WAVELENGTH_LABEL: Record<Wavelength, string> = {
  rgb: "Visible / RGB",
  uv: "Ultraviolet",
  ir: "Infrared",
  ha: "Hydrogen-alpha",
  oiii: "OIII",
  sii: "SII",
  mono: "Monochrome",
  dark: "Dark Sky",
  composite: "UV + Infrared",
  other: "Other",
};

export const ARCHIVE_FILTERS = [
  "All",
  "RGB",
  "Ultraviolet",
  "Infrared",
  "Hydrogen-alpha",
  "OIII",
  "SII",
  "Monochrome",
  "Dark Sky",
  "Star Field",
  "Galaxy",
  "Nebula",
  "Other",
] as const;
export type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

/** A photograph in the archive. Provenance is never discarded. */
export interface SourceImage {
  id: string;
  name: string;
  url: string;
  wavelength: Wavelength;
  /** NASA asset id, or undefined for personal uploads. */
  nasaId?: string;
  mission?: string;
  credit?: string;
  photographer?: string;
  captureDate?: string;
  equipment?: string;
  location?: string;
  filters?: string;
  /** Reserved for the future community layer. */
  license?: "private" | "community" | "public-remix" | "commercial-remix";
  tags: string[];
  enabled: boolean;
  origin: "demo" | "upload";
  width: number;
  height: number;
}

/** Descriptors computed from a low-resolution analysis representation. */
export interface ImageFeatures {
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  v: number;
  luminance: number;
  contrast: number;
  /** 12-bin colour histogram (4 luminance x 3 channel-dominance bins). */
  histogram: number[];
  edgeDensity: number;
  /** Dominant edge direction in radians, 0..PI. */
  edgeDirection: number;
  /** 4x4 luminance structure grid. */
  structure: number[];
}

export interface CandidateCrop {
  index: number;
  sourceId: string;
  /** Normalised crop rect within the source photograph. */
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  features: ImageFeatures;
}

/** Provenance of an AI Alignment adjustment. Never replaces photographic credit. */
export interface AiAdjustment {
  changed: boolean;
  reviewed: boolean;
  previousCandidateIndex?: number;
  previousSourceImageId?: string;
  previousRotation?: 0 | 90 | 180 | 270;
  previousSimilarityScore?: number;
  previousStructureScore?: number;
  previousBrightnessScore?: number;
  reason?: string;
  confidence?: number;
}

export interface MosaicTile {
  id: string;
  row: number;
  column: number;
  sourceImageId: string;
  candidateIndex: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  rotation: 0 | 90 | 180 | 270;
  scale: number;
  similarityScore: number;
  brightnessScore: number;
  colorScore: number;
  structureScore: number;
  locked: boolean;
  /** Fraction of this cell covered by the real target photograph (1 = fully inside). */
  targetCoverage?: number;
  /** Candidate indexes offered in the Tile Inspector. */
  alternatives: number[];
  /** Present only on tiles reviewed by AI Alignment. */
  aiAdjustment?: AiAdjustment;
}


export interface MosaicSettings {
  columns: number;
  rows: number;
  tileGap: number;
  tileBorder: number;
  /**
   * "target" — the mosaic frame matches the Virtual Target Canvas aspect (tiles
   * become uniformly rectangular). "square" — tiles stay square.
   */
  aspectMode: "target" | "square";
  /* Composition (Virtual Target Canvas) */
  canvasAspect: "auto" | "3:2" | "4:3" | "16:9" | "1:1" | "custom";
  /** used only when canvasAspect === "custom" */
  customAspect: number;
  /** 0.4..1 — how much of the composition the astronomical target occupies */
  targetScale: number;
  /** 0..1 horizontal position of the target inside the composition */
  targetOffsetX: number;
  /** 0..1 vertical position of the target inside the composition */
  targetOffsetY: number;
  /** mosaic background padding around the target */
  mosaicPadding: boolean;
  abstraction: number;
  randomness: number;
  seed: number;
  seedLocked: boolean;
  diversity: number;
  maxTilesPerSource: number;
  allowRotation: boolean;
  /** Weighting preferences per wavelength, 0..1. */
  sourceMix: Partial<Record<Wavelength, number>>;
  includeTargetInSources: boolean;
}

export interface Mosaic {
  settings: MosaicSettings;
  targetId: string;
  tiles: MosaicTile[];
  candidateCount: number;
  createdAt: number;
  engine: "visual" | "ai";
}

export interface Project {
  id: string;
  name: string;
  object: string;
  targetId: string;
  createdAt: number;
}

export interface EngineProgress {
  phase: string;
  detail?: string;
  value: number; // 0..1
}

/** The seam the future Python AI service plugs into. */
export interface MosaicAnalysisEngine {
  readonly mode: "visual" | "ai";
  analyzeImage(image: SourceImage): Promise<ImageFeatures>;
  findCandidates(target: ImageFeatures, limit?: number): Promise<CandidateCrop[]>;
  generateMosaic(
    settings: MosaicSettings,
    ctx: {
      target: SourceImage;
      sources: SourceImage[];
      lockedTiles?: MosaicTile[];
      onProgress?: (p: EngineProgress) => void;
    },
  ): Promise<Mosaic>;
}

export const TILE_ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function tileLabel(row: number, column: number): string {
  const letter =
    row < 26
      ? (TILE_ROW_LETTERS[row] ?? "?")
      : (TILE_ROW_LETTERS[Math.floor(row / 26) - 1] ?? "?") + (TILE_ROW_LETTERS[row % 26] ?? "?");
  return `${letter}${String(column + 1).padStart(2, "0")}`;
}
