import { createFileRoute } from "@tanstack/react-router";
import { StudioShell } from "@/components/cosmos/StudioShell";
import { ArchivePanel } from "@/components/cosmos/ArchivePanel";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Photo Archive — Cosmos Collage" },
      {
        name: "description",
        content:
          "Browse the observation archive: NASA GALEX, WISE and Spitzer photographs of Andromeda plus your own astrophotography.",
      },
      { property: "og:title", content: "Cosmos Collage Archive" },
      {
        property: "og:description",
        content: "Every fragment of a collage traces back to a real photograph in this archive.",
      },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  return (
    <StudioShell>
      <div className="mx-auto h-full max-w-6xl">
        <div className="border-b border-border px-6 py-5">
          <h1 className="font-display text-xl text-foreground">Photo Archive</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable, disable, retag and rename the photographs available to the matching engine.
            Provenance is never removed once an image becomes part of a collage.
          </p>
        </div>
        <div className="h-[calc(100%-6.5rem)]">
          <ArchivePanel dense={false} />
        </div>
      </div>
    </StudioShell>
  );
}
