process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// The deterministic end-to-end harness on the small shape: a generated brain, every check scored
// against its gold ledger. A known gap that turns to pass is fine; a plain failure is not.
// Run: node --test plugins/gtm-brain/test/e2e.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { generate } = await import("./e2e/generate-brain.mjs");
const { runChecks } = await import("./e2e/e2e.mjs");

test("e2e harness: the small shape is deterministic and passes every check but the known gaps", { timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "gtm-e2e-test-"));
  const a = await generate({ shape: "small", out: join(dir, "a"), quiet: true });
  const b = await generate({ shape: "small", out: join(dir, "b"), quiet: true });
  const strip = p => { const g = JSON.parse(readFileSync(p, "utf8")); delete g.generated; for (const at of g.attachments) delete at.path; return g; };
  assert.deepEqual(strip(a.gold), strip(b.gold), "same shape and seed give the same gold ledger");
  const { summary, results } = await runChecks({ brain: a.root, gold: a.gold });
  assert.ok(summary.total >= 25, `${summary.total} checks`);
  const failed = results.filter(r => !r.pass && !r.known_gap);
  assert.deepEqual(failed.map(r => `${r.id}: ${r.note || ""}`), []);
});
