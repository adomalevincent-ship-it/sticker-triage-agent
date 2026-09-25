# Sticker Triage Agent

A small evaluation harness for testing whether a free-tier LLM can triage customer support
tickets for a custom sticker and print company: classify each ticket into one of six
categories, decide whether it needs to escalate to a human, and draft a reply.

## Why this exists

Before wiring an LLM into a real support queue, I wanted a concrete answer to two questions:
how accurately can a cheap/free model classify tickets against my own judgment, and — more
importantly — how often does it silently make the wrong call on *escalation*, where a wrong
answer reaches a customer instead of a human. This repo is that experiment: a hand-labeled
40-ticket dataset, a pluggable model layer, and a scoring pipeline that treats missed
escalations and false escalations as different, non-interchangeable failure modes.

## How to run it

Requires Node.js, a Postgres database (tested against Railway), and a free Groq API key.

```bash
npm install
```

Create `.env` with:

```
DATABASE_URL=postgresql://...
GROQ_API_KEY=...
```

Then:

```bash
npx tsx src/migrate.ts        # create tables
npx tsx src/load-data.ts      # load data/tickets.csv and data/labels.csv
npm run run:all               # run every model in src/models.ts over all 40 tickets
npx tsx src/score.ts          # score every run against the labels, write results/scorecard.md
npx tsx src/compare-before-after.ts   # before/after comparison across prompt revisions
```

`npm run run` (with a model id from `src/models.ts` as an argument) runs a single model instead
of all three. `src/diagnose-escalations.ts`, `src/query-false-escalations.ts`, and
`src/recompute-excl-tricky.ts` are one-off diagnostic tools used while investigating specific
failures — see their file headers for what each does and why it exists.

## Headline results

Scored against the same 40 hand-labeled tickets, before and after revising the escalation
prompt (full detail in [`results/scorecard.md`](results/scorecard.md)):

| model | phase | category accuracy | kappa | missed escalations | false escalations |
| --- | --- | --- | --- | --- | --- |
| gpt-oss-20b | before | 87.5% | 0.848 | 9 | 0 |
| gpt-oss-20b | after | 87.5% | 0.848 | 3 | 1 |
| gpt-oss-120b | before | 82.5% | 0.788 | 11 | 0 |
| gpt-oss-120b | after | 87.5% | 0.848 | 3 | 1 |
| qwen3.8-27b | before | 90.0% | 0.879 | 10 | 0 |
| qwen3.8-27b | after | 92.5% | 0.909 | 2 | 4 |

## The rule-4 story

All three models initially missed roughly a third to a half of true escalations, and the
misses were heavily concentrated (8 of 12 distinct tickets) in one specific rule: "the ticket
is ambiguous enough that a wrong reply could cost a sale." Unlike the other three escalation
rules, this one has no keyword to latch onto, and the models' own reasoning showed they were
checking for anger, refunds, and damage while never considering it. Rewriting the prompt as an
explicit four-question checklist — with concrete handles for rule 4 (pre-sale enquiries,
too-vague messages, two-issue tickets) — cut missed escalations by 73% and improved category
accuracy and kappa for every model, at the cost of 6 new false escalations across the three
models combined (up from 0), most of them the model over-applying "ambiguous" to routine
`artwork_issue` file-check questions rather than genuinely hard cases.

## Limitations

- The revised prompt was tuned by reading exactly which of these 40 tickets the original
  prompt got wrong, then adjusting the prompt to fix those specific misses. The improvement
  numbers above confirm the fix works on this dataset — they are not evidence it generalizes to
  unseen tickets. See "What I'd do next" in `results/scorecard.md`.
- Runs 1-5 in the `runs`/`results` tables predate the `reasoning` column and have no stored
  reasoning; only runs 9 onward do.
- All evaluation was done on Groq's free tier against three open-weight models; no paid
  providers (Anthropic, OpenAI, xAI) have been tested despite adapters existing for them.

## A note on how this was built

This project was built with [Claude Code](https://claude.com/claude-code) — the TypeScript
scaffolding, database schema, model adapters, agent/scoring/diagnostic scripts, and this
documentation were written by Claude under direction. The support ticket labels, the
escalation rules in `docs/labeling-guide.md`, the evaluation design (why kappa in addition to
accuracy, why missed and false escalations are scored separately, what counts as a "tricky"
ticket), and the analysis and conclusions drawn from the results are mine.
