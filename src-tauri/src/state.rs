use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopState {
    pub windows: Vec<WindowInfo>,
    pub monitors: Vec<MonitorInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: String,
    pub title: String,
    pub focused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: i32,
    pub resolution: String,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            windows: vec![],
            monitors: vec![],
        }
    }
}

/// Live shell session snapshot pushed from the React store (WM-A / Task A3).
/// `get_desktop_state` reads this cache; mutations are forwarded to the shell
/// via the `nexus://ipc-request` event.
#[derive(Default)]
pub struct DesktopStateCache(pub Mutex<Option<serde_json::Value>>);
