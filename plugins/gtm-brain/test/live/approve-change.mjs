// Live: a workplace change through real Codex, with the APPROVE form answered by this harness.
// A scratch brain, a read-only thread, the checkout's MCP server. Codex is asked to change the company's
// one-liner; it must propose the change and call approve_change, whose form arrives here. "Not now" must
// leave admin.md untouched; APPROVE must apply and commit it. No Desktop UI is exercised.
//   node plugins/gtm-brain/test/live/approve-change.mjs        (about 2-4 minutes, uses your Codex sign-in)
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const plugin = fileURLToPath(new URL('../..', import.meta.url));
const root = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-approve-live-')));
// The brain's own writes (the list of known brains, preferences) go to a throwaway profile, never the person's.
// Codex itself keeps the real profile: it needs the sign-in.
const profile = mkdtempSync(join(tmpdir(), 'gtm-approve-live-profile-'));
execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false']);
execFileSync('bash', [join(plugin, 'scripts/gtm-brain-setup/setup.sh'), '--company', 'Approve Co', '--one-liner', 'returns automation', '--owner', 'Ann Lee <ann@approve.example>'],
  { cwd: root, env: { ...process.env, PLUGIN_ROOT: plugin, CODEX_HOME: profile }, stdio: 'ignore' });
const admin = () => readFileSync(join(root, 'brain/admin.md'), 'utf8');
const before = admin();

const server = spawn('codex', ['app-server', '--stdio', '-c', 'features.apps=false',
  '-c', 'mcp_servers.gtm_approve_test.command="node"',
  '-c', 'mcp_servers.gtm_approve_test.args=' + JSON.stringify([join(plugin, 'server/server.mjs')]),
  '-c', 'mcp_servers.gtm_approve_test.env.GTM_BRAIN_NO_SESSION_MAINTENANCE="1"',
  '-c', `mcp_servers.gtm_approve_test.env.CODEX_HOME=${JSON.stringify(profile)}`,
  '-c', 'mcp_servers.gtm_approve_test.tool_timeout_sec=240'], { stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map(), forms = [], completions = [], messages = [], tools = [], events = [];
let seq = 0, stderr = '', fatal;
const record = (kind, d = {}) => { const row = { time: new Date().toISOString(), kind, ...d }; events.push(row); console.log(JSON.stringify(row).slice(0, 600)); };
const send = m => server.stdin.write(JSON.stringify(m) + '\n');
const call = (method, params) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); send({ id, method, params }); });
const pause = ms => new Promise(r => setTimeout(r, ms));
const until = async check => { const end = Date.now() + 180000; while (!check()) { if (fatal) throw fatal; if (Date.now() > end) throw Error('Expected event did not arrive'); await pause(100); } };
server.stderr.on('data', d => { stderr += d; });
server.on('error', e => { fatal = e; });
createInterface({ input: server.stdout }).on('line', line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id !== undefined && !m.method) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } return; }
  if (m.method === 'mcpServer/elicitation/request') { forms.push(m); record('form', { message: m.params.message, options: m.params.requestedSchema?.properties?.selection?.enum }); }
  else if (m.method === 'turn/completed') { completions.push(m.params.turn); record('completed', { status: m.params.turn.status }); }
  else if (m.method === 'item/completed' && m.params.item.type === 'agentMessage') { messages.push(m.params.item.text); record('message', { text: m.params.item.text }); }
  else if (m.method === 'item/completed' && m.params.item.type === 'mcpToolCall') { tools.push(m.params.item.tool); record('tool', { tool: m.params.item.tool, status: m.params.item.status }); }
  else if (m.id !== undefined) { send({ id: m.id, error: { code: -32601, message: 'Only GTM Brain forms are answered in this test' } }); record('refused_request', { method: m.method }); }
});
const watchdog = setTimeout(() => { fatal = Error('Test exceeded eight minutes'); server.kill(); }, 480000);
const answer = (form, choice) => { record('answer', { choice }); send({ id: form.id, result: { action: 'accept', content: { selection: choice } } }); };
try {
  await call('initialize', { clientInfo: { name: 'gtm_approve_live', version: '1' }, capabilities: { experimentalApi: true } }); send({ method: 'initialized', params: {} });
  const t = await call('thread/start', { cwd: root, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'on-request',
    developerInstructions: `Test of a workplace change. Use only the gtm_approve_test MCP tools, with brain ${root} and by ann-lee. Do not use the shell or edit files.` });
  const threadId = t.thread.id, settings = { model: t.model, developer_instructions: null };
  const turn = text => call('turn/start', { threadId, collaborationMode: { mode: 'default', settings }, input: [{ type: 'text', text }] });

  await turn('Change our company one-liner in the workplace info to "events for revenue teams".');
  await until(() => forms.length >= 1 || completions.length >= 1);
  assert.equal(forms.length, 1, 'approve_change must show its form; the chat must not ask for APPROVE in text');
  assert.match(forms[0].params.message, /^Apply this change to the workplace info \(brain\/admin\.md\)\?/);
  assert.match(forms[0].params.message, /events for revenue teams/);
  answer(forms[0], 'Not now');
  await until(() => completions.length >= 1);
  assert.equal(admin(), before, '"Not now" leaves admin.md as it was');
  assert.ok(tools.includes('propose_admin_change') && tools.includes('approve_change'), `tools used: ${tools.join(', ')}`);

  await turn('OK, I am ready to approve it now.');
  await until(() => forms.length >= 2 || completions.length >= 2);
  assert.equal(forms.length, 2, 'a second form for the waiting proposal');
  answer(forms[1], 'APPROVE');
  await until(() => completions.length >= 2);
  assert.match(admin(), /events for revenue teams/, 'APPROVE applied the change');
  assert.match(execFileSync('git', ['-C', root, 'log', '-1', '--format=%s'], { encoding: 'utf8' }), /^admin: change approved by ann-lee/);
  record('PASS', { scope: 'Real Codex proposed, asked through approve_change, kept the proposal on Not now, applied and committed on APPROVE. Desktop rendering not exercised.' });
} catch (e) { record('FAIL', { message: e.message }); process.exitCode = 1; }
finally { clearTimeout(watchdog); writeFileSync(join(root, 'work', 'live-events.json'), JSON.stringify(events, null, 2)); writeFileSync(join(root, 'work', 'live-stderr.log'), stderr); server.kill(); console.log('Artifacts: ' + root); }
