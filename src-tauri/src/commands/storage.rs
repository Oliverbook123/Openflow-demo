use crate::models::FlowProject;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// 文件存储层：读写项目配置和任务文档
pub struct FlowStorage {
    project_dir: PathBuf,
    tasks_dir: PathBuf,
    config_path: PathBuf,
}

impl FlowStorage {
    /// 创建新的存储实例
    pub fn new(project_root: &str) -> Self {
        let project_dir = PathBuf::from(project_root);
        let openflow_dir = project_dir.join(".openflow");
        let tasks_dir = openflow_dir.join("tasks");
        let config_path = openflow_dir.join("config.json");

        Self {
            project_dir,
            tasks_dir,
            config_path,
        }
    }

    /// 确保 .openflow 目录结构存在
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.tasks_dir)?;
        Ok(())
    }

    /// 保存项目配置
    pub fn save_project(&self, project: &FlowProject) -> Result<(), String> {
        self.ensure_dirs().map_err(|e| format!("创建目录失败: {}", e))?;
        let json = serde_json::to_string_pretty(project)
            .map_err(|e| format!("序列化失败: {}", e))?;
        fs::write(&self.config_path, json)
            .map_err(|e| format!("写入文件失败: {}", e))?;
        Ok(())
    }

    /// 加载项目配置
    pub fn load_project(&self) -> Result<Option<FlowProject>, String> {
        if !self.config_path.exists() {
            return Ok(None);
        }
        let json = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        let project: FlowProject = serde_json::from_str(&json)
            .map_err(|e| format!("解析 JSON 失败: {}", e))?;
        Ok(Some(project))
    }

    /// 保存节点产物文档
    pub fn save_task_document(
        &self,
        node_id: &str,
        version: u32,
        content: &str,
    ) -> Result<String, String> {
        self.ensure_dirs().map_err(|e| format!("创建目录失败: {}", e))?;
        let filename = format!("{node_id}_v{version}.md");
        let path = self.tasks_dir.join(&filename);
        fs::write(&path, content)
            .map_err(|e| format!("写入文档失败: {}", e))?;
        Ok(path.to_string_lossy().to_string())
    }

    /// 获取任务文档路径
    pub fn get_task_document_path(&self, node_id: &str, version: u32) -> PathBuf {
        let filename = format!("{node_id}_v{version}.md");
        self.tasks_dir.join(filename)
    }

    /// 获取项目根目录
    pub fn project_root(&self) -> &str {
        self.project_dir.to_str().unwrap_or(".")
    }
}

/// 打开文件夹的结果
#[derive(Debug, Clone, Serialize)]
pub struct OpenProjectResult {
    pub project_path: String,
    pub project: Option<FlowProject>,
}

/// 根据传入的项目路径加载项目配置
/// 如果 .openflow/config.json 不存在，自动初始化空项目
#[tauri::command]
pub fn load_project_by_path(project_path: String) -> Result<OpenProjectResult, String> {
    let storage = FlowStorage::new(&project_path);
    let project = match storage.load_project() {
        Ok(Some(p)) => Some(p),
        _ => {
            // 初始化一个空项目并保存
            let empty_project = FlowProject {
                nodes: vec![],
                edges: vec![],
            };
            // 如果保存成功，返回空项目；否则也返回 None（目录可能不存在但没关系）
            let _ = storage.save_project(&empty_project);
            Some(empty_project)
        }
    };
    Ok(OpenProjectResult {
        project_path,
        project,
    })
}