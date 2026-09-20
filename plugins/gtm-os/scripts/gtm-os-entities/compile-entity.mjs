#!/usr/bin/env node
// Read the evidence or apply a cited entity brief. All format and write operations live in lib.
import * as lib from "../../lib/brain.mjs";
const [root = ".", ...args] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].slice(2)] = args[i + 1];
try {
  if (!lib.readAdmin(root)) throw new Error("no brain here");
  if (opt.apply) {
    const result = lib.compileEntity(root, opt.apply, { by: opt.by, as_of: opt["as-of"], brief: JSON.parse(opt.brief || "null") });
    console.log(`compiled entity: ${opt.apply} · ${result.path} · ${result.note}`);
    lib.rerender(root);
  } else if (opt.facts) {
    const { evidence, ...facts } = lib.entityFacts(root, opt.facts);
    console.log(JSON.stringify(facts, null, 2));
  } else console.log(JSON.stringify(lib.staleEntities(root), null, 2));
} catch (e) { console.error(e.message); process.exit(1); }
