// Entity kinds, without imports: schema.mjs and entities.mjs both need them and import each other through
// brain.mjs, so the constants live in a module neither cycle passes through. A brain's own kinds are the
// "## <Kind>" sections of its SCHEMA.md (schema.brainKinds); these five always exist.
export const DEFAULT_KINDS = ["person", "organization", "product", "event", "tool"];
export const KIND_NAME = /^[a-z][a-z0-9_]{0,39}$/;
// Names a "## <Kind>" section cannot take, each with the fix shown to the person.
export const NOT_KINDS = {
  company: "company is an organization subtype: add a row under ### Subtypes of ## Organization",
  team: "team is an organization subtype: add a row under ### Subtypes of ## Organization",
  us: "us is our own company, already known to every relationship; remove the section",
  meeting: "meetings are not a kind: meeting evidence stays in context memories; remove the section",
  project: "projects are not a kind: a project is a project:<slug> tag on memories; remove the section",
  relationships: "Relationships is the relationship table, not a kind" };
