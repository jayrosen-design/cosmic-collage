import { createFileRoute } from "@tanstack/react-router";
import { StudioShell } from "@/components/cosmos/StudioShell";
import { PhysicalPanel } from "@/components/cosmos/PhysicalPanel";
import { TileInspector } from "@/components/cosmos/TileInspector";
import { useStudio } from "@/lib/cosmos/store";

export const Route = createFileRoute("/physical/$id")({
  head: () => ({
    meta: [
      { title: "Physical Collage — Cosmic Collage" },
      {
        name: "description",
        content:
          "Assembly map, tile manifest and exports for cutting and assembling an astronomical collage by hand.",
      },
      { property: "og:title", content: "Physical Collage Planning" },
      {
        property: "og:description",
        content: "Print, cut, sort, assemble — Cosmic Collage as a construction blueprint.",
      },
    ],
  }),
  component: PhysicalPage,
});

function PhysicalPage() {
  const { project, selectedTileId } = useStudio();
  return (
    <StudioShell>
      <div className="grid h-full grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 overflow-hidden">
          <div className="border-b border-border px-6 py-3">
            <h1 className="font-display text-lg text-foreground">Assembly Map</h1>
            <p className="data-mono text-muted-foreground">
              {project?.name ?? "—"} · click a cell to trace its source photograph
            </p>
          </div>
          <div className="h-[calc(100%-4.5rem)]">
            <PhysicalPanel />
          </div>
        </section>
        <aside key={selectedTileId ?? "none"} className="min-h-0 overflow-hidden border-l border-border bg-sidebar">
          <TileInspector />
        </aside>
      </div>
    </StudioShell>
  );
}
