// Why is this here (Artur, 2026-11-11: files scattered without asking): save's placed records the WHERE.md
// row and reason in the commit, query why reads it back, and a file that arrived without one is named
// at the next chat start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);
const where = await import(`${P}/lib/where.mjs`);

function brain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-why-")); execFileSync("git", ["init", "-q", root]);
  for (const [k, v] of [["user.name", "Artur Wala"], ["user.email", "a@b.c"]]) execFileSync("git", ["-C", root, "config", k, v]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Artur Wala <a@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  lib.save(root, "setup");
  where.unplacedHint(root);   // the first chat start: remembers where history stands
  return root;
}
const put = (root, path) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), "x"); };

test("save with placed keeps the WHERE.md row and reason; why answers for the file and its folder", () => {
  const root = brain(), rows = where.whereRows(root), n = rows.findIndex(r => /speaker or guest graphic/i.test(r.what)) + 1;
  assert.ok(n > 0);
  put(root, "projects/berlin-event/speakers/anna-lee/hero.png");
  const { trailers, problems } = where.placementTrailers(root, [{ path: "projects/berlin-event/speakers/anna-lee/", row: n, why: "speaker graphic for the Berlin event" }]);
  assert.deepEqual(problems, []);
  assert.ok(lib.save(root, "Berlin speaker graphic", { trailers }).ok);
  const file = where.whyHere(root, "projects/berlin-event/speakers/anna-lee/hero.png");
  assert.match(file, new RegExp(`projects/berlin-event/speakers/anna-lee: WHERE\\.md row ${n} \\(A speaker or guest graphic for an event\\): speaker graphic for the Berlin event\\. Put there on \\d{4}-\\d\\d-\\d\\d by Artur Wala`));
  assert.match(where.whyHere(root, "projects/berlin-event"), /anna-lee: WHERE\.md row/);

  // bad input is refused before anything is saved
  assert.match(where.placementTrailers(root, [{ path: "nope/x.png", row: n, why: "w" }]).problems[0], /no such file/);
  assert.match(where.placementTrailers(root, [{ path: "projects/berlin-event", row: 99, why: "w" }]).problems[0], /WHERE\.md has no row 99/);
  assert.match(where.placementTrailers(root, [{ path: "../etc", why: "w" }]).problems[0], /not a path inside/);
});

test("a file saved without a reason says when it arrived and to ask; a reason can be added later, alone", () => {
  const root = brain();
  put(root, "projects/demo/notes.md");
  lib.save(root, "demo notes");
  assert.match(where.whyHere(root, "projects/demo/notes.md"), /no reason recorded\. It arrived on \d{4}-\d\d-\d\d by Artur Wala, in "demo notes"/);
  put(root, "projects/demo/draft.md");
  assert.match(where.whyHere(root, "projects/demo/draft.md"), /not saved yet, and no reason recorded/);
  assert.match(where.whyHere(root, "projects/ghost.md"), /no such file or folder/);
  // the reason on its own: an empty commit that carries it, nothing else staged in
  const { trailers } = where.placementTrailers(root, [{ path: "projects/demo/notes.md", why: "the person said: demo notes live with the demo" }]);
  const r = lib.save(root, "", { trailers });
  assert.ok(r.ok, r.note);
  assert.match(where.whyHere(root, "projects/demo/notes.md"), /no WHERE\.md row: the person said: demo notes live with the demo/);
  // save keeps every unsaved file: the draft is kept too, and still has no reason of its own
  assert.match(where.whyHere(root, "projects/demo/draft.md"), /no reason recorded\. It arrived/);
});

test("the chat start names new files with no reason once, including ones background maintenance already saved", () => {
  const root = brain();
  put(root, "projects/berlin-event/flyer.png");
  lib.save(root, "background maintenance");              // kept, but with no reason
  put(root, "loose.pdf");                                  // not saved at all
  const hint = where.unplacedHint(root);
  assert.match(hint, /New files with no recorded reason for where they are: loose\.pdf, projects\/berlin-event\/flyer\.png\./);
  assert.equal(where.unplacedHint(root), "");             // said once per set
  const { trailers } = where.placementTrailers(root, [{ path: "loose.pdf", why: "the person keeps it at the top" }]);
  lib.save(root, "placed", { trailers });
  put(root, "projects/berlin-event/second.png");
  assert.match(where.unplacedHint(root), /: projects\/berlin-event\/second\.png\./);
});
