import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { StudioShell } from "@/components/cosmos/StudioShell";
import { useStudio } from "@/lib/cosmos/store";
import {
  GALLERY_EVENT,
  deleteGalleryEntry,
  listGallery,
  type GalleryEntry,
} from "@/lib/cosmos/gallery";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Cosmic Collage" },
      {
        name: "description",
        content:
          "Every collage you have created, alongside the preloaded Andromeda demo project: grid, tile count, abstraction and seed for each reconstruction.",
      },
      { property: "og:title", content: "Cosmic Collage Gallery" },
      {
        property: "og:description",
        content: "Browse saved reconstructions, reopen their settings, and revisit the Andromeda demo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GalleryPage,
});

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-xs">{label}</dt>
      <dd className="data-mono text-foreground">{value}</dd>
    </div>
  );
}

interface DemoIndexEntry {
  slug: string;
  name: string;
  object: string;
  description: string;
  thumbnail: string;
  imageCount: number;
}

function GalleryPage() {
  const { activeDemo, openDemo, mosaic, settings, patchSettings } = useStudio();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [demos, setDemos] = useState<DemoIndexEntry[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setEntries(listGallery());
    sync();
    window.addEventListener(GALLERY_EVENT, sync);
    return () => window.removeEventListener(GALLERY_EVENT, sync);
  }, []);

  useEffect(() => {
    void fetch("/demo/index.json")
      .then((r) => r.json())
      .then((d: { demos: DemoIndexEntry[] }) => setDemos(d.demos ?? []))
      .catch(() => setDemos([]));
  }, []);

  const openBuiltIn = async (slug: string) => {
    setOpening(slug);
    try {
      await openDemo(slug);
      void navigate({ to: "/" });
    } finally {
      setOpening(null);
    }
  };

  const openEntry = (entry: GalleryEntry) => {
    patchSettings(entry.settings);
    void navigate({ to: "/studio" });
  };

  return (
    <StudioShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="font-display text-xl text-foreground">Gallery</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Projects and saved reconstructions. The built-in NASA demos ship with the instrument;
            every other card is a collage you saved from the studio, stored in this browser with the
            exact settings used to produce it.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demos.map((d) => (
              <article
                key={d.slug}
                className="overflow-hidden rounded-sm border border-amber/40 bg-surface"
              >
                <div className="aspect-[5/3] bg-background">
                  <img
                    src={d.thumbnail}
                    alt={`${d.object} target observation`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-sm text-foreground">{d.name}</h2>
                    <span className="rounded-sm border border-amber/50 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase text-amber">
                      {activeDemo === d.slug ? "Active" : "Demo"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                  <dl className="grid grid-cols-3 gap-2">
                    <Meta label="Object" value={d.object.split(" - ")[0] ?? d.object} />
                    <Meta label="Images" value={String(d.imageCount)} />
                    <Meta
                      label="Tiles"
                      value={
                        activeDemo === d.slug && mosaic
                          ? String(mosaic.tiles.length)
                          : `${settings.columns}×${settings.rows}`
                      }
                    />
                  </dl>
                  <Button
                    disabled={opening !== null}
                    onClick={() => void openBuiltIn(d.slug)}
                    className="w-full rounded-sm bg-amber font-mono text-xs tracking-wider uppercase text-[oklch(0.18_0.01_250)] hover:bg-amber/90"
                  >
                    {opening === d.slug ? "Loading…" : "Open in Studio"}
                  </Button>
                </div>
              </article>
            ))}


            {entries.map((e) => (
              <article key={e.id} className="overflow-hidden rounded-sm border border-border bg-surface">
                <div className="aspect-[5/3] bg-background">
                  <img
                    src={e.thumbnail}
                    alt={`Saved collage of ${e.object}, ${e.columns} by ${e.rows} tiles`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-sm text-foreground">{e.name}</h2>
                    <span className="data-mono text-muted-foreground">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2">
                    <Meta label="Tiles" value={String(e.tileCount)} />
                    <Meta label="Sources" value={String(e.sourceCount)} />
                    <Meta label="Abstraction" value={e.abstraction.toFixed(2)} />
                  </dl>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => openEntry(e)}
                      className="flex-1 rounded-sm border-border bg-background font-mono text-xs tracking-wider uppercase"
                    >
                      Reopen Settings
                    </Button>
                    <Button
                      variant="outline"
                      title="Remove from gallery"
                      onClick={() => setEntries(deleteGalleryEntry(e.id))}
                      className="w-9 rounded-sm border-border bg-background p-0 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {entries.length === 0 && (
            <p className="mt-6 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              No saved collages yet — use “Save to Gallery” in the studio controls.
            </p>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
