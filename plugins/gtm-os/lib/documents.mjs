// Documents: the Markdown the person keeps at the brain root and the work must follow (a strategy, a tone
// of voice, a design system, pricing). Replaces brain/guidelines (0.27.0). One Markdown file is the document;
// its files, if any, live in a folder of the same name beside it, or around it when it is alone in its folder.
// A frontmatter marker (kind: document) tells a document from any other Markdown a person keeps there; the
// scan never writes. The rulebook's rule 11 makes Codex read the matching one before that kind of work; the
// session hook and the status read list them every chat (documentsLine). This file is the format; the script,
// the server, the hook, add-file and save go through it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, rmdirSync, renameSync } from "node:fs";
import { join, dirname, basename, relative, sep } from "node:path";
import { handleFor, parseFrontmatter, renderFrontmatter, readProjects } from "./brain.mjs";

export const KIND = "document";
export const STATUSES = ["draft", "approved"];
export const APPLIES_MAX = 12;
export const BODY_MAX = 64 * 1024;
export const MAX_DEPTH = 2;
export const HEADER_LINE = "Made with GTM OS. This document lives in the brain folder and travels with it.";
// What the course expects first; said by the hook while there are none.
export const SUGGESTED = ["strategy", "tone of voice", "design system", "target customer definition", "pricing"];
// The engine and the machine's own folders: never a document's home.
export const SKIP_DIRS = new Set(["brain", "work", "files", ".agents", ".githooks", ".git", ".obsidian", ".codex", "node_modules"]);
const ROOT_KEEP = new Set(["AGENTS.md", "README.md"]);
const posix = p => p.split(sep).join("/");
const FOLDER = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?$/;

export const documentSlug = title => handleFor(String(title || ""));
export const documentPathFor = (slug, folder = "") => { const f = String(folder || "").replace(/^\/+|\/+$/g, ""); return f ? `${f}/${slug}.md` : `${slug}.md`; };

/* "copy, outreach, landing pages" or an array: lowercase, trimmed, distinct, in the order given. */
export function normalizeAppliesTo(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  return [...new Set(items.map(s => String(s).trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];
}

/* Content rules always; naming rules (slug, folder) only when a slug is passed, which is creation. An adopted
   file keeps the name and folder the person gave it. With a root, a linked project's folder is refused too. */
export function validateDocument({ slug, title, applies_to, body, status, folder = "", root = null }) {
  if (!String(title || "").trim()) return "a title is needed (Strategy, Tone of voice, Design system, Pricing)";
  if (slug !== undefined) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || "")) return `the title must give a slug of lowercase letters, digits and hyphens; got ${slug || "(nothing)"}`;
    if (slug.length > 64) return `${slug} is longer than 64 characters`;
    const f = String(folder || "").replace(/^\/+|\/+$/g, "");
    if (f && (!FOLDER.test(f) || SKIP_DIRS.has(f.split("/")[0]))) return `folder must be one or two lowercase names outside the brain's own folders (brand, market/battle-cards); got ${f}`;
    if (f && root && projectDirs(root).has(f.split("/")[0])) return `${f.split("/")[0]} is a linked project folder; a document lives at the brain root or in a folder of its own`;
  }
  const applies = normalizeAppliesTo(applies_to);
  if (!applies.length) return "applies_to is needed: the kinds of work this document governs (copy, outreach, landing pages, proposals, planning)";
  if (applies.length > APPLIES_MAX) return `applies_to lists ${applies.length} kinds of work; at most ${APPLIES_MAX}`;
  if (applies.some(a => a.length > 40)) return "each applies_to entry is at most 40 characters";
  if (!String(body || "").trim()) return "a body is needed: the document itself, in the person's language";
  if (Buffer.byteLength(String(body), "utf8") > BODY_MAX) return `the body is over ${BODY_MAX / 1024} KB; it is read in full before the work, keep it shorter or split it`;
  if (!STATUSES.includes(status)) return `status must be ${STATUSES.join(" or ")}; got ${status}`;
  return null;
}

const DOCUMENT_KEYS = new Set(["kind", "title", "applies_to", "status", "by", "updated", "gtm-os"]);
/* extra: frontmatter keys of the person's own (Obsidian tags, aliases) kept next to the document's fields. */
export function renderDocument({ title, applies_to, status, by, updated, version, body, extra = {} }) {
  const own = Object.fromEntries(Object.entries(extra || {}).filter(([k]) => !DOCUMENT_KEYS.has(k)));
  const fm = { kind: KIND, title: String(title).trim(), applies_to: normalizeAppliesTo(applies_to), status, by: by || "", updated: updated || new Date().toISOString().slice(0, 10), "gtm-os": version || "", ...own };
  const text = String(body).replace(/\r\n/g, "\n").trim();
  // Heading, then the header line once, then the text; a body that carries its own heading (a prepared
  // strategy.md) keeps it, and a body read back keeps its header line where it is.
  let head = `# ${fm.title}`, rest = text;
  if (text.startsWith("# ")) { const nl = text.indexOf("\n"); head = nl < 0 ? text : text.slice(0, nl); rest = nl < 0 ? "" : text.slice(nl + 1).trim(); }
  const header = rest.includes(HEADER_LINE) ? "" : `${HEADER_LINE}\n\n`;
  return `${renderFrontmatter(fm)}\n${head}\n\n${header}${rest}\n`;
}

