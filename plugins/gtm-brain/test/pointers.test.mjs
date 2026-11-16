import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKind, normalizeSource, normalizeSources, parsePointer, pointerKey, sourceMembers, lookupKey, citesPointer, recordKeys, referenceText, accountOK, urlOK, SHORT } from "../lib/pointers.mjs";
import { parseSources, validateMemory, sourceText } from "../lib/brain.mjs";

test("normalizeKind lowercases and maps connector short forms", () => {
  assert.equal(normalizeKind("HubSpot"), "hubspot");
  assert.equal(normalizeKind("drive"), "google-drive");
  assert.equal(normalizeKind("GDrive"), "google-drive");
  assert.equal(normalizeKind("Google Drive"), "google-drive");
  assert.equal(normalizeKind("mail"), "gmail");
  assert.equal(normalizeKind("granola"), "granola");
  assert.equal(SHORT.drive, "google-drive");
  for (const k of ["constructor", "toString", "hasOwnProperty", "crm"]) assert.equal(normalizeKind(k), k.toLowerCase());
  assert.deepEqual(parseSources(["constructor:1"]), [{ kind: "constructor", ref: "1" }]);
});

test("parseSources keeps the given ref and normalizes the kind", () => {
  assert.deepEqual(parseSources(["HubSpot:0-3/1"]), [{ kind: "hubspot", ref: "0-3/1" }]);
  assert.deepEqual(parseSources(["attio:attio:people/9"]), [{ kind: "attio", ref: "people/9" }]);
  assert.deepEqual(parseSources(["HubSpot:0-3/1", "hubspot:0-3/1"]), [{ kind: "hubspot", ref: "0-3/1" }]);
  assert.deepEqual(parseSources(["user:lukasz"]), [{ kind: "user", ref: "lukasz" }]);
});

test("a known record link is one entry: the provider pointer with the link kept as url", () => {
  const attio = "https://app.attio.com/acme/person/0a1b2c3d-4e5f-6789-abcd-ef0123456789/overview";
  assert.deepEqual(parseSources([attio]), [{ kind: "attio", account: "acme", ref: "people/0a1b2c3d-4e5f-6789-abcd-ef0123456789", url: attio }]);
  const hs = "https://app.hubspot.com/contacts/123456/record/0-1/42";
  assert.deepEqual(parseSources([hs]), [{ kind: "hubspot", account: "123456", ref: "0-1/42", url: hs }]);
  const gmail = "https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWbcdefgh", drive = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", granola = "https://notes.granola.ai/d/abc-123";
  assert.deepEqual(parseSources([gmail]), [{ kind: "gmail", ref: "FMfcgzQXJWbcdefgh", url: gmail }]);
  assert.deepEqual(parseSources([drive]), [{ kind: "google-drive", ref: "1AbCdEfGhIjKlMnOp", url: drive }]);
  assert.deepEqual(parseSources([granola]), [{ kind: "granola", ref: "abc-123", url: granola }]);
  // a kind prefix with a link follows the same rule when the host is that kind's; another host keeps the link as the ref
  assert.deepEqual(parseSources([`gmail:${gmail}`]), [{ kind: "gmail", ref: "FMfcgzQXJWbcdefgh", url: gmail }]);
  assert.deepEqual(parseSources([`HubSpot:${hs}`]), [{ kind: "hubspot", account: "123456", ref: "0-1/42", url: hs }]);
  assert.deepEqual(parseSources([`attio:${hs}`]), [{ kind: "attio", ref: hs }]);
  // an unknown host stays a url; a known host without a stable id stays a url too
  assert.deepEqual(parseSources(["https://example.com/x?a=1,2#f"]), [{ kind: "url", ref: "https://example.com/x?a=1,2#f" }]);
  assert.deepEqual(parseSources(["https://app.hubspot.com/"]), [{ kind: "url", ref: "https://app.hubspot.com/" }]);
});

