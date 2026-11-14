// brain/layout.json: which layout of files this brain uses, so a plugin older than the layout stops instead of
// misreading it or writing into it. Brains are shared through git: when one teammate's newer GTM Brain moves
// entity pages into kind folders or notes into daily files, a teammate still on an older version opens the
// same brain the next time they pull. That plugin reads this file, sees a layout it does not know, keeps
// reading what it can and refuses every write with UPDATE_LINE.
//
// Layout 1 is the flat layout every brain had up to 0.35.0 (brain/entities/*.md, one memories.jsonl per
// context). A brain without the file is layout 1. This file has no imports from the rest of the lib, so the
// smallest older plugin can carry it as it is.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

export const LAYOUT_FILE = "brain/layout.json";
// The layout this plugin writes, and the newest it understands. Tests set GTM_BRAIN_TEST_LAYOUT to play a
// newer plugin; nothing else reads it.
const testLayout = () => Number(process.env.GTM_BRAIN_TEST_LAYOUT) || 0;
export const LAYOUT = 1;
export const writesLayout = () => testLayout() || LAYOUT;
export const understandsLayout = () => Math.max(LAYOUT, testLayout());

/* {layout, starters, error}: layout 1 when the file is missing. A file that cannot be read (a merge conflict,
   a hand edit) gives layout null and the error: nothing is written until it is fixed, reads go on. */
export function readLayout(root) {
  const path = join(root, LAYOUT_FILE);
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return { layout: 1, starters: null, missing: true }; }
  try {
    const data = JSON.parse(text), layout = data?.layout;
    if (!Number.isInteger(layout) || layout < 1) return { layout: null, starters: null, error: `${LAYOUT_FILE} has no layout number` };
    return { layout, starters: Array.isArray(data.starters) ? data.starters.map(String) : null };
  } catch (e) { return { layout: null, starters: null, error: `${LAYOUT_FILE} cannot be read (${e.message.split("\n")[0]})` }; }
}

/* The one line for a brain this plugin must not write into, "" when it may. */
export function layoutBlock(root) {
  if (!root || !existsSync(join(root, "brain", "admin.md"))) return "";
  const r = readLayout(root);
  if (r.error) return `GTM Brain: ${r.error}. Reading works; nothing is written until the file says {"layout": N} again (restore it from git, or update GTM Brain if a teammate's newer version wrote it). Tell the person in one line.`;
  if (r.layout > understandsLayout()) return `GTM Brain: this brain was upgraded to file layout ${r.layout} by a newer GTM Brain; this one understands layout ${understandsLayout()}. Reading works, but nothing is written or saved until you update GTM Brain: say "update GTM Brain" (update_plugin), then start a new chat. Tell the person exactly that in one line, and do not try to save another way.`;
  return "";
}

export class LayoutError extends Error {}
/* Called at the start of every lib writer: throws before a single byte is written. */
export function assertWritable(root) {
  const line = layoutBlock(root);
  if (line) throw new LayoutError(line);
}

/* Record the layout (and the starter documents the brain has been given, so a starter the person deleted is
   never brought back). Returns true when the file changed. The caller commits it. */
export function writeLayout(root, { layout = writesLayout(), starters } = {}) {
  const current = readLayout(root), path = join(root, LAYOUT_FILE);
  if (current.error) throw new LayoutError(layoutBlock(root));
  const given = [...new Set([...(current.starters || []), ...(starters || [])])].sort();
  const next = JSON.stringify({ layout, starters: given, about: "The file layout of this brain. A GTM Brain older than this layout reads but writes nothing until it is updated." }, null, 2) + "\n";
  let before = null; try { before = readFileSync(path, "utf8"); } catch {}
  if (before === next) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}

/* Who else wrote notes here in the last `days` days: the teammates a layout change leaves behind until they
   update. Read from the note authors, the current person left out. names: handle -> display name. */
export function recentTeammates(root, { me = null, days = 14, now = Date.now(), names = {} } = {}) {
  const since = now - days * 86400000, seen = new Map();
  let dirs = []; try { dirs = readdirSync(join(root, "brain", "contexts"), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
  for (const slug of dirs) {
    let text; try { text = readFileSync(join(root, "brain", "contexts", slug, "memories.jsonl"), "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      const at = Date.parse(m?.at);
      if (!(at >= since)) continue;
      for (const a of Array.isArray(m.authors) ? m.authors : []) if (a && a !== me && (!seen.has(a) || seen.get(a) < at)) seen.set(a, at);
    }
  }
  return [...seen].sort((a, b) => b[1] - a[1]).map(([handle, at]) => ({ handle, name: names[handle] || handle, last: new Date(at).toISOString().slice(0, 10) }));
}

/* What an upgrade to `target` means for this brain: {from, to, changes, teammates, line}. */
export function layoutPlan(root, { target = writesLayout(), me = null, names = {}, now } = {}) {
  const r = readLayout(root), from = r.layout;
  const changes = from !== null && target > from;
  const teammates = changes ? recentTeammates(root, { me, names, now }) : [];
  const who = teammates.length ? `${teammates.length} teammate${teammates.length === 1 ? "" : "s"} saved here in the last 14 days (${teammates.map(t => `${t.name}, last ${t.last}`).join("; ")}); ${teammates.length === 1 ? "they" : "each"} will need to update GTM Brain: until then their GTM Brain reads this brain but writes nothing.` : "Nobody else saved here in the last 14 days.";
  const line = changes ? `This upgrade changes the brain's file layout from ${from} to ${target}. ${who} Ask the person one yes/no question: Yes, upgrade the layout / No, not now. Only on yes, run upgrade_brain again with confirm: true.` : "";
  return { from, to: target, changes, teammates, line };
}
