#!/usr/bin/env node
// Structured lifecycle input; identity format and commits belong to the library.
import * as lib from "../../lib/brain.mjs";
const [root, operation, input] = process.argv.slice(2);
const operations = { update_entity: lib.updateEntity, merge_entities: lib.mergeEntities, archive_entity: lib.archiveEntity, undo_entity_merge: lib.undoEntityMerge };
try {
  if (!operations[operation]) throw new Error("Unknown entity operation");
  const args = JSON.parse(input);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected entity operation arguments");
  const result = operations[operation](root, args);
  console.log(JSON.stringify(result, null, 2));
  if (result.changed) { lib.kickCompile(root); lib.rerender(root); }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, ...(error.repair ? { repair: error.repair } : {}) }));
  process.exitCode = 1;
}