test("the account comes from the link when its path carries one, and a given account wins", () => {
  // HubSpot: the portal id; both the record path and the older object path
  assert.equal(normalizeSource({ kind: "url", ref: "https://app.hubspot.com/contacts/123456/record/0-1/42" })[0].account, "123456");
  assert.equal(normalizeSource({ kind: "url", ref: "https://app.hubspot.com/contacts/987/company/55" })[0].account, "987");
  // Attio: the workspace slug is the first path segment; without one there is no account
  assert.equal(normalizeSource({ kind: "url", ref: "https://app.attio.com/Acme-Inc/company/0a1b2c3d-4e5f-6789-abcd-ef0123456789" })[0].account, "acme-inc");
  assert.equal(normalizeSource({ kind: "url", ref: "https://app.attio.com/person/0a1b2c3d-4e5f-6789-abcd-ef0123456789" })[0].account, undefined);
  // Gmail, Drive and Granola links carry no account
  for (const ref of ["https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWbcdefgh", "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", "https://notes.granola.ai/d/abc-123"]) assert.ok(!("account" in normalizeSource({ kind: "url", ref })[0]), ref);
  assert.equal(normalizeSource({ kind: "hubspot", account: "EU-Portal", ref: "https://app.hubspot.com/contacts/123456/record/0-1/42" })[0].account, "eu-portal");
});

test("url stays on the entry and is no part of identity", () => {
  const hs = "https://app.hubspot.com/contacts/123456/record/0-1/42", other = hs + "?eschref=1";
  const a = { kind: "hubspot", account: "123456", ref: "0-1/42", url: hs }, b = { kind: "hubspot", account: "123456", ref: "0-1/42", url: other }, bare = { kind: "hubspot", account: "123456", ref: "0-1/42" };
  assert.deepEqual(normalizeSource(a), [a]);                       // a stored entry reads back whole
  assert.equal(pointerKey(a), "hubspot:123456/0-1/42");
  assert.equal(pointerKey(a), pointerKey(b)); assert.equal(pointerKey(a), pointerKey(bare));
  assert.equal(lookupKey(a), lookupKey(b));
  assert.deepEqual(normalizeSources([a, b]), [a]);                // one pointer, the first url kept
  assert.deepEqual(normalizeSources([bare, b]), [{ ...bare, url: other }]);
  assert.deepEqual(parseSources([hs, other]), [a]);
  assert.deepEqual(sourceMembers([a, b]), ["hubspot:0-1/42", "hubspot:123456/0-1/42"]);   // no url member
  assert.ok(citesPointer([a], parsePointer("hubspot:0-1/42")) && citesPointer([a], parsePointer(other)) && !citesPointer([a], parsePointer("hubspot:999/0-1/42")));
  // a url that is not an http or https link is dropped on read and refused on write
  assert.deepEqual(normalizeSource({ kind: "hubspot", ref: "0-1/42", url: "javascript:alert(1)" }), [{ kind: "hubspot", ref: "0-1/42" }]);
  assert.equal(urlOK({ kind: "a", ref: "b" }), true); assert.equal(urlOK({ kind: "a", ref: "b", url: hs }), true);
  for (const url of ["", "ftp://x/y", "javascript:alert(1)", 7, null, "https://a b"]) assert.equal(urlOK({ kind: "a", ref: "b", url }), false, String(url));
  const base = { id: "m_abcdef12", context: "acme", at: "2026-11-14T10:00:00Z", authors: ["Lukasz"], via: "codex", kind: "note", tools: [], people: [], content: "x", actions: [], supersedes: null, retracts: null, tags: [] };
  assert.deepEqual(validateMemory({ ...base, source: [a] }), []);
  assert.ok(validateMemory({ ...base, source: [{ ...bare, url: "javascript:alert(1)" }] }).some(e => /source url/.test(e)));
  assert.equal(sourceText([a, { kind: "gmail", ref: "t1" }]), `hubspot:0-1/42 (${hs}), gmail:t1`);
});

