export type BobConnectionStatus = "ok" | "demo" | "missing_config" | "error";

export type BobProvider = "bob-shell" | "watsonx";

export interface BobConnectionResult {
  ok: boolean;
  status: BobConnectionStatus;
  message: string;
  provider?: BobProvider;
  modelId?: string;
  responseTimeMs?: number;
}

export interface BobGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface BobGenerateRequest {
  systemPrompt: string;
  compressedInput: string;
  options?: BobGenerateOptions;
  projectRoot?: string;
}

export interface RepositorySnapshot {
  id?: number;
  scanId?: number;
  timestamp: number;
  rootPath: string;
  framework: string;
  totalFiles: number;
  sourceFiles: number;
  orphanedFiles: string[];
  highRiskFiles: string[];
  dependencyGraph: Record<string, string[]>;
}
