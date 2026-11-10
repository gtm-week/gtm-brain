# Brian's design-system starter

Brian Woloszczak and Peakout created this starter for GTM Tech Week.
GTM Brain distributes and maintains it in this repository under its original MIT licence.

`source/` is the unchanged repository snapshot at
[92882ac4a37364f9bc7549dfc4f73c3b5e1d7110](https://github.com/peakout/gtm-week-design-system/tree/92882ac4a37364f9bc7549dfc4f73c3b5e1d7110).
`source.json` records every file's SHA-256 and the downloaded archive's SHA-256.
No runtime download from Brian's repository is needed.

## Preservation contract

Keep the source snapshot unchanged. Changes to its application code, dependencies, design
architecture or technical procedures require a separate proposal and reviewable diff.
Integration is not permission to refactor, upgrade or reinterpret Brian's implementation.
The company project is intentionally customisable through his procedures.

`lib/web-starter.mjs` applies this complete packaging allowlist when creating a project:

1. Move each of the four `.agents/skills/<name>/` directories to
   `docs/workflows/<name>/`, without changing any contained bytes.
2. Remove only `scripts.postinstall` from `package.json` and
   `packages[""].hasInstallScript` from `package-lock.json`. JSON formatting uses two spaces
   and a final newline. Retain the unchanged `scripts/setup-skills.mjs` file. Dependencies,
   resolved packages and every other script stay intact.
3. Append the standard GTM Brain project pointer to `AGENTS.md`, preserving the original
   rules. The existing `CLAUDE.md` already imports it and stays unchanged.
4. Add `.gtm-brain-starter.json` for provenance, project binding and setup state. Create an
   independent local Git repository; its local exclude keeps `lib.commit`'s activity log out
   of source history. No remote, dependency installation or deployment occurs in this tool.
   Existing company skills are linked into the active host's discovery directory across
   this Git boundary. Only links to this brain's skill folders count as owned integration
   metadata; other extra files or symlinks fail the fresh-scaffold verification.

The plugin's four public skills supply company context and call the preserved project
procedures. They do not register the relocated originals as four additional skills.
Existing company projects and procedure snapshots are never replaced by plugin updates.

## Verification

Run `node --test plugins/gtm-brain/test/web-starter.test.mjs` from the repository root.
The tests reject source drift and generated-file changes outside the allowlist, exercise
interrupted setup, and check independent Git history and project reuse.

For full local acceptance, run `node plugins/gtm-brain/test/live/web-starter-smoke.mjs`.
It creates a scratch company brain, installs the pinned dependencies and Chromium, builds
the original catalogue, then builds two campaign pages sharing a new event-agenda section.
It checks three widths, keyboard interaction, button contrast and shared component reuse,
and runs Brian's unchanged screenshot and extraction scripts. It never deploys. The printed
scratch path retains its logs, screenshots and result for review.

## Optional lesson references

- [Workshop recording](https://drive.google.com/file/d/1Qoi3Ltz6h76odQbVdTqW57N72LRny5SG/view)
- [Workshop slides](https://hi.peakout.com/gtm-week-design-system-workshop)
- [Exercise prompts](https://drive.google.com/drive/folders/1j9RYAyPw0qisb1_4L6NSUGgjUUlDtMzo)

The Ramp campaign and calculator are worked examples, not shipped company content or
calculator-specific workflows. Future contributions belong in `gtm-week/gtm-brain`.