test("an older note's pointer plus a separate url entry for the same link reads as one record", () => {
  const hs = "https://app.hubspot.com/contacts/123456/record/0-1/42", granola = "https://notes.granola.ai/d/abc-123";
  const stored = [{ kind: "hubspot", ref: "0-1/42" }, { kind: "url", ref: hs }, { kind: "granola", ref: "abc-123" }, { kind: "url", ref: granola }, { kind: "url", ref: "https://example.com/x" }];
  const before = JSON.stringify(stored);
  assert.deepEqual(normalizeSources(stored), [{ kind: "hubspot", account: "123456", ref: "0-1/42", url: hs }, { kind: "granola", ref: "abc-123", url: granola }, { kind: "url", ref: "https://example.com/x" }]);
  assert.equal(JSON.stringify(stored), before);                    // never rewritten
  assert.deepEqual(sourceMembers(stored).sort(), ["granola:abc-123", "hubspot:0-1/42", "hubspot:123456/0-1/42", "url:https://example.com/x"]);
  for (const search of ["hubspot:0-1/42", hs, "HubSpot:0-1/42"]) assert.ok(citesPointer(stored, parsePointer(search)), search);
  assert.ok(citesPointer(stored, parsePointer(granola)));
  // each stored entry still has the same key it had, and the url entry now names the record
  assert.equal(pointerKey(stored[0]), "hubspot:0-1/42"); assert.equal(pointerKey(stored[1]), "hubspot:123456/0-1/42"); assert.equal(pointerKey(stored[3]), "granola:abc-123");
  const base = { id: "m_abcdef12", context: "acme", at: "2026-11-14T10:00:00Z", authors: ["Lukasz"], via: "codex", kind: "note", tools: [], people: [], content: "x", actions: [], supersedes: null, retracts: null, tags: [] };
  assert.deepEqual(validateMemory({ ...base, source: stored }), []);
});

test("records read side by side: a pointer without an account joins the one account named for it", () => {
  const hs = "https://app.hubspot.com/contacts/123456/record/0-1/42";
  assert.deepEqual(recordKeys([{ kind: "hubspot", ref: "0-1/42" }, { kind: "url", ref: hs }, { kind: "gmail", ref: "t1" }]), ["hubspot:123456/0-1/42", "hubspot:123456/0-1/42", "gmail:t1"]);
  // two accounts named: the bare pointer could be either, so it stays its own
  assert.deepEqual(recordKeys([{ kind: "hubspot", ref: "0-1/42" }, { kind: "url", ref: hs }, { kind: "hubspot", account: "9", ref: "0-1/42" }]), ["hubspot:0-1/42", "hubspot:123456/0-1/42", "hubspot:9/0-1/42"]);
  assert.deepEqual(recordKeys([{ kind: "hubspot", ref: "0-1/42" }, null]), ["hubspot:0-1/42", ""]);
});

test("parseSources takes a source as an object with an account", () => {
  assert.deepEqual(parseSources([{ kind: "Gmail", account: "Sales@Acme.com", ref: "t1" }]), [{ kind: "gmail", account: "sales@acme.com", ref: "t1" }]);
  assert.deepEqual(parseSources(['{"kind":"hubspot","account":"123456","ref":"0-1/42"}']), [{ kind: "hubspot", account: "123456", ref: "0-1/42" }]);   // the --source flag
  const hs = "https://app.hubspot.com/contacts/123456/record/0-1/42";
  assert.deepEqual(parseSources([{ kind: "hubspot", ref: "0-1/42", url: hs }, "hubspot:0-1/42"]), [{ kind: "hubspot", ref: "0-1/42", url: hs }]);
  assert.deepEqual(parseSources([{ kind: "hubspot", ref: hs }]), [{ kind: "hubspot", account: "123456", ref: "0-1/42", url: hs }]);
  // the same record in two accounts is two pointers
  assert.equal(parseSources([{ kind: "gmail", account: "a@x.test", ref: "t1" }, { kind: "gmail", account: "b@x.test", ref: "t1" }]).length, 2);
  for (const bad of [{}, { kind: "gmail" }, { kind: "gmail", ref: "" }, { kind: "gmail", ref: 7 }, { kind: "gmail", account: "", ref: "t" }, { kind: "gmail", ref: "t", url: "ftp://x" }, { kind: "gmail", ref: "t", id: "x" }, "{not json", 7, null, ["gmail:t"]])
    assert.throws(() => parseSources([bad]), /source/, JSON.stringify(bad));
});

