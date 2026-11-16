// The live cases for gtmb-voice, run through tool-routing.mjs (skill-cases.mjs lists them):
//   node plugins/gtm-brain/test/live/tool-routing.mjs skill-voice          two turns: asks whose voice, then drafts and asks
//   node plugins/gtm-brain/test/live/tool-routing.mjs skill-voice-save     the request settles whose voice and says save: it saves
// The fixture brain has no website and no tool connected. codex exec has no question box, so a question is plain
// chat text that ends the turn. skill-voice: the first turn only asks whose voice it is (nothing read into a draft,
// nothing written); the second turn answers "the company's" and pastes three public posts with their links, and
// the draft comes back with the save question, still unwritten. skill-voice-save: the answer and the yes are in the
// request, so it saves voice.md as a draft, names what it governs and the sentence for a new chat, and offers the
// fresh-work test. The gates are exported so voice.test.mjs checks them without a model.
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
/* The first turn asks whose voice it is: the company's against a person's or a team's, as a question. */
export const whoseVoiceAsked = text => { const t = String(text || ""); return /\bcompany('s)?\b/i.test(t) && /\b(own|personal|team)\b/i.test(t) && /\?/.test(t); };
/* A draft in the structure the evidence supports (no fixed headings): rules under at least one heading, at
   least one sentence quoted word for word from the posts, and at least two of their links as sources. */
export function voiceBodyChecks(body, posts = VOICE_POSTS) {
  const text = String(body || "").replace(/[“”]/g, '"');
  const rules = text.split("\n").filter(l => /\S/.test(l) && !/^#/.test(l)).length;
  const sentences = posts.flatMap(p => p.text.split(/(?<=\.)\s+/));
  return /^#+ \S/m.test(text) && rules >= 4
    && sentences.some(s => text.includes(s))
    && posts.filter(p => text.includes(p.url)).length >= 2;
}
/* The saved document on top: concise, says whose voice it is near the top, and holds no private source reference. */
export const voiceDocChecks = body => voiceBodyChecks(body) && String(body).length <= 6000
  && /\bcompany\b/i.test(String(body).slice(0, 400)) && !/\b(gmail|slack|outlook):\S/i.test(String(body));
const voiceDoc = root => { try { return readDocument(root, "voice"); } catch { return null; } };
const evidence = root => { const d = voiceDoc(root); return d ? `DOCUMENT FILE ${d.path} after the run:\n${JSON.stringify({ title: d.title, applies_to: d.applies_to, status: d.status, filled: d.filled, by: d.by })}\n${d.body}` : "(no voice.md)"; };
const posts = VOICE_POSTS.map((p, i) => `${i + 1}. ${p.url}: "${p.text}"`).join("\n");
const COMPANY = "The company's voice: one standard for everything we publish and send.";

export const voiceCases = [
  {
    judge: "advisory", name: "skill-voice", workflow: "gtmb-voice",
    prompt: "/gtmb-voice Draft our tone of voice.",
    followUps: [`${COMPANY} Our website is offline today and no mail or Slack is connected; use these three public posts of ours, each with its link:\n${posts}`],
    calls: (calls, { turns = [] } = {}) => voiceRoute(calls) && (turns.length < 2 || !turns[0].calls.some(voiceWrite)),
    verify: root => { const d = voiceDoc(root); return !!d && !d.filled; },
    responseCheck: (text, { turns = [] } = {}) => turns.length === 2 && whoseVoiceAsked(turns[0].final) && !voiceBodyChecks(turns[0].final)
      && voiceBodyChecks(text) && /save it as a draft/i.test(text) && /\bchange\b/i.test(text.split(/save it as a draft/i).pop()),
    evidence,
    expect: "Turn one: before reading anything into a draft, one question whose voice this is, the company's (recommended, one standard for what it publishes and sends) against a person's or a team's, with one line on why, then the turn ends. Turn two, after the answer and three pasted posts: what was reviewed (three public posts) and what is missing (website, sent mail; internal chat is not evidence of a company voice), a small-corpus warning, then the whole draft in the structure the posts support, observed rules apart from any suggestion, quoted lines copied word for word with their links. It ends with one question offering Save it as a draft (recommended) and Change something. Nothing is written: voice.md is still the starter.",
  },
  {
    judge: "advisory", name: "skill-voice-save", workflow: "gtmb-voice",
    prompt: `/gtmb-voice Draft our tone of voice and save it as a draft when it is ready; I accept it without another question. ${COMPANY} Our website is offline today and no mail or Slack is connected; use these three public posts of ours instead, each with its link:\n${posts}`,
    calls: calls => voiceRoute(calls, { save: true }),
    verify: root => { const d = voiceDoc(root); return !!d && d.filled && d.status === "draft" && voiceDocChecks(d.body) && d.applies_to.includes("posts"); },
    responseCheck: text => /voice\.md/i.test(text) && /gtmb-voice/.test(text) && /new chat/i.test(text) && /\bposts\b/i.test(text) && /\b(email|post)\b[^?]*\?/i.test(text) && !/\bis (now )?in use\b/i.test(text),
    evidence,
    expect: "Whose voice is settled by the request (the company's), so no question asks it. voice.md, the starter setup wrote, is filled in place as a draft (no second voice document), using the yes given in the request without asking again: concise, first line saying it is the company's voice and what it governs, rules from the posts with quoted lines copied word for word and their links. The final message names voice.md and the kinds of work it applies to, gives one sentence to type in a new chat to see it followed without claiming it is already in use, offers to test the guide on one short real email or post, and says /gtmb-voice revises it. Nothing is saved as a note.",
  },
];
