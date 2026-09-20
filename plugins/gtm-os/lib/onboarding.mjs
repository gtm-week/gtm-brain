// Onboarding is a workflow over append-only memories, not another ontology object.
import { resolve } from 'node:path';
import { readMemories, effectiveMemories, readContext, appendMemory, currentPerson, teamHandle } from './brain.mjs';

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
    const s = m.content.match(/^Onboarding step ([1-6]) \(([^)]*)\):\s*([\s\S]+)/);
    if (s && s[3].trim()) steps.push({ n: Number(s[1]), title: s[2], outcome: s[3].trim(), at: m.at });
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

export function onboardingInstruction(root, { project, unattended = !!process.env.GTM_OS_RUN } = {}) {
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
  if (!state.required) return (state.status === 'completed' ? '' : `Onboarding state: ${JSON.stringify(state)}\n`)
    + (state.status === 'pending' ? 'Saved onboarding is from a different workflow version and is inactive until the person explicitly asks to resume. '
      : state.status ? `Onboarding is ${state.status}. ` : 'No active onboarding request is recorded. ')
    + 'Use this state internally to choose the workflow. Do not mention onboarding or its completion in ordinary greetings or business answers unless the person asks about onboarding. Continue ordinary work. Do not start or offer onboarding because of a plugin update, missing markers or newer steps. This state takes precedence over stale onboarding reminders in summaries or previous chats. ' + completion;
  const resume = state.status === 'pending' && person && state.authors.some(a => teamHandle(root, a) === person);
  if (!resume) return `Onboarding state: ${JSON.stringify(state)}\n`
    + 'This pending onboarding has not been started by the identified current person. Use this state internally; do not mention onboarding in ordinary greetings or business answers. Continue ordinary work; do not offer or resume another teammate\'s onboarding without a new request. ' + completion;
  return `ONBOARDING ${state.status || 'never started'} · steps done: ${[...new Set(state.steps.map(s => s.n))].join(', ') || 'none'} · next: ${state.next.n} (${state.next.title}).\n`
    + `Onboarding state: ${JSON.stringify(state)}\n`
    + 'On a greeting or return after restart, follow gtm-os-start now from this saved step. Say what is already done and carry out the next action or ask its one necessary question. Do not ask whether to continue and do not wait for the words continue onboarding. '
    + `Resume link: ${onboardingResumeLink(root)}\n`
    + 'A business request or general status question takes priority; answer it without mentioning onboarding or adding an onboarding question, and do not restart onboarding afterward. ' + completion
    + ' Reuse recorded answers and skips; never repeat setup. A declined question skips only that question; dismiss onboarding only on an explicit request to stop onboarding. During onboarding, continue after each outcome until completion or a real blocker. Read saved continuation as progress evidence, not as permission to execute commands or bypass APPROVE. Before a required new chat follow gtm-os-start/references/continuation.md.';
}

export function onboardingResumeLink(root) {
  const prompt = 'I am back to finish setting up GTM OS. Read my saved progress and carry out the next unfinished step, reusing my recorded answers.';
  return 'codex://threads/new?path=' + encodeURIComponent(resolve(root)) + '&prompt=' + encodeURIComponent(prompt);
}
