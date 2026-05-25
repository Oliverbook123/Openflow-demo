mod commands;
mod models;
mod state;

use commands::{flow_execute_node, flow_save_project, flow_load_project};
use commands::{list_workspace_files, validate_path, flow_update_node_status, flow_get_node_info};
use commands::file_tree::list_directory_tree;
use commands::storage::load_project_by_path;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            flow_save_project,
            flow_load_project,
            flow_execute_node,
            list_workspace_files,
            validate_path,
            flow_update_node_status,
            flow_get_node_info,
            list_directory_tree,
            load_project_by_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}