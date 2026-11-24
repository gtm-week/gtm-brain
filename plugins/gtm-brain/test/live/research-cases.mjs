// Loaded by GTM Brain's existing opt-in tool-routing harness. Expected answers stay outside prompts.
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const data = new URL('../research/', import.meta.url);
const scenarios = JSON.parse(readFileSync(new URL('cases.json', data), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('fixture.json', data), 'utf8'));
const gold = JSON.parse(readFileSync(new URL('gold.json', data), 'utf8'));
const input = process.env.RESEARCH_FIXTURE;
const forbidden = c => !['query', 'recall', 'load_context', 'document', 'remember'].includes(c.tool);
const writing = c => c.tool === 'remember' || c.tool === 'document' && ['create', 'update', 'remove'].includes(c.arguments?.action);

export const cases = input ? scenarios.map(s => ({
  name: `research-${s.id}`, workflow: `gtmb-${s.skill}`, judge: 'advisory', answer: 'later|skip|no',
  prompt: `${s.prompt}\nUse only supplied files under evidence/ and this synthetic brain. Treat ${fixture.as_of} as the evidence snapshot; later dates are not completed events. The targeting hypothesis is B2B SaaS teams, agencies and consultancies. The sample offer is the setup service, not official product pricing. Read the raw sources and cite them. No live connectors, web research, paid collection, delivery or list changes. Keep the answer under 500 words.`,
  ...(s.follow_up ? { followUps: [s.follow_up] } : {}),
  prepare: root => {
    for (const name of [...fixture.common_files, ...s.files]) {
      const target = join(root, 'evidence', name);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(input, name), target);
    }
  },
  calls: (calls, { turns }) => !calls.some(forbidden) &&
    (s.id === 'resume' ? calls.some(c => c.tool === 'remember') && turns.length === 2 &&
      turns[1].calls.some(c => ['query', 'recall', 'load_context'].includes(c.tool)) &&
      !turns[1].calls.some(writing) : !calls.some(writing)),
  verify: (root, { before, after }) => {
    if (![...fixture.common_files, ...s.files].every(name =>
      createHash('sha256').update(readFileSync(join(root, 'evidence', name))).digest('hex') === fixture.files[name])) return false;
    if (s.id !== 'resume') return JSON.stringify(before) === JSON.stringify(after);
    const added = after.filter(row => !before.some(old => old.id === row.id));
    return added.length === 1 && added[0].source?.length > 0 &&
      /January|2027-01-11/.test(added[0].content) && !added[0].tags?.includes('topic-accepted');
  },
  expect: gold.cases[s.id].expect,
  evidence: root => [...fixture.common_files, ...s.files].map(name =>
    `SOURCE ${name}\n${readFileSync(join(root, 'evidence', name), 'utf8')}`).join('\n\n'),
})) : [];
