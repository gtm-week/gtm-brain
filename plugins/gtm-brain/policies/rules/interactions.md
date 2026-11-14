---
title: This company's interactions
words: interaction interactions interact ontology connector action actions attio hubspot deal mail send move propose_interaction repeated by hand
attach: interact propose_interaction
---
This company's own interactions (move a deal in Attio, send a proposal by mail) are described in
`brain/ontology.ossie.json`; `list_objects` lists them and `interact` runs one in two calls: the
first checks and says what to do in the connector, with that connector's own tools, never with
Computer Use; the second, with the outcome and the connector's refs, records it. When the person
keeps doing the same thing by hand, call `propose_interaction`, then `approve_change` with kind
interaction (core 4).
