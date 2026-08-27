import type { LLMGenerateParams, LLMGenerateResult, LLMProvider } from "./types";

export const FAKE_PRD_MARKDOWN = `## Overview

This is a fake, canned PRD produced by the LLM_PROVIDER=fake demo mode — no LLM was actually called.

## Problem Statement

Demo problem statement.

## Goals & Non-Goals

- Demonstrate the upload-to-PRD pipeline end to end.

## User Stories / Personas

1. As a demo user, I want to see a realistic-looking PRD, so that I can evaluate the app without an API key.

## Functional Requirements

1. The system must render this document, including its diagram, correctly.

## Process Flow

A short prose summary of the (fake) process.

\`\`\`mermaid
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do the thing]
  B -->|No| D[Do something else]
  C --> E[End]
  D --> E[End]
\`\`\`

## Success Metrics

- The diagram above renders as an actual flowchart, not raw text.

## Open Questions / Risks

- None — this is demo content.
`;

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
      markdown: FAKE_PRD_MARKDOWN,
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
