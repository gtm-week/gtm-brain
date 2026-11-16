// Protect locally edited instructions before refreshing plugin-owned files.
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { readAdmin, readNames, commit, currentPerson } from "./brain.mjs";
import { withOwnAdditions, splitOwn, joinOwn } from "./rule-pages.mjs";
import { readLayout, layoutBlock, layoutPlan, writeLayout, writesLayout } from "./layout-version.mjs";
import { diskLayout, pagePaths, isKindPagePath } from "./layout.mjs";
import { ensureRules } from "./where.mjs";
import { ensureSchema } from "./schema.mjs";
import { basePath, rulesFile, schemaFile, inConfigFolders } from "./brain-paths.mjs";
import { configMoveWhat, layoutReadme } from "./config-folders.mjs";
import { tabsMoveWhat } from "./layout-four.mjs";
import { inLayout4, layoutFile } from "./brain-paths.mjs";
import { workDir } from './brain-paths.mjs';

// Shared with the upgrade matrix tests. Aliases point to the same immutable snapshot.
export const legacyTemplates = JSON.parse(readFileSync(new URL("../templates/legacy/manifest.json", import.meta.url), "utf8"));

/* Why the rules changed, one line per release that changed them (the version that shipped the
   change). Every template change adds a line here: an offer to refresh says what it fixes. */
export const rulesWhy = JSON.parse(readFileSync(new URL("../templates/legacy/why.json", import.meta.url), "utf8"));
const versionParts = v => String(v).split(/[^0-9]+/).filter(Boolean).map(Number);
const newer = (a, b) => { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
/* Every step upgrade.sh runs besides the rules existed by this version, so rules this new mean those
   steps have already run. A new migration step in upgrade.sh raises this number. */
const MIGRATIONS_THROUGH = "0.31.0";
const shippedMatches = (templates, company, current) => {
  const render = file => readFileSync(join(templates, "legacy", file), "utf8").replaceAll("{{COMPANY}}", company);
  return Object.entries(legacyTemplates).filter(([, file]) => render(file) === current).map(([v]) => v);
};
/* The newest shipped version whose rules the brain's AGENTS.md matches (null when current, custom
   or missing) and the reasons for every rule change since then, oldest first. */
export function rulesReasons(root, templates) {
  const company = readAdmin(root)?.company; const path = join(root, "AGENTS.md");
  if (!company || !existsSync(path)) return { from: null, reasons: [] };
  const current = splitOwn(readFileSync(path, "utf8")).rules;   // the rules part: a person's own additions come after it
  if (current === readFileSync(join(templates, "AGENTS.md"), "utf8").replaceAll("{{COMPANY}}", company)) return { from: null, reasons: [] };
  const matches = shippedMatches(templates, company, current);
  if (!matches.length) return { from: null, reasons: [] };
  const from = matches.reduce((a, b) => (newer(b, a) ? b : a));
  const reasons = Object.entries(rulesWhy).filter(([v]) => newer(v, from)).sort(([a], [b]) => (newer(a, b) ? 1 : -1)).map(([, why]) => why);
  return { from, reasons };
}
/* The chat start's one-line offer for a legacy brain, with its reasons; "" for any other state. */
export function rulesOffer(root, templates) {
  if (rulesState(root, templates) !== "legacy") return "";
  const { from, reasons } = rulesReasons(root, templates);
  const why = reasons.length ? reasons.join("; ") : "they name tools and habits the plugin has moved on from";
  return `GTM Brain: this brain's rules (AGENTS.md) are from GTM Brain ${from}. What the newer rules change: ${why}. Offer once, in one line, to refresh the rules (upgrade_brain, gtmb-configure), and say why in plain words from that list, the reason that matters most for this person first; it backs the old file up and keeps local edits.`;
}

/* Session start: rules that are exactly an older shipped version are refreshed here ("why i have to
   do it? it should be automatic", Maciej, 2026-11-07). Only AGENTS.md: moving or adding the person's
   files needs their yes, so a brain with migrations still to run keeps the offer, as does a run with
   nobody present. The old file is backed up. */
export function autoRefresh(root, templates) {
  if (rulesState(root, templates) !== "legacy") return "";
  const { from, reasons } = rulesReasons(root, templates);
  if (process.env.GTM_BRAIN_RUN || newer(MIGRATIONS_THROUGH, from)) return rulesOffer(root, templates);
  let backup;
  try {
    const prepared = prepareUpgrade(root, templates);
    if (!prepared.ready) return rulesOffer(root, templates);
    backup = prepared.backup;
    writeRules(root, templates);
  } catch { return rulesOffer(root, templates); }
  commit(root, ["AGENTS.md"], "upgrade: rules refreshed");
  const why = reasons.length ? reasons.join("; ") : "they name tools and habits the plugin has moved on from";
  return `GTM Brain refreshed this brain's rules (AGENTS.md) from GTM Brain ${from} on its own: they were exactly the shipped text.${backup ? ` The old file is kept in ${backup}.` : ""} What the newer rules change: ${why}. Say so in one line, in plain words, the change that matters most for this person first; do not ask, it is done.`;
}

/* The README refreshed at chat start, like the rules: only when it is exactly what a release wrote,
   and committing nothing else. Scheduled runs leave it for the next chat. */
export function refreshReadme(root, templates) {
  const company = readAdmin(root)?.company, path = join(root, "README.md");
  if (process.env.GTM_BRAIN_RUN || !company || !existsSync(path)) return false;
  const render = file => layoutReadme(readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company), root);
  const current = readFileSync(path, "utf8"), next = render(join(templates, "README.md")), shipped = join(templates, "legacy", "readme");
  if (current === next || !readdirSync(shipped).some(f => f.endsWith(".md") && render(join(shipped, f)) === current)) return false;
  writeFileSync(path, next);
  commit(root, ["README.md"], "upgrade: README refreshed");
  return true;
}

