// Look-alike names (lib.suggestMerges): a shared word suggests one company under two names, and a shared surname
// one person. It says nothing for meetings, events, tools, products and offerings, whose names are built from
// common words: those are the same only when their names are. And every housekeeping row on the Overview opens
// to show what it counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const lib = await import(`${P}/lib/brain.mjs`);
const e = (name, kind, aliases = []) => ({ id: `e_${name.replace(/\W/g, "").toLowerCase()}`, name, kind, aliases, status: "active" });
const pairs = list => lib.suggestMerges(list).map(m => [m.a, m.b].sort().join(" | ")).sort();

test("two meetings or two events that share words are not suggested as the same; the same name still is", () => {
  const list = [
    e("Discovery call with Acme 2026-05-26", "meeting"), e("Discovery call with Northfold 2026-06-12", "meeting"),
    e("Northfold Summit Berlin", "event"), e("Northfold Summit Warsaw", "event"),
    e("Starter plan", "offering"), e("Growth plan", "offering"), e("Paylo CRM", "tool"), e("Quorra CRM", "tool"),
  ];
  assert.deepEqual(pairs(list), []);
  assert.deepEqual(pairs([e("Northfold Summit", "event"), e("Northfold-Summit", "event")]), ["Northfold Summit | Northfold-Summit"]);
  assert.deepEqual(pairs([e("Autumn meetup", "event", ["Northfold Summit"]), e("Northfold Summit", "event")]), ["Autumn meetup | Northfold Summit"], "an alias that is the other's name");
});

test("companies and people keep their look-alike rules", () => {
  assert.deepEqual(pairs([e("Acme", "organization"), e("Acme Ltd", "organization")]), ["Acme | Acme Ltd"]);
  assert.deepEqual(pairs([e("Anna Lind", "person"), e("Annika Lind", "person")]), ["Anna Lind | Annika Lind"]);
  assert.deepEqual(pairs([e("Anna Lind", "person"), e("Anna Berg", "person")]), []);
});

test("every housekeeping row on the Overview carries what it counts, in a row that opens", () => {
  const t = readFileSync(`${P}/scripts/gtm-brain-render/home.template.html`, "utf8");
  const body = t.slice(t.indexOf("function housekeeping(){"), t.indexOf("function renderInbox(){"));
  const adds = body.split("\n").filter(l => /(^|[^a-zA-Z.])add\(/.test(l) && !l.includes("const rows="));
  assert.ok(adds.length >= 6, "the six kinds of item");
  assert.match(t, /<li class="ov-row"><details><summary>/, "a row with detail is a details element");
  for (const what of ["D.merges.slice(0,12)", "names.slice(0,40)", "copies.slice(0,6)", "unwritten.map(d=>", "missing_required_fields", "Set relation to us"]) assert.ok(body.includes(what), `detail for: ${what}`);
});
