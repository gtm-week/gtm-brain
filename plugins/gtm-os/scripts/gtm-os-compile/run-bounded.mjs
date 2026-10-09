// Terminate the model's process group on timeout or cancellation, including its children.
import { spawn } from 'node:child_process';
const [command, ...args] = process.argv.slice(2);
const timeout = Number(process.env.GTM_OS_COMPILE_TIMEOUT_MS || 900000);
if (!command || !Number.isFinite(timeout) || timeout <= 0 || timeout > 86400000) {
  console.error('GTM_OS_COMPILE_TIMEOUT_MS must be between 1 and 86400000'); process.exit(2);
}
const grouped = process.platform !== 'win32';
const child = spawn(command, args, { detached: grouped, stdio: ['inherit', 'inherit', 'inherit'] });
let stopping = false, status = 1, force;
const signal = name => { try { grouped ? process.kill(-child.pid, name) : child.kill(name); } catch (e) { if (e.code !== 'ESRCH') console.error(e.message); } };
function stop(code) {
  if (stopping) return;
  stopping = true; status = code; signal('SIGTERM');
  // Keep the grace timer alive even if the leader exits: descendants may ignore TERM.
  force = setTimeout(() => { signal('SIGKILL'); process.exitCode = status; }, 1000);
}
const timer = setTimeout(() => { console.error(`Compilation timed out after ${timeout}ms`); stop(124); }, timeout);
process.on('SIGTERM', () => stop(143)); process.on('SIGINT', () => stop(130));
child.on('error', e => { clearTimeout(timer); console.error(e.message); process.exitCode = 1; });
child.on('exit', (code, sig) => { clearTimeout(timer); if (!stopping) process.exitCode = code ?? (sig ? 1 : 0); });
