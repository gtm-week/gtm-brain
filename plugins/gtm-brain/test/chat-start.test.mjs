// GTM Brain declares no Codex hooks. What they did now happens in the MCP server: the chat's opening lines
// come with its first GTM Brain call, the server logs its own calls, the chat id comes from the host's own
// session files, and APPROVE is a form only the person answers (approve_change).
// Run: node --test plugins/gtm-brain/test/chat-start.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const codexHome = mkdtempSync(join(tmpdir(), "gtm-brain-codex-home-"));
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: codexHome, HOME: mkdtempSync(join(tmpdir(), "gtm-brain-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1" };
delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_NO_SESSION_START; delete env.GTM_BRAIN_RUN; delete env.GTM_BRAIN_APPROVAL_TICKET; delete env.GTM_BRAIN_HOST;
const lib = await import(`${P}/lib/brain.mjs`);
const { host } = await import(`${P}/lib/host.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-chat-start-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
// A Codex thread open in that folder, as Codex writes it: sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl.
function codexThread(cwd, id) {
  const d = new Date(), dir = join(codexHome, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `rollout-2026-11-10T10-00-00-${id}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id, cwd } }) + "\n");
}
// One server per test, as one per chat; forms answers given by `answer` (null: the client shows no forms).
function client(answer) {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env });
  const pending = new Map(); let seq = 0; const forms = [];
  createInterface({ input: child.stdout }).on("line", line => {
    const m = JSON.parse(line);
    if (m.method === "elicitation/create") { forms.push(m.params); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: answer(m.params) }) + "\n"); return; }
    const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); }
  });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { parts: m.result.content.map(c => c.text), text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  after(() => child.kill());
  return { rpc, call, forms, init: () => rpc("initialize", { capabilities: answer ? { elicitation: {} } : {} }) };
}

test("the plugin declares no hooks on either host", () => {
  assert.equal(existsSync(join(P, "hooks.json")), false);
  assert.equal(JSON.parse(readFileSync(join(P, ".codex-plugin", "plugin.json"), "utf8")).hooks, undefined);
  assert.equal(JSON.parse(readFileSync(join(P, ".claude-plugin", "plugin.json"), "utf8")).hooks, undefined);
});

test("the first GTM Brain call of a chat brings the opening lines after its result, once; the chat id comes from Codex's session files", async () => {
  const root = brain(); codexThread(root, "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0001");
  const s = client(null); await s.init();
  const { result } = await s.rpc("initialize", { capabilities: {} });
  assert.match(result.instructions, /start every chat with query \(object status\)/);
  const first = await s.call("query", { brain: root, object: "status" });
  assert.ok(!first.isError, first.text);
  assert.equal(first.parts.length, 2, "the call's own result, then the opening lines");
  assert.doesNotMatch(first.parts[0], /GTM Brain chat start/);
  assert.match(first.parts[1], /^GTM Brain chat start \(once per chat; follow it\):\nbrain: /);
  assert.match(first.parts[1], /Files under \.claude belong to Claude and are off limits/);
  const second = await s.call("query", { brain: root, object: "status" });
  assert.equal(second.parts.length, 1, "not again in the same chat");
  assert.equal(lib.readSession(root).session_id, "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0001");
  const log = readFileSync(join(root, "work", "tool-usage.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(log.map(l => [l.server, l.name, l.error]), [["gtm_brain", "query", false], ["gtm_brain", "query", false]]);
});

test("a chat finds no thread when none is recent in its folder", () => {
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-other-")));
  assert.equal(host({}).currentChat(elsewhere, codexHome), null);
});

test("approve_change applies admin.md only on the person's APPROVE in the form", async () => {
  const root = brain();
  const proposed = readFileSync(join(root, "brain", "admin.md"), "utf8").replace("returns automation", "returns automation for retailers");
  const no = client(() => ({ action: "accept", content: { selection: "Not now" } })); await no.init();
  assert.match((await no.call("propose_admin_change", { brain: root, content: proposed })).text, /approve_change/);
  const declined = await no.call("approve_change", { brain: root, kind: "admin", by: "marta" });
  assert.match(declined.text, /not applied \(the person chose Not now\)/);
  assert.match(no.forms[0].message, /^Apply this change to the workplace info \(brain\/admin\.md\)\?\n\n/);
  assert.ok(no.forms[0].message.length <= 500);
  assert.doesNotMatch(readFileSync(join(root, "brain", "admin.md"), "utf8"), /for retailers/);
  assert.ok(existsSync(join(root, "work", "admin.proposed.md")), "the proposal waits");

  const yes = client(() => ({ action: "accept", content: { selection: "APPROVE" } })); await yes.init();
  const applied = await yes.call("approve_change", { brain: root, kind: "admin", by: "marta" });
  assert.ok(!applied.isError, applied.text);
  assert.match(applied.text, /applied brain\/admin\.md, approved by marta-nowak/);
  assert.match(readFileSync(join(root, "brain", "admin.md"), "utf8"), /for retailers/);
  assert.match(execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }), /^admin: change approved by marta-nowak/);
  assert.equal(existsSync(join(root, "work", "admin.proposed.md")), false);
});

test("approve_change without forms applies nothing and gives the person the terminal command", async () => {
  const root = brain();
  writeFileSync(join(root, "work", "admin.proposed.md"), readFileSync(join(root, "brain", "admin.md"), "utf8") + "\nextra line\n");
  const s = client(null); await s.init();
  const r = await s.call("approve_change", { brain: root, kind: "admin", by: "marta" });
  assert.match(r.text, /cannot show the APPROVE form\. Nothing was applied\..*approve\.mjs .* --by marta --apply/s);
  assert.doesNotMatch(readFileSync(join(root, "brain", "admin.md"), "utf8"), /extra line/);
  // The script itself refuses a model's shell: no form flag and no terminal.
  assert.throws(() => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-approve/approve.mjs`, root, "--apply", "--by", "marta"], { env, stdio: "pipe" }), e => e.status === 4);
  assert.throws(() => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-approve/approve.mjs`, root, "--apply", "--by", "marta"], { env: { ...env, GTM_BRAIN_APPROVAL: "form", GTM_BRAIN_APPROVAL_TICKET: "0".repeat(64) }, stdio: "pipe" }), e => e.status === 4, "a set flag or a made-up ticket is no APPROVE");
  assert.doesNotMatch(readFileSync(join(root, "brain", "admin.md"), "utf8"), /extra line/);
});

test("a direct edit of a memories file is put back unless it only appended", () => {
  const root = brain();
  lib.appendMemory(root, "icp", { authors: ["marta-nowak"], content: "Retailers with 500+ returns a month." });
  lib.commit(root, ["brain/contexts/icp/memories.jsonl"], "test: a note", { push: false });
  const file = join(root, "brain", "contexts", "icp", "memories.jsonl"), committed = readFileSync(file, "utf8");
  writeFileSync(file, committed + committed.split("\n")[0].replace(/m_[0-9a-f]{12}/, "m_aaaaaaaaaaaa") + "\n");
  assert.deepEqual(lib.guardProtected(root), [], "appending is how notes are written");
  writeFileSync(file, "{}\n");
  const back = lib.guardProtected(root);
  assert.deepEqual(back.map(r => r.path), ["brain/contexts/icp/memories.jsonl"]);
  assert.equal(readFileSync(file, "utf8"), committed);
});
