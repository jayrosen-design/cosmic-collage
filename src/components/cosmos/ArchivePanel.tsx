import { useMemo, useRef, useState } from "react";
import { Search, Upload, Target, Trash2 } from "lucide-react";
import { useStudio } from "@/lib/cosmos/store";
import { ARCHIVE_FILTERS, WAVELENGTH_LABEL, type ArchiveFilter, type SourceImage } from "@/lib/cosmos/types";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function matchesFilter(img: SourceImage, filter: ArchiveFilter) {
  if (filter === "All") return true;
  const tagHit = img.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()));
  const map: Partial<Record<ArchiveFilter, string>> = {
    RGB: "rgb",
    Ultraviolet: "uv",
    Infrared: "ir",
    "Hydrogen-alpha": "ha",
    OIII: "oiii",
    SII: "sii",
    Monochrome: "mono",
    "Dark Sky": "dark",
    Other: "other",
  };
  const wl = map[filter];
  return (wl ? img.wavelength === wl : false) || tagHit;
}

export function ArchivePanel({ dense = true }: { dense?: boolean }) {
  const { images, target, toggleImage, setTarget, removeImage, addUploads, updateImage } = useStudio();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArchiveFilter>("All");
  const fileRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () =>
      images.filter(
        (i) =>
          matchesFilter(i, filter) &&
          (query.trim() === "" ||
            `${i.name} ${i.nasaId ?? ""} ${i.mission ?? ""} ${i.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [images, filter, query],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="label-xs">Archive</span>
        <span className="data-mono text-muted-foreground">{images.length} photographs</span>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archive"
            className="h-9 bg-background pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {ARCHIVE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase transition-colors",
                filter === f
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 border-border bg-background text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" /> Add Photos
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addUploads(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <p className="font-mono text-[10px] text-muted-foreground">
          JPG · PNG · WEBP — TIFF and FITS: coming in AI Engine
        </p>
      </div>

      <div className={cn("flex-1 overflow-y-auto", dense ? "p-2" : "p-4")}>
        <div className={cn("grid gap-2", dense ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-3")}>
          {visible.map((img) => {
            const isTarget = target?.id === img.id;
            return (
              <div
                key={img.id}
                className={cn(
                  "group flex gap-3 rounded-sm border p-2 transition-colors",
                  isTarget ? "border-amber/50 bg-amber/5" : "border-border hover:border-border-strong",
                )}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="size-14 shrink-0 rounded-sm object-cover"
                  style={{ opacity: img.enabled ? 1 : 0.35 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{img.name}</p>
                    {!isTarget && (
                      <Switch
                        checked={img.enabled}
                        onCheckedChange={(v) => toggleImage(img.id, v)}
                        className="scale-75"
                      />
                    )}
                  </div>
                  <p className="data-mono truncate text-muted-foreground">
                    {img.nasaId ?? img.photographer ?? "upload"} · {img.mission ?? "personal"}
                  </p>
                  <p className="data-mono truncate text-primary/80">
                    {WAVELENGTH_LABEL[img.wavelength]}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-[10px] tracking-wide uppercase",
                        isTarget ? "text-amber" : "text-muted-foreground",
                      )}
                    >
                      {isTarget ? "target" : img.enabled ? "source" : "disabled"}
                    </span>
                    {!isTarget && (
                      <button
                        title="Use as target"
                        onClick={() => setTarget(img.id)}
                        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-amber"
                      >
                        <Target className="size-3.5" />
                      </button>
                    )}
                    {img.origin === "upload" && (
                      <>
                        <button
                          title="Rename"
                          onClick={() => {
                            const name = window.prompt("Rename photograph", img.name);
                            if (name) updateImage(img.id, { name });
                          }}
                          className="font-mono text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                        >
                          rename
                        </button>
                        <button
                          title="Delete"
                          onClick={() => removeImage(img.id)}
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="px-1 py-6 text-xs text-muted-foreground">
              No photographs match this filter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
