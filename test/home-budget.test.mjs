// node --test test/home-budget.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.kino = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log() {}, config: { get() {} }, storage: { get: () => null, set() {}, keys: () => [] } };
const { rowsWithin } = await import("../plugin.js");

test("the plugin asks Kino to drop the requests a call leaves running", () => {
  assert.equal(globalThis.__kinoDropPendingFetches, true);
});

test("a slow row is left out and the fast ones answer inside the budget", async () => {
  const t0 = Date.now();
  const rows = await rowsWithin([
    async () => ({ id: "a" }),
    () => new Promise(() => {}),
    async () => ({ id: "c" }),
  ], 400);
  assert.deepEqual(rows.map((r) => r.id), ["a", "c"]);
  assert.ok(Date.now() - t0 < 900);
});

test("it answers as soon as every row settled, without waiting for the budget", async () => {
  const t0 = Date.now();
  const rows = await rowsWithin([async () => ({ id: "a" }), async () => { throw new Error("x"); }], 5000);
  assert.equal(rows.length, 1);
  assert.ok(Date.now() - t0 < 1000);
});
