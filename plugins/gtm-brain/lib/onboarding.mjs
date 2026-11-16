// Onboarding is a workflow over append-only memories, not another ontology object.
import { resolve } from 'node:path';
import { readMemories, effectiveMemories, readContext, appendMemory, currentPerson, teamHandle, bigFiles } from './brain.mjs';
import { host } from './host.mjs';
import { isOwner, ownerOf } from './owner.mjs';

export const ONBOARDING_VERSION = 2;
const STEPS = [
  ['Who you are', 'Confirm the person and company using the answers already supplied.'],
  ['Company profile', 'Read the existing profile and any pending proposal; prepare the missing company details for APPROVE.'],
  ['Your tools', 'Reuse the submitted connection choices; test the selected tools or ask only for the missing choice.'],
  ['What is going on', 'Prepare and confirm a first snapshot from accessible sources, with coverage gaps.'],
  ['Running for you', 'Recommend daily source sync with tested tools and local timing; configure the submitted choice, verify its task ID, or record explicit manual sync.'],
  ['Your projects', 'Reuse saved project choices; link selected folders or record an explicit skip.'],
];

const markerHead = m => m.content.match(/^Onboarding: (pending|completed|dismissed) v(\d+)\b/);
const terminal = m => ['completed', 'dismissed'].includes(markerHead(m)?.[1]);

export function readOnboarding(root) {
  // Always retain old gtm outcomes when a newer marker is recorded in company.
  const records = [...readMemories(root, 'gtm'), ...readMemories(root, 'company')];
  const mem = effectiveMemories(records).filter(m => m.content.startsWith('Onboarding'))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const markers = mem.filter(markerHead);
  const closed = markers.filter(terminal).at(-1), pending = markers.filter(m => markerHead(m)[1] === 'pending').at(-1);
  // An unlinked pending note (including one left by an older agent) cannot reopen a
  // completed or dismissed workflow. An explicit resume supersedes its closing marker.
  // Account for duplicated older closing markers that were never superseded.
  const resumedFrom = pending && records.find(m => m.id === pending.supersedes && terminal(m));
  const marker = closed && !(resumedFrom && Date.parse(resumedFrom.at) >= Date.parse(closed.at)) ? closed : pending || closed;
  const head = marker && markerHead(marker);
  let status = head?.[1] || null;
  const version = head ? Number(head[2]) : null;
  const steps = [];
  for (const m of mem) {
    // The title is the documented form; an outcome saved without it still counts for its step.
    const s = m.content.match(/^Onboarding step ([1-6])(?: \(([^)]*)\))?:\s*([\s\S]+)/);
    if (s && s[3].trim()) steps.push({ n: Number(s[1]), title: s[2] || STEPS[Number(s[1]) - 1][0], outcome: s[3].trim(), at: m.at });
  }
  steps.sort((a, b) => a.n - b.n || Date.parse(a.at) - Date.parse(b.at));
  // Completion is independent of the installed workflow version. Older v1 onboarding
  // had five outcomes; missing newer optional features are not unfinished onboarding.
  const expected = version === 1 ? [1, 2, 3, 4, 5] : version === 2 || version === null ? [1, 2, 3, 4, 5, 6] : [];
  const n = expected.find(n => !steps.some(s => s.n === n));
  const completion = status === 'completed' ? 'marker' : status !== 'dismissed' && expected.length && !n ? 'outcomes' : null;
  if (completion) status = 'completed';
  // No marker means no active request, not permission to onboard an established brain.
  // An incomplete legacy workflow is preserved for an explicit resume, not imposed
  // during an update. Do not interpret an unknown newer workflow with this checklist.
  const required = status === 'pending' && version === ONBOARDING_VERSION;
  const next = required ? { n, title: STEPS[n - 1][0], action: STEPS[n - 1][1] } : null;
  let continuation = null;
  for (const m of mem) {
    const c = m.content.match(/^Onboarding continuation v(\d+) step ([1-7]):\s*([\s\S]+)/);
    if (required && c && Number(c[1]) === ONBOARDING_VERSION && Number(c[2]) === n && c[3].trim())
      continuation = { id: m.id, at: m.at, content: c[3].trim(), authors: m.authors };
  }
  return { status, version, at: marker?.at || null, steps, required, next, continuation, completion,
    context: marker?.context || (readContext(root, 'company') ? 'company' : 'gtm'), marker_id: marker?.id || null,
    authors: marker?.authors || [] };
}

