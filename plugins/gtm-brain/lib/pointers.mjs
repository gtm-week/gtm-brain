/* Source pointers: one spelling per provider. Notes store {kind, ref} (plus an optional account for a
   second mailbox or workspace); kinds were free text, so "HubSpot", "hubspot" and a pasted HubSpot URL
   named the same record three ways. normalizeKind and normalizeSource give the one spelling on write
   and on every read that compares sources. Stored notes are never rewritten: readers normalize. */

// Short forms people write that are not the connector's name. connect.mjs matches tool names with
// the same table, so a source kind and a connector agree.
export const SHORT = { calendar: "google-calendar", gcal: "google-calendar", drive: "google-drive", gdrive: "google-drive", contacts: "google-contacts", outlook: "outlook-email", email: "gmail", mail: "gmail", crm: null };

// Source-kind spellings beyond the connector short forms.
const ALIASES = { "google-mail": "gmail", "google drive": "google-drive", "google calendar": "google-calendar", "google-docs": "google-drive", gdocs: "google-drive" };

export function normalizeKind(kind) {
  const k = String(kind ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!k) return k;
  // Own keys only: "constructor" or "toString" as a kind must stay a string.
  const own = (table, key) => Object.hasOwn(table, key) ? table[key] : null;
  return own(SHORT, k) || own(ALIASES, k) || own(ALIASES, k.replace(/-/g, " ")) || k;
}

// Known record URLs: host -> provider kind and the stable id in the path or fragment.
const HOSTS = [
  { host: "app.hubspot.com", kind: "hubspot", id: u => { const m = u.pathname.match(/\/record\/([^/]+)\/(\d+)/) || u.pathname.match(/\/(contact|company|deal|ticket)\/(\d+)/); return m ? `${m[1]}/${m[2]}` : null; } },
  { host: "app.attio.com", kind: "attio", id: u => { const m = u.pathname.match(/\/(person|people|company|companies|deal|deals|record)\/([0-9a-f-]{8,}|[^/]+)(?:\/|$)/i) || u.pathname.match(/\/([^/]+)\/record\/([^/]+)/); if (!m) return null; const o = { person: "people", company: "companies", deal: "deals" }[m[1].toLowerCase()] || m[1]; return `${o}/${m[2]}`; } },
  { host: "mail.google.com", kind: "gmail", id: u => { const m = u.hash.match(/\/([A-Za-z0-9]{12,})$/); return m ? m[1] : null; } },
  { host: "drive.google.com", kind: "google-drive", id: u => { const m = u.pathname.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/) || u.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/); return m ? m[1] : u.searchParams.get("id"); } },
  { host: "docs.google.com", kind: "google-drive", id: u => { const m = u.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/); return m ? m[1] : null; } },
  { host: "notes.granola.ai", kind: "granola", id: u => { const m = u.pathname.match(/\/(?:d|t|p)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; } },
];

/* A URL on a known host as {kind, ref}, or null. ref is the provider's stable id. */
export function urlPointer(text) {
  let u; try { u = new URL(String(text).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = HOSTS.find(x => x.host === u.hostname.toLowerCase());
  if (!h) return null;
  const ref = h.id(u);
  return ref ? { kind: h.kind, ref } : null;
}

/* One source in its canonical spelling, as a list: a known URL becomes the provider pointer and the URL
   stays as an extra url source, so nothing that was given is lost. A doubled prefix
   ("attio:attio:people/9", or kind attio with ref "attio:people/9") loses its repeat. */
export function normalizeSource(source) {
  if (!source || typeof source !== "object") return [];
  let kind = normalizeKind(source.kind), ref = String(source.ref ?? "").trim();
  const extra = source.account !== undefined && source.account !== null && String(source.account).trim() ? { account: String(source.account).trim().toLowerCase() } : {};
  for (;;) {
    const colon = ref.indexOf(":");
    if (colon < 1 || /^https?:\/\//i.test(ref) || normalizeKind(ref.slice(0, colon)) !== kind) break;
    ref = ref.slice(colon + 1).trim();
  }
  if (kind === "url" || /^https?:\/\//i.test(ref)) {
    const p = urlPointer(ref);
    if (p && (kind === "url" || kind === p.kind)) return [{ kind: p.kind, ...extra, ref: p.ref }, { kind: "url", ref }];
  }
  return [{ kind, ...extra, ref }];
}

/* The comparison key of a source: kind, account (when given) and ref. */
export const pointerKey = s => { const [n] = normalizeSource(s); return n ? `${n.kind}:${n.account ? n.account + "/" : ""}${n.ref}` : ""; };
// The kind alone, normalized, for readers that compare providers.
export const sourceKind = s => normalizeSource(s)[0]?.kind ?? "";
// Every canonical pointer of a source list, url extras included, without duplicates.
export function normalizeSources(list = []) {
  const out = new Map();
  for (const s of Array.isArray(list) ? list : []) for (const n of normalizeSource(s)) out.set(JSON.stringify([n.kind, n.account || "", n.ref]), n);
  return [...out.values()];
}
/* Parse "kind:ref" (as the reference view takes it) into a canonical pointer. */
export function parsePointer(text) {
  const t = String(text ?? "").trim();
  if (/^https?:\/\//i.test(t)) return normalizeSource({ kind: "url", ref: t })[0];
  const colon = t.indexOf(":");
  if (colon < 1) return null;
  const [n] = normalizeSource({ kind: t.slice(0, colon), ref: t.slice(colon + 1) });
  return n && n.kind && n.ref ? n : null;
}
// account is optional: a non-empty string up to 200 characters when present.
export const accountOK = s => s.account === undefined || (typeof s.account === "string" && s.account.trim().length > 0 && s.account.length <= 200);
/* The memory index's source members: each canonical pointer as kind:ref, and also kind:account/ref
   when an account is given, so a lookup with or without the account finds the note. */
export function sourceMembers(list = []) {
  const out = new Set();
  for (const n of normalizeSources(list)) { out.add(`${n.kind}:${n.ref}`); if (n.account) out.add(`${n.kind}:${n.account}/${n.ref}`); }
  return [...out];
}
/* A pointer's lookup key, as sourceMembers writes it. */
export const lookupKey = p => p ? `${p.kind}:${p.account ? p.account + "/" : ""}${p.ref}` : "";
/* The reference view: the entities whose references include the pointer and every note citing it.
   notes are rows the memory index returned for the pointer's source member. */
export function referenceText(pointer, entities = [], notes = []) {
  const key = lookupKey(pointer);
  const hits = entities.filter(e => (e.references || []).some(r => sourceMembers([r]).includes(key)));
  const lines = [`reference ${key}`];
  lines.push(hits.length ? `Entity: ${hits.map(e => `${e.name} (${e.id})`).join("; ")}` : "Entity: none has this reference.");
  lines.push(notes.length ? `Notes citing it (${notes.length}):` : "Notes citing it: none.");
  for (const n of notes) lines.push(`- ${n.id} ${n.context} ${n.at} ${n.kind}: ${String(n.content || "").replace(/\s+/g, " ").slice(0, 200)}`);
  return lines.join("\n");
}