test("stored sources are compared through the normalized key, never rewritten", () => {
  const stored = { kind: "HubSpot", ref: "0-3/1" };
  assert.equal(pointerKey(stored), pointerKey({ kind: "hubspot", ref: "0-3/1" }));
  assert.equal(pointerKey({ kind: "attio", ref: "attio:people/9" }), "attio:people/9");
  assert.deepEqual(stored, { kind: "HubSpot", ref: "0-3/1" });
  assert.equal(normalizeSources([{ kind: "HubSpot", ref: "1" }, { kind: "hubspot", ref: "1" }]).length, 1);
});

test("account is optional and validated", () => {
  assert.deepEqual(normalizeSource({ kind: "Gmail", account: "Sales@Acme.com", ref: "abc" }), [{ kind: "gmail", account: "sales@acme.com", ref: "abc" }]);
  assert.equal(accountOK({ kind: "gmail", ref: "a" }), true);
  assert.equal(accountOK({ kind: "gmail", account: "", ref: "a" }), false);
  assert.equal(accountOK({ kind: "gmail", account: 7, ref: "a" }), false);
  const base = { id: "m_abcdef12", context: "acme", at: "2026-11-14T10:00:00Z", authors: ["Lukasz"], via: "codex", kind: "note", tools: [], people: [], content: "x", actions: [], supersedes: null, retracts: null, tags: [] };
  assert.ok(!validateMemory({ ...base, source: [{ kind: "gmail", account: "sales@acme.com", ref: "a" }] }).some(e => /account/.test(e)));
  assert.ok(validateMemory({ ...base, source: [{ kind: "gmail", account: "", ref: "a" }] }).some(e => /account/.test(e)));
  assert.ok(!validateMemory({ ...base, source: [{ kind: "gmail", ref: "a" }] }).some(e => /account/.test(e)));
});

test("index members find a pointer with or without its account", () => {
  const members = sourceMembers([{ kind: "Gmail", account: "sales@acme.com", ref: "t1" }, { kind: "url", ref: "https://app.hubspot.com/contacts/1/record/0-2/7" }]);
  assert.ok(members.includes("gmail:t1"));
  assert.ok(members.includes("gmail:sales@acme.com/t1"));
  assert.ok(members.includes("hubspot:0-2/7"));
  assert.ok(members.includes("hubspot:1/0-2/7"));                  // the portal in the link is the account
  assert.ok(!members.some(m => m.startsWith("url:")));             // a record link is the record, not a second source
  assert.ok(sourceMembers([{ kind: "url", ref: "https://example.com/x" }]).includes("url:https://example.com/x"));
  assert.equal(lookupKey(parsePointer("HubSpot:0-2/7")), "hubspot:0-2/7");
  assert.equal(lookupKey(parsePointer("https://app.hubspot.com/contacts/1/record/0-2/7")), "hubspot:1/0-2/7");
  assert.equal(parsePointer("nocolon"), null);
});

test("referenceText names the entity holding the pointer and the citing notes", () => {
  const p = parsePointer("hubspot:0-2/7");
  const out = referenceText(p, [{ id: "e_0123456789abcdef", name: "Acme", references: [{ kind: "HubSpot", ref: "0-2/7" }] }, { id: "e_1", name: "Other", references: [] }], [{ id: "m_aaaaaa", context: "acme", at: "2026-11-14T10:00:00Z", kind: "note", content: "Renewal moved" }]);
  assert.match(out, /Entity: Acme \(e_0123456789abcdef\)/);
  assert.doesNotMatch(out, /Other/);
  assert.match(out, /m_aaaaaa acme/);
  assert.match(referenceText(p, [], []), /Entity: none/);
  assert.match(referenceText(parsePointer("gmail:sales@acme.com/t1"), [{ id: "e_3", name: "Mailbox", references: [{ kind: "gmail", account: "sales@acme.com", ref: "t1" }] }], []), /Entity: Mailbox/);
  // a record link names its portal; the entity that holds the record without an account is still found
  const linked = referenceText(parsePointer("https://app.hubspot.com/contacts/1/record/0-2/7"), [{ id: "e_0123456789abcdef", name: "Acme", references: [{ kind: "HubSpot", ref: "0-2/7" }] }, { id: "e_2", name: "Elsewhere", references: [{ kind: "hubspot", account: "2", ref: "0-2/7" }] }], []);
  assert.match(linked, /^reference hubspot:1\/0-2\/7\nEntity: Acme \(e_0123456789abcdef\)\n/);
});
