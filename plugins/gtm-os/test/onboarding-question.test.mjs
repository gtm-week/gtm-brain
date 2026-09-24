process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { buildQuestion, readAnswer, inputSchema as buildQuestionSchema } from '../scripts/gtm-os-learn-company/question.mjs';
import { questionInput } from '../server/question-input.mjs';

const args = { question: 'Connect Gmail?', options: ['Yes, go ahead', 'No, skip it'] };

test('forms preserve choice order, support multi-select and free text, and carry no default or timeout', () => {
  const single = buildQuestion(args);
  assert.deepEqual(single.requestedSchema.properties.selection.enum, args.options);
  assert.equal(buildQuestion({ ...args, text_label: 'Add a note' }).requestedSchema.properties.text.type, 'string');
  // a model passes text_label: "" to mean "no note field"; that is omission, never a refusal
  assert.deepEqual(Object.keys(buildQuestion({ ...args, text_label: '' }).requestedSchema.properties), Object.keys(single.requestedSchema.properties));
  assert.deepEqual(Object.keys(buildQuestion({ ...args, text_label: '  ' }).requestedSchema.properties), Object.keys(single.requestedSchema.properties));
  assert.equal(single._meta, undefined);
  assert.equal(single.requestedSchema.properties.selection.default, undefined);
  const multi = buildQuestion({ ...args, multiple: true });
  assert.equal(multi.requestedSchema.properties.selection.type, 'array');
  assert.deepEqual(multi.requestedSchema.properties.selection.items.enum, args.options);
  assert.deepEqual(Object.keys(buildQuestion({ question: 'Website?' }).requestedSchema.properties), ['text']);
  assert.throws(() => buildQuestion({ ...args, options: ['Yes', ' Yes '] }), /distinct/);
  assert.throws(() => buildQuestion({ ...args, autoResolutionMs: 5000 }), /unsupported/);
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

test('real MCP server exposes a form before a brain exists and resumes the tool from the client answer', async t => {
  const child = spawn(process.execPath, [new URL('../server/server.mjs', import.meta.url).pathname], { stdio: ['pipe','pipe','pipe'] });
  t.after(() => child.kill());
  const pending = new Map(); let seq = 0, form;
  const send = m => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  const rpc = (method, params) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); send({ id, method, params }); });
  createInterface({ input: child.stdout }).on('line', line => {
    const m = JSON.parse(line);
    if (m.method === 'elicitation/create') {
      form = m;
      send({ id: m.id, result: { action: 'accept', content: { selection: ['Gmail', 'Calendar'] } } });
    } else if (pending.has(m.id)) { const done = pending.get(m.id); pending.delete(m.id); done(m); }
  });
  const timeout = setTimeout(() => child.kill(), 10000); t.after(() => clearTimeout(timeout));
  await rpc('initialize', { capabilities: { elicitation: { form: {} } } });
  const list = await rpc('tools/list', {});
  // One form, three names: the host labels a call by its tool, so setup, settings and ordinary questions need their own
  const titles = Object.fromEntries(list.result.tools.filter(tool => /question$/.test(tool.name)).map(tool => [tool.name, tool.title]));
  assert.deepEqual(titles, { onboarding_question: 'Setup question', configuration_question: 'Settings question', question: 'Your choice' });
  for (const [name, purpose] of [['onboarding_question', /first-run setup/], ['configuration_question', /tools|settings/], ['question', /creative|ordinary|everyday/]]) {
    const tool = list.result.tools.find(t => t.name === name);
    assert.match(tool.description, purpose, `${name} says what it is for`);
    assert.deepEqual(tool.inputSchema, buildQuestionSchema, `${name} takes the same arguments`);
    assert.equal(tool.annotations.readOnlyHint, true);
  }
  const result = await rpc('tools/call', { name: 'question', arguments: { question: 'Connect which tools?', options: ['Gmail', 'Calendar'], multiple: true } });
  assert.equal(form.params.requestedSchema.properties.selection.type, 'array');
  assert.equal(form.params._meta, undefined);
  assert.deepEqual(JSON.parse(result.result.content[0].text), { status: 'answered', selections: ['Gmail', 'Calendar'], text: '' });
  child.stdin.end();
  await new Promise(resolve => child.on('exit', resolve));
});
