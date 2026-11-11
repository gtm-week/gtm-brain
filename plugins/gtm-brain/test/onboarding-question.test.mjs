process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
process.env.GTM_BRAIN_NO_SESSION_START = "1"; // servers here test tools; chat-start.test.mjs covers the chat start
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { buildQuestion, readAnswer, SOMETHING_ELSE, inputSchema as buildQuestionSchema } from '../scripts/gtm-brain-learn-company/question.mjs';
import { questionInput } from '../server/question-input.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// A throwaway Codex profile: the person's own config.toml must not decide which question tools the server lists.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'gtm-brain-question-profile-'));

const args = { question: 'Connect Gmail?', options: ['Yes, go ahead', 'No, skip it'] };

test('forms preserve choice order, support multi-select and free text, and carry no default or timeout', () => {
  const single = buildQuestion(args);
  assert.deepEqual(single.requestedSchema.properties.selection.enum, [...args.options, SOMETHING_ELSE]);
  assert.equal(buildQuestion({ ...args, text_label: 'Add a note' }).requestedSchema.properties.text.type, 'string');
  // a model passes text_label: "" to mean "no note field"; that is omission, never a refusal
  assert.deepEqual(Object.keys(buildQuestion({ ...args, text_label: '' }).requestedSchema.properties), Object.keys(single.requestedSchema.properties));
  assert.deepEqual(Object.keys(buildQuestion({ ...args, text_label: '  ' }).requestedSchema.properties), Object.keys(single.requestedSchema.properties));
  assert.equal(single._meta, undefined);
  assert.equal(single.requestedSchema.properties.selection.default, undefined);
  const multi = buildQuestion({ ...args, multiple: true });
  assert.equal(multi.requestedSchema.properties.selection.type, 'array');
  assert.deepEqual(multi.requestedSchema.properties.selection.items.enum, [...args.options, SOMETHING_ELSE]);
  assert.deepEqual(Object.keys(buildQuestion({ question: 'Website?' }).requestedSchema.properties), ['text']);
  assert.throws(() => buildQuestion({ ...args, options: ['Yes', ' Yes '] }), /distinct/);
  assert.throws(() => buildQuestion({ ...args, autoResolutionMs: 5000 }), /unsupported/);
  // every GTM Brain tool description says to pass brain; a form takes it and ignores it
  assert.deepEqual(buildQuestion({ ...args, brain: '/x/FDE OS', project: 'site' }), buildQuestion(args));
  assert.throws(() => buildQuestion({ question: 'Choose', multiple: true }), /requires options/);
});

test('a free-text question carries no "or" label: the header already shows the question (Artur, 2026-09-18)', () => {
  const free = buildQuestion({ question: 'May I inspect the recordings?' }).requestedSchema.properties.text;
  assert.equal(free.title, undefined);
  // The model used to copy the default out of the schema description; with no choices above it, it is dropped.
  assert.equal(buildQuestion({ question: 'May I?', text_label: 'Or type an answer' }).requestedSchema.properties.text.title, undefined);
  assert.equal(buildQuestion({ question: 'Website?', text_label: 'Company website' }).requestedSchema.properties.text.title, 'Company website');
  assert.equal(buildQuestion({ ...args, text_label: 'Add a note' }).requestedSchema.properties.text.title, 'Add a note');
  assert.doesNotMatch(buildQuestionSchema.properties.text_label.description, /Or type an answer/);
  assert.match(buildQuestionSchema.properties.options.description, /yes\/no/i);
});

test('a choice question is one page: the host shows one field per page, so a text field is a second step (Artur, 2026-09-21)', () => {
  // Codex rendered the choices as "1 of 2" and an "Or type an answer" box as "2 of 2" on every question.
  assert.deepEqual(Object.keys(buildQuestion(args).requestedSchema.properties), ['selection']);
  assert.deepEqual(Object.keys(buildQuestion({ ...args, multiple: true }).requestedSchema.properties), ['selection']);
  // The second step is opt-in, and never under the old default label.
  assert.deepEqual(Object.keys(buildQuestion({ ...args, text_label: 'Add a note' }).requestedSchema.properties), ['selection', 'text']);
  assert.deepEqual(Object.keys(buildQuestion({ ...args, text_label: 'Or type an answer' }).requestedSchema.properties), ['selection']);
  assert.match(buildQuestionSchema.properties.text_label.description, /second/i);
});

