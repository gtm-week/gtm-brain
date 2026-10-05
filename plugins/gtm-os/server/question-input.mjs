import { buildQuestion, readAnswer } from '../scripts/gtm-os-learn-company/question.mjs';

// A decline or cancel the host made itself is the host refusing to show the form: not_shown, never
// declined, and the chat asks in text. Codex marks its own answers with _meta.approvals_reviewer (Full
// access and granular mcp_elicitations=false decline every form with fields that way); other hosts and
// Codex's unmarked auto-deny paths answer faster than a person can read a form.
export const NOT_SHOWN_MS = 2000;
const byHost = result => !!result?._meta?.approvals_reviewer;
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
      if (result?.client && /^(decline|cancel)$/.test(result.result?.action) && (byHost(result.result) || now() - sentAt < NOT_SHOWN_MS)) { hidden = true; return NOT_SHOWN; }
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
