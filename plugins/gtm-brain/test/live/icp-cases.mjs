// Fictional fixtures only. These checks inspect actual MCP routes and persisted output;
// instruction-text checks alone cannot establish interview behavior.
import { readFileSync } from 'node:fs';
import { listDocuments, readDocument, writeDocument } from '../../lib/documents.mjs';

const isWrite = c => ['remember', 'new_context', 'fork_context', 'edit_context', 'archive_context', 'add_name', 'update_entity', 'merge_entities', 'archive_entity', 'undo_entity_merge', 'compile_entity', 'interact', 'compile_apply', 'skill', 'save', 'propose_admin_change', 'propose_interaction', 'computer_use', 'attio_move_deal'].includes(c.tool)
  || (c.tool === 'document' && !['list', 'show', 'files'].includes(c.arguments?.action));
const readsICP = calls => calls.some(c => c.tool === 'load_context' && c.arguments?.contexts?.includes('icp'));
const readsDocuments = calls => calls.some(c => c.tool === 'document' && c.arguments?.action === 'list');
export const interviewRoute = calls => readsICP(calls) && readsDocuments(calls)
  && calls.filter(c => c.tool === 'question').length === 1
  && !calls.some(isWrite)
  && !calls.some(c => ['configuration_question', 'onboarding_question', 'open_dashboard', 'render_dashboard'].includes(c.tool));
export const updateRoute = calls => {
  const update = calls.findIndex(c => c.tool === 'document' && c.arguments?.action === 'update');
  const ask = calls.findIndex(c => c.tool === 'question');
  return readsICP(calls) && readsDocuments(calls) && update > ask && ask >= 0
    && calls[update].arguments?.status === 'draft'
    && calls.slice(0, update).some(c => c.tool === 'document' && c.arguments?.action === 'show' && /customer-fit/.test(c.arguments?.ref || ''))
    && calls.slice(update + 1).some(c => c.tool === 'document' && c.arguments?.action === 'show')
    && calls.filter(isWrite).length === 1
    && /customer-fit/.test(calls[update].arguments?.ref || '');
};
export const icpBodyChecks = text => [
  /Monday/i,
  /Cedar Demo/, /Birch Demo/,
  /desired|target account/i, /\b(?:two|2)\s+(?:\w+\s+)?(?:examples?|compan|accounts?)|fewer than three|no third/i,
  /future.fit|future opportunity|future segment/i,
  /Influencers/i, /Champions/i, /Main decision makers|MDMs/i, /Blockers/i,
  /Unaware/i, /Problem aware/i, /(?<!your )solution aware/i, /Your solution aware/i, /Most aware/i,
  /Need now/i, /Budget/i, /Trust in us/i,
  /hypothes|unknown|unverified/i,
].every(re => re.test(text)) && !/market.validated|validated ICP|guaranteed budget/i.test(text)
  && !/decision maker[^.\n]*because[^.\n]*KPI/i.test(text);
