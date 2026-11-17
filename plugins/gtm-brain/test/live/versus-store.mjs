#!/usr/bin/env node
// Arm C of versus-bench.mjs: a small local note store with vector search. No embedding model is
// installed on the benchmark machine, so the vectors are TF-IDF weights over words and word pairs
// (bigrams), compared by cosine similarity: keyword-vector search, a stand-in for an embedding store.
// It finds notes that share words with the query, not notes that mean the same thing in other words.
// The store is one JSON line per note in store.jsonl beside this file.
//   node store.mjs search "<query>"     the 8 closest notes, best first
//   node store.mjs add "<text>"         adds one note (today's date is put in front)
//   node store.mjs --load <file.jsonl>  replaces the store with {date, author, text} lines (benchmark setup)
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const file = join(dirname(fileURLToPath(import.meta.url)), "store.jsonl");
const STOP = new Set("a an and are as at be but by for from has have he her his i in is it its me my of on or our she so that the their them they this to was we were what when where which who will with you your".split(" "));
const words = text => String(text).toLowerCase().replace(/[^a-z0-9&.,' -]+/g, " ").replace(/[.,']+(\s|$)/g, " ").split(/\s+/).filter(w => w && !STOP.has(w));
const features = text => { const w = words(text), f = [...w]; for (let i = 0; i + 1 < w.length; i++) f.push(`${w[i]} ${w[i + 1]}`); return f; };
const read = () => existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
const show = n => `${n.date} ${n.author ? `${n.author}: ` : ""}${n.text}`;

function search(query, k = 8) {
  const notes = read(), docs = notes.map(n => features(show(n))), df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const idf = t => Math.log((docs.length + 1) / ((df.get(t) || 0) + 1)) + 1;
  const vec = f => { const tf = new Map(); for (const t of f) tf.set(t, (tf.get(t) || 0) + 1); const v = new Map(); let norm = 0; for (const [t, c] of tf) { const w = (1 + Math.log(c)) * idf(t); v.set(t, w); norm += w * w; } return { v, norm: Math.sqrt(norm) || 1 }; };
  const q = vec(features(query));
  const scored = docs.map((d, i) => { const x = vec(d); let dot = 0; for (const [t, w] of q.v) if (x.v.has(t)) dot += w * x.v.get(t); return { i, score: dot / (q.norm * x.norm) }; });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k).map(s => ({ score: s.score, note: notes[s.i] }));
}

const [cmd, ...rest] = process.argv.slice(2), arg = rest.join(" ").trim();
if (cmd === "search" && arg) { const hits = search(arg); console.log(hits.length ? hits.map((h, n) => `${n + 1}. (${h.score.toFixed(2)}) ${show(h.note)}`).join("\n") : "no matching notes"); }
else if (cmd === "add" && arg) { const n = { date: new Date().toISOString().slice(0, 10), author: "", text: arg }; appendFileSync(file, JSON.stringify(n) + "\n"); console.log(`added: ${show(n)}`); }
else if (cmd === "--load" && arg) { writeFileSync(file, readFileSync(arg, "utf8")); console.log(`${read().length} notes loaded`); }
else { console.error('usage: node store.mjs search "<query>" | node store.mjs add "<text>"'); process.exit(2); }