/* Where a brain's rules stand against the plugin: current, a shipped older version (legacy),
   edited by hand (custom), or missing. The chat start says so; nothing is changed here. */
export function rulesState(root, templates) {
  const company = readAdmin(root)?.company; if (!company) return "missing";
  const path = join(root, "AGENTS.md"); if (!existsSync(path)) return "missing";
  const render = file => readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company);
  const current = splitOwn(readFileSync(path, "utf8")).rules;   // own additions after the rules do not make them edited
  if (current === render(join(templates, "AGENTS.md"))) return "current";
  return [...new Set(Object.values(legacyTemplates))].some(file => current === render(join(templates, "legacy", file))) ? "legacy" : "custom";
}
/* Write the shipped rules into the brain's AGENTS.md, the person's own additions (under their heading) carried over
   word for word. True when the file changed. Only after prepareUpgrade said ready. */
export function writeRules(root, templates) {
  const path = join(root, "AGENTS.md"), target = readFileSync(join(templates, "AGENTS.md"), "utf8").replaceAll("{{COMPANY}}", readAdmin(root).company);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  const next = joinOwn(target, current === null ? "" : splitOwn(current).own);
  if (current === next) return false;
  writeFileSync(path, next); return true;
}
export function prepareUpgrade(root, templates) {
  const company = readAdmin(root)?.company;
  if (!company) throw new Error("Cannot refresh rules without a configured company.");
  // Validate user-editable identities before changing any instructions or hooks. A file
  // requiring repair must not leave a brain halfway through the predictable upgrade steps.
  readNames(root);
  const render = file => readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company);
  const target = render(join(templates, "AGENTS.md"));
  const whole = existsSync(join(root, "AGENTS.md")) ? readFileSync(join(root, "AGENTS.md"), "utf8") : null;
  const current = whole === null ? null : splitOwn(whole).rules;   // the rules part; own additions are carried over
  const previous = [...new Set(Object.values(legacyTemplates))].map(file => render(join(templates, "legacy", file)));
  const files = ["AGENTS.md", ".githooks/pre-commit", ".gitignore"];
  const needsChange = current !== target || files.slice(1).some(file => {
    if (!existsSync(join(root, file))) return true;
    const existing = readFileSync(join(root, file), "utf8");
    const expected = readFileSync(join(templates, file === ".gitignore" ? "gitignore" : "githooks/pre-commit"), "utf8");
    return file === ".gitignore"
      ? expected.trimEnd().split("\n").some(line => !existing.split("\n").includes(line))
      : existing !== expected;
  });
  const folder = join(workDir(root), "upgrades");
  let backup;
  if (needsChange) {
    mkdirSync(folder, { recursive: true });
    backup = mkdtempSync(join(folder, "before-"));
    for (const file of files) if (existsSync(join(root, file))) {
      const dest = join(backup, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, file), dest);
    }
  }
  if (current !== null && current !== target && !previous.includes(current)) {
    const proposal = join(backup, "AGENTS.proposed.md");
    writeFileSync(proposal, withOwnAdditions(target, whole, previous));   // the person's own lines stay, under their own heading
    return { ready: false, backup, proposal };
  }
  return { ready: true, backup };
}

