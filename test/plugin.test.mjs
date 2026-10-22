// node --test test/plugin.test.mjs
// Offline: fake pages of www.area-documental.com built from real fragments (test/fixtures) and a stub of `kino`.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateManifest } from "../sdk/contract.mjs";

const fixture = (n) => readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8");
const calls = [];
let pages = {};
let logs = [];
let store = new Map();
let jar = {};
let lang = "es";
globalThis.kino = {
  get lang() { return lang; },
  config: { get: () => undefined },
  fetch: async (url, opts = {}) => {
    calls.push({ url, opts });
    const p = pages[url];
    if (p && p.setCookie) jar.PHPSESSID = p.setCookie;
    const status = p?.status ?? (p ? 200 : 404);
    return { ok: status < 400, status, text: () => p?.body ?? "", json: () => JSON.parse(p?.body ?? "{}") };
  },
  cookies: { get: (url, name) => jar[name] ?? null, clear: () => { jar = {}; } },
  storage: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, String(v)), keys: () => [...store.keys()], remove: (k) => store.delete(k) },
  log: (...a) => logs.push(a.join(" ")),
  error: (code, message, opts = {}) => Object.assign(new Error(message), { code, ...opts }),
};
const plugin = await import("../plugin.js");

beforeEach(() => { calls.length = 0; pages = {}; logs = []; store = new Map(); jar = {}; lang = "es"; });

const S = "https://www.area-documental.com";
const RESULTS = fixture("results.html");
const PLAYER = fixture("player.html");
const TITULO = "La ultima gran escalada: el K2 en invierno";
const REF = "p:" + encodeURIComponent(TITULO);
const PLAYER_URL = `${S}/player.php?titulo=La+ultima+gran+escalada:+el+K2+en+invierno`;

test("the manifest passes the kit's contract check and declares the site", () => {
  const text = readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8");
  const m = JSON.parse(text);
  const v = validateManifest(text);
  assert.ok(!v.errors?.length && v.ok !== false, JSON.stringify(v));
  for (const h of ["www.area-documental.com", "area-documental.com"]) assert.ok(m.hosts.includes(h), h);
});

test("home: four rows, each three pages of five, ids Kino accepts, titles, year, poster, genre and synopsis from the card", async () => {
  for (const path of ["/resultados-reciente.php", "/resultados-visto.php", "/resultados-anio.php", "/resultados-titulo.php"]) {
    pages[`${S}${path}?buscar=`] = { body: RESULTS };
    pages[`${S}${path}?buscar=&page=1`] = { body: RESULTS };
    pages[`${S}${path}?buscar=&page=2`] = { body: RESULTS };
  }
  const rows = await plugin.home();
  assert.deepEqual(rows.map((r) => r.id), ["recientes", "vistos", "anio", "titulo"]);
  assert.equal(rows[0].title, "Recientes");
  assert.equal(rows[0].items.length, 3 * 3, "three entries a page (the fixture), three pages");
  const k2 = rows[0].items[0];
  assert.equal(k2.title, TITULO);
  assert.match(k2.id, /^[A-Za-z0-9._~-]{1,128}$/);
  assert.equal(k2.ref, REF);
  assert.equal(k2.kind, "movie");
  assert.equal(k2.year, "2026");
  assert.deepEqual(k2.genres, ["Cultura", "Documental"]);
  assert.deepEqual(k2.badges, ["HD"]);
  assert.equal(k2.poster, `${S}/iconos/The.Last.First.Winter.K2.jpg`);
  assert.match(k2.overview, /^En el invierno de 2021/);
  assert.equal(new Set(rows[0].items.map((i) => i.id)).size, 3, "the same three entries on three pages keep three ids");
});

test("ids: two titles never share one, and an accent or a colon does not break the pattern", async () => {
  pages[`${S}/resultados-reciente.php?buscar=`] = { body: RESULTS };
  const { items } = await plugin.browse("list:recientes", "0");
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9._~-]{1,128}$/);
});

test("browse: the cursor is the page number, the next page is offered only on a full page of five", async () => {
  const five = `<html>${Array.from({ length: 5 }, (_, i) => `<div class="wthree-news-left"><article><div class="imagen w"><a href="/player.php?titulo=T+${i}"><img src="/iconos/t${i}.jpg"></a></div><h2><a href="/player.php?titulo=T+${i}">T ${i}</a></h2> &nbsp;&nbsp;&nbsp;2020 &nbsp;&nbsp; Arte &nbsp;&nbsp; SD <div class="comments-space">Sinopsis ${i}</div></article></div>`).join("")}</html>`;
  pages[`${S}/resultados-visto.php?buscar=&page=7`] = { body: five };
  const p = await plugin.browse("list:vistos", "7");
  assert.equal(p.items.length, 5);
  assert.equal(p.next, "8");
  pages[`${S}/resultados-visto.php?buscar=&page=9`] = { body: RESULTS };
  assert.equal((await plugin.browse("list:vistos", "9")).next, undefined, "a page of three is the last one");
  assert.deepEqual((await plugin.browse("list:nope", null)).items, []);
  pages[`${S}/resultados-visto.php?buscar=&page=3`] = { body: five };
  const first = await plugin.browse("list:vistos", null);
  assert.ok(calls.some((c) => c.url.endsWith("&page=3")), "with no cursor browse continues after the three pages of the Home row");
  assert.equal(first.items.length, 5);
});

