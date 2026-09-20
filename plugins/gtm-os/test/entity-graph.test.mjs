process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";
import { entityGraph } from "../lib/entity-graph.mjs";
import * as lib from "../lib/brain.mjs";

const identity = (name, extra = {}) => ({ name, kind: "person", aliases: [], emails: [], not: [], ...extra });
const memory = (id, content, extra = {}) => ({ id: `m_${String(id).padStart(12, "0")}`, context: "sales", at: "2026-09-09T10:00:00Z", authors: ["ann"], via: "codex", kind: "note", content, people: [], tools: [], source: [], actions: [], tags: [], supersedes: null, retracts: null, ...extra });
const context = (slug, memories, extra = {}) => ({ slug, title: slug, status: "active", names: [], memories, ...extra });
const registry = [identity("Ann Lee", { aliases: ["Annie"] }), identity("Acme", { kind: "company" }), identity("OtherCo", { kind: "company" }), identity("OldCo", { kind: "company" }), identity("Unused")];

test("neighbors need a shared effective note, with canonical identity and context provenance", () => {
  const a = memory(1, "Annie is the buyer at Acme.", { people: ["Annie", "Ann Lee"] });
  const b = memory(2, "OtherCo sent a proposal.");
  const c = memory(3, "Annie compared OtherCo.", { context: "market" });
  const contexts = [context("sales", [a, b]), context("market", [c])];
  const before = JSON.stringify({ registry, contexts });
  const graph = entityGraph(registry, contexts);
  assert.equal(graph.links.length, 2, "same context alone never creates a link");
  const ann = graph.nodes.find(n => n.name === "Ann Lee");
  assert.equal(ann.mentions, 2, "aliases and repeated tags count once");
  assert.deepEqual(ann.contexts[0].evidence, [{ id: a.id, via: "attached" }]);
  assert.equal(graph.nodes.find(n => n.name === "Acme").contexts[0].evidence[0].via, "text");
  assert.deepEqual(graph.links.find(l => l.a === "Acme").evidence, [{ id: a.id, context: "sales" }]);
  assert.equal(graph.nodes.find(n => n.name === "Unused").mentions, 0);
  assert.equal(JSON.stringify({ registry, contexts }), before, "projection never mutates identities or memories");
});

test("withdrawal and stale cover references explain visibility without restoring relationships", () => {
  const a = memory(1, "Ann Lee works at Acme.");
  const withdrawal = memory(2, "Ann Lee does not work at Acme. Withdraw that claim.", { retracts: a.id });
  const old = memory(3, "Ann Lee works at OldCo.");
  const replacement = memory(4, "Ann Lee works at OtherCo.", { supersedes: old.id });
  const graph = entityGraph(registry, [context("sales", [a, withdrawal, old, replacement], { names: [{ name: "Acme", kind: "company" }] })]);
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].b, "OtherCo");
  const acme = graph.nodes.find(n => n.name === "Acme");
  assert.equal(acme.mentions, 0);
  assert.deepEqual(acme.contexts[0], { context: "sales", cover: true, evidence: [], withdrawn: 1, withdrawals: [withdrawal.id] });
  assert.equal(graph.nodes.find(n => n.name === "OldCo").contexts[0].withdrawn, 1);
});

test("forked evidence counts once globally while keeping both context paths, including archives", () => {
  const a = memory(1, "Ann Lee buys from Acme.");
  const copy = memory(2, a.content, { context: "account", tags: ["forked:sales"], source: [{ kind: "memory", ref: a.id }] });
  const graph = entityGraph(registry, [context("sales", [a]), context("account", [copy], { status: "archived" })]);
  assert.equal(graph.links[0].count, 1);
  assert.equal(graph.links[0].evidence.length, 2);
  assert.equal(graph.nodes[0].mentions, 1);
  assert.deepEqual(graph.nodes[0].contexts.map(c => c.context), ["sales", "account"]);
});

