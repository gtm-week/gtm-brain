#!/usr/bin/env node
// add-file: put one file into the brain (ALL-205).
//   node add-file.mjs <root> --file <path>
//   node add-file.mjs <root> --file <path> [--document <ref> | --entity <name>]
// A file from outside the brain and its linked projects lands beside its owner and is committed, so it
// travels with the brain: --document <ref> puts it in the document's files folder, --entity <name> in
// brain/entities/<id>/. Without an owner it is refused; nothing lands in the brain unasked (0.27.0
// retired the files/<yyyy-mm>/ fallback). A file already inside the brain or a linked project
// is referenced where it is: nothing is moved, nothing is overwritten. For a PDF or a document
// the text is extracted into work/files/ (derived, outside git) so the notes can be written from
// it. Prints one JSON object: { base, path, project?, copied, kind, bytes, text, note? }.
// The attachment itself is a remember call with asset; this script only lands the file.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, resolve, relative, isAbsolute, basename, extname } from "node:path";
import { execFileSync } from "node:child_process";
import * as lib from "../../lib/brain.mjs";
import * as docs from "../../lib/documents.mjs";
import { resolveEntity } from "../../lib/entities.mjs";

const MAX_BYTES = 25 * 1024 * 1024;
const KINDS = [[/^\.(png|jpe?g|gif|webp|svg|heic)$/i, "image"], [/^\.pdf$/i, "pdf"], [/^\.(txt|md|csv|rtf|html?|docx?|odt|pptx?|xlsx?|key|pages|numbers)$/i, "document"]];
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? realpathSync(resolve(args.shift())) : realpathSync(".");
const fail = message => { console.error(message); process.exit(1); };
if (!lib.readAdmin(root)) fail("no brain here");
const given = args[args.indexOf("--file") + 1]; if (!args.includes("--file") || !given) fail("usage: add-file.mjs <root> --file <path>");
const source = resolve(given);
if (!existsSync(source)) fail(`${given} does not exist. Drag the file from Finder into the chat to paste its path.`);
if (statSync(source).isDirectory()) fail(`${given} is a folder. Add a file, not a folder.`);
const real = realpathSync(source); const bytes = statSync(real).size;
if (bytes > MAX_BYTES) fail(`${basename(given)} is ${(bytes / 1048576).toFixed(0)} MB, over 25 MB. Keep it in a project folder and reference it there.`);
const within = (base, path) => { const r = relative(base, path); return r !== "" && !isAbsolute(r) && !r.startsWith("..") ; };
const kind = (KINDS.find(([re]) => re.test(extname(real))) || [null, "other"])[1];

// the owner, when named: a document (its files folder) or an entity (beside its file)
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const wantDoc = flag("--document"), wantEntity = flag("--entity");
if (wantDoc !== undefined && wantEntity !== undefined) fail("pass --document or --entity, not both");
let owner = null;
if (wantDoc !== undefined) {
  let doc; try { doc = docs.readDocument(root, wantDoc); } catch (e) { fail(e.message); }
  if (!doc) fail(`no such document ${wantDoc}; yours: ${docs.listDocuments(root).map(d => d.path).join(", ") || "none"}`);
  // the first file moves the document into a folder of its own name, so a document with files is one thing in Finder
  const moved = docs.moveIntoFolder(root, doc);
  if (moved) { doc = docs.readDocument(root, moved.to); owner = { kind: "document", ref: doc.path, dir: doc.folder, moved }; }
  else owner = { kind: "document", ref: doc.path, dir: docs.landingDir(root, doc) };
}
if (wantEntity !== undefined) {
  const e = resolveEntity(lib.readNames(root), wantEntity);
  if (!e || !e._path) fail(`${wantEntity} is not a known person, organization or product; register it with add_name first`);
  owner = { kind: "entity", ref: e._path, dir: e._path.replace(/\.md$/, "") };
}

// where it lands
let base = "brain", project, path, copied = false, note;
const linked = lib.readProjects(root).find(p => { try { return lib.projectPointerStatus(root, p) === "ok" && within(realpathSync(p.path), real); } catch { return false; } });
if (within(root, real)) { path = relative(root, real); note = "already in the brain"; }
else if (linked) { base = "project"; project = linked.slug; path = relative(realpathSync(linked.path), real); note = `already in project ${linked.slug}`; }
else {
  // Nothing lands in the brain unasked: a file from outside needs the document or the entity it belongs to.
  if (!owner) fail(`Say what ${basename(given)} belongs to: --document <ref> for a document (the strategy, the design system), --entity "<name>" for a person, company or product. Nothing lands in the brain without an owner.`);
  const folder = owner.dir; mkdirSync(join(root, folder), { recursive: true });
  const ext = extname(real), stem = basename(real, ext), same = p => existsSync(p) && statSync(p).size === bytes && readFileSync(p).equals(readFileSync(real));
  let name = `${stem}${ext}`, n = 1;
  while (existsSync(join(root, folder, name)) && !same(join(root, folder, name))) name = `${stem}-${++n}${ext}`;
  path = join(folder, name);
  if (same(join(root, path))) note = "already in the brain";
  else { copyFileSync(real, join(root, path)); copied = true; const mv = owner?.moved; lib.commit(root, mv ? [path, mv.from, mv.to] : [path], mv ? `file: ${name}; ${mv.from} -> ${mv.to}` : `file: ${name}`); }
}

// what it says, for the notes: derived text under work/, never in git
let text = null;
const stored = base === "project" ? join(realpathSync(linked.path), path) : join(root, path);
if (kind === "document" || kind === "pdf") {
  const out = join(root, "work", "files", `${basename(path)}.txt`); mkdirSync(join(root, "work", "files"), { recursive: true });
  const has = cmd => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };
  const attempt = (cmd, cmdArgs) => { try { execFileSync(cmd, cmdArgs, { stdio: ["ignore", "ignore", "ignore"], timeout: 30000 }); return existsSync(out) && statSync(out).size > 0; } catch { return false; } };
  const plain = /^\.(txt|md|csv)$/i.test(extname(real));
  let ok = false;
  if (plain) { writeFileSync(out, readFileSync(real)); ok = true; }
  else if (kind === "pdf") ok = has("pdftotext") ? attempt("pdftotext", ["-layout", stored, out]) : false, note = ok ? note : `${note ? note + "; " : ""}${has("pdftotext") ? "could not extract text from the PDF" : "no text extractor for PDF (brew install poppler)"}`;
  else ok = has("textutil") ? attempt("textutil", ["-convert", "txt", "-output", out, stored]) : false, note = ok ? note : `${note ? note + "; " : ""}could not extract text from this document`;
  if (ok) text = out;
}
const { moved, ...ownerOut } = owner || {};
console.log(JSON.stringify({ base, path, ...(project ? { project } : {}), copied, kind, bytes, text, ...(owner ? { owner: ownerOut } : {}), ...(moved ? { moved } : {}), ...(note ? { note } : {}) }));
