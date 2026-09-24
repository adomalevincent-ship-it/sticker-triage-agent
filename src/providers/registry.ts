import { createGroqAdapter } from "./groq.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createOpenAIAdapter } from "./openai.js";
import { createXaiAdapter } from "./xai.js";
import type { ModelAdapter } from "./types.js";

export const PROVIDERS: Record<string, (model: string) => ModelAdapter> = {
  groq: createGroqAdapter,
  anthropic: createAnthropicAdapter,
  openai: createOpenAIAdapter,
  xai: createXaiAdapter,
};
