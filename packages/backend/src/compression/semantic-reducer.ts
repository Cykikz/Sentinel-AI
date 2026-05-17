export interface SemanticReductionResult {
  reduced: string;
  removedLines: number;
}

const NOISE_PATTERNS = [
  /^\s*$/u,
  /^\s*Generated:/iu,
  /^\s*timestamp:/iu,
  /^\s*stack:/iu,
];

export function semanticReduce(input: string): SemanticReductionResult {
  const seen = new Set<string>();
  const output: string[] = [];
  let removedLines = 0;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    const normalized = normalizeLine(line);

    if (NOISE_PATTERNS.some((pattern) => pattern.test(line))) {
      removedLines += 1;
      continue;
    }

    if (seen.has(normalized)) {
      removedLines += 1;
      continue;
    }

    seen.add(normalized);
    output.push(line);
  }

  return {
    reduced: output.join("\n"),
    removedLines,
  };
}

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'`]/g, "")
    .trim();
}
