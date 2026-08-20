import type { MosaicSettings } from "./types";

export interface GalleryEntry {
  id: string;
  name: string;
  object: string;
  createdAt: number;
  columns: number;
  rows: number;
  tileCount: number;
  sourceCount: number;
  abstraction: number;
  seed: number;
  thumbnail: string; // data URL
  settings: MosaicSettings;
}

const KEY = "cosmic-collage.gallery.v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function listGallery(): GalleryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GalleryEntry[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

export function saveGalleryEntry(entry: GalleryEntry): GalleryEntry[] {
  if (!isBrowser()) return [];
  const next = [entry, ...listGallery().filter((e) => e.id !== entry.id)].slice(0, 60);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded — keep the newest entry only */
    try {
      window.localStorage.setItem(KEY, JSON.stringify([entry]));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function deleteGalleryEntry(id: string): GalleryEntry[] {
  if (!isBrowser()) return [];
  const next = listGallery().filter((e) => e.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const GALLERY_EVENT = "cosmic-collage:gallery-changed";

export function notifyGalleryChanged() {
  if (isBrowser()) window.dispatchEvent(new Event(GALLERY_EVENT));
}
