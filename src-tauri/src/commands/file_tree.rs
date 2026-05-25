use serde::Serialize;
use std::fs;
use std::path::Path;

/// 文件树节点
#[derive(Debug, Clone, Serialize)]
pub struct FileTreeItem {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub children: Vec<FileTreeItem>,
}

/// 递归扫描目录，构建文件树（最多 3 层深度避免卡死）
fn scan_directory(dir: &Path, depth: usize) -> Vec<FileTreeItem> {
    if depth > 3 {
        return vec![];
    }

    let mut items = Vec::new();
    let mut entries: Vec<_> = match fs::read_dir(dir) {
        Ok(entries) => entries.filter_map(|e| e.ok()).collect(),
        Err(_) => return items,
    };

    // 目录排前面，按名称排序
    entries.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if a_is_dir != b_is_dir {
            b_is_dir.cmp(&a_is_dir)
        } else {
            a.file_name().cmp(&b.file_name())
        }
    });

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏目录/文件（以 . 开头）
        if name.starts_with('.') && name != ".openflow" {
            continue;
        }
        // 跳过 node_modules
        if name == "node_modules" || name == "target" {
            continue;
        }

        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let path_str = path.to_string_lossy().to_string();

        let children = if is_dir {
            scan_directory(&path, depth + 1)
        } else {
            vec![]
        };

        items.push(FileTreeItem {
            name,
            path: path_str,
            is_dir,
            children,
        });
    }

    items
}

/// 递归列出目录树（Tauri 命令）
#[tauri::command]
pub fn list_directory_tree(path: String) -> Result<Vec<FileTreeItem>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(String::from("路径不是有效的目录"));
    }
    Ok(scan_directory(dir, 0))
}