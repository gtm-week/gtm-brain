// Layout 4: the brain's folders are the dashboard's tabs (lib/brain-paths.mjs). This is the move from layout 3:
//   about-us/                              -> configuration/about-us/
//   config/ (rules, schema, settings)      -> configuration/
//   brain/ontology.ossie.json              -> configuration/interactions.json   (the same bytes)
//   brain/proposals/                       -> configuration/proposals/
//   brain/entities/                        -> entities/   (the generated index.md of each kind folder removed)
//   brain/entities.md, brain/names.md      -> entities/.history/   (old registries a brain may still carry)
//   brain/contexts/<slug>/context.md       -> memories/topics/<slug>.md
//   brain/contexts/<slug>/memories.jsonl   -> each line, byte for byte, appended to memories/<YYYY-MM>.jsonl,
//                                             the month (UTC) of its `at`; contexts in name order, lines in file order
//   brain/layout.json                      -> layout.json, saying 4
//   work/                                  -> .gtm-brain/   (this computer only, not in git)
// Like the move to layout 3 it is an upgrade step that asks first (lib/upgrade-files.mjs layoutStep, upgrade_brain
// with confirm), runs only for the owner, never in a scheduled or background run, and only from layout 3 (the
// upgrade brings a layout 1 or 2 brain there first, in the same run). Files move with git mv, so every byte of a
// person's text stays and git records renames. Before anything is committed the notes are counted again: the same
// lines, the same ids, the same order inside each context and month. A full copy of what moves is kept under
// .gtm-brain/upgrades/, and the move is one commit: reverting it brings every old file back.
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, renameSync, rmSync, cpSync, chmodSync, appendFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { logActivity, rerender, readAdmin, readNames, commit as libCommit, entitiesPaths } from "./brain.mjs";   // first: the lib's modules import each other in a circle that starts here
import { readLayout, writeLayout, understandsLayout } from "./layout-version.mjs";
import { diskLayout, INDEX_FILE } from "./layout.mjs";
import { layoutReadme, readmeInFolders } from "./config-folders.mjs";
import { rulesInFolders, rulesInTabs } from "./where.mjs";
import * as P from "./brain-paths.mjs";

const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));
/* Rebuilt from the files after the move, never carried over: the search index (its version changed), the rendered
   dashboard, the page cache, the append receipts (keyed by context before, by month now) and what a running
   server or lock left behind. Everything else in work/ moves as it is. */
export const DISPOSABLE = [/^memory-index/, /^home$/, /^memory-appends$/, /^entity-pages\.json$/, /^population\.json$/, /^dash\.json$/, /^brain-watch\.(json|lock)$/, /^render-(lock\.sqlite.*|request\.json|state\.json)$/, /^entity-write\.lock$/];

/* The dashboard server and the file watcher of this brain keep work/ open: stopped before the folder is renamed.
   Only a process whose command line names this folder and that script: a brain copied from another folder carries
   that folder's state files, and its servers are not this brain's to stop. */
function stopServers(root) {
  let real = root; try { real = realpathSync(root); } catch {}
  for (const [file, script] of [["dash.json", "dash.mjs"], ["brain-watch.json", "brain-watch.mjs"]]) {
    try {
      const pid = JSON.parse(readFileSync(join(root, "work", file), "utf8")).pid; if (!Number.isInteger(pid)) continue;
      const cmd = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", stdio: "pipe" });
      if (cmd.includes(script) && (cmd.includes(root) || cmd.includes(real))) process.kill(pid);
    } catch {}
  }
}

/* The old files of notes, as they are: [{slug, file, lines}] with contexts in name order. Throws on a line that is
   no JSON, has no `at`, or names another context than its folder: nothing is moved for a brain like that. */
