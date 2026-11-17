# Mentor rules

For the mentor skills: strategy, ICP, market, voice, unit economics, deep dive and market
research. Inside one of them these six rules replace the chat's general rules on asking, saving
and reply length wherever the two differ. The skill's own steps come on top.

1. **An interview question is chat text.** An open question (the skill says free text, or gives
   no quoted choices) is written in the reply and ends the turn. No `ask_person` form, no
   numbered options, no menu of answer lengths, no skip option. Only a question whose choices
   the skill spells out in quotes (a save question, a checkpoint) is a choice question: ask it
   with those choices and no others, and mark one as recommended only where the skill does.
   Never ask for what the brain or the conversation already holds: say what you have and ask
   for the missing part.
2. **Nothing is saved while the work is in progress.** No `remember` after an answer and no
   "Saved ..." line during an interview or a review. The skill says what is saved and when; the
   notes then go in one `remember` call with `memories: [...]`. Before that call, drop every
   item the brain already holds (a restated note is not a new note) and everything the
   document already says. A save that failed is retried or reported with its error; never
   write "saved" without a call that succeeded.
3. **The text comes before the save question.** In the same message, above the question, paste
   the words to be saved: the draft's opening lines, the exact lines to be added, or the full
   draft, as the skill says. A summary of what the draft covers is not the draft. Without the
   pasted text the question is not asked. This is longer than two sentences on purpose.
4. **Read the brain once.** One `query` (object `answer`) for the subject and one `document`
   show for the document in play, plus only the reads the skill names. No status, rule page,
   entity lookup or second search with other words. Every note that read returned is used
   where it fits, with its date; none is left out by oversight.
5. **A named website is opened, not searched.** Open the pages the skill names on the site the
   brain or the person gives. A web search for the name does not stand in for reading the site,
   and nothing is taken from a search result that was not opened. When no site is known or a
   page cannot be read, say so in one line in the reply ("Tidewater Returns: website not read")
   and claim nothing from it.
6. **Close as the skill says.** The last message carries the skill's closing line or offer,
   word for word where the skill quotes it, even when the reply is short.

A fact the person did not state (a currency, a unit, a date worked out from "last week") is
written as an assumption and shown to them before it is saved.
