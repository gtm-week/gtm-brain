#!/usr/bin/env node
// Structured lifecycle input; identity format and commits belong to the library.
//   node lifecycle.mjs <root> merge_entities '{"source": "...", "target": "...", "confirmed": true, "by": "ann"}'   one call: preview, then apply when nothing needs a choice
//   node lifecycle.mjs <root> answer_question '{"question": "m_...", "answer": "..."}'                               closes an open question; '{}' lists them
import * as lib from "../../lib/brain.mjs";
import { mergeConfirmed, answerQuestion } from "./confirmed.mjs";
const [root, operation, input] = process.argv.slice(2);
// confirmed: true is the person's word that the two are one. Without it the merge is the two-step preview and as_of.
const merge = (root, { confirmed, ...args }) => {
  if (confirmed !== undefined && typeof confirmed !== "boolean") throw new Error("confirmed must be a boolean");
  if (confirmed && args.as_of) throw new Error("Pass confirmed or as_of, not both");
  return confirmed ? mergeConfirmed(root, args) : lib.mergeEntities(root, args);
};
const operations = { update_entity: lib.updateEntity, merge_entities: merge, archive_entity: lib.archiveEntity, undo_entity_merge: lib.undoEntityMerge, answer_question: answerQuestion };
const plain = operation === "answer_question";   // its reply is a line for the person, not a record
try {
  if (!operations[operation]) throw new Error("Unknown entity operation");
  const args = JSON.parse(input);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected entity operation arguments");
  const result = operations[operation](root, args);
  console.log(plain ? result.text : JSON.stringify(result, null, 2));
  if (result.changed) { lib.kickCompile(root); lib.rerender(root); }
} catch (error) {
  console.error(plain ? error.message : JSON.stringify({ error: error.message, ...(error.repair ? { repair: error.repair } : {}) }));
  process.exitCode = error.code === 2 ? 2 : 1;
}
