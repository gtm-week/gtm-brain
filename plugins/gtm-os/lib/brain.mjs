// gtm-os v0: the file format. Everything else (skills, hooks, render) goes through this file.
//
//   brain/admin.md                          workplace info, frontmatter + prose
//   brain/contexts/<slug>/context.md        the cover: frontmatter + "## When loaded"
//   brain/contexts/<slug>/memories.jsonl    one JSON record per line, append-only
//
// No dependencies. Node built-ins only.

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, lstatSync, realpathSync, mkdirSync , unlinkSync, rmSync, renameSync, linkSync} from "node:fs";
import { join, isAbsolute, resolve, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync, execFileSync, execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseOntology } from "../vendor/allethic/ontology.mjs";
import { validateAsset } from './assets.mjs';
import { savePaths as documentSavePaths } from "./documents.mjs";
import { rankEntityCandidates } from './entity-search.mjs';
export { rankEntityCandidates } from './entity-search.mjs';
import { checkSchema } from "../vendor/allethic/validation.mjs";
import { readEntityFiles, writeEntityFiles, entityId, entityType, ENTITY_FORMAT, refreshEntityPages, staleEntities, withEntityLock } from "./entities.mjs";
import { appendMemoryBytes } from './memory-journal.mjs';
import { requestDashboardRefresh } from './dashboard-refresh.mjs';
import { MEETING_FIELDS, validateMeetingEvidence, prepareMeetingMemory, duplicateMeetingMemory, meetingMetadata } from './meetings.mjs';
export { meetingOverview, meetingSourceSuggestions, validateMeetingEvidence, prepareMeetingMemory, meetingMetadata } from './meetings.mjs';
import { validateCustomerEvidence, guardCustomerCorrection } from "./customers.mjs";
export { customerOverview, customerIdentity, validateCustomerEvidence, guardCustomerCorrection } from "./customers.mjs";
export { updateEntity, mergeEntities, archiveEntity, undoEntityMerge } from "./entity-lifecycle.mjs";
export { entityFacts, entityBrief, entityRecords, compileEntity, resolveEntity, refreshEntityPages, staleEntities, entityEvidenceIndex, entityType, ENTITY_FORMAT } from "./entities.mjs";
export { withEntityLock } from './entities.mjs';

/* The machine-wide GTM OS preferences file. */
export const preferencesPath = () => join(process.env.CODEX_HOME || join(homedir(), ".codex"), "gtm-os", "preferences.json");
export function readPreferences() {
  const path = preferencesPath();
  if (!existsSync(path)) return {};
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid GTM OS preferences file");
  return data;
}
/* The brains this machine has opened (the session hook registers a brain chat, setup registers a
   new brain): what the gtm-os-project skill offers when a folder is linked. Paths that are gone are
   dropped on read; nothing else in the preferences is touched. */
