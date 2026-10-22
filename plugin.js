// Kino plugin: Area Documental -- documentaries in Spanish from www.area-documental.com (about 2,000, many of them episodes of series).
// The site lists them in pages of five (`/resultados*.php?buscar=<text>&page=<n>`, n from 0), each one opens a player page
// (`/player.php?titulo=<title>`) whose JW Player names an MP4 (`/videoHD.php?playback=<token>`) and its subtitles. The MP4 is only
// served to a request that carries the session cookie (PHPSESSID) the player page set, so resolve hands it to the player.

const SITE = "https://www.area-documental.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_SIZE = 5;
const HOME_PAGES = 3;
const CACHE_MS = 10 * 60 * 1000;

const TEXTS = {
  es: { recent: "Recientes", popular: "Más vistos", byYear: "Por año", alpha: "De la A a la Z", unavailable: "El servicio no está disponible en este momento.", noVideo: "No se encontró el video de este documental.", noCookie: "El sitio no abrió la sesión del video. Prueba de nuevo." },
  en: { recent: "Recent", popular: "Most watched", byYear: "By year", alpha: "A to Z", unavailable: "The service is not available right now.", noVideo: "The video of this documentary was not found.", noCookie: "The site did not open the video's session. Try again." },
};
const t = (key) => {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  return TEXTS[lang][key] || TEXTS.es[key] || key;
};

// /resultados.php is the same list as /resultados-reciente.php (newest first), so it is not a row of its own.
const LISTS = {
  recientes: { path: "/resultados-reciente.php", key: "recent" },
  vistos: { path: "/resultados-visto.php", key: "popular" },
  anio: { path: "/resultados-anio.php", key: "byYear" },
  titulo: { path: "/resultados-titulo.php", key: "alpha" },
};

// ---- parsing ---------------------------------------------------------------------------------------------------

