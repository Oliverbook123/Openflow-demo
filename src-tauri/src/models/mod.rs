use serde::{Deserialize, Serialize};

/// 节点状态枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeStatus {
    #[serde(rename = "pending_edit")]
    PendingEdit,
    #[serde(rename = "pending_exec")]
    PendingExec,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "needs_intervention")]
    NeedsIntervention,
    #[serde(rename = "completed")]
    Completed,
}

/// 节点数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub position: Position,
    pub data: NodeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeData {
    pub label: String,
    pub prompt: String,
    pub status: NodeStatus,
    pub dependency_paths: Vec<String>,
    pub output_paths: Vec<String>,
    pub error_message: Option<String>,
}

/// 边数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

/// 项目数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowProject {
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
}