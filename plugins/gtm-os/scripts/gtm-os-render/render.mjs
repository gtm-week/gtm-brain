#!/usr/bin/env node
// render: build work/home/index.html from the brain. Read-only; never writes brain/.
//   node render.mjs <root>
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { contextLabel } from "./localize.mjs";
import { skillCatalog } from './skill-catalog.mjs';
import { listDocuments, documentFiles } from '../../lib/documents.mjs';
import { assetRows } from '../../lib/assets.mjs';
import { contextGraph } from "../../lib/context-graph.mjs";
import { entityGraph } from "../../lib/entity-graph.mjs";
import { dashboardData, dashboardSourceRevision } from '../../lib/dashboard-data.mjs';
import { refreshIndexedPages } from '../../lib/entity-pages.mjs';
import { hasMemoryIndex, openDatabase } from '../../lib/memory-index-store.mjs';
import { readJSON, writeJSON, renderQueue } from '../../lib/dashboard-refresh.mjs';
import { randomUUID } from 'node:crypto';
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const root = resolve(process.argv[2] || ".");
const admin = lib.readAdmin(root); if (!admin) { console.error("no brain here"); process.exit(1); }
mkdirSync(join(root, 'work'), { recursive: true });
mkdirSync(renderQueue(), { recursive: true, mode: 0o700 });
const renderSlot = hasMemoryIndex() ? openDatabase(join(renderQueue(), 'renderer.sqlite')) : null;
if (renderSlot) { renderSlot.exec('PRAGMA busy_timeout=55000; BEGIN IMMEDIATE'); process.on('exit', () => renderSlot.close()); }
// Explicit renders and queued renders publish through the same gate. A killed
// process releases it automatically, and writers never need this lock to save.
const renderLock = hasMemoryIndex() ? openDatabase(join(root, 'work', 'render-lock.sqlite')) : null;
if (renderLock) { renderLock.exec('PRAGMA busy_timeout=55000; BEGIN IMMEDIATE'); process.on('exit', () => renderLock.close()); }
const renderRequest = readJSON(join(root, 'work', 'render-request.json'));
const loaded = lib.readLoaded(root);
const reg = lib.readNames(root);
const snapshot = hasMemoryIndex() ? dashboardData(root, reg) : null;
const sourceContexts = snapshot?.contexts || lib.listContexts(root);
const contexts = sourceContexts.map(c => { const mem = lib.effectiveMemories(c.memories); return { slug: c.slug, title: c.title, label: contextLabel(c), status: c.status, summary: c.summary, now: c.now, rule: c.rule, whenLoaded: c.whenLoaded, people: c.people, names: c.names, tools: c.tools, related: c.related, confidence: c.fm.confidence || null, compiledAt: c.compiledAt, lastMemory: c.lastMemory, stale: c.stale, manualEdit: c.manualEdit.blocked, loaded: loaded.includes(c.slug), memories: snapshot ? mem : [...mem].reverse(), stored: c.storedMemories ?? c.memories.length, totalMemories: c.totalMemories ?? mem.length, history: c.history || [], historyPage: 0 }; });
// Global lists count a forked copy and its origin once; each context's own list keeps its copies.
const all = lib.hideForkCopies(contexts.flatMap(c => c.memories.map(m => ({ ...m, contextTitle: c.label })))).sort((a, b) => a.at < b.at ? 1 : -1);
const teamNames = new Set((admin.team || []).map(p => String(p.name || "").toLowerCase()));
const graph = snapshot?.graph || entityGraph(reg, sourceContexts);
const entityIndex = snapshot ? null : lib.entityEvidenceIndex(reg, sourceContexts);
const views = new Map(), detailFolder = 'entities-' + randomUUID();
const detailDir = join(root, 'work', 'home', detailFolder); mkdirSync(detailDir, { recursive: true });
if (snapshot) refreshIndexedPages(root, reg, (n, facts, _changed, index) => {
  const brief = { stale: facts.stale, compiledAt: facts.compiled_at, latestEvidenceAt: facts.latest_evidence_at, compilation: facts.stale ? null : facts.previous,
    fileNotes: facts.file_notes?.markdown ?? null, timeline: facts.timeline, timelineTotal: facts.timeline_total,
    timelineByContext: Object.fromEntries(facts.contexts.map(c => [c.context, lib.memoryTimeline(c.memories.filter(m => !m.retracts))])) };
  const node = graph.nodes.find(e => e.name === n.name);
  const refs = new Set([...node.contexts.flatMap(c => [...c.evidence.map(r => r.id), ...c.withdrawals]), ...graph.links.filter(l => l.a === n.name || l.b === n.name).flatMap(l => l.evidence.map(r => r.id))]);
  const citations = new Map(facts.evidence.map(m => [m.id, m]));
  const lookup = index.db.prepare('SELECT raw FROM memories WHERE id=? AND effective=1 LIMIT 1');
  for (const id of refs) { const row = lookup.get(id); if (row) citations.set(id, JSON.parse(row.raw)); }
  writeFileSync(join(detailDir, n.id + '.json'), JSON.stringify({ brief, citations: [...citations.values()] }));
  views.set(n.id, { ...brief, timeline: brief.timeline.slice(0, 10), timelineByContext: {}, detail: detailFolder + '/' + n.id + '.json' });
  return '';
}, { readOnly: true });
const names = reg.map((n, i) => {
  const view = snapshot ? null : lib.entityBrief(root, n.id, { registry: reg, contexts: sourceContexts, index: entityIndex });
  return { id: n.id, name: n.name, status: n.status || "active", kind: n.kind, subtype: n.subtype, aliases: n.aliases, emails: n.emails, not: n.not, references: n.references, path: n._path,
    brief: views.get(n.id) || { stale: view.stale, compiledAt: view.compiled_at, latestEvidenceAt: view.latest_evidence_at, compilation: view.compilation, fileNotes: view.file_notes?.markdown ?? null, timeline: view.timeline,
      timelineByContext: Object.fromEntries(view.contexts.map(c => [c.context, lib.memoryTimeline(c.memories.filter(m => !m.retracts))])) },
    team: teamNames.has(n.name.toLowerCase()), mentions: graph.nodes[i].mentions, contexts: graph.nodes[i].contexts.filter(c => c.evidence.length).map(c => c.context) };
});
const identities = new Map(reg.map(n => [n.name, { name: n.name, kind: n.kind }]));
for (const c of contexts) c.entityNames = graph.nodes.filter(n => n.contexts.some(r => r.context === c.slug && (r.cover || r.evidence.length))).map(n => identities.get(n.name));
let toolState = {}; try { toolState = JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8")); } catch {}
const key = t => String(t).toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
// Suggested candidates (email, calendar, the CRM: the pulse) live in tools.json before admin.md names them.
const extraTools = Object.values(toolState).filter(s => s && s.tool && !(admin.tools || []).some(t => key(t) === key(s.tool))).map(s => s.tool);
const toolRows = [...(admin.tools || []), ...extraTools].map(t => { const s = toolState[key(t)] || {}; return { tool: t, plugin: s.plugin || null, status: s.status || "not checked", test: s.test || null, note: s.note || "", at: s.at || null, suggested: !!s.suggested, declined: !!s.declined }; });
let proposal = null; try { const prop = readFileSync(join(root, "work", "admin.proposed.md"), "utf8"), cur = readFileSync(join(root, "brain", "admin.md"), "utf8"); if (prop !== cur) proposal = { diff: lib.lineDiff(cur, prop), lines: lib.lineDiff(cur, prop).filter(l => !l.startsWith("  ")).length }; } catch {}
let interaction = null; try { const p = JSON.parse(readFileSync(join(root, "work", "interaction.proposed.json"), "utf8")); const current = lib.readInteractions(root); if (!current.error && !lib.validateInteraction(root, p, { existing: current.actions }).length) { const props = p.input_schema?.properties || {}, req = p.input_schema?.required || []; interaction = { name: p.name, title: p.title || p.name, tool: p.tool, operation: p.operation, description: p.description || "", inputs: Object.keys(props).map(k => req.includes(k) ? k : `${k}?`), context: p.record?.context || "", records: lib.renderTemplate(p.record?.content, Object.fromEntries(Object.keys(props).map(k => [k, `[${k}]`]))) }; } } catch {}
const dash = lib.readDash(root), session = lib.readSession(root);
const merges = lib.suggestMerges(reg);
const compileState = lib.readCompileState(root), compileMode = lib.compileMode(root), busy = lib.compileBusy(root), gaveUp = lib.compileGaveUp(root);
for (const c of contexts) c.updating = !!(!c.manualEdit && c.stale && compileMode === "background" && busy && (!compileState.contexts || compileState.contexts.split(" ").includes(c.slug) || compileState.state === "queued"));
let plugin = null; try { plugin = JSON.parse(readFileSync(join(root, "work", "plugin-version.json"), "utf8")); } catch {}
// The page shows the plugin that renders it. A cached check made by an older version is for that
// version: its "latest" may still be newer, its "checked" date is not a check of this one (ALL-211).
const running = JSON.parse(readFileSync(new URL("../../.codex-plugin/plugin.json", import.meta.url), "utf8")).version;
const newerVersion = (a, b) => { if (!a || !b) return false; const pa = String(a).split(/[.-]/).map(Number), pb = String(b).split(/[.-]/).map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; } return false; };
if (plugin && plugin.installed !== running) plugin = newerVersion(plugin.latest, running) ? { ...plugin, installed: running, status: "newer" } : { installed: running, latest: null, status: "unchecked", checkedAt: null };
// the folders linked to this brain as projects: each with its own loaded set, the notes tagged with it, and whether its pointer still stands
const projects = lib.readProjects(root).map(p => { const mine = all.filter(m => m.tags.includes(`project:${p.slug}`)); return { slug: p.slug, title: p.title, path: p.path, contexts: p.contexts, loaded: lib.readLoaded(root, p.slug), notes: snapshot?.projects[p.slug]?.notes ?? mine.length, lastNote: snapshot?.projects[p.slug]?.lastNote ?? mine[0]?.at ?? null, pointer: lib.projectPointerStatus(root, p) === "ok", pointerStatus: lib.projectPointerStatus(root, p) }; });
const data = { manualEdits: lib.manualCoverChanges(root), name: basename(root), brain: root, generatedAt: new Date().toISOString(), plugin: plugin ? { installed: plugin.installed, latest: plugin.latest, status: plugin.status, checkedAt: plugin.checkedAt } : null, tools: toolRows, merges, compile: { mode: compileMode, ...(compileState || {}), gaveUp }, proposal, interaction, onboarding: lib.readOnboarding(root), dash: dash ? dash.url : null, chat: session ? { id: session.session_id, at: session.at } : null, unsaved: lib.unsavedChanges(root), activity: lib.readActivity(root, 12), admin: { company: admin.company, owner: admin.owner, team: admin.team || [], tools: admin.tools || [], dashboard: admin.dashboard === "on-demand" ? "on-demand" : "always", compile: compileMode, body: admin.body }, loaded, projects, contexts, names, questions: all.filter(m => m.kind === "question" && m.tags.includes("brain-question")), decisions: all.filter(m => m.kind === "decision"), actions: all.filter(m => m.kind === "action"), recent: all };
// Codex threads on the page: each codex: source and the summary run's thread, resolved once (link, name, project)
if (snapshot) Object.assign(data, { questions: snapshot.questions, decisions: snapshot.decisions, actions: snapshot.actions, recent: snapshot.recent, citations: snapshot.citations, totals: snapshot.totals, listHistory: snapshot.listHistory });
for (const m of [...data.questions, ...data.decisions, ...data.actions, ...data.recent]) m.contextTitle = contexts.find(c => c.slug === m.context)?.label;
const threads = {};
for (const id of new Set([...all.flatMap(m => m.source.filter(s => s.kind === "codex").map(s => s.ref)), ...(compileState && compileState.thread ? [compileState.thread] : [])])) { const t = lib.resolveThread(id, root); if (t) threads[id] = t; }
data.threads = threads;
const outDir = join(root, "work", "home"); mkdirSync(outDir, { recursive: true });
data.skills = skillCatalog(undefined, root);
const allDocs = listDocuments(root); data.documents = allDocs.map(({ body, ...d }) => ({ ...d, files: documentFiles(root, d, allDocs).length }));
data.entityGraph = graph;
data.contextGraph = snapshot?.contextConnections || contextGraph(sourceContexts);
data.assets = assetRows(root, snapshot?.specialContexts || sourceContexts);
data.customers = lib.customerOverview(root, { registry: reg, contexts: snapshot?.specialContexts || sourceContexts });
data.meetings = lib.meetingOverview(root, { by: lib.currentPerson(root) || undefined, registry: reg, contexts: snapshot?.specialContexts || sourceContexts });
for (const c of contexts) c.summaryPlaceholder = !c.compiledAt && c.summary === "Nothing here yet.";
// Prebuilt frontend assets keep installation and rendering independent of npm.
mkdirSync(join(outDir, 'ui', 'fonts'), {recursive:true});
for (const file of ['dashboard.js','dashboard.css','dashboard.js.LEGAL.txt','SHADCN-LICENSE.md','FONT-LICENSE.md','favicon.png',
 'fonts/inter-latin.woff2','fonts/inter-latin-ext.woff2','fonts/space-grotesk-latin.woff2','fonts/space-grotesk-latin-ext.woff2',
 'fonts/jetbrains-mono-latin.woff2','fonts/jetbrains-mono-latin-ext.woff2']) {
 const asset=new URL('./ui/'+file,import.meta.url);
 if (existsSync(asset)) writeFileSync(join(outDir,'ui',file),readFileSync(asset));
}
const tpl = readFileSync(new URL("./home.template.html", import.meta.url), "utf8");
// Publish a matched page/data pair before notifying live viewers. The data rename is the revision event.
const publish = (name, content) => {
  const temporary = join(outDir, `.${name}.${process.pid}.tmp`);
  writeFileSync(temporary, content);
  renameSync(temporary, join(outDir, name));
};
const serialized = JSON.stringify(data).replace(/</g, '\\u003c');
if (snapshot && snapshot.revision !== dashboardSourceRevision(root)) throw new Error('Brain changed during dashboard refresh. Retry render_dashboard.');
let previous; try { previous = JSON.parse(readFileSync(join(outDir, 'data.json'), 'utf8')); } catch {}
publish("index.html", tpl.replace("__DATA__", serialized));
publish("data.json", serialized);
if (renderRequest && readJSON(join(root, 'work', 'render-request.json'))?.id === renderRequest.id) writeJSON(join(root, 'work', 'render-state.json'), { request: renderRequest.id, status: 'ready', completedAt: data.generatedAt });
// Keep the current and previous immutable snapshots for readers crossing a
// revision event. Only renderer-owned folders are eligible for retirement.
const keep = new Set([data, previous].filter(Boolean).flatMap(d => [
  ...(d.names || []).map(n => n.brief?.detail?.split('/')[0]).filter(Boolean),
  ...(d.contexts || []).flatMap(c => (c.history || []).map(p => p.split('/').slice(0, 2).join('/'))),
  ...Object.values(d.listHistory || {}).flatMap(paths => paths.map(p => p.split('/').slice(0, 2).join('/'))),
]));
for (const entry of readdirSync(outDir, { withFileTypes: true })) if (entry.isDirectory() && /^entities-[a-f0-9-]{36}$/.test(entry.name) && !keep.has(entry.name)) rmSync(join(outDir, entry.name), { recursive: true });
if (existsSync(join(outDir, 'history'))) for (const entry of readdirSync(join(outDir, 'history'), { withFileTypes: true })) if (entry.isDirectory() && /^[a-z0-9-]+-[a-f0-9]{20}$/.test(entry.name) && !keep.has('history/' + entry.name)) rmSync(join(outDir, 'history', entry.name), { recursive: true });
console.log(`rendered work/home/index.html · ${contexts.length} contexts (${contexts.filter(c => c.stale && c.status === "active").length} behind) · ${snapshot?.totals.memories ?? all.length} memories · ${snapshot?.totals.questions ?? data.questions.length} open questions · ${names.length} people${dash ? ` · live at ${dash.url}` : ""}`);