const decode = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (s) => decode(String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const abs = (u) => { try { return new URL(decode(u), SITE + "/").href; } catch (_) { return undefined; } };

/** The `titulo` a player address carries ("La+ultima+gran+escalada:+el+K2" -> "La ultima gran escalada: el K2"), or null. */
function tituloOf(href) {
  const m = /[?&]titulo=([^&#"]+)/.exec(String(href || ""));
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null; } catch (_) { return m[1].replace(/\+/g, " ").trim() || null; }
}

/** The player address of a title, spelled the way the site spells it (spaces as "+"). */
const playerUrl = (titulo) => `${SITE}/player.php?titulo=${encodeURIComponent(titulo).replace(/%20/g, "+").replace(/%3A/gi, ":")}`;

/** The entries of a results page: `{ titulo, title, poster, year, genre, quality, overview }`. */
function parseResults(html) {
  const out = [];
  const seen = new Set();
  for (const block of String(html || "").split(/<div class="wthree-news-left"[^>]*>/).slice(1)) {
    const a = /<h2>\s*<a\s+href="([^"]*player\.php[^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>([\s\S]*)/.exec(block);
    if (!a) continue;
    const titulo = tituloOf(a[1]);
    const title = strip(a[2]);
    if (!titulo || !title || seen.has(titulo)) continue;
    seen.add(titulo);
    const img = (/<div class="imagen[^"]*"[\s\S]*?<img[^>]*\bsrc="([^"]+)"/.exec(block) || [])[1];
    const [meta, rest] = a[3].split(/<div class="comments-space">/);
    const parts = decode(String(meta).replace(/<[^>]+>/g, " ")).split(/\s{2,}| {2,}/).map((x) => x.trim()).filter(Boolean);
    const year = (parts.find((p) => /^(?:19|20)\d{2}$/.test(p)) || "") || undefined;
    const quality = parts.find((p) => /^(?:HD|SD|4K|FHD)$/i.test(p));
    const genre = parts.find((p) => p !== year && p !== quality && !/^\d+$/.test(p));
    const overview = rest ? strip(rest.split(/<\/div>/)[0]).slice(0, 600) : "";
    out.push({ titulo, title, poster: img ? abs(img) : undefined, year, genre, quality, overview });
  }
  return out;
}

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hash36 = (s) => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
/** An item id Kino accepts (letters, digits and . _ ~ - only): the title as a slug plus a short hash so two titles never share one. */
const idOf = (titulo) => "ad-" + (fold(titulo).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "doc") + "-" + hash36(titulo);

function toItem(e) {
  const item = { id: idOf(e.titulo), ref: "p:" + encodeURIComponent(e.titulo), title: e.title, kind: "movie", genres: ["Documental"] };
  if (e.poster) item.poster = e.poster;
  if (e.year) item.year = e.year;
  if (e.overview) item.overview = e.overview;
  if (e.genre && !/^documental(es)?$/i.test(e.genre)) item.genres = [e.genre, "Documental"];
  if (e.quality) item.badges = [e.quality.toUpperCase()];
  return item;
}

// ---- fetching --------------------------------------------------------------------------------------------------

async function getText(url, headers) {
  const r = await kino.fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9", ...(headers || {}) }, timeoutMs: 15000 });
  if (!r.ok) throw kino.error("unavailable", `Area Documental ${r.status} ${url}`, { userMessage: t("unavailable") });
  return r.text();
}

async function cached(key, fn) {
  try {
    const raw = kino.storage.get("c:" + key);
    const e = raw ? JSON.parse(raw) : null;
    if (e && Date.now() - e.at < CACHE_MS) return e.v;
  } catch (_) { /* no cache */ }
  const v = await fn();
  try { kino.storage.set("c:" + key, JSON.stringify({ at: Date.now(), v }), { ttlMs: CACHE_MS }); } catch (_) { /* a full storage only costs a refetch */ }
  return v;
}

/** One page of a listing (n from 0). */
function listPage(list, n, query) {
  const q = query ? encodeURIComponent(query) : "";
  const url = `${SITE}${list.path}?buscar=${q}${n > 0 ? "&page=" + n : ""}`;
  return cached(`${list.path}:${q}:${n}`, async () => parseResults(await getText(url)).map(toItem));
}

// ---- exports ---------------------------------------------------------------------------------------------------

export async function home() {
  const rows = await Promise.all(Object.entries(LISTS).map(async ([id, list]) => {
    try {
      const pages = await Promise.all(Array.from({ length: HOME_PAGES }, (_, n) => listPage(list, n)));
      const items = pages.flat();
      return items.length ? { id, title: t(list.key), items, ref: "list:" + id, genre: "documentales" } : null;
    } catch (e) { kino.log("row " + id + ": " + (e && e.message)); return null; }
  }));
  return rows.filter(Boolean);
}

export async function browse(ref, cursor) {
  const m = /^list:(recientes|vistos|anio|titulo)$/.exec(String(ref || ""));
  if (!m) return { items: [] };
  const n = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : HOME_PAGES;
  const items = await listPage(LISTS[m[1]], n);
  return { items, next: items.length >= PAGE_SIZE ? String(n + 1) : undefined };
}

export async function search(arg) {
  const q = String(typeof arg === "string" ? arg : (arg && arg.q) || "").trim();
  if (q.length < 2) return [];
  const pages = await Promise.all([0, 1].map((n) => listPage({ path: "/resultados.php" }, n, q).catch(() => [])));
  return pages.flat();
}

/** `"HD"`-labelled MP4 first; every other `file` of the player's playlist after it. */
function parseSources(html) {
  const out = [];
  const setup = /jwplayer\(\s*['"]myElement['"]\s*\)\.setup\(\{([\s\S]*?)\}\s*\)\s*;/.exec(String(html || ""));
  const body = setup ? setup[1] : String(html || "");
  const sourcesPart = (/sources\s*:\s*\[([\s\S]*?)\]\s*,\s*tracks/.exec(body) || /sources\s*:\s*\[([\s\S]*?)\]/.exec(body) || [])[1] || "";
  for (const m of sourcesPart.matchAll(/\{[^{}]*?\bfile\s*:\s*"([^"]+)"[^{}]*\}/g)) {
    const label = (/\blabel\s*:\s*"([^"]*)"/.exec(m[0]) || [])[1] || "";
    const url = abs(m[1]);
    if (url) out.push({ url, label });
  }
  out.sort((a, b) => (/hd|1080|720/i.test(b.label) ? 1 : 0) - (/hd|1080|720/i.test(a.label) ? 1 : 0));
  return out;
}

function parseSubtitles(html) {
  const out = [];
  const tracks = (/tracks\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}\s*\]/.exec(String(html || "")) || /tracks\s*:\s*\[([\s\S]*?)\]/.exec(String(html || "")) || [])[1] || "";
  for (const m of tracks.matchAll(/\{[^{}]*\}/g)) {
    const file = (/\bfile\s*:\s*"([^"]+)"/.exec(m[0]) || [])[1];
    const label = (/\blabel\s*:\s*"([^"]*)"/.exec(m[0]) || [])[1] || "";
    const format = (/\.(srt|vtt)(?:[?#]|$)/i.exec(file || "") || [])[1];
    if (!file || !format) continue;
    const lang = /^(esp|spa)/i.test(label) ? "es" : /^(ing|eng)/i.test(label) ? "en" : /^(por)/i.test(label) ? "pt" : /^(fra|fre)/i.test(label) ? "fr" : null;
    const url = abs(file);
    if (lang && url && !out.some((s) => s.url === url)) out.push({ lang, url, label, format: format.toLowerCase() });
  }
  return out;
}

/** `itemprop="duration" datetime="1:35:48"` (or an ISO "PT1H35M") in ms, or null. */
function parseDuration(html) {
  const v = (/itemprop=["']duration["'][^>]*datetime=["']([^"']+)["']/.exec(String(html || "")) || [])[1];
  if (!v) return null;
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(v);
  if (iso) return ((Number(iso[1] || 0) * 60 + Number(iso[2] || 0)) * 60 + Number(iso[3] || 0)) * 1000 || null;
  const hms = /^(?:(\d+):)?(\d+):(\d+)$/.exec(v);
  return hms ? ((Number(hms[1] || 0) * 60 + Number(hms[2])) * 60 + Number(hms[3])) * 1000 || null : null;
}

export async function resolve(ref) {
  const m = /^p:(.+)$/.exec(String(ref || ""));
  let titulo = null;
  try { titulo = m && decodeURIComponent(m[1]); } catch (_) { titulo = null; }
  if (!titulo) throw kino.error("not_found", "unknown ref: " + ref);

  const html = await getText(playerUrl(titulo), { Referer: SITE + "/" });
  const sources = parseSources(html);
  if (!sources.length) throw kino.error("not_found", "no playable file for " + titulo, { userMessage: t("noVideo") });

  // The player page set the session cookie the MP4 is served against; Kino keeps it in this plugin's jar, and the player needs it as a header.
  let sid = null;
  try { sid = kino.cookies.get(SITE + "/", "PHPSESSID"); } catch (_) { sid = null; }
  if (!sid) {
    kino.log("resolve " + titulo + ": no PHPSESSID after the player page");
    throw kino.error("unavailable", "no session cookie for " + titulo, { userMessage: t("noCookie") });
  }
  const headers = { "User-Agent": UA, Referer: `${SITE}/video/${encodeURIComponent(titulo).replace(/%20/g, "+").replace(/%3A/gi, ":")}/`, Cookie: "PHPSESSID=" + sid };

  const [first, ...rest] = sources;
  const stream = { url: first.url, mime: "video/mp4", headers, label: first.label || "HD" };
  const subtitles = parseSubtitles(html);
  if (subtitles.length) stream.subtitles = subtitles;
  const durationMs = parseDuration(html);
  if (durationMs) stream.durationMs = durationMs;
  if (rest.length) stream.alternatives = rest.map((s) => ({ url: s.url, mime: "video/mp4", headers, label: s.label || undefined })).map((a) => { if (!a.label) delete a.label; return a; });
  return stream;
}
