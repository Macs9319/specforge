import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { buildUserPrompt, PRD_SYSTEM_PROMPT } from "./prompts";
import type { LLMGenerateParams, LLMGenerateResult, LLMProvider } from "./types";

const MAX_OUTPUT_TOKENS = 32000;

export class AnthropicLLMProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: "low" | "medium" | "high" | "xhigh" | "max";

  constructor(
    client: Anthropic,
    model: string,
    effort: "low" | "medium" | "high" | "xhigh" | "max",
  ) {
    this.client = client;
    this.model = model;
    this.effort = effort;
  }

  async generatePrd(params: LLMGenerateParams): Promise<LLMGenerateResult> {
    let message: Anthropic.Message;
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: this.effort },
        system: [
          { type: "text", text: PRD_SYSTEM_PROMPT },
          {
            type: "text",
            text: `Source document title: ${params.documentTitle}\n\n---\n\n${params.documentText}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildUserPrompt() }],
      });
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error("The LLM provider rate-limited this request. Please try again shortly.");
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error("The LLM provider rejected our credentials.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new Error(`The LLM provider returned an error: ${error.message}`);
      }
      throw error;
    }

    if (message.stop_reason === "refusal") {
      throw new Error("The LLM declined to generate a PRD for this document.");
    }

    if (message.stop_reason === "max_tokens") {
      throw new Error(
        `The generated PRD was truncated at the ${MAX_OUTPUT_TOKENS}-token output limit. Try regenerating, or shorten the source document.`,
      );
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("The LLM response contained no text content.");
    }

    return {
      markdown: textBlock.text,
      modelId: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}

export function createAnthropicProviderFromEnv(): AnthropicLLMProvider {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return new AnthropicLLMProvider(client, env.ANTHROPIC_MODEL, env.LLM_EFFORT);
}
