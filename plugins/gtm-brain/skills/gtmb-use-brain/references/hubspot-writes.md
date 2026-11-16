# HubSpot write details

Follow [routine CRM writes](crm-writes.md), then apply these HubSpot-specific rules.
Discover the installed connector's actual capabilities and schemas; REST capabilities do not
prove that this connector exposes them. Do not invent tool names or arguments.

## Resolve properties and identity

- Scope retained configuration to the confirmed HubSpot account/portal and object type, tagged
  hubspot-schema with a HubSpot source pointer and evidence date. Never reuse Attio mappings.
- Reuse confirmed contact/company IDs. Otherwise search using supplied email/domain or a
  bounded name search and inspect identifying details and associations. A shared name alone
  does not identify a person. Do not overwrite existing records merely to attach a new deal.
- Resolve internal property names and enumeration values, not display labels. Resolve the
  intended pipeline ID and a stage ID belonging to that pipeline; stage labels are not IDs.
  Fetch only missing property definitions or the affected pipeline after a schema rejection.
  Do not create a property, pipeline or stage to make a routine record write succeed.
- Resolve a task assignee to the correct CRM owner ID when required. An authenticated user ID
  and an owner ID are not interchangeable. Reuse current evidence; avoid fetching all owners.

## Write records and their associations

- Check for an existing deal in the relevant company/event scope before creating one.
  Use a supported upsert only with a verified unique key; a deal name is not a unique key.
- A contact, company and deal are separate records. Set the requested associations using the
  connector's supported create-with-associations or association operation. Use returned IDs.
  Do not assume a company-name property creates an association.
- Association definitions are directional. Resolve the required from/to object pair and,
  when needed, category and type ID. Custom labels are account-specific. Use a supported
  default association when no label is requested; do not create a label or change the primary
  company unnecessarily. Reuse an existing correct association instead of adding it again.
- Attach requested notes and tasks to the intended record, using the connector's supported
  activity properties and association shape. Preserve the person's timezone when resolving a
  relative deadline; translate it into the date/timestamp format the connector requires.
- Inspect record properties and association results separately. A saved deal does not prove
  its links succeeded. If a response omits a requested association, read that association
  once. Repair only the missing link after a partial failure; never recreate the saved deal.
- On an uncertain create, use returned IDs when available and targeted record/activity reads
  before retrying. An empty search may reflect indexing delay, so it is not proof that a write
  failed. If the outcome cannot be resolved, report it and stop the dependent write.

Provider references (checked 2026-09-16):
- https://developers.hubspot.com/ai-tools/mcp
- https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide
