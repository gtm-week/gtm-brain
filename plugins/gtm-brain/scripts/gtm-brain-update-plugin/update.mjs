#!/usr/bin/env node
// Refresh the installed plugin only. No brain files or brain commits are involved.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { hookTrust, trustSummary } from "../../hooks/trust-hooks.mjs";
import { pluginVersion, olderVersion, verifyRuntime } from "../../lib/plugin-runtime.mjs";
import { sourceVersion, retiredSource, SHIPPING_SOURCE } from "../../lib/plugin-source.mjs";

const args = process.argv.slice(2);
if (args[0] && !args[0].startsWith("--")) args.shift(); // MCP runner supplies its cwd.
const mode = args.shift() || "--check";
// --brain <path>: after a verified update, refresh that brain's rules with the newly installed upgrader
let brainArg = null;
if (args[0] === "--brain" && args[1]) { brainArg = resolve(args[1]); args.splice(0, 2); }
if (!["--check", "--update"].includes(mode) || args.length) {
  console.error("usage: update.mjs [folder] --check|--update [--brain <path>]");
  process.exit(1);
}
let stage = "checking the configured marketplace";
const codexHome = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const codex = (...args) => execFileSync("codex", ["plugin", ...args], {
  encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});
const installed = () => JSON.parse(codex("list", "--marketplace", "gtm-brain", "--json"))
  .installed?.find(p => p.pluginId === "gtm-brain@gtm-brain");
const cached = version => {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("The installed plugin has no valid version. Run the update to repair it.");
  return join(codexHome, "plugins/cache/gtm-brain/gtm-brain", version);
};
let installationAttempted = false;
const RETIRED_NOTE = "the retired gtm-week/onboarding repository (frozen at 0.26.0)";

