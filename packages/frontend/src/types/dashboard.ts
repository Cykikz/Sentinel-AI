export type AgentStatus = "idle" | "running" | "complete" | "failed";

export interface AgentState {
  id: string;
  status: AgentStatus;
  message?: string;
  updatedAt?: number;
}

export interface DashboardFinding {
  id: number;
  scanId: number;
  agent: string;
  severity: string;
  category: string;
  filePath: string;
  lineNumber: number | null;
  description: string;
  fixApplied: boolean;
  confidence: number | null;
  verificationStatus: string;
}

export interface DashboardSnapshot {
  projectRoot: string;
  healthScore: number;
  lastScan: {
    id: number;
    timestamp: number;
    findings: number;
    scanType: string;
  } | null;
  agents: AgentState[];
  findings: DashboardFinding[];
  healthHistory: Array<{
    timestamp: number;
    score: number;
  }>;
  reportPreview: string;
}

export type DashboardEvent =
  | {
      type: "snapshot";
      snapshot: DashboardSnapshot;
    }
  | {
      type: "agent";
      agent: string;
      status: AgentStatus;
      message?: string;
      timestamp: number;
    }
  | {
      type: "agent_status";
      agent: string;
      status: AgentStatus;
      message?: string;
      timestamp: number;
    }
  | {
      type: "finding";
      finding: DashboardFinding;
      timestamp: number;
    }
  | {
      type: "health";
      score: number;
      timestamp: number;
    }
  | {
      type: "health_update";
      score: number;
      timestamp: number;
    }
  | {
      type: "log";
      message: string;
      timestamp: number;
    };
