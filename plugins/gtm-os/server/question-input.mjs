import { buildQuestion, readAnswer } from '../scripts/gtm-os-learn-company/question.mjs';

// A decline or cancel faster than a person can read a form is the host refusing to show it (Codex CLI
// in some modes declines every form at once): not_shown, never declined, and the chat asks in text.
export const NOT_SHOWN_MS = 1000;
const NOT_SHOWN = { status: 'not_shown', note: 'The host closed the form before the person saw it. This is no answer: ask in plain chat text, here and for the rest of this chat.' };

// One interactive request per MCP session. No persistent state or timeout-as-answer.
export function questionInput(send, now = Date.now) {
  let supported = false, sequence = 0, pending = null, hidden = false;
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
      if (hidden) return NOT_SHOWN;
      const sentAt = now();
      const result = await new Promise((resolve, reject) => {
        const id = `gtm-question-${++sequence}`;
        pending = { id, parentId, resolve, reject };
        try { send({ jsonrpc: '2.0', id, method: 'elicitation/create', params }); }
        catch (error) { pending = null; reject(error); }
      });
      if (result?.client && /^(decline|cancel)$/.test(result.result?.action) && now() - sentAt < NOT_SHOWN_MS) { hidden = true; return NOT_SHOWN; }
      return readAnswer(args, result?.client ? result.result : result);
    },
    receive(message) {
      if (message.method || !pending || message.id !== pending.id) return false;
      const p = pending; pending = null;
      if (message.error) p.reject(Error(`Input form failed: ${message.error.message || 'client error'}`));
      else p.resolve({ client: true, result: message.result });
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
