process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// The PreToolUse gate: apply_patch on a protected file is denied; shell reads pass, shell writes are denied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const gate = new URL("../hooks/gate-protected-write.sh", import.meta.url).pathname;
// The gate guards a brain: the folder needs brain/admin.md, as setup writes it.
const cwd = mkdtempSync(join(tmpdir(), "gtm-os-gate-"));
mkdirSync(join(cwd, "brain")); writeFileSync(join(cwd, "brain", "admin.md"), "---\ncompany: Gate Test\n---\n");
const runIn = dir => (tool, field, text) => spawnSync("bash", [gate], { input: JSON.stringify({ tool_name: tool, cwd: dir, tool_input: { [field]: text } }), cwd: dir, encoding: "utf8" });
const run = runIn(cwd);
const denied = r => r.status === 2 && r.stdout.includes('"permissionDecision":"deny"');

test('sed long in-place options are denied for protected files', () => {
  for (const option of ['--in-place', '--in-place=.bak']) {
    for (const parts of [['brain','admin.md'], ['brain','ontology.ossie.json'], ['brain','contexts','sales','memories.jsonl']]) {
      assert.ok(denied(run('exec_command', 'cmd', `sed ${option} 's/old/new/' ${parts.join('/')}`)));
    }
  }
  assert.equal(run('exec_command', 'cmd', "sed -n '1p' " + ['brain','admin.md'].join('/')).status, 0);
});

test("entity files are editable while plugin patches may document protected paths", () => {
  const entity = ["brain", "entities", "chris.md"].join("/");
  assert.equal(run("apply_patch", "input", `*** Update File: ${entity}`).status, 0);
  assert.equal(run("exec_command", "cmd", `echo changed > ${entity}`).status, 0);
  assert.equal(run("exec_command", "cmd", `cat ${entity}`).status, 0);
  const protectedPath = ["brain", "entities.md"].join("/");
  assert.equal(run("apply_patch", "input", `*** Update File: plugins/gtm-os/lib/brain.mjs\n+const legacy = "${protectedPath}";`).status, 0);
  assert.equal(run("apply_patch", "input", `*** Update File: notes.md\n*** Move to: ${entity}`).status, 0);
  for (const file of ["brain/names.md", "brain/entities.md"]) assert.equal(run("apply_patch", "input", `*** Update File: ${file}`).status, 0);
  assert.equal(run("exec_command", "cmd", "sed -i s/a/b/ brain/names.md").status, 0);
});

test("apply_patch touching a protected file is denied, another file passes", () => {
  for (const f of ["brain/admin.md", "brain/contexts/pipeline/memories.jsonl"]) assert.ok(denied(run("apply_patch", "input", `*** Update File: ${f}`)), f);
  assert.equal(run("apply_patch", "input", "*** Update File: brain/contexts/pipeline/context.md").status, 0);
});

test("shell commands: reads of protected files pass, writes are denied, skill scripts pass", () => {
  for (const c of ["cat brain/admin.md", "git diff brain/admin.md", "grep Pierre brain/contexts/pipeline/memories.jsonl", "node /p/scripts/gtm-os-remember/remember.mjs . --by marta --content hi"]) assert.equal(run("exec_command", "cmd", c).status, 0, c);
  for (const c of ["echo x >> brain/contexts/pipeline/memories.jsonl", "printf y > brain/admin.md", "rm brain/contexts/gtm/memories.jsonl", "cp x brain/admin.md", "tee brain/admin.md < x"]) assert.ok(denied(run("shell_command", "command", c)), c);
});

