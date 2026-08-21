import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { computeVirtualTargetLayout, describeVirtualTargetCell } from "./composition";
import {
  browserEngine,
  loadImage,
  makeAnalysisBitmap,
  scoreFeatures,
  weightsForAbstraction,
  type AnalysisBitmap,
} from "./engine";
import type {
  CandidateCrop,
  EngineProgress,
  Mosaic,
  MosaicSettings,
  MosaicTile,
  Project,
  SourceImage,
  VirtualTargetLayout,
  Wavelength,
} from "./types";
import { fileToStoredImage, listUploads, removeUpload, saveUploads, updateUpload } from "./uploads";
import {
  aiEngine,
  type AiAlignmentStats,
  type AiProgress,
} from "./ai-engine";
import { getNavigatorApiKey, NavigatorError } from "./navigator";
import { AstroApertureError, buildAndromedaDataset } from "./sources/astro-aperture";


interface ManifestImage {
  id: string;
  nasaId: string;
  file: string;
  url: string;
  title: string;
  mission: string;
  wavelength: string;
  type: "target" | "source";
  tags: string[];
  credit: string;
}
interface Manifest {
  project: string;
  object: string;
  description: string;
  images: ManifestImage[];
}

export const DEFAULT_SETTINGS: MosaicSettings = {
  columns: 20,
  rows: 12,
  tileGap: 1,
  tileBorder: 0,
  aspectMode: "target",
  canvasAspect: "auto",
  customAspect: 1.5,
  targetScale: 0.72,
  targetOffsetX: 0.5,
  targetOffsetY: 0.5,
  mosaicPadding: true,
  abstraction: 0.55,
  randomness: 0.2,
  seed: 734159,
  seedLocked: false,
  diversity: 0.7,
  maxTilesPerSource: 0.15,
  allowRotation: true,
  sourceMix: {},
  includeTargetInSources: false,
};

export const PRESETS = [
  { name: "Scientific", abstraction: 0.2, randomness: 0.05, diversity: 0.3 },
  { name: "Collage", abstraction: 0.55, randomness: 0.2, diversity: 0.7 },
  { name: "Cosmic Abstraction", abstraction: 0.85, randomness: 0.6, diversity: 0.9 },
] as const;

export type InspectorMode =
  | "similar"
  | "abstract"
  | "darker"
  | "brighter"
  | "color"
  | "different-source";

interface StudioValue {
  project: Project | null;
  ready: boolean;
  loadingDemo: boolean;
  images: SourceImage[];
  target: SourceImage | undefined;
  sourcePool: SourceImage[];
  settings: MosaicSettings;
  mosaic: Mosaic | null;
  generating: boolean;
  progress: EngineProgress | null;
  selectedTileId: string | null;
  engineMode: "visual" | "ai";
  activeDemo: string | null;
  openDemo: (slug?: string) => Promise<void>;
  /** Live Astro Aperture demo — "Andromeda Through the Years". */
  openAstroApertureDemo: () => Promise<boolean>;
  liveStatus: string | null;
  liveError: string | null;
  dismissLiveError: () => void;
  patchSettings: (p: Partial<MosaicSettings>) => void;
  setTarget: (id: string) => void;
  toggleImage: (id: string, enabled: boolean) => void;
  updateImage: (id: string, patch: Partial<SourceImage>) => void;
  removeImage: (id: string) => void;
  addUploads: (files: FileList | File[]) => Promise<void>;
  importImages: (images: SourceImage[]) => Promise<void>;
  generate: () => Promise<void>;
  newSeed: () => void;
  selectTile: (id: string | null) => void;
  imageById: (id: string) => SourceImage | undefined;
  suggest: (tile: MosaicTile, mode: InspectorMode) => Array<{ candidate: CandidateCrop; score: number }>;
  replaceTile: (tileId: string, candidateIndex: number) => void;
  swapTiles: (aId: string, bId: string) => void;
  rotateTile: (tileId: string) => void;
  toggleLock: (tileId: string) => void;
  /* AI Alignment (NaviGator Toolkit) */
  aiGenerating: boolean;
  aiProgress: AiProgress | null;
  aiBaseline: Mosaic | null;
  aiStats: AiAlignmentStats | null;
  aiError: string | null;
  navigatorConnected: boolean;
  refreshNavigatorConnection: () => void;
  generateWithAI: () => Promise<void>;
  cancelAIGeneration: () => void;
  dismissAiResult: () => void;
}


