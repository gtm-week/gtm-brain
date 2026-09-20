// One lazy worker per server, never one per brain or query. SQLite work stays off MCP's loop.
import { Worker } from 'node:worker_threads';
export function createMemoryReader({ idleMs = 30000, timeoutMs = 60000, maxPending = 32 } = {}) {
  let worker = null, active = null, idle = null, next = 0;
  const queue = [];
  const stop = error => {
    clearTimeout(idle); clearTimeout(active?.timer);
    const previous = worker; worker = null;
    if (error) { active?.reject(error); for (const job of queue.splice(0)) { clearTimeout(job.timer); job.reject(error); } }
    active = null;
    return previous?.terminate();
  };
  const pump = () => {
    if (active) return;
    if (!queue.length) { idle = setTimeout(() => stop(), idleMs); idle.unref(); return; }
    clearTimeout(idle);
    if (!worker) {
      const current = new Worker(new URL('./memory-worker.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8 } }); worker = current;
      current.on('message', message => {
        if (worker !== current || !active || active.id !== message.id) return;
        clearTimeout(active.timer);
        const job = active; active = null;
        if (message.error) job.reject(new Error(message.error)); else job.resolve(message.result);
        pump();
      });
      current.on('error', error => { if (worker === current) stop(error); });
      current.on('exit', code => { if (worker === current) stop(new Error(`Memory reader exited (${code}); retry the read.`)); });
    }
    active = queue.shift();
    const { id, root, operation, args } = active;
    worker.postMessage({ id, root, operation, args });
  };
  return {
    read(root, operation, args = {}) {
      if (Buffer.byteLength(JSON.stringify(args)) > 65536) return Promise.reject(new Error('Memory query arguments exceed 64 KiB; use a smaller query.'));
      if (queue.length + Number(!!active) >= maxPending) return Promise.reject(new Error('Memory reader is busy; retry when the current reads finish.'));
      return new Promise((resolve, reject) => {
        const job = { id: ++next, root, operation, args, resolve, reject };
        job.timer = setTimeout(() => {
          const error = new Error('Memory request exceeded its time limit, including queue wait. Index checkpoints are retained; retry the read or continue memory_index refresh.');
          if (active === job) stop(error);
          else { const at = queue.indexOf(job); if (at >= 0) queue.splice(at, 1); reject(error); }
        }, timeoutMs);
        queue.push(job); pump();
      });
    },
    close() { return stop(new Error('Memory reader closed.')); },
  };
}
