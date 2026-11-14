import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKind, normalizeSource, normalizeSources, parsePointer, pointerKey, sourceMembers, lookupKey, referenceText, accountOK, SHORT } from "../lib/pointers.mjs";
import { parseSources, validateMemory } from "../lib/brain.mjs";

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

test("known URL hosts become provider pointers and keep the URL", () => {
  const attio = "https://app.attio.com/acme/person/0a1b2c3d-4e5f-6789-abcd-ef0123456789/overview";
  assert.deepEqual(parseSources([attio]), [{ kind: "attio", ref: "people/0a1b2c3d-4e5f-6789-abcd-ef0123456789" }, { kind: "url", ref: attio }]);
  const hs = "https://app.hubspot.com/contacts/123456/record/0-1/42";
  assert.deepEqual(parseSources([hs])[0], { kind: "hubspot", ref: "0-1/42" });
  assert.deepEqual(parseSources(["https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWbcdefgh"])[0], { kind: "gmail", ref: "FMfcgzQXJWbcdefgh" });
  assert.deepEqual(parseSources(["https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view"])[0], { kind: "google-drive", ref: "1AbCdEfGhIjKlMnOp" });
  assert.deepEqual(parseSources(["https://notes.granola.ai/d/abc-123"])[0], { kind: "granola", ref: "abc-123" });
  // an unknown host stays a url; a known host without a stable id stays a url too
  assert.deepEqual(parseSources(["https://example.com/x?a=1,2#f"]), [{ kind: "url", ref: "https://example.com/x?a=1,2#f" }]);
  assert.deepEqual(parseSources(["https://app.hubspot.com/"]), [{ kind: "url", ref: "https://app.hubspot.com/" }]);
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
  assert.ok(members.includes("url:https://app.hubspot.com/contacts/1/record/0-2/7"));
  assert.equal(lookupKey(parsePointer("HubSpot:0-2/7")), "hubspot:0-2/7");
  assert.equal(lookupKey(parsePointer("https://app.hubspot.com/contacts/1/record/0-2/7")), "hubspot:0-2/7");
  assert.equal(parsePointer("nocolon"), null);
});

test("referenceText names the entity holding the pointer and the citing notes", () => {
  const p = parsePointer("hubspot:0-2/7");
  const out = referenceText(p, [{ id: "e_0123456789abcdef", name: "Acme", references: [{ kind: "HubSpot", ref: "0-2/7" }] }, { id: "e_1", name: "Other", references: [] }], [{ id: "m_aaaaaa", context: "acme", at: "2026-11-14T10:00:00Z", kind: "note", content: "Renewal moved" }]);
  assert.match(out, /Entity: Acme \(e_0123456789abcdef\)/);
  assert.doesNotMatch(out, /Other/);
  assert.match(out, /m_aaaaaa acme/);
  assert.match(referenceText(p, [], []), /Entity: none/);
});