function writePreferences(preferences) {
  const dir = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "gtm-os"); mkdirSync(dir, { recursive: true });
  writeFileSync(preferencesPath(), JSON.stringify(preferences, null, 2) + "\n", { mode: 0o600 });
}
export function knownBrains() {
  let list = []; try { list = readPreferences().brains || []; } catch { return []; }
  return list.filter(b => b && typeof b.path === "string" && existsSync(join(b.path, "brain", "admin.md")));
}
export function registerBrain(root) {
  const resolved = resolve(root); let path; try { path = realpathSync(resolved); } catch { path = resolved; }
  const admin = readAdmin(path); if (!admin) return null;
  let prefs = {}; try { prefs = readPreferences(); } catch {}
  const entry = { path, company: admin.company || basename(path), lastOpened: new Date().toISOString() };
  const brains = [...(prefs.brains || []).filter(b => b && b.path !== path && existsSync(join(String(b.path), "brain", "admin.md"))), entry];
  writePreferences({ ...prefs, brains }); return entry;
}
export function currentPerson(root, who) {
  if (who) return teamHandle(root, who);
  try { const handle = JSON.parse(readFileSync(join(root, "work", "person.json"), "utf8")).handle; if (handle) return teamHandle(root, handle); } catch {}
  try {
    // the brain's own git identity (set by setup from what the person gave) may name them; a noreply or GitHub address never does
    const email = execFileSync("git", ["-C", root, "config", "user.email"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().toLowerCase();
    if (!email || /noreply|users\.noreply\.github\.com$/.test(email)) return null;
    const matches = (readAdmin(root)?.team || []).filter(p => p.email && p.email.toLowerCase() === email);
    return matches.length === 1 ? matches[0].handle : null;
  } catch { return null; }
}
export function selectPerson(root, who) {
  const handle = teamHandle(root, who);
  if (!handle) throw new Error("Identify the current person from admin.md team; never assume the brain owner");
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work", "person.json"), JSON.stringify({ handle }) + "\n");
  return handle;
}
/* ---------- frontmatter: a small YAML subset ----------
   scalars, nulls, inline lists [a, b], and block lists of inline maps:
     team:
       - { name: "Marta Nowak", email: "marta@reflow.io", handle: marta }              */
const scalar = v => { v = v.trim(); if (v === "" || v === "null" || v === "~") return null; if (v === "true") return true; if (v === "false") return false; if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch {} } return v.replace(/^["']|["']$/g, ""); };
const inlineMap = s => Object.fromEntries(s.replace(/^\{|\}$/g, "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim()).filter(Boolean).map(p => { const i = p.indexOf(":"); return [p.slice(0, i).trim(), scalar(p.slice(i + 1))]; }));
export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: text };
  const fm = {}; let listKey = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { const v = item[1].trim(); fm[listKey].push(v.startsWith("{") ? inlineMap(v) : scalar(v)); continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (!kv) continue;
    const v = kv[2].trim();
    if (v === "") { listKey = kv[1]; fm[listKey] = []; continue; }
    listKey = null;
    if (v.startsWith("[") && v.endsWith("]")) {
      try { fm[kv[1]] = JSON.parse(v); }
      catch { fm[kv[1]] = v.slice(1, -1).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(scalar).filter(x => x !== null && x !== ""); }
    } else fm[kv[1]] = scalar(v);
  }
  return { fm, body: text.slice(m[0].length) };
}
export function renderFrontmatter(fm) {
  const str = v => typeof v === "string" && /[:,#"{}\[\]\n\r]|^\s|\s$|^(?:true|false|null|~)$/.test(v) ? JSON.stringify(v) : String(v);
  const val = v => v === null || v === undefined ? "null" : Array.isArray(v) ? (v.some(x => x && typeof x === "object") ? "\n" + v.map(x => `  - { ${Object.entries(x).map(([k, y]) => `${k}: ${str(y)}`).join(", ")} }`).join("\n") : `[${v.map(str).join(", ")}]`) : str(v);
  return `---\n${Object.entries(fm).map(([k, v]) => `${k}:${Array.isArray(v) && v.some(x => x && typeof x === "object") ? "" : " "}${val(v)}`).join("\n")}\n---\n`;
}
/* handle for a person: full name, ascii, lowercase, hyphenated ("Maciej Kończal" -> "maciej-konczal");
   callers add a numeric suffix on collision */
export const handleFor = name => name.trim().replace(/ł/g, "l").replace(/Ł/g, "L").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/* the handle of a team member, by name, email or handle; null if not in admin.md */
export function teamHandle(root, who) {
  const admin = readAdmin(root); if (!admin || !Array.isArray(admin.team)) return null;
  const w = String(who || "").trim().toLowerCase();
  const hit = admin.team.find(p => p && [p.handle, p.name, p.email].filter(Boolean).some(v => String(v).toLowerCase() === w));
  if (hit) return hit.handle;
  // an unambiguous first name works too ("marta" -> marta-nowak, unless two Martas)
  const firsts = admin.team.filter(p => p && p.name && p.name.toLowerCase().split(/\s+/)[0] === w);
  return firsts.length === 1 ? firsts[0].handle : null;
}
const section = (body, name) => { const r = body.match(new RegExp(`^##\\s+${name}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "m")); return r ? r[1].trim() : ""; };

/* ---------- admin ---------- */
export function readAdmin(root) {
  const f = join(root, "brain", "admin.md"); if (!existsSync(f)) return null;
  const { fm, body } = parseFrontmatter(readFileSync(f, "utf8"));
  return { ...fm, body: body.trim(), path: f };
}

/* Summaries update by themselves, in a separate run (compilePlan says when): the only mode. Kept as a
   function so every caller reads the same word; an old `compile:` line in admin.md is ignored. */
export function compileMode(root) { return "background"; }
/* A setting changed by the person on the dashboard: the frontmatter line in brain/admin.md, kept at once.
   Only the two settings; anything else in admin.md still goes through a proposal and APPROVE. */
export function setAdminSetting(root, key, value) {
  const allowed = { dashboard: ["always", "on-demand"] };
  if (!allowed[key] || !allowed[key].includes(value)) throw new Error(`no such setting: ${key}: ${value}`);
  const f = join(root, "brain", "admin.md"); let text = readFileSync(f, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/); if (!m) throw new Error("admin.md has no frontmatter");
  const fm = m[1]; const line = `${key}: ${value}`;
  const next = new RegExp(`^${key}:.*$`, "m").test(fm) ? fm.replace(new RegExp(`^${key}:.*$`, "m"), line) : (/^protected:/m.test(fm) ? fm.replace(/^protected:/m, `${line}\nprotected:`) : fm + "\n" + line);
  text = text.replace(m[0], `---\n${next}\n---`); writeFileSync(f, text);
  return commit(root, ["brain/admin.md"], `admin: ${key} ${value} (from the dashboard)`);
}
/* background: what the separate run is doing now (work/compile.json), for the dashboard and the chat */
export function readCompileState(root) {
  try { const s = JSON.parse(readFileSync(join(root, "work", "compile.json"), "utf8")); if (s.state === "queued" || s.state === "running") { if (Date.now() - Date.parse(s.at) > 20 * 60 * 1000) return { ...s, state: "failed" }; } return s; } catch { return null; }
}
export function compileBusy(root) { const s = readCompileState(root); return !!s && (s.state === "queued" || s.state === "running"); }
/* a failed run that will not try again by itself: the last attempt failed and something is still behind */
export function compileGaveUp(root) { const s = readCompileState(root); return !!s && s.state === "failed" && (s.attempt || 1) >= (s.tries || 1) && activeContexts(root).some(c => c.stale); }
/* Every saved memory makes its context eligible immediately. Concurrent changes are
   drained by one worker; an empty plan starts no model run. */
export function compilePlan(root) {
  const contexts = [], times = [];
  for (const c of activeContexts(root)) {
    if (c.manualEdit.blocked) continue;
    const pend = effectiveMemories(c.memories).filter(m => !c.compiledAt || newer(m.at, c.compiledAt));
    if (!pend.length && !c.manualEdit.changed) continue;
    if (!pend.length) times.push(new Date().toISOString());
    contexts.push(c.slug); for (const m of pend) times.push(m.at);
  }
  // Entity compilations also run after alias changes or when context covers are already current.
  if (!times.length) for (const e of staleEntities(root)) times.push(e.latest_change_at);
  if (!times.length) return { pending: 0, contexts: [], oldest: null, wait: null };
  const oldest = times.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return { pending: times.length, contexts, oldest, wait: 0 };
}
/* kick the background run: detached, so the note that caused it returns at once */
export function kickCompile(root, { force = false } = {}) {
  if (process.env.GTM_OS_NO_COMPILE || process.env.GTM_OS_RUN || !compilePlan(root).pending) return false;
  try { const script = fileURLToPath(new URL("../scripts/gtm-os-compile/background-compile.sh", import.meta.url)); const child = spawn("bash", [script, root], { detached: true, stdio: "ignore", env: { ...process.env, PLUGIN_ROOT: fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, ""), ...(force ? { GTM_OS_COMPILE_DELAY: "0" } : {}) } }); child.unref(); return true; } catch { return false; }
}

/* Baselines live in work/, never as additional brain objects. They record plugin writes
   or the first observed legacy cover, so upgrading alone does not imply a manual edit. */
const coverStateFile = (root, slug) => join(root, "work", "cover-state", `${slug}.json`);
const coverHash = text => createHash("sha256").update(text).digest("hex");
function checkedCover(text) {
  if (!/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(text)) throw new Error("Missing or incomplete frontmatter");
  const parsed = parseFrontmatter(text), { fm, body } = parsed;
  for (const key of ["title", "summary"]) if (fm[key] !== undefined && typeof fm[key] !== "string") throw new Error(`${key} must be text`);
  for (const key of ["people", "tools", "related", "names"]) if (fm[key] !== undefined && !Array.isArray(fm[key])) throw new Error(`${key} must be a list`);
  const headings = [...body.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  return { ...parsed, extraSections: headings.some(h => !["When loaded", "Scope"].includes(h)) || new Set(headings).size !== headings.length || !!body.split(/^## /m)[0].trim() };
}
function generatedCover(text) {
  const { fm, body, extraSections } = checkedCover(text);
  return JSON.stringify({ generated: Object.fromEntries(["summary", "names", "people", "tools", "related", "last_active", "confidence", "compiled_at", "compiled_by"].map(k => [k, fm[k] ?? null])), now: splitWhenLoaded(section(body, "When loaded"))[1], extraSections });
}
export function manualCoverState(root, slug) {
  const path = join(root, "brain", "contexts", slug, "context.md");
  const stateFile = coverStateFile(root, slug);
  let baseline = null, baselineMissing = false, baselineError = null;
  try {
    baseline = JSON.parse(readFileSync(stateFile, "utf8"));
    if (typeof baseline?.text !== "string" || baseline.hash !== coverHash(baseline.text)) throw new Error("Invalid tracking record");
    checkedCover(baseline.text);
  } catch (e) { baseline = null; baselineMissing = e.code === "ENOENT"; baselineError = e; }
  let text; try { text = readFileSync(path, "utf8"); } catch { return { status: "missing", blocked: true, path, baseline }; }
  const hash = coverHash(text);
  try { checkedCover(text); } catch (e) { return { status: "invalid", blocked: true, path, hash, text, baseline, reason: e.message }; }
  const { fm, extraSections } = checkedCover(text);
  // A legacy cover has no fingerprint yet. Capture its starting bytes once, without
  // rewriting it. Publish atomically and never replace another process's baseline.
  // A mismatched fingerprint, unreadable tracking record or unsupported section is
  // not a first-run case: keeping those blocked prevents erasing real changes.
  if (baselineMissing && !Object.hasOwn(fm, "gtm_generated") && !extraSections) {
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(temporary, JSON.stringify({ hash, text }), { flag: "wx" });
      try { linkSync(temporary, stateFile); } catch (e) { if (e.code !== "EEXIST") throw e; }
    } catch (e) {
      return { status: "untracked", blocked: true, path, hash, text, baseline, reason: `Could not initialize summary tracking: ${e.message}` };
    } finally { try { rmSync(temporary, { force: true }); } catch {} }
    // An editor may have saved while the first baseline was being written.
    return manualCoverState(root, slug);
  }
  if (baselineError && !baselineMissing) return { status: "untracked", blocked: true, path, hash, text, baseline, reason: "Summary tracking record could not be read" };
  const generated = generatedCover(text);
  const marked = !extraSections && fm.gtm_generated === coverHash(generated);
  // Compiler fingerprints travel with the cover, so another machine's legitimate writes
  // do not become manual-edit warnings merely because work/ is local and unshared.
  const knownWrite = marked && (!baseline || generated !== generatedCover(baseline.text));
  if (!baseline && !knownWrite) return { status: "untracked", blocked: true, path, hash, text, baseline, reason: "Existing cover has no verified baseline" };
  const changed = !knownWrite && hash !== baseline?.hash;
  const blocked = changed && (generated !== generatedCover(baseline.text) || extraSections);
  return { status: blocked ? "review" : "ok", blocked, changed, knownWrite, path, hash, text, baseline };
}
export function manualCoverChanges(root) {
  const slugs = new Set();
  for (const dir of [join(root, "brain", "contexts"), join(root, "work", "cover-state")]) {
    try { for (const f of readdirSync(dir, { withFileTypes: true })) {
      const slug = f.isDirectory() ? f.name : f.name.endsWith(".json") ? f.name.slice(0, -5) : "";
      if (/^[a-z0-9-]+$/.test(slug)) slugs.add(slug);
    } } catch {}
  }
  return [...slugs].map(slug => ({ slug, ...manualCoverState(root, slug) })).filter(s => s.blocked)
    .map(({ slug, status, path, hash, reason }) => ({ slug, status, path, hash, reason }));
}
export function adoptGeneratedCover(root, slug) {
  const state = manualCoverState(root, slug);
  if (!state.knownWrite) return;
  const file = coverStateFile(root, slug); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify({ hash: state.hash, text: state.text }));
  renameSync(`${file}.${process.pid}.tmp`, file);
}
export function compileSnapshot(root, slug) {
  const c = readContext(root, slug);
  return "s_" + coverHash(JSON.stringify({ cover: readFileSync(c.path, "utf8"), memories: effectiveMemories(c.memories), names: readNames(root) })).slice(0, 12);
}
/* A summary paused by a manual edit is released from a chat once the person has reviewed it:
   the edit is backed up, the current cover becomes the baseline, and the next compile may
   replace it. The hash proves the review was of this exact text. Nothing is rewritten here. */
export function releaseManualCover(root, slug, reviewedHash) {
  const state = manualCoverState(root, slug);
  if (!state.blocked) return { released: false, note: "nothing to release: the summary is not paused" };
  if (!state.hash || state.hash !== reviewedHash) throw new Error("not released: the summary changed since the review (its hash does not match). Read it again.");
  backupManualCover(root, slug);
  const file = coverStateFile(root, slug); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify({ hash: state.hash, text: state.text }));
  renameSync(`${file}.${process.pid}.tmp`, file);
  return { released: true };
}
export function backupManualCover(root, slug) {
  const state = manualCoverState(root, slug);
  const dir = join(root, "work", "manual-edits", slug); mkdirSync(dir, { recursive: true });
  const path = join(dir, `${state.hash}.md`);
  if (!existsSync(path)) writeFileSync(path, state.text, { flag: "wx" });
  return path;
}

/* ---------- contexts ---------- */
export function readContext(root, slug, { includeMemories = true } = {}) {
  const dir = join(root, "brain", "contexts", slug); const f = join(dir, "context.md");
  if (!existsSync(f)) return null;
  const manualEdit = manualCoverState(root, slug);
  const text = manualEdit.status === "invalid" ? manualEdit.baseline?.text : manualEdit.text;
  if (!text) return null;
  const { fm, body } = parseFrontmatter(text);
  const memories = includeMemories ? readMemories(root, slug) : [];
  const last = memories.length ? memories[memories.length - 1].at : null;
  const compiledAt = fm.compiled_at || null;
  const [previousRule, now] = splitWhenLoaded(section(body, "When loaded"));
  const rule = withLegacyBoundaries(previousRule, section(body, "Scope"));
  const whenLoaded = [rule, now ? `Working guidance: ${now}` : ""].filter(Boolean).join("\n\n");
  return {
    slug, title: fm.title || slug, status: fm.status || "active", created: fm.created || null,
    compiledAt, summary: fm.summary || "", people: fm.people || [], tools: fm.tools || [], related: fm.related || [],
    names: Array.isArray(fm.names) && fm.names.some(x => x && typeof x === "object") ? fm.names.filter(x => x && x.name) : (fm.people || []).map(n => ({ name: n, kind: "person" })),
    whenLoaded, rule, now,
    memories, manualEdit, lastMemory: last, stale: !!manualEdit.changed || manualEdit.blocked || (memories.length > 0 && (!compiledAt || newer(last, compiledAt))), dir, path: f, fm, body,
  };
}
/* Old covers keep their bytes until a normal write. Fold their authored boundaries into
   the rule on read; discard only the old placeholder or exact duplicate paragraphs.
   Keep differing wording intact so the assistant can surface conflicts, never choose a winner. */
function withLegacyBoundaries(rule, legacy) {
  if (!legacy || legacy.replace(/\s+/g, " ").trim() === "(what belongs here, what does not)") return rule;
  const normalize = text => text.replace(/\s+/g, " ").trim();
  const seen = new Set([normalize(rule), ...rule.split(/\n\s*\n/).map(normalize)]);
  const extra = legacy.split(/\n\s*\n/).filter(p => {
    const key = normalize(p); if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  // Quote literal guidance labels in old boundary prose so they stay in the rule.
  return [rule, ...extra.map(p => p.replace(/(^|\n)(\s*(?:Working guidance|Now):)/g, "$1> $2"))].filter(Boolean).join("\n\n");
}
/* "When loaded" is the standing rule, then optional compiled working guidance.
   Keep the now property and legacy Now: reader for existing callers and covers.
   writeContext composes it; this is the one place that takes it apart again. */
export function splitWhenLoaded(text) {
  const i = String(text || "").search(/\n\s*(?:Working guidance|Now):/);
  if (i < 0) return [String(text || "").trim(), ""];
  return [text.slice(0, i).trim(), text.slice(i).replace(/^\s*(?:Working guidance|Now):\s*/, "").trim()];
}
/* Change a cover's status (active, archived) and nothing else. */
export function setContextStatus(root, slug, status) {
  const c = readContext(root, slug); if (!c) return null;
  writeContext(root, slug, { ...c.fm, status, rule: c.rule, now: c.now });
  return c;
}
/* Which default contexts a tool belongs on, by what kind of tool it is. Setup seeds covers with
   this so rule 7 ("read a tool live when the loaded context names it") has something to point at
   from day one; compile adds whatever the memories used later. Unknown tools stay on admin only. */
export const DEFAULT_CONTEXTS = [
  { slug: "company", title: "Our company", rule: "Keep our organization's identity, mission, team, ways of working, vocabulary and onboarding progress here. Use the company named in the workplace info as our own organization. Keep confirmed internal facts separate from assumptions. Route external customer and competitor findings to the relevant topic's context." },
  { slug: "strategy", title: "Strategy", rule: "Work on priorities, growth motions, revenue goals and the go-to-market plan here. Treat strategic changes as explicit decisions. Evidence can challenge direction but must not silently replace it." },
  { slug: "market", title: "Market", rule: "Work on trends, competitors, alternatives and market research here. Distinguish sourced observations from market hypotheses. Date evidence and preserve its limitations." },
  { slug: "icp", title: "Target customers", rule: "Work on target segments, customer needs, buying roles and evidence for fit here. Link individual customers by name; dedicated account contexts need a confirmed purpose. Separate what buyers said from what we infer. Read customer tools live; sample evidence is not an approved ICP. Record named customer evidence here when it informs fit, needs or buying behavior." },
  { slug: "offer", title: "Our offer", rule: "Work on our products and services, positioning, packaging, pricing, proof, objections and voice here. Competitor offers belong in Market. Use confirmed offer details. Do not infer product capabilities, discounts or pricing changes from buyer requests." },
];
const TOOL_CHANNELS = [
  [/crm|hubspot|attio|salesforce|pipedrive|close\b|folk/i, ["icp", "strategy"]],
  [/mail|gmail|outlook|calendar|granola|fireflies|fathom|otter|meeting|wispr|call/i, ["company", "icp", "offer"]],
  [/analytics|posthog|ads\b|linkedin|meta\b|mailchimp|lemlist|apollo|clay|seo|webflow|wordpress/i, ["market", "strategy"]],
  [/notion|slack|drive|docs|linear|asana|trello/i, DEFAULT_CONTEXTS.map(c => c.slug)],
];
export function defaultChannelsFor(tool) { for (const [re, chs] of TOOL_CHANNELS) if (re.test(tool)) return chs; return []; }

export function seedContexts(root, owner, rules = {}) {
  const handle = teamHandle(root, owner);
  if (!handle) throw new Error("Setup requires an identified team member for the personal context");
  const admin = readAdmin(root) || {}, declared = admin.tools || [];
  for (const c of DEFAULT_CONTEXTS) {
    if (readContext(root, c.slug)) continue;
    const rule = (c.slug === "company" ? `This brain belongs to ${admin.company}. ` : "") + (rules[c.slug] || c.rule);
    writeContext(root, c.slug, { title: c.title, rule,
      tools: declared.filter(t => defaultChannelsFor(t).includes(c.slug)) });
  }
  const personal = `personal-${handle}`;
  if (!readContext(root, personal)) writeContext(root, personal, { title: `Personal: ${handle}`, personal_owner: handle,
    rule: "Keep this person's role and working preferences here. Use them for their experience, never for the whole team. Shared company facts belong in shared contexts." });
  selectPerson(root, handle);
}

/* The cover writer. Every context.md is written here: setup, contexts --new, --fork, compile.
   Frontmatter keys in a fixed order, then "## When loaded" (rule and optional Working guidance).
   Text goes through renderFrontmatter, so titles with colons or quotes survive. */
const COVER_KEYS = ["title", "slug", "status", "created", "forked_from", "compiled_at", "compiled_by", "summary", "names", "people", "tools", "related", "last_active", "confidence"];
export function writeContext(root, slug, { rule, now = "", ...fm }, { reviewedCover = null, expectedCover = null } = {}) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`bad slug: ${slug}`);
  if (Object.hasOwn(fm, "scope")) throw new Error("scope is no longer a context field; include boundaries in rule");
  const dir = join(root, "brain", "contexts", slug); mkdirSync(dir, { recursive: true });
  const full = { title: slug, slug, status: "active", created: new Date().toISOString().slice(0, 10), compiled_at: null, summary: "Nothing here yet.", people: [], tools: [], related: [], ...fm };
  const ordered = {}; for (const k of COVER_KEYS) if (full[k] !== undefined) ordered[k] = full[k]; for (const k of Object.keys(full)) if (!(k in ordered)) ordered[k] = full[k];
  const clean = t => String(t || "").trim();
  const body = `\n## When loaded\n\n${clean(rule) || `Work here is about ${full.title}.`}\n${clean(now) ? `\nWorking guidance: ${clean(now)}\n` : ""}`;
  const path = join(dir, "context.md"), previous = existsSync(path) ? manualCoverState(root, slug) : null;
  if (expectedCover && previous?.hash !== expectedCover) throw new Error("Context Markdown changed before writing; read compile_facts again");
  let text = renderFrontmatter(ordered) + body;
  const preservesManual = previous?.blocked && !["invalid", "missing"].includes(previous.status) && !checkedCover(previous.text).extraSections && generatedCover(text) === generatedCover(previous.text);
  const acknowledged = previous?.blocked && reviewedCover === previous.hash;
  if (previous?.blocked && !acknowledged && !preservesManual) throw new Error("Manual edits need review in Codex before this cover can be rewritten");
  if (previous?.blocked) backupManualCover(root, slug);
  if (!previous?.blocked || acknowledged) {
    ordered.gtm_generated = coverHash(generatedCover(text));
    text = renderFrontmatter(ordered) + body;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, text);
  // Recheck after preparing output: an editor save must not be replaced with older prose.
  if (previous && (!existsSync(path) || coverHash(readFileSync(path, "utf8")) !== previous.hash)) {
    rmSync(temporary, { force: true }); throw new Error("Context Markdown changed before writing; read compile_facts again");
  }
  renameSync(temporary, path);
  if (!previous?.blocked || acknowledged) {
    const stateFile = coverStateFile(root, slug); mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(`${stateFile}.${process.pid}.tmp`, JSON.stringify({ hash: coverHash(text), text }));
    renameSync(`${stateFile}.${process.pid}.tmp`, stateFile);
  }
  if (!existsSync(join(dir, "memories.jsonl"))) writeFileSync(join(dir, "memories.jsonl"), "");
  return join(dir, "context.md");
}
/* The contexts that are worked in: archived ones stay in listContexts (search, the dashboard) but
   are not offered, compiled or related. */
export const activeContexts = root => listContexts(root).filter(c => c.status === "active");
export function listContexts(root, options) {
  const d = join(root, "brain", "contexts"); if (!existsSync(d)) return [];
  return readdirSync(d).filter(n => statSync(join(d, n)).isDirectory()).map(s => readContext(root, s, options)).filter(Boolean)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || a.slug.localeCompare(b.slug));
}

/* ---------- global identity registry and derived briefs ----------
   Files live in brain/entities/. Identity is metadata; facts stay in context memories.
   Legacy registry files remain readable until a write or upgrade migrates them. */
export const ENTITIES_PATHS = ["brain/entities", "brain/entities.md", "brain/names.md"];
const entitiesFiles = root => [join(root, "brain", "entities.md"), join(root, "brain", "names.md")].filter(f => existsSync(f));
const separateEntities = (a, b) => (a.not || []).some(n => exactName([b], n)) || (b.not || []).some(n => exactName([a], n));
const sameEntity = (a, b) => !separateEntities(a, b) && (a.name.toLowerCase() === b.name.toLowerCase() || a.aliases.some(x => x.toLowerCase() === b.name.toLowerCase()) || b.aliases.some(x => x.toLowerCase() === a.name.toLowerCase()));
function mergeEntity(into, e) {
  if (separateEntities(into, e)) throw new Error(`${into.name} and ${e.name} are confirmed as different identities`);
  into.id ||= entityId(into.name);
  into.previous_ids = [...new Set([...(into.previous_ids || []), e.id || entityId(e.name), ...(e.previous_ids || [])])].filter(id => id !== into.id);
  for (const key of ["references", "identity_sources"]) into[key] = [...new Map([...(into[key] || []), ...(e[key] || [])].map(r => [JSON.stringify(r), r])).values()];
  for (const a of e.aliases) if (a.toLowerCase() !== into.name.toLowerCase() && !into.aliases.some(x => x.toLowerCase() === a.toLowerCase())) into.aliases.push(a);
  if (e.name.toLowerCase() !== into.name.toLowerCase() && !into.aliases.some(x => x.toLowerCase() === e.name.toLowerCase())) into.aliases.push(e.name);
  for (const m of e.emails) if (!into.emails.some(x => x.toLowerCase() === m.toLowerCase())) into.emails.push(m);
  for (const x of e.not || []) if (!(into.not = into.not || []).some(y => y.toLowerCase() === x.toLowerCase())) into.not.push(x);
  if (into.kind === "person" && e.kind !== "person") Object.assign(into, entityType(e.kind, e.subtype ?? null));
  else if (into.kind === "organization" && e.kind === "organization" && !into.subtype) into.subtype = e.subtype ?? null;
  promoteFullName(into);
}
/* Pairs that may be one entity: same kind, and a shared word ("Nestle", "Nestle Poland") or the
   same letters spelled apart. For people only a shared surname counts (a shared first name is two
   people more often than not). A pair the person has called different (`not:`) is never suggested. */
export function suggestMerges(names) {
  const out = [], seen = new Set();
  const words = s => nameWords(s), last = s => { const w = words(s); return w.length > 1 ? w[w.length - 1] : null; };
  for (const a of names) for (const b of names) {
    if (a.status === "archived" || b.status === "archived" || a === b || a.kind !== b.kind || (a.subtype && b.subtype && a.subtype !== b.subtype)) continue; const k = [a.name, b.name].sort().join("|"); if (seen.has(k)) continue;
    if ((a.not || []).some(x => exactName([b], x)) || (b.not || []).some(x => exactName([a], x))) continue;
    const A = [a.name, ...a.aliases], B = [b.name, ...b.aliases];
    const letters = A.some(x => B.some(y => nameLetters(x) === nameLetters(y)));
    const shared = a.kind === "person" ? A.some(x => { const l = last(x); return l && B.some(y => last(y) === l); }) : A.some(x => words(x).some(w => B.some(y => words(y).includes(w))));
    if (letters || shared) { seen.add(k); out.push({ a: a.name, b: b.name, kind: a.kind }); }
  }
  return out;
}
/* A person's canonical name is the full one. "Chris" with the alias "Krzysztof Pawlak" (however
   it got there: a merge, or the alias given the other way round) becomes "Krzysztof Pawlak" with
   the alias "Chris". Only for people, only from one word to a first and last name. */
function promoteFullName(e) {
  if (e.kind !== "person" || /\s/.test(e.name.trim())) return e;
  const full = e.aliases.find(a => /\S\s+\S/.test(a.trim()) && !a.includes("@"));
  if (!full) return e;
  e.aliases = e.aliases.filter(a => a !== full); e.aliases.unshift(e.name); e.name = full.trim();
  return e;
}
/* The formal Entity object has three kinds. Older company/team inputs retain their subtype. */
export { ENTITY_KINDS as NAME_KINDS } from "./entities.mjs";
export function readNames(root) {
  return withEntityLock(root, () => readRegistry(root));
}
function readRegistry(root) {
  const out = readEntityFiles(root);
  for (const f of entitiesFiles(root)) for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!/^-\s+\S/.test(line)) continue;
    const parts = line.replace(/^-\s+/, "").split("|").map(s => s.trim()); const name = parts.shift();
    if (!name || /^(aliases|emails|kind):/.test(name)) continue;
    const split = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
    const e = { id: entityId(name), name, aliases: [], emails: [], kind: "person", not: [], previous_ids: [], references: [], identity_sources: [] };
    for (const p of parts) { const m = p.match(/^(aliases|emails|kind|not):\s*(.*)$/); if (!m) continue; if (m[1] === "kind") Object.assign(e, entityType(m[2].trim())); else e[m[1]] = split(m[2]); }
    const dup = out.find(x => sameEntity(x, e)); if (dup) mergeEntity(dup, e); else out.push(promoteFullName(e));
  }
  const admin = readAdmin(root);
  for (const p of (admin && Array.isArray(admin.team) ? admin.team : [])) if (p && p.name && ![p.name, p.handle, p.email].filter(Boolean).some(ref => exactName(out, ref))) out.push({ id: entityId(p.name), name: p.name, aliases: [p.handle].filter(Boolean), emails: [p.email].filter(Boolean), kind: "person", not: [], previous_ids: [], references: [], identity_sources: [] });
  return out;
}
export function writeNames(root, names) {
  return withEntityLock(root, () => writeRegistry(root, names));
}
export function migrateEntities(root) {
  return withEntityLock(root, () => {
    const names = readNames(root);
    if (!entitiesFiles(root).length && existsSync(join(root, "brain", "entities")) && names.every(e => e._fm?.format === ENTITY_FORMAT)) return false;
    writeNames(root, names);
    return true;
  });
}
function writeRegistry(root, names) {
  const legacy = entitiesFiles(root);
  // Preserve complete originals, including any unrecognized prose, before migration.
  for (const file of legacy) {
    const content = readFileSync(file, "utf8"), digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
    const dir = join(root, "work", "entity-migration", digest); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file.endsWith("/names.md") ? "names.md" : "entities.md"), content);
  }
  writeEntityFiles(root, names);
  for (const file of legacy) unlinkSync(file);
  refreshEntityPages(root);
}
/* canonical name for a mention (name, alias, email, or an unambiguous first name); null if unknown */
export function canonicalName(names, mention) { return exactName(names, mention) || inferredName(names, mention); }
/* the mention is a known name, alias or email, as written */
export function exactName(names, mention) {
  const w = String(mention || "").trim().toLowerCase(); if (!w) return null;
  const hits = names.filter(n => n.id === w || n.previous_ids?.includes(w) || n.name.toLowerCase() === w || n.aliases.some(a => a.toLowerCase() === w) || n.emails.some(e => e.toLowerCase() === w));
  return hits.length === 1 ? hits[0].name : null;
}
/* one word that is the first name of exactly one known entity: taken as that one, and said so */
export function inferredName(names, mention) {
  const w = String(mention || "").trim().toLowerCase(); if (!w || /\s/.test(w)) return null;
  const firsts = names.filter(n => n.name.toLowerCase().split(/\s+/)[0] === w || n.aliases.some(a => a.toLowerCase().split(/\s+/)[0] === w));
  return firsts.length === 1 ? firsts[0].name : null;
}
/* Names that may be the same as a mention, for the "same as X?" question before a new name lands
   in the registry: a shared word (a first name, a surname, a company word; accents ignored, company
   suffixes and short words skipped), or the same letters without spaces ("Open AI" and "OpenAI").
   Exact matches are canonicalName's job; this is only about near misses. Never merges by itself. */
const foldName = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const NAME_STOP = new Set(["the", "and", "for", "inc", "gmbh", "ltd", "llc", "plc", "corp", "group", "team", "sp.", "o.o.", "s.a.", "a.g."]);
const nameWords = s => foldName(s).split(/[\s,/&()]+/).map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter(w => w.length >= 3 && !NAME_STOP.has(w));
const nameLetters = s => foldName(s).replace(/[^a-z0-9]/g, "");
export function similarNames(names, mention) {
  const words = new Set(nameWords(mention)), letters = nameLetters(mention);
  if (!letters) return [];
  const fuzzy = new Set(rankEntityCandidates(names, mention, { limit: 10 }).matches.map(m => m.entry));
  return names.filter(n => fuzzy.has(n) || [n.name, ...n.aliases].some(x => nameLetters(x) === letters || nameWords(x).some(w => words.has(w)))).map(n => ({ name: n.name, kind: n.kind }));
}
/* add a person, or merge aliases/emails into an existing one (matched by name, alias or email) */
export function addName(root, name, options = {}) {
  if (typeof name !== "string" || !name.trim() || /[\r\n]/.test(name)) throw new Error("Entity name must be a non-empty single line");
  return withEntityLock(root, () => updateName(root, name, options));
}
function updateName(root, name, { aliases = [], emails = [], kind = null, subtype, not = [], references = [], sources = [] } = {}) {
  const names = readNames(root); const canon = exactName(names, name);   // exact only: a first name never merges into someone by inference
  if (!canon && names.some(e => exactName([e], name))) throw new Error("Ambiguous identity; use its canonical name or stable ID");
  let entry = canon ? names.find(n => n.name === canon) : null;
  if (!entry) {
    const occupied = new Set(names.flatMap(e => [e.id, ...(e.previous_ids || [])]));
    let id = entityId(name);
    while (occupied.has(id)) id = entityId(randomUUID());
    entry = { id, name: name.trim(), aliases: [], emails: [], kind: "person", not: [], previous_ids: [], references: [], identity_sources: [] }; names.push(entry); }
  // "Nestle Poland is not Nestle": remembered, so the pair is never suggested as one again
  for (const x of not) { const other = exactName(names, x) || x.trim(); if (other && !(entry.not = entry.not || []).some(y => y.toLowerCase() === other.toLowerCase())) entry.not.push(other); }
  if (kind || subtype !== undefined) Object.assign(entry, entityType(kind || entry.kind, subtype !== undefined ? subtype : (!kind || kind === entry.kind ? entry.subtype ?? null : null)));
  for (const a of aliases) if (a && a.toLowerCase() !== entry.name.toLowerCase() && !entry.aliases.some(x => x.toLowerCase() === a.toLowerCase())) entry.aliases.push(a.trim());
  for (const e of emails) if (e && !entry.emails.some(x => x.toLowerCase() === e.toLowerCase())) entry.emails.push(e.trim().toLowerCase());
  for (const [key, values] of [["references", references], ["identity_sources", sources]]) entry[key] = [...new Map([...(entry[key] || []), ...values].map(r => [JSON.stringify(r), r])).values()];
  // Aliases identify this record; joining two existing records is a separate operation.
  for (const alias of aliases) {
    const others = names.filter(n => n !== entry && exactName([n], alias));
    if (others.length) throw new Error(`Alias "${alias}" belongs to another identity; preview merge_entities with their stable IDs`);
  }
  promoteFullName(entry);
  for (const n of names) n.not = [...new Set((n.not || []).map(ref => exactName(names, ref) || ref))].filter(ref => ref !== n.name);
  writeNames(root, names); return { ...entry, merged: [] };
}
/* memory records keep the name as written when they were recorded; readers map them through the
   registry, so "Chris" counts for Krzysztof Pawlak once the alias exists */
export function resolvePeople(names, people) {
  const out = []; for (const p of people || []) { const c = canonicalName(names, p) || p; if (!out.includes(c)) out.push(c); } return out;
}
/* Every entity a memory mentions: the people field, plus any registry name or alias that appears in
   the text as whole words. So a company the note names but the people field left out still counts,
   from the moment it is in the registry. Aliases shorter than three letters and emails are not matched. */
export function mentionsIn(names, memory) {
  const mentions = [...(memory.entities || []), ...(memory.people || [])].filter(p => names.filter(n => exactName([n], p)).length <= 1);
  const out = resolvePeople(names, mentions); const text = " " + foldName(memory.content).replace(/[^a-z0-9]+/g, " ") + " ";
  const owners = new Map(), normalized = s => foldName(s).replace(/[^a-z0-9]+/g, " ").trim();
  for (const n of names) for (const form of [n.name, ...n.aliases].map(normalized)) {
    if (!owners.has(form)) owners.set(form, new Set()); owners.get(form).add(n.name);
  }
  for (const n of names) {
    if (out.includes(n.name)) continue;
    const forms = [n.name, ...n.aliases].filter(f => !f.includes("@")).map(normalized).filter(f => f.length >= 3 && owners.get(f).size === 1);
    if (forms.some(f => text.includes(" " + f + " "))) out.push(n.name);
  }
  return out;
}
/* Reuse registry normalization while indexing a stream of memories. The ordinary reader
   above remains the reference for identity semantics; this matcher holds identities only. */
export function createMentionMatcher(names) {
  const exact = new Map(), first = new Map(), owners = new Map();
  const add = (map, key, name) => { if (!map.has(key)) map.set(key, []); map.get(key).push(name); };
  const normalized = s => foldName(s).replace(/[^a-z0-9]+/g, " ").trim();
  for (const n of names) {
    for (const key of new Set([n.id, ...(n.previous_ids || []), n.name, ...n.aliases, ...n.emails].filter(Boolean).map(x => x.toLowerCase()))) add(exact, key, n.name);
    for (const key of new Set([n.name, ...n.aliases].map(x => x.toLowerCase().split(/\s+/)[0]))) add(first, key, n.name);
    for (const key of new Set([n.name, ...n.aliases].map(normalized))) add(owners, key, n.name);
  }
  const trie = new Map();
  names.forEach((n, index) => {
    for (const form of [n.name, ...n.aliases].filter(f => !f.includes('@')).map(normalized).filter(f => f.length >= 3 && owners.get(f).length === 1)) {
      let node = trie;
      for (const word of form.split(' ')) { if (!node.has(word)) node.set(word, new Map()); node = node.get(word); }
      node.set(null, index);
    }
  });
  return memory => {
    const out = [];
    for (const mention of [...(memory.entities || []), ...(memory.people || [])]) {
      const key = String(mention || "").trim().toLowerCase(), hits = exact.get(key) || [];
      if (hits.length > 1) continue;
      const inferred = !/\s/.test(key) ? first.get(key) || [] : [];
      const name = hits[0] || (inferred.length === 1 ? inferred[0] : mention);
      if (!out.includes(name)) out.push(name);
    }
    const words = normalized(memory.content).split(' '), found = new Set();
    for (let at = 0; at < words.length; at++) {
      let node = trie;
      for (let end = at; end < words.length && (node = node.get(words[end])); end++) if (node.has(null)) found.add(node.get(null));
    }
    for (const index of [...found].sort((a, b) => a - b)) if (!out.includes(names[index].name)) out.push(names[index].name);
    return out;
  };
}
/* Proper names in a note's text that are neither in its people field nor in the registry: what the
   model may have left out ("Castorama should be an entity"). Capitalised runs of words, not at the
   start of a sentence unless two words or more, not days, months or everyday capitalised words. */
const NOT_ENTITY = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "next", "noted", "the", "this", "that", "our", "we", "they", "he", "she", "it", "i", "a", "an", "in", "on", "at", "to", "for", "of", "with", "from", "by", "and", "or", "no", "yes", "not", "open", "question", "decision", "note", "summary", "codex", "gtm", "os", "crm", "nda", "tco", "ceo", "cfo", "cto", "coo", "q1", "q2", "q3", "q4", "eur", "usd", "pln", "ok", "fde", "fdes", "pipeline", "marketing"]);
export function candidateEntities(content, people, names) {
  const known = new Set(names.flatMap(n => [n.name, ...n.aliases]).concat(people || []).map(foldName));
  const out = []; const sentences = String(content || "").split(/(?<=[.!?])\s+|\n+/);
  for (const s of sentences) {
    const tokens = s.split(/\s+/); let run = [], startIdx = 0;
    const flush = () => {
      if (run.length) {
        const cand = run.join(" ").replace(/[,;:.!?)("']+$/g, "").replace(/^[("']+/, "");
        const words = cand.split(" "); const first = startIdx === 0;
        const plain = /^[A-Z][a-z]+$/.test(words[0]);
        const isKnown = c => known.has(foldName(c)) || !!canonicalName(names, c) || c.split(" ").every(w => known.has(foldName(w)) || !!canonicalName(names, w));
        // "Met Pierre Dupont": the first word of a sentence is a plain word until the rest proves otherwise
        if (first && plain && words.length >= 2 && isKnown(words.slice(1).join(" "))) return (run = []);
        const ok = cand.length >= 3 && !(first && words.length === 1 && plain) && !words.every(w => NOT_ENTITY.has(foldName(w))) && !isKnown(cand) && !/^\d/.test(cand);
        if (ok && !out.some(x => foldName(x) === foldName(cand))) out.push(cand);
      }
      run = [];
    };
    tokens.forEach((t, i) => {
      const w = t.replace(/^[("']+|[,;:.!?)"']+$/g, "");
      const cap = /^[A-ZÀ-Ý][\p{L}\p{N}&.-]*$/u.test(w) && !NOT_ENTITY.has(foldName(w)) && !(i === 0 && /^[A-Z][a-z]+$/.test(w) && tokens.length > 1 && !/^[A-Z]/.test((tokens[1] || "").replace(/^[("']+/, "")));
      if (cap) { if (!run.length) startIdx = i; run.push(w); if (/[.!?,;:]$/.test(t)) flush(); } else flush();
    });
    flush();
  }
  return out;
}
/* normalise a list of mentions: known -> canonical; unknown -> added as new people, unless one
   looks like a name already known (similarNames): then nothing is added and `similar` says which
   mention may be whom, so the caller can ask "same as X?" first. confirmedNew lists mentions the
   person has said are new. Returns {people, added, similar}. */
export function normalisePeople(root, mentions, { confirmedNew = [], companies = [] } = {}) {
  const names = readNames(root), sure = new Set(confirmedNew.map(foldName)), people = [], fresh = [], similar = [], inferred = [];
  const take = c => { if (!people.includes(c)) people.push(c); };
  for (const m of mentions) {
    const t = String(m || "").trim(); if (!t) continue;
    const exact = exactName(names, t); if (exact) { take(exact); continue; }
    if (sure.has(foldName(t))) { names.push({ name: t, aliases: [], emails: [], kind: "person" }); fresh.push(t); take(t); continue; }   // the person said: someone new
    const guess = inferredName(names, t); if (guess) { inferred.push({ mention: t, name: guess }); take(guess); continue; }
    const like = similarNames(names, t);
    if (like.length) { similar.push({ mention: t, matches: like }); continue; }
    names.push({ name: t, aliases: [], emails: [], kind: "person" }); fresh.push(t); take(t);
  }
  if (similar.length) return { people: [], added: [], similar, inferred: [] };
  // Resolve all mentions before writing, so an ambiguous company cannot leave a partial registry.
  const companyNames = new Set(companies.map(m => canonicalName(names, m)).filter(Boolean));
  for (const t of fresh) addName(root, t, { kind: companyNames.has(t) ? "company" : "person" });
  for (const name of companyNames) if (!fresh.includes(name)) addName(root, name, { kind: "company" });
  return { people, added: fresh, similar: [], inferred };
}

/* ---------- the loaded set: work/loaded-contexts.json, per brain, local ---------- */
/* ---------- projects: a folder linked to this brain ----------
   A project is a tag (project:<slug> on its notes) and a local pointer: a marked block in the folder's
   AGENTS.md. Its loaded set and its chat live under work/projects/<slug>/; the brain's own stay where
   they were. work/projects.json indexes this machine's projects (git-ignored: paths are personal). */
const projectDir = (root, project) => {
  if (project && !/^[a-z0-9][a-z0-9-]*$/.test(project)) throw new Error(`bad project slug: ${project}`);
  return project ? join(root, "work", "projects", project) : join(root, "work");
};
export function readLoaded(root, project = null) {
  const dir = projectDir(root, project);
  try { return JSON.parse(readFileSync(join(dir, "loaded-contexts.json"), "utf8")).loaded || []; } catch { return []; }
}
export function writeLoaded(root, loaded, project = null) {
  const dir = projectDir(root, project);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "loaded-contexts.json"), JSON.stringify({ loaded: [...new Set(loaded)], at: new Date().toISOString() }, null, 1));
}
/* A context archived is unloaded everywhere: the brain's set and every project's. */
export function unloadEverywhere(root, slug) {
  writeLoaded(root, readLoaded(root).filter(s => s !== slug));
  for (const p of readProjects(root)) writeLoaded(root, readLoaded(root, p.slug).filter(s => s !== slug), p.slug);
}
export const POINTER_START = "<!-- gtm-os project -->", POINTER_END = "<!-- /gtm-os project -->";
const pointerBlock = ({ brain, slug, title, company, inside }) => [POINTER_START,
  `GTM OS project: ${slug}`, `GTM OS brain: ${brain}`,
  `This folder is the project \`${slug}\` (${title}) of the ${company} brain at ${brain}.`,
  ...(inside ? [] : [`Read ${brain}/AGENTS.md first, every session: it is the rulebook.`]),
  `Pass brain: ${brain} and project: ${slug} in every GTM OS tool call.`, POINTER_END].join("\n") + "\n";
export function readPointer(dir) {
  let text; try { text = readFileSync(join(dir, "AGENTS.md"), "utf8"); } catch { return null; }
  if (!text.includes(POINTER_START)) return null;
  const brain = (text.match(/^GTM OS brain: (.+)$/m) || [])[1]?.trim(), slug = (text.match(/^GTM OS project: (.+)$/m) || [])[1]?.trim();
  if (!brain || !slug) return null;
  return { brain, slug, missing: !existsSync(join(brain, "brain", "admin.md")) };
}
/* A block alone is not a working link: all project readers use the same check. */
export function projectPointerStatus(root, project) {
  const pointer = readPointer(project.path);
  if (!pointer) return "missing";
  if (pointer.missing) return "brain-missing";
  let matches;
  try { matches = realpathSync(pointer.brain) === realpathSync(root); }
  catch { matches = resolve(pointer.brain) === resolve(root); }
  return matches && pointer.slug === project.slug ? "ok" : "mismatch";
}
/* Git resolves the shared exclude path for ordinary checkouts and worktrees. */
export function gitExcludePath(root) {
  try { return resolve(root, execFileSync("git", ["-C", root, "rev-parse", "--git-path", "info/exclude"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()); }
  catch { return null; }
}
export function writePointer(dir, { brain, slug, title, company, inside = false }) {
  const file = join(dir, "AGENTS.md"); let text = ""; try { text = readFileSync(file, "utf8"); } catch {}
  if (text.includes(POINTER_START)) throw new Error("already a project");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, text ? text.replace(/\n*$/, "\n\n") + pointerBlock({ brain: resolve(brain), slug, title, company, inside }) : pointerBlock({ brain: resolve(brain), slug, title, company, inside }));
}
export function removePointer(dir) {
  const file = join(dir, "AGENTS.md"); let text; try { text = readFileSync(file, "utf8"); } catch { return false; }
  const a = text.indexOf(POINTER_START), b = text.indexOf(POINTER_END); if (a < 0 || b < 0) return false;
  const rest = (text.slice(0, a) + text.slice(b + POINTER_END.length)).replace(/\n{3,}$/, "\n").replace(/^\n+$/, "");
  if (rest.trim()) writeFileSync(file, rest); else rmSync(file); return true;
}
/* Where the brain is, from any working directory: cwd is a brain; or cwd or an ancestor up to the git
   root (or the filesystem root) carries the pointer block. Mirrored by hooks/resolve.sh for the shell hooks. */
export function resolveBrain(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, "brain", "admin.md"))) return { root: dir, project: null };
    const p = readPointer(dir);
    if (p) return p.missing ? { missing: true, brain: p.brain, project: p.slug, dir } : { root: resolve(p.brain), project: p.slug, dir };
    if (existsSync(join(dir, ".git"))) return null;
    const up = dirname(dir); if (up === dir) return null; dir = up;
  }
}
export function readProjects(root) { try { return JSON.parse(readFileSync(join(root, "work", "projects.json"), "utf8")).projects || []; } catch { return []; } }
export function writeProjects(root, projects) { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(join(root, "work", "projects.json"), JSON.stringify({ projects }, null, 1)); }

/* ---------- the one commit path ----------
   Git is the store. Every writer calls commit() after writing and reports its note verbatim.
   Inside the Codex app .git is read-only, so the commit fails and the note says so; the person
   then says "save" (AGENTS.md rule 9). Only the named paths are staged, never -A. */
export const NOT_COMMITTED = "written to disk, NOT committed (git is read-only here): say save";
export const NOT_COMMITTED_YET = "written to disk, not committed yet: say save to keep it";
/* What a save covers: the brain and the plugin-owned files, never work/. */
export const BRAIN_PATHS = ["brain", "AGENTS.md", ".githooks", ".gitignore", ".agents"];
/* Everything save keeps: the engine's paths, the root README, and the documents with their files (lib/documents.mjs). */
export function savePathsFor(root) { return [...BRAIN_PATHS, "README.md", ...documentSavePaths(root)].filter(p => existsSync(join(root, p))); }
/* Every writer calls this once after writing: everything written is kept at once, one commit per
   change. The message is also the activity line the dashboard shows. GTM_OS_NO_COMMIT (tests,
   dry runs) turns committing off; `always` lets save ignore it. */
export function commit(root, paths, message, { always = false, push = true } = {}) {
  // Keep identity files and derived evidence views with every brain write.
  if (readAdmin(root) && paths.some(p => /brain(?:\/|$)|context\.md$|memories\.jsonl$/.test(p))) {
    withEntityLock(root, () => { if (!migrateEntities(root)) refreshEntityPages(root); });
    paths = [...new Set([...paths, ...ENTITIES_PATHS])];
  }
  logActivity(root, "change", message);
  if (process.env.GTM_OS_NO_COMMIT && !always) return { ok: false, note: NOT_COMMITTED_YET };
  // Another process (the background summary run, a teammate's pull) may hold git's index lock for a
  // moment: wait for it rather than fail the note. Short waits, a few times, then give up.
  const git = (...a) => { for (let i = 0; ; i++) { try { return execFileSync("git", ["-C", root, ...a], { stdio: "pipe", encoding: "utf8" }); } catch (e) { if (i < 8 && /index\.lock|Unable to create .*\.lock/i.test(String(e.stderr || e.message))) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); continue; } throw e; } } };
  try {
    paths = paths.filter(p => existsSync(join(root, p)) || git("ls-files", "--", p).trim());
    if (!paths.length) return { ok: true, note: "nothing to commit" };
    git("add", "--", ...paths);
    if (!git("diff", "--cached", "--name-only", "--", ...paths).trim()) return { ok: true, note: "nothing to commit" };
    // The pathspec keeps anything else the person had staged out of this commit.
    git("-c", "commit.gpgsign=false", "commit", "-q", "-m", message, "--", ...paths);
    // Shared right away when the brain has a remote; in the background, so a slow network never
    // holds a note. A failed push is retried by the next commit and by the session start's pull.
    let shared = false;
    try { const remote = push && pushRemote(git("remote")); if (remote) { spawn("git", ["-C", root, ...PUSH, remote, "HEAD"], { detached: true, stdio: "ignore" }).unref(); shared = true; } } catch {}
    return { ok: true, note: shared ? "kept and shared" : "kept" };
  } catch (e) {
    const err = String(e.stderr || e.message).trim().split("\n").filter(Boolean);
    const readOnly = /read-only|Permission denied|Operation not permitted|unable to create|not a git repository/i.test(err.join(" "));
    return { ok: false, note: readOnly ? NOT_COMMITTED : `written to disk, NOT committed: ${err.slice(0, 2).join(" / ").slice(0, 240)}`, error: err[0] || "" };
  }
}

/* ---------- activity log (work/hooks.log): what happened, for the dashboard ---------- */
const localStamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
export function logActivity(root, kind, text) {
  try { mkdirSync(join(root, "work"), { recursive: true }); appendFileSync(join(root, "work", "hooks.log"), `${localStamp()}  ${kind}  ${String(text).split("\n")[0].slice(0, 200)}\n`); } catch {}
}
export function readActivity(root, n = 12) {
  let lines = []; try { lines = readFileSync(join(root, "work", "hooks.log"), "utf8").split("\n").filter(Boolean); } catch { return []; }
  return lines.slice(-n).reverse().map(l => { const m = l.match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\s{2,}(\S+)\s{2,}(.*)$/); return m ? { at: m[1], kind: m[2], text: m[3] } : { at: "", kind: "", text: l }; });
}
/* Only the context covers: what a scheduled run may commit. */
export const COVER_PATHS = [":(glob)brain/contexts/*/context.md"];
/* what git would commit on save */
export function unsavedChanges(root, paths = savePathsFor(root)) {
  paths = paths.filter(p => p.startsWith(":(") || existsSync(join(root, p)));
  try { return execFileSync("git", ['--no-optional-locks', "-C", root, "status", "--short", "--", ...paths], { encoding: "utf8", stdio: "pipe" }).split("\n").filter(Boolean).map(l => ({ state: l.slice(0, 2).trim() || "M", path: l.slice(3) })); } catch { return []; }
}
/* Every push names its remote and branch and sets the upstream: a remote the person added by hand
   (git remote add, no -u) has none, and a bare "git push" then fails in the background with nothing
   said while the note reads "kept and shared". origin when there is one, else the first remote. */
export const PUSH = ["push", "-q", "-u"];
export const pushRemote = list => { const r = String(list || "").split("\n").map(x => x.trim()).filter(Boolean); return r.includes("origin") ? "origin" : r[0] || ""; };
/* The person's save: commit what unsavedChanges lists, push when there is a remote. */
export function save(root, message, { covers = false } = {}) {
  if (!covers && existsSync(join(root, "work", "admin.proposed.md"))) return { ok: false, note: "a change to brain/admin.md is waiting for APPROVE; ask for APPROVE or a drop, then save" };
  const paths = covers ? COVER_PATHS : savePathsFor(root);
  const files = unsavedChanges(root, paths);
  if (!files.length) return { ok: true, note: covers ? "nothing to save: no cover changed" : "nothing to save: everything is committed", files };
  // save pushes in the foreground below; a background push from commit would race it for the ref.
  const r = commit(root, paths, String(message || "save").split("\n")[0].slice(0, 120), { always: true, push: false });
  if (!r.ok) return { ok: false, note: r.note, files };
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: "pipe" }).trim();
  const hash = git("rev-parse", "--short", "HEAD");
  let pushed = "no remote, local only";
  try { const remote = pushRemote(git("remote")); if (remote) { execFileSync("git", ["-C", root, ...PUSH, remote, "HEAD"], { stdio: "pipe", timeout: 30000 }); pushed = `pushed to ${remote}`; } }
  catch (e) { pushed = `commit is local; push failed: ${String(e.stderr || e.message).trim().split("\n")[0].slice(0, 160)}`; }
  logActivity(root, "save", `saved ${hash}: ${files.length} file(s), ${pushed}`);
  return { ok: true, note: `saved ${hash}: ${files.length} file(s)\n${files.map(f => `${f.state} ${f.path}`).join("\n")}\n${pushed}`, hash, files, pushed };
}
/* The Codex chat a brain folder was last opened in: the session hook records it, the dashboard
   sends its buttons there. Input is the hook's JSON (session_id, cwd). */
