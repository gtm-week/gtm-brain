/* Lines of a chat's opening that used to need a separate query (status) call: the brain questions still waiting
   for a person's answer. The chat start prints them, so the first real call of a chat carries them. */
import { listContexts } from "./brain.mjs";

/* "questions waiting: 2 (newest in Strategy, m_..: "...")", or "" when none. A question is open while no note
   anywhere retracts or supersedes it (an answer is saved with retracts = the question's id, rule 2b). */
export function pendingQuestionsLine(root, { max = 2 } = {}) {
  let contexts; try { contexts = listContexts(root).filter(c => c.status !== "archived"); } catch { return ""; }
  const all = contexts.flatMap(c => (c.memories || []).map(m => ({ ...m, context: c.slug, title: c.title || c.slug })));
  const closed = new Set(all.flatMap(m => [m.retracts, m.supersedes]).filter(Boolean));
  const open = all.filter(m => m.kind === "question" && (m.tags || []).includes("brain-question") && !closed.has(m.id) && !m.retracts)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!open.length) return "";
  const cut = s => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > 110 ? `${t.slice(0, 107)}...` : t; };
  const shown = open.slice(0, max).map(m => `${m.title}, ${m.id}: "${cut(m.content)}"`).join("; ");
  return `questions waiting for an answer: ${open.length} (${open.length > max ? "newest: " : ""}${shown}). Mention them only when they bear on the request or the person asks what is open; an answer is saved with retracts = the id.`;
}
