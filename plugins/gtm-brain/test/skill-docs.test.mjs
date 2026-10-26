// The skill documents themselves: what the model reads. A script test catches a broken script;
// nothing else catches a SKILL.md that names a reference, a script or a flag that no longer exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const skillDirs = readdirSync(join(P, "skills")).filter(id => existsSync(join(P, "skills", id, "SKILL.md"))).sort();
const docs = skillDirs.flatMap(id => {
  const refs = join(P, "skills", id, "references");
  return [join(P, "skills", id, "SKILL.md"), ...(existsSync(refs) ? readdirSync(refs).filter(f => f.endsWith(".md")).map(f => join(refs, f)) : [])];
});
const rel = file => file.slice(P.length + 1);
const frontmatter = text => { const m = text.match(/^---\n([\s\S]*?)\n---\n/); return m ? m[1] : null; };

test("the skill folders each hold a SKILL.md, with references beside it", () => {
  assert.ok(skillDirs.length >= 9, `skills: ${skillDirs.join(", ")}`);
  assert.ok(docs.length > skillDirs.length, "at least one skill has references");
});

test("every SKILL.md names its folder in the frontmatter and describes itself", () => {
  for (const id of skillDirs) {
    const fm = frontmatter(readFileSync(join(P, "skills", id, "SKILL.md"), "utf8"));
    assert.ok(fm, `${id}/SKILL.md starts with frontmatter`);
    assert.match(fm, new RegExp(`^name: ${id}$`, "m"), `${id}/SKILL.md name matches its folder`);
    const description = fm.match(/^description: *(\|?)\s*\n?([\s\S]*?)(?=\n\S|$)/m);
    assert.ok(description && description[2].trim().length > 20, `${id}/SKILL.md has a description`);
  }
});

test("every relative Markdown link in a skill document resolves to a file", () => {
  const broken = [];
  for (const file of docs) {
    for (const [, target] of readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target))) broken.push(`${rel(file)} -> ${target}`);
    }
  }
  assert.deepEqual(broken, [], "links that point at nothing");
});

test("every script a skill document tells the model to run exists in the plugin", () => {
  const missing = [];
  for (const file of docs) {
    for (const [, path] of readFileSync(file, "utf8").matchAll(/(?:\$\{?PLUGIN_ROOT\}?|plugins\/gtm-brain)\/([A-Za-z0-9_./-]+\.(?:mjs|sh))/g)) {
      const full = join(P, path);
      if (!existsSync(full) || !statSync(full).isFile()) missing.push(`${rel(file)} -> ${path}`);
    }
  }
  assert.deepEqual(missing, [], "scripts named in a document that are not on disk");
});

test("every flag a skill document passes to a script is one the script reads", () => {
  // `node "$PLUGIN_ROOT/<script>" <brain> --flag value --other`: the script's source names each flag
  const unknown = [];
  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    for (const [, path, args] of text.matchAll(/node "?\$\{?PLUGIN_ROOT\}?\/([A-Za-z0-9_./-]+\.mjs)"?([^\n`]*)/g)) {
      const script = join(P, path); if (!existsSync(script)) continue;
      const source = readFileSync(script, "utf8");
      for (const [, flag] of args.matchAll(/(--[a-z][a-z0-9-]*)/g)) if (!source.includes(flag)) unknown.push(`${rel(file)} passes ${flag} to ${path}`);
    }
  }
  assert.deepEqual(unknown, [], "flags the script does not read");
});

test("skill documents use plain hyphens, no long dashes", () => {
  const offenders = [];
  for (const file of docs) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => { if (/[\u2013\u2014\u2015\u2212]/.test(line)) offenders.push(`${rel(file)}:${i + 1}`); });
  }
  assert.deepEqual(offenders, [], "lines with a long dash");
});

test("a slash command named in a skill document is a shipped skill or a documented example", () => {
  // the shipped set, plus the examples gtm-brain-skill uses to show what a person's own skill looks like
  const examples = new Set(["gtm-brain-x"]);
  const unknown = [];
  for (const file of docs) {
    for (const [, name] of readFileSync(file, "utf8").matchAll(/(?<![\w/])\/(gtm-brain-[a-z0-9<>-]+)/g)) {
      if (skillDirs.includes(name) || examples.has(name) || name.includes("<")) continue;
      unknown.push(`${rel(file)} names /${name}`);
    }
  }
  assert.deepEqual([...new Set(unknown)], [], "slash commands that are not shipped skills");
});

test("the live skill cases name a shipped skill, open with its slash command and carry every check the harness reads", async () => {
  // test/live/skill-cases.mjs runs only through tool-routing.mjs, by hand; this keeps its shape honest in the suite
  const { skillCases } = await import("./live/skill-cases.mjs");
  assert.ok(skillCases.length >= 5, "five cases to start with");
  assert.equal(new Set(skillCases.map(c => c.name)).size, skillCases.length, "unique names");
  for (const c of skillCases) {
    assert.match(c.name, /^skill-/, `${c.name} is selected by the skills group`);
    assert.ok(skillDirs.includes(c.workflow), `${c.name} points at a shipped skill: ${c.workflow}`);
    assert.ok(c.prompt.startsWith(`/${c.workflow} `), `${c.name} opens with /${c.workflow}`);
    assert.ok(c.expect && c.expect.length > 40, `${c.name} says what the judge should expect`);
    for (const fn of ["calls", "verify", "responseCheck"]) assert.equal(typeof c[fn], "function", `${c.name}.${fn}`);
    assert.doesNotMatch(c.prompt + c.expect, /[–—―−]/, `${c.name} uses plain hyphens`);
  }
});
