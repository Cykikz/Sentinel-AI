import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RepositorySnapshot } from "../types/index.js";

export type ScanType = "deep" | "commit" | "manual" | "test";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface ScanRecord {
  id: number;
  timestamp: number;
  scan_type: ScanType;
  health_score: number | null;
  files_scanned: number;
  issues_found: number;
  issues_fixed: number;
  changed_files: string;
}

export interface NewScan {
  scanType: ScanType;
  healthScore?: number;
  filesScanned?: number;
  issuesFound?: number;
  issuesFixed?: number;
  changedFiles?: string[];
  timestamp?: number;
}

export interface FindingRecord {
  id: number;
  scan_id: number;
  agent: string;
  severity: Severity;
  category: string;
  file_path: string;
  line_number: number | null;
  description: string;
  fix_applied: 0 | 1;
  fix_description: string | null;
  original_code: string | null;
  bob_fix_code: string | null;
  blast_radius: string;
  verification_status: "PENDING" | "VERIFIED" | "REJECTED";
  verification_reason: string | null;
  confidence: number | null;
  timestamp: number;
}

export interface NewFinding {
  agent: string;
  severity: Severity;
  category: string;
  filePath: string;
  lineNumber?: number;
  description: string;
  fixApplied?: boolean;
  fixDescription?: string;
  originalCode?: string;
  bobFixCode?: string;
  timestamp?: number;
}

export interface HealthHistoryRecord {
  id: number;
  scan_id: number | null;
  timestamp: number;
  overall_score: number | null;
  security_score: number | null;
  architecture_score: number | null;
  hygiene_score: number | null;
}

export interface HealthScoreInput {
  overallScore: number;
  securityScore?: number;
  architectureScore?: number;
  hygieneScore?: number;
  scanId?: number;
  timestamp?: number;
}

export interface BlastRadius {
  directlyAffected: string[];
  indirectlyAffected: string[];
  autoSafe: string[];
  reviewNeeded: string[];
  confidence: number;
}

export interface ReportRecord {
  id: number;
  scan_id: number | null;
  timestamp: number;
  report_type: string;
  file_path: string;
  content: string;
}

export interface GitHistoryRecord {
  id: number;
  commit_hash: string;
  author: string;
  timestamp: number;
  files_changed: string;
  message: string | null;
  introduced_issues: number;
  fixed_issues: number;
}

export interface NewGitCommit {
  commitHash: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  filesChanged: string[];
  message?: string;
  introducedIssues?: number;
  fixedIssues?: number;
}

export interface ContributorRecord {
  id: number;
  name: string;
  email: string;
  risky_commits: number;
  issues_introduced: number;
  issues_fixed: number;
  expertise_areas: string;
}

interface RepositorySnapshotRow {
  id: number;
  scan_id: number | null;
  timestamp: number;
  root_path: string;
  framework: string;
  total_files: number;
  source_files: number;
  orphaned_files: string;
  high_risk_files: string;
  dependency_graph: string;
}

export interface MemoryPaths {
  projectRoot: string;
  sentinelDir: string;
  dbPath: string;
}

const currentFile = fileURLToPath(import.meta.url);
const memoryModuleDir = path.resolve(path.dirname(currentFile));
const schemaPath = resolveSchemaPath();

