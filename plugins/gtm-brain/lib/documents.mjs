// Documents: the Markdown the person keeps at the brain root and the work must follow (a strategy, a tone
// of voice, a design system, pricing). Replaces brain/guidelines (0.27.0). One Markdown file is the document;
// its files, if any, live in a folder of the same name beside it, or around it when it is alone in its folder.
// A frontmatter marker (kind: document) tells a document from any other Markdown a person keeps there; the
// scan never writes. The rulebook's rule 11 makes Codex read the matching one before that kind of work; the
// session hook and the status read list them every chat (documentsLine). This file is the format; the script,
// the server, the hook, add-file and save go through it.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, rmdirSync, renameSync, statSync } from "node:fs";
import { join, dirname, basename, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { handleFor, parseFrontmatter, renderFrontmatter, readProjects } from "./brain.mjs";
import { HOST_DIRS } from "./host.mjs";
import { ROOT_KEEP as KEEP_AT_TOP, ENGINE_DIRS, ABOUT_DIR, ABOUT_DIR4, baseDir, engineDirs, inLayout4 } from "./brain-paths.mjs";
/* In the base files' folder: about-us/ (layout 3) or configuration/about-us/ (layout 4), or a folder below it. */
const inAbout = folder => [ABOUT_DIR, ABOUT_DIR4].some(d => folder === d || String(folder).startsWith(`${d}/`));
import { workDir } from './brain-paths.mjs';

export const KIND = "document";
export const STATUSES = ["draft", "approved"];
export const APPLIES_MAX = 12;
export const BODY_MAX = 64 * 1024;
export const MAX_DEPTH = 2;
export const HEADER_LINE = "Made with GTM Brain. This document lives in the brain folder and travels with it.";
// What the course expects first; said by the hook while there are none.
export const SUGGESTED = ["strategy", "tone of voice", "design system", "target customer definition", "pricing"];
// The engine and the machine's own folders: never a document's home.
export const SKIP_DIRS = new Set([...ENGINE_DIRS, "files", ".agents", ".githooks", ".git", ".obsidian", ...HOST_DIRS, "node_modules"]);
const ROOT_KEEP = new Set(KEEP_AT_TOP);
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
    // layout 4: the base files' folder is configuration/about-us, the one place inside the engine's folders a document lives
    const about = root && inLayout4(root) && (f === ABOUT_DIR4 || (f.startsWith(`${ABOUT_DIR4}/`) && FOLDER.test(f.slice(ABOUT_DIR4.length + 1)) && !f.slice(ABOUT_DIR4.length + 1).includes("/")));
    if (f && !about && (!FOLDER.test(f) || (SKIP_DIRS.has(f.split("/")[0]) || (root && engineDirs(root).includes(f.split("/")[0]))))) return `folder must be one or two lowercase names outside the brain's own folders (brand, market/battle-cards); got ${f}`;
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

const DOCUMENT_KEYS = new Set(["kind", "title", "applies_to", "status", "by", "updated", "gtm-brain"]);
/* extra: frontmatter keys of the person's own (Obsidian tags, aliases) kept next to the document's fields. */
export function renderDocument({ title, applies_to, status, by, updated, version, body, extra = {} }) {
  const own = Object.fromEntries(Object.entries(extra || {}).filter(([k]) => !DOCUMENT_KEYS.has(k)));
  const fm = { kind: KIND, title: String(title).trim(), applies_to: normalizeAppliesTo(applies_to), status, by: by || "", updated: updated || new Date().toISOString().slice(0, 10), "gtm-brain": version || "", ...own };
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
  const skip = new Set([...SKIP_DIRS, ...engineDirs(root), ...projectDirs(root)]); const out = [];
  const walk = (dir, depth) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith(".")) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) { if (depth === 0 && skip.has(e.name)) continue; if (depth < MAX_DEPTH) walk(path, depth + 1); }
      else if (e.isFile() && e.name.endsWith(".md") && !(depth === 0 && ROOT_KEEP.has(e.name))) out.push(posix(relative(root, path)));
    }
  };
  walk(root, 0);
  if (inLayout4(root)) walk(join(root, ABOUT_DIR4), 1);   // as deep as about-us/ is in layout 3
  return out.sort();
}

