import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFlowStore } from "../store/flowStore";
import { NodeStatus } from "../types";

/** 打开一个独立窗口显示节点执行终端 */
export async function openTerminalWindow(
  nodeId: string,
  nodeLabel: string,
  projectPath?: string | null
) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const windowLabel = `terminal-${nodeId}`;

    // 检查窗口是否已存在
    const existing = await WebviewWindow.getByLabel(windowLabel);
    if (existing) {
      try {
        await existing.setFocus();
      } catch {}
      return;
    }

    // 传递 projectPath 让独立窗口可以查询节点信息
    const isDev = window.location.port === "1420";
    const baseUrl = isDev ? "http://localhost:1420" : "";
    const terminalUrl = `${baseUrl}?terminal=${nodeId}${projectPath ? `&project=${encodeURIComponent(projectPath)}` : ""}`;

    const webview = new WebviewWindow(windowLabel, {
      url: terminalUrl,
      title: `执行终端 - ${nodeLabel}`,
      width: 700,
      height: 500,
      minWidth: 500,
      minHeight: 300,
      center: true,
    });

    webview.once("tauri://created", () => {
      console.log("终端窗口已创建:", windowLabel);
    });

    webview.once("tauri://error", (e) => {
      console.error("创建终端窗口失败:", e.payload);
    });
  } catch (e) {
    console.error("打开终端窗口失败:", e);
  }
}

export default function NodeEditor() {
  const { nodes, selectedNodeId, projectPath, updateNode, setNodeStatus } =
    useFlowStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label);
      setPrompt(selectedNode.data.prompt);
    }
  }, [selectedNode]);

  if (!selectedNode) {
    return (
      <div className="p-4 text-gray-400 text-sm text-center">
        选择一个节点以编辑
      </div>
    );
  }

  const handleSave = () => {
    updateNode(selectedNode.id, { label, prompt });
  };

  // 确认并启动任务
  const handleLaunch = async () => {
    if (!prompt.trim()) return;
    handleSave();

    // 状态：pending_edit → running（本地直接设为 Running）
    setNodeStatus(selectedNode.id, NodeStatus.Running);

    // 开始执行（后台运行，不打开窗口）
    setExecuting(true);
    try {
      await invoke("flow_execute_node", {
        projectPath: projectPath || ".",
        nodeId: selectedNode.id,
      });
    } catch (e: any) {
      console.error("执行失败:", e);
      // 后端已经持久化为 NeedsIntervention，本地等 event 更新
    } finally {
      setExecuting(false);
    }
  };

  const statusColors: Record<NodeStatus, string> = {
    [NodeStatus.PendingEdit]: "bg-gray-400",
    [NodeStatus.PendingExec]: "bg-blue-500",
    [NodeStatus.Running]: "bg-yellow-500",
    [NodeStatus.NeedsIntervention]: "bg-red-500",
    [NodeStatus.Completed]: "bg-green-500",
  };

  const statusLabels: Record<NodeStatus, string> = {
    [NodeStatus.PendingEdit]: "待编辑",
    [NodeStatus.PendingExec]: "待执行",
    [NodeStatus.Running]: "执行中",
    [NodeStatus.NeedsIntervention]: "需介入",
    [NodeStatus.Completed]: "完成",
  };

  const d = selectedNode.data;
  const canLaunch =
    (d.status === NodeStatus.PendingEdit && prompt.trim().length > 0) ||
    d.status === NodeStatus.NeedsIntervention ||
    d.status === NodeStatus.Completed;

  return (
    <div className="p-4 space-y-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700">节点编辑器</h3>

      {/* 状态 */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${statusColors[d.status]}`}
        />
        <span className="text-xs text-gray-500">{statusLabels[d.status]}</span>
        {/* 打开终端窗口按钮 */}
        {(d.status === NodeStatus.Running ||
          d.status === NodeStatus.Completed ||
          d.status === NodeStatus.NeedsIntervention) && (
          <button
            onClick={() =>
              openTerminalWindow(selectedNode.id, selectedNode.data.label, projectPath)
            }
            className="ml-auto text-[10px] px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded transition-colors flex items-center gap-1"
            title="在新窗口查看执行过程"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            终端
          </button>
        )}
      </div>

      {/* 标题 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">节点标题</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleSave}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* 提示词 */}
      <div className="flex-1 flex flex-col min-h-0">
        <label className="block text-xs text-gray-500 mb-1">
          Prompt 提示词
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={handleSave}
          rows={6}
          className="w-full flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono resize-none"
          placeholder="输入任务描述…"
          disabled={d.status === NodeStatus.Running}
        />
      </div>

      {/* 依赖文档路径 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          依赖文档路径
        </label>
        {d.dependency_paths.length === 0 ? (
          <p className="text-xs text-gray-400">暂无依赖文档</p>
        ) : (
          <ul className="space-y-1">
            {d.dependency_paths.map((path, i) => (
              <li key={i} className="text-xs text-indigo-600 truncate">
                📄 {path}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 产物路径 */}
      {d.output_paths.length > 0 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">产物文档</label>
          <ul className="space-y-1">
            {d.output_paths.map((path, i) => (
              <li key={i} className="text-xs text-green-600 truncate">
                ✅ {path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.error_message && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{d.error_message}</p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="pt-2 border-t border-gray-200 space-y-2">
        {d.status === NodeStatus.Running || executing ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-xs text-yellow-700">执行中...</span>
          </div>
        ) : canLaunch ? (
          <button
            onClick={handleLaunch}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            {d.status === NodeStatus.NeedsIntervention
              ? "重新执行"
              : d.status === NodeStatus.PendingExec
              ? "开始执行"
              : "确认并启动任务"}
          </button>
        ) : d.status === NodeStatus.PendingEdit && !prompt.trim() ? (
          <p className="text-xs text-gray-400 text-center">
            请填写 Prompt 后启动任务
          </p>
        ) : null}

        {/* 查看终端按钮 */}
        {(d.status === NodeStatus.Running ||
          d.status === NodeStatus.Completed ||
          d.status === NodeStatus.NeedsIntervention) && (
          <button
            onClick={() =>
              openTerminalWindow(selectedNode.id, selectedNode.data.label, projectPath)
            }
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            在新窗口查看执行过程
          </button>
        )}
      </div>
    </div>
  );
}