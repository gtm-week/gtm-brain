// The launchd example once hard-coded plugin version 0.3.0 in its path, so it pointed at a folder no install
// has had since. It now runs the newest installed version, whatever its number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const plist = readFileSync(join(P, "scripts/gtm-brain-schedule/launchd.plist.example"), "utf8");
const unxml = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const args = [...plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map(m => unxml(m[1]));

test("the launchd example names no plugin version in its path", () => {
  assert.doesNotMatch(plist, /gtm-brain\/gtm-brain\/\d+\.\d+\.\d+/);
  assert.doesNotMatch(plist, /0\.3\.0/);
  assert.deepEqual(args.slice(0, 2), ["/bin/bash", "-c"]);
  assert.equal(args[3], "/Users/YOU/your-brain", "the brain folder is the one argument to change");
});

test("the launchd example runs scheduled-run.sh of the newest installed version with the brain folder", () => {
  const home = mkdtempSync(join(tmpdir(), "gtm-plist-home-"));
  const cache = join(home, ".codex/plugins/cache/gtm-brain/gtm-brain");
  let t = 1_700_000_000;
  // 0.9.0 is written last and sorts last as text: only the version number may decide.
  for (const v of ["0.34.10", "0.34.3", "0.9.0"]) {
    const dir = join(cache, v, "scripts/gtm-brain-schedule"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "scheduled-run.sh"), `echo "ran ${v} $1"\n`);
    utimesSync(join(cache, v), t, t); t += 100;
  }
  mkdirSync(join(cache, "local"));   // a folder that is not a version is never picked
  const r = spawnSync(args[0], [args[1], args[2], "/tmp/brain"], { env: { PATH: process.env.PATH, HOME: home }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "ran 0.34.10 /tmp/brain");
  const other = spawnSync(args[0], [args[1], args[2], "/tmp/brain"], { env: { PATH: process.env.PATH, HOME: "/nonexistent", CODEX_HOME: join(home, ".codex") }, encoding: "utf8" });
  assert.equal(other.stdout.trim(), "ran 0.34.10 /tmp/brain", "CODEX_HOME is followed, as in lib");
  const none = spawnSync(args[0], [args[1], args[2], "/tmp/brain"], { env: { PATH: process.env.PATH, HOME: mkdtempSync(join(tmpdir(), "gtm-plist-empty-")) }, encoding: "utf8" });
  assert.equal(none.status, 1); assert.match(none.stderr, /plugin not installed/);
});