/* The starters setup writes (strategy, icp, voice, design-system, market): a document whose body is still the shipped
   one, word for word, is not filled. A hard fact, so a hand edit counts as filled; any company name matches. */
export const STARTERS = ["strategy", "icp", "voice", "design-system", "market"];
/* The ready starters for the common base files a team adds (templates/base-files/): headings, one line of
   guidance each, the kinds of work to offer, the words that find the subject in notes, and the facts to ask
   for when the brain holds nothing. A document whose body is still one of them is not filled either. */
export const BASE_STARTERS = ["pricing", "positioning", "competitors", "objections"];
const templateUrl = slug => new URL(BASE_STARTERS.includes(slug) ? `../templates/base-files/${slug}.md` : `../templates/${slug}.md`, import.meta.url);
/* A starter's text changes between releases, and a brain keeps the one its setup wrote: the earlier shipped texts
   are kept whole in templates/legacy/starters/<slug>-<version>.md and count as not filled too. Never edit or
   remove one; add the outgoing file there before changing a starter under templates/. */
const LEGACY_STARTERS = new URL("../templates/legacy/starters/", import.meta.url);
const starterBody = new Map();
const starterPattern = text => new RegExp(`^${parseFrontmatter(text).body.trim().split("{{COMPANY}}").map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+?")}$`, "s");
function isStarterBody(slug, body) {
  if (!STARTERS.includes(slug) && !BASE_STARTERS.includes(slug)) return false;
  if (!starterBody.has(slug)) {
    const res = [];
    try { res.push(starterPattern(readFileSync(templateUrl(slug), "utf8"))); } catch {}
    try { for (const f of readdirSync(LEGACY_STARTERS).sort()) if (f.startsWith(`${slug}-`) && f.endsWith(".md")) res.push(starterPattern(readFileSync(new URL(f, LEGACY_STARTERS), "utf8"))); } catch {}
    starterBody.set(slug, res);
  }
  const text = String(body || "").trim(); return starterBody.get(slug).some(re => re.test(text));
}

/* A document's page: <slug>.html beside the Markdown, the version people look at (the design system's is shown on
   the dashboard's Visual tab). A document that moved into a folder of its own name may have left the page beside
   that folder: it is found there too. A new page goes beside the Markdown. Returns { path, exists }. */
export const PAGE_DOCS = ["design-system"];
export function documentPage(root, doc) {
  const name = `${doc.slug}.html`, beside = doc.folder ? `${doc.folder}/${name}` : name;
  const up = inOwnFolder(doc) ? (dirname(doc.folder) === "." ? name : `${posix(dirname(doc.folder))}/${name}`) : null;
  const found = [beside, up].find(p => { try { return !!p && lstatSync(join(root, p)).isFile(); } catch { return false; } });
  return { path: found || beside, exists: !!found };
}
/* The shipped starter page says so itself in a meta tag; a page written for the company does not carry it. */
export const STARTER_PAGE_MARK = '<meta name="gtm-brain-starter"';
export const isStarterPage = html => String(html || "").includes(STARTER_PAGE_MARK);
/* What a page must not hold. The dashboard shows it in a sandboxed frame with no network and no scripts, and it
   travels with the brain, so everything it needs is inside it: inline CSS, inline SVG, data: images, fonts by
   name. Returns the problems in words, [] for a page that can be saved. */
