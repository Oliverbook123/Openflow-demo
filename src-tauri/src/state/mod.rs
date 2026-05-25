use crate::models::{FlowProject, NodeStatus};

/// 状态机：维护节点状态流转逻辑
pub struct FlowStateMachine;

impl FlowStateMachine {
    /// 检查状态转移是否合法
    pub fn can_transition(from: &NodeStatus, to: &NodeStatus) -> bool {
        match (from, to) {
            // 待编辑 -> 执行中：直接启动执行
            (NodeStatus::PendingEdit, NodeStatus::Running) => true,
            // 待编辑 -> 待执行：提示词已填写
            (NodeStatus::PendingEdit, NodeStatus::PendingExec) => true,
            // 待执行 -> 执行中：前序节点已完成
            (NodeStatus::PendingExec, NodeStatus::Running) => true,
            // 执行中 -> 需介入：执行出错
            (NodeStatus::Running, NodeStatus::NeedsIntervention) => true,
            // 执行中 -> 完成：执行成功
            (NodeStatus::Running, NodeStatus::Completed) => true,
            // 需介入 -> 待执行：修复后重新执行
            (NodeStatus::NeedsIntervention, NodeStatus::PendingExec) => true,
            // 完成 -> 待执行：重新执行
            (NodeStatus::Completed, NodeStatus::PendingExec) => true,
            // 其他转移不合法
            _ => false,
        }
    }

    /// 检查节点的所有依赖是否已完成
    pub fn are_dependencies_met(node_id: &str, project: &FlowProject) -> bool {
        let incoming_edges: Vec<&str> = project
            .edges
            .iter()
            .filter(|e| e.target == node_id)
            .map(|e| e.source.as_str())
            .collect();

        if incoming_edges.is_empty() {
            return true;
        }

        incoming_edges.iter().all(|source_id| {
            project.nodes.iter().any(|n| {
                n.id == **source_id && n.data.status == NodeStatus::Completed
            })
        })
    }

    /// 获取前序节点（依赖）ID 列表
    pub fn get_dependency_ids(node_id: &str, project: &FlowProject) -> Vec<String> {
        project
            .edges
            .iter()
            .filter(|e| e.target == node_id)
            .map(|e| e.source.clone())
            .collect()
    }

    /// 获取后序节点 ID 列表
    pub fn get_dependent_ids(node_id: &str, project: &FlowProject) -> Vec<String> {
        project
            .edges
            .iter()
            .filter(|e| e.source == node_id)
            .map(|e| e.target.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{FlowEdge, FlowNode, NodeData, Position};

    fn make_node(id: &str, status: NodeStatus) -> FlowNode {
        FlowNode {
            id: id.to_string(),
            node_type: "code_gen".to_string(),
            position: Position { x: 0.0, y: 0.0 },
            data: NodeData {
                label: format!("Node {}", id),
                prompt: String::new(),
                status,
                dependency_paths: vec![],
                output_paths: vec![],
                error_message: None,
            },
        }
    }

    #[test]
    fn test_can_transition() {
        assert!(FlowStateMachine::can_transition(
            &NodeStatus::PendingEdit,
            &NodeStatus::PendingExec
        ));
        assert!(FlowStateMachine::can_transition(
            &NodeStatus::Running,
            &NodeStatus::Completed
        ));
        assert!(!FlowStateMachine::can_transition(
            &NodeStatus::PendingEdit,
            &NodeStatus::Completed
        ));
    }

    #[test]
    fn test_dependencies_met() {
        let project = FlowProject {
            nodes: vec![
                make_node("a", NodeStatus::Completed),
                make_node("b", NodeStatus::PendingExec),
                make_node("c", NodeStatus::PendingExec),
            ],
            edges: vec![
                FlowEdge {
                    id: "e1".to_string(),
                    source: "a".to_string(),
                    target: "b".to_string(),
                },
                FlowEdge {
                    id: "e2".to_string(),
                    source: "a".to_string(),
                    target: "c".to_string(),
                },
            ],
        };

        assert!(FlowStateMachine::are_dependencies_met("b", &project));
        assert!(FlowStateMachine::are_dependencies_met("c", &project));
        assert!(FlowStateMachine::are_dependencies_met("a", &project));
    }

    #[test]
    fn test_dependencies_not_met() {
        let project = FlowProject {
            nodes: vec![
                make_node("a", NodeStatus::PendingExec),
                make_node("b", NodeStatus::PendingEdit),
            ],
            edges: vec![FlowEdge {
                id: "e1".to_string(),
                source: "a".to_string(),
                target: "b".to_string(),
            }],
        };

        assert!(!FlowStateMachine::are_dependencies_met("b", &project));
    }
}