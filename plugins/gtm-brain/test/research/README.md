# Research skill evaluation

The tests check whether Audience Loop and Topic Analyzer make sourced, bounded decisions.
Deterministic tests run offline. Model evaluations are opt-in, consume model usage and need
an authenticated Codex CLI; they do not launch paid collection or LinkedIn actions.

## Offline checks

```sh
node --test plugins/gtm-brain/test/research-skills.test.mjs \
  plugins/gtm-brain/test/research-evidence.test.mjs \
  plugins/gtm-brain/test/up2data-onboarding.test.mjs
```

These 23 tests cover self-contained skill resources and fixture integrity; statement/speaker
attribution, nested replies, publication versus collection time, configured exclusions,
missing discussion and branch ownership; complete-draft citation validation and source-URL identity in generated answers; and the account helper's fixed free endpoint,
disabled redirects, sanitized output and error handling. They do not judge recommendation quality.

## Public Berlin evaluation

Fetch [berlin-codex-dummy](https://github.com/gtm-week/berlin-codex-dummy) at
`2a1e5c7bd6c4d47e30b7f30942bd300147b55bf7` into a separate checkout. `fixture.json` verifies
used files by SHA-256. Assess the fictional evidence as of **16 November 2026**; never enrich
its fictional identities through a real provider.

```sh
node plugins/gtm-brain/test/research/run.mjs \
  --fixture /absolute/berlin-codex-dummy --repeat 1 \
  --model gpt-6-astra --effort xhigh --timeout-ms 900000 \
  --out /absolute/local-evaluation-output
```

The runner uses the real MCP routing harness with disposable brains and isolated profiles.
It does not install the plugin or change the user's company brain. `--cases` selects cases;
`--repeat` accepts 1–3. In the standalone source project, use `research/evaluation/run.mjs`
with `--mode standalone`. Keep the model and reasoning settings fixed for comparisons.

| Case | Required behavior |
| --- | --- |
| `topics` | Source recurring questions to distinct accounts, without counting an email and call twice. |
| `list` | Analyze supplied contacts directly, without requiring Audience Loop first. |
| `timing` | Prefer the later email over stale CRM timing; retain conditions and pending approval. |
| `partial` | Distinguish explicit lack of authority from unknown authority; preserve missing evidence. |
| `identities` | Retain ambiguous/unmatched identities and apply exclusions across company aliases. |
| `exclusions` | Separate research relevance from outreach eligibility, and purchase from delivered results. |
| `live` | Recognize unpublished drafts; return no invented conversation and a useful next step. |
| `resume` | Save one authorized finding, read it on continuation, and avoid duplication or implied acceptance. |

## Optional provider-snapshot replay

`--provider-evidence` replays an authorized saved sample, with credentials withheld from the
model. It does not collect data. `provider-cases.json` supplies prompts for attribution,
direct ICP-conversation analysis, policy changes, missing/stale discussions, profiles without speech
and a separate topic sample.
Use `--cases` for the cases supported by your own manifest.

Prepare a private evidence folder with `profile.md`, `policy.json`, minimal provider snapshots,
and `manifest.json`. The manifest needs `provider`, `revision`, `as_of`, `coverage`,
`common_files`, `files` (relative path to SHA-256), and `cases` (case ID to file paths).
Optional `overrides` maps case IDs and destination filenames to hashed source files;
`as_of_by_case` supplies explicitly hypothetical review times. The runner rejects unverified
source paths or hashes before launching a model. Obtain authorization for the evidence and
model service; keep personal data and output artifacts out of the repository.

Use the command above with `--provider-evidence --fixture /absolute/private-evidence`.
The bundled reader must run successfully; topic cases must check a source quotation and
conversation cases with posts must check a contribution gate. Topic answers must also run
the reader's complete-draft citation check, then preserve the checked destinations. These trace checks establish
that the procedure ran, not that every claim is correct. The runner also rejects LinkedIn
citations absent from the supplied snapshots, preserving post and comment/reply identities;
this checks source identity, not current URL availability.

## Review and interpretation

Freeze prompts, evidence, expected outcomes, model/settings and repetitions before acceptance.
Keep `gold.json` and source-specific provider criteria outside the model's evidence workspace.
Review actual answers and traces against originals: grounding, relevance, uncertainty and
usefulness each score 0–2. Require **at least 7/8, no zero, no critical error and all execution
checks passing**. Fabricated evidence, unsupported purchasing authority, invented live threads
or unauthorized actions fail regardless of score. Review both save/resume turns. Preserve
failed attempts; do not replace them with selected successful repetitions. Distinguish fixture
or process failures from model-answer failures.

The reviewed baseline for this contribution was **16/16 Berlin runs and 54/54 provider runs**
(72 answers), using **gpt-6-astra / xhigh** in standalone and Brain modes: eight Berlin
scenarios once per mode and nine provider scenarios three times per mode. Codex reviewed the
sources; this was not an independent human evaluation. Coverage comprises 32 Topic Analyzer
and 38 Audience Loop case runs, with affected case blocks rerun after instruction changes. The draft validator checks URL
identity locally; the final-answer audit independently checks what the model actually returned. Detailed reports, hashes, token usage
and traces remain in the contributor's local audit, rather than becoming maintained plugin files.
Fresh changes need relevant reruns; the baseline is not an evergreen certification.

Berlin is publicly reproducible but has no live LinkedIn discussions. The provider sample is
private and purposive; maintainers can rerun the method with their own authorized evidence.
Neither establishes a population success rate, autonomous collection, new-account signup,
recurring-host qualification, production restart behavior or outreach outcomes. Brain resume
uses the harness's multi-turn support; standalone resume starts a fresh process. The account
helper verifies access only; paid research still needs a suitable collector and request ledger.
