/* Source pointers: one spelling per provider and one entry per record. Notes store
   {kind, account?, ref, url?}: account is a second mailbox, workspace or portal; url is the direct link
   exactly as it was given, kept on the same entry and never part of identity. Kinds were free text, so
   "HubSpot", "hubspot" and a pasted HubSpot URL named the same record three ways. normalizeKind and
   normalizeSource give the one spelling on write and on every read that compares sources. Stored notes
   are never rewritten: readers normalize, and a note from 0.35.0 that holds the pointer plus a separate
   url entry for the same link reads as that one record. */

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

// Known record URLs: host -> provider kind, the stable id in the path or fragment, and the account when
// the path carries one (HubSpot: the portal id after the first segment; Attio: the workspace slug first).
const ATTIO_ID = u => u.pathname.match(/\/(person|people|company|companies|deal|deals|record)\/([0-9a-f-]{8,}|[^/]+)(?:\/|$)/i) || u.pathname.match(/\/([^/]+)\/record\/([^/]+)/);
const HOSTS = [
  { host: "app.hubspot.com", kind: "hubspot", account: u => u.pathname.match(/^\/[^/]+\/(\d+)\//)?.[1] ?? null, id: u => { const m = u.pathname.match(/\/record\/([^/]+)\/(\d+)/) || u.pathname.match(/\/(contact|company|deal|ticket)\/(\d+)/); return m ? `${m[1]}/${m[2]}` : null; } },
  { host: "app.attio.com", kind: "attio", account: u => { const m = ATTIO_ID(u); return m && m.index > 0 ? u.pathname.split("/")[1] || null : null; }, id: u => { const m = ATTIO_ID(u); if (!m) return null; const o = { person: "people", company: "companies", deal: "deals" }[m[1].toLowerCase()] || m[1]; return `${o}/${m[2]}`; } },
  { host: "mail.google.com", kind: "gmail", id: u => { const m = u.hash.match(/\/([A-Za-z0-9]{12,})$/); return m ? m[1] : null; } },
  { host: "drive.google.com", kind: "google-drive", id: u => { const m = u.pathname.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/) || u.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/); return m ? m[1] : u.searchParams.get("id"); } },
  { host: "docs.google.com", kind: "google-drive", id: u => { const m = u.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/); return m ? m[1] : null; } },
  { host: "notes.granola.ai", kind: "granola", id: u => { const m = u.pathname.match(/\/(?:d|t|p)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; } },
];

/* A URL on a known host as {kind, account?, ref}, or null. ref is the provider's stable id. */
export function urlPointer(text) {
  let u; try { u = new URL(String(text).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = HOSTS.find(x => x.host === u.hostname.toLowerCase());
  if (!h) return null;
  const ref = h.id(u);
  if (!ref) return null;
  let account = null; try { account = h.account ? decodeURIComponent(h.account(u) || "").trim().toLowerCase() : null; } catch {}
  return { kind: h.kind, ...(account ? { account } : {}), ref };
}
// A direct link worth keeping on an entry: an http or https URL, as a string.
export const linkOK = v => { if (typeof v !== "string" || !/^https?:\/\//i.test(v) || /\s/.test(v)) return false; try { new URL(v); return true; } catch { return false; } };
// url is optional: an http or https link when present.
export const urlOK = s => s.url === undefined || linkOK(s.url);

/* One source in its canonical spelling, as a list of one entry: {kind, account?, ref, url?}. A link on a
   known host becomes the provider pointer and stays on the same entry as url, exactly as given; the
   account comes from the link when its path carries one, unless one was given. A doubled prefix
   ("attio:attio:people/9", or kind attio with ref "attio:people/9") loses its repeat. */
export function normalizeSource(source) {
  if (!source || typeof source !== "object") return [];
  let kind = normalizeKind(source.kind), ref = String(source.ref ?? "").trim();
  const extra = source.account !== undefined && source.account !== null && String(source.account).trim() ? { account: String(source.account).trim().toLowerCase() } : {};
  const url = linkOK(source.url) ? { url: source.url } : {};
  for (;;) {
    const colon = ref.indexOf(":");
    if (colon < 1 || /^https?:\/\//i.test(ref) || normalizeKind(ref.slice(0, colon)) !== kind) break;
    ref = ref.slice(colon + 1).trim();
  }
  if (kind === "url" || /^https?:\/\//i.test(ref)) {
    const p = urlPointer(ref);
    if (p && (kind === "url" || kind === p.kind)) return [{ kind: p.kind, ...(extra.account ? extra : p.account ? { account: p.account } : {}), ref: p.ref, url: ref }];
  }
  return [{ kind, ...extra, ref, ...url }];
}

/* The comparison key of a source: kind, account (when given) and ref. Never the url. */
export const pointerKey = s => { const [n] = normalizeSource(s); return n ? `${n.kind}:${n.account ? n.account + "/" : ""}${n.ref}` : ""; };
/* The keys of a list of sources that are read together as records: pointerKey, except that a pointer
   without an account takes the account of the same kind and ref when the list names exactly one. A
   record link carries its portal or workspace and a stored kind:ref often does not; side by side they
   are one record. */
export function recordKeys(list = []) {
  const all = list.map(s => normalizeSource(s)[0] || null), accounts = new Map();
  for (const n of all) if (n?.account) { const k = `${n.kind}:${n.ref}`; accounts.set(k, (accounts.get(k) || new Set()).add(n.account)); }
  return all.map(n => { if (!n) return ""; const named = accounts.get(`${n.kind}:${n.ref}`), account = n.account || (named?.size === 1 ? [...named][0] : ""); return `${n.kind}:${account ? account + "/" : ""}${n.ref}`; });
}
// The kind alone, normalized, for readers that compare providers.
export const sourceKind = s => normalizeSource(s)[0]?.kind ?? "";
/* Every canonical pointer of a source list, without duplicates. Identity is kind, account and ref: two
   entries that differ only in url are one pointer and the first url stays. An older note's pair (the
   pointer without an account, then the same record's link as a url entry) is one pointer too: the
   link's entry folds into the stored one. */
export function normalizeSources(list = []) {
  const out = new Map(), key = n => JSON.stringify([n.kind, n.account || "", n.ref]);
  for (const s of Array.isArray(list) ? list : []) for (const n of normalizeSource(s)) {
    const had = out.get(key(n));
    if (had) { if (!had.url && n.url) had.url = n.url; } else out.set(key(n), { ...n });
  }
  for (const [k, n] of [...out]) {
    if (!n.account || !n.url) continue;
    const linked = urlPointer(n.url), bare = out.get(key({ kind: n.kind, ref: n.ref }));
    if (!bare || !linked || linked.kind !== n.kind || linked.ref !== n.ref || linked.account !== n.account) continue;
    out.delete(key(bare));
    out.set(k, { kind: n.kind, account: n.account, ref: n.ref, url: bare.url || n.url });
  }
  return [...out.values()];
}
/* True when a source list holds the pointer: same kind and ref, and the same account unless either
   side has none (a record link names its portal or workspace; a stored kind:ref often does not). */
export const citesPointer = (list, p) => !!p && (sourceMembers(list).includes(lookupKey(p)) || normalizeSources(list).some(n => n.kind === p.kind && n.ref === p.ref && (!n.account || !p.account || n.account === p.account)));
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
  const hits = entities.filter(e => citesPointer(e.references || [], pointer));
  const lines = [`reference ${key}`];
  lines.push(hits.length ? `Entity: ${hits.map(e => `${e.name} (${e.id})`).join("; ")}` : "Entity: none has this reference.");
  lines.push(notes.length ? `Notes citing it (${notes.length}):` : "Notes citing it: none.");
  for (const n of notes) lines.push(`- ${n.id} ${n.context} ${n.at} ${n.kind}: ${String(n.content || "").replace(/\s+/g, " ").slice(0, 200)}`);
  return lines.join("\n");
}
