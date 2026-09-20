import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { page } from './helpers/dashboard-page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const retired = /\bchannels?\b|\bkanal\b|kanał|kanale/i;
// The only places the retired word may appear: the rule that retires it, and the two rules that
// tell the model what to do when older brain data still says it (ALL-212).
const exceptions = [
  'Use "context" for shared knowledge about a topic. Reserve "channel"\nfor actual connector concepts, such as Slack channels; preserve source quotes and custom titles.',
  'Use "context" (Polish: "kontekst") for shared knowledge about a topic. Reserve "channel"\nfor actual connector concepts, such as Slack channels; preserve source quotes and custom titles.',
  'An older summary, rule or note that says "channel" means a context: say "context" to the\nperson, never "we are in the offer channel", and let the next compile rewrite that summary.',
  'Write "context", never "channel", even where the previous\nsummary, the guidance or the notes say channel; a Slack channel named in a source keeps its\nname.',
];
test('shipped instructions, tool metadata and interface text use context consistently', () => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    ['legacy', 'vendor', 'test'].includes(e.name) ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const files = walk(root).filter(p => ['.md', '.mjs', '.json', '.html', '.sh', '.yaml'].includes(extname(p)));
  // The guides people learn the words from, and the example brain, use the same word (ALL-212)
  files.push(...['README.md', 'COMMANDS.md', 'SETUP.md', 'GUIDE.md', 'ONBOARDING.md', 'INSTALL.md', 'examples/reflow-brain/AGENTS.md'].map(p => join(root, '../..', p)));
  for (const path of files) assert.doesNotMatch(exceptions.reduce((text, allowed) => text.replaceAll(allowed, ''), readFileSync(path, 'utf8')), retired, path);
});

test(`context labels change without translating custom titles or evidence`, () => {
  const memory = { id: 'm_aaaaaa', context: 'market', at: '2026-09-13T10:00:00Z', kind: 'note',
    content: 'Artur said: use the Slack channel for the announcement.', authors: ['alex'], tags: [], people: [], tools: [], actions: [], source: [] };
  const context = { slug: 'market', title: 'Slack channels', label: 'Slack channels', status: 'active',
    summary: 'Saved evidence.', now: '', rule: '', related: [], tools: [], names: [], memories: [memory], stored: 1, loaded: true };
  const D = { brain: '/tmp/Example', generatedAt: memory.at, contexts: [context], questions: [], decisions: [],
    names: [], recent: [memory], loaded: ['market'], tools: [], activity: [],
    admin: { company: 'Example', owner: 'alex', team: [], tools: [], body: '', dashboard: 'on-demand' },
    projects: [{ slug: 'website', title: 'Website', path: '/tmp/Example/website', contexts: ['market'], loaded: ['market'], notes: 1, pointer: true }] };
  const before = JSON.stringify(D), p = page(D);
  assert.match(p.node('#explore-grid').innerHTML, />Contexts</);
  assert.match(p.node('#ch-pane').innerHTML, /Context details/);
  assert.match(p.node('#ch-pane').innerHTML, /Slack channels/);
  assert.ok(p.node('#ch-pane').innerHTML.includes(memory.content));
  p.run('projectSlug="website";renderProject()');
  assert.match(p.node('#project-detail').innerHTML, /Contexts used by this project/);
  assert.equal(JSON.stringify(D), before);
});

test('an older summary, rule or note that says channel is read as context and rewritten on the next compile (ALL-212)', () => {
  const template = readFileSync(join(root, 'templates/AGENTS.md'), 'utf8'), compile = readFileSync(join(root, 'skills/gtm-os-use-brain/references/compile.md'), 'utf8');
  assert.match(template, /older summary, rule or note that says "channel" means a context/);
  assert.match(compile, /Write "context", never "channel"/);
});