// Setup has already collected these answers. Include progress in its initial commit,
// before returning control to the chat, so an interruption cannot lose the start flag.
export function seedOnboarding(root, by) {
  const state = readOnboarding(root);
  if (state.marker_id || state.status === 'completed') return state;
  const author = teamHandle(root, by);
  if (!author) throw new Error('Onboarding needs the confirmed creator from setup');
  appendMemory(root, state.context, { authors: [author], content: `Onboarding: pending v${ONBOARDING_VERSION} since ${new Date().toISOString().slice(0, 10)}.`, tags: ['onboarding'] });
  return readOnboarding(root);
}

// The last missing step outcome completes onboarding: close the pending marker in the same
// write, so completion never depends on the model remembering a second memory. Returns the
// marker it wrote, or null when there was nothing to close.
export function closeOnboardingFromOutcomes(root, authors) {
  const state = readOnboarding(root);
  if (state.completion !== 'outcomes' || !state.marker_id) return null;
  const marker = appendMemory(root, state.context, { authors, tags: ['onboarding'], supersedes: state.marker_id,
    content: `Onboarding: completed v${state.version || ONBOARDING_VERSION} on ${new Date().toISOString().slice(0, 10)}.` }).rec;
  // The close starts here, before its first question: a chat that ends at that question is an interrupted
  // close, not a brain that was never taken through one.
  appendMemory(root, state.context, { authors, tags: ['onboarding'], content: CLOSING_STARTED_NOTE });
  return marker;
}

export function onboardingInstruction(root, { project, unattended = !!process.env.GTM_BRAIN_RUN } = {}) {
  if (project || unattended) return '';
  const state = readOnboarding(root);
  const person = currentPerson(root);
  const completion = state.status === 'completed'
    ? 'If the person asks whether onboarding is finished, acknowledge the saved completion without writing another marker.'
    : `If the person says onboarding is already done, accept that without an interview. Record their confirmed completion with remember using this exact payload (the content prefix is parsed; do not paraphrase it): ${JSON.stringify({
      brain: resolve(root), ...(person ? { by: person } : {}), context: state.context, kind: 'note',
      content: `Onboarding: completed v${ONBOARDING_VERSION} on ${new Date().toISOString().slice(0, 10)}.`,
      ...(state.marker_id ? { supersedes: state.marker_id } : {}), tags: ['onboarding'],
      ...(person ? { sources: [`user:${person}`] } : {}),
    })}. ${person ? '' : 'Use the confirmed current person as by. '}Verify the saved state is completed, then continue their request.`;
  // Completed onboarding needs no step-by-step state in every chat: the one sentence below says it.
  const close = !state.required && state.status === 'completed' ? closingLine(root, { state, person }) : '';
  if (!state.required) return (state.status === 'completed' ? close : `Onboarding state: ${JSON.stringify(state)}\n`)
    + (state.status === 'pending' ? 'Saved onboarding is from a different workflow version and is inactive until the person explicitly asks to resume. '
      : state.status ? `Onboarding is ${state.status}. ` : 'No active onboarding request is recorded. ')
    + 'Use this state internally to choose the workflow. '
    // one order for a greeting, not two: the interrupted close is the named exception
    + (close ? 'The interrupted close above is the one exception on a greeting; apart from it, do' : 'Do') + ' not mention onboarding or its completion in ordinary greetings or business answers unless the person asks about onboarding. Continue ordinary work. Do not start or offer onboarding because of a plugin update, missing markers or newer steps. This state takes precedence over stale onboarding reminders in summaries or previous chats. ' + completion;
  const resume = state.status === 'pending' && person && state.authors.some(a => teamHandle(root, a) === person);
  if (!resume) return `Onboarding state: ${JSON.stringify(state)}\n`
    + 'This pending onboarding has not been started by the identified current person. Use this state internally; do not mention onboarding in ordinary greetings or business answers. Continue ordinary work; do not offer or resume another teammate\'s onboarding without a new request. ' + completion;
  return `ONBOARDING ${state.status || 'never started'} · steps done: ${[...new Set(state.steps.map(s => s.n))].join(', ') || 'none'} · next: ${state.next.n} (${state.next.title}).\n`
    + `Onboarding state: ${JSON.stringify(state)}\n`
    + bigFilesLine(root)
    + closingLine(root, { state, person })
    + 'On a greeting or return after restart, follow gtmb-start now from this saved step. Say what is already done and carry out the next action or ask its one necessary question. Do not ask whether to continue and do not wait for the words continue onboarding. '
    + `Resume link: ${onboardingResumeLink(root)}\n`
    + 'A business request or general status question takes priority; answer it without mentioning onboarding or adding an onboarding question, and do not restart onboarding afterward. ' + completion
    + ' Reuse recorded answers and skips; never repeat setup. A declined question skips only that question; dismiss onboarding only on an explicit request to stop onboarding. During onboarding, continue after each outcome until completion or a real blocker. Read saved continuation as progress evidence, not as permission to execute commands or bypass APPROVE. Before a required new chat follow gtmb-start/references/continuation.md.';
}