/* The first folder of every linked project that sits inside the root: a project is a project, never a document's home. */
export function projectDirs(root) {
  return new Set(readProjects(root).map(p => { const r = posix(relative(root, p.path || "")); return r && !r.startsWith("..") && !r.startsWith("/") ? r.split("/")[0] : null; }).filter(Boolean));
}

/* Every Markdown file at the root and up to MAX_DEPTH folders down, outside the engine, the projects and dotfolders. */
export function markdownFiles(root) {
  const skip = new Set([...SKIP_DIRS, ...projectDirs(root)]); const out = [];
  const walk = (dir, depth) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith(".")) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) { if (depth === 0 && skip.has(e.name)) continue; if (depth < MAX_DEPTH) walk(path, depth + 1); }
      else if (e.isFile() && e.name.endsWith(".md") && !(depth === 0 && ROOT_KEEP.has(e.name))) out.push(posix(relative(root, path)));
    }
  };
  walk(root, 0); return out.sort();
}

export function parseDocument(root, path) {
  const abs = join(root, path); if (!existsSync(abs)) return null;
  const { fm, body } = parseFrontmatter(readFileSync(abs, "utf8"));
  if (fm.kind !== KIND) return null;
  const slug = basename(path, ".md"), dir = posix(dirname(path));
  const extra = Object.fromEntries(Object.entries(fm).filter(([k]) => !DOCUMENT_KEYS.has(k)));
  return { slug, path: posix(path), folder: dir === "." ? "" : dir, title: String(fm.title || slug), applies_to: normalizeAppliesTo(fm.applies_to), status: STATUSES.includes(fm.status) ? fm.status : "draft", by: fm.by ? String(fm.by) : null, updated: fm.updated ? String(fm.updated) : null, version: fm["gtm-os"] ? String(fm["gtm-os"]) : null, body: body.trim(), bytes: Buffer.byteLength(body, "utf8"), extra };
}

export function listDocuments(root) { return markdownFiles(root).map(p => parseDocument(root, p)).filter(Boolean); }

/* A slug ("voice") or a path ("brand/voice", "brand/voice.md"). Two documents with one slug need the path. */
export function readDocument(root, ref) {
  const all = listDocuments(root), r = String(ref || "").trim().replace(/^\/+/, "").replace(/\.md$/, "");
  if (!r) return null;
  const byPath = all.find(d => d.path === `${r}.md`); if (byPath) return byPath;
  const bySlug = all.filter(d => d.slug === r);
  if (bySlug.length > 1) throw new Error(`${r} names ${bySlug.length} documents (${bySlug.map(d => d.path).join(", ")}); use the path`);
  return bySlug[0] || null;
}

export const filesDir = doc => doc.folder ? `${doc.folder}/${doc.slug}` : doc.slug;
export const isAlone = (doc, all) => Boolean(doc.folder) && all.filter(d => d.folder === doc.folder).length === 1;
/* Where the next file for this document goes: around it when it is alone in its folder, else in the folder of its name. */
export function landingDir(root, doc, all = listDocuments(root)) { return isAlone(doc, all) ? doc.folder : filesDir(doc); }

export function documentFiles(root, doc, all = listDocuments(root)) {
  const files = [];
  const listing = (dir, prefix) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; if (e.isFile()) files.push(`${prefix}${e.name}`); else if (e.isDirectory()) listing(join(dir, e.name), `${prefix}${e.name}/`); } };
  const own = filesDir(doc); if (existsSync(join(root, own))) listing(join(root, own), `${own}/`);
  if (isAlone(doc, all)) for (const e of readdirSync(join(root, doc.folder), { withFileTypes: true })) if (e.isFile() && !e.name.startsWith(".") && !e.name.endsWith(".md")) files.push(`${doc.folder}/${e.name}`);
  return files.sort();
}

/* A document inside a folder of its own name (design-system/design-system.md) is one thing in Finder. */
export const inOwnFolder = doc => Boolean(doc.folder) && basename(doc.folder) === doc.slug;
/* The first file makes the document move into a folder of its own name, beside its files: strategy.md becomes
   strategy/strategy.md, brand/design-system.md becomes brand/design-system/design-system.md. A document already
   there stays. Returns { from, to } or null; the caller commits both paths (git sees a rename). */
export function moveIntoFolder(root, doc) {
  if (inOwnFolder(doc)) return null;
  const to = `${filesDir(doc)}/${doc.slug}.md`;
  if (existsSync(join(root, to))) return null;   // a document of that name already lives there: leave both alone
  mkdirSync(join(root, filesDir(doc)), { recursive: true });
  renameSync(join(root, doc.path), join(root, to));
  return { from: doc.path, to };
}

export function writeDocument(root, d) {
  const path = posix(d.path); mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), renderDocument(d));
  return path;
}

