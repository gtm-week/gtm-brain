// RULES.md: the one file a brain's people edit to change how it behaves (Artur, 2026-11-10: "where is the
// if-then I can change"). Its "Where things go" table says where every file goes; its "Our rules" section
// holds their own rules for what Codex saves and asks (saving-rules.md R1, R2). Setup writes it; a brain
// without one gets it at the chat start; an unedited one follows the shipped template; an edited one is
// never touched. Until 0.33.9 these were two files, WHERE.md and a RULES.md that only R2 created; the chat
// start merges them once (2026-11-13). Every chat's opening lines carry the rows and the projects under
// projects/, so a deliverable goes into the project it belongs to instead of a folder of its own.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { rulesFile, OLD_WHERE, TEMPLATES, ROOT_KEEP, ABOUT_DIR, ABOUT_DIR4, inConfigFolders, inLayout4 } from "./brain-paths.mjs";
import { readAdmin, commit } from "./brain.mjs";
import { layoutBlock } from "./layout-version.mjs";
import { workDir } from './brain-paths.mjs';

export { OLD_WHERE };
/* The rules file of this brain: RULES.md at the root, config/rules.md in layout 3 (lib/brain-paths.mjs). */
export const rulesPath = root => rulesFile(root);
export const RULES_NAME = TEMPLATES.rules; // the template, and the rules file's name in layouts 1 and 2
const MAX_PROJECTS = 20;
const OWN = /^##\s+Our rules\s*$/m, ASK = /^##\s+Ask the source\s*$/m;   // lib/ask-source.mjs reads the Ask the source table
const read = p => { try { return readFileSync(p, "utf8"); } catch { return null; } };
/* The shipped rules as a layout 3 brain keeps them. The template speaks from the top of the brain ("at this
   level"); in config/ that would send a new document to the wrong folder, so the two rows that say it name the
   place: documents in about-us/, a deliverable never in a new folder at the top. Layouts 1 and 2: as shipped. */
export const rulesInFolders = text => String(text)
  .replace("`<name>.md` at this level (`strategy.md`, `icp.md`, `voice.md`, `design-system.md` are here from day one)", `\`${ABOUT_DIR}/<name>.md\` (\`strategy.md\`, \`icp.md\`, \`voice.md\`, \`design-system.md\` are there from day one; the owner's to change)`)
  .replace("never a new folder at this level", "never a new folder at the top of the brain");
/* Layout 4: the same rows with the folders of that layout: base documents in configuration/about-us/, notes in
   memories/, this computer's files in .gtm-brain/ and a task's throwaway files in .gtm-brain/scratch/. */
export const rulesInTabs = text => rulesInFolders(text)
  .replace(`\`${ABOUT_DIR}/<name>.md\``, `\`${ABOUT_DIR4}/<name>.md\``)
  .replace("Codex notes it in `brain/`", "Codex notes it in `memories/`")
  .replace("`work/`: this computer's own files, never a deliverable, not shared; do not delete it", "`.gtm-brain/`: this computer's own files, never a deliverable, not shared; do not delete it. A task's throwaway files go in `.gtm-brain/scratch/`");
