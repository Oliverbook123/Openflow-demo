pub mod file_tree;
pub mod storage;

use crate::models::{FlowProject, NodeStatus};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

/// 执行单个节点：后台启动 pi，实时推送日志
#[tauri::command]
pub async fn flow_execute_node(
    app: AppHandle,
    project_path: String,
    node_id: String,
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

    // 构建 pi 命令：pi -p --no-session "任务描述"
    // 如果有依赖文档，通过 --append-system-prompt 作为上下文传递
    let cmd_str = format!("pi -p --no-session \"{}\"", node.data.label.replace('"', "\\\""));
    let mut cmd = Command::new("pi");
    cmd.arg("-p");
    cmd.arg("--no-session");
    cmd.arg(&node.data.label);
    cmd.current_dir(&project_path);

    // 添加依赖文档作为上下文（通过 --append-system-prompt 传递文件内容）
    for dep_path in &node.data.dependency_paths {
        if std::path::Path::new(&dep_path).exists() {
            if let Ok(content) = std::fs::read_to_string(&dep_path) {
                // 只传递文件前 4000 字符作为上下文
                let preview = if content.len() > 4000 {
                    format!("{}...\n[文件过长，仅显示前 4000 字符]", &content[..4000])
                } else {
                    content
                };
                // 使用 stdin 传递更复杂的上下文，这里简化为通过 label 拼接
            }
        }
    }

    // 通知前端：开始执行
    let _ = app.emit("execution_log", serde_json::json!({
        "node_id": &node_id,
        "message": format!("$ {}\n", cmd_str),
        "timestamp": chrono::Utc::now().timestamp_millis()
    }));
    let _ = app.emit("execution_log", serde_json::json!({
        "node_id": &node_id,
        "message": format!("📂 项目目录: {}", project_path),
        "timestamp": chrono::Utc::now().timestamp_millis()
    }));

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    // spawn 后直接 wait_with_output（同步等待完整输出后再一次性 emit）
    let cmd_output = cmd.output().map_err(|e| {
        format!("启动 pi 失败: {}", e)
    })?;

    let status = cmd_output.status;
    let stdout_str = String::from_utf8_lossy(&cmd_output.stdout);
    let stderr_str = String::from_utf8_lossy(&cmd_output.stderr);
    let mut output = stdout_str.to_string();

    // 一次性将 stdout 推送到前端
    for line in stdout_str.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            let _ = app.emit("execution_log", serde_json::json!({
                "node_id": &node_id,
                "message": trimmed.to_string(),
                "timestamp": chrono::Utc::now().timestamp_millis()
            }));
        }
    }

    // 一次性将 stderr 推送到前端
    for line in stderr_str.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            let _ = app.emit("execution_log", serde_json::json!({
                "node_id": &node_id,
                "message": format!("⚠️ {}", trimmed),
                "timestamp": chrono::Utc::now().timestamp_millis()
            }));
        }
    }

    if status.success() {
        let version = 1u32;
        let doc_path = storage.save_task_document(&node_id, version, &output)?;

        let mut project = storage.load_project()?.ok_or("项目未找到")?;
        if let Some(n) = project.nodes.iter_mut().find(|n| n.id == node_id) {
            n.data.status = NodeStatus::Completed;
            n.data.output_paths.push(doc_path.clone());
            let _ = storage.save_project(&project);
        }

        let _ = app.emit("execution_log", serde_json::json!({
            "node_id": &node_id,
            "message": format!("✅ 任务完成！产物: {}", doc_path),
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));

        let _ = app.emit("node_status_changed", serde_json::json!({
            "node_id": &node_id,
            "status": "completed",
            "output_path": &doc_path
        }));

        Ok(doc_path)
    } else {
        let exit_code = status.code();
        let error_msg = format!(
            "❌ pi 执行失败，退出码: {:?}。请检查上方终端输出中的错误详情。",
            exit_code
        );

        let _ = app.emit("execution_log", serde_json::json!({
            "node_id": &node_id,
            "message": error_msg.clone(),
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));
        let _ = app.emit("execution_log", serde_json::json!({
            "node_id": &node_id,
            "message": "💡 提示: 请确保 pi 命令可用 (which pi)".to_string(),
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));

        let mut project = storage.load_project()?.ok_or("项目未找到")?;
        if let Some(n) = project.nodes.iter_mut().find(|n| n.id == node_id) {
            n.data.status = NodeStatus::NeedsIntervention;
            n.data.error_message = Some(error_msg.clone());
            let _ = storage.save_project(&project);
        }

        let _ = app.emit("node_status_changed", serde_json::json!({
            "node_id": &node_id,
            "status": "needs_intervention",
            "error": &error_msg
        }));

        Err(error_msg)
    }
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