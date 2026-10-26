// Opt-in semantic-selection cases for the existing isolated Codex evaluation harness.
import * as lib from '../../lib/brain.mjs';
const asks = c => ['question', 'configuration_question', 'onboarding_question'].includes(c.tool);
const noCreation = calls => !calls.some(c => ['new_context', 'fork_context', 'archive_context'].includes(c.tool));
const noSweep = calls => !calls.some(c => /^(fixture_|open_dashboard|render_dashboard|compile_)/.test(c.tool));
const active = root => lib.listContexts(root).map(c => c.slug).sort();
export const contextRoutingCases = [
  {
    name: 'routing-unloaded-write',
    prompt: 'Remember this decision: our expansion priority is the European market, starting with Germany. Use the existing appropriate home.',
    verify: root => lib.effectiveMemories(lib.readMemories(root, 'strategy')).some(m => /Germany/.test(m.content)),
    calls: calls => noCreation(calls) && noSweep(calls) && !calls.some(asks)
      && calls.some(c => c.tool === 'load_context' && c.arguments.contexts?.includes('strategy') && (!c.arguments.mode || c.arguments.mode === 'add')),
    expect: 'Infer Strategy, load additively, save the decision there. No chooser, new context, replacement of loaded scope or source sweep.',
  },
  {
    name: 'routing-supporting-read',
    prompt: 'Use our saved knowledge to draft a short Bergstrom Home pilot proposal, including the pricing unit and target customer fit. Do not save the draft or contact external tools.',
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after),
    calls: calls => noCreation(calls) && noSweep(calls) && !calls.some(c => c.tool === 'remember' || asks(c)),
    responseCheck: text => /store/i.test(text) && /20|200|mid.market/i.test(text),
    expect: 'Use per-store pricing from Our offer and target-customer evidence from Target customers; distinguish evidence from assumptions about account fit. No saved draft or context creation.',
  },
  {
    name: 'routing-strict-scope',
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after),
    prompt: 'Use only Strategy. Based only on its saved knowledge, what are our priorities? Do not change anything or read other contexts.',
    calls: calls => noCreation(calls) && noSweep(calls) && !calls.some(c => c.tool === 'remember' || c.tool === 'recall'
      || (c.tool === 'query' && c.arguments.object === 'memories' && c.arguments.filters?.context !== 'strategy')
      || (c.tool === 'load_context' && c.arguments.contexts?.some(s => s !== 'strategy'))),
    responseCheck: text => /enterprise/i.test(text),
    expect: 'Answer from Strategy enterprise-adoption evidence only. No supporting reads of other contexts or new writes.',
  },
  {
    name: 'routing-one-off-customer',
    prompt: 'Remember: a prospect called Cedar Retail said its staff handle returns manually. This is a one-off discovery call.',
    verify: root => lib.listContexts(root).every(c => !/cedar/i.test(c.slug))
      && lib.effectiveMemories(lib.readMemories(root, 'icp')).some(m => /Cedar Retail/.test(m.content)),
    calls: calls => noCreation(calls) && noSweep(calls) && !calls.some(asks),
    expect: 'Record customer-needs evidence in Target customers with identity references. No dedicated customer context or separation suggestion.',
  },
  {
    name: 'routing-archived-match', answer: '^Cancel$',
    prepare(root) { lib.writeContext(root, 'pricing-redesign', { title: 'Pricing redesign', status: 'archived', rule: 'Own the multi-quarter redesign of price tiers and packaging.' }); },
    verify: root => lib.readContext(root, 'pricing-redesign').status === 'archived' && !active(root).includes('pricing-redesign-2'),
    calls: calls => noCreation(calls) && noSweep(calls) && calls.some(c => c.tool === 'question'),
    expect: 'Recognize the existing archived Pricing redesign context, offer reopening through a native question, and respect cancellation. Never duplicate or silently reopen it.',
    prompt: 'We are returning to the pricing redesign initiative for the next quarter. Find its existing home before we begin.',
  },
];