export function pageProblems(html) {
  const text = String(html || ""), out = [];
  if (!/^\s*<!doctype html/i.test(text)) out.push("it does not start with <!DOCTYPE html>");
  if (/<script\b/i.test(text)) out.push("it has a <script> (a page runs no scripts)");
  if (/<(iframe|object|embed|frame|base)\b/i.test(text)) out.push("it embeds another page or sets a base address (iframe, object, embed, base)");
  if (/<link\b/i.test(text)) out.push("it has a <link> (styles are inline, in one <style> block)");
  if (/@import\b/i.test(text)) out.push("it has an @import (no stylesheet or font is loaded from elsewhere)");
  if (/url\(\s*(?!["']?(?:data:|#))/i.test(text)) out.push("it has a url() that is not a data: address");
  if (/\b(?:src|srcset|poster|background|action|formaction)\s*=\s*["']?(?!data:|["']?\s*>)[^\s"'>]/i.test(text)) out.push("it loads a file by address (src, srcset, poster): images are inline SVG or data: addresses");
  if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(text)) out.push("it redirects (meta refresh)");
  if (/[\u2013\u2014]/.test(text)) out.push("it has an en or em dash (plain hyphens only)");
  return out;
}

/* A base file is what the company's work must follow, not every document a team keeps: one of the shipped
   starters or ready base files at the top of the brain, anything in about-us/ (layout 3, the owner's folder), or a
   document that says so itself with `base: true` in its header. A talk draft or a brief at the top is a document,
   not a base file: the dashboard lists it apart and the move to about-us/ leaves it where it is. */
export function isBase(slug, folder, fm = {}) {
  if (fm.type === "workflow") return false;
  if (inAbout(folder)) return true;
  if (/^(true|yes)$/i.test(String(fm.base ?? "").trim())) return true;
  if (/^(false|no)$/i.test(String(fm.base ?? "").trim())) return false;
  return (folder === "" || folder === slug) && (STARTERS.includes(slug) || BASE_STARTERS.includes(slug));
}

// A workflow's status is draft, active or paused (lib/workflows.mjs); any other document's is draft or approved.
export function parseDocument(root, path) {
  const abs = join(root, path); if (!existsSync(abs)) return null;
  const { fm, body } = parseFrontmatter(readFileSync(abs, "utf8"));
  if (fm.kind !== KIND) return null;
  const slug = basename(path, ".md"), dir = posix(dirname(path));
  const extra = Object.fromEntries(Object.entries(fm).filter(([k]) => !DOCUMENT_KEYS.has(k)));
  const status = STATUSES.includes(fm.status) || (fm.type === "workflow" && ["active", "paused"].includes(fm.status)) ? fm.status : "draft", filled = !isStarterBody(slug, body);
  const folder = dir === "." ? "" : dir;
  return { slug, path: posix(path), folder, base: isBase(slug, folder, fm), title: String(fm.title || slug), applies_to: normalizeAppliesTo(fm.applies_to), status, filled, state: filled ? status : "not filled", by: fm.by ? String(fm.by) : null, updated: fm.updated ? String(fm.updated) : null, version: fm["gtm-brain"] ? String(fm["gtm-brain"]) : null, body: body.trim(), bytes: Buffer.byteLength(body, "utf8"), extra };
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

/* Every document that has a folder of its own name beside it (made by a new document, by hand, or by an older
   version) moves into it: design-system.md beside design-system/ becomes design-system/design-system.md.
   Run after every document write and by the upgrade; idempotent. Returns the moves; the caller commits them. */
export function consolidateDocuments(root) {
  const moves = [], projects = projectDirs(root);
  for (const doc of listDocuments(root)) {
    if (inOwnFolder(doc)) continue;
    if (projects.has(filesDir(doc).split("/")[0])) continue;   // a linked project's folder is never a document home
    let dir; try { dir = statSync(join(root, filesDir(doc))); } catch { continue; }
    if (!dir.isDirectory()) continue;
    const m = moveIntoFolder(root, doc); if (m) moves.push(m);
  }
  return moves;
}

export function writeDocument(root, d) {
  const path = posix(d.path); mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), renderDocument(d));
  return path;
}

/* The frontmatter a document needs, merged over the file's own keys (theirs kept after ours). */
const documentFields = ({ title, applies_to, status, by, version }, own = {}) => ({ kind: KIND, title: String(title).trim(), applies_to: normalizeAppliesTo(applies_to), status, by: by || "", updated: new Date().toISOString().slice(0, 10), "gtm-brain": version || "", ...Object.fromEntries(Object.entries(own || {}).filter(([k]) => !DOCUMENT_KEYS.has(k))) });

/* Writes the frontmatter and keeps every byte of the text below it as the person wrote it: adopting a file
   dropped in by hand, or changing only its fields (status, applies_to, title). Returns what was written. */
export function writeFields(root, path, fields, { preview = false } = {}) {
  const abs = join(root, path), raw = readFileSync(abs, "utf8").replace(/^﻿/, "");
  const { fm, body } = parseFrontmatter(raw.replace(/\r\n/g, "\n"));
  const text = /\r\n/.test(raw) ? raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") : body;   // a CRLF file keeps its own line ends below
  const head = renderFrontmatter(documentFields(fields, { ...fm, ...(fields.extra || {}) }));   // extra: header keys of the caller's (base: true)
  if (!preview) writeFileSync(abs, head + text);
  return { frontmatter: head, text };
}

/* A section added at the end of a document; everything above it stays as it is. */
export function appendSection(root, doc, section, fields) {
  const abs = join(root, doc.path), { body } = parseFrontmatter(readFileSync(abs, "utf8"));
  const add = String(section || "").replace(/\r\n/g, "\n").trim();
  writeFileSync(abs, renderFrontmatter(documentFields({ title: doc.title, applies_to: doc.applies_to, status: doc.status, by: doc.by, ...fields }, doc.extra)) + `${body.replace(/\s+$/, "")}\n\n${add}\n`);
}

/* Markdown dropped at the brain root by hand that is not a document yet: the brain does not read it before work. */
export function unadoptedFiles(root) {
  const base = baseDir(root);   // layout 3: the base files' folder counts as the top
  return markdownFiles(root).filter(p => (!p.includes("/") || (base && posix(dirname(p)) === base)) && !parseDocument(root, p));
}
export const unadoptedText = files => files.map(f => `${f} is here but the brain does not use it yet`).join("; ");

/* The health line's part for them, said once per set: the set is remembered in work/ and the part returns only when a new file appears. */
export function unadoptedPart(root) {
  const files = unadoptedFiles(root), memo = join(workDir(root), "unadopted-seen.json");
  let seen = []; try { seen = JSON.parse(readFileSync(memo, "utf8")).files || []; } catch {}
  const fresh = files.filter(f => !seen.includes(f));
  try { mkdirSync(workDir(root), { recursive: true }); writeFileSync(memo, JSON.stringify({ files, at: new Date().toISOString() })); } catch {}
  return fresh.length ? `base files: ${unadoptedText(fresh)}` : "";
}

/* A starter from templates/base-files/, by slug or by a word of the subject ("our pricing", "a competitors file"). */
export function readStarter(slug) {
  if (!BASE_STARTERS.includes(slug)) return null;
  const { fm, body } = parseFrontmatter(readFileSync(templateUrl(slug), "utf8"));
  const list = v => (Array.isArray(v) ? v : []).map(String);
  return { slug, title: String(fm.title), applies_to: normalizeAppliesTo(fm.applies_to), choices: list(fm.choices), terms: list(fm.terms).map(t => t.toLowerCase()), needs: list(fm.needs), body: body.trim(), template: `templates/base-files/${slug}.md` };
}
const STOP = new Set(["a", "an", "the", "our", "my", "we", "us", "of", "for", "and", "to", "file", "files", "base", "document", "doc", "docs", "md", "new", "page", "sheet", "add", "make", "need", "as", "create", "write", "start", "set", "up"]);
const stem = w => w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
export const subjectWords = text => String(text || "").toLowerCase().replace(/\.md$/, "").split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w));
export function matchStarter(subject) {
  const words = new Set(subjectWords(subject).map(stem));
  // the slug or one of its first three terms, which are its other names (price, competition, messaging, pushback)
  return BASE_STARTERS.map(readStarter).find(s => [s.slug, ...s.terms.slice(0, 3)].some(t => words.has(stem(t)))) || null;
}

