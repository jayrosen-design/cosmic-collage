import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useStudio } from "@/lib/cosmos/store";
import { renderMosaic } from "@/lib/cosmos/render";
import { cn } from "@/lib/utils";

export type CanvasView = "target" | "reconstruction" | "compare";

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
  } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [ready, setReady] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [dragTileId, setDragTileId] = useState<string | null>(null);
  const [hoverTileId, setHoverTileId] = useState<string | null>(null);

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

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [view, reset]);

  const zoomAt = useCallback((next: number, px: number, py: number) => {
    setZoom((z) => {
      const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
      const k = clamped / z;
      setOffset((o) => ({ x: px - (px - o.x) * k, y: py - (py - o.y) * k }));
      return clamped;
    });
  }, []);

  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomAtRef.current(
        zoomRef.current * Math.exp(-dy * 0.0018),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomButton = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(zoom * factor, rect.width / 2, rect.height / 2);
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
    panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = panStart.current;
    if (!s) return;
    setOffset({ x: s.ox + (e.clientX - s.x), y: s.oy + (e.clientY - s.y) });
  };
  const endPan = () => {
    panStart.current = null;
    setPanning(false);
  };

  const canvasClass = cn(
    "max-h-[calc(100vh-13rem)] max-w-full object-contain",
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
          className="relative max-h-full max-w-full"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {view === "target" && target && (
            <img
              src={target.url}
              alt={`Target photograph: ${target.name}`}
              className="max-h-[calc(100vh-13rem)] max-w-full object-contain"
            />
          )}

          {view === "reconstruction" && (
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              className={cn(canvasClass, "transition-opacity", ready ? "opacity-100" : "opacity-40")}
            />
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
              <img
                src={target.url}
                alt={`Target photograph: ${target.name}`}
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
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
            {Math.round(zoom * 100)}%
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

        <p className="data-mono pointer-events-none absolute bottom-2 left-4 text-[10px] text-muted-foreground">
          scroll = zoom · right-drag = pan · left-drag tile = swap
          {dragTileId && hoverTileId ? " · release to swap" : ""}
        </p>
      </div>

      {generating && (
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