const StudioContext = createContext<StudioValue | null>(null);

function normaliseWavelength(w: string): Wavelength {
  const v = w.toLowerCase();
  const allowed: Wavelength[] = [
    "rgb",
    "uv",
    "ir",
    "ha",
    "oiii",
    "sii",
    "mono",
    "dark",
    "composite",
    "other",
  ];
  return (allowed as string[]).includes(v) ? (v as Wavelength) : "other";
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<SourceImage[]>([]);
  const [settings, setSettings] = useState<MosaicSettings>(DEFAULT_SETTINGS);
  const [mosaic, setMosaic] = useState<Mosaic | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const targetBmp = useRef<AnalysisBitmap | null>(null);
  const layoutRef = useRef<VirtualTargetLayout | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
  const [aiBaseline, setAiBaseline] = useState<Mosaic | null>(null);
  const [aiStats, setAiStats] = useState<AiAlignmentStats | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [navigatorConnected, setNavigatorConnected] = useState(false);
  const aiAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    setNavigatorConnected(!!getNavigatorApiKey());
  }, []);

  const target = images.find((i) => i.id === (project?.targetId ?? ""));
  const sourcePool = useMemo(
    () =>
      images.filter(
        (i) => i.enabled && (i.id !== project?.targetId || settings.includeTargetInSources),
      ),
    [images, project?.targetId, settings.includeTargetInSources],
  );

  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const openDemo = useCallback(async (slug: string = "andromeda") => {
    if (loadingDemo) return;
    if (activeDemo === slug && project) return;
    setLoadingDemo(true);
    try {
      const res = await fetch(`/demo/${slug}/manifest.json`);
      const manifest = (await res.json()) as Manifest;
      const loaded: SourceImage[] = [];
      for (const m of manifest.images) {
        const el = await loadImage(m.url);
        loaded.push({
          id: m.id,
          name: m.title,
          url: m.url,
          wavelength: normaliseWavelength(m.wavelength),
          nasaId: m.nasaId,
          mission: m.mission,
          credit: m.credit,
          tags: m.tags,
          enabled: true,
          origin: "demo",
          width: el.naturalWidth,
          height: el.naturalHeight,
        });
      }
      const targetImage = manifest.images.find((m) => m.type === "target") ?? manifest.images[0]!;
      setImages([...loaded, ...listUploads()]);
      setMosaic(null);
      setSelectedTileId(null);
      autoRan.current = false;
      setProject({
        id: `${slug}-demo`,
        name: manifest.project,
        object: manifest.object,
        targetId: targetImage.id,
        createdAt: Date.now(),
      });
      setActiveDemo(slug);
    } finally {
      setLoadingDemo(false);
    }
  }, [project, loadingDemo, activeDemo]);

  const patchSettings = useCallback((p: Partial<MosaicSettings>) => {
    setSettings((s) => ({ ...s, ...p }));
  }, []);

  const generate = useCallback(async () => {
    if (!target || generating) return;
    const sources = images.filter(
      (i) => i.enabled && (i.id !== target.id || settings.includeTargetInSources),
    );
    if (sources.length === 0) return;
    setGenerating(true);
    setSelectedTileId(null);
    try {
      const seed = settings.seedLocked ? settings.seed : settings.seed;
      const locked = mosaic?.tiles.filter((t) => t.locked) ?? [];
      const result = await browserEngine.generateMosaic(
        { ...settings, seed },
        {
          target,
          sources,
          lockedTiles: locked,
          onProgress: setProgress,
        },
      );
      const el = await loadImage(target.url);
      targetBmp.current = makeAnalysisBitmap(el, 640);
      layoutRef.current = result.layout ?? null;
      setMosaic(result);
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }, [target, images, settings, generating, mosaic]);

  const refreshNavigatorConnection = useCallback(() => {
    setNavigatorConnected(!!getNavigatorApiKey());
  }, []);

  const cancelAIGeneration = useCallback(() => {
    aiAbort.current?.abort();
  }, []);

  const generateWithAI = useCallback(async () => {
    if (!target || generating || aiGenerating) return;
    if (!getNavigatorApiKey()) {
      setAiError("No NaviGator API key is configured in this browser.");
      return;
    }
    const sources = images.filter(
      (i) => i.enabled && (i.id !== target.id || settings.includeTargetInSources),
    );
    if (sources.length === 0) return;

    const controller = new AbortController();
    aiAbort.current = controller;
    setAiGenerating(true);
    setAiError(null);
    setAiStats(null);
    setSelectedTileId(null);

    let baselineMosaic: Mosaic | null = null;
    try {
      const el = await loadImage(target.url);
      targetBmp.current = makeAnalysisBitmap(el, 640);
      const result = await aiEngine.align(settings, {
        target,
        sources,
        lockedTiles: mosaic?.tiles.filter((t) => t.locked) ?? [],
        signal: controller.signal,
        onProgress: setAiProgress,
        onBaseline: (m) => {
          baselineMosaic = m;
          setAiBaseline(m);
          setMosaic(m);
        },
      });
      layoutRef.current = result.mosaic.layout ?? layoutRef.current;
      setAiBaseline(result.baseline);
      setMosaic(result.mosaic);
      setAiStats(result.stats);
    } catch (err) {
      // Never discard a valid Visual Analysis reconstruction because AI failed.
      if (baselineMosaic) setMosaic(baselineMosaic);
      const cancelled = controller.signal.aborted;
      setAiError(
        cancelled
          ? "AI Alignment was cancelled. Your Visual Analysis reconstruction has been preserved."
          : err instanceof NavigatorError
            ? `${err.message} Your Visual Analysis reconstruction has been preserved.`
            : "AI Alignment could not complete. Your Visual Analysis reconstruction has been preserved.",
      );
    } finally {
      aiAbort.current = null;
      setAiGenerating(false);
      setAiProgress(null);
    }
  }, [target, images, settings, generating, aiGenerating, mosaic]);

  // auto-generate the first collage once the demo archive is ready
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRan.current && target && !mosaic && !generating) {
      autoRan.current = true;
      void generate();
    }
  }, [target, mosaic, generating, generate]);

  const suggest = useCallback(
    (tile: MosaicTile, mode: InspectorMode) => {
      const bmp = targetBmp.current;
      if (!bmp || browserEngine.candidates.length === 0) return [];
      const layout = mosaic?.layout ?? computeVirtualTargetLayout(settings, bmp);
      const cell = describeVirtualTargetCell(
        bmp,
        layout,
        tile.row,
        tile.column,
        settings.rows,
        settings.columns,
      ).features;
      const abstraction =
        mode === "abstract" ? Math.min(1, settings.abstraction + 0.35) : mode === "similar" ? 0.1 : settings.abstraction;
      const w = weightsForAbstraction(abstraction);
      const current = browserEngine.candidates[tile.candidateIndex];
      const scored = browserEngine.candidates
        .filter((c) => (mode === "different-source" ? c.sourceId !== tile.sourceImageId : true))
        .map((c) => {
          const parts = scoreFeatures(cell, c.features, w);
          let score = parts.similarity;
          const f = c.features;
          if (mode === "darker") score += (0.6 - f.luminance) * 0.9;
          if (mode === "brighter") score += (f.luminance - 0.4) * 0.9;
          if (mode === "color") score += f.s * 0.7;
          if (mode === "abstract" && current) {
            score += Math.min(0.35, Math.abs(f.h - current.features.h)) * 0.6;
          }
          return { candidate: c, score };
        })
        .sort((a, b) => b.score - a.score);
      return scored.filter((s) => s.candidate.index !== tile.candidateIndex).slice(0, 8);
    },
    [settings, mosaic?.layout],
  );

  const mutateTile = useCallback(
    (tileId: string, fn: (t: MosaicTile) => MosaicTile) => {
      setMosaic((m) =>
        m ? { ...m, tiles: m.tiles.map((t) => (t.id === tileId ? fn(t) : t)) } : m,
      );
    },
    [],
  );

  const replaceTile = useCallback(
    (tileId: string, candidateIndex: number) => {
      const cand = browserEngine.candidates[candidateIndex];
      if (!cand) return;
      const bmp = targetBmp.current;
      mutateTile(tileId, (t) => {
        let parts = {
          similarity: t.similarityScore,
          brightness: t.brightnessScore,
          color: t.colorScore,
          structure: t.structureScore,
        };
        if (bmp) {
          const layout = layoutRef.current ?? computeVirtualTargetLayout(settings, bmp);
          const cell = describeVirtualTargetCell(
            bmp,
            layout,
            t.row,
            t.column,
            settings.rows,
            settings.columns,
          ).features;
          parts = scoreFeatures(cell, cand.features, weightsForAbstraction(settings.abstraction));
        }
        return {
          ...t,
          sourceImageId: cand.sourceId,
          candidateIndex: cand.index,
          cropX: cand.x,
          cropY: cand.y,
          cropWidth: cand.w,
          cropHeight: cand.h,
          scale: cand.scale,
          similarityScore: parts.similarity,
          brightnessScore: parts.brightness,
          colorScore: parts.color,
          structureScore: parts.structure,
        };
      });
    },
    [mutateTile, settings],
  );

  const rotateTile = useCallback(
    (tileId: string) =>
      mutateTile(tileId, (t) => ({
        ...t,
        rotation: (((t.rotation + 90) % 360) as 0 | 90 | 180 | 270),
      })),
    [mutateTile],
  );

  const toggleLock = useCallback(
    (tileId: string) => mutateTile(tileId, (t) => ({ ...t, locked: !t.locked })),
    [mutateTile],
  );

  const addUploads = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const added: SourceImage[] = [];
    for (const file of list) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) continue;
      const stored = await fileToStoredImage(file);
      if (!stored) continue;
      added.push({
        id: `UP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name: file.name.replace(/\.[^.]+$/, ""),
        url: stored.url,
        wavelength: "rgb",
        photographer: "You",
        tags: [],
        enabled: true,
        origin: "upload",
        width: stored.width,
        height: stored.height,
        license: "private",
      });
    }
    if (added.length) {
      saveUploads(added);
      setImages((prev) => [...prev, ...added]);
    }
  }, []);

  /**
   * Appends photographs imported from an external archive (Astro Aperture).
   * Existing NASA demo images and personal uploads are preserved; stable IDs
   * make re-importing the same photograph a no-op. Remote images are loaded
   * once here so the engine has real pixel dimensions.
   */
  const importImages = useCallback(async (incoming: SourceImage[]) => {
    const existingIds = new Set(images.map((i) => i.id));
    const seen = new Set<string>();
    const prepared: SourceImage[] = [];
    for (const img of incoming) {
      if (existingIds.has(img.id) || seen.has(img.id)) continue;
      seen.add(img.id);
      try {
        const el = await loadImage(img.url);
        prepared.push({ ...img, width: el.naturalWidth, height: el.naturalHeight });
      } catch {
        // a single unreachable photograph must not fail the whole import
      }
    }
    if (prepared.length) setImages((prev) => [...prev, ...prepared]);
  }, [images]);

  const openAstroApertureDemo = useCallback(async (): Promise<boolean> => {
    if (loadingDemo) return false;
    setLoadingDemo(true);
    setLiveError(null);
    setLiveStatus("Connecting to Astro Aperture…");
    try {
      const dataset = await buildAndromedaDataset((message) => setLiveStatus(message));
      const loaded: SourceImage[] = [];
      const all = [dataset.target, ...dataset.sources];
      let done = 0;
      for (const img of all) {
        try {
          const el = await loadImage(img.url);
          loaded.push({ ...img, width: el.naturalWidth, height: el.naturalHeight });
        } catch {
          // skip unreachable photographs
        }
        done += 1;
        setLiveStatus(`Processing ${done} of ${all.length} photographs…`);
      }
      if (!loaded.some((i) => i.id === dataset.target.id)) {
        throw new AstroApertureError("The Andromeda target photograph could not be loaded.");
      }
      setLiveStatus("Preparing source archive…");
      setImages([...loaded, ...listUploads()]);
      setMosaic(null);
      setSelectedTileId(null);
      autoRan.current = false;
      setSettings((s) => ({
        ...s,
        abstraction: 0.4,
        randomness: 0.12,
        diversity: 0.7,
        targetScale: 0.72,
        targetOffsetX: 0.5,
        targetOffsetY: 0.5,
        mosaicPadding: true,
        allowRotation: true,
      }));
      setProject({
        id: "astro-aperture-andromeda",
        name: "Andromeda Through the Years",
        object: "M31 - Andromeda Galaxy (Astro Aperture)",
        targetId: dataset.target.id,
        createdAt: Date.now(),
      });
      setActiveDemo("astro-andromeda");
      return true;
    } catch (err) {
      setLiveError(
        err instanceof AstroApertureError
          ? `${err.message} The bundled NASA demos are still available.`
          : "Astro Aperture could not be reached. The bundled NASA demos are still available.",
      );
      return false;
    } finally {
      setLoadingDemo(false);
      setLiveStatus(null);
    }
  }, [loadingDemo]);




  const value: StudioValue = {
    project,
    ready: !!project,
    loadingDemo,
    images,
    target,
    sourcePool,
    settings,
    mosaic,
    generating,
    progress,
    selectedTileId,
    engineMode: mosaic?.engine ?? browserEngine.mode,
    activeDemo,
    openDemo,
    openAstroApertureDemo,
    liveStatus,
    liveError,
    dismissLiveError: () => setLiveError(null),
    importImages,
    patchSettings,
    setTarget: (id) => setProject((p) => (p ? { ...p, targetId: id } : p)),
    toggleImage: (id, enabled) =>
      setImages((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          if (i.origin === "upload") updateUpload(id, { enabled });
          return { ...i, enabled };
        }),
      ),
    updateImage: (id, patch) =>
      setImages((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          if (i.origin === "upload") updateUpload(id, patch);
          return { ...i, ...patch };
        }),
      ),
    removeImage: (id) => {
      removeUpload(id);
      setImages((prev) => prev.filter((i) => i.id !== id));
    },

    addUploads,
    generate,
    newSeed: () =>
      setSettings((s) => (s.seedLocked ? s : { ...s, seed: Math.floor(Math.random() * 999999) })),
    selectTile: setSelectedTileId,
    imageById: (id) => images.find((i) => i.id === id),
    suggest,
    replaceTile,
    swapTiles: (aId, bId) =>
      setMosaic((m) => {
        if (!m || aId === bId) return m;
        const a = m.tiles.find((t) => t.id === aId);
        const b = m.tiles.find((t) => t.id === bId);
        if (!a || !b || a.locked || b.locked) return m;
        const content = (t: MosaicTile) => ({
          sourceImageId: t.sourceImageId,
          candidateIndex: t.candidateIndex,
          cropX: t.cropX,
          cropY: t.cropY,
          cropWidth: t.cropWidth,
          cropHeight: t.cropHeight,
          rotation: t.rotation,
          scale: t.scale,
          similarityScore: t.similarityScore,
          brightnessScore: t.brightnessScore,
          colorScore: t.colorScore,
          structureScore: t.structureScore,
          alternatives: t.alternatives,
        });
        const ca = content(a);
        const cb = content(b);
        return {
          ...m,
          tiles: m.tiles.map((t) =>
            t.id === aId ? { ...t, ...cb } : t.id === bId ? { ...t, ...ca } : t,
          ),
        };
      }),
    rotateTile,
    toggleLock,
    aiGenerating,
    aiProgress,
    aiBaseline,
    aiStats,
    aiError,
    navigatorConnected,
    refreshNavigatorConnection,
    generateWithAI,
    cancelAIGeneration,
    dismissAiResult: () => {
      setAiStats(null);
      setAiError(null);
    },
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside StudioProvider");
  return ctx;
}
