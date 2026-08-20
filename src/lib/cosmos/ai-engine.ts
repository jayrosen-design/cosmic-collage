/**
 * AI Alignment engine.
 *
 * Phase 1  baseline reconstruction with the deterministic BrowserAnalysisEngine
 * Phase 2  global NaviGator comparison of target vs. baseline
 * Phase 3  local weak-region detection (deterministic maths)
 * Phase 4  candidate contact sheets reviewed by NaviGator
 * Phase 5  numerical validation and application of accepted refinements
 *
 * The AI is an advisor only. Every accepted tile still references a crop of a real
 * source photograph; no imagery is generated, blended or altered at any point.
 */

import {
  browserEngine,
  loadImage,
  makeAnalysisBitmap,
  scoreFeatures,
  weightsForAbstraction,
} from "./engine";
import {
  analyzeGlobalAlignment,
  buildContactSheet,
  CANDIDATE_LETTERS,
  chooseCandidate,
  regionWeightFactory,
  renderMosaicAnalysisImage,
  renderTargetAnalysisImage,
  type GlobalAnalysis,
  type SheetCandidate,
} from "./ai-analysis";
import { NavigatorError, resolveModel, runQueue } from "./navigator";
import { rankWeakTiles, targetCellImportance, cellAt } from "./registration";
import {
  alignmentQuality,
  averageQuality,
  buildContinuity,
  continuityFor,
  MIN_REFINEMENT_DELTA,
  QUALITY_WEIGHTS,
} from "./quality";
import { computeVirtualTargetLayout, describeVirtualTargetCell } from "./composition";
import type {
  CandidateCrop,
  EngineProgress,
  ImageFeatures,
  Mosaic,
  MosaicAnalysisEngine,
  MosaicSettings,
  MosaicTile,
  SourceImage,
} from "./types";

export const AI_PHASES = [
  "Preparing source archive",
  "Generating baseline reconstruction",
  "Analyzing target structure",
  "Evaluating alignment",
  "Reviewing candidate photographs",
  "Optimizing reconstruction",
  "Rendering final mosaic",
] as const;

export type AiPhase = (typeof AI_PHASES)[number];

export interface AiProgress {
  /** index into AI_PHASES of the phase currently running */
  phaseIndex: number;
  phase: AiPhase;
  detail?: string;
  value: number; // 0..1
  /** regions queued for candidate review, once known */
  plannedRegions?: number;
  reviewedRegions?: number;
}

export interface ScoreTriple {
  structure: number;
  brightness: number;
  similarity: number;
}

/** Development diagnostics — never includes the API key. */
export interface AiDiagnostics {
  model: string;
  globalAnalysisReceived: boolean;
  globalRegionsFlagged: number;
  regionsQueued: number;
  successfulResponses: number;
  /** model answered CURRENT — no change wanted */
  currentResponses: number;
  alternativeRecommendations: number;
  /** alternatives discarded because the model itself called the gain none/minor */
  minorDifferenceIgnored: number;
  differenceCounts: Record<"none" | "minor" | "clear" | "strong", number>;
  acceptedAfterValidation: number;
  rejectedAfterValidation: number;
  /** model self-report; displayed but never authoritative */
  averageConfidence: number;
  /** mean composite alignment-quality gain across accepted tiles */
  averageChangedImprovement: number;
  /** internal control: the same regions refined by random valid alternatives */
  control: {
    changed: number;
    structureDelta: number;
    compositeDelta: number;
  };
}

export interface AiAlignmentStats {
  reviewed: number;
  replaced: number;
  rotated: number;
  regionsFlagged: number;
  /** whole-mosaic averages */
  before: ScoreTriple;
  after: ScoreTriple;
  /** composite alignment quality — the objective everything is judged against */
  qualityBefore: number;
  qualityAfter: number;
  /** averages restricted to tiles the AI actually changed */
  changedCount: number;
  changedBefore: ScoreTriple;
  changedAfter: ScoreTriple;
  changedQualityBefore: number;
  changedQualityAfter: number;
  overall: GlobalAnalysis["overall"] | null;
  diagnostics: AiDiagnostics;
}

export interface AiAlignmentResult {
  mosaic: Mosaic;
  baseline: Mosaic;
  stats: AiAlignmentStats;
}

/** Internal, deliberately not exposed as a user setting yet. */
const MAX_REVIEW_TILES = 32;
const MIN_REVIEW_TILES = 8;
const CONCURRENCY = 2;