test('only submitted data supplies answers; cancellation, empty input and invalid responses cannot become consent', () => {
  assert.deepEqual(readAnswer(args, { action: 'accept', content: { selection: args.options[0] } }),
    { status: 'answered', selections: [args.options[0]], text: '' });
  assert.deepEqual(readAnswer(args, { action: 'accept', content: {} }), { status: 'unanswered' });
  for (const [action, status] of [['decline', 'declined'], ['cancel', 'cancelled']]) {
    assert.deepEqual(readAnswer(args, { action, content: { selection: args.options[0] } }), { status });
  }
  assert.deepEqual(readAnswer(args, { action: 'accept', content: { text: 'Use Spanish' } }),
    { status: 'answered', selections: [], text: 'Use Spanish' });
  assert.equal(readAnswer(args, { action: 'accept', content: { selection: '', text: 'Use Spanish' } }).text, 'Use Spanish');
  assert.throws(() => readAnswer(args, { action: 'accept', content: { selection: 'invented' } }), /invalid selection/);
  assert.throws(() => readAnswer(args, { action: 'accept', content: { selection: args.options } }), /selection type/);
  assert.deepEqual(readAnswer({ ...args, multiple: true }, { action: 'accept', content: { selection: args.options } }).selections, args.options);
});

test('every choice question can take the person\'s own words on one page: Something else opens a typed answer (Artur, 2026-11-06)', async () => {
  // The form offered only the model's choices; a person whose answer was not among them could not give it.
  assert.deepEqual(Object.keys(buildQuestion(args).requestedSchema.properties), ['selection']);
  assert.deepEqual(buildQuestion({ ...args, options: ['A', 'Other'] }).requestedSchema.properties.selection.enum, ['A', SOMETHING_ELSE], 'never offered twice, and always with the next-screen hint');
  assert.match(SOMETHING_ELSE, /type it on the next screen/, 'the label says the text box comes after Submit');
  const ask = async (a, answers) => {
    const sent = [], q = questionInput(m => { sent.push(m); queueMicrotask(() => q.receive({ id: m.id, result: answers.shift() })); });
    q.initialize({ elicitation: { form: {} } });
    return { answer: await q.ask(a, 1), sent };
  };
  const typed = await ask(args, [{ action: 'accept', content: { selection: SOMETHING_ELSE } }, { action: 'accept', content: { text: 'Only the read-only collaborators' } }]);
  assert.deepEqual(typed.answer, { status: 'answered', selections: [], text: 'Only the read-only collaborators' });
  assert.equal(typed.sent.length, 2);
  assert.deepEqual(Object.keys(typed.sent[1].params.requestedSchema.properties), ['text']);
  assert.equal(typed.sent[1].params.message, args.question);
  const picked = await ask(args, [{ action: 'accept', content: { selection: args.options[0] } }]);
  assert.equal(picked.sent.length, 1, 'a listed choice is still one page');
  const mixed = await ask({ ...args, multiple: true }, [{ action: 'accept', content: { selection: [args.options[0], SOMETHING_ELSE] } }, { action: 'accept', content: { text: 'and Slack' } }]);
  assert.deepEqual(mixed.answer, { status: 'answered', selections: [args.options[0]], text: 'and Slack' });
  const own = await ask({ ...args, options: ['A', 'Other'] }, [{ action: 'accept', content: { selection: SOMETHING_ELSE } }, { action: 'accept', content: { text: 'C' } }]);
  assert.deepEqual(own.answer, { status: 'answered', selections: [], text: 'C' }, 'the model\'s own Other opens the typed answer too');
  // Closing the typed answer is that outcome, never a choice of "Something else"; a quick close is the person's.
  assert.deepEqual((await ask(args, [{ action: 'accept', content: { selection: SOMETHING_ELSE } }, { action: 'cancel' }])).answer, { status: 'cancelled' });
  assert.deepEqual((await ask(args, [{ action: 'accept', content: { selection: SOMETHING_ELSE } }, { action: 'accept', content: {} }])).answer, { status: 'unanswered' });
});

test('input transport negotiates support, correlates responses and refuses competing questions', async () => {
  const sent = [], q = questionInput(m => sent.push(m));
  await assert.rejects(q.ask(args, 1), /does not support/);
  q.initialize({ elicitation: { url: {} } }); assert.equal(q.available(), false);
  q.initialize({ elicitation: { form: {} } }); assert.equal(q.available(), true);
  const answer = q.ask(args, 10);
  assert.equal(sent[0].method, 'elicitation/create');
  await assert.rejects(q.ask(args, 11), /already pending/);
  assert.equal(q.receive({ id: 'unrelated', result: { action: 'accept' } }), false);
  assert.equal(q.receive({ id: sent[0].id, result: { action: 'accept', content: { text: 'No, skip it' } } }), true);
  assert.equal((await answer).text, 'No, skip it');
  q.initialize({ elicitation: {} }); assert.equal(q.available(), true);
});