const template = readFileSync(new URL("../scripts/gtm-os-render/home.template.html", import.meta.url), "utf8");
function explorer() {
  const reg = [...registry, ...Array.from({ length: 8 }, (_, i) => identity(`Partner ${i}`)), identity('Unsafe <img src=x onerror="alert(1)">')];
  reg[1] = { ...reg[1], not: ["OtherCo"] };
  const contexts = [context("sales", [memory(1, 'Annie is the buyer at Acme. <script>alert(1)</script>', { people: ["Annie"], source: [{ kind: "url", ref: "https://example.com/buyer" }] }), ...reg.slice(5).map((n, i) => memory(10 + i, `Acme met ${n.name}.`, { people: ["Acme", n.name] }))]), context("market", [memory(2, "Annie evaluated OtherCo.", { context: "market" })]), context("archive", [], { status: "archived", names: [{ name: "OldCo" }] })];
  contexts[0].memories[0].source.push({ kind: "codex", ref: "example-thread" });
  const graph = entityGraph(reg, contexts);
  const names = reg.map((n, i) => ({ ...n, contexts: graph.nodes[i].contexts.filter(r => r.evidence.length).map(r => r.context) }));
  const data = { contexts, names, entityGraph: graph, threads: { "example-thread": { name: "Buyer discussion", url: "codex://threads/example-thread" } } };
  const elements = new Map(), handlers = {}, saved = new Map([["gtm-entity", JSON.stringify({ name: "Ann Lee", context: "sales" })]]);
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: "", hidden: false, focus() {}, scrollIntoView() {} });
    return elements.get(selector);
  };
  const sandbox = createContext({ D: data, $, Intl,URL, document: { addEventListener: (event, handler) => { (handlers[event] ||= []).push(handler); } }, sessionStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) }, show: v => { sandbox.view = v; }, labelKind: k => k, kindPill: () => "", relationshipEvidence: () => "" });
  const source = template;
  runInContext(source.slice(source.indexOf("const esc=s=>"), source.indexOf("const LIVE=")), sandbox);
  runInContext(source.slice(source.indexOf("const threadHtml="), source.indexOf("const memHtml=")), sandbox);
  runInContext(source.slice(source.indexOf("const entityContextTags="), source.indexOf("const entRow=")), sandbox);
  runInContext(source.slice(source.indexOf("/* entity explorer:"), source.indexOf("/* admin */", source.indexOf("/* entity explorer:"))), sandbox);
  const click = (selector, dataset) => {
    const button = { dataset, hasAttribute: key => key === "data-entity-context" && "entityContext" in dataset };
    handlers.click.forEach(h => h({ target: { closest: s => s === selector ? button : null } }));
  };
  return { run: s => runInContext(s, sandbox), $, click, saved, sandbox };
}

