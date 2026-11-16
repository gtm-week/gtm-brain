# Schema

What this brain keeps about each person, organization, product, offering, event, tool and meeting,
and how they relate. Codex fills these fields from your notes, each value citing the notes it rests on, and
lists a required field nobody has said yet as a gap to ask about. Edit freely, or say
`/gtmb-schema` and Codex changes it for you. GTM Brain never overwrites your edits.

Every `## <Kind>` section with a field table is a kind. Person, organization, product, offering,
event, tool and meeting always exist; add a section to add a kind. Add fields, organization subtypes and
relationship types the same way. Projects are not kinds: a project is a tag.

A meeting needs no section here: its fields are date (required), title, organizer and source (where
the transcript or recording is; it stays in its tool), its page collects the notes saved with its
meeting id, and everyone who attended links to it. Leave a `## Meeting` section out while a teammate
is still on GTM Brain 0.34: that version cannot read a file with one.

## Person

| Field | What it means | Required |
| --- | --- | --- |
| role | Job title or what they do at their organization | yes |
| location | City and country they work from | no |
| linkedin | Their LinkedIn profile link | no |
| how_we_met | Who introduced them, or where we first met | no |
| buying_role | Their part in a buying decision, in the ICP's words: decision maker, champion, user, blocker | no |

## Organization

| Field | What it means | Required |
| --- | --- | --- |
| website | Main website | yes |
| industry | Their market, in a few words | yes |
| size | Number of employees, roughly | no |
| hq | City and country of the head office | no |
| segment | Which segment of our ICP it belongs to, in the ICP's words | no |

### Subtypes

| Subtype | What it is |
| --- | --- |
| company | A business we sell to, buy from or meet |
| team | A team inside an organization |
| investor | A fund, angel group or investing firm |
| partner | An agency, integrator or reseller we work with |
| community | A community, association or event organizer |

### investor

| Field | What it means | Required |
| --- | --- | --- |
| stage | Stages they invest in, for example pre-seed or seed | no |

## Product

| Field | What it means | Required |
| --- | --- | --- |
| category | What kind of product it is | yes |
| maker | Who makes it, if not us | no |
| pricing | How it is priced | no |

## Offering

| Field | What it means | Required |
| --- | --- | --- |
| what_it_is | What we sell, in a sentence: a service, package or plan | yes |
| price | What it costs the customer | no |
| who_it_is_for | Who it is for: the buyer or segment | no |

## Event

| Field | What it means | Required |
| --- | --- | --- |
| date | When it takes place, as a date | yes |
| location | City and venue, or online | no |
| url | The event page | no |

## Tool

| Field | What it means | Required |
| --- | --- | --- |
| category | What kind of tool it is, for example CRM or email | yes |
| vendor | Who makes it | no |
| connector | The connector Codex uses to reach it, if any | no |
| state | Whether we use it, are trying it, or stopped | no |
| owner | Who on our team owns it | no |
| cost | What it costs us | no |

## Relationships

A relationship is a note with a type, kept over time: when one ends, a new note says so, and the
history stays. `us` is our own company. Required means every person or organization on the From
side should have a current one. One at a time means a new current one ends the previous one, dated
to the new note (a person has one employer); no means several at once.

| Type | From | To | What it means | Required | One at a time |
| --- | --- | --- | --- | --- | --- |
| works_at | person | organization | Employed by, or a founder of | yes | yes |
| reports_to | person | person | Their manager | no | yes |
| partner_of | organization | us | A partner of ours: referrals, integrations, co-selling | no | no |
| investor_in | person, organization | organization, us | Has invested in | no | no |
| uses | person, organization | product | Uses this product, ours or another | no | no |
| speaker_at | person | event | Speaks or spoke at this event | no | no |
| attended | person | event | Attends or attended this event (a meeting too, always) | no | no |
| competes_with | organization | us | A competitor of ours: buyers choose between them and us | no | no |
| integrates_with | tool | tool | Connected to this other tool | no | no |
| customer_of | person, organization | us | Customer status (customer, prospect, former customer), kept by the customer notes | no | yes |
