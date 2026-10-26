// Candidate retrieval only. These scores never resolve, alias or merge identities.
export const foldEntityName = value => String(value || "").normalize("NFKD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/ł/g, "l").replace(/ø/g, "o")
  .replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stop = new Set(["the", "and", "for", "inc", "gmbh", "ltd", "llc", "plc", "corp", "group", "team", "sp", "oo", "sa", "ag"]);
const tokens = s => foldEntityName(s).split(/\s+/).filter(t => t && !stop.has(t));

// Optimal string alignment: insertion, deletion, substitution, adjacent transposition.
function distance(a, b) {
  const x = Array.from(a), y = Array.from(b);
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[x.length][y.length];
}

function nameMatch(query, value) {
  if (query.toLowerCase() === value.trim().toLowerCase()) return { score: 100, reason: "exact name or alias" };
  const q = foldEntityName(query), v = foldEntityName(value), qt = tokens(query), vt = tokens(value);
  if (!qt.length || !vt.length) return null;
  if (q === v || q.replaceAll(" ", "") === v.replaceAll(" ", "")) return { score: 95, reason: "normalized spelling" };
  if (qt.length === 1 && qt[0].length < 3) return null;
  // Every query token needs a distinct counterpart. A shared first name alone cannot
  // rescue a conflicting surname, and duplicated query words cannot reuse a token.
  const choices = qt.map(a => vt.map((b, i) => {
    if (a === b) return { i, score: 90, reason: "name token" };
    // Numbers distinguish versions and numbered records, not spelling variants.
    if ((a.match(/\d+/g) || []).join('|') !== (b.match(/\d+/g) || []).join('|')) return null;
    const length = Math.min(a.length, b.length), max = length >= 8 ? 2 : length >= 4 ? 1 : 0;
    if (max && a.length <= 80 && b.length <= 80 && Math.abs(a.length - b.length) <= max) {
      const edits = distance(a, b);
      if (edits <= max) return { i, score: 80 - edits * 5, reason: `spelling variant (${edits} edit${edits === 1 ? "" : "s"} after accent normalization)` };
    }
    if (a.length >= 3 && b.startsWith(a)) return { i, score: 60, reason: "name prefix" };
    return null;
  }).filter(Boolean)).sort((a, b) => a.length - b.length);
  if (choices.some(c => !c.length) || qt.length > 12) return null;
  // Bounded bipartite matching, strongest edges first, avoiding exponential search.
  const owners = new Map(), selected = new Map();
  function assign(index, seen) {
    for (const edge of choices[index].sort((a, b) => b.score - a.score)) {
      if (seen.has(edge.i)) continue;
      seen.add(edge.i);
      if (!owners.has(edge.i) || assign(owners.get(edge.i), seen)) {
        owners.set(edge.i, index); selected.set(index, edge); return true;
      }
    }
    return false;
  }
  if (!choices.every((_, i) => assign(i, new Set()))) return null;
  return [...selected.values()].reduce((a, b) => a.score <= b.score ? a : b);
}

export function rankEntityCandidates(entries, query, { limit = 5 } = {}) {
  if (typeof query !== "string" || !query.trim() || query.length > 256) throw new Error("Entity search needs a name, email or ID of 1 to 256 characters");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Entity search limit must be 1 to 10");
  const q = query.trim(), lower = q.toLowerCase();
  const identifier = q.includes("@") || /^e_[a-f0-9]+$/i.test(q) || /^https?:\/\//i.test(q);
  const hits = entries.flatMap(entry => {
    const exactId = [entry.id, ...(entry.previous_ids || [])].some(id => id === q);
    const exactEmail = (entry.emails || []).some(email => email.toLowerCase() === lower);
    let match = exactId ? { score: 110, reason: "exact record ID" } : exactEmail ? { score: 105, reason: "exact email (may be shared)" } : null;
    if (!match && !identifier) for (const value of [entry.name, ...(entry.aliases || [])]) {
      if (typeof value !== "string" || value.includes("@") || value.length > 256) continue;
      const candidate = nameMatch(q, value);
      if (candidate && (!match || candidate.score > match.score)) match = candidate;
    }
    return match ? [{ entry, score: match.score, reason: match.reason }] : [];
  }).sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name) || String(a.entry.id).localeCompare(String(b.entry.id)));
  return { matches: hits.slice(0, limit), total: hits.length, truncated: hits.length > limit };
}
