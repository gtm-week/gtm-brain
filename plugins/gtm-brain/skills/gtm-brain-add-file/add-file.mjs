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
//   node add-file.mjs <root> --file <path> --document design-system --page
//                                                       the file becomes the document's page (design-system.html
//                                                       beside the Markdown), replacing the one there
// The attachment itself is a remember call with asset; this script only lands the file.
// Big files (a recording, or over 25 MB) never land in the brain: without a flag they are refused with the
// big-files advice. The walk-through (skills/gtmb-use-brain/references/big-files.md) then runs:
//   node add-file.mjs <root> --file <path> --big       big_files: local copies it to the big-files folder outside
//                                                       git, checks the copy and prints its pointer; google-drive
//                                                       prints the Drive folder to place it in
//   node add-file.mjs <root> --drive <link or id> [--account <drive account>]
//                                                       the pointer for a file on Google Drive
// Both print { big: true, mode, pointer?, ... }: the pointer goes on the note's sources. The original is never touched.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, resolve, relative, isAbsolute, basename, extname } from "node:path";
import { execFileSync } from "node:child_process";
import * as lib from "../../lib/brain.mjs";
import * as docs from "../../lib/documents.mjs";
import { resolveEntity } from "../../lib/entities.mjs";
import { placeBigFile } from "../../lib/assets.mjs";

const MAX_BYTES = lib.LARGE_FILE_MB * 1024 * 1024;
const KINDS = [[/^\.(png|jpe?g|gif|webp|svg|heic)$/i, "image"], [/^\.pdf$/i, "pdf"], [/^\.(txt|md|csv|rtf|html?|docx?|odt|pptx?|xlsx?|key|pages|numbers)$/i, "document"]];
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? realpathSync(resolve(args.shift())) : realpathSync(".");
const fail = message => { console.error(message); process.exit(1); };
if (!lib.readAdmin(root)) fail("no brain here");
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const choice = () => { const c = lib.bigFilesChoice(root); return { asked: c.asked, choice: c.choice, setting: c.setting, approval: c.approval }; };
// A file already on Google Drive: its pointer, nothing else.
if (args.includes("--drive")) {
  const link = option("--drive"); if (!link || link.startsWith("--")) fail("usage: add-file.mjs <root> --drive <Drive link or file id> [--account <drive account>]");
  let pointer; try { pointer = lib.bigFilePointer("google-drive", { ref: link, account: option("--account") }); } catch (e) { fail(e.message); }
  console.log(JSON.stringify({ big: true, mode: "google-drive", drive_folder: lib.bigFilesDriveFolder(root), pointer, choice: choice() }));
  process.exit(0);
}
const given = args[args.indexOf("--file") + 1]; if (!args.includes("--file") || !given) fail("usage: add-file.mjs <root> --file <path>");
const source = resolve(given);
if (!existsSync(source)) fail(`${given} does not exist. Drag the file from Finder into the chat to paste its path.`);
if (statSync(source).isDirectory()) fail(`${given} is a folder. Add a file, not a folder.`);
const real = realpathSync(source); const bytes = statSync(real).size;
const recording = lib.isRecording(real);
if (args.includes("--big")) {
  const { mode } = lib.bigFiles(root), name = basename(real);
  if (mode === "local") {
    let placed; try { placed = placeBigFile(root, real); } catch (e) { fail(e.message); }
    console.log(JSON.stringify({ big: true, mode, name, bytes, recording, original: real, path: placed.path, copied: placed.copied, pointer: placed.pointer, choice: choice(),
      note: `${placed.copied ? "copied and checked" : "already in the big-files folder"}; the original stays where it was until the person says to delete it` }));
  } else console.log(JSON.stringify({ big: true, mode, name, bytes, recording, original: real, drive_folder: lib.bigFilesDriveFolder(root), choice: choice(),
    note: `place it in the Google Drive folder "${lib.bigFilesDriveFolder(root)}" with the Drive connector (or find it there), then run add-file.mjs --drive <its link> for the pointer` }));
  process.exit(0);
}
if (bytes > MAX_BYTES) fail(`${basename(given)} is ${(bytes / 1048576).toFixed(0)} MB, over ${lib.LARGE_FILE_MB} MB: too big for git, not kept. ${lib.bigFileAdvice(root)}`);
if (recording) fail(`${basename(given)} is a recording: recordings stay out of git, not kept. ${lib.bigFileAdvice(root)}`);
const within = (base, path) => { const r = relative(base, path); return r !== "" && !isAbsolute(r) && !r.startsWith("..") ; };
const kind = (KINDS.find(([re]) => re.test(extname(real))) || [null, "other"])[1];