const averages = (tiles: MosaicTile[]) => {
  const n = Math.max(1, tiles.length);
  return {
    structure: tiles.reduce((a, t) => a + t.structureScore, 0) / n,
    brightness: tiles.reduce((a, t) => a + t.brightnessScore, 0) / n,
    similarity: tiles.reduce((a, t) => a + t.similarityScore, 0) / n,
  };
};

export interface AiGenerateContext {
  target: SourceImage;
  sources: SourceImage[];
  lockedTiles?: MosaicTile[];
  onProgress?: (p: AiProgress) => void;
  onBaseline?: (m: Mosaic) => void;
  signal?: AbortSignal | null;
  /** number of weak regions to review; defaults to the internal limit */
  reviewLimit?: number;
}

/** Estimated NaviGator requests for a run: 1 global comparison + N region reviews. */
export function estimateRequests(tileCount: number, reviewLimit = MAX_REVIEW_TILES) {
  const regions = Math.max(MIN_REVIEW_TILES, Math.min(reviewLimit, Math.round(tileCount * 0.12)));
  return { regions, total: regions + 1 };
}

export class AIAnalysisEngine implements MosaicAnalysisEngine {
  readonly mode = "ai" as const;

  analyzeImage(image: SourceImage): Promise<ImageFeatures> {
    return browserEngine.analyzeImage(image);
  }

  findCandidates(target: ImageFeatures, limit?: number): Promise<CandidateCrop[]> {
    return browserEngine.findCandidates(target, limit);
  }

  /** MosaicAnalysisEngine compatibility: returns the refined mosaic only. */
  async generateMosaic(
    settings: MosaicSettings,
    ctx: {
      target: SourceImage;
      sources: SourceImage[];
      lockedTiles?: MosaicTile[];
      onProgress?: (p: EngineProgress) => void;
    },
  ): Promise<Mosaic> {
    const result = await this.align(settings, {
      target: ctx.target,
      sources: ctx.sources,
      ...(ctx.lockedTiles ? { lockedTiles: ctx.lockedTiles } : {}),
      ...(ctx.onProgress
        ? {
            onProgress: (p: AiProgress) =>
              ctx.onProgress!({
                phase: p.phase,
                value: p.value,
                ...(p.detail === undefined ? {} : { detail: p.detail }),
              }),
          }
        : {}),
    });
    return result.mosaic;
  }

