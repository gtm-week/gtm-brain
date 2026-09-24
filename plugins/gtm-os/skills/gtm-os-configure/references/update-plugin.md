# GTM OS: Update the plugin

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


The person stays in the Codex app. Run the update for them; do not ask them to open a
terminal or paste commands. This works without a company brain in the current folder.

## Refresh the Allethic engine

A normal plugin update installs the Allethic engine bundled with that GTM OS version,
including its pinned `vendor/allethic/VERSION.json`. No separate engine download is needed.

For "refresh Allethic" or an explicit request to include newer upstream engine changes,
follow [engine refresh](allethic.md) in a GTM OS source checkout. This updates
the bundle and tests it before installation. If both are requested, refresh and test the
engine first, then update the plugin from the source containing those changes. An ordinary
plugin update does not independently track Allethic's main branch.

## Refresh an existing brain

For "upgrade the brain", "refresh the rules", or "update AGENTS.md", read
[brain refresh](upgrade.md) and use `upgrade_brain`. This does not update the
plugin installation.

An update run from a brain refreshes that brain too: call `update_plugin` with `mode: update`
and `brain` set to the brain folder of this chat. After a verified install, the new version's
upgrader refreshes its rules and migrations and prints its report; pass the report on in a few
lines (what moved, what was added, what stays), then the restart line. Without a brain in this
chat, omit `brain`; other brains get a one-line offer to refresh their rules when next opened.

## Check or update

During unfinished onboarding, save its accepted choices and next action before updating, following [continuation](../../gtm-os-start/references/continuation.md). Do this while the current tools still work. A missing connector may prevent saving; use the honest prepared-prompt fallback in that reference.

Call the GTM OS tool `update_plugin` with `mode: check` for a status request, or
`mode: update` when the person asks to update. An update request already authorizes the
update; do not ask again. Let Codex handle any execution permissions it requires.

The tool checks the configured `gtm-os` marketplace and installed plugin. For a Git source,
it refreshes that marketplace, checks that the candidate connector starts and lists its tools,
re-installs `gtm-os@gtm-os`, and checks the installed connector against that candidate version.
An older source version stops before installation. A broken candidate leaves the existing
installation in place. A missing registered cache can be repaired by the same update.
For a local source, it refreshes the plugin from that checkout and says so. It preserves
the configured repository and branch; it never switches a development install to master.

A newer version is noticed by itself: the session hook runs `check-version.mjs` in the
background at most once a day, and when the source holds a newer plugin the hook says
`GTM OS UPDATE available` and the dashboard shows the available version under Admin. Offer the update once in one line then; never start it without a yes.

Check mode reports the installed version, source and whether its connector can start. It does not fetch the remote,
so do not claim the plugin is up to date or that a new release is available from that result.
The version alone also cannot prove whether a refresh changed files.

Both modes report the safety locks (the hooks that refresh the brain at the start of a chat
and keep the protected files from being written directly). Codex runs a hook only while it
holds the approval for that hook's declaration, and a release that changes one drops its
approval silently, so an update puts the approval back and check only reports. Pass on the
`Safety locks:` line in one plain sentence. If it says they are not running, the person can
put them back by asking for an update again, or by reviewing them in Codex; if it says they
were not checked, say the update went through and the locks were not confirmed. Never call
the locks on when that line did not say so.

## Missing tools or an interrupted update

Do not diagnose every missing connector as a restart problem. Through Codex's shell tool,
inspect `codex plugin marketplace list --json` and
`codex plugin list --marketplace gtm-os --json`. Reuse the configured source and branch.

- If the installed version's files exist, run its `update.mjs --check`. The cache is
  `$CODEX_HOME/plugins/cache/gtm-os/gtm-os/<installed version>` (`~/.codex` when CODEX_HOME is
  unset). Use the version returned by Codex, not the highest directory name. A successful
  check plus missing chat tools calls for an app restart; it does not call for reinstalling.
- If files are missing or the check fails, carry out the requested update. If `update_plugin`
  cannot run, refresh the configured Git marketplace with
  `codex plugin marketplace upgrade gtm-os` (skip for a local source). Its reported `root`
  contains `plugins/gtm-os/scripts/gtm-os-update-plugin/update.mjs`; run that script with
  `--update` so the same candidate and installed checks apply.
- The configured release must contain that updater. If it is missing, report the incomplete
  source and stop before installation. Missing source configuration needs the installation flow.

These are shell operations with native execution permissions. Do not remove the plugin,
delete its cache, switch its source, or re-run brain setup as a repair. A restart alone
cannot restore missing files. If a retry fails, report its stage instead of looping.

## Finish in the app

Report the before and after versions and whether the source was Git or a local checkout.
After successful verification, give at most two numbered actions: quit and reopen Codex; then open the prepared chat in the same folder and press Send. For unfinished onboarding use the saved progress and resume link from [continuation](../../gtm-os-start/references/continuation.md). Do not ask them to type a continuation command or give a second checklist unless the link fails. A version change can remove the old cache
folder while the running app still holds its registration. The standalone connector check
proves the installation can start; it does not reload this chat's tools. A new chat alone
is not a reliable activation step. Continue the existing work after restart without setup.
Do not restart the app yourself or call brain migration tools from the old running server.

If they also requested a brain upgrade, tell them to continue with the [brain-refresh procedure](upgrade.md) after
restarting. Plugin updates do not edit company memories, contexts, or workplace settings.

Existing brains stay in place across consecutive releases. New workflows arrive in the
plugin; refreshing the brain also updates its persistent rules. Offer that refresh as the next step after restart, without
re-running onboarding. The refresh backs up the old files and preserves customized rules
for review instead of silently replacing them.

On failure, report the failed stage and stop. An installation failure after a successful
marketplace refresh is a partial update, not success. Do not remove the plugin, change its
source, or reset a checkout as a repair. Missing Codex or missing marketplace configuration
needs the installation flow; never guess a repository or branch.
