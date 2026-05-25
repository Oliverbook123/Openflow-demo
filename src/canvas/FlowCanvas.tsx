import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FlowTaskNode from "./FlowTaskNode";
import { useFlowStore } from "../store/flowStore";
import { NodeStatus, FlowNode } from "../types";

const nodeTypes = {
  flowTask: FlowTaskNode,
};

let nodeIdCounter = 0;
function getNodeId() {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

// 默认边样式：实线 + 箭头
const defaultEdgeOptions = {
  type: "smoothstep",
  style: { stroke: "#6366f1", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#6366f1",
    width: 20,
    height: 20,
  },
};

export default function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const store = useFlowStore();

  // 使用 useNodesState（让 React Flow 管理拖拽/选中等交互状态）
  // 但通过 ref 将位置变化同步回 zustand
  const [nodes, setNodes, onNodesChange] = useNodesState(
    store.nodes as Node[]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(store.edges);

  // 同步 zustand → React Flow：每当 store.nodes 变化时（包括内部 data 的变化），同步到 useNodesState
  // 使用 ref 存储上一次的 JSON 序列化，只有真正变化时才同步
  const prevNodesJson = useRef(JSON.stringify(store.nodes));
  const nodesJson = JSON.stringify(store.nodes);
  if (prevNodesJson.current !== nodesJson) {
    prevNodesJson.current = nodesJson;
    setTimeout(() => setNodes(store.nodes as Node[]), 0);
  }

  const prevEdgesJson = useRef(JSON.stringify(store.edges));
  const edgesJson = JSON.stringify(store.edges);
  if (prevEdgesJson.current !== edgesJson) {
    prevEdgesJson.current = edgesJson;
    setTimeout(() => setEdges(store.edges), 0);
  }

  // 将拖拽后的位置同步回 zustand（只同步位置，不覆盖 data）
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      store.updateNodePosition(node.id, node.position);
    },
    [store]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `edge_${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
        type: "smoothstep",
        style: { stroke: "#6366f1", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#6366f1",
          width: 20,
          height: 20,
        },
      };
      store.addEdge(newEdge);
    },
    [store]
  );

  const onAddNode = useCallback(() => {
    const newNode: Node = {
      id: getNodeId(),
      type: "flowTask",
      position: {
        x: Math.random() * 400 + 50,
        y: Math.random() * 300 + 50,
      },
      data: {
        label: `任务 ${store.nodes.length + 1}`,
        prompt: "",
        status: NodeStatus.PendingEdit,
        dependency_paths: [],
        output_paths: [],
      },
    };
    store.addNode(newNode as FlowNode);
  }, [store]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      store.setSelectedNode(node.id);
    },
    [store]
  );

  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      for (const n of deletedNodes) {
        store.removeNode(n.id);
      }
    },
    [store]
  );

  return (
    <div className="w-full h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodesDelete={onNodesDelete}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        deleteKeyCode="Delete"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            const status = (n.data as any)?.status;
            switch (status) {
              case NodeStatus.Completed:
                return "#22c55e";
              case NodeStatus.Running:
                return "#eab308";
              case NodeStatus.NeedsIntervention:
                return "#ef4444";
              case NodeStatus.PendingExec:
                return "#3b82f6";
              default:
                return "#9ca3af";
            }
          }}
        />
      </ReactFlow>

      <button
        onClick={onAddNode}
        className="absolute top-4 right-4 z-10 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
      >
        + 添加节点
      </button>
    </div>
  );
}