# Refresh the bundled Allethic engine

Use this procedure when the person asks to refresh Allethic in GTM OS. Codex performs the
shell steps; the person does not need to copy commands. Work in the GTM OS source checkout,
not the installed plugin cache or a company brain.

Read `plugins/gtm-os/vendor/allethic/VERSION.json` for the current repository, commit and
file hashes. Use the requested upstream commit or ref. For "latest", resolve the upstream
default branch to a full commit SHA after fetching. If no version is specified, use its
latest merged default-branch commit and state that choice. Use an available Allethic
checkout or a scratch clone of the manifest's repository; preserve existing checkout edits.

Inspect the diff from the recorded commit to the candidate. Test that exact committed
candidate in a clean scratch checkout using its documented test command (currently
`node --test 'test/*.test.mjs'`). Do not test a dirty working tree and present it as evidence
for the committed candidate. If the commit and bundled hashes are already current, report
that and leave the bundle unchanged.

After the upstream tests pass, run from the GTM OS repository:

```sh
node plugins/gtm-os/vendor/refresh-allethic.mjs /absolute/path/to/allethic-checkout FULL_COMMIT_SHA
node --test 'plugins/gtm-os/test/*.test.mjs'
```

The existing refresh script copies committed engine files and the shared review procedure
into `plugins/gtm-os/vendor/allethic/`, records their hashes in `VERSION.json`, and carries the
engine's developer skill into `.agents/skills/allethic-review/` (repository only, never shipped). Do not
hand-edit those copies. Inspect the resulting diff for removed upstream modules as well:
the script copies files but does not prune old modules. Remove an obsolete vendored module
only after confirming that the candidate no longer supplies or imports it.

If the candidate changes tool contracts or agent routing, follow the
agent evaluation procedure in the source checkout,
`.agents/skills/gtm-os-review-tools/references/evaluation.md`.
Report upstream tests, GTM OS tests and any live evaluation separately. On a failure, stop
before installation and report the stage; a copied candidate is not a successful update.
Preserve unrelated working-tree changes.

Report the old and new engine commit and the files changed. Commit and publish only within
the user's authorized scope. If installation was requested too, return to the update skill
after the candidate passes validation: a local marketplace must point at this checkout;
a Git marketplace must contain the new bundle on its configured branch before reinstalling.
Do not claim an unpublished source refresh updated a Git-based installation. Keep the
configured source and branch, and never patch the installed cache to bypass them.
