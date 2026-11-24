---
kind: document
type: workflow
title: Topic analysis
applies_to: [audience topic prioritization]
status: draft
trigger: manual
reads: ["kind:person", "kind:organization"]
writes: []
by: ""
updated: {{DATE}}
gtm-brain: {{VERSION}}
---
# Topic analysis

A manual staged run. Execute only the current stage of the named skill. Record progress through
the workflow tool; collection, external delivery and list updates retain their own authority.
Any supplied ICP list can start this workflow. No Audience Loop run, output or host registry
is required. This workflow does not start the other workflow or create a schedule.

## Before starting

- **Audience and offering**: selected profile and relevant buyer definition.
- **Scope and sources**: objective, supplied ICP list snapshot or evidence corpus, time window, quality target and whether bounded host-post expansion is included.
- **Research authority**: permitted access, request/run/daily/cumulative caps or existing evidence only.
- **Contribution policy**: company configuration reference/revision for profile, formats, fit, contribution topics, angle and freshness; inventory-only scope when no contribution recommendations are requested.
- **Review and output**: reviewer, report destination and existing context for findings.

## Steps

1. **Frame the analysis** (skill: gtmb-topic-analyzer). Confirm audience, offering, objective, source window and collection authority. Record a run-scoped note through remember with tag topic-frame only after the work is verified. Milestone: a note tagged topic-frame.
2. **Review the evidence** (skill: gtmb-topic-analyzer). From any supplied ICP list, resolve seed identities and reuse or collect observed engagement and original posts within authority; optionally expand to authored host posts only within scope. Preserve list provenance, qualification unknowns, engagement links and coverage. Supplied evidence can be analyzed directly without the Audience Loop. Retain the finding or coverage gap as a sourced, run-scoped note through remember, then advance the workflow after verifying that note. Milestone: a note tagged topic-evidence.
3. **Analyze the themes** (skill: gtmb-topic-analyzer). Compare recurrence, buyer relevance, urgency, confidence and contradictions. Keep broad inventory separate; apply the shared contribution contract to proposed contribution opportunities and downstream handoffs. Retain the finding or coverage gap as a sourced, run-scoped note through remember, then advance the workflow after verifying that note. Milestone: a note tagged topic-shortlist.
4. **Review priorities** (skill: gtmb-topic-analyzer). Ask the person to accept or correct the shortlist; record their actual response, then retain accepted outcomes. Retain the person's actual answer and its source as a run-scoped note through remember, then advance the workflow. Milestone: a note tagged topic-reviewed.

## Learn

- Which topics were accepted or rejected, and why?
- Which evidence gaps could change the next analysis?
