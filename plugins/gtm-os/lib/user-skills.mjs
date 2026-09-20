// User skills: a person's own Codex skills, kept in the brain's .agents/skills and shared with the brain.
// Codex reads .agents/skills from the chat's folder up to the repo root and follows symlinked skill
// folders (https://learn.chatgpt.com/docs/build-skills, read 2026-09-16); the plugin updater never
// touches a brain, so these survive updates. This file is the format; the script and the hook go through it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleFor, readProjects } from "./brain.mjs";

export const SKILLS_DIR = ".agents/skills";
export const PREFIX = "gtm-os-";
export const DESCRIPTION_MAX = 200;
// The keys Codex's own validator accepts (skill-creator/scripts/quick_validate.py, Codex 0.153).
export const ALLOWED_FRONTMATTER = ["name", "description", "license", "allowed-tools", "metadata"];
export const HEADER_LINE = "Made with GTM OS. This skill lives in the brain's .agents/skills folder, travels with the brain, and shows in Codex after the app is quit and reopened.";
const PLUGIN = fileURLToPath(new URL("../", import.meta.url));

export const skillsDir = root => join(root, ".agents", "skills");
export function shippedSkillIds(pluginRoot = PLUGIN) {
  return readdirSync(join(pluginRoot, "skills")).filter(id => existsSync(join(pluginRoot, "skills", id, "SKILL.md"))).sort();
}
export function skillId(title) { const s = handleFor(String(title || "")); return s.startsWith(PREFIX) ? s : PREFIX + s; }

/* A skill file's frontmatter: key: value, key: | blocks, and one level of nested map (metadata). */
export function readSkillFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/); if (!m) return { fm: {}, body: text };
  const fm = {}; const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (!kv) continue;
    const key = kv[1], v = kv[2].trim();
    if (v === "|" || v === ">") { const block = []; while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim()); fm[key] = block.join(" "); continue; }
    if (v === "") { const map = {}; while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) { const n = lines[++i].match(/^\s+([\w-]+):\s*(.*)$/); if (n) map[n[1]] = unquote(n[2].trim()); } fm[key] = map; continue; }
    fm[key] = unquote(v);
  }
  return { fm, body: text.slice(m[0].length) };
}
const unquote = v => (/^".*"$/.test(v) || /^'.*'$/.test(v)) ? v.slice(1, -1) : v;
const quote = v => JSON.stringify(String(v));

export function validateSkill(root, { id, description, keys = [] }, { pluginRoot = PLUGIN } = {}) {
  if (!/^gtm-os-[a-z0-9][a-z0-9-]*$/.test(id || "")) return `the name must be gtm-os- followed by lowercase letters, digits and hyphens; got ${id || "(nothing)"}`;
  const shipped = shippedSkillIds(pluginRoot); if (shipped.includes(id)) return `${id} is a shipped GTM OS skill; pick another name (taken: ${shipped.join(", ")})`;
  if (id.length > 64) return `${id} is longer than 64 characters`;
  const d = String(description || "").trim(); if (!d) return "a description is needed: one English sentence saying what the skill does and when it applies";
  if (d.length > DESCRIPTION_MAX) return `the description is ${d.length} characters; at most ${DESCRIPTION_MAX} (it is what Codex lists in every chat)`;
  const bad = keys.filter(k => !ALLOWED_FRONTMATTER.includes(k)); if (bad.length) return `frontmatter key not allowed by Codex: ${bad.join(", ")} (allowed: ${ALLOWED_FRONTMATTER.join(", ")})`;
  return null;
}

export function renderSkillMd({ id, title, description, body, by, version }) {
  const created = new Date().toISOString().slice(0, 10);
  return `---\nname: ${id}\ndescription: ${quote(description.trim())}\nmetadata:\n  short-description: ${quote(title)}\n  gtm-os: ${quote(version || "")}\n  created: ${created}\n  by: ${quote(by || "")}\n---\n\n# GTM OS skill: ${title}\n\n${HEADER_LINE}\n\n${String(body || "").trim()}\n`;
}
export function renderOpenaiYaml({ title, description }) {
  return `interface:\n  display_name: ${quote("GTM OS: " + title)}\n  short_description: ${quote(description.trim().slice(0, 80))}\n`;
}

