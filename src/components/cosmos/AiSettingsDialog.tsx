import { useEffect, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import {
  clearNavigatorApiKey,
  forgetResolvedModel,
  getNavigatorApiKey,
  getNavigatorModel,
  listModels,
  NavigatorError,
  setNavigatorApiKey,
  setNavigatorModel,
  type NavigatorModel,
} from "@/lib/cosmos/navigator";
import { useStudio } from "@/lib/cosmos/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function AiSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { navigatorConnected, refreshNavigatorConnection } = useStudio();
  const [key, setKey] = useState("");
  const [model, setModel] = useState("auto");
  const [models, setModels] = useState<NavigatorModel[]>([]);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey(getNavigatorApiKey() ?? "");
    setModel(getNavigatorModel());
    setStatus(getNavigatorApiKey() ? "unknown" : "error");
  }, [open]);

  const test = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("Enter your NaviGator Toolkit API key first.");
      return;
    }
    setNavigatorApiKey(trimmed);
    forgetResolvedModel();
    refreshNavigatorConnection();
    setTesting(true);
    setMessage(null);
    try {
      const list = await listModels();
      setModels(list);
      setStatus("ok");
      setMessage(`${list.length} models available.`);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof NavigatorError ? err.message : "Could not reach NaviGator Toolkit.",
      );
    } finally {
      setTesting(false);
    }
  };

  const clear = () => {
    clearNavigatorApiKey();
    forgetResolvedModel();
    refreshNavigatorConnection();
    setKey("");
    setModels([]);
    setStatus("error");
    setMessage("API key removed from this browser.");
  };

  const visionModels = models.filter((m) => m.visionLikely);
  const shown = visionModels.length > 0 ? visionModels : models;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-surface">
        <DialogHeader>
          <DialogTitle className="font-display text-base text-foreground">
            NaviGator Toolkit
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Your NaviGator API key is stored only in this browser. It is not included in Cosmic
            Collage projects or exports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="label-xs">API Key</span>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="••••••••••••••••••••"
              onChange={(e) => setKey(e.target.value)}
              className="h-9 bg-background font-mono text-xs"
            />
          </label>

          <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2">
            <span className="label-xs">Connection</span>
            <span
              className={cn(
                "data-mono",
                status === "ok"
                  ? "text-amber"
                  : status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {status === "ok"
                ? "✓ Connected"
                : status === "error"
                  ? "Not connected"
                  : navigatorConnected
                    ? "Key stored — untested"
                    : "No key"}
            </span>
          </div>

          <label className="block space-y-1.5">
            <span className="label-xs">Model</span>
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setNavigatorModel(e.target.value);
                forgetResolvedModel();
              }}
              className="h-9 w-full rounded-sm border border-border bg-background px-2 font-mono text-xs text-foreground"
            >
              <option value="auto">Automatic (preferred vision model)</option>
              {shown.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.visionLikely ? "" : " (text only?)"}
                </option>
              ))}
            </select>
            <span className="data-mono text-muted-foreground">
              {models.length === 0
                ? "Test the connection to load available models."
                : `${visionModels.length} multimodal-capable models detected.`}
            </span>
          </label>

          {message && <p className="text-xs text-muted-foreground">{message}</p>}

          <div className="flex gap-2">
            <Button
              onClick={() => void test()}
              disabled={testing}
              className="flex-1 gap-2 rounded-sm bg-primary font-mono text-xs tracking-wider uppercase"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Test Connection
            </Button>
            <Button
              variant="outline"
              onClick={clear}
              className="gap-2 rounded-sm border-border bg-background font-mono text-xs tracking-wider uppercase"
            >
              <Trash2 className="size-3.5" /> Clear Key
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
