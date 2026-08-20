import {
  Check,
  Dices,
  Download,
  Info,
  Lock,
  LockOpen,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { AiSettingsDialog } from "@/components/cosmos/AiSettingsDialog";
import { estimateRequests } from "@/lib/cosmos/ai-engine";
import { grantNavigatorConsent, hasNavigatorConsent } from "@/lib/cosmos/navigator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyGalleryChanged, saveGalleryEntry } from "@/lib/cosmos/gallery";
import { PRESETS, useStudio } from "@/lib/cosmos/store";
import {
  CANVAS_ASPECT_LABEL,
  CANVAS_ASPECT_MODES,
  MAX_TARGET_SCALE,
  MIN_TARGET_SCALE,
} from "@/lib/cosmos/composition";
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

function ScoreDelta({
  title,
  before,
  after,
  digits,
}: {
  title: string;
  before: { structure: number; brightness: number; similarity: number };
  after: { structure: number; brightness: number; similarity: number };
  digits: number;
}) {
  const rows: Array<[string, number, number]> = [
    ["Structure", before.structure, after.structure],
    ["Brightness", before.brightness, after.brightness],
    ["Average match", before.similarity, after.similarity],
  ];
  return (
    <div className="space-y-0.5">
      <p className="label-xs text-muted-foreground">{title}</p>
      {rows.map(([label, b, a]) => {
        const d = a - b;
        return (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="label-xs">{label}</dt>
            <dd className="data-mono text-foreground">
              {b.toFixed(digits)} → {a.toFixed(digits)}{" "}
              <span className={d >= 0 ? "text-primary" : "text-destructive"}>
                {d >= 0 ? "+" : ""}
                {d.toFixed(digits)}
              </span>
            </dd>
          </div>
        );
      })}
    </div>
  );
}

export function ControlsPanel() {
  const {
    settings,
    patchSettings,
    generate,
    generating,
    newSeed,
    sourcePool,
    mosaic,
    images,
    project,
    aiGenerating,
    aiStats,
    aiError,
    navigatorConnected,
    generateWithAI,
    cancelAIGeneration,
    dismissAiResult,
  } = useStudio();
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const estimate = estimateRequests(settings.columns * settings.rows);

  const startAi = () => {
    if (!navigatorConnected) {
      setAiSettingsOpen(true);
      return;
    }
    if (!hasNavigatorConsent()) {
      setConsentOpen(true);
      return;
    }
    void generateWithAI();
  };

  const downloadPng = async () => {
    if (!mosaic) return;
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      await renderMosaic(canvas, mosaic, images, { tilePx: 96 });
      downloadCanvas(canvas, "cosmic-collage.png");
    } finally {
      setExporting(false);
    }
  };

  const saveToGallery = async () => {
    if (!mosaic) return;
    const canvas = document.createElement("canvas");
    await renderMosaic(canvas, mosaic, images, { tilePx: 26 });
    saveGalleryEntry({
      id: `collage-${Date.now()}`,
      name: `${project?.object ?? "Collage"} · ${settings.columns}×${settings.rows}`,
      object: project?.object ?? "Unknown object",
      createdAt: Date.now(),
      columns: settings.columns,
      rows: settings.rows,
      tileCount: mosaic.tiles.length,
      sourceCount: new Set(mosaic.tiles.map((t) => t.sourceImageId)).size,
      abstraction: settings.abstraction,
      seed: settings.seed,
      thumbnail: canvas.toDataURL("image/jpeg", 0.72),
      settings,
    });
    notifyGalleryChanged();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

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
          <div className="flex items-center justify-between rounded-sm border border-border p-2">
            <div>
              <span className="label-xs">Tile Aspect Mode</span>
              <p className="data-mono text-muted-foreground">
                {settings.aspectMode === "target"
                  ? "Frame matches composition aspect"
                  : "Square tiles"}
              </p>
            </div>
            <div className="flex gap-1">
              {(["target", "square"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => patchSettings({ aspectMode: m })}
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase transition-colors",
                    settings.aspectMode === m
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* composition — Virtual Target Canvas */}
        <div className="space-y-2 rounded-sm border border-border bg-background/40 p-3">
          <div className="flex items-baseline justify-between">
            <span className="label-xs">Composition</span>
            <span className="data-mono text-muted-foreground">virtual target canvas</span>
          </div>

          <div className="space-y-1.5">
            <span className="label-xs">Canvas Aspect</span>
            <div className="flex flex-wrap gap-1">
              {CANVAS_ASPECT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => patchSettings({ canvasAspect: m })}
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                    settings.canvasAspect === m
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {CANVAS_ASPECT_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {settings.canvasAspect === "custom" && (
            <Row label="Custom Aspect (w ÷ h)" value={settings.customAspect.toFixed(2)}>
              <Slider
                value={[settings.customAspect]}
                min={0.5}
                max={3}
                step={0.01}
                onValueChange={([v]) => patchSettings({ customAspect: v ?? 1.5 })}
              />
            </Row>
          )}

          <Row label="Target Scale" value={`${Math.round(settings.targetScale * 100)}%`}>
            <Slider
              value={[settings.targetScale]}
              min={MIN_TARGET_SCALE}
              max={MAX_TARGET_SCALE}
              step={0.01}
              disabled={!settings.mosaicPadding}
              onValueChange={([v]) => patchSettings({ targetScale: v ?? 0.72 })}
            />
          </Row>
          <Row label="Horizontal Position" value={`${Math.round(settings.targetOffsetX * 100)}%`}>
            <Slider
              value={[settings.targetOffsetX]}
              min={0}
              max={1}
              step={0.01}
              disabled={!settings.mosaicPadding}
              onValueChange={([v]) => patchSettings({ targetOffsetX: v ?? 0.5 })}
            />
          </Row>
          <Row label="Vertical Position" value={`${Math.round(settings.targetOffsetY * 100)}%`}>
            <Slider
              value={[settings.targetOffsetY]}
              min={0}
              max={1}
              step={0.01}
              disabled={!settings.mosaicPadding}
              onValueChange={([v]) => patchSettings({ targetOffsetY: v ?? 0.5 })}
            />
          </Row>

          <div className="flex items-center justify-between rounded-sm border border-border p-2">
            <div>
              <span className="label-xs">Mosaic Background Padding</span>
              <p className="data-mono text-muted-foreground">
                photographic dark-sky negative space
              </p>
            </div>
            <Switch
              checked={settings.mosaicPadding}
              onCheckedChange={(v) => patchSettings({ mosaicPadding: v })}
            />
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Padding cells are matched against a dark-sky descriptor derived from the target and are
            still filled with real source photographs.
          </p>
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
        {aiStats && (
          <div className="space-y-2 rounded-sm border border-primary/40 bg-primary/5 p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="label-xs text-primary">AI Alignment Complete</span>
              <button
                onClick={dismissAiResult}
                aria-label="Dismiss AI Alignment summary"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
            <ul className="data-mono space-y-0.5 text-foreground">
              <li>{aiStats.reviewed} regions reviewed</li>
              <li>{aiStats.replaced} tiles replaced</li>
              <li>{aiStats.rotated} tiles rotated</li>
              <li>{aiStats.regionsFlagged} AI regions flagged</li>
            </ul>

            <ScoreDelta title="Whole mosaic" before={aiStats.before} after={aiStats.after} digits={3} />
            {aiStats.changedCount > 0 ? (
              <ScoreDelta
                title={`AI-changed tiles (${aiStats.changedCount})`}
                before={aiStats.changedBefore}
                after={aiStats.changedAfter}
                digits={2}
              />
            ) : (
              <p className="data-mono text-muted-foreground">
                No tile change passed numerical validation.
              </p>
            )}

            <button
              onClick={() => setDiagOpen((v) => !v)}
              className="data-mono flex w-full items-center justify-between border-t border-border pt-1.5 text-left text-muted-foreground hover:text-foreground"
            >
              <span>AI Diagnostics</span>
              <span aria-hidden>{diagOpen ? "−" : "+"}</span>
            </button>
            {diagOpen && (
              <dl className="space-y-0.5">
                {[
                  ["Model", aiStats.diagnostics.model],
                  ["Global analysis received", aiStats.diagnostics.globalAnalysisReceived ? "Yes" : "No"],
                  ["Global regions flagged", String(aiStats.diagnostics.globalRegionsFlagged)],
                  ["Regions queued", String(aiStats.diagnostics.regionsQueued)],
                  ["Successful responses", String(aiStats.diagnostics.successfulResponses)],
                  ["CURRENT responses", String(aiStats.diagnostics.currentResponses)],
                  ["Alternative recommendations", String(aiStats.diagnostics.alternativeRecommendations)],
                  ["Accepted after validation", String(aiStats.diagnostics.acceptedAfterValidation)],
                  ["Rejected after validation", String(aiStats.diagnostics.rejectedAfterValidation)],
                  ["Average confidence", aiStats.diagnostics.averageConfidence.toFixed(2)],
                  [
                    "Avg changed-tile improvement",
                    `${aiStats.diagnostics.averageChangedImprovement >= 0 ? "+" : ""}${aiStats.diagnostics.averageChangedImprovement.toFixed(3)}`,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <dt className="label-xs">{label}</dt>
                    <dd className="data-mono truncate text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {aiError && (
          <div className="rounded-sm border border-destructive/50 bg-destructive/10 p-2.5">
            <p className="label-xs text-destructive">AI Alignment could not complete</p>
            <p className="mt-1 text-xs text-muted-foreground">{aiError}</p>
          </div>
        )}

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
        <p className="data-mono text-center text-muted-foreground">Visual Analysis</p>

        <div className="flex gap-2">
          <Button
            onClick={aiGenerating ? cancelAIGeneration : startAi}
            disabled={generating}
            variant="outline"
            className="flex-1 gap-2 rounded-sm border-primary/50 bg-primary/10 font-mono text-xs tracking-wider uppercase text-foreground hover:bg-primary/20"
          >
            {aiGenerating ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <span aria-hidden>✦</span>
            )}
            {aiGenerating ? "Cancel AI Alignment" : "AI Alignment"}
          </Button>
          <Button
            variant="outline"
            aria-label="AI settings"
            title="NaviGator Toolkit settings"
            onClick={() => setAiSettingsOpen(true)}
            className="w-9 rounded-sm border-border bg-background p-0 text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
        <p
          className="data-mono flex items-start gap-1 text-muted-foreground"
          title="AI Alignment combines Cosmic Collage's existing statistical image analysis with NaviGator multimodal reasoning to improve the selection, rotation, and structural placement of real photographic fragments. It does not generate or alter source imagery."
        >
          <Info className="mt-px size-3 shrink-0" />
          NaviGator Toolkit · {navigatorConnected ? "connected" : "no API key"} · will analyze ~
          {estimate.regions} regions
        </p>
        <Button
          variant="outline"
          onClick={() => void downloadPng()}
          disabled={!mosaic || exporting}
          className="w-full gap-2 rounded-sm border-border bg-background font-mono text-xs tracking-wider uppercase"
        >
          <Download className="size-3.5" />
          {exporting ? "Preparing PNG" : "Download PNG"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void saveToGallery()}
          disabled={!mosaic}
          className="w-full gap-2 rounded-sm border-border bg-background font-mono text-xs tracking-wider uppercase"
        >
          {saved ? <Check className="size-3.5 text-amber" /> : <Save className="size-3.5" />}
          {saved ? "Saved to Gallery" : "Save to Gallery"}
        </Button>
      </div>

      <AiSettingsDialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent className="max-w-md border-border bg-surface">
          <DialogHeader>
            <DialogTitle className="font-display text-base text-foreground">
              Before AI Alignment runs
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              AI Alignment sends reduced-resolution copies of the target and selected collage regions
              to NaviGator Toolkit for analysis. Original full-resolution source photographs are not
              sent unless required by a future feature.
            </DialogDescription>
          </DialogHeader>
          <p className="data-mono text-muted-foreground">
            This run will make about {estimate.total} analysis requests ({estimate.regions} regions
            plus one global comparison). No imagery is generated — NaviGator only chooses between
            existing photographic fragments.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConsentOpen(false)}
              className="rounded-sm border-border bg-background font-mono text-xs tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                grantNavigatorConsent();
                setConsentOpen(false);
                void generateWithAI();
              }}
              className="rounded-sm bg-amber font-mono text-xs tracking-wider uppercase text-[oklch(0.18_0.01_250)] hover:bg-amber/90"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
