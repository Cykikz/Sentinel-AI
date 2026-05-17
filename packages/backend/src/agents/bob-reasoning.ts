import { callBobCompressed } from "../compression/pipeline.js";
import {
  getMissingBobConfig,
  getRuntimeConfig,
  hasBobShellConfig,
} from "../config/env.js";

export interface BobReasoningResult {
  output: string;
  savingsPercent: number;
}

export async function runBobReasoning(
  projectRoot: string,
  systemPrompt: string,
  rawInput: string,
): Promise<BobReasoningResult | null> {
  const config = getRuntimeConfig(projectRoot);
  const hasConfig = hasBobShellConfig(config) || getMissingBobConfig(config).length === 0;

  if (config.DEMO_MODE || !hasConfig || rawInput.trim().length === 0) return null;

  try {
    const result = await callBobCompressed({
      systemPrompt,
      rawInput,
      maxInputTokens: 320,
      projectRoot,
      options: { maxTokens: 500, temperature: 0.1 },
    });

    return {
      output: result.output,
      savingsPercent: result.compression.metrics.savingsPercent,
    };
  } catch {
    return null;
  }
}
