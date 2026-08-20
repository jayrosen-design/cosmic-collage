import { useState } from "react";
import { StudioShell } from "@/components/cosmos/StudioShell";
import { ArchivePanel } from "@/components/cosmos/ArchivePanel";
import { ControlsPanel } from "@/components/cosmos/ControlsPanel";
import { TileInspector } from "@/components/cosmos/TileInspector";
import { MosaicCanvas, type CanvasView } from "@/components/cosmos/MosaicCanvas";
import { useStudio } from "@/lib/cosmos/store";
import { cn } from "@/lib/utils";

const VIEWS: CanvasView[] = ["target", "reconstruction", "compare"];

export function StudioWorkspace() {
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
          <div
            key={selectedTileId ?? "none"}
            className={cn(
              "shrink-0 overflow-hidden border-t border-border bg-sidebar",
              selectedTileId ? "h-[230px]" : "h-11",
            )}
          >
            <TileInspector />
          </div>
        </section>

        <aside className="min-h-0 overflow-hidden border-l border-border bg-sidebar">
          <ControlsPanel />
        </aside>

      </div>
    </StudioShell>
  );
}
