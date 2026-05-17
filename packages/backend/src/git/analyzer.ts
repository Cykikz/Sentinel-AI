import { execFileSync } from "node:child_process";
import path from "node:path";
import { SentinelMemory, type NewGitCommit } from "../memory/db.js";

export interface GitAnalysisOptions {
  projectRoot?: string;
  limit?: number;
  persist?: boolean;
}

export interface ContributorSummary {
  name: string;
  email: string;
  commits: number;
  riskyCommits: number;
  issuesIntroduced: number;
  issuesFixed: number;
  expertiseAreas: string[];
}

export interface GitAnalysisResult {
  ok: boolean;
  message: string;
  commits: NewGitCommit[];
  contributors: ContributorSummary[];
}

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";

export function analyzeGitHistory(options: GitAnalysisOptions = {}): GitAnalysisResult {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const limit = Math.max(1, options.limit ?? 50);

  if (!isGitRepository(projectRoot)) {
    return {
      ok: false,
      message: "Target is not inside a git repository.",
      commits: [],
      contributors: [],
    };
  }

  const commits = readCommits(projectRoot, limit);
  if (commits.length === 0) {
    return {
      ok: false,
      message: "Git repository has no commits to analyze.",
      commits: [],
      contributors: [],
    };
  }
  const contributors = summarizeContributors(commits);

  if (options.persist ?? true) {
    const memory = new SentinelMemory(projectRoot);
    try {
      memory.saveGitHistory(commits);
    } finally {
      memory.close();
    }
  }

  return {
    ok: true,
    message: `Analyzed ${commits.length} commit(s).`,
    commits,
    contributors,
  };
}

function isGitRepository(projectRoot: string): boolean {
  try {
    return (
      runGit(projectRoot, ["rev-parse", "--is-inside-work-tree"]).trim() === "true"
    );
  } catch {
    return false;
  }
}

function readCommits(projectRoot: string, limit: number): NewGitCommit[] {
  let output = "";

  try {
    output = runGit(projectRoot, [
      "log",
      `--max-count=${limit}`,
      "--numstat",
      `--pretty=format:${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%ct${FIELD_SEPARATOR}%s`,
    ]);
  } catch {
    return [];
  }

  return output
    .split(RECORD_SEPARATOR)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(parseCommitChunk)
    .filter((commit): commit is NewGitCommit => Boolean(commit));
}

function parseCommitChunk(chunk: string): NewGitCommit | null {
  const lines = chunk.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (!header) return null;

  const [commitHash, authorName, authorEmail, timestampSeconds, message] =
    header.split(FIELD_SEPARATOR);
  if (!commitHash || !authorName || !authorEmail || !timestampSeconds) return null;

  const filesChanged = lines
    .map((line) => line.split(/\t/)[2])
    .filter((filePath): filePath is string => Boolean(filePath))
    .map((filePath) => filePath.replace(/\\/g, "/"));
  const normalizedMessage = message ?? "";

  return {
    commitHash,
    authorName,
    authorEmail,
    timestamp: Number.parseInt(timestampSeconds, 10) * 1000,
    filesChanged,
    message: normalizedMessage,
    introducedIssues: estimateIntroducedIssues(normalizedMessage, filesChanged),
    fixedIssues: estimateFixedIssues(normalizedMessage),
  };
}

function summarizeContributors(commits: NewGitCommit[]): ContributorSummary[] {
  const byEmail = new Map<string, ContributorSummary>();

  for (const commit of commits) {
    const existing =
      byEmail.get(commit.authorEmail) ??
      {
        name: commit.authorName,
        email: commit.authorEmail,
        commits: 0,
        riskyCommits: 0,
        issuesIntroduced: 0,
        issuesFixed: 0,
        expertiseAreas: [],
      };

    existing.name = commit.authorName;
    existing.commits += 1;
    existing.issuesIntroduced += commit.introducedIssues ?? 0;
    existing.issuesFixed += commit.fixedIssues ?? 0;
    if ((commit.introducedIssues ?? 0) > 0) existing.riskyCommits += 1;
    existing.expertiseAreas = [
      ...new Set([...existing.expertiseAreas, ...inferExpertise(commit.filesChanged)]),
    ].sort((a, b) => a.localeCompare(b));
    byEmail.set(commit.authorEmail, existing);
  }

  return [...byEmail.values()].sort(
    (a, b) =>
      b.riskyCommits - a.riskyCommits ||
      b.issuesFixed - a.issuesFixed ||
      b.commits - a.commits ||
      a.name.localeCompare(b.name),
  );
}

function estimateIntroducedIssues(message: string, filesChanged: string[]): number {
  const riskyMessage = /\b(secret|token|password|credential|unsafe|hack|hotfix|bypass|auth)\b/i.test(
    message,
  );
  const riskyFiles = filesChanged.filter((filePath) =>
    /\b(auth|security|config|secret|token|payment|api)\b/i.test(filePath),
  ).length;

  return (riskyMessage ? 1 : 0) + Math.min(2, riskyFiles);
}

function estimateFixedIssues(message: string): number {
  const matches = message.match(/\b(fix|fixed|resolve|resolved|patch|secure|security|bug)\b/gi);
  return Math.min(3, matches?.length ?? 0);
}

function inferExpertise(filesChanged: string[]): string[] {
  return filesChanged.map((filePath) => {
    const parts = filePath.split("/");
    if (parts.length > 1 && parts[0]) return parts[0];
    const ext = path.extname(filePath).replace(".", "");
    return ext ? `${ext}-files` : "root";
  });
}

function runGit(projectRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
