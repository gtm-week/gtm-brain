# Move an existing installation to GTM Brain

GTM Brain was previously installed as `gtm-os`. Version 0.31.0 changes the public name,
marketplace, plugin, MCP server and built-in commands. Your brain files keep their existing
format and location. Historical notes and custom skills are preserved.

The project is now [gtm-week/gtm-brain](https://github.com/gtm-week/gtm-brain), with its website at
[gtm-brain.ai](https://gtm-brain.ai/). GitHub redirects the former project URL.

## Codex

Use the [guided installer](INSTALL.md), or run this explicit migration:

```bash
migration_dir="$(mktemp -d "${TMPDIR:-/tmp}/gtm-brain-migrate.XXXXXX")"
git clone --depth 1 https://github.com/gtm-week/gtm-brain.git "$migration_dir/source"
node "$migration_dir/source/scripts/migrate-install.mjs" codex
```

The migration installs `gtm-brain@gtm-brain`, verifies its connector and enables its safety
hooks, then removes the old `gtm-os@gtm-os` registration. A failed verification keeps the old
plugin. If the new installation already exists, it is verified before anything is retired.

Restart Codex, open the **same working folder** and ask to refresh the brain rules. The normal
upgrade process backs up old instructions and pauses on personal edits. Do not run setup again.

## Claude Code

From the working folder where Claude Code uses the existing plugin, download and run:

```bash
migration_dir="$(mktemp -d "${TMPDIR:-/tmp}/gtm-brain-migrate.XXXXXX")"
git clone --depth 1 https://github.com/gtm-week/gtm-brain.git "$migration_dir/source"
node "$migration_dir/source/scripts/migrate-install.mjs" claude
```

This verifies the new connector before uninstalling the old plugin, retaining its installation
scope and project location. Existing plugin data is kept. Restart Claude Code or run `/reload-plugins`, then open the same folder and refresh the
brain rules. The existing beta limitations still apply.

## Compatibility

- New built-in commands use `/gtm-brain-*`; update copied prompts that call `/gtm-os-*`.
- Existing linked-project pointers and user-created `gtm-os-*` skills remain readable and usable.
- Old instruction snapshots stay unchanged so upgrades can distinguish shipped rules from personal edits.
- Working-folder names, memories, entities and workplace settings are not renamed by the installer.
- Legacy environment settings are accepted by the Node runtime; prefer `GTM_BRAIN_*` for new configuration.
- Existing scheduled commands that name an old installed path should be updated to the verified new installation. The installer does not rewrite a personal schedule.

Future updates use the `gtm-brain` marketplace. The previous marketplace registration can be
removed in the host after the new installation is verified; it is not a second active plugin.
