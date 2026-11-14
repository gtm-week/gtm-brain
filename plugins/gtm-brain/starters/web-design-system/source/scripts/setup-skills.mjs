/**
 * Runs on `npm i` (postinstall). Skills live once, in .agents/skills/ (Codex reads them
 * there); Claude Code reads .claude/skills/, so each skill is linked there. Windows gets
 * a copy instead, because symlinks need admin rights there: run `npm i` again after
 * editing a skill. .claude/skills/ is gitignored.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const source = ".agents/skills";
const target = ".claude/skills";
if (!existsSync(source)) process.exit(0);

const skills = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

mkdirSync(target, { recursive: true });
/** Removes a link without touching what it points at; a Windows copy is deleted. */
const remove = (path) => {
  if (lstatSync(path).isSymbolicLink()) unlinkSync(path);
  else rmSync(path, { recursive: true });
};

for (const name of readdirSync(target)) {
  // A link to a skill that is gone goes too. A real folder stays: it may be your own.
  const path = join(target, name);
  if (!skills.includes(name) && lstatSync(path).isSymbolicLink()) unlinkSync(path);
}
for (const name of skills) {
  const link = join(target, name);
  if (readdirSync(target).includes(name)) remove(link);
  if (process.platform === "win32") cpSync(join(source, name), link, { recursive: true });
  else symlinkSync(join("..", "..", source, name), link, "dir");
}
if (skills.length) console.log(`Skills ready for Claude Code: ${skills.join(", ")}`);
