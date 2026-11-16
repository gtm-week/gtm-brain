#!/usr/bin/env node
// node skill-names.mjs <brain> [--apply] [--by <handle>]
// Lists the brain's own files that still name a shipped skill gtm-brain-<name>; with --apply rewrites them to
// gtmb-<name> and commits. Run through upgrade_brain (skill_names: true) after the person said yes.
import * as lib from "../../lib/brain.mjs";
import { filesWithOldSkillNames, rewriteSkillNames } from "../../lib/skill-names.mjs";
const argv = process.argv.slice(2), root = argv[0] && !argv[0].startsWith("--") ? argv[0] : ".";
const by = argv.includes("--by") ? argv[argv.indexOf("--by") + 1] : null;
if (!argv.includes("--apply")) {
  const files = filesWithOldSkillNames(root);
  console.log(files.length ? `${files.length} file${files.length === 1 ? "" : "s"} still use the old skill names (gtm-brain-<name>): ${files.join(", ")}. Nothing was changed. On the person's yes, run again with skill_names: true.` : "No file of this brain uses the old skill names. Nothing to do.");
  process.exit(0);
}
const { changed, left } = rewriteSkillNames(root, { by });
if (changed.length) { const c = lib.commit(root, changed, `skill names: gtm-brain-<name> is gtmb-<name> in ${changed.length} file${changed.length === 1 ? "" : "s"}`); if (c) console.log(c); }
console.log(changed.length ? `Updated the skill names in ${changed.join(", ")}.` : "No file needed a change.");
if (left.length) console.log(`Left as they are, because only the owner changes them: ${left.join(", ")}. The owner's next chat offers the same update.`);
