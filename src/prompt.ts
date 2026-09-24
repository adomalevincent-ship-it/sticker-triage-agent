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

Ticket subject: ${ticket.subject}
Ticket body: ${ticket.body}

Respond with ONLY valid JSON — no markdown code fences, no commentary before or after it. Match this exact shape:
{"category": "<one of the six categories above>", "should_escalate": true|false, "draft_reply": "<a suggested reply to the customer>", "reasoning": "<one or two sentences explaining your classification>"}

Rules for draft_reply:
- Keep it under 120 words.
- Do not invent company policies, prices, discounts, or delivery dates that were not stated by the customer or in the rules above.

Return only the JSON object, nothing else.`;
}
