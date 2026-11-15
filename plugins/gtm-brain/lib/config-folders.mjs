// Layout 3: the base files move into about-us/, RULES.md and SCHEMA.md into config/ (rules.md, schema.md), and
// brain/admin.md becomes config/settings.yaml (lib/brain-paths.mjs). The move is an upgrade step that asks first
// (lib/upgrade-files.mjs layoutStep, upgrade_brain with confirm), runs only for the owner, never in a scheduled or
// background run (GTM_BRAIN_RUN), moves with git mv so every byte of the person's text stays, and commits the
// moves, settings.yaml, the removal of admin.md and brain/layout.json set to 3 in one commit.
//
// What counts as a base file: a document (kind: document) at the root, with the folder of its name beside it
// (design-system/ next to design-system.md), any other file at the root named like it (design-system.html), and
// a document in a folder of its own name at the root (strategy/strategy.md). Workflows and documents in the
// team's own folders (brand/voice.md) stay where they are. A name already taken in about-us/ is left alone and
// reported.
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { listDocuments, inOwnFolder, SKIP_DIRS, projectDirs } from "./documents.mjs";
import { readLayout, writeLayout, understandsLayout, LAYOUT_FILE } from "./layout-version.mjs";
import { diskLayout } from "./layout.mjs";
import { settingsFromAdmin, logActivity, rerender, readAdmin } from "./brain.mjs";
const readAdminCompany = root => String(readAdmin(root)?.company || "");
import { ADMIN_FILE, SETTINGS_FILE, ABOUT_DIR, CONFIG_DIR, CONFIG_RULES, CONFIG_SCHEMA, ROOT_RULES, ROOT_SCHEMA, FIXED_MOVES, inConfigFolders } from "./brain-paths.mjs";
import { ownerOf, personHere } from "./owner.mjs";

const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };

/* What the move would do: {moves: [[from, to]], kept: [[from, why]], settings: true when admin.md becomes settings.yaml}. Changes nothing. */
export function configMovePlan(root) {
  if (inConfigFolders(root)) return { moves: [], kept: [], settings: false };
  const moves = [], kept = [], taken = new Set();
  const add = (from, to) => {
    if (!existsSync(join(root, from)) || moves.some(([f]) => f === from)) return;
    if (existsSync(join(root, to)) || taken.has(to)) { kept.push([from, `${to} already exists`]); return; }
    moves.push([from, to]); taken.add(to);
  };
  let top = []; try { top = readdirSync(root, { withFileTypes: true }); } catch {}
  // Never a document's files folder, whatever a document at the top is called: the engine's folders (a document
  // titled Brain or Work would take brain/ or work/ with it), the projects, the workflows.
  const own = new Set([...SKIP_DIRS, ...projectDirs(root), "projects", "workflows", ABOUT_DIR, CONFIG_DIR]);
  for (const d of listDocuments(root)) {
    if (d.folder === "") {
      add(d.path, `${ABOUT_DIR}/${d.path}`);
      if (isDir(join(root, d.slug)) && !own.has(d.slug)) add(d.slug, `${ABOUT_DIR}/${d.slug}`);
      for (const e of top) if (e.isFile() && e.name !== `${d.slug}.md` && e.name.startsWith(`${d.slug}.`) && !e.name.endsWith(".md")) add(e.name, `${ABOUT_DIR}/${e.name}`);
    } else if (inOwnFolder(d) && !d.folder.includes("/") && !own.has(d.folder)) add(d.folder, `${ABOUT_DIR}/${d.folder}`);
  }
  for (const [from, to] of FIXED_MOVES) add(from, to);
  return { moves, kept, settings: existsSync(join(root, ADMIN_FILE)) && !existsSync(join(root, SETTINGS_FILE)) };
}

/* The move itself, after the owner's yes. Returns {moves, kept, layout, committed, note}; nothing when the brain is
   in layout 3 already, in a scheduled or background run, or for a plugin that does not understand layout 3.
   commit false (GTM_BRAIN_NO_COMMIT, a brain outside git) leaves the result staged on disk. */