// the owner, when named: a document (its files folder) or an entity (beside its file)
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const wantDoc = flag("--document"), wantEntity = flag("--entity");
if (wantDoc !== undefined && wantEntity !== undefined) fail("pass --document or --entity, not both");
let owner = null;
// --page: the file becomes the document's own page, <slug>.html beside the Markdown (the design system's is what the
// dashboard shows on its Visual tab). The one writer of that page: it replaces the page that is there, refuses one
// that would need the network or a script (lib/documents.mjs pageProblems), and commits like any other write, so
// on layout 3 someone other than the owner gets a proposal.
if (args.includes("--page")) {
  if (wantDoc === undefined) fail("--page needs --document <ref>: the document whose page this is");
  let doc; try { doc = docs.readDocument(root, wantDoc); } catch (e) { fail(e.message); }
  if (!doc) fail(`no such document ${wantDoc}; yours: ${docs.listDocuments(root).map(d => d.path).join(", ") || "none"}`);
  if (!docs.PAGE_DOCS.includes(doc.slug)) fail(`${doc.path} has no page: only ${docs.PAGE_DOCS.join(", ")} does`);
  if (!/^\.html?$/i.test(extname(real))) fail(`${basename(given)} is not an HTML file`);
  const html = readFileSync(real, "utf8"), problems = docs.pageProblems(html);
  if (docs.isStarterPage(html)) problems.push("it still carries the starter's meta tag (gtm-brain-starter): remove it from a page written for the company");
  if (problems.length) fail(`${basename(given)} cannot be the page: ${problems.join("; ")}. The page is one self-contained file: inline CSS, inline SVG or data: images, fonts by name.`);
  const page = docs.documentPage(root, doc), target = join(root, page.path);
  if (page.exists && readFileSync(target, "utf8") === html) { console.log(JSON.stringify({ base: "brain", path: page.path, page: true, copied: false, kind: "document", bytes, owner: { kind: "document", ref: doc.path }, note: "already the page" })); process.exit(0); }
  const before = page.exists ? readFileSync(target) : null;
  writeFileSync(target, html);
  const kept = lib.commit(root, [page.path], `page: ${page.path}`);
  if (kept.proposal) { console.log(JSON.stringify({ base: "brain", path: page.path, page: true, copied: false, proposal: kept.proposal.id, note: kept.note })); process.exit(0); }
  console.log(JSON.stringify({ base: "brain", path: page.path, page: true, copied: true, replaced: !!before, kind: "document", bytes, owner: { kind: "document", ref: doc.path } }));
  process.exit(0);
}
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
  if (!e || !e._path) fail(`${wantEntity} is not a known entity; register it with add_name first`);
  owner = { kind: "entity", ref: e._path, dir: e._path.replace(/\.md$/, "") };
}

// where it lands
let base = "brain", project, path, copied = false, note;
const linked = lib.readProjects(root).find(p => { try { return lib.projectPointerStatus(root, p) === "ok" && within(realpathSync(p.path), real); } catch { return false; } });
// work/ is this computer's scratch and is not shared: a file there is landed beside its owner like one from outside.
if (within(root, real) && !within(join(root, "work"), real)) { path = relative(root, real); note = "already in the brain"; }
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
  else { copyFileSync(real, join(root, path)); copied = true; const mv = owner?.moved; const kept = lib.commit(root, mv ? [path, mv.from, mv.to] : [path], mv ? `file: ${name}; ${mv.from} -> ${mv.to}` : `file: ${name}`);
    // layout 3, someone other than the owner: the file waits in a proposal and nothing is under about-us/; say only that
    if (kept.proposal) { console.log(JSON.stringify({ base, path, copied: false, proposal: kept.proposal.id, note: kept.note })); process.exit(0); } }
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
