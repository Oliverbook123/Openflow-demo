mod commands;
mod models;
mod state;

use std::sync::Arc;

use commands::{flow_execute_node, flow_save_project, flow_load_project};
use commands::{list_workspace_files, validate_path, flow_update_node_status, flow_get_node_info};
use commands::file_tree::list_directory_tree;
use commands::storage::load_project_by_path;
use commands::terminal::{terminal_spawn, terminal_write, terminal_resize, terminal_kill, TerminalStore};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminal_store = Arc::new(TerminalStore::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(terminal_store)
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
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}