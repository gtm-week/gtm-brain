# Customer discovery, inspection and refresh

Customer is an evidenced relationship of a person or company, not a new entity kind or
context. Identity lives in entities; facts and source coverage live in context memories.
Use the existing sales/account context when appropriate, otherwise Target customers (`icp`).

## Read first

For names, misspellings and ambiguous CRM matches, follow [entity search](entity-search.md).

Call `query` (customers) for the retained roster, evidence dates, source links, disagreements,
scoped coverage and suggestions based on tested connectors. It never calls a connector.
Answer inspection requests from this view immediately, explaining freshness. Check live
state only when needed for the question; do not repeat every lookup to display a known customer.

## Populate during onboarding

After connections work, establish how this business identifies customers: an explicit CRM
customer list/lifecycle classification, a paid community list, billing scope, or a roster the
person identifies. A CRM company record, an outstanding task, a meeting or an email alone does
not establish customer status. If classification is unclear, show the finding and ask one
short structured question. Quiet customers belong in the roster too.

Capture every member of the defined scope, paging in manageable batches. Discovery sampling
and sync's 20-item activity limit do not apply to customer membership or an explicit request
to save a list. Account for all requested entries; report held and failed identities.
An incidental public list encountered in research does not authorize bulk capture.

Use one `remember` batch with one finding per customer, identifying content, `sources`, and
`people` for a person or `companies` for a company. Include `customer`:

```json
{
  "entity": "Example Co",
  "status": "customer",
  "basis": "source",
  "observed_at": "2026-09-13T10:00:00Z",
  "reference": { "kind": "attio", "ref": "https://example.test/customer-record" }
}
```

This is a synthetic input example, not a real source or URL pattern. Use a record link or
stable ID actually returned by the source, and cite the evidence in `sources`. `reference`
must identify one entity, never a whole roster or a shared conversation. It is optional:
customers without CRM records belong in the same view. Other pointers stay in `sources`.
Known contact details and aliases can be added with `add_name`.

Exact source references reuse identity across imports. Similar spellings, shared mailboxes
and zero-result searches never authorize merging. Resolve held entries with the existing
question/alias procedure. Do not infer company affiliation from an event role or co-mentions.
Use `unknown` for unconfirmed relationships; `prospect`, `former_customer` and `not_customer`
also require evidence. Requested list members are not necessarily all customers.

Date `observed_at` to the evidence; importing an old event does not make it current. Repeated
identical entries are idempotent. Keep synthetic/demo evidence tagged so it cannot establish
real customer membership.

## Accept corrections and look beyond CRM

An explicit user correction is evidence immediately. Use `basis: "user"` and a
`user:<handle or conversation>` source. Include a missing customer now, then inspect the
pointed source for particulars. If it cannot be read, retain the user-confirmed relationship
and explain what remains unchecked. Correct prior evidence with `supersedes` in its original
context. Do not require a CRM record before accepting the person's correction.

Refreshes use `basis: "source"`. Never supersede or retract user-confirmed relationships
during refresh. Record conflicting evidence separately; the overview preserves the user's
correction and shows the disagreement. Absence from a list or a zero-result/failed search is
not evidence of non-customer status. Do not infer churn or delete customers from omissions.

Suggest the next useful place using `customer_overview.suggestions` and checked scopes:

| Working connection | Specific place to look |
| --- | --- |
| Email | Customer onboarding, purchase confirmations, ongoing service threads. |
| Calendar | Kickoffs and recurring account reviews; attendance is only a lead. |
| Meeting notes | Purchases, delivery, relationship descriptions and role corrections. |
| Billing | Paid invoices/subscriptions, interpreted in this business's context. |
| Documents/spreadsheets | The named customer tracker, community roster or contract register. |

Prefer the user's pointed source over another broad scan. Propose only sources that passed
a read test, naming what to look for and why. Ask for a location or short example when it
resolves a real gap. A listed connector is not verified access. A contact is not necessarily
a customer. Do not propose reconnecting a declined tool.

## Record coverage after capture

After inspecting kept/held results, use a separate `remember` call with content, sources and
`customer_coverage (recorded in a separate call after capture, never in the same call as the relationships)`: `tool`, exact named `scope`, `status` (complete, partial, unavailable),
`checked_at` (ISO UTC), `scanned` (source records read), `total` (source-reported count or null),
and `unresolved` (entries held or failed). For example, reading 20 of 50 with two identities
held is partial, scanned 20, total 50, unresolved 2. These are illustrative counts only.

Complete requires a known total, every record scanned and no unresolved entries, only within
that named scope. It never means the whole customer base is complete. Preserve the exact
scope on refresh; unavailable coverage does not clear previously known customers.

Finish onboarding with `query` (customers) and the Customers dashboard view: who was found,
links including CRM links when available, evidence dates, checked sources and coverage gaps.
Invite corrections. If sources are unavailable or the person skips, record the gap and move
on without inventing customers or repeating connection questions.
