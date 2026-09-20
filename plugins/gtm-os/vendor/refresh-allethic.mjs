#!/usr/bin/env node
// Vendor committed files from a local checkout; never copy uncommitted code as a pinned release.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const [checkout, ref] = process.argv.slice(2);
if (!checkout || !ref) throw new Error("usage: node vendor/refresh-allethic.mjs <local-allethic-checkout> <commit>");
const git = args => execFileSync("git", ["-C", resolve(checkout), ...args], { maxBuffer: 8 * 1024 * 1024 });
if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error("provide a full commit SHA");
const commit = git(["rev-parse", "--verify", `${ref}^{commit}`]).toString().trim();
const destination = fileURLToPath(new URL("./allethic/", import.meta.url));
const sources = git(["ls-tree", "-r", "--name-only", commit, "src/"]).toString().trim().split("\n").filter(p => /^src\/[a-z-]+\.mjs$/.test(p));
sources.push("references/review.md", "package.json");
// Read everything before writing, so an invalid ref cannot partially refresh the vendor.
const files = sources.map(source => ({ source, path: source.replace(/^src\//, ""), bytes: git(["show", `${commit}:${source}`]) }));
const manifest = { repository: "https://github.com/maciej-konczal/allethic-mcp", commit, files: {} };
for (const file of files) {
  const target = join(destination, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.bytes);
  manifest.files[file.path] = { source: file.source, sha256: createHash("sha256").update(file.bytes).digest("hex") };
}
writeFileSync(join(destination, "VERSION.json"), JSON.stringify(manifest, null, 2) + "\n");
// The engine's developer skill lands where Codex reads repository skills, never in the plugin
// people install: .agents/skills/allethic-review, pinned to the same commit.
const skillDir = fileURLToPath(new URL("../../../.agents/skills/allethic-review/", import.meta.url));
mkdirSync(skillDir, { recursive: true });
const skill = git(["show", `${commit}:.agents/skills/allethic-review/SKILL.md`]);
writeFileSync(join(skillDir, "SKILL.md"), skill);
console.log(`Vendored allethic-mcp ${commit}: ${files.length} files, and the allethic-review skill into .agents/skills`);
