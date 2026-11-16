// Owner-only approvals through the MCP server (layout 3, lib/owner.mjs): a teammate's approve_change keeps the
// change for the owner and shows no form; the owner's approve_change kind proposal shows the change with APPROVE,
// Decline or Not now, and only APPROVE applies it; query object approvals lists what was recorded.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import * as lib from "../lib/brain.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-owner-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-owner-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) delete env[k];
const roots = [];
after(() => { for (const r of [...roots, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-owner-"))); roots.push(root);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const as = (root, handle) => writeFileSync(join(lib.workDir(root), "person.json"), JSON.stringify({ handle }) + "\n");
function client(answer) {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env });
  const pending = new Map(); let seq = 0; const forms = [];
  createInterface({ input: child.stdout }).on("line", line => {
    const m = JSON.parse(line);
    if (m.method === "elicitation/create") { forms.push(m.params); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: answer(m.params) }) + "\n"); return; }
    const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); }
  });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  after(() => child.kill());
  return { call, forms, init: () => rpc("initialize", { capabilities: answer ? { elicitation: {} } : {} }) };
}

test("a teammate's settings change waits for the owner with no form; the owner's APPROVE applies it, Not now leaves it, and the approval is listed", async () => {
  const root = brain(), settings = join(root, lib.settingsFile(root)), before = readFileSync(settings, "utf8");
  as(root, "tomek-zielinski");
  const teammate = client(() => ({ action: "accept", content: { selection: "APPROVE" } })); await teammate.init();
  await teammate.call("propose_admin_change", { brain: root, content: before.replace("returns automation", "returns automation for retailers") });
  const kept = await teammate.call("approve_change", { brain: root, kind: "admin", by: "tomek-zielinski" });
  assert.match(kept.text, /^NOT APPLIED: configuration\/settings\.yaml is the owner's to change \(Marta Nowak\)\. Kept as proposal (p_[0-9a-f]{10})/);
  assert.equal(teammate.forms.length, 0, "no form for a teammate: nothing is applied");
  assert.equal(readFileSync(settings, "utf8"), before);
  const id = kept.text.match(/proposal (p_[0-9a-f]{10})/)[1];
  // the teammate cannot decide on it either
  const refused = await teammate.call("approve_change", { brain: root, kind: "proposal", id, by: "tomek-zielinski" });
  assert.match(refused.text, /only the owner \(marta-nowak\) decides/);
  assert.equal(teammate.forms.length, 0);

  as(root, "marta-nowak");
  const later = client(() => ({ action: "accept", content: { selection: "Not now" } })); await later.init();
  assert.match((await later.call("approve_change", { brain: root, kind: "proposal", id, by: "marta-nowak" })).text, new RegExp(`not applied \\(the owner chose Not now\\); proposal ${id} stays waiting`));
  assert.match(later.forms[0].message, /^Apply this teammate's proposal\?\n\nProposal p_[0-9a-f]{10} from tomek-zielinski/);
  assert.ok(later.forms[0].message.length <= 500);
  assert.equal(readFileSync(settings, "utf8"), before);

  const yes = client(() => ({ action: "accept", content: { selection: "APPROVE" } })); await yes.init();
  const applied = await yes.call("approve_change", { brain: root, kind: "proposal", id, by: "marta-nowak" });
  assert.ok(!applied.isError, applied.text);
  assert.match(applied.text, new RegExp(`applied proposal ${id} \\(configuration/settings\\.yaml\\), asked by tomek-zielinski, approved by marta-nowak`));
  assert.match(readFileSync(settings, "utf8"), /for retailers/);
  assert.ok(!existsSync(join(root, "brain", "proposals", id)));
  const listed = await yes.call("query", { brain: root, object: "approvals" });
  assert.match(listed.text, /approvals recorded: 1\n- [^\n]*Approved a change to configuration\/settings\.yaml[^\n]*Asked by Tomek Zielinski, approved by Marta Nowak, commit [0-9a-f]+\./);
  assert.match(listed.text, /proposals waiting for the owner \(Marta Nowak\): 0/);
});
