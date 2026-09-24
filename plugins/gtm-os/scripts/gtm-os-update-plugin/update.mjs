#!/usr/bin/env node
// Refresh the installed plugin only. No brain files or brain commits are involved.
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { hookTrust, trustSummary } from "../../hooks/trust-hooks.mjs";
import { pluginVersion, olderVersion, verifyRuntime } from "../../lib/plugin-runtime.mjs";
import { sourceVersion } from "../../lib/plugin-source.mjs";

const args = process.argv.slice(2);
if (args[0] && !args[0].startsWith("--")) args.shift(); // MCP runner supplies its cwd.
const mode = args.shift() || "--check";
if (!["--check", "--update"].includes(mode) || args.length) {
  console.error("usage: update.mjs [folder] --check|--update");
  process.exit(1);
}
let stage = "checking the configured marketplace";
const codexHome = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const codex = (...args) => execFileSync("codex", ["plugin", ...args], {
  encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});
const installed = () => JSON.parse(codex("list", "--marketplace", "gtm-os", "--json"))
  .installed?.find(p => p.pluginId === "gtm-os@gtm-os");
const cached = version => {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("The installed plugin has no valid version. Run the update to repair it.");
  return join(codexHome, "plugins/cache/gtm-os/gtm-os", version);
};
let installationAttempted = false;

try {
  // The MCP runner starts us inside the installed plugin. Codex may remove that folder
  // during add; later commands and hook approval must not inherit a deleted cwd.
  process.chdir(codexHome);
  const market = JSON.parse(codex("marketplace", "list", "--json"))
    .marketplaces?.find(m => m.name === "gtm-os");
  const source = market?.marketplaceSource;
  if (!source || !["git", "local"].includes(source.sourceType)) {
    throw new Error("GTM OS has no supported configured marketplace source. Use the installation flow.");
  }
  stage = "checking the installed plugin";
  const before = installed();
  // Codex omits an installed entry entirely when its cache directory has disappeared.
  // The configured marketplace still supplies the repair path for an explicit update.
  if (!before && mode === "--check") throw new Error("GTM OS has no installed files. Run the update to repair it from the configured marketplace.");
  if (before && !before.enabled) throw new Error("GTM OS is disabled. Enable it in Codex before updating.");
  console.log(`GTM OS installed version: ${before?.version || "missing"}`);
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
    console.log(`Connector: GTM OS ${runtime.version} starts and lists ${runtime.tools} tools.`);
    await safety(false);
  } else {
    if (source.sourceType === "git") {
      stage = "refreshing the marketplace";
      codex("marketplace", "upgrade", "gtm-os");
    }
    // Check the candidate before replacing the working installation. The marketplace owns
    // its cached checkout; the updater never changes its source, branch or Git worktree.
    stage = "checking the candidate plugin";
    if (!market.root) throw new Error("The configured marketplace has no checkout path. Check its configuration and retry.");
    const candidateRoot = join(market.root, "plugins/gtm-os");
    const candidate = pluginVersion(candidateRoot);
    if (olderVersion(candidate, before?.version)) throw new Error(`The source version ${candidate} is older than installed ${before.version}. Update stopped; check the configured source.`);
    // Codex's marketplace copy is a snapshot: when git could not fetch (no GitHub sign-in for git,
    // offline), "upgrade" leaves it where it was and the copy is behind the source. Compare before
    // installing an old version and calling it an update.
    if (source.sourceType === "git") {
      const remote = sourceVersion({ type: "git", source: source.source || source.url || source.repo, ref: source.ref || source.branch || null, codexHome });
      if (remote.version && olderVersion(candidate, remote.version)) throw new Error(`Codex's copy of GTM OS is ${candidate}, GitHub has ${remote.version}: Codex could not fetch the newer one. Usually git has no GitHub sign-in (the GitHub connector in Codex is a different login): run \`gh auth login\`, then \`gh auth setup-git\`, then say: update GTM OS.`);
      console.log(remote.version ? `Source version: ${remote.version} (Codex's copy: ${candidate}).` : `Source not reachable to compare (${remote.error}); installing Codex's copy ${candidate}.`);
    }
    verifyRuntime(candidateRoot, candidate);
    stage = "installing the refreshed plugin";
    installationAttempted = true;
    codex("add", "gtm-os@gtm-os");
    stage = "verifying the installed plugin";
    const after = installed();
    if (!after?.installed || !after.enabled) throw new Error("The refreshed plugin is not installed and enabled.");
    if (after.version !== candidate) throw new Error("Codex did not install the checked candidate version. Check the source and retry the update.");
    const runtime = verifyRuntime(cached(after.version), candidate);
    console.log(`GTM OS refreshed: ${before?.version || "missing"} -> ${after.version || "unknown"}.`);
    console.log(`Connector: GTM OS ${runtime.version} starts and lists ${runtime.tools} tools.`);
    await safety(true);
    console.log("Quit and reopen the Codex app, then start a new chat in the same project or brain folder to load the refreshed plugin. Brain files were not changed; continue your work without running setup again.");
  }
} catch (error) {
  // Codex stderr can contain repository credentials. Report the stage and exit status only.
  const detail = error.status !== undefined || error.code
    ? `Codex command failed (${error.status ?? error.code}). Check access and retry when resolved.`
    : error.message;
  console.error(`GTM OS update stopped while ${stage}: ${detail}`);
  if (installationAttempted) console.error("The installation is not verified. Retry the update from the configured marketplace; do not remove the plugin or run brain setup again.");
  else if (mode === "--check") console.error("If the installed connector is missing or broken, say: update GTM OS. A restart alone cannot repair missing plugin files.");
  process.exitCode = 1;
}