export function listUserSkills(root) {
  const dir = skillsDir(root); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(id => id.startsWith(PREFIX) && existsSync(join(dir, id, "SKILL.md"))).sort().map(id => {
    const { fm, body } = readSkillFrontmatter(readFileSync(join(dir, id, "SKILL.md"), "utf8"));
    const meta = fm.metadata || {};
    const title = meta["short-description"] || (body.match(/^# (?:GTM OS skill: )?(.+)$/m) || [])[1] || id.slice(PREFIX.length);
    return { id, title, description: String(fm.description || ""), created: meta.created || null, by: meta.by || null, path: join(dir, id) };
  });
}

export function writeUserSkill(root, { id, title, description, body, by, version }) {
  const dir = join(skillsDir(root), id); mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), renderSkillMd({ id, title, description, body, by, version }));
  writeFileSync(join(dir, "agents", "openai.yaml"), renderOpenaiYaml({ title, description }));
  return dir;
}

/* Symlinks into linked projects: Codex scans each project's own .agents/skills, so the brain's skills
   are linked there by absolute path. Machine-specific, never in the brain. A project inside the brain
   folder already sees the brain's .agents/skills through the ancestor scan; a link there would list
   every skill twice, so such projects are skipped. */
const insideBrain = (root, path) => { try { return realpathSync(path).startsWith(realpathSync(root) + sep); } catch { return false; } };
const outsideProjects = root => readProjects(root).filter(p => !insideBrain(root, p.path) && existsSync(p.path));
const linkPath = (projectPath, id) => join(projectPath, ".agents", "skills", id);
const isOurLink = (path, root) => { try { return lstatSync(path).isSymbolicLink() && resolve(readlinkSync(path)).startsWith(skillsDir(root) + sep); } catch { return false; } };
function ensureLink(root, projectPath, id) {
  const target = join(skillsDir(root), id), path = linkPath(projectPath, id);
  if (isOurLink(path, root) && resolve(readlinkSync(path)) === target) return false;
  if (isOurLink(path, root)) unlinkSync(path);
  if (existsSync(path)) throw new Error(`${path} exists and is not a GTM OS link`);
  mkdirSync(join(projectPath, ".agents", "skills"), { recursive: true }); symlinkSync(target, path, "dir"); return true;
}
export function linkSkillIntoProjects(root, id) {
  const linked = [], failed = [];
  for (const p of outsideProjects(root)) { try { ensureLink(root, p.path, id); linked.push(p.slug); } catch (e) { failed.push({ slug: p.slug, error: e.message }); } }
  return { linked, failed };
}
export function unlinkSkillFromProjects(root, id) {
  const removed = [];
  for (const p of outsideProjects(root)) { const path = linkPath(p.path, id); if (isOurLink(path, root)) { unlinkSync(path); removed.push(p.slug); } }
  return removed;
}
/* One project brought up to date: every brain skill linked, every dangling GTM OS link gone. */
export function reconcileProjectSkills(root, slug) {
  const p = outsideProjects(root).find(x => x.slug === slug); if (!p || !existsSync(p.path)) return { linked: [], removed: [] };
  const linked = [], removed = [];
  for (const s of listUserSkills(root)) { try { if (ensureLink(root, p.path, s.id)) linked.push(s.id); } catch {} }
  const dir = join(p.path, ".agents", "skills");
  if (existsSync(dir)) for (const id of readdirSync(dir)) { const path = join(dir, id); if (isOurLink(path, root) && !existsSync(join(skillsDir(root), id, "SKILL.md"))) { unlinkSync(path); removed.push(id); } }
  return { linked, removed };
}
