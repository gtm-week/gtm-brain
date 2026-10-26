const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
// Opt-in diagnostic for the inspected Desktop build, not a browser or E2E test.
// Supply a trusted, locally extracted app-initial-86767c3d23e5.js bundle.
// This executes extracted functions in a VM; do not supply untrusted JavaScript.
if (!process.argv[2]) throw new Error('Usage: node question-renderer.cjs <trusted extracted app-initial bundle>');
const source = fs.readFileSync(process.argv[2], 'utf8');
const tokens = ['sP','oP','cP','lP','uP','jI','jE'];
const key = (token, value) => token + JSON.stringify(value);
const values = new Map();
const store = {
 get(token, value) {
  if (token === 'uP') return this.get('lP', value)?.selectedQuestionKey ?? null;
  if (token === 'jI') return 'inProgress';
  if (token === 'jE') return true;
  return values.get(key(token, value)) ?? (token === 'oP' ? [] : null);
 },
 set(token, value, state) { values.set(key(token, value), state); }
};
const context = vm.createContext(Object.fromEntries(tokens.map(t => [t,t])));
context.dy = (_, fn) => fn();
for (const name of ['wor','Tor','Dor','Oor','kor']) {
 const start = source.indexOf(`function ${name}(`);
 const end = source.indexOf('function ', start + 9);
 assert(start >= 0 && end > start, `Missing ${name}`);
 vm.runInContext(source.slice(start, end), context);
}
const stateStart = source.indexOf('Ior=zy(Q,');
const stateEnd = source.indexOf(',{owner:', stateStart);
assert(stateStart >= 0 && stateEnd > stateStart);
const state = vm.runInContext('(' + source.slice(stateStart + 'Ior=zy(Q,'.length, stateEnd) + ')', context);
const thread = {hostId:'test',threadId:'test'};
const turn = {...thread,entityKey:'turn'};
const question = {...turn,itemId:'language'};
const status = () => state(question, {get:store.get.bind(store)});
context.wor(store, turn, [{id:'language'}], 'turn', 1000, true);
assert.equal(store.get('cP', question).deadlineMs, 31000);
assert.equal(status(), 'asking');
context.kor(store, question, 31000);
assert.equal(status(), 'answer');
assert.equal(store.get('cP', question).lastSubmission, null);
context.Tor(store, question);
assert.equal(store.get('cP', question).deadlineMs, null);
context.wor(store, turn, [{id:'language'}], 'turn', 40000, true);
context.Oor(store, question);
assert.equal(store.get('cP', question).deadlineMs, null);
context.kor(store, question, 70000);
assert.notEqual(store.get('lP', thread), null);
console.log('PASS: auto-open, 30s deadline, collapse to Answer question without answer, reopen cancels deadline, interaction invalidates stale timer');
