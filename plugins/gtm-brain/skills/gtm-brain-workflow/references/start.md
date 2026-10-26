# Starting a run

1. Confirm the workflow and the context. If the request names a workflow ("start the outbound
   workflow"), use it. Otherwise `workflow` `action: list` and one `question` with the titles as
   choices. The run belongs to the loaded context when there is one that fits the work (Our
   offer for a campaign, a customer context for one account); otherwise ask which, with the two
   or three fitting contexts as choices.
2. Read the workflow file in full (`Read` on the path `list` gave). Its free text is the
   procedure this run follows.
3. Fill the "Before starting" items. For each label, take the answer from the brain first: the
   loaded context's summary and notes, `query` (status), the documents (target customer
   definition, pricing, strategy). Write the proposal as one line per label.
4. Ask only for the blank items, one `question` per item, in the order the workflow lists them.
   Offer two or three concrete choices when the brain can (a saved target list, a connected
   sequencer); otherwise free text with a `text_label` naming what to type. Never bundle two
   items on one page.
5. Confirm the brief on one page: every label with its answer, the context, the handle for this
   run (propose one from the customer, the quarter or the offer), and the choices "Start it"
   (first) and "Change something". On "Change something", ask which item as free text and
   return to step 4 for that item.
6. `workflow` with `action: start`, `slug`, `context`, `handle`, `settled` (every label with its
   answer) and `by`. Report the tool's line: the run id and the first step. If the first step
   is due now, offer to do it in this chat.
