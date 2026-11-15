// gtm-brain-heyreach-setup (0.35.0): the person adds HeyReach's Connection URL (a secret) themselves; reads and drafts only, never acts in HeyReach
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
const P = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const R = resolve(P, "../..");
const file = join(P, "skills/gtm-brain-heyreach-setup/SKILL.md");
const skill = readFileSync(file, "utf8");

test("the skill follows the shipped-skill template: name, links, openai.yaml, catalog and docs", () => {
  assert.match(skill, /^---\nname: gtm-brain-heyreach-setup\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.ok(existsSync(join(P, "skills/gtm-brain-heyreach-setup/agents/openai.yaml")));
  const catalog = JSON.parse(readFileSync(join(P, "scripts/gtm-brain-render/skill-catalog.json"), "utf8"));
  const i = catalog.findIndex(s => s.id === "gtm-brain-heyreach-setup");
  assert.ok(i > 0 && catalog[i].group === "setup" && catalog[i].featured === false);
  for (const doc of ["README.md", "COMMANDS.md", "ONBOARDING.md"]) assert.match(readFileSync(join(R, doc), "utf8"), /gtm-brain-heyreach-setup/, doc);
});

test("the Connection URL is a secret the person adds in a terminal, never through the chat", () => {
  assert.match(skill, /codex mcp add heyreach --url <the Connection URL>/);
  assert.match(skill, /never pastes it in\s+the chat/);
  assert.match(skill, /do not use it, repeat it or\s+write it anywhere: tell them to regenerate the key/);
});

test("reads and drafts only: no sends, no leads, no campaign changes", () => {
  assert.match(skill, /use\s+only the ones that read/);
  assert.match(skill, /The drafts stay in the chat/);
  assert.match(skill, /never adds, imports or removes leads,\s+never creates, starts, resumes or pauses a campaign/);
});

test("HeyReach ends up in the brain tools: mark_tool, a note naming it, then check_tools", () => {
  assert.match(skill, /call `mark_tool` with tool `HeyReach`, status `ok`/);
  assert.match(skill, /tools: \["HeyReach"\]/);
  assert.match(skill, /Then call\s+`check_tools`\./);
});
