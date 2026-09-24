#!/usr/bin/env node
// share: "push this brain to my GitHub". Creates a private repository with gh (named after the company,
// or --name), sets it as origin and pushes everything; from then on every note and every save pushes
// there (lib.commit and lib.save push when a remote exists). A brain that already has a remote is saved
// and pushed, never re-created. Nothing is written when gh is missing or signed out: the sign-in is the
// person's own (gh auth login, gh auth setup-git), never done here.
//   node share.mjs <root> [--name <repository>]
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import * as lib from "../../lib/brain.mjs";

const args = process.argv.slice(2); const root = realpathSync(resolve(args[0] && !args[0].startsWith("--") ? args.shift() : "."));
const refuse = (why, code = 2) => { console.error(why); process.exit(code); };
if (!existsSync(join(root, "brain", "admin.md"))) refuse("no brain here (brain/admin.md missing).", 1);
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
if (opt.name === true) refuse("--name needs a value");
const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gh = (...a) => spawnSync("gh", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// gh and its sign-in: git's own GitHub credentials, which the GitHub connector inside Codex does not provide
const probe = gh("auth", "status");
if (probe.error && probe.error.code === "ENOENT") refuse("GitHub's command line tool gh is not installed. Install it (brew install gh, or https://cli.github.com), then run: gh auth login, then gh auth setup-git, then say: push this brain to my GitHub.");
if (probe.status !== 0) refuse("gh is not signed in to GitHub. In a terminal run: gh auth login, then gh auth setup-git (the GitHub connector inside Codex is a different login and does not sign git in). Then say: push this brain to my GitHub.");

// keep hand edits first, so the push carries everything
const saved = lib.save(root, "share: keep hand edits before pushing");
if (!saved.ok) refuse(`could not save before pushing: ${saved.note}`, 1);

const remotes = git("remote").split("\n").filter(Boolean);
if (remotes.length) {
  const url = git("remote", "get-url", remotes.includes("origin") ? "origin" : remotes[0]);
  const push = spawnSync("git", ["-C", root, "push", "-q", "-u", remotes.includes("origin") ? "origin" : remotes[0], "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (push.status !== 0) refuse(`This brain is already shared at ${url}, but the push failed (${(push.stderr || "").trim().split("\n")[0]}). Check the sign-in (gh auth status) and the remote, then try again.`, 1);
  lib.logActivity(root, "share", `pushed to ${url}`);
  console.log(`This brain is already shared at ${url}; pushed what was new. Every note and every save keeps going there.`);
  process.exit(0);
}

const admin = lib.readAdmin(root) || {};
const name = String(opt.name || `${lib.handleFor(String(admin.company || "company")) || "company"}-brain`).trim();
// GitHub's own rule, starting with a letter or digit: a name can never read as a flag to gh, and "--" ends its options anyway.
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) refuse(`${name} is not a valid repository name (a letter or digit first, then letters, digits, dots, hyphens, underscores).`);
const created = gh("repo", "create", "--private", "--source", root, "--remote", "origin", "--push", "--", name);
if (created.status !== 0) refuse(`gh could not create the repository ${name}: ${(created.stderr || created.stdout || "").trim().split("\n")[0]}. If the name is taken, say a different one: push this brain to my GitHub as <name>.`, 1);
const url = (created.stdout || "").trim().split("\n").find(l => /^https?:\/\//.test(l)) || git("remote", "get-url", "origin");
lib.logActivity(root, "share", `shared at ${url}`);
console.log(`Shared: ${url} (private). Everything in this brain is there now, and from now on every note and every save pushes there. Teammates: gh auth login once, then clone it and open the folder in Codex.`);
