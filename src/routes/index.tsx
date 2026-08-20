import { createFileRoute } from "@tanstack/react-router";
import { StudioWorkspace } from "@/components/cosmos/StudioWorkspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cosmic Collage — Andromeda reconstructed from real observations" },
      {
        name: "description",
        content:
          "Open the Andromeda demo instantly: rebuild an astronomical image from fragments of real NASA photographs, tile by tile, with full provenance.",
      },
      { property: "og:title", content: "Cosmic Collage — Andromeda Demo" },
      {
        property: "og:description",
        content:
          "Reconstruct Andromeda from ultraviolet, infrared and composite observations of Andromeda. Every tile is a crop of an actual photograph.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioWorkspace,
});
