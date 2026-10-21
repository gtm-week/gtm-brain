#!/usr/bin/env node
// update.mjs for Claude Code (lib/host.mjs names it): refresh the installed plugin through `claude plugin`.
// No brain files or brain commits are involved, apart from --brain's rules refresh by the new version.
// A third-party marketplace does not update itself in Claude Code, so this is how a new version arrives.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pluginVersion, olderVersion, verifyRuntime } from "../../lib/plugin-runtime.mjs";
import { sourceVersion } from "../../lib/plugin-source.mjs";

const args = process.argv.slice(2);
if (args[0] && !args[0].startsWith("--")) args.shift(); // MCP runner supplies its cwd.
const mode = args.shift() || "--check";
let brainArg = null;
if (args[0] === "--brain" && args[1]) { brainArg = resolve(args[1]); args.splice(0, 2); }
if (!["--check", "--update"].includes(mode) || args.length) {
  console.error("usage: update-claude.mjs [folder] --check|--update [--brain <path>]");
  process.exit(1);
}
const home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const claude = (...a) => execFileSync("claude", ["plugin", ...a], { encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const installed = () => JSON.parse(claude("list", "--json")).find(p => p.id === "gtm-os@gtm-os");
const market = () => JSON.parse(claude("marketplace", "list", "--json")).find(m => m.name === "gtm-os");
let stage = "checking the configured marketplace", installationAttempted = false;

try {
  // The MCP runner starts us inside the installed plugin, which the update replaces.
  process.chdir(home);
  let m = market();
  if (!m) throw new Error("GTM OS has no gtm-os marketplace in Claude Code. Add it: claude plugin marketplace add gtm-week/gtm-os");
  const git = m.url || m.repo;
  stage = "checking the installed plugin";
  const before = installed();
  if (before && !before.enabled) throw new Error("GTM OS is disabled. Enable it in Claude Code (/plugin) before updating.");
  console.log(`GTM OS installed version: ${before?.version || "missing"}`);
  console.log(`Source: ${git ? "Git repository" : "local checkout (no remote fetch)"}`);
  if (mode === "--check") {
    if (!before) throw new Error("GTM OS is not installed. Run the update to install it from the configured marketplace.");
    console.log("Remote not checked; this reports the installed state only.");
    stage = "checking the installed connector";
    const runtime = verifyRuntime(before.installPath, before.version);
    console.log(`Connector: GTM OS ${runtime.version} starts and lists ${runtime.tools} tools.`);
  } else {
    stage = "refreshing the marketplace";
    claude("marketplace", "update", "gtm-os");
    m = market();
    stage = "checking the candidate plugin";
    const candidateRoot = join(m.installLocation || m.path, "plugins/gtm-os");
    const candidate = pluginVersion(candidateRoot);
    if (olderVersion(candidate, before?.version)) throw new Error(`The source version ${candidate} is older than installed ${before.version}. Update stopped; check the configured source.`);
    if (git) {
      const remote = sourceVersion({ type: "git", source: git, ref: m.ref || null, codexHome: home });
      if (remote.version && olderVersion(candidate, remote.version)) throw new Error(`Claude's copy of GTM OS is ${candidate}, GitHub has ${remote.version}: Claude Code could not fetch the newer one. Usually git has no GitHub sign-in: run \`gh auth login\`, then \`gh auth setup-git\`, then say: update GTM OS.`);
      console.log(remote.version ? `Source version: ${remote.version} (Claude's copy: ${candidate}).` : `Source not reachable to compare (${remote.error}); installing Claude's copy ${candidate}.`);
    }
    verifyRuntime(candidateRoot, candidate);
    stage = "installing the refreshed plugin";
    installationAttempted = true;
    if (before) claude("update", "gtm-os@gtm-os", "--scope", before.scope || "user");
    else claude("install", "gtm-os@gtm-os");
    stage = "verifying the installed plugin";
    const after = installed();
    if (!after?.enabled) throw new Error("The refreshed plugin is not installed and enabled.");
    if (after.version !== candidate) throw new Error("Claude Code did not install the checked candidate version. Check the source and retry the update.");
    const runtime = verifyRuntime(after.installPath, candidate);
    console.log(`GTM OS refreshed: ${before?.version || "missing"} -> ${after.version}.`);
    console.log(`Connector: GTM OS ${runtime.version} starts and lists ${runtime.tools} tools.`);
    if (brainArg) {
      if (!existsSync(join(brainArg, "brain", "admin.md"))) console.log(`${brainArg} is not a brain, rules not refreshed.`);
      else {
        console.log("Refreshing this brain's rules with the new version:");
        const up = spawnSync("bash", [join(after.installPath, "scripts/gtm-os-upgrade/upgrade.sh"), brainArg], { cwd: brainArg, encoding: "utf8", timeout: 120000 });
        process.stdout.write(up.stdout || "");
        if (up.status !== 0) console.log(`The rules were not refreshed (${(up.stderr || "").trim().split("\n")[0] || `exit ${up.status}`}). Say: refresh the rules.`);
      }
    }
    console.log("Run /reload-plugins (or start a new session in this folder) to load the refreshed plugin. Brain files were not changed; continue your work without running setup again.");
  }
} catch (error) {
  // claude stderr can contain repository credentials. Report the stage and exit status only.
  const detail = error.status !== undefined || error.code ? `Claude Code command failed (${error.status ?? error.code}). Check access and retry when resolved.` : error.message;
  console.error(`GTM OS update stopped while ${stage}: ${detail}`);
  if (installationAttempted) console.error("The installation is not verified. Retry the update from the configured marketplace; do not remove the plugin or run brain setup again.");
  process.exitCode = 1;
}
