// The dashboard's front page, four tabs by pillar: Configuration (the base documents, RULES.md, SCHEMA.md,
// settings), Entities (one group per kind), Memories (the notes, newest first, with what each replaced) and
// Workflows (workflow files and their runs; the skills come from the page's skill catalog), under the chat start's health line. Reads only: every
// value comes from the lib readers the rest of the plugin uses (documents, schema, rules check, population,
// workflows, relations), never from a hard-coded path, so entity pages can move without this file knowing.
// The renderer writes the result into the page (and the full note list into a side file); nothing here writes.
import { execFileSync } from "node:child_process";
import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as lib from "./brain.mjs";
import { listDocuments, STARTERS } from "./documents.mjs";
import { readSchema, brainKinds, US } from "./schema.mjs";
import { ruleFindings } from "./rules-check.mjs";
import { readAskSource } from "./ask-source.mjs";
import { whereRows } from "./where.mjs";
import { rulesFile, schemaFile, settingsFile } from "./brain-paths.mjs";
import { population } from "./population.mjs";
import { healthLine } from "./health-line.mjs";
import { listWorkflows, listRuns, TYPE as WORKFLOW_TYPE } from "./workflows.mjs";
import { relationOverview } from "./relations.mjs";

export const NOTES_PAGE = 40;
const EXCERPT = 320, SHORT = 90;
const cut = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const git = (root, args) => { try { return execFileSync("git", ["--no-optional-locks", "-c", "core.quotePath=false", "-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }); } catch { return ""; } };
const mtime = (root, rel) => { try { return statSync(join(root, rel)).mtime.toISOString(); } catch { return null; } };
const exists = (root, rel) => { try { return statSync(join(root, rel)).isFile(); } catch { return false; } };

/* The last commit date of each path, in one git call, and the paths with changes not saved yet. */
function lastCommits(root, paths) {
  const out = {}, dirty = new Set(); if (!paths.length) return { out, dirty };
  const text = git(root, ["log", "--format=%x00%cI", "--name-only", "--", ...paths]);
  let at = null;
  for (const line of text.split("\n")) { if (line.startsWith("\0")) at = line.slice(1).trim(); else if (line.trim() && at && !out[line.trim()]) out[line.trim()] = at; }
  for (const entry of git(root, ["status", "--porcelain", "-z", "--", ...paths]).split("\0")) if (entry.length > 3) dirty.add(entry.slice(3));
  return { out, dirty };
}
/* When a file last changed: its last commit, or the file's own time while it has changes not saved (or was never committed). */
const changedAt = (root, rel, commits, updated = null) => {
  const c = commits.out[rel] || null;
  if (c && !commits.dirty.has(rel)) return c;
  return mtime(root, rel) || c || updated;
};

/* The chat start's health line without its instruction to the model. */
export function healthText(root, overview, read = healthLine) {
  let line = null; try { line = read(root, overview); } catch {}
  if (!line) return null;
  // The instruction is the line's last sentence. Should its wording change, the last sentence still goes:
  // losing a few words of the line is better than showing the person a sentence written for the model.
  const body = String(line).replace(/^health:\s*/, ""), known = body.search(/\.\s*Say this if/);
  const at = known >= 0 ? known : body.search(/\.\s+[A-Z][^.]*\.?\s*$/);
  return (at >= 0 ? body.slice(0, at) : body).trim() || null;
}

/* "## Our rules" in RULES.md, read defensively: one rule per bullet or numbered line, comments skipped. */
export function ourRules(text) {
  const lines = String(text || "").split("\n"), start = lines.findIndex(l => /^##\s+Our rules\s*$/i.test(l.trim()));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##?\s/.test(l)) break;
    const m = l.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/); if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

function configuration(root, admin, { documents, commits, findings, tools, plugin, compileMode }) {
  const docs = documents.filter(d => d.extra?.type !== WORKFLOW_TYPE);
  const state = d => !d.filled ? "not written" : d.status === "approved" ? "approved" : "draft";
  const rows = docs.map(d => ({ slug: d.slug, title: d.title, path: d.path, state: state(d), applies_to: d.applies_to, changed: changedAt(root, d.path, commits, d.updated), by: d.by, base: !!d.base, starter: STARTERS.includes(d.slug) }));
  // A base document nobody has made yet is a row too: the team sees what is missing.
  for (const slug of STARTERS) if (!rows.some(r => r.slug === slug)) rows.push({ slug, title: slug === "icp" ? "ICP" : slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "), path: null, state: "not written", applies_to: [], changed: null, by: null, base: true, starter: true });
  const rank = r => (r.starter ? STARTERS.indexOf(r.slug) : STARTERS.length);
  rows.sort((a, b) => (b.base - a.base) || (rank(a) - rank(b)) || a.title.localeCompare(b.title));

  const RULES = rulesFile(root); let rulesText = ""; try { rulesText = readFileSync(join(root, RULES), "utf8"); } catch {}
  const ask = readAskSource(root), placement = whereRows(root), own = ourRules(rulesText);
  const byRule = {}; for (const f of findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  const rules = { path: rulesText ? RULES : null, changed: rulesText ? changedAt(root, RULES, commits) : null,
    count: placement.length + own.length, placement: placement.length, own: own.map(r => cut(r, 200)),
    problems: findings.length, by_rule: byRule, findings: findings.slice(0, 12).map(f => ({ rule: f.rule, what: cut(f.what, 240) })),
    ask: { defaults: ask.defaults, rows: ask.rows.map(r => ({ topic: r.topic, source: r.source, good_for: r.good_for })), problems: ask.problems.map(p => ({ line: p.line, problem: cut(p.problem, 200) })) } };

  const s = readSchema(root);
  const schema = { path: s.missing ? null : schemaFile(root), changed: s.missing ? null : changedAt(root, schemaFile(root), commits), error: s.error ? cut(s.error.message, 400) : null, kinds: [], relations: [] };
  if (s.schema) {
    schema.kinds = Object.entries(s.schema.kinds).map(([kind, k]) => ({ kind, fields: k.fields.map(f => ({ name: f.name, required: f.required })),
      subtypes: Object.entries(k.subtypes || {}).map(([name, v]) => ({ name, fields: (v.fields || []).map(f => ({ name: f.name, required: f.required })) })) }));
    schema.relations = Object.entries(s.schema.relations).map(([type, r]) => ({ type, from: r.from, to: r.to, required: !!r.required, built_in: !!r.built_in, about: cut(r.about, 160) }));
  } else schema.kinds = brainKinds(root).map(kind => ({ kind, fields: [], subtypes: [] }));

  const settings = { path: settingsFile(root), changed: changedAt(root, settingsFile(root), commits), company: admin.company || null, owner: admin.owner || null,
    team: (admin.team || []).length, tools: tools.map(t => ({ tool: t.tool, status: t.status })), dashboard: admin.dashboard === "on-demand" ? "on-demand" : "always",
    compile: compileMode, plugin: plugin?.installed || null };
  return { documents: rows, rules, schema, settings };
}

/* Every note but a retraction, newest first, with what it replaced and what replaced or withdrew it. */
export function noteIndex(contexts) {
  const out = [];
  for (const c of contexts) {
    const all = c.memories || [], byId = new Map(all.map(m => [m.id, m]));
    const replacedBy = new Map(), withdrawnBy = new Map();
    for (const m of all) { if (m.supersedes) replacedBy.set(m.supersedes, m); if (m.retracts) withdrawnBy.set(m.retracts, m); }
    for (const m of lib.hideForkCopies(all)) {
      if (m.retracts) continue;
      const old = m.supersedes ? byId.get(m.supersedes) : null, next = replacedBy.get(m.id), gone = withdrawnBy.get(m.id);
      out.push({ id: m.id, at: m.at, kind: m.kind || "note", context: c.slug, tags: (m.tags || []).filter(t => typeof t === "string"), text: cut(m.content, EXCERPT),
        source: (Array.isArray(m.source) ? m.source : []).slice(0, 3), entities: (m.entities || []).filter(x => typeof x === "string"), authors: (m.authors || []).slice(0, 3),
        state: gone ? "withdrawn" : next ? "replaced" : "in force",
        ...(m.supersedes ? { replaces: { id: m.supersedes, at: old?.at || null, text: old ? cut(old.content, SHORT) : null } } : {}),
        ...(next ? { replacedBy: { id: next.id, at: next.at, text: cut(next.content, SHORT) } } : {}),
        ...(gone ? { withdrawnBy: { id: gone.id, at: gone.at, text: cut(gone.content, SHORT) } } : {}) });
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id));
}

function entityCards(root, registry, admin, notes, contexts) {
  const last = new Map(), count = new Map();
  for (const n of notes) { if (n.state !== "in force") continue; for (const id of n.entities) { count.set(id, (count.get(id) || 0) + 1); if (!last.has(id)) last.set(id, n.at); } }
  // relation to us: the customer status and any current relationship whose other end is our company
  const toUs = new Map();
  try {
    for (const r of relationOverview(root, { registry, contexts }).relations) {
      const mine = r.to?.kind === US || r.to?.name === US ? r.from : r.from?.kind === US ? r.to : null;
      if (!mine?.id) continue;
      const label = r.customer_status ? r.customer_status.replace(/_/g, " ") : `${r.type.replace(/_/g, " ")}${r.status === "ended" ? " (ended)" : ""}`;
      toUs.set(mine.id, [...(toUs.get(mine.id) || []), label]);
    }
  } catch {}
  const team = new Set((admin.team || []).map(p => String(p.name || "").toLowerCase())), ours = String(admin.company || "").trim().toLowerCase();
  return registry.filter(e => e.status !== "archived").map(e => {
    let fields = []; try { fields = JSON.parse(e._fm?.compiled_fields || "[]"); } catch {}
    const key = (Array.isArray(fields) ? fields : []).filter(f => f && f.field && f.text).slice(0, 4).map(f => [f.field.replace(/_/g, " "), cut(f.text, 80)]);
    const us = team.has(e.name.toLowerCase()) ? "our team" : ours && [e.name, ...(e.aliases || [])].some(n => String(n).toLowerCase() === ours) ? "us" : null;
    return { id: e.id, name: e.name, kind: e.kind || "person", subtype: e.subtype || null, aliases: (e.aliases || []).slice(0, 6), email: (e.emails || [])[0] || null,
      fields: key, relation: [us, ...(toUs.get(e.id) || [])].filter(Boolean).join(", ") || null,
      last: last.get(e.id) || e._fm?.latest_evidence_at || null, notes: count.get(e.id) || 0, path: e._path || null };
  }).sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")) || a.name.localeCompare(b.name));
}

/* A trigger, from whatever a workflow file says today: a frontmatter trigger or schedule, or a "## Trigger"
   section. Another version may add more; anything not understood is shown as written, and none is "manual". */
const flat = (v, depth = 0) => {
  if (v === undefined || v === null || depth > 4) return "";
  if (Array.isArray(v)) return v.map(i => flat(i, depth + 1)).filter(Boolean).join(depth ? ", " : "; ");
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => { const t = flat(x, depth + 1); return t ? `${k} ${t}` : ""; }).filter(Boolean).join(" ");
  return String(v).trim();
};
export function workflowTrigger(doc) {
  const x = doc?.extra && typeof doc.extra === "object" ? doc.extra : {};
  for (const k of ["trigger", "triggers", "schedule", "when", "on"]) {
    let t = ""; try { t = flat(x[k]); } catch {}
    if (t) return cut(t, 120);
  }
  const m = String(doc?.body || "").match(/^##\s+Triggers?\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m);
  if (m) { const t = m[1].split("\n").map(l => l.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean).join("; "); if (t) return cut(t, 120); }
  return "manual";
}

function workflows(root, documents, runs, commits) {
  const docs = new Map(documents.filter(d => d.extra?.type === WORKFLOW_TYPE).map(d => [d.slug, d]));
  let parsed = []; try { parsed = listWorkflows(root); } catch {}
  const files = parsed.map(w => {
    try { return fileRow(w); }   // one file nobody can read is one row saying so, not an empty tab
    catch { return { slug: String(w?.slug || "?"), title: String(w?.title || w?.slug || "?"), path: typeof w?.path === "string" ? w.path : null, status: "draft", ok: false, problems: ["This workflow file could not be read."], steps: null, trigger: "manual", changed: null, runs: [] }; }
  });
  function fileRow(w) {
    const d = docs.get(w.slug), own = runs.filter(r => r.workflow === w.slug);
    return { slug: w.slug, title: w.title || w.slug, path: w.path || d?.path || null, status: w.status || d?.status || "draft", ok: !!w.ok, problems: (w.problems || []).map(p => cut(p, 160)),
      steps: w.ok ? w.steps.length : null, trigger: workflowTrigger(d), changed: w.path ? changedAt(root, w.path, commits, d?.updated) : null,
      runs: own.map(r => { const step = r.current, title = step && w.ok ? w.steps[step.n - 1]?.title || null : null;
        return { id: r.id, started: r.startedAt, by: r.by, context: r.context, ended: r.ended ? { how: r.ended.how, at: r.ended.at } : null,
          step: step ? { n: step.n, of: w.ok ? w.steps.length : r.steps.length, title, status: step.status, due: step.due || null } : null, waiting: r.open ? cut(r.open.content, 160) : null }; }) };
  }
  // runs whose workflow file is gone still show, under their own name
  const known = new Set(files.map(f => f.slug));
  const orphans = runs.filter(r => !known.has(r.workflow)).map(r => ({ id: r.id, workflow: r.workflow, started: r.startedAt, ended: r.ended ? { how: r.ended.how, at: r.ended.at } : null,
    step: r.current ? { n: r.current.n, of: r.steps.length, title: null, status: r.current.status, due: r.current.due || null } : null }));
  return { files, orphans };
}

/* Everything the four tabs show. contexts must carry every memory (lib.listContexts(root) does). */
export function pillarData(root, { registry = lib.readNames(root), admin = lib.readAdmin(root) || {}, contexts = null, meetings = null, tools = [], plugin = null, compileMode = null, findings = null } = {}) {
  const full = contexts || lib.listContexts(root);
  const documents = listDocuments(root);
  const paths = [...documents.map(d => d.path), rulesFile(root), schemaFile(root), settingsFile(root)];
  const commits = lastCommits(root, paths.filter(p => exists(root, p)));
  let ruleList = findings; if (!ruleList) { try { ruleList = ruleFindings(root); } catch { ruleList = []; } }
  // Each tab is read on its own: a file one reader cannot handle empties that tab and names it in `unread`,
  // and the page says so there. It never stops the render, so the other tabs and More stay usable.
  const unread = [], section = (name, read, empty) => { try { return read(); } catch { unread.push(name); return empty; } };
  const notes = section("memories", () => noteIndex(full), []);
  let runs = []; try { runs = listRuns(root); } catch {}
  let pop = null;
  try { const p = population(root); pop = { at: p.at, saved_this_week: p.saved.last_7_days, average_week: p.saved.average_4_weeks_before, duplicates: p.duplicates.exact + p.duplicates.near,
    entities_without_notes: p.entities.without_notes, entities_total: p.entities.total, missing_required: p.entities.missing_required, notes: p.notes }; } catch { pop = null; }
  const entities = section("entities", () => {
    const kinds = [...new Set([...brainKinds(root), ...registry.map(e => e.kind || "person")])], rows = entityCards(root, registry, admin, notes, full);
    return { kinds: kinds.map(k => ({ kind: k, count: rows.filter(e => e.kind === k).length })), rows };
  }, { kinds: [], rows: [] });
  const tagCount = new Map(); for (const n of notes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  return {
    health: healthText(root, meetings),
    configuration: section("configuration", () => configuration(root, admin, { documents, commits, findings: ruleList, tools, plugin, compileMode }), EMPTY_CONFIGURATION()),
    entities,
    memories: { notes, total: notes.length, in_force: notes.filter(n => n.state === "in force").length,
      kinds: [...new Set(notes.map(n => n.kind))].sort(), tags: [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60).map(([t, n]) => ({ tag: t, n })),
      population: pop },
    workflows: section("workflows", () => workflows(root, documents, runs, commits), { files: [], orphans: [] }),
    unread,
  };
}
const EMPTY_CONFIGURATION = () => ({ documents: [],
  rules: { path: null, changed: null, count: 0, placement: 0, own: [], problems: 0, by_rule: {}, findings: [], ask: { defaults: true, rows: [], problems: [] } },
  schema: { path: null, changed: null, error: null, kinds: [], relations: [] },
  settings: { path: null, changed: null, company: null, owner: null, team: 0, tools: [], dashboard: "always", compile: null, plugin: null } });

/* The notes the page itself carries: the newest, up to a full page of notes in force (what the tab shows first),
   with the corrected and withdrawn ones between them. Opening the dashboard then needs no second request. */
export function firstNotes(notes, page = NOTES_PAGE) {
  const out = []; let live = 0;
  for (const n of notes) { if (live >= page || out.length >= page * 3) break; out.push(n); if (n.state === "in force") live++; }
  return out;
}

/* The brain files the tabs link to, the only ones the dashboard server opens for reading (dash.mjs /file). */
export function pillarFiles(p) {
  const c = p.configuration, w = p.workflows;
  return [...new Set([...c.documents.map(d => d.path), c.rules.path, c.schema.path, c.settings.path, ...w.files.map(f => f.path), ...p.entities.rows.map(e => e.path)].filter(Boolean))].sort();
}
