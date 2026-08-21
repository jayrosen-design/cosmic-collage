/**
 * Astro Aperture provider — adapts Jay Rosen's WordPress astrophotography
 * archive (jayrosen.design) into the Cosmic Collage `SourceImage` contract.
 *
 * The reconstruction engine knows nothing about WordPress. Everything
 * WordPress-shaped stops at this module.
 *
 * Photographic rules:
 *  - only still images enter the archive (video / YouTube / Vimeo ignored)
 *  - WordPress alternate size renditions are deduplicated, largest kept
 *  - astronomy metadata is only populated when WordPress states it explicitly
 */

import type { SourceImage, Wavelength } from "../types";

const GRAPHQL_ENDPOINT = "/api/astro-aperture/graphql";
const IMAGE_PROXY = "/api/astro-aperture/image";
const DIRECT_ENDPOINT = "https://jayrosen.design/graphql";
const POST_BASE = "https://jayrosen.design/astrophotography";

export const ASTRO_CATEGORY_ID = 559;

/* ------------------------------------------------------------------ types */

export interface AstroTerm {
  name: string;
  slug: string;
}

export interface AstroPost {
  id: string;
  databaseId: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  date: string;
  featuredImage?: {
    node: {
      sourceUrl: string;
      altText?: string | null;
      mediaDetails?: { width?: number | null; height?: number | null } | null;
    } | null;
  } | null;
  categories?: { nodes: AstroTerm[] } | null;
  tags?: { nodes: AstroTerm[] } | null;
}

