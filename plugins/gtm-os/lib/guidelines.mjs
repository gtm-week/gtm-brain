// Guidelines: the brand, voice and ICP documents the work must follow (ALL-218). One Markdown file
// per guideline in brain/guidelines/<slug>.md, authored by people (or drafted by Codex and confirmed),
// never compiled or summarized. The rulebook's rule 11 makes Codex read the matching one before that
// kind of work; the session hook and the status read list them every chat (guidelinesLine). This file
// is the format; the script, the server and the hook go through it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleFor, parseFrontmatter, renderFrontmatter } from "./brain.mjs";

export const GUIDELINES_DIR = join("brain", "guidelines");
export const STATUSES = ["draft", "approved"];
export const APPLIES_MAX = 12;
export const BODY_MAX = 64 * 1024;
export const HEADER_LINE = "Made with GTM OS. This guideline lives in the brain's guidelines folder and travels with the brain.";
// What the course expects first; said by the hook while the folder is empty.
export const SUGGESTED = ["tone of voice", "design system", "target customer definition"];

export const guidelinesDir = root => join(root, GUIDELINES_DIR);
export const guidelineSlug = title => handleFor(String(title || ""));
export const guidelinePath = (root, slug) => join(guidelinesDir(root), `${slug}.md`);
export const guidelineRel = slug => `${GUIDELINES_DIR}/${slug}.md`;

/* "copy, outreach, landing pages" or an array: lowercase, trimmed, distinct, in the order given. */
export function normalizeAppliesTo(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  return [...new Set(items.map(s => String(s).trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];
}

export function validateGuideline({ slug, title, applies_to, body, status }) {
  if (!String(title || "").trim()) return "a title is needed (Tone of voice, Design system, Target customer definition)";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || "")) return `the title must give a slug of lowercase letters, digits and hyphens; got ${slug || "(nothing)"}`;
  if (slug.length > 64) return `${slug} is longer than 64 characters`;
  const applies = normalizeAppliesTo(applies_to);
  if (!applies.length) return "applies_to is needed: the kinds of work this guideline governs (copy, outreach, landing pages, creatives, proposals)";
  if (applies.length > APPLIES_MAX) return `applies_to lists ${applies.length} kinds of work; at most ${APPLIES_MAX}`;
  if (applies.some(a => a.length > 40)) return "each applies_to entry is at most 40 characters";
  if (!String(body || "").trim()) return "a body is needed: the rules themselves, in the person's language";
  if (Buffer.byteLength(String(body), "utf8") > BODY_MAX) return `the body is over ${BODY_MAX / 1024} KB; it is read in full before the work, keep it shorter`;
  if (!STATUSES.includes(status)) return `status must be ${STATUSES.join(" or ")}; got ${status}`;
  return null;
}

export function renderGuideline({ title, applies_to, status, by, updated, version, body }) {
  const fm = { title: String(title).trim(), applies_to: normalizeAppliesTo(applies_to), status, by: by || "", updated: updated || new Date().toISOString().slice(0, 10), "gtm-os": version || "" };
  const text = String(body).replace(/\r\n/g, "\n").trim();
  // Heading, then the header line once, then the rules; a body that carries its own heading (a prepared
  // design.md) keeps it, and a body read back keeps its header line where it is.
  let head = `# ${fm.title}`, rest = text;
  if (text.startsWith("# ")) { const nl = text.indexOf("\n"); head = nl < 0 ? text : text.slice(0, nl); rest = nl < 0 ? "" : text.slice(nl + 1).trim(); }
  const header = rest.includes(HEADER_LINE) ? "" : `${HEADER_LINE}\n\n`;
  return `${renderFrontmatter(fm)}\n${head}\n\n${header}${rest}\n`;
}

export function readGuideline(root, slug) {
  const path = guidelinePath(root, slug); if (!existsSync(path)) return null;
  const { fm, body } = parseFrontmatter(readFileSync(path, "utf8"));
  const title = String(fm.title || slug); const applies_to = normalizeAppliesTo(fm.applies_to);
  const status = STATUSES.includes(fm.status) ? fm.status : "draft";
  return { slug, title, applies_to, status, by: fm.by ? String(fm.by) : null, updated: fm.updated ? String(fm.updated) : null, version: fm["gtm-os"] ? String(fm["gtm-os"]) : null, body: body.trim(), path: guidelineRel(slug), bytes: Buffer.byteLength(body, "utf8") };
}

export function listGuidelines(root) {
  const dir = guidelinesDir(root); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith(".md") && !f.startsWith(".")).sort().map(f => readGuideline(root, f.slice(0, -3))).filter(Boolean);
}

export function writeGuideline(root, g) {
  mkdirSync(guidelinesDir(root), { recursive: true });
  writeFileSync(guidelinePath(root, g.slug), renderGuideline(g));
  return guidelineRel(g.slug);
}

/* The one line every chat reads: the session hook (brain and linked project) and query (status).
   With an absolute root the paths are absolute, for a chat in a linked folder. */
export function guidelinesLine(root, { absolute = false } = {}) {
  const list = listGuidelines(root);
  if (!list.length) return `guidelines: none yet. A guideline is a standing document the work must follow (${SUGGESTED.join(", ")}); say "add our tone of voice" or /gtm-os-guideline.`;
  const where = slug => absolute ? join(root, guidelineRel(slug)) : guidelineRel(slug);
  const items = list.map(g => `${g.title} [${g.status}] (${g.applies_to.join(", ")}) -> ${where(g.slug)}`).join("  ·  ");
  return `guidelines: ${items}. Before work of a listed kind, read that file in full and follow it (AGENTS.md rule 11); say in one line which guideline you followed. A draft one is the best available guidance, say so.`;
}
