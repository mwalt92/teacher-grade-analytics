import type { AIGradingProvider, AIGradingRequest, AIGradingResult } from "./types";

export class DisabledAIGradingProvider implements AIGradingProvider {
  readonly id = "disabled";

  async grade(_request: AIGradingRequest): Promise<AIGradingResult> {
    throw new Error("Live AI grading is disabled. Use demo recommendations until an approved provider is configured.");
  }
}

export function liveAIGradingEnabled() {
  return process.env.AI_GRADING_ENABLED === "true" && Boolean(process.env.AI_GRADING_PROVIDER) && process.env.AI_GRADING_PROVIDER !== "disabled";
}
