#!/usr/bin/env node
// A deterministic synthetic brain for the end-to-end checks, and its gold ledger.
//   node test/e2e/generate-brain.mjs --shape small|medium|large|messy --out <dir> [--seed N] [--gold <path>] [--cache <dir>]
// The brain is made by setup.sh; every entity and note after that goes through lib (writeNames, appendMemory,
// updateEntity, mergeEntities, prepareAsset), with GTM_BRAIN_NO_COMMIT and GTM_BRAIN_NO_COMPILE set, and one
// lib.save at the end so the folder is an ordinary committed brain. The kinds, organization subtypes and
// relationship types come from the parsed SCHEMA.md (lib/schema.mjs), so a kind added there later is
// generated too; without a readable schema the three built-in kinds are used.
// The gold ledger (default <out>.gold.json, next to the brain, never inside it) holds the expected answer
// for every generated fact: entity ids, relations with their history, customer statuses, open questions per
// context, buyers, meetings, corrections, what changed when, and the search needles.
// --cache <dir> keeps a finished brain per shape, seed and source hash and copies it on the next call: the
// suite test uses it, because writing thousands of notes through lib takes minutes.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const P = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

export const SHAPES = {
  small: { persons: 8, orgs: { company: 5, partner: 1, investor: 1, community: 1, team: 0 }, products: 3, notes: 100, projects: 1, meetings: 4, planned: 1 },
  medium: { persons: 600, orgs: { company: 300, partner: 80, investor: 60, community: 40, team: 20 }, products: 320, notes: 5000, projects: 4, meetings: 250, planned: 40 },
  large: { persons: 900, orgs: { company: 450, partner: 110, investor: 80, community: 60, team: 30 }, products: 420, notes: 50000, projects: 6, meetings: 1200, planned: 120 },
};
SHAPES.messy = { ...SHAPES.medium, messy: true };

/* ---------- deterministic randomness ---------- */
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const slugOf = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const FIRST = ["Anna", "Ben", "Clara", "Daniel", "Elena", "Felix", "Greta", "Hugo", "Ines", "Jakob", "Karin", "Lukas", "Mira", "Noah", "Olga", "Pavel", "Quinn", "Rosa", "Stefan", "Tara", "Ulrich", "Vera", "Wiktor", "Xenia", "Yara", "Zofia", "Aron", "Bianca", "Cyril", "Dorota", "Emil", "Frida", "Gustav", "Helga", "Igor", "Julia", "Kamil", "Lena", "Marek", "Nina", "Oskar", "Petra", "Rafael", "Sonja", "Tomas", "Ursula", "Viktor", "Wanda", "William", "Robert", "Elizabeth", "Michael", "Alexander", "Jonathan", "Margaret", "Katarzyna", "Aleksander"];
const LAST = ["Abel", "Brandt", "Castell", "Dorn", "Engel", "Falk", "Gerber", "Hahn", "Imhof", "Jansen", "Kessler", "Lindqvist", "Moreau", "Nagel", "Ostrowski", "Peters", "Quast", "Rasmussen", "Sauer", "Thorsen", "Uhlig", "Vogt", "Winter", "Yilmaz", "Zeller", "Albers", "Bauer", "Carlsen", "Dietz", "Eriksen", "Fischer", "Graf", "Holm", "Iversen", "Jung", "Krause", "Lorenz", "Mertens", "Nielsen", "Olsen", "Pohl", "Richter", "Schulz", "Teller", "Unger", "Voss", "Wolff", "Ziegler", "Andersen", "Becker", "Carter", "Dahl", "Ek", "Fontaine", "Gallo", "Haas", "Ivanova", "Jovanovic", "Kowalczyk", "Lund"];
const NICK = { William: "Bill", Robert: "Bob", Elizabeth: "Liz", Michael: "Mike", Alexander: "Alex", Jonathan: "Jon", Margaret: "Maggie", Katarzyna: "Kasia", Aleksander: "Olek", Daniel: "Dan", Stefan: "Steff", Tomas: "Tom" };
const ORG_A = ["Amber", "Basalt", "Cobalt", "Driftwood", "Ember", "Fernbrook", "Granite", "Harbor", "Ivory", "Juniper", "Kestrel", "Lumen", "Meridian", "Northwind", "Onyx", "Pinecrest", "Quarry", "Redwood", "Saltmarsh", "Tidewater", "Umber", "Vantage", "Willow", "Yarrow", "Zephyr", "Alder", "Brightwater", "Cinder", "Dovetail", "Evergreen", "Foxglove", "Glacier", "Heron", "Ironbark", "Jasper", "Kingfisher", "Larch", "Marlin", "Nimbus", "Orchid", "Pelican", "Quill", "Raven", "Sorrel", "Thistle", "Upland", "Verdant", "Wren", "Yew", "Zinnia"];
const ORG_B = { company: ["Retail", "Logistics", "Foods", "Outdoor", "Living", "Apparel", "Pharma", "Home", "Motors", "Electronics", "Books", "Sports", "Beauty", "Garden", "Tools", "Markets", "Brands", "Supply", "Commerce", "Interiors"],
  partner: ["Partners", "Consulting", "Integrations", "Advisory", "Solutions", "Agency"], investor: ["Ventures", "Capital", "Fund", "Angels", "Growth Partners"],
  community: ["Community", "Guild", "Collective", "Network", "Forum"], team: ["Sales Team", "Ops Team", "Finance Team", "Growth Team"] };
const PROD_A = ["Zentrix", "Paylo", "Quorra", "Stockly", "Routefy", "Shelfwise", "Tallybox", "Orderloop", "Cartwheel", "Ledgerly", "Fluxa", "Brevio", "Kanbo", "Nexora", "Vaultic", "Pricefox", "Returnly", "Packwise", "Trackon", "Mailvo"];
const PROD_B = ["CRM", "Billing", "Analytics", "Returns", "Inventory", "Payments", "Helpdesk", "Forms", "Scheduler", "Insights", "Sync", "Studio"];
const INDUSTRY = ["home goods retail", "outdoor equipment", "consumer electronics", "specialty food", "fashion retail", "pharmacy chains", "sporting goods", "garden centres"];
const REGION = ["Germany", "Poland", "the Nordics", "Benelux", "France", "the UK", "Austria", "Czechia"];
const SEGMENT = ["mid-market retailers", "regional chains", "marketplaces", "D2C brands", "franchise networks"];
const PROJECTS = [["berlin-summit", "Berlin Summit"], ["q1-outbound", "Q1 Outbound"], ["partner-program", "Partner Program"], ["pricing-refresh", "Pricing Refresh"], ["nordics-launch", "Nordics Launch"], ["retail-index", "Retail Index"]];
// search needles: few notes, a word or phrase nothing else uses
const NEEDLES = { single: "heliograph", multi: "data residency audit", stem: { written: ["invoicing", "invoiced"], query: "invoice" }, typo: "heliograf" };