export function migrateToConfigFolders(root, { commit = !process.env.GTM_BRAIN_NO_COMMIT } = {}) {
  const none = { moves: [], kept: [], layout: 0, committed: false, note: "" };
  // after the kind folders only (diskLayout 2): flat pages are asked about and moved first (upgrade.sh)
  if (inConfigFolders(root) || process.env.GTM_BRAIN_RUN || understandsLayout() < 3 || diskLayout(root) !== 2) return none;
  const recorded = readLayout(root); if (recorded.error) return none;
  const plan = configMovePlan(root);
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: "pipe" });
  let inGit = false; try { git("rev-parse", "--verify", "-q", "HEAD"); inGit = true; } catch {}
  const tracked = p => { try { return !!git("ls-files", "--", p).trim(); } catch { return false; } };
  const touched = [];
  for (const [from, to] of plan.moves) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    if (inGit && tracked(from)) git("mv", "-k", "--", from, to);
    if (existsSync(join(root, from))) { execFileSync("mv", ["--", join(root, from), join(root, to)]); }   // untracked files git mv left
    touched.push(from, to);
  }
  if (plan.settings) {
    mkdirSync(join(root, CONFIG_DIR), { recursive: true });
    writeFileSync(join(root, SETTINGS_FILE), settingsFromAdmin(readFileSync(join(root, ADMIN_FILE), "utf8")));
    if (inGit && tracked(ADMIN_FILE)) git("rm", "-q", "--", ADMIN_FILE); else execFileSync("rm", ["-f", join(root, ADMIN_FILE)]);
    touched.push(ADMIN_FILE, SETTINGS_FILE);
  }
  mkdirSync(join(root, ABOUT_DIR), { recursive: true });
  // A README nobody edited names the old places: rewritten with the new ones. An edited one is the person's.
  try {
    const now = readFileSync(join(root, "README.md"), "utf8"), company = readAdminCompany(root);
    if (company && shippedReadme(root, now, company)) {
      const next = layoutReadme(readFileSync(new URL("README.md", TEMPLATE_DIR), "utf8").replaceAll("{{COMPANY}}", company), root);
      if (next !== now) { writeFileSync(join(root, "README.md"), next); touched.push("README.md"); }
    }
  } catch {}
  const to = diskLayout(root);   // 3 now: settings.yaml is there
  writeLayout(root, { layout: to });
  touched.push(LAYOUT_FILE);
  let committed = false, note = "";
  if (inGit && commit) {
    const inHead = p => { try { return !!git("ls-tree", "-r", "--name-only", "HEAD", "--", p).trim(); } catch { return false; } };
    const paths = [...new Set(touched)].filter(p => existsSync(join(root, p)) || inHead(p));
    const onDisk = paths.filter(p => existsSync(join(root, p)));
    if (onDisk.length) git("add", "-A", "--", ...onDisk);   // the old paths are staged as removed already (git mv, git rm)
    const body = [...plan.moves.map(([f, t]) => `${f} -> ${t}`), ...(plan.settings ? [`${ADMIN_FILE} -> ${SETTINGS_FILE}`] : [])].join("\n");
    git("-c", "commit.gpgsign=false", "commit", "-q", "-m", `layout 3: base files in ${ABOUT_DIR}/, rules, schema and settings in ${CONFIG_DIR}/\n\n${body}`, "--", ...paths);
    committed = true; note = "kept";
  } else note = inGit ? "written to disk, not committed (GTM_BRAIN_NO_COMMIT)" : "written to disk (no git here)";
  logActivity(root, "change", `layout 3: ${plan.moves.length} moved into ${ABOUT_DIR}/ and ${CONFIG_DIR}/`);
  try { rerender(root); } catch {}
  return { moves: plan.moves, kept: plan.kept, settings: plan.settings, layout: to, committed, note };
}

/* The root README as setup writes it for this brain's layout: the shipped text names the root files; in layout 3
   the same text names about-us/ and config/ and says who changes them. Every writer of the README goes through
   here (setup, the upgrade, the chat start's refresh), so a shipped README is recognized in either layout. */
