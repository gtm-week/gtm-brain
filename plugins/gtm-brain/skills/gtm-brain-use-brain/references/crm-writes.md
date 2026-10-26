# Routine CRM writes

Use for a bounded CRM request such as adding a sponsor and a follow-up. The available
connector's input schema is authoritative; names below identify capabilities, not guaranteed
installed tool names or REST argument shapes. Discover the relevant tools together when the
host supports it, then reuse their definitions for this task. Keep native permissions intact.

## Resolve only what the request needs

Use the loaded context's workflow and previously verified mappings. Retrieve missing relevant
memories once through recall (CRM account, workflow, fields and pipeline/list mappings in the relevant
context) before the first write. If recall has no mapping, read only the required definitions;
never guess a status or use a rejected write to discover allowed values. Do not reread a context
or record already available in this turn. Do not run
connection setup or whoami on every task: establish the current connection's workspace and
user only when absent or changed. A teammate's saved identity cannot identify this connection.

Use known record IDs, otherwise follow [entity search](entity-search.md): a scoped search per unresolved
person/company, one useful fallback after a miss, and candidate details only when needed to
resolve identity. Independent reads can run together. Search existing opportunities in the
relevant company/event scope before creating one. A similar name alone does not prove identity.
Use upsert only with a verified matching attribute supported by this connector, never an
invented email/domain or a guessed unique name. Update only requested or required fields.

## Reuse small account mappings

Retain only configuration actually used: provider and account ID, object/pipeline/list IDs or slugs, required
attribute names/types and exact status/option values. Use existing context memories with a
provider source pointer, evidence date and the provider tag (attio-schema or hubspot-schema). Keep business meanings
(for example, which event a sponsorship belongs to) explicit. Do not copy complete schemas,
credentials, permissions or an entire member directory into the brain.

Reuse a mapping only for the same confirmed provider and account. Read definitions only for a missing
field/object/pipeline/list. Refresh the affected mapping on a schema rejection, a reported configuration
change, or conflicting current evidence; an empty record search alone is not a schema failure.
Save corrections append-only through remember with retracts, preserving source and scope.
Batch genuinely new mappings with the outcome at the end; do not save unchanged mappings again.

## Write, confirm, finish

- Use create-record/update-record or supported upsert for the requested records. Carry IDs
  from successful responses into dependent calls. Do not search again for a just-written record.
- Create the requested note/task with the confirmed record, assignee and deadline. Independent
  operations may run together once their dependencies are known, within connector limits.
- Inspect each write result. If it establishes the ID and requested values, that is sufficient
  confirmation. If values are omitted, read the affected record/entry/task once by ID. Do not
  repeat a final readback pass. A success label alone does not prove omitted values were saved.
- A timeout may follow a committed write. Resolve whether it happened before retrying a
  create; never blindly replay a non-idempotent write. If still uncertain, report that uncertainty
  and the unfinished part. Preserve successful work and do not claim all steps succeeded.
- Save the relevant outcomes and new mappings together through one remember batch. When the
  meeting-capture procedure requires an anchor first, retain that prerequisite, then batch the
  linked outcomes. Give a short result with returned source links. Do not add dashboard, broad
  enrichment, sync or summary-compilation work.

## Provider details

Read [Attio writes](attio-writes.md) for Attio or [HubSpot writes](hubspot-writes.md)
for HubSpot before writing. These are workflow instructions, not a new connector or API.
If a required capability is unavailable, preserve completed work and report the precise gap.
Do not treat another provider's mappings as compatible or silently switch to a browser.
