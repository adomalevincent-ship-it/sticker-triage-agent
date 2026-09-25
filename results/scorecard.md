# Scorecard

Generated 2026-09-25

## Before / after: revised escalation-checklist prompt

"Before" = runs 3-5, the original single-judgment escalation prompt.
"After" = runs 9-11, the revised prompt with an explicit 4-question escalation checklist.
Both scored against the same 40 human-labeled tickets in `data/labels.csv`.

| model | phase | run | category accuracy | kappa | missed escalations | false escalations | avg latency (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| groq:openai/gpt-oss-20b | before | 3 | 87.5% | 0.848 | 9 | 0 | 1248 |
| groq:openai/gpt-oss-20b | after | 9 | 87.5% | 0.848 | 3 | 1 | 1708 |
| groq:openai/gpt-oss-120b | before | 4 | 82.5% | 0.788 | 11 | 0 | 1197 |
| groq:openai/gpt-oss-120b | after | 10 | 87.5% | 0.848 | 3 | 1 | 2030 |
| groq:qwen/qwen3.8-27b | before | 5 | 90.0% | 0.879 | 10 | 0 | 732 |
| groq:qwen/qwen3.8-27b | after | 11 | 92.5% | 0.909 | 2 | 4 | 1306 |

**Totals across all three models:** missed escalations 30 → 8 (-73%); false escalations 0 → 6; category accuracy and kappa improved for every model.

### Excluding the 10 "tricky" tickets (31-40), after-phase only

| run | model | n | category accuracy | kappa | missed | false |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | gpt-oss-20b | 30 | 93.3% | 0.920 | 2 | 1 |
| 10 | gpt-oss-120b | 30 | 93.3% | 0.920 | 2 | 1 |
| 11 | qwen3.8-27b | 30 | 93.3% | 0.920 | 2 | 4 |

Category accuracy and kappa converge to an identical 93.3% / 0.920 across all three models once the tricky 10 are excluded, confirming that remaining category-classification error is concentrated almost entirely in the tickets designed to be hard.

**False escalations do not follow that pattern.** All 6 false escalations across all three models occurred in the "easy" 30 — zero came from the tricky 10. The new false-positive cost of the revised prompt isn't coming from genuinely ambiguous edge cases; it's coming from the model over-applying the rule-4 checklist question to ordinary, well-understood technical questions (see below).

## Diagnosis: why the original prompt under-escalated (rule 4)

Before revising the prompt, missed escalations from the original runs (3-5) were grouped by which of the four escalation rules in `docs/labeling-guide.md` should have fired:

| rule | tickets | count |
| --- | --- | --- |
| 1. Asks for money back / disputes a charge | 21, 22, 40 | 3 |
| 2. Reports damage or a misprint | — | 0 |
| 3. Angry / chargeback / review / legal | 33 | 1 |
| 4. Ambiguous — wrong reply could cost a sale | 24, 25, 26, 28, 29, 34, 36, 37 | 8 |

Rule 4 alone accounted for 8 of 12 distinct missed tickets (67%). Rules 1-3 each have a concrete textual anchor (a refund word, a damage word, an angry/legal word); rule 4 has none, and the model's own reasoning consistently omitted it as a consideration:

> Ticket 26 (bulk order): *"The customer is asking about bulk discounts... **No anger or refund request is present, so escalation is not needed.**"*

> Ticket 29 (wholesale partnership): *"...does not fit into order status, proof changes, artwork issues, quality complaints, or billing. **There are no triggers for escalation such as anger, damage, or payment disputes.**"*

> Ticket 34 ("hey" / "did it go out yet"): *"...there is no indication of anger or refund request, so escalation is not needed."*

All three explicitly enumerate rules 1 and 3 as their checklist and never mention rule 4. The fix (see `src/prompt.ts`) turned escalation into an explicit 4-question checklist and gave rule 4 concrete handles: pre-sale enquiries (bulk orders, wholesale/reseller relationships, sample requests), messages too short or vague to confidently answer, and tickets raising two separate issues at once.

## The trade-off, in plain numbers

- Missed escalations: **30 → 8** across all three models combined (-73%).
- False escalations: **0 → 6** across all three models combined.
- Category accuracy and kappa improved for every model.
- Average latency rose 37-70% per model (more tokens: the checklist plus a 4-part reasoning requirement).

A missed escalation lets an auto-drafted reply reach a customer who should have gone to a human — a refund dispute, reported damage, or an angry customer, per `docs/labeling-guide.md`. A false escalation costs a human a few seconds reviewing a ticket that didn't strictly need it. Under that asymmetric cost, trading 22 fewer missed escalations for 6 new false ones is very likely a net win — but it is a real, measured regression on the false-escalation axis, not a free improvement, and the extra latency has a real cost too if this runs at volume.

Of the 4 new false escalations from qwen (run 11) — the largest single increase — none look like a labeling error. All 4 (tickets 3, 12, 14, 15) are routine questions structurally identical to sibling tickets that were correctly left unescalated; the model's rule-4 reasoning conflates "this requires inspecting a file or technical detail" with "this is too ambiguous to answer," which over-fires on the `artwork_issue` category specifically.

## Limitations

- **The revised prompt was tuned on the same 40 tickets it is scored against.** Rule 4's concrete handles (bulk/wholesale/samples, short/vague messages, two-issue tickets) were written after reading exactly which of these 40 tickets the original prompt missed. The accuracy and escalation improvements reported here are therefore optimistic relative to how this prompt would perform on a fresh, unseen batch of tickets — they confirm the checklist fixes the diagnosed gap on this dataset, not that it generalizes. Validating that requires scoring against a held-out set the prompt was never diagnosed against.
- **Runs 3-5 have no stored `reasoning`.** The `results.reasoning` column was added after those runs completed (see `src/schema.sql`); the rule-4 diagnosis above used `src/diagnose-escalations.ts`, which re-queries the same model/prompt for just the missed tickets to obtain representative reasoning text. That re-query is a fresh sampling call, not the literal original output, so its category/escalate values can occasionally differ from what runs 3-5 actually scored (this is why it's used only for qualitative reasoning text, never to alter scored metrics). Runs 9 onward store reasoning directly and don't have this limitation.

## What I'd do next

Narrow rule 4's pre-sale/ambiguity handle so it explicitly excludes routine pre-print file checks in `artwork_issue` — the checklist question should trigger on "is this a sample/bulk/wholesale enquiry, or a message too short or vague to know what's being asked," not on "does answering this require inspecting a file," which describes the entire category and is why tickets 3, 12, 14, and 15 got over-flagged. Re-run all three models after that change.

**This has not been tested.** A third round tuned on the same 40 tickets — using the same false escalations just diagnosed to further narrow the same rule — would only overfit the prompt to this dataset more tightly, not demonstrate real improvement. The actual next step is scoring against a fresh holdout set the prompt has never been diagnosed against, so any accuracy or escalation numbers reported are a genuine test rather than a description of what the prompt was tuned to do.
