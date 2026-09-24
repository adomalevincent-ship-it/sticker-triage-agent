# Labeling Guide

This guide defines how human labelers should fill in `data/labels.csv`. Each ticket in
`data/tickets.csv` gets exactly one row here: a category, an escalation flag, and optional notes.

## Categories

Pick exactly one category per ticket.

- **order_status** — where is my order, shipping times, tracking, delivery dates
- **proof_change** — changes to a proof, approving or rejecting a proof
- **artwork_issue** — problems with the uploaded file (resolution, format, sizing, cut lines)
- **quality_complaint** — product arrived damaged, misprinted, wrong item, faded
- **billing** — charges, refunds requested for non-quality reasons, invoices, discounts
- **other** — anything that fits none of the above

### Tie-break

If a ticket covers two categories, pick the one the customer most needs resolved.

## Escalation

Set `should_escalate = true` if **any** of the following apply:

- the customer asks for money back or disputes a charge
- the customer reports damage or a misprint
- the customer is angry, mentions a chargeback, a review, or legal action
- the ticket is ambiguous enough that a wrong reply could cost a sale

Otherwise, `should_escalate = false` — the agent drafts a reply for approval.

## Columns in `data/labels.csv`

- `ticket_id` — matches the `id` column in `data/tickets.csv`
- `category` — one of the six categories above
- `should_escalate` — `true` or `false`, per the rules above
- `notes` — free text, optional (e.g. why a tie-break was decided a certain way)
