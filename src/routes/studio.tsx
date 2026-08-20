import { createFileRoute } from "@tanstack/react-router";
import { StudioWorkspace } from "@/components/cosmos/StudioWorkspace";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Cosmic Collage" },
      {
        name: "description",
        content:
          "Reconstruct Andromeda from real NASA observations: grid, abstraction, randomness and tile-level control in the Cosmic Collage studio.",
      },
      { property: "og:title", content: "Cosmic Collage Studio" },
      {
        property: "og:description",
        content:
          "An artistic computational instrument for reconstructing the cosmos from photographs of the cosmos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioWorkspace,
});