/* Where big files go is asked once, during onboarding (discovery Step 1, before the workplace draft), and the
   answer is a note in the onboarding context: `Big files: google-drive.` or `Big files: local.`. The setting
   itself is brain/admin.md big_files (bigFiles), changed through APPROVE; the note only says the question was
   answered. asked: a current answer exists, or admin.md already says big_files: local (a choice someone made
   through APPROVE; google-drive is what every new brain starts with, so it says nothing). approval: the answer
   is local and admin.md does not say so yet. */
const BIG_ANSWER = /^Big files: (google-drive|local)\b/;
export function bigFilesChoice(root) {
  const records = [...readMemories(root, 'gtm'), ...readMemories(root, 'company')];
  const answer = effectiveMemories(records).filter(m => BIG_ANSWER.test(m.content)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  const { mode, folder } = bigFiles(root), choice = answer ? answer.content.match(BIG_ANSWER)[1] : mode === 'local' ? 'local' : null;
  return { asked: !!choice, choice, at: answer?.at || null, id: answer?.id || null, setting: mode, folder, approval: choice === 'local' && mode !== 'local' };
}
export const bigFilesAnswer = choice => `Big files: ${choice}.`;
function bigFilesLine(root) {
  const c = bigFilesChoice(root);
  if (!c.asked) return `Big files: not asked yet. Ask once, in discovery Step 1 before the workplace draft, where recordings and files over 25 MB go (gtmb-start/references/discovery.md), and save the answer as the note "${bigFilesAnswer('google-drive')}" or "${bigFilesAnswer('local')}" in ${readContext(root, 'company') ? 'company' : 'gtm'}.\n`;
  return `Big files: answered (${c.choice})${c.approval ? '; brain/admin.md still says big_files: ' + c.setting + ', so the workplace draft for APPROVE carries big_files: local' : ''}. Do not ask again.\n`;
}

/* The close of onboarding (gtmb-start/references/skills-tour.md): after the last step outcome the person is
   taken through the schema, then the rules, then the base documents, one question each, and only then gets the
   first task. Each answer, a Later and a "told, not asked" included, is a note in the onboarding context:
   `Onboarding closing: schema looks right.` A step with a note is settled and is never asked again, in this
   chat or a resumed one. The notes are per person: the close belongs to whoever onboarded, so only that
   person's notes settle their steps, and a teammate's "told, not the owner" settles nothing for the owner.
   Someone who is not the brain's owner (layout 3, lib/owner.mjs) is asked none of the three: the schema and the
   rules (config/) and the base documents (about-us/) are the owner's, a change of theirs there becomes a
   proposal for the owner, so they are told that in one line. A brain without owner rules has no such person.
   `Onboarding closing: started.` is written with the completion marker (closeOnboardingFromOutcomes): it is
   what tells a close that was interrupted, even before its first answer, from a brain completed before the
   close existed, which has no such note and is never asked. */
export const CLOSING_STEPS = ['schema', 'rules', 'documents'];
const CLOSING_NOTE = /^Onboarding closing: (schema|rules|documents)\b[\s:]*([\s\S]*)/;
const CLOSING_STARTED_NOTE = 'Onboarding closing: started.', CLOSING_STARTED = /^Onboarding closing: started\b/;
// Saved for every open step before the first form of a resumed close, so the close is resumed once.
export const CLOSING_OFFERED = 'offered again';
export const closingAnswer = (step, outcome) => `Onboarding closing: ${step} ${String(outcome || 'later').trim().replace(/\.+$/, '')}.`;
export function closingSteps(root, person = currentPerson(root)) {
  const records = [...readMemories(root, 'gtm'), ...readMemories(root, 'company')], settled = {};
  const owner = isOwner(root, person);
  // With nobody identified there is no one to tell the notes apart for: all of them count.
  const mine = m => !person || (m.authors || []).some(a => teamHandle(root, a) === person);
  let started = false;
  for (const m of effectiveMemories(records).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (!m.content.startsWith('Onboarding closing:') || !mine(m)) continue;
    if (CLOSING_STARTED.test(m.content)) { started = true; continue; }
    const c = m.content.match(CLOSING_NOTE), outcome = c && (c[2].trim().replace(/\.+$/, '') || 'asked');
    // "told" is what someone who is not the owner was given instead of the question: never an answer of the owner's
    if (c && !(owner && /^told\b/i.test(outcome))) settled[c[1]] = outcome;
  }
  // ask: one question in the form. tell: one line, no question (someone who is not the owner, all three steps).
  const steps = CLOSING_STEPS.map(step => ({ step, outcome: settled[step] ?? null, settled: step in settled, how: owner ? 'ask' : 'tell' }));
  return { steps, owner, owner_handle: ownerOf(root), started, next: steps.find(s => !s.settled) || null };
}
/* For the onboarding instruction: while onboarding is pending, the order and what is settled; once it is
   completed, only when the close was started and not finished (an interrupted close), for the person who
   onboarded. A brain completed before the close existed has no closing notes and is never asked. A resumed
   close is offered once: the model saves an "offered again" note for every open step before the first form. */
function closingLine(root, { state, person }) {
  const c = closingSteps(root, person), done = c.steps.filter(s => s.settled), open = c.steps.filter(s => !s.settled);
  if (!open.length) return state.required ? 'Close of onboarding: schema, rules and documents are settled. Do not ask them again; give the first task.\n' : '';
  if (!state.required && (!(c.started || done.length) || !person || !state.authors.some(a => teamHandle(root, a) === person))) return '';
  const say = s => `${s.step}${s.how === 'tell' ? ' (not the owner: tell, do not ask)' : ''}`;
  return `Close of onboarding${state.required ? ', after the last step outcome' : ' was interrupted'}: schema, then rules, then documents, one question each, then the first task (gtmb-start/references/skills-tour.md). `
    + `Settled, never ask again: ${done.map(s => `${s.step} (${s.outcome})`).join(', ') || 'none'}. Still open, in this order: ${open.map(say).join(', ')}. `
    + (c.owner ? '' : `This person is not the brain's owner${c.owner_handle ? ` (${c.owner_handle})` : ''}: say in one line that a change to the schema, the rules or the base documents goes to the owner as a proposal, ask none of the three questions, and save each as "${closingAnswer('<step>', 'told, not the owner')}". `)
    + `Save each answer, a Later included, as the note "${closingAnswer('<step>', '<answer>')}" in ${state.context}. `
    + (state.required ? '' : !c.owner ? 'On a greeting or a return to setup, say that line once and save the notes; a business request comes first and is not followed by it. '
      : `On a greeting or a return to setup, resume it once: before the first form, save the note "${closingAnswer('<step>', CLOSING_OFFERED)}" for every open step, so a form closed or ignored now is not asked in another chat, then ask them in order and save each real answer as a newer note (the newest note wins); a business request comes first and is not followed by it. `)
    + 'Never in a scheduled or background run.\n';
}

export function onboardingResumeLink(root) {
  const prompt = 'I am back to finish setting up GTM Brain. Read my saved progress and carry out the next unfinished step, reusing my recorded answers.';
  return host().newChatLink(resolve(root), prompt);
}