export const layoutRules = (text, root) => (inLayout4(root) ? rulesInTabs(text) : inConfigFolders(root) ? rulesInFolders(text) : text);
const shipped = (templates, dir) => { try { return readdirSync(join(templates, "legacy", dir)).filter(f => f.endsWith(".md")).map(f => readFileSync(join(templates, "legacy", dir, f), "utf8")); } catch { return []; } };
const hasTable = text => /^\|\s*-{3,}/m.test(text);
/* the lines R2 wrote into a RULES.md from before the merge: "# Our rules", then one line per rule */
const oldOwnLines = text => text.replace(/^#\s+Our rules\s*$/m, "").trim();

/* Write RULES.md when it is missing, merge WHERE.md and an older RULES.md into it, refresh it when it is a
   shipped version nobody edited. WHERE.md is removed only when its content is in RULES.md. */
export function ensureRules(root, templates) {
  if (process.env.GTM_BRAIN_RUN || !readAdmin(root) || layoutBlock(root)) return false;   // never into a newer-layout brain
  const file = rulesFile(root), path = join(root, file), raw = readFileSync(join(templates, TEMPLATES.rules), "utf8"), next = layoutRules(raw, root);
  const current = read(path), where = read(join(root, OLD_WHERE));
  if (current !== null && (OWN.test(current) || hasTable(current))) {
    // raw: the shipped wording the layout 3 move carried into config/ word for word
    if (current === next || ![...shipped(templates, "rules"), raw, rulesInFolders(raw)].includes(current)) return false;   // rulesInFolders: the layout 3 wording the move to 4 carried over
    writeFileSync(path, next); commit(root, [file], `upgrade: ${file}, the brain's rules`, { system: true }); return true;
  }
  // The where part: the shipped template when WHERE.md was never edited, the person's own WHERE.md otherwise.
  const ourSection = next.slice(next.search(ASK) >= 0 ? next.search(ASK) : next.search(OWN));
  let merged = where === null || shipped(templates, "where").includes(where) ? next
    : `${where.replace(/^#\s+Where things go\s*$/m, "# Rules\n\n## Where things go").trimEnd()}\n\n${ourSection}`;
  const own = current === null ? "" : oldOwnLines(current);
  if (own) merged = `${merged.trimEnd()}\n\n${own}\n`;
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, merged);
  if (where !== null) rmSync(join(root, OLD_WHERE));
  const note = where !== null ? `${file}: ${current !== null ? `${OLD_WHERE} and your rules` : OLD_WHERE} in one file, the brain's rules` : current !== null ? `${file}: your rules under Our rules, with where things go` : `${file}: the brain's rules`;
  commit(root, [file, ...(where !== null ? [OLD_WHERE] : [])], note, { system: true });
  return true;
}

/* This brain's own rules, the "Our rules" section without its shipped intro: what the chat start prints
   after the shared saving rules. Empty when nobody has added one. */
export function ownRules(root, templates) {
  const text = read(join(root, rulesFile(root))); if (!text) return "";
  if (!OWN.test(text)) return hasTable(text) ? "" : oldOwnLines(text);
  let section = text.slice(text.search(OWN)).replace(OWN, "");
  const end = section.search(/^##?\s/m); if (end >= 0) section = section.slice(0, end);
  const intro = read(join(templates, TEMPLATES.rules))?.split(OWN)[1]?.trim();
  if (intro) section = section.replace(intro, "");
  return section.trim();
}

/* The table rows, as written: "| What | Where |" lines after the header separator (WHERE.md until the
   chat start has merged it). */
export function whereRows(root) {
  let text = read(join(root, rulesFile(root))); if (!text || !hasTable(text)) text = read(join(root, OLD_WHERE));
  if (!text) return [];
  if (ASK.test(text)) text = text.slice(0, text.search(ASK));   // the Ask the source table is not a where row
  const lines = text.split("\n"), sep = lines.findIndex(l => /^\|\s*-{3,}/.test(l));
  if (sep < 0) return [];
  const rows = [];
  for (const l of lines.slice(sep + 1)) {
    if (!l.startsWith("|")) break;
    const cells = l.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length >= 2 && cells[0]) rows.push({ what: cells[0], where: cells[1] });
  }
  return rows;
}

