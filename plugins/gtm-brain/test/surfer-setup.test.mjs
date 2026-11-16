// gtmb-surfer-setup (0.35.0): Surfer hosted MCP added on a yes, one brief from the brain on a yes, articles on a second yes, never published
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
const P = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const R = resolve(P, "../..");
const file = join(P, "skills/gtmb-surfer-setup/SKILL.md");
const skill = readFileSync(file, "utf8");

test("the skill follows the shipped-skill template: name, links, openai.yaml, catalog and docs", () => {
  assert.match(skill, /^---\nname: gtmb-surfer-setup\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.ok(existsSync(join(P, "skills/gtmb-surfer-setup/agents/openai.yaml")));
  const catalog = JSON.parse(readFileSync(join(P, "scripts/gtm-brain-render/skill-catalog.json"), "utf8"));
  const i = catalog.findIndex(s => s.id === "gtmb-surfer-setup");
  assert.ok(i > 0 && catalog[i].group === "setup" && catalog[i].featured === false);
  for (const doc of ["README.md", "docs/COMMANDS.md", "docs/ONBOARDING.md"]) assert.match(readFileSync(join(R, doc), "utf8"), /gtmb-surfer-setup/, doc);
});

test("the hosted MCP is added on a yes and the sign-in stays the person's", () => {
  assert.match(skill, /codex mcp add surfer --url https:\/\/mcp\.surferseo\.com\/mcp/);
  assert.match(skill, /Never run the login yourself/);
  assert.match(skill, /Never ask for a Surfer API\s+key/);
});

test("topics come from the brain, credits only on a second yes, nothing published", () => {
  assert.match(skill, /slug `market`/);
  assert.match(skill, /Never invent a statistic, a customer or a quote/);
  assert.match(skill, /## 4\. Brief on a yes, write on a second yes, never publish/);
  assert.match(skill, /Never publishes or schedules content/);
  // the brief counts against the plan's documents: its own yes names that, and the topic choice is not that yes
  assert.match(skill, /Picking a topic is not a yes to create anything/);
  assert.match(skill, /uses one of your plan's Content Editor documents\." with Yes, create the brief and No, not now/);
  assert.match(skill, /A\s+yes covers one brief\./);
  assert.match(skill, /never creates a brief\s+or an article without a yes for it/);
});

test("Surfer ends up in the brain tools: mark_tool, a note naming it, then check_tools", () => {
  assert.match(skill, /call `mark_tool` with tool `Surfer`, status `ok`/);
  assert.match(skill, /tools: \["Surfer"\]/);
  assert.match(skill, /Then call `check_tools`\./);
});
