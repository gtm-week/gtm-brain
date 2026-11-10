// WHERE.md: the one file that says where things go in a brain, for the person and for Codex alike
// (Artur, 2026-11-10: "where is the if-then I can change"). Setup writes it; a brain without one gets it
// at the chat start; an unedited one follows the shipped template; an edited one is never touched.
// Every chat's opening lines carry its rows and the projects under projects/, so a deliverable goes into
// the project it belongs to (a speaker graphic into the Berlin event) instead of a folder of its own.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
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
  return `WHERE.md decides where every file goes; the person edits it. Put each file where a row says and name the row in one short clause ("in projects/berlin-event/speakers/, WHERE.md row 5"). A deliverable for a project below goes inside that project. When no row or project fits, ask before creating a folder and offer a new row; never create a folder at the brain root or put a deliverable in work/.\n${rows.map((r, i) => `  ${i + 1}. ${r.what}: ${r.where}`).join("\n")}\nProjects:\n${outs}`;
}
