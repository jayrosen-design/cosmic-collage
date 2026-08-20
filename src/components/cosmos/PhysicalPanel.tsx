import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useStudio } from "@/lib/cosmos/store";
import {
  downloadCanvas,
  downloadText,
  renderAssemblyMap,
  renderMosaic,
  tileManifestCsv,
} from "@/lib/cosmos/render";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PhysicalPanel() {
  const { mosaic, images, imageById, selectTile, selectedTileId } = useStudio();
  const mapRef = useRef<HTMLCanvasElement>(null);
  const [highlightSource, setHighlightSource] = useState<string | null>(null);

  useEffect(() => {
    if (mapRef.current && mosaic) void renderAssemblyMap(mapRef.current, mosaic, images, highlightSource);
  }, [mosaic, images, highlightSource]);

  const exportMosaic = async (type: "image/png" | "image/jpeg") => {
    if (!mosaic) return;
    const canvas = document.createElement("canvas");
    await renderMosaic(canvas, mosaic, images, { tilePx: 96 });
    downloadCanvas(canvas, `cosmic-collage.${type === "image/png" ? "png" : "jpg"}`, type);
  };

  if (!mosaic) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-xs text-muted-foreground">Generate a collage to plan the physical build.</p>
      </div>
    );
  }

  const sourceCounts = new Map<string, number>();
  for (const t of mosaic.tiles)
    sourceCounts.set(t.sourceImageId, (sourceCounts.get(t.sourceImageId) ?? 0) + 1);

  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * mosaic.settings.columns);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * mosaic.settings.rows);
    const tile = mosaic.tiles.find((t) => t.row === row && t.column === col);
    if (tile) {
      setHighlightSource(tile.sourceImageId);
      selectTile(tile.id);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="gap-2 rounded-sm bg-amber font-mono text-xs uppercase text-[oklch(0.18_0.01_250)] hover:bg-amber/90"
          onClick={() => void exportMosaic("image/png")}
        >
          <Download className="size-3.5" /> PNG Mosaic
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border bg-background font-mono text-xs uppercase"
          onClick={() => void exportMosaic("image/jpeg")}
        >
          <Download className="size-3.5" /> JPG Mosaic
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border bg-background font-mono text-xs uppercase"
          onClick={() => downloadText(tileManifestCsv(mosaic, images), "tile-manifest.csv")}
        >
          <Download className="size-3.5" /> Tile Manifest CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border bg-background font-mono text-xs uppercase"
          onClick={() => mapRef.current && downloadCanvas(mapRef.current, "assembly-map.png")}
        >
          <Download className="size-3.5" /> Assembly Map PNG
        </Button>
        <span className="data-mono text-muted-foreground">
          TIFF · PDF · ZIP of individual tiles · print sheets — coming in AI Engine
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {[...sourceCounts.entries()].map(([id, count]) => {
          const img = imageById(id);
          return (
            <button
              key={id}
              onClick={() => setHighlightSource(highlightSource === id ? null : id)}
              className={cn(
                "flex items-center gap-2 rounded-sm border px-2 py-1 text-left transition-colors",
                highlightSource === id
                  ? "border-amber/60 bg-amber/10"
                  : "border-border hover:border-border-strong",
              )}
            >
              <img src={img?.url} alt="" className="size-7 rounded-sm object-cover" />
              <span className="data-mono text-foreground">{img?.nasaId ?? img?.name}</span>
              <span className="data-mono text-muted-foreground">{count} tiles</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-auto rounded-sm border border-border bg-background p-2">
        <canvas
          ref={mapRef}
          onClick={handleMapClick}
          className="max-w-full cursor-crosshair"
          style={{ imageRendering: "auto" }}
        />
      </div>

      <div className="rounded-sm border border-border p-3">
        <p className="label-xs">Tile Manifest</p>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="label-xs">
                <th className="py-1 pr-3">ID</th>
                <th className="py-1 pr-3">Source</th>
                <th className="py-1 pr-3">Crop</th>
                <th className="py-1 pr-3">Rot</th>
                <th className="py-1 pr-3">Scale</th>
                <th className="py-1 pr-3">Score</th>
              </tr>
            </thead>
            <tbody className="data-mono">
              {mosaic.tiles.slice(0, 400).map((t) => (
                <tr
                  key={t.id}
                  onClick={() => selectTile(t.id)}
                  className={cn(
                    "cursor-pointer border-t border-border/60 hover:bg-surface-raised",
                    selectedTileId === t.id && "bg-amber/10",
                  )}
                >
                  <td className="py-0.5 pr-3 text-amber">{t.id}</td>
                  <td className="py-0.5 pr-3">{t.sourceImageId}</td>
                  <td className="py-0.5 pr-3 text-muted-foreground">
                    {t.cropX.toFixed(2)}, {t.cropY.toFixed(2)}
                  </td>
                  <td className="py-0.5 pr-3">{t.rotation}°</td>
                  <td className="py-0.5 pr-3">{t.scale}×</td>
                  <td className="py-0.5 pr-3">{t.similarityScore.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mosaic.tiles.length > 400 && (
            <p className="data-mono mt-2 text-muted-foreground">
              Showing first 400 of {mosaic.tiles.length} tiles — full set in the CSV export.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
