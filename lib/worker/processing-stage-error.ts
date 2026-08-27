export type ProcessingStage = "parse" | "generate";

/**
 * Thrown by processDocumentJob so the caller (the worker's queue-level
 * failure handler) knows which record — Document or Prd — to mark FAILED
 * once retries are exhausted, without having to re-derive it from the
 * error message.
 */
export class ProcessingStageError extends Error {
  readonly stage: ProcessingStage;

  constructor(stage: ProcessingStage, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProcessingStageError";
    this.stage = stage;
  }
}