/* Which existing base files already cover a subject, strongest first: the title or slug names it (3), applies_to
   names it (1), a heading is exactly it (1), the text mentions it three times or more (1). Two or more is an overlap. */
export function overlaps(root, subject, starter = matchStarter(subject), all = listDocuments(root)) {
  const words = new Set(subjectWords(subject).map(stem)); if (starter) words.add(stem(starter.slug));
  if (!words.size) return [];
  const terms = new Set([...words, ...(starter ? starter.terms.map(stem) : [])]);
  const has = text => subjectWords(text).map(stem).some(w => words.has(w));
  const out = [];
  for (const d of all) {
    if (d.extra?.type === "workflow") continue;
    const reasons = [];
    if (subjectWords(d.title).concat(subjectWords(d.slug)).map(stem).some(w => words.has(w))) reasons.push(["title", 3]);
    const applies = d.applies_to.filter(a => has(a) || terms.has(stem(a)));
    if (applies.length) reasons.push([`applies_to: ${applies.join(", ")}`, 1]);
    const heading = (d.body.match(/^#{2,3}\s+.+$/gm) || []).map(h => h.replace(/^#+\s+/, "").trim()).find(h => { const w = subjectWords(h).map(stem); return w.length && w.every(x => words.has(x)); });
    if (heading) reasons.push([`heading "${heading}"`, 1]);
    const mentions = d.filled ? subjectWords(d.body).map(stem).filter(w => terms.has(w)).length : 0;
    if (mentions >= 3) reasons.push([`${mentions} mentions in the text`, 1]);
    const score = reasons.reduce((n, [, s]) => n + s, 0);
    if (score >= 2) out.push({ doc: d, score, reasons: reasons.map(([r]) => r), heading: heading || null });
  }
  return out.sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path));
}

