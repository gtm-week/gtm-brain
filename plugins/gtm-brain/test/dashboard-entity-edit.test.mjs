// The Entities tab's forms: POST /entity-edit takes a small set of named operations, each one call of a script the
// MCP tools run (entities.mjs --add, lifecycle.mjs update_entity / merge_entities / archive_entity, remember.mjs with
// a relation or customer block), behind the document save's guard: this server's Origin, the token made at each
// start, JSON, a small body, never from a scheduled or background run. On a throwaway brain made by setup.
// Run: node --test plugins/gtm-brain/test/dashboard-entity-edit.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { request } from "node:http";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-entedit-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-entedit-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) delete env[k];
const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-entedit-")));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>"], { cwd: root, env, stdio: "ignore" });
const lib = await import(`${P}/lib/brain.mjs`);
const { ENTITY_EDIT_OPS } = await import(`${P}/server/entity-edit.mjs`);
writeFileSync(join(root, "work", "person.json"), JSON.stringify({ handle: "marta-nowak" }) + "\n");
const dash = (extra = {}, ...a) => execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, ...a], { encoding: "utf8", env: { ...env, ...extra } }).trim();
after(() => { try { dash({}, "--stop"); } catch {} for (const r of [root, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

lib.writeNames(root, [...lib.readNames(root),
  { name: "Ola Kowalska", kind: "person", aliases: ["Olka"], emails: ["ola@acme.test"] }, { name: "Jan Zielinski", kind: "person" }, { name: "J. Zielinski", kind: "person" },
  { name: "Acme Retail", kind: "organization", subtype: "company" }, { name: "Returns Desk", kind: "product" }, { name: "Old Lead", kind: "person" }]);
lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "J. Zielinski asked about returns pricing.", people: ["J. Zielinski"], at: new Date(Date.now() - 864e5).toISOString() });
execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"]);
execFileSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, root], { env });

