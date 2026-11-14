// The live cases for gtm-brain-voice, run through tool-routing.mjs (skill-cases.mjs lists them):
//   node plugins/gtm-brain/test/live/tool-routing.mjs skill-voice          shows the draft, asks, writes nothing
//   node plugins/gtm-brain/test/live/tool-routing.mjs skill-voice-save     the request already says save: it saves
// The fixture brain has no website and no tool connected, so the prompt hands over three public posts with
// their links. codex exec has no question box, so the confirmation is plain chat text that ends the turn; the
// first case checks that nothing is written before the answer, the second that a yes given in the request is
// used. The gates are exported so voice.test.mjs checks them without a model.
import { readDocument } from "../../lib/documents.mjs";

export const VOICE_POSTS = [
  { url: "https://example.com/blog/week-two", text: "Store rollouts fail in week two, not week one. We plan for week two." },
  { url: "https://example.com/blog/one-number", text: "One number tells you if a launch worked: repeat orders in the first 30 days." },
  { url: "https://example.com/blog/no-dashboards", text: "You do not need another dashboard. You need the three stores that are slipping, by name." },
];
const at = (calls, pred) => calls.findIndex(pred);
const voiceWrite = c => c.tool === "document" && ["update", "create"].includes(c.arguments?.action);

/* Route. The voice document is read first; nothing is created, no note is written and the screen is never
   used. save: one update of voice as a draft, after the read. Otherwise: no write at all. */
export function voiceRoute(calls, { save = false } = {}) {
  const show = at(calls, c => c.tool === "document" && c.arguments?.action === "show");
  const update = at(calls, c => c.tool === "document" && c.arguments?.action === "update" && /voice/.test(String(c.arguments?.ref || "")));
  const clean = !calls.some(c => (c.tool === "document" && c.arguments?.action === "create") || c.tool === "remember" || c.tool === "computer_use");
  if (!clean || show < 0) return false;
  return save ? update > show && calls[update].arguments?.status !== "approved" : !calls.some(voiceWrite);
}
/* A draft: the starter's headings filled, three before and after examples each with a source, and at least
   one sentence quoted word for word from the posts. */
export function voiceBodyChecks(body, posts = VOICE_POSTS) {
  const text = String(body || "").replace(/[“”]/g, '"');
  const section = name => { const m = text.match(new RegExp(`^#+ ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m")); return m ? m[1] : ""; };
  const examples = section("Examples we like");
  const sources = (examples.match(/source:?\**\s*\S+/gi) || []).length;
  const befores = (examples.match(/\bbefore\b/gi) || []).length, afters = (examples.match(/\bafter\b/gi) || []).length;
  const sentences = posts.flatMap(p => p.text.split(/(?<=\.)\s+/));
  return ["How we sound", "Do", "Do not", "Words we use"].every(h => section(h).trim().length > 0)
    && sources >= 3 && befores >= 3 && afters >= 3
    && sentences.some(s => text.includes(s))
    && posts.filter(p => examples.includes(p.url)).length >= 2;
}
const voiceDoc = root => { try { return readDocument(root, "voice"); } catch { return null; } };
const evidence = root => { const d = voiceDoc(root); return d ? `DOCUMENT FILE ${d.path} after the run:\n${JSON.stringify({ title: d.title, status: d.status, filled: d.filled, by: d.by })}\n${d.body}` : "(no voice.md)"; };
const posts = VOICE_POSTS.map((p, i) => `${i + 1}. ${p.url}: "${p.text}"`).join("\n");

export const voiceCases = [
  {
    judge: "advisory", name: "skill-voice", workflow: "gtm-brain-voice",
    prompt: `/gtm-brain-voice Draft our tone of voice. Our website is offline today and no mail or Slack is connected; use these three public posts of ours instead, each with its link:\n${posts}`,
    calls: calls => voiceRoute(calls),
    verify: root => { const d = voiceDoc(root); return !!d && !d.filled; },
    responseCheck: text => voiceBodyChecks(text) && /save it as a draft/i.test(text) && /\bchange\b/i.test(text.split(/save it as a draft/i).pop()),
    evidence,
    expect: "The final message shows the whole draft for voice.md: the tone in three words, sentence habits, what to avoid, words used and avoided, and exactly three before and after examples, each with its source link from the three posts, quoted lines copied word for word. It says the corpus is small (three samples) and that the website, mail and Slack were not read. It ends with one question offering Save it as a draft (recommended) and Change something. Nothing is written: voice.md is still the starter.",
  },
  {
    judge: "advisory", name: "skill-voice-save", workflow: "gtm-brain-voice",
    prompt: `/gtm-brain-voice Draft our tone of voice and save it as a draft when it is ready; I accept it without another question. Our website is offline today and no mail or Slack is connected; use these three public posts of ours instead, each with its link:\n${posts}`,
    calls: calls => voiceRoute(calls, { save: true }),
    verify: root => { const d = voiceDoc(root); return !!d && d.filled && d.status === "draft" && voiceBodyChecks(d.body); },
    responseCheck: text => /voice\.md/i.test(text) && /gtm-brain-voice/.test(text),
    evidence,
    expect: "voice.md, the starter setup wrote, is filled in place as a draft (no second voice document), using the yes given in the request without asking again. Its headings carry the tone in three words, sentence habits, what to avoid, words used and avoided, and exactly three before and after examples, each with its source link, quoted lines copied word for word. The final message names voice.md, says Codex reads it before copy and outreach, and that /gtm-brain-voice revises it. Nothing is saved as a note.",
  },
];