/* When each path last changed: its last commit's date, or today when it has changes not saved yet. */
export function lastChanged(root, paths) {
  const out = {}; if (!paths.length) return out;
  try {
    const log = execFileSync("git", ["--no-optional-locks", "-C", root, "log", "--format=%x00%cs", "--name-only", "--", ...paths], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 << 20 });
    for (const chunk of log.split("\0").filter(Boolean)) { const [date, ...files] = chunk.split("\n").map(s => s.trim()).filter(Boolean); for (const f of files) if (!out[f]) out[f] = date; }
    const status = execFileSync("git", ["--no-optional-locks", "-C", root, "status", "--porcelain", "--untracked-files=all", "--", ...paths], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const l of status.split("\n").filter(Boolean)) { const p = l.slice(3).replace(/^"|"$/g, ""); try { out[p] = statSync(join(root, p)).mtime.toISOString().slice(0, 10); } catch {} }
  } catch {}
  for (const p of paths) if (!out[p]) { try { out[p] = statSync(join(root, p)).mtime.toISOString().slice(0, 10); } catch {} }
  return out;
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

/* Folders at the top GTM Brain does not use: not the engine's, not a project's, not a document's home. A brain
   migrated from an older layout brings company/, assets/, output/; nothing here touches them, the hint names them. */
export function strayFolders(root) {
  const skip = new Set([...SKIP_DIRS, ...engineDirs(root), ...projectDirs(root), ...(baseDir(root) ? [baseDir(root).split("/")[0]] : [])]), homes = new Set(listDocuments(root).map(d => d.folder.split("/")[0]).filter(Boolean));
  let entries; try { entries = readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries.filter(e => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name) && !homes.has(e.name)).map(e => e.name).sort();
}

