import { buildQuestion, readAnswer } from '../scripts/gtm-os-learn-company/question.mjs';

// One interactive request per MCP session. No persistent state or timeout-as-answer.
export function questionInput(send) {
  let supported = false, sequence = 0, pending = null;
  return {
    initialize(capabilities = {}) {
      const e = capabilities?.elicitation;
      supported = !!e && typeof e === 'object' && (Object.hasOwn(e, 'form') || Object.keys(e).length === 0);
    },
    available() { return supported; },
    async ask(args, parentId) {
      const params = buildQuestion(args);
      if (!supported) throw Error('This client does not support MCP input forms. Use an available question control or the dashboard.');
      if (pending) throw Error('A question is already pending. Wait for its answer or cancellation.');
      const result = await new Promise((resolve, reject) => {
        const id = `gtm-question-${++sequence}`;
        pending = { id, parentId, resolve, reject };
        try { send({ jsonrpc: '2.0', id, method: 'elicitation/create', params }); }
        catch (error) { pending = null; reject(error); }
      });
      return readAnswer(args, result);
    },
    receive(message) {
      if (message.method || !pending || message.id !== pending.id) return false;
      const p = pending; pending = null;
      if (message.error) p.reject(Error(`Input form failed: ${message.error.message || 'client error'}`));
      else p.resolve(message.result);
      return true;
    },
    cancel(parentId) {
      if (!pending || pending.parentId !== parentId) return;
      const p = pending; pending = null;
      send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: p.id, reason: 'Question tool cancelled' } });
      p.resolve({ action: 'cancel' });
    },
    close() {
      if (!pending) return;
      const p = pending; pending = null;
      p.reject(Error('Client disconnected before answering. No answer was recorded.'));
    },
  };
}