  /** Full AI Alignment run with baseline preservation and statistics. */
  async align(settings: MosaicSettings, ctx: AiGenerateContext): Promise<AiAlignmentResult> {
    const { target, sources, signal } = ctx;
    const report = (p: AiProgress) => ctx.onProgress?.(p);
    const abortIfCancelled = () => {
      if (signal?.aborted) throw new NavigatorError("timeout", "AI Alignment cancelled.");
    };

    report({ phaseIndex: 0, phase: AI_PHASES[0], value: 0.02 });

    /* Phase 1 — deterministic baseline ------------------------------------ */
    const baseline = await browserEngine.generateMosaic(settings, {
      target,
      sources,
      ...(ctx.lockedTiles ? { lockedTiles: ctx.lockedTiles } : {}),
      onProgress: (p) =>
        report({
          phaseIndex: 1,
          phase: AI_PHASES[1],
          value: 0.02 + p.value * 0.28,
          ...(p.detail === undefined ? {} : { detail: p.detail }),
        }),
    });
    ctx.onBaseline?.(baseline);
    abortIfCancelled();

    const targetEl = await loadImage(target.url);
    const targetBmp = makeAnalysisBitmap(targetEl, 640);
    // exactly the same composition geometry the deterministic engine reconstructed
    const layout = baseline.layout ?? computeVirtualTargetLayout(settings, targetBmp);
    const { columns, rows } = settings;

    report({
      phaseIndex: 2,
      phase: AI_PHASES[2],
      value: 0.32,
      detail: "reduced-resolution analysis copies",
    });
    const cells = targetCellImportance(targetBmp, columns, rows, layout);
    const [targetImage, mosaicImage] = await Promise.all([
      renderTargetAnalysisImage(target, layout),
      renderMosaicAnalysisImage(baseline, sources),
    ]);
    abortIfCancelled();

    /* Phase 2 — global AI comparison -------------------------------------- */
    report({ phaseIndex: 3, phase: AI_PHASES[3], value: 0.38, detail: "global structural comparison" });
    let analysis: GlobalAnalysis | null = null;
    try {
      analysis = await analyzeGlobalAlignment(targetImage, mosaicImage, signal);
    } catch (err) {
      // A failed global pass must not lose the baseline; continue with local maths.
      if (err instanceof NavigatorError && err.kind === "auth") throw err;
      if (signal?.aborted) throw err;
      analysis = null;
    }
    abortIfCancelled();

    /* Phase 3 — weak region detection ------------------------------------- */
    const regionWeight = regionWeightFactory(analysis, columns, rows);
    const limit = Math.max(
      MIN_REVIEW_TILES,
      Math.min(ctx.reviewLimit ?? MAX_REVIEW_TILES, Math.round(baseline.tiles.length * 0.12)),
    );
    const weak = rankWeakTiles(baseline, cells, regionWeight, limit);
    report({
      phaseIndex: 4,
      phase: AI_PHASES[4],
      value: 0.45,
      detail: `${weak.length} regions queued`,
      plannedRegions: weak.length,
      reviewedRegions: 0,
    });

    /* Phase 4 — candidate contact sheets ---------------------------------- */
    const weights = weightsForAbstraction(settings.abstraction);
    const sourceById = (id: string) => sources.find((s) => s.id === id) ?? (target.id === id ? target : undefined);
    const rotations: Array<0 | 90 | 180 | 270> = settings.allowRotation ? [0, 90, 180, 270] : [0];

    interface Refinement {
      tileId: string;
      candidateIndex: number;
      confidence: number;
      reason: string;
      difference: "none" | "minor" | "clear" | "strong";
      targetFeatures: string[];
    }

    let reviewed = 0;
    let responded = 0;
    let currentResponses = 0;
    let alternativeResponses = 0;
    let minorDifferenceIgnored = 0;
    const differenceCounts = { none: 0, minor: 0, clear: 0, strong: 0 };
    const results = await runQueue<(typeof weak)[number], Refinement | null>(
      weak,
      async (entry) => {
        abortIfCancelled();
        const tile = entry.tile;
        const alts = tile.alternatives
          .map((i) => browserEngine.candidates[i])
          .filter((c): c is CandidateCrop => !!c)
          .slice(0, 8);
        if (alts.length === 0) return null;

        const sheet: SheetCandidate[] = alts.map((candidate, i) => ({
          letter: CANDIDATE_LETTERS[i]!,
          candidate,
          rotation: tile.rotation,
        }));
        const sheetImage = await buildContactSheet(
          tile,
          target,
          sheet,
          sourceById,
          columns,
          rows,
          layout,
        );
        const choice = await chooseCandidate(
          sheetImage,
          sheet.map((s) => s.letter),
          signal,
        );

        reviewed++;
        report({
          phaseIndex: 4,
          phase: AI_PHASES[4],
          value: 0.45 + (0.4 * reviewed) / Math.max(1, weak.length),
          detail: `region ${reviewed} of ${weak.length}`,
          plannedRegions: weak.length,
          reviewedRegions: reviewed,
        });

        responded++;
        const id = choice.candidateId.trim().toUpperCase();
        if (id === "CURRENT") {
          currentResponses++;
          differenceCounts.none++;
          return null;
        }
        const picked = sheet.find((s) => s.letter === id);
        if (!picked) return null;
        const difference = choice.differenceFromCurrent ?? "none";
        differenceCounts[difference]++;
        // The model must claim a clear gain before the engine even evaluates it.
        if (difference === "none" || difference === "minor") {
          minorDifferenceIgnored++;
          return null;
        }
        alternativeResponses++;
        return {
          tileId: tile.id,
          candidateIndex: picked.candidate.index,
          confidence: choice.confidence ?? 0.5,
          reason: choice.reason ?? "Better structural correspondence with the target region.",
          difference,
          targetFeatures: choice.targetFeatures ?? [],
        };
      },
      { concurrency: CONCURRENCY, retries: 2, signal: signal ?? null },
    );
    abortIfCancelled();

    /* Phase 5 — numerical validation + application ------------------------ */
    report({ phaseIndex: 5, phase: AI_PHASES[5], value: 0.88, detail: "validating recommendations" });

    const reviewedIds = new Set(weak.map((w) => w.tile.id));
    const refinements = new Map<string, Refinement>();
    for (const r of results) if (r) refinements.set(r.tileId, r);

    let replaced = 0;
    let rotated = 0;
    let accepted = 0;
    let rejected = 0;
    let confidenceSum = 0;
    let improvementSum = 0;

    const tiles = baseline.tiles.map((tile) => {
      if (!reviewedIds.has(tile.id)) return { ...tile };
      const base: MosaicTile = {
        ...tile,
        aiAdjustment: { changed: false, reviewed: true },
      };
      const rec = refinements.get(tile.id);
      if (!rec || tile.locked) return base;

      const cand = browserEngine.candidates[rec.candidateIndex];
      if (!cand) return base;

      const cell = describeVirtualTargetCell(
        targetBmp,
        layout,
        tile.row,
        tile.column,
        rows,
        columns,
      ).features;

      // Rotation is decided numerically, never by the model: evaluate the chosen
      // photograph at every permitted rotation and keep the best-scoring one.
      let bestRotation: 0 | 90 | 180 | 270 = tile.rotation;
      let parts = scoreFeatures(cell, browserEngine.featuresFor(cand.index, bestRotation), weights);
      for (const rot of rotations) {
        const p = scoreFeatures(cell, browserEngine.featuresFor(cand.index, rot), weights);
        const better = p.structure * 0.55 + p.similarity * 0.45;
        const current = parts.structure * 0.55 + parts.similarity * 0.45;
        if (better > current) {
          parts = p;
          bestRotation = rot;
        }
      }

      // The application, not the model, has the final say.
      const structureDrop = tile.structureScore - parts.structure;
      const brightnessDrop = tile.brightnessScore - parts.brightness;
      const similarityDrop = tile.similarityScore - parts.similarity;
      const improves = parts.structure > tile.structureScore || parts.similarity > tile.similarityScore;
      const severe = structureDrop > 0.12 || brightnessDrop > 0.12 || similarityDrop > 0.08;
      if (!improves || severe) {
        rejected++;
        return base;
      }

      accepted++;
      confidenceSum += rec.confidence;
      improvementSum += parts.similarity - tile.similarityScore;
      if (cand.index !== tile.candidateIndex) replaced++;
      if (bestRotation !== tile.rotation) rotated++;

      return {
        ...base,
        sourceImageId: cand.sourceId,
        candidateIndex: cand.index,
        cropX: cand.x,
        cropY: cand.y,
        cropWidth: cand.w,
        cropHeight: cand.h,
        scale: cand.scale,
        rotation: bestRotation,
        similarityScore: parts.similarity,
        brightnessScore: parts.brightness,
        colorScore: parts.color,
        structureScore: parts.structure,
        aiAdjustment: {
          changed: true,
          reviewed: true,
          previousCandidateIndex: tile.candidateIndex,
          previousSourceImageId: tile.sourceImageId,
          previousRotation: tile.rotation,
          previousSimilarityScore: tile.similarityScore,
          previousStructureScore: tile.structureScore,
          previousBrightnessScore: tile.brightnessScore,
          reason: rec.reason,
          confidence: rec.confidence,
        },
      } satisfies MosaicTile;
    });

    report({ phaseIndex: 6, phase: AI_PHASES[6], value: 0.98 });

    const mosaic: Mosaic = {
      ...baseline,
      tiles,
      createdAt: Date.now(),
      engine: "ai",
    };

    const changedIds = new Set(
      tiles.filter((t) => t.aiAdjustment?.changed).map((t) => t.id),
    );
    const changedBefore = baseline.tiles.filter((t) => changedIds.has(t.id));
    const changedAfter = tiles.filter((t) => changedIds.has(t.id));

    let model = "unknown";
    try {
      model = await resolveModel(signal);
    } catch {
      model = "unresolved";
    }

    return {
      mosaic,
      baseline,
      stats: {
        reviewed: weak.length,
        replaced,
        rotated,
        regionsFlagged: analysis?.regions.length ?? 0,
        before: averages(baseline.tiles),
        after: averages(tiles),
        changedCount: changedIds.size,
        changedBefore: averages(changedBefore),
        changedAfter: averages(changedAfter),
        overall: analysis?.overall ?? null,
        diagnostics: {
          model,
          globalAnalysisReceived: !!analysis,
          globalRegionsFlagged: analysis?.regions.length ?? 0,
          regionsQueued: weak.length,
          successfulResponses: responded,
          currentResponses,
          alternativeRecommendations: alternativeResponses,
          acceptedAfterValidation: accepted,
          rejectedAfterValidation: rejected,
          averageConfidence: accepted ? confidenceSum / accepted : 0,
          averageChangedImprovement: accepted ? improvementSum / accepted : 0,
        },
      },
    };
  }
}

export const aiEngine = new AIAnalysisEngine();