export function layoutReadme(text, root) {
  if (!inConfigFolders(root)) return text;
  return String(text)
    .replace("[RULES.md](RULES.md) is", "[config/rules.md](config/rules.md) is")
    .replace("[SCHEMA.md](SCHEMA.md) says", "[config/schema.md](config/schema.md) says")
    .replace("with the RULES.md row", "with the rules.md row")
    .replace("Four documents are here from day one: ", "Four documents are here from day one, in `about-us/`: ")
    .replace("what it belongs to.\n", "what it belongs to.\n\nOnly the owner named in `config/settings.yaml` changes `about-us/` and `config/`. A teammate's change\nwaits there as a proposal, and the owner approves it or not at the start of their next chat.\n")
    .replace("`brain/admin.md` is always loaded", "`config/settings.yaml` is always loaded")
    .replace("- `admin.md`: the company profile. Protected.\n", "- `proposals/`: teammates' changes to `about-us/` and `config/`, waiting for the owner.\n");
}
const TEMPLATE_DIR = new URL("../templates/", import.meta.url);
/* README.md exactly as a release wrote it (any layout's wording): the move rewrites it for layout 3. */
function shippedReadme(root, text, company) {
  const render = t => t.replaceAll("{{COMPANY}}", company);
  const shipped = [readFileSync(new URL("README.md", TEMPLATE_DIR), "utf8")];
  try { const dir = new URL("legacy/readme/", TEMPLATE_DIR); for (const f of readdirSync(dir)) if (f.endsWith(".md")) shipped.push(readFileSync(new URL(f, dir), "utf8")); } catch {}
  return shipped.map(render).includes(text);
}

/* The chat start of a layout 3 brain, one line: where the files are that the rulebook, the rule pages and the tool
   descriptions still call RULES.md, SCHEMA.md, brain/admin.md and a document "at the top", and whose they are.
   Without it a model follows those names literally (a new RULES.md at the top, which nothing reads) or spends a
   call finding out that a teammate's change there is a proposal. "" before layout 3. */
export function layoutStartLine(root) {
  if (!inConfigFolders(root)) return "";
  const where = `This brain keeps its base documents in ${ABOUT_DIR}/ and its configuration in ${CONFIG_DIR}/: where the rules or a tool say ${ROOT_RULES} is ${CONFIG_RULES}, ${ROOT_SCHEMA} is ${CONFIG_SCHEMA}, ${ADMIN_FILE} is ${SETTINGS_FILE}, and a document "at the top" or "at the brain root" (strategy.md, icp.md, voice.md, design-system.md, market.md, a new one) is in ${ABOUT_DIR}/. Never create ${ROOT_RULES}, ${ROOT_SCHEMA} or ${ADMIN_FILE}.`;
  const owner = ownerOf(root); if (!owner) return where;
  if (personHere(root) === owner) return `${where} You are the owner: only you change those two folders, and a teammate's change waits for your approval.`;
  const name = (readAdmin(root)?.team || []).find(p => p && p.handle === owner)?.name || owner;
  return `${where} Only the owner (${name}) changes ${ABOUT_DIR}/ and ${CONFIG_DIR}/: make a change there as usual (the tool, or the file and save) and it is kept as a proposal for the owner, not applied; say that in one line and do not try another way.`;
}

/* The sentence the layout question says before it asks: what moves, and what it means for teammates. */
export function configMoveWhat(root) {
  const plan = configMovePlan(root), base = plan.moves.filter(([, t]) => t.startsWith(`${ABOUT_DIR}/`)).map(([f]) => f);
  const cfg = plan.moves.filter(([, t]) => t.startsWith(`${CONFIG_DIR}/`)).map(([f]) => f);
  const parts = [];
  if (base.length) parts.push(`${base.join(", ")} into ${ABOUT_DIR}/`);
  if (cfg.length || plan.settings) parts.push(`${[...cfg, ...(plan.settings ? [ADMIN_FILE] : [])].join(", ")} into ${CONFIG_DIR}/ (${[...cfg.map(f => basename(f).toLowerCase()), ...(plan.settings ? ["settings.yaml"] : [])].join(", ")})`);
  return `It moves ${parts.join(", and ") || "nothing yet"}, word for word, in one commit; from then on only the owner changes anything there, and a teammate's change waits as a proposal for the owner's yes. A GTM Brain older than this one looks for ${ADMIN_FILE} and no longer finds the brain at all, so it neither reads nor saves here until that teammate updates.${plan.kept.length ? ` Left where they are: ${plan.kept.map(([f, w]) => `${f} (${w})`).join(", ")}.` : ""}`;
}
