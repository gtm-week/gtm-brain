process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_OS_NO_COMPILE = "1";
// Guidelines: the brand, voice and ICP documents in brain/guidelines that the work must follow (ALL-218).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-guide-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const gl = await import(`${P}/lib/guidelines.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_VERSION_CHECK: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-guide-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const guideline = (root, ...args) => execFileSync(process.execPath, [`${P}/scripts/gtm-os-guidelines/guideline.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });
const refused = (root, ...args) => { try { guideline(root, ...args); return null; } catch (e) { return { code: e.status, text: String(e.stderr || e.stdout) }; } };
const lastCommit = root => execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim();
const hook = (root, project) => execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: project || root, encoding: "utf8", env, input: JSON.stringify({ session_id: "thread-1", cwd: project || root }) });
const VOICE = "We write like an operator: short sentences, real numbers, problem first.\n\nHard rules: no exclamation points, no emoji in body copy.\n\nBanned words: synergy, leverage, unlock, seamless.";

test("the format: slug from the title, applies_to normalized, render and read round-trip, validation", () => {
  assert.equal(gl.guidelineSlug("Tone of voice"), "tone-of-voice");
  assert.deepEqual(gl.normalizeAppliesTo(" Copy, outreach ,Landing Pages,, copy"), ["copy", "outreach", "landing pages"]);
  assert.deepEqual(gl.normalizeAppliesTo(["Posts", "posts"]), ["posts"]);
  const ok = { slug: "tone-of-voice", title: "Tone of voice", applies_to: "copy, posts", body: VOICE, status: "draft" };
  assert.equal(gl.validateGuideline(ok), null);
  assert.match(gl.validateGuideline({ ...ok, title: " " }), /title/);
  assert.match(gl.validateGuideline({ ...ok, applies_to: "" }), /applies_to/);
  assert.match(gl.validateGuideline({ ...ok, body: "" }), /body/);
  assert.match(gl.validateGuideline({ ...ok, status: "final" }), /draft or approved/);
  assert.match(gl.validateGuideline({ ...ok, body: "x".repeat(gl.BODY_MAX + 1) }), /KB/);
  const text = gl.renderGuideline({ ...ok, by: "marta-nowak", updated: "2026-09-17", version: "0.23.0" });
  assert.match(text, /^title: Tone of voice$/m); assert.match(text, /^applies_to: \[copy, posts\]$/m); assert.match(text, /^# Tone of voice$/m); assert.ok(text.includes(gl.HEADER_LINE));
  const root = brain(); gl.writeGuideline(root, { ...ok, by: "marta-nowak", updated: "2026-09-17", version: "0.23.0" });
  const back = gl.readGuideline(root, "tone-of-voice");
  assert.deepEqual([back.title, back.applies_to, back.status, back.by, back.updated, back.version, back.path], ["Tone of voice", ["copy", "posts"], "draft", "marta-nowak", "2026-09-17", "0.23.0", "brain/guidelines/tone-of-voice.md"]);
  assert.ok(back.body.includes("Banned words: synergy"));
  // rendering the body read back adds no second heading or header line
  const again = gl.renderGuideline({ ...back, version: "0.23.0" }); assert.equal(again.split("# Tone of voice").length, 2); assert.equal(again.split(gl.HEADER_LINE).length, 2);
});

test("the script creates, lists, shows, updates and removes, one commit each, and refuses what the format refuses", () => {
  const root = brain();
  const made = guideline(root, "--create", "--title", "Tone of voice", "--applies-to", "copy, outreach, posts", "--body", VOICE, "--by", "marta");
  assert.match(made, /created guideline tone-of-voice \(kept\)/); assert.equal(lastCommit(root), "Added guideline tone-of-voice");
  assert.match(readFileSync(join(root, "brain", "guidelines", "tone-of-voice.md"), "utf8"), /^by: marta-nowak$/m);
  assert.match(guideline(root, "--list"), /Tone of voice \[draft\] \(copy, outreach, posts\) · brain\/guidelines\/tone-of-voice\.md · by marta-nowak/);
  assert.match(guideline(root, "--show", "tone-of-voice"), /Banned words: synergy/);
  assert.match(refused(root, "--create", "--title", "Tone of voice", "--applies-to", "copy", "--body", "x").text, /already exists/);
  assert.match(refused(root, "--create", "--title", "Design system", "--body", "x").text, /applies_to/);
  assert.match(refused(root, "--create", "--title", "Design system", "--applies-to", "landing pages", "--body", "x", "--by", "nobody").text, /not in admin.md team/);
  assert.match(refused(root, "--update", "tone-of-voice").text, /nothing to change/);
  // update keeps the body when only the status changes, and the person's hand edit survives
  writeFileSync(join(root, "brain", "guidelines", "tone-of-voice.md"), readFileSync(join(root, "brain", "guidelines", "tone-of-voice.md"), "utf8") + "\nAlso: British spelling.\n");
  const up = guideline(root, "--update", "tone-of-voice", "--status", "approved", "--applies-to", "copy, outreach, posts, landing pages");
  assert.match(up, /updated guideline tone-of-voice \(kept\)/); assert.equal(lastCommit(root), "Updated guideline tone-of-voice");
  const g = gl.readGuideline(root, "tone-of-voice"); assert.equal(g.status, "approved"); assert.deepEqual(g.applies_to, ["copy", "outreach", "posts", "landing pages"]); assert.ok(g.body.includes("British spelling"));
  assert.match(refused(root, "--update", "tone-of-voice", "--status", "final").text, /draft or approved/);
  const json = JSON.parse(guideline(root, "--list", "--json")); assert.equal(json.length, 1); assert.equal(json[0].body, undefined);
  assert.match(guideline(root, "--remove", "tone-of-voice"), /removed guideline tone-of-voice/); assert.equal(existsSync(join(root, "brain", "guidelines", "tone-of-voice.md")), false);
  assert.equal(lastCommit(root), "Removed guideline tone-of-voice"); assert.match(guideline(root, "--list"), /no guidelines yet/);
  assert.match(refused(root, "--remove", "tone-of-voice").text, /no such guideline/);
});

test("the session hook names the guidelines every chat, in the brain and in a linked project, and says when there are none", () => {
  const root = brain();
  assert.match(hook(root), /guidelines: none yet.*tone of voice, design system, target customer definition/);
  guideline(root, "--create", "--title", "Tone of voice", "--applies-to", "copy, posts", "--body", VOICE, "--status", "approved");
  guideline(root, "--create", "--title", "Design system", "--applies-to", "landing pages, creatives", "--body", "Off-white background, one accent colour, no gradients.");
  const out = hook(root);
  assert.match(out, /guidelines: Design system \[draft\] \(landing pages, creatives\) -> brain\/guidelines\/design-system\.md  ·  Tone of voice \[approved\] \(copy, posts\) -> brain\/guidelines\/tone-of-voice\.md\. Before work of a listed kind, read that file in full and follow it \(AGENTS\.md rule 11\)/);
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-guide-folder-")));
  execFileSync(process.execPath, [`${P}/skills/gtm-os-project/project.mjs`, ".", "--link", folder, "--slug", "landing", "--contexts", "offer"], { cwd: root, encoding: "utf8", env });
  const inProject = hook(root, folder);
  assert.match(inProject, /^PROJECT landing/m);
  assert.ok(inProject.includes(`Tone of voice [approved] (copy, posts) -> ${join(root, "brain", "guidelines", "tone-of-voice.md")}`), inProject);
  assert.equal(gl.guidelinesLine(root, { absolute: true }).includes(join(root, "brain/guidelines/design-system.md")), true);
});

test("a prepared Markdown file becomes the body as it is; other files are sent through add-file", () => {
  const root = brain(); const scratch = mkdtempSync(join(tmpdir(), "gtm-os-guide-file-"));
  writeFileSync(join(scratch, "design.md"), "# Design system\n\nOff-white #fefaef, black, acid green #b8ff03.\n\nNo gradients.\n");
  writeFileSync(join(scratch, "design.pdf"), "%PDF-1.4 not really");
  const made = guideline(root, "--create", "--title", "Design system", "--applies-to", "landing pages, creatives, design", "--file", join(scratch, "design.md"));
  assert.match(made, /created guideline design-system/);
  const g = gl.readGuideline(root, "design-system"); assert.ok(g.body.startsWith("# Design system")); assert.ok(g.body.includes("acid green #b8ff03")); assert.equal(g.body.split("# Design system").length, 2);
  assert.match(refused(root, "--create", "--title", "Deck style", "--applies-to", "decks", "--file", join(scratch, "design.pdf")).text, /gtm-os-add-file/);
  assert.match(refused(root, "--create", "--title", "Deck style", "--applies-to", "decks", "--file", join(scratch, "missing.md")).text, /does not exist/);
  assert.match(refused(root, "--create", "--title", "Deck style", "--applies-to", "decks", "--file", join(scratch, "design.md"), "--body", "x").text, /not both/);
  writeFileSync(join(scratch, "design.md"), "# Design system\n\nOff-white #fefaef only.\n");
  assert.match(guideline(root, "--update", "design-system", "--file", join(scratch, "design.md")), /updated guideline design-system/);
  assert.ok(gl.readGuideline(root, "design-system").body.includes("only"));
});
