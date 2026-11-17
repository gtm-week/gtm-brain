---
name: gtmb-voice
description: |
  Draft a tone of voice from real writing: settles whose voice it is (the company's, a person's,
  a team's), reads evidence that fits, tests the draft on one fresh piece the person edits, saves
  it on their yes and checks a new chat uses it. Triggers: "/gtmb-voice", "fill in our tone
  of voice", "draft our voice", "how do we sound". Not saving a voice guide the
  person already wrote, or checking a draft against it (gtmb-use-brain, references/documents.md).
allowed-tools: [Bash, Read, WebSearch, WebFetch]
---

# GTM Brain: Voice

Read [the method](references/method.md) and
[mentor rules](../gtmb-use-brain/references/mentor-rules.md) once and follow them. Work in
English; quotes stay in their own language. Every question follows
[question handling](../gtmb-start/references/questions.md).

## 1. Whose voice

Reuse the session's person, company and website. Read the voice
document with `document` (`action: show`, `ref: voice`): setup writes `voice.md` as a starter at
the brain root. When `action: list` shows another tone of voice document, read that too.

A filled document says on its first line whose voice it is and what it governs: reuse that, or an
answer already in the request ("our voice" is not one), and never ask again. Otherwise (a starter is never filled) this
question comes first, before reading or asking for texts, with one line on why (a company standard is read from what the company publishes and
sends, a person's from their own writing, a blend fits neither), as the whole first reply. Choices: "The company's voice"
(recommended; one standard for everything we publish and send, no persona per medium), "My own
voice", "A team's voice" (then ask which team). The company's governs the starter's kinds of work
(copy, outreach, emails, posts, landing pages); a person's or team's, the kinds they name.

## 2. Evidence that fits

Texts the person pastes or drops count at once; connectors only deepen them. Smallest relevant
reads, connectors first, never Computer Use or a page behind a login.

- **The company's voice**: the website (home, about, one product or pricing page, the two most
  recent posts); public posts on the web (one search; read the two or three the company wrote);
  sent mail written on the company's behalf, only when a mail connector (Gmail, Outlook) is
  connected: one search for sent messages to people outside the company in the last 90 days, at
  most ten results, read five. Internal chat (Slack, Teams) is not evidence of the company voice.
- **A person's voice**: their own writing only: public posts, sent mail (same rule), and Slack,
  only when the Slack connector is connected: one search for their own messages in public
  conversations in the last 90 days, at most ten results.
- **A team's voice**: what the team itself writes and sends.

A tool that is not connected is named as missing ("sent mail: not connected"); connecting it is
[gtmb-configure](../gtmb-configure/SKILL.md)'s job, offered in one line at the end. An
empty result is a result; an error is reported with its exact text and the run goes on. Before
the draft, show what was reviewed (source, count, dates, kind) and what is missing, as a
"Reviewed" list on top of the draft, a line per source.
Under six authored texts the draft is a guess: say so and ask for
texts the person likes, up to six.

## 3. Draft

Sort and weigh the texts by the method; an explicit correction outweighs an inferred habit. Use
the structure the evidence supports, with no fixed sections, counts, length rules or registers:
the starter's headings are no template. Look first at how pieces open and close. Each observed
rule quotes a text and says how many show it; what no text shows, every "do not" included, is
a suggestion or left out.
Keep observed patterns apart from suggested improvements; quote every correction in the person's
exact words. Never invent a quote, a word or a source. Keep voice.md concise; detailed evidence
and private source references (`gmail:<id>`, Slack links, recipients) stay in the chat. Its first
line says whose voice it is and what it governs; its last, what it was read from, as counts.

## 4. Show it and save it

Show the draft in full (on a re-run, first the proposed changes, per the method), then ask one
question: "Save it as a draft" (recommended), "Change something". Nothing is written before that
answer; a change request gets a revised draft and the same question. No default or timeout
is a yes. An explicit instruction already in the request to save this draft ("save it as a
draft when it is ready") is the yes: show the draft and save it, without asking twice.

On the yes, save through [documents](../gtmb-use-brain/references/documents.md): for the
company, `document` with `action: update`, `ref: voice` (or the other document's ref), `body` as
Markdown starting with a heading and no frontmatter, `status: draft`, `applies_to` as settled,
and the person's `by`. A person's or team's voice is its own document (`action: create`, `title:
Tone of voice: <name>`, their kinds of work); `voice.md` stays the company's. Read it back with
`action: show` before saying it is saved. The voice is a document, not notes: no `remember` call
follows.

Where it saves: documents only (`voice.md`, or a person's or team's own); examples go in
`voice/`. No entity, field or relationship.

## 5. Check that later chats use it

The message after each save gives: the path; exactly which kinds of work it governs, from the
document's `applies_to`; and the one sentence to type in a new chat, of a kind it covers.
That chat should say it followed the document
("Following Tone of voice."). Do not say it is in use until the person has seen that; if not, fix
`applies_to`, not the rules. Say `/gtmb-voice` revises it any time, then ask step 6.

## 6. Test it on fresh work

The guide is not done until it has written something. Ask for one short real piece the person
needs now: "A short email" (recommended), "A post". Write it with the guide and ask the person to
edit it. Each edit confirms, changes or adds a rule; an edit that fits only this piece
never silently becomes a rule: ask "Make it a rule" or "Just this once", or
leave it out. Save the revised rules with the same question. Approved only on the person's own
word ("approve the voice"), after this test, as a separate update.

Never send, reply to or draft a message in the person's tools; never a raw mail or Slack export
in the brain.
