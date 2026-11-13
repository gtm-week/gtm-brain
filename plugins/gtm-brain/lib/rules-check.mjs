// The rules check: the brain against its own rules, on demand (query object rules). Deterministic, no
// model calls, reads only. Each finding names its rule (lib.NAME_RULES, RULES.md), the exact person or
// path, and two or three fixed choices, each carried out through an existing tool, so the fix leaves its
// own reason behind. It never changes anything itself. (Artur, 2026-11-11: Max nobody could place, files
// scattered without a reason.)
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import * as lib from "./brain.mjs";
import { whereRows, recordedReasons, MANAGED, WHERE } from "./where.mjs";
import { strayFolders, listDocuments, filesDir } from "./documents.mjs";

const git = (root, ...a) => { try { return execFileSync("git", ["--no-optional-locks", "-C", root, ...a], { encoding: "utf8", stdio: "pipe" }); } catch { return ""; } };
const BAD_NAME = /[A-Z\s]/;
const suggest = name => name.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + (name.match(/\.[^.]+$/)?.[0].toLowerCase() || "");

export function ruleFindings(root) {
  const out = [], add = (rule, kind, subject, what, choices) => out.push({ rule, kind, subject, what, choices });
  const names = lib.readNames(root), admin = lib.readAdmin(root) || {};
  const team = new Set((admin.team || []).map(p => String(p.name || "").toLowerCase()));
  const memories = lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories));
  const notesAbout = e => memories.filter(m => (m.entities || []).includes(e.id));
  const kept = e => memories.some(m => (m.entity_mentions || []).some(x => x.entity === e.id && x.resolution === "confirmed_new"));

  // P3: a person known by one word, unless the person already said the one word is the name
  for (const e of names.filter(n => n.kind === "person" && n.status !== "archived" && !/\s/.test(n.name.trim()) && !team.has(n.name.toLowerCase()) && !kept(n))) {
    const notes = notesAbout(e), since = notes.map(m => m.at).sort()[0];
    const alike = names.filter(o => o !== e && o.kind === "person" && o.name.toLowerCase().split(/\s+/)[0] === e.name.toLowerCase() && /\s/.test(o.name));
    add("P3", "person", e.name, `"${e.name}" is a person known by a first name only, in ${notes.length} note${notes.length === 1 ? "" : "s"}${since ? ` since ${since.slice(0, 10)}` : ""}.`, [
      `Give the full name: say "${e.name} is <Full Name>" (add_name with the full name and alias ${e.name})`,
      ...alike.slice(0, 2).map(o => `Same as ${o.name}: merge_entities ${e.name} into ${o.name}`),
      `Not a person: say what it is (add_name with kind organization or product)`,
    ]);
  }
  // P4: two names that look alike and were never said to be different
  for (const m of lib.suggestMerges(names)) add("P4", m.kind, `${m.a} / ${m.b}`, `${m.a} and ${m.b} may be the same ${m.kind}; nobody has said either way.`, [
    `Same: merge_entities ${m.b} into ${m.a}`, `Different: add_name ${m.b} with not ["${m.a}"], so it is never asked again`]);

  // RULES.md: top-level folders GTM Brain does not use and no row names
  const rows = whereRows(root), rowText = rows.map(r => r.where).join(" ");
  for (const f of strayFolders(root).filter(f => !rowText.includes(`\`${f}/`))) add("RULES.md", "folder", `${f}/`, `${f}/ is at the top of the brain, and no RULES.md row says what goes there.`, [
    `Add a RULES.md row for it (edit RULES.md, then save with placed)`, `Move what is in it to where a row says (ask first; save with placed)`, `Adopt its Markdown as documents: say "adopt the documents in ${f}/"`]);

  // files with no recorded reason, by folder: projects/<one>/ or the top-level folder; documents and their files have one
  const docs = listDocuments(root), docPaths = new Set(docs.flatMap(d => [d.path, filesDir(d)]));
  const reasons = recordedReasons(root), reasoned = p => reasons.some(r => r.path === p || p.startsWith(r.path + "/"));
  const files = [...new Set([...git(root, "ls-files").split("\n"), ...git(root, "ls-files", "--others", "--exclude-standard").split("\n")])].filter(Boolean)
    .filter(p => !MANAGED(p) && !p.split("/").some(s => s.startsWith(".")) && !p.startsWith("workflows/") && ![...docPaths].some(d => p === d || p.startsWith(d + "/")));
  const groups = new Map();
  for (const p of files.filter(p => !reasoned(p))) { const parts = p.split("/"), key = parts.length === 1 ? p : parts[0] === "projects" && parts.length > 2 ? parts.slice(0, 2).join("/") + "/" : parts[0] + "/"; groups.set(key, [...(groups.get(key) || []), p]); }
  for (const [where, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) add("why", "files", where, `${where}: ${list.length} file${list.length === 1 ? "" : "s"} with no recorded reason for being here (e.g. ${list.slice(0, 2).join(", ")}).`, [
    `Record why, once for the folder: save with placed [{path: "${where.replace(/\/$/, "")}", row: <RULES.md row>, why: "..."}]`, `Ask the person where they belong, then move or keep (save with placed)`]);

  // RULES.md naming: lowercase words joined by hyphens
  const paths = new Set(files.flatMap(p => p.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"))));
  const badNames = [...paths].filter(p => BAD_NAME.test(basename(p)) && !["README.md", WHERE].includes(basename(p)) && !/^[A-Z0-9_-]+\.md$/.test(basename(p)));
  const top = badNames.filter(p => !badNames.some(q => q !== p && p.startsWith(q + "/")));   // a renamed folder fixes what is inside
  for (const p of top.slice(0, 10)) add("RULES.md naming", "name", p, `${p} has capitals or spaces; RULES.md says lowercase words joined by hyphens.`, [
    `Rename to ${p.split("/").slice(0, -1).concat(suggest(basename(p))).join("/")} (ask first; save with placed)`, `Keep the name as it is`]);
  if (top.length > 10) add("RULES.md naming", "name", "more", `${top.length - 10} more names with capitals or spaces.`, [`Run the check again after the first ones are fixed`]);
  return out;
}

export function rulesReport(root) {
  const f = ruleFindings(root);
  if (!f.length) return "Rules check: nothing to fix. Every person has a full name or was confirmed, no look-alike pair is open, and every file has a recorded reason and a RULES.md-style name.";
  const count = k => f.filter(x => k.includes(x.kind)).length;
  const head = `Rules check: ${f.length} thing${f.length === 1 ? "" : "s"} to look at (${count(["person", "organization", "product"])} names, ${count(["folder", "files", "name"])} files and folders). Reads only; nothing was changed.`;
  const body = f.map((x, i) => `${i + 1}. [${x.rule}] ${x.what}\n${x.choices.map((c, j) => `   ${String.fromCharCode(97 + j)}) ${c}`).join("\n")}`).join("\n");
  return `${head}\n${body}\nAsk the person about one at a time, choices as numbered options, the first recommended; carry out the answer through the tool named. The rules: P1-P4 in the brain's README (How we name people), the rows and naming in RULES.md.`;
}
