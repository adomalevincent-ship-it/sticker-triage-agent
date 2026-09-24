import { PROVIDERS } from "./providers/registry.js";
import type { ModelAdapter } from "./providers/types.js";

export interface ModelConfig {
  id: string;
  provider: keyof typeof PROVIDERS;
  model: string;
}

// Groq deprecated llama-3.1-8b-instant and llama-3.3-70b-versatile on
// 2026-08-16, recommending openai/gpt-oss-20b and openai/gpt-oss-120b as
// replacements. qwen/qwen3.8-27b is included as a third, differently-sized
// model from a different lab. All three are on Groq's free tier as of
// 2026-09 (30 req/min, 1,000 req/day per model).
export const MODELS: ModelConfig[] = [
  { id: "groq-gpt-oss-20b", provider: "groq", model: "openai/gpt-oss-20b" },
  { id: "groq-gpt-oss-120b", provider: "groq", model: "openai/gpt-oss-120b" },
  { id: "groq-qwen3.8-27b", provider: "groq", model: "qwen/qwen3.8-27b" },
];

export function getAdapter(config: ModelConfig): ModelAdapter {
  const factory = PROVIDERS[config.provider];
  if (!factory) {
    throw new Error(`Unknown provider "${config.provider}"`);
  }
  return factory(config.model);
}
