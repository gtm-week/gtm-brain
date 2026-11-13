# Manual scenarios in the Codex app

What to type in a test brain after a release, and what should happen. Plain sentences only, the way a
person talks: nobody types "remember:". A question may come in Codex's question box or as plain text;
both are fine. In every run also check: nothing the person did not say is saved (a surname, a date, a
"three words" line), no long dashes in saved notes or documents, and each change has its own commit
(`git log` in the brain).

Test brain: a folder made with setup, onboarding dismissed (for example `~/Documents/schema-test-brain`).
Quit and reopen Codex after `./dev-install.sh` when the version changed, then start a new chat there.

## A. RULES.md (0.33.9)

1. `/gtm-brain-rules what are our rules?`
   Numbered "Where things go" rows, "Our rules" empty, nothing written.
2. `from now on, always ask before tagging a client`
   Offers a line in RULES.md "Our rules" (a rule about saving and asking); on yes, one line at the end,
   commit "RULES.md: ...". The next chat's opening lines show it.
3. `customer case studies go in case-studies/<customer>/`
   A new row inside the RULES.md table. Then `where does a customer case study go?` cites that row by
   number.
4. Migration (needs a copy of a brain from before 0.33.9 with WHERE.md): ask anything. WHERE.md is gone,
   RULES.md holds its rows and any old rule lines under "Our rules", commit "RULES.md: WHERE.md ... in one
   file".

## B. Documents (0.33.10, 0.34.1, 0.34.2)

5. `list the documents`
   Strategy, Ideal customer profile, Tone of voice, Design system, all `[not filled]`, plus the workflows.
6. `Write a two-line LinkedIn post about our AI revenue summit in Berlin on 2026-12-03.` (voice not filled)
   The post with plain hyphens, ending with one line: Tone of voice is not filled yet, say "fill in our
   tone of voice".
7. `Fill in our tone of voice. Short sentences, no exclamation marks, name the customer's problem before our product.`
   Shows the draft and asks (Save it as a draft / Change something) before writing. On yes: voice.md filled
   through the document tool (commit "Updated document voice.md"), status draft, "How we sound, in three
   words" left empty, no note.
8. `in graphics never put the OpenAI blossom next to the OpenAI name`
   Asks "Add to partner-brands.md under OpenAI: ...?". On yes: partner-brands.md created ("Partner
   brands", applies to graphics, slides, social images, co-marketing), the rule under `## OpenAI`.
   design-system.md unchanged, no note.
9. `our emails are always signed with first name only`
   Asks "Add to voice.md: ...?". On yes: a line in voice.md, no note.
10. `Write a short brief for a LinkedIn graphic announcing our partnership with OpenAI.`
    Keeps the rule (the wordmark alone, no blossom next to the name) and says which documents it followed.
11. `you put the blossom next to the OpenAI name again`
    Agrees, offers to fix the piece, and offers the rule for partner-brands.md if it is not there yet.
12. Onboarding (needs a fresh empty folder, `./dev-reset.sh`): at the end, one question which documents to
    fill now (Voice and ICP now, All four, Just the voice, Later). "Later" is followed by the first task;
    the question does not come back.

## C. SCHEMA.md (0.34.0, 0.34.2)

13. `/gtm-brain-schema what do we keep about companies?`
    Organization fields (website and industry required) and subtypes; nothing written.
14. `every company must have a budget owner`
    Offers or adds a budget_owner row (required) in SCHEMA.md, commit "SCHEMA.md: ...".
15. `I met Anna Lee, Head of Sales at Northwind (northwind.com). She reports to Tom Berg.`
    Notes with works_at and reports_to relationships; no question about Northwind's website (it was given).
    Then `what relationships do we have?` lists both, current.
16. `Northwind became our referral partner in September.` then
    `Northwind is no longer our partner since October.` then `what is our relationship with Northwind?`
    Ended, with September still in the history; the first note is not withdrawn.
17. After a few minutes (background compile): `check the brain`
    SCHEMA.md gaps with three choices each: Northwind (industry, budget owner), Tom Berg ("Tom Berg works
    at ...?"). Our own company is never listed. `brain/entities/northwind.md` shows Fields with citations
    (no note IDs inside the values) and Relationships, current and ended.
18. `/gtm-brain-schema add a kind called event`
    Refused; offers an organization subtype or a project folder.
