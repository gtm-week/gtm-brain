#!/usr/bin/env node
// Documents: the Markdown the work must follow, kept at the brain root (lib/documents.mjs is the format).
//   node document.mjs <root> --create --title T --applies-to "copy, posts" (--body B | --file path.md) [--folder brand] [--status approved] [--by handle]
//   --file: a Markdown or text file the person prepared becomes the body as it is; one already at the root is adopted in place
//   node document.mjs <root> --update <ref> [--title T] [--applies-to "..."] [--body B | --append "## Section"] [--file path] [--status s] [--by handle]
//   node document.mjs <root> --prepare (--title T | --file pricing.md)   starts a base file: overlap, starter, the brain's notes, the one question
//   node document.mjs <root> --list [--json]      --show <ref>      --files <ref>      --remove <ref>
//   --preview on create or update: what would be written; nothing is written
// <ref> is a slug (voice) or a path (brand/voice). Every write commits through lib.commit. Hand edits are kept by save.
// A file adopted in place, and an update of fields only, keep the person's text byte for byte.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const docs = await import(new URL("../../lib/documents.mjs", import.meta.url));
const args = process.argv.slice(2); const root = realpathSync(resolve(args[0] && !args[0].startsWith("--") ? args.shift() : "."));
if (!lib.isBrain(root)) { console.error("no brain here (brain/admin.md missing)."); process.exit(1); }
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
const refuse = why => { console.error(why); process.exit(2); };
for (const flag of ["title", "applies-to", "body", "append", "file", "folder", "status", "by", "update", "show", "files", "remove"]) if (opt[flag] === true) refuse(`--${flag} needs a value`);
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL("../../.codex-plugin/plugin.json", import.meta.url), "utf8")).version; } catch { return ""; } })();
const by = opt.by ? lib.teamHandle(root, String(opt.by)) : null; if (opt.by && !by) refuse(`"${opt.by}" is not in admin.md team`);
const yours = () => docs.listDocuments(root).map(d => d.slug).join(", ") || "none";
const find = ref => { try { return docs.readDocument(root, ref); } catch (e) { refuse(e.message); } };
const line = (d, changed = d.updated) => `${d.title} [${d.state}] (${d.applies_to.join(", ")}) · ${d.path}${d.by ? ` · by ${d.by}` : ""}${changed ? ` · changed ${changed}` : ""}`;
const inside = abs => { const r = relative(root, abs); return r && !isAbsolute(r) && !r.startsWith(".."); };

// --file: the body as it is; a Markdown already at the root (depth 0-2, outside the engine and the projects) is
// adopted where it lies, keeping its name, its own frontmatter keys and every byte of its text. The engine's files and a project's are refused.
let adopt = null, extra = {};
if (opt.file !== undefined) {
  if (opt.body !== undefined) refuse("pass --body or --file, not both");
  const abs = resolve(String(opt.file));   // relative to the caller's cwd, which the server sets to the brain
  if (!existsSync(abs)) refuse(`${opt.file} does not exist. Drag the file from Finder into the chat to paste its path.`);
  if (!/\.(md|markdown|txt)$/i.test(abs)) refuse(`${opt.file} is not a Markdown or text file. Put it in with "add this file to <document>" instead.`);
  const real = realpathSync(abs), parsed = lib.parseFrontmatter(readFileSync(abs, "utf8"));
  opt.body = parsed.body; extra = parsed.fm || {};
  if (inside(real)) {
    const rel = relative(root, real).split("/");
    if (docs.SKIP_DIRS.has(rel[0]) || lib.engineDirs(root).includes(rel[0])) refuse(`${relative(root, real)} is one of the brain's own files; a document is something the person wrote, at the root or in a folder of theirs`);
    if (docs.projectDirs(root).has(rel[0])) refuse(`${relative(root, real)} is inside the linked project ${rel[0]}; a document lives at the brain root or in a folder of its own, not in a project`);
    if (abs.endsWith(".md") && rel.length <= docs.MAX_DEPTH + 1) adopt = relative(root, real);
  }
}
const finish = (doc, verb, message) => {
  const paths = [doc.path]; if (verb === "removed" && doc.folder) paths.push(doc.folder);
  // a document that now has a folder of its own name beside it moves in, in the same commit (one thing in Finder)
  const moves = verb === "removed" ? [] : docs.consolidateDocuments(root);
  for (const m of moves) paths.push(m.from, m.to);
  const c = lib.commit(root, paths, moves.length ? `${message}; ${moves.map(m => `${m.from} -> ${m.to}`).join(", ")}` : message);
  // layout 3, someone other than the owner: the change is a proposal and the file is as it was; say only that
  if (c.proposal) { console.log(c.note); lib.rerender(root); return; }
  console.log(`${verb} document ${doc.path} [${doc.state}] (${c.note}). ${verb === "removed" ? "Nothing else changed." : `Codex reads ${doc.path} before work it applies to (${doc.applies_to.join(", ")}), from the next chat on; in this chat, from now.`}`);
  for (const m of moves) console.log(`moved ${m.from} into ${m.to.slice(0, m.to.lastIndexOf("/") + 1)} (now ${m.to}), so the document and its folder are one thing.`);
  lib.logActivity(root, "document", `${verb} ${doc.path}`); lib.rerender(root);
};

