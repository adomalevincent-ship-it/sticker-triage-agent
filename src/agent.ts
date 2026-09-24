import type { ModelAdapter } from "./providers/types.js";
import { buildPrompt } from "./prompt.js";
import { isValidCategory, type Category } from "./categories.js";
import { RateLimitError } from "./providers/errors.js";

export interface Ticket {
  id: number;
  subject: string;
  body: string;
}

export interface AgentResult {
  ticketId: number;
  success: boolean;
  category: Category | null;
  shouldEscalate: boolean | null;
  draftReply: string | null;
  reasoning: string | null;
  latencyMs: number;
  error: string | null;
}

interface ParsedOutput {
  category: Category;
  shouldEscalate: boolean;
  draftReply: string;
  reasoning: string;
}

type ParseResult =
  | { ok: true; value: ParsedOutput }
  | { ok: false; error: string };

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

function parseAndValidate(raw: string): ParseResult {
  const candidate = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { ok: false, error: "response is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "response JSON is not an object" };
  }
  const obj = parsed as Record<string, unknown>;

  const category = typeof obj.category === "string" ? obj.category.trim() : "";
  if (!isValidCategory(category)) {
    return {
      ok: false,
      error: `category "${String(obj.category)}" is not one of the six allowed categories`,
    };
  }

  const shouldEscalate = coerceBoolean(obj.should_escalate);
  if (shouldEscalate === null) {
    return {
      ok: false,
      error: `should_escalate is missing or not a recognizable boolean (got ${JSON.stringify(obj.should_escalate)})`,
    };
  }

  const draftReply = typeof obj.draft_reply === "string" ? obj.draft_reply : "";
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";

  return { ok: true, value: { category, shouldEscalate, draftReply, reasoning } };
}

export async function runAgent(
  ticket: Ticket,
  adapter: ModelAdapter
): Promise<AgentResult> {
  const prompt = buildPrompt(ticket);
  let totalLatency = 0;
  let lastError = "";
  let rateLimitRetries = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text: string | null = null;

    // Rate-limit hits get their own bounded retry loop, using the wait time
    // the API itself reports, instead of burning the JSON-parse retry budget.
    while (text === null) {
      try {
        const response = await adapter.callModel(prompt);
        totalLatency += response.latencyMs;
        text = response.text;
      } catch (err) {
        if (err instanceof RateLimitError && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
          rateLimitRetries++;
          await sleep(err.retryAfterMs + 250);
          continue;
        }
        lastError = `model call failed: ${(err as Error).message}`;
        break;
      }
    }

    if (text === null) {
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      continue;
    }

    const result = parseAndValidate(text);
    if (result.ok) {
      return {
        ticketId: ticket.id,
        success: true,
        category: result.value.category,
        shouldEscalate: result.value.shouldEscalate,
        draftReply: result.value.draftReply,
        reasoning: result.value.reasoning,
        latencyMs: totalLatency,
        error: null,
      };
    }

    lastError = result.error;
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  return {
    ticketId: ticket.id,
    success: false,
    category: null,
    shouldEscalate: null,
    draftReply: null,
    reasoning: null,
    latencyMs: totalLatency,
    error: `failed after ${MAX_ATTEMPTS} attempt(s): ${lastError}`,
  };
}
