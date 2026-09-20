#!/usr/bin/env node
// A person's own skills: made, listed, installed and removed in the brain's .agents/skills.
//   node skill.mjs <root> --create --title T --description D --body B [--by handle]
//   node skill.mjs <root> --list [--json]
//   node skill.mjs <root> --install --repo owner/repo --path skills/x [--ref main] [--title T]
//   node skill.mjs <root> --remove <id>
// Every write commits through lib.commit and links the skill into the linked projects (lib/user-skills.mjs).
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const us = await import(new URL("../../lib/user-skills.mjs", import.meta.url));
const args = process.argv.slice(2); const root = resolve(args[0] && !args[0].startsWith("--") ? args.shift() : ".");
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here (brain/admin.md missing)."); process.exit(1); }
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
const refuse = why => { console.error(why); process.exit(2); };
for (const flag of ["title", "description", "body", "by", "repo", "path", "ref", "remove"]) if (opt[flag] === true) refuse(`--${flag} needs a value`);
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL("../../.codex-plugin/plugin.json", import.meta.url), "utf8")).version; } catch { return ""; } })();
const by = opt.by ? lib.teamHandle(root, String(opt.by)) : null; if (opt.by && !by) refuse(`"${opt.by}" is not in admin.md team`);
const projectsSeeing = id => lib.readProjects(root).filter(p => { try { return existsSync(join(p.path, ".agents", "skills", id, "SKILL.md")); } catch { return false; } }).map(p => p.slug);
const finish = (id, verb, message) => {
  const { linked, failed } = verb === "removed" ? { linked: [], failed: [] } : us.linkSkillIntoProjects(root, id);
  const c = lib.commit(root, [join(".agents", "skills", id)], message);
  const where = linked.length ? ` · visible in ${linked.join(", ")}` : "";
  const trouble = failed.length ? ` · not linked in ${failed.map(f => `${f.slug} (${f.error})`).join("; ")}` : "";
  console.log(`${verb} ${id} (${c.note})${where}${trouble}. It shows in Codex as /${id} after the app is quit and reopened.`);
  lib.logActivity(root, "skill", `${verb} ${id}`); lib.rerender(root);
};

// GitHub contents API, one folder at a time. GITHUB_TOKEN or GH_TOKEN, when set, reaches private repos.
async function fetchFolder(url, dest) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "gtm-os" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN; if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  const entries = await r.json(); if (!Array.isArray(entries)) throw new Error(`${url} is not a folder`);
  mkdirSync(dest, { recursive: true });
  for (const e of entries) {
    // a child folder: same base and query, the entry's own path
    if (e.type === "dir") { const base = url.slice(0, url.indexOf("/contents/") + "/contents/".length), query = url.includes("?") ? url.slice(url.indexOf("?")) : ""; await fetchFolder(`${base}${e.path}${query}`, join(dest, e.name)); continue; }
    if (e.type !== "file" || !e.download_url) continue;
    const f = await fetch(e.download_url, { headers }); if (!f.ok) throw new Error(`${f.status} for ${e.download_url}`);
    writeFileSync(join(dest, e.name), Buffer.from(await f.arrayBuffer()));
  }
}

