// WHERE.md: the one file that says where things go in a brain, for the person and for Codex alike
// (Artur, 2026-11-10: "where is the if-then I can change"). Setup writes it; a brain without one gets it
// at the chat start; an unedited one follows the shipped template; an edited one is never touched.
// Every chat's opening lines carry its rows and the projects under projects/, so a deliverable goes into
// the project it belongs to (a speaker graphic into the Berlin event) instead of a folder of its own.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readAdmin, commit } from "./brain.mjs";

export const WHERE = "WHERE.md";
const MAX_PROJECTS = 20;

/* Write WHERE.md when it is missing, refresh it when it is a shipped version nobody edited. */
export function ensureWhere(root, templates) {
  if (process.env.GTM_BRAIN_RUN || !readAdmin(root)) return false;
  const path = join(root, WHERE), next = readFileSync(join(templates, WHERE), "utf8"), had = existsSync(path);
  if (had) {
    const current = readFileSync(path, "utf8"), shipped = join(templates, "legacy", "where");
    let older = []; try { older = readdirSync(shipped).filter(f => f.endsWith(".md")).map(f => readFileSync(join(shipped, f), "utf8")); } catch {}
    if (current === next || !older.includes(current)) return false;
  }
  writeFileSync(path, next);
  commit(root, [WHERE], had ? "upgrade: WHERE.md, where things go" : "WHERE.md: where things go");
  return true;
}

/* The table rows, as written: "| What | Where |" lines after the header separator. */
export function whereRows(root) {
  let text; try { text = readFileSync(join(root, WHERE), "utf8"); } catch { return []; }
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
  return `WHERE.md decides where every file goes; the person edits it. Put each file where a row says, name the row in one short clause ("in projects/berlin-event/speakers/, WHERE.md row 5"), and give the same row and why in save's placed, so "why is this here" has an answer later. A deliverable for a project below goes inside that project. When no row or project fits, ask before creating a folder and offer a new row; never create a folder at the brain root or put a deliverable in work/. Name folders and files in lowercase words joined by hyphens, no spaces (speakers/florian-weber/, not Florian Weber).\n${rows.map((r, i) => `  ${i + 1}. ${r.what}: ${r.where}`).join("\n")}\nProjects:\n${outs}`;
}

/* ---------- why is this here: the reason a file or folder was put where it is ----------
   Codex creates and moves files with its own shell, then keeps them with save. save's `placed` list
   says, per new file or folder, the WHERE.md row it followed and why; each becomes a
   "gtm-brain-why: <path>: ..." line in that commit, so git history is the shared log (pushed with
   the brain, no second store). whyHere reads those lines back; unplacedHint names new files that
   arrived without one. Rows are cited by number and their What text, so a reordered table still reads right. */
export const WHY_TRAILER = "gtm-brain-why";
const MANAGED = p => /^(brain|work|\.githooks|\.agents)\//.test(p) || ["README.md", WHERE, "AGENTS.md", "CLAUDE.md", ".gitignore", ".gitattributes"].includes(p);
const clean = p => String(p || "").trim().replace(/^\.\//, "").replace(/\/+$/, "");
const oneLine = s => String(s || "").replace(/\s+/g, " ").trim();

export function placementTrailers(root, placed = []) {
  const rows = whereRows(root), trailers = [], problems = [];
  for (const p of Array.isArray(placed) ? placed : []) {
    const path = clean(p?.path), why = oneLine(p?.why).slice(0, 240), n = p?.row === undefined || p?.row === null || p?.row === "" ? null : Number(p.row);
    if (!path || path.startsWith("/") || path.split("/").includes("..")) { problems.push(`"${p?.path}" is not a path inside the brain folder`); continue; }
    if (!existsSync(join(root, path))) { problems.push(`${path}: no such file or folder`); continue; }
    if (!why) { problems.push(`${path}: say why, in a few words`); continue; }
    if (n !== null && !(Number.isInteger(n) && rows[n - 1])) { problems.push(`${path}: WHERE.md has no row ${p.row} (it has ${rows.length})`); continue; }
    trailers.push(`${WHY_TRAILER}: ${path}: ${n !== null ? `WHERE.md row ${n} (${oneLine(rows[n - 1].what)}): ` : "no WHERE.md row: "}${why}`);
  }
  return { trailers, problems };
}

const gitOut = (root, ...a) => { try { return execFileSync("git", ["--no-optional-locks", "-C", root, ...a], { encoding: "utf8", stdio: "pipe" }); } catch { return ""; } };
/* every recorded reason, newest first: {path, reason, hash, date, author} */
function recordedReasons(root) {
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
    return `${path}: not saved yet, and no reason recorded. When it is saved, give its WHERE.md row and why in save's placed.`;
  const first = gitOut(root, "log", "--diff-filter=A", "--format=%h%x1f%ad%x1f%an%x1f%s", "--date=short", "--", path).trim().split("\n").filter(Boolean).pop();
  const [hash, date, author, subject] = (first || "").split("\x1f");
  return `${path}: no reason recorded.${first ? ` It arrived on ${date} by ${author}, in "${subject}" (commit ${hash}).` : ""} Ask the person why it is here; when they say, save with placed [{path, row, why}] so the answer is kept.`;
}

/* New files since the last chat, outside what GTM Brain keeps itself, with no recorded reason: named once per set. */
export function unplacedHint(root, { limit = 10 } = {}) {
  if (!gitOut(root, "rev-parse", "--git-dir").trim()) return "";
  const memo = join(root, "work", "placed-check.json"), head = gitOut(root, "rev-parse", "HEAD").trim();
  let state = {}; try { state = JSON.parse(readFileSync(memo, "utf8")); } catch {}
  const added = new Set(gitOut(root, "status", "--short", "--untracked-files=all").split("\n").filter(l => /^(\?\?|A )/.test(l)).map(l => l.slice(3)));
  if (state.head && head && state.head !== head) for (const f of gitOut(root, "log", "--diff-filter=A", "--name-only", "--format=", `${state.head}..${head}`).split("\n")) if (f) added.add(f);
  const reasons = recordedReasons(root);
  const loose = [...added].filter(f => !MANAGED(f) && !f.startsWith(".") && existsSync(join(root, f)) && !reasons.some(r => covers(r, f))).sort();
  const known = state.said || [], fresh = loose.filter(f => !known.includes(f));
  try { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(memo, JSON.stringify({ head, said: loose, at: new Date().toISOString() })); } catch {}
  if (!fresh.length) return "";
  return `New files with no recorded reason for where they are: ${fresh.slice(0, limit).join(", ")}${fresh.length > limit ? ` and ${fresh.length - limit} more` : ""}. When the WHERE.md row is plain, record it with save (placed: path, row, why) in this chat; when it is not, ask the person once where each belongs. Never move one unasked.`;
}
