export type CavemanMode = "lite" | "full" | "ultra";

export const CAVEMAN_SYSTEM_PROMPT = `
You receive verbose repository intelligence.
Rules:
- No filler words
- No repeated facts
- Use arrows for flows
- Keep paths, line numbers, severity, confidence
- Return compressed intelligence packet only
`.trim();

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcritical\b/gi, "CRIT"],
  [/\bhigh\b/gi, "HIGH"],
  [/\bmedium\b/gi, "MED"],
  [/\blow\b/gi, "LOW"],
  [/\bsecurity_leak\b/gi, "sec_leak"],
  [/\bhardcoded_secret\b/gi, "hard_secret"],
  [/\barchitecture_violation\b/gi, "arch_violation"],
  [/\borphaned_file\b/gi, "orphan_file"],
  [/\bdead_code\b/gi, "dead_code"],
  [/\bdefined but never called\b/gi, "unused"],
  [/\bis not imported by any mapped source file\b/gi, "no imports"],
  [/\bsensitive value\b/gi, "secret"],
  [/\bflows into unsafe sink\b/gi, "-> unsafe"],
  [/\bpasses into\b/gi, "->"],
  [/\breaches unsafe sink\b/gi, "-> unsafe"],
  [/\bfix suggestion is local-text only and does not introduce external dependency\b/gi, "local fix ok"],
  [/\bno generated code fix to verify\b/gi, "no fix verify"],
  [/\bdirectlyAffected\b/g, "direct"],
  [/\bindirectlyAffected\b/g, "indirect"],
  [/\breviewNeeded\b/g, "review"],
  [/\bconfidence\b/g, "conf"],
  [/\bdescription\b/g, "desc"],
  [/\bfile_path\b/g, "file"],
  [/\bline_number\b/g, "line"],
  [/\bverification_status\b/g, "verify"],
];

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "that",
  "this",
  "with",
  "from",
  "into",
  "and",
  "or",
  "to",
  "of",
  "in",
  "by",
  "for",
  "is",
  "are",
]);

export function cavemanCompress(input: string, mode: CavemanMode = "full"): string {
  let output = input;

  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  output = output
    .replace(/[{}[\]"]/g, "")
    .replace(/,\s*/g, " ")
    .replace(/:\s*/g, ":")
    .replace(/\s+/g, " ")
    .trim();

  if (mode === "lite") return output;

  output = output
    .split(" ")
    .filter((word) => !STOPWORDS.has(word.toLowerCase()))
    .join(" ");

  if (mode === "ultra") {
    output = output
      .replace(/\bagent:/g, "ag:")
      .replace(/\bcategory:/g, "cat:")
      .replace(/\bseverity:/g, "sev:")
      .replace(/\bverified\b/gi, "ok")
      .replace(/\brejected\b/gi, "bad")
      .replace(/\bpending\b/gi, "pend");
  }

  return output.replace(/\s+/g, " ").trim();
}

export function capTokens(input: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (input.length <= maxChars) return input;

  const clipped = input.slice(0, maxChars).replace(/\s+\S*$/u, "").trim();
  return `${clipped} ...truncated`;
}
