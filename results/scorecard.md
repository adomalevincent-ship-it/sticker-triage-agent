# Scorecard

Generated 2026-09-24T12:07:35.269Z

## Summary (one row per run)

| run | model | category accuracy | kappa | correctly escalated | correctly not escalated | missed escalations | false escalations | avg latency (ms) | total cost (USD) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | groq:openai/gpt-oss-20b | 67.5% | 0.843 | 8 | 16 | 7 | 0 | 884 | 0.0000 |
| 2 | groq:openai/gpt-oss-20b | 85.0% | 0.818 | 14 | 18 | 8 | 0 | 1125 | 0.0000 |
| 3 | groq:openai/gpt-oss-20b | 87.5% | 0.848 | 13 | 18 | 9 | 0 | 1248 | 0.0000 |
| 4 | groq:openai/gpt-oss-120b | 82.5% | 0.788 | 11 | 18 | 11 | 0 | 1197 | 0.0000 |
| 5 | groq:qwen/qwen3.8-27b | 90.0% | 0.879 | 12 | 18 | 10 | 0 | 732 | 0.0000 |

Kappa is computed only over tickets where the model produced a parseable category (shown per run below as `kappa n`); failures count against category accuracy but are excluded from kappa since it measures agreement between two category choices, not output reliability.

| run | model | failures (no output) | kappa n (of 40) |
| --- | --- | --- | --- |
| 1 | groq:openai/gpt-oss-20b | 9 | 31 |
| 2 | groq:openai/gpt-oss-20b | 0 | 40 |
| 3 | groq:openai/gpt-oss-20b | 0 | 40 |
| 4 | groq:openai/gpt-oss-120b | 0 | 40 |
| 5 | groq:qwen/qwen3.8-27b | 0 | 40 |

## Confusion matrices

### Run 1 — groq:openai/gpt-oss-20b

| true \ pred | order_status | proof_change | artwork_issue | quality_complaint | billing | other | no_output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| order_status | 5 | 0 | 0 | 0 | 0 | 0 | 1 |
| proof_change | 1 | 3 | 0 | 0 | 0 | 0 | 1 |
| artwork_issue | 0 | 2 | 5 | 0 | 0 | 0 | 0 |
| quality_complaint | 0 | 0 | 0 | 7 | 0 | 0 | 3 |
| billing | 0 | 0 | 0 | 0 | 5 | 0 | 2 |
| other | 1 | 0 | 0 | 0 | 0 | 2 | 2 |

### Run 2 — groq:openai/gpt-oss-20b

| true \ pred | order_status | proof_change | artwork_issue | quality_complaint | billing | other | no_output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| order_status | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| proof_change | 0 | 4 | 0 | 0 | 1 | 0 | 0 |
| artwork_issue | 0 | 2 | 5 | 0 | 0 | 0 | 0 |
| quality_complaint | 0 | 0 | 0 | 9 | 0 | 1 | 0 |
| billing | 0 | 0 | 1 | 0 | 6 | 0 | 0 |
| other | 1 | 0 | 0 | 0 | 0 | 4 | 0 |

### Run 3 — groq:openai/gpt-oss-20b

| true \ pred | order_status | proof_change | artwork_issue | quality_complaint | billing | other | no_output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| order_status | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| proof_change | 0 | 4 | 0 | 0 | 1 | 0 | 0 |
| artwork_issue | 0 | 2 | 5 | 0 | 0 | 0 | 0 |
| quality_complaint | 0 | 0 | 0 | 10 | 0 | 0 | 0 |
| billing | 0 | 0 | 1 | 0 | 6 | 0 | 0 |
| other | 1 | 0 | 0 | 0 | 0 | 4 | 0 |

### Run 4 — groq:openai/gpt-oss-120b

| true \ pred | order_status | proof_change | artwork_issue | quality_complaint | billing | other | no_output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| order_status | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| proof_change | 1 | 3 | 0 | 0 | 1 | 0 | 0 |
| artwork_issue | 0 | 2 | 5 | 0 | 0 | 0 | 0 |
| quality_complaint | 0 | 0 | 0 | 9 | 0 | 1 | 0 |
| billing | 0 | 0 | 1 | 0 | 6 | 0 | 0 |
| other | 1 | 0 | 0 | 0 | 0 | 4 | 0 |

### Run 5 — groq:qwen/qwen3.8-27b

| true \ pred | order_status | proof_change | artwork_issue | quality_complaint | billing | other | no_output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| order_status | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| proof_change | 1 | 4 | 0 | 0 | 0 | 0 | 0 |
| artwork_issue | 0 | 2 | 5 | 0 | 0 | 0 | 0 |
| quality_complaint | 0 | 0 | 0 | 10 | 0 | 0 | 0 |
| billing | 0 | 0 | 0 | 0 | 7 | 0 | 0 |
| other | 1 | 0 | 0 | 0 | 0 | 4 | 0 |

## Cross-model comparison

Uses the most recent run for each distinct model: groq:openai/gpt-oss-20b (run 3), groq:openai/gpt-oss-120b (run 4), groq:qwen/qwen3.8-27b (run 5).

**Tickets every model got wrong (category or escalation mismatch, or no output): 11**

8, 9, 24, 25, 26, 28, 29, 34, 36, 37, 40

**Tickets where models disagreed with each other on category: 4**

31, 36, 37, 40
