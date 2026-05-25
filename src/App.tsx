import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import FlowCanvas from "./canvas/FlowCanvas";
import NodeEditor from "./panels/NodeEditor";
import FileTree from "./panels/FileTree";
import ExecutionTerminal from "./panels/ExecutionTerminal";
import { useFlowStore } from "./store/flowStore";
import "./App.css";

/** 将当前画布内容保存到 .openflow/config.json */
async function saveProjectToDisk(
  store: ReturnType<typeof useFlowStore.getState>
) {
  const projectPath = store.projectPath;
  if (!projectPath) return;

  const project = {
    nodes: store.nodes,
    edges: store.edges,
  };

  try {
    await invoke("flow_save_project", {
      projectPath: projectPath,
      project,
    });
  } catch (e) {
    console.error("保存项目失败:", e);
  }
}

// 快捷键提示（右键页面 → Inspect Element 打开 DevTools）
function useDevTools() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "i" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        console.log("💡 请右键点击页面 → 选择 Inspect Element 打开开发者工具");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

function App() {
  useDevTools();
  const store = useFlowStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "unsaved" | "saving"
  >("saved");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 检测是否为独立终端窗口（通过 URL 参数 ?terminal=nodeId）
  const terminalNodeId = new URLSearchParams(window.location.search).get(
    "terminal"
  );
  if (terminalNodeId) {
    // 在独立的窗口中，使用 TermView 单独渲染（完全独立于主应用状态）
    return <TermView nodeId={terminalNodeId} />;
  }

  // 自动保存：节点/边变化后延时 1.5 秒保存
  useEffect(() => {
    if (!projectRoot) return;

    setSaveStatus("unsaved");

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      await saveProjectToDisk(store);
      setSaveStatus("saved");
    }, 1500);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [store.nodes, store.edges, projectRoot]);

  // 打开文件夹对话框
  const openFolder = useCallback(async () => {
    setIsLoadingProject(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });

      if (!selectedPath) {
        setIsLoadingProject(false);
        return;
      }

      const result = await invoke<{
        project_path: string;
        project: { nodes: any[]; edges: any[] } | null;
      }>("load_project_by_path", { projectPath: selectedPath });

      if (result) {
        setProjectRoot(result.project_path);
        store.setProjectPath(result.project_path);

        if (result.project) {
          store.loadProject(result.project.nodes, result.project.edges);
        }
      }
    } catch (e: any) {
      console.error("打开项目失败:", e);
    } finally {
      setIsLoadingProject(false);
    }
  }, [store]);

  // 如果没有打开项目，显示欢迎界面
  if (!projectRoot) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50">
        <div className="text-center space-y-6 max-w-md">
          <h1 className="text-4xl font-bold text-indigo-700">OpenFlow</h1>
          <p className="text-gray-500 text-sm">
            可视化 AI 编程任务编排工具
          </p>
          <button
            onClick={openFolder}
            disabled={isLoadingProject}
            className="mt-4 px-8 py-3 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50 text-base font-medium flex items-center gap-2 mx-auto"
          >
            {isLoadingProject ? (
              <span>打开中...</span>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                  />
                </svg>
                打开文件夹
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            选择一个项目目录开始编排任务
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex bg-white">
      {/* 左侧面板：文件浏览器 */}
      <aside className="w-64 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <button
            onClick={openFolder}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200 transition-colors"
            title="切换项目目录"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
              />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-indigo-700 truncate">
              OpenFlow
            </h1>
          </div>
          <button
            onClick={() => {
              setSaveStatus("saving");
              saveProjectToDisk(store).then(() => setSaveStatus("saved"));
            }}
            className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-200 transition-colors"
            title="保存项目"
          >
            {saveStatus === "saved" && (
              <span className="text-green-600">✓</span>
            )}
            {saveStatus === "unsaved" && (
              <span className="text-gray-400">○</span>
            )}
            {saveStatus === "saving" && (
              <span className="text-yellow-600 animate-pulse">↻</span>
            )}
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <FileTree
            rootPath={projectRoot}
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
          />
        </div>
      </aside>

      {/* 中间：画布 */}
      <main className="flex-1 relative">
        <FlowCanvas />
      </main>

      {/* 右侧面板：编辑器 */}
      <aside className="w-96 border-l border-gray-200 bg-gray-50 flex flex-col">
        {selectedFile ? (
          <FilePreview
            filePath={selectedFile}
            onClose={() => setSelectedFile(null)}
          />
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-semibold text-gray-700">编辑器</h2>
              <span
                className="text-[10px] text-gray-400 truncate max-w-[160px]"
                title={projectRoot}
              >
                {projectRoot.split("/").pop() || projectRoot}
              </span>
            </div>
            {/* 节点编辑器 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <NodeEditor />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/** 文件预览组件 */
function FilePreview({
  filePath,
  onClose,
}: {
  filePath: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setContent(null);
    import("@tauri-apps/plugin-fs")
      .then(({ readTextFile }) => readTextFile(filePath))
      .then((text) => {
        setContent(text);
        setIsLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setIsLoading(false);
      });
  }, [filePath]);

  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 truncate max-w-[200px]">
          📄 {fileName}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading && <p className="text-xs text-gray-400">加载中...</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {content !== null && (
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">
            {content.slice(0, 5000)}
            {content.length > 5000 &&
              "\n\n...（文件过长，仅显示前 5000 字符）"}
          </pre>
        )}
      </div>
    </div>
  );
}

/** 独立终端窗口视图 */
function TermView({ nodeId }: { nodeId: string }) {
  useDevTools();
  const [nodeInfo, setNodeInfo] = useState<{
    label: string;
    status: string;
    error_message: string | null;
    output_paths: string[];
  } | null>(null);

  // 获取 projectPath —— 通过 URL 参数传递
  const projectPath = new URLSearchParams(window.location.search).get("project");

  // 打开窗口时从后端获取已有节点信息
  useEffect(() => {
    if (!projectPath) return;
    invoke("flow_get_node_info", {
      projectPath,
      nodeId,
    })
      .then((info: any) => setNodeInfo(info))
      .catch((e) => console.error("获取节点信息失败:", e));
  }, [nodeId, projectPath]);

  return (
    <div className="w-screen h-screen flex">
      <ExecutionTerminal
        nodeId={nodeId}
        onClose={() => window.close()}
        nodeLabel={nodeInfo?.label || ""}
        nodeStatus={nodeInfo?.status || ""}
        nodeErrorMessage={nodeInfo?.error_message || ""}
        nodeOutputPaths={nodeInfo?.output_paths || []}
      />
    </div>
  );
}

export default App;