test('input transport releases pending requests on cancellation, client error and disconnect', async () => {
  const sent = [], q = questionInput(m => sent.push(m));
  q.initialize({ elicitation: { form: {} } });
  const first = q.ask(args, 10); q.cancel(99);
  q.cancel(10); assert.deepEqual(await first, { status: 'cancelled' });
  assert.equal(sent.at(-1).method, 'notifications/cancelled');
  const second = q.ask(args, 11), failed = assert.rejects(second, /Client disconnected/);
  q.close(); await failed;
  const third = q.ask(args, 12), rejected = assert.rejects(third, /not supported/);
  q.receive({ id: sent.at(-1).id, error: { message: 'not supported' } }); await rejected;
});

test("a form the host declines at once was never shown: not_shown, and later questions go to chat text (Maksymilian, 2026-09-30)", async () => {
  // Codex CLI answered every onboarding_question with declined before anything appeared on screen.
  let clock = 0; const sent = [], q = questionInput(m => sent.push(m), () => clock);
  q.initialize({ elicitation: { form: {} } });
  const slow = q.ask(args, 1); clock += 5000; q.receive({ id: sent.at(-1).id, result: { action: 'decline' } });
  assert.deepEqual(await slow, { status: 'declined' }, "a person who read the form and declined it declined it");
  const fast = q.ask(args, 2); clock += 50; q.receive({ id: sent.at(-1).id, result: { action: 'decline' } });
  assert.equal((await fast).status, 'not_shown');
  const before = sent.length; assert.equal((await q.ask(args, 3)).status, 'not_shown');
  assert.equal(sent.length, before, "no further form is sent into a host that hides them");
});

test("a decline Codex made itself is not_shown however long it took (Artur, 2026-10-05)", async () => {
  // Codex in Full access declines every form with fields and marks the answer as its own; the person saw nothing.
  let clock = 0; const sent = [], q = questionInput(m => sent.push(m), () => clock);
  q.initialize({ elicitation: { form: {} } });
  const auto = q.ask(args, 1); clock += 4000; q.receive({ id: sent.at(-1).id, result: { action: 'decline', _meta: { approvals_reviewer: 'auto_review' } } });
  assert.equal((await auto).status, 'not_shown');
  const before = sent.length; assert.equal((await q.ask(args, 2)).status, 'not_shown');
  assert.equal(sent.length, before);
});

test('only the bare words count as the typed-answer choice: "Other company" is a real choice and Something else is still added', async () => {
  const enumOf = options => buildQuestion({ question: 'Which one?', options }).requestedSchema.properties.selection.enum;
  for (const bare of ['Other', 'other.', 'Something else', 'None of the above', ' None of these ']) assert.deepEqual(enumOf(['Yes', bare]), ['Yes', SOMETHING_ELSE], bare);
  for (const real of ['Other company', 'Something else entirely', 'None of these apply to us yet']) assert.deepEqual(enumOf(['Yes', real]), ['Yes', real, SOMETHING_ELSE], real);
});

test("GTM Brain lists no question forms: Codex's own box when it is on, chat text when it is off; APPROVE keeps its form", async t => {
  const profile = mkdtempSync(join(tmpdir(), 'gtm-brain-native-q-'));
  writeFileSync(join(profile, 'config.toml'), 'model = "x"\n\n[features]\nhooks = true\ndefault_mode_request_user_input = true\n\n[mcp_servers.a]\ncommand = "a"\n');
  const listed = async home => {
    const child = spawn(process.execPath, [new URL('../server/server.mjs', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME: home } });
    t.after(() => child.kill());
    const replies = new Map(); let seq = 0;
    createInterface({ input: child.stdout }).on('line', line => { const m = JSON.parse(line); replies.get(m.id)?.(m); });
    const rpc = (method, params) => new Promise(resolve => { const id = ++seq; replies.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    const init = await rpc('initialize', { capabilities: { elicitation: { form: {} } } });
    const names = (await rpc('tools/list', {})).result.tools.map(x => x.name);
    child.kill();
    return { names, instructions: init.result.instructions };
  };
  const native = await listed(profile);
  for (const name of ['onboarding_question', 'configuration_question', 'question']) assert.ok(!native.names.includes(name), `${name} is off`);
  assert.ok(native.names.includes('approve_change'), 'APPROVE keeps its own form');
  assert.match(native.instructions, /ask every question with request_user_input/);
  assert.match(native.instructions, /never add Other or Something else/);
  // the flag off, or outside [features]: still no forms; the questions go to chat text
  writeFileSync(join(profile, 'config.toml'), '[features]\ndefault_mode_request_user_input = false\n[other]\ndefault_mode_request_user_input = true\n');
  const chat = await listed(profile);
  for (const name of ['onboarding_question', 'configuration_question', 'question']) assert.ok(!chat.names.includes(name), `${name} is off`);
  assert.ok(chat.names.includes('approve_change'), 'APPROVE keeps its own form');
  assert.match(chat.instructions, /Ask every question as plain chat text and end the turn/);
  assert.doesNotMatch(chat.instructions, /request_user_input/);
});
