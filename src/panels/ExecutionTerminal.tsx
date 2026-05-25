import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

interface ExecutionTerminalProps {
  nodeId: string;
  onClose: () => void;
  nodeLabel?: string;
  nodeStatus?: string;
  nodeErrorMessage?: string;
  nodeOutputPaths?: string[];
}

export default function ExecutionTerminal({
  nodeId,
  onClose,
  nodeLabel = "",
  nodeStatus = "",
  nodeErrorMessage = "",
  nodeOutputPaths = [],
}: ExecutionTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<Array<{ message: string; timestamp: number }>>([]);
  const [status, setStatus] = useState(nodeStatus);
  const [label] = useState(nodeLabel);
  const [errorMessage, setErrorMessage] = useState(nodeErrorMessage);
  const [outputPaths, setOutputPaths] = useState<string[]>(nodeOutputPaths);

  // 监听 Tauri event：execution_log，实时追加日志
  useEffect(() => {
    const unlisten = listen<{
      node_id: string;
      message: string;
      timestamp: number;
    }>("execution_log", (event) => {
      if (event.payload.node_id === nodeId) {
        setLogs((prev) => [...prev, {
          message: event.payload.message,
          timestamp: event.payload.timestamp,
        }]);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [nodeId]);

  // 监听 node_status_changed event
  useEffect(() => {
    const unlisten = listen<{
      node_id: string;
      status: string;
      error?: string;
      output_path?: string;
    }>("node_status_changed", (event) => {
      if (event.payload.node_id === nodeId) {
        setStatus(event.payload.status);
        if (event.payload.error) {
          setErrorMessage(event.payload.error);
        }
        if (event.payload.output_path) {
          setOutputPaths((prev) => [...prev, event.payload.output_path!]);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [nodeId]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isError = status === "needs_intervention";

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100">
      {/* 标题栏 */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning && (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            {label || `节点 ${nodeId.slice(0, 8)}`}
          </span>
          <span
            className={`text-[10px] shrink-0 ${
              isCompleted
                ? "text-green-500"
                : isError
                ? "text-red-500"
                : isRunning
                ? "text-green-400"
                : "text-gray-500"
            }`}
          >
            {isRunning
              ? "● 运行中"
              : isCompleted
              ? "● 已完成"
              : isError
              ? "● 出错"
              : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0"
        >
          ×
        </button>
      </div>

      {/* 终端内容 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {/* 日志输出 */}
        {logs.length === 0 && !isRunning && !isCompleted && !isError && (
          <div className="text-gray-600 mt-4 text-center">等待执行...</div>
        )}

        {logs.length === 0 && isRunning && (
          <div className="flex items-center gap-2 text-gray-500 mt-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>正在执行，等待输出...</span>
          </div>
        )}

        {logs.length === 0 && isCompleted && (
          <div className="text-gray-600 mt-4 text-center">
            ✅ 执行完成（无输出日志）
          </div>
        )}

        {logs.length === 0 && isError && (
          <div className="text-red-500 mt-4 text-center">
            ❌ {errorMessage || "执行出错"}
          </div>
        )}

        {logs.map((log, i) => {
          const isCmd = log.message.startsWith("$ ");
          const isWarning = log.message.startsWith("⚠️");
          const isError = log.message.startsWith("❌");
          const isDone = log.message.startsWith("✅");
          const isInfo = log.message.startsWith("💡");
          return (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all ${
                isCmd
                  ? "text-green-400"
                  : isWarning
                  ? "text-yellow-400"
                  : isError
                  ? "text-red-400"
                  : isDone
                  ? "text-green-400"
                  : isInfo
                  ? "text-blue-400"
                  : "text-gray-300"
              }`}
            >
              {log.message}
            </div>
          );
        })}

        {/* 完成/错误提示 */}
        {isCompleted && logs.length > 0 && (
          <div className="text-green-500 mt-2 border-t border-gray-800 pt-2">
            ✅ 执行完成
            {outputPaths.length > 0 && (
              <span className="text-gray-400 ml-2">
                产物: {outputPaths.join(", ")}
              </span>
            )}
          </div>
        )}

        {isError && logs.length > 0 && (
          <div className="text-red-500 mt-2 border-t border-gray-800 pt-2">
            ❌ {errorMessage || "执行出错"}
          </div>
        )}

        {isRunning && (
          <span className="inline-block w-2 h-4 bg-gray-300 ml-0.5 animate-pulse" />
        )}
      </div>

      {/* 底部状态 */}
      <div className="px-4 py-1.5 border-t border-gray-800 shrink-0 flex items-center gap-2 text-[10px] text-gray-600">
        {isRunning && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            进程运行中
          </span>
        )}
        <span>日志: {logs.length} 行</span>
        {outputPaths.length > 0 && (
          <span className="text-green-600">
            | 产物: {outputPaths.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}