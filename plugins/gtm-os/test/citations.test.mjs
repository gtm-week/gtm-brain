process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Compile writes memory IDs into the summary and the Next guidance. The dashboard turns each one
// into a pill carrying the note's date and author, so a person never reads raw hex.
// Run: node --test 'plugins/gtm-os/test/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const template = readFileSync(new URL("../scripts/gtm-os-render/home.template.html", import.meta.url), "utf8");
const note = (id, at, authors, content) => ({ id, at, authors, content, kind: "note", people: [], tools: [], actions: [], source: [] });
const contexts = [{
  slug: "market", title: "Market", memories: [
    note("m_af1e44039cd2", "2026-09-04T09:30:00Z", ["marta"], 'The pricing page lists "from $49" <script>'),
    note("m_4ea2efe3960b", "2026-08-28T14:00:00Z", ["codex"], "Site copy targets mid-market ops teams."),
  ],
}];

function helpers() {
  const source = template;
  const context = createContext({ D: { contexts }, Intl });
  runInContext(source.slice(source.indexOf("const esc=s=>"), source.indexOf("const LIVE=")), context);
  return expression => runInContext(expression, context);
}

test("a citation group becomes one pill per note, dated and attributed, with no raw ID left", () => {
  const run = helpers();
  const html = run('cite("Keep pricing labeled as a hypothesis (m_af1e44039cd2, m_4ea2efe3960b). Ask two customers.")');
  assert.equal((html.match(/class="cite"/g) || []).length, 2);
  assert.match(html, /data-mem="m_af1e44039cd2"/);
  assert.match(html, />Recorded: 04 Sep<span aria-hidden="true"> · <\/span><span>marta<\/span>/);
  assert.match(html, />Recorded: 28 Aug<span aria-hidden="true"> · <\/span><span>codex<\/span>/);
  assert.doesNotMatch(html, /m_af1e44039cd2</, "the hex ID is never the pill's label");
  assert.match(html, /hypothesis\.<span class="cites">/, "the sentence keeps its full stop, in front of the pills");
  assert.match(html, /<\/span> Ask two customers\.$/);
});

test("the pill carries the note itself, escaped, as its hover text", () => {
  const html = helpers()('cite("Dated claim (m_af1e44039cd2).")');
  assert.match(html, /title="View note in dashboard · marta · Recorded: 2026-09-04 [^·]+ · Market&#10;The pricing page lists &quot;from \$49&quot; &lt;script&gt;"/);
});

test("an ID the dashboard cannot resolve stays visible but is not offered as a link", () => {
  const html = helpers()('cite("Check whether this still stands (m_deadbeef0000).")');
  assert.match(html, /class="cite gone"/);
  assert.doesNotMatch(html, /data-mem/);
  assert.match(html, />deadbe</, "a short prefix, so the note can still be named in the chat");
  assert.match(html, /title="m_deadbeef0000: withdrawn, or not in this dashboard"/);
});

test("an ID written into the sentence itself is pilled in place, keeping the words around it", () => {
  const html = helpers()('cite("Re-read m_4ea2efe3960b if the number is older than a month.")');
  assert.match(html, /^Re-read <button class="cite" data-mem="m_4ea2efe3960b"/);
  assert.match(html, /<\/button> if the number is older than a month\.$/);
  assert.doesNotMatch(html, /class="cites"/, "no group wrapper: the pill sits in the prose");
});

test("compiled guidance keeps its paragraphs and its citations", () => {
  const html = helpers()('prose("Durable guidance (m_af1e44039cd2).\\n\\nImmediate next step.")');
  assert.equal((html.match(/<p>/g) || []).length, 2);
  assert.match(html, /<p>Durable guidance\.<span class="cites">/);
  assert.match(html, /<p>Immediate next step\.<\/p>/);
  assert.equal(helpers()('prose("   ")'), "", "nothing to say renders nothing");
});