function landingSession(root, input) {
  try {
    const session = typeof input === "string" ? JSON.parse(input) : input;
    if (!session || typeof session.session_id !== "string" || !session.session_id.trim() || /[\r\n]/.test(session.session_id)) return null;
    if (typeof session.cwd !== "string" || !isAbsolute(session.cwd) || realpathSync(session.cwd) !== realpathSync(root)) return null;
    return session;
  } catch { return null; }
}
/* Before setup, work may contain only the session captured from actual hook stdin.
   Never adopt unrelated work files or follow bootstrap symlinks. The same check governs
   the empty-folder opener and setup, so capturing a chat does not make its folder dirty. */
export function setupBlockers(root, { landing = false } = {}) {
  return readdirSync(root).filter(name => {
    const path = join(root, name);
    if (lstatSync(path).isSymbolicLink()) return true;
    if ((landing ? /^(\.git|\.DS_Store)$/ : /^(\.git|README(\.md|\.txt)?|\.gitignore|\.DS_Store)$/).test(name)) return false;
    if (name !== "work") return true;
    try {
      const files = readdirSync(path);
      if (files.length !== 1 || files[0] !== "session.json") return true;
      const file = join(path, "session.json");
      if (!lstatSync(file).isFile()) return true;
      const session = landingSession(root, readFileSync(file, "utf8"));
      return !session || typeof session.at !== "string" || !Number.isFinite(Date.parse(session.at));
    } catch { return true; }
  });
}
export function prepareLandingSession(root, input) {
  if (setupBlockers(root, { landing: true }).length) return false;
  const session = landingSession(root, input);
  if (session) writeSession(root, session);
  // An opener without a valid hook ID can still ask questions; it must not guess a chat.
  return true;
}
/* A separate Codex run in the brain (GTM_OS_RUN: background or schedule for the summary run, dashboard
   for a job the page started) is nobody's chat: its session hook must not replace work/session.json.
   A summary run's thread goes on work/compile.json instead, so the page and the chat can offer the link. */
