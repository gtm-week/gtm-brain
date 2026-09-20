#!/usr/bin/env node
// Guidelines: the brand, voice and ICP documents the work must follow, in brain/guidelines (ALL-218).
//   node guideline.mjs <root> --create --title T --applies-to "copy, posts" (--body B | --file path.md) [--status approved] [--by handle]
//   --file: an existing Markdown or text file the person prepared becomes the body as it is, nothing retyped
//   node guideline.mjs <root> --update <slug> [--title T] [--applies-to "..."] [--body B] [--status s] [--by handle]
//   node guideline.mjs <root> --list [--json]
//   node guideline.mjs <root> --show <slug>
//   node guideline.mjs <root> --remove <slug>
// Every write commits through lib.commit (lib/guidelines.mjs is the format). Hand edits are kept by save.
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const gl = await import(new URL("../../lib/guidelines.mjs", import.meta.url));
const args = process.argv.slice(2); const root = resolve(args[0] && !args[0].startsWith("--") ? args.shift() : ".");
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here (brain/admin.md missing)."); process.exit(1); }
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
const refuse = why => { console.error(why); process.exit(2); };
for (const flag of ["title", "applies-to", "body", "file", "status", "by", "update", "show", "remove"]) if (opt[flag] === true) refuse(`--${flag} needs a value`);
if (opt.file !== undefined) {
  if (opt.body !== undefined) refuse("pass --body or --file, not both");
  const path = resolve(String(opt.file)); if (!existsSync(path)) refuse(`${opt.file} does not exist. Drag the file from Finder into the chat to paste its path.`);
  if (!/\.(md|markdown|txt)$/i.test(path)) refuse(`${opt.file} is not a Markdown or text file. Put it in through gtm-os-add-file and pass its extracted text as --body.`);
  opt.body = readFileSync(path, "utf8");
}
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL("../../.codex-plugin/plugin.json", import.meta.url), "utf8")).version; } catch { return ""; } })();
const by = opt.by ? lib.teamHandle(root, String(opt.by)) : null; if (opt.by && !by) refuse(`"${opt.by}" is not in admin.md team`);
const line = g => `${g.title} [${g.status}] (${g.applies_to.join(", ")}) · ${g.path}${g.by ? ` · by ${g.by}` : ""}${g.updated ? ` · ${g.updated}` : ""}`;
const finish = (slug, verb, message) => {
  const c = lib.commit(root, [gl.guidelineRel(slug)], message);
  console.log(`${verb} guideline ${slug} (${c.note}). ${verb === "removed" ? "Nothing else changed." : `Codex reads ${gl.guidelineRel(slug)} before work it applies to, from the next chat on; in this chat, from now.`}`);
  lib.logActivity(root, "guideline", `${verb} ${slug}`); lib.rerender(root);
};

if (opt.create) {
  const title = String(opt.title || "").trim(), slug = gl.guidelineSlug(title), status = String(opt.status || "draft");
  const why = gl.validateGuideline({ slug, title, applies_to: opt["applies-to"], body: opt.body, status }); if (why) refuse(why);
  if (existsSync(gl.guidelinePath(root, slug))) refuse(`${slug} already exists (${gl.guidelineRel(slug)}); update it, or pick another title`);
  gl.writeGuideline(root, { slug, title, applies_to: opt["applies-to"], body: String(opt.body), status, by, version: VERSION });
  finish(slug, "created", `Added guideline ${slug}`); process.exit(0);
}
if (opt.update) {
  const slug = String(opt.update), current = gl.readGuideline(root, slug); if (!current) refuse(`no such guideline ${slug}; yours: ${gl.listGuidelines(root).map(g => g.slug).join(", ") || "none"}`);
  if (!["title", "applies-to", "body", "status"].some(k => opt[k] !== undefined)) refuse("nothing to change: pass --title, --applies-to, --body, --file or --status");
  const next = { slug, title: opt.title !== undefined ? String(opt.title).trim() : current.title, applies_to: opt["applies-to"] !== undefined ? opt["applies-to"] : current.applies_to, body: opt.body !== undefined ? String(opt.body) : current.body, status: opt.status !== undefined ? String(opt.status) : current.status, by: by || current.by, version: VERSION };
  const why = gl.validateGuideline(next); if (why) refuse(why);
  gl.writeGuideline(root, next);
  finish(slug, "updated", `Updated guideline ${slug}`); process.exit(0);
}
if (opt.remove) {
  const slug = String(opt.remove); if (!existsSync(gl.guidelinePath(root, slug))) refuse(`no such guideline ${slug}; yours: ${gl.listGuidelines(root).map(g => g.slug).join(", ") || "none"}`);
  rmSync(gl.guidelinePath(root, slug), { force: true });
  finish(slug, "removed", `Removed guideline ${slug}`); process.exit(0);
}
if (opt.show) {
  const g = gl.readGuideline(root, String(opt.show)); if (!g) refuse(`no such guideline ${opt.show}; yours: ${gl.listGuidelines(root).map(x => x.slug).join(", ") || "none"}`);
  console.log(`${line(g)}\n\n${g.body}`); process.exit(0);
}
if (opt.list) {
  const list = gl.listGuidelines(root);
  if (opt.json) { console.log(JSON.stringify(list.map(({ body, ...g }) => g), null, 1)); process.exit(0); }
  console.log(list.length ? list.map(line).join("\n") : `no guidelines yet. Say "add our tone of voice" (or design system, target customer definition): /gtm-os-guideline.`);
  process.exit(0);
}
console.error("usage: guideline.mjs <root> --create | --update <slug> | --list | --show <slug> | --remove <slug>"); process.exit(1);
