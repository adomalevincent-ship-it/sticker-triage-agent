export interface ModelResponse {
  text: string;
  latencyMs: number;
}

export interface ModelAdapter {
  name: string;
  callModel(prompt: string): Promise<ModelResponse>;
}
