import axios from "axios";
import { getIAMToken } from "./auth.js";
import { callBobShell } from "./shell.js";
import {
  getMissingBobConfig,
  getRuntimeConfig,
  hasBobShellConfig,
} from "../config/env.js";
import type { BobConnectionResult, BobGenerateRequest } from "../types/index.js";

interface WatsonxGenerationResponse {
  results: Array<{
    generated_text: string;
  }>;
}

export async function callBob(request: BobGenerateRequest): Promise<string> {
  const config = getRuntimeConfig(request.projectRoot);

  if (hasBobShellConfig(config)) {
    return callBobShell({
      apiKey: config.BOBSHELL_API_KEY!,
      prompt: `${request.systemPrompt}\n\n${request.compressedInput}`,
    });
  }

  const missing = getMissingBobConfig(config);

  if (missing.length > 0) {
    throw new Error(`Missing IBM watsonx config: ${missing.join(", ")}`);
  }

  const token = await getIAMToken(config.IBM_WATSONX_API_KEY!);
  const response = await axios.post<WatsonxGenerationResponse>(
    `${config.IBM_WATSONX_URL}/ml/v1/text/generation?version=${config.IBM_WATSONX_API_VERSION}`,
    {
      model_id: config.IBM_WATSONX_MODEL_ID,
      input: `${request.systemPrompt}\n\n${request.compressedInput}`,
      parameters: {
        max_new_tokens: request.options?.maxTokens ?? 1000,
        temperature: request.options?.temperature ?? 0.1,
        stop_sequences: request.options?.stopSequences ?? ["</output>"],
      },
      project_id: config.IBM_WATSONX_PROJECT_ID,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const generatedText = response.data.results.at(0)?.generated_text;
  if (!generatedText) {
    throw new Error("IBM watsonx returned no generated text");
  }

  return generatedText;
}

function formatBobError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const status = error.response?.status;
  const responseData = error.response?.data;
  const details =
    typeof responseData === "string" ? responseData : JSON.stringify(responseData);

  return [error.message, status ? `status=${status}` : undefined, details]
    .filter(Boolean)
    .join(" | ");
}

export async function verifyBobConnection(): Promise<BobConnectionResult> {
  const config = getRuntimeConfig();

  if (config.DEMO_MODE) {
    return {
      ok: true,
      status: "demo",
      provider: hasBobShellConfig(config) ? "bob-shell" : "watsonx",
      modelId: config.IBM_WATSONX_MODEL_ID,
      message: "DEMO_MODE=true; live IBM Bob call skipped.",
    };
  }

  if (hasBobShellConfig(config)) {
    const started = Date.now();

    try {
      await callBob({
        systemPrompt: "Return exactly: OK",
        compressedInput: "Health check.",
        options: { maxTokens: 8, temperature: 0 },
      });

      return {
        ok: true,
        status: "ok",
        provider: "bob-shell",
        modelId: "Bob Shell",
        responseTimeMs: Date.now() - started,
        message: "IBM Bob Shell connection: OK",
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        provider: "bob-shell",
        modelId: "Bob Shell",
        responseTimeMs: Date.now() - started,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const missing = getMissingBobConfig(config);
  if (missing.length > 0) {
    return {
      ok: false,
      status: "missing_config",
      provider: "watsonx",
      modelId: config.IBM_WATSONX_MODEL_ID,
      message: `Missing IBM watsonx config: ${missing.join(", ")}`,
    };
  }

  const started = Date.now();

  try {
    await callBob({
      systemPrompt: "Return exactly: OK",
      compressedInput: "Health check.",
      options: { maxTokens: 8, temperature: 0 },
    });

    return {
      ok: true,
      status: "ok",
      provider: "watsonx",
      modelId: config.IBM_WATSONX_MODEL_ID,
      responseTimeMs: Date.now() - started,
      message: "IBM Bob connection: OK",
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      provider: "watsonx",
      modelId: config.IBM_WATSONX_MODEL_ID,
      responseTimeMs: Date.now() - started,
      message: formatBobError(error),
    };
  }
}
