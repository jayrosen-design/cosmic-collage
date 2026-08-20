import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { StudioShell } from "@/components/cosmos/StudioShell";
import { ArchivePanel } from "@/components/cosmos/ArchivePanel";
import { ControlsPanel } from "@/components/cosmos/ControlsPanel";
import { TileInspector } from "@/components/cosmos/TileInspector";
import { MosaicCanvas, type CanvasView } from "@/components/cosmos/MosaicCanvas";
import { useStudio } from "@/lib/cosmos/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Cosmos Collage" },
      {
        name: "description",
        content:
          "Reconstruct Andromeda from real NASA observations: grid, abstraction, randomness and tile-level control in the Cosmos Collage studio.",
      },
      { property: "og:title", content: "Cosmos Collage Studio" },
      {
        property: "og:description",
        content: "An artistic computational instrument for reconstructing the cosmos from photographs of the cosmos.",
      },
    ],
  }),
  component: StudioPage,
});

const VIEWS: CanvasView[] = ["target", "reconstruction", "compare"];

function StudioPage() {
  const [view, setView] = useState<CanvasView>("reconstruction");
  const { selectedTileId } = useStudio();

  return (
    <StudioShell>
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="min-h-0 overflow-hidden border-r border-border bg-sidebar">
          <ArchivePanel />
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-sm px-2 py-1 font-mono text-[11px] tracking-wide uppercase transition-colors",
                  view === v
                    ? "bg-surface-raised text-amber"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <MosaicCanvas view={view} />
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-2 border-l border-border bg-sidebar">
          <div className="min-h-0 overflow-hidden border-b border-border">
            <ControlsPanel />
          </div>
          <div key={selectedTileId ?? "none"} className="min-h-0 overflow-hidden">
            <TileInspector />
          </div>
        </aside>
      </div>
    </StudioShell>
  );
}
