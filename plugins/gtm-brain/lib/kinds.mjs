// Entity kinds, without imports: schema.mjs and entities.mjs both need them and import each other through
// brain.mjs, so the constants live in a module neither cycle passes through. A brain's own kinds are the
// "## <Kind>" sections of its SCHEMA.md (schema.brainKinds); these seven always exist. A meeting is a kind since
// 0.35: its page collects the notes carrying its meeting id (lib/meeting-entities.mjs). An offering (what we sell:
// what it is, its price, who it is for) is a default since 0.35 too. A project is never a kind: it is a tag.
export const DEFAULT_KINDS = ["person", "organization", "product", "event", "tool", "meeting", "offering"];
export const KIND_NAME = /^[a-z][a-z0-9_]{0,39}$/;
// Names a "## <Kind>" section cannot take, each with the fix shown to the person.
export const NOT_KINDS = {
  company: "company is an organization subtype: add a row under ### Subtypes of ## Organization",
  team: "team is an organization subtype: add a row under ### Subtypes of ## Organization",
  us: "us is our own company, already known to every relationship; remove the section",
  project: "projects are not a kind: a project is a project:<slug> tag on memories; remove the section",
  relationships: "Relationships is the relationship table, not a kind" };
