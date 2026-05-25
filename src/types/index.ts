/** OpenFlow 类型定义 */

export enum NodeStatus {
  PendingEdit = "pending_edit",
  PendingExec = "pending_exec",
  Running = "running",
  NeedsIntervention = "needs_intervention",
  Completed = "completed",
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    prompt: string;
    status: NodeStatus;
    dependency_paths: string[];
    output_paths: string[];
    error_message?: string;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface FlowProject {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ExecutionLog {
  nodeId: string;
  message: string;
  timestamp: number;
}