import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface ExecutionTerminalProps {
  nodeId: string;
  onClose: () => void;
  /** 可选：预填充节点信息（从后端查询） */
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
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const [status, setStatus] = useState(nodeStatus);
  const [label] = useState(nodeLabel);
  const [errorMessage, setErrorMessage] = useState(nodeErrorMessage);
  const [outputPaths, setOutputPaths] = useState<string[]>(nodeOutputPaths);
  const [connected] = useState(false);

  // 初始化 xterm.js 终端
  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#c9d1d9",
        selectionBackground: "#3b5998",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    fitAddon.current = fit;

    // 打开终端后先清空，然后设置一个大的初始尺寸
    term.open(terminalRef.current);
    term.focus();
    // 设置一个足够大的初始尺寸，防止 columns 被错误缩小
    term.resize(120, 24);

    terminalInstance.current = term;

    // 写入欢迎信息
    term.writeln(`\x1b[36m━━━ OpenFlow 终端 ━━━ [节点: ${label || nodeId.slice(0, 8)}]\x1b[0m`);
    term.writeln("");

    return () => {
      term.dispose();
      terminalInstance.current = null;
    };
  }, []);

  // 监听 terminal-data event（PTY 输出）
  useEffect(() => {
    if (!terminalInstance.current) return;

    const unlisten = listen<{
      terminal_id: number;
      data: string;
    }>("terminal-data", (event) => {
      const term = terminalInstance.current;
      if (!term) return;
      // 如果还没有记录 terminal_id，记录下来
      if (terminalId === null) {
        setTerminalId(event.payload.terminal_id);
      }
      // 写入终端
      term.write(event.payload.data);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [terminalId]);

  // 监听 terminal-exit event
  useEffect(() => {
    const unlisten = listen<{
      terminal_id: number;
      exit_code: number;
    }>("terminal-exit", (event) => {
      const term = terminalInstance.current;
      if (!term) return;
      const code = event.payload.exit_code;
      if (code === 0) {
        term.writeln(`\r\n\x1b[32m✅ 进程正常退出 (exit code: 0)\x1b[0m`);
        setStatus("completed");
      } else {
        term.writeln(`\r\n\x1b[31m❌ 进程退出 (exit code: ${code})\x1b[0m`);
        setStatus("needs_intervention");
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // 监听 node_status_changed event
  useEffect(() => {
    const unlisten = listen<{
      node_id: string;
      status: string;
      error?: string;
      output_path?: string;
    }>("node_status_changed", (event) => {
      if (event.payload.node_id !== nodeId) return;
      setStatus(event.payload.status);
      if (event.payload.error) {
        setErrorMessage(event.payload.error);
      }
      if (event.payload.output_path) {
        setOutputPaths((prev) => [...prev, event.payload.output_path!]);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [nodeId]);

  // 处理用户输入（键盘输入 → PTY）
  useEffect(() => {
    const term = terminalInstance.current;
    if (!term || terminalId === null) return;

    const disposer = term.onData((data) => {
      invoke("terminal_write", {
        terminalId,
        data,
      }).catch((e) => console.error("terminal_write error:", e));
    });

    return () => disposer.dispose();
  }, [terminalId]);

  // 自适应大小：手动计算并 resize，避免 fit() 的非幂等问题
  useEffect(() => {
    const term = terminalInstance.current;
    const el = terminalRef.current;
    if (!term || !el) return;

    const doResize = () => {
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        // 手动计算 columns/rows
        // 先获取字符度量
        // 用当前 cols/rows 反推字符宽度，再按容器宽度重算
        // 这样可以避免访问 xterm 内部 API
        const currentCols = term.cols || 80;
        const currentRows = term.rows || 24;
        const cellWidth = rect.width / currentCols;
        const cellHeight = rect.height / currentRows;

        // 只有当字符宽高在合理范围内才重算
        let cols = currentCols;
        let rows = currentRows;
        if (cellWidth >= 5 && cellWidth <= 30) {
          cols = Math.floor(rect.width / cellWidth);
        }
        if (cellHeight >= 10 && cellHeight <= 40) {
          rows = Math.floor(rect.height / cellHeight);
        }

        if (cols > 0 && rows > 0) {
          term.resize(cols, rows);
          if (terminalId !== null) {
            invoke("terminal_resize", { terminalId, cols, rows }).catch(() => {});
          }
        }
      } catch {}
    };

    // 初始 resize：延迟确保布局完成
    const fitTimer = setTimeout(doResize, 100);

    // 窗口 resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doResize, 50);
    };
    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(fitTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [terminalId]);

  // 额外：首次渲染完成后强制 resize
  useEffect(() => {
    const term = terminalInstance.current;
    const el = terminalRef.current;
    if (!term || !el) return;

    const timer = setTimeout(() => {
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const currentCols = term.cols || 80;
        const currentRows = term.rows || 24;
        const cellWidth = rect.width / currentCols;
        const cellHeight = rect.height / currentRows;

        let cols = currentCols;
        let rows = currentRows;
        if (cellWidth >= 5 && cellWidth <= 30) {
          cols = Math.floor(rect.width / cellWidth);
        }
        if (cellHeight >= 10 && cellHeight <= 40) {
          rows = Math.floor(rect.height / cellHeight);
        }

        if (cols > 10 && rows > 3) {
          term.resize(cols, rows);
        }
      } catch {}
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  // 启动 PTY（连接后端终端）
  useEffect(() => {
    if (connected || terminalId !== null) return;
    // 不自动启动，由外部控制
  }, []);

  const isRunning = status === "running" || status === "pending_exec";
  const isCompleted = status === "completed";

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="px-4 py-2 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning && (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-200 truncate">
            {label || `节点 ${nodeId.slice(0, 8)}`}
          </span>
          <span
            className={`text-[10px] shrink-0 ${
              isCompleted
                ? "text-green-500"
                : status === "needs_intervention"
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
              : status === "needs_intervention"
              ? "● 出错"
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {outputPaths.length > 0 && (
            <span className="text-[10px] text-green-500">
              产物: {outputPaths.join(", ")}
            </span>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0"
          >
            ×
          </button>
        </div>
      </div>

      {/* xterm 终端容器 */}
      <div ref={terminalRef} className="flex-1 overflow-hidden min-w-0" />

      {/* 底栏 */}
      <div className="px-4 py-1 bg-[#0d1117] border-t border-[#30363d] shrink-0 flex items-center gap-2 text-[10px] text-gray-500">
        {isRunning && (
          <span className="flex items-center gap-1 text-green-500">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            PTY 运行中
          </span>
        )}
        {terminalId !== null && <span>PTY #{terminalId}</span>}
        {errorMessage && <span className="text-red-500 ml-auto">{errorMessage}</span>}
      </div>
    </div>
  );
}