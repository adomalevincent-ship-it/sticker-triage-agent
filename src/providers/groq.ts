import type { ModelAdapter, ModelResponse } from "./types.js";
import { RateLimitError, parseRetryAfterMs } from "./errors.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export function createGroqAdapter(model: string): ModelAdapter {
  return {
    name: `groq:${model}`,
    async callModel(prompt: string): Promise<ModelResponse> {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is not set in .env");
      }

      const started = Date.now();
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) {
          throw new RateLimitError(
            `Groq API error 429: ${body}`,
            parseRetryAfterMs(body, 5000)
          );
        }
        throw new Error(`Groq API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      const latencyMs = Date.now() - started;
      const text = data.choices[0]?.message?.content ?? "";
      return { text, latencyMs };
    },
  };
}
