// The live case for a base file the team adds (ALL-714), run through tool-routing.mjs (listed in its cases):
//   node plugins/gtm-brain/test/live/tool-routing.mjs base-file
// Two turns on the seeded fixture brain, which holds one pricing note ("Pricing is per store, not per user.").
// Turn one: "add pricing as a base file" reads document prepare, shows the draft drawn from that note and asks
// the one question, what work should follow it; nothing is written. Turn two: the answer and a yes; pricing.md
// is created as a draft through document, applying to the chosen work. Targets: five tool calls or fewer, under
// 30 seconds a turn (reported, not gated).
import { readDocument } from "../../lib/documents.mjs";

const prepared = calls => calls.some(c => c.tool === "document" && c.arguments?.action === "prepare");
const writes = calls => calls.filter(c => (c.tool === "document" && ["create", "update", "remove"].includes(c.arguments?.action)) || c.tool === "remember");
const pricing = root => { try { return readDocument(root, "pricing"); } catch { return null; } };

export const baseFileCases = [
  {
    judge: "advisory", name: "base-file", workflow: "gtmb-use-brain",
    prompt: "add pricing as a base file",
    followUps: ["1. Yes, save it."],
    calls: (calls, { turns = [] } = {}) => turns.length === 2 && prepared(turns[0].calls) && !writes(turns[0].calls).length
      && writes(turns[1].calls).length === 1 && writes(turns[1].calls)[0].arguments?.action === "create" && writes(turns[1].calls)[0].arguments?.status !== "approved",
    verify: root => { const d = pricing(root); return !!d && d.path === "pricing.md" && d.status === "draft" && d.filled && /per store/i.test(d.body) && d.applies_to.includes("proposals"); },
    responseCheck: (text, { turns = [] } = {}) => turns.length === 2 && /per store/i.test(turns[0].final) && /\?/.test(turns[0].final) && /\n\s*1[.)]/.test(turns[0].final) && /pricing\.md/.test(text),
    evidence: root => { const d = pricing(root); return d ? `DOCUMENT FILE ${d.path}:\n${JSON.stringify({ title: d.title, applies_to: d.applies_to, status: d.status, filled: d.filled })}\n${d.body}` : "(no pricing.md)"; },
    expect: "Turn one: the draft of pricing.md in full, drawn from the one pricing note the brain holds (pricing is per store, not per user) with that note listed as its source, headings with nothing known left empty rather than guessed, then exactly one question: what work should follow this document, two or three whole-answer choices, recommended first. Nothing written. Turn two, after '1. Yes, save it.': pricing.md is created as a draft applying to the first choice (proposals, outreach, landing pages), and one line says where it is and what it governs. No note is saved.",
  },
];
