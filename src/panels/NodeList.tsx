import { useFlowStore } from "../store/flowStore";
import { NodeStatus } from "../types";

const statusOrder = [
  NodeStatus.PendingEdit,
  NodeStatus.PendingExec,
  NodeStatus.Running,
  NodeStatus.NeedsIntervention,
  NodeStatus.Completed,
];

const statusLabels: Record<NodeStatus, string> = {
  [NodeStatus.PendingEdit]: "待编辑",
  [NodeStatus.PendingExec]: "待执行",
  [NodeStatus.Running]: "执行中",
  [NodeStatus.NeedsIntervention]: "需介入",
  [NodeStatus.Completed]: "完成",
};

const statusColors: Record<NodeStatus, string> = {
  [NodeStatus.PendingEdit]: "bg-gray-400",
  [NodeStatus.PendingExec]: "bg-blue-500",
  [NodeStatus.Running]: "bg-yellow-500",
  [NodeStatus.NeedsIntervention]: "bg-red-500",
  [NodeStatus.Completed]: "bg-green-500",
};

const statusTextColors: Record<NodeStatus, string> = {
  [NodeStatus.PendingEdit]: "text-gray-500",
  [NodeStatus.PendingExec]: "text-blue-700",
  [NodeStatus.Running]: "text-yellow-700",
  [NodeStatus.NeedsIntervention]: "text-red-700",
  [NodeStatus.Completed]: "text-green-700",
};

export default function NodeList() {
  const { nodes, edges, setSelectedNode } = useFlowStore();

  // 按状态分组统计
  const stats = statusOrder.reduce(
    (acc, status) => {
      acc[status] = nodes.filter((n) => n.data.status === status).length;
      return acc;
    },
    {} as Record<NodeStatus, number>
  );

  const totalProgress = nodes.length
    ? Math.round(
        (nodes.filter((n) => n.data.status === NodeStatus.Completed).length /
          nodes.length) *
          100
      )
    : 0;

  // 计算每个节点的入度（被依赖数）
  const inDegree: Record<string, number> = {};
  edges.forEach((e) => {
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  });

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">节点列表</h3>

      {/* 进度条 */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>执行进度</span>
          <span>{totalProgress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>

      {/* 状态统计 */}
      <div className="grid grid-cols-5 gap-1">
        {statusOrder.map((status) => (
          <div key={status} className="text-center">
            <div
              className={`w-2 h-2 rounded-full mx-auto mb-1 ${statusColors[status]}`}
            />
            <span className="text-[10px] text-gray-500 block">
              {statusLabels[status]}
            </span>
            <span className="text-xs font-semibold">{stats[status]}</span>
          </div>
        ))}
      </div>

      {/* 节点列表 */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => setSelectedNode(node.id)}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 truncate max-w-[120px]">
                {node.data.label}
              </span>
              <span
                className={`text-[10px] font-medium ${statusTextColors[node.data.status]}`}
              >
                {statusLabels[node.data.status]}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">
                入度: {inDegree[node.id] || 0}
              </span>
              {node.data.status === NodeStatus.NeedsIntervention && (
                <span className="text-[10px] text-red-500">⚠ 错误</span>
              )}
            </div>
          </button>
        ))}
        {nodes.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            暂无节点，点击画布右上角"+"添加
          </p>
        )}
      </div>
    </div>
  );
}