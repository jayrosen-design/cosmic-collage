import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/cosmos/store";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Cosmic Collage" },
      {
        name: "description",
        content:
          "An artistic computational instrument that rebuilds an astronomical image from fragments of real astronomical photographs. Every tile comes from an actual observation.",
      },
      { property: "og:title", content: "About Cosmic Collage" },
      {
        property: "og:description",
        content:
          "Reconstruct Andromeda from multiple observations of Andromeda — ultraviolet, infrared and composite photographs cut into a single image.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  const { openDemo, loadingDemo, ready, addUploads } = useStudio();
  const navigate = useNavigate();
  const [pending, setPending] = useState<null | "demo" | "upload">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending && ready) void navigate({ to: pending === "demo" ? "/studio" : "/archive" });
  }, [pending, ready, navigate]);

  const start = (kind: "demo" | "upload") => {
    setPending(kind);
    void openDemo();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
        <p className="label-xs">Cosmic Collage</p>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Reconstruct the cosmos
          <br />
          <span className="text-primary">from observations of the cosmos.</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Cosmic Collage rebuilds an astronomical image out of fragments cut from other real
          photographs. From a distance you see Andromeda. Up close you see ultraviolet, infrared and
          composite observations sitting side by side. Nothing here is generated imagery — every tile
          is a crop of an actual photograph, and every fragment keeps its provenance.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            onClick={() => start("demo")}
            disabled={loadingDemo}
            className="rounded-sm bg-amber px-4 py-2.5 font-mono text-xs tracking-wider uppercase text-[oklch(0.18_0.01_250)] transition-colors hover:bg-amber/90 disabled:opacity-60"
          >
            {loadingDemo ? "Loading archive…" : "Open Andromeda Demo"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-sm border border-border-strong px-4 py-2.5 font-mono text-xs tracking-wider uppercase text-foreground transition-colors hover:border-primary/60"
          >
            Upload My Photography
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const files = e.target.files;
              e.currentTarget.value = "";
              if (!files?.length) return;
              await addUploads(files);
              start("upload");
            }}
          />
          <span className="data-mono text-muted-foreground">No account required.</span>
        </div>

        <dl className="mt-16 grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
          {[
            ["Archive", "GALEX ultraviolet, WISE and Spitzer infrared, GALEX+Spitzer composite."],
            [
              "Matching",
              "Brightness, colour, contrast, edge density and structure — Visual Analysis.",
            ],
            [
              "Physical",
              "Assembly map, tile manifest and exports for cutting the collage by hand.",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label-xs">{k}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