export const RUN_KINDS = ["background", "schedule", "dashboard"];
export function recordRunThread(root, kind, input) {
  let i = input; if (typeof input === "string") { try { i = JSON.parse(input || "{}"); } catch { i = {}; } }
  const id = i && typeof i.session_id === "string" ? i.session_id.trim() : "";
  if (!id || !RUN_KINDS.includes(kind)) return null;
  logActivity(root, "run", `${kind} ${THREAD_URL(id)}`);
  if (kind === "dashboard") return { kind, thread: id };
  mkdirSync(join(root, "work"), { recursive: true });
  const f = join(root, "work", "compile.json"); let s = {};
  try { s = JSON.parse(readFileSync(f, "utf8")); } catch {}
  s = { ...s, thread: id }; writeFileSync(f, JSON.stringify(s) + "\n");
  return { kind, thread: id };
}
/* A Codex thread as a source. Memories point at the chat they came from as {kind: "codex", ref: <thread id>};
   the id becomes a deep link (codex://threads/<id>), and its name and project are read from the local
   Codex home when they are there: the name from session_index.jsonl, cwd and originator from the
   rollout's first line. Nothing is stored in the brain, so a thread from another machine or a deleted
   one still links. foreign: the thread belongs to another project (null when unknown). */
export const THREAD_URL = id => `codex://threads/${id}`;
// Source strings split only at the provider delimiter. URLs keep their query, commas and fragment.
// A connector-provided bare URL is also accepted; opaque IDs still need a provider.
export function parseSources(input = []) {
  const entries = Array.isArray(input) ? input : [input];
  const unique = new Map();
  for (const value of entries) {
    if (typeof value !== "string") throw new Error("sources must contain strings: provider:reference or a direct URL");
    const text = value.trim();
    let kind, ref;
    if (/^https?:\/\//i.test(text)) { kind = "url"; ref = text; }
    else {
      const colon = text.indexOf(":");
      if (colon < 1) throw new Error("source needs a provider:reference or a direct URL");
      kind = text.slice(0, colon).trim(); ref = text.slice(colon + 1).trim();
    }
    if (!kind || !ref) throw new Error("source needs a non-empty provider and reference");
    unique.set(JSON.stringify([kind, ref]), { kind, ref });
  }
  return [...unique.values()];
}
/* Sources as text, for the model to hand over: a Codex thread carries its link so a decision can be
   traced back to the conversation it came from. The page links them instead (threadHtml). */
export const sourceText = source => (source || []).map(s => s.kind === "codex" ? `codex:${s.ref} (${THREAD_URL(s.ref)})` : `${s.kind}:${s.ref}`).join(", ");
export function resolveThread(id, root, { codexHome = process.env.CODEX_HOME || join(homedir(), ".codex") } = {}) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return null;
  const out = { id, url: THREAD_URL(id), name: null, cwd: null, originator: null, foreign: null };
  try {
    for (const line of readFileSync(join(codexHome, "session_index.jsonl"), "utf8").split("\n")) {
      if (!line.includes(id)) continue;
      try { const e = JSON.parse(line); if (e.id === id && e.thread_name) out.name = String(e.thread_name); } catch {}
    }
  } catch {}
  try {
    const dir = join(codexHome, "sessions");
    const file = readdirSync(dir, { recursive: true }).find(f => String(f).endsWith(`-${id}.jsonl`));
    if (file) {
      const head = readFileSync(join(dir, String(file)), "utf8").split("\n")[0];
      const meta = JSON.parse(head); const p = meta.type === "session_meta" ? meta.payload || {} : {};
      if (typeof p.cwd === "string") out.cwd = p.cwd;
      if (typeof p.originator === "string") out.originator = p.originator;
    }
  } catch {}
  if (out.cwd) { try { out.foreign = realpathSync(out.cwd) !== realpathSync(root); } catch { out.foreign = out.cwd !== root; } }
  return out;
}
export function writeSession(root, input, project = null) {
  let i = input; if (typeof input === "string") { try { i = JSON.parse(input || "{}"); } catch { i = {}; } }
  if (!i || !i.session_id) return null;
  mkdirSync(projectDir(root, project), { recursive: true });
  const s = { session_id: i.session_id, cwd: i.cwd || "", at: new Date().toISOString() };
  writeFileSync(join(projectDir(root, project), "session.json"), JSON.stringify(s, null, 1)); return s;
}
/* Open a URL in the default handler. The dashboard uses the host's Codex pane instead. */
export function openExternal(url) {
  return new Promise(done => {
    if (process.env.GTM_OS_NO_OPEN) return done(false);
    const attempts = [process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]]];
    const tryNext = i => {
      if (i >= attempts.length) return done(false);
      const [cmd, args] = attempts[i];
      execFile(cmd, args, { timeout: 5000 }, e => e ? tryNext(i + 1) : done(true));
    };
    tryNext(0);
  });
}

