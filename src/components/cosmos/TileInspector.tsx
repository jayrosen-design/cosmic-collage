import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, RotateCw, X } from "lucide-react";
import { useStudio, type InspectorMode } from "@/lib/cosmos/store";
import { renderCandidatePreview } from "@/lib/cosmos/render";
import { WAVELENGTH_LABEL, type CandidateCrop } from "@/lib/cosmos/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: InspectorMode; label: string }> = [
  { id: "similar", label: "More Similar" },
  { id: "abstract", label: "More Abstract" },
  { id: "darker", label: "Darker" },
  { id: "brighter", label: "Brighter" },
  { id: "color", label: "More Color" },
  { id: "different-source", label: "Different Source" },
];

function CandidateThumb({
  candidate,
  onPick,
  active,
}: {
  candidate: CandidateCrop;
  onPick: () => void;
  active?: boolean;
}) {
  const { imageById } = useStudio();
  const ref = useRef<HTMLCanvasElement>(null);
  const source = imageById(candidate.sourceId);
  useEffect(() => {
    if (ref.current && source) void renderCandidatePreview(ref.current, source, candidate);
  }, [candidate, source]);
  return (
    <button
      onClick={onPick}
      title={`${source?.nasaId ?? source?.name ?? candidate.sourceId} — replace tile`}
      className={cn(
        "group relative overflow-hidden rounded-sm border transition-colors",
        active ? "border-amber" : "border-border hover:border-primary/70",
      )}
    >
      <canvas ref={ref} className="block h-16 w-16" />
      <span className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 font-mono text-[9px] text-muted-foreground">
        {source?.nasaId ?? candidate.sourceId}
      </span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label-xs">{label}</span>
        <span className="data-mono text-foreground">{value.toFixed(3)}</span>
      </div>
      <div className="mt-1 h-px w-full bg-border">
        <div className="h-px bg-primary" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function TileInspector() {
  const {
    mosaic,
    selectedTileId,
    selectTile,
    imageById,
    suggest,
    replaceTile,
    rotateTile,
    toggleLock,
  } = useStudio();
  const [mode, setMode] = useState<InspectorMode>("similar");
  const previewRef = useRef<HTMLCanvasElement>(null);

  const tile = mosaic?.tiles.find((t) => t.id === selectedTileId) ?? null;
  const source = tile ? imageById(tile.sourceImageId) : undefined;
  const alternatives = useMemo(() => (tile ? suggest(tile, mode) : []), [tile, mode, suggest]);

  useEffect(() => {
    if (previewRef.current && tile && source) {
      void renderCandidatePreview(
        previewRef.current,
        source,
        { x: tile.cropX, y: tile.cropY, w: tile.cropWidth, h: tile.cropHeight },
        tile.rotation,
        160,
      );
    }
  }, [tile, source]);

  if (!tile) {
    return (
      <div className="flex h-full items-center justify-center gap-3 px-6 py-4 text-center">
        <span className="label-xs">Tile Inspector</span>
        <p className="text-xs text-muted-foreground">
          Click any tile in the reconstruction to see which photograph produced it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="label-xs">Tile Inspector — {tile.id}</span>
          {tile.aiAdjustment?.changed && (
            <span className="data-mono rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              ✦ AI Aligned
            </span>
          )}
        </div>
        <button
          onClick={() => selectTile(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(230px,1fr)_minmax(200px,1fr)_minmax(170px,0.8fr)_minmax(300px,1.4fr)] gap-4 overflow-x-auto p-3">
        {/* provenance */}
        <div className="flex gap-3">
          <canvas ref={previewRef} className="h-24 w-24 shrink-0 rounded-sm border border-border" />
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-base text-amber">{tile.id}</p>
            <p className="truncate text-xs text-foreground">{source?.name}</p>
            <p className="data-mono text-muted-foreground">
              {source?.nasaId ?? source?.photographer}
              {source?.mission ? ` · ${source.mission}` : ""}
            </p>
            <p className="data-mono text-primary/80">
              {source ? WAVELENGTH_LABEL[source.wavelength] : ""}
            </p>
            <p className="data-mono text-muted-foreground">
              Credit: {source?.credit ?? source?.photographer ?? "—"}
            </p>
            {source?.captureDate && source.origin === "astro-aperture" && (
              <p className="data-mono text-muted-foreground">
                Captured {new Date(source.captureDate).toLocaleDateString()}
                {source.equipment ? ` · ${source.equipment}` : ""}
                {source.filters ? ` · ${source.filters}` : ""}
              </p>
            )}
            {source?.sourcePageUrl && (
              <a
                href={source.sourcePageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="data-mono block truncate text-primary underline-offset-2 hover:underline"
              >
                Astro Aperture — original observation
              </a>
            )}
            {tile.aiAdjustment && (
              <div className="mt-1 space-y-0.5 rounded-sm border border-primary/30 bg-primary/5 px-2 py-1">
                <p className="label-xs text-primary">
                  {tile.aiAdjustment.changed ? "AI Alignment applied" : "Reviewed by AI, kept"}
                </p>
                {tile.aiAdjustment.reason && (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {tile.aiAdjustment.reason}
                  </p>
                )}
                <p className="data-mono text-muted-foreground">
                  {tile.aiAdjustment.previousSourceImageId &&
                  tile.aiAdjustment.previousSourceImageId !== tile.sourceImageId
                    ? `was ${imageById(tile.aiAdjustment.previousSourceImageId)?.nasaId ?? tile.aiAdjustment.previousSourceImageId}`
                    : "same photograph"}
                  {tile.aiAdjustment.previousRotation != null &&
                  tile.aiAdjustment.previousRotation !== tile.rotation
                    ? ` · rotation ${tile.aiAdjustment.previousRotation}° → ${tile.rotation}°`
                    : ""}
                  {tile.aiAdjustment.difference
                    ? ` · model: ${tile.aiAdjustment.difference} gain`
                    : ""}
                  {tile.aiAdjustment.confidence != null
                    ? ` · self-reported confidence ${tile.aiAdjustment.confidence.toFixed(2)}`
                    : ""}
                </p>
                {tile.aiAdjustment.qualityBefore != null &&
                  tile.aiAdjustment.qualityAfter != null && (
                    <p className="data-mono text-foreground">
                      alignment quality {tile.aiAdjustment.qualityBefore.toFixed(3)} →{" "}
                      {tile.aiAdjustment.qualityAfter.toFixed(3)}{" "}
                      <span className="text-primary">
                        +
                        {(tile.aiAdjustment.qualityAfter - tile.aiAdjustment.qualityBefore).toFixed(
                          3,
                        )}
                      </span>
                    </p>
                  )}
                {tile.aiAdjustment.targetFeatures?.length ? (
                  <p className="data-mono text-muted-foreground">
                    read: {tile.aiAdjustment.targetFeatures.join(" · ")}
                  </p>
                ) : null}
                {tile.aiAdjustment.previousSimilarityScore != null && (
                  <p className="data-mono text-muted-foreground">
                    match {tile.aiAdjustment.previousSimilarityScore.toFixed(3)} →{" "}
                    {tile.similarityScore.toFixed(3)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* geometry */}
        <dl className="space-y-1 self-start">
          {[
            ["Row / Column", `${tile.row} / ${tile.column}`],
            ["Crop", `${tile.cropX.toFixed(3)}, ${tile.cropY.toFixed(3)}`],
            ["Crop Size", `${tile.cropWidth.toFixed(3)} × ${tile.cropHeight.toFixed(3)}`],
            ["Rotation", `${tile.rotation}°`],
            ["Scale", `${tile.scale}×`],
            ["Locked", tile.locked ? "yes" : "no"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="label-xs">{k}</dt>
              <dd className="data-mono text-foreground">{v}</dd>
            </div>
          ))}
        </dl>

        {/* metrics + actions */}
        <div className="space-y-2 self-start">
          <Metric label="Similarity" value={tile.similarityScore} />
          <Metric label="Brightness" value={tile.brightnessScore} />
          <Metric label="Color" value={tile.colorScore} />
          <Metric label="Structure" value={tile.structureScore} />
          <div className="flex gap-1 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5 border-border bg-background text-xs"
              onClick={() => rotateTile(tile.id)}
            >
              <RotateCw className="size-3.5" /> Rotate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 flex-1 gap-1.5 border-border bg-background text-xs",
                tile.locked && "border-amber/60 text-amber",
              )}
              onClick={() => toggleLock(tile.id)}
            >
              {tile.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
              {tile.locked ? "Locked" : "Lock"}
            </Button>
          </div>
        </div>

        {/* candidates */}
        <div className="space-y-2 self-start">
          <span className="label-xs">Replace Tile — candidates</span>
          <div className="flex flex-wrap gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase transition-colors",
                  mode === m.id
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {alternatives.map(({ candidate }) => (
              <CandidateThumb
                key={candidate.index}
                candidate={candidate}
                onPick={() => replaceTile(tile.id, candidate.index)}
              />
            ))}
          </div>
          {alternatives.length === 0 && (
            <p className="data-mono text-muted-foreground">No alternatives available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