function resolveSchemaPath(): string {
  const candidates = [
    path.join(memoryModuleDir, "schema.sql"),
    path.join(
      memoryModuleDir,
      "..",
      "..",
      "..",
      "..",
      "..",
      "packages",
      "backend",
      "src",
      "memory",
      "schema.sql",
    ),
    path.join(process.cwd(), "packages", "backend", "src", "memory", "schema.sql"),
    path.join(process.cwd(), "src", "memory", "schema.sql"),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Memory schema not found. Checked: ${candidates.join(", ")}`);
  }

  return found;
}

export function getMemoryPaths(projectRoot = process.cwd()): MemoryPaths {
  const resolvedRoot = path.resolve(projectRoot);
  const sentinelDir = path.join(resolvedRoot, ".sentinel");

  return {
    projectRoot: resolvedRoot,
    sentinelDir,
    dbPath: path.join(sentinelDir, "memory.db"),
  };
}

export function setupDatabase(projectRoot = process.cwd()): MemoryPaths {
  const paths = getMemoryPaths(projectRoot);
  mkdirSync(paths.sentinelDir, { recursive: true });

  const db = new Database(paths.dbPath);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(schemaPath, "utf8"));
    applyInlineMigrations(db);
  } finally {
    db.close();
  }

  return paths;
}

export class SentinelMemory {
  private readonly db: Database.Database;

  constructor(projectRoot = process.cwd()) {
    const paths = setupDatabase(projectRoot);
    this.db = new Database(paths.dbPath);
    this.db.pragma("foreign_keys = ON");
  }

  close(): void {
    this.db.close();
  }

  createScan(input: NewScan): ScanRecord {
    const result = this.db
      .prepare(
        `INSERT INTO scans (
          timestamp,
          scan_type,
          health_score,
          files_scanned,
          issues_found,
          issues_fixed,
          changed_files
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.timestamp ?? Date.now(),
        input.scanType,
        input.healthScore ?? null,
        input.filesScanned ?? 0,
        input.issuesFound ?? 0,
        input.issuesFixed ?? 0,
        JSON.stringify(input.changedFiles ?? []),
      );

    return this.getScanById(Number(result.lastInsertRowid));
  }

  getScanById(scanId: number): ScanRecord {
    const scan = this.db
      .prepare("SELECT * FROM scans WHERE id = ?")
      .get(scanId) as ScanRecord | undefined;

    if (!scan) {
      throw new Error(`Scan not found: ${scanId}`);
    }

    return scan;
  }

  getLastScan(): ScanRecord | null {
    return (
      (this.db
        .prepare("SELECT * FROM scans ORDER BY timestamp DESC, id DESC LIMIT 1")
        .get() as ScanRecord | undefined) ?? null
    );
  }

  saveFindings(scanId: number, findings: NewFinding[]): FindingRecord[] {
    const insert = this.db.prepare(
      `INSERT INTO findings (
        scan_id,
        agent,
        severity,
        category,
        file_path,
        line_number,
        description,
        fix_applied,
        fix_description,
        original_code,
        bob_fix_code,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const saveAll = this.db.transaction((items: NewFinding[]) => {
      for (const finding of items) {
        insert.run(
          scanId,
          finding.agent,
          finding.severity,
          finding.category,
          finding.filePath,
          finding.lineNumber ?? null,
          finding.description,
          finding.fixApplied ? 1 : 0,
          finding.fixDescription ?? null,
          finding.originalCode ?? null,
          finding.bobFixCode ?? null,
          finding.timestamp ?? Date.now(),
        );
      }
    });

    saveAll(findings);

    return this.getFindingsForScan(scanId);
  }

  getFindingsForScan(scanId: number): FindingRecord[] {
    return this.db
      .prepare("SELECT * FROM findings WHERE scan_id = ? ORDER BY id ASC")
      .all(scanId) as FindingRecord[];
  }

  updateBlastRadius(findingId: number, blastRadius: BlastRadius): void {
    this.db
      .prepare("UPDATE findings SET blast_radius = ?, confidence = ? WHERE id = ?")
      .run(JSON.stringify(blastRadius), Math.round(blastRadius.confidence * 100), findingId);
  }

  updateVerification(
    findingId: number,
    verified: boolean,
    reason: string,
  ): void {
    this.db
      .prepare(
        `UPDATE findings
         SET verification_status = ?, verification_reason = ?
         WHERE id = ?`,
      )
      .run(verified ? "VERIFIED" : "REJECTED", reason, findingId);
  }

  updateFindingConfidence(findingId: number, confidence: number): void {
    this.db
      .prepare("UPDATE findings SET confidence = ? WHERE id = ?")
      .run(Math.max(0, Math.min(100, Math.round(confidence))), findingId);
  }

  markFixApplied(findingId: number, description: string): void {
    this.db
      .prepare(
        `UPDATE findings
         SET fix_applied = 1, fix_description = ?
         WHERE id = ?`,
      )
      .run(description, findingId);
  }

  saveReport(input: {
    scanId?: number;
    reportType: string;
    filePath: string;
    content: string;
    timestamp?: number;
  }): ReportRecord {
    const result = this.db
      .prepare(
        `INSERT INTO reports (
          scan_id,
          timestamp,
          report_type,
          file_path,
          content
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.scanId ?? null,
        input.timestamp ?? Date.now(),
        input.reportType,
        input.filePath,
        input.content,
      );

    return this.getReportById(Number(result.lastInsertRowid));
  }

  updateHealthScore(input: HealthScoreInput): HealthHistoryRecord {
    const scanId = input.scanId ?? this.getLastScan()?.id ?? null;
    const timestamp = input.timestamp ?? Date.now();

    if (scanId !== null) {
      this.db
        .prepare("UPDATE scans SET health_score = ? WHERE id = ?")
        .run(input.overallScore, scanId);
    }

    const result = this.db
      .prepare(
        `INSERT INTO health_history (
          scan_id,
          timestamp,
          overall_score,
          security_score,
          architecture_score,
          hygiene_score
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        scanId,
        timestamp,
        input.overallScore,
        input.securityScore ?? null,
        input.architectureScore ?? null,
        input.hygieneScore ?? null,
      );

    return this.getHealthHistoryById(Number(result.lastInsertRowid));
  }

  getHealthHistory(days = 30): HealthHistoryRecord[] {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    return this.db
      .prepare(
        "SELECT * FROM health_history WHERE timestamp >= ? ORDER BY timestamp ASC, id ASC",
      )
      .all(since) as HealthHistoryRecord[];
  }

  saveGitHistory(commits: NewGitCommit[]): GitHistoryRecord[] {
    const insertCommit = this.db.prepare(
      `INSERT OR IGNORE INTO git_history (
        commit_hash,
        author,
        timestamp,
        files_changed,
        message,
        introduced_issues,
        fixed_issues
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const saveAll = this.db.transaction((items: NewGitCommit[]) => {
      for (const commit of items) {
        const author = `${commit.authorName} <${commit.authorEmail}>`;
        const result = insertCommit.run(
          commit.commitHash,
          author,
          commit.timestamp,
          JSON.stringify(commit.filesChanged),
          commit.message ?? null,
          commit.introducedIssues ?? 0,
          commit.fixedIssues ?? 0,
        );

        if (result.changes > 0) this.upsertContributorFromCommit(commit);
      }
    });

    saveAll(commits);
    return this.getGitHistory(commits.length || 50);
  }

  getGitHistory(limit = 50): GitHistoryRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM git_history
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as GitHistoryRecord[];
  }

  getContributors(limit = 20): ContributorRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM contributors
         ORDER BY risky_commits DESC, issues_introduced DESC, issues_fixed DESC, name ASC
         LIMIT ?`,
      )
      .all(limit) as ContributorRecord[];
  }

  deleteScan(scanId: number): void {
    this.db.prepare("DELETE FROM scans WHERE id = ?").run(scanId);
  }

  updateScanSummary(
    scanId: number,
    summary: {
      healthScore?: number;
      filesScanned?: number;
      issuesFound?: number;
      issuesFixed?: number;
    },
  ): ScanRecord {
    this.db
      .prepare(
        `UPDATE scans
         SET health_score = COALESCE(?, health_score),
             files_scanned = COALESCE(?, files_scanned),
             issues_found = COALESCE(?, issues_found),
             issues_fixed = COALESCE(?, issues_fixed)
         WHERE id = ?`,
      )
      .run(
        summary.healthScore ?? null,
        summary.filesScanned ?? null,
        summary.issuesFound ?? null,
        summary.issuesFixed ?? null,
        scanId,
      );

    return this.getScanById(scanId);
  }

  saveRepositorySnapshot(snapshot: RepositorySnapshot): RepositorySnapshot {
    const result = this.db
      .prepare(
        `INSERT INTO repository_snapshots (
          scan_id,
          timestamp,
          root_path,
          framework,
          total_files,
          source_files,
          orphaned_files,
          high_risk_files,
          dependency_graph
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.scanId ?? null,
        snapshot.timestamp,
        snapshot.rootPath,
        snapshot.framework,
        snapshot.totalFiles,
        snapshot.sourceFiles,
        JSON.stringify(snapshot.orphanedFiles),
        JSON.stringify(snapshot.highRiskFiles),
        JSON.stringify(snapshot.dependencyGraph),
      );

    const snapshotId = Number(result.lastInsertRowid);
    const insertFile = this.db.prepare(
      `INSERT INTO file_graph (
        snapshot_id,
        file_path,
        imports,
        imported_by,
        risk_score
      ) VALUES (?, ?, ?, ?, ?)`,
    );

    const importedBy = buildImportedBy(snapshot.dependencyGraph);
    const saveFiles = this.db.transaction(() => {
      for (const [filePath, imports] of Object.entries(snapshot.dependencyGraph)) {
        const dependents = importedBy[filePath] ?? [];
        insertFile.run(
          snapshotId,
          filePath,
          JSON.stringify(imports),
          JSON.stringify(dependents),
          imports.length + dependents.length,
        );
      }
    });

    saveFiles();

    return this.getRepositorySnapshot(snapshotId);
  }

  getLatestRepositorySnapshot(): RepositorySnapshot | null {
    const row = this.db
      .prepare(
        "SELECT * FROM repository_snapshots ORDER BY timestamp DESC, id DESC LIMIT 1",
      )
      .get() as RepositorySnapshotRow | undefined;

    return row ? mapRepositorySnapshot(row) : null;
  }

  getRepositorySnapshot(id: number): RepositorySnapshot {
    const row = this.db
      .prepare("SELECT * FROM repository_snapshots WHERE id = ?")
      .get(id) as RepositorySnapshotRow | undefined;

    if (!row) {
      throw new Error(`Repository snapshot not found: ${id}`);
    }

    return mapRepositorySnapshot(row);
  }

  private getHealthHistoryById(id: number): HealthHistoryRecord {
    const row = this.db
      .prepare("SELECT * FROM health_history WHERE id = ?")
      .get(id) as HealthHistoryRecord | undefined;

    if (!row) {
      throw new Error(`Health history not found: ${id}`);
    }

    return row;
  }

  private getReportById(id: number): ReportRecord {
    const row = this.db
      .prepare("SELECT * FROM reports WHERE id = ?")
      .get(id) as ReportRecord | undefined;

    if (!row) {
      throw new Error(`Report not found: ${id}`);
    }

    return row;
  }

  private upsertContributorFromCommit(commit: NewGitCommit): void {
    const existing = this.db
      .prepare("SELECT * FROM contributors WHERE email = ?")
      .get(commit.authorEmail) as ContributorRecord | undefined;
    const expertiseAreas = mergeExpertiseAreas(
      existing?.expertise_areas ?? "[]",
      commit.filesChanged,
    );

    if (existing) {
      this.db
        .prepare(
          `UPDATE contributors
           SET name = ?,
               risky_commits = risky_commits + ?,
               issues_introduced = issues_introduced + ?,
               issues_fixed = issues_fixed + ?,
               expertise_areas = ?
           WHERE email = ?`,
        )
        .run(
          commit.authorName,
          commit.introducedIssues && commit.introducedIssues > 0 ? 1 : 0,
          commit.introducedIssues ?? 0,
          commit.fixedIssues ?? 0,
          JSON.stringify(expertiseAreas),
          commit.authorEmail,
        );
      return;
    }

    this.db
      .prepare(
        `INSERT INTO contributors (
          name,
          email,
          risky_commits,
          issues_introduced,
          issues_fixed,
          expertise_areas
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        commit.authorName,
        commit.authorEmail,
        commit.introducedIssues && commit.introducedIssues > 0 ? 1 : 0,
        commit.introducedIssues ?? 0,
        commit.fixedIssues ?? 0,
        JSON.stringify(expertiseAreas),
      );
  }
}

function applyInlineMigrations(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(findings)").all() as Array<{
    name: string;
  }>;
  const existing = new Set(columns.map((column) => column.name));
  const scanMigrations = [
    {
      name: "changed_files",
      sql: "ALTER TABLE scans ADD COLUMN changed_files TEXT NOT NULL DEFAULT '[]'",
    },
  ];
  const scanColumns = db.prepare("PRAGMA table_info(scans)").all() as Array<{
    name: string;
  }>;
  const existingScan = new Set(scanColumns.map((column) => column.name));
  for (const migration of scanMigrations) {
    if (!existingScan.has(migration.name)) db.exec(migration.sql);
  }

  const findingMigrations = [
    {
      name: "blast_radius",
      sql: "ALTER TABLE findings ADD COLUMN blast_radius TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "verification_status",
      sql: "ALTER TABLE findings ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'PENDING'",
    },
    {
      name: "verification_reason",
      sql: "ALTER TABLE findings ADD COLUMN verification_reason TEXT",
    },
    {
      name: "confidence",
      sql: "ALTER TABLE findings ADD COLUMN confidence INTEGER",
    },
    {
      name: "original_code",
      sql: "ALTER TABLE findings ADD COLUMN original_code TEXT",
    },
    {
      name: "bob_fix_code",
      sql: "ALTER TABLE findings ADD COLUMN bob_fix_code TEXT",
    },
  ];

  for (const migration of findingMigrations) {
    if (!existing.has(migration.name)) db.exec(migration.sql);
  }

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_findings_verification_status ON findings(verification_status)",
  );
}

function mapRepositorySnapshot(row: RepositorySnapshotRow): RepositorySnapshot {
  return {
    id: row.id,
    scanId: row.scan_id ?? undefined,
    timestamp: row.timestamp,
    rootPath: row.root_path,
    framework: row.framework,
    totalFiles: row.total_files,
    sourceFiles: row.source_files,
    orphanedFiles: JSON.parse(row.orphaned_files) as string[],
    highRiskFiles: JSON.parse(row.high_risk_files) as string[],
    dependencyGraph: JSON.parse(row.dependency_graph) as Record<string, string[]>,
  };
}

function buildImportedBy(graph: Record<string, string[]>): Record<string, string[]> {
  const importedBy: Record<string, string[]> = {};

  for (const [source, imports] of Object.entries(graph)) {
    for (const imported of imports) {
      importedBy[imported] ??= [];
      importedBy[imported].push(source);
    }
  }

  return importedBy;
}

function mergeExpertiseAreas(existingJson: string, filesChanged: string[]): string[] {
  const existing = parseStringArray(existingJson);
  const next = filesChanged
    .map((filePath) => {
      const parts = filePath.split("/");
      if (parts.length > 1 && parts[0]) return parts[0];
      const ext = path.extname(filePath).replace(".", "");
      return ext ? `${ext}-files` : "root";
    })
    .filter(Boolean);

  return [...new Set([...existing, ...next])].sort((a, b) => a.localeCompare(b));
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
