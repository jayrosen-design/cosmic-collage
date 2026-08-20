import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/cosmos/store";
import { renderMosaic } from "@/lib/cosmos/render";
import { cn } from "@/lib/utils";

export type CanvasView = "target" | "reconstruction" | "compare";

export function MosaicCanvas({ view }: { view: CanvasView }) {
  const { mosaic, target, images, selectedTileId, selectTile, generating, progress } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [split, setSplit] = useState(50);
  const [ready, setReady] = useState(false);

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

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mosaic) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * mosaic.settings.columns);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * mosaic.settings.rows);
    const tile = mosaic.tiles.find((t) => t.row === row && t.column === col);
    selectTile(tile ? tile.id : null);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background p-6">
      <div className="relative max-h-full max-w-full">
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
            onClick={handleClick}
            className={cn(
              "max-h-[calc(100vh-13rem)] max-w-full cursor-crosshair object-contain transition-opacity",
              ready ? "opacity-100" : "opacity-40",
            )}
          />
        )}

        {view === "compare" && target && (
          <div className="relative">
            <canvas
              ref={canvasRef}
              onClick={handleClick}
              className="max-h-[calc(100vh-13rem)] max-w-full cursor-crosshair object-contain"
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
        <p className="data-mono absolute bottom-4 text-muted-foreground">
          No collage yet — press Generate Mosaic.
        </p>
      )}
    </div>
  );
}
