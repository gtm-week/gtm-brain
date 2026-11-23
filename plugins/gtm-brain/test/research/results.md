# Mock evaluation review — 23 November 2026

The accepted response and memory-state matrix has **32/32 passing case runs**: eight cases, twice in each mode,
using the targeted corrective reruns where noted below. This is not a fresh full matrix
after every correction, a production-quality claim, or evidence of a statistically measured
improvement over the preserved baseline.

All runs use `gpt-5.6-luna` and existing files from
[Berlin mock data at the pinned revision](https://github.com/gtm-week/berlin-codex-dummy/tree/2a1e5c7bd6c4d47e30b7f30942bd300147b55bf7),
with an evidence snapshot of 16 November. No synthetic LinkedIn discussions were added.
The baseline is the preserved work-in-progress plugin (0.38.5, based on `e7a0f71`),
not clean upstream. The contribution is based on upstream `56a2d8f` (0.38.1).

| Phase | Accepted / attempted | Median case time | Input / output tokens |
| --- | ---: | ---: | ---: |
| Preserved Brain baseline | 8 / 8 | 65.6 s | 2,618,995 / 23,602 |
| Initial standalone matrix | 14 / 16 | 34.9 s | 1,188,087 / 26,089 |
| Initial Brain matrix | 15 / 16 | 64.9 s | 5,442,510 / 50,865 |
| Corrected identities, standalone | 2 / 2 | 45.6 s | 114,698 / 4,281 |
| Corrected identities, Brain | 2 / 2 | 71.2 s | 500,512 / 6,437 |
| Corrected single-save/resume, Brain | 2 / 2 | 116.6 s | 1,421,825 / 9,334 |

These 46 scored runs include failures; input counts include cached input. Two additional
identity attempts could not start Codex inside the sandbox and are recorded as infrastructure
failures, not skill scores. One initial standalone missing-thread smoke run also passed.
The optional API judge was unavailable. Scores are explicit Codex review against the original
sources, not independent blinded human ratings. Each accepted response scores at least 7/8
with no zero dimension and passes its mechanical checks.

## What evaluation changed

- **Export attribution and eligibility:** both initial standalone identity answers cited
  unavailable W-source files as direct evidence and called accounts outbound eligible from
  missing exclusions. They scored 6/8. The shared method now distinguishes prepared-export
  claims from originals actually read, and requires affirmative outreach prerequisites.
  Both corrected modes pass twice. The duplicate customer remains excluded by domain.
- **Single-finding retention:** the second initial Brain continuation produced a correct
  answer, but saving also created a separate identity question about Felix. The strict state
  check failed. The wrapper now links only existing verified entities for a single finding,
  leaves unresolved names in prose, uses the supported source format, and reads back the
  saved record. Both corrective runs leave exactly one added finding and no second-turn save.
- **Rubric clarification:** the CRM explicitly marks Leonie's budget authority as No. Omar's
  authority and the actual signatory remain unknown. The rubric was clarified accordingly;
  correct answers were not penalized for reporting that distinction.

The other cases retain independent-account topic evidence, analyze a supplied list without
Audience Loop history, preserve the January timing correction without changing deal stage,
separate need from authority and host qualification, respect outreach exclusions, and refuse
to invent a live conversation from unpublished drafts. Source IDs and filenames resolve;
some rendered links remain malformed or abbreviated and receive usability deductions.

[Structured results](results.json) contain per-run scores, review reasons, actual answer
excerpts, output hashes, evaluated skill hashes, timings and token counts. Raw outputs and
tool traces remain in the local evaluation directory. Initial checks were supplemented by
a retrospective source-hash and trace audit: supplied files stayed unchanged and no external
research/delivery tools were called. Standalone workspaces contain only supplied evidence,
skills and the explicitly requested saved finding. Resume is not a production restart test.

## Code and packaging validation

- A fresh checkout of the committed standalone source initializes with empty lists, zero
  research credits and Slack disabled. No Brain checkout is present. **74 tests pass, one is skipped**.
- Both standalone skills and both Brain wrappers pass the skill validator. The offline helper
  was also exercised on original T01/T02/T06 files with exact excerpts and receipt hashes;
  inventory mode produces two themes and zero contribution recommendations.
- Full upstream Node suite: **1,555 tests executed; 1,548 passed, six failed, one TODO**.
  Registration/version expectations and two date-sensitive tests were corrected. A focused
  rerun passes **92/92**, plus the final export/fixture checks pass **2/2**.
- The two remaining failures, `use-zynt.test.mjs` (retired setup-guide expectation) and
  `zynt-setup.test.mjs` (blanket `mark_tool` prohibition), reproduce unchanged on clean
  upstream `56a2d8f`. They are not modified here. The existing summary-instruction TODO remains.
  Tests run from a scratch checkout without spaces because upstream contains encoded-path
  lookup issues; that separate work remains deferred.

The first packaged smoke returned a correct missing-thread answer but failed a separate
picker-isolation check. Setup needed a disposable seed profile, and Codex did not forward the
harness's profile environment variable to its MCP child. The runner now isolates seed setup;
the harness passes the case profile and no-watch setting explicitly in MCP configuration.
Seven seed registrations and 29 case registrations from this task were removed, preserving
other preferences; completed scratch servers were stopped. The failed isolation check is
retained in the structured report separately from the response/memory-state scores.
The corrected packaged entry point passes the same smoke case, with seed and case profiles
isolated and the real preferences file byte-for-byte unchanged across the run.
No company brain was migrated, no global plugin installed, and no provider research credits,
LinkedIn actions, schedules or delivery were used.

The corpus cannot validate positive live-thread selection, real collection, recurring host
qualification or delivery. Those require separate evidence and authorization. The original
work-in-progress checkout and all 849 preserved source-file hashes remain unchanged.
