# CRM write evaluation (ALL-200)

Run `node plugins/gtm-os/test/live/tool-routing.mjs attio-write` from the repository to select
known configuration, missing configuration, and recovery (stale stage plus a task timeout
after saving). This consumes real Codex inference using the existing sign-in, but all CRM
operations run against an isolated synthetic connector. No production records are accessed.
Set `GTM_OS_EVAL_DIR` to a directory under this repository's `work/` for artifacts.

The fixture has two people with the same name at different companies. It persists CRM state
beside the MCP trace. The oracle checks identity, one deal/list entry, a call note and one offer
task assigned to the right member on the requested date. Repeated creates remain duplicates,
so unsafe retries fail the state check. The user prompt contains no expected tool sequence.

These tool schemas are evaluation contracts, not a dump of the installed Attio app. Reports
include executed Attio calls by category, repeated reads, errors, per-call proxy timings and
total agent time. Proxy timing excludes real Attio network latency and human approvals, which
remain unmeasured. Tool-name mentions are not executions. Inspect traces and final answers.

## Before and after

Keep both plugin builds immutable. The same harness supplies both with identical fixtures:

```sh
node plugins/gtm-os/test/live/attio-write-benchmark.mjs /absolute/baseline/plugin /absolute/candidate/plugin 5
```

The driver alternates baseline/candidate order, uses fresh fixtures and saves all runs under
`work/all-200/benchmark/`. Use the same `GTM_OS_EVAL_MODEL` for both builds. Failed runs stay
in the report. Correctness and routing are separate: the baseline may be correct but inefficient.
Skipped answer judging is not a judged pass. Provider/judge failures are reported, not hidden.

The warm case requires no discovery, repeated reads or dashboard work. Meeting capture can
require an anchor followed by one batch of linked outcomes; preserve that dependency.
The initial target is 30% lower median elapsed time with every outcome correct, reported per
scenario. Five runs are an initial sample, not a statistical guarantee. A small sample or failed
run does not establish a speed improvement. Validate against designated test records through
the installed connector before claiming faster production Attio writes.

## Limits

The simulation exercises routing, relationships, schema errors and uncertain-write recovery.
It does not reproduce OAuth, real response formats, network latency, approvals, concurrent CRM
edits or eventual consistency. It exposes a harmless computer-use competitor, not Desktop UI.
It does not prove the installed connector exposes these exact inputs or complete write results.

## HubSpot

Run `node plugins/gtm-os/test/live/tool-routing.mjs hubspot-write` for the same three
configuration scenarios. The HubSpot fixture requires separate deal/contact/company and
activity associations, pipeline-scoped stage IDs and an owner ID distinct from the user ID.
Recovery includes a stale stage, a failed association and a committed task with a timeout.
The outcome oracle rejects wrong contacts, missing links, duplicate records and wrong owners.

For the same sequential before/after driver, set `GTM_OS_CRM_PROVIDER=hubspot`:

```sh
GTM_OS_CRM_PROVIDER=hubspot node plugins/gtm-os/test/live/attio-write-benchmark.mjs /absolute/baseline/plugin /absolute/candidate/plugin 5
```

HubSpot reports account identity checks separately from property/pipeline discovery. A current
connection check is valid when its identity is not yet in the turn evidence.
Reports use `median_connector_calls` for either provider. Run one evaluation at a time;
never run this benchmark alongside the full test suite. For deterministic fixture checks:

```sh
node --test --test-concurrency=1 plugins/gtm-os/test/attio-write-fixture.test.mjs plugins/gtm-os/test/hubspot-write-fixture.test.mjs
```

HubSpot contracts are synthetic too. No real HubSpot connection or performance is established
by these tests. The baseline must predate the shared CRM instructions for a useful comparison.
