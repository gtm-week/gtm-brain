---
kind: document
type: workflow
title: Audience discovery
applies_to: [people and conversation discovery]
status: draft
trigger: manual
reads: ["kind:person", "kind:organization"]
writes: []
by: ""
updated: {{DATE}}
gtm-brain: {{VERSION}}
---
# Audience discovery

A manual staged run. Execute only the current stage of the named skill. Record progress through
the workflow tool; collection, external delivery and list updates retain their own authority.
This workflow does not start the other workflow or create a schedule.

## Before starting

- **Audience and offering**: selected profile and relevant buyer definition.
- **Scope and sources**: objective, source set, time window and quality target.
- **Research authority**: permitted access, request/run/daily/cumulative caps or existing evidence only.
- **Contribution policy**: company configuration reference/revision for profile, formats, fit, contribution topics, angle and freshness; inventory-only scope when no contribution recommendations are requested.
- **Review and output**: reviewer, report destination and existing context for findings.

## Steps

1. **Frame discovery** (skill: gtmb-audience-loop). Confirm selected profile, roles, geography, freshness, result target and research authority. Record a run-scoped note through remember with tag audience-frame only after the work is verified. Milestone: a note tagged audience-frame.
2. **Discover candidates** (skill: gtmb-audience-loop). Reconcile pending requests, reuse evidence and expand discovery within authorized limits. Retain the finding or coverage gap as a sourced, run-scoped note through remember, then advance the workflow after verifying that note. Milestone: a note tagged audience-evidence.
3. **Assess opportunities** (skill: gtmb-audience-loop). Qualify ICP and host roles independently. Apply the shared contribution contract across all discovery routes; prepare sourced opportunities, aggregates and recommendation exports from the same eligible set, with excluded and needs-screening counts. For a time-limited LinkedIn request, lead with one verified opening or explain why the reviewed threads have none. Keep nominations separate. Retain the finding or coverage gap as a sourced, run-scoped note through remember, then advance the workflow after verifying that note. Milestone: a note tagged audience-reviewed.
4. **Capture feedback** (skill: gtmb-audience-loop). Ask for feedback on the conversation. Request per-role decisions only for an in-scope list review; record the actual response and any authorized list updates. Retain the person's actual answer and its source as a run-scoped note through remember, then advance the workflow. Milestone: a note tagged audience-feedback.

## Learn

- Which opportunities and candidates were useful for this profile?
- Which source gaps or feedback should change the next discovery run?
