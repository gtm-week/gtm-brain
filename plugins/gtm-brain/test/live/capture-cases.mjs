// Opt-in capture cases: the person states facts in passing, never asking to save them. Two must
// end with a new note that carries a source; one (an unsent draft) must write nothing.
//   node plugins/gtm-brain/test/live/tool-routing.mjs capture            all three
//   node plugins/gtm-brain/test/live/tool-routing.mjs capture-call       one
// The fixture is the seeded brain of tool-routing.mjs. Pass or fail is decided by route and state;
// the judge is advisory, as for the skill cases.
import * as lib from "../../lib/brain.mjs";

// the prompts must not hand the model the trigger: no save, remember, keep, note or record
export const CAPTURE_TRIGGER_WORDS = /\b(save|saved|saving|remember|keep|kept|note|notes|noted|record|recorded)\b/i;

const WRITES = ["remember", "new_context", "fork_context", "edit_context", "archive_context", "add_name", "update_entity", "merge_entities", "archive_entity", "interact", "document", "skill", "compile_apply"];
const allMemories = root => lib.listContexts(root).flatMap(c => lib.effectiveMemories(lib.readMemories(root, c.slug)));
const added = (root, before) => allMemories(root).filter(m => !before.some(b => b.id === m.id));
const sourcedNote = (root, before, re) => added(root, before).some(m => re.test(m.content) && Array.isArray(m.source) && m.source.length > 0);

export const captureCases = [
  {
    name: "capture-call", judge: "advisory", workflow: "gtm-brain-use-brain",
    prompt: "Just got off a call with Chris at Bergstrom Home. Their security review passed, and they want the pilot to start on October 5 with three stores.",
    calls: calls => calls.some(c => c.tool === "remember"),
    verify: (root, { before }) => sourcedNote(root, before, /security review|pilot/i),
    expect: "A new memory about Bergstrom Home (security review passed, pilot from October 5 with three stores) attributed to the person's account of the call, with a source, linked to Krzysztof Pawlak and Bergstrom Home. The answer confirms briefly where it went.",
  },
  {
    name: "capture-decision", judge: "advisory", workflow: "gtm-brain-use-brain",
    prompt: "We agreed this morning: Castorama gets a 10 percent volume discount if they sign before December 1. Anna from finance signed off on it.",
    calls: calls => calls.some(c => c.tool === "remember"),
    verify: (root, { before }) => sourcedNote(root, before, /Castorama|discount/i),
    expect: "A new memory about the Castorama discount (10 percent, sign before December 1, finance approval by Anna) with a source naming the person as the one who reported it. No CRM or external change.",
  },
  {
    name: "capture-draft-unsent", judge: "advisory", workflow: "gtm-brain-use-brain",
    prompt: "Here is a draft I have not sent yet, and may never send:\n\n\"Hi Chris, following up on the pilot. Could we move the start to next week?\"\n\nIs the tone right? Just tell me, nothing else.",
    calls: calls => !calls.some(c => WRITES.includes(c.tool) && !(c.tool === "document" && ["list", "show", "files"].includes(c.arguments?.action)) && !(c.tool === "skill" && c.arguments?.action === "list")),
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after),
    responseCheck: text => /tone|friendly|clear|polite|short/i.test(text),
    expect: "Feedback on the tone of the unsent draft only. An unsent draft is not a fact to capture: nothing is written to the brain.",
  },
];

for (const c of captureCases) if (CAPTURE_TRIGGER_WORDS.test(c.prompt)) throw new Error(`${c.name}: prompt uses a capture trigger word`);
