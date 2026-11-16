mod commands;
mod sidecar;
mod state;
mod win32;

use state::DesktopStateCache;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .manage(DesktopStateCache::default())
        .invoke_handler(tauri::generate_handler![
            commands::window::ipc_dispatch,
            commands::window::sync_desktop_state,
            commands::window::ipc_respond,
        ])
        .setup(|app| {
            let _ = sidecar::spawn_engine(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
