import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { NodeStatus } from "../types";

type FlowTaskNodeData = {
  label: string;
  prompt: string;
  status: NodeStatus;
  error_message?: string;
};

const statusConfig: Record<
  NodeStatus,
  { label: string; color: string; bg: string }
> = {
  [NodeStatus.PendingEdit]: {
    label: "待编辑",
    color: "text-gray-500",
    bg: "bg-gray-100 border-gray-300",
  },
  [NodeStatus.PendingExec]: {
    label: "待执行",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-400",
  },
  [NodeStatus.Running]: {
    label: "执行中",
    color: "text-yellow-700",
    bg: "bg-yellow-50 border-yellow-400",
  },
  [NodeStatus.NeedsIntervention]: {
    label: "需介入",
    color: "text-red-700",
    bg: "bg-red-50 border-red-400",
  },
  [NodeStatus.Completed]: {
    label: "完成",
    color: "text-green-700",
    bg: "bg-green-50 border-green-400",
  },
};

function FlowTaskNode({ data }: NodeProps<Node<FlowTaskNodeData>>) {
  const config = statusConfig[data.status];

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-md min-w-[200px] ${config.bg}`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3" />

      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-gray-800 truncate max-w-[140px]">
          {data.label || "未命名节点"}
        </span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.color} bg-white/80`}
        >
          {config.label}
        </span>
      </div>

      {data.prompt && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-1">
          {data.prompt}
        </p>
      )}

      {data.error_message && (
        <p className="text-xs text-red-600 mt-1">{data.error_message}</p>
      )}

      {data.status === NodeStatus.Running && (
        <div className="flex items-center gap-1 mt-1">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-xs text-yellow-600">运行中...</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3"
      />
    </div>
  );
}

export default memo(FlowTaskNode);