/* ---------- the brain ---------- */
export async function generate({ shape = "small", out, seed = 1, gold: goldPath = null, quiet = false } = {}) {
  const cfg = SHAPES[shape]; if (!cfg) throw new Error(`shape must be one of ${Object.keys(SHAPES).join(", ")}`);
  if (!out) throw new Error("--out is required");
  const root = resolve(out); goldPath = resolve(goldPath || `${root}.gold.json`);
  if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`);
  mkdirSync(root, { recursive: true });
  Object.assign(process.env, { GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_OPEN: "1" });
  // a fresh profile per brain: never the real one, and two brains in one process do not share project links
  process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-e2e-profile-"));
  const lib = await import(`${P}/lib/brain.mjs`), schemaLib = await import(`${P}/lib/schema.mjs`), assets = await import(`${P}/lib/assets.mjs`);
  const started = Date.now(), log = (...a) => { if (!quiet) console.error(`[${shape} ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a); };
  const rnd = mulberry32(seed * 7919 + Object.keys(SHAPES).indexOf(shape) * 104729);
  const pick = a => a[Math.floor(rnd() * a.length)], int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)), chance = p => rnd() < p;
  const env = { ...process.env, PLUGIN_ROOT: P };
  execFileSync("git", ["init", "-q", root], { env });
  execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Reflow Fixture", "--one-liner", "Returns automation for retailers", "--owner", "Marta Nowak <marta@example.test>", "--team", "Tomasz Lis <tomasz@example.test>", "--tools", "Attio (CRM), Gmail, Granola", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore", timeout: 120000 });
  const admin = lib.readAdmin(root), by = admin.team[0].handle, mate = admin.team[1]?.handle || by;
  log("setup done");

  // what SCHEMA.md supports today: kinds, organization subtypes, relationship types
  const read = schemaLib.readSchema(root), schema = read.schema || null;
  const kinds = schema ? Object.keys(schema.kinds) : [...schemaLib.SCHEMA_KINDS];
  const subtypes = schema ? Object.keys(schema.kinds.organization?.subtypes || {}) : ["company", "team", "investor", "partner", "community"];
  const relationTypes = schema ? Object.entries(schema.relations).filter(([, r]) => !r.built_in).map(([type, r]) => ({ type, ...r })) : [];

  /* ---------- entities ---------- */
  const entities = [], byName = new Map(), used = new Set();
  const addEntity = (name, kind, subtype = null, extra = {}) => { if (used.has(name.toLowerCase())) return null; used.add(name.toLowerCase()); const e = { name, kind, subtype, aliases: [], emails: [], not: [], previous_ids: [], references: [], identity_sources: [], ...extra }; entities.push(e); byName.set(name, e); return e; };
  const uniqueName = gen => { for (let i = 0; i < 200; i++) { const n = gen(i); if (!used.has(n.toLowerCase())) return n; } let n = 2; const base = gen(0); while (used.has(`${base} ${n}`.toLowerCase())) n++; return `${base} ${n}`; };
  const orgsBy = {};
  const orgSubtypes = subtypes.length ? subtypes : ["company"];
  for (const sub of orgSubtypes) {
    const count = cfg.orgs[sub] ?? Math.max(5, Math.round(cfg.orgs.company / 10));
    const tails = ORG_B[sub] || [sub.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())];
    orgsBy[sub] = [];
    for (let i = 0; i < count; i++) {
      const name = uniqueName(k => `${ORG_A[(i * 7 + k * 13 + Math.floor(rnd() * ORG_A.length)) % ORG_A.length]} ${tails[(i + k) % tails.length]}`);
      const e = addEntity(name, "organization", sub);
      e.references.push({ kind: "website", ref: `https://${slugOf(name)}.example` }); e.domain = `${slugOf(name)}.example`; e.industry = pick(INDUSTRY); e.size = int(20, 4000);
      orgsBy[sub].push(e);
    }
  }
  const allOrgs = Object.values(orgsBy).flat(), companies = orgsBy.company || allOrgs;
  const employers = allOrgs.filter(o => o.subtype !== "team");
  const products = [];
  for (let i = 0; i < cfg.products; i++) { const name = uniqueName(k => `${PROD_A[(i + k * 3) % PROD_A.length]} ${PROD_B[(Math.floor(i / PROD_A.length) + k) % PROD_B.length]}${i >= PROD_A.length * PROD_B.length ? ` ${Math.floor(i / (PROD_A.length * PROD_B.length)) + 1}` : ""}`); const e = addEntity(name, "product"); e.category = name.split(" ")[1]; products.push(e); }
  const persons = [];
  for (let i = 0; i < cfg.persons; i++) {
    const name = uniqueName(k => `${FIRST[(i * 11 + k * 5 + Math.floor(rnd() * FIRST.length)) % FIRST.length]} ${LAST[(i * 3 + k * 17 + Math.floor(rnd() * LAST.length)) % LAST.length]}`);
    const e = addEntity(name, "person"); persons.push(e);
    const first = name.split(" ")[0];
    if (NICK[first] && chance(0.6)) { const alias = `${NICK[first]} ${name.split(" ").slice(1).join(" ")}`; if (!used.has(alias.toLowerCase())) { used.add(alias.toLowerCase()); e.aliases.push(alias); } }
  }
  // any kind SCHEMA.md lists that this generator has no names for still gets entities
  const otherKinds = kinds.filter(k => !["person", "organization", "product"].includes(k)), others = {};
  for (const k of otherKinds) { others[k] = []; for (let i = 0; i < Math.max(5, Math.round(cfg.products / 2)); i++) others[k].push(addEntity(`${k[0].toUpperCase()}${k.slice(1)} ${ORG_A[i % ORG_A.length]} ${i + 1}`, k)); }

  // the hub: a partner-subtype organization with many relations and a partnership that ended
  const hub = (orgsBy.partner || allOrgs)[0];
  // messy traps
  const traps = {};
  if (cfg.messy) {
    const [coA, coB, coC] = [companies[1], companies[2], companies[3]];
    traps.maxes = [addEntity("Max Weber", "person"), addEntity("Max Wagner", "person")];
    traps.maxes[0].emails.push(`max.weber@${coA.domain}`, "maxweber.home@privatemail.test");
    traps.maxes[1].emails.push(`max.wagner@${coB.domain}`);
    traps.lookalike = [addEntity("Jana Novak", "person"), addEntity("Jana Nowak", "person")];
    traps.lookalike[0].not.push("Jana Nowak"); traps.lookalike[1].not.push("Jana Novak");
    traps.renamed = { before: "Fjordline Systems", after: "Fjord Analytics", entity: addEntity("Fjordline Systems", "organization", "company") };
    traps.renamed.entity.domain = "fjordline.example"; traps.renamed.entity.references.push({ kind: "website", ref: "https://fjordline.example" });
    companies.push(traps.renamed.entity); employers.push(traps.renamed.entity);
    traps.merged = { duplicate: addEntity("Kasia Zielinska", "person"), survivor: addEntity("Katarzyna Zielinska", "person") };
    traps.employers = { maxWeber: coA, maxWagner: coB, jana: coC };
    persons.push(...traps.maxes, ...traps.lookalike, traps.merged.duplicate, traps.merged.survivor);
  }
  for (const p of persons) if (!p.emails.length) p.emails.push(`${slugOf(p.name).replace(/-/g, ".")}@mail.example`);
  log(`writing ${entities.length} entities`);
  lib.writeNames(root, [...lib.readNames(root), ...entities.map(({ name, kind, subtype, aliases, emails, not, previous_ids, references, identity_sources }) => ({ name, kind, subtype, aliases, emails, not, previous_ids, references, identity_sources }))]);
  const registry = lib.readNames(root), idOf = name => registry.find(e => e.name === name)?.id;
  for (const e of entities) e.id = idOf(e.name);
  log(`entities written (${registry.length} in the registry)`);

  /* ---------- projects ---------- */
  const projects = PROJECTS.slice(0, cfg.projects);
  for (const [slug, title] of projects) mkdirSync(join(root, "projects"), { recursive: true }), execFileSync(process.execPath, [join(P, "skills/gtm-brain-project/project.mjs"), ".", "--link", join(root, "projects", slug), "--create", "--slug", slug, "--title", title, "--contexts", "icp,offer", "--by", by], { cwd: root, env, stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });

  // an established brain: onboarding finished on the first day (the six outcomes, then the marker setup left is closed)
  const T0 = Date.parse("2026-01-05T08:00:00Z"), SPAN = 300 * 86400000;   // Jan 5 to Nov 1, 2026
  const outcomes = ["Marta Nowak and Reflow Fixture confirmed.", "Company profile approved and applied.", "Attio, Gmail and Granola connected and read-tested.", "First snapshot confirmed from the CRM and recent meetings.", "Daily source sync configured at 08:00.", "Projects linked."];
  ["Who you are", "Company profile", "Your tools", "What is going on", "Running for you", "Your projects"].forEach((title, i) => lib.appendMemory(root, "company", { authors: [by], content: `Onboarding step ${i + 1} (${title}): ${outcomes[i]}`, tags: ["onboarding"], source: [{ kind: "user", ref: by }], at: new Date(T0 - 3600000 + i * 60000).toISOString() }));
  { const state = lib.readOnboarding(root); if (state.marker_id) lib.appendMemory(root, "company", { authors: [by], tags: ["onboarding"], supersedes: state.marker_id, content: "Onboarding: completed v2 on 2026-01-05.", at: new Date(T0 - 3600000 + 10 * 60000).toISOString() }); }

  /* ---------- the notes, as timed events ---------- */
  const timeAt = f => new Date(T0 + Math.floor(Math.min(0.999, Math.max(0, f)) * SPAN) + int(0, 59) * 1000).toISOString().replace(/\.\d+Z$/, ".000Z");
  const events = [];
  let seq = 0;
  const ev = (f, ctx, spec) => { const e = { f, seq: seq++, ctx, ...spec }; events.push(e); return e; };
  const date10 = iso => iso.slice(0, 10);
  const userSrc = [{ kind: "user", ref: by }];
  const projectTag = () => projects.length && chance(0.15) ? [`project:${pick(projects)[0]}`] : [];
  const gold = { shape, seed, owner: { name: "Marta Nowak", handle: by }, schema: { kinds, subtypes, relations: relationTypes.map(r => r.type) }, entities: [], relations: [], customers: [], buyers: [], questions: { open: {}, answered: [] }, decisions: [], corrections: [], meetings: [], attachments: [], drafts: [], changes: [], needles: {}, projects: {}, contexts: {}, traps: {}, hub: null };

  // relationships
  const relEvents = [];
  const relation = (f, ctx, type, from, to, status, content, { basis = "source", ref = null, srcKind = "attio" } = {}) => {
    const observed = timeAt(f);
    const source = basis === "user" ? userSrc : [{ kind: srcKind, ref: ref || `https://crm.fixture.test/${type}/${slugOf(from.name)}-${slugOf(to === "us" ? "us" : to.name)}` }];
    const e = ev(f, ctx, { content, people: [], relation: { from: from.name, type, to: to === "us" ? "us" : to.name, status, basis, observed_at: observed.replace(".000Z", "Z") }, source, tools: basis === "user" ? [] : [srcKind] });
    e.at = observed; relEvents.push({ e, type, from, to, status }); return e;
  };
  const has = t => relationTypes.some(r => r.type === t);
  const jobs = new Map();   // person -> { org, since }
  if (has("works_at")) {
    for (const p of persons) {
      if (traps.merged && p === traps.merged.survivor) continue;
      let org = p === traps.maxes?.[0] ? traps.employers.maxWeber : p === traps.maxes?.[1] ? traps.employers.maxWagner : traps.lookalike?.includes(p) ? traps.employers.jana : p === traps.merged?.duplicate ? companies[4] : chance(0.06) && hub ? hub : pick(employers);
      const f0 = rnd() * 0.3;
      relation(f0, "icp", "works_at", p, org, "current", `${p.name} works at ${org.name} as ${pick(["head of operations", "CFO", "returns manager", "COO", "IT lead", "buyer", "category manager", "VP finance"])}.`);
      jobs.set(p, { org, since: f0 });
      if (!traps.maxes?.includes(p) && chance(0.22)) {
        const f1 = 0.35 + rnd() * 0.55, next = pick(employers.filter(o => o !== org));
        relation(f1, "icp", "works_at", p, org, "ended", `${p.name} left ${org.name}.`);
        relation(f1 + 0.0001, "icp", "works_at", p, next, "current", `${p.name} joined ${next.name}.`);
        gold.changes.push({ entity: p.id, what: "works_at", from: org.id, to: next.id, at: date10(timeAt(f1)) });
        jobs.set(p, { org: next, since: f1, left: org });
      }
    }
  }
  if (has("reports_to")) {
    const byOrg = new Map(); for (const [p, j] of jobs) { if (!byOrg.has(j.org)) byOrg.set(j.org, []); byOrg.get(j.org).push(p); }
    let n = 0; for (const [org, staff] of byOrg) { if (staff.length < 2 || n > persons.length / 4) continue; for (const p of staff.slice(1, 3)) { relation(Math.max(jobs.get(p).since, jobs.get(staff[0]).since) + 0.01, "icp", "reports_to", p, staff[0], "current", `${p.name} reports to ${staff[0].name} at ${org.name}.`); n++; } }
  }
  if (has("partner_of")) for (const o of orgsBy.partner || []) {
    const f0 = rnd() * 0.4;
    relation(f0, "strategy", "partner_of", o, "us", "current", `${o.name} became a referral and integration partner of ours.`, { basis: "user" });
    if (o === hub || chance(0.18)) { const f1 = o === hub ? 0.55 : 0.45 + rnd() * 0.4; relation(f1, "strategy", "partner_of", o, "us", "ended", `The partnership with ${o.name} ended on ${date10(timeAt(f1))}: no co-sold deals in two quarters.`, { basis: "user" }); gold.changes.push({ entity: o.id, what: "partner_of", from: "current", to: "ended", at: date10(timeAt(f1)) }); }
  }
  if (has("investor_in")) for (const o of orgsBy.investor || []) { const target = chance(0.5) ? "us" : pick(companies); relation(rnd() * 0.8, "strategy", "investor_in", o, target, "current", `${o.name} invested in ${target === "us" ? "us" : target.name}.`); }
  if (has("uses")) {
    const users = [...companies.slice(0, Math.ceil(companies.length * 0.7)), ...persons.slice(0, Math.ceil(persons.length * 0.15))];
    for (const u of users) { const prod = pick(products), f = rnd() * 0.8; relation(f, "offer", "uses", u, prod, "current", `${u.name} uses ${prod.name}.`); if (chance(0.1)) relation(f + 0.1, "offer", "uses", u, prod, "ended", `${u.name} stopped using ${prod.name}.`); }
    if (hub) for (const prod of products.slice(0, 4)) relation(rnd() * 0.5, "offer", "uses", hub, prod, "current", `${hub.name} uses ${prod.name}.`);
  }
  // relationship types this generator has no semantics for: generic pairs of the kinds SCHEMA.md names
  const pool = k => k === "person" ? persons : k === "organization" ? allOrgs : k === "product" ? products : others[k] || [];
  for (const r of relationTypes.filter(r => !["works_at", "reports_to", "partner_of", "investor_in", "uses"].includes(r.type))) {
    for (let i = 0; i < Math.max(3, Math.round(cfg.persons / 20)); i++) { const from = pick(pool(pick(r.from)) || []), toKind = pick(r.to), to = toKind === "us" ? "us" : pick(pool(toKind) || []); if (from && to && from !== to) relation(rnd() * 0.9, "company", r.type, from, to, "current", `${from.name} ${r.type.replace(/_/g, " ")} ${to === "us" ? "us" : to.name}.`); }
  }
  // messy: two sources disagree about one job
  if (cfg.messy && traps.maxes) {
    const p = persons.find(p => !traps.maxes.includes(p) && jobs.get(p) && !jobs.get(p).left), j = jobs.get(p);
    relation(0.7, "icp", "works_at", p, j.org, "ended", `LinkedIn shows ${p.name} no longer at ${j.org.name}.`, { srcKind: "linkedin", ref: `https://linkedin.fixture.test/in/${slugOf(p.name)}` });
    gold.traps.contradiction = { person: p.id, org: j.org.id, sources: ["attio", "linkedin"] };
  }

  // customers
  const customerEvents = [];
  const customer = (f, entity, status, content, { basis = "source", tags = [] } = {}) => {
    const observed = timeAt(f), ref = `https://crm.fixture.test/companies/${slugOf(entity.name)}`;
    const e = ev(f, "icp", { content, people: [entity.name], customer: { entity: entity.name, status, basis, observed_at: observed.replace(".000Z", "Z"), ...(basis === "source" ? { reference: { kind: "attio", ref } } : {}) }, source: basis === "user" ? userSrc : [{ kind: "attio", ref }], tools: basis === "user" ? [] : ["attio"], tags });
    e.at = observed; customerEvents.push({ e, entity, status }); return e;
  };
  const custCount = Math.min(companies.length, Math.max(4, Math.round(companies.length * 0.66)));
  const customerSet = [hub, ...companies.slice(0, custCount)].filter(Boolean);
  for (const [i, c] of customerSet.entries()) {
    const basis = i % 7 === 3 ? "user" : "source", f0 = rnd() * 0.4;
    const plan = c === hub ? ["prospect", "customer"] : i % 10 < 3 ? ["prospect"] : i % 10 < 7 ? ["prospect", "customer"] : i % 10 < 9 ? ["customer", "former_customer"] : ["not_customer"];
    plan.forEach((status, k) => { const f = f0 + k * (0.2 + rnd() * 0.2); customer(f, c, status, `${basis === "user" ? "Marta confirmed" : "Attio shows"} ${c.name} as ${status.replace("_", " ")} on ${date10(timeAt(f))}.`, { basis }); if (k) gold.changes.push({ entity: c.id, what: "customer_status", from: plan[k - 1], to: status, at: date10(timeAt(f)) }); });
  }
  // drafts that must not count: demo-tagged customer evidence and an unsent draft
  const draftTargets = companies.slice(custCount, custCount + Math.max(1, Math.round(companies.length * 0.02)));
  for (const c of draftTargets) { const e = customer(0.5 + rnd() * 0.3, c, "customer", `Demo data: ${c.name} shown as a customer in the sales demo workspace.`, { tags: ["demo"] }); gold.drafts.push({ ref: e, entity: c.id, why: "demo-tagged customer evidence" }); }

  // buyers
  const buyerEvents = [];
  for (const c of customerSet.slice(0, Math.round(customerSet.length * 0.75))) {
    const staff = [...jobs].filter(([, j]) => j.org === c && !j.left).map(([p]) => p);
    if (!staff.length) continue;
    const p = staff[0], f = Math.min(0.98, jobs.get(p).since + 0.02 + rnd() * 0.3);
    const e = ev(f, "icp", { content: `${p.name} is the economic buyer at ${c.name}; ${pick(["signs off on budget", "owns the returns budget", "approves new vendors"])}.`, people: [p.name, c.name], source: userSrc, tags: projectTag() });
    buyerEvents.push({ e, company: c, person: p });
  }

  // meetings
  const meetingEvents = [];
  for (let i = 0; i < cfg.meetings; i++) {
    const c = i === 0 && hub ? hub : pick(customerSet), staff = [...jobs].filter(([, j]) => j.org === c).map(([p]) => p).slice(0, int(1, 3));
    const f = 0.1 + rnd() * 0.88, occurred = timeAt(f), title = `${pick(["Discovery call", "QBR", "Pilot review", "Pricing walkthrough", "Security review"])} with ${c.name}`;
    const ref = `https://meetings.fixture.test/recordings/${i + 1}?account=work`;
    const participants = [{ name: "Marta Nowak", role: "attended" }, ...staff.map(p => ({ name: p.name, role: "attended" }))];
    const anchor = ev(f, i % 3 ? "icp" : "offer", { content: `${title}: ${pick(["walked through the returns flow", "reviewed pilot metrics", "discussed rollout timing", "went through the security questionnaire"])}.`, people: [c.name, ...staff.map(p => p.name)], tools: ["granola"], source: [{ kind: "granola", ref }],
      meeting: { title, reference: { kind: "granola", account: "work", ref }, evidence: "transcript", occurrence: "happened", basis: "source", observed_at: occurred.replace(".000Z", "Z"), occurred_at: occurred.replace(".000Z", "Z"), capture: "complete", participants } });
    anchor.at = occurred;
    const outcome = ev(f + 0.00005, anchor.ctx, { content: `Outcome of the ${title.toLowerCase()}: ${pick(["they want a 30-day pilot", "procurement needs a security review", "pricing per store was accepted", "the rollout moves to Q1"])}.`, people: [c.name], source: [{ kind: "granola", ref }], tools: ["granola"], meetingRef: anchor });
    meetingEvents.push({ anchor, outcome, company: c, staff, title, occurred });
  }
  for (let i = 0; i < cfg.planned; i++) {
    const c = pick(customerSet), staff = [...jobs].filter(([, j]) => j.org === c).map(([p]) => p).slice(0, 2), f = 0.9 + rnd() * 0.09;
    const scheduled = new Date(Date.parse("2026-11-20T10:00:00Z") + i * 86400000).toISOString().replace(".000Z", "Z"), ref = `https://calendar.fixture.test/events/${i + 1}?account=work`;
    const e = ev(f, "icp", { content: `Planned: renewal check-in with ${c.name}.`, people: [c.name, ...staff.map(p => p.name)], tools: ["google calendar"], source: [{ kind: "google calendar", ref }],
      meeting: { title: `Renewal check-in with ${c.name}`, reference: { kind: "google calendar", account: "work", ref }, evidence: "calendar", occurrence: "planned", basis: "source", observed_at: timeAt(f).replace(".000Z", "Z"), occurred_at: null, scheduled_at: scheduled, capture: "complete", participants: [{ name: "Marta Nowak", role: "invited" }, ...staff.map(p => ({ name: p.name, role: "invited" }))] } });
    meetingEvents.push({ anchor: e, planned: true, company: c });
  }

  // questions, answers and decisions
  const q = Math.max(6, Math.min(2000, Math.round(cfg.notes * 0.08))), questionEvents = [];
  const QT = { icp: c => `Does ${c.name} have budget approved for Q1 2027?`, offer: () => `Should ${pick(products).name} pricing include onboarding?`, strategy: () => `Do we enter ${pick(REGION)} before ${pick(REGION)}?`, market: c => `Is ${c.name} building its own returns tool?`, company: () => `Who owns the ${pick(["partner", "pricing", "security", "hiring"])} playbook next quarter?` };
  for (let i = 0; i < q; i++) {
    const ctx = ["icp", "icp", "offer", "strategy", "market", "company"][i % 6], c = pick(companies), f = rnd() * 0.85;
    const e = ev(f, ctx, { kind: "question", content: QT[ctx](c), people: ["icp", "market"].includes(ctx) ? [c.name] : [], source: userSrc, tags: projectTag() });
    const answered = i % 8 < 3;
    questionEvents.push({ e, answered });
    if (answered) { const a = ev(f + 0.02 + rnd() * 0.1, ctx, { kind: "decision", content: `Answer: ${e.content.replace(/\?$/, "")}: ${pick(["yes, confirmed", "no, not this year", "decided to wait until the pilot ends"])}.`, people: e.people, source: userSrc, retractsRef: e }); questionEvents.at(-1).answer = a; }
  }
  const decisionEvents = [];
  for (let i = 0; i < Math.round(cfg.notes * 0.06); i++) {
    const ctx = ["offer", "strategy", "icp", "company"][i % 4], prod = pick(products), f = rnd() * 0.95;
    const content = { offer: `Decided: ${prod.name} tiered pricing is per store, from ${date10(timeAt(f))}.`, strategy: `Decided: focus ${pick(SEGMENT)} in ${pick(REGION)} for the next two quarters.`, icp: `Decided: ${pick(SEGMENT)} with 20 to 200 stores are the core segment.`, company: `Decided: weekly pipeline review moves to ${pick(["Monday", "Tuesday", "Thursday"])}.` }[ctx];
    decisionEvents.push(ev(f, ctx, { kind: "decision", content, people: ctx === "offer" ? [prod.name] : [], source: userSrc, tags: projectTag() }));
  }

  // corrections
  const correctionEvents = [];
  for (let i = 0; i < Math.max(2, Math.min(400, Math.round(cfg.notes * 0.012))); i++) {
    const c = companies[i % companies.length], f = rnd() * 0.8, d1 = `2026-${String(3 + (i % 8)).padStart(2, "0")}-0${2 + (i % 6)}`, d2 = `2026-${String(3 + (i % 8)).padStart(2, "0")}-1${2 + (i % 6)}`;
    const old = ev(f, "icp", { content: `${c.name} pilot starts on ${d1} (correction-token-${i}).`, people: [c.name], source: userSrc });
    const fix = ev(f + 0.01, "icp", { content: `${c.name} pilot starts on ${d2}, not ${d1} (correction-token-${i}).`, people: [c.name], source: userSrc, supersedesRef: old });
    correctionEvents.push({ kind: "supersedes", old, fix, token: `correction-token-${i}`, now: d2, was: d1 });
  }
  for (let i = 0; i < Math.max(1, Math.min(250, Math.round(cfg.notes * 0.008))); i++) {
    const p = persons[(i * 7) % persons.length], f = rnd() * 0.8;
    const old = ev(f, "icp", { content: `${p.name} is leaving soon (retract-token-${i}).`, people: [p.name], source: userSrc });
    const fix = ev(f + 0.01, "icp", { content: `Withdrawn: the note that ${p.name} is leaving was wrong (retract-token-${i}).`, people: [p.name], source: userSrc, retractsRef: old });
    correctionEvents.push({ kind: "retracts", old, fix, token: `retract-token-${i}` });
  }

  // search needles
  const needle = (word, n, ctx = "offer") => Array.from({ length: n }, (_, i) => ev(0.2 + i * 0.1, ctx, { content: `${pick(companies).name} asked about ${word} ${["for the pilot", "before signing", "in the contract", "for stores in " + pick(REGION)][i % 4]}.`, source: userSrc }));
  const needles = { single: needle(NEEDLES.single, 3, "market"), multi: needle(NEEDLES.multi, 4, "offer"), stem: [...needle(NEEDLES.stem.written[0], 2, "offer"), ...needle(NEEDLES.stem.written[1] + " twice", 1, "offer")] };

  // attachments: an approved logo per company, kept through lib.assets
  const attachmentTargets = companies.slice(0, Math.min(10, Math.max(1, Math.round(companies.length / 30))));

  // messy: identity events and traps in notes
  if (cfg.messy) {
    const [mw, mg] = traps.maxes;
    for (let i = 0; i < 6; i++) ev(0.1 + i * 0.12, "icp", { content: `${mw.name} at ${traps.employers.maxWeber.name} asked for ${["a store-level report", "the API docs", "a call with finance", "references", "an SSO demo", "the DPA"][i]}.`, people: [mw.name, traps.employers.maxWeber.name], source: userSrc });
    for (let i = 0; i < 6; i++) ev(0.12 + i * 0.12, "icp", { content: `${mg.name} at ${traps.employers.maxWagner.name} ${["shared the returns volume", "wants a cheaper tier", "asked about Shopify", "flagged a churn risk", "requested a QBR", "introduced their CFO"][i]}.`, people: [mg.name, traps.employers.maxWagner.name], source: userSrc });
    ev(0.3, "icp", { content: `${mw.name} wrote from his private address about the renewal.`, people: [mw.name], source: [{ kind: "gmail", ref: "18e-private-1" }], tools: ["gmail"] });
    for (const [i, j] of traps.lookalike.entries()) ev(0.2 + i * 0.1, "icp", { content: `${j.name} ${i ? "runs logistics at" : "leads procurement at"} ${traps.employers.jana.name}.`, people: [j.name, traps.employers.jana.name], source: userSrc });
    const r = traps.renamed;
    for (let i = 0; i < 4; i++) ev(0.1 + i * 0.08, "icp", { content: `${r.before} ${["signed the NDA", "asked for a pilot quote", "has 40 stores", "uses manual returns"][i]}.`, people: [r.before], source: userSrc });
    ev(0.45, null, { identity: "rename" });
    for (let i = 0; i < 3; i++) ev(0.5 + i * 0.1, "icp", { content: `${r.after} ${["confirmed the pilot", "moved procurement to Q4", "asked for SSO"][i]}.`, people: [r.after], source: userSrc });
    const m = traps.merged;
    for (let i = 0; i < 3; i++) ev(0.15 + i * 0.1, "icp", { content: `${m.duplicate.name} ${["asked for the pricing sheet", "booked a demo", "forwarded the security answers"][i]}.`, people: [m.duplicate.name], source: userSrc });
    for (let i = 0; i < 3; i++) ev(0.2 + i * 0.1, "icp", { content: `${m.survivor.name} ${["is the returns lead", "wants weekly reports", "approved the pilot scope"][i]}.`, people: [m.survivor.name], source: userSrc });
    ev(0.6, null, { identity: "merge" });
    const sizeCo = companies[5];
    traps.size = { company: sizeCo.id, values: [120, 450] };
    ev(0.3, "icp", { content: `${sizeCo.name} has 120 employees, per their website.`, people: [sizeCo.name], source: [{ kind: "web", ref: `https://${sizeCo.domain}/about` }], tools: ["web"] });
    ev(0.6, "icp", { content: `${sizeCo.name} has 450 employees, per Attio.`, people: [sizeCo.name], source: [{ kind: "attio", ref: `https://crm.fixture.test/companies/${slugOf(sizeCo.name)}` }], tools: ["attio"] });
    traps.relative = [ev(0.7, "offer", { content: `Send the revised quote to ${companies[6].name} next Friday.`, people: [companies[6].name], source: userSrc }), ev(0.72, "icp", { content: `Call ${companies[7].name} tomorrow about the pilot.`, people: [companies[7].name], source: userSrc })];
    const draft = ev(0.75, "offer", { content: `Draft, not sent: proposal email to ${companies[8].name} offering 20% off the first year.`, people: [companies[8].name], source: userSrc, tags: ["draft"] });
    gold.drafts.push({ ref: draft, entity: idOf(companies[8].name), why: "unsent draft email" });
  }

  // the filler: ordinary notes in every context until the shape's total
  const fixedCount = () => events.filter(e => !e.identity).length;
  const filler = {
    market: () => { const c = pick(companies); return { content: `${c.name} launched a ${pick(["returns portal", "loyalty app", "same-day delivery", "store pickup"])} in ${pick(REGION)}; ${pick(["analysts expect copycats", "pricing starts at " + int(5, 40) + " EUR per store", "it targets " + pick(SEGMENT)])}.`, people: [c.name], source: [{ kind: "web", ref: `https://news.fixture.test/${slugOf(c.name)}/${int(1, 999)}` }], tools: ["web"] }; },
    offer: () => { const prod = pick(products); return { content: `${prod.name} ${pick(["pricing", "packaging", "onboarding", "positioning"])}: ${pick(["per-store pricing tested well", "annual plans get two months free", "the starter tier caps at 20 stores", "proof points come from pilots"])}.`, people: [prod.name], source: userSrc }; },
    strategy: () => ({ content: `${pick(["Growth", "Expansion", "Partnerships", "Hiring"])} plan: ${pick(SEGMENT)} in ${pick(REGION)} ${pick(["first", "after the pilot cohort", "via partners", "with outbound"])}.`, source: userSrc }),
    icp: () => { const c = pick(companies); return { content: `${c.name} (${c.industry}, about ${c.size} employees) ${pick(["handles returns by hand", "runs a legacy WMS", "wants store-level reporting", "has a 60-day return window"])}.`, people: [c.name], source: userSrc }; },
    company: () => ({ content: `Team update: ${pick(["Tomasz owns partner onboarding", "Marta runs the pipeline review", "hiring a second AE", "new security questionnaire template"])}.`, source: userSrc }),
    [`personal-${by}`]: () => ({ content: `${pick(["Prefers calls before noon", "Wants drafts in bullet form", "Reviews pipeline on Mondays", "Blocks Fridays for writing"])}.`, source: userSrc }),
  };
  const ctxs = Object.keys(filler);
  for (let i = 0, n = fixedCount() + attachmentTargets.length; n < cfg.notes; i++, n++) { const ctx = ctxs[i % 13 < 4 ? 3 : i % 13 < 7 ? 1 : i % 13 < 9 ? 0 : i % 13 < 11 ? 2 : i % 13 < 12 ? 4 : 5]; ev(rnd(), ctx, { ...filler[ctx](), tags: projectTag() }); }

  /* ---------- write them, oldest first ---------- */
  for (const e of events) e.at ||= timeAt(e.f);
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq);
  const total = events.filter(e => !e.identity).length;
  log(`writing ${total} notes`);
  let written = 0, t = Date.now();
  lib.withEntityLock(root, () => {
    for (const e of events) {
      if (e.identity === "rename") { const r = traps.renamed; lib.updateEntity(root, { entity: r.entity.id, by, set: { name: r.after } }); gold.changes.push({ entity: r.entity.id, what: "name", from: r.before, to: r.after, at: date10(e.at) }); continue; }
      if (e.identity === "merge") { const m = traps.merged, preview = lib.mergeEntities(root, { source: m.duplicate.id, target: m.survivor.id }); lib.mergeEntities(root, { source: m.duplicate.id, target: m.survivor.id, by, as_of: preview.as_of }); gold.changes.push({ entity: m.survivor.id, what: "merged", from: m.duplicate.id, to: m.survivor.id, at: date10(e.at) }); continue; }
      const { rec } = lib.appendMemory(root, e.ctx, { authors: [e.ctx === "company" && written % 3 === 0 ? mate : by], kind: e.kind || "note", tools: e.tools || [], people: e.people || [], content: e.content, source: e.source || [], tags: e.tags || [], at: e.at,
        ...(e.relation ? { relation: e.relation } : {}), ...(e.customer ? { customer: e.customer } : {}), ...(e.meeting ? { meeting: e.meeting } : {}), ...(e.meetingRef ? { meeting_id: e.meetingRef.id } : {}),
        ...(e.supersedesRef ? { supersedes: e.supersedesRef.id } : {}), ...(e.retractsRef ? { retracts: e.retractsRef.id } : {}) });
      e.id = rec.id; written++;
      if (written % 500 === 0) { const rate = (Date.now() - t) / written; log(`${written}/${total} notes, ${rate.toFixed(0)} ms each, about ${Math.round(rate * (total - written) / 1000)}s left`); }
    }
    // attachments last: a file per company, approved as its logo
    const scratch = mkdtempSync(join(tmpdir(), "gtm-e2e-assets-"));
    for (const [i, c] of attachmentTargets.entries()) {
      const file = join(scratch, `${slugOf(c.name)}-logo.svg`); writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#${(0x334455 + i * 0x101010).toString(16).slice(-6)}"/></svg>\n`);
      const kept = assets.ownerCopy(root, c.name, file), asset = assets.prepareAsset(root, { entity: c.name, label: "Primary logo", role: "primary-logo", status: "approved", path: kept });
      const { rec } = lib.appendMemory(root, "company", { authors: [by], content: `${c.name} approved this file as the primary-logo to use (Primary logo).`, people: [c.name], source: userSrc, asset, at: new Date(T0 + SPAN + i * 60000).toISOString() });
      gold.attachments.push({ memory: rec.id, entity: c.id, role: "primary-logo", path: kept }); written++;
    }
    rmSync(scratch, { recursive: true, force: true });
  });
  log(`notes written (${written})`);

  /* ---------- the gold ledger ---------- */
  const reg = lib.readNames(root), canon = id => lib.resolveEntity(reg, id)?.id || id;
  gold.entities = reg.filter(e => e.status !== "archived").map(e => ({ id: e.id, name: e.name, kind: e.kind, subtype: e.subtype ?? null, aliases: e.aliases, emails: e.emails, previous_ids: e.previous_ids || [] }));
  const relKey = r => `${canon(r.from.id)}|${r.type}|${r.to === "us" ? "us" : canon(r.to.id)}`, rels = new Map();
  for (const r of relEvents) {
    const k = relKey(r); if (!rels.has(k)) rels.set(k, { type: r.type, from: canon(r.from.id), from_name: reg.find(e => e.id === canon(r.from.id))?.name, to: r.to === "us" ? "us" : canon(r.to.id), to_name: r.to === "us" ? "us" : reg.find(e => e.id === canon(r.to.id))?.name, history: [] });
    rels.get(k).history.push({ status: r.status, observed_at: r.e.relation.observed_at, memory: r.e.id, basis: r.e.relation.basis, source: r.e.source[0].kind });
  }
  for (const r of rels.values()) { r.history.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)); const user = r.history.filter(h => h.basis === "user").at(-1); r.status = (user || r.history.at(-1)).status; r.conflict = new Set(r.history.map(h => h.source)).size > 1 && new Set(r.history.map(h => h.status)).size > 1; }
  gold.relations = [...rels.values()];
  const cust = new Map();
  for (const c of customerEvents.filter(c => !c.e.tags?.includes("demo"))) { const id = canon(c.entity.id); if (!cust.has(id)) cust.set(id, { id, name: reg.find(e => e.id === id)?.name, history: [] }); cust.get(id).history.push({ status: c.status, observed_at: c.e.customer.observed_at, memory: c.e.id, basis: c.e.customer.basis }); }
  for (const c of cust.values()) { c.history.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)); c.status = c.history.at(-1).status; }
  gold.customers = [...cust.values()];
  gold.drafts = gold.drafts.map(d => ({ memory: d.ref.id, entity: d.entity, why: d.why }));
  gold.buyers = buyerEvents.map(b => ({ company: canon(b.company.id), company_name: b.company.name, person: canon(b.person.id), person_name: b.person.name, memory: b.e.id }));
  for (const { e, answered, answer } of questionEvents) { if (answered) gold.questions.answered.push({ question: e.id, answer: answer.id, context: e.ctx }); else (gold.questions.open[e.ctx] ||= []).push(e.id); }
  gold.decisions = decisionEvents.map(e => ({ id: e.id, context: e.ctx }));
  gold.corrections = correctionEvents.map(c => ({ kind: c.kind, old: c.old.id, new: c.fix.id, token: c.token, context: c.old.ctx, ...(c.now ? { now: c.now, was: c.was } : {}) }));
  gold.meetings = meetingEvents.map(m => ({ anchor: m.anchor.id, occurrence: m.planned ? "planned" : "happened", company: canon(m.company.id), title: m.anchor.meeting.title, occurred_at: m.anchor.meeting.occurred_at, participants: m.planned ? [] : m.staff.map(p => canon(p.id)), outcomes: m.outcome ? [m.outcome.id] : [] }));
  gold.needles = { single: { query: NEEDLES.single, ids: needles.single.map(e => e.id) }, multi: { query: NEEDLES.multi, ids: needles.multi.map(e => e.id) }, stem: { query: NEEDLES.stem.query, ids: needles.stem.map(e => e.id) }, typo: { query: NEEDLES.typo, ids: needles.single.map(e => e.id) } };
  const aliasPerson = persons.find(p => p.aliases.length && events.some(e => e.people?.includes(p.name)));
  const gone = new Set([...correctionEvents.map(c => c.old.id), ...questionEvents.filter(q => q.answered).map(q => q.e.id)]);
  if (aliasPerson) gold.needles.alias = { query: aliasPerson.aliases[0], entity: canon(aliasPerson.id), name: aliasPerson.name, ids: events.filter(e => e.id && !gone.has(e.id) && e.content?.includes(aliasPerson.name)).map(e => e.id) };
  for (const [slug] of projects) gold.projects[slug] = events.filter(e => e.id && e.tags?.includes(`project:${slug}`)).length;
  for (const c of lib.listContexts(root)) { const eff = lib.effectiveMemories(c.memories); gold.contexts[c.slug] = { records: c.memories.length, effective: eff.length, ids: eff.map(m => m.id) }; }
  gold.counts = { entities: Object.fromEntries(["person", "organization", "product", ...otherKinds].map(k => [k, gold.entities.filter(e => e.kind === k).length])), subtypes: Object.fromEntries(orgSubtypes.map(s => [s, gold.entities.filter(e => e.kind === "organization" && e.subtype === s).length])), notes: written, relations: gold.relations.length, meetings: gold.meetings.filter(m => m.occurrence === "happened").length };
  if (hub) { const hubRels = gold.relations.filter(r => r.from === canon(hub.id) || r.to === canon(hub.id)); gold.hub = { id: canon(hub.id), name: hub.name, relations: hubRels.length, partnership: hubRels.find(r => r.type === "partner_of"), customer: gold.customers.find(c => c.id === canon(hub.id))?.status, employees: gold.relations.filter(r => r.type === "works_at" && r.to === canon(hub.id)).map(r => ({ person: r.from, name: r.from_name, status: r.status })) }; }
  // the person with the most notes: the brief whose size grows with the brain
  const mentions = new Map(); for (const e of events) for (const n of e.people || []) mentions.set(n, (mentions.get(n) || 0) + 1);
  const busiest = [...mentions].filter(([n]) => byName.get(n)?.kind === "organization").sort((a, b) => b[1] - a[1])[0];
  gold.busiest = busiest ? { id: canon(byName.get(busiest[0]).id), name: reg.find(e => e.id === canon(byName.get(busiest[0]).id))?.name, notes: busiest[1] } : null;
  if (cfg.messy) {
    const [mw, mg] = traps.maxes;
    gold.traps = { ...gold.traps, maxes: [{ id: mw.id, name: mw.name, emails: mw.emails, employer: canon(traps.employers.maxWeber.id) }, { id: mg.id, name: mg.name, employer: canon(traps.employers.maxWagner.id) }], typo_mention: "Max Webber",
      private_email: { email: "maxweber.home@privatemail.test", entity: mw.id }, lookalike: traps.lookalike.map(j => ({ id: j.id, name: j.name })),
      renamed: { id: canon(traps.renamed.entity.id), before: traps.renamed.before, after: traps.renamed.after }, merged: { survivor: canon(traps.merged.survivor.id), retired: traps.merged.duplicate.id, name: traps.merged.survivor.name, alias: traps.merged.duplicate.name },
      size: traps.size, relative: traps.relative.map(e => e.id) };
  }
  // one commit, so the folder is an ordinary brain (lib.save commits even with GTM_BRAIN_NO_COMMIT)
  const saved = lib.save(root, `e2e fixture: ${shape} (seed ${seed})`);
  if (!saved.ok) log(`save: ${saved.note}`);
  gold.generated = { at: "deterministic", seconds: Math.round((Date.now() - started) / 1000), notes: written, ms_per_note: Math.round((Date.now() - t) / Math.max(1, written)) };
  writeFileSync(goldPath, JSON.stringify(gold, null, 1) + "\n");
  log(`done: ${root}, gold ${goldPath}`);
  return { root, gold: goldPath };
}

