process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// A proposed change to the workplace info is read by the person who owns the business, not by an
// engineer: the card says which part changes, what it says now and what it would say. The exact
// diff stays behind a toggle, because APPROVE writes the file.
// Run: node --test 'plugins/gtm-brain/test/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
const lib = await import("../lib/brain.mjs");

const template = readFileSync(new URL("../scripts/gtm-brain-render/home.template.html", import.meta.url), "utf8");
function page() {
  const source = template;
  const context = createContext({ D: { contexts: [] }, Intl });
  // the helpers, then the change-list block further down the page
  runInContext(source.slice(source.indexOf("const esc=s=>"), source.indexOf("const LIVE=")), context);
  runInContext(source.slice(source.indexOf("const diffHtml="), source.indexOf("/* what is not saved yet")), context);
  return (expression, extra = {}) => { Object.assign(context, extra); return runInContext(expression, context); };
}
const ADMIN = `---
company: Reflow
owner: marta-nowak
team:
  - { name: "Marta Nowak", email: "marta@reflow.io", handle: marta-nowak }
tools: []
---

# Reflow

**What we sell, to whom.** returns automation

**Team.** Marta Nowak (marta-nowak, owner, marta@reflow.io)
`;

test("the proposal card names the part that changes and what it would say, not a diff", () => {
  const proposed = ADMIN.replace("returns automation", "returns automation for UK retailers")
    .replace("tools: []", "tools: [attio, gmail]")
    .replace('  - { name: "Marta Nowak", email: "marta@reflow.io", handle: marta-nowak }',
      '  - { name: "Marta Nowak", email: "marta@reflow.io", handle: marta-nowak }\n  - { name: "Jan Kowalski", email: "jan@reflow.io", handle: jan-kowalski }');
  const run = page();
  // the page's own function, run in its own realm; plain data comes back for comparing
  const groups = JSON.parse(JSON.stringify(run("chgGroups(DIFF)", { DIFF: lib.lineDiff(ADMIN, proposed) })));
  const byLabel = Object.fromEntries(groups.map(g => [g.label, g]));
  assert.deepEqual(Object.keys(byLabel).sort(), ["Team", "Tools", "What we sell, to whom"]);
  assert.deepEqual(byLabel["What we sell, to whom"].removed, ["returns automation"]);
  assert.deepEqual(byLabel["What we sell, to whom"].added, ["returns automation for UK retailers"]);
  assert.deepEqual(byLabel.Team.added, ["Jan Kowalski <jan@reflow.io>"], "a teammate reads as a name and an address");
  assert.deepEqual(byLabel.Tools.added, ["attio, gmail"], "a list reads as its words");
  assert.deepEqual(byLabel.Tools.removed, [], "an empty list is nothing to say");
  assert.equal(groups.filter(g => g.label === "Tools").length, 1, "one heading, one group");
  // nothing of the file's own shape reaches the card
  const html = run("changeHtml(DIFF)");
  const shown = html.slice(0, html.indexOf('<div class="exact">'));
  for (const noise of ["---", "company:", "created:", "handle:", "+ ", "- **"]) assert.ok(!shown.includes(noise), `the card still shows ${noise}`);
  assert.ok(html.includes('data-exact') && html.includes('class="diff"'), "the exact change is still one click away");
});

test("a change to one sentence says was and becomes", () => {
  const proposed = ADMIN.replace("returns automation", "returns automation for UK retailers");
  const diff = lib.lineDiff(ADMIN, proposed);
  const en = page()("changeHtml(DIFF)", { DIFF: diff });
  assert.match(en, /was<\/span><span>returns automation</);
  assert.match(en, /becomes<\/span><span>returns automation for UK retailers</);
  assert.match(en, /show the exact change/);
});

test("proposals remain inspectable without approval or answer controls", () => {
  assert.doesNotMatch(template, /data-say=|<form|sayBtn|fetch\("\/act/);
  assert.match(template, /data-exact/);
  assert.match(template, /id="chat-instruction"/);
});
