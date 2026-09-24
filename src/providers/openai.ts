import type { ModelAdapter, ModelResponse } from "./types.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export function createOpenAIAdapter(model: string): ModelAdapter {
  return {
    name: `openai:${model}`,
    async callModel(prompt: string): Promise<ModelResponse> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set in .env");
      }

      const started = Date.now();
      const res = await fetch(OPENAI_API_URL, {
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
        throw new Error(`OpenAI API error ${res.status}: ${body}`);
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
