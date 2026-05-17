import { SentinelMemory } from "../memory/db.js";
import type { FindingRecord } from "../memory/db.js";
import { VERIFIER_PROMPT } from "../bob/prompts/verifier.prompt.js";
import { runBobReasoning } from "./bob-reasoning.js";

export interface VerifierResult {
  verified: number;
  rejected: number;
  bobReasoning?: string;
}

export interface VerifierOptions {
  projectRoot?: string;
  scanId: number;
}

export async function runVerifier(options: VerifierOptions): Promise<VerifierResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const memory = new SentinelMemory(projectRoot);
  let verified = 0;
  let rejected = 0;

  try {
    const findings = memory.getFindingsForScan(options.scanId);

    for (const finding of findings) {
      const result = verifyFinding(finding);
      memory.updateVerification(finding.id, result.verified, result.reason);
      if (result.verified) verified += 1;
      else rejected += 1;
    }

    const bobReview = await runBobReasoning(
      projectRoot,
      VERIFIER_PROMPT,
      findings.map((finding) => JSON.stringify(finding)).join("\n"),
    );

    return { verified, rejected, bobReasoning: bobReview?.output };
  } finally {
    memory.close();
  }
}

function verifyFinding(finding: FindingRecord): { verified: boolean; reason: string } {
  if (!finding.fix_description) {
    return { verified: true, reason: "No generated code fix to verify." };
  }

  if (/npm install\s+([^\s]+)/.test(finding.fix_description)) {
    return {
      verified: false,
      reason: "Package-installing fixes require npm registry verification in later phase.",
    };
  }

  if (/delete|remove/i.test(finding.fix_description) && finding.severity === "LOW") {
    return {
      verified: false,
      reason: "Low-severity deletion/removal fix requires human review.",
    };
  }

  return {
    verified: true,
    reason: "Fix suggestion is local-text only and does not introduce external dependency.",
  };
}
