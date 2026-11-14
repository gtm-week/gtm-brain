// document --prepare: everything the first turn of "add pricing as a base file" needs, in one read, nothing written.
// Which base file already covers the subject (offer a section there first), the starter to begin from, the notes and
// entities the brain holds on it (the draft cites them; none means ask, never invent), and the one question with its
// choices. With a file: a Markdown dropped at the root by hand, the frontmatter adopting it adds, its text untouched.
import { readFileSync } from "node:fs";
import { join, basename } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const docs = await import(new URL("../../lib/documents.mjs", import.meta.url));
const { withMemoryIndex } = await import(new URL("../../lib/memory-index.mjs", import.meta.url));

const GENERIC = ["copy, outreach, proposals", "proposals", "planning"];
const NEEDS = ["what it must say first", "who it is for", "one example the team already uses"];
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1);
const listed = kinds => { const k = docs.normalizeAppliesTo(kinds); return k.length > 1 ? `${k.slice(0, -1).join(", ")} and ${k[k.length - 1]}` : k[0] || ""; };

/* The notes and entities about the subject, newest relevance first; a read of the memory index, never a write. */
function knowledge(root, terms) {
  try {
    return withMemoryIndex(root, index => {
      const hits = index.keywords([...terms], null).groups.flat().slice(0, 12);
      const names = new Set(hits.flatMap(h => [...(h.entities || []), ...(h.people || [])]).map(String));
      const words = new Set([...terms].map(t => t.toLowerCase()));
      const entities = lib.readNames(root).filter(n => names.has(n.name) || names.has(n.id) || [n.name, ...(n.aliases || [])].some(a => words.has(String(a).toLowerCase()))).slice(0, 8);
      return { hits, entities, searched: index.count() };
    });
  } catch (e) { return { hits: [], entities: [], searched: 0, error: String(e.message || e).split("\n")[0] }; }
}