const PORT = 48947, url = dash({}, "--start", `--port=${PORT}`), origin = `http://127.0.0.1:${PORT}`;
const token = (await (await fetch(url, { headers: { connection: "close" } })).text()).match(/<meta name="gtm-brain-edit" content="([a-f0-9]{64})">/)?.[1];
// node's fetch refuses to set Origin and Host, so the requests are made by hand
const send = (method, path, { headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const req = request(url + path.replace(/^\//, ""), { method, headers: { connection: "close", ...headers } }, res => { let text = ""; res.setEncoding("utf8"); res.on("data", c => text += c); res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text }); }); });
  req.on("error", reject); if (body !== null) req.write(body); req.end();
});
const edit = (input, headers = {}) => send("POST", "/entity-edit", { headers: { origin, "content-type": "application/json", "x-gtm-brain-token": token, ...headers }, body: typeof input === "string" ? input : JSON.stringify(input) });
const commits = () => execFileSync("git", ["-C", root, "log", "--format=%s"], { encoding: "utf8" }).trim().split("\n");
const names = () => lib.readNames(root), id = name => names().find(e => e.name === name)?.id, notes = () => lib.listContexts(root).flatMap(c => c.memories);
const relation = (from, type, to) => lib.relationOverview(root).relations.find(r => r.from.name === from && r.type === type && r.to.name === to);
const state = () => JSON.stringify([names().map(e => [e.id, e.name, e.kind, e.status, e.aliases, e.emails]), notes().length, commits().length]);
const ok = async input => { const r = await edit(input); assert.equal(r.status, 200, `${input.op}: ${r.text}`); assert.equal(r.json.ok, true); return r.json; };
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

test("anything that is not the page, or not one of the named operations, is refused and nothing is written", async () => {
  const before = state(), input = { op: "update", entity: id("Ola Kowalska"), name: "Overwritten" };
  const cases = [
    ["no token", await edit(input, { "x-gtm-brain-token": "" }), 403],
    ["a wrong token", await edit(input, { "x-gtm-brain-token": "0".repeat(64) }), 403],
    ["a foreign Origin", await edit(input, { origin: "https://evil.example" }), 403],
    ["no Origin", await send("POST", "/entity-edit", { headers: { "content-type": "application/json", "x-gtm-brain-token": token }, body: JSON.stringify(input) }), 403],
    ["another site's request", await edit(input, { "sec-fetch-site": "cross-site" }), 403],
    ["a form post", await edit("op=update", { "content-type": "application/x-www-form-urlencoded" }), 415],
    ["not JSON", await edit("{op:"), 400],
    ["no operation", await edit({ entity: id("Ola Kowalska") }), 400],
    ["an unknown operation", await edit({ op: "run_tool", tool: "remember", args: {} }), 400],
    ["an operation of Object itself", await edit({ op: "constructor" }), 400],
    ["too large", await edit({ op: "update", entity: id("Ola Kowalska"), name: "x".repeat(20000) }), 413],
    ["an entity that does not exist", await edit({ op: "update", entity: "e_0000000000000000", name: "Nobody" }), 404],
    ["an id that is not an id", await edit({ op: "archive", entity: "../../admin" }), 400],
    ["a GET", await send("GET", "/entity-edit", { headers: { origin } }), 404],
  ];
  for (const [what, r, status] of cases) { assert.equal(r.status, status, `${what}: ${r.text}`); if (r.json) assert.equal(r.json.ok, false, what); }
  assert.match(cases[8][1].json.note, /cannot do that/); assert.match(cases[11][1].json.note, /not in the brain any more/);
  assert.equal(state(), before);
  assert.deepEqual(ENTITY_EDIT_OPS, ["create", "update", "merge", "archive", "set_fields", "add_relation", "end_relation", "retract_relation", "set_customer"]);
});

test("update: name, other names, emails and kind go through update_entity, with a commit; a bad value says why", async () => {
  const ola = id("Ola Kowalska"), n = commits().length;
  const r = await ok({ op: "update", entity: ola, name: "Aleksandra Kowalska", aliases: ["Olka", "Ola K."], emails: ["ola@acme.test", "Aleksandra@Acme.test"] });
  assert.equal(r.status, "updated"); assert.match(r.note, /Saved Aleksandra Kowalska/);
  const e = names().find(x => x.id === ola);
  assert.deepEqual([e.name, e.kind, e.emails], ["Aleksandra Kowalska", "person", ["ola@acme.test", "aleksandra@acme.test"]]);
  assert.deepEqual([...e.aliases].sort(), ["Ola K.", "Ola Kowalska", "Olka"], "the old name stays as another name");
  assert.ok(commits().length > n, "the change is committed by the entity operation");
  assert.equal((await ok({ op: "update", entity: ola, name: "Aleksandra Kowalska" })).status, "unchanged");
  assert.equal((await ok({ op: "update", entity: id("Returns Desk"), kind: "tool" })).status, "updated"); assert.equal(names().find(x => x.name === "Returns Desk").kind, "tool");
  await ok({ op: "update", entity: id("Returns Desk"), kind: "product" });
  const bad = await edit({ op: "update", entity: ola, emails: ["not an address"] }); assert.equal(bad.status, 422); assert.match(bad.json.note, /does not look like an email/);
  const kind = await edit({ op: "update", entity: ola, kind: "spaceship" }); assert.equal(kind.status, 422); assert.match(kind.json.note, /Choose a kind: person/);
  const taken = await edit({ op: "update", entity: ola, name: "Jan Zielinski" }); assert.equal(taken.status, 422, "the tool's own refusal comes back"); assert.ok(taken.json.note.length > 10);
  assert.equal(names().find(x => x.id === ola).name, "Aleksandra Kowalska");
});

test("create adds an entity through entities.mjs --add; a name already known is refused", async () => {
  const r = await ok({ op: "create", name: "Northwind Traders", kind: "organization" });
  const e = names().find(x => x.name === "Northwind Traders");
  assert.deepEqual([r.status, r.entity, e.kind, e.subtype], ["created", e.id, "organization", "company"]);
  assert.equal((await edit({ op: "create", name: "Northwind Traders", kind: "organization" })).status, 409);
  assert.equal((await edit({ op: "create", name: "Thing", kind: "spaceship" })).status, 422);
  assert.equal((await edit({ op: "create", name: "Two\nlines", kind: "person" })).status, 400);
});

test("set_fields saves one note that states the details, with the person and the dashboard as its sources", async () => {
  const jan = id("Jan Zielinski"), before = notes().length;
  const r = await ok({ op: "set_fields", entity: jan, fields: { role: "Head of buying", location: "Gdansk" } });
  assert.equal(r.status, "noted"); assert.match(r.note, /Saved as a note/);
  const m = notes().find(x => x.id === r.memory);
  assert.equal(m.content, "Jan Zielinski. Role: Head of buying. Location: Gdansk.");
  assert.deepEqual(m.authors, ["marta-nowak"]); assert.ok(m.entities.includes(jan));
  assert.ok(m.source.some(s => s.kind === "user" && s.ref === "marta-nowak") && m.source.some(s => s.kind === "dashboard"));
  assert.equal(notes().length, before + 1);
  const bad = await edit({ op: "set_fields", entity: jan, fields: { shoe_size: "44" } }); assert.equal(bad.status, 422); assert.match(bad.json.note, /not a detail this brain records about a person/);
  assert.equal((await edit({ op: "set_fields", entity: jan, fields: {} })).status, 400);
  assert.equal(notes().length, before + 1);
});

test("add_relation writes a note with a relation block, and the link is in the relation log with its dated event", async () => {
  const jan = id("Jan Zielinski"), acme = id("Acme Retail"), start = day(40);
  const r = await ok({ op: "add_relation", from: jan, type: "works_at", to: acme, date: start, note: "Jan Zielinski joined Acme Retail as head of buying." });
  assert.equal(r.status, "added");
  const m = notes().find(x => x.id === r.memory);
  assert.deepEqual(m.relation, { from: jan, type: "works_at", to: acme, status: "current", basis: "user", observed_at: `${start}T00:00:00Z` });
  assert.equal(m.content, "Jan Zielinski joined Acme Retail as head of buying."); assert.ok(m.source.some(s => s.kind === "dashboard"));
  const linked = notes().filter(x => x.relation && !x.retracts);
  const log = lib.buildRelationLog(linked, { resolve: v => ({ id: v, kind: names().find(e => e.id === v)?.kind || null }) }).relations.find(x => x.from === jan && x.type === "works_at" && x.to === acme);
  assert.deepEqual(log.events.map(e => [e.event, e.at, e.basis, e.memory]), [["started", `${start}T00:00:00Z`, "user", r.memory]]);
  assert.equal(log.since, `${start}T00:00:00Z`); assert.equal(relation("Jan Zielinski", "works_at", "Acme Retail").status, "current");
  // the page's own data after the render the save asked for
  execFileSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, root], { env });
  const D = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8")), details = JSON.parse(readFileSync(join(root, "work", "home", D.pillars.entities.file), "utf8")).details;
  const out = details[jan].links.find(l => l.type === "works_at");
  assert.deepEqual([out.out, out.other.id, out.status, out.since, out.events.map(e => e.event)], [true, acme, "current", `${start}T00:00:00Z`, ["started"]]);
  assert.equal(D.pillars.entities.rows.find(e => e.id === jan).company, "Acme Retail");
  // partner of ours: the other end is us
  const p = await ok({ op: "add_relation", from: acme, type: "partner_of", to: "us" });
  assert.equal(notes().find(x => x.id === p.memory).relation.to, "us"); assert.equal(p.note, "Saved: Acme Retail partner of Reflow.");
});