try {
  // The MCP runner starts us inside the installed plugin. Codex may remove that folder
  // during add; later commands and hook approval must not inherit a deleted cwd.
  process.chdir(codexHome);
  const configured = () => JSON.parse(codex("marketplace", "list", "--json"))
    .marketplaces?.find(m => m.name === "gtm-brain");
  let market = configured();
  let source = market?.marketplaceSource;
  if (!source || !["git", "local"].includes(source.sourceType)) {
    throw new Error("GTM Brain has no supported configured marketplace source. Use the installation flow.");
  }
  // Upgrading the retired source never reaches a newer release: an update moves the install to the one that ships.
  const retired = source.sourceType === "git" && retiredSource(source.source || source.url || source.repo);
  if (retired && mode === "--check") console.log(`Source: ${RETIRED_NOTE}; say: update GTM Brain, and it moves to ${SHIPPING_SOURCE}.`);
  if (retired && mode === "--update") {
    stage = "moving to the current source";
    const old = source.source || source.url || source.repo, ref = source.ref || source.branch;
    codex("marketplace", "remove", "gtm-brain");
    try { codex("marketplace", "add", SHIPPING_SOURCE); }
    catch (error) {
      // Leave the person with the source they had, never with none.
      try { codex("marketplace", "add", old, ...(ref ? ["--ref", ref] : [])); } catch {}
      throw error;
    }
    market = configured(); source = market?.marketplaceSource;
    if (!source) throw new Error(`Codex did not register ${SHIPPING_SOURCE}. Retry the update.`);
    console.log(`Source: moved from ${RETIRED_NOTE} to ${SHIPPING_SOURCE}.`);
  }
  stage = "checking the installed plugin";
  const before = installed();
  // Codex omits an installed entry entirely when its cache directory has disappeared.
  // The configured marketplace still supplies the repair path for an explicit update.
  if (!before && mode === "--check") throw new Error("GTM Brain has no installed files. Run the update to repair it from the configured marketplace.");
  if (before && !before.enabled) throw new Error("GTM Brain is disabled. Enable it in Codex before updating.");
  console.log(`GTM Brain installed version: ${before?.version || "missing"}`);
  console.log(`Source: ${source.sourceType === "git" ? "Git repository (configured branch/ref preserved)" : "local checkout (no remote fetch)"}`);
  // A hook runs only while Codex holds the trust for its declaration, and a changed hooks.json
  // silently drops it: check every time, and put it back as part of an update the person asked for.
  const safety = async trust => {
    try { console.log(trustSummary(await hookTrust({ trust }))); }
    catch (error) { console.log(`Safety locks: not checked (${error.message}).`); }
  };
  if (mode === "--check") {
    console.log("Remote not checked; this reports the installed state only.");
    stage = "checking the installed connector";
    const runtime = verifyRuntime(cached(before.version), before.version);
    console.log(`Connector: GTM Brain ${runtime.version} starts and lists ${runtime.tools} tools.`);
    await safety(false);
  } else {
    if (source.sourceType === "git") {
      stage = "refreshing the marketplace";
      codex("marketplace", "upgrade", "gtm-brain");
    }
    // Check the candidate before replacing the working installation. The marketplace owns
    // its cached checkout; the updater never changes its source, branch or Git worktree.
    stage = "checking the candidate plugin";
    if (!market.root) throw new Error("The configured marketplace has no checkout path. Check its configuration and retry.");
    const candidateRoot = join(market.root, "plugins/gtm-brain");
    const candidate = pluginVersion(candidateRoot);
    if (olderVersion(candidate, before?.version)) throw new Error(`The source version ${candidate} is older than installed ${before.version}. Update stopped; check the configured source.`);
    // Codex's marketplace copy is a snapshot: when git could not fetch (no GitHub sign-in for git,
    // offline), "upgrade" leaves it where it was and the copy is behind the source. Compare before
    // installing an old version and calling it an update.
    if (source.sourceType === "git") {
      const remote = sourceVersion({ type: "git", source: source.source || source.url || source.repo, ref: source.ref || source.branch || null, codexHome });
      if (remote.version && olderVersion(candidate, remote.version)) throw new Error(`Codex's copy of GTM Brain is ${candidate}, GitHub has ${remote.version}: Codex could not fetch the newer one. Usually git has no GitHub sign-in (the GitHub connector in Codex is a different login): run \`gh auth login\`, then \`gh auth setup-git\`, then say: update GTM Brain.`);
      console.log(remote.version ? `Source version: ${remote.version} (Codex's copy: ${candidate}).` : `Source not reachable to compare (${remote.error}); installing Codex's copy ${candidate}.`);
    }
    verifyRuntime(candidateRoot, candidate);
    stage = "installing the refreshed plugin";
    installationAttempted = true;
    codex("add", "gtm-brain@gtm-brain");
    stage = "verifying the installed plugin";
    const after = installed();
    if (!after?.installed || !after.enabled) throw new Error("The refreshed plugin is not installed and enabled.");
    if (after.version !== candidate) throw new Error("Codex did not install the checked candidate version. Check the source and retry the update.");
    const runtime = verifyRuntime(cached(after.version), candidate);
    console.log(`GTM Brain refreshed: ${before?.version || "missing"} -> ${after.version || "unknown"}.`);
    console.log(`Connector: GTM Brain ${runtime.version} starts and lists ${runtime.tools} tools.`);
    await safety(true);
    // One step for the person: the brain they updated from gets the new rules and migrations at once, run by the
    // version just installed (the old one does not know them). Other brains get the one-line offer when opened.
    if (brainArg) {
      if (!existsSync(join(brainArg, "brain", "admin.md"))) console.log(`${brainArg} is not a brain, rules not refreshed.`);
      else {
        console.log("Refreshing this brain's rules with the new version:");
        const up = spawnSync("bash", [join(cached(after.version), "scripts/gtm-brain-upgrade/upgrade.sh"), brainArg], { cwd: brainArg, encoding: "utf8", timeout: 120000 });
        process.stdout.write(up.stdout || "");
        if (up.status !== 0) console.log(`The rules were not refreshed (${(up.stderr || "").trim().split("\n")[0] || `exit ${up.status}`}). Say: refresh the rules.`);
      }
    }
    console.log("Quit and reopen the Codex app, then start a new chat in the same project or brain folder to load the refreshed plugin. Brain files were not changed; continue your work without running setup again.");
  }
} catch (error) {
  // Codex stderr can contain repository credentials. Report the stage and exit status only.
  const detail = error.status !== undefined || error.code
    ? `Codex command failed (${error.status ?? error.code}). Check access and retry when resolved.`
    : error.message;
  console.error(`GTM Brain update stopped while ${stage}: ${detail}`);
  if (installationAttempted) console.error("The installation is not verified. Retry the update from the configured marketplace; do not remove the plugin or run brain setup again.");
  else if (mode === "--check") console.error("If the installed connector is missing or broken, say: update GTM Brain. A restart alone cannot repair missing plugin files.");
  process.exitCode = 1;
}