interface PostsResponse {
  posts: {
    nodes: AstroPost[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

interface SinglePostResponse {
  post: AstroPost | null;
}

export class AstroApertureError extends Error {}

/* --------------------------------------------------------------- graphql */

const POST_FIELDS = `
  id
  databaseId
  title
  slug
  excerpt
  content
  date
  featuredImage { node { sourceUrl altText mediaDetails { width height } } }
  categories { nodes { name slug } }
  tags { nodes { name slug } }
`;

export const GET_ASTRO_POSTS = `
  query GetAstroPosts($first: Int, $after: String) {
    posts(
      where: { categoryId: ${ASTRO_CATEGORY_ID}, orderby: { field: DATE, order: DESC } }
      first: $first
      after: $after
    ) {
      nodes { ${POST_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_POSTS_BY_TAG = `
  query GetPostsByTag($tag: String!, $first: Int, $after: String) {
    posts(
      where: { categoryId: ${ASTRO_CATEGORY_ID}, tag: $tag, orderby: { field: DATE, order: DESC } }
      first: $first
      after: $after
    ) {
      nodes { ${POST_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_SINGLE_POST = `
  query GetSinglePost($slug: ID!) {
    post(id: $slug, idType: SLUG) { ${POST_FIELDS} }
  }
`;

/**
 * Transport selection. The same-origin proxy is preferred (it is the only way
 * to read remote pixels into a canvas), but the WordPress host sits behind a
 * WAF that can reject server-to-server requests from hosting IPs. When the
 * proxy cannot reach it we fall back to the browser's own connection, which
 * still renders photographs even though canvas analysis then relies on the
 * host's CORS headers.
 */
type Transport = "proxy" | "direct";
let transport: Transport = "proxy";

export function astroApertureTransport(): Transport {
  return transport;
}

async function postGraphQL(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new AstroApertureError(`Astro Aperture responded ${res.status}.`);
  return res.json();
}

async function fetchGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const order: Array<[Transport, string]> =
    transport === "direct"
      ? [["direct", DIRECT_ENDPOINT]]
      : [
          ["proxy", GRAPHQL_ENDPOINT],
          ["direct", DIRECT_ENDPOINT],
        ];

  let lastError: unknown;
  for (const [mode, endpoint] of order) {
    try {
      const json = (await postGraphQL(endpoint, query, variables)) as {
        data?: T;
        errors?: Array<{ message?: string }>;
      };
      if (json.errors?.length) {
        throw new AstroApertureError(json.errors[0]?.message ?? "Astro Aperture query failed.");
      }
      if (!json.data) throw new AstroApertureError("Astro Aperture returned no data.");
      transport = mode;
      return json.data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof AstroApertureError
    ? lastError
    : new AstroApertureError("Astro Aperture could not be reached.");
}

/* ------------------------------------------------------- media discovery */

/** Base filename with WordPress size suffixes (-1024x768, -scaled) removed. */
function baseFilename(url: string): string {
  try {
    const file = (url.split("?")[0] ?? url).split("/").pop() ?? url;
    return file
      .replace(/-\d+x\d+/g, "")
      .replace(/-scaled/g, "")
      .replace(/\.[^.]+$/, "")
      .toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Larger is better. No size suffix means the original upload. */
function renditionSize(url: string): number {
  const m = url.match(/-(\d+)x(\d+)/);
  if (m) return Number(m[1]) * Number(m[2]);
  if (url.includes("-scaled")) return 1_000_000;
  return 10_000_000;
}

function isStillImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return false;
  if (/\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(url)) return false;
  if (/placeholder|emoji|avatar|gravatar|logo|icon/i.test(url)) return false;
  return /\.(jpe?g|png|webp|avif)(\?|$)/i.test(url) || /wp-content\/uploads/i.test(url);
}

/** Still images embedded in the post HTML. Videos and embeds are ignored. */
export function parseImagesFromContent(content: string | null | undefined): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1]!;
    if (isStillImageUrl(url)) urls.push(url);
  }
  return urls;
}

/**
 * Every unique photograph in a post: featured image first, then content
 * images, with WordPress alternate sizes collapsed to the largest rendition.
 */
export function uniquePostImages(post: AstroPost): string[] {
  const featured = post.featuredImage?.node?.sourceUrl ?? "";
  const all: string[] = [];
  if (featured && isStillImageUrl(featured)) all.push(featured);
  all.push(...parseImagesFromContent(post.content));

  const groups = new Map<string, string[]>();
  const order: string[] = [];
  for (const url of all) {
    const key = baseFilename(url);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(url);
  }

  return order.map((key) => {
    const urls = groups.get(key)!;
    return urls.reduce((best, u) => (renditionSize(u) > renditionSize(best) ? u : best), urls[0]!);
  });
}

/** Same-origin URL used for canvas analysis. */
export function proxiedImageUrl(originalUrl: string): string {
  if (transport === "direct") return originalUrl;
  return `${IMAGE_PROXY}?url=${encodeURIComponent(originalUrl)}`;
}

/* --------------------------------------------------- resilient image load */

function tryLoadImage(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error("empty image")));
    img.onerror = () => reject(new Error(`Could not load image: ${url}`));
    img.src = url;
  });
}

/** True when the browser will let the engine read this image's pixels. */
function pixelsReadable(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 2, 2);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

export interface LoadedAstroImage {
  el: HTMLImageElement;
  /** URL that actually worked — use this as the SourceImage url */
  url: string;
  /** whether the reconstruction engine can analyse this photograph */
  readable: boolean;
}

/**
 * Loads one Astro Aperture photograph the most capable way available:
 * same-origin proxy (analysable) → direct with CORS (analysable) →
 * direct without CORS (display only). Environments where the proxy is blocked
 * by the WordPress host's WAF therefore still work.
 */
export async function loadAstroApertureImage(image: SourceImage): Promise<LoadedAstroImage> {
  const original = image.sourceOriginalUrl ?? image.url;
  const proxied = `${IMAGE_PROXY}?url=${encodeURIComponent(original)}`;
  const attempts: Array<[string, boolean]> = [
    [proxied, true],
    [original, true],
    [original, false],
  ];

  let lastError: unknown;
  for (const [url, cors] of attempts) {
    try {
      const el = await tryLoadImage(url, cors);
      return { el, url, readable: cors ? pixelsReadable(el) : false };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new AstroApertureError(`Could not load photograph: ${original}`);
}

export function postPageUrl(post: AstroPost): string {
  return `${POST_BASE}/${post.slug}/`;
}


/* ------------------------------------------------------------- metadata */

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&#8211;|&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const WAVELENGTH_PATTERNS: Array<[RegExp, Wavelength]> = [
  [/\bhydrogen[\s-]?alpha\b|\bh-?alpha\b|\bh[\s-]?a\b/i, "ha"],
  [/\boiii\b|\boxygen[\s-]?iii\b/i, "oiii"],
  [/\bsii\b|\bsulfur[\s-]?ii\b/i, "sii"],
  [/\binfrared\b|\bnear[\s-]?ir\b/i, "ir"],
  [/\bultraviolet\b/i, "uv"],
  [/\bmonochrome\b|\bmono\b/i, "mono"],
];

/** Only explicit statements change the wavelength; the default is plain RGB. */
export function detectWavelength(post: AstroPost): Wavelength {
  const haystack = [
    post.title,
    post.slug,
    ...(post.tags?.nodes ?? []).map((t) => t.name),
    plainText(post.excerpt).slice(0, 600),
    plainText(post.content).slice(0, 2000),
  ].join(" ");
  for (const [pattern, wavelength] of WAVELENGTH_PATTERNS) {
    if (pattern.test(haystack)) return wavelength;
  }
  return "rgb";
}

const EQUIPMENT_PATTERNS = [
  /\bSeestar\s?S\d{2}\b/i,
  /\bDwarf\s?(?:lab\s?)?(?:II|III|3|2)\b/i,
  /\bZWO\s?[\w-]+/i,
  /\bCelestron\s?[\w-]+/i,
  /\bSky-?Watcher\s?[\w-]+/i,
  /\bWilliam Optics\s?[\w-]+/i,
  /\bRedcat\s?\d+/i,
  /\bNikon\s?[\w-]+/i,
  /\bCanon\s?(?:EOS\s?)?[\w-]+/i,
  /\bSony\s?[Aa]\d+[\w-]*/i,
  /\biOptron\s?[\w-]+/i,
  /\bStar\s?Adventurer\b/i,
];

/** Equipment only when WordPress names it explicitly. */
export function detectEquipment(post: AstroPost): string | undefined {
  const haystack = `${post.title} ${plainText(post.excerpt)} ${plainText(post.content).slice(0, 3000)}`;
  const found: string[] = [];
  for (const pattern of EQUIPMENT_PATTERNS) {
    const m = haystack.match(pattern);
    if (m?.[0]) {
      const value = m[0].trim();
      if (!found.some((f) => f.toLowerCase() === value.toLowerCase())) found.push(value);
    }
    if (found.length >= 2) break;
  }
  return found.length ? found.join(" · ") : undefined;
}

/** Exposure statements such as "170 x 30 sec" or "45 x 60s". */
export function detectExposure(post: AstroPost): string | undefined {
  const haystack = `${plainText(post.excerpt)} ${plainText(post.content).slice(0, 3000)}`;
  const m = haystack.match(/\b(\d{1,4})\s?[x×]\s?(\d{1,4})\s?(?:sec(?:onds?)?|s)\b/i);
  if (m) return `${m[1]} × ${m[2]} sec`;
  const total = haystack.match(/\b(\d{1,3}(?:\.\d+)?)\s?(?:hours?|hrs?)\s+(?:of\s+)?(?:total\s+)?integration/i);
  return total ? `${total[1]} h integration` : undefined;
}

export function postTags(post: AstroPost): string[] {
  const terms = [...(post.tags?.nodes ?? []), ...(post.categories?.nodes ?? [])];
  const out: string[] = [];
  for (const t of terms) {
    const name = decodeEntities(t.name).trim();
    if (!name || /^astrophotography$/i.test(name)) continue;
    if (!out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/* ------------------------------------------------------- SourceImage adapt */

/** Adapts one WordPress post into Cosmic Collage source photographs. */
export function convertPostToSourceImages(post: AstroPost): SourceImage[] {
  const urls = uniquePostImages(post);
  if (urls.length === 0) return [];

  const title = decodeEntities(post.title).trim() || post.slug;
  const tags = postTags(post);
  const wavelength = detectWavelength(post);
  const equipment = detectEquipment(post);
  const exposure = detectExposure(post);
  const featuredDetails = post.featuredImage?.node?.mediaDetails;
  const pageUrl = postPageUrl(post);

  return urls.map((original, index) => ({
    id: `AA-${post.databaseId}-${index}`,
    name: index === 0 ? title : `${title} — Image ${index + 1}`,
    url: proxiedImageUrl(original),
    wavelength,
    photographer: "Jay Rosen",
    credit: "Jay Rosen / Astro Aperture",
    captureDate: post.date,
    ...(equipment ? { equipment } : {}),
    ...(exposure ? { filters: exposure } : {}),
    tags,
    enabled: true,
    origin: "astro-aperture" as const,
    width: index === 0 ? (featuredDetails?.width ?? 0) : 0,
    height: index === 0 ? (featuredDetails?.height ?? 0) : 0,
    license: "private" as const,
    sourceProvider: "astro-aperture" as const,
    sourcePageUrl: pageUrl,
    sourceOriginalUrl: original,
    sourcePostId: String(post.databaseId),
    sourcePostSlug: post.slug,
  }));
}

/* ------------------------------------------------------------- fetching */

const PAGE_SIZE = 24;
let archiveCache: AstroPost[] | null = null;
let archiveInFlight: Promise<AstroPost[]> | null = null;

export interface FetchProgress {
  (message: string, value: number): void;
}

export async function fetchAstroAperturePosts(
  first = PAGE_SIZE,
  after: string | null = null,
): Promise<{ posts: AstroPost[]; hasNextPage: boolean; endCursor: string | null }> {
  const data = await fetchGraphQL<PostsResponse>(GET_ASTRO_POSTS, { first, after });
  return {
    posts: data.posts.nodes ?? [],
    hasNextPage: data.posts.pageInfo?.hasNextPage ?? false,
    endCursor: data.posts.pageInfo?.endCursor ?? null,
  };
}

export async function fetchAstroApertureByTag(tag: string, first = PAGE_SIZE): Promise<AstroPost[]> {
  const data = await fetchGraphQL<PostsResponse>(GET_POSTS_BY_TAG, { tag, first, after: null });
  return data.posts.nodes ?? [];
}

export async function fetchAstroAperturePost(slug: string): Promise<AstroPost | null> {
  const data = await fetchGraphQL<SinglePostResponse>(GET_SINGLE_POST, { slug });
  return data.post ?? null;
}

/**
 * The whole archive, paginated once per session and cached in memory.
 * Search and category filtering run against this cache — no refetching each
 * time the archive dialog opens.
 */
export async function fetchAstroApertureArchive(onProgress?: FetchProgress): Promise<AstroPost[]> {
  if (archiveCache) return archiveCache;
  if (archiveInFlight) return archiveInFlight;

  archiveInFlight = (async () => {
    onProgress?.("Connecting to Astro Aperture…", 0.05);
    const collected: AstroPost[] = [];
    let after: string | null = null;
    let page = 0;
    for (;;) {
      const result = await fetchAstroAperturePosts(PAGE_SIZE, after);
      collected.push(...result.posts);
      page += 1;
      onProgress?.(
        `Loading astrophotography archive… ${collected.length} observations`,
        Math.min(0.75, 0.05 + page * 0.12),
      );
      if (!result.hasNextPage || !result.endCursor || page >= 20) break;
      after = result.endCursor;
    }
    archiveCache = collected;
    return collected;
  })();

  try {
    return await archiveInFlight;
  } finally {
    archiveInFlight = null;
  }
}

export function cachedAstroApertureArchive(): AstroPost[] | null {
  return archiveCache;
}

export async function searchAstroAperturePosts(query: string): Promise<AstroPost[]> {
  const posts = await fetchAstroApertureArchive();
  const q = query.trim().toLowerCase();
  if (!q) return posts;
  return posts.filter((p) =>
    `${plainText(p.title)} ${p.slug} ${postTags(p).join(" ")} ${plainText(p.excerpt)}`
      .toLowerCase()
      .includes(q),
  );
}

/* ------------------------------------------------------------ categories */

export const ASTRO_CATEGORIES = [
  "All",
  "Galaxies",
  "Nebulae",
  "Milky Way",
  "Clusters",
  "Planets",
  "Moon",
  "Sun",
  "Meteors",
] as const;
export type AstroCategory = (typeof ASTRO_CATEGORIES)[number];

const CATEGORY_MATCHERS: Record<Exclude<AstroCategory, "All">, RegExp> = {
  Galaxies: /galax/i,
  Nebulae: /nebula|nebulae/i,
  "Milky Way": /milky\s?way|galactic\s?core/i,
  Clusters: /cluster/i,
  Planets: /planet|jupiter|saturn|mars|venus|mercury|uranus|neptune/i,
  Moon: /\bmoon\b|lunar/i,
  Sun: /\bsun\b|solar|sunspot/i,
  Meteors: /meteor|perseid|geminid|leonid/i,
};

export function matchesCategory(post: AstroPost, category: AstroCategory): boolean {
  if (category === "All") return true;
  const matcher = CATEGORY_MATCHERS[category];
  const haystack = `${plainText(post.title)} ${post.slug} ${postTags(post).join(" ")}`;
  return matcher.test(haystack);
}

/* ------------------------------------------------ Andromeda live dataset */

/** Conservative M31 identification — title, slug and tags only. */
export function isAndromedaPost(post: AstroPost): boolean {
  const haystack = `${plainText(post.title)} ${post.slug.replace(/-/g, " ")} ${postTags(post).join(" ")}`;
  return /\bandromeda\b/i.test(haystack) || /\bm\s?-?31\b/i.test(haystack);
}

export function isGalaxyPost(post: AstroPost): boolean {
  return matchesCategory(post, "Galaxies");
}

export interface AndromedaDataset {
  target: SourceImage;
  sources: SourceImage[];
  /** posts that contributed photographs, newest first */
  posts: AstroPost[];
  supplemented: boolean;
}

/**
 * Builds "Andromeda Through the Years" from the live archive: the newest
 * dedicated M31 observation becomes the target, every other M31 photograph
 * becomes the source pool, supplemented with galaxy photography when the M31
 * pool is thin.
 */
export async function buildAndromedaDataset(
  onProgress?: FetchProgress,
): Promise<AndromedaDataset> {
  const archive = await fetchAstroApertureArchive(onProgress);
  onProgress?.("Finding Andromeda observations…", 0.8);

  const byDateDesc = (a: AstroPost, b: AstroPost) =>
    new Date(b.date).getTime() - new Date(a.date).getTime();

  const andromeda = archive.filter(isAndromedaPost).sort(byDateDesc);
  if (andromeda.length === 0) {
    throw new AstroApertureError("No Andromeda observations were found in the Astro Aperture archive.");
  }

  const andromedaImages = andromeda.flatMap(convertPostToSourceImages);
  if (andromedaImages.length === 0) {
    throw new AstroApertureError("Andromeda observations contained no usable photographs.");
  }

  const target = andromedaImages[0]!;
  let sources = andromedaImages.slice(1);
  let supplemented = false;
  const posts = [...andromeda];

  if (sources.length < 6) {
    supplemented = true;
    const galaxyPosts = archive
      .filter((p) => !isAndromedaPost(p) && isGalaxyPost(p))
      .sort(byDateDesc);
    for (const post of galaxyPosts) {
      const images = convertPostToSourceImages(post);
      if (images.length === 0) continue;
      posts.push(post);
      sources = [...sources, ...images];
      if (sources.length >= 12) break;
    }
  }

  onProgress?.(`Processing ${sources.length + 1} photographs…`, 0.9);
  return { target, sources, posts, supplemented };
}