if (opt.create) {
  const title = String(opt.title || "").trim(); if (!title) refuse("--title is needed");
  const id = us.skillId(title), description = String(opt.description || "");
  const why = us.validateSkill(root, { id, description, keys: ["name", "description", "metadata"] }); if (why) refuse(why);
  if (existsSync(join(us.skillsDir(root), id))) refuse(`${id} already exists in this brain; remove it first or pick another title`);
  if (!String(opt.body || "").trim()) refuse("--body is needed: the steps another Codex chat should follow");
  us.writeUserSkill(root, { id, title, description, body: String(opt.body), by, version: VERSION });
  finish(id, "created", `Added skill ${id}`); process.exit(0);
}
if (opt.remove) {
  const id = String(opt.remove); if (!existsSync(join(us.skillsDir(root), id, "SKILL.md"))) refuse(`no such skill ${id}; yours: ${us.listUserSkills(root).map(s => s.id).join(", ") || "none"}`);
  us.unlinkSkillFromProjects(root, id); rmSync(join(us.skillsDir(root), id), { recursive: true, force: true });
  finish(id, "removed", `Removed skill ${id}`); process.exit(0);
}
if (opt.list) {
  const yours = us.listUserSkills(root).map(s => ({ ...s, projects: projectsSeeing(s.id) })), plugin = us.shippedSkillIds();
  if (opt.json) { console.log(JSON.stringify({ yours, plugin }, null, 1)); process.exit(0); }
  if (!yours.length) console.log("no skills of your own yet. Say: make this a skill, or: add a skill.");
  for (const s of yours) console.log(`• /${s.id} · ${s.title} · ${s.description}${s.by ? ` · by ${s.by}` : ""}${s.projects.length ? ` · also in ${s.projects.join(", ")}` : ""}`);
  console.log(`shipped with GTM OS: ${plugin.map(id => "/" + id).join(", ")}`);
  process.exit(0);
}
if (opt.install) {
  const repo = String(opt.repo || ""), path = String(opt.path || "").replace(/^\/|\/$/g, ""), ref = String(opt.ref || "main");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) refuse("--repo must be owner/repo"); if (!path) refuse("--path is needed: the skill folder inside the repo");
  const id = us.skillId(opt.title || basename(path)); const dest = join(us.skillsDir(root), id);
  if (existsSync(dest)) refuse(`${id} already exists in this brain; remove it first`);
  const why = us.validateSkill(root, { id, description: "pending", keys: [] }); if (why) refuse(why);
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const bundled = join(codexHome, "skills", ".system", "skill-installer", "scripts", "install-skill-from-github.py");
  try {
    if (!process.env.GTM_OS_SKILL_SOURCE && existsSync(bundled)) {
      execFileSync("python3", [bundled, "--repo", repo, "--path", path, "--ref", ref, "--dest", us.skillsDir(root), "--name", id], { stdio: "pipe", encoding: "utf8" });
    } else await fetchFolder(`${process.env.GTM_OS_SKILL_SOURCE || "https://api.github.com"}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, dest);
  } catch (e) { rmSync(dest, { recursive: true, force: true }); refuse(`could not fetch ${repo} ${path}@${ref}: ${String(e.stderr || e.message).trim().split("\n")[0]}`); }
  const file = join(dest, "SKILL.md"); if (!existsSync(file)) { rmSync(dest, { recursive: true, force: true }); refuse(`${repo} ${path} has no SKILL.md`); }
  const { fm, body } = us.readSkillFrontmatter(readFileSync(file, "utf8"));
  const bad = us.validateSkill(root, { id, description: fm.description, keys: Object.keys(fm) }); if (bad) { rmSync(dest, { recursive: true, force: true }); refuse(bad); }
  // The installed file is rewritten under its GTM OS name with the header line; everything else in the folder stays as fetched.
  const title = String(opt.title || fm.metadata?.["short-description"] || (body.match(/^# (?:GTM OS skill: )?(.+)$/m) || [])[1] || id.slice(us.PREFIX.length));
  const rest = body.replace(/^# .*\n/m, "").trim();
  writeFileSync(file, us.renderSkillMd({ id, title, description: String(fm.description), body: rest, by, version: VERSION }));
  if (!existsSync(join(dest, "agents", "openai.yaml"))) { mkdirSync(join(dest, "agents"), { recursive: true }); writeFileSync(join(dest, "agents", "openai.yaml"), us.renderOpenaiYaml({ title, description: String(fm.description) })); }
  finish(id, "installed", `Installed skill ${id} from ${repo} ${path}`); process.exit(0);
}
console.error("usage: skill.mjs <root> --create --title T --description D --body B [--by h] | --list [--json] | --install --repo o/r --path p [--ref r] [--title T] | --remove <id>"); process.exit(1);