function readOldNotes(root) {
  const dir = join(root, P.CONTEXTS_DIR); let slugs = [];
  try { slugs = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch {}
  return slugs.map(slug => {
    const file = `${P.CONTEXTS_DIR}/${slug}/memories.jsonl`; let text = "";
    try { text = readFileSync(join(root, file), "utf8"); } catch { return { slug, file: null, lines: [] }; }
    const lines = text.split("\n").filter(l => l.trim());
    lines.forEach((l, i) => {
      let r; try { r = JSON.parse(l); } catch { throw new Error(`${file} line ${i + 1} is not valid JSON; fix or restore that file first`); }
      if (!r || typeof r.id !== "string" || r.context !== slug) throw new Error(`${file} line ${i + 1} belongs to "${r?.context}", not ${slug}; fix or restore that file first`);
      if (!Number.isFinite(Date.parse(r.at))) throw new Error(`${file} line ${i + 1} has no readable date (at)`);
    });
    return { slug, file, lines };
  });
}
/* Month file -> its lines, from the old notes. */
function monthBuckets(old) {
  const months = new Map();
  for (const c of old) for (const l of c.lines) { const f = P.monthFile(JSON.parse(l).at); if (!months.has(f)) months.set(f, []); months.get(f).push(l); }
  return new Map([...months].sort(([a], [b]) => a.localeCompare(b)));
}

/* What the move would do. Changes nothing. {moves: [[from, to]], notes, months, topics, indexes, blocked} */
export function tabsMovePlan(root) {
  const none = { moves: [], notes: 0, months: [], topics: 0, indexes: [], extra: [], blocked: "" };
  if (P.inLayout4(root)) return none;
  // a folder of the team's own already under one of the names: nothing moves until it is renamed
  const taken = [P.CONFIGURATION_DIR, P.ENTITIES_DIR4, P.NOTES_DIR, P.LAYOUT_FILE4, P.WORK_DIR4].filter(p => existsSync(join(root, p)));
  if (taken.length) return { ...none, blocked: `${taken.join(", ")} already ${taken.length === 1 ? "exists" : "exist"} at the top of the brain; rename ${taken.length === 1 ? "it" : "them"} first` };
  const moves = [], add = (from, to) => { if (existsSync(join(root, from))) moves.push([from, to]); };
  add(P.CONFIG_DIR, P.CONFIGURATION_DIR);
  add(P.ABOUT_DIR, P.ABOUT_DIR4);
  add(P.INTERACTIONS_OLD, P.INTERACTIONS_FILE4);
  add(P.PROPOSALS_DIR, "configuration/proposals");
  add(P.ENTITIES_OLD, P.ENTITIES_DIR4);
  for (const f of ["brain/entities.md", "brain/names.md"]) add(f, `${P.ENTITIES_DIR4}/.history/${f.split("/").pop()}`);
  let old; try { old = readOldNotes(root); } catch (e) { return { ...none, blocked: e.message }; }
  const extra = [];
  for (const c of old) {
    add(`${P.CONTEXTS_DIR}/${c.slug}/context.md`, `${P.TOPICS_DIR}/${c.slug}.md`);
    // anything else a person put in a context's folder goes with its topic
    try { for (const f of readdirSync(join(root, P.CONTEXTS_DIR, c.slug))) if (f !== "context.md" && f !== "memories.jsonl") { moves.push([`${P.CONTEXTS_DIR}/${c.slug}/${f}`, `${P.TOPICS_DIR}/${c.slug}/${f}`]); extra.push(`${P.CONTEXTS_DIR}/${c.slug}/${f}`); } } catch {}
  }
  add(P.LAYOUT_FILE_OLD, P.LAYOUT_FILE4);
  const indexes = []; try { for (const d of readdirSync(join(root, P.ENTITIES_OLD), { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".") && existsSync(join(root, P.ENTITIES_OLD, d.name, INDEX_FILE))) indexes.push(`${P.ENTITIES_OLD}/${d.name}/${INDEX_FILE}`); } catch {}
  const months = monthBuckets(old);
  return { moves, notes: old.reduce((n, c) => n + c.lines.length, 0), months: [...months.keys()], topics: old.filter(c => existsSync(join(root, P.CONTEXTS_DIR, c.slug, "context.md"))).length, indexes, extra, blocked: "" };
}

/* The sentence the layout question says before it asks. */
export function tabsMoveWhat(root) {
  const plan = tabsMovePlan(root);
  if (plan.blocked) return `The move to the four folders (configuration/, entities/, memories/, workflows/) cannot run yet: ${plan.blocked}.`;
  return `It puts the brain into four folders, the dashboard's tabs: configuration/ (about-us/, rules.md, schema.md, settings.yaml, interactions.json), entities/, memories/ (the ${plan.notes} note${plan.notes === 1 ? "" : "s"} of ${plan.topics} topic${plan.topics === 1 ? "" : "s"} become${plan.notes === 1 ? "s" : ""} one file per month, ${plan.months.length} file${plan.months.length === 1 ? "" : "s"}, every line unchanged; each topic's summary goes to memories/topics/) and workflows/. There is no brain/ folder afterwards, the generated index.md of each entity folder is removed (${plan.indexes.length}), and this computer's work/ folder becomes the hidden .gtm-brain/. Everything moves word for word in one commit, with a full copy kept in .gtm-brain/upgrades/. A GTM Brain older than this one finds no brain here afterwards, so it neither reads nor saves until that teammate updates.`;
}

/* The move, after the owner's yes. Returns {layout, moves, notes, months, committed, note, backup, pages} or
   {layout: 0, refused} when it did not run. commit false (GTM_BRAIN_NO_COMMIT, a brain outside git) leaves the
   result on disk, staged where git is there. */
export function migrateToTabs(root, { commit = !process.env.GTM_BRAIN_NO_COMMIT } = {}) {
  const none = why => ({ layout: 0, moves: [], notes: 0, months: [], committed: false, note: "", refused: why || "" });
  if (P.inLayout4(root) || process.env.GTM_BRAIN_RUN || understandsLayout() < 4) return none();
  if (diskLayout(root) !== 3) return none();   // layouts 1 and 2 are asked about and moved to 3 first (upgrade.sh)
  const recorded = readLayout(root); if (recorded.error) return none(recorded.error);
  const plan = tabsMovePlan(root); if (plan.blocked) return none(plan.blocked);
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: "pipe", maxBuffer: 256 << 20 });
  let inGit = false; try { git("rev-parse", "--verify", "-q", "HEAD"); inGit = true; } catch {}
  const MOVED = ["brain", P.ABOUT_DIR, P.CONFIG_DIR];
  // everything the move touches and nothing else: a person's unsaved document elsewhere stays out of the commit
  const TOUCHED = [...MOVED, P.CONFIGURATION_DIR, P.ENTITIES_DIR4, P.NOTES_DIR, P.LAYOUT_FILE4, ".gitattributes", ".gitignore", ".githooks", "README.md"];
  // What moves must be as git has it: an unsaved edit there would be mixed into the move, and could not be put back.
  if (inGit) {
    const dirty = git("status", "--porcelain", "--untracked-files=all", "--", ...MOVED).split("\n").filter(Boolean);
    if (dirty.length) return none(`${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"} under brain/, about-us/ or config/ (${dirty.slice(0, 3).map(l => l.slice(3)).join(", ")}${dirty.length > 3 ? ", ..." : ""}); save first, then upgrade again`);
  }
  const old = readOldNotes(root), months = monthBuckets(old);
  const idsBefore = new Set(readNames(root).map(e => e.id));
  stopServers(root);

  // 1. the copy: everything that moves, as it was
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"), backupRel = `upgrades/layout-4-${stamp}`, backup = join(root, "work", backupRel);
  mkdirSync(backup, { recursive: true });
  for (const p of [...MOVED, ".gitattributes", ".gitignore", ".githooks", "README.md"]) if (existsSync(join(root, p))) cpSync(join(root, p), join(backup, p), { recursive: true });

  const undo = () => {
    if (inGit) { try { git("reset", "-q", "HEAD", "--", ...TOUCHED); } catch {} }
    for (const p of [P.CONFIGURATION_DIR, P.ENTITIES_DIR4, P.NOTES_DIR, P.LAYOUT_FILE4]) rmSync(join(root, p), { recursive: true, force: true });
    for (const p of [...MOVED, ".gitattributes", ".gitignore", ".githooks", "README.md"]) if (existsSync(join(backup, p))) { rmSync(join(root, p), { recursive: true, force: true }); cpSync(join(backup, p), join(root, p), { recursive: true }); }
    if (!existsSync(join(root, "work")) && existsSync(join(root, P.WORK_DIR4))) renameSync(join(root, P.WORK_DIR4), join(root, "work"));
  };
  try {
    // 2. the files that keep their bytes: git mv (a rename in the commit), plain mv for what git does not hold
    const tracked = p => { try { return !!git("ls-files", "--", p).trim(); } catch { return false; } };
    for (const [from, to] of plan.moves) {
      if (!existsSync(join(root, from))) continue;
      mkdirSync(dirname(join(root, to)), { recursive: true });
      if (inGit && tracked(from)) git("mv", "-k", "--", from, to);
      if (existsSync(join(root, from))) {
        if (isDir(join(root, from)) && existsSync(join(root, to))) { cpSync(join(root, from), join(root, to), { recursive: true }); rmSync(join(root, from), { recursive: true, force: true }); }   // untracked files git mv left in a folder
        else renameSync(join(root, from), join(root, to));
      }
    }
    // 3. the generated index of each kind folder: layout 4 keeps pages only
    for (const f of plan.indexes) rmSync(join(root, P.ENTITIES_DIR4, f.slice(P.ENTITIES_OLD.length + 1)), { force: true });
    // 4. the notes: one file per month, each line as it was
    mkdirSync(join(root, P.NOTES_DIR), { recursive: true });
    for (const [file, lines] of months) writeFileSync(join(root, file), lines.join("\n") + "\n");
    for (const c of old) if (c.file) rmSync(join(root, c.file), { force: true });
    // 5. what is left of brain/: empty folders go; a file nobody knows stays where it is, and is said
    const prune = dir => { let left = 0; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) left += prune(p); else left++; } if (!left) rmSync(dir, { recursive: true, force: true }); return left; };
    const leftover = existsSync(join(root, "brain")) ? prune(join(root, "brain")) : 0;
    // 6. this computer's folder
    if (existsSync(join(root, "work"))) renameSync(join(root, "work"), join(root, P.WORK_DIR4));
    const work = join(root, P.WORK_DIR4); mkdirSync(work, { recursive: true });
    for (const f of readdirSync(work)) if (DISPOSABLE.some(re => re.test(f))) rmSync(join(work, f), { recursive: true, force: true });
    // 7. git's own files and the texts that name the old places
    const ignore = join(root, ".gitignore"), ignored = existsSync(ignore) ? readFileSync(ignore, "utf8") : "";
    if (!ignored.split("\n").includes(`${P.WORK_DIR4}/`)) writeFileSync(ignore, `${ignored}${ignored && !ignored.endsWith("\n") ? "\n" : ""}${P.WORK_DIR4}/\n`);
    const attrs = join(root, ".gitattributes"), oldAttrs = new Set([...P.mergeAttributes(null), "brain/contexts/*/context.md merge=gtm-os-cover"]);
    const kept = (existsSync(attrs) ? readFileSync(attrs, "utf8") : "# gtm-brain: parallel branches merge notes as lines and keep the newer summary\n").split("\n").filter(l => !oldAttrs.has(l));
    while (kept.length && kept[kept.length - 1] === "") kept.pop();
    writeFileSync(attrs, [...kept, ...P.mergeAttributes(root).filter(l => !kept.includes(l))].join("\n") + "\n");
    if (existsSync(join(root, ".githooks"))) for (const h of ["pre-commit", "post-merge"]) { writeFileSync(join(root, ".githooks", h), readFileSync(join(TEMPLATES, "githooks", h), "utf8")); chmodSync(join(root, ".githooks", h), 0o755); }
    const company = String(readAdmin(root)?.company || "");
    // README and rules nobody edited name the old places: the same shipped text in this layout's words. Edited ones are the person's.
    try {
      const render = (t, as3) => { const text = t.replaceAll("{{COMPANY}}", company); return as3 ? readmeInFolders(text) : layoutReadme(text, root); };
      const shipped = [readFileSync(join(TEMPLATES, "README.md"), "utf8")];
      try { for (const f of readdirSync(join(TEMPLATES, "legacy", "readme"))) if (f.endsWith(".md")) shipped.push(readFileSync(join(TEMPLATES, "legacy", "readme", f), "utf8")); } catch {}
      const now = readFileSync(join(root, "README.md"), "utf8");
      if (company && shipped.some(t => render(t, true) === now || t.replaceAll("{{COMPANY}}", company) === now)) writeFileSync(join(root, "README.md"), render(shipped[0], false));
    } catch {}
    try {
      const rules = join(root, P.rulesFile(root)), raw = readFileSync(join(TEMPLATES, "RULES.md"), "utf8"), now = readFileSync(rules, "utf8");
      if (now === rulesInFolders(raw) || now === raw) writeFileSync(rules, rulesInTabs(raw));
    } catch {}
    // 8. the layout file says 4
    writeLayout(root, { layout: 4 });

    // 9. counted again, from the new files, before anything is committed
    const after = new Map();
    for (const f of P.noteFiles(root)) for (const l of readFileSync(join(root, f), "utf8").split("\n")) { if (!l.trim()) continue; const c = JSON.parse(l).context; if (!after.has(c)) after.set(c, []); after.get(c).push(l); }
    for (const c of old) {
      const was = [...c.lines].sort(), is = [...(after.get(c.slug) || [])].sort();
      if (was.length !== is.length || was.some((l, i) => l !== is[i])) throw new Error(`the notes of ${c.slug} do not read back the same (${was.length} before, ${is.length} after)`);
    }
    const total = [...after.values()].reduce((n, l) => n + l.length, 0);
    if (total !== plan.notes) throw new Error(`${plan.notes} notes before, ${total} after`);
    const idsAfter = new Set(readNames(root).map(e => e.id));
    if (idsAfter.size !== idsBefore.size || [...idsBefore].some(id => !idsAfter.has(id))) throw new Error(`${idsBefore.size} entities before, ${idsAfter.size} after`);
    for (const c of old) if (existsSync(join(backup, P.CONTEXTS_DIR, c.slug, "context.md")) && readFileSync(join(backup, P.CONTEXTS_DIR, c.slug, "context.md"), "utf8") !== readFileSync(join(root, P.coverFile(root, c.slug)), "utf8")) throw new Error(`the summary of ${c.slug} changed in the move`);

    // 10. one commit. Past the pre-commit hook, which refuses a deleted file of notes: this is the one place
    // that deletes them, after reading every line back.
    let committed = false, note = "";
    if (inGit && commit) {
      const inHead = p => { try { return !!git("ls-tree", "-r", "--name-only", "HEAD", "--", p).trim(); } catch { return false; } };
      const paths = TOUCHED.filter(p => existsSync(join(root, p)) || inHead(p)), onDisk = paths.filter(p => existsSync(join(root, p)));
      if (onDisk.length) git("add", "-A", "--", ...onDisk);
      const body = [...plan.moves.map(([f, t]) => `${f} -> ${t}`), `${plan.notes} notes of ${old.length} contexts -> ${[...months.keys()].join(", ") || "no notes yet"}`, ...plan.indexes.map(f => `removed ${f} (generated)`)].join("\n");
      git("-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", `layout 4: configuration/, entities/, memories/ and workflows/\n\n${body}`, "--", ...paths);
      committed = true; note = "kept";
    } else note = inGit ? "written to disk, not committed (GTM_BRAIN_NO_COMMIT)" : "written to disk (no git here)";
    logActivity(root, "change", `layout 4: ${plan.moves.length} moved, ${plan.notes} notes in ${months.size} month file${months.size === 1 ? "" : "s"}`);
    // 11. the entity pages' generated links name the old folders: rendered again by the usual page refresh, in a
    // commit of its own so the move itself stays a list of renames
    let pages = "";
    if (committed) { try { pages = libCommit(root, entitiesPaths(root), "layout 4: entity pages link to memories/", { system: true }).note; } catch (e) { pages = `pages not refreshed yet: ${e.message}`; } }
    try { rerender(root); } catch {}
    return { layout: 4, moves: plan.moves, notes: plan.notes, months: [...months.keys()], topics: plan.topics, indexes: plan.indexes, extra: plan.extra, leftover, committed, note, pages, backup: `${P.WORK_DIR4}/${backupRel}` };
  } catch (e) {
    undo();
    try { appendFileSync(join(root, "work", "hooks.log"), `${new Date().toISOString()}  change  layout 4 not applied: ${e.message}; everything was put back\n`); } catch {}
    return none(`the move was stopped and everything put back: ${e.message}`);
  }
}
