#!/usr/bin/env node
// Read the evidence or apply a cited entity brief. All format and write operations live in lib.
import * as lib from "../../lib/brain.mjs";
import { explainFailure, recordSummaryRun } from "../../lib/summaries.mjs";
const [root = ".", ...args] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].slice(2)] = args[i + 1];
try {
  if (!lib.readAdmin(root)) throw new Error("no brain here");
  if (opt.apply) {
    const result = lib.compileEntity(root, opt.apply, { by: opt.by, as_of: opt["as-of"], brief: JSON.parse(opt.brief || "null") });
    console.log(`compiled entity: ${opt.apply} · ${result.path} · ${result.note}`);
    // every overview written counts as the last good write, so it clears an older failure on the health line
    recordSummaryRun(root, { context: who(), by: opt.by, ok: true, foreground: !!opt.checked });
    lib.rerender(root);
  } else if (opt.facts) {
    const { evidence, ...facts } = lib.entityFacts(root, opt.facts);
    console.log(JSON.stringify(facts, null, 2));
  } else console.log(JSON.stringify(lib.staleEntities(root), null, 2));
} catch (e) {
  let message = e.message;
  // The model's path (--checked, the compile_entity tool): the failure in the person's words, once, and on the
  // health line, as compile.mjs does for a topic summary. A person at a terminal reads the error itself.
  if (opt.apply && opt.checked && lib.readAdmin(root)) {
    const why = explainFailure(message, "the"), name = who();
    recordSummaryRun(root, { context: name, by: opt.by, ok: false, error: `${why.what} (${message.split("\n")[0].slice(0, 160)})`, why });
    message += `\nFor the person, once, if this attempt is the last: The ${name} overview was not saved: ${why.what}. What to do: ${why.todo.replace(/\bthe summary\b/g, "the overview")}.`;
  }
  console.error(message); process.exit(1);
}
function who() { try { return lib.resolveEntity(lib.readNames(root), opt.apply).name; } catch { return opt.apply; } }
