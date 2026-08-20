import { createFileRoute, Link } from "@tanstack/react-router";
import { StudioShell } from "@/components/cosmos/StudioShell";
import { useStudio } from "@/lib/cosmos/store";
import { WAVELENGTH_LABEL } from "@/lib/cosmos/types";

export const Route = createFileRoute("/project/$id")({
  head: () => ({
    meta: [
      { title: "Andromeda Demo Project — Cosmic Collage" },
      {
        name: "description",
        content:
          "Project record: target photograph, source observations, current settings and collage statistics.",
      },
      { property: "og:title", content: "Andromeda Demo Project" },
      {
        property: "og:description",
        content: "Reconstruct Andromeda from multiple observations of Andromeda.",
      },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { project, target, images, settings, mosaic, sourcePool } = useStudio();
  const usage = new Map<string, number>();
  for (const t of mosaic?.tiles ?? [])
    usage.set(t.sourceImageId, (usage.get(t.sourceImageId) ?? 0) + 1);

  return (
    <StudioShell>
      <div className="mx-auto max-w-4xl space-y-8 overflow-y-auto px-6 py-8">
        <header className="space-y-1">
          <p className="label-xs">Project</p>
          <h1 className="font-display text-2xl text-foreground">{project?.name ?? "Loading"}</h1>
          <p className="text-sm text-muted-foreground">
            {project?.object} — reconstruct Andromeda from multiple observations of Andromeda.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-sm border border-border p-3">
            <p className="label-xs">Target</p>
            {target && (
              <>
                <img src={target.url} alt={target.name} className="mt-2 w-full rounded-sm object-cover" />
                <p className="mt-2 text-sm text-foreground">{target.name}</p>
                <p className="data-mono text-muted-foreground">
                  {target.nasaId} · {target.mission} · {WAVELENGTH_LABEL[target.wavelength]}
                </p>
                <p className="data-mono text-muted-foreground">Credit: {target.credit}</p>
              </>
            )}
          </div>
          <div className="space-y-2 rounded-sm border border-border p-3">
            <p className="label-xs">Settings</p>
            <dl className="data-mono space-y-1">
              {[
                ["Grid", `${settings.columns} × ${settings.rows}`],
                ["Abstraction", settings.abstraction.toFixed(2)],
                ["Randomness", settings.randomness.toFixed(2)],
                ["Diversity", settings.diversity.toFixed(2)],
                ["Max tiles / source", `${Math.round(settings.maxTilesPerSource * 100)}%`],
                ["Seed", String(settings.seed)],
                ["Rotation", settings.allowRotation ? "on" : "off"],
                ["Engine", "Visual Analysis"],
                ["Tiles", mosaic ? String(mosaic.tiles.length) : "—"],
                ["Candidate regions", mosaic ? String(mosaic.candidateCount) : "—"],
                ["Locked tiles", String((mosaic?.tiles ?? []).filter((t) => t.locked).length)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2 pt-2">
              <Link
                to="/studio"
                className="rounded-sm border border-border px-2 py-1 font-mono text-[11px] uppercase text-foreground hover:border-border-strong"
              >
                Open studio
              </Link>
              <Link
                to="/physical/$id"
                params={{ id: project?.id ?? "andromeda-demo" }}
                className="rounded-sm border border-border px-2 py-1 font-mono text-[11px] uppercase text-foreground hover:border-border-strong"
              >
                Physical collage
              </Link>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <p className="label-xs">Source observations · {sourcePool.length} active</p>
          <div className="divide-y divide-border rounded-sm border border-border">
            {images.map((img) => (
              <div key={img.id} className="flex items-center gap-3 p-2">
                <img src={img.url} alt="" className="size-10 rounded-sm object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground">{img.name}</p>
                  <p className="data-mono truncate text-muted-foreground">
                    {img.nasaId ?? img.photographer} · {WAVELENGTH_LABEL[img.wavelength]} ·{" "}
                    {img.credit ?? "personal upload"}
                  </p>
                </div>
                <span className="data-mono text-primary/80">
                  {img.id === target?.id ? "target" : `${usage.get(img.id) ?? 0} tiles`}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-sm border border-border p-3">
          <p className="label-xs">Community layer</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Photographer profiles, shared archives, collaborative reconstructions and contributor
            statistics are not part of this build — coming in AI Engine.
          </p>
        </section>
      </div>
    </StudioShell>
  );
}
