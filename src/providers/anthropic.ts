import type { ModelAdapter, ModelResponse } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export function createAnthropicAdapter(model: string): ModelAdapter {
  return {
    name: `anthropic:${model}`,
    async callModel(prompt: string): Promise<ModelResponse> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set in .env");
      }

      const started = Date.now();
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as {
        content: { type: string; text?: string }[];
      };
      const latencyMs = Date.now() - started;
      const text = data.content.find((b) => b.type === "text")?.text ?? "";
      return { text, latencyMs };
    },
  };
}
