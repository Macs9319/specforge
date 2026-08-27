import OpenAI from "openai";
import { env } from "../env";
import { buildUserPrompt, PRD_SYSTEM_PROMPT } from "./prompts";
import type { LLMGenerateParams, LLMGenerateResult, LLMProvider } from "./types";

const MAX_OUTPUT_TOKENS = 16000;

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(client: OpenAI, model: string) {
    this.client = client;
    this.model = model;
  }

  async generatePrd(params: LLMGenerateParams): Promise<LLMGenerateResult> {
    let completion: OpenAI.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: "system",
            content: `${PRD_SYSTEM_PROMPT}\n\n---\n\nSource document title: ${params.documentTitle}\n\n${params.documentText}`,
          },
          { role: "user", content: buildUserPrompt() },
        ],
      });
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) {
        throw new Error(
          "The LLM provider rate-limited this request. Please try again shortly.",
        );
      }
      if (error instanceof OpenAI.AuthenticationError) {
        throw new Error("The LLM provider rejected our credentials.");
      }
      if (error instanceof OpenAI.APIError) {
        throw new Error(`The LLM provider returned an error: ${error.message}`);
      }
      throw error;
    }

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("The LLM response contained no choices.");
    }

    if (choice.finish_reason === "content_filter") {
      throw new Error("The LLM declined to generate a PRD for this document.");
    }

    if (choice.finish_reason === "length") {
      throw new Error(
        `The generated PRD was truncated at the ${MAX_OUTPUT_TOKENS}-token output limit. Try regenerating, or shorten the source document.`,
      );
    }

    const content = choice.message.content;
    if (!content) {
      throw new Error("The LLM response contained no text content.");
    }

    return {
      markdown: content,
      modelId: completion.model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
  }
}

export function createOpenAIProviderFromEnv(): OpenAIProvider {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return new OpenAIProvider(client, env.OPENAI_MODEL);
}