/* The session line for them, said once per set: the set is remembered in work/ and the line returns only when it changes. */
export function strayFoldersHint(root) {
  const stray = strayFolders(root), memo = join(workDir(root), "stray-folders.json");
  let seen = []; try { seen = JSON.parse(readFileSync(memo, "utf8")).folders || []; } catch {}
  if (JSON.stringify(stray) === JSON.stringify(seen)) return "";
  try { mkdirSync(workDir(root), { recursive: true }); writeFileSync(memo, JSON.stringify({ folders: stray, at: new Date().toISOString() })); } catch {}
  if (!stray.length) return "";
  // the adopt example names a folder that actually holds Markdown, when one does
  const holdsMarkdown = f => { try { return readdirSync(join(root, f), { recursive: true }).some(p => String(p).endsWith(".md")); } catch { return false; } };
  const first = stray.find(holdsMarkdown) || stray[0];
  return `Folders at the top GTM Brain does not use: ${stray.map(f => `${f}/`).join(", ")}. Say it once, in one line, and do nothing to them: a Markdown in them can become a document where it lies (say: adopt the documents in ${first}/), files belong beside a document or a person, company or product (add this to ...), and the rest can go. Their content is the person's; never move or delete it unasked.`;
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
    const text = body.replace("Made with GTM Brain. This guideline lives in the brain's guidelines folder and travels with the brain.", HEADER_LINE);
    writeDocument(root, { path: to, title: fm.title || basename(name, ".md"), applies_to: fm.applies_to || "all work", status: STATUSES.includes(fm.status) ? fm.status : "draft", by: fm.by, updated: fm.updated, version: fm["gtm-brain"], body: text });
    rmSync(join(dir, name)); moved.push([from, to]);
  }
  try { if (!readdirSync(dir).length) rmdirSync(dir); } catch {}
  return { moved, kept };
}

/* The one line every chat reads: the chat start (brain and linked project) and query (status).
   With an absolute root the paths are absolute, for a chat in a linked folder. */
export function documentsLine(root, { absolute = false } = {}) {
  const all = listDocuments(root), where = p => absolute ? join(root, p) : p;
  // Guidelines of a brain not yet upgraded (0.26 and earlier) still govern the work until the upgrade moves them.
  const oldDir = join(root, "brain", "guidelines");
  const old = existsSync(oldDir) ? readdirSync(oldDir).filter(f => f.endsWith(".md") && !f.startsWith(".")).sort().map(f => `brain/guidelines/${f}`) : [];
  const legacy = old.length ? ` Older guidelines not moved yet, read them the same way: ${old.map(where).join(", ")}; the upgrade (say: refresh the rules) moves them to the root.` : "";
  if (!all.length) return `documents: none yet. A document is something we wrote that the work must follow (${SUGGESTED.join(", ")}); say "add our tone of voice" or "add strategy.md as a document".${legacy}`;
  const items = all.map(d => { const n = documentFiles(root, d, all).length; return `${d.title} [${d.filled ? d.status : "not filled"}] (${d.applies_to.join(", ")}) -> ${where(d.path)}${n ? ` (${n} file${n === 1 ? "" : "s"})` : ""}`; }).join("  ·  ");
  return `documents: ${items}. Before work of a listed kind, read that file in full and follow it (AGENTS.md rule 11); say in one line which document you followed. A draft one is the best available guidance, say so.${all.some(d => !d.filled) ? " A not filled one is still its starter and holds no guidance: do the work without it, and when the work is of its kind offer once to fill it first (strategy: /gtmb-strategy; ICP: /gtmb-icp; voice: /gtmb-voice; design system or market: a draft from the website, gtmb-use-brain references/documents.md)." : ""}${legacy}`;
}