/* The starter documents setup writes (GTM week sync, 2026-11-13). An upgrade adds the ones a brain lacks, at
   the root or in a folder of their own name, and brain/layout.json records every starter as given, so one
   the person deleted afterwards is never brought back. A file already there is the person's. */
export const STARTERS = ["strategy", "icp", "voice", "design-system", "market"];
/* The design system is a page too (0.35): design-system.html beside design-system.md, the version people look at.
   A new brain gets the starter page with the Markdown; an older one gets it once, beside its Markdown wherever that
   lies, and only when no page is there: a page the team made is never touched. It is recorded as given under its
   own name, so one the person deleted is not brought back. */
export const STARTER_PAGES = [{ doc: "design-system", file: "design-system.html" }];
export const GIVEN = [...STARTERS, ...STARTER_PAGES.map(p => p.file)];
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function addStarters(root, templates, { version = "", date = new Date().toISOString().slice(0, 10) } = {}) {
  const company = readAdmin(root)?.company || "", given = new Set(readLayout(root).starters || []), added = [];
  for (const doc of STARTERS) {
    const template = join(templates, `${doc}.md`), at = basePath(root, `${doc}.md`);
    if (given.has(doc) || !existsSync(template) || existsSync(join(root, at)) || existsSync(join(root, basePath(root, `${doc}/${doc}.md`)))) continue;
    mkdirSync(dirname(join(root, at)), { recursive: true });
    writeFileSync(join(root, at), readFileSync(template, "utf8").replaceAll("{{COMPANY}}", company).replaceAll("{{DATE}}", date).replaceAll("{{VERSION}}", version));
    added.push(at);
  }
  for (const { doc, file } of STARTER_PAGES) {
    const template = join(templates, file);
    if (given.has(file) || !existsSync(template)) continue;
    // beside the Markdown: at the base folder, or inside the document's own folder when it moved there
    const md = [basePath(root, `${doc}.md`), basePath(root, `${doc}/${doc}.md`)].find(p => existsSync(join(root, p)));
    if (!md) continue;
    const at = `${dirname(md) === "." ? "" : `${dirname(md)}/`}${file}`;
    if ([at, basePath(root, file), file].some(p => existsSync(join(root, p)))) continue;
    writeFileSync(join(root, at), readFileSync(template, "utf8").replaceAll("{{COMPANY}}", escapeHtml(company)));
    added.push(at);
  }
  return added;
}

/* upgrade.sh, before anything is backed up or replaced: BLOCKED\t<line> for a brain on a newer layout,
   ASK\t<question> for a layout change without the person's yes, CHANGE\t<from>\t<to> with it, "" otherwise.
   The change 0.35 brings is the move of a flat brain's entity pages into kind folders (layout 1 to 2): the
   question says how many pages move. A brain whose pages are in kind folders already has nothing to ask
   about, whatever its file says (the upgrade records 2). A scheduled or background run never changes the
   layout, with or without the flag: nobody is there to have said yes. */
