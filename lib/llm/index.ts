import { env } from "../env";
import { createAnthropicProviderFromEnv } from "./anthropic-provider";
import { FakeLLMProvider } from "./fake-llm-provider";
import type { LLMProvider } from "./types";

let instance: LLMProvider | undefined;

export function getLLMProvider(): LLMProvider {
  if (!instance) {
    switch (env.LLM_PROVIDER) {
      case "anthropic":
        instance = createAnthropicProviderFromEnv();
        break;
      case "fake":
        instance = new FakeLLMProvider();
        break;
    }
  }
  return instance;
}

export type { LLMProvider, LLMGenerateParams, LLMGenerateResult } from "./types";