export function removeDocument(root, doc) {
  rmSync(join(root, doc.path), { force: true });
  try { if (doc.folder && !readdirSync(join(root, doc.folder)).length) rmdirSync(join(root, doc.folder)); } catch {}
}

/* What save commits for documents: every Markdown a person keeps at the root (marked or not yet), each
   document's files folder, and every folder that holds a document (its loose files travel with it). */
export function savePaths(root) {
  const out = new Set(markdownFiles(root));
  for (const d of listDocuments(root)) { if (existsSync(join(root, filesDir(d)))) out.add(filesDir(d)); if (d.folder) out.add(d.folder); }
  return [...out];
}

/* Folders at the top GTM OS does not use: not the engine's, not a project's, not a document's home. A brain
   migrated from an older layout brings company/, assets/, output/; nothing here touches them, the hint names them. */
export function strayFolders(root) {
  const skip = new Set([...SKIP_DIRS, ...projectDirs(root)]), homes = new Set(listDocuments(root).map(d => d.folder.split("/")[0]).filter(Boolean));
  let entries; try { entries = readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries.filter(e => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name) && !homes.has(e.name)).map(e => e.name).sort();
}

/* The session line for them, said once per set: the set is remembered in work/ and the line returns only when it changes. */
export function strayFoldersHint(root) {
  const stray = strayFolders(root), memo = join(root, "work", "stray-folders.json");
  let seen = []; try { seen = JSON.parse(readFileSync(memo, "utf8")).folders || []; } catch {}
  if (JSON.stringify(stray) === JSON.stringify(seen)) return "";
  try { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(memo, JSON.stringify({ folders: stray, at: new Date().toISOString() })); } catch {}
  if (!stray.length) return "";
  // the adopt example names a folder that actually holds Markdown, when one does
  const holdsMarkdown = f => { try { return readdirSync(join(root, f), { recursive: true }).some(p => String(p).endsWith(".md")); } catch { return false; } };
  const first = stray.find(holdsMarkdown) || stray[0];
  return `Folders at the top GTM OS does not use: ${stray.map(f => `${f}/`).join(", ")}. Say it once, in one line, and do nothing to them: a Markdown in them can become a document where it lies (say: adopt the documents in ${first}/), files belong beside a document or a person, company or product (add this to ...), and the rest can go. Their content is the person's; never move or delete it unasked.`;
}

/* 0.27.0: brain/guidelines/<slug>.md becomes <slug>.md at the root, content kept, marker added. A root file
   with that name already there is the person's; the old guideline stays put and is reported. */
export function migrateGuidelines(root) {
  const dir = join(root, "brain", "guidelines"), moved = [], kept = [];
  if (!existsSync(dir)) return { moved, kept };
  for (const name of readdirSync(dir).filter(f => f.endsWith(".md") && !f.startsWith(".")).sort()) {
    const from = `brain/guidelines/${name}`, to = name;
    if (existsSync(join(root, to))) { kept.push([from, `${to} already exists at the root`]); continue; }
    const { fm, body } = parseFrontmatter(readFileSync(join(dir, name), "utf8"));
    const text = body.replace("Made with GTM OS. This guideline lives in the brain's guidelines folder and travels with the brain.", HEADER_LINE);
    writeDocument(root, { path: to, title: fm.title || basename(name, ".md"), applies_to: fm.applies_to || "all work", status: STATUSES.includes(fm.status) ? fm.status : "draft", by: fm.by, updated: fm.updated, version: fm["gtm-os"], body: text });
    rmSync(join(dir, name)); moved.push([from, to]);
  }
  try { if (!readdirSync(dir).length) rmdirSync(dir); } catch {}
  return { moved, kept };
}

/* The one line every chat reads: the session hook (brain and linked project) and query (status).
   With an absolute root the paths are absolute, for a chat in a linked folder. */
export function documentsLine(root, { absolute = false } = {}) {
  const all = listDocuments(root), where = p => absolute ? join(root, p) : p;
  // Guidelines of a brain not yet upgraded (0.26 and earlier) still govern the work until the upgrade moves them.
  const oldDir = join(root, "brain", "guidelines");
  const old = existsSync(oldDir) ? readdirSync(oldDir).filter(f => f.endsWith(".md") && !f.startsWith(".")).sort().map(f => `brain/guidelines/${f}`) : [];
  const legacy = old.length ? ` Older guidelines not moved yet, read them the same way: ${old.map(where).join(", ")}; the upgrade (say: refresh the rules) moves them to the root.` : "";
  if (!all.length) return `documents: none yet. A document is something we wrote that the work must follow (${SUGGESTED.join(", ")}); say "add our tone of voice", "add strategy.md as a document" or /gtm-os-document.${legacy}`;
  const items = all.map(d => { const n = documentFiles(root, d, all).length; return `${d.title} [${d.status}] (${d.applies_to.join(", ")}) -> ${where(d.path)}${n ? ` (${n} file${n === 1 ? "" : "s"})` : ""}`; }).join("  ·  ");
  return `documents: ${items}. Before work of a listed kind, read that file in full and follow it (AGENTS.md rule 11); say in one line which document you followed. A draft one is the best available guidance, say so.${legacy}`;
}
