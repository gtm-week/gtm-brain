// The stub tool server the demo loops run against (test/live/stub-gtm-tools.mjs): a stdio MCP server with
// test doubles of a company search and enrichment tool, a buying signals tool and an SEO tool. Fixed data,
// every call logged, failure cases behind --fail.
// Run: node --test plugins/gtm-brain/test/stub-gtm-tools.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = fileURLToPath(new URL("./live/stub-gtm-tools.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gtm-stub-tools-"));
after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

// one server per case: send the requests, collect the answers by id, close stdin
async function session(args, requests) {
  const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ["pipe", "pipe", "pipe"] });
  const answers = new Map(); let err = "";
  child.stderr.on("data", d => { err += d; });
  const lines = createInterface({ input: child.stdout });
  const done = new Promise(res => lines.on("line", l => { const m = JSON.parse(l); answers.set(m.id, m); if (answers.size === requests.length) res(); }));
  requests.forEach((r, i) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i + 1, ...r }) + "\n"));
  await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer: ${err}`)), 10000))]);
  child.stdin.end(); await new Promise(res => child.on("close", res));
  return requests.map((_, i) => answers.get(i + 1));
}
const call = (name, args = {}) => ({ method: "tools/call", params: { name, arguments: args } });
const body = r => JSON.parse(r.result.content[0].text);
const ICP = { industries: ["outdoor equipment", "home goods"], countries: ["Germany", "Austria", "Poland"], stores_min: 20, stores_max: 200, exclude_industries: ["pharmacy"] };

test("stub tools: listed as read-only test doubles with neutral names", async () => {
  const [init, list] = await session(["--log", join(dir, "list.jsonl")], [{ method: "initialize", params: { protocolVersion: "2025-06-18" } }, { method: "tools/list" }]);
  assert.match(init.result.instructions, /test double/i);
  const tools = list.result.tools;
  assert.deepEqual(tools.map(t => t.name).sort(), ["buying_signals", "company_enrich", "company_search", "content_score", "keyword_research"]);
  for (const t of tools) {
    assert.match(t.description, /test double/i, t.name);
    assert.doesNotMatch(t.name + t.description, /clay|zynt|surfer/i, `${t.name}: neutral, no vendor name`);
    assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.openWorldHint, false);
    assert.doesNotMatch(t.description, /[\u2013\u2014]/);
  }
});

test("stub tools: the search follows the criteria, the rest fits the seeded brain, every call is logged", async () => {
  const log = join(dir, "calls.jsonl");
  const [search, wide, enrich, signals, keywords, unknown] = await session(["--log", log], [
    call("company_search", ICP), call("company_search", { countries: ["Germany", "Austria", "Poland"] }),
    call("company_enrich", { company: "Fernbrook Outdoor" }), call("buying_signals", { companies: ["Fernbrook Outdoor", "heron-home.example", "Nobody Ltd"] }),
    call("keyword_research", { seeds: ["store pickup returns", "returns cost"] }), call("no_such_tool")]);
  const names = body(search).companies.map(c => c.name);
  assert.ok(names.includes("Fernbrook Outdoor") && names.includes("Heron Home"), names.join(", "));
  assert.ok(!names.includes("Umber Pharma"), "a pharmacy chain is excluded");
  assert.ok(!names.includes("Kestrel Sports"), "9 stores is under the minimum");
  assert.ok(body(wide).companies.some(c => c.name === "Umber Pharma"), "without the exclusion the pharmacy chain is found: the filter is real");
  for (const c of body(search).companies) assert.match(c.source.ref, /^companies\//);
  const e = body(enrich).company;
  assert.equal(e.stores, 85); assert.equal(e.contacts[0].name, "Lea Hoffmann"); assert.equal(e.contacts[0].email, "lea.hoffmann@fernbrook-outdoor.example");
  const s = body(signals).companies;
  assert.equal(s.find(c => c.company === "Fernbrook Outdoor").ready, "now");
  assert.match(JSON.stringify(s.find(c => c.company === "Fernbrook Outdoor").signals), /Head of Returns/);
  assert.equal(s.find(c => c.company === "Heron Home").ready, "later");
  assert.equal(s.find(c => c.company === "Nobody Ltd").found, false);
  const k = body(keywords).keywords.map(x => x.keyword);
  assert.ok(k.includes("store pickup returns") && k.includes("cost of processing returns"), k.join(", "));
  assert.equal(unknown.result.isError, true);
  const logged = readFileSync(log, "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(logged.map(l => l.tool), ["company_search", "company_search", "company_enrich", "buying_signals", "keyword_research", "no_such_tool"]);
  assert.deepEqual(logged[0].arguments, ICP);
  assert.deepEqual(logged[0].result, body(search), "what came back is in the log");
});

test("stub tools: the content score is computed from the draft", async () => {
  const para = "Store pickup returns are online orders brought back to a store. ";
  const good = { keyword: "store pickup returns", title: "Store pickup returns: a guide for retailers", description: "How retailers process store pickup returns without a backlog.", content: `# Store pickup returns without the backlog\n\n${para}\n\n## Why\n\n${"Staff process each in-store return by hand and the return rate per store stays unknown. ".repeat(40)}` };
  const [a, b] = await session(["--log", join(dir, "score.jsonl")], [call("content_score", good), call("content_score", { ...good, title: "A guide for retailers who want fewer tickets after the peak season", content: `${good.content}\n\n# Second H1!` })]);
  const ok = body(a), bad = body(b);
  assert.ok(ok.score >= 80, JSON.stringify(ok));
  assert.ok(bad.score < ok.score);
  const failed = bad.checks.filter(c => !c.pass).map(c => c.check);
  for (const c of ["keyword in title", "title length", "one H1", "no exclamation marks"]) assert.ok(failed.includes(c), `${c} flagged: ${failed}`);
});

test("stub tools: --fail gives an expired key, an empty result or a rate limit, for one tool or all", async () => {
  const log = join(dir, "fail.jsonl");
  const [expired] = await session(["--log", log, "--fail", "expired_key"], [call("company_enrich", { company: "Fernbrook Outdoor" })]);
  assert.equal(expired.result.isError, true); assert.match(body(expired).error, /expired/i);
  const [empty, emptyEnrich] = await session(["--log", log, "--fail", "empty"], [call("keyword_research", { seeds: ["store pickup returns"] }), call("company_enrich", { company: "Fernbrook Outdoor" })]);
  assert.ok(!empty.result.isError); assert.deepEqual(body(empty).keywords, []);
  assert.equal(body(emptyEnrich).found, false);
  const [limited, other] = await session(["--log", log, "--fail", "rate_limit", "--fail-tool", "buying_signals"], [call("buying_signals", { companies: ["Fernbrook Outdoor"] }), call("company_enrich", { company: "Fernbrook Outdoor" })]);
  assert.equal(limited.result.isError, true); assert.match(body(limited).error, /rate limit/i);
  assert.ok(!other.result.isError, "--fail-tool limits the failure to that tool");
  const logged = readFileSync(log, "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(logged.map(l => l.fail || null), ["expired_key", "empty", "empty", "rate_limit", null]);
  const bad = spawn(process.execPath, [SCRIPT, "--fail", "teapot"], { stdio: "ignore" });
  assert.equal(await new Promise(res => bad.on("close", res)), 2, "an unknown failure mode is refused");
});
