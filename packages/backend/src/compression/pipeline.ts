import type { FindingRecord } from "../memory/db.js";
import { getRuntimeConfig } from "../config/env.js";
import { getMissingBobConfig, hasBobShellConfig } from "../config/env.js";
import { callBob } from "../bob/client.js";
import type { BobGenerateOptions } from "../types/index.js";
import { capTokens, cavemanCompress } from "./caveman.js";
import type { CavemanMode } from "./caveman.js";
import { semanticReduce } from "./semantic-reducer.js";

export interface CompressionMetrics {
  rawChars: number;
  compressedChars: number;
  rawTokens: number;
  compressedTokens: number;
  savingsPercent: number;
  removedLines: number;
  mode: CavemanMode;
}

export interface CompressionResult {
  compressed: string;
  metrics: CompressionMetrics;
}

export interface CompressedBobRequest {
  systemPrompt: string;
  rawInput: string;
  options?: BobGenerateOptions;
  maxInputTokens?: number;
  projectRoot?: string;
}

export function compressIntelligence(
  rawInput: string,
  options: { mode?: CavemanMode; maxTokens?: number } = {},
): CompressionResult {
  const mode = options.mode ?? getRuntimeConfig().CAVEMAN_MODE;
  const reduced = semanticReduce(rawInput);
  const caveman = cavemanCompress(reduced.reduced, mode);
  const compressed = capTokens(caveman, options.maxTokens ?? 240);
  const rawTokens = estimateTokens(rawInput);
  const compressedTokens = estimateTokens(compressed);

  return {
    compressed,
    metrics: {
      rawChars: rawInput.length,
      compressedChars: compressed.length,
      rawTokens,
      compressedTokens,
      savingsPercent:
        rawTokens === 0
          ? 0
          : Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 100)),
      removedLines: reduced.removedLines,
      mode,
    },
  };
}

export function compressFindings(findings: FindingRecord[]): CompressionResult {
  const lines = serializeFindings(findings);

  return compressIntelligence(lines.join("\n"), { maxTokens: 300 });
}

export function compressFindingsWithBob(
  findings: FindingRecord[],
  projectRoot = process.cwd(),
): Promise<CompressionResult> {
  return compressIntelligenceWithBob(serializeFindings(findings).join("\n"), {
    maxTokens: 300,
    projectRoot,
  });
}

export async function compressIntelligenceWithBob(
  rawInput: string,
  options: { mode?: CavemanMode; maxTokens?: number; projectRoot?: string } = {},
): Promise<CompressionResult> {
  const local = compressIntelligence(rawInput, options);
  const config = getRuntimeConfig(options.projectRoot);
  const hasConfig = hasBobShellConfig(config) || getMissingBobConfig(config).length === 0;

  if (config.DEMO_MODE || !hasConfig) return local;

  try {
    const bobCompressed = await callBob({
      systemPrompt: CAVEMAN_BOB_COMPRESS_PROMPT,
      compressedInput: local.compressed,
      projectRoot: options.projectRoot,
      options: { maxTokens: options.maxTokens ?? 240, temperature: 0 },
    });
    const compressed = capTokens(bobCompressed.trim(), options.maxTokens ?? 240);
    const compressedTokens = estimateTokens(compressed);

    return {
      compressed,
      metrics: {
        ...local.metrics,
        compressedChars: compressed.length,
        compressedTokens,
        savingsPercent:
          local.metrics.rawTokens === 0
            ? 0
            : Math.max(
                0,
                Math.round(
                  ((local.metrics.rawTokens - compressedTokens) /
                    local.metrics.rawTokens) *
                    100,
                ),
              ),
      },
    };
  } catch {
    return local;
  }
}

export async function callBobCompressed(request: CompressedBobRequest): Promise<{
  output: string;
  compression: CompressionResult;
}> {
  const compression = await compressIntelligenceWithBob(request.rawInput, {
    maxTokens: request.maxInputTokens,
    projectRoot: request.projectRoot,
  });
  const output = await callBob({
    systemPrompt: request.systemPrompt,
    compressedInput: compression.compressed,
    options: request.options,
    projectRoot: request.projectRoot,
  });

  return { output, compression };
}

const CAVEMAN_BOB_COMPRESS_PROMPT = `
Compress repository intelligence for another Bob reasoning call.
Keep paths, line numbers, severities, confidence, and cause/effect.
Drop filler, duplicates, and prose.
Return compressed packet only.
`.trim();

export function estimateTokens(input: string): number {
  if (!input.trim()) return 0;
  return Math.max(1, Math.ceil(input.length / 4));
}

function serializeFindings(findings: FindingRecord[]): string[] {
  return findings.map((finding) =>
    [
      `agent:${finding.agent}`,
      `severity:${finding.severity}`,
      `category:${finding.category}`,
      `file_path:${finding.file_path}`,
      finding.line_number ? `line_number:${finding.line_number}` : "",
      `description:${finding.description}`,
      finding.fix_description ? `fix:${finding.fix_description}` : "",
      `verification_status:${finding.verification_status}`,
      finding.confidence ? `confidence:${finding.confidence}` : "",
      finding.blast_radius !== "{}" ? `blast_radius:${finding.blast_radius}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}