/* ---------- the chat and the dashboard server (both local, in work/) ---------- */
export function readSession(root, project = null) { try { return JSON.parse(readFileSync(join(projectDir(root, project), "session.json"), "utf8")); } catch { return null; } }
export function readDash(root) {
  try { const s = JSON.parse(readFileSync(join(root, "work", "dash.json"), "utf8")); process.kill(s.pid, 0); return s; } catch { return null; }
}
/* line diff, plain: "- " removed, "+ " added, "  " context */
export function lineDiff(a, b) {
  const A = a.split("\n"), B = b.split("\n"); const out = [];
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { out.push("  " + A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push("- " + A[i++]); else out.push("+ " + B[j++]); }
  while (i < n) out.push("- " + A[i++]); while (j < m) out.push("+ " + B[j++]);
  return out;
}

export function startBrainWatcher(root) {
  if (process.env.GTM_OS_NO_WATCH) return;
  spawnSync(process.execPath, [fileURLToPath(new URL("../server/brain-watch.mjs", import.meta.url)), root, "--start"], { stdio: "ignore", timeout: 3000 });
}
export function stopBrainWatcher(root) {
  spawnSync(process.execPath, [fileURLToPath(new URL("../server/brain-watch.mjs", import.meta.url)), root, "--stop"], { stdio: "ignore", timeout: 3000 });
}
/* ---------- dashboard refresh: any skill that changes state calls this at the end ---------- */
export function rerender(root) {
  kickCompile(root);
  return requestDashboardRefresh(root, fileURLToPath(new URL('../scripts/gtm-os-render/render.mjs', import.meta.url)));
}
/* ---------- memories ---------- */
// The record. See PLAN.md. Modify and Forget are new records pointing at old ones (supersedes,
// retracts); the file is never rewritten. effectiveMemories() resolves them for readers.
export const MEMORY_FIELDS = ["id", "context", "at", "authors", "via", "kind", "tools", "people", "content", "source", "actions", "supersedes", "retracts", "tags", "asset", "entities", "customer", "customer_coverage", ...MEETING_FIELDS];
export const KINDS = ["note", "decision", "question"];
export const LEGACY_KINDS = ["action"]; // retired; records written before stay valid
const isList = (v, f) => Array.isArray(v) && v.every(f);
const isStr = s => typeof s === "string" && s.length > 0;
export function validateMemory(r) {
  const errs = [];
  if (!r || typeof r !== "object") return ["not an object"];
  for (const k of Object.keys(r)) if (!MEMORY_FIELDS.includes(k)) errs.push(`unknown field: ${k}`);
  if (!/^m_[0-9a-f]{6,12}$/.test(r.id || "")) errs.push("id must be m_ + 12 hex (6 accepted for records written before v0.3)");
  if (!/^[a-z0-9-]+$/.test(r.context || "")) errs.push("context must be a slug");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(r.at || "")) errs.push("at must be ISO UTC, e.g. 2026-09-04T09:30:15.123Z");
  if (!isList(r.authors, isStr) || !r.authors.length) errs.push("authors must be a non-empty list of names");
  if (!["codex", "human", "schedule"].includes(r.via)) errs.push("via must be codex | human | schedule");
  if (!KINDS.includes(r.kind) && !LEGACY_KINDS.includes(r.kind)) errs.push(`kind must be ${KINDS.join(" | ")}`);
  if (!isList(r.tools, isStr)) errs.push("tools must be a list of strings");
  if (!isList(r.people, isStr)) errs.push("people must be a list of names");
  if (r.entities !== undefined && !isList(r.entities, id => /^e_[0-9a-f]{16}$/.test(id))) errs.push("entities must be a list of stable entity IDs");
  if (!isStr(r.content)) errs.push("content required");
  if (/[\u2013\u2014\u2015\u2212]/.test(r.content || "")) errs.push("long dash in content; use a plain hyphen");
  if (!isList(r.source, s => s && isStr(s.kind) && isStr(s.ref))) errs.push("source must be a list of {kind, ref}");
  if (!isList(r.actions, a => a && isStr(a.tool) && isStr(a.action))) errs.push("actions must be a list of {tool, action, ref?}");
  for (const k of ["supersedes", "retracts"]) if (r[k] !== null && !/^m_[0-9a-f]{6,12}$/.test(r[k] || "")) errs.push(`${k} must be a memory id or null`);
  if (!isList(r.tags, isStr)) errs.push("tags must be a list of strings");
  if (r.asset !== undefined) errs.push(...validateAsset(r.asset));
  errs.push(...validateCustomerEvidence({ ...r, source: Array.isArray(r.source) ? r.source : [] }));
  errs.push(...validateMeetingEvidence(r));
  return errs;
}
export function readMemories(root, slug) {
  const f = join(root, "brain", "contexts", slug, "memories.jsonl"); if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
}
/* what a reader should see: retracted records hidden, superseded ones replaced by their successor */
/* What is in force: a superseded or retracted record is hidden; the record that supersedes or
   retracts it stays, because it carries the correction, the answer, or the reason. */
