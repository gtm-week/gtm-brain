import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

test("a test brain is removed only after its queued render settles, even while the render still writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-cleanup-"));
  mkdirSync(join(root, "work/home"), { recursive: true });
  writeFileSync(join(root, "work/render-request.json"), JSON.stringify({ id: "r1", at: "2026-10-26T00:00:00Z" }));
  writeFileSync(join(root, "work/render-state.json"), JSON.stringify({ request: "r1", status: "running" }));
  // A stand-in for the detached renderer: it keeps writing, then marks the render ready.
  const writes = [100, 200, 300].map(ms => setTimeout(() => {
    mkdirSync(join(root, "work/home", "page-" + ms), { recursive: true });
    writeFileSync(join(root, "work/home", "page-" + ms, "index.html"), "<p>render</p>");
  }, ms));
  const done = setTimeout(() => writeFileSync(join(root, "work/render-state.json"), JSON.stringify({ request: "r1", status: "ready" })), 350);
  await removeBrain(root);
  assert.equal(existsSync(root), false);
  for (const t of [...writes, done]) clearTimeout(t);
});

test("removing a brain that never rendered, or is already gone, does not wait or throw", async () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-cleanup-"));
  const started = Date.now();
  await removeBrain(root);
  await removeBrain(root);
  assert.equal(existsSync(root), false);
  assert.ok(Date.now() - started < 1000);
});