export function prepare(root, { title, file, version = "", by = null }) {
  const all = docs.listDocuments(root), out = [];
  let subject = title, text = null;
  if (file) {
    text = readFileSync(join(root, file), "utf8");
    const heading = lib.parseFrontmatter(text).body.match(/^#\s+(.+)$/m);
    subject = title || (heading ? heading[1].trim() : basename(file, ".md").replace(/[-_]+/g, " "));
  }
  const starter = docs.matchStarter(`${subject} ${file ? basename(file, ".md") : ""}`);
  const slug = docs.documentSlug(subject), path = file || docs.documentPathFor(slug);
  const choices = (starter ? starter.choices : GENERIC).slice(0, 3);
  const over = docs.overlaps(root, subject, starter, all).filter(o => o.doc.path !== path);

  out.push(file ? `${file} is here but the brain does not use it yet. Adopting it keeps every word of it; it only gains the frontmatter below. Nothing is saved by this read.`
    : `Base file: ${subject} (${path} at the brain root). Nothing is saved by this read.`);
  // the file is there already: it is filled or extended, never created twice, and what it governs stays as it is
  const same = !file && all.find(d => d.path === path);
  if (same) out.push(`${path} already exists [${same.state}] (${same.applies_to.join(", ")}): fill or extend it, never a second file.`);

  // 1. overlap: a base file that already covers the subject is offered first
  if (over.length) {
    const o = over[0];
    out.push(`\nAlready covered: ${over.map(x => `${x.doc.path} (${x.doc.title}, ${x.doc.state}: ${x.reasons.join("; ")})`).join(", ")}. Offer first to add a ${starter ? starter.title : subject} section to ${o.doc.path}${o.heading ? ` (or fill its "${o.heading}" heading)` : ""}: update, ref ${o.doc.slug}, append the section; the rest of that file stays as it is.`);
  } else out.push(`\nNo existing base file covers it (checked ${all.length}: title, applies_to, headings, text).`);

  // 2. the adoption's frontmatter, or the starter and what the brain knows
  let blank = false;   // nothing known: this turn asks for the facts; the work question waits for the draft
  if (file) {
    const shown = docs.writeFields(root, file, { title: subject, applies_to: choices[0], status: "draft", by, version }, { preview: true });
    out.push(`\nThe frontmatter adopting it adds (applies_to from the pick):\n${shown.frontmatter}Its ${shown.text.split("\n").length} lines below stay byte for byte.`);
  } else {
    if (starter) out.push(`\nStarter: ${starter.template}. Keep its headings; replace each guidance line with what the notes say; leave a heading empty rather than guess:\n\n${starter.body.replace(docs.HEADER_LINE, "").replace(/\n{3,}/g, "\n\n")}`);
    else out.push("\nNo starter for this subject: take three to five headings from what the notes say.");
    const terms = new Set([...docs.subjectWords(subject), ...(starter ? starter.terms : [])]);
    const k = knowledge(root, terms);
    if (k.error) { blank = true; out.push(`\nThe notes could not be searched (${k.error}). Say so in one line, write no draft, and ask in one question for: ${(starter ? starter.needs : NEEDS).map((n, i) => `${i + 1}) ${n}`).join(", ")}. End the turn there.`); }
    if (k.hits.length) {
      out.push(`\nWhat the brain knows (${k.hits.length} note${k.hits.length === 1 ? "" : "s"} of ${k.searched} searched). Draft only from these and list the ones used under "Drawn from" (id, context, date):`);
      for (const h of k.hits) out.push(`- ${h.id} · ${h.context} · ${String(h.at || "").slice(0, 10)} · ${String(h.content || "").replace(/\s+/g, " ").slice(0, 240)}`);
      if (k.entities.length) out.push(`Entities named: ${k.entities.map(e => `${e.name} (${e.kind || "person"})`).join(", ")}.`);
    } else if (!k.error) {
      const needs = starter ? starter.needs : NEEDS; blank = true;
      out.push(`\nThe brain holds nothing about ${subject.toLowerCase()} (${k.searched} note${k.searched === 1 ? "" : "s"} searched). Say so in one line, write no draft, and ask in one question for: ${needs.map((n, i) => `${i + 1}) ${n}`).join(", ")}. Never invent them. End the turn there.`);
    }
  }
  if (same) {
    const fill = !same.filled;
    out.push(`\nThe one question. ${blank ? "Not in this turn: once the facts are in, draft from them, show the draft in full" : `Show the ${fill ? "draft" : "new section"} in full`}, then these lines word for word:\n`);
    out.push(`The brain reads ${path} before ${listed(same.applies_to.join(", "))}, so this text is followed there.\nSave this to ${path}?\n1. Yes, save it (recommended)\n2. No, change something`);
    out.push(`\nThen end the turn and write nothing. On yes, one call: document update, ref ${same.slug}, ${fill ? "body the draft (it replaces the starter text)" : "append the section (the rest stays as it is)"}.`);
    out.push(`After saving, the closing line names the saved path: "Saved ${path} [${same.status}]. The brain reads it before ${listed(same.applies_to.join(", "))}."`);
    return out.join("\n");
  }
  // 3. the one question, as literal lines: the why line, the question and the choices, recommended first. A pick
  // is the yes (each choice says so), so the second turn is one write and nothing is asked again.
  const opts = over.length
    ? [`A section in ${over[0].doc.path}`, ...choices.slice(0, 2).map(c => `A new ${path} for ${listed(c)}`)]
    : choices.map(c => sentence(listed(c)));
  const why = file ? `The brain reads ${file} before the work you pick, so the pick decides when it is followed. Picking one adopts it as a draft; its text stays as it is.`
    : `The brain reads ${over.length ? "it" : path} before the work you pick, so the pick decides when it is followed. Picking one saves it as a draft.`;
  out.push(`\nThe one question. ${file ? "Show the frontmatter above" : blank ? "Not in this turn: once the facts are in, draft from them, show the draft in full" : "Show the draft in full"}, then these lines word for word, the why line and "(recommended)" included:\n`);
  out.push(`${why}\n${over.length ? `Where should ${subject.toLowerCase()} go, and what work should follow it?` : `What work should follow ${file ? "this file" : "this document"}?`}\n${opts.map((o, i) => `${i + 1}. ${o}${i === 0 ? " (recommended)" : ""}`).join("\n")}`);
  const target = over.length ? `update, ref ${over[0].doc.slug}, append the section (choice 1); or ` : "";
  const how = file ? `document create, file ${file}, title "${subject}", applies_to from the pick, status draft`
    : `${target}document create, title "${subject}", applies_to from the pick, body the draft, status draft`;
  out.push(`\nThen end the turn and write nothing. A number or a kind of work is the yes: save with one call, ${how}. A change asked for is not a yes: make it, show the result again and ask the same question again.`);
  out.push(`After saving, the closing line names the saved path: "Saved ${over.length ? "<path>" : path} as a draft. The brain reads it before <the work picked>."`);
  return out.join("\n");
}
