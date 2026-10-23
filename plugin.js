// Kino plugin: Area Documental -- documentaries in Spanish from www.area-documental.com (about 2,000, many of them episodes of series).
// The site lists them in pages of five (`/resultados*.php?buscar=<text>&page=<n>`, n from 0, and `?genero=<topic>` for a topic), each
// one opens a player page (`/player.php?titulo=<title>`) whose JW Player names an MP4 (`/videoHD.php?playback=<token>`) and its
// subtitles. The MP4 is only served to a request that carries the session cookie (PHPSESSID) the player page set, so resolve hands it
// to the player. Episodes of a series ("<name> Temporada 2 Ep 4-6") are grouped into one series item, listed by /resultados-serie.php.

const SITE = "https://www.area-documental.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_SIZE = 5;
const HOME_PAGES = 3;
const CACHE_MS = 10 * 60 * 1000;
const MAX_SERIES_PAGES = 8;

const TEXTS = {
  es: {
    recent: "Recientes", popular: "Más vistos", byYear: "Por año", alpha: "De la A a la Z", news: "Novedades", topics: "Temas", series: "Serie", heroText: "Documentales en español, con subtítulos.",
    unavailable: "El servicio no está disponible en este momento.", noVideo: "No se encontró el video de este documental.", noCookie: "El sitio no abrió la sesión del video. Prueba de nuevo.", noEpisodes: "No se encontraron capítulos de esta serie.",
    statusLine: "Listas guardadas: {n}", cacheCleared: "Caché vaciada.", episode: "Ep",
  },
  en: {
    recent: "Recent", popular: "Most watched", byYear: "By year", alpha: "A to Z", news: "What's new", topics: "Topics", series: "Series", heroText: "Documentaries in Spanish, with subtitles.",
    unavailable: "The service is not available right now.", noVideo: "The video of this documentary was not found.", noCookie: "The site did not open the video's session. Try again.", noEpisodes: "No episodes found for this series.",
    statusLine: "Lists kept: {n}", cacheCleared: "Cache cleared.", episode: "Ep",
  },
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

/** The topics of the site's menu that Categorías and the section offer (the site has 63; Kino shows at most 24 tiles): [site value, title]. */
const TOPICS = [
  ["Historia", "Historia"], ["Ciencia", "Ciencia"], ["Naturaleza", "Naturaleza"], ["Arte", "Arte"], ["Cultura", "Cultura"], ["Tecnologia", "Tecnología"],
  ["Medicina", "Medicina"], ["Salud", "Salud"], ["Biografias", "Biografías"], ["Arqueologia", "Arqueología"], ["Astronomia", "Astronomía"], ["Biologia", "Biología"],
  ["Economia", "Economía"], ["Politica", "Política"], ["Deportes", "Deportes"], ["Musica", "Música"], ["Cinematografia", "Cinematografía"], ["Vida salvaje", "Vida salvaje"],
  ["Belica", "Bélica"], ["Ecosistemas", "Ecosistemas"], ["El Universo", "El Universo"], ["Religiones", "Religiones"], ["Antropologia y sociologia", "Antropología y sociología"], ["Actualidad", "Actualidad"],
];

// ---- parsing ---------------------------------------------------------------------------------------------------

const decode = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (s) => decode(String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const abs = (u) => { try { return new URL(decode(u), SITE + "/").href; } catch (_) { return undefined; } };
const plus = (s) => encodeURIComponent(s).replace(/%20/g, "+").replace(/%3A/gi, ":");

/** The `titulo` a player address carries ("La+ultima+gran+escalada:+el+K2" -> "La ultima gran escalada: el K2"), or null. */
function tituloOf(href) {
  const m = /[?&]titulo=([^&#"]+)/.exec(String(href || ""));
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null; } catch (_) { return m[1].replace(/\+/g, " ").trim() || null; }
}

/** The player address of a title, spelled the way the site spells it (spaces as "+"). */
const playerUrl = (titulo) => `${SITE}/player.php?titulo=${plus(titulo)}`;

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
/** An item id Kino accepts (letters, digits and . _ ~ - only): the text as a slug plus a short hash so two never share one. */
const idOf = (prefix, text) => prefix + (fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "doc") + "-" + hash36(text);

/** The series a title belongs to: "Vikingos Temporada 2 Ep 9-10" -> "Vikingos Temporada 2"; null when it is not an episode. */
function seriesOf(title) {
  const m = /^(.+?)\s+Ep\.?\s*\d+(?:\s*[-–]\s*\d+)?\s*$/i.exec(String(title || "").trim());
  return m && m[1].trim().length >= 2 ? m[1].trim() : null;
}

/** Should episodes be grouped into series? On unless the person turned it off in Ajustes. */
function grouping() {
  try { return kino.config.get("group") !== false; } catch (_) { return true; }
}

function movieItem(e) {
  const item = { id: idOf("ad-", e.titulo), ref: "p:" + encodeURIComponent(e.titulo), title: e.title, kind: "movie", genres: ["Documental"] };
  if (e.poster) item.poster = e.poster;
  if (e.year) item.year = e.year;
  if (e.overview) item.overview = e.overview;
  if (e.genre && !/^documental(es)?$/i.test(e.genre)) item.genres = [e.genre, "Documental"];
  if (e.quality) item.badges = [e.quality.toUpperCase()];
  return item;
}

function seriesItem(name, e) {
  const item = { id: idOf("as-", name), ref: "s:" + encodeURIComponent(name), title: name, kind: "series", genres: ["Documental"], badges: [t("series")] };
  if (e.poster) item.poster = e.poster;
  if (e.year) item.year = e.year;
  if (e.overview) item.overview = e.overview;
  if (e.genre && !/^documental(es)?$/i.test(e.genre)) item.genres = [e.genre, "Documental"];
  return item;
}

/** Items of a results page: an episode becomes (once) the series it belongs to, anything else a movie. */
function toItems(entries) {
  const group = grouping();
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    const name = group ? seriesOf(e.title) : null;
    if (!name) { out.push(movieItem(e)); continue; }
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(seriesItem(name, e));
  }
  return out;
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
  if (Array.isArray(v) && !v.length) return v; // an empty answer may be a throttle or a hiccup: not kept
  try { kino.storage.set("c:" + key, JSON.stringify({ at: Date.now(), v }), { ttlMs: CACHE_MS }); } catch (_) { /* a full storage only costs a refetch */ }
  return v;
}

/** A listing a browse ref names: "list:<name>" or "genre:<site topic>", with the path and query the site wants; null for anything else. */
function listingOf(ref) {
  const m = /^(list|genre):(.+)$/.exec(String(ref || ""));
  if (!m) return null;
  if (m[1] === "list") return LISTS[m[2]] ? { path: LISTS[m[2]].path, title: t(LISTS[m[2]].key), name: m[2] } : null;
  const topic = TOPICS.find(([value]) => value === m[2]);
  return topic ? { path: "/resultados.php", genero: topic[0], title: topic[1], name: "genre-" + topic[0] } : null;
}

/** One page of a listing (n from 0), as entries; `query` narrows it with the site's own search. */
function listPage(def, n, query) {
  const q = query ? encodeURIComponent(query) : "";
  const g = def.genero ? `genero=${plus(def.genero)}&` : "";
  const url = `${SITE}${def.path}?${g}buscar=${q}${n > 0 ? "&page=" + n : ""}`;
  return cached(`${def.path}:${def.genero || ""}:${q}:${n}`, async () => parseResults(await getText(url)));
}

async function pagesOf(def, from, count, query) {
  return (await Promise.all(Array.from({ length: count }, (_, i) => listPage(def, from + i, query).catch(() => [])))).flat();
}

// ---- exports ---------------------------------------------------------------------------------------------------

const safeRow = async (id, fn) => { try { return await fn(); } catch (e) { kino.log("row " + id + ": " + (e && e.message)); return null; } };

/** A Home or section row: three pages of a listing, with its "Ver más". */
async function rowOf(id, ref) {
  const def = listingOf(ref);
  const items = toItems(await pagesOf(def, 0, HOME_PAGES));
  return items.length ? { id, title: def.title, items, ref, genre: "documentales" } : null;
}

export async function home() {
  const ids = Object.keys(LISTS);
  return (await Promise.all(ids.map((id) => safeRow(id, () => rowOf(id, "list:" + id))))).filter(Boolean);
}

export async function browse(ref, cursor) {
  const def = listingOf(ref);
  if (!def) return { items: [] };
  const n = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : HOME_PAGES;
  const entries = await listPage(def, n);
  return { items: toItems(entries), next: entries.length >= PAGE_SIZE ? String(n + 1) : undefined };
}

/**
 * The plain search (the site's, over everything) or, with `within`, the same search restricted to the "Ver más" page it was made on:
 * a topic (`genero=` plus the text) or a sorted list (the list's own page plus the text).
 */
export async function search(arg) {
  const query = typeof arg === "string" ? { q: arg } : (arg || {});
  const q = String(query.q || "").trim();
  if (q.length < 2) return [];
  let def = { path: "/resultados.php" };
  if (query.within) {
    def = listingOf(query.within);
    if (!def) return null; // Kino filters the page it already has
  }
  const n = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;
  const entries = await pagesOf(def, n, query.within ? 1 : 2, q);
  const items = toItems(entries);
  if (!query.within) return items;
  return { items, next: entries.length >= PAGE_SIZE ? String(n + 1) : undefined };
}

// ---- section, categories ---------------------------------------------------------------------------------------

const TAB_DEFS = () => [
  { id: "novedades", label: t("news") },
  { id: "temas", label: t("topics") },
  { id: "anio", label: t("byYear") },
  { id: "titulo", label: t("alpha") },
];

function heroOf(rows) {
  const first = rows.flatMap((r) => r.items).find((i) => i.poster && i.overview) || rows.flatMap((r) => r.items)[0];
  if (!first) return undefined;
  const hero = { title: first.title, text: String(first.overview || t("heroText")).slice(0, 300) };
  if (first.poster) hero.image = first.poster;
  return hero;
}

export async function section({ tab } = {}) {
  const tabs = TAB_DEFS();
  const chosen = tabs.some((x) => x.id === tab) ? tab : "novedades";
  let ids = [];
  if (chosen === "novedades") ids = [["recientes", "list:recientes"], ["vistos", "list:vistos"]];
  else if (chosen === "anio") ids = [["anio", "list:anio"]];
  else if (chosen === "titulo") ids = [["titulo", "list:titulo"]];
  else ids = TOPICS.slice(0, 6).map(([value]) => ["genre-" + value, "genre:" + value]);
  const rows = (await Promise.all(ids.map(([id, ref]) => safeRow(id, () => rowOf(id, ref))))).filter(Boolean);
  const answer = { tabs, tab: chosen, rows };
  const hero = heroOf(rows);
  if (hero) answer.hero = hero;
  return answer;
}

export async function categories() {
  return TOPICS.map(([value, title]) => ({ id: "g-" + hash36(value), title, ref: "genre:" + value }));
}

// ---- a series: its episodes ------------------------------------------------------------------------------------

export async function episodes(ref) {
  const m = /^s:(.+)$/.exec(String(ref || ""));
  let name = null;
  try { name = m && decodeURIComponent(m[1]); } catch (_) { name = null; }
  if (!name) throw kino.error("not_found", "unknown ref: " + ref);
  const entries = [];
  for (let n = 0; n < MAX_SERIES_PAGES; n++) {
    const page = await cached(`serie:${name}:${n}`, async () => parseResults(await getText(`${SITE}/resultados-serie.php?buscar=${plus(name)}${n > 0 ? "&page=" + n : ""}`)));
    entries.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  if (!entries.length) throw kino.error("not_found", "no episodes for " + name, { userMessage: t("noEpisodes") });
  const season = Number((/Temporada\s*(\d+)/i.exec(name) || [])[1] || 1);
  const first = entries[0];
  const seen = new Set();
  const eps = entries.map((e, i) => {
    const label = (/\bEp\.?\s*(\d+(?:\s*[-–]\s*\d+)?)\s*$/i.exec(e.title) || [])[1];
    const number = label ? Number(label.split(/[-–]/)[0]) : i + 1;
    const ep = { season, number, ref: "p:" + encodeURIComponent(e.titulo), title: label ? `${t("episode")} ${label.replace(/\s+/g, "")}` : e.title };
    if (e.poster) ep.still = e.poster;
    if (e.overview) ep.overview = e.overview;
    return ep;
  }).filter((e) => { const k = e.season + ":" + e.number; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.number - b.number);
  const series = { title: name, genres: ["Documental"] };
  if (first.poster) series.poster = first.poster;
  if (first.year) series.year = first.year;
  if (first.overview) series.overview = first.overview;
  if (first.genre && !/^documental(es)?$/i.test(first.genre)) series.genres = [first.genre, "Documental"];
  return { series, episodes: eps };
}

// ---- a documentary's own page: details and resolve -------------------------------------------------------------

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

function tituloFromRef(ref) {
  const m = /^p:(.+)$/.exec(String(ref || ""));
  try { return m ? decodeURIComponent(m[1]) : null; } catch (_) { return null; }
}

/** A documentary's player page; the page a person opens is the one they usually play, so the last few are kept for the next call. */
const pageCache = new Map();
async function playerPage(titulo) {
  if (pageCache.has(titulo)) return pageCache.get(titulo);
  const html = await getText(playerUrl(titulo), { Referer: SITE + "/" });
  if (pageCache.size >= 4) pageCache.delete(pageCache.keys().next().value);
  pageCache.set(titulo, html);
  return html;
}

/** What a documentary's page says about it: synopsis, year, topic, length and its cover. */
export async function details(ref) {
  const titulo = tituloFromRef(ref);
  if (!titulo) return null;
  const html = await playerPage(titulo);
  const meta = (name) => decode((new RegExp(`itemprop=["']${name}["'][^>]*content=["']([^"']*)["']`).exec(html) || [])[1] || "");
  const overview = strip((/<div class="comments"[^>]*>([\s\S]*?)<\/div>/.exec(html) || [])[1]);
  const year = (/^((?:19|20)\d{2})/.exec(meta("dateCreated")) || [])[1];
  const ms = parseDuration(html);
  const out = { overview: overview || undefined, year, runtimeMinutes: ms ? Math.round(ms / 60000) : undefined, genres: ["Documental"] };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

export async function resolve(ref) {
  const titulo = tituloFromRef(ref);
  if (!titulo) throw kino.error("not_found", "unknown ref: " + ref);

  pageCache.delete(titulo); // the session cookie below must be the one this very page set
  const html = await playerPage(titulo);
  const sources = parseSources(html);
  if (!sources.length) throw kino.error("not_found", "no playable file for " + titulo, { userMessage: t("noVideo") });

  // The player page set the session cookie the MP4 is served against; Kino keeps it in this plugin's jar, and the player needs it as a header.
  let sid = null;
  try { sid = kino.cookies.get(SITE + "/", "PHPSESSID"); } catch (_) { sid = null; }
  if (!sid) {
    kino.log("resolve " + titulo + ": no PHPSESSID after the player page");
    throw kino.error("unavailable", "no session cookie for " + titulo, { userMessage: t("noCookie") });
  }
  const headers = { "User-Agent": UA, Referer: `${SITE}/video/${plus(titulo)}/`, Cookie: "PHPSESSID=" + sid };

  const [first, ...rest] = sources;
  const stream = { url: first.url, mime: "video/mp4", headers, label: first.label || "HD" };
  const subtitles = parseSubtitles(html);
  if (subtitles.length) stream.subtitles = subtitles;
  const durationMs = parseDuration(html);
  if (durationMs) stream.durationMs = durationMs;
  if (rest.length) stream.alternatives = rest.map((s) => ({ url: s.url, mime: "video/mp4", headers, ...(s.label ? { label: s.label } : {}) }));
  return stream;
}

// ---- Ajustes ▸ Area Documental ---------------------------------------------------------------------------------

export async function settingsStatus() {
  let n = 0;
  try { n = kino.storage.keys().filter((k) => k.startsWith("c:")).length; } catch (_) { /* no storage */ }
  return { info: t("statusLine").replace("{n}", String(n)) };
}

export async function action(key) {
  if (key === "clearCache") {
    try { for (const k of kino.storage.keys()) if (k.startsWith("c:")) kino.storage.remove(k); } catch (_) { /* nothing to clear */ }
    pageCache.clear();
    return { message: t("cacheCleared") };
  }
  return { message: "" };
}
