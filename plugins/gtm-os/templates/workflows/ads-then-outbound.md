---
kind: document
type: workflow
title: Ads, then outbound
applies_to: [outbound campaign, linkedin ads]
status: draft
by: ""
updated: {{DATE}}
gtm-os: {{VERSION}}
---
# Ads, then outbound

Made with GTM OS. This document lives in the brain folder and travels with it.

Two weeks of ads to the target accounts first, then outreach only to the accounts that
engaged. Shipped with GTM OS as a draft; edit it to the way this company works.

## Before starting

- **Target accounts**: the list, or the ICP that produces it.
- **Why now**: the offer or trigger behind this campaign, in one sentence.
- **Budget**: for the ads, in the currency the company uses.
- **Ad platform**: where the ads run and who has access.
- **Sequencer**: which outreach tool sends the sequences.

## Steps

1. **Build the target list** (tool: crm). Pull the accounts that match the ICP; save the list
   as a file of this run.
2. **Launch the ads** (tool: ads). Brief, creatives, audience from the list. Gate: after 14
   days.
3. **Read engagement** (tool: ads). Which accounts engaged most; save the engaged list as a
   file of this run. Gate: when the engaged accounts are known.
4. **Outreach to the engaged accounts** (tool: sequencer). Only those; never the accounts
   that clicked nothing.

## Learn

- Reply and meeting rate of the outreach, against the last outbound run.
- Which accounts engaged with the ads but not with the outreach.
