export type LLMGenerateParams = {
  documentTitle: string;
  documentText: string;
};

export type LLMGenerateResult = {
  markdown: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export interface LLMProvider {
  generatePrd(params: LLMGenerateParams): Promise<LLMGenerateResult>;
}