const seedICP = root => writeDocument(root, {
  path: 'customer-fit.md', title: 'Customer fit', applies_to: ['targeting', 'outreach'], status: 'approved', by: 'marta-nowak',
  body: '# Customer fit\n\nArchive evidence: reconciliation reviews happen every Monday. Interview evidence, not market validation.\n',
});
const evidence = root => {
  const d = readDocument(root, 'customer-fit');
  return d ? JSON.stringify(d) : '(no ICP document)';
};
export const icpCases = [
  {
    name: 'skill-define-icp-interview', workflow: 'gtm-brain-define-icp', judge: 'advisory',
    prompt: '/gtm-brain-define-icp Help define our ICP. We sell returns automation. Cedar Demo is our only customer example; Birch Demo is a desired account, not a customer. I cannot provide a third, even anonymously. Use those two and move beyond examples to the broader company pattern. Ask only the next focused question, then stop this turn. Do not save anything yet.',
    calls: interviewRoute,
    responseCheck: text => !/market.validated|validated ICP/i.test(text)
      && !/(?<!not |n't |never )\b(?:saved|created|wrote|updated)\b[^.\n]*\b(?:draft|document|ICP|profile)\b/i.test(text),
    verify: (root, { before, after, trace }) => JSON.stringify(before) === JSON.stringify(after)
      && !listDocuments(root).some(d => /customer.fit|ideal.customer/i.test(d.title))
      && (() => {
        const forms = readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.kind === 'question');
        return forms.length === 1 && /compan|firmograph|segment|industry|business|fit|pattern/i.test(forms[0].message)
          && !/third|another example|one more company/i.test(forms[0].message);
      })(),
    expect: 'One focused question through the everyday question form about the broader company pattern, not a third example. Reuse offering and identity. No document or memory write, research, CRM change or new context. The two examples retain customer versus desired status. No fabricated third account.',
  },
  {
    name: 'skill-define-icp-update', workflow: 'gtm-brain-define-icp', judge: 'advisory', answer: 'draft|yes|update', prepare: seedICP,
    prompt: `/gtm-brain-define-icp Synthesize a revised working ICP from this completed fictional interview. Stop interviewing; all unspecified details remain unknown. Only two examples are available: Cedar Demo is a current customer; Birch Demo is a desired account with no purchase history. No third example is available. Near-term focus is retailers with manual returns reconciliation, 20-200 stores as a hypothesis, and an operations team struggling with refund delays. Company gain: lower reconciliation cost. Operations lead: reduce daily exception backlog, champion observed at Cedar only; CFO: cash predictability KPI, final approval unknown. Do not infer either role universally from the title. No evidence of blockers. Exclude companies without returns; unknown budgets need verification, not exclusion. Large enterprise is future-fit only: missing access, proof and delivery capacity. Awareness differs by persona; we have no stage-conversion evidence and cannot choose a minimum stage yet. Previous vendor use is only a clue. Need now: a refund backlog deadline, to confirm in discovery. Budget: funding and store count are clues, no allocated amount known. Trust: referrals may help; content engagement does not prove trust. Reach: industry operations events are a hypothesis. Use the existing Customer fit document and preserve its prior evidence. Confirm once before replacing its approved version with a draft. Do not record notes or change any external system.`,
    calls: updateRoute,
    responseCheck: text => /customer-fit\.md/.test(text) && /draft/i.test(text) && !/market.validated|validated ICP/i.test(text),
    verify: (root, { before, after }) => {
      const docs = listDocuments(root), d = readDocument(root, 'customer-fit');
      return JSON.stringify(before) === JSON.stringify(after) && d?.status === 'draft'
        && d.title === 'Customer fit' && d.path === 'customer-fit.md'
        && JSON.stringify(d.applies_to) === JSON.stringify(['targeting', 'outreach'])
        && docs.filter(d => /customer.fit|ideal.customer/i.test(d.title)).length === 1 && icpBodyChecks(d.body);
    },
    evidence,
    expect: 'Update the existing Customer fit through document after one native confirmation, preserving its Monday reconciliation-review evidence, title, path and scope, and changing approved to draft. Five output parts with all five awareness rows and Need now/Budget/Trust in us. Explicitly distinguish one actual customer from a desired account, insufficient examples, company outcomes from persona KPIs, unknown authority from titles, current fit from future conditions, clues from confirmed budget/trust, and unvalidated hypotheses from evidence. No fabricated third example, budget, authority or minimum awareness threshold. No memories or external changes. Link the saved draft and identify a material gap.',
  },
];

// Plain requests with no slash command, so not skill cases: rule 7b offers Define ICP, or the interview starts at once.
// A written ICP still goes straight to documents with no interview.
// Interview questions are free text; a save confirmation carries choices.
const interviewAsk = c => c.tool === 'question' && !c.arguments?.options?.length
  && /compan|customer|example|industr|segment|pattern|target/i.test(c.arguments?.question || '');
const noForms = calls => !calls.some(c => ['configuration_question', 'onboarding_question'].includes(c.tool));
// The harness answers every free-text question "yes" and picks the first choice, so the interview may run
// on to a saved draft. That is fine when the one write is a document saved after the "Keep as a draft" form.
const savedAfterConsent = calls => {
  const writes = calls.filter(isWrite);
  if (!writes.length) return true;
  const at = calls.indexOf(writes[0]);
  return writes.length === 1 && writes[0].tool === 'document' && ['create', 'update'].includes(writes[0].arguments?.action)
    && calls.slice(0, at).some(c => c.tool === 'question' && /Keep as a draft/.test(JSON.stringify(c.arguments || {})));
};
export const plainRequestRouted = (calls, text) => savedAfterConsent(calls) && noForms(calls)
  && (/gtm-brain-define-icp|Define ICP/i.test(text) || interviewAsk(calls.find(c => c.tool === 'question') || {}));
export const writtenICPRoute = calls => calls.filter(isWrite).length === 1
  && calls.some(c => c.tool === 'document' && c.arguments?.action === 'create')
  && !calls.some(interviewAsk) && noForms(calls);
export function icpRoutingCases() {
  let seen = [];   // the harness evaluates calls before responseCheck in the same case
  return [
    {
      name: 'icp-plain', workflow: 'gtm-brain-use-brain', judge: 'advisory',
      prompt: 'We need to define our ICP. Who should we be targeting?',
      calls: calls => { seen = calls; return savedAfterConsent(calls) && noForms(calls); },
      responseCheck: text => plainRequestRouted(seen, text),
      verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after)
        && listDocuments(root).filter(d => /customer.fit|ideal.customer|icp/i.test(d.title)).length <= 1,
      expect: 'Offer gtm-brain-define-icp by name once, or start its interview with a question about target companies. No memories; at most one ICP draft, saved only after the Keep as a draft confirmation.',
    },
    {
      name: 'icp-written', workflow: 'gtm-brain-use-brain', judge: 'advisory', answer: 'draft|yes|add',
      prompt: 'Add this as our ICP document, as a draft:\n\n# Ideal customer profile\n\nRetailers with 20-200 stores and manual returns reconciliation. Exclude companies without returns.',
      calls: calls => writtenICPRoute(calls),
      verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after)
        && listDocuments(root).filter(d => /manual returns reconciliation/.test(d.body)).length === 1,
      expect: 'Create the document from the given text through document create, with no interview question and no memories.',
    },
  ];
}
