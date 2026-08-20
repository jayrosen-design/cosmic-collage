import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useStudio } from "@/lib/cosmos/store";
import { drawVirtualTargetFrame } from "@/lib/cosmos/composition";
import { renderMosaic } from "@/lib/cosmos/render";
import { loadImage } from "@/lib/cosmos/engine";
import { cn } from "@/lib/utils";

export type CanvasView = "target" | "reconstruction" | "baseline" | "compare";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function MosaicCanvas({ view }: { view: CanvasView }) {
  const {
    mosaic,
    target,
    images,
    selectedTileId,
    selectTile,
    swapTiles,
    generating,
    progress,
    aiBaseline,
    aiGenerating,
    aiProgress,
    settings,
  } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [ready, setReady] = useState(false);

  const [camera, setCamera] = useState({ zoom: 1, offset: { x: 0, y: 0 } });
  const [panning, setPanning] = useState(false);
  const [dragTileId, setDragTileId] = useState<string | null>(null);
  const [hoverTileId, setHoverTileId] = useState<string | null>(null);
  const [showAiChanges, setShowAiChanges] = useState(true);
  const baselineRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<HTMLCanvasElement>(null);
  const compareRef = useRef<HTMLCanvasElement>(null);
  const layout = mosaic?.layout ?? null;
  const adjusted = (mosaic?.tiles ?? []).filter((t) => t.aiAdjustment);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mosaic || view === "target") return;
    let cancelled = false;
    setReady(false);
    void renderMosaic(canvas, mosaic, images, { highlightTileId: selectedTileId }).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mosaic, images, selectedTileId, view]);

  useEffect(() => {
    const canvas = baselineRef.current;
    if (!canvas || !aiBaseline || view !== "baseline") return;
    void renderMosaic(canvas, aiBaseline, images);
  }, [aiBaseline, images, view]);

  // Target and Compare views render the target through the shared Virtual Target
  // Canvas — same aspect ratio, same padding, same position as the reconstruction.
  useEffect(() => {
    if (!target || !layout) return;
    const canvas = view === "target" ? targetRef.current : view === "compare" ? compareRef.current : null;
    if (!canvas) return;
    let cancelled = false;
    void loadImage(target.url).then((img) => {
      if (cancelled) return;
      const mosaicCanvas = canvasRef.current;
      const width =
        view === "compare" && mosaicCanvas?.width ? mosaicCanvas.width : 1600;
      const height =
        view === "compare" && mosaicCanvas?.height
          ? mosaicCanvas.height
          : Math.round(1600 / Math.max(0.2, layout.canvasAspect));
      drawVirtualTargetFrame(canvas, img, layout, width, height);
    });
    return () => {
      cancelled = true;
    };
  }, [target, layout, view, ready, mosaic]);

  const reset = useCallback(() => {
    setCamera({ zoom: 1, offset: { x: 0, y: 0 } });
  }, []);

  useEffect(() => {
    reset();
  }, [view, reset]);

  const zoomAt = useCallback((zoomFactor: number, px: number, py: number) => {
    setCamera((current) => {
      const nextZoom = clamp(current.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      const k = nextZoom / current.zoom;
      return {
        zoom: nextZoom,
        offset: {
          x: px - (px - current.offset.x) * k,
          y: py - (py - current.offset.y) * k,
        },
      };
    });
  }, []);

  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      // coordinates are relative to the viewport center so the anchor math matches
      // transform-origin: center center.
      const px = e.clientX - rect.left - cx;
      const py = e.clientY - rect.top - cy;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomAtRef.current(Math.exp(-dy * 0.0018), px, py);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const zoomButton = (factor: number) => {
    // Zoom in/out anchored at the viewport center.
    zoomAt(factor, 0, 0);
  };

  const tileAt = (e: React.MouseEvent, canvas: HTMLCanvasElement) => {
    if (!mosaic) return null;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * mosaic.settings.columns);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * mosaic.settings.rows);
    return mosaic.tiles.find((t) => t.row === row && t.column === col) ?? null;
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const tile = tileAt(e, e.currentTarget);
    selectTile(tile ? tile.id : null);
    if (tile && !tile.locked) {
      setDragTileId(tile.id);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragTileId) return;
    const tile = tileAt(e, e.currentTarget);
    setHoverTileId(tile ? tile.id : null);
  };

  const onCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragTileId) return;
    const tile = tileAt(e, e.currentTarget);
    if (tile && tile.id !== dragTileId) {
      swapTiles(dragTileId, tile.id);
      selectTile(tile.id);
    }
    setDragTileId(null);
    setHoverTileId(null);
  };

  // Right-drag panning on the viewport.
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const onViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 2) return;
    e.preventDefault();
    panStart.current = { x: e.clientX, y: e.clientY, ox: camera.offset.x, oy: camera.offset.y };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = panStart.current;
    if (!s) return;
    setCamera((c) => ({
      ...c,
      offset: { x: s.ox + (e.clientX - s.x), y: s.oy + (e.clientY - s.y) },
    }));
  };
  const endPan = () => {
    panStart.current = null;
    setPanning(false);
  };

  const canvasClass = cn(
    "max-h-full max-w-full object-contain",
    dragTileId ? "cursor-grabbing" : "cursor-crosshair",
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <div
        ref={viewportRef}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden p-6 touch-none",
          panning && "cursor-grabbing",
        )}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${camera.offset.x}px, ${camera.offset.y}px) scale(${camera.zoom})`,
            transformOrigin: "center center",
          }}
        >
          {view === "target" &&
            target &&
            (layout ? (
              <canvas
                ref={targetRef}
                aria-label={`Target photograph in composition: ${target.name}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <img
                src={target.url}
                alt={`Target photograph: ${target.name}`}
                className="max-h-full max-w-full object-contain"
              />
            ))}

          {view === "baseline" &&
            (aiBaseline ? (
              <canvas ref={baselineRef} className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="data-mono text-muted-foreground">
                Run AI Alignment to compare against the Visual Analysis reconstruction.
              </p>
            ))}

          {view === "reconstruction" && (
            <div className="relative">
              <canvas
                ref={canvasRef}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                className={cn(canvasClass, "transition-opacity", ready ? "opacity-100" : "opacity-40")}
              />
              {showAiChanges && adjusted.length > 0 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 grid"
                  style={{
                    gridTemplateColumns: `repeat(${settings.columns}, 1fr)`,
                    gridTemplateRows: `repeat(${settings.rows}, 1fr)`,
                  }}
                >
                  {mosaic?.tiles.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "border",
                        t.aiAdjustment ? "border-primary/70 bg-primary/10" : "border-transparent",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "compare" && target && (
            <div className="relative">
              <canvas
                ref={canvasRef}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                className={canvasClass}
              />
              {/* same VirtualTargetLayout as the reconstruction — never stretched */}
              <canvas
                ref={compareRef}
                aria-label={`Target photograph in composition: ${target.name}`}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              />
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber"
                style={{ left: `${split}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                aria-label="Compare target and reconstruction"
                onChange={(e) => setSplit(Number(e.target.value))}
                className="absolute -bottom-8 left-0 w-full accent-[oklch(0.79_0.13_72)]"
              />
            </div>
          )}
        </div>

        {/* Magnifier controls */}
        <div className="absolute top-4 right-4 flex flex-col overflow-hidden rounded border border-border bg-surface/90 backdrop-blur">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomButton(1.35)}
            className="flex h-9 w-9 items-center justify-center text-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="data-mono border-y border-border px-1 py-1 text-center text-[10px] text-muted-foreground">
            {Math.round(camera.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomButton(1 / 1.35)}
            className="flex h-9 w-9 items-center justify-center text-foreground hover:bg-muted"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            onClick={reset}
            className="flex h-9 w-9 items-center justify-center border-t border-border text-foreground hover:bg-muted"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {adjusted.length > 0 && view === "reconstruction" && (
          <button
            type="button"
            onClick={() => setShowAiChanges((v) => !v)}
            className="data-mono absolute top-4 left-4 rounded border border-border bg-surface/90 px-2 py-1 text-[10px] text-foreground backdrop-blur hover:bg-muted"
          >
            {showAiChanges ? "✦ Hide AI changes" : "✦ Show AI changes"} ({adjusted.length})
          </button>
        )}

        <p className="data-mono pointer-events-none absolute bottom-2 left-4 text-[10px] text-muted-foreground">
          scroll = zoom · right-drag = pan · left-drag tile = swap
          {dragTileId && hoverTileId ? " · release to swap" : ""}
        </p>
      </div>

      {aiGenerating && (
        <div className="absolute inset-x-0 bottom-0 border-t border-primary/40 bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="data-mono text-primary">
              ✦ {aiProgress?.phase ?? "Starting AI Alignment"}
            </span>
            <span className="data-mono text-muted-foreground">
              {aiProgress?.reviewedRegions != null && aiProgress?.plannedRegions != null
                ? `region ${aiProgress.reviewedRegions}/${aiProgress.plannedRegions}`
                : aiProgress?.detail}
            </span>
          </div>
          <div className="mt-2 h-px w-full bg-border">
            <div
              className="h-px bg-primary transition-all"
              style={{ width: `${Math.round((aiProgress?.value ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {generating && !aiGenerating && (
        <div className="absolute inset-x-0 bottom-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="data-mono text-foreground">{progress?.phase ?? "Working..."}</span>
            <span className="data-mono text-muted-foreground">{progress?.detail}</span>
          </div>
          <div className="mt-2 h-px w-full bg-border">
            <div
              className="h-px bg-amber transition-all"
              style={{ width: `${Math.round((progress?.value ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {!mosaic && !generating && (
        <p className="data-mono absolute bottom-4 left-1/2 -translate-x-1/2 text-muted-foreground">
          No collage yet — press Generate Mosaic.
        </p>
      )}
    </div>
  );
}