test("a relation type the schema does not have, ends of the wrong kind, a missing entity or a bad date write nothing", async () => {
  const before = state(), jan = id("Jan Zielinski"), acme = id("Acme Retail");
  const type = await edit({ op: "add_relation", from: jan, type: "owns_cat", to: acme }); assert.equal(type.status, 422); assert.match(type.json.note, /"owns cat" is not a kind of connection this brain records\. The schema lists: works at/);
  const kinds = await edit({ op: "add_relation", from: acme, type: "works_at", to: jan }); assert.equal(kinds.status, 422); assert.match(kinds.json.note, /does not fit: works at goes from person/);
  assert.equal((await edit({ op: "add_relation", from: jan, type: "works_at", to: "e_0000000000000000" })).status, 404);
  assert.equal((await edit({ op: "add_relation", from: "e_0000000000000000", type: "works_at", to: acme })).status, 404);
  assert.equal((await edit({ op: "add_relation", from: jan, type: "works_at", to: jan })).status, 422);
  assert.equal((await edit({ op: "add_relation", from: jan, type: "works_at", to: acme, date: "last spring" })).status, 400);
  assert.equal((await edit({ op: "add_relation", from: jan, type: "works_at", to: acme, date: "2999-01-01" })).status, 422);
  assert.equal((await edit({ op: "add_relation", from: jan, type: "customer_of", to: "us" })).status, 422, "customer status has its own operation");
  assert.equal((await edit({ op: "end_relation", from: jan, type: "attended", to: acme })).status, 422);
  assert.equal(state(), before);
});