test(".claude is off limits both ways; the export channel and the headless run pass", () => {
  for (const c of ["cat ~/.claude/CLAUDE.md", "ls -la /Users/x/.claude/projects", "cp -R skill ~/.claude/skills/", "grep company ~/.claude/projects/p/memory/MEMORY.md"]) assert.ok(denied(run("shell_command", "command", c)), c);
  assert.ok(denied(run("apply_patch", "input", "*** Update File: /Users/x/.claude/settings.json")), "apply_patch into .claude");
  for (const c of ['claude -p "Read /p/claude/gtm-os-export/SKILL.md and follow it now"', "cat ~/.gtm-os/claude-export.md", "cat ~/.gtm-os/handoff.md", "rm ~/.gtm-os/handoff.md", "command -v claude"]) assert.equal(run("shell_command", "command", c).status, 0, c);
});

test("a repo that is not a brain and not linked to one passes untouched, .claude reads included (Maksymilian, 2026-10-01)", () => {
  // A GTM OS install must not stop work in someone's code repo: no denials and no log written there.
  const repo = mkdtempSync(join(tmpdir(), "gtm-os-gate-repo-")); mkdirSync(join(repo, ".git"));
  const other = runIn(repo);
  for (const c of ["cat .claude/settings.json", "ls ~/.claude/skills", "printf y > brain/admin.md", "echo x >> brain/contexts/a/memories.jsonl"]) {
    const r = other("exec_command", "cmd", c); assert.equal(r.status, 0, c); assert.equal(r.stdout, "", c);
  }
  assert.equal(other("apply_patch", "input", "*** Update File: .claude/settings.json").status, 0);
});

test("a code repo linked to the brain keeps its own .claude and brain/; the brain's files stay protected by path (Maksymilian, 2026-10-01)", () => {
  const repo = mkdtempSync(join(tmpdir(), "gtm-os-gate-linked-")); mkdirSync(join(repo, ".git"));
  writeFileSync(join(repo, "AGENTS.md"), `# repo\n\n<!-- gtm-os project -->\nGTM OS project: app\nGTM OS brain: ${cwd}\n<!-- /gtm-os project -->\n`);
  const linked = runIn(repo);
  for (const c of ["cat .claude/settings.json", "printf x > .claude/settings.json", "printf y > brain/admin.md", "echo x >> src/brain/contexts/a/memories.jsonl"]) {
    const r = linked("exec_command", "cmd", c); assert.equal(r.status, 0, c); assert.equal(r.stdout, "", c);
  }
  assert.equal(linked("apply_patch", "input", "*** Update File: .claude/settings.json").status, 0);
  assert.equal(linked("apply_patch", "input", "*** Update File: brain/admin.md").status, 0);
  for (const c of [`printf y > ${cwd}/brain/admin.md`, `echo x >> ${cwd}/brain/contexts/a/memories.jsonl`, `rm ${cwd}/brain/ontology.ossie.json`, `printf y > ../${cwd.split("/").pop()}/brain/admin.md`, `printf y > /private${cwd}/brain/admin.md`]) assert.ok(denied(linked("exec_command", "cmd", c)), c);
  assert.ok(denied(linked("apply_patch", "input", `*** Update File: ${cwd}/brain/admin.md`)));
  assert.equal(linked("exec_command", "cmd", `cat ${cwd}/brain/admin.md`).status, 0);
  // a folder inside the brain is the brain's own: everything stays protected there
  const inner = join(cwd, "inner"); mkdirSync(inner, { recursive: true });
  writeFileSync(join(inner, "AGENTS.md"), `<!-- gtm-os project -->\nGTM OS project: inner\nGTM OS brain: ${cwd}\n<!-- /gtm-os project -->\n`);
  assert.ok(denied(runIn(inner)("exec_command", "cmd", "printf y > ../brain/admin.md")));
  assert.ok(denied(runIn(inner)("exec_command", "cmd", "cat .claude/settings.json")));
});

test(".claude-plugin and CLAUDE.md are not .claude", () => {
  for (const c of ["cat plugins/x/.claude-plugin/plugin.json", "cat CLAUDE.md"]) assert.equal(run("exec_command", "cmd", c).status, 0, c);
  assert.ok(denied(run("exec_command", "cmd", "cat ~/.claude.json")));
});
