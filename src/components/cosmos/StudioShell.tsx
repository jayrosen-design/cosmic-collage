import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStudio } from "@/lib/cosmos/store";
import { cn } from "@/lib/utils";

const DEMO_ID = "andromeda-demo";

const navClass = (active: boolean) =>
  cn(
    "rounded-sm px-2 py-1 font-mono text-[11px] tracking-wide uppercase transition-colors",
    active ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:text-foreground",
  );

export function StudioShell({ children }: { children: React.ReactNode }) {
  const { project, openDemo, target, mosaic, engineMode } = useStudio();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    void openDemo();
  }, [openDemo]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center gap-6 border-b border-border bg-surface px-4 py-2">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-sm tracking-tight text-foreground">Cosmos Collage</span>
          <span className="data-mono text-muted-foreground">
            {project?.name ?? "loading archive"}
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/studio" className={navClass(path === "/studio")}>
            Studio
          </Link>
          <Link to="/archive" className={navClass(path === "/archive")}>
            Archive
          </Link>
          <Link
            to="/physical/$id"
            params={{ id: project?.id ?? DEMO_ID }}
            className={navClass(path.startsWith("/physical"))}
          >
            Physical Collage
          </Link>
          <Link
            to="/project/$id"
            params={{ id: project?.id ?? DEMO_ID }}
            className={navClass(path.startsWith("/project"))}
          >
            Project
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="data-mono text-muted-foreground">
            {target ? `Target ${target.nasaId ?? target.name}` : "—"}
          </span>
          <span className="data-mono text-muted-foreground">
            {mosaic ? `${mosaic.tiles.length} tiles · ${mosaic.candidateCount} candidates` : "—"}
          </span>
          <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase text-primary">
            {engineMode === "visual" ? "Visual Analysis" : "AI Analysis"}
          </span>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
