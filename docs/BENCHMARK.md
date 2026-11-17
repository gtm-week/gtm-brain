# GTM Brain against three simple memory setups

**GTM Brain got fewer of 27 questions right than one long notes file or a simple keyword search, but it was the only setup that usually said where an answer came from.**

Same Codex model, 176 made-up sales notes over seven months, 27 questions, one run per setup, judged by another AI model. Run on 17 November 2026 with GTM Brain 0.37.4. Most of GTM Brain's misses trace to search and save behaviour we have now found. This shows where each setup breaks today; it does not crown a winner.

| | GTM Brain | the others |
|---|---|---|
| answers right | 19 of 27 | one long file 24, keyword search 25, Codex memory 22 |
| said where or when the fact came from | 23 of 27 | 7, 6 and 3 |
| team rules followed | 0 of 2 | one long file 2 of 2, Codex memory 2 of 2, keyword search 1 of 2 |

## Overall

| setup | right | partly right | wrong | gave an old value | made something up | said its source or date | score, partly as half |
|---|---|---|---|---|---|---|---|
| Keyword-vector search (a stand-in for an embedding store) | 25 of 27 | 1 | 1 | 0 | 0 | 6 of 27 | 94% |
| One long file | 24 of 27 | 1 | 2 | 2 | 0 | 7 of 27 | 91% |
| Codex memory | 22 of 27 | 2 | 3 | 1 | 1 | 3 of 27 | 85% |
| GTM Brain | 19 of 27 | 3 | 5 | 0 | 0 | 23 of 27 | 76% |

"Partly right" means some of a list. A right answer without a source still counts as right.

## The four setups

| setup | in plain words | what it is |
|---|---|---|
| Keyword-vector search | search that returns the eight closest notes | TF-IDF cosine over words and word pairs, top 8 notes per query, one note per chunk; a stand-in for an embedding store (no embedding model was installed). Codex runs `search` and `add`. No plugin. |
| One long file | everything in one long file | NOTES.md, 176 dated sections (29 KB). AGENTS.md: read it to answer, append to it to save. No plugin. |
| Codex memory | Codex's own memory | The real memories feature in Codex 0.163.0 (off by default). The history was replayed as 9 chats and Codex built its own MEMORY.md (10 KB). The harness relabels those chats as interactive and back-dates Codex's records so it learns at all. |
| GTM Brain | GTM Brain | A brain made by setup, filled by Codex through the plugin's own save path in 9 chats of about 20 notes: 179 memories, 68 people and company pages. |

All four used the same Codex model (gpt-5.6-luna, medium reasoning), the same notes and the same questions, each question in a new chat.

## By kind of question

| kind | questions | Keyword-vector search | One long file | Codex memory | GTM Brain |
|---|---|---|---|---|---|
| Plain recall | 4 | 4 | 4 | 4 | 3 |
| Corrected facts | 4 | 4 | 3 | 3 | 4 |
| Who and where now | 3 | 3 | 3 | 3 | 3 |
| Across many notes | 4 | 3 + 1 partly | 3 + 1 partly | 1 + 2 partly | 1 + 3 partly |
| Time | 3 | 3 | 3 | 3 | 1 |
| Not in the notes | 3 | 3 | 3 | 2 | 3 |
| Save then recall | 4 | 4 | 3 | 4 | 4 |
| Standing rule | 2 | 1 | 2 | 2 | 0 |

### Corrected facts

"When is Acme Retail's renewal?" The notes say 1 December, then an October note moved it to 1 February 2027.

- One long file (wrong, old value): "Acme Retail's renewal date is 1 December 2026."
- GTM Brain (right): "Acme Retail's renewal is February 1, 2027, moved from December 1 in the warehouse expansion addendum signed October 8, 2026 (40 days ago). Source: Maya Ostrom, account executive."

The long-file setup read only the first 240 lines of the file and never reached the correction. Keyword search also got all 4 right.

### Not in the notes

"How much does Tidewater Returns charge per return?" The notes never give a price.

- Codex memory (wrong, made up): "I found the figure. May I share Tidewater Returns' exact per-return charge?"
- GTM Brain (right): "Northfold's notes do not record Tidewater Returns' per-return price. As of June 16, 2026 (154 days ago), the only note says the deal was won because of Tidewater's native Magento connector, not pricing."

The long file and keyword search also said it is not recorded.

### Save then recall

Chat 1: "Correction: Acme Retail's renewal moved again, it is now 1 March 2027." Chat 2, new: "When is Acme Retail's renewal?"

- One long file (wrong, old value): wrote the new date into NOTES.md, then in the next chat answered "1 December 2026."
- GTM Brain (right): "Acme Retail's renewal is scheduled for 1 March 2027."

Keyword search and Codex memory also got all 4 right.

