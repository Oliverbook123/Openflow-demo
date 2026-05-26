pub mod file_tree;
pub mod storage;
pub mod terminal;

use crate::models::{FlowProject, NodeStatus};
use std::io::Read;
use tauri::{AppHandle, Emitter};

/// 执行单个节点：后台启动 pi，实时推送日志
#[tauri::command]
pub async fn flow_execute_node(
    app: AppHandle,
    project_path: String,
    node_id: String,
    terminal_store: tauri::State<'_, std::sync::Arc<crate::commands::terminal::TerminalStore>>,
) -> Result<String, String> {
    // 从存储加载项目
    let storage = storage::FlowStorage::new(&project_path);
    let project = storage.load_project()?.ok_or("项目未找到")?;

    // 查找节点
    let node = project
        .nodes
        .iter()
        .find(|n| n.id == node_id)
        .ok_or_else(|| format!("节点 {} 未找到", node_id))?;

    // 检查依赖是否满足
    if !crate::state::FlowStateMachine::are_dependencies_met(&node_id, &project) {
        return Err("前置依赖尚未完成".to_string());
    }

    // 持久化状态为 Running
    let mut updated_project = project.clone();
    if let Some(n) = updated_project.nodes.iter_mut().find(|n| n.id == node_id) {
        n.data.status = NodeStatus::Running;
        let _ = storage.save_project(&updated_project);
    }

    // 通知前端：状态变更为 Running
    let _ = app.emit("node_status_changed", serde_json::json!({
        "node_id": &node_id,
        "status": "running"
    }));

    // 在 PTY 中启动 pi 命令
    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system
        .openpty(portable_pty::PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("打开 PTY 失败: {}", e))?;

    let mut pty_cmd = portable_pty::CommandBuilder::new("pi");
    pty_cmd.arg("-p");
    pty_cmd.arg("--no-session");
    pty_cmd.arg(&node.data.label);
    pty_cmd.cwd(&project_path);
    pty_cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(pty_cmd)
        .map_err(|e| format!("在 PTY 中启动 pi 失败: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("获取 PTY writer 失败: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("获取 PTY reader 失败: {}", e))?;

    // 分配 terminal_id 并存入 store
    let terminal_id = {
        let mut next = terminal_store.next_id.lock().map_err(|e| e.to_string())?;
        let id = *next;
        *next += 1;
        id
    };

    {
        let mut terminals = terminal_store.terminals.lock().map_err(|e| e.to_string())?;
        terminals.insert(
            terminal_id,
            crate::commands::terminal::PtyHandle {
                writer,
                _master: pair.master,
                child,
            },
        );
    }

    // 持久化 terminal_id 到节点
    // （使用 json 格式存储到 output_paths 中，作为 hack）
    if let Some(n) = updated_project.nodes.iter_mut().find(|n| n.id == node_id) {
        n.data.meta.insert("terminal_id".to_string(), terminal_id.to_string());
        let _ = storage.save_project(&updated_project);
    }

    // 通知前端：开始执行，传递 terminal_id
    let _ = app.emit("execution_log", serde_json::json!({
        "node_id": &node_id,
        "message": format!("$ pi -p --no-session \"{}\"\n", node.data.label),
        "timestamp": chrono::Utc::now().timestamp_millis()
    }));
    let _ = app.emit("execution_log", serde_json::json!({
        "node_id": &node_id,
        "message": format!("📂 项目目录: {}", project_path),
        "timestamp": chrono::Utc::now().timestamp_millis()
    }));
    let _ = app.emit("execution_log", serde_json::json!({
        "node_id": &node_id,
        "message": format!("🔗 PTY #{}", terminal_id),
        "timestamp": chrono::Utc::now().timestamp_millis()
    }));

    let _ = app.emit("node_status_changed", serde_json::json!({
        "node_id": &node_id,
        "status": "running",
        "terminal_id": terminal_id
    }));

    // 后台线程：读取 PTY 输出并推送
    let app_clone = app.clone();
    let id_clone = node_id.clone();
    let store_clone = terminal_store.inner().clone();

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut output = String::new();

        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    output.push_str(&text);

                    let _ = app_clone.emit("terminal-data", serde_json::json!({
                        "terminal_id": terminal_id,
                        "data": text,
                    }));
                }
                Ok(_) => break,
                Err(_) => break,
            }
        }

        // 获取退出码
        let exit_code = {
            let mut terminals = match store_clone.terminals.lock() {
                Ok(t) => t,
                Err(_) => return,
            };
            if let Some(handle) = terminals.get_mut(&terminal_id) {
                match handle.child.try_wait() {
                    Ok(Some(status)) => {
                        if status.success() { 0 } else { 1 }
                    }
                    _ => -1,
                }
            } else {
                -1
            }
        };

        let _ = app_clone.emit("terminal-exit", serde_json::json!({
            "terminal_id": terminal_id,
            "exit_code": exit_code
        }));

        // 根据退出码更新状态
        let storage = storage::FlowStorage::new(&project_path);

        if exit_code == 0 {
            let version = 1u32;
            if let Ok(doc_path) = storage.save_task_document(&id_clone, version, &output) {
                if let Ok(Some(mut proj)) = storage.load_project() {
                    if let Some(n) = proj.nodes.iter_mut().find(|n| n.id == id_clone) {
                        n.data.status = NodeStatus::Completed;
                        n.data.output_paths.push(doc_path.clone());
                        let _ = storage.save_project(&proj);
                    }

                    let _ = app_clone.emit("node_status_changed", serde_json::json!({
                        "node_id": &id_clone,
                        "status": "completed",
                        "output_path": &doc_path
                    }));
                }
            }
        } else {
            let error_msg = format!("❌ pi 执行失败，退出码: {}", exit_code);

            if let Ok(Some(mut proj)) = storage.load_project() {
                if let Some(n) = proj.nodes.iter_mut().find(|n| n.id == id_clone) {
                    n.data.status = NodeStatus::NeedsIntervention;
                    n.data.error_message = Some(error_msg.clone());
                    let _ = storage.save_project(&proj);
                }

                let _ = app_clone.emit("node_status_changed", serde_json::json!({
                    "node_id": &id_clone,
                    "status": "needs_intervention",
                    "error": &error_msg
                }));
            }
        }
    });

    Ok(terminal_id.to_string())
}

