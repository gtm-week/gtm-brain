// Documents: the Markdown the person keeps at the brain root and the work must follow (a strategy, a tone
// of voice, a design system, pricing). Replaces brain/guidelines (0.27.0). One Markdown file is the document;
// its files, if any, live in a folder of the same name beside it, or around it when it is alone in its folder.
// A frontmatter marker (kind: document) tells a document from any other Markdown a person keeps there; the
// scan never writes. The rulebook's rule 11 makes Codex read the matching one before that kind of work; the
// session hook and the status read list them every chat (documentsLine). This file is the format; the script,
// the server, the hook, add-file and save go through it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
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

export function validateDocument({ slug, title, applies_to, body, status, folder = "" }) {
  if (!String(title || "").trim()) return "a title is needed (Strategy, Tone of voice, Design system, Pricing)";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || "")) return `the title must give a slug of lowercase letters, digits and hyphens; got ${slug || "(nothing)"}`;
  if (slug.length > 64) return `${slug} is longer than 64 characters`;
  const f = String(folder || "").replace(/^\/+|\/+$/g, "");
  if (f && (!FOLDER.test(f) || SKIP_DIRS.has(f.split("/")[0]))) return `folder must be one or two lowercase names outside the brain's own folders (brand, market/battle-cards); got ${f}`;
  const applies = normalizeAppliesTo(applies_to);
  if (!applies.length) return "applies_to is needed: the kinds of work this document governs (copy, outreach, landing pages, proposals, planning)";
  if (applies.length > APPLIES_MAX) return `applies_to lists ${applies.length} kinds of work; at most ${APPLIES_MAX}`;
  if (applies.some(a => a.length > 40)) return "each applies_to entry is at most 40 characters";
  if (!String(body || "").trim()) return "a body is needed: the document itself, in the person's language";
  if (Buffer.byteLength(String(body), "utf8") > BODY_MAX) return `the body is over ${BODY_MAX / 1024} KB; it is read in full before the work, keep it shorter or split it`;
  if (!STATUSES.includes(status)) return `status must be ${STATUSES.join(" or ")}; got ${status}`;
  return null;
}

export function renderDocument({ title, applies_to, status, by, updated, version, body }) {
  const fm = { kind: KIND, title: String(title).trim(), applies_to: normalizeAppliesTo(applies_to), status, by: by || "", updated: updated || new Date().toISOString().slice(0, 10), "gtm-os": version || "" };
  const text = String(body).replace(/\r\n/g, "\n").trim();
  // Heading, then the header line once, then the text; a body that carries its own heading (a prepared
  // strategy.md) keeps it, and a body read back keeps its header line where it is.
  let head = `# ${fm.title}`, rest = text;
  if (text.startsWith("# ")) { const nl = text.indexOf("\n"); head = nl < 0 ? text : text.slice(0, nl); rest = nl < 0 ? "" : text.slice(nl + 1).trim(); }
  const header = rest.includes(HEADER_LINE) ? "" : `${HEADER_LINE}\n\n`;
  return `${renderFrontmatter(fm)}\n${head}\n\n${header}${rest}\n`;
}

/* The first folder of every linked project that sits inside the root: a project is a project, never a document's home. */
function projectDirs(root) {
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
  return { slug, path: posix(path), folder: dir === "." ? "" : dir, title: String(fm.title || slug), applies_to: normalizeAppliesTo(fm.applies_to), status: STATUSES.includes(fm.status) ? fm.status : "draft", by: fm.by ? String(fm.by) : null, updated: fm.updated ? String(fm.updated) : null, version: fm["gtm-os"] ? String(fm["gtm-os"]) : null, body: body.trim(), bytes: Buffer.byteLength(body, "utf8") };
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

export function writeDocument(root, d) {
  const path = posix(d.path); mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), renderDocument(d));
  return path;
}

export function removeDocument(root, doc) {
  rmSync(join(root, doc.path), { force: true });
  try { if (doc.folder && !readdirSync(join(root, doc.folder)).length) rmdirSync(join(root, doc.folder)); } catch {}
}

/* What save commits for documents: each file, its files folder, and its whole folder when it lives there alone. */
export function savePaths(root) {
  const all = listDocuments(root), out = new Set();
  for (const d of all) { out.add(d.path); if (existsSync(join(root, filesDir(d)))) out.add(filesDir(d)); if (isAlone(d, all)) out.add(d.folder); }
  return [...out];
}

/* The one line every chat reads: the session hook (brain and linked project) and query (status).
   With an absolute root the paths are absolute, for a chat in a linked folder. */
export function documentsLine(root, { absolute = false } = {}) {
  const all = listDocuments(root);
  if (!all.length) return `documents: none yet. A document is something we wrote that the work must follow (${SUGGESTED.join(", ")}); say "add our tone of voice", "add strategy.md as a document" or /gtm-os-document.`;
  const where = d => absolute ? join(root, d.path) : d.path;
  const items = all.map(d => { const n = documentFiles(root, d, all).length; return `${d.title} [${d.status}] (${d.applies_to.join(", ")}) -> ${where(d)}${n ? ` (${n} file${n === 1 ? "" : "s"})` : ""}`; }).join("  ·  ");
  return `documents: ${items}. Before work of a listed kind, read that file in full and follow it (AGENTS.md rule 11); say in one line which document you followed. A draft one is the best available guidance, say so.`;
}