### Standing rules: GTM Brain lost this one outright

The team had said "ask before saving anything about pricing" and "a churned customer is never a prospect again". GTM Brain broke both.

"Save this for the team: we offered Copperline Shoes 0.30 EUR per return if they sign before December."

- One long file (right): "Anna's standing rule requires approval before saving pricing details. Please confirm that I should add this to NOTES.md."
- GTM Brain (wrong): "Saved in Our company: 'We offered Copperline Shoes 0.30 EUR per return if they sign before December.'"

In the second rule question GTM Brain added Quarry Lane Books, a customer that churned in September, to the prospect list. A rerun with both rules written into GTM Brain's own rules page also failed both. GTM Brain's "save first" instruction wins over the team's rules; that is a product defect to fix before anyone relies on rules.

## Where the simple options are fine

- **Plain recall.** The three others got 4 of 4, GTM Brain 3 of 4. It missed who introduced Acme Retail: its search did not match "introduced" to "made the intro".
- **Time.** "What is due in November", "what did we decide in June": the three others 3 of 3, GTM Brain 1 of 3. It said nothing was due in November; the notes hold three dated items.
- **Across many notes.** The long file and keyword search 3 of 4 plus 1 partly; GTM Brain 1 plus 3 partly, usually two names out of four. Its search result tells Codex to answer in one to three sentences without a second search, which cuts lists short.
- **Who and where now.** All four 3 of 3.
- **Not in the notes.** The long file and keyword search were as careful as GTM Brain, 3 of 3.
- **A bigger history did not change the picture.** At 1,500 notes, on 12 recall, corrected and list questions: keyword search 11 of 12 plus 1 partly, the long file 11 of 12, GTM Brain 10 of 12 plus 1 partly. The long file did not slow down: Codex searches it instead of reading it all. GTM Brain was built differently in that run (notes saved word for word, no people or company pages).

At this size, a well-named notes file that Codex can search answers most factual questions. What it did not do here is keep track of what changed (2 old values given) or say where an answer came from (7 of 27).

## Cost per question

Median over the 27 questions. Tokens are the text the model reads; more tokens cost more money.

| setup | seconds | input tokens | output tokens |
|---|---|---|---|
| Keyword-vector search | 14 | 50k | 309 |
| One long file | 10 | 35k | 291 |
| Codex memory | 23 | 86k | 804 |
| GTM Brain | 21 | 118k | 570 |

GTM Brain reads about three times as much as the long file per question: its tool descriptions and the brain's opening summary come with every chat. Codex memory also spends about 4 minutes and about 170k tokens in the background between a save and the next chat; that is not in these numbers. Timings are rough: the machine was shared and busy, and GTM Brain answers took 18 to 73 seconds across runs.

## How it was run

- Northfold, a made-up returns-automation company: 176 notes from 20 April to 13 November 2026, made by a seeded script. 27 questions in 8 kinds with gold answers, written before any setup ran.
- GTM Brain was filled by Codex through the plugin in 9 chats. It marked 17 notes as replacing earlier ones, mostly wrongly. The file and the keyword store were written directly, so the setups were not filled the same way.
- Codex memory is the real memories feature, but it learns only from interactive chats, so the harness relabels the replayed chats and back-dates Codex's own records. No ordinary user would make that change.
- "Keyword-vector search" is TF-IDF word and word-pair matching, a stand-in for an embedding store; a real embedding model may do better or worse.
- Judge: claude-fable-5-2, given the question, gold answer, notes and reply, not told the setup, with product names masked. A person re-scored 12 replies and agreed on all 12 (they could see the setup). 15 gold answers were re-derived from the notes; all held.
- Limits: one run per setup, one made-up company, an AI judge that can sometimes guess the setup from style. A gap of one or two questions is noise. Two sets of rows are reruns: all 27 keyword-search rows after a fix to its word splitting, and GTM Brain's first five after its notes got their own dates.

## Reproduce it

From a checkout of this branch, with Codex and Claude Code signed in. About an hour to build the four setups once, then about two hours for the questions. Results go to `~/gtm-brain-bench/versus/`.

```bash
node plugins/gtm-brain/test/live/versus-history.mjs --seed 7                 # print the 176 notes
node plugins/gtm-brain/test/live/versus-bench.mjs                            # build and run all four, judged
node plugins/gtm-brain/test/live/versus-bench.mjs --arms a,b --questions corrected
node plugins/gtm-brain/test/live/versus-bench.mjs --report-only <run folder> # redraw the tables
node plugins/gtm-brain/test/live/versus-bench.mjs --notes 1500 --a-seed direct  # the larger history; set GTM_BRAIN_VERSUS_DIR to keep it apart
```

Questions and gold answers are in `plugins/gtm-brain/test/live/versus-questions.json`.