/* A finished brain per shape, seed and source: the generator and the lib it writes through. */
export function sourceHash() {
  const h = createHash("sha256");
  for (const dir of ["lib", "scripts/gtm-brain-setup", "templates"]) for (const f of readdirSync(join(P, dir), { recursive: true }).filter(f => /\.(mjs|sh|md|json)$/.test(f)).sort()) h.update(f).update(readFileSync(join(P, dir, f)));
  h.update(readFileSync(fileURLToPath(import.meta.url)));
  return h.digest("hex").slice(0, 16);
}
export async function cached({ shape, seed = 1, out, cache, quiet = true }) {
  const key = `${shape}-${seed}-${sourceHash()}`, dir = join(resolve(cache), key);
  if (!existsSync(join(dir, "done"))) {
    mkdirSync(resolve(cache), { recursive: true });
    for (const old of readdirSync(resolve(cache)).filter(d => d.startsWith(`${shape}-${seed}-`) && d !== key)) rmSync(join(resolve(cache), old), { recursive: true, force: true });
    const tmp = mkdtempSync(join(resolve(cache), `.${key}-`));
    await generate({ shape, seed, out: join(tmp, "brain"), gold: join(tmp, "gold.json"), quiet });
    writeFileSync(join(tmp, "done"), new Date().toISOString());
    rmSync(dir, { recursive: true, force: true }); renameSync(tmp, dir);
  }
  const root = resolve(out), gold = `${root}.gold.json`;
  mkdirSync(dirname(root), { recursive: true });
  cpSync(join(dir, "brain"), root, { recursive: true });
  // absolute paths in the copied brain's machine-local files point at the cache: point them at the copy
  for (const f of ["work/projects.json"]) { const p = join(root, f); if (existsSync(p)) writeFileSync(p, readFileSync(p, "utf8").replaceAll(join(dir, "brain"), root)); }
  for (const slug of readdirSync(join(root, "projects")).filter(d => existsSync(join(root, "projects", d, "AGENTS.md")))) { const p = join(root, "projects", slug, "AGENTS.md"); writeFileSync(p, readFileSync(p, "utf8").replaceAll(join(dir, "brain"), root)); }
  writeFileSync(gold, readFileSync(join(dir, "gold.json"), "utf8"));
  return { root, gold, cached: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { opt[a[i].slice(2)] = a[i + 1]; i++; }
  const args = { shape: opt.shape || "small", out: opt.out, seed: Number(opt.seed || 1), gold: opt.gold || null };
  const r = opt.cache ? await cached({ ...args, cache: opt.cache, quiet: false }) : await generate(args);
  console.log(JSON.stringify(r));
}
