import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface FileTreeItem {
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeItem[];
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

function FileTreeNode({
  item,
  depth,
  onFileSelect,
  selectedFile,
}: {
  item: FileTreeItem;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  const toggle = () => {
    if (item.isDir) {
      setExpanded((v) => !v);
    } else {
      onFileSelect(item.path);
    }
  };

  const isSelected = !item.isDir && selectedFile === item.path;
  const indent = depth * 16;

  // 文件图标
  let icon = "📄";
  if (item.isDir) {
    icon = expanded ? "📂" : "📁";
  } else {
    const ext = item.name.split(".").pop()?.toLowerCase();
    if (["ts", "tsx"].includes(ext || "")) icon = "🔵";
    else if (["rs", "toml"].includes(ext || "")) icon = "🦀";
    else if (["json"].includes(ext || "")) icon = "📋";
    else if (["md"].includes(ext || "")) icon = "📝";
    else if (["css", "html"].includes(ext || "")) icon = "🌐";
    else if (["svg", "png", "jpg", "ico"].includes(ext || "")) icon = "🖼️";
  }

  return (
    <div>
      <button
        onClick={toggle}
        className={`w-full text-left flex items-center gap-1.5 px-2 py-0.5 text-sm rounded hover:bg-gray-200 transition-colors ${
          isSelected ? "bg-indigo-100 text-indigo-800 font-medium" : "text-gray-700"
        }`}
        style={{ paddingLeft: `${12 + indent}px` }}
      >
        <span className="text-xs">{icon}</span>
        <span className="truncate">{item.name}</span>
      </button>

      {item.isDir && expanded && item.children.length > 0 && (
        <div>
          {item.children.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}

      {item.isDir && expanded && item.children.length === 0 && (
        <p
          className="text-xs text-gray-400 italic px-2"
          style={{ paddingLeft: `${28 + indent}px` }}
        >
          空目录
        </p>
      )}
    </div>
  );
}

export default function FileTree({
  rootPath,
  onFileSelect,
  selectedFile,
}: FileTreeProps) {
  const [tree, setTree] = useState<FileTreeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileTreeItem[]>("list_directory_tree", {
        path: rootPath,
      });
      setTree(result);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  return (
    <div className="text-sm select-none">
      {/* 目录标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          文件浏览器
        </span>
        <button
          onClick={loadTree}
          className="text-gray-400 hover:text-gray-600 text-xs px-1 py-0.5 rounded hover:bg-gray-200 transition-colors"
          title="刷新"
        >
          ↻
        </button>
      </div>

      {/* 根路径 */}
      <div className="px-3 py-1 text-xs text-gray-400 truncate border-b border-gray-100 bg-gray-50/50" title={rootPath}>
        {rootPath}
      </div>

      {/* 文件树 */}
      <div className="overflow-y-auto py-1" style={{ maxHeight: "calc(100vh - 200px)" }}>
        {loading && tree.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">加载中...</p>
        )}
        {error && (
          <p className="text-xs text-red-500 px-3 py-2">{error}</p>
        )}
        {!loading && !error && tree.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">空目录</p>
        )}
        {tree.map((item) => (
          <FileTreeNode
            key={item.path}
            item={item}
            depth={0}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    </div>
  );
}