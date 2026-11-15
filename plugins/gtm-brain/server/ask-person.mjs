// ask_person: one question to the person in the host's native form (MCP elicitation/create, the
// mechanism approve_change uses), so the choices are buttons in any chat instead of numbered text.
// Transient: it reads no brain, writes nothing and applies nothing. The answer is the tool result.
import { SOMETHING_ELSE, buildFollowUp } from '../scripts/gtm-brain-learn-company/question.mjs';

const LIMITS = { question: 300, why: 200, choice: 100, answer: 1000 };
// A model's own Other or Something else is the typed answer, offered once and by the form.
const ELSE = /^(other|something else|none of (these|the above)|or type your own)[.:!]?$/i;
// APPROVE belongs to approve_change's form alone: it is never a choice here.
const APPROVE = /^approved?[.!]?$/i;

export const properties = {
  question: { type: 'string', minLength: 1, maxLength: LIMITS.question, description: 'The question, one sentence.' },
  why: { type: 'string', maxLength: LIMITS.why, description: 'One line on why the answer matters; shown under the question.' },
  choices: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string', minLength: 1, maxLength: LIMITS.choice },
    description: 'Two to four choices, each a whole answer, the recommended one first. Always pass them for a yes/no or permission question (Yes, go ahead / No, skip it). Omit only when the answer is a name, a link or other free text. Never add Other or Something else.' },
  own_answer: { type: 'boolean', description: 'Default true: the form also lets the person type their own answer. false only when nothing but the listed choices can be an answer.' },
};
export const required = ['question'];

const clean = (value, max, name) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw Error(`${name} must be text`);
  const s = value.trim();
  if (s.length > max) throw Error(`${name} is longer than ${max} characters; shorten it`);
  return s;
};

/* The form for one question. With choices: one single-select field (the host shows them as buttons),
   its last choice opening a typed answer on a second form, because Codex shows one field per page.
   Without choices: one text field. No defaults: only a submitted value is an answer. */
export function buildForm(args = {}) {
  const question = clean(args.question, LIMITS.question, 'question'), why = clean(args.why, LIMITS.why, 'why');
  if (!question) throw Error('question is required: one sentence');
  if (args.own_answer !== undefined && typeof args.own_answer !== 'boolean') throw Error('own_answer must be true or false');
  const message = why ? `${question}\n\n${why}` : question;
  if (args.choices === undefined || args.choices === null || (Array.isArray(args.choices) && !args.choices.length))
    return { question, message, offered: null, own: true, params: { mode: 'form', message, requestedSchema: { type: 'object', properties: { answer: { type: 'string', title: 'Type your answer', maxLength: LIMITS.answer } }, required: [] } } };
  if (!Array.isArray(args.choices)) throw Error('choices must be a list of two to four whole answers');
  const all = args.choices.map((c, i) => clean(c, LIMITS.choice, `choice ${i + 1}`));
  if (all.some(c => APPROVE.test(c))) throw Error('APPROVE is never a choice here: a workplace or interaction change is approved only in the form approve_change shows');
  const choices = [...new Set(all.filter(c => c && !ELSE.test(c)))];
  const own = args.own_answer !== false || all.some(c => ELSE.test(c));
  if (choices.length < 2 || choices.length > 4) throw Error('choices must be two to four distinct whole answers, the recommended one first (omit choices for a free-text question)');
  const offered = own ? [...choices, SOMETHING_ELSE] : choices;
  return { question, message, offered, own, choices,
    params: { mode: 'form', message, requestedSchema: { type: 'object', properties: { choice: { type: 'string', title: question, enum: offered } }, required: [] } } };
}

/* What a form came back with: answered (the choice or the typed text), own (the person picked the
   typed-answer choice), or none with the reason. A decline, a cancel and an empty submit are all none. */
export function readForm(form, result) {
  if (result?.status === 'not_shown') return { status: 'none', reason: 'the host closed the form before the person saw it', host: true };
  if (result?.action === 'decline' || result?.action === 'cancel') return { status: 'none', reason: 'the person closed the form without answering, or it timed out' };
  const content = result?.action === 'accept' && result.content && typeof result.content === 'object' ? result.content : null;
  if (!content) return { status: 'none', reason: 'the host returned no usable form result' };
  const typed = [content.answer, content.text].find(v => typeof v === 'string' && v.trim());
  const choice = typeof content.choice === 'string' ? content.choice : '';
  if (choice && form.offered?.includes(choice)) return choice === SOMETHING_ELSE ? (typed ? { status: 'answered', answer: typed.trim().slice(0, LIMITS.answer), typed: true } : { status: 'own' }) : { status: 'answered', answer: choice, typed: false };
  if (choice) return { status: 'none', reason: 'the form returned a choice that was not offered' };
  if (typed) return { status: 'answered', answer: typed.trim().slice(0, LIMITS.answer), typed: true };
  return { status: 'none', reason: 'the form was submitted empty' };
}

const NOTE = 'This answers this question only: act on it through its owning workflow and do not ask it again. It approves nothing: a workplace or interaction change still goes only through approve_change, whose own form carries APPROVE.';
export const answerText = a => `The person's answer (${a.typed ? 'typed' : 'picked'} in the form): ${JSON.stringify(a.answer)}\n${NOTE}`;
export const noAnswerText = (reason, host = false) => `no answer (${reason}). This is neither an answer nor a refusal, and it authorizes nothing. `
  + (host ? 'This host is not showing the form: do not call ask_person again in this chat. Ask with the host\'s own question box when this chat has one; otherwise ask once as plain chat text' : 'Ask the same question once as plain chat text')
  + ' (the question, one line on why it matters, the numbered choices, recommended first) and end the turn.';

/* questions is the server's one form transport (question-input.mjs): one form pending per session. */
export async function askPerson(questions, args, requestId) {
  let form; try { form = buildForm(args); } catch (e) { return { text: `not asked: ${e.message}`, isError: true }; }
  if (!questions.available()) return { text: noAnswerText('this host cannot show forms', true) };
  let read = readForm(form, await questions.raw(form.params, requestId, true));
  // The person picked the typed-answer choice: its text field is a second form. They have just seen a
  // form, so a quick close of this one is theirs, not a host that hides forms.
  if (read.status === 'own') {
    read = readForm({ offered: null }, await questions.raw(buildFollowUp({ question: form.question }), requestId, false));
    if (read.status === 'none') read = { status: 'none', reason: 'the person chose to type an answer and closed the form without one' };
  }
  return { text: read.status === 'answered' ? answerText(read) : noAnswerText(read.reason, read.host) };
}