/* The projects: folders in projects/, each with the first line of its README.md as what it is. */
export function projects(root) {
  const dir = join(root, "projects");
  let names = []; try { names = readdirSync(dir).filter(n => !n.startsWith(".") && statSync(join(dir, n)).isDirectory()).sort(); } catch { return []; }
  return names.map(slug => {
    let about = "";
    try { about = readFileSync(join(dir, slug, "README.md"), "utf8").split("\n").map(l => l.replace(/^#+\s*/, "").trim()).find(Boolean) || ""; } catch {}
    return { slug, about };
  });
}

/* The opening lines' part: the rows, numbered as Codex cites them, and the projects to choose from. */
export function whereLine(root) {
  const rows = whereRows(root);
  if (!rows.length) return "";
  const list = projects(root), shown = list.slice(0, MAX_PROJECTS);
  const outs = list.length
    ? shown.map(o => `  projects/${o.slug}/${o.about ? ` - ${o.about}` : " (no README.md line yet: add one when you next work in it)"}`).join("\n") + (list.length > shown.length ? `\n  and ${list.length - shown.length} more in projects/` : "")
    : "  none yet";
  return `${rulesFile(root)} decides where every file goes; the person edits it. Put each file where a row says, name the row in one short clause ("in projects/berlin-event/speakers/, RULES.md row 5"), and give the same row and why in save's placed, so "why is this here" has an answer later. A deliverable for a project below goes inside that project. When no row or project fits, ask before creating a folder and offer a new row; never create a folder at the brain root or put a deliverable in work/. Name folders and files in lowercase words joined by hyphens, no spaces (speakers/florian-weber/, not Florian Weber). When the person names a file you do not have (\"use the new flyer\"), look in the project's folder first, then ask once: what you checked, where it will go (the row), and the file and what it is for, in one question.\n${rows.map((r, i) => `  ${i + 1}. ${r.what}: ${r.where}`).join("\n")}\nProjects:\n${outs}`;
}

/* ---------- why is this here: the reason a file or folder was put where it is ----------
   Codex creates and moves files with its own shell, then keeps them with save. save's `placed` list
   says, per new file or folder, the RULES.md row it followed and why; each becomes a
   "gtm-brain-why: <path>: ..." line in that commit, so git history is the shared log (pushed with
   the brain, no second store). whyHere reads those lines back; unplacedHint names new files that
   arrived without one. Rows are cited by number and their What text, so a reordered table still reads right. */
export const WHY_TRAILER = "gtm-brain-why";
export const MANAGED = p => /^(?:(?:brain|work|config|entities|memories|\.gtm-brain|\.githooks|\.agents)\/|configuration\/(?!about-us\/))/.test(p) || [...ROOT_KEEP, ".gitignore", ".gitattributes"].includes(p);
const clean = p => String(p || "").trim().replace(/^\.\//, "").replace(/\/+$/, "");
const oneLine = s => String(s || "").replace(/\s+/g, " ").trim();

export function placementTrailers(root, placed = []) {
  const rows = whereRows(root), trailers = [], problems = [];
  for (const p of Array.isArray(placed) ? placed : []) {
    const path = clean(p?.path), why = oneLine(p?.why).slice(0, 240), n = p?.row === undefined || p?.row === null || p?.row === "" ? null : Number(p.row);
    if (!path || path.startsWith("/") || path.split("/").includes("..")) { problems.push(`"${p?.path}" is not a path inside the brain folder`); continue; }
    if (!existsSync(join(root, path))) { problems.push(`${path}: no such file or folder`); continue; }
    if (!why) { problems.push(`${path}: say why, in a few words`); continue; }
    if (n !== null && !(Number.isInteger(n) && rows[n - 1])) { problems.push(`${path}: RULES.md has no row ${p.row} (it has ${rows.length})`); continue; }
    trailers.push(`${WHY_TRAILER}: ${path}: ${n !== null ? `RULES.md row ${n} (${oneLine(rows[n - 1].what)}): ` : "no RULES.md row: "}${why}`);
  }
  return { trailers, problems };
}

const gitOut = (root, ...a) => { try { return execFileSync("git", ["--no-optional-locks", "-C", root, ...a], { encoding: "utf8", stdio: "pipe" }); } catch { return ""; } };
/* every recorded reason, newest first: {path, reason, hash, date, author} */
export function recordedReasons(root) {
  const out = [];
  for (const c of gitOut(root, "log", `--grep=^${WHY_TRAILER}: `, "--format=%x1e%h%x1f%ad%x1f%an%x1f%B", "--date=short").split("\x1e").filter(Boolean)) {
    const [hash, date, author, body = ""] = c.split("\x1f");
    for (const line of body.split("\n")) {
      const m = line.match(new RegExp(`^${WHY_TRAILER}: (.+?): (.+)$`));
      if (m) out.push({ path: m[1], reason: m[2], hash, date, author });
    }
  }
  return out;
}
const covers = (reason, path) => reason.path === path || path.startsWith(reason.path + "/");

export function whyHere(root, asked) {
  const path = clean(asked);
  if (!path) return "Say which file or folder: a path inside the brain folder, e.g. projects/berlin-event/speakers/anna-lee/.";
  const reasons = recordedReasons(root), own = reasons.filter(r => covers(r, path)), inside = reasons.filter(r => r.path.startsWith(path + "/"));
  const said = r => `${r.path}: ${r.reason}. Put there on ${r.date} by ${r.author} (commit ${r.hash}).`;
  if (own.length || inside.length) return [...own.slice(0, 1), ...inside.slice(0, 10)].map(said).join("\n") + (inside.length > 10 ? `\nand ${inside.length - 10} more inside ${path}/` : "");
  if (!existsSync(join(root, path))) return `${path}: no such file or folder in this brain.`;
  if (gitOut(root, "status", "--short", "--untracked-files=all", "--", path).trim() && !gitOut(root, "log", "-1", "--format=%h", "--", path).trim())
    return `${path}: not saved yet, and no reason recorded. When it is saved, give its RULES.md row and why in save's placed.`;
  const first = gitOut(root, "log", "--diff-filter=A", "--format=%h%x1f%ad%x1f%an%x1f%s", "--date=short", "--", path).trim().split("\n").filter(Boolean).pop();
  const [hash, date, author, subject] = (first || "").split("\x1f");
  return `${path}: no reason recorded.${first ? ` It arrived on ${date} by ${author}, in "${subject}" (commit ${hash}).` : ""} Ask the person why it is here; when they say, save with placed [{path, row, why}] so the answer is kept.`;
}

/* New files since the last chat, outside what GTM Brain keeps itself, with no recorded reason: named once per set. */
export function unplacedHint(root, { limit = 10 } = {}) {
  if (!gitOut(root, "rev-parse", "--git-dir").trim()) return "";
  const memo = join(workDir(root), "placed-check.json"), head = gitOut(root, "rev-parse", "HEAD").trim();
  let state = {}; try { state = JSON.parse(readFileSync(memo, "utf8")); } catch {}
  const added = new Set(gitOut(root, "status", "--short", "--untracked-files=all").split("\n").filter(l => /^(\?\?|A )/.test(l)).map(l => l.slice(3)));
  if (state.head && head && state.head !== head) for (const f of gitOut(root, "log", "--diff-filter=A", "--name-only", "--format=", `${state.head}..${head}`).split("\n")) if (f) added.add(f);
  const reasons = recordedReasons(root);
  const loose = [...added].filter(f => !MANAGED(f) && !f.startsWith(".") && existsSync(join(root, f)) && !reasons.some(r => covers(r, f))).sort();
  const known = state.said || [], fresh = loose.filter(f => !known.includes(f));
  try { mkdirSync(workDir(root), { recursive: true }); writeFileSync(memo, JSON.stringify({ head, said: loose, at: new Date().toISOString() })); } catch {}
  if (!fresh.length) return "";
  return `New files with no recorded reason for where they are: ${fresh.slice(0, limit).join(", ")}${fresh.length > limit ? ` and ${fresh.length - limit} more` : ""}. When the RULES.md row is plain, record it with save (placed: path, row, why) in this chat; when it is not, ask the person once where each belongs. Never move one unasked.`;
}
