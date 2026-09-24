export class RateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseRetryAfterMs(message: string, fallbackMs: number): number {
  const match = message.match(/try again in ([\d.]+)(ms|s)\b/i);
  if (!match) return fallbackMs;
  const value = parseFloat(match[1]!);
  return match[2]!.toLowerCase() === "s" ? Math.ceil(value * 1000) : Math.ceil(value);
}
