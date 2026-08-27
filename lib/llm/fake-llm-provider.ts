import type { LLMGenerateParams, LLMGenerateResult, LLMProvider } from "./types";

/**
 * Scripted LLMProvider for unit tests, so worker/generation logic can be
 * tested without calling a real LLM API.
 */
export class FakeLLMProvider implements LLMProvider {
  public readonly calls: LLMGenerateParams[] = [];

  constructor(
    private readonly result:
      | LLMGenerateResult
      | ((params: LLMGenerateParams) => LLMGenerateResult) = {
      markdown: "## Overview\n\nFake PRD content.",
      modelId: "fake-model",
      inputTokens: 10,
      outputTokens: 20,
    },
  ) {}

  async generatePrd(params: LLMGenerateParams): Promise<LLMGenerateResult> {
    this.calls.push(params);
    return typeof this.result === "function" ? this.result(params) : this.result;
  }
}
