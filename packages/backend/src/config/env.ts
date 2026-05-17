import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const EnvSchema = z.object({
  BOBSHELL_API_KEY: z.string().optional(),
  IBM_WATSONX_API_KEY: z.string().optional(),
  IBM_WATSONX_PROJECT_ID: z.string().optional(),
  IBM_WATSONX_URL: z.string().url().default("https://us-south.ml.cloud.ibm.com"),
  IBM_WATSONX_MODEL_ID: z.string().default("ibm/granite-13b-chat-v2"),
  IBM_WATSONX_API_VERSION: z.string().default("2023-05-29"),
  CAVEMAN_MODE: z.enum(["lite", "full", "ultra"]).default("full"),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value?.toLowerCase() === "true"),
});

export type RuntimeConfig = z.infer<typeof EnvSchema>;

const BOBSHELL_PLACEHOLDER = "your_bob_inference_api_key_here";

interface LocalConfig {
  bob_shell_api_key?: string;
  ibm_watsonx_api_key?: string;
  ibm_watsonx_project_id?: string;
  ibm_watsonx_url?: string;
  ibm_watsonx_model_id?: string;
  ibm_watsonx_api_version?: string;
  caveman_mode?: "lite" | "full" | "ultra";
  dashboard_port?: number;
  backend_port?: number;
}

export function getRuntimeConfig(projectRoot = process.cwd()): RuntimeConfig {
  const local = readLocalConfig(projectRoot);
  return EnvSchema.parse({
    ...process.env,
    BOBSHELL_API_KEY: process.env.BOBSHELL_API_KEY ?? local.bob_shell_api_key,
    IBM_WATSONX_API_KEY: process.env.IBM_WATSONX_API_KEY ?? local.ibm_watsonx_api_key,
    IBM_WATSONX_PROJECT_ID:
      process.env.IBM_WATSONX_PROJECT_ID ?? local.ibm_watsonx_project_id,
    IBM_WATSONX_URL: process.env.IBM_WATSONX_URL ?? local.ibm_watsonx_url,
    IBM_WATSONX_MODEL_ID:
      process.env.IBM_WATSONX_MODEL_ID ?? local.ibm_watsonx_model_id,
    IBM_WATSONX_API_VERSION:
      process.env.IBM_WATSONX_API_VERSION ?? local.ibm_watsonx_api_version,
    CAVEMAN_MODE: process.env.CAVEMAN_MODE ?? local.caveman_mode,
    DASHBOARD_PORT:
      process.env.DASHBOARD_PORT ??
      local.dashboard_port ??
      local.backend_port,
  });
}

export function getMissingBobConfig(config = getRuntimeConfig()): string[] {
  const missing: string[] = [];

  if (!config.IBM_WATSONX_API_KEY) missing.push("IBM_WATSONX_API_KEY");
  if (!config.IBM_WATSONX_PROJECT_ID) missing.push("IBM_WATSONX_PROJECT_ID");

  return missing;
}

export function hasBobShellConfig(config = getRuntimeConfig()): boolean {
  const apiKey = config.BOBSHELL_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== BOBSHELL_PLACEHOLDER);
}

function readLocalConfig(projectRoot: string): LocalConfig {
  const filePath = path.join(projectRoot, ".sentinel", "config.json");
  if (!existsSync(filePath)) return {};

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as LocalConfig;
  } catch {
    return {};
  }
}
