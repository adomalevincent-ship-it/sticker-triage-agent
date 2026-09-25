import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const fullGuide = readFileSync(
  path.join(projectRoot, "docs/labeling-guide.md"),
  "utf-8"
);
// Drop the "Columns in data/labels.csv" section — that's about the CSV
// file format, not something the model needs to classify a ticket.
const rules = (fullGuide.split("## Columns in `data/labels.csv`")[0] ?? fullGuide).trim();

export interface TicketInput {
  subject: string;
  body: string;
}

export function buildPrompt(ticket: TicketInput): string {
  return `You are a support ticket triage assistant for a custom sticker and print company.

Classify the following support ticket using these rules:

${rules}

Before deciding should_escalate, answer these four questions about the ticket, in order, each yes or no:
1. Does the customer ask for money back, or dispute a charge?
2. Does the customer report that the product arrived damaged, misprinted, wrong, or faded?
3. Is the customer angry, or do they mention a chargeback, a public review, or legal action?
4. Is this a ticket where a wrong or overconfident reply could cost the sale? Answer yes if the ticket is any of:
   - a pre-sale enquiry about a bulk order, a wholesale/reseller relationship, or a sample request
   - a message too short or too vague to confidently know what the customer wants
   - a ticket that raises two separate issues at once

If the answer to ANY of the four questions is yes, should_escalate must be true. Only set should_escalate to false if all four answers are no.

Ticket subject: ${ticket.subject}
Ticket body: ${ticket.body}

Respond with ONLY valid JSON — no markdown code fences, no commentary before or after it. Match this exact shape:
{"category": "<one of the six categories above>", "should_escalate": true|false, "draft_reply": "<a suggested reply to the customer>", "reasoning": "<state your yes/no answer to each of the four escalation questions, then your category choice>"}

Rules for draft_reply:
- Keep it under 120 words.
- Do not invent company policies, prices, discounts, or delivery dates that were not stated by the customer or in the rules above.

Return only the JSON object, nothing else.`;
}