export function effectiveMemories(list) {
  const gone = new Set(list.filter(r => r.retracts).map(r => r.retracts)), replaced = new Set(list.filter(r => r.supersedes).map(r => r.supersedes));
  return list.filter(r => !gone.has(r.id) && !replaced.has(r.id));
}
/* Timestamps compare as instants, whatever their precision (older records have minutes). */
export const newer = (a, b) => Date.parse(a) > Date.parse(b);
export { ONBOARDING_VERSION, readOnboarding, seedOnboarding, onboardingInstruction } from './onboarding.mjs';
/* A snapshot key of a memory list: compile reads the facts under one key and applies under the
   same key, so a memory added, corrected or retracted in between is noticed. */
export const snapshotKey = list => list.length ? "s_" + createHash("sha256").update(list.map(m => m.id).join("\n")).digest("hex").slice(0, 12) : "none";
/* Fork copies: a memory copied into a forked context carries tag forked:<from> and a source
   {kind: "memory", ref: <origin id>}. Readers that look across contexts (recall, the dashboard's
   global lists) hide a copy when its origin is also in view, so one fact counts once. */
// Event dates belong in memory content when relevant. at always dates recording.
// Human-readable output uses this host's timezone. Records and JSON retain UTC.
const localClock = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" });
export function localDateTime(at) {
  if (!at || /^\d{4}-\d{2}-\d{2}$/.test(at)) return String(at ?? "");
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return String(at);
  const p = Object.fromEntries(localClock.formatToParts(d).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`;
}
export const memoryTimeText = m => `Recorded: ${localDateTime(m.at)}`;
export const memoryTimeline = memories => hideForkCopies(memories).map(({ id, context, at, content }) => ({ id, context, at, content })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
export const isForkCopy = m => m.tags.some(t => t.startsWith("forked:")) && m.source.some(s => s.kind === "memory");
/* Across contexts a forked memory counts once, and the copy wins: the person forked the thread to
   give it a home, so search and the dashboard show it there and hide the origin. */
export function hideForkCopies(list) {
  const copied = new Set(list.flatMap(m => isForkCopy(m) ? m.source.filter(s => s.kind === "memory").map(s => s.ref) : []));
  return list.filter(m => !copied.has(m.id));
}
/* tools named in a memory that admin.md does not list: a warning for the caller, never an error */
/* One tool, one key: "Attio (CRM)", "attio" and "Attio" are the same tool. Covers keep the first
   spelling they had (admin's, from setup); memories keep what the model wrote. */
export const toolKey = t => String(t || "").toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
export function mergeTools(base, extra) {
  const out = [...base]; const seen = new Set(base.map(toolKey));
  for (const t of extra) { const k = toolKey(t); if (k && !seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
}
export function unknownTools(root, tools) {
  const admin = readAdmin(root); const known = new Set((admin && admin.tools || []).map(toolKey));
  return tools.filter(t => !known.has(toolKey(t)));
}
export function appendMemory(root, slug, options) {
  return withEntityLock(root, () => appendMemoryRecord(root, slug, prepareMeetingMemory(root, slug, options)));
}
function appendMemoryRecord(root, slug, { authors, via = "codex", kind = "note", tools = [], people = [], content, source = [], actions = [], supersedes = null, retracts = null, tags = [], at = null, asset, customer, customer_coverage, ...meetingFields }) {
  const dir = join(root, "brain", "contexts", slug);
  if (!existsSync(join(dir, "context.md"))) throw new Error(`no such context: ${slug}`);
  const when = at || new Date().toISOString();
  const id = "m_" + createHash("sha256").update(`${slug}|${when}|${(authors || []).join(",")}|${content}${asset ? JSON.stringify(asset) : ""}${Object.keys(meetingMetadata(meetingFields)).length ? JSON.stringify(meetingMetadata(meetingFields)) : ""}`).digest("hex").slice(0, 12);
  if (asset?.entity && Array.isArray(people)) people = [...new Set([...people, asset.entity])];
  const rec = { id, context: slug, at: when, authors, via, kind, tools, people, content: (content || "").trim(), source, actions, supersedes, retracts, tags, ...(asset !== undefined ? { asset } : {}) };
  Object.assign(rec, meetingMetadata(meetingFields));
  if (rec.meeting && !rec.meeting_id) rec.meeting_id = rec.id;
  if (customer !== undefined) rec.customer = { ...customer };
  if (customer_coverage !== undefined) rec.customer_coverage = customer_coverage;
  const registry = readNames(root), mentioned = mentionsIn(registry, rec);
  if (customer !== undefined) {
    const entity = registry.find(e => e.name === exactName(registry, customer?.entity));
    if (!entity || !["person", "organization"].includes(entity.kind)) throw new Error("customer.entity must resolve to a registered person or organization");
    rec.customer.entity = entity.id;
    if (!rec.people.includes(entity.name)) rec.people.push(entity.name);
    if (!mentioned.includes(entity.name)) mentioned.push(entity.name);
  }
  rec.entities = registry.filter(e => mentioned.includes(e.name)).map(e => e.id);
  const errs = validateMemory(rec); if (errs.length) throw new Error(errs.join("; "));
  guardCustomerCorrection(root, slug, rec);
  const duplicate = duplicateMeetingMemory(root, rec);
  if (duplicate) return { rec: duplicate, warnings: [], alreadyRecorded: true };
  appendMemoryBytes(root, slug, join(dir, "memories.jsonl"), JSON.stringify(rec) + "\n");
  return { rec, warnings: unknownTools(root, tools).map(t => `tool "${t}" is not listed in admin.md`) };
}
/* append-only: the committed text must be an unchanged prefix of the new text. Returns null
   when fine, else one sentence naming the first line that differs or the lines that vanished. */
export function appendOnlyViolation(prevText, nextText) {
  const prev = (prevText || "").split("\n").filter(l => l.trim()), next = (nextText || "").split("\n").filter(l => l.trim());
  if (next.length < prev.length) return `${prev.length - next.length} record(s) removed; memories are append-only (a wrong record is retracted with a new one)`;
  for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i]) { let id = ""; try { id = JSON.parse(prev[i]).id; } catch {} return `record ${i + 1}${id ? ` (${id})` : ""} was changed; memories are append-only (correct it with a new record that supersedes it)`; }
  return null;
}
/* validate a whole file; used by the pre-commit hook. Returns [] when clean. */
export function validateMemoriesFile(path, context = null) {
  const errs = [];
  readFileSync(path, "utf8").split("\n").forEach((l, i) => {
    if (!l.trim()) return;
    try { const r = JSON.parse(l); const e = validateMemory(r); if (context && r.context !== context) e.push(`context is "${r.context}" but the file is in ${context}/`); if (e.length) errs.push(`line ${i + 1}: ${e.join("; ")}`); }
    catch { errs.push(`line ${i + 1}: not valid JSON`); }
  });
  return errs;
}

/* ---------- company interactions: brain/ontology.ossie.json ---------- */
// A company describes the interactions it does on its own tools (move a deal in Attio, send a
// proposal by mail). The file is an Ossie file with only an ALLETHIC block: its actions are read
// by the engine's loader, so names and schemas are validated the same way as the plugin's; the
// keys GTM OS adds (tool, operation, record, refuse_when) come from the loaded file's raw. Nothing
// here writes a memory: interactionMemory builds what the remember script is then called with.
export const INTERACTIONS_PATH = "brain/ontology.ossie.json";
// every name the plugin serves; server.test.mjs holds this equal to the live catalog, so a company
// interaction can never shadow a tool
export const RESERVED_TOOLS = new Set(["memory_index", "update_plugin", "where_we_are", "list_contexts", "load_context", "recall", "compile_facts", "compile_apply", "render_dashboard", "open_dashboard", "new_context", "fork_context", "edit_context", "archive_context", "advise", "who_is", "add_name", "check_tools", "mark_tool", "propose_admin_change", "save", "check_environment", "setup_brain", "upgrade_brain", "onboarding_question", "configuration_question", "question", "list_objects", "describe_object", "query", "remember", "interact", "propose_interaction", "link_project", "unlink_project", "list_projects", "list_brains", "customer_overview", "meeting_overview", "entity_facts", "compile_entity", "update_entity", "merge_entities", "archive_entity", "undo_entity_merge", "skill", "guideline", "document", "share_brain"]);
const LONG_DASH = /[\u2013\u2014\u2015\u2212]/;
const interactionOf = (raw, parsed) => ({
  name: parsed.name, title: String(raw.title || parsed.name), tool: String(raw.tool || "").trim(), operation: String(raw.operation || "").trim(), description: String(raw.description || "").trim(),
  input_schema: parsed.input_schema || { type: "object", properties: {}, additionalProperties: false },
  record: { context: raw.record?.context || null, kind: raw.record?.kind || "note", content: String(raw.record?.content || ""), people: [...(raw.record?.people || [])], companies: [...(raw.record?.companies || [])], action: raw.record?.action || null, tags: [...(raw.record?.tags || [])] },
  refuse_when: raw.refuse_when ? String(raw.refuse_when) : null,
});
export function readInteractions(root) {
  const path = join(root, INTERACTIONS_PATH);
  if (!existsSync(path)) return { actions: [], error: null, exists: false };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const onto = parseOntology(raw, { file: INTERACTIONS_PATH });
    const rawActions = (raw.custom_extensions || []).find(x => x.vendor_name === "ALLETHIC")?.data?.actions || [];
    return { actions: onto.actions.map(a => interactionOf(rawActions.find(r => r.name === a.name) || {}, a)), error: null, exists: true };
  } catch (e) { return { actions: [], error: `${INTERACTIONS_PATH}: ${e.message}`, exists: true }; }
}
export function validateInteraction(root, a, { existing = [] } = {}) {
  const errs = []; const say = s => errs.push(s);
  if (!a || typeof a !== "object") return ["an interaction must be an object"];
  if (!/^[a-z][a-z0-9_]*$/.test(String(a.name || ""))) say(`name must be a bare identifier (letters, digits, underscore): ${a.name}`);
  if (RESERVED_TOOLS.has(a.name)) say(`${a.name} is a tool of its own; call it`);
  if (existing.some(x => x.name === a.name)) say(`${a.name} is already one of this company's interactions`);
  if (!String(a.tool || "").trim()) say("tool is needed: the connector this is done in (attio, gmail, ...)");
  if (!String(a.operation || "").trim()) say("operation is needed: what to do in the tool, in words the model follows");
  for (const [k, v] of Object.entries({ title: a.title, operation: a.operation, description: a.description, content: a.record?.content, refuse_when: a.refuse_when })) if (LONG_DASH.test(String(v || ""))) say(`${k} contains a long dash; use a plain hyphen`);
  const schema = a.input_schema || { type: "object", properties: {} };
  try { checkSchema(schema, "input_schema"); } catch (e) { say(e.message); }
  if (schema.type !== "object") say("input_schema must have type object");
  const inputs = new Set(Object.keys(schema.properties || {}));
  const r = a.record || {};
  if (!r.context) say("record.context is needed: the context the memory goes to");
  else if (!existsSync(join(root, "brain", "contexts", r.context, "context.md"))) say(`no context ${r.context}`);
  if (r.kind && !KINDS.includes(r.kind)) say(`record.kind must be one of ${KINDS.join(", ")}`);
  if (!String(r.content || "").trim()) say("record.content is needed: the sentence the memory keeps, with {inputs}");
  for (const field of ["people", "companies"]) for (const x of r[field] || []) if (!inputs.has(x)) say(`record.${field}: ${x} is not an input`);
  for (const m of String(r.content || "").matchAll(/\{([a-z_][a-z0-9_]*)\??/g)) if (!inputs.has(m[1])) say(`record.content names {${m[1]}}, which is not an input`);
  return errs;
}
/* {x} is the value; {x? text} is text (with {x} inside replaced) when x is given, else nothing */
export function renderTemplate(tpl, params = {}) {
  const val = k => { const v = params[k]; return v === undefined || v === null ? "" : String(v); };
  return String(tpl || "")
    .replace(/\{([a-z_][a-z0-9_]*)\?([^{}]*(?:\{[a-z_][a-z0-9_]*\}[^{}]*)*)\}/g, (_, k, text) => val(k).trim() ? text.replace(/\{([a-z_][a-z0-9_]*)\}/g, (_, j) => val(j)) : "")
    .replace(/\{([a-z_][a-z0-9_]*)\}/g, (_, k) => val(k))
    .replace(/[ \t]+$/gm, "").trim();
}
export function interactionMemory(a, params = {}) {
  const r = a.record; const pick = fields => fields.map(f => params[f]).filter(v => v !== undefined && v !== null && String(v).trim()).map(String);
  return { context: r.context, kind: r.kind || "note", content: renderTemplate(r.content, params), people: pick(r.people), companies: pick(r.companies), tools: a.tool ? [a.tool] : [], actions: r.action ? [renderTemplate(r.action, params)] : [], tags: [...r.tags] };
}
export function writeInteractions(root, actions) {
  const admin = readAdmin(root) || {};
  const raw = { version: "1", name: String(admin.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "company", description: "This company's own interactions: what it does on its tools, and what each records.", custom_extensions: [{ vendor_name: "ALLETHIC", data: { actions: actions.map(a => ({ name: a.name, title: a.title, tool: a.tool, operation: a.operation, description: a.description, input_schema: a.input_schema, record: a.record, ...(a.refuse_when ? { refuse_when: a.refuse_when } : {}) })) } }] };
  writeFileSync(join(root, INTERACTIONS_PATH), JSON.stringify(raw, null, 2) + "\n");
}
