/**
 * Local persistence for personally uploaded source photographs.
 * Uploads are stored in localStorage as downscaled data URLs so they survive
 * a page reload. This is the placeholder layer until accounts + cloud storage
 * exist; swap the four exported functions for API calls at that point.
 */
import type { SourceImage } from "./types";

const KEY = "cosmic-collage.uploads.v1";
/** Longest edge kept for a persisted upload — keeps localStorage under quota. */
const MAX_EDGE = 1400;
const QUALITY = 0.82;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function listUploads(): SourceImage[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SourceImage[];
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.url && i.id) : [];
  } catch {
    return [];
  }
}

function write(list: SourceImage[]): SourceImage[] {
  if (!isBrowser()) return list;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    // quota exceeded — drop the oldest entries until it fits
    const trimmed = list.slice();
    while (trimmed.length > 1) {
      trimmed.shift();
      try {
        window.localStorage.setItem(KEY, JSON.stringify(trimmed));
        return trimmed;
      } catch {
        /* keep trimming */
      }
    }
    return trimmed;
  }
}

export function saveUploads(images: SourceImage[]): SourceImage[] {
  const existing = listUploads();
  const map = new Map(existing.map((i) => [i.id, i]));
  for (const img of images) map.set(img.id, img);
  return write([...map.values()]);
}

export function updateUpload(id: string, patch: Partial<SourceImage>): SourceImage[] {
  return write(listUploads().map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export function removeUpload(id: string): SourceImage[] {
  return write(listUploads().filter((i) => i.id !== id));
}

/** Reads a File and returns a downscaled JPEG data URL plus its dimensions. */
export async function fileToStoredImage(
  file: File,
): Promise<{ url: string; width: number; height: number } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(el.naturalWidth, el.naturalHeight));
    const w = Math.max(1, Math.round(el.naturalWidth * scale));
    const h = Math.max(1, Math.round(el.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, w, h);
    return { url: canvas.toDataURL("image/jpeg", QUALITY), width: w, height: h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
