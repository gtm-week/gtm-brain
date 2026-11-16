# Attio write details

Follow [routine CRM writes](crm-writes.md), then apply these Attio-specific rules.
The installed connector's schema remains authoritative.

- Keep object record attributes separate from list-entry attributes. A deal status and a
  sponsorship list stage can have different allowed values and business meanings.
- Retain only used workspace/object/list IDs, attribute types and option values in sourced,
  dated context memories tagged attio-schema. Confirm the current workspace before reuse.
- Use add-record-to-list for missing membership; use update-list-entry-by-id for a known
  entry, or update-list-entry-by-record-id where supported. Zero entries require an add when
  requested; multiple entries require resolving the intended entry. Do not guess an entry ID.
- Carry returned record and list-entry IDs forward. Verify membership and requested entry
  values independently of deal properties when the write response does not establish both.
- Link the requested notes and tasks to the intended record; confirm assignee and deadline.

Provider capability reference: https://docs.attio.com/mcp/overview (checked 2026-09-16).
Production tool schemas and response completeness must be checked on the installed connector.
