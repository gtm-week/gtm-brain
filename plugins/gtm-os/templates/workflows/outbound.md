---
kind: document
type: workflow
title: Outbound
applies_to: [outbound campaign]
status: draft
by: ""
updated: {{DATE}}
gtm-os: {{VERSION}}
---
# Outbound

Made with GTM OS. This document lives in the brain folder and travels with it.

An outbound campaign to a list of target accounts: one sequence, one offer, one owner. Shipped
with GTM OS as a draft; edit it to the way this company works.

## Before starting

- **Target accounts**: the list, or the ICP that produces it.
- **Why now**: the offer or trigger behind this campaign, in one sentence.
- **Owner**: who replies when a prospect answers.
- **Sequencer**: which outreach tool sends the sequence.

## Steps

1. **Build the target list** (tool: crm). Pull the accounts and contacts that match the ICP;
   save the list as a file of this run.
2. **Write the sequence** (tool: sequencer). Three to four touches, the offer in the first,
   following the tone of voice document when there is one.
3. **Launch** (tool: sequencer). Load the list, start the sequence, note the start date.
   Gate: after 10 days.
4. **Read replies and book** (tool: crm). Replies, meetings booked, bounces; hand warm
   replies to the owner.

## Learn

- Reply rate and meetings booked, against the last outbound run.
- Which segment of the list replied most.
