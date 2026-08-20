import { Dices, Download, Lock, LockOpen, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { PRESETS, useStudio } from "@/lib/cosmos/store";
import { WAVELENGTH_LABEL, type Wavelength } from "@/lib/cosmos/types";
import { downloadCanvas, renderMosaic } from "@/lib/cosmos/render";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GRID_PRESETS = [
  [12, 8],
  [20, 12],
  [30, 18],
  [40, 24],
  [60, 36],
] as const;

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="label-xs">{label}</span>
        {value && <span className="data-mono text-foreground">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function ControlsPanel() {
  const { settings, patchSettings, generate, generating, newSeed, sourcePool, mosaic } = useStudio();
  const abstractionLabel =
    settings.abstraction <= 0.25
      ? "Faithful reconstruction"
      : settings.abstraction <= 0.65
        ? "Collage region"
        : "Cosmic abstraction";

  const presentWavelengths = Array.from(
    new Set(sourcePool.map((s) => s.wavelength)),
  ) as Wavelength[];

  const mixShare = (wl: Wavelength) => {
    if (!mosaic) return null;
    const ids = new Set(sourcePool.filter((s) => s.wavelength === wl).map((s) => s.id));
    const n = mosaic.tiles.filter((t) => ids.has(t.sourceImageId)).length;
    return Math.round((n / Math.max(1, mosaic.tiles.length)) * 100);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="label-xs">Reconstruction</span>
        <span className="data-mono text-primary/80">Visual Analysis</span>
      </div>

      <div className="space-y-5 p-3">
        {/* presets */}
        <div className="grid grid-cols-3 gap-1">
          {PRESETS.map((p) => {
            const active =
              Math.abs(settings.abstraction - p.abstraction) < 0.01 &&
              Math.abs(settings.randomness - p.randomness) < 0.01 &&
              Math.abs(settings.diversity - p.diversity) < 0.01;
            return (
              <button
                key={p.name}
                onClick={() =>
                  patchSettings({
                    abstraction: p.abstraction,
                    randomness: p.randomness,
                    diversity: p.diversity,
                  })
                }
                className={cn(
                  "rounded-sm border px-2 py-2 font-mono text-[10px] leading-tight tracking-wide uppercase transition-colors",
                  active
                    ? "border-amber/60 bg-amber/10 text-amber"
                    : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        {/* abstraction */}
        <div className="space-y-2 rounded-sm border border-border bg-background/40 p-3">
          <div className="flex items-baseline justify-between">
            <span className="label-xs">Abstraction</span>
            <span className="font-mono text-lg text-amber">{settings.abstraction.toFixed(2)}</span>
          </div>
          <Slider
            value={[settings.abstraction]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => patchSettings({ abstraction: v ?? 0 })}
          />
          <div className="flex justify-between font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            <span>Faithful</span>
            <span>Abstract</span>
          </div>
          <p className="text-xs text-muted-foreground">{abstractionLabel}</p>
        </div>

        {/* grid */}
        <div className="space-y-2">
          <span className="label-xs">Grid</span>
          <div className="flex flex-wrap gap-1">
            {GRID_PRESETS.map(([c, r]) => (
              <button
                key={`${c}x${r}`}
                onClick={() => patchSettings({ columns: c, rows: r })}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                  settings.columns === c && settings.rows === r
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {c} × {r}
              </button>
            ))}
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Custom
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="label-xs">Columns</span>
              <Input
                type="number"
                min={4}
                max={120}
                value={settings.columns}
                onChange={(e) =>
                  patchSettings({ columns: Math.max(4, Math.min(120, Number(e.target.value) || 4)) })
                }
                className="h-8 bg-background font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="label-xs">Rows</span>
              <Input
                type="number"
                min={3}
                max={80}
                value={settings.rows}
                onChange={(e) =>
                  patchSettings({ rows: Math.max(3, Math.min(80, Number(e.target.value) || 3)) })
                }
                className="h-8 bg-background font-mono text-xs"
              />
            </label>
          </div>
          <Row label="Tile Gap" value={`${settings.tileGap}px`}>
            <Slider
              value={[settings.tileGap]}
              min={0}
              max={8}
              step={1}
              onValueChange={([v]) => patchSettings({ tileGap: v ?? 0 })}
            />
          </Row>
          <Row label="Tile Border" value={`${settings.tileBorder}px`}>
            <Slider
              value={[settings.tileBorder]}
              min={0}
              max={4}
              step={1}
              onValueChange={([v]) => patchSettings({ tileBorder: v ?? 0 })}
            />
          </Row>
          <div className="flex items-center justify-between">
            <span className="label-xs">Tile Aspect Mode</span>
            <span className="data-mono text-muted-foreground">Uniform rectangular</span>
          </div>
        </div>

        {/* randomness / seed */}
        <div className="space-y-2">
          <Row label="Randomness" value={settings.randomness.toFixed(2)}>
            <Slider
              value={[settings.randomness]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => patchSettings({ randomness: v ?? 0 })}
            />
          </Row>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <span className="label-xs">Random Seed</span>
              <p className="font-mono text-sm text-foreground">{settings.seed}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-border bg-background text-xs"
              onClick={newSeed}
              disabled={settings.seedLocked}
            >
              <Dices className="size-3.5" /> New Seed
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 w-8 border-border bg-background p-0",
                settings.seedLocked && "border-amber/60 text-amber",
              )}
              title={settings.seedLocked ? "Seed locked" : "Lock seed"}
              onClick={() => patchSettings({ seedLocked: !settings.seedLocked })}
            >
              {settings.seedLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* diversity */}
        <div className="space-y-2">
          <Row label="Source Diversity" value={settings.diversity.toFixed(2)}>
            <Slider
              value={[settings.diversity]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => patchSettings({ diversity: v ?? 0 })}
            />
          </Row>
          <Row label="Maximum Tiles Per Source" value={`${Math.round(settings.maxTilesPerSource * 100)}%`}>
            <Slider
              value={[settings.maxTilesPerSource]}
              min={0.05}
              max={1}
              step={0.01}
              onValueChange={([v]) => patchSettings({ maxTilesPerSource: v ?? 0.15 })}
            />
          </Row>
        </div>

        {/* rotation */}
        <div className="flex items-center justify-between rounded-sm border border-border p-2">
          <div>
            <span className="label-xs">Allow Rotation</span>
            <p className="data-mono text-muted-foreground">0° · 90° · 180° · 270°</p>
          </div>
          <Switch
            checked={settings.allowRotation}
            onCheckedChange={(v) => patchSettings({ allowRotation: v })}
          />
        </div>

        {/* source mix */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="label-xs">Source Mix</span>
            <span className="data-mono text-muted-foreground">weighting preference</span>
          </div>
          {presentWavelengths.map((wl) => {
            const pref = settings.sourceMix[wl] ?? 0.5;
            const share = mixShare(wl);
            return (
              <div key={wl} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-foreground">{WAVELENGTH_LABEL[wl]}</span>
                  <span className="data-mono text-primary/80">
                    {share === null ? "—" : `${share}%`}
                  </span>
                </div>
                <Slider
                  value={[pref]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) =>
                    patchSettings({ sourceMix: { ...settings.sourceMix, [wl]: v ?? 0.5 } })
                  }
                />
              </div>
            );
          })}
          <p className="font-mono text-[10px] text-muted-foreground">
            Percentages are measured from the current collage; sliders act as weighting preferences.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-border p-2">
          <div>
            <span className="label-xs">Target in Source Pool</span>
            <p className="data-mono text-muted-foreground">off by default</p>
          </div>
          <Switch
            checked={settings.includeTargetInSources}
            onCheckedChange={(v) => patchSettings({ includeTargetInSources: v })}
          />
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto space-y-2 border-t border-border bg-surface p-3">
        <Button
          onClick={() => void generate()}
          disabled={generating}
          className="w-full gap-2 rounded-sm bg-amber font-mono text-xs tracking-wider uppercase text-[oklch(0.18_0.01_250)] hover:bg-amber/90"
        >
          {generating ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {generating ? "Working" : "Generate Mosaic"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void downloadPng()}
          disabled={!mosaic || exporting}
          className="w-full gap-2 rounded-sm border-border bg-background font-mono text-xs tracking-wider uppercase"
        >
          <Download className="size-3.5" />
          {exporting ? "Preparing PNG" : "Download PNG"}
        </Button>
      </div>
    </div>
  );
}