/// 保存项目到指定路径
#[tauri::command]
pub fn flow_save_project(project_path: String, project: FlowProject) -> Result<(), String> {
    let storage = storage::FlowStorage::new(&project_path);
    storage.save_project(&project)
}

/// 从指定路径加载项目
#[tauri::command]
pub fn flow_load_project(project_path: String) -> Result<Option<FlowProject>, String> {
    let storage = storage::FlowStorage::new(&project_path);
    storage.load_project()
}

/// 列出工作区文件
#[tauri::command]
pub fn list_workspace_files(path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err("路径不是有效的目录".to_string());
    }

    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    files.push(name.to_string_lossy().to_string());
                }
            }
        }
    }
    Ok(files)
}

/// 验证文件路径是否存在
#[tauri::command]
pub fn validate_path(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

/// 获取节点信息（供独立窗口使用）
#[tauri::command]
pub fn flow_get_node_info(
    project_path: String,
    node_id: String,
) -> Result<serde_json::Value, String> {
    let storage = storage::FlowStorage::new(&project_path);
    let project = storage.load_project()?.ok_or("项目未找到")?;
    let node = project
        .nodes
        .iter()
        .find(|n| n.id == node_id)
        .ok_or_else(|| format!("节点 {} 未找到", node_id))?;

    Ok(serde_json::json!({
        "label": node.data.label,
        "status": node.data.status,
        "error_message": node.data.error_message,
        "output_paths": node.data.output_paths,
    }))
}

/// 更新节点状态
#[tauri::command]
pub fn flow_update_node_status(
    app: AppHandle,
    project_path: String,
    node_id: String,
    status: String,
) -> Result<(), String> {
    let new_status = match status.as_str() {
        "pending_edit" => NodeStatus::PendingEdit,
        "pending_exec" => NodeStatus::PendingExec,
        "running" => NodeStatus::Running,
        "needs_intervention" => NodeStatus::NeedsIntervention,
        "completed" => NodeStatus::Completed,
        _ => return Err(format!("无效的状态: {}", status)),
    };

    let storage = storage::FlowStorage::new(&project_path);
    let mut project = storage.load_project()?.ok_or("项目未找到")?;

    if let Some(node) = project.nodes.iter_mut().find(|n| n.id == node_id) {
        let current_status = node.data.status.clone();
        if !crate::state::FlowStateMachine::can_transition(&current_status, &new_status) {
            return Err(format!(
                "无法从 {:?} 转换到 {:?}",
                current_status, new_status
            ));
        }
        node.data.status = new_status;
    } else {
        return Err(format!("节点 {} 未找到", node_id));
    }

    storage.save_project(&project)?;

    let _ = app.emit("node_status_changed", serde_json::json!({
        "node_id": node_id,
        "status": status
    }));

    Ok(())
}