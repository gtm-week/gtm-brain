# Which tool fits a need

The tools check suggests only the floor every brain needs: email, calendar and the CRM. Everything
past that is your judgment, made from the person's own work, never from a fixed list.

When the person names a need ("we run events", "we post on LinkedIn", "we track deals in a sheet"),
or the brain shows one (notes about events with no event tool, meetings with no transcript source):

1. **Look first.** What is already installed (the tools check lists it), what admin.md names, and
   which tools the brain's notes come from. Never suggest a second tool for a need one already covers.
2. **Match the need, not the word.** Luma the events app, not Luma AI; "Sales" or "Notes" in a
   plugin's name says nothing about what it does. Read the plugin's own description before offering it.
3. **Offer one, with why, in one line.** "Your Berlin notes come from emails with Luma links: connect
   Luma for the guest list?" Two candidates for the same need: offer both in the one question,
   recommended first.
4. **A no is final.** Record it with `mark_tool` (`status` = skip, `note` = their words) and never
   offer it again unless they ask.

Examples of needs and the kind of tool that fits, not a full list:

- events and guest lists: an event platform (Luma, Eventbrite)
- meeting transcripts: a recorder (Granola, Fireflies, Fathom, Wispr Flow)
- outreach sequences: a sequencing tool (Lemlist, Apollo)
- product usage: an analytics tool (PostHog)
- shared documents and tasks: the team's workspace (Notion, Linear, Google Drive)

OpenAI's own helpers (Sites, Work Pets, templates) are never offered as company tools.
