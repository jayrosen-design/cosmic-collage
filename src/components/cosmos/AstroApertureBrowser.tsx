import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Search, Telescope } from "lucide-react";
import {
  ASTRO_CATEGORIES,
  cachedAstroApertureArchive,
  convertPostToSourceImages,
  fetchAstroApertureArchive,
  matchesCategory,
  plainText,
  postPageUrl,
  postTags,
  uniquePostImages,
  type AstroCategory,
  type AstroPost,
} from "@/lib/cosmos/sources/astro-aperture";
import { WAVELENGTH_LABEL } from "@/lib/cosmos/types";
import { useStudio } from "@/lib/cosmos/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AstroApertureBrowser({ open, onOpenChange }: Props) {
  const { images, importImages, setTarget } = useStudio();
  const [posts, setPosts] = useState<AstroPost[]>(() => cachedAstroApertureArchive() ?? []);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AstroCategory>("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) setPosts([]);
      const archive = await fetchAstroApertureArchive((message) => setStatus(message));
      setPosts(archive);
    } catch {
      setError(
        "Astro Aperture could not be reached. The NASA demo archive and your uploads are unaffected.",
      );
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (open && posts.length === 0 && !loading) void load();
  }, [open, posts.length, loading, load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (!matchesCategory(p, category)) return false;
      if (!q) return true;
      return `${plainText(p.title)} ${p.slug} ${postTags(p).join(" ")} ${plainText(p.excerpt)}`
        .toLowerCase()
        .includes(q);
    });
  }, [posts, query, category]);

  const importedPostIds = useMemo(
    () => new Set(images.filter((i) => i.sourcePostId).map((i) => i.sourcePostId!)),
    [images],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runImport = async (asTarget: boolean) => {
    const chosen = posts.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    setImporting(true);
    try {
      const sourceImages = chosen.flatMap(convertPostToSourceImages);
      await importImages(sourceImages);
      if (asTarget && sourceImages[0]) setTarget(sourceImages[0].id);
      setSelected(new Set());
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-5xl flex-col gap-0 border-border bg-surface p-0">
        <DialogHeader className="space-y-1 border-b border-border p-4 text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-base text-foreground">
            <Telescope className="size-4 text-primary" /> Astro Aperture Archive
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Jay Rosen&rsquo;s astrophotography, read live from jayrosen.design. Imported photographs
            keep their capture date, equipment and a link back to the original observation post.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border-b border-border p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search observations — object, tag, equipment"
                className="h-9 bg-background pl-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load(true)}
              className="gap-2 border-border bg-background text-xs"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {ASTRO_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase transition-colors",
                  category === c
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && posts.length === 0 && (
            <div className="flex items-center gap-2 py-10 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              <Loader2 className="size-4 animate-spin" />
              {status ?? "Loading archive…"}
            </div>
          )}

          {error && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">
              {error}
            </div>
          )}

          {!loading && !error && visible.length === 0 && posts.length > 0 && (
            <p className="py-10 text-xs text-muted-foreground">
              No observations match this search.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((post) => {
              const preview = uniquePostImages(post)[0];
              const count = uniquePostImages(post).length;
              const isSelected = selected.has(post.id);
              const already = importedPostIds.has(String(post.databaseId));
              const converted = convertPostToSourceImages(post)[0];
              return (
                <article
                  key={post.id}
                  className={cn(
                    "overflow-hidden rounded-sm border bg-background transition-colors",
                    isSelected ? "border-primary/60" : "border-border hover:border-border-strong",
                  )}
                >
                  <button
                    onClick={() => toggle(post.id)}
                    className="block w-full text-left"
                    aria-pressed={isSelected}
                  >
                    <div className="aspect-[5/3] bg-surface">
                      {preview && (
                        <img
                          src={converted?.url ?? preview}
                          alt={plainText(post.title)}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <h3 className="line-clamp-2 text-xs font-medium text-foreground">
                        {plainText(post.title)}
                      </h3>
                      <p className="data-mono text-muted-foreground">
                        {new Date(post.date).toLocaleDateString()} · {count}{" "}
                        {count === 1 ? "photograph" : "photographs"}
                      </p>
                      {converted && (
                        <p className="data-mono truncate text-primary/80">
                          {WAVELENGTH_LABEL[converted.wavelength]}
                          {converted.equipment ? ` · ${converted.equipment}` : ""}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-mono text-[10px] tracking-wide uppercase",
                            isSelected ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {isSelected ? "selected" : already ? "in archive" : "select"}
                        </span>
                      </div>
                    </div>
                  </button>
                  <a
                    href={postPageUrl(post)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 border-t border-border px-2.5 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase hover:text-foreground"
                  >
                    <ExternalLink className="size-3" /> Original post
                  </a>
                </article>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <span className="data-mono text-muted-foreground">
            {selected.size} selected · {visible.length} of {posts.length} observations
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={selected.size !== 1 || importing}
              onClick={() => void runImport(true)}
              className="border-border bg-background font-mono text-xs tracking-wider uppercase"
            >
              Import as Target
            </Button>
            <Button
              disabled={selected.size === 0 || importing}
              onClick={() => void runImport(false)}
              className="font-mono text-xs tracking-wider uppercase"
            >
              {importing ? "Importing…" : "Import as Sources"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