test("the directory opens a summary-first profile with supporting evidence below connections", () => {
  const ui = explorer();
  assert.equal(ui.run("entName"), "", "a previous session's entity is not selected on startup");
  assert.equal(ui.$("#entity-detail").hidden, true);
  assert.equal(ui.$("#people-list").hidden, false);
  ui.click("[data-entity]", { entity: "Ann Lee", entityContext: "sales" });
  assert.equal(ui.$("#entity-detail").hidden, false);
  assert.equal(ui.$("#people-list").hidden, true);
  const html = ui.$("#entity-detail").innerHTML;
  assert.ok(html.indexOf('id="entity-brief"') < html.indexOf('id="entity-neighborhood"'));
  assert.ok(html.indexOf('id="entity-neighborhood"') < html.indexOf('id="entity-relevance"'));
  assert.match(html, /<details class="entity-evidence-section" >/);
  assert.doesNotMatch(html, /entity-graph-disclosure|connection-graph|data-graph-control/);
  assert.match(html, /Annie is the buyer at Acme/);
  assert.match(html, /Also known as: Annie/);
  assert.match(html, /class="tag on" data-entity="Ann Lee" data-entity-context="sales" aria-pressed="true">#sales<\/button>/);
  assert.match(html, /class="tag" data-entity="Ann Lee" data-entity-context="market" aria-pressed="false">#market<\/button>/);
  ui.click("[data-entity]", { entity: "Ann Lee", entityContext: "market" });
  assert.equal(ui.run("entContext"), "market");
  assert.match(ui.$("#entity-detail").innerHTML, /Annie evaluated OtherCo/);
  assert.doesNotMatch(ui.$("#entity-detail").innerHTML, /Annie is the buyer at Acme/);
  ui.click("[data-entity-close]", {});
  assert.equal(ui.run("entName"), "");
  assert.equal(ui.$("#entity-detail").hidden, true);
  assert.equal(ui.$("#people-list").hidden, false);
});

test("explorer selects, scopes, inspects shared evidence and pivots without losing context", () => {
  const ui = explorer();
  ui.click("[data-entity]", { entity: "Ann Lee", entityContext: "sales" });
  assert.equal(ui.sandbox.view, "people");
  let html = ui.$("#entity-detail").innerHTML;
  assert.match(html, /Annie is the buyer at Acme/);
  assert.doesNotMatch(html, /Annie evaluated OtherCo/);
  assert.match(html, /data-entity="Acme"/);
  assert.doesNotMatch(html, /data-entity="OtherCo"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-mem="m_000000000001"/);
  assert.match(html, /https:\/\/example.com\/buyer/);
  assert.match(html, /data-thread-copy="codex:\/\/threads\/example-thread"/, "Codex sources expose a copy control instead of unsupported browser navigation");
  ui.click("[data-entity-pair]", { entityPair: "Acme" });
  assert.match(ui.$("#entity-detail").innerHTML, /Connection with Acme/);
  ui.click("[data-entity]", { entity: "Acme" });
  assert.equal(ui.run("entContext"), "sales");
  assert.match(ui.$("#entity-detail").innerHTML, /This prevents identity merging/);
  const connections = ui.$("#entity-detail").innerHTML;
  assert.equal((connections.match(/class="entity-neighbor"/g)||[]).length,10,"all connections remain available in the scrollable list");
  assert.match(connections,/class="entity-connections-list scroll-list" tabindex="0" role="region"/);
  assert.doesNotMatch(connections,/connection-node|Graph view/);
  assert.doesNotMatch(connections,/data-entity-page/);
  ui.$("#entity-context").onchange({ target: { value: "market" } });
  html = ui.$("#entity-detail").innerHTML;
  assert.match(html, /No current evidence in this context/);
  assert.doesNotMatch(html, /Annie is the buyer at Acme/);
  assert.equal(ui.run("entContext"), "market");
});

test("empty identities, stale covers and Polish UI explain visibility while preserving source text", () => {
  const ui = explorer();
  ui.click("[data-entity]", { entity: "Unused", entityContext: "" });
  assert.match(ui.$("#entity-detail").innerHTML, /No context evidence yet/);
  ui.click("[data-entity]", { entity: "OldCo", entityContext: "archive" });
  assert.match(ui.$("#entity-detail").innerHTML, /summary may be out of date/);
  assert.match(ui.$("#entity-detail").innerHTML, /archive \(archived\)/);
  assert.equal(ui.run('entityContextTags(D.names.find(n=>n.name==="OldCo"))'), "", "stale cover references do not become current-mention tags");
});

test("entity timelines label recording and refresh times, retain dated text and respect context scope", () => {
  {
    const ui = explorer();
    ui.run(`
      D.contexts[0].compiledAt="2026-09-12T14:00:00Z";
      D.names.find(n=>n.name==="Ann Lee").brief={stale:false,compiledAt:"2026-09-13T12:00:00Z",latestEvidenceAt:"2026-09-11T10:00:00Z",compilation:null,
        timeline:[{id:"m_000000000002",context:"market",at:"2026-09-11T10:00:00Z",content:"Market finding from May 2026."},{id:"m_000000000001",context:"sales",at:"2026-09-09T10:00:00Z",content:"Sales finding from June 2026."}]};
    `);
    ui.click("[data-entity]", { entity: "Ann Lee", entityContext: "" });
    const global = ui.$("#entity-detail").innerHTML;
    assert.ok(global.includes(ui.run('localDateTime("2026-09-13T12:00:00Z")')));
    assert.ok(global.includes(ui.run('localDateTime("2026-09-12T14:00:00Z")')));
    assert.match(global, /Market finding from May 2026/);
    assert.match(global, /Sales finding from June 2026/);
    assert.ok(global.indexOf("Market finding from May") < global.indexOf("Sales finding from June"));
    assert.match(global, /Recorded: 2026-09-11/);
    assert.match(global, /Context refreshed:/);
    ui.click("[data-entity]", { entity: "Ann Lee", entityContext: "sales" });
    const scoped = ui.$("#entity-detail").innerHTML;
    assert.match(scoped, /Sales finding from June 2026/);
    assert.doesNotMatch(scoped, /Market finding from May 2026/);
  }
});

test("entity timeline keeps records beyond the first ten inside the shared scroll region", () => {
  const ui = explorer("en");
  ui.run(`D.names.find(n=>n.name==="Ann Lee").brief={timeline:Array.from({length:25},(_,i)=>({id:"timeline_"+i,context:"market",at:"2026-09-11T10:00:00Z",content:"Timeline entry "+i})),timelineTotal:25}`);
  ui.click("[data-entity]", { entity: "Ann Lee", entityContext: "" });
  const html = ui.$("#entity-detail").innerHTML;
  const timeline = html.match(/<div class="entity-timeline scroll-list"[^>]*>([\s\S]*?)<\/div><\/section>/)?.[0] || html.slice(html.indexOf('<div class="entity-timeline scroll-list"'));
  assert.match(timeline, /tabindex="0" role="region"/);
  assert.match(timeline, /Timeline entry 24/);
  assert.equal((timeline.match(/data-chat-memory="timeline_/g)||[]).length,25);
  assert.doesNotMatch(timeline, /More history/);
});

test("render builds the graph from files without writing brain records, and links fresh context mentions", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-os-graph-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain", "admin.md"), lib.renderFrontmatter({ company: "Example", owner: "ann", team: [], tools: [] }));
  lib.writeContext(root, "sales", { title: "Sales" });
  lib.addName(root, "Ann Lee", { aliases: ["Annie"] });
  lib.addName(root, "Acme", { kind: "company" });
  lib.appendMemory(root, "sales", { content: "Annie buys from Acme.", authors: ["ann"] });
  const paths = [...lib.readNames(root).map(n => join(root, n._path)), join(root, "brain", "contexts", "sales", "context.md"), join(root, "brain", "contexts", "sales", "memories.jsonl")];
  const before = paths.map(p => readFileSync(p, "utf8"));
  execFileSync(process.execPath, [new URL("../scripts/gtm-os-render/render.mjs", import.meta.url).pathname, root], { env: { ...process.env, CODEX_HOME: join(root, "profile") } });
  const data = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
  assert.equal(data.entityGraph.links.length, 1);
  assert.deepEqual(data.contexts[0].entityNames.map(n => n.name).sort(), ["Acme", "Ann Lee"]);
  assert.deepEqual(paths.map(p => readFileSync(p, "utf8")), before);
  // Execute the complete rendered page, so the explorer also works with the merged startup code.
  const page = readFileSync(join(root, "work", "home", "index.html"), "utf8");
  const elements = new Map();
  const node = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: "", value: "", dataset: {}, setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [], focus() {} });
    return elements.get(selector);
  };
  const ui = createContext({
    document: { getElementById: () => ({ textContent: JSON.stringify(data) }), querySelector: node, querySelectorAll: () => [], addEventListener() {}, documentElement: { removeAttribute() {}, setAttribute() {} }, activeElement: { tagName: "BODY" } },
    location: { protocol: "file:" }, setInterval() {}, setTimeout() {}, clearTimeout() {}, scrollTo() {}, Intl,URL,
  });
  runInContext([...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1], ui);
  assert.match(node("#ch-pane").innerHTML, /data-entity="Ann Lee" data-entity-context="sales"/);
  assert.match(node("#people-list").innerHTML, /data-entity="Acme"/);
  assert.match(node("#people-list").innerHTML, /class="tag" data-entity="Ann Lee" data-entity-context="sales" aria-pressed="false">#Sales<\/button>/);
  runInContext('entName="Ann Lee";entContext="sales";renderEntityDetail()', ui);
  assert.match(node("#entity-detail").innerHTML, /Annie buys from Acme/);
});