// --base yes|no: whether the document is a base file (what the company's work must follow), kept as base: in its header
let baseSet = false;
if (opt.base !== undefined) {
  if (!/^(yes|no|true|false)$/i.test(String(opt.base))) refuse("--base takes yes or no");
  extra = { ...extra, base: /^(yes|true)$/i.test(String(opt.base)) ? "true" : "false" }; baseSet = true;
}
if (opt.prepare) {
  if (opt.title === undefined && !adopt) refuse("--prepare needs --title (the subject: Pricing, Positioning, Competitors) or --file (a Markdown at the brain root)");
  if (adopt && docs.parseDocument(root, adopt)) refuse(`${adopt} is already a document; update it instead`);
  const { prepare } = await import(new URL("./prepare.mjs", import.meta.url));
  console.log(prepare(root, { title: opt.title !== undefined ? String(opt.title).trim() : null, file: adopt, version: VERSION, by }));
  process.exit(0);
}
if (opt.create) {
  const title = String(opt.title || "").trim(), slug = docs.documentSlug(title), status = String(opt.status || "draft"), folder = String(opt.folder || (adopt ? "" : lib.baseDir(root)));   // layout 3: a new base file goes in about-us/
  // An adopted file keeps its own name and folder; only a new file is held to the naming rules.
  const why = docs.validateDocument(adopt ? { title, applies_to: opt["applies-to"], body: opt.body, status } : { slug, title, applies_to: opt["applies-to"], body: opt.body, status, folder, root }); if (why) refuse(why);
  if (adopt && docs.parseDocument(root, adopt)) refuse(`${adopt} is already a document; update it instead`);
  if (adopt && opt.folder !== undefined && adopt !== docs.documentPathFor(slug, folder)) refuse(`${adopt} stays where it is when adopted; leave out --folder`);
  const path = adopt || docs.documentPathFor(slug, folder);
  if (!adopt && existsSync(join(root, path))) refuse(`${path} already exists; pass it as --file to adopt it, or pick another title or folder`);
  const fields = { title, applies_to: opt["applies-to"], status, by, version: VERSION };
  if (adopt) {
    // adopted where it lies: only the frontmatter is added above the person's text, which stays byte for byte
    if (opt.preview) { const p = docs.writeFields(root, adopt, fields, { preview: true }); console.log(`Adopting ${adopt} adds only this frontmatter above its text; the text stays as it is (${p.text.split("\n").length} lines):\n\n${p.frontmatter}\nNothing written yet.`); process.exit(0); }
    docs.writeFields(root, adopt, baseSet ? { ...fields, extra: { base: extra.base } } : fields);
  } else {
    if (opt.preview) { console.log(`Would write ${path}:\n\n${docs.renderDocument({ ...fields, body: String(opt.body), extra })}\nNothing written yet.`); process.exit(0); }
    docs.writeDocument(root, { path, ...fields, body: String(opt.body), extra });
  }
  finish(docs.parseDocument(root, path), "created", `Added document ${path}`); process.exit(0);
}
if (opt.update) {
  const current = find(String(opt.update)); if (!current) refuse(`no such document ${opt.update}; yours: ${yours()}`);
  if (!["title", "applies-to", "body", "append", "status", "base"].some(k => opt[k] !== undefined)) refuse("nothing to change: pass --title, --applies-to, --body, --append, --file, --status or --base");
  if (opt.append !== undefined && opt.body !== undefined) refuse("pass --body or --append, not both: --append adds a section at the end and keeps the rest");
  if (opt.append !== undefined && !String(opt.append).trim()) refuse("--append needs the section's text");
  const next = { path: current.path, title: opt.title !== undefined ? String(opt.title).trim() : current.title, applies_to: opt["applies-to"] !== undefined ? opt["applies-to"] : current.applies_to, body: opt.body !== undefined ? String(opt.body) : current.body, status: opt.status !== undefined ? String(opt.status) : current.status, by: by || current.by, version: VERSION, extra: { ...current.extra, ...extra } };
  // a workflow that is active or paused keeps that through an edit of its text; only workflow activate, pause and
  // resume change it (activate runs the check), so --status never sets it here
  const switched = current.extra?.type === "workflow" && ["active", "paused"].includes(current.status) && opt.status === undefined;
  const checked = switched ? { ...next, status: "draft" } : next;
  const why = docs.validateDocument(opt.append !== undefined ? { ...checked, body: `${current.body}\n\n${opt.append}` } : checked); if (why) refuse(why);   // content only: the name and folder are already the person's
  if (opt.preview) {
    console.log(opt.append !== undefined ? `Would add at the end of ${current.path}, keeping everything above it:\n\n${String(opt.append).trim()}\n\nNothing written yet.`
      : opt.body === undefined ? `Would change only the frontmatter of ${current.path}; its text stays as it is:\n\n${docs.writeFields(root, current.path, next, { preview: true }).frontmatter}\nNothing written yet.`
      : `Would write ${current.path}:\n\n${docs.renderDocument(next)}\nNothing written yet.`);
    process.exit(0);
  }
  if (opt.append !== undefined) docs.appendSection(root, current, opt.append, next);
  else if (opt.body === undefined) docs.writeFields(root, current.path, next);   // fields only: the text below stays byte for byte
  else docs.writeDocument(root, next);
  finish(docs.parseDocument(root, current.path), "updated", `Updated document ${current.path}${opt.append !== undefined ? " (a section added)" : ""}`); process.exit(0);
}
if (opt.remove) {
  const doc = find(String(opt.remove)); if (!doc) refuse(`no such document ${opt.remove}; yours: ${yours()}`);
  docs.removeDocument(root, doc);
  finish(doc, "removed", `Removed document ${doc.path}`); process.exit(0);
}
if (opt.show) {
  const doc = find(String(opt.show)); if (!doc) refuse(`no such document ${opt.show}; yours: ${yours()}`);
  console.log(`${line(doc)}\n\n${doc.body}`); process.exit(0);
}
if (opt.files) {
  const doc = find(String(opt.files)); if (!doc) refuse(`no such document ${opt.files}; yours: ${yours()}`);
  const files = docs.documentFiles(root, doc); console.log(files.length ? files.join("\n") : `no files yet; they go in ${docs.landingDir(root, doc)}/`); process.exit(0);
}
if (opt.list) {
  const all = docs.listDocuments(root), changed = docs.lastChanged(root, all.map(d => d.path)), loose = docs.unadoptedFiles(root);
  if (opt.json) { console.log(JSON.stringify(all.map(({ body, ...d }) => ({ ...d, changed: changed[d.path] || d.updated, files: docs.documentFiles(root, d, all).length })), null, 1)); process.exit(0); }
  console.log(all.length ? all.map(d => line(d, changed[d.path] || d.updated)).join("\n") : `no documents yet. Say "add our tone of voice", or "add strategy.md as a document".`);
  if (loose.length) console.log(`\nNot used yet: ${docs.unadoptedText(loose)}. Offer once to adopt it: ask what work it governs (prepare with file gives the choices and the frontmatter it gains); its text is never changed.`);
  process.exit(0);
}
console.error("usage: document.mjs <root> --create | --update <ref> | --prepare | --list | --show <ref> | --files <ref> | --remove <ref>"); process.exit(1);
