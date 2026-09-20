process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// The PreToolUse gate: apply_patch on a protected file is denied; shell reads pass, shell writes are denied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const gate = new URL("../hooks/gate-protected-write.sh", import.meta.url).pathname;
const cwd = mkdtempSync(join(tmpdir(), "gtm-os-gate-"));
const run = (tool, field, text) => spawnSync("bash", [gate], { input: JSON.stringify({ tool_name: tool, cwd, tool_input: { [field]: text } }), cwd, encoding: "utf8" });
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
