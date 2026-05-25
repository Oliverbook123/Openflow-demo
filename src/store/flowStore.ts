import { create } from "zustand";
import { FlowNode, FlowEdge, NodeStatus, ExecutionLog } from "../types";
import type { Edge } from "@xyflow/react";

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  executionLogs: ExecutionLog[];
  projectPath: string | null;

  // Actions
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;
  addNode: (node: FlowNode) => void;
  addEdge: (edge: Edge) => void;
  updateNode: (nodeId: string, data: Partial<FlowNode["data"]>) => void;
  removeNode: (nodeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setNodeStatus: (nodeId: string, status: NodeStatus) => void;
  addExecutionLog: (log: ExecutionLog) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setProjectPath: (path: string | null) => void;
  loadProject: (nodes: FlowNode[], edges: FlowEdge[]) => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  executionLogs: [],
  projectPath: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node] })),

  addEdge: (edge) =>
    set((state) => ({ edges: [...state.edges, edge] })),

  updateNode: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    })),

  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
      selectedNodeId:
        state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    })),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, status } } : n
      ),
    })),

  updateNodePosition: (nodeId, position) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, position } : n
      ),
    })),

  addExecutionLog: (log) =>
    set((state) => ({
      executionLogs: [...state.executionLogs, log],
    })),

  setProjectPath: (path) => set({ projectPath: path }),

  loadProject: (nodes, edges) => set({ nodes, edges }),
}));