export function layoutStep(root, confirmed) {
  const blocked = layoutBlock(root);
  if (blocked) return `BLOCKED\t${blocked}`;
  const admin = readAdmin(root) || {}, names = Object.fromEntries((admin.team || []).map(p => [p.handle, p.name]));
  const me = currentPerson(root), owner = admin.owner ? String(admin.owner) : null;
  // Layout 3 moves the base files and the settings into the owner's folders: only the owner says yes to it.
  // Anyone else upgrades to layout 2 at most, and the rest of the upgrade goes on.
  const target = !owner || me === owner ? writesLayout() : Math.min(writesLayout(), 2);
  const on = diskLayout(root), flat = on < 2 ? pagePaths(root).filter(p => !isKindPagePath(p)).length : 0;
  const kinds = on < 2 ? `It moves ${flat} entity page${flat === 1 ? "" : "s"} into a folder per kind (brain/entities/people/, organizations/, ...). A teammate still on GTM Brain 0.34 gets no warning: their notes keep saving, but their GTM Brain no longer finds these pages (a known person or company looks unknown to it) and writes a flat page of its own for each name it saves, which the next save from an updated GTM Brain folds back in. No note is lost.` : "";
  const config = target >= 3 && !inConfigFolders(root) ? configMoveWhat(root) : "";
  // Layout 4, after 3 in the same run: the four folders (lib/layout-four.mjs). The owner's to say yes to, like 3.
  const tabs = target >= 4 && !inLayout4(root) ? tabsMoveWhat(root) : "";
  const plan = layoutPlan(root, { me, names, on, target, what: [kinds, config, tabs].filter(Boolean).join(" "), older: config || tabs ? "they will need to update GTM Brain: until then their GTM Brain does not find this brain." : kinds ? "they should update GTM Brain before you say yes: until they do, their GTM Brain keeps saving notes but does not find the entity pages." : "" });
  if (!plan.changes) return target < writesLayout() && on < writesLayout() && on >= target ? `NOTE\tOne more move is waiting: ${inConfigFolders(root) ? "the brain into its four folders (configuration/, entities/, memories/, workflows/; layout " + writesLayout() + ")" : "the base documents, the rules, schema and settings, the entity pages and the notes into the four folders (configuration/, entities/, memories/, workflows/; layout " + writesLayout() + ")"}. It is the owner's (${names[owner] || owner}) to say yes to, in their own chat ("upgrade this brain"); nothing of it was asked or moved here.` : "";
  if (process.env.GTM_BRAIN_RUN) return `ASK\t${plan.summary} A scheduled or background run never changes the layout: the person says "upgrade the brain" in a chat.`;
  return confirmed ? `CHANGE\t${plan.from}\t${plan.to}` : `ASK\t${plan.line}`;
}

/* The chat start's line for a brain whose files are still arranged as an older GTM Brain kept them, when the
   person in this checkout is the one who can say yes to the move (anyone for the entity pages, only the owner for
   about-us/ and config/ and for the four folders of layout 4): the brain needs an upgrade, Codex offers it and asks before anything moves, and
   upgrade_brain does it. "" for a brain that is current, a brain this plugin must not write, a teammate whose
   only pending move is the owner's, and a scheduled or background run. Nothing is read beyond what layoutStep reads. */
export function layoutOffer(root) {
  if (process.env.GTM_BRAIN_RUN) return "";
  let step; try { step = layoutStep(root, false); } catch { return ""; }
  if (!step.startsWith("ASK\t")) return "";
  const pages = diskLayout(root) < 2, base = /into (?:about-us|config)\//.test(step), tabs = step.includes("into four folders");
  const what = [pages && "the entity pages into a folder per kind", base && "the base documents into about-us/ and the rules, schema and settings into config/", tabs && "the whole brain into four folders, the dashboard's tabs (configuration/, entities/, memories/ with one file of notes per month, workflows/)"].filter(Boolean).join(", and ");
  const name = tabs ? "the four folders of 0.37" : "the 0.35 file arrangement";
  return `GTM Brain: this brain needs an upgrade. Its files are still arranged as an older GTM Brain kept them, and this version can move ${what}. Nothing has moved, and reading and saving work as before. Offer the upgrade once, in one line at the end of your first reply ("This brain can be upgraded to ${name}. Say: upgrade this brain."), and never start it unasked. On yes, call upgrade_brain: it changes nothing and returns what would move and which teammates must update GTM Brain first; put that to the person as one yes/no question, and only on their yes call upgrade_brain again with confirm: true.`;
}

/* upgrade.sh: what a brain lacks, as three lines: the starters added, RULES.md and SCHEMA.md written, and
   the line to print when brain/layout.json was written. The layout is recorded last, after the starters it
   lists. The move into kind folders has recorded its own layout by now (said: upgrade.sh printed that line);
   here the number only rises to what this plugin writes for a brain in kind folders, and a flat brain keeps 1. */
export function deliverMissing(root, templates, version, said = false) {
  const starters = addStarters(root, templates, { version });
  const files = [ensureRules(root, templates) && rulesFile(root), ensureSchema(root, templates) && schemaFile(root)].filter(Boolean);
  const before = readLayout(root), written = writeLayout(root, { starters: GIVEN, layout: diskLayout(root) >= 2 ? diskLayout(root) : undefined }), after = readLayout(root).layout;
  const layout = !written ? "" : before.layout !== after ? `changed the brain's file layout to ${after}` : said ? "" : `recorded the brain's file layout (${layoutFile(root)})`;
  return [starters.join(" "), files.join(" "), layout].join("\n");
}
