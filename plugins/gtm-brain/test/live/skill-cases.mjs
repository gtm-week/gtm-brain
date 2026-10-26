// Opt-in cases for the skills that had none: one prompt per skill, the state it must leave,
// the tools it must and must not call. Run them through the isolated Codex harness:
//   node plugins/gtm-brain/test/live/tool-routing.mjs skills            all five
//   node plugins/gtm-brain/test/live/tool-routing.mjs skill-todo        one
// The fixture is the seeded brain of tool-routing.mjs (offer, icp, strategy, market; Bergstrom
// Home, Castorama, Krzysztof Pawlak) with no tool connected. Model outcomes are evidence for
// these prompts only, never a guarantee.
// Pass or fail is decided by the deterministic checks (route, state, wording). The judge reads
// the final message and its verdict is recorded in the report as advice: on these cases it
// argued with itself between runs over wording, so it does not gate them (judge: "advisory").
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as lib from "../../lib/brain.mjs";
import { readDocument } from "../../lib/documents.mjs";
import { listUserSkills } from "../../lib/user-skills.mjs";

const asks = c => ["question", "configuration_question", "onboarding_question"].includes(c.tool);
const unchanged = (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after);
const noWrites = calls => !calls.some(c => ["remember", "new_context", "fork_context", "archive_context", "edit_context", "compile_apply", "guideline", "document", "skill", "update_entity", "merge_entities", "archive_entity"].includes(c.tool) && !(c.tool === "guideline" && ["list", "show"].includes(c.arguments?.action)) && !(c.tool === "skill" && c.arguments?.action === "list"));
const status = calls => calls.some(c => c.tool === "query" && c.arguments?.object === "status");
const firstIndex = (calls, pred) => calls.findIndex(pred);

