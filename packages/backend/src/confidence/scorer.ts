import { SentinelMemory, type FindingRecord, type Severity } from "../memory/db.js";

export interface FindingConfidenceScore {
  findingId: number;
  confidence: number;
  reasons: string[];
}

export interface HealthScoreSummary {
  overallScore: number;
  securityScore: number;
  architectureScore: number;
  hygieneScore: number;
  averageConfidence: number;
}

export interface ConfidenceRunResult {
  findingScores: FindingConfidenceScore[];
  health: HealthScoreSummary;
}

export interface ConfidenceOptions {
  projectRoot?: string;
  scanId: number;
}

const SEVERITY_BASE_CONFIDENCE: Record<Severity, number> = {
  CRITICAL: 80,
  HIGH: 74,
  MEDIUM: 66,
  LOW: 58,
  INFO: 50,
};

const SEVERITY_PENALTY: Record<Severity, number> = {
  CRITICAL: 22,
  HIGH: 12,
  MEDIUM: 6,
  LOW: 2,
  INFO: 0,
};

const SECURITY_CATEGORIES = new Set(["security_leak", "hardcoded_secret"]);
const ARCHITECTURE_CATEGORIES = new Set(["architecture_violation"]);
const HYGIENE_CATEGORIES = new Set(["dead_code", "orphaned_file"]);

export function applyConfidenceScores(options: ConfidenceOptions): ConfidenceRunResult {
  const projectRoot = options.projectRoot ?? process.cwd();
  const memory = new SentinelMemory(projectRoot);

  try {
    const findings = memory.getFindingsForScan(options.scanId);
    const findingScores = findings.map(scoreFindingConfidence);

    for (const score of findingScores) {
      memory.updateFindingConfidence(score.findingId, score.confidence);
    }

    const scoredFindings = findings.map((finding) => {
      const score = findingScores.find((item) => item.findingId === finding.id);
      return { ...finding, confidence: score?.confidence ?? finding.confidence };
    });
    const health = scoreRepositoryHealth(scoredFindings);

    memory.updateScanSummary(options.scanId, {
      healthScore: health.overallScore,
      issuesFound: findings.length,
    });
    memory.updateHealthScore({
      scanId: options.scanId,
      overallScore: health.overallScore,
      securityScore: health.securityScore,
      architectureScore: health.architectureScore,
      hygieneScore: health.hygieneScore,
    });

    return { findingScores, health };
  } finally {
    memory.close();
  }
}

export function scoreFindingConfidence(finding: FindingRecord): FindingConfidenceScore {
  const reasons: string[] = [];
  let score = SEVERITY_BASE_CONFIDENCE[finding.severity];
  reasons.push(`${finding.severity.toLowerCase()} severity baseline`);

  if (finding.line_number !== null) {
    score += 6;
    reasons.push("line evidence");
  }

  if (finding.fix_description) {
    score += 4;
    reasons.push("fix available");
  }

  if (knownCategory(finding.category)) {
    score += 5;
    reasons.push("known detector category");
  }

  const blast = parseBlastRadius(finding.blast_radius);
  if (blast) {
    const affected = blast.directlyAffected.length + blast.indirectlyAffected.length;
    score += Math.min(8, affected * 2);
    if (affected > 0) reasons.push("blast radius mapped");

    if (typeof blast.confidence === "number") {
      score = Math.round(score * 0.75 + clamp(blast.confidence * 100, 0, 100) * 0.25);
      reasons.push("domino confidence prior");
    }
  }

  if (finding.verification_status === "VERIFIED") {
    score += 8;
    reasons.push("verified");
  } else if (finding.verification_status === "REJECTED") {
    score -= 18;
    reasons.push("verifier rejected fix");
  } else {
    score -= 4;
    reasons.push("pending verification");
  }

  return {
    findingId: finding.id,
    confidence: clamp(Math.round(score), 0, 100),
    reasons,
  };
}

export function scoreRepositoryHealth(findings: FindingRecord[]): HealthScoreSummary {
  const securityScore = scoreCategoryHealth(findings, SECURITY_CATEGORIES);
  const architectureScore = scoreCategoryHealth(findings, ARCHITECTURE_CATEGORIES);
  const hygieneScore = scoreCategoryHealth(findings, HYGIENE_CATEGORIES);
  const generalScore = scoreCategoryHealth(findings, null);
  const averageConfidence =
    findings.length === 0
      ? 100
      : Math.round(
          findings.reduce((total, finding) => total + (finding.confidence ?? 50), 0) /
            findings.length,
        );

  return {
    overallScore: Math.min(
      generalScore,
      Math.round(securityScore * 0.45 + architectureScore * 0.3 + hygieneScore * 0.25),
    ),
    securityScore,
    architectureScore,
    hygieneScore,
    averageConfidence,
  };
}

function scoreCategoryHealth(
  findings: FindingRecord[],
  categories: Set<string> | null,
): number {
  const relevant = categories
    ? findings.filter((finding) => categories.has(finding.category))
    : findings;
  const penalty = relevant.reduce((total, finding) => {
    const confidenceWeight = (finding.confidence ?? 50) / 100;
    return total + SEVERITY_PENALTY[finding.severity] * confidenceWeight;
  }, 0);

  return clamp(Math.round(100 - penalty), 0, 100);
}

function knownCategory(category: string): boolean {
  return (
    SECURITY_CATEGORIES.has(category) ||
    ARCHITECTURE_CATEGORIES.has(category) ||
    HYGIENE_CATEGORIES.has(category)
  );
}

function parseBlastRadius(value: string): {
  directlyAffected: string[];
  indirectlyAffected: string[];
  confidence?: number;
} | null {
  if (!value || value === "{}") return null;

  try {
    const parsed = JSON.parse(value) as {
      directlyAffected?: unknown;
      indirectlyAffected?: unknown;
      confidence?: unknown;
    };

    return {
      directlyAffected: Array.isArray(parsed.directlyAffected)
        ? parsed.directlyAffected.filter((item): item is string => typeof item === "string")
        : [],
      indirectlyAffected: Array.isArray(parsed.indirectlyAffected)
        ? parsed.indirectlyAffected.filter((item): item is string => typeof item === "string")
        : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
    };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
