#!/usr/bin/env node
// A folder becomes a project of this brain, or stops being one, or the projects are listed.
//   node project.mjs <root> --link <path> [--create] [--slug s] [--title "T"] [--contexts a,b] [--by handle]
//   node project.mjs <root> --unlink <slug>
//   node project.mjs <root> --list [--json]
// Writes the pointer block into <path>/AGENTS.md, the entry in work/projects.json and the project's
// loaded set (work/projects/<slug>/loaded-contexts.json). Nothing under brain/ changes: a project is
// a tag on notes and a local pointer, never an object, so nothing here commits.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, realpathSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { join, resolve, isAbsolute, basename, dirname, relative, sep } from "node:path";
import { listCodexProjects } from "../../lib/codex-projects.mjs";
import { listDocuments } from "../../lib/documents.mjs";
import { HOST_DIRS } from "../../lib/host.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const us = await import(new URL("../../lib/user-skills.mjs", import.meta.url));
const args = process.argv.slice(2); const root = resolve(args[0] && !args[0].startsWith("--") ? args.shift() : ".");
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here (brain/admin.md missing)."); process.exit(1); }
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
const refuse = why => { console.error(why); process.exit(2); };
for (const flag of ["link", "slug", "title", "contexts", "by", "unlink"]) if (opt[flag] === true) refuse(`--${flag} needs a value`);
const slugOf = s => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const admin = lib.readAdmin(root) || {};
const projects = lib.readProjects(root);
const same = (a, b) => { try { return realpathSync(a) === realpathSync(b); } catch { return resolve(a) === resolve(b); } };
const below = (parent, child) => { const rel = relative(parent, child); return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel); };
// Resolve existing ancestors before creating anything, including links into the brain's storage.
const prospectivePath = path => {
  let ancestor = path; const tail = [];
  for (;;) {
    try { lstatSync(ancestor); break; }
    catch (e) { if (e.code !== "ENOENT") refuse(`${path}: ${e.message}`); }
    tail.unshift(basename(ancestor)); ancestor = dirname(ancestor);
  }
  try { return join(realpathSync(ancestor), ...tail); }
  catch (e) { refuse(`${path}: ${e.message}`); }
};
// A sub-folder project's path is personal, never the shared brain's business: keep it out of the brain's
// own git, locally and uncommitted, in .git/info/exclude. .gitignore is a file the person owns; this
// never writes to it or reads it.
const excludeLine = (rootDir, path) => "/" + relative(realpathSync(rootDir), realpathSync(path)).replace(/[\\*?\[\] ]/g, "\\$&") + "/";
const legacyExcludeLine = (rootDir, path) => `${relative(resolve(rootDir), resolve(path))}/`;
const addExclude = (rootDir, line) => {
  try {
    const path = lib.gitExcludePath(rootDir); if (!path) return false;
    mkdirSync(dirname(path), { recursive: true });
    const text = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (text.split("\n").includes(line) || text.split("\n").includes(line.slice(1))) return false;
    writeFileSync(path, text === "" || text.endsWith("\n") ? text + line + "\n" : text + "\n" + line + "\n");
    return true;
  } catch { return false; } // a filesystem surprise here must never crash a link
};
const removeExclude = (rootDir, line) => {
  try {
    const path = lib.gitExcludePath(rootDir); if (!path) return false;
    if (!existsSync(path)) return false;
    const text = readFileSync(path, "utf8");
    const trailingNewline = text.endsWith("\n");
    const lines = (trailingNewline ? text.slice(0, -1) : text).split("\n");
    if (!lines.includes(line)) return false;
    const kept = lines.filter(l => l !== line).join("\n");
    writeFileSync(path, kept + (trailingNewline ? "\n" : ""));
    return true;
  } catch { return false; }
};

