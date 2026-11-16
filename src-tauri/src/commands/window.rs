//! Tauri IPC commands for the window manager (WM-A / Task A3).
//!
//! Source-level fix only: `cargo` is not installed in the authoring environment,
//! so this module has not been `cargo check`ed. See src-tauri/README.md.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

use crate::state::DesktopStateCache;

fn new_request_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("req-{nanos}")
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IPCRequest {
    pub command: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IPCResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IPCRequestEvent {
    pub request_id: String,
    pub request: IPCRequest,
}

const IPC_REQUEST_EVENT: &str = "nexus://ipc-request";

const WM_MUTATION_COMMANDS: &[&str] = &[
    "open_app",
    "close_app",
    "focus_window",
    "move_window",
    "resize_window",
    "set_window_mode",
    "switch_workspace",
    "persist_workspace",
];

/// Shell → Rust: store the latest DesktopSession snapshot.
#[tauri::command]
pub fn sync_desktop_state(
    session: serde_json::Value,
    cache: State<'_, DesktopStateCache>,
) -> Result<(), String> {
    let mut guard = cache
        .0
        .lock()
        .map_err(|_| "desktop state cache poisoned".to_string())?;
    *guard = Some(session);
    Ok(())
}

/// Shell → Rust: acknowledge a completed ipc-request (logging only for Phase 1).
#[tauri::command]
pub fn ipc_respond(request_id: String, response: IPCResponse) -> Result<(), String> {
    eprintln!(
        "[nexus ipc_respond] request_id={request_id} success={} error={:?}",
        response.success, response.error
    );
    Ok(())
}

/// Agent / shell → Rust dispatcher.
///
/// - `get_desktop_state` returns the cached shell snapshot.
/// - WM mutations + `persist_workspace` are forwarded to the shell via
///   `nexus://ipc-request` and return `{ queued: true, request_id }`.
#[tauri::command]
pub fn ipc_dispatch(
    request: IPCRequest,
    app: AppHandle,
    cache: State<'_, DesktopStateCache>,
) -> Result<IPCResponse, String> {
    match request.command.as_str() {
        "get_desktop_state" => {
            let guard = cache
                .0
                .lock()
                .map_err(|_| "desktop state cache poisoned".to_string())?;
            match guard.as_ref() {
                Some(session) => Ok(IPCResponse {
                    success: true,
                    data: Some(session.clone()),
                    error: None,
                }),
                None => Ok(IPCResponse {
                    success: false,
                    data: None,
                    error: Some("shell not ready".to_string()),
                }),
            }
        }
        cmd if WM_MUTATION_COMMANDS.contains(&cmd) => {
            let request_id = new_request_id();
            let event = IPCRequestEvent {
                request_id: request_id.clone(),
                request: request.clone(),
            };
            app.emit(IPC_REQUEST_EVENT, event)
                .map_err(|e| format!("failed to emit ipc request: {e}"))?;
            Ok(IPCResponse {
                success: true,
                data: Some(json!({ "queued": true, "request_id": request_id })),
                error: None,
            })
        }
        other => Ok(IPCResponse {
            success: false,
            data: None,
            error: Some(format!("unknown command: {other}")),
        }),
    }
}
