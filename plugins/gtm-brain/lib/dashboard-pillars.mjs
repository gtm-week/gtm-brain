// The dashboard's front page, four tabs by pillar: Configuration (the base documents, RULES.md, SCHEMA.md,
// settings), Entities (one group per kind), Memories (the notes, newest first, with what each replaced) and
// Workflows (workflow files and their runs; the skills come from the page's skill catalog), under the chat start's health line. Reads only: every
// value comes from the lib readers the rest of the plugin uses (documents, schema, rules check, population,
// workflows, relations), never from a hard-coded path, so entity pages can move without this file knowing.
// The renderer writes the result into the page (and the full note list into a side file); nothing here writes.
import { execFileSync } from "node:child_process";
import { statSync, readFileSync, lstatSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import * as lib from "./brain.mjs";
import { listDocuments, STARTERS } from "./documents.mjs";
import { readSchema, brainKinds, fieldsFor, US } from "./schema.mjs";
import { ruleFindings } from "./rules-check.mjs";
import { readAskSource } from "./ask-source.mjs";
import { whereRows } from "./where.mjs";
import { readOurRules } from "./our-rules.mjs";
import { rulesFile, schemaFile, settingsFile } from "./brain-paths.mjs";
import { population, POPULATION_RANGES } from "./population.mjs";
import { healthLine, summaryRuns } from "./health-line.mjs";
import { listWorkflows, listRuns, TYPE as WORKFLOW_TYPE } from "./workflows.mjs";
import { relationOverview } from "./relations.mjs";
import { buildRelationLog } from "./relation-log.mjs";

export const NOTES_PAGE = 40;
const EXCERPT = 320, SHORT = 90;
const cut = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const git = (root, args) => { try { return execFileSync("git", ["--no-optional-locks", "-c", "core.quotePath=false", "-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }); } catch { return ""; } };
const mtime = (root, rel) => { try { return statSync(join(root, rel)).mtime.toISOString(); } catch { return null; } };
const exists = (root, rel) => { try { return statSync(join(root, rel)).isFile(); } catch { return false; } };

/* The last commit date of each path, in one git call, and the paths with changes not saved yet. */
function lastCommits(root, paths) {
  const out = {}, who = {}, dirty = new Set(); if (!paths.length) return { out, who, dirty };
  const text = git(root, ["log", "--format=%x00%cI%x09%an", "--name-only", "--", ...paths]);
  let at = null, by = null;
  for (const line of text.split("\n")) { if (line.startsWith("\0")) [at, by] = line.slice(1).trim().split("\t"); else if (line.trim() && at && !out[line.trim()]) { out[line.trim()] = at; who[line.trim()] = by || null; } }
  for (const entry of git(root, ["status", "--porcelain", "-z", "--", ...paths]).split("\0")) if (entry.length > 3) dirty.add(entry.slice(3));
  return { out, who, dirty };
}
/* Who made a file's last saved change (the commit's author); nobody while it has changes not saved yet. */
const changedBy = (rel, commits) => (rel && commits.who?.[rel] && !commits.dirty.has(rel) ? commits.who[rel] : null);
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
  const rows = docs.map(d => ({ slug: d.slug, title: d.title, path: d.path, state: state(d), applies_to: d.applies_to, changed: changedAt(root, d.path, commits, d.updated), by: d.by, changed_by: changedBy(d.path, commits), base: !!d.base, starter: STARTERS.includes(d.slug) }));
  // A base document nobody has made yet is a row too: the team sees what is missing.
  for (const slug of STARTERS) if (!rows.some(r => r.slug === slug)) rows.push({ slug, title: slug === "icp" ? "ICP" : slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "), path: null, state: "not written", applies_to: [], changed: null, by: null, base: true, starter: true });
  const rank = r => (r.starter ? STARTERS.indexOf(r.slug) : STARTERS.length);
  rows.sort((a, b) => (b.base - a.base) || (rank(a) - rank(b)) || a.title.localeCompare(b.title));

  const RULES = rulesFile(root); let rulesText = ""; try { rulesText = readFileSync(join(root, RULES), "utf8"); } catch {}
  const ask = readAskSource(root), placement = whereRows(root), own = ourRules(rulesText);
  // Our rules with what each applies to, as the rules reader understands them; the plain lines when it cannot read them
  let ownParsed = own.map(text => ({ text: cut(text, 600), applies: null, when: null, mode: null }));
  try {
    const parsed = readOurRules(root).rules; const list = v => (Array.isArray(v) ? v : v ? [v] : []);
    if (parsed.length) ownParsed = parsed.map(r => ({ text: cut(r.text, 600),
      applies: r.tag ? list(r.tag.applies).map(a => (a && typeof a === "object" ? String(Object.values(a).find(v => typeof v === "string") || "") : String(a)).replace(/_/g, " ")).filter(Boolean).join(", ") || null : null,
      when: r.tag?.when ? list(r.tag.when).join(", ") : null, mode: r.tag?.mode || null }));
  } catch {}
  const byRule = {}; for (const f of findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  const rules = { path: rulesText ? RULES : null, changed: rulesText ? changedAt(root, RULES, commits) : null, changed_by: rulesText ? changedBy(RULES, commits) : null,
    count: placement.length + own.length, placement: placement.length, own: own.map(r => cut(r, 200)),
    problems: findings.length, by_rule: byRule, findings: findings.slice(0, 12).map(f => ({ rule: f.rule, what: cut(f.what, 240) })),
    // the rules browser: every rule as a row a person can read, and every finding of the rules check with its choices
    placement_rows: placement.map(r => ({ what: cut(r.what, 300), where: cut(r.where, 400) })), own_rules: ownParsed,
    all_findings: findings.slice(0, 500).map(f => ({ rule: f.rule, kind: f.kind || null, subject: f.subject ? cut(f.subject, 120) : null, what: cut(f.what, 400), choices: (f.choices || []).slice(0, 4).map(c => cut(c, 300)) })),
    ask: { defaults: ask.defaults, rows: ask.rows.map(r => ({ topic: r.topic, source: r.source, good_for: r.good_for })), problems: ask.problems.map(p => ({ line: p.line, problem: cut(p.problem, 200) })) } };

  const s = readSchema(root);
  const schema = { path: s.missing ? null : schemaFile(root), changed: s.missing ? null : changedAt(root, schemaFile(root), commits), changed_by: s.missing ? null : changedBy(schemaFile(root), commits), error: s.error ? cut(s.error.message, 400) : null, kinds: [], relations: [] };
  if (s.schema) {
    schema.kinds = Object.entries(s.schema.kinds).map(([kind, k]) => ({ kind, fields: k.fields.map(f => ({ name: f.name, required: f.required, about: cut(f.about, 240) })),
      subtypes: Object.entries(k.subtypes || {}).map(([name, v]) => ({ name, about: cut(v.about, 200), fields: (v.fields || []).map(f => ({ name: f.name, required: f.required, about: cut(f.about, 240) })) })) }));
    schema.relations = Object.entries(s.schema.relations).map(([type, r]) => ({ type, from: r.from, to: r.to, required: !!r.required, one: !!r.one, built_in: !!r.built_in, about: cut(r.about, 160) }));
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

/* One entity's row for the list and its detail for the reading pane. The row is what the page carries for every
   entity (name, one line of who or what it is, relation to us, counts); the detail (schema fields with the missing
   ones, links grouped by the other end, dated link history, the first lines of the brief) goes to a side file. */
const firstSentence = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(), m = t.match(/^.{20,}?[.!?](?=\s|$)/); return cut(m ? m[0] : t, n); };
function entityCards(root, registry, admin, notes, contexts) {
  const last = new Map(), count = new Map();
  for (const n of notes) { if (n.state !== "in force") continue; for (const id of n.entities) { count.set(id, (count.get(id) || 0) + 1); if (!last.has(id)) last.set(id, n.at); } }
  const { schema = null } = (() => { try { return readSchema(root); } catch { return {}; } })();
  const byRef = new Map(registry.flatMap(e => [e.id, ...(e.previous_ids || [])].map(id => [id, e])));
  const resolve = v => { let e = byRef.get(v); if (!e) { try { e = lib.resolveEntity(registry, v); } catch { e = null; } } return e ? { id: e.id, kind: e.kind } : null; };
  // the dated events behind each link (started, changed, ended), from the relation log
  const events = new Map();
  try {
    const linked = lib.hideForkCopies(contexts.flatMap(c => lib.effectiveMemories(c.memories || []))).filter(m => m.relation || m.customer);
    for (const r of buildRelationLog(linked, { resolve, schema }).relations)
      events.set(`${r.from}|${r.type}|${r.to}`, { since: r.since || null, until: r.until || null,
        events: r.events.filter(e => !e.disputed).map(e => ({ at: e.at, event: e.event, by: e.basis === "user" ? "person" : "source", ...(e.customer_status ? { customer: e.customer_status } : {}) })) });
  } catch {}
  // relation to us (the customer status and any link whose other end is our company) and every link, seen from both ends
  const toUs = new Map(), keys = new Map(), links = new Map();
  const push = (map, id, v) => { if (id) map.set(id, [...(map.get(id) || []), v]); };
  try {
    for (const r of relationOverview(root, { registry, contexts }).relations) {
      const usTo = r.to?.kind === US || r.to?.name === US, usFrom = r.from?.kind === US;
      const mine = usTo ? r.from : usFrom ? r.to : null;
      if (mine?.id) {
        const label = r.customer_status ? r.customer_status.replace(/_/g, " ") : `${r.type.replace(/_/g, " ")}${r.status === "ended" ? " (ended)" : ""}`;
        push(toUs, mine.id, label);
        push(keys, mine.id, r.customer_status || (r.status === "ended" ? null : r.type === "partner_of" ? "partner" : null));
      }
      const log = events.get(`${r.from?.id || US}|${r.type}|${r.to?.id || US}`) || { since: null, until: null, events: [] };
      const link = (out, other) => ({ type: r.type, out, other: other?.id ? { id: other.id, name: other.name, kind: other.kind } : { id: null, name: US, kind: US },
        status: r.status === "ended" ? "ended" : "current", at: r.observed_at || null, ...(r.customer_status ? { customer: r.customer_status } : {}), since: log.since, until: log.until, events: log.events });
      if (r.from?.id) push(links, r.from.id, link(true, r.to));
      if (r.to?.id) push(links, r.to.id, link(false, r.from));
    }
  } catch {}
  const team = new Set((admin.team || []).map(p => String(p.name || "").toLowerCase())), ours = String(admin.company || "").trim().toLowerCase();
  const details = {};
  const rows = registry.filter(e => e.status !== "archived").map(e => {
    let fields = []; try { fields = JSON.parse(e._fm?.compiled_fields || "[]"); } catch {}
    const known = new Map((Array.isArray(fields) ? fields : []).filter(f => f && f.field && f.text).map(f => [f.field, String(f.text)]));
    const key = [...known].slice(0, 4).map(([f, t]) => [f.replace(/_/g, " "), cut(t, 80)]);
    const us = team.has(e.name.toLowerCase()) ? "our team" : ours && [e.name, ...(e.aliases || [])].some(n => String(n).toLowerCase() === ours) ? "us" : null;
    const kind = e.kind || "person", mine = links.get(e.id) || [];
    const wanted = fieldsFor(schema, kind, e.subtype || null), names = new Set(wanted.map(f => f.name));
    const all = [...wanted.map(f => ({ name: f.name, required: !!f.required, value: known.has(f.name) ? cut(known.get(f.name), 240) : null })),
      ...[...known].filter(([f]) => !names.has(f)).map(([f, t]) => ({ name: f, required: false, value: cut(t, 240) }))];
    const brief = (e._compilation?.overview || []).map(c => cut(c?.text, 400)).filter(Boolean).slice(0, 3);
    const company = mine.find(l => l.type === "works_at" && l.out && l.status === "current" && l.other.id)?.other.name || null;
    // one line of who or what it is: the role and the company, else what the schema says it is, else the brief's first sentence
    const what = known.get(kind === "person" ? "role" : kind === "organization" ? "industry" : kind === "offering" ? "what_it_is" : kind === "meeting" || kind === "event" ? "date" : "category") || null;
    const line = kind === "person" ? (what && company ? `${cut(what, 60)} at ${company}` : what ? cut(what, 90) : company ? `Works at ${company}` : null) : what ? cut(what, 90) : null;
    details[e.id] = { fields: all, links: mine, brief, compiled: e._fm?.compiled_at || null };
    return { id: e.id, name: e.name, kind, subtype: e.subtype || null, aliases: (e.aliases || []).slice(0, 6), email: (e.emails || [])[0] || null, emails: (e.emails || []).slice(0, 4),
      fields: key, relation: [us, ...(toUs.get(e.id) || [])].filter(Boolean).join(", ") || null, rel: [...new Set([us === "our team" ? "team" : us, ...(keys.get(e.id) || [])].filter(Boolean))],
      line: line || (brief[0] ? firstSentence(brief[0], 120) : null), described: !!line, company, missing: all.filter(f => f.required && !f.value).length, links: mine.length,
      last: last.get(e.id) || e._fm?.latest_evidence_at || null, notes: count.get(e.id) || 0, path: e._path || null };
  }).sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")) || a.name.localeCompare(b.name));
  return { rows, details };
}

/* The Design system document's visual side: design-system.html beside the Markdown (the Visual tab) and the files in
   a design-system/ folder beside it (or under about-us/). Names and sizes only; the dashboard server serves the
   images and the one HTML file through their own narrow routes (dash.mjs /design-file, /design-visual) and nothing
   else from here. Links and dot files are left out, so a listed path is always a plain file inside the brain. */
export const DESIGN_IMAGES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };
const DESIGN_FILES_MAX = 80;
export function designSystem(root, documents) {
  const doc = documents.find(d => /(^|\/)design-system\.md$/.test(d.path))?.path || null;
  if (!doc) return { doc: null, visual: null, files: [] };
  const plain = rel => { try { const st = lstatSync(join(root, rel)); return st.isFile() ? st : null; } catch { return null; } };
  const beside = dirname(doc) === "." ? "" : dirname(doc) + "/", places = [...new Set([beside, "about-us/"])];
  const visual = places.map(d => d + "design-system.html").find(plain) || null;
  const files = [], walk = (rel, depth) => {
    let entries = []; try { if (!lstatSync(join(root, rel)).isDirectory()) return; entries = readdirSync(join(root, rel)).sort(); } catch { return; }
    for (const name of entries) {
      if (files.length >= DESIGN_FILES_MAX || name.startsWith(".")) continue;
      const path = rel + "/" + name; let st; try { st = lstatSync(join(root, path)); } catch { continue; }
      if (st.isDirectory()) { if (depth < 3) walk(path, depth + 1); }
      else if (st.isFile()) files.push({ path, name: path.slice(folder.length + 1), size: st.size, image: Object.hasOwn(DESIGN_IMAGES, (name.match(/\.[^.]+$/)?.[0] || "").toLowerCase()) });
    }
  };
  const folder = places.map(d => d + "design-system").find(rel => { try { return lstatSync(join(root, rel)).isDirectory(); } catch { return false; } }) || "";
  if (folder) walk(folder, 0);
  return { doc, visual, files };
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

/* What a workflow does, in its own first sentence: the first paragraph of the file that is not a heading, the
   header line, a list or a table. Empty when the file says nothing of the kind. */
export function workflowAbout(doc) {
  for (const block of String(doc?.body || "").split(/\n{2,}/)) {
    const t = block.trim(); if (!t || /^(#|[-*+] |\d+[.)] |\||>|```|<!--)/.test(t) || /^Made with GTM /.test(t)) continue;
    const first = t.replace(/\s+/g, " ").match(/^.*?[.!?](?=\s|$)/)?.[0] || t.replace(/\s+/g, " ");
    return cut(first.replace(/[*_`]/g, ""), 220);
  }
  return "";
}

function workflows(root, documents, runs, commits) {
  const docs = new Map(documents.filter(d => d.extra?.type === WORKFLOW_TYPE).map(d => [d.slug, d]));
  let parsed = []; try { parsed = listWorkflows(root); } catch {}
  const files = parsed.map(w => {
    try { return fileRow(w); }   // one file nobody can read is one row saying so, not an empty tab
    catch { return { slug: String(w?.slug || "?"), title: String(w?.title || w?.slug || "?"), path: typeof w?.path === "string" ? w.path : null, status: "draft", ok: false, problems: ["This workflow file could not be read."], steps: null, trigger: "manual", changed: null, runs: [], step_titles: [], about: "" }; }
  });
  function fileRow(w) {
    const d = docs.get(w.slug), own = runs.filter(r => r.workflow === w.slug);
    return { slug: w.slug, title: w.title || w.slug, path: w.path || d?.path || null, status: w.status || d?.status || "draft", ok: !!w.ok, problems: (w.problems || []).map(p => cut(p, 160)),
      steps: w.ok ? w.steps.length : null, step_titles: w.ok ? w.steps.map(st => cut(st.title || "", 120)) : [], about: workflowAbout(d), trigger: workflowTrigger(d), changed: w.path ? changedAt(root, w.path, commits, d?.updated) : null,
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
  let pop = null; const R = POPULATION_RANGES;
  try { const p = population(root); pop = { at: p.at, saved_this_week: p.saved.last_7_days, average_week: p.saved.average_4_weeks_before, duplicates: p.duplicates.exact + p.duplicates.near,
    entities_without_notes: p.entities.without_notes, entities_total: p.entities.total, missing_required: p.entities.missing_required, notes: p.notes,
    // what the Overview turns into items: each number with whether it is outside the range the chat start reports
    duplicates_exact: p.duplicates.exact, duplicates_near: p.duplicates.near, duplicates_flag: p.notes >= R.min_notes && p.duplicates.share > R.duplicates_max,
    missing_required_fields: p.entities.missing_required_fields || {}, schema_untouched: !!p.entities.schema_untouched, uncited: p.citations.uncited, uncited_of: p.citations.judged,
    uncited_flag: p.notes >= R.min_notes && p.citations.judged >= R.min_notes && p.citations.uncited_share > R.uncited_max,
    without_source: p.sources.without, without_source_flag: p.notes >= R.min_notes && p.sources.without_share > R.no_source_max }; } catch { pop = null; }
  let summaryError = null; try { const e = summaryRuns(root).error; if (e) summaryError = { at: e.at, context: e.context || null, what: cut(e.what || e.why, 200), todo: cut(e.todo, 200) }; } catch {}
  const entities = section("entities", () => {
    const kinds = [...new Set([...brainKinds(root), ...registry.map(e => e.kind || "person")])], { rows, details } = entityCards(root, registry, admin, notes, full);
    return { kinds: kinds.map(k => ({ kind: k, count: rows.filter(e => e.kind === k).length })), rows, details };
  }, { kinds: [], rows: [], details: {} });
  const tagCount = new Map(); for (const n of notes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  return {
    health: healthText(root, meetings), summary_error: summaryError,
    configuration: section("configuration", () => configuration(root, admin, { documents, commits, findings: ruleList, tools, plugin, compileMode }), EMPTY_CONFIGURATION()),
    entities,
    memories: { notes, total: notes.length, in_force: notes.filter(n => n.state === "in force").length,
      kinds: [...new Set(notes.map(n => n.kind))].sort(), tags: [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60).map(([t, n]) => ({ tag: t, n })),
      population: pop },
    workflows: section("workflows", () => workflows(root, documents, runs, commits), { files: [], orphans: [] }),
    design: (() => { try { return designSystem(root, documents); } catch { return { doc: null, visual: null, files: [] }; } })(),
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