export const skillCases = [
  {
    judge: "advisory", name: "skill-todo", workflow: "gtm-brain-todo", answer: "later|leave|skip|not now",
    prompt: "/gtm-brain-todo What is waiting on me?",
    calls: calls => status(calls) && noWrites(calls) && calls.some(asks),
    verify: unchanged,
    responseCheck: text => /Castorama/.test(text) && /Q4/i.test(text),
    expect: "The list includes the open question whether Castorama buys in Q4, with its source note in Target customers. Other items are fine when each traces to a note (the security review Bergstrom Home asked for, the proposal sent); an item with no note behind it is invented. The person is walked through the list with a question form and answers later, so nothing is written. No summary is offered as a todo, and no tool is claimed as checked: none is connected, and saying so is correct.",
  },
  {
    judge: "advisory", name: "skill-deepdive", workflow: "gtm-brain-deepdive",
    prompt: "/gtm-brain-deepdive Brief me on Bergstrom Home before the call. Do not save anything.",
    calls: calls => noWrites(calls) && calls.some(c => c.tool === "query" && ["brief", "entities", "memories"].includes(c.arguments?.object) && /bergstrom/i.test(JSON.stringify(c.arguments))),
    verify: unchanged,
    responseCheck: text => /security review/i.test(text) && /proposal/i.test(text) && /(Krzysztof|Chris)/.test(text) && /unknown|not connected|no tool|nothing live|no live/i.test(text),
    expect: "One page on Bergstrom Home (organization, company, in offer): where it stands, a dated timeline of the three notes (Krzysztof Pawlak owns the rollout, the security review request, the proposal sent) with their sources, people on both sides, what is open, one suggested next step. A note's source (gmail:19fa01, the send action gmail:send:19fa02) may be cited as its evidence, and the notes' author is Marta Nowak, the brain's owner, so she may be named as the one who sent the proposal. Citing a note by its context and date, or by its file, is a citation of a note, not an invention. No tool is connected: live checks are marked unavailable, nothing is invented, nothing is written.",
  },
  {
    judge: "advisory", name: "skill-document-create", workflow: "gtm-brain-document", answer: "^Add it as approved",
    prompt: "/gtm-brain-document Add our tone of voice as a document. The rules: short sentences; no exclamation marks; name the customer's problem before our product. It applies to copy and outreach. I vouch for it, and there are no real samples to test against.",
    calls: calls => {
      const create = firstIndex(calls, c => c.tool === "document" && c.arguments?.action === "create");
      const ask = firstIndex(calls, asks);
      return create >= 0 && ask >= 0 && ask < create && calls[create].arguments.status === "approved" && !calls.some(c => c.tool === "remember");
    },
    verify: root => {
      let full; try { full = readDocument(root, "tone-of-voice"); } catch { return false; } if (!full) return false;
      return full.status === "approved" && ["copy", "outreach"].every(k => full.applies_to.includes(k)) && /exclamation/i.test(full.body) && /problem/i.test(full.body);
    },
    responseCheck: text => /tone of voice/i.test(text) && /copy/i.test(text) && /outreach/i.test(text),
    evidence: root => { let d = null; try { d = readDocument(root, "tone-of-voice"); } catch {} return d ? `DOCUMENT FILE ${d.path}, written by the run through the document tool:\n${JSON.stringify({ title: d.title, applies_to: d.applies_to, status: d.status, by: d.by })}\n${d.body}` : "(no document file was written)"; },
    expect: "The final message is one or two lines: the document Tone of voice now exists, approved, at the brain root or in a folder the person named, governing copy and outreach, and Codex reads it before that kind of work from now on, in the brain and in every linked project (that sentence is the skill's own closing line, not an invention). The draft and the confirmation question happened before this message: see the form exchange, whose first option was Add it as approved and which the person accepted. The document file listed under tool results is the evidence it was written. The blind test needs real samples and the person said there are none, so skipping it is correct whether or not the final message repeats that.",
  },
  {
    judge: "advisory", name: "skill-sync-nothing-connected", workflow: "gtm-brain-sync", answer: "No|skip|later|not now",
    prompt: "/gtm-brain-sync Catch up on what's new in my tools.",
    calls: calls => noWrites(calls) && !calls.some(c => c.tool === "computer_use"),   // status may come from query or a read of the brain files
    verify: (root, run) => unchanged(root, run) && !existsSync(join(root, "work", "sync.json")),
    responseCheck: text => /gtm-brain-configure|connect/i.test(text) && !/\bchannels?\b/i.test(text),
    expect: "No tool is connected. The final message says so and either names gtm-brain-configure or, when the form exchange shows a configuration question the person declined, reports that connecting was offered and declined. No subagent is spawned, no source is invented, nothing is written and the sync checkpoint is not advanced. Mentioning that an absent checkpoint means the last 7 days is optional and correct.",
  },
  {
    judge: "advisory", name: "skill-create", workflow: "gtm-brain-skill", answer: "^(Create|Yes|Add|Save)",
    prompt: "/gtm-brain-skill Create a skill called Weekly update. It drafts the weekly account update for one customer from the brain's notes: load that customer's contexts, list what changed this week with sources, draft five lines, and ask me before saving anything.",
    calls: calls => {
      const create = firstIndex(calls, c => c.tool === "skill" && c.arguments?.action === "create");
      const ask = firstIndex(calls, asks);
      return create >= 0 && ask >= 0 && ask < create && !calls.some(c => c.tool === "remember");
    },
    verify: root => {
      const file = join(root, ".agents", "skills", "gtm-brain-weekly-update", "SKILL.md"); if (!existsSync(file)) return false;
      const md = readFileSync(file, "utf8");
      return /^name: gtm-brain-weekly-update$/m.test(md) && /sources?/i.test(md) && listUserSkills(root).some(s => s.id === "gtm-brain-weekly-update");
    },
    responseCheck: text => /\/gtm-brain-weekly-update/.test(text) && /quit|reopen|restart/i.test(text),
    evidence: root => { const file = join(root, ".agents", "skills", "gtm-brain-weekly-update", "SKILL.md"); return existsSync(file) ? `SKILL FILE .agents/skills/gtm-brain-weekly-update/SKILL.md, written by the run through the skill tool:\n${readFileSync(file, "utf8")}` : "(no skill file was written)"; },
    expect: "The final message names the /gtm-brain-weekly-update command and says Codex must be quit and reopened before it is listed. The draft (title, description, steps) and its confirmation happened before this message: see the form exchange, which the person accepted. The skill file listed under tool results is the evidence it was written through the skill tool; the final message need not repeat its path. Nothing is written by hand or to a context.",
  },
];