test("search: asks the first two pages, short queries nothing, an empty answer is an empty list", async () => {
  pages[`${S}/resultados.php?buscar=volcan`] = { body: RESULTS };
  pages[`${S}/resultados.php?buscar=volcan&page=1`] = { body: "<html>nothing</html>" };
  const r = await plugin.search("volcan");
  assert.equal(r.length, 3);
  assert.deepEqual(await plugin.search("v"), []);
  assert.equal((await plugin.search({ q: "volcan" })).length, 3);
  assert.deepEqual(await plugin.search("zzzz"), []);
});

test("resolve: the MP4, with the session cookie the player page set, the referer, subtitles in two languages and the duration", async () => {
  pages[PLAYER_URL] = { body: PLAYER, setCookie: "abc123session" };
  const s = await plugin.resolve(REF);
  assert.equal(s.url, `${S}/videoHD.php?playback=53c395da51db18d0bcc258aad4e5106f`);
  assert.equal(s.mime, "video/mp4");
  assert.equal(s.label, "HD");
  assert.equal(s.headers.Cookie, "PHPSESSID=abc123session");
  assert.equal(s.headers.Referer, `${S}/video/La+ultima+gran+escalada:+el+K2+en+invierno/`);
  assert.match(s.headers["User-Agent"], /Chrome/);
  assert.deepEqual(s.subtitles.map((x) => [x.lang, x.format, x.url]), [["es", "srt", `${S}/webvtt/The.Last.First.Winter.K2.spa.srt`], ["en", "srt", `${S}/webvtt/The.Last.First.Winter.K2.eng.srt`]]);
  assert.equal(s.durationMs, ((1 * 60 + 35) * 60 + 48) * 1000);
});

test("resolve: no session cookie is an error the person can read, not a stream that answers 403", async () => {
  pages[PLAYER_URL] = { body: PLAYER };
  await assert.rejects(plugin.resolve(REF), (e) => e.code === "unavailable" && /sesión/.test(e.userMessage));
  assert.ok(logs.some((l) => /PHPSESSID/.test(l)));
});

test("resolve: a page with no player, a 404 and a ref that is not ours are errors", async () => {
  pages[PLAYER_URL] = { body: "<html>no player</html>", setCookie: "x" };
  await assert.rejects(plugin.resolve(REF), (e) => e.code === "not_found" && /video/.test(e.userMessage));
  await assert.rejects(plugin.resolve("p:" + encodeURIComponent("Does Not Exist")), (e) => e.code === "unavailable");
  await assert.rejects(plugin.resolve("x:1"), (e) => e.code === "not_found");
  await assert.rejects(plugin.resolve("p:%E0%A4%A"), (e) => e.code === "not_found");
});

test("resolve: an extra quality on the page is an alternative; the HD one comes first", async () => {
  const two = PLAYER.replace(/sources:\s*\[[^\]]*\]/, 'sources: [ {file: "https://www.area-documental.com/video.php?playback=sd1", type: "video/mp4", label: "SD"}, {file: "https://www.area-documental.com/videoHD.php?playback=hd1", type: "video/mp4", label: "HD"} ]');
  assert.notEqual(two, PLAYER, "the fixture has the sources block the test rewrites");
  pages[PLAYER_URL] = { body: two, setCookie: "s" };
  const s = await plugin.resolve(REF);
  assert.match(s.url, /videoHD\.php\?playback=hd1/);
  assert.equal(s.alternatives.length, 1);
  assert.match(s.alternatives[0].url, /video\.php\?playback=sd1/);
  assert.equal(s.alternatives[0].headers.Cookie, "PHPSESSID=s");
});

test("English text when Kino is in English", async () => {
  lang = "en";
  pages[`${S}/resultados-reciente.php?buscar=`] = { body: RESULTS };
  pages[`${S}/resultados-reciente.php?buscar=&page=1`] = { body: RESULTS };
  pages[`${S}/resultados-reciente.php?buscar=&page=2`] = { body: RESULTS };
  assert.equal((await plugin.home()).find((r) => r.id === "recientes").title, "Recent");
  pages[PLAYER_URL] = { body: "<html></html>", setCookie: "x" };
  await assert.rejects(plugin.resolve(REF), (e) => /was not found/.test(e.userMessage));
});