if (opt.link) {
  if (!isAbsolute(String(opt.link))) refuse("give an absolute path");
  const path = resolve(String(opt.link));
  if (/[\r\n]/.test(path)) refuse("folder paths cannot contain line breaks");
  if (same(path, root)) refuse(`${path} is the brain itself: the brain is never a project.`);
  const rootReal = realpathSync(root), effectivePath = prospectivePath(path);
  if (below(effectivePath, rootReal)) refuse(`${path} contains the brain; a brain workspace cannot be linked as a project.`);
  const reserved = new Set(["brain", "work", ".git", ...HOST_DIRS, ".agents"]);
  for (const [base, target] of [[root, path], [rootReal, effectivePath]]) {
    if (reserved.has(relative(base, target).split(sep)[0].toLowerCase())) refuse(`${path} is GTM Brain internal storage; choose a project folder beside brain/ and work/.`);
  }
  if (opt.create && existsSync(path)) refuse(`${path} already exists; choose another name or use Link Project to connect the existing folder.`);
  if (existsSync(join(path, "brain", "admin.md"))) refuse(`${path} is another brain; a brain is never a project.`);
  // A folder nested inside someone else's brain (not this one) is that brain's business, never this one's.
  for (const candidate of [path, effectivePath]) for (let d = dirname(candidate); ; d = dirname(d)) {
    if (existsSync(join(d, "brain", "admin.md")) && !same(d, root)) refuse(`${path} is inside another brain (${d})`);
    if (dirname(d) === d) break;
  }
  // A folder that holds documents is a document home, not a project: linking it would take its documents out of
  // the scan and out of the brain's git. To work on a document, open its folder in Codex; it sees the brain unlinked.
  if (!opt.create && existsSync(path) && below(rootReal, effectivePath)) {
    const rel = relative(rootReal, effectivePath).split(sep).join("/");
    const held = listDocuments(root).filter(d => d.path.startsWith(`${rel}/`)).map(d => d.path);
    if (held.length) refuse(`${path} holds documents (${held.join(", ")}); a document's folder is not a project. To work on a document, open its folder in Codex: it sees the brain without being linked. Link only folders that hold deliverables (a website, an event).`);
  }
  const title = opt.title ? String(opt.title).trim() : basename(path);
  const slug = slugOf(opt.slug || title || basename(path)); if (!slug) refuse("give --slug or --title");
  if (projects.some(p => p.slug === slug)) refuse(`slug ${slug} is taken by ${projects.find(p => p.slug === slug).path}; unlink it first or choose another`);
  if (projects.some(p => same(p.path, path))) refuse(`${path} is already a project (${projects.find(p => same(p.path, path)).slug})`);
  const existing = existsSync(path) ? lib.readPointer(path) : null;
  if (existing && !existing.missing) refuse(`${path} is already a project of ${existing.brain}; unlink it there first`);
  const nestedProject = folder => refuse(`${path} overlaps linked project ${folder}. A linked folder is one project, not a workspace for nested projects. Use New Project to create a separate folder directly inside ${root}. Existing files stay in place.`);
  // Check pointers even across repository boundaries and outside this brain's local registry.
  // Resolve aliases too, so a symlink cannot hide the enclosing project's pointer.
  for (const candidate of [path, effectivePath]) for (let d = dirname(candidate); ; d = dirname(d)) {
    if (lib.readPointer(d)) nestedProject(d);
    if (dirname(d) === d) break;
  }
  for (const p of projects) {
    if (lib.projectPointerStatus(root, p) !== "ok") continue;
    const other = realpathSync(p.path);
    if (below(other, effectivePath) || below(effectivePath, other) || below(p.path, path) || below(path, p.path)) nestedProject(p.path);
  }
  const contexts = String(opt.contexts || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const c of contexts) { const x = lib.readContext(root, c); if (!x) refuse(`no such context: ${c}`); if (x.status !== "active") refuse(`${c} is archived; unarchive it first`); }
  const by = opt.by ? lib.teamHandle(root, String(opt.by)) : null; if (opt.by && !by) refuse(`"${opt.by}" is not in admin.md team`);
  // Exclusive creation also refuses a folder that appeared after validation. Existing-folder
  // linking keeps its original behavior; new projects require an existing parent directory.
  try { mkdirSync(path, { recursive: !opt.create }); } catch (e) { refuse(`${path}: ${e.message}`); }
  // Codex reads AGENTS.md from the nearest git root down to cwd: a sub-folder inherits the brain's rulebook only
  // when no .git sits between it and the brain. A nested repository gets the rulebook line like an outside folder.
  const contained = realpathSync(path).startsWith(rootReal + "/");
  const inside = (() => { let d = realpathSync(path); if (!contained) return false; for (; d !== rootReal; d = dirname(d)) if (existsSync(join(d, ".git"))) return false; return true; })();
  // Only now, after every validation, is the stale pointer touched: every refusal above leaves it exactly
  // as it was. If the write that replaces it still fails, the previous file text goes back verbatim.
  let repaired = false, previousText = null;
  if (existing && existing.missing) {
    const agentsFile = join(path, "AGENTS.md");
    try { previousText = readFileSync(agentsFile, "utf8"); } catch { previousText = null; }
    lib.removePointer(path); repaired = true;
  }
  try { lib.writePointer(path, { brain: root, slug, title, company: admin.company || basename(root), inside }); }
  catch (e) { if (repaired) { try { writeFileSync(join(path, "AGENTS.md"), previousText ?? ""); } catch {} } refuse(`${path}: ${e.message}`); }
  const exclusion = contained ? excludeLine(root, path) : null;
  const excluded = contained && addExclude(root, exclusion);
  lib.writeProjects(root, [...projects, { slug, title, path, contexts, linkedAt: new Date().toISOString(), by, excluded: !!excluded, exclusion: excluded ? exclusion : null }]);
  lib.writeLoaded(root, contexts, slug);
  // The brain's own skills show in this project too: Codex scans each project's .agents/skills.
  const skillLinks = us.reconcileProjectSkills(root, slug);
  lib.logActivity(root, "project", `${opt.create ? "created" : "linked"} ${slug} at ${path}`);
  if (opt.create) console.log(`Created ${title} at ${path}. Work here uses ${admin.company || basename(root)}'s shared company knowledge.`);
  else console.log(`linked ${slug} at ${path} · loaded: ${contexts.join(", ") || "nothing yet"}${inside ? " · inside the brain (its rules are inherited)" : ""}${excluded ? " · excluded from the brain's git on this machine (a personal path)" : ""}${repaired ? ` · replaced a pointer to a brain that was gone (${existing.brain})` : ""}${skillLinks.linked.length ? ` · skills linked: ${skillLinks.linked.join(", ")}` : ""}`);
  // A code repo's AGENTS.md is usually tracked: the block shows in its git status and, once committed,
  // in every clone, branch and worktree, with this machine's brain path in it. The person decides.
  if (!inside) { try { execFileSync("git", ["-C", path, "rev-parse", "--show-toplevel"], { stdio: "ignore" }); console.log(`Git: the link is a block at the end of ${join(path, "AGENTS.md")}, in this git repository. Commit it and every worktree and clone of this repository uses the brain (it names this machine's brain path); leave it uncommitted and only this checkout does. The skill links under .agents/skills are kept out of this repository's git on this machine.`); } catch {} }
  // The owning workflow launches through the shell so native permissions stay in that flow.
  // A link or a successful launcher is not evidence of visibility in Codex's sidebar.
  const quotedPath = "'" + path.replace(/'/g, "'\\''") + "'";
  console.log(`Next on macOS: run codex app ${quotedPath} through the shell with normal permissions unless already in that folder or opening was declined. Skip when GTM_BRAIN_NO_OPEN is set. On Windows and other platforms, use the manual fallback.`);
  console.log(`Sidebar visibility: unverified. Always include this fallback with the actual path in the reply:\nIf you don't see ${title} in the sidebar:\n1. In Codex choose New project (or + beside Projects). In the ChatGPT desktop app, use Projects > Create / New project, then Add folder / Choose source folders.\n2. Select ${path}. On macOS, press Cmd+Shift+G in the folder picker, paste that path, press Return, then Open. If a project form remains, name it ${title} and save it.\n3. Select that project and start a New task / New chat there. Notes from there carry project:${slug}.\nThe folder is already linked; do not link it again. A failed or skipped launch does not undo the link.`);
  lib.rerender(root); process.exit(0);
}
if (opt.unlink) {
  const slug = String(opt.unlink); const p = projects.find(x => x.slug === slug); if (!p) refuse(`no project ${slug}; projects: ${projects.map(x => x.slug).join(", ") || "none"}`);
  // The pointer at p.path may since have been repointed (by hand or by another brain's --link): only
  // this brain's own pointer is ours to remove.
  const ptr = lib.readPointer(p.path);
  let elsewhere = "";
  if (!ptr || (same(ptr.brain, root) && ptr.slug === slug)) {
    lib.removePointer(p.path);
    if (p.excluded) { try { removeExclude(root, p.exclusion || legacyExcludeLine(root, p.path)); } catch {} }
  } else {
    elsewhere = ` · pointer at ${p.path} now belongs to ${ptr.brain}; left in place`;
  }
  for (const s of us.listUserSkills(root)) { const l = join(p.path, ".agents", "skills", s.id); try { if (lstatSync(l).isSymbolicLink()) rmSync(l, { recursive: true }); } catch {} }
  rmSync(join(root, "work", "projects", slug), { recursive: true, force: true });
  lib.writeProjects(root, projects.filter(x => x.slug !== slug));
  lib.logActivity(root, "project", `unlinked ${slug}`);
  console.log(`unlinked ${slug} (${p.path}); its notes keep the tag project:${slug}.${elsewhere}`); lib.rerender(root); process.exit(0);
}
if (opt.list) {
  const rows = projects.map(p => { const loaded = lib.readLoaded(root, p.slug); const last = lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).filter(m => m.tags.includes(`project:${p.slug}`)).map(m => m.at).sort().pop() || null; return { ...p, loaded, lastNote: last, pointer: lib.projectPointerStatus(root, p) === "ok", pointerStatus: lib.projectPointerStatus(root, p) }; });
  if (opt.available) {
    const available = await listCodexProjects();
    console.log(JSON.stringify({ projects: rows, codex: available, guidance: "Codex projects are candidates, not capture consent. Ask which existing projects to follow with native checkboxes. Verify each selected folder and link only after submission. An empty or unavailable catalog does not establish that the person has no projects; offer to name a missing folder. Stay in the onboarding chat." }, null, 1));
    process.exit(0);
  }
  if (opt.json) { console.log(JSON.stringify({ projects: rows }, null, 1)); process.exit(0); }
  if (!rows.length) { console.log("no projects linked to this brain. In a folder: /gtm-brain-project links it."); process.exit(0); }
  for (const r of rows) console.log(`• ${r.slug} (${r.title}) · ${r.path}${r.pointer ? "" : " · pointer invalid (missing, moved or linked elsewhere)"}\n  contexts: ${r.contexts.join(", ") || "none"} · loaded: ${r.loaded.join(", ") || "nothing"} · last note: ${r.lastNote ? lib.localDateTime(r.lastNote) : "none"}`);
  process.exit(0);
}
console.error("usage: project.mjs <root> --link <path> [--create] [--slug s] [--title T] [--contexts a,b] [--by h] | --unlink <slug> | --list [--json]"); process.exit(1);
