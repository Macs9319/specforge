import { env } from "../env";
import { createAnthropicProviderFromEnv } from "./anthropic-provider";
import { FakeLLMProvider } from "./fake-llm-provider";
import { createOpenAIProviderFromEnv } from "./openai-provider";
import type { LLMProvider } from "./types";

let instance: LLMProvider | undefined;

export function getLLMProvider(): LLMProvider {
  if (!instance) {
    switch (env.LLM_PROVIDER) {
      case "anthropic":
        instance = createAnthropicProviderFromEnv();
        break;
      case "openai":
        instance = createOpenAIProviderFromEnv();
        break;
      case "fake":
        instance = new FakeLLMProvider();
        break;
    }
  }
  return instance;
}

export type { LLMProvider, LLMGenerateParams, LLMGenerateResult } from "./types";
