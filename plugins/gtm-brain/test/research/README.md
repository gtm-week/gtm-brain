# Topic and audience skill evaluation

These opt-in tests run real Codex against existing files from
[berlin-codex-dummy](https://github.com/gtm-week/berlin-codex-dummy), pinned to
`2a1e5c7bd6c4d47e30b7f30942bd300147b55bf7`. `fixture.json` verifies every used file by SHA-256.
The evidence snapshot is 16 November 2026. Fetch that revision into a separate scratch checkout;
the runner does not fetch data, use real connectors, enrich fictional identities or install a plugin.

In LinkedIn Agent, use `node research/evaluation/run.mjs`. In GTM Brain, use
`node plugins/gtm-brain/test/research/run.mjs`; Brain mode and the local plugin are its defaults.

```sh
node research/evaluation/run.mjs --fixture /absolute/berlin-codex-dummy \
  --mode standalone --repeat 2 --out /absolute/eval-standalone
node research/evaluation/run.mjs --fixture /absolute/berlin-codex-dummy \
  --mode brain --plugin /absolute/gtm-checkout/plugins/gtm-brain \
  --repeat 2 --out /absolute/eval-brain
```

`--cases topics,list,timing,partial,identities,exclusions,live,resume` selects cases. `--baseline`
points Brain mode at a preserved plugin build while retaining the same cases. `--model` defaults
to the existing Brain evaluation harness's `gpt-5.6-luna` (or `GTM_BRAIN_EVAL_MODEL`). Keep it
fixed for comparisons. The runner consumes model usage; it is not part of the ordinary offline
test suite. It needs an authenticated Codex CLI. Source files are read only; case outputs and
scratch brains are disposable. Production Brain operations are proxied to the scratch brain
by the existing `test/live/tool-routing.mjs` harness. No real company brain is touched.

## Acceptance

`cases.json` contains realistic requests, not answers. `gold.json` is only for evaluation and
must never be copied into the skill's evidence workspace. No additional LinkedIn mock threads
are generated. The two sample posts are unpublished workshop drafts: a correct live case
returns a source-access gap, not a positive conversation recommendation.

Record a baseline before revising the skills, then run each final case twice in each mode.
Inspect final answers and traces. Score grounding, relevance, uncertainty handling and usefulness
from 0 to 2 each using `gold.json`, citing actual answer passages and source evidence in the
review. Require at least 7/8 with no zero dimension and every mechanical check passing.
Fabricated evidence, unsupported authority, invented live discussion or unauthorized external
action fails a case regardless of the total. The existing optional LLM judge is advisory;
its absence does not supply a semantic pass. No result is accepted until review is recorded.

Keep the report's model, source revisions, fixture revision, per-case timings, token usage,
outputs and tool traces. Distinguish process/tool failures from skill failures and do not drop
failed attempts. `resume` tests an explicit single save and subsequent read without duplicate
records. Brain mode uses the harness's existing multi-turn conversation support; standalone
mode starts a fresh process without passing the prior answer. Neither is a production restart test.

The corpus supports topic research, candidate qualification, ambiguity, exclusions and missing
thread access. It does not validate real collectors, live-thread selection, host-audience
qualification, scheduling or delivery. Passing this fixture is bounded evidence, not a claim
of production recommendation quality.

The [reviewed implementation results](results.md) retain the initial failures and targeted
corrections. [Structured results](results.json) include scores, answer excerpts, output hashes,
evaluated skill hashes, timing and token usage. Raw runs remain local and are never copied
into the skill's evidence workspace.