test("end_relation adds the ended event with its date; retract_relation withdraws the notes behind a link", async () => {
  const jan = id("Jan Zielinski"), acme = id("Acme Retail"), end = day(5);
  const r = await ok({ op: "end_relation", from: jan, type: "works_at", to: acme, date: end });
  assert.equal(r.status, "ended");
  const rel = relation("Jan Zielinski", "works_at", "Acme Retail");
  assert.equal(rel.status, "ended"); assert.equal(rel.observed_at, `${end}T00:00:00Z`);
  const log = lib.buildRelationLog(notes().filter(x => x.relation && !x.retracts), {}).relations.find(x => x.from === jan && x.type === "works_at");
  assert.deepEqual(log.events.map(e => e.event), ["started", "ended"]); assert.equal(log.until, `${end}T00:00:00Z`);
  // "This was wrong": every note behind the link is withdrawn by a new record; nothing is edited or removed
  const lines = readFileSync(join(root, "brain", "contexts", "company", "memories.jsonl"), "utf8").trim().split("\n");
  const w = await ok({ op: "retract_relation", from: jan, type: "works_at", to: acme });
  assert.equal(w.status, "withdrawn");
  assert.equal(relation("Jan Zielinski", "works_at", "Acme Retail"), undefined);
  const after = readFileSync(join(root, "brain", "contexts", "company", "memories.jsonl"), "utf8").trim().split("\n");
  assert.deepEqual(after.slice(0, lines.length), lines, "the log only grows"); assert.equal(after.length, lines.length + 2);
  assert.ok(after.slice(-2).map(l => JSON.parse(l)).every(m => m.retracts && m.authors[0] === "marta-nowak"));
  assert.equal((await edit({ op: "retract_relation", from: jan, type: "works_at", to: acme })).status, 404, "nothing left to withdraw");
});

test("set_customer records the relation to us as a customer note", async () => {
  const acme = id("Acme Retail");
  const r = await ok({ op: "set_customer", entity: acme, status: "customer", date: day(10) });
  assert.equal(r.note, "Saved: Acme Retail is a customer.");
  assert.deepEqual(notes().find(x => x.id === r.memory).customer, { entity: acme, status: "customer", basis: "user", observed_at: `${day(10)}T00:00:00Z` });
  assert.equal(lib.customerOverview(root).customers.find(c => c.name === "Acme Retail").status, "customer");
  await ok({ op: "set_customer", entity: acme, status: "former_customer" });
  assert.equal(lib.customerOverview(root).customers.find(c => c.name === "Acme Retail").status, "former_customer");
  assert.equal((await edit({ op: "set_customer", entity: acme, status: "best friend" })).status, 400);
  assert.equal((await edit({ op: "set_customer", entity: id("Returns Desk"), status: "customer" })).status, 422);
});

test("merge shows what will happen first and merges only with that preview; archive takes an entity off the lists", async () => {
  const keep = id("Jan Zielinski"), fold = id("J. Zielinski"), before = state();
  const p = await ok({ op: "merge", source: fold, target: keep });
  assert.equal(p.status, "preview"); assert.match(p.as_of, /^ecv_/); assert.deepEqual([p.keep.name, p.fold.name, p.fold.notes, p.blocked], ["Jan Zielinski", "J. Zielinski", 1, null]);
  assert.ok(p.names.includes("J. Zielinski")); assert.equal(state(), before, "a preview writes nothing");
  assert.equal((await edit({ op: "merge", source: fold, target: keep, as_of: "ecv_0000" })).status, 422, "a stale preview is refused by the tool");
  assert.equal((await edit({ op: "merge", source: keep, target: keep })).status, 422);
  const m = await ok({ op: "merge", source: fold, target: keep, as_of: p.as_of });
  assert.equal(m.status, "merged"); assert.equal(m.note, "J. Zielinski is now part of Jan Zielinski.");
  assert.equal(id("J. Zielinski"), undefined); assert.ok(names().find(e => e.id === keep).aliases.includes("J. Zielinski"));
  assert.equal(lib.resolveEntity(names(), fold)?.id, keep, "the retired id names the one that stayed");
  const a = await ok({ op: "archive", entity: id("Old Lead") });
  assert.equal(a.status, "archived"); assert.equal(names().find(e => e.name === "Old Lead").status, "archived");
});

test("nobody known at this computer, or a scheduled or background run: nothing is edited", async () => {
  const ola = names().find(e => e.name === "Aleksandra Kowalska").id;
  rmSync(join(root, "work", "person.json")); execFileSync("git", ["-C", root, "config", "user.email", "nobody@users.noreply.github.com"]);
  const anon = await edit({ op: "archive", entity: ola }); assert.equal(anon.status, 403); assert.match(anon.json.note, /does not know who is at this computer/);
  writeFileSync(join(root, "work", "person.json"), JSON.stringify({ handle: "marta-nowak" }) + "\n");
  dash({}, "--stop");
  dash({ GTM_BRAIN_RUN: "1" }, "--start", `--port=${PORT}`);
  const fresh = (await (await fetch(url, { headers: { connection: "close" } })).text()).match(/gtm-brain-edit" content="([a-f0-9]{64})"/)[1];
  assert.equal((await edit({ op: "archive", entity: ola }, { "x-gtm-brain-token": fresh })).status, 403);
  assert.equal((await edit({ op: "archive", entity: ola })).status, 403, "the old token");
  assert.equal(names().find(e => e.id === ola).status || "active", "active");
  dash({}, "--stop");